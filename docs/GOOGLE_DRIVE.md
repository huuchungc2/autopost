# Google Drive — lưu ảnh & folder theo fanpage

## Tóm tắt

AutoPost lưu ảnh AI/upload lên **Google Drive** qua **OAuth2 User Authentication** (Client ID/Secret + Refresh Token của tài khoản Google cá nhân — **không** dùng Service Account, vì Service Account không có storage quota để ghi vào My Drive cá nhân). Cấu hình chung ở **Cài đặt**; mỗi fanpage có thể có **folder Drive riêng** để ảnh không trộn lẫn.

## Luồng

1. **Super admin** → Cài đặt → Google Drive: nhập Client ID, Client Secret, Refresh Token (bấm nút "Lấy Refresh Token" — OAuth2 consent flow `GET /api/drive/auth` — hoặc dán thủ công) + folder gốc (fallback).
2. **Fanpage → Sửa**: nhập `Google Drive Folder ID` (subfolder riêng) → Kiểm tra folder → Lưu.
3. Khi xuất ảnh AI hoặc upload ảnh bài viết:
   - Có folder fanpage → **bắt buộc** upload vào đúng folder đó (tự verify + tự gắn lại nếu Drive API không gắn đúng, báo lỗi rõ nếu vẫn thất bại — không âm thầm sai chỗ).
   - Không có folder fanpage, có folder gốc Cài đặt → dùng folder gốc (cùng cơ chế bắt buộc + verify).
   - Không có folder nào (cả riêng lẫn gốc) → fallback hợp lệ là root "Drive của tôi" — không phải lỗi.
4. DB lưu `gdrive://FILE_ID`. Đăng Facebook: server tải từ Drive → Graph API.

## Lấy Refresh Token (OAuth2 consent flow)

1. Google Cloud Console → Credentials → tạo **OAuth 2.0 Client ID** (Web application) → thêm Authorized redirect URI đúng domain đang chạy, vd. `https://tidien.xyz/api/drive/callback` (đổi domain thì cập nhật lại URI này trên GCP, không cần sửa code — redirect URI được backend tự detect từ request, không dùng `PUBLIC_BASE_URL`).
2. Cài đặt → Google Drive → điền Client ID + Client Secret → **Lưu cấu hình Drive**.
3. Bấm nút **"Lấy Refresh Token"** cạnh ô Refresh Token → mở tab mới tới Google (`GET /api/drive/auth`, super_admin, tự tạo `auth_url` với redirect URI = `{protocol}://{host}/api/drive/callback` của chính request đó) → đăng nhập + cấp quyền `drive`.
4. Google redirect về `/api/drive/callback` → backend đổi `code` lấy `refresh_token` (bằng đúng redirect URI đã dùng ở bước 3, lưu tạm theo `state` trong RAM 10 phút) → lưu vào `app_settings` → redirect về `/settings?driveAuth=success` (trang Settings tự hiện toast "✅ Đã lấy Refresh Token thành công" và chuyển sang tab Drive).
5. (Hoặc) dán Refresh Token thủ công lấy từ OAuth Playground / script riêng — cùng scope `https://www.googleapis.com/auth/drive`.

Chạy sau nginx (SSL termination) cần `app.set('trust proxy', 1)` (đã bật trong `app.js`) để `req.protocol` đọc đúng `https` từ header `X-Forwarded-Proto` — nếu không, redirect URI tự detect sẽ sai thành `http://` và Google sẽ từ chối (redirect_uri_mismatch).

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
| `backend/src/routes/driveAuth.js` | OAuth2 consent flow (`GET /api/drive/auth`, `/api/drive/callback`) |
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
- **Folder ID gốc trong Cài đặt là fallback TUỲ CHỌN, không bắt buộc.** Chế độ Drive (`getMediaStorageMode()`) chỉ cần OAuth2 (Client ID/Secret/Refresh Token) để bật — không yêu cầu Folder ID gốc phải có giá trị. Nếu **mọi** fanpage đều đã có folder riêng, có thể để trống Folder ID gốc; ảnh của fanpage nào thiếu cả folder riêng lẫn folder gốc sẽ báo lỗi rõ ràng ngay khi xuất ảnh, thay vì âm thầm rơi về lưu local như trước bản sửa lỗi này.
- **Ảnh rơi vào gốc "Drive của tôi" dù đã khai báo folder đúng**: Google Drive API có thể tạo file thành công nhưng bỏ qua `parents` một cách âm thầm (không lỗi) khi Folder ID không phải là folder thật (copy nhầm link 1 file) hoặc tài khoản OAuth2 thiếu quyền Editor trên đúng folder đó. `uploadBufferToDrive()` giờ tự phát hiện + tự sửa lại (`files.update` addParents) sau mỗi lần tạo file, và throw lỗi rõ ràng nếu vẫn không gắn được — không còn âm thầm để sai chỗ. `testDriveConnection()`/nút "Kiểm tra folder Drive" giờ cũng từ chối nếu ID nhập vào không phải `mimeType: application/vnd.google-apps.folder`.
- **Debug nhanh**: chạy `node backend/scripts/check-drive-folders.js` trên server thật — mục cuối cùng của script gọi thẳng Drive API kiểm tra `parents` thật của các ảnh `gdrive://` gần nhất so với folder kỳ vọng của từng fanpage.
- **Fix "không lưu được chế độ Google Drive" (2026-07-04)**: `getMediaStorageStatus()` (`appSettingsService.js`) trước đây âm thầm đè lựa chọn `media_storage = 'google_drive'` admin đã tường minh chọn về lại `'local'` nếu `driveReady` (OAuth2 đủ 3 trường) = false NGAY LÚC TÍNH — thường xảy ra khi lưu mode + credentials cùng lúc mà 1 trường tạm thời chưa hợp lệ, hoặc lưu 2 bước riêng. Settings.jsx ghi thẳng giá trị trả về vào state dropdown sau khi lưu, nên dropdown "Nơi lưu ảnh" tự nhảy về lại "VPS local" ngay sau khi bấm Lưu dù DB có thể đã lưu đúng — nhìn như save thất bại. Đã sửa: mode đã lưu tường minh (`'google_drive'` hoặc `'local'`) luôn được tôn trọng nguyên vẹn, chỉ tự đoán theo `driveReady` khi mode chưa từng được lưu (cài mới, trống). Lưu ý: `getMediaStorageMode()` (`mediaStorage.js`, hàm quyết định runtime thật lúc lưu ảnh) chưa bao giờ có bug này — chỉ ảnh hưởng hiển thị trạng thái ở trang Cài đặt.
- **Thêm nút "Lấy Refresh Token" (2026-07-04)**: `routes/driveAuth.js` đổi từ `/api/auth/drive` (redirect URI cứng theo `PUBLIC_BASE_URL`) sang `/api/drive/auth` + `/api/drive/callback`, tự tính redirect URI từ chính request đến (`req.protocol` + `req.get('host')`) — không còn phụ thuộc biến môi trường, chạy đúng ngay cả khi domain đổi mà không cần sửa code hay redeploy, **miễn là** Authorized redirect URI trên Google Cloud Console được cập nhật khớp domain. Yêu cầu `app.set('trust proxy', 1)` (đã bật trong `app.js`) để đọc đúng `https` sau nginx. `redirectUri` dùng lúc tạo `auth_url` được lưu kèm `state` (RAM, hết hạn 10 phút) để bước đổi `code` lấy `refresh_token` dùng lại đúng URI đó — Google từ chối nếu 2 bước lệch URI.
