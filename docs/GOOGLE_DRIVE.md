# Google Drive — lưu ảnh & folder theo fanpage

## Tóm tắt

AutoPost lưu ảnh AI/upload lên **Google Drive** qua **OAuth2 User Authentication** (Client ID/Secret + Refresh Token của tài khoản Google cá nhân — **không** dùng Service Account, vì Service Account không có storage quota để ghi vào My Drive cá nhân). Cấu hình chung ở **Cài đặt**; mỗi fanpage có thể có **folder Drive riêng** để ảnh không trộn lẫn.

## Luồng

1. **Super admin** → Cài đặt → Google Drive: nhập Client ID, Client Secret, Refresh Token (lấy qua OAuth2 consent flow `GET /api/auth/drive` hoặc dán thủ công) + folder gốc (fallback).
2. **Fanpage → Sửa**: nhập `Google Drive Folder ID` (subfolder riêng) → Kiểm tra folder → Lưu.
3. Khi xuất ảnh AI hoặc upload ảnh bài viết:
   - Có folder fanpage → upload vào folder đó.
   - Không có → dùng folder gốc Cài đặt.
4. DB lưu `gdrive://FILE_ID`. Đăng Facebook: server tải từ Drive → Graph API.

## Lấy Refresh Token (OAuth2 consent flow)

1. Google Cloud Console → Credentials → tạo **OAuth 2.0 Client ID** (Web application) → thêm Authorized redirect URI: `{PUBLIC_BASE_URL}/api/auth/drive/callback`.
2. Cài đặt → Google Drive → điền Client ID + Client Secret → **Lưu cấu hình Drive**.
3. Gọi `GET /api/auth/drive` (super_admin) → nhận `auth_url` → mở trong trình duyệt, đăng nhập + cấp quyền `drive`.
4. Google redirect về `/api/auth/drive/callback` → backend tự lấy `refresh_token` và lưu vào `app_settings`.
5. (Hoặc) dán Refresh Token thủ công lấy từ OAuth Playground / script riêng — cùng scope `https://www.googleapis.com/auth/drive`.

## DB / config

| Nơi | Cột / key | Ý nghĩa |
|-----|-----------|---------|
| `app_settings` | `google_drive_client_id` | OAuth2 Client ID |
| `app_settings` | `google_drive_client_secret` | OAuth2 Client Secret |
| `app_settings` | `google_drive_refresh_token` | OAuth2 Refresh Token (tài khoản Google cá nhân) |
| `app_settings` | `google_drive_folder_id` | Folder gốc (fallback) |
| `app_settings` | `media_storage` | `google_drive` hoặc `local` |
| `fb_pages` | `google_drive_folder_id` | Folder riêng fanpage (nullable) |

Migration: `023_fb_pages_drive_folder.sql` (folder riêng fanpage), `029_app_settings_drive_oauth.sql` (dọn `google_drive_service_account_json` cũ — auto chạy qua `ensureDriveOAuthMigration()` trong `migrationRunner.js`).

## File code

| File | Vai trò |
|------|---------|
| `backend/src/services/pageDriveService.js` | Resolve folder: page → global |
| `backend/src/services/googleDriveService.js` | Khởi tạo `google.auth.OAuth2` + upload/download Drive |
| `backend/src/services/appSettingsService.js` | Đọc/ghi OAuth2 config trong `app_settings` (cache RAM) |
| `backend/src/routes/driveAuth.js` | OAuth2 consent flow (`GET /api/auth/drive`, `/callback`) |
| `backend/src/services/mediaStorage.js` | `storeImageBuffer({ pageId })` |
| `backend/src/services/postImageCore.js` | Truyền `post.page_id` khi generate |
| `backend/src/routes/pages.js` | CRUD folder fanpage + `POST /:id/drive-folder/test` |
| `backend/src/routes/upload.js` | Upload ảnh nhận `?page_id=` |
| `frontend/src/pages/PageForm.jsx` | UI folder riêng + test |
| `frontend/src/pages/Settings.jsx` | Cấu hình global (Client ID/Secret/Refresh Token, Folder ID, test connection) |

## Thiết lập folder riêng fanpage

1. Trên Google Drive: tạo folder con (vd. `Fanpage ABC`) trong folder gốc — share với **chính tài khoản Google đã dùng để lấy Refresh Token** (hoặc đặt trong My Drive của tài khoản đó).
2. Copy ID từ URL: `drive.google.com/.../folders/<ID>`.
3. Fanpage → Sửa → dán ID → **Kiểm tra folder Drive** → Lưu.

## Checklist deploy / debug

- [ ] Migration `023` (`google_drive_folder_id` trên `fb_pages`) + `029` (dọn key Service Account cũ) tự chạy lúc start backend.
- [ ] Cài đặt: Client ID + Client Secret + Refresh Token + folder gốc OK (**Kiểm tra kết nối Drive**).
- [ ] Subfolder fanpage thuộc quyền truy cập của tài khoản Google đã cấp Refresh Token.
- [ ] Xuất ảnh thử trên 2 fanpage khác folder → kiểm tra đúng folder trên Drive.
- [ ] Upload ảnh trong Post Editor (có chọn fanpage) → vào folder fanpage.

## Lưu ý

- **Đã bỏ Service Account** (lỗi `Service Accounts do not have storage quota` khi ghi vào My Drive cá nhân) — chuyển hẳn sang OAuth2 User Authentication.
- API scope: `https://www.googleapis.com/auth/drive`.
- Provider test (`/providers/:id/test-image`) dùng folder global (không gắn fanpage).
- Refresh Token không tự hết hạn trừ khi user thu hồi quyền tại [myaccount.google.com/permissions](https://myaccount.google.com/permissions) — nếu thu hồi, phải chạy lại OAuth2 consent flow để lấy token mới.
