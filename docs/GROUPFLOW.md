# GroupFlow — Chrome Extension FB Group

## Tóm tắt

**GroupFlow**: extension local đăng FB Group + **website tidien.xyz** xem/import draft + sync metadata. **Không** dùng job/cron fanpage (`posts` table).

## Luồng dữ liệu

```
Website import Excel → group_post_drafts (pending)
    ↓ GET /drafts/pull
Extension queue local → generate ảnh (provider) → DOM đăng group
    ↓ POST /sync
group_posts → Website /groups xem danh sách
```

## API website + extension (`/api/group-posts`)

| Method | Path | Ai gọi | Việc |
|--------|------|--------|------|
| GET | `/` | Website JWT | Danh sách bài đã đăng |
| POST | `/drafts` | Website JWT | Import draft (không vào `posts`) |
| GET | `/drafts` | Website JWT | Xem draft pending/pulled |
| DELETE | `/drafts/:id` | Website JWT | Xoá draft pending |
| GET | `/drafts/pull` | Extension | Tải draft cá nhân + shared chưa tải |
| PATCH | `/drafts/:id` | Website | Sửa draft (pending / shared admin) |
| POST | `/drafts/:id/repull` | Website | Reset để extension tải lại |
| POST | `/login` | Extension | Đăng nhập |
| POST | `/sync` | Extension | Metadata sau đăng |
| GET | `/pending-comments` | Extension | Comment chéo |
| PATCH | `/:id/commented` | Extension | Ghi đã comment |

Provider ảnh/AI: extension gọi trực tiếp `/v1/...` — **không** qua route website.

## DB

| Migration | Bảng |
|-----------|------|
| 024 | `group_posts`, `group_post_comments`, `extension_api_keys` |
| 025 | `group_post_drafts` |
| 026 | `group_posts.group_name`, `group_post_drafts.is_shared`, `group_post_draft_pulls` |

### Draft chia sẻ team

- Admin import với **Chia sẻ team** → `is_shared = 1`
- Mỗi user extension tải 1 lần (bảng `group_post_draft_pulls`)
- Draft cá nhân: `status` pending/pulled như cũ
- Website: sửa draft (`PATCH /drafts/:id`), re-pull (`POST /drafts/:id/repull`)

## UI website

| Route | Trang |
|-------|-------|
| `/groups` | Bài group đã sync — lọc search/ngày/user, click xem chi tiết + comment |
| `/groups/import` | Import Excel → draft (preview bảng) |
| `/groups/drafts` | Quản lý draft chờ extension (pagination, prompt ảnh, pulled_at) |
| `/settings` | **GroupFlow Extension** — API key, FB map, hướng dẫn cài |

Menu sidebar + mobile bottom nav: **Group**.

### API bổ sung (website)

| Method | Path | Việc |
|--------|------|------|
| GET | `/extension-key` | Xem/tạo key lần đầu |
| GET | `/stats` | Dashboard: tổng bài, 7 ngày, comment, draft pending |
| GET | `/:id/comments` | Lịch sử comment trên 1 bài |

Query `GET /`: `search`, `from_date`, `to_date`, `user_id` (admin).

## Extension

- Settings: URL `https://tidien.xyz` (mặc định)
- Nút **「⬇ Tải từ website」** → `GET /drafts/pull`

## File code

| Thành phần | Đường dẫn |
|------------|-----------|
| Extension | `GroupFlow/fb-group-poster/` |
| Backend routes | `backend/src/routes/groupPosts.js` |
| Service | `backend/src/services/groupPostService.js` |
| Frontend | `frontend/src/pages/GroupPosts.jsx`, `GroupDrafts.jsx`, `GroupImport.jsx` |

## Checklist deploy

- [ ] Migration 024 + 025 + **026** trên production
- [ ] Nginx `tidien.xyz` proxy `/api/group-posts/*`
- [ ] Build frontend + load extension
