# Google Drive — lưu ảnh & folder theo fanpage

## Tóm tắt

AutoPost lưu ảnh AI/upload lên **Google Drive** qua **Service Account** (không OAuth popup). Cấu hình chung ở **Cài đặt**; mỗi fanpage có thể có **folder Drive riêng** để ảnh không trộn lẫn.

## Luồng

1. **Super admin** → Cài đặt: Service Account JSON + folder gốc (fallback).
2. **Fanpage → Sửa**: nhập `Google Drive Folder ID` (subfolder riêng) → Kiểm tra folder → Lưu.
3. Khi xuất ảnh AI hoặc upload ảnh bài viết:
   - Có folder fanpage → upload vào folder đó.
   - Không có → dùng folder gốc Cài đặt.
4. DB lưu `gdrive://FILE_ID`. Đăng Facebook: server tải từ Drive → Graph API.

## DB / config

| Nơi | Cột / key | Ý nghĩa |
|-----|-----------|---------|
| `app_settings` | `google_drive_service_account_json` | JSON service account |
| `app_settings` | `google_drive_folder_id` | Folder gốc (fallback) |
| `app_settings` | `media_storage` | `google_drive` hoặc `local` |
| `fb_pages` | `google_drive_folder_id` | Folder riêng fanpage (nullable) |

Migration: `023_fb_pages_drive_folder.sql`

## File code

| File | Vai trò |
|------|---------|
| `backend/src/services/pageDriveService.js` | Resolve folder: page → global |
| `backend/src/services/googleDriveService.js` | Upload/download Drive |
| `backend/src/services/mediaStorage.js` | `storeImageBuffer({ pageId })` |
| `backend/src/services/postImageCore.js` | Truyền `post.page_id` khi generate |
| `backend/src/routes/pages.js` | CRUD folder fanpage + `POST /:id/drive-folder/test` |
| `backend/src/routes/upload.js` | Upload ảnh nhận `?page_id=` |
| `frontend/src/pages/PageForm.jsx` | UI folder riêng + test |
| `frontend/src/pages/Settings.jsx` | Cấu hình global |

## Thiết lập folder riêng fanpage

1. Trên Google Drive: tạo folder con (vd. `Fanpage ABC`) trong folder gốc đã share với service account.
2. Copy ID từ URL: `drive.google.com/.../folders/<ID>`.
3. Fanpage → Sửa → dán ID → **Kiểm tra folder Drive** → Lưu.

## Checklist deploy / debug

- [ ] Migration `023` chạy (`google_drive_folder_id` trên `fb_pages`).
- [ ] Cài đặt: Service Account + folder gốc OK (Kiểm tra kết nối).
- [ ] Subfolder fanpage đã **Share** với `client_email` (Editor).
- [ ] Xuất ảnh thử trên 2 fanpage khác folder → kiểm tra đúng folder trên Drive.
- [ ] Upload ảnh trong Post Editor (có chọn fanpage) → vào folder fanpage.

## Lưu ý

- **Không** dùng OAuth popup cho Service Account — JSON chỉ lấy từ Google Cloud Console.
- API scope: `https://www.googleapis.com/auth/drive` (scope `drive.file` **không** đọc được folder đã share với service account → dễ báo File not found dù đã Share).
- Provider test (`/providers/:id/test-image`) dùng folder global (không gắn fanpage).
