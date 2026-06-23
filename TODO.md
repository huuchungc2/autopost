# AutoPost — TODO

> Cập nhật: 2026-06-22

## Done in v0.2.x (recent)

### Composio + dual token
- [x] Composio config lưu DB (`app_settings`) — UI Cài đặt → Composio
- [x] Mỗi fanpage 2 token: `page_token` (manual) + `composio_page_token`
- [x] `token_source` = token đang active; tự chuyển manual ↔ composio khi đăng lỗi
- [x] Kiểm tra hiệu lực từng token (`debug_token` / verify) — cron mỗi giờ
- [x] Refresh Composio **chỉ khi expired** (không refresh sớm / không cron 6h)
- [x] Migration `019`–`022` — xem `docs/TOKENS_AND_COMPOSIO.md`
- [x] PageForm: 2 token + ưu tiên active; Pages list: trạng thái M/C

### Google Drive + storage (nếu đã deploy)
- [x] `MAX_IMAGES_MB` 5GB, UI Drive trong Cài đặt
- [x] Ảnh `gdrive://` — proxy khi đăng FB
- [x] Folder Drive riêng từng fanpage — PageForm + migration `023`

## Done in v0.2.0

- [x] AI text/image integration (OpenAI, Claude, Gemini, Ideogram) with fallback
- [x] Facebook publish photo + video
- [x] jobWorker + scheduler (cron publish, batch, token check, auto-generate topics)
- [x] Activity log middleware
- [x] Settings API (storage usage)
- [x] Users soft delete
- [x] Provider test endpoint
- [x] Frontend: React Query, Toast, Error boundary
- [x] Posts filter + grid + edit modal + Facebook preview
- [x] Generate tabs (text + video)
- [x] Batch auto-polling
- [x] Pages topics + token UI
- [x] Notification dropdown
- [x] Dashboard calendar + status stats
- [x] Settings system info
- [x] must_change_password redirect
- [x] Mobile bottom nav

## GroupFlow (Chrome Extension — FB Group)

PRD: [`GroupFlow/fb-group-poster-PRD.md`](GroupFlow/fb-group-poster-PRD.md)

### Phase 1 — MVP
- [x] Extension scaffold `GroupFlow/fb-group-poster/`
- [x] Đăng bài Excel + nhập tay, generate ảnh 9Router, lưu local
- [x] Backend: `POST /api/group-posts/sync` + migration 024

### Phase 2 — Comment chéo *(core)*
- [x] Login tidien extension, tab Comment, AI generate + DOM comment
- [x] Backend: `GET pending-comments` + `PATCH commented`

### Phase 3
- [x] Lên lịch + retry miss lịch, Google Drive, Activity log

### Phase 4 — Radar Lead
- [x] Tab Radar, `leadRadar.js`

### Website UI + draft sync
- [x] `/groups`, `/groups/import`, `/groups/drafts`
- [x] API drafts + extension **Tải từ website**
- [x] Settings extension key + FB profile
- [x] `/groups` filter, chi tiết bài, lịch sử comment
- [x] Import preview, drafts pagination + `prompt_anh`/`pulled_at`
- [x] Dashboard GroupFlow widget + mobile nav Group
- [x] Shared draft team (admin import), sửa draft, re-pull
- [x] `group_name` trên bài đã đăng + extension sync

## Remaining (optional polish)

- [ ] E2E tests (Playwright)
- [ ] Swagger/OpenAPI docs
- [ ] content_templates CRUD
- [ ] Encrypt API keys at rest
- [ ] VPS deploy scripts + Nginx config in repo
- [ ] Cập nhật PRD §4.2 token management theo dual-token + Composio

## Tài liệu

- Token & Composio: [`docs/TOKENS_AND_COMPOSIO.md`](docs/TOKENS_AND_COMPOSIO.md)
- Deploy: [`DEPLOY.md`](DEPLOY.md)
