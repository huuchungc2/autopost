# AutoPost Project Progress

> Cập nhật: 2026-06-26

## ✅ Đã hoàn thành (mới)

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
