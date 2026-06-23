# AutoPost Project Progress

> Cập nhật: 2026-06-23

## ✅ Đã hoàn thành (mới)

### Google Drive — folder riêng fanpage
- Mỗi fanpage gán `google_drive_folder_id` (PageForm); ảnh AI/upload vào subfolder, fallback folder gốc Cài đặt
- Migration `023`; doc [`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md)

### Token Facebook + Composio
- Dual token mỗi fanpage: manual + Composio (DB), không ghi đè lẫn nhau
- Cấu hình Composio global trong **Cài đặt** (database, không `.env`)
- Kiểm tra hiệu lực token qua Graph API; cron mỗi giờ
- Auto-switch token khi đăng lỗi; refresh Composio chỉ khi token **expired**
- Chi tiết: [`docs/TOKENS_AND_COMPOSIO.md`](docs/TOKENS_AND_COMPOSIO.md)

## ✅ Đã hoàn thành (v0.2.0)

### Backend
- Auth JWT + bcrypt + RBAC + must_change_password
- Full CRUD: users, providers, skills, pages (+ topics, token), posts, jobs
- AI integration: OpenAI, Claude, Gemini, DALL-E, Ideogram (fallback placeholder nếu không có key)
- Facebook: verify token, publish text/photo/video
- Batch jobs + `jobWorker` + cron `scheduler` (auto-publish, token check, daily topic generate)
- Notifications, activity log middleware, upload image/video, settings API
- Global error handler

### Frontend
- Auth flow + forced change password
- Dashboard (stats, calendar, upcoming)
- Posts (filter, grid/table, edit + FB preview)
- Generate (tab text+ảnh, tab video)
- Batch generate (progress + auto-poll)
- Pages (CRUD, topics, token update)
- Skills, Providers, Users CRUD
- Notification dropdown + Settings
- Toast, skeleton, modal, mobile bottom nav

## ⚠️ Còn lại (optional)

- Deploy VPS + Nginx + SSL
- E2E tests
- API docs (Swagger)
- content_templates
- Encrypt API keys at rest

## Chạy dự án

```powershell
# Backend
cd d:\project\AutoPost\backend
npm install
npm run dev

# Frontend
cd d:\project\AutoPost\frontend
npm install
npm run dev
```

Cấu hình API keys trong `backend/.env` (xem `.env.example`).
