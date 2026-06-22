# PRD v2.1: AutoPost
> Ná»n táº£ng tá»± Ä‘á»™ng generate & lÃªn lá»‹ch Ä‘Äƒng bÃ i Facebook báº±ng AI

**TÃªn:** AutoPost | **Domain:** `autopost.hopgiayre.vn` | **Stack:** React + Node.js + MySQL

---

## Má»¤C Lá»¤C

1. [Tech Stack](#1-tech-stack)
2. [Database Schema Ä‘áº§y Ä‘á»§](#2-database-schema-Ä‘áº§y-Ä‘á»§)
3. [API Endpoints](#3-api-endpoints)
4. [TÃ­nh nÄƒng chi tiáº¿t](#4-tÃ­nh-nÄƒng-chi-tiáº¿t)
5. [System Design](#5-system-design)
6. [UI/UX Design System â€” Light Theme](#6-uiux-design-system--light-theme)
7. [Responsive & Mobile](#7-responsive--mobile)
8. [MÃ n hÃ¬nh chi tiáº¿t](#8-mÃ n-hÃ¬nh-chi-tiáº¿t)
9. [Error Handling](#9-error-handling)
10. [Environment Variables](#10-environment-variables)
11. [Cáº¥u trÃºc thÆ° má»¥c](#11-cáº¥u-trÃºc-thÆ°-má»¥c)
12. [Thá»© tá»± build](#12-thá»©-tá»±-build)
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
- Multer (upload áº£nh/video thá»§ cÃ´ng)
- Axios (gá»i AI API)

### AI Providers
- **Text:** Claude API / GPT-4o / Gemini
- **Image:** Ideogram API / DALL-E 3
- **Video:** (xem má»¥c 4.6)

---

## 2. DATABASE SCHEMA Äáº¦Y Äá»¦

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
  video_url TEXT,                      -- â† Má»šI: Ä‘Æ°á»ng dáº«n video
  video_thumb_url TEXT,                -- â† Má»šI: thumbnail cá»§a video
  media_type ENUM('none','image','video') DEFAULT 'none', -- â† Má»šI
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
  user_id INT REFERENCES users(id),    -- NULL = táº¥t cáº£ admin
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
PUT    /api/pages/:id/token       â† LÃ m má»›i token
```

### Posts
```
GET    /api/posts                 (filter: page, status, date, media_type)
POST   /api/posts/generate        (manual generate text+image)
POST   /api/posts/generate-video  â† Má»šI
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
POST /api/upload/video            â† Má»šI
```

### Activity (Super Admin)
```
GET /api/activity
```

---

## 4. TÃNH NÄ‚NG CHI TIáº¾T

### 4.1 Auth & User Management
*(giá»‘ng PRD v1 â€” Ä‘áº§y Ä‘á»§ 3 role, RBAC, must_change_password flow)*

**must_change_password flow:**
```
Login â†’ check must_change_password = true
â†’ Redirect /change-password (middleware cháº·n táº¥t cáº£ route khÃ¡c)
â†’ User nháº­p máº­t kháº©u má»›i â†’ reset flag â†’ vÃ o dashboard
```

### 4.2 Facebook Token Management

Token háº¿t háº¡n sau 60 ngÃ y â€” cáº§n chá»§ Ä‘á»™ng quáº£n lÃ½:

- LÆ°u `token_expires_at` khi thÃªm page
- Cron job 09:00 hÃ ng ngÃ y kiá»ƒm tra token cÃ²n < 7 ngÃ y â†’ táº¡o notification + Telegram
- UI badge trÃªn trang Pages:
  - Xanh: "Token cÃ²n X ngÃ y"
  - Cam: "âš ï¸ Token sáº¯p háº¿t (X ngÃ y)"
  - Äá»: "âŒ Token háº¿t háº¡n"
- NÃºt "LÃ m má»›i token" â†’ modal paste token má»›i â†’ verify vá»›i Graph API trÆ°á»›c khi lÆ°u

### 4.3 Batch Generate Queue

Thay vÃ¬ loop tháº³ng (timeout khi generate nhiá»u bÃ i), dÃ¹ng job queue:

```
User trigger batch
â†’ INSERT N rows vÃ o generate_jobs (pending) â†’ return batch_id
â†’ Worker cron cháº¡y má»—i 30s â†’ láº¥y pending â†’ process tá»«ng job
â†’ Frontend polling /api/jobs/:batch_id/status má»—i 3s
â†’ Cáº­p nháº­t progress bar realtime
â†’ Khi done â†’ hiá»‡n danh sÃ¡ch bÃ i Ä‘á»ƒ review & approve
```

### 4.4 Image Storage Management

```
TrÆ°á»›c khi generate áº£nh: check disk usage /public/images/
â†’ > 400MB: warning trong dashboard
â†’ > 500MB: táº¡m dá»«ng generate áº£nh, notify admin

Cleanup cron (CN 02:00):
â†’ XÃ³a áº£nh cá»§a posts Ä‘Ã£ published > 30 ngÃ y (áº£nh Ä‘Ã£ lÃªn FB rá»“i)
â†’ Log sá»‘ lÆ°á»£ng vÃ  dung lÆ°á»£ng Ä‘Ã£ giáº£i phÃ³ng
```

### 4.5 Notification System

Táº¡o notification tá»± Ä‘á»™ng khi:
- Post status = 'failed' â†’ notify admin
- Token sáº¯p háº¿t (< 7 ngÃ y) â†’ notify admin
- Batch generate xong â†’ notify ngÆ°á»i trigger
- Storage > 80% â†’ notify super_admin
- User má»›i Ä‘Æ°á»£c táº¡o â†’ notify user Ä‘Ã³

### 4.6 ÄÄƒng Video lÃªn Facebook â† Má»šI

Facebook Graph API há»— trá»£ upload video trá»±c tiáº¿p.

**Loáº¡i video há»— trá»£:**
- Upload thá»§ cÃ´ng: user upload file mp4 (max 1GB, tá»‘i Ä‘a 240 phÃºt)
- Reels: video ngáº¯n dá»c (9:16, max 15 phÃºt)
- KhÃ´ng generate video báº±ng AI (chÆ°a cÃ³ API Ä‘á»§ cháº¥t lÆ°á»£ng + quÃ¡ Ä‘áº¯t)

**Flow Ä‘Äƒng video:**
```
User vÃ o mÃ n hÃ¬nh Táº¡o bÃ i â†’ chá»n tab "Video"
â†’ Upload video file (mp4/mov/avi) hoáº·c nháº­p URL video
â†’ Nháº­p caption (AI há»— trá»£ viáº¿t caption náº¿u muá»‘n)
â†’ Chá»n thumbnail (auto extract tá»« video hoáº·c upload áº£nh)
â†’ Chá»n loáº¡i: Post thÆ°á»ng / Reels
â†’ Preview â†’ Schedule / Publish
```

**Backend â€” fbService.js:**
```javascript
// Upload video qua Resumable Upload API
async function uploadVideo(videoPath, page) {
  // BÆ°á»›c 1: Khá»Ÿi táº¡o upload session
  const session = await axios.post(
    `https://graph.facebook.com/${page.page_id}/videos`,
    {
      upload_phase: 'start',
      file_size: fs.statSync(videoPath).size,
      access_token: page.page_token
    }
  );
  
  // BÆ°á»›c 2: Upload chunks (má»—i chunk 10MB)
  // BÆ°á»›c 3: Finish â†’ láº¥y video_id
  // BÆ°á»›c 4: Publish vá»›i caption
}

// ÄÄƒng Reels
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

**Báº£ng so sÃ¡nh loáº¡i media:**

| | áº¢nh AI | áº¢nh thá»§ cÃ´ng | Video thá»§ cÃ´ng | Reels |
|---|:---:|:---:|:---:|:---:|
| Generate tá»± Ä‘á»™ng | âœ… | âŒ | âŒ | âŒ |
| LÃªn lá»‹ch | âœ… | âœ… | âœ… | âœ… |
| Batch schedule | âœ… | âŒ | âŒ | âŒ |
| Facebook reach | Trung bÃ¬nh | Trung bÃ¬nh | Cao | Ráº¥t cao |

**LÆ°u Ã½ quan trá»ng vá» video:**
- Video lÆ°u trong `/public/videos/` riÃªng, khÃ´ng láº«n vá»›i áº£nh
- Giá»›i háº¡n upload: 500MB/file (cÃ³ thá»ƒ cáº¥u hÃ¬nh trong Settings)
- Sau khi Ä‘Äƒng thÃ nh cÃ´ng â†’ giá»¯ video 7 ngÃ y (áº£nh chá»‰ giá»¯ náº¿u cÃ²n Ä‘ang scheduled)
- Thumbnail báº¯t buá»™c pháº£i cÃ³ Ä‘á»ƒ preview Ä‘áº¹p trong danh sÃ¡ch bÃ i

### 4.7 AI Rate Limit Guard

```javascript
// aiService.js â€” dÃ¹ng p-limit
import pLimit from 'p-limit';

const limit = pLimit(3); // max 3 concurrent AI calls

// Delay giá»¯a cÃ¡c call Ä‘á»ƒ trÃ¡nh rate limit
const DELAY_MS = { claude: 1000, openai: 500, gemini: 500 };

async function callWithRateLimit(provider, fn) {
  return limit(async () => {
    await sleep(DELAY_MS[provider] || 500);
    return fn();
  });
}
```

### 4.8 Facebook Post Preview (Simulator)

Component render Ä‘Ãºng nhÆ° Facebook:
- Hashtag mÃ u xanh, @mention highlight
- Emoji render Ä‘Ãºng
- Xuá»‘ng dÃ²ng Ä‘Ãºng
- Giá»›i háº¡n 3 dÃ²ng â†’ "Xem thÃªm"
- Video preview vá»›i thumbnail + nÃºt play
- TÃªn Page + avatar láº¥y tá»« config

### 4.9 Content Templates

LÆ°u sáºµn prompt template Ä‘á»ƒ tÃ¡i sá»­ dá»¥ng:
- `"Viáº¿t bÃ i {style} vá» {topic} cho page bÃ¡n {product}"`
- Variables Ä‘iá»n khi generate
- Category: khuyáº¿n mÃ£i / sáº£n pháº©m / sá»± kiá»‡n / tip

---

## 5. SYSTEM DESIGN

### 5.1 Kiáº¿n trÃºc tá»•ng thá»ƒ

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        CLIENT                            â”‚
â”‚  Browser (React SPA)   Polling /api/jobs/:id/status      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚ HTTPS
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                         NGINX                            â”‚
â”‚  /api â†’ proxy :3001  |  / â†’ dist/  |  /images â†’ static  â”‚
â”‚                                    |  /videos â†’ static   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  NODE.JS API (:3001)                     â”‚
â”‚                                                          â”‚
â”‚  Routes â†’ Middleware (JWT + RBAC) â†’ Controllers         â”‚
â”‚                                                          â”‚
â”‚  Services:                                               â”‚
â”‚  â”œâ”€â”€ aiService.js        Claude / OpenAI / Gemini        â”‚
â”‚  â”œâ”€â”€ imageService.js     Ideogram / DALL-E               â”‚
â”‚  â”œâ”€â”€ fbService.js        Facebook Graph API v25.0        â”‚
â”‚  â”œâ”€â”€ jobWorker.js        Process generate_jobs queue     â”‚
â”‚  â”œâ”€â”€ scheduler.js        node-cron                       â”‚
â”‚  â”œâ”€â”€ notifyService.js    Telegram bot                    â”‚
â”‚  â””â”€â”€ storageService.js   Disk check + cleanup            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚       MySQL 8            â”‚    â”‚   External APIs          â”‚
â”‚  users                  â”‚    â”‚  Claude / GPT-4o / Geminiâ”‚
â”‚  posts (+ video fields) â”‚    â”‚  Ideogram / DALL-E 3     â”‚
â”‚  fb_pages (+ token mgmt)â”‚    â”‚  Facebook Graph API      â”‚
â”‚  generate_jobs  (queue) â”‚    â”‚  Telegram Bot API        â”‚
â”‚  notifications          â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚  activity_logs          â”‚
â”‚  content_templates      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 5.2 Cron Jobs Schedule

```
Má»—i phÃºt        Publish posts Ä‘áº¿n giá» (image + video)
Má»—i 30 giÃ¢y     Process pending generate_jobs
23:00 hÃ ng ngÃ y Auto generate posts cho ngÃ y mai
09:00 hÃ ng ngÃ y Kiá»ƒm tra token sáº¯p háº¿t háº¡n
Chá»§ nháº­t 02:00  Cleanup áº£nh cÅ© > 30 ngÃ y, video cÅ© > 7 ngÃ y
```

### 5.3 Video Upload Flow

```
User upload video
â†’ Multer save vÃ o /public/videos/tmp/
â†’ Validate: format, size, duration
â†’ Extract thumbnail (frame giÃ¢y thá»© 3)
â†’ Move vÃ o /public/videos/{year}/{month}/
â†’ Save record vÃ o posts (video_url, video_thumb_url, media_type='video')

Khi publish:
â†’ fbService.uploadVideo(videoPath, page) â€” chunked upload
â†’ Láº¥y video_id tá»« Facebook
â†’ Publish post vá»›i video_id + caption
â†’ Update post: status='published', fb_post_id, media_type='video'
```

---

## 6. UI/UX DESIGN SYSTEM â€” LIGHT THEME

> **Cáº­p nháº­t 2026-06-22:** Spec Ä‘áº§y Ä‘á»§ táº¡i [`frontend/DESIGN_SYSTEM.md`](frontend/DESIGN_SYSTEM.md).  
> Concept: **Zinc Studio** â€” sidebar zinc-950, content zinc-50, accent blue-600, font Inter.

### 6.1 Concept

**Dark sidebar + Light content area** â€” Linear / Vercel style.  
Sidebar `#09090B`, content `#FAFAFA`, accent `#2563EB`. KhÃ´ng gradient, khÃ´ng animation decorative.

---

### 6.2 Color Palette

```css
:root {
  --color-primary:        #2563EB;
  --color-primary-hover:  #1D4ED8;
  --color-primary-subtle: #EFF6FF;
  --color-primary-border: #BFDBFE;
  --bg-base:              #FAFAFA;
  --bg-surface:           #FFFFFF;
  --bg-muted:             #F4F4F5;
  --bg-border:            #E4E4E7;
  --sidebar-bg:           #09090B;
  --sidebar-item-hover:   #18181B;
  --sidebar-item-active:  #27272A;
  --sidebar-text:         #A1A1AA;
  --sidebar-text-active:  #FAFAFA;
  --text-primary:         #09090B;
  --text-secondary:       #71717A;
  --text-tertiary:        #A1A1AA;
  /* semantic + post status: xem tokens.css */
}
```

---

### 6.3 Typography

```css
/* Inter + JetBrains Mono â€” Google Fonts trong index.html */
:root {
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --text-xs: 0.75rem;   /* 12px */
  --text-sm: 0.8125rem; /* 13px */
  --text-base: 0.875rem;/* 14px */
  --text-md: 1rem;      /* 16px */
  --text-2xl: 1.5rem;   /* 24px â€” page title */
}
```

---

### 6.4 Spacing & Layout

```css
:root {
  --sidebar-width: 240px;
  --header-height: 56px;
  --content-max: 1280px;
  --content-padding: 24px;
  --card-radius: 12px;
  --space-1: 4px;  --space-2: 8px;  --space-4: 16px;
  --space-6: 24px; --space-8: 32px;
}
```

---

### 6.5 Components

**React (`src/components/ui/`):** `Button`, `Input`, `Label`, `Badge`, `Card`, `StatCard`, `PageHeader`, `Modal`, `Skeleton`.

**CSS (`components.css`):** `.sidebar`, `.app-header`, `.card`, `.stat-card`, `.btn`, `.table`, `.modal`, `.badge-*`.

Chi tiáº¿t props, variants, patterns â†’ `frontend/DESIGN_SYSTEM.md`.

---

## 7. RESPONSIVE & MOBILE

### 7.1 Breakpoints

```css
/* Mobile:  < 768px  */
/* Tablet:  768â€“1023px */
/* Desktop: â‰¥ 1024px */
```

### 7.2 Layout theo device

**Desktop (â‰¥ 1024px):**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SIDEBAR 240px â”‚         HEADER 56px                    â”‚
â”‚ Dark Indigo   â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚               â”‚                                        â”‚
â”‚ Logo          â”‚         CONTENT AREA                   â”‚
â”‚ Navigation    â”‚         bg: #F5F7FA                    â”‚
â”‚               â”‚         max-width: 1280px              â”‚
â”‚               â”‚         padding: 24px                  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€     â”‚                                        â”‚
â”‚ User info     â”‚                                        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Tablet (768â€“1023px):**
```
Sidebar collapse cÃ²n 64px (icons only)
Hover/click â†’ overlay expand 240px
Content area full width
```

**Mobile (< 768px):**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ [â‰¡]  AutoPost                           [ðŸ””] [Avatar] â”‚  Header
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                        â”‚
â”‚           CONTENT AREA                                 â”‚
â”‚           padding: 16px                                â”‚
â”‚                                                        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚    ðŸ         ðŸ“       âœ¨        ðŸ“‹        âš™ï¸           â”‚  Bottom Nav
â”‚  Dashboard  BÃ i viáº¿t  Táº¡o bÃ i  Lá»‹ch    CÃ i Ä‘áº·t        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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

/* Tab "Táº¡o bÃ i" á»Ÿ giá»¯a â€” to hÆ¡n */
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
- Tables â†’ card list (row trá»Ÿ thÃ nh card dá»c)
- Modal â†’ bottom sheet trÃªn mobile (`slideInBottom`)
- Batch generate chá»‰ desktop (quÃ¡ complex cho mobile, show banner hÆ°á»›ng dáº«n)
- Dashboard stats: 2 cá»™t thay vÃ¬ 4 cá»™t
- Textarea min-height: 120px
- Video upload chá»‰ desktop (file picker mobile háº¡n cháº¿)

---

## 8. MÃ€N HÃŒNH CHI TIáº¾T

### 8.1 Header

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ [Search posts, pages...]          [ðŸ”” â‘¢]  [Aâ–¾ TÃªn User] â”‚
â”‚  bg: white, border-bottom: 1px                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 8.2 Dashboard

```
PAGE TITLE: "Xin chÃ o, [TÃªn] ðŸ‘‹"
SUB: "HÃ´m nay thá»© Hai, 9 thÃ¡ng 6"

â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ card-statâ”‚ â”‚ card-statâ”‚ â”‚ card-statâ”‚ â”‚ card-statâ”‚
â”‚ (primary)â”‚ â”‚ (success)â”‚ â”‚ (warning)â”‚ â”‚ (error)  â”‚
â”‚          â”‚ â”‚          â”‚ â”‚          â”‚ â”‚          â”‚
â”‚  142     â”‚ â”‚  118     â”‚ â”‚  18      â”‚ â”‚  6       â”‚
â”‚ Tá»•ng bÃ i â”‚ â”‚ ÄÃ£ Ä‘Äƒng  â”‚ â”‚ Chá» Ä‘Äƒng â”‚ â”‚  Lá»—i    â”‚
â”‚ +12 hÃ´m  â”‚ â”‚          â”‚ â”‚          â”‚ â”‚  !       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€ Lá»ŠCH ÄÄ‚NG BÃ€I (2/3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€ Sáº®P ÄÄ‚NG (1/3) â”€â”
â”‚ < ThÃ¡ng 6/2025 >               â”‚ â”‚                   â”‚
â”‚                                â”‚ â”‚ HÃ´m nay 14:00     â”‚
â”‚ T2  T3  T4  T5  T6  T7  CN    â”‚ â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  2   3   4   5   6   7   8    â”‚ â”‚ â”‚[thumb] Page â”‚   â”‚
â”‚  9â— 10â— 11  12â— 13â— 14  15    â”‚ â”‚ â”‚ Há»™p QuÃ  Táº¿t â”‚   â”‚
â”‚ 16  17â— 18â— 19  20  21  22    â”‚ â”‚ â”‚ "ChÃ o má»«ng" â”‚   â”‚
â”‚ ...                            â”‚ â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                â”‚ â”‚                   â”‚
â”‚ â— = cÃ³ bÃ i scheduled          â”‚ â”‚ NgÃ y mai 08:00    â”‚
â”‚ Click ngÃ y â†’ xem bÃ i hÃ´m Ä‘Ã³   â”‚ â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚ â”‚[thumb] ...  â”‚   â”‚
                                   â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
                                   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€ ACTIVITY Gáº¦N ÄÃ‚Y â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ âœ… 08:02  "Page Há»™p QuÃ  Táº¿t" Ä‘Äƒng thÃ nh cÃ´ng           â”‚
â”‚ âŒ 07:30  "Page Test" tháº¥t báº¡i â€” Token háº¿t háº¡n         â”‚
â”‚ âœ¨ HÃ´m qua 23:00  Auto-generated 3 bÃ i cho hÃ´m nay     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 8.3 Posts List

```
FILTER ROW:
[Táº¥t cáº£ pages â–¼] [Táº¥t cáº£ tráº¡ng thÃ¡i â–¼] [Táº¥t cáº£ loáº¡i â–¼] [ðŸ“… ThÃ¡ng nÃ y â–¼]
[ðŸ” TÃ¬m ná»™i dung...]                              [+ Táº¡o bÃ i]

POST CARD:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  [â— ÄÃ£ Ä‘Äƒng]  [ðŸ–¼ áº¢nh]  Page: Há»™p QuÃ  Táº¿t   â”‚
â”‚ â”‚ thumb  â”‚  09/06/2025 08:00                             â”‚
â”‚ â”‚(64Ã—64) â”‚                                              â”‚
â”‚ â”‚        â”‚  ChÃ o má»«ng thÃ¡ng 6 vá»›i Æ°u Ä‘Ã£i Ä‘áº·c biá»‡t!    â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜  ðŸŽ Äáº·t ngay há»™p quÃ  táº¿t Ä‘á»ƒ nháº­n...         â”‚
â”‚                                                          â”‚
â”‚ fb_post_id: 1234...   [ðŸ‘ Xem] [âœï¸ Sá»­a] [ðŸ—‘]            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

VIDEO POST CARD:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  [â— ÄÃ£ Ä‘Äƒng]  [â–¶ Video]  Page: Há»™p QuÃ  Táº¿t  â”‚
â”‚ â”‚ video  â”‚  09/06/2025 14:00                             â”‚
â”‚ â”‚ thumb  â”‚                                              â”‚
â”‚ â”‚ â–¶ play â”‚  Caption viáº¿t cho video...                   â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                              â”‚
â”‚                                   [ðŸ‘] [âœï¸] [ðŸ—‘]          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 8.4 Táº¡o bÃ i (Manual)

```
TABS: [ðŸ“ Viáº¿t bÃ i text+áº£nh]  [â–¶ ÄÄƒng video]

--- TAB TEXT+áº¢NH ---
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Cáº¤U HÃŒNH                     â”‚ PREVIEW FACEBOOK          â”‚
â”‚                              â”‚                          â”‚
â”‚ Trang: [Há»™p QuÃ  Táº¿t â–¼]      â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚                              â”‚  â”‚ [áº¢nh page] Há»™p     â”‚  â”‚
â”‚ Chá»§ Ä‘á»:                      â”‚  â”‚ QuÃ  Táº¿t HOPGIAYRE  â”‚  â”‚
â”‚ [textarea...]                â”‚  â”‚ Vá»«a xong Â· ðŸŒ      â”‚  â”‚
â”‚                              â”‚  â”‚                    â”‚  â”‚
â”‚ Template:                    â”‚  â”‚ [Ná»™i dung bÃ i]     â”‚  â”‚
â”‚ [Chá»n template â–¼]           â”‚  â”‚                    â”‚  â”‚
â”‚                              â”‚  â”‚ [áº¢nh generate]     â”‚  â”‚
â”‚ NgÃ y: [09/06/2025]          â”‚  â”‚                    â”‚  â”‚
â”‚ Giá»:  [08:00]               â”‚  â”‚ ðŸ‘ ðŸ’¬ â†—           â”‚  â”‚
â”‚                              â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚ [âœ¨ GENERATE BÃ€I]           â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ â”€â”€â”€ Sau khi generate â”€â”€â”€     â”‚                          â”‚
â”‚ Ná»™i dung:                    â”‚                          â”‚
â”‚ [editable textarea]          â”‚                          â”‚
â”‚ [ðŸ”„ Viáº¿t láº¡i] [ðŸ”„ áº¢nh má»›i] â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ [LÆ°u draft] [LÃªn lá»‹ch]      â”‚                          â”‚
â”‚             [ðŸš€ ÄÄƒng ngay]  â”‚                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

--- TAB VIDEO ---
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Cáº¤U HÃŒNH                     â”‚ PREVIEW                   â”‚
â”‚                              â”‚                          â”‚
â”‚ Trang: [Há»™p QuÃ  Táº¿t â–¼]      â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚                              â”‚ â”‚                      â”‚ â”‚
â”‚ Upload video:                â”‚ â”‚   [VIDEO THUMBNAIL]  â”‚ â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚ â”‚        â–¶             â”‚ â”‚
â”‚ â”‚  KÃ©o tháº£ hoáº·c click     â”‚ â”‚ â”‚                      â”‚ â”‚
â”‚ â”‚  Ä‘á»ƒ chá»n video           â”‚ â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ â”‚  mp4 / mov / avi         â”‚ â”‚                          â”‚
â”‚ â”‚  Tá»‘i Ä‘a 500MB            â”‚ â”‚ Caption preview...       â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ Loáº¡i Ä‘Äƒng:                   â”‚                          â”‚
â”‚ (â—‹) Post thÆ°á»ng  (â—‹) Reels  â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ Caption:                     â”‚                          â”‚
â”‚ [textarea...]                â”‚                          â”‚
â”‚ [âœ¨ AI viáº¿t caption]         â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ Thumbnail:                   â”‚                          â”‚
â”‚ [Auto tá»« video] [Upload áº£nh] â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ NgÃ y: [09/06]  Giá»: [14:00] â”‚                          â”‚
â”‚                              â”‚                          â”‚
â”‚ [LÃªn lá»‹ch]  [ðŸš€ ÄÄƒng ngay] â”‚                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 8.5 Batch Generate

```
BÆ°á»›c 1/3 â€” Chá»n cáº¥u hÃ¬nh
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Trang:    [Há»™p QuÃ  Táº¿t â–¼]                               â”‚
â”‚ Tá»« ngÃ y:  [09/06/2025]                                  â”‚
â”‚ Äáº¿n ngÃ y: [15/06/2025]  â†’  Sáº½ táº¡o 7 bÃ i               â”‚
â”‚                                                          â”‚
â”‚               [Xem trÆ°á»›c topics â†’]                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

BÆ°á»›c 2/3 â€” Xem topics sáº½ generate
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ T2 09/06  08:00  "Khuyáº¿n mÃ£i Ä‘áº§u tuáº§n"                 â”‚
â”‚ T3 10/06  08:00  "Sáº£n pháº©m ná»•i báº­t"                    â”‚
â”‚ T4 11/06  08:00  "Tip chá»n há»™p quÃ "                    â”‚
â”‚ T5 12/06  08:00  "Háº­u trÆ°á»ng sáº£n xuáº¥t"                 â”‚
â”‚ T6 13/06  08:00  "Feedback khÃ¡ch hÃ ng"                  â”‚
â”‚ T7 14/06  09:00  "Cuá»‘i tuáº§n sale"                      â”‚
â”‚ CN 15/06  09:00  â€” KhÃ´ng cÃ³ topic                       â”‚
â”‚                                                          â”‚
â”‚                   [â† Quay láº¡i]  [âœ¨ Generate 6 bÃ i â†’]  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

BÆ°á»›c 3/3 â€” Äang generate
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Äang xá»­ lÃ½ 3/6 bÃ i...                                  â”‚
â”‚ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘ 50%                               â”‚
â”‚                                                          â”‚
â”‚ âœ… T2 09/06  HoÃ n thÃ nh                                 â”‚
â”‚ âœ… T3 10/06  HoÃ n thÃ nh                                 â”‚
â”‚ âœ… T4 11/06  HoÃ n thÃ nh                                 â”‚
â”‚ â³ T5 12/06  Äang táº¡o...                               â”‚
â”‚ â—‹  T6 13/06  Chá»                                        â”‚
â”‚ â—‹  T7 14/06  Chá»                                        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â†’ Xong: Danh sÃ¡ch 6 mini-card Ä‘á»ƒ review
â†’ [Approve táº¥t cáº£] â†’ LÃªn lá»‹ch hÃ ng loáº¡t
```

### 8.6 Notification Dropdown

```
[ðŸ”” â‘¢] click:
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ThÃ´ng bÃ¡o                [Äá»c háº¿t] â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ âŒ 5 phÃºt trÆ°á»›c           [chÆ°a Ä‘á»c]â”‚
â”‚  BÃ i Ä‘Äƒng tháº¥t báº¡i: "Page Test"    â”‚
â”‚  Lá»—i: Invalid access token         â”‚
â”‚  [Xem bÃ i] [LÃ m má»›i token]         â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ âš ï¸ 2 tiáº¿ng trÆ°á»›c                    â”‚
â”‚  Token sáº¯p háº¿t: "Page B" â€” 3 ngÃ y â”‚
â”‚  [Cáº­p nháº­t token ngay]             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ âœ… HÃ´m qua 23:00                   â”‚
â”‚  ÄÃ£ táº¡o 5 bÃ i cho hÃ´m nay         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 9. ERROR HANDLING

### AI API Errors

| Lá»—i | HÃ nh Ä‘á»™ng |
|---|---|
| 429 Rate limit | Retry sau 60s, tá»‘i Ä‘a 3 láº§n, delay tÄƒng dáº§n |
| Timeout | Retry 1 láº§n, mark failed + notify |
| API key invalid | Deactivate provider, notify admin |
| Content filtered | Log + dÃ¹ng fallback prompt Ä‘Æ¡n giáº£n hÆ¡n |

### Facebook API Errors

| Error code | HÃ nh Ä‘á»™ng |
|---|---|
| 190 Token háº¿t háº¡n | Mark token_status='expired', notify admin, táº¡m dá»«ng page |
| 613 Rate limit | Queue láº¡i sau 1 giá» |
| 100 Page khÃ´ng tá»“n táº¡i | Deactivate page, notify admin |
| 368 Bá»‹ block | Log chi tiáº¿t, notify admin Ä‘á»ƒ xá»­ lÃ½ thá»§ cÃ´ng |

### Video Upload Errors

| Lá»—i | HÃ nh Ä‘á»™ng |
|---|---|
| File quÃ¡ lá»›n (> 500MB) | BÃ¡o ngay khi chá»n file, khÃ´ng upload |
| Format khÃ´ng há»— trá»£ | Validate trÆ°á»›c upload |
| Upload timeout | Resumable upload â€” tiáº¿p tá»¥c tá»« chunk bá»‹ giÃ¡n Ä‘oáº¡n |
| Storage Ä‘áº§y | BÃ¡o trÆ°á»›c khi upload, hÆ°á»›ng dáº«n cleanup |

### Storage Management

```
Check trÆ°á»›c khi generate áº£nh hoáº·c nháº­n upload video:
â†’ > 80% dung lÆ°á»£ng â†’ warning trong dashboard
â†’ > 95% â†’ block generate/upload, notify super_admin
Cleanup tá»± Ä‘á»™ng CN 02:00: áº£nh published > 30 ngÃ y, video published > 7 ngÃ y
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

# AI â€” cÃ³ thá»ƒ lÆ°u trong DB, env lÃ  fallback
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

# Scheduler (giá» auto generate, máº·c Ä‘á»‹nh 23:00)
AUTO_GENERATE_HOUR=23
AUTO_GENERATE_MINUTE=0

# Video
MAX_VIDEO_UPLOAD_MB=500
```

---

## 11. Cáº¤U TRÃšC THÆ¯ Má»¤C

```
autopost/
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ styles/
â”‚   â”‚   â”‚   â”œâ”€â”€ tokens.css           â† Táº¥t cáº£ CSS variables
â”‚   â”‚   â”‚   â”œâ”€â”€ components.css       â† Base component styles
â”‚   â”‚   â”‚   â””â”€â”€ utilities.css
â”‚   â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”‚   â”œâ”€â”€ Layout/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Sidebar.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Header.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ BottomNav.jsx
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ NotificationDropdown.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ ui/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Button.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Badge.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Card.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Input.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Modal.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ BottomSheet.jsx  â† Mobile modal
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Skeleton.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ Toast.jsx
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ ProgressBar.jsx
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ Table.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ FacebookPreview.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ PostCard.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ VideoUpload.jsx
â”‚   â”‚   â”‚   â””â”€â”€ Calendar.jsx
â”‚   â”‚   â”œâ”€â”€ pages/
â”‚   â”‚   â”‚   â”œâ”€â”€ Dashboard.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Posts.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Generate.jsx         â† CÃ³ tab video
â”‚   â”‚   â”‚   â”œâ”€â”€ BatchGenerate.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Pages.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Skills.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Providers.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ UserManagement.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ ActivityLog.jsx
â”‚   â”‚   â”‚   â”œâ”€â”€ Settings.jsx
â”‚   â”‚   â”‚   â””â”€â”€ ChangePassword.jsx
â”‚   â”‚   â”œâ”€â”€ hooks/
â”‚   â”‚   â”‚   â”œâ”€â”€ useAuth.js
â”‚   â”‚   â”‚   â”œâ”€â”€ useNotifications.js
â”‚   â”‚   â”‚   â””â”€â”€ useJobPolling.js
â”‚   â”‚   â””â”€â”€ services/
â”‚   â”‚       â””â”€â”€ api.js
â”‚   â””â”€â”€ package.json
â”‚
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â”‚   â”œâ”€â”€ auth.js
â”‚   â”‚   â”‚   â”œâ”€â”€ users.js
â”‚   â”‚   â”‚   â”œâ”€â”€ posts.js
â”‚   â”‚   â”‚   â”œâ”€â”€ pages.js
â”‚   â”‚   â”‚   â”œâ”€â”€ skills.js
â”‚   â”‚   â”‚   â”œâ”€â”€ providers.js
â”‚   â”‚   â”‚   â”œâ”€â”€ jobs.js
â”‚   â”‚   â”‚   â”œâ”€â”€ notifications.js
â”‚   â”‚   â”‚   â”œâ”€â”€ activity.js
â”‚   â”‚   â”‚   â””â”€â”€ upload.js
â”‚   â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â”‚   â”œâ”€â”€ aiService.js
â”‚   â”‚   â”‚   â”œâ”€â”€ imageService.js
â”‚   â”‚   â”‚   â”œâ”€â”€ videoService.js      â† Má»šI
â”‚   â”‚   â”‚   â”œâ”€â”€ fbService.js
â”‚   â”‚   â”‚   â”œâ”€â”€ jobWorker.js
â”‚   â”‚   â”‚   â”œâ”€â”€ scheduler.js
â”‚   â”‚   â”‚   â”œâ”€â”€ notifyService.js
â”‚   â”‚   â”‚   â””â”€â”€ storageService.js
â”‚   â”‚   â””â”€â”€ middleware/
â”‚   â”‚       â”œâ”€â”€ auth.js
â”‚   â”‚       â””â”€â”€ rbac.js
â”‚   â””â”€â”€ package.json
â”‚
â””â”€â”€ public/
    â”œâ”€â”€ images/       â† áº¢nh AI generate
    â””â”€â”€ videos/       â† Video upload
        â””â”€â”€ tmp/      â† Buffer trong lÃºc upload
```

---

## 12. THá»¨ Tá»° BUILD

```
Phase 1 â€” Backend core (ngÃ y 1-2)
  Setup project + DB + migrations (táº¥t cáº£ báº£ng)
  Auth API + RBAC + must_change_password
  Users API + Activity Log middleware

Phase 2 â€” Backend features (ngÃ y 3-4)
  Providers + Skills + Pages API + Token management
  aiService + imageService + fbService
  videoService + upload video endpoint
  Posts API + generate-video endpoint
  jobWorker + scheduler + notifyService

Phase 3 â€” Frontend core (ngÃ y 5-6)
  CSS tokens + component library
  Layout: Sidebar (dark indigo) + Header + BottomNav responsive
  Auth pages + ChangePassword

Phase 4 â€” Frontend features (ngÃ y 7-9)
  Dashboard + Calendar
  Posts list (filter áº£nh/video, mini preview)
  Generate: tab text+áº£nh vÃ  tab video
  Batch Generate + progress polling
  Pages config + Token management UI
  Skills + Providers
  Notifications dropdown
  User Management + Activity Log + Settings

Phase 5 â€” Polish + Deploy (ngÃ y 10)
  Skeleton loading táº¥t cáº£ mÃ n hÃ¬nh
  Toast system
  Error boundaries
  Mobile test (Bottom sheet, Bottom nav)
  Deploy VPS + SSL + Nginx
  Smoke test toÃ n bá»™ flow
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
        # KhÃ´ng cache aggressively vÃ¬ video lá»›n
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

*AutoPost v2.1 â€” PRD production-ready*  
*Bao gá»“m: light theme, video support, token management, batch queue, notification system*
