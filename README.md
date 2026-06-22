# AutoPost

Dự án AutoPost theo PRD v2.1.

## Thư mục

- `backend/` — Node.js + Express API
- `frontend/` — React + Vite SPA
- `public/` — static images và videos

## Cài đặt

### Backend

```powershell
cd d:\project\AutoPost\backend
npm install
```

Tạo file `.env` từ `backend/.env.example` và cấu hình kết nối MySQL.

Nếu dùng MySQL, khởi tạo database:

```sql
CREATE DATABASE autopost_db;
```

Tạo bảng bằng cách chạy file schema SQL (`backend/schema.sql`) trong MySQL.

Khởi tạo tài khoản admin mẫu:

```powershell
npm run seed
```

### Frontend

```powershell
cd d:\project\AutoPost\frontend
npm install
```

## Chạy dự án

### Backend

```powershell
cd d:\project\AutoPost\backend
npm run dev
```

### Frontend

```powershell
cd d:\project\AutoPost\frontend
npm run dev
```

## Deploy VPS

Xem [DEPLOY.md](./DEPLOY.md) — hướng dẫn deploy production (Nginx, PM2, MySQL, SSL).

## Tài liệu

| File | Nội dung |
|------|----------|
| [DEPLOY.md](./DEPLOY.md) | Deploy VPS, Nginx, PM2 |
| [docs/README.md](./docs/README.md) | **Index tài liệu** — đọc trước khi đào code |
| [docs/TOKENS_AND_COMPOSIO.md](./docs/TOKENS_AND_COMPOSIO.md) | Token Facebook dual manual + Composio, kiểm tra hiệu lực |
| [TODO.md](./TODO.md) | Tiến độ & checklist |
| [CHANGELOG.md](./CHANGELOG.md) | Lịch sử thay đổi |
| [PROJECT_PROGRESS.md](./PROJECT_PROGRESS.md) | Tổng quan đã làm |

## Lưu ý

- Backend chạy trên `http://localhost:3001`
- Frontend chạy trên `http://localhost:5173`
- API mặc định ở `http://localhost:3001/api`
