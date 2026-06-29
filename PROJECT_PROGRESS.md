# AutoPost Project Progress

> Cập nhật: 2026-06-27

## ✅ Đã hoàn thành (mới)

### GroupFlow v1.0.138 — Composer countdown + tidien push rõ
**2026-06-27** — Đăng không im lặng (countdown composer); **Đồng bộ ngay** đẩy bài đã đăng lên tidien + toast giải thích pull vs push.

### GroupFlow v1.0.137 — Chuyển nhóm: chờ composer + retry
**2026-06-27** — Nhóm 2+ trong cùng batch: chờ 6.5s, ép URL feed, prepare retry 2 lần; content retry mở composer.

### GroupFlow v1.0.136 — Nhật ký engine (Log)
**2026-06-27** — Tab Log → **Nhật ký**: lưu ~400 dòng (mở nhóm, composer, lỗi FB…); overlay Live Activity chi tiết; tự mở Nhật ký khi lỗi.

### GroupFlow v1.0.135 — Fix đăng treo composer (Hybrid)
**2026-06-27** — Bài chữ thuần + Hybrid: paste một lần thay vì gõ từng ký tự; kiểm tra ô soạn có chữ trước bấm Đăng.

### GroupFlow v1.0.134 — Cài đặt: layout shell + menu con
**2026-06-27** — Tab Cài đặt: **1 pane/mục** (Đăng bài → Ảnh → AI → Đồng bộ → Nâng cao); **Lưu cài đặt** cố định đáy panel; tab extension (Tạo bài, Nhóm, …) luôn hiện; nút ← quay Tạo bài.

### GroupFlow v1.0.129 — Cài đặt UI gọn, có nav
**2026-06-27** — Tab Cài đặt chia 5 card + thanh nav; mục Nâng cao gập. *(v1.0.134 thay sticky scroll bằng shell footer.)*

### GroupFlow v1.0.128 — Cài đặt nghỉ dài (random phút)
**2026-06-27** — Cài đặt: sau N nhóm (1 = mỗi nhóm), phút nghỉ random min–max; đăng ngay + lịch dùng chung; overlay đếm ngược.

### GroupFlow v1.0.123 — Đăng từng bài + toggle xuất ảnh
**2026-06-27** — Nút **Đăng** trên mỗi card queue; bỏ tick **Tự xuất ảnh** → đăng chữ không gọi API; lịch hẹn vẫn auto chạy.

### GroupFlow v1.0.122 — Excel emoji + bulk queue
**2026-06-27** — Import Excel đọc ô hiển thị (`cell.w`) và chuẩn hóa emoji Wingdings/PUA; danh sách bài có xóa/đổi trạng thái hàng loạt.

### GroupFlow v1.0.121 — Cổ điển không treo sau paste
**2026-06-26** — Mở dialog composer đầy đủ, nudge Lexical bật nút Đăng, re-paste khi chuyển editor; overlay báo「chờ nút Đăng」.

### GroupFlow v1.0.115 — UI gọn: 1 nút Đăng, cấu hình chỉ ở Cài đặt
**2026-06-26** — Bỏ Nâng cao/chế độ/giãn cách trên form đăng; một nút Đăng thanh dưới.

### GroupFlow v1.0.114 — Lịch ở thanh queue, fix crash cập nhật
**2026-06-26** — Ngày/giờ batch ở footer; lịch riêng chỉ khi Sửa bài; fix null `manualImageDate`.

### GroupFlow v1.0.113 — Fix lên lịch đăng bài không chạy
**2026-06-26** — Strip media khỏi alarm payload (tránh quota storage); refresh queue lúc chạy; retry miss khi mở Chrome; không đăng trùng.

### GroupFlow v1.0.106 — Panel một tab, Cổ điển không double, Dừng hoạt động
**2026-06-26** — Panel chỉ tab đã mở; gõ chữ một lần giữ emoji; nút Dừng hủy đăng.

### GroupFlow v1.0.104 — Một tab FB cho cả batch đăng
**2026-06-26** — Ghim tab; 10 bài không mở 10 tab.

### GroupFlow v1.0.103 — Markdown/emoji Cổ điển + scroll composer
**2026-06-26** — Không còn `**` trên FB; gõ chữ sau ảnh; auto-scroll nhóm.

### GroupFlow v1.0.102 — Panel tự hiện lại sau đăng Cổ điển
**2026-06-26** — FB reload tab làm mất iframe panel; session + auto GF_PANEL_OPEN.

### GroupFlow v1.0.101 — Cổ điển ảnh + format + xác nhận đăng
**2026-06-26** — Ảnh trước text; HTML paste; composer đóng không báo lỗi đỏ.

### GroupFlow v1.0.100 — Fix service worker crash
**2026-06-26** — `Identifier 'PF' has already been declared` trong `fbPostBg.buildComposeVariables` — extension không load được.

### GroupFlow v1.0.99 — Luồng Nhanh→Cổ điển + session nhóm
**2026-06-26** — `postGroupItem` gom fallback; bỏ `switchActor` DOM; cookie Page; tìm composer theo text.

### GroupFlow v1.0.98 — Nhanh căn GPP (doc_id + GraphQL)
**2026-06-26** — Lỗi cốt lõi: dùng nhầm doc_id link-preview; thiếu Comet trên mutation.

### GroupFlow v1.0.97 — Tìm composer nhóm FB
**2026-06-26** — Quét main + chờ load; redirect khỏi About/Members.

### GroupFlow v1.0.96 — Gõ chữ Cổ điển giống người
**2026-06-26** — `typeHumanLike`: delay ngẫu nhiên từng ký tự, không paste cả đoạn.

### GroupFlow v1.0.95 — Cổ điển không mở Share cá nhân
**2026-06-26** — Fix nhầm dialog「Chia sẻ」feed (Bảng feed/Bạn bè) thay vì composer nhóm.

### GroupFlow v1.0.94 — Comet upload + Cổ điển DOM
**2026-06-26** — Token `__dyn`/`__csr` cho upload Nhanh; Cổ điển không lạc sang trang cá nhân sau đổi profile.

### GroupFlow v1.0.93 — Cổ điển + format queue
**2026-06-26** — Media bridge cho DOM post; giữ delta khi sync queue; xuống dòng Cổ điển.

### GroupFlow v1.0.92 — Fix upload ảnh Nhanh
**2026-06-26** — Upload Comet khớp GPP; lỗi chi tiết thay vì chỉ「Upload ảnh thất bại」.

### GroupFlow v1.0.91 — Giữ format Quill
**2026-06-26** — Lưu `variationDeltas` (B/I, list, xuống dòng) trong queue + nháp; đăng FB vẫn dùng plain `noi_dung`.

### GroupFlow v1.0.90 — Fix mất ảnh + nháp đầy đủ
**2026-06-26** — Bug `persistAll` xóa nhầm IDB; hydrate queue khi mở panel; nháp giữ nhóm+ảnh; sync nhóm 5p.

### GroupFlow v1.0.89 — Mode = form thuần, không listener
**2026-06-26** — Bỏ toàn bộ hook `change` trên radio Nhanh/Cổ điển; lưu preference khi hành động đăng/thêm bài.

### GroupFlow v1.0.88 — Fix panel trắng đổi mode
**2026-06-26** — Chặn scroll nhảy khi bấm radio Nhanh/Cổ điển (sr-only) — hết màn xám chỉ còn nút footer.

### GroupFlow v1.0.87 — Đổi mode zero render
**2026-06-26** — Nhanh/Cổ điển: chỉ lưu `postMode` nền, bỏ sync DOM/re-render khi user bấm.

### GroupFlow v1.0.86 — Đổi mode không đơ panel
**2026-06-26** — Nhanh/Cổ điển: debounce lưu preference, giữ scroll iframe, không await storage.

### GroupFlow v1.0.85 — Sync nhóm không mở FB mặc định
**2026-06-26** — ↻ Làm mới = GraphQL nền (cookie SW). Chỉ Shift+↻ mới quét tab joins. Sửa regression: ↻ trước đó gọi deep sync tự mở facebook.com.

### GroupFlow v1.0.84 — Đổi Cổ điển/Nhanh nhẹ
**2026-06-26** — Chọn chế độ đăng chỉ cập nhật radio + lưu `postMode`; bỏ debounce/hydrate/re-render khi đổi mode.

### GroupFlow v1.0.76 — Cổ điển mặc định + sửa bài giữ ảnh
**2026-06-26** — `postMode` mặc định Cổ điển (align GPP popup). Sửa bài trong queue: snapshot media lúc mở Sửa, Lưu không reset form/ảnh; không ghi đè bằng media rỗng.

### GroupFlow v1.0.71 — Popup「Bài viết ẩn danh」FB
- Cổ điển ưu tiên ô「Bạn viết gì đi…」(công khai); tự Hủy popup ẩn danh của nhóm

### GroupFlow v1.0.70 — Tab FB thường, không ẩn danh Chrome
- `getFbTab` bỏ qua incognito; tạo tab mới trong cửa sổ thường; kiểm tra cookie + phiên DOM trước Cổ điển
- Manifest `incognito: not_allowed`

### GroupFlow v1.0.69 — Cổ điển composer + giữ ảnh khi sửa
- Tab FB **active** khi đăng Cổ điển (composer không render trên tab nền); retry mở composer; `GF_PREPARE_CLASSIC_POST`
- Lưu bài sau Sửa **không xóa** ảnh/video nếu user không đổi media

### GroupFlow v1.0.68 — UI compose GPP
- Bảo mật pills, 2 card chiến lược, comment chip, footer Preview/Lịch/Đăng ngay

### GroupFlow v1.0.61 — device_id sync (scale)
- Không gửi nghìn ID; server sổ theo thiết bị + reconcile khi local trống/thiếu

### GroupFlow v1.0.60 — Sync theo ID local client
- Extension gửi `known_*_ids`; server trả phần thiếu; xóa storage / máy mới sync lại full

### GroupFlow v1.0.59 — Sync bài theo ID (server sổ cái)
- `group_post_client_syncs`: A/B mỗi người biết còn bao nhiêu bài chưa tải; không pull lại 100 bài

### GroupFlow v1.0.58 — Sync tidien thông minh
- Không tải full mỗi lần mở panel; `GET /sync/status` + incremental comment + draft batch 5; throttle 90s

### GroupFlow v1.0.55 — Nhanh không tự mở FB khi lỗi
- Mặc định giống GPP: lỗi Nhanh báo thẳng trong Lịch sử; fallback Cổ điển chỉ khi bật trong Cài đặt

### GroupFlow v1.0.54 — Load nhóm lite như GPP (1 GraphQL, không đứng máy)
- Tách lite/quick/deep; panel không await sync nặng

### GroupFlow v1.0.53 — Sync nhóm nhẹ như GPP
- Mở panel: cache + GraphQL nhẹ; không tự deep quét FB; ↻ = quét đủ

### GroupFlow v1.0.51 — Phản hồi sau đăng + đánh dấu bài
- Toast, nhãn ✓ Đã đăng trên queue, lịch sử Log có link

### GroupFlow v1.0.50 — Log/Lịch sử hiển thị sau đăng
- Tự mở sub-tab Lịch sử + badge; refresh realtime khi ghi history

### GroupFlow v1.0.49 — Lịch sử đăng có link FB
- Mỗi bài OK hiện nút「Mở bài trên FB」; chờ duyệt → link nhóm; tự chuyển sub-tab Lịch sử khi đăng xong

### GroupFlow v1.0.47 — Bước 3 automation theo từng bài (GPP)
- Tạm dừng/bảo vệ, cấp bảo mật, chiến lược đăng lưu trên mỗi bài trong queue

### GroupFlow v1.0.46 — Nhiều ảnh + UI composer GPP
- Thêm 1–10 ảnh (multiple, drag-drop); đăng Fast/Classic upload từng ảnh

### GroupFlow v1.0.45 — Port UI GPP (dropdown nhóm + overlay đăng)
- Chọn nhóm: dropdown như GPP `options-container`; đăng: full overlay `LoadingDiv` / active-run-dashboard

### GroupFlow v1.0.44 — Đăng ngay chuyển tab Log (như GPP)
- Bấm Đăng ngay: đóng modal chọn nhóm, chuyển tab Log hiện progress; sửa UI chồng form + list nhóm

### GroupFlow v1.0.38 — Fix đăng nhóm Classic + hiện lỗi rõ
- Navigate tab FB từ background; composer DOM giống GPP; lịch sử đăng hiện message lỗi cụ thể

### GroupFlow v1.0.37 — Panel nổi trên trang (như GroupPostingPro)
- Bỏ tab pinned: iframe `gfPanelShell.js` trên FB/tidien.xyz; icon extension toggle panel; chuyển tab quay lại vẫn giữ composer

### GroupFlow v1.0.27 — Auto-sync khi mở panel
- Quick sync ngay khi mở; deep scroll chạy nền; không còn 0 nhóm do timeout; Ctrl+↻ = nhanh, ↻ = đầy đủ

### GroupFlow v1.0.26 — Đủ 32 nhóm như GroupPostingPro
- Merge session GraphQL + deep scroll tab `/groups/joins`; không còn kẹt 23 nhóm; ↻ chạy full sync + enrich admin/privacy

### GroupFlow v1.0.18 — Học metadata nhóm từ đăng + GraphQL About
- Sau đăng: lưu duyệt/không duyệt (`groupMetaStore.js`); enrich privacy qua About GraphQL + HTML; bắt doc_id khi user mở trang nhóm FB

### GroupFlow v1.0.19 — Lọc vai trò + mời bạn bè
- Filter nhóm theo vai trò (Admin/Member) + trạng thái mời bạn bè; công cụ mời bạn bè vào nhóm chạy Classic DOM trên tab FB

### GroupFlow v1.0.17 — Phân loại & lọc nhóm
- Parse `privacy` + `post_approval` từ GraphQL, HTML joins, fetch trang nhóm; filter Công khai/Đóng/Kín + Có duyệt/Không duyệt trên tab Nhóm

### GroupFlow v1.0.12 — Skill local
- Skill lưu trên extension (`localSkills.js`), import/export JSON; AI viết gửi prompt trực tiếp — không dùng bảng `skills` website

### GroupFlow v1.0.11 — Provider tab + AI viết bài + lưu ảnh local
- Tab **Provider** riêng; **AI viết** từ chủ đề (skill + proxy `/api/group-posts/ai/generate`)
- Cài đặt lưu PNG vào `Downloads/{subfolder}` khi generate (thủ công + tự động)
- Doc [`docs/GROUPFLOW.md`](docs/GROUPFLOW.md)

### GroupFlow — Chrome extension FB Group
- Extension `GroupFlow/fb-group-poster/`: đăng group, generate ảnh, comment chéo, lịch, Drive local, Radar Lead
- Backend `/api/group-posts/*` + migration `024`–`025`; doc [`docs/GROUPFLOW.md`](docs/GROUPFLOW.md)
- **Website UI đầy đủ**: shared draft team, sửa/re-pull, `group_name`, Settings API key, Dashboard

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
