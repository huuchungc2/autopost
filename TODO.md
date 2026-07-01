# AutoPost — TODO

> Cập nhật: 2026-07-01

## Gộp user_accounts vào users + fix GroupFlow license key (2026-07-01)

- [x] **Fix "Tải web" báo "Chưa đăng nhập tidien" cho tài khoản license key**: `authenticateExtension` (`extensionAuth.js`) thêm nhánh chấp nhận `license_keys.key_value` trực tiếp; `tidienAuth.authHeader()` (extension) fallback thêm `licenseKey`. GroupFlow bump `1.0.146`.
- [x] **Gộp `user_accounts`/`license_keys`/`user_posts` vào `users`** (role mới `group_user`): migration `036` + `ensureUserAccountsMergedIntoUsers()` (di trú dữ liệu qua email, repoint FK, xoá `user_accounts`). `userAuth.js`/`licenseAuth.js` đổi sang query `users`. `routes/users.js` loại trừ `group_user` khỏi danh sách quản lý nội bộ.
- [x] **Provider/skill riêng theo user tự đăng ký**: `canManageProviders`/`canManageSkills` mở cho `group_user` (chỉ tác động tài nguyên của chính họ, dùng lại `ai_providers.user_id`/`skills.created_by`). `skills.js` thêm lọc theo `created_by` khi role là `group_user` (trước đây skill dùng chung cho mọi role, khác với providers). Thêm `POST/DELETE /api/providers/:id/share` để chủ provider tự cấp quyền dùng chung cho người khác.
- [ ] **Chưa làm (cố ý, cần quyết định riêng)**: UI soạn/generate nội dung draft cho `group_user` trong `UserDashboard.jsx` — `POST/GET /api/group-posts/drafts` đã hoạt động đúng theo quyền sở hữu ngay khi có JWT hợp lệ, nhưng chưa có form nào gọi tới; nút "Tải web" sẽ hết báo lỗi nhưng trả rỗng cho tới khi có UI này.
- [ ] **Chưa làm (cố ý, phạm vi đã thống nhất với Tony là để sau)**: Google Drive/Composio hiện vẫn là cấu hình dùng chung toàn deployment (`app_settings`) — chưa tách riêng theo user. Đã xác nhận module Group hiện tại không đụng tới 2 dịch vụ này (`extensionGenerateImage` dùng `persist:false`, không lưu Drive) nên không chặn việc mở module Group cho user tự đăng ký.

## Website Blog content (2026-06-30)

- [x] `getProjectContext()` khớp DB thật (fb_pages + skill, không có bảng projects) — xem `docs/WEBSITE_BLOG.md`
- [x] `generateWebsiteBlog()` + nâng cấp generate fanpage (tỷ lệ 70/20/10, additive)
- [x] Tab "Website Blog" trong UI Tạo bài (React)
- [x] Migration `030`: `posts.platform`, `posts.post_type`, `posts.seo_meta`
- [x] Ảnh: đúng cơ chế lưu trữ hiện tại + WebP (sharp) + tên file theo slug
- [ ] **Cần Tony cung cấp**: dữ liệu kinh doanh thật (giá/USP/hotline/FAQ) — chưa có bảng lưu, hiện để placeholder `[CẦN BỔ SUNG: ...]` trong context AI
- [x] **Trang quản lý/danh sách bài blog riêng (2026-06-30)**: `WebsiteBlogPosts.jsx` (danh sách, lọc theo website) + `WebsiteBlogPostEditor.jsx` (sửa title/slug/meta/content, generate ảnh, publish, xoá), route `/website-posts`, mục mới trong sidebar "Bài Website Blog". Sửa luôn lỗ hổng: bài tạo qua import Excel trước đây không có cách nào xem lại — giờ vào thẳng danh sách này.
- [ ] Cân nhắc: guard chặn "Đăng ngay" lên Facebook cho bài `platform='website'` trong PostEditor.jsx
- [x] **Website tách thành entity độc lập (2026-06-30)**: ban đầu gắn nhầm config publish vào `fb_pages` (giả định 1 fanpage = 1 website) — Tony xác nhận website và fanpage **không phải lúc nào cũng 1-1**. Đã refactor: bảng `websites` riêng (migration `031`), trang quản lý **Website** mới trong sidebar (`Websites.jsx`/`WebsiteForm.jsx`, route `/websites`), `posts.website_id` thay cho việc mượn `page_id`. Tab Tạo bài → Website Blog giờ chọn Website, không chọn Fanpage.
- [x] **Publish bài blog lên website thật**: đã build sẵn API contract + service (2026-06-30) — `websitePublishService.js` gọi `POST {websites.publish_url}` (Bearer `websites.api_key`), nút "Publish lên website" trong Generate.jsx. Spec đầy đủ để đưa cho dev 3 website (zalopilot.vn/hopgiayre.vn/datxeveque.vn): `docs/WEBSITE_PUBLISH_API.md`.
- [ ] **Cần Tony cung cấp**: (1) dev 3 website dựng xong endpoint nhận bài theo đúng `docs/WEBSITE_PUBLISH_API.md`; (2) vào **Website → Thêm website** tạo 3 website (zalopilot.vn/hopgiayre.vn/datxeveque.vn), gán skill brand voice + provider, nhập Publish URL + API Key sau khi có endpoint. Chưa test thật với endpoint nào (chưa tồn tại) — cần 1 lượt test tay sau khi có endpoint đầu tiên.
- [ ] Cân nhắc: bảng `user_websites` để phân quyền theo từng website (hiện mọi user đăng nhập đều xem/generate/publish được mọi website đang hoạt động — chỉ riêng CRUD website mới giới hạn admin/super_admin).
- [x] **Import Excel hàng loạt cho Website Blog (2026-06-30)**: `POST /api/posts/import-website-blog` + trang `WebsiteImport.jsx` (link từ tab Website Blog) — bulk-insert bài đã viết sẵn (không gọi AI lúc import, đúng theo cách import fanpage đang hoạt động). Cột `prompt_anh` + tick "tự generate ảnh" → generate ảnh bất đồng bộ qua cron mới (`websiteImageJobService.js`, mỗi 5 phút), ảnh đặt tên theo slug + WebP giống hệt flow generate 1 bài.
- [ ] Cân nhắc: tính năng "AI tự viết N bài → Excel" trong 1 lần bấm (kiểu trang Hàng loạt `BatchGenerate.jsx` đang có cho fanpage) — hiện chưa có, người dùng phải tự nhờ AI ngoài (ChatGPT/Claude...) viết rồi dán vào Excel theo template trước khi import.

## GroupFlow extension — bug sweep v1.0.141 (2026-06-30)

- [x] Fix session cache dùng chung cho mọi actor (`fbSessionBg.js`) — comment/đăng có thể nhầm danh tính Page ↔ cá nhân khi gọi xen kẽ trong cùng cửa sổ cache 5 phút
- [x] Fix retry 429 trả lỗi chung chung thay vì response thật (`fbSessionBg.fetchWithRetry`)
- [x] Fix cursor đồng bộ comment bị lùi khi bài đã comment bị xoá khỏi `tidienPendingComments` — có thể khiến server gửi lại bài đã comment, dẫn đến comment trùng
- [x] Fix `runPostMatrix` khi bị rate-limit/dừng giữa chừng: các bài chưa kịp đăng không được đánh dấu `failed`, dễ bị coi là "chưa đăng" sai lệch
- [x] Fix 2 chỗ thiếu `await` khi gọi `collectSelectedCommentJobs` — validate trước khi chạy/lên lịch comment hàng loạt không có tác dụng
- [x] Fix provider ảnh bị tắt (`is_active: false`) vẫn được dùng khi tự xuất ảnh nền (`postMedia.resolveLocalImageProvider`)
- [x] Fix đăng nhập tidien không có `fb_user_id` ghi đè `fbUser` đã lưu trước đó thành `undefined`
- [x] Fix `uploadPhoto` có thể nuốt lỗi upload thật nếu message lỗi chứa từ "Unexpected"/"JSON"
- [ ] Known issue (chưa sửa, rủi ro thấp/cần test trên FB thật trước khi đổi): race điều kiện đọc-sửa-ghi `chrome.storage.local` trong `groupSets.js`/`groupMetaStore.js` khi nhiều thao tác chạy đồng thời

## GroupFlow extension — fix sync tidien v1.0.142 (2026-06-30)

- [x] **Fix bài đăng không tự đánh dấu `tidienSynced`**: bug do thứ tự code — `runPostMatrix` cố set cờ lên 1 entry trong `postGroupResults` trước khi entry đó được tạo (`pushPostedGroupResult` chạy sau), nên `if (entry)` luôn false. Bài đăng có `post_id` FB hợp lệ vẫn đẩy lên tidien thành công nhưng local không ghi nhận → bị đẩy lặp lần "Đồng bộ" kế tiếp, UI báo nhầm "không có gì mới" dù đã sync đúng. Đã chuyển sang gắn `tidienSynced`/`tidienSyncedAt` thẳng vào object lúc tạo entry. Xem `docs/GROUPFLOW.md`.
- [ ] Cần test thật trên FB: đăng 1 bài group, kiểm tra Log → Nhật ký có dòng "Đã đẩy bài lên tidien" ngay lúc đăng (không phải chờ "Đồng bộ" thủ công mới đẩy được), và trang `/groups` trên web AutoPost hiện bài đó ngay.

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
