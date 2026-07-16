# Bảo mật & mô hình xác thực

> Đọc trước khi thêm route mới hoặc đụng middleware auth. Sai 1 guard ở đây = lộ dữ liệu/leo thang quyền.

## 3 loại "danh tính" — KHÔNG được nhầm lẫn

| Loại | Ký ở đâu | Payload | Header lưu (frontend) | Middleware dùng | Dùng cho |
|------|----------|---------|-----------------------|-----------------|----------|
| **Admin/web user** | `authService.signToken()` | `{ userId, role }` (KHÔNG có `type`) | `autopost_token` | `authenticate` (`middleware/auth.js`) | Toàn bộ website admin (`/api/*` trừ user-auth/user-sync) |
| **GroupFlow user (group_user)** | `userAuth.js signUserToken()` | `{ userId, email, type:'user_account' }` | `user_token` | `requireUserAuth` (trong `routes/userAuth.js`) | CHỈ `/api/user-auth/me*` — dashboard người dùng tự phục vụ |
| **License key (extension)** | không phải JWT — key thô 32 hex | — | (trong service worker extension) | `authenticateLicenseKey` (`middleware/licenseAuth.js`) | CHỈ `/api/user-sync/*` |

**Quy tắc bất biến:**
- `authenticate` (admin) **từ chối** token `type:'user_account'`. Cả 3 loại dùng chung `JWT_SECRET` + bảng `users`, nên nếu không chặn, token group_user (lấy được qua `/register` public) sẽ lọt vào route admin → leo thang quyền. Đã vá 2026-07-15.
- Mọi route `/api/user-auth/admin/*` phải có `authenticate` **VÀ** `canManageUsers` (super_admin/admin). `authenticate` một mình KHÔNG đủ.
- Route công khai (không cần token): chỉ `/api/auth/login`, `/api/user-auth/{register,login,validate-key,reset-devices}`, `/api/health`. Tất cả đều phải qua rate limiter.

## Rate limiting (`middleware/rateLimit.js`)

| Limiter | Áp vào | Hạn mức | Khoá theo |
|---------|--------|---------|-----------|
| `authLimiter` | `/api/auth/login`, `/api/user-auth/{register,login}` | 20 / 15 phút | IP |
| `licenseValidateLimiter` | `/api/user-auth/{validate-key,reset-devices}` | 30 / 15 phút | IP |
| `syncApiLimiter` | `/api/user-sync/*` | 60 / phút | license key (fallback IP) |

Route đăng nhập/đăng ký/validate-key **bắt buộc** có limiter — đó là bề mặt brute-force/spam duy nhất không cần token.

## Guard bắt buộc khi thêm code

- **Đọc file theo path từ input người dùng**: luôn `path.resolve` rồi kiểm tra kết quả nằm trong thư mục cho phép (xem `resolveLocalImagePath` trong `mediaStorage.js`) — chống path traversal (`../`).
- **Upload file**: `multer` phải có `fileFilter` (whitelist mimetype), `limits.fileSize`, và đuôi file suy từ mimetype đã whitelist — KHÔNG tin `originalname` (chống ghi file thực thi/HTML → stored XSS). Xoá file nếu validate sau đó fail. Xem `routes/upload.js`.
- **Ghi activity log**: response/body đi qua `sanitizeBody` (redact đệ quy) trước khi lưu — thêm field mới nhạy cảm vào `SENSITIVE_KEYS` (`middleware/activityLog.js`).
- **Nhận input cập nhật DB** (plan/status/enum): validate theo whitelist trước khi ghi, không ghi thẳng giá trị người dùng.

## Cấu hình bắt buộc lúc deploy

- `JWT_SECRET`: production (`NODE_ENV=production`) mà thiếu hoặc để mặc định `replace_with_strong_secret` → backend `process.exit(1)` ngay lúc khởi động (`app.js`). Đặt secret mạnh, ngẫu nhiên.
- `cors()` hiện mở cho mọi origin (an toàn với bearer token, nhưng nên chốt origin cụ thể ở production).

## Còn lại (chưa vá — theo dõi ở TODO.md)

- Bài `platform='website'` chưa phân quyền theo user (chưa có bảng `user_websites`) — `assertPostAccess` cho mọi user đăng nhập qua. Cần mirror pattern `user_pages`.
- Token qua query string (`?access_token=`) vẫn được `authenticate` chấp nhận (cho preview ảnh) — lọt vào access log nginx; cân nhắc URL ký tạm thời.
