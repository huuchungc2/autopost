# Changelog

## [Unreleased]

### Added
- **GroupFlow v1.0.10** — Cài đặt **Text/Image provider** giống website (proxy `/api/group-posts/ai/*`); tab Tạo bài **Nhập tay trước Excel**; chọn nhóm inline trên từng bài + tick nhóm khi nhập tay
- **GroupFlow tab Hướng dẫn** — hướng dẫn cài đặt, quy trình đăng bài, troubleshooting ngay trong popup extension
- **GroupFlow composer v1.0.9** — Quill + emoji + spintax + tab A/B/C/D, AI viết lại (9Router), nền màu FB (Nhanh), first comment tự động, lên lịch dàn campaign
- **GroupFlow đăng nền (directApi)** — chế độ Nhanh đăng qua `fbPostBg.js` + `fbSessionBg.js` trong service worker: không mở tab FB, doc_id cố định GPP, nhận `pending_approval`, dừng khi rate limit; video vẫn Classic
- **GroupFlow comment nền** — tab Comment chéo team: `fbCommentBg.js` GraphQL (`useCometUFICreateCommentMutation`), kiểm tra bài trước khi comment, giả lập typing; fallback DOM; vẫn `PATCH /commented` tidien
- **GroupFlow comment batch + lịch** — delay ngẫu nhiên giữa comment theo `securityLevel`; lên lịch nhiều comment (`gf_cmt_*` alarm); tab Activity hiển thị/hủy/sửa giờ
- **GroupFlow docs** — `GROUPFLOW.md` + PRD + README: đăng/comment nền, giãn cách comment, cài extension, ref GPP folder
- **GroupFlow nhập tay media** — upload ảnh/video + prompt AI tạo ảnh trong tab Tạo bài
- **GroupFlow profile switcher** — chọn Cá nhân/Fanpage trên header, `fbActor.js` + sync `actor_id` khi đăng
- **GroupFlow sidepanel UI** — redesign header, tabs, cards, empty states, typography DM Sans
- **GroupFlow website UI polish** — Settings extension key, `/groups` filter + chi tiết/comment, import preview, drafts pagination, Dashboard GroupFlow, mobile nav Group
- **Group shared drafts + group_name** — migration `026`, admin import chia sẻ team, sửa/re-pull draft, `group_name` sync từ extension
- **Group API** — `GET /extension-key`, `GET /stats`, `GET /:id/comments`, lọc search/ngày/user
- **Draft pull API** — `POST/GET /drafts`, `GET /drafts/pull`, migration `025_group_post_drafts.sql`
- Extension nút **Tải từ website** → merge queue local
- **GroupFlow lịch xuất ảnh** — giống fanpage: chưa ảnh → xuất rồi đăng; lịch `anh_*` riêng; quét đêm queue (`postMedia.js`)
- **GroupFlow** — Chrome extension `GroupFlow/fb-group-poster/`
- Backend API `/api/group-posts/*` + migration `024`; doc `docs/GROUPFLOW.md`
- Folder Google Drive riêng từng fanpage (`fb_pages.google_drive_folder_id`) — ảnh AI/upload vào subfolder, fallback folder gốc Cài đặt; doc `docs/GOOGLE_DRIVE.md`

### Fixed
- **GroupFlow v1.0.8** — SW gộp `modules/swBundle.js` (IIFE từng module) — hết crash `GF_GLOBAL`/`const` trùng trong `importScripts`
- **GroupFlow v1.0.7** — fix SW crash: `importScripts` dùng chung scope, nhiều `const GF_GLOBAL` khiến service worker không khởi động (nút Lỗi + Inactive); thêm `gfShared.js`
- **GroupFlow v1.0.6** — bỏ Google Fonts (CSP popup), icon PNG nhỏ, script `validate.ps1`; xóa `_ref-group-posting` gây nút Lỗi Chrome
- **GroupFlow v1.0.5** — xóa lại `_ref-group-posting` trong folder extension (nút Lỗi Chrome); nhận FB từ cookie/session nền, không bắt buộc mở tab FB trước
- **GroupFlow load extension** — thư mục tham chiếu GPP `_ref-group-posting` trong `fb-group-poster/` khiến Chrome từ chối load (`_*` reserved); chuyển ra `GroupFlow/ref-group-posting/`
- **GroupFlow UI popup** — bỏ Side Panel API; `default_popup: sidepanel.html` (bấm icon mở popup, không phụ thuộc SW gesture)
- Extension profile switch: lỗi `unknown` khi mở sidepanel / chọn fanpage — bridge version + bỏ broadcast nhầm trong background GraphQL hook + `/groups/joins/` ưu tiên, merge 2 trang, scroll dài hơn
- **GroupFlow Extract group** — tên nhóm chỉ hiện `Group {id}`: parse JSON nhúng trong HTML (như `fbActor`), hook GraphQL ở page context (`pageNetworkHook.js`), DOM leo parent tìm tên thật
- **GroupFlow `GF_SYNC_GROUPS`** — `postMedia.js` dùng `window` làm service worker crash → background không đăng ký handler; sửa dùng `globalThis`
- **GroupFlow extract nhóm** — GraphQL nền qua cookie session (`fbGroupsBg.js`, giống Group Posting Pro); không mở tab FB
- **GroupFlow queue UX** — tab **Nhóm** riêng: auto-sync FB, tìm tên, gán batch nhiều bài, bộ custom (`groupSets.js`); mỗi bài `groupIds` riêng
- `/posts`: giữ filter, trang phân trang, chế độ lưới/bảng (URL) và scroll khi quay lại từ Sửa/Import/Lên lịch
- `migrationRunner.js`: stray `}` broke backend startup on deploy
- `facebookPublishService.js`: import `isComposioAutoFallbackEnabled` from correct module
- Settings: Google Drive test trước khi lưu; validate Folder ID (không nhận email)
- Settings: thêm nút upload file JSON (Service Account) để auto-fill textarea
- Settings: UI Browse file JSON Drive (khung chọn file rõ, giống Skills)
- Settings: Composio UI (field thiếu, nhãn nút rõ); fanpage preview token; chặn ghi đè token rỗng
- Composio: chỉ đọc từ database — bỏ fallback/seed từ `.env`
- Đồng bộ Composio: fix `token_status` truncated (`unknown` → `valid` trên cột legacy)
- Fanpage: tự hiện cấu hình Composio từ Cài đặt; ô readonly `composio_page_token`; fix hiển thị hạn token Composio sau đồng bộ

### Added — Composio & dual token
- Composio settings in DB + UI (Settings → Composio)
- Per-page dual tokens: `page_token` + `composio_page_token` with `token_source` active pointer
- `tokenHealthService`: Graph API validity check per token; hourly cron `checkPageTokens`
- Auto-switch manual ↔ Composio on publish token errors
- Composio refresh only when token status is `expired` (not proactive 6h sync)
- Migrations `019`–`022`; docs: `docs/TOKENS_AND_COMPOSIO.md`
- Script `npm run test:composio-publish` — smoke test đăng bài qua Composio (3 fanpage)

## [0.2.0] — 2026-06-15

### Added — Backend
- Real AI integration: OpenAI, Claude, Gemini (text), DALL-E, Ideogram (image) with placeholder fallback
- `providerService.js` — page generation config from DB
- `jobWorker.js` — batch queue processor
- `scheduler.js` — cron: auto-publish, batch processing, token expiry, daily topic auto-generate
- `activityLog` middleware — auto-log mutations
- `settings` route — storage usage + config
- Facebook photo/video publish via Graph API with local file upload
- Provider test endpoint
- Pagination params on posts list
- Users soft delete filter

### Added — Frontend
- React Query, Toast system, Error boundary
- UI: Badge, Button, Modal, Skeleton, PostCard, FacebookPreview, VideoUpload, Calendar
- NotificationDropdown in header
- BottomNav for mobile
- `useJobPolling`, `useNotifications` hooks
- Posts: filters, grid/table view, edit modal with preview
- Generate: text+image and video tabs
- BatchGenerate: progress bar + auto-polling
- Pages: content topics modal + token update modal
- Dashboard: status breakdown, calendar, upcoming posts
- Settings: storage stats + notifications
- must_change_password forced redirect

### Changed
- Posts default status → `pending_approval` after generate
- Approve sets scheduled if has scheduled_at

## [0.1.0] — 2026-06-15

Initial MVP scaffold (see previous entry).
