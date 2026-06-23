# Changelog

## [Unreleased]

### Added
- **GroupFlow website UI polish** — Settings extension key, `/groups` filter + chi tiết/comment, import preview, drafts pagination, Dashboard GroupFlow, mobile nav Group
- **Group shared drafts + group_name** — migration `026`, admin import chia sẻ team, sửa/re-pull draft, `group_name` sync từ extension
- **Group API** — `GET /extension-key`, `GET /stats`, `GET /:id/comments`, lọc search/ngày/user
- **Draft pull API** — `POST/GET /drafts`, `GET /drafts/pull`, migration `025_group_post_drafts.sql`
- Extension nút **Tải từ website** → merge queue local
- **GroupFlow** — Chrome extension `GroupFlow/fb-group-poster/`
- Backend API `/api/group-posts/*` + migration `024`; doc `docs/GROUPFLOW.md`
- Folder Google Drive riêng từng fanpage (`fb_pages.google_drive_folder_id`) — ảnh AI/upload vào subfolder, fallback folder gốc Cài đặt; doc `docs/GOOGLE_DRIVE.md`

### Fixed
- `/posts`: giữ filter, trang phân trang, chế độ lưới/bảng (URL) và scroll khi quay lại từ Sửa/Import/Lên lịch
- `migrationRunner.js`: stray `}` broke backend startup on deploy
- `facebookPublishService.js`: import `isComposioAutoFallbackEnabled` from correct module
- Settings: Google Drive test trước khi lưu; validate Folder ID (không nhận email)
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
