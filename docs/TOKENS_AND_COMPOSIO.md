# Token Facebook & Composio

> Cập nhật: 2026-06-22

Tài liệu mô tả cách AutoPost quản lý token fanpage: **2 token / fanpage**, kiểm tra hiệu lực, và tích hợp Composio.

## Tóm tắt

| Thành phần | Mô tả |
|------------|--------|
| **Token thủ công** | Dán Page Access Token Graph API → lưu `fb_pages.page_token` |
| **Token Composio** | Lấy qua OAuth Composio → lưu `fb_pages.composio_page_token` |
| **Active token** | `fb_pages.token_source` = `manual` hoặc `composio` — token dùng khi đăng bài |
| **Cấu hình Composio** | Chỉ lưu **database** (`app_settings`) — UI **Cài đặt → Composio** |
| **Kiểm tra hiệu lực** | Graph API `debug_token` + verify; cron **mỗi giờ** |
| **Refresh Composio** | Chỉ khi token **đã hết hạn** (`expired`), không refresh sớm |

## Database

### Migration liên quan

| File | Nội dung |
|------|----------|
| `019_app_settings.sql` | Bảng `app_settings` (Drive, Composio global) |
| `020_fb_pages_composio.sql` | `token_source`, `composio_user_id`, `composio_connected_account_id` |
| `021_fb_pages_dual_tokens.sql` | `composio_page_token` — tách khỏi token thủ công |
| `022_fb_pages_token_health.sql` | Hạn & trạng thái từng token |

### Cột `fb_pages` (token)

```
page_token                  -- token thủ công
composio_page_token         -- token từ Composio
token_source                -- manual | composio (đang active)
manual_token_expires_at
composio_token_expires_at
manual_token_status         -- valid | expiring | expired | unknown
composio_token_status
token_expires_at            -- tóm tắt token đang active (UI)
token_status                -- tóm tắt token đang active (UI)
composio_user_id
composio_connected_account_id
```

### `app_settings` (Composio global)

| Key | Mô tả |
|-----|--------|
| `composio_api_key` | API key Composio |
| `composio_facebook_auth_config_id` | Auth config OAuth FB |
| `composio_default_user_id` | User ID trên Composio |
| `composio_default_connected_account_id` | Connected account ACTIVE (`ca_...`) |
| `composio_facebook_toolkit_version` | Mặc định `20260616_00` |
| `composio_auto_fallback` | Bật chuyển token khi đăng lỗi |

**Không** dùng `.env` cho Composio trên production — cấu hình qua UI Cài đặt.

## Luồng đăng bài

File: `backend/src/services/facebookPublishService.js` → `publishToFacebookWithFallback()`

1. **Kiểm tra** trạng thái token (không refresh sớm).
2. Đăng bằng token **active** (`token_source`).
3. Lỗi token → thử token **còn lại** (nếu bật auto-fallback trong Cài đặt).
4. Composio **expired** hoặc đăng lỗi → gọi Composio **một lần** lấy token mới rồi thử lại.
5. Thành công với token dự phòng → cập nhật `token_source`.

## Kiểm tra hiệu lực (không refresh liên tục)

File: `backend/src/services/tokenHealthService.js`

- `inspectFacebookToken()` — `debug_token` trên Graph API.
- `checkAndPersistPageTokenHealth()` — kiểm tra **cả** manual + Composio, cập nhật DB.
- `composioNeedsRefreshAfterInvalidCheck()` — chỉ `true` khi `composio_token_status === 'expired'`.
- Cron scheduler: `checkPageTokens` — **mỗi giờ**, chỉ check; refresh Composio nếu đã expired.

**Đã bỏ:** cron sync Composio mỗi 6 giờ; refresh sớm trước 2 ngày hết hạn; refresh trước mỗi lần đăng.

## UI

| Màn hình | Chức năng |
|----------|-----------|
| **Cài đặt → Composio** | API key, auth config, user/connected account ID, auto-switch, OAuth link |
| **Fanpage → Sửa** | Token thủ công + đồng bộ Composio song song; chọn token ưu tiên |
| **Danh sách fanpage** | Trạng thái M/C, hạn từng token, token đang active |

## API chính

```
GET  /api/settings/composio
PUT  /api/settings/composio
POST /api/settings/composio/connect-link

GET  /api/pages/composio/config
POST /api/pages/composio/preview-sync
POST /api/pages/:id/composio/sync
POST /api/pages/:id/verify-token
```

## File backend liên quan

```
backend/src/services/
  composioService.js       -- Composio SDK, sync page token
  pageTokenService.js      -- resolve active/alternate token
  tokenHealthService.js    -- check validity, refresh if expired only
  facebookPublishService.js
  appSettingsService.js    -- Composio config trong DB
  scheduler.js             -- checkPageTokens hourly

backend/migrations/
  019_app_settings.sql
  020_fb_pages_composio.sql
  021_fb_pages_dual_tokens.sql
  022_fb_pages_token_health.sql
```

## Setup production (checklist)

1. Deploy code + `pm2 restart autopost-api` (migration tự chạy khi start).
2. Login super admin → **Cài đặt → Composio** → nhập API key, auth config, user ID, connected account **ACTIVE**.
3. Mỗi fanpage → dán token thủ công (tuỳ chọn) + **Đồng bộ token Composio**.
4. Bật **Tự chuyển token khi đăng lỗi**.
5. Connection Composio phải **ACTIVE** (không dùng `INITIATED`).

## Lưu ý vận hành

- **Token thủ công** hết hạn: không tự renew — cần dán lại hoặc dùng Composio.
- **Composio** hết hạn: hệ thống tự lấy token mới khi check ra `expired` hoặc khi đăng lỗi.
- Nút **Đồng bộ token Composio** trên form fanpage: force refresh thủ công (debug / lần đầu).
- Xoá connection Composio cũ / stale trên Composio Dashboard; chỉ giữ một account **ACTIVE**.
