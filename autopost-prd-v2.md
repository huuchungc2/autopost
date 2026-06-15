# PRD v2.1: AutoPost
> Nền tảng tự động generate & lên lịch đăng bài Facebook bằng AI

**Tên:** AutoPost | **Domain:** `autopost.hopgiayre.vn` | **Stack:** React + Node.js + MySQL

---

## MỤC LỤC

1. [Tech Stack](#1-tech-stack)
2. [Database Schema đầy đủ](#2-database-schema-đầy-đủ)
3. [API Endpoints](#3-api-endpoints)
4. [Tính năng chi tiết](#4-tính-năng-chi-tiết)
5. [System Design](#5-system-design)
6. [UI/UX Design System — Light Theme](#6-uiux-design-system--light-theme)
7. [Responsive & Mobile](#7-responsive--mobile)
8. [Màn hình chi tiết](#8-màn-hình-chi-tiết)
9. [Error Handling](#9-error-handling)
10. [Environment Variables](#10-environment-variables)
11. [Cấu trúc thư mục](#11-cấu-trúc-thư-mục)
12. [Thứ tự build](#12-thứ-tự-build)
13. [Deploy VPS](#13-deploy-vps)

---

## 1. TECH STACK

### Frontend
- React 18 + Vite
- TailwindCSS
- React Router v6
- Axios + React Query
- React Hook Form + Zod
- Lucide React (icons)

### Backend
- Node.js + Express
- MySQL 8
- node-cron (scheduler)
- p-limit (rate limit guard)
- JWT auth
- Multer (upload ảnh/video thủ công)
- Axios (gọi AI API)

### AI Providers
- **Text:** Claude API / GPT-4o / Gemini
- **Image:** Ideogram API / DALL-E 3
- **Video:** (xem mục 4.6)

---

## 2. DATABASE SCHEMA ĐẦY ĐỦ

```sql
-- Users
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'admin', 'editor') DEFAULT 'editor',
  is_active BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  last_login TIMESTAMP NULL,
  created_by INT REFERENCES users(id),
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Providers Config
CREATE TABLE ai_providers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('text', 'image', 'video') NOT NULL,
  api_key TEXT NOT NULL,
  model VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills (System Prompts)
CREATE TABLE skills (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt LONGTEXT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facebook Pages
CREATE TABLE fb_pages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  page_id VARCHAR(100) UNIQUE NOT NULL,
  page_token TEXT NOT NULL,
  token_expires_at DATETIME NULL,
  token_status ENUM('valid','expiring','expired') DEFAULT 'valid',
  avatar_url TEXT,
  skill_id INT REFERENCES skills(id),
  text_provider_id INT REFERENCES ai_providers(id),
  image_provider_id INT REFERENCES ai_providers(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content Topics
CREATE TABLE content_topics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  page_id INT REFERENCES fb_pages(id),
  day_of_week TINYINT NOT NULL,        -- 0=CN, 1=T2...6=T7
  topic VARCHAR(500) NOT NULL,
  post_time TIME DEFAULT '08:00:00',
  is_active BOOLEAN DEFAULT true
);

-- Posts
CREATE TABLE posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  page_id INT REFERENCES fb_pages(id),
  topic VARCHAR(500),
  content LONGTEXT NOT NULL,
  image_url TEXT,
  image_prompt TEXT,
  video_url TEXT,                      -- ← MỚI: đường dẫn video
  video_thumb_url TEXT,                -- ← MỚI: thumbnail của video
  media_type ENUM('none','image','video') DEFAULT 'none', -- ← MỚI
  status ENUM('draft','pending_approval','scheduled','published','failed') DEFAULT 'draft',
  scheduled_at DATETIME,
  published_at DATETIME,
  fb_post_id VARCHAR(100),
  error_message TEXT,
  created_by_type ENUM('auto','manual') DEFAULT 'auto',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generate Jobs (Batch Queue)
CREATE TABLE generate_jobs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_id VARCHAR(36) NOT NULL,
  page_id INT REFERENCES fb_pages(id),
  topic VARCHAR(500),
  scheduled_date DATE,
  scheduled_time TIME,
  status ENUM('pending','processing','done','failed') DEFAULT 'pending',
  post_id INT REFERENCES posts(id),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL
);

-- Notifications
CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT REFERENCES users(id),    -- NULL = tất cả admin
  type ENUM('error','warning','info','success') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  related_type VARCHAR(50),
  related_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs
CREATE TABLE activity_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  detail JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content Templates
CREATE TABLE content_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  prompt_template TEXT NOT NULL,
  variables JSON,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. API ENDPOINTS

### Auth
```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-password
```

### Users (Super Admin only)
```
GET    /api/users
POST   /api/users
GET    /api/users/:id
PUT    /api/users/:id
PATCH  /api/users/:id/status
POST   /api/users/:id/reset-password
DELETE /api/users/:id
```

### AI Providers
```
GET    /api/providers
POST   /api/providers
PUT    /api/providers/:id
DELETE /api/providers/:id
POST   /api/providers/:id/test
```

### Skills
```
GET    /api/skills
POST   /api/skills
PUT    /api/skills/:id
DELETE /api/skills/:id
```

### Facebook Pages
```
GET    /api/pages
POST   /api/pages
PUT    /api/pages/:id
DELETE /api/pages/:id
GET    /api/pages/:id/topics
POST   /api/pages/:id/topics
PUT    /api/pages/:id/token       ← Làm mới token
```

### Posts
```
GET    /api/posts                 (filter: page, status, date, media_type)
POST   /api/posts/generate        (manual generate text+image)
POST   /api/posts/generate-video  ← MỚI
POST   /api/posts/generate-batch
POST   /api/posts
PUT    /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/publish
POST   /api/posts/:id/schedule
POST   /api/posts/:id/approve
```

### Jobs (Batch Queue)
```
GET /api/jobs/:batch_id/status
```

### Notifications
```
GET   /api/notifications
PATCH /api/notifications/read-all
PATCH /api/notifications/:id/read
```

### Upload
```
POST /api/upload/image
POST /api/upload/video            ← MỚI
```

### Activity (Super Admin)
```
GET /api/activity
```

---

## 4. TÍNH NĂNG CHI TIẾT

### 4.1 Auth & User Management
*(giống PRD v1 — đầy đủ 3 role, RBAC, must_change_password flow)*

**must_change_password flow:**
```
Login → check must_change_password = true
→ Redirect /change-password (middleware chặn tất cả route khác)
→ User nhập mật khẩu mới → reset flag → vào dashboard
```

### 4.2 Facebook Token Management

Token hết hạn sau 60 ngày — cần chủ động quản lý:

- Lưu `token_expires_at` khi thêm page
- Cron job 09:00 hàng ngày kiểm tra token còn < 7 ngày → tạo notification + Telegram
- UI badge trên trang Pages:
  - Xanh: "Token còn X ngày"
  - Cam: "⚠️ Token sắp hết (X ngày)"
  - Đỏ: "❌ Token hết hạn"
- Nút "Làm mới token" → modal paste token mới → verify với Graph API trước khi lưu

### 4.3 Batch Generate Queue

Thay vì loop thẳng (timeout khi generate nhiều bài), dùng job queue:

```
User trigger batch
→ INSERT N rows vào generate_jobs (pending) → return batch_id
→ Worker cron chạy mỗi 30s → lấy pending → process từng job
→ Frontend polling /api/jobs/:batch_id/status mỗi 3s
→ Cập nhật progress bar realtime
→ Khi done → hiện danh sách bài để review & approve
```

### 4.4 Image Storage Management

```
Trước khi generate ảnh: check disk usage /public/images/
→ > 400MB: warning trong dashboard
→ > 500MB: tạm dừng generate ảnh, notify admin

Cleanup cron (CN 02:00):
→ Xóa ảnh của posts đã published > 30 ngày (ảnh đã lên FB rồi)
→ Log số lượng và dung lượng đã giải phóng
```

### 4.5 Notification System

Tạo notification tự động khi:
- Post status = 'failed' → notify admin
- Token sắp hết (< 7 ngày) → notify admin
- Batch generate xong → notify người trigger
- Storage > 80% → notify super_admin
- User mới được tạo → notify user đó

### 4.6 Đăng Video lên Facebook ← MỚI

Facebook Graph API hỗ trợ upload video trực tiếp.

**Loại video hỗ trợ:**
- Upload thủ công: user upload file mp4 (max 1GB, tối đa 240 phút)
- Reels: video ngắn dọc (9:16, max 15 phút)
- Không generate video bằng AI (chưa có API đủ chất lượng + quá đắt)

**Flow đăng video:**
```
User vào màn hình Tạo bài → chọn tab "Video"
→ Upload video file (mp4/mov/avi) hoặc nhập URL video
→ Nhập caption (AI hỗ trợ viết caption nếu muốn)
→ Chọn thumbnail (auto extract từ video hoặc upload ảnh)
→ Chọn loại: Post thường / Reels
→ Preview → Schedule / Publish
```

**Backend — fbService.js:**
```javascript
// Upload video qua Resumable Upload API
async function uploadVideo(videoPath, page) {
  // Bước 1: Khởi tạo upload session
  const session = await axios.post(
    `https://graph.facebook.com/${page.page_id}/videos`,
    {
      upload_phase: 'start',
      file_size: fs.statSync(videoPath).size,
      access_token: page.page_token
    }
  );
  
  // Bước 2: Upload chunks (mỗi chunk 10MB)
  // Bước 3: Finish → lấy video_id
  // Bước 4: Publish với caption
}

// Đăng Reels
async function publishReel(videoId, caption, page) {
  await axios.post(
    `https://graph.facebook.com/${page.page_id}/video_reels`,
    {
      video_id: videoId,
      description: caption,
      published: true,
      access_token: page.page_token
    }
  );
}
```

**Bảng so sánh loại media:**

| | Ảnh AI | Ảnh thủ công | Video thủ công | Reels |
|---|:---:|:---:|:---:|:---:|
| Generate tự động | ✅ | ❌ | ❌ | ❌ |
| Lên lịch | ✅ | ✅ | ✅ | ✅ |
| Batch schedule | ✅ | ❌ | ❌ | ❌ |
| Facebook reach | Trung bình | Trung bình | Cao | Rất cao |

**Lưu ý quan trọng về video:**
- Video lưu trong `/public/videos/` riêng, không lẫn với ảnh
- Giới hạn upload: 500MB/file (có thể cấu hình trong Settings)
- Sau khi đăng thành công → giữ video 7 ngày (ảnh chỉ giữ nếu còn đang scheduled)
- Thumbnail bắt buộc phải có để preview đẹp trong danh sách bài

### 4.7 AI Rate Limit Guard

```javascript
// aiService.js — dùng p-limit
import pLimit from 'p-limit';

const limit = pLimit(3); // max 3 concurrent AI calls

// Delay giữa các call để tránh rate limit
const DELAY_MS = { claude: 1000, openai: 500, gemini: 500 };

async function callWithRateLimit(provider, fn) {
  return limit(async () => {
    await sleep(DELAY_MS[provider] || 500);
    return fn();
  });
}
```

### 4.8 Facebook Post Preview (Simulator)

Component render đúng như Facebook:
- Hashtag màu xanh, @mention highlight
- Emoji render đúng
- Xuống dòng đúng
- Giới hạn 3 dòng → "Xem thêm"
- Video preview với thumbnail + nút play
- Tên Page + avatar lấy từ config

### 4.9 Content Templates

Lưu sẵn prompt template để tái sử dụng:
- `"Viết bài {style} về {topic} cho page bán {product}"`
- Variables điền khi generate
- Category: khuyến mãi / sản phẩm / sự kiện / tip

---

## 5. SYSTEM DESIGN

### 5.1 Kiến trúc tổng thể

```
┌──────────────────────────────────────────────────────────┐
│                        CLIENT                            │
│  Browser (React SPA)   Polling /api/jobs/:id/status      │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼──────────────────────────────┐
│                         NGINX                            │
│  /api → proxy :3001  |  / → dist/  |  /images → static  │
│                                    |  /videos → static   │
└──────────┬───────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│                  NODE.JS API (:3001)                     │
│                                                          │
│  Routes → Middleware (JWT + RBAC) → Controllers         │
│                                                          │
│  Services:                                               │
│  ├── aiService.js        Claude / OpenAI / Gemini        │
│  ├── imageService.js     Ideogram / DALL-E               │
│  ├── fbService.js        Facebook Graph API v25.0        │
│  ├── jobWorker.js        Process generate_jobs queue     │
│  ├── scheduler.js        node-cron                       │
│  ├── notifyService.js    Telegram bot                    │
│  └── storageService.js   Disk check + cleanup            │
└──────────┬──────────────────────────────────────────────┘
           │
┌──────────▼──────────────┐    ┌─────────────────────────┐
│       MySQL 8            │    │   External APIs          │
│  users                  │    │  Claude / GPT-4o / Gemini│
│  posts (+ video fields) │    │  Ideogram / DALL-E 3     │
│  fb_pages (+ token mgmt)│    │  Facebook Graph API      │
│  generate_jobs  (queue) │    │  Telegram Bot API        │
│  notifications          │    └─────────────────────────┘
│  activity_logs          │
│  content_templates      │
└─────────────────────────┘
```

### 5.2 Cron Jobs Schedule

```
Mỗi phút        Publish posts đến giờ (image + video)
Mỗi 30 giây     Process pending generate_jobs
23:00 hàng ngày Auto generate posts cho ngày mai
09:00 hàng ngày Kiểm tra token sắp hết hạn
Chủ nhật 02:00  Cleanup ảnh cũ > 30 ngày, video cũ > 7 ngày
```

### 5.3 Video Upload Flow

```
User upload video
→ Multer save vào /public/videos/tmp/
→ Validate: format, size, duration
→ Extract thumbnail (frame giây thứ 3)
→ Move vào /public/videos/{year}/{month}/
→ Save record vào posts (video_url, video_thumb_url, media_type='video')

Khi publish:
→ fbService.uploadVideo(videoPath, page) — chunked upload
→ Lấy video_id từ Facebook
→ Publish post với video_id + caption
→ Update post: status='published', fb_post_id, media_type='video'
```

---

## 6. UI/UX DESIGN SYSTEM — LIGHT THEME

### 6.1 Concept

**Dark sidebar + Light content area** — giống Linear, Notion, Vercel.
Sidebar dùng Indigo đậm (#1E1B4B), content area sáng (#F5F7FA).
Tạo contrast rõ ràng, không mệt mắt khi dùng lâu.

---

### 6.2 Color Palette

```css
:root {
  /* Brand */
  --color-primary:        #4F46E5;   /* Indigo-600 */
  --color-primary-light:  #6366F1;   /* Indigo-500 — hover */
  --color-primary-subtle: #EEF2FF;   /* Indigo-50  — bg badge, selected */
  --color-primary-border: #C7D2FE;   /* Indigo-200 — border active */
  --color-accent:         #0EA5E9;   /* Sky-500 — accent phụ */

  /* Background */
  --bg-base:     #F5F7FA;   /* Toàn bộ nền content */
  --bg-surface:  #FFFFFF;   /* Card, modal, dropdown */
  --bg-elevated: #F0F4FF;   /* Hover, selected row */
  --bg-border:   #E4E9F2;   /* Divider, border mặc định */
  --bg-border-strong: #CBD5E1; /* Border input focus, separator */

  /* Sidebar — Dark Indigo */
  --sidebar-bg:           #1E1B4B;
  --sidebar-item-hover:   #2D2A6E;
  --sidebar-item-active:  #3730A3;
  --sidebar-text:         #A5B4FC;   /* Indigo-300 */
  --sidebar-text-active:  #FFFFFF;
  --sidebar-border:       #2D2A6E;

  /* Text */
  --text-primary:   #1E1B4B;   /* Indigo-950 — heading, label */
  --text-secondary: #64748B;   /* Slate-500 — muted */
  --text-tertiary:  #94A3B8;   /* Slate-400 — placeholder, disabled */
  --text-inverse:   #FFFFFF;

  /* Status */
  --color-success:  #10B981;   /* Green-500 */
  --color-warning:  #F59E0B;   /* Amber-500 */
  --color-error:    #EF4444;   /* Red-500 */
  --color-info:     #0EA5E9;   /* Sky-500 */

  /* Status Background */
  --bg-success: #ECFDF5;
  --bg-warning: #FFFBEB;
  --bg-error:   #FEF2F2;
  --bg-info:    #F0F9FF;

  /* Post Status */
  --status-draft-text:     #64748B;
  --status-draft-bg:       #F1F5F9;
  --status-scheduled-text: #D97706;
  --status-scheduled-bg:   #FFFBEB;
  --status-published-text: #059669;
  --status-published-bg:   #ECFDF5;
  --status-failed-text:    #DC2626;
  --status-failed-bg:      #FEF2F2;
}
```

---

### 6.3 Typography

```css
/* Import */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --font-body:    'Inter', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
}

/* Scale */
/* xs:   11px  lh 16px — label, caption */
/* sm:   13px  lh 20px — metadata, helper */
/* base: 15px  lh 24px — body chính */
/* lg:   17px  lh 28px — section title */
/* xl:   20px  lh 28px — card title */
/* 2xl:  24px  lh 32px — page title */
/* 3xl:  30px  lh 36px — stat numbers */
/* 4xl:  38px  lh 46px — hero number lớn */
```

---

### 6.4 Spacing & Layout

```css
:root {
  --sidebar-width:           240px;
  --sidebar-width-collapsed:  64px;
  --header-height:            56px;
  --content-max:            1280px;
  --content-padding:          24px;
  --card-padding:             20px;
  --card-radius:              12px;
  --btn-radius:                8px;
  --input-radius:              8px;
  --badge-radius:            999px;
}
```

---

### 6.5 Components

#### Sidebar

```css
.sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: fixed;
}

/* Logo area */
.sidebar-logo {
  padding: 16px 20px;
  border-bottom: 1px solid var(--sidebar-border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.sidebar-logo-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  color: white;
  letter-spacing: -0.02em;
}

/* Nav item */
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin: 1px 8px;
  border-radius: 8px;
  color: var(--sidebar-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  text-decoration: none;
}
.sidebar-item:hover {
  background: var(--sidebar-item-hover);
  color: white;
}
.sidebar-item.active {
  background: var(--sidebar-item-active);
  color: white;
  font-weight: 600;
}

/* Section label */
.sidebar-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6366F1;
  padding: 16px 20px 6px;
}

/* User footer */
.sidebar-user {
  padding: 12px 16px;
  margin-top: auto;
  border-top: 1px solid var(--sidebar-border);
  display: flex;
  align-items: center;
  gap: 10px;
}
```

#### Button

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--btn-radius);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: 1px solid transparent;
  box-shadow: 0 1px 3px rgba(79,70,229,0.3), 0 1px 2px rgba(0,0,0,0.06);
}
.btn-primary:hover {
  background: var(--color-primary-light);
  box-shadow: 0 4px 12px rgba(79,70,229,0.35);
  transform: translateY(-1px);
}
.btn-primary:active { transform: translateY(0); }

.btn-secondary {
  background: white;
  color: var(--text-primary);
  border: 1px solid var(--bg-border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-secondary:hover {
  background: var(--bg-elevated);
  border-color: var(--bg-border-strong);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
}
.btn-ghost:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.btn-danger {
  background: white;
  color: var(--color-error);
  border: 1px solid #FECACA;
}
.btn-danger:hover { background: var(--bg-error); }

/* Sizes */
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-lg { padding: 10px 20px; font-size: 15px; }
.btn-icon { padding: 8px; }

/* Loading state */
.btn[disabled] { opacity: 0.5; cursor: not-allowed; transform: none; }
```

#### Card

```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--bg-border);
  border-radius: var(--card-radius);
  padding: var(--card-padding);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}
.card:hover {
  border-color: var(--color-primary-border);
  box-shadow: 0 4px 12px rgba(79,70,229,0.08);
  transition: all 0.15s;
}

/* Stat card — left border accent */
.card-stat {
  border-left: 3px solid var(--color-primary);
  padding-left: 17px; /* 20 - 3 border */
}
.card-stat.success { border-left-color: var(--color-success); }
.card-stat.warning { border-left-color: var(--color-warning); }
.card-stat.error   { border-left-color: var(--color-error); }
```

#### Badge

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: var(--badge-radius);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.badge::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.badge-draft      { background: var(--status-draft-bg);     color: var(--status-draft-text); }
.badge-pending    { background: #EFF6FF; color: #2563EB; }
.badge-scheduled  { background: var(--status-scheduled-bg); color: var(--status-scheduled-text); }
.badge-published  { background: var(--status-published-bg); color: var(--status-published-text); }
.badge-failed     { background: var(--status-failed-bg);    color: var(--status-failed-text); }

.badge-role-super  { background: #FDF4FF; color: #9333EA; }
.badge-role-admin  { background: var(--color-primary-subtle); color: var(--color-primary); }
.badge-role-editor { background: #F0FDF4; color: #16A34A; }

/* Token status */
.badge-token-valid    { background: #ECFDF5; color: #059669; }
.badge-token-expiring { background: #FFFBEB; color: #D97706; }
.badge-token-expired  { background: #FEF2F2; color: #DC2626; }
```

#### Input

```css
.input {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--bg-border);
  border-radius: var(--input-radius);
  padding: 9px 14px;
  font-size: 14px;
  font-family: var(--font-body);
  color: var(--text-primary);
  transition: border-color 0.12s, box-shadow 0.12s;
  outline: none;
}
.input:hover  { border-color: var(--bg-border-strong); }
.input:focus  {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
}
.input::placeholder { color: var(--text-tertiary); }
.input.error  {
  border-color: var(--color-error);
  box-shadow: 0 0 0 3px rgba(239,68,68,0.12);
}

/* Textarea */
.textarea {
  /* kế thừa .input */
  resize: vertical;
  min-height: 100px;
  line-height: 1.6;
}

/* Input với icon */
.input-wrapper { position: relative; }
.input-icon-left  { padding-left: 40px; }
.input-icon-right { padding-right: 40px; }
```

#### Table

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: 11px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--bg-base);
  border-bottom: 1px solid var(--bg-border);
}
.table td {
  padding: 13px 16px;
  font-size: 14px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-border);
  vertical-align: middle;
}
.table tr:hover td { background: var(--bg-elevated); }
.table tr:last-child td { border-bottom: none; }
```

#### Progress Bar

```css
.progress-bar-track {
  height: 6px;
  background: var(--bg-border);
  border-radius: 999px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  border-radius: 999px;
  transition: width 0.3s ease;
}
```

#### Toast / Alert

```css
.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid;
  font-size: 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.10);
  max-width: 380px;
}
.toast-success { background: var(--bg-success); border-color: #A7F3D0; color: #065F46; }
.toast-error   { background: var(--bg-error);   border-color: #FECACA; color: #991B1B; }
.toast-warning { background: var(--bg-warning); border-color: #FDE68A; color: #92400E; }
.toast-info    { background: var(--bg-info);    border-color: #BAE6FD; color: #0C4A6E; }
```

#### Skeleton Loading

```css
@keyframes shimmer {
  from { background-position: -400px 0; }
  to   { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg,
    #E4E9F2 25%, #F0F4FF 50%, #E4E9F2 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 6px;
}
```

---

### 6.6 Animations

```css
/* Fade + slide up — dùng cho cards, modals */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Scale in — dùng cho dropdown, tooltips */
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

/* Slide in from right — dùng cho drawer mobile */
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* Slide in from bottom — dùng cho bottom sheet mobile */
@keyframes slideInBottom {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.animate-in     { animation: fadeInUp 0.18s ease-out; }
.animate-scale  { animation: scaleIn 0.15s ease-out; }

/* Tắt animation cho người dùng prefer-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; }
}
```

---

## 7. RESPONSIVE & MOBILE

### 7.1 Breakpoints

```css
/* Mobile:  < 768px  */
/* Tablet:  768–1023px */
/* Desktop: ≥ 1024px */
```

### 7.2 Layout theo device

**Desktop (≥ 1024px):**
```
┌────────────────────────────────────────────────────────┐
│ SIDEBAR 240px │         HEADER 56px                    │
│ Dark Indigo   ├────────────────────────────────────────┤
│               │                                        │
│ Logo          │         CONTENT AREA                   │
│ Navigation    │         bg: #F5F7FA                    │
│               │         max-width: 1280px              │
│               │         padding: 24px                  │
│ ─────────     │                                        │
│ User info     │                                        │
└───────────────┴────────────────────────────────────────┘
```

**Tablet (768–1023px):**
```
Sidebar collapse còn 64px (icons only)
Hover/click → overlay expand 240px
Content area full width
```

**Mobile (< 768px):**
```
┌────────────────────────────────────────────────────────┐
│ [≡]  AutoPost                           [🔔] [Avatar] │  Header
├────────────────────────────────────────────────────────┤
│                                                        │
│           CONTENT AREA                                 │
│           padding: 16px                                │
│                                                        │
├────────────────────────────────────────────────────────┤
│    🏠        📝       ✨        📋        ⚙️           │  Bottom Nav
│  Dashboard  Bài viết  Tạo bài  Lịch    Cài đặt        │
└────────────────────────────────────────────────────────┘
```

### 7.3 Bottom Navigation (Mobile)

```css
.bottom-nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 60px;
  background: white;
  border-top: 1px solid var(--bg-border);
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding-bottom: env(safe-area-inset-bottom); /* iPhone notch */
  z-index: 100;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.06);
}

.bottom-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 16px;
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 10px;
  transition: color 0.12s;
}
.bottom-nav-item.active { color: var(--color-primary); }

/* Tab "Tạo bài" ở giữa — to hơn */
.bottom-nav-item.create {
  background: var(--color-primary);
  color: white;
  padding: 10px 20px;
  border-radius: 14px;
  margin-top: -10px;
  box-shadow: 0 4px 12px rgba(79,70,229,0.4);
}
```

### 7.4 Mobile adaptations

- Cards full width, padding 16px (desktop 20px)
- Tables → card list (row trở thành card dọc)
- Modal → bottom sheet trên mobile (`slideInBottom`)
- Batch generate chỉ desktop (quá complex cho mobile, show banner hướng dẫn)
- Dashboard stats: 2 cột thay vì 4 cột
- Textarea min-height: 120px
- Video upload chỉ desktop (file picker mobile hạn chế)

---

## 8. MÀN HÌNH CHI TIẾT

### 8.1 Header

```
┌──────────────────────────────────────────────────────────┐
│ [Search posts, pages...]          [🔔 ③]  [A▾ Tên User] │
│  bg: white, border-bottom: 1px                          │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Dashboard

```
PAGE TITLE: "Xin chào, [Tên] 👋"
SUB: "Hôm nay thứ Hai, 9 tháng 6"

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ card-stat│ │ card-stat│ │ card-stat│ │ card-stat│
│ (primary)│ │ (success)│ │ (warning)│ │ (error)  │
│          │ │          │ │          │ │          │
│  142     │ │  118     │ │  18      │ │  6       │
│ Tổng bài │ │ Đã đăng  │ │ Chờ đăng │ │  Lỗi    │
│ +12 hôm  │ │          │ │          │ │  !       │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

┌─ LỊCH ĐĂNG BÀI (2/3) ──────────┐ ┌─ SẮP ĐĂNG (1/3) ─┐
│ < Tháng 6/2025 >               │ │                   │
│                                │ │ Hôm nay 14:00     │
│ T2  T3  T4  T5  T6  T7  CN    │ │ ┌─────────────┐   │
│  2   3   4   5   6   7   8    │ │ │[thumb] Page │   │
│  9● 10● 11  12● 13● 14  15    │ │ │ Hộp Quà Tết │   │
│ 16  17● 18● 19  20  21  22    │ │ │ "Chào mừng" │   │
│ ...                            │ │ └─────────────┘   │
│                                │ │                   │
│ ● = có bài scheduled          │ │ Ngày mai 08:00    │
│ Click ngày → xem bài hôm đó   │ │ ┌─────────────┐   │
└────────────────────────────────┘ │ │[thumb] ...  │   │
                                   │ └─────────────┘   │
                                   └───────────────────┘

┌─ ACTIVITY GẦN ĐÂY ──────────────────────────────────────┐
│ ✅ 08:02  "Page Hộp Quà Tết" đăng thành công           │
│ ❌ 07:30  "Page Test" thất bại — Token hết hạn         │
│ ✨ Hôm qua 23:00  Auto-generated 3 bài cho hôm nay     │
└──────────────────────────────────────────────────────────┘
```

### 8.3 Posts List

```
FILTER ROW:
[Tất cả pages ▼] [Tất cả trạng thái ▼] [Tất cả loại ▼] [📅 Tháng này ▼]
[🔍 Tìm nội dung...]                              [+ Tạo bài]

POST CARD:
┌──────────────────────────────────────────────────────────┐
│ ┌────────┐  [● Đã đăng]  [🖼 Ảnh]  Page: Hộp Quà Tết   │
│ │ thumb  │  09/06/2025 08:00                             │
│ │(64×64) │                                              │
│ │        │  Chào mừng tháng 6 với ưu đãi đặc biệt!    │
│ └────────┘  🎁 Đặt ngay hộp quà tết để nhận...         │
│                                                          │
│ fb_post_id: 1234...   [👁 Xem] [✏️ Sửa] [🗑]            │
└──────────────────────────────────────────────────────────┘

VIDEO POST CARD:
┌──────────────────────────────────────────────────────────┐
│ ┌────────┐  [● Đã đăng]  [▶ Video]  Page: Hộp Quà Tết  │
│ │ video  │  09/06/2025 14:00                             │
│ │ thumb  │                                              │
│ │ ▶ play │  Caption viết cho video...                   │
│ └────────┘                                              │
│                                   [👁] [✏️] [🗑]          │
└──────────────────────────────────────────────────────────┘
```

### 8.4 Tạo bài (Manual)

```
TABS: [📝 Viết bài text+ảnh]  [▶ Đăng video]

--- TAB TEXT+ẢNH ---
┌──────────────────────────────┬──────────────────────────┐
│ CẤU HÌNH                     │ PREVIEW FACEBOOK          │
│                              │                          │
│ Trang: [Hộp Quà Tết ▼]      │  ┌────────────────────┐  │
│                              │  │ [Ảnh page] Hộp     │  │
│ Chủ đề:                      │  │ Quà Tết HOPGIAYRE  │  │
│ [textarea...]                │  │ Vừa xong · 🌐      │  │
│                              │  │                    │  │
│ Template:                    │  │ [Nội dung bài]     │  │
│ [Chọn template ▼]           │  │                    │  │
│                              │  │ [Ảnh generate]     │  │
│ Ngày: [09/06/2025]          │  │                    │  │
│ Giờ:  [08:00]               │  │ 👍 💬 ↗           │  │
│                              │  └────────────────────┘  │
│ [✨ GENERATE BÀI]           │                          │
│                              │                          │
│ ─── Sau khi generate ───     │                          │
│ Nội dung:                    │                          │
│ [editable textarea]          │                          │
│ [🔄 Viết lại] [🔄 Ảnh mới] │                          │
│                              │                          │
│ [Lưu draft] [Lên lịch]      │                          │
│             [🚀 Đăng ngay]  │                          │
└──────────────────────────────┴──────────────────────────┘

--- TAB VIDEO ---
┌──────────────────────────────┬──────────────────────────┐
│ CẤU HÌNH                     │ PREVIEW                   │
│                              │                          │
│ Trang: [Hộp Quà Tết ▼]      │ ┌──────────────────────┐ │
│                              │ │                      │ │
│ Upload video:                │ │   [VIDEO THUMBNAIL]  │ │
│ ┌──────────────────────────┐ │ │        ▶             │ │
│ │  Kéo thả hoặc click     │ │ │                      │ │
│ │  để chọn video           │ │ └──────────────────────┘ │
│ │  mp4 / mov / avi         │ │                          │
│ │  Tối đa 500MB            │ │ Caption preview...       │
│ └──────────────────────────┘ │                          │
│                              │                          │
│ Loại đăng:                   │                          │
│ (○) Post thường  (○) Reels  │                          │
│                              │                          │
│ Caption:                     │                          │
│ [textarea...]                │                          │
│ [✨ AI viết caption]         │                          │
│                              │                          │
│ Thumbnail:                   │                          │
│ [Auto từ video] [Upload ảnh] │                          │
│                              │                          │
│ Ngày: [09/06]  Giờ: [14:00] │                          │
│                              │                          │
│ [Lên lịch]  [🚀 Đăng ngay] │                          │
└──────────────────────────────┴──────────────────────────┘
```

### 8.5 Batch Generate

```
Bước 1/3 — Chọn cấu hình
┌──────────────────────────────────────────────────────────┐
│ Trang:    [Hộp Quà Tết ▼]                               │
│ Từ ngày:  [09/06/2025]                                  │
│ Đến ngày: [15/06/2025]  →  Sẽ tạo 7 bài               │
│                                                          │
│               [Xem trước topics →]                      │
└──────────────────────────────────────────────────────────┘

Bước 2/3 — Xem topics sẽ generate
┌──────────────────────────────────────────────────────────┐
│ T2 09/06  08:00  "Khuyến mãi đầu tuần"                 │
│ T3 10/06  08:00  "Sản phẩm nổi bật"                    │
│ T4 11/06  08:00  "Tip chọn hộp quà"                    │
│ T5 12/06  08:00  "Hậu trường sản xuất"                 │
│ T6 13/06  08:00  "Feedback khách hàng"                  │
│ T7 14/06  09:00  "Cuối tuần sale"                      │
│ CN 15/06  09:00  — Không có topic                       │
│                                                          │
│                   [← Quay lại]  [✨ Generate 6 bài →]  │
└──────────────────────────────────────────────────────────┘

Bước 3/3 — Đang generate
┌──────────────────────────────────────────────────────────┐
│ Đang xử lý 3/6 bài...                                  │
│ ████████████░░░░░░░░ 50%                               │
│                                                          │
│ ✅ T2 09/06  Hoàn thành                                 │
│ ✅ T3 10/06  Hoàn thành                                 │
│ ✅ T4 11/06  Hoàn thành                                 │
│ ⏳ T5 12/06  Đang tạo...                               │
│ ○  T6 13/06  Chờ                                        │
│ ○  T7 14/06  Chờ                                        │
└──────────────────────────────────────────────────────────┘

→ Xong: Danh sách 6 mini-card để review
→ [Approve tất cả] → Lên lịch hàng loạt
```

### 8.6 Notification Dropdown

```
[🔔 ③] click:
┌─────────────────────────────────────┐
│ Thông báo                [Đọc hết] │
├─────────────────────────────────────┤
│ ❌ 5 phút trước           [chưa đọc]│
│  Bài đăng thất bại: "Page Test"    │
│  Lỗi: Invalid access token         │
│  [Xem bài] [Làm mới token]         │
├─────────────────────────────────────┤
│ ⚠️ 2 tiếng trước                    │
│  Token sắp hết: "Page B" — 3 ngày │
│  [Cập nhật token ngay]             │
├─────────────────────────────────────┤
│ ✅ Hôm qua 23:00                   │
│  Đã tạo 5 bài cho hôm nay         │
└─────────────────────────────────────┘
```

---

## 9. ERROR HANDLING

### AI API Errors

| Lỗi | Hành động |
|---|---|
| 429 Rate limit | Retry sau 60s, tối đa 3 lần, delay tăng dần |
| Timeout | Retry 1 lần, mark failed + notify |
| API key invalid | Deactivate provider, notify admin |
| Content filtered | Log + dùng fallback prompt đơn giản hơn |

### Facebook API Errors

| Error code | Hành động |
|---|---|
| 190 Token hết hạn | Mark token_status='expired', notify admin, tạm dừng page |
| 613 Rate limit | Queue lại sau 1 giờ |
| 100 Page không tồn tại | Deactivate page, notify admin |
| 368 Bị block | Log chi tiết, notify admin để xử lý thủ công |

### Video Upload Errors

| Lỗi | Hành động |
|---|---|
| File quá lớn (> 500MB) | Báo ngay khi chọn file, không upload |
| Format không hỗ trợ | Validate trước upload |
| Upload timeout | Resumable upload — tiếp tục từ chunk bị gián đoạn |
| Storage đầy | Báo trước khi upload, hướng dẫn cleanup |

### Storage Management

```
Check trước khi generate ảnh hoặc nhận upload video:
→ > 80% dung lượng → warning trong dashboard
→ > 95% → block generate/upload, notify super_admin
Cleanup tự động CN 02:00: ảnh published > 30 ngày, video published > 7 ngày
```

---

## 10. ENVIRONMENT VARIABLES

```env
# Server
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://autopost.hopgiayre.vn

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=autopost_db
DB_USER=autopost_user
DB_PASS=your_strong_password

# Auth
JWT_SECRET=your_jwt_secret_minimum_32_characters
JWT_EXPIRES_IN=7d

# AI — có thể lưu trong DB, env là fallback
CLAUDE_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
IDEOGRAM_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=

# Storage
MAX_IMAGES_MB=500
MAX_VIDEOS_MB=5000
IMAGE_CLEANUP_DAYS=30
VIDEO_CLEANUP_DAYS=7
STORAGE_WARNING_PERCENT=80

# Scheduler (giờ auto generate, mặc định 23:00)
AUTO_GENERATE_HOUR=23
AUTO_GENERATE_MINUTE=0

# Video
MAX_VIDEO_UPLOAD_MB=500
```

---

## 11. CẤU TRÚC THƯ MỤC

```
autopost/
├── frontend/
│   ├── src/
│   │   ├── styles/
│   │   │   ├── tokens.css           ← Tất cả CSS variables
│   │   │   ├── components.css       ← Base component styles
│   │   │   └── utilities.css
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── Header.jsx
│   │   │   │   ├── BottomNav.jsx
│   │   │   │   └── NotificationDropdown.jsx
│   │   │   ├── ui/
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Badge.jsx
│   │   │   │   ├── Card.jsx
│   │   │   │   ├── Input.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── BottomSheet.jsx  ← Mobile modal
│   │   │   │   ├── Skeleton.jsx
│   │   │   │   ├── Toast.jsx
│   │   │   │   ├── ProgressBar.jsx
│   │   │   │   └── Table.jsx
│   │   │   ├── FacebookPreview.jsx
│   │   │   ├── PostCard.jsx
│   │   │   ├── VideoUpload.jsx
│   │   │   └── Calendar.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Posts.jsx
│   │   │   ├── Generate.jsx         ← Có tab video
│   │   │   ├── BatchGenerate.jsx
│   │   │   ├── Pages.jsx
│   │   │   ├── Skills.jsx
│   │   │   ├── Providers.jsx
│   │   │   ├── UserManagement.jsx
│   │   │   ├── ActivityLog.jsx
│   │   │   ├── Settings.jsx
│   │   │   └── ChangePassword.jsx
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useNotifications.js
│   │   │   └── useJobPolling.js
│   │   └── services/
│   │       └── api.js
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── posts.js
│   │   │   ├── pages.js
│   │   │   ├── skills.js
│   │   │   ├── providers.js
│   │   │   ├── jobs.js
│   │   │   ├── notifications.js
│   │   │   ├── activity.js
│   │   │   └── upload.js
│   │   ├── services/
│   │   │   ├── aiService.js
│   │   │   ├── imageService.js
│   │   │   ├── videoService.js      ← MỚI
│   │   │   ├── fbService.js
│   │   │   ├── jobWorker.js
│   │   │   ├── scheduler.js
│   │   │   ├── notifyService.js
│   │   │   └── storageService.js
│   │   └── middleware/
│   │       ├── auth.js
│   │       └── rbac.js
│   └── package.json
│
└── public/
    ├── images/       ← Ảnh AI generate
    └── videos/       ← Video upload
        └── tmp/      ← Buffer trong lúc upload
```

---

## 12. THỨ TỰ BUILD

```
Phase 1 — Backend core (ngày 1-2)
  Setup project + DB + migrations (tất cả bảng)
  Auth API + RBAC + must_change_password
  Users API + Activity Log middleware

Phase 2 — Backend features (ngày 3-4)
  Providers + Skills + Pages API + Token management
  aiService + imageService + fbService
  videoService + upload video endpoint
  Posts API + generate-video endpoint
  jobWorker + scheduler + notifyService

Phase 3 — Frontend core (ngày 5-6)
  CSS tokens + component library
  Layout: Sidebar (dark indigo) + Header + BottomNav responsive
  Auth pages + ChangePassword

Phase 4 — Frontend features (ngày 7-9)
  Dashboard + Calendar
  Posts list (filter ảnh/video, mini preview)
  Generate: tab text+ảnh và tab video
  Batch Generate + progress polling
  Pages config + Token management UI
  Skills + Providers
  Notifications dropdown
  User Management + Activity Log + Settings

Phase 5 — Polish + Deploy (ngày 10)
  Skeleton loading tất cả màn hình
  Toast system
  Error boundaries
  Mobile test (Bottom sheet, Bottom nav)
  Deploy VPS + SSL + Nginx
  Smoke test toàn bộ flow
```

---

## 13. DEPLOY VPS

```nginx
server {
    server_name autopost.hopgiayre.vn;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        root /var/www/autopost/frontend/dist;
        try_files $uri /index.html;
    }

    location /images {
        root /var/www/autopost/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /videos {
        root /var/www/autopost/public;
        # Không cache aggressively vì video lớn
        add_header Accept-Ranges bytes;
    }
}
```

```bash
# SSL
certbot --nginx -d autopost.hopgiayre.vn

# PM2
pm2 start backend/src/app.js --name autopost-api
pm2 save
```

---

*AutoPost v2.1 — PRD production-ready*  
*Bao gồm: light theme, video support, token management, batch queue, notification system*
