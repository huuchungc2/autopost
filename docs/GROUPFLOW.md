# GroupFlow — Chrome Extension FB Group

## Tóm tắt

**GroupFlow**: extension local đăng FB Group + **website tidien.xyz** xem/import draft + sync metadata. **Không** dùng job/cron fanpage (`posts` table).

## Luồng dữ liệu

```
Website import Excel → group_post_drafts (pending)
    ↓ GET /drafts/pull
Extension queue local → generate ảnh (provider) → **Fast GraphQL** hoặc **Classic DOM** đăng group
    ↓ POST /sync
group_posts → Website /groups xem danh sách
```

## API website + extension (`/api/group-posts`)

| Method | Path | Ai gọi | Việc |
|--------|------|--------|------|
| GET | `/` | Website JWT | Danh sách bài đã đăng |
| POST | `/drafts` | Website JWT | Import draft (không vào `posts`) |
| GET | `/drafts` | Website JWT | Xem draft pending/pulled |
| DELETE | `/drafts/:id` | Website JWT | Xoá draft pending |
| GET | `/drafts/pull` | Extension | Tải draft cá nhân + shared chưa tải |
| PATCH | `/drafts/:id` | Website | Sửa draft (pending / shared admin) |
| POST | `/drafts/:id/repull` | Website | Reset để extension tải lại |
| POST | `/login` | Extension | Đăng nhập |
| POST | `/sync` | Extension | Metadata sau đăng |
| GET | `/pending-comments` | Extension | Comment chéo |
| PATCH | `/:id/commented` | Extension | Ghi đã comment |
| GET | `/ai-providers` | Extension | Danh sách text/image provider user được dùng |
| POST | `/ai/image` | Extension | Xuất ảnh qua **Image provider** đã chọn |
| POST | `/ai/text` | Extension | Viết lại / comment qua **Text provider** đã chọn |

Provider ảnh/text: extension chọn trong **Cài đặt** (giống fanpage) → gọi proxy `/api/group-posts/ai/*` (key nằm server). **9Router API key** chỉ dự phòng khi chưa chọn provider.

## DB

| Migration | Bảng |
|-----------|------|
| 024 | `group_posts`, `group_post_comments`, `extension_api_keys` |
| 025 | `group_post_drafts` |
| 026 | `group_posts.group_name`, `group_post_drafts.is_shared`, `group_post_draft_pulls` |

### Draft chia sẻ team

- Admin import với **Chia sẻ team** → `is_shared = 1`
- Mỗi user extension tải 1 lần (bảng `group_post_draft_pulls`)
- Draft cá nhân: `status` pending/pulled như cũ
- Website: sửa draft (`PATCH /drafts/:id`), re-pull (`POST /drafts/:id/repull`)

## UI website

| Route | Trang |
|-------|-------|
| `/groups` | Bài group đã sync — lọc search/ngày/user, click xem chi tiết + comment |
| `/groups/import` | Import Excel → draft (preview bảng) |
| `/groups/drafts` | Quản lý draft chờ extension (pagination, prompt ảnh, pulled_at) |
| `/settings` | **GroupFlow Extension** — API key, FB map, hướng dẫn cài |

Menu sidebar + mobile bottom nav: **Group**.

### API bổ sung (website)

| Method | Path | Việc |
|--------|------|------|
| GET | `/extension-key` | Xem/tạo key lần đầu |
| GET | `/stats` | Dashboard: tổng bài, 7 ngày, comment, draft pending |
| GET | `/:id/comments` | Lịch sử comment trên 1 bài |

Query `GET /`: `search`, `from_date`, `to_date`, `user_id` (admin).

## Extension

- Settings: URL `https://tidien.xyz`, đăng nhập tidien, chọn **Text provider** + **Image provider** (giống Sửa fanpage)
- Nút **「⬇ Tải từ website」** → `GET /drafts/pull`

### Hướng dẫn (tab trong extension)

- Có tab **Hướng dẫn** ngay trong popup: cài đặt nhanh, quy trình đăng bài, comment chéo, và các lỗi thường gặp.

### Nhập tay (tab Tạo bài) — mặc định trước Excel (v1.0.10)

Segmented control: **Nhập tay** mở trước, Excel sau. Khi nhập tay có thể tick **nhóm đăng** ngay trên form.

### Nhập tay (tab Tạo bài) — v1.0.9

| Tính năng | Mô tả |
|-----------|--------|
| **Quill editor** | B/I, list, emoji picker |
| **Spintax** | `{a\|b\|c}` — chèn / bọc đoạn chọn |
| **Variations A–D** | Mỗi nhóm xoay biến thể khi đăng |
| **AI viết lại** | Hấp dẫn / sửa lỗi / tạo spintax — **Text provider** (hoặc 9Router dự phòng) |
| **Nền màu FB** | 8 màu — chỉ **chế độ Nhanh** (`postFormat.js` + `text_format_preset_id`) |
| **First comment** | Tự comment sau khi đăng thành công (`fbCommentBg`) |
| **Campaign** | Tên chiến dịch + nút **Dàn** lên lịch nhiều bài cách nhau X phút |
| Media / prompt AI | Ảnh/video upload hoặc generate qua **Image provider** |
| **Chọn nhóm / bài** | Mỗi bài `groupIds[]` — nút **Chọn nhóm** inline trên card + tab **Nhóm** (batch) |

File: `modules/composer.js`, `sidepanel.html`, `background.js` (`maybeFirstComment`).

### Nhập tay — lịch & media (trước v1.0.9)

### Lịch đăng + xuất ảnh (giống fanpage website)

| Tình huống | Hành vi |
|------------|---------|
| Bài **đã có** ảnh/video | Đến `ngay_dang`/`gio_dang` → đăng thẳng vào `groupIds` |
| Bài **chưa có** media + `autoGenerateImage` + `prompt_anh` | Đến giờ đăng → `ensurePostMedia` (Image provider) → đăng |
| Có **lịch xuất ảnh** (`anh_*`) | Alarm `gf_img_*` xuất ảnh trước; đến giờ đăng đọc lại queue (đã có ảnh) |
| **Quét đêm** (Settings) | `gf_image_schedule` mỗi phút: trong khung giờ + interval, xuất 1 bài queue cần ảnh |

Luồng lên lịch (tab **Đăng** → **Lên lịch**): mỗi bài tick + `groupIds` + ngày/giờ đăng; nếu có `anh_*` hợp lệ → thêm job **Xuất ảnh** trong Activity.

| File | Việc |
|------|------|
| `modules/postMedia.js` | `needsImageGeneration`, `ensurePostMedia`, proxy `/ai/image` |
| `modules/aiApi.js` | Gọi `/ai-providers`, `/ai/image`, `/ai/text` từ popup |
| `backend/.../groupPostAiService.js` | Proxy AI dùng `ai_providers` + RBAC |
| `background.js` | `runImageGenerate`, `tickGroupImageSchedule`, reload queue trước đăng |
| `sidepanel.js` | `schedulePost` + UI checkbox/lịch ảnh |

### Chuyển Cá nhân / Fanpage

Header sidepanel: bấm **profile pill** → chọn tài khoản hoặc fanpage quản lý.

| Thành phần | Việc |
|------------|------|
| `modules/fbActor.js` | Đọc `c_user` / `i_user`, parse danh sách Page, `POST /profile/switch/` |
| `sidepanel` | Dropdown chọn actor, lưu `activeActorId` |
| `fbGraphApi` | `av` + `actor_id` = page khi đang acting as page; `__user` = `c_user` |

- Extension tự inject lại content script nếu tab FB cũ (bridge version). F5 facebook.com nếu profile/switch vẫn lỗi.

### Extract danh sách group

Chỉ lấy **nhóm bạn đã tham gia**. Cơ chế chính (giống Group Posting Pro):

1. **GraphQL nền** — `fbGroupsBg.js` + session chung `fbSessionBg.js`: cookie Chrome, `GroupsCometPinnedGroupsDialogQuery` + phân trang — **không mở tab FB**
2. Session: fetch `facebook.com/me`, parse `fb_dtsg`, `USER_ID`
3. Fallback: parse HTML `/groups/joins/` nếu GraphQL lỗi
4. Tab joins đang mở: đọc DOM bổ sung (không chuyển trang)

| File | Việc |
|------|------|
| `modules/fbSessionBg.js` | Session + GraphQL SW |
| `modules/fbGroupsBg.js` | Danh sách nhóm joined |
| `modules/groupParse.js` | Parse HTML/GraphQL response |

### Queue bài + nhóm (sidepanel)

| Tab | Việc |
|-----|------|
| **Tạo bài** | Import / nhập tay; mỗi bài có nút **Chọn nhóm** → sang tab Nhóm |
| **Nhóm** | Tự đồng bộ FB khi mở panel; tìm tên; tick nhiều bài + nhiều nhóm → **Gán**; **Bộ custom** = tập nhóm đặt tên (lưu `customGroupSets`) |
| **Đăng** | Mỗi bài đăng vào `post.groupIds` riêng |

Luồng gán (giống Posting Group Pro):
1. Mở tab **Nhóm** — list FB tự hiện (cache + quick sync tab FB đang mở; **↻ Làm mới** = quét đầy đủ)
2. Tick **bài** (có thể nhiều bài)
3. Gõ tên **tìm nhóm** → tick nhóm (hoặc tạo **bộ custom** rồi「Gán cho bài đã chọn」)
4. **Gán nhóm đã chọn**

| File | Việc |
|------|------|
| `modules/groupSets.js` | CRUD bộ custom |
| `background.js` | `GF_SYNC_GROUPS` quick + full extract |
| `sidepanel.js` | Tab Nhóm, batch assign |

### Chiến lược đăng bài (Settings tab)

| Chế độ | Cách hoạt động | Khi nào dùng |
|--------|----------------|--------------|
| **Nhanh** (mặc định) | GraphQL nền trong service worker (`fbPostBg.js`): session cookie + `fb_dtsg`, upload + `ComposerStoryCreateMutation` — **không mở tab FB** | Text + ảnh; nhanh, giống Group Posting Pro |
| **Cổ điển** | DOM trên tab FB: mở composer, gõ text, attach ảnh, bấm Đăng | Video, hoặc khi Fast lỗi (tự fallback) |

**Không** dùng Graph API developer token (paste token cá nhân). Extension dùng **session trình duyệt** đang login FB — cùng cơ chế extension Pro thương mại.

Luồng Fast (nền):
1. `fbSessionBg.resolveSession()` — fetch `/me`, parse `fb_dtsg`, `lsd`, `__rev` (cache 5 phút)
2. Upload ảnh → `upload.facebook.com` → `photo_id`
3. `ComposerStoryCreateMutation` doc_id `24010394355227871` (GPP 2.3.2)
4. Kết quả: `post_id`, `pending_approval`, hoặc rate limit → **dừng job**
5. Lỗi khác → fallback Classic (`content.js` + `fbGraphApi.js`)

**UI sidepanel** (2025-06): header tối + brand mark, tab pill, card shadow, file-drop zone, group avatar, empty states — `sidepanel.html/css/js`.

Cấp độ **Giãn cách** (`securityLevel`): delay ngẫu nhiên khi đăng nhiều group/bài **và** khi chạy/lên lịch nhiều comment.

| Mức | Giữa các group | Giữa các bài | Giữa các comment |
|-----|----------------|--------------|------------------|
| **Nhanh** | 1–2 phút | ~3 phút | 1.5–3 phút |
| **Cân bằng** | 3–5 phút | ~7 phút | 3–5 phút |
| **An toàn** | 7–10 phút | ~15 phút | 5–10 phút |

**Tránh ban đêm**: cảnh báo 22:00–07:00 trước khi đăng / comment.

### Comment chéo team (tab Comment)

Luồng **chỉ GroupFlow có** (GPP không có backend tidien):

1. User A đăng + `POST /sync` → `group_posts` trên website
2. Extension user B/C: `GET /pending-comments` — bài đồng đội chưa đủ comment
3. Soạn / AI generate → **▶ Chạy**
4. `fbCommentBg.commentOnPost` (nền):
   - Fetch permalink — bỏ qua nếu 404 / pending approval / bài ẩn
   - `CometUFILiveTypingBroadcastMutation` + delay theo độ dài text
   - `useCometUFICreateCommentMutation` doc_id `9550500205043457`
5. **Chạy đã chọn** — `runCommentBatch`: delay ngẫu nhiên giữa từng comment (theo Settings)
6. **Lên lịch đã chọn** — datetime bắt đầu + alarm `gf_cmt_*` giãn cách tự động; xem tab Activity
7. `PATCH /:id/commented` + Activity log
8. Lỗi GraphQL → fallback DOM (`content.js` `GF_COMMENT`) — trừ bài không comment được

| Mức giãn cách | Giữa các comment |
|---------------|------------------|
| Nhanh | 1.5–3 phút |
| Cân bằng | 3–5 phút |
| An toàn | 5–10 phút |

| File | Việc |
|------|------|
| `modules/fbCommentBg.js` | Comment GraphQL nền |
| `modules/tidienSync.js` | `fetchPendingComments`, `markCommented` |
| `sidepanel.js` | Tab Comment, AI, batch + lịch |
| `background.js` | `runComment`, `runCommentBatch`, `commentOnPostBgOrClassic`; alarm `gf_cmt_*` |
| `modules/scheduler.js` | `DELAYS.betweenComments`, `getDelays()` |

### File đăng bài

| File | Việc |
|------|------|
| `modules/fbSessionBg.js` | Session + GraphQL body từ SW |
| `modules/fbPostBg.js` | Upload ảnh + đăng group nền |
| `modules/fbCommentBg.js` | Comment group nền |
| `modules/fbGraphApi.js` | Fallback Classic / content script |
| `content.js` | `postToGroup` DOM + capture doc_id |
| `background.js` | `postGroupItem`, `runPostMatrix` |
| `sidepanel` Settings | UI chọn chế độ + security + avoidNight |

### Cài extension (dev) & xử lý lỗi

Chi tiết: [`GroupFlow/fb-group-poster/README.md`](../GroupFlow/fb-group-poster/README.md)

| Việc | Ghi chú |
|------|---------|
| Load folder | Chỉ `GroupFlow/fb-group-poster/` |
| Không để trong extension | `_ref-*`, `*.zip`, `2.3.2_0/` — Chrome chặn tên `_...` |
| Tham chiếu GPP | `GroupFlow/ref-group-posting/` (dev đọc code, không load) |
| Mở UI | Bấm icon → **popup** `sidepanel.html` (v1.0.4+, không dùng Side Panel API) |
| SW "Không hoạt động" | Bình thường khi ngủ. Bấm link SW → Console phải thấy `service worker modules loaded` |
| Nút **Lỗi** + SW không wake | v1.0.7+ sửa crash `GF_GLOBAL` trùng trong `importScripts`; Reload + Xóa tất cả lỗi cũ |
| Service worker Inactive | Bình thường MV3 khi rảnh; bấm link **service worker** để inspect |
| Sau sửa code | Reload trên `chrome://extensions` |

## File code

| Thành phần | Đường dẫn |
|------------|-----------|
| Extension | `GroupFlow/fb-group-poster/` |
| Backend routes | `backend/src/routes/groupPosts.js` |
| Service | `backend/src/services/groupPostService.js` |
| Frontend | `frontend/src/pages/GroupPosts.jsx`, `GroupDrafts.jsx`, `GroupImport.jsx` |

## Checklist deploy

- [ ] Migration 024 + 025 + **026** trên production
- [ ] Nginx `tidien.xyz` proxy `/api/group-posts/*`
- [ ] Build frontend + load extension
