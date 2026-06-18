# Deploy AutoPost lên VPS

Hướng dẫn deploy production: **Ubuntu 22.04/24.04**, **Node.js 20+**, **MySQL 8**, **Nginx**, **PM2**, **Let's Encrypt**.

## Yêu cầu VPS

| Thành phần | Tối thiểu | Ghi chú |
|------------|-----------|---------|
| CPU/RAM | 2 vCPU, 2–4 GB RAM | AI batch + upload video tốn RAM |
| Disk | 40 GB+ | Video tối đa ~5 GB (`MAX_VIDEOS_MB`) |
| OS | Ubuntu 22.04/24.04 | |
| Domain | `autopost.yourdomain.com` | Cần HTTPS — Facebook cần URL public cho ảnh/video |

## 1. Cài đặt hệ thống

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx mysql-server certbot python3-certbot-nginx

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

**Timezone** (scheduler chạy theo giờ server):

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
```

## 2. MySQL

```bash
sudo mysql
```

```sql
CREATE DATABASE autopost_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'autopost_user'@'localhost' IDENTIFIED BY 'MAT_KHAU_MANH';
GRANT ALL PRIVILEGES ON autopost_db.* TO 'autopost_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Import schema:

```bash
mysql -u autopost_user -p autopost_db < /var/www/autopost/backend/schema.sql
```

## 3. Clone & build code

```bash
sudo mkdir -p /var/www/autopost
sudo chown $USER:$USER /var/www/autopost
cd /var/www/autopost

git clone https://github.com/YOUR_USER/AutoPost.git .

# Backend
cd backend
npm ci --omit=dev
cp .env.example .env
nano .env

npm run seed

# Frontend — build với API URL production
cd ../frontend
npm ci
VITE_API_BASE_URL=https://autopost.yourdomain.com/api npm run build
```

Tạo thư mục media:

```bash
mkdir -p /var/www/autopost/public/images /var/www/autopost/public/videos
chmod -R 755 /var/www/autopost/public
```

## 4. Cấu hình `.env` production

File: `/var/www/autopost/backend/.env`

```env
NODE_ENV=production
PORT=3001

DB_HOST=localhost
DB_PORT=3306
DB_NAME=autopost_db
DB_USER=autopost_user
DB_PASS=MAT_KHAU_MANH

JWT_SECRET=chuoi_random_it_nhat_32_ky_tu
JWT_EXPIRES_IN=7d

OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=
GEMINI_API_KEY=
IDEOGRAM_API_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=

# QUAN TRỌNG — Facebook cần URL public để lấy ảnh/video
PUBLIC_BASE_URL=https://autopost.yourdomain.com

FB_GRAPH_API=https://graph.facebook.com/v19.0
DISABLE_SCHEDULER=false

AUTO_GENERATE_HOUR=23
AUTO_GENERATE_MINUTE=0

MAX_IMAGES_MB=500
MAX_VIDEOS_MB=5000
MAX_VIDEO_UPLOAD_MB=500

SEED_ADMIN_EMAIL=admin@autopost.local
SEED_ADMIN_PASSWORD=ChangeMe123!
SEED_FB_ZALOPILOT_TOKEN=
SEED_FB_DATXEVEQUE_TOKEN=
SEED_FB_VOHOPQUATET_TOKEN=
```

**Lưu ý:**

- `PUBLIC_BASE_URL` phải là domain HTTPS thật — không dùng `localhost`
- `VITE_API_BASE_URL` set **lúc build** frontend, không phải runtime
- Đổi mật khẩu admin ngay sau lần login đầu

## 5. PM2 — chạy backend

Scheduler (publish, batch jobs, auto-generate) chạy trong cùng process backend — chỉ cần **1 instance PM2**.

```bash
cd /var/www/autopost/backend
pm2 start src/app.js --name autopost-api
pm2 save
pm2 startup
```

Kiểm tra:

```bash
curl http://localhost:3001/api/health
pm2 logs autopost-api
```

## 6. Nginx

File: `/etc/nginx/sites-available/autopost`

```nginx
server {
    listen 80;
    server_name autopost.yourdomain.com;

    client_max_body_size 520M;

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 180s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        send_timeout 300s;
    }

    location /images {
        alias /var/www/autopost/public/images;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /videos {
        alias /var/www/autopost/public/videos;
        add_header Accept-Ranges bytes;
    }

    location / {
        root /var/www/autopost/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

Kích hoạt:

```bash
sudo ln -s /etc/nginx/sites-available/autopost /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

SSL:

```bash
sudo certbot --nginx -d autopost.yourdomain.com
```

Sau SSL, cập nhật `PUBLIC_BASE_URL=https://...` trong `.env` rồi `pm2 restart autopost-api`.

## 7. Kiến trúc

```
Browser / Facebook Graph API
        ↓
   Nginx :443
   ├── /api      → Node.js PM2 :3001
   ├── /images   → public/images
   ├── /videos   → public/videos
   └── /         → frontend/dist (React SPA)
                        ↓
                    MySQL
```

## 8. Smoke test

1. Mở `https://autopost.yourdomain.com` → login `admin@autopost.local`
2. Đổi mật khẩu ngay
3. Vào **Pages** — kiểm tra fanpage + token status
4. **Generate** — tạo 1 bài test
5. **Posts** — schedule hoặc publish ngay
6. Xem `pm2 logs` — scheduler publish đúng giờ
7. Upload ảnh/video — URL dạng `https://autopost.yourdomain.com/images/...`

## 9. Update code

```bash
cd /var/www/autopost
git pull

cd backend && npm ci --omit=dev
pm2 restart autopost-api

cd ../frontend
VITE_API_BASE_URL=https://autopost.yourdomain.com/api npm run build
```

## 10. Bảo mật

- `.env` không commit lên git
- Đổi `SEED_ADMIN_PASSWORD` sau login
- MySQL chỉ listen `localhost`
- Port 3001 không mở ra internet (chỉ Nginx proxy)
- Backup DB: `mysqldump autopost_db > backup.sql`

## 11. Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| Frontend gọi `localhost:3001` | Build thiếu `VITE_API_BASE_URL` | Build lại với env đúng |
| Facebook không post được ảnh | `PUBLIC_BASE_URL` sai hoặc HTTP | Dùng HTTPS + domain public |
| Upload video 413 | Nginx limit | `client_max_body_size 520M` |
| Scheduler không chạy | `DISABLE_SCHEDULER=true` | Sửa `.env`, restart PM2 |
| Token FB hết hạn | Cron check mỗi giờ | Cập nhật token trong Pages |
