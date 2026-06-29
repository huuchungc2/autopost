# AutoPost — TODO

> Cập nhật: 2026-06-27

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
- [x] Settings: upload file Service Account JSON (auto-fill)

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
- [x] Login tidien extension, tab Comment, AI generate + comment nền GraphQL (`fbCommentBg.js`), fallback DOM
- [x] Backend: `GET pending-comments` + `PATCH commented`

### Phase 3
- [x] Lên lịch + retry miss lịch, Google Drive, Activity log
- [x] Lịch xuất ảnh riêng + quét đêm queue (giống fanpage)

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
- [x] Chế độ Nhanh (GraphQL nền SW, không tab FB) + Cổ điển (DOM), cấp độ bảo mật, tránh ban đêm
- [x] Tự đồng bộ tidien → extension (comment + draft, alarm ~10p) — v1.0.57
- [x] Sync tidien thông minh (incremental, throttle, status check) — v1.0.58
- [x] Sync bài theo ID per user (`group_post_client_syncs`, `/posts/pull`) — v1.0.59 (đổi v1.0.60: known_ids từ client)
- [x] Sync client-driven `known_post_ids` — thay bằng device_id v1.0.61
- [x] Sync `device_id` + count (scale 10k bài, không gửi list ID) — v1.0.61
- [x] Chuyển Cá nhân / Fanpage (profile switcher header)
- [x] Nhóm theo từng bài + tab Nhóm + bộ custom + auto-sync FB
- [x] AI provider text/image trong Cài đặt extension (giống fanpage) + API proxy `/ai/*`
- [x] Tab Tạo bài: Nhập tay mặc định, chọn nhóm inline trên card bài
- [x] Tab **Provider** riêng + AI viết bài từ chủ đề
- [x] **Skill local** import JSON — không phụ thuộc skill website
- [x] Cấu hình lưu ảnh PNG vào folder local (Downloads/subfolder)
- [x] Metadata nhóm (công khai/đóng/kín + duyệt đăng) + filter tab Nhóm FB (v1.0.17)
- [x] Học duyệt đăng từ kết quả post + GraphQL About enrich (v1.0.18)
- [x] Lọc vai trò + mời bạn bè vào nhóm (Classic) (v1.0.19)
- [x] Cổ điển: tab FB active + retry composer + prepare scroll (v1.0.69)
- [x] Sửa bài giữ ảnh/video khi không đổi media (v1.0.69)
- [x] Đổi Nhanh/Cổ điển zero render — chỉ lưu preference (v1.0.87)
- [x] Fix panel trắng khi đổi mode — chặn scroll radio ẩn (v1.0.88)
- [x] Nhanh/Cổ điển: bỏ hết listener change — chỉ lưu khi Thêm/Đăng (v1.0.89)
- [x] Fix mất ảnh/format nháp + sync nhóm 5p (v1.0.90)
- [x] Giữ format Quill (delta) khi lưu/Sửa bài (v1.0.91)
- [x] Ảnh queue lưu IndexedDB — không mất khi Lưu/Sửa (v1.0.81)
- [x] Một vùng scroll (không body + content chồng) (v1.0.80)
- [x] Bài mới vs sửa: Thêm danh sách / Cập nhật (v1.0.79)
- [x] Tab Tạo bài: footer không chồng danh sách bài (v1.0.78)
- [x] UX soạn bài: Lưu sửa → form trống + nút + Bài mới (v1.0.77)
- [x] Cổ điển mặc định như GPP popup (v1.0.76)
- [x] Sửa bài giữ ảnh — media backup khi Lưu (v1.0.76)
- [x] Cổ điển chỉ tab FB cửa sổ thường — không ẩn danh Chrome (v1.0.70)
- [x] Cổ điển bỏ popup FB「Bài viết ẩn danh」— chỉ composer công khai (v1.0.71)
- [x] Nhanh: story_create rỗng → Chờ duyệt, không fail đỏ (v1.0.74)
- [x] Panel một tab + Cổ điển không double/emoji + Dừng (v1.0.106)
- [x] Cổ điển giữ emoji/đậm + scroll composer nhẹ (v1.0.107)
- [x] Import Excel giữ emoji/icon (cell.w + PUA normalize) + bulk xóa/trạng thái queue (v1.0.122)
- [x] Card queue: nút Đăng từng bài + toggle Tự xuất ảnh (v1.0.123)
- [x] Tab Nhóm overflow + nút đóng header gọn (v1.0.124)
- [x] Cổ điển hybrid paste/gõ theo dòng (v1.0.108)
- [x] Comment mẫu chéo team + auto spin (v1.0.110)
- [x] Nhanh: thiếu post_id nhưng có thể đã gửi → chờ duyệt, không fail cứng (v1.0.72)
- [x] Sửa bài giữ media — snapshot + không xóa form sau Lưu (v1.0.72)

## Remaining (optional polish)

- [ ] IndexedDB media queue (tránh base64 lớn trong `chrome.storage`, như GPP)
- [ ] E2E tests (Playwright)
- [ ] Swagger/OpenAPI docs
- [ ] content_templates CRUD
- [ ] Encrypt API keys at rest
- [ ] VPS deploy scripts + Nginx config in repo
- [ ] Cập nhật PRD §4.2 token management theo dual-token + Composio

## Tài liệu

- Token & Composio: [`docs/TOKENS_AND_COMPOSIO.md`](docs/TOKENS_AND_COMPOSIO.md)
- Deploy: [`DEPLOY.md`](DEPLOY.md)
