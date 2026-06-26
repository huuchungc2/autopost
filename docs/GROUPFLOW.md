# GroupFlow — Chrome Extension FB Group

## Tóm tắt

**GroupFlow**: extension local đăng FB Group + **website tidien.xyz** xem/import draft + sync metadata. **Không** dùng job/cron fanpage (`posts` table).

### Mở UI (giống GroupPostingPro — v1.0.37)

| Cách | Hành vi |
|------|---------|
| Bấm **icon extension** | Panel **iframe nổi** bên phải trang đang mở (FB, tidien.xyz, localhost…) — trượt vào/ra, **không** mở tab Chrome |
| **✕ Đóng** (header) | Thu gọn panel; bấm icon lại để mở |
| Chuyển tab Chrome | Panel vẫn nằm trong tab cũ; quay lại tab đó → nội dung + nháp vẫn còn |
| Draft Nhập tay | Autosave `gfManualDraft` — restore khi mở lại panel |

File: `modules/gfPanelShell.js` (content script), `sidepanel.html` trong iframe, `background.js` → `GF_TOGGLE_PANEL`.

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
| GET | `/posts/pull` | Extension | Tải bài chưa sync về client (`group_post_client_syncs`, `?limit=`) |
| GET | `/drafts/pull` | Extension | Tải draft cá nhân + shared chưa tải (`?limit=`) |
| GET | `/sync/status` | Extension | `total_posts`, `pending_posts_sync`, `pending_drafts` |
| PATCH | `/drafts/:id` | Website | Sửa draft (pending / shared admin) |
| POST | `/drafts/:id/repull` | Website | Reset để extension tải lại |
| POST | `/login` | Extension | Đăng nhập |
| POST | `/sync` | Extension | Metadata sau đăng |
| GET | `/pending-comments` | Extension | Comment chéo (`?since=&needs_comment=1&limit=`) |
| PATCH | `/:id/commented` | Extension | Ghi đã comment |
| GET | `/ai-providers` | Extension | Danh sách text/image provider user được dùng |
| POST | `/ai/generate` | Extension | Viết bài: `topic` + `text_system_prompt` / `image_system_prompt` (skill local) → `{content, image_prompt}` |
| POST | `/ai/image` | Extension | Xuất ảnh qua **Image provider** đã chọn |
| POST | `/ai/text` | Extension | Viết lại / comment qua **Text provider** đã chọn |

Provider ảnh/text: khai báo **local trong Cài đặt** (`localProviders.js`) — gọi API trực tiếp. Website chỉ dùng khi **Tải web** / sync metadata. **9Router key** vẫn là dự phòng.

**Lưu ảnh:** Cài đặt → chọn thư mục máy (folder picker) hoặc subfolder Downloads; tuỳ chọn Save As mỗi lần.

**Nhóm:** metadata `privacy` (OPEN/CLOSED/SECRET), `post_approval` (`required`|`none`|`unknown`), `join_role` (ADMIN/MEMBER). Nguồn dữ liệu (theo độ tin cậy):
1. **Đăng thử** → `post_learned` (biết chắc duyệt/không duyệt với tài khoản hiện tại)
2. **GraphQL About** (`gfGraphqlDocIds` — tự bắt khi mở trang nhóm/about trên FB)
3. **HTML** `/groups/{id}/about` + trang chính (enrich khi ↻ Làm mới)
4. **Network capture** content script khi duyệt FB

Filter tab **Tất cả nhóm FB**. File: `groupMetaStore.js`, `groupParse.js`, `fbGroupsBg.js`.

(*Đã bỏ tính năng “Mời bạn bè vào nhóm” — dùng chức năng Facebook thủ công.*)

## DB

| Migration | Bảng |
|-----------|------|
| 024 | `group_posts`, `group_post_comments`, `extension_api_keys` |
| 025 | `group_post_drafts` |
| 026 | `group_posts.group_name`, `group_post_drafts.is_shared`, `group_post_draft_pulls` |
| 027 | `group_post_client_syncs` |
| 028 | `device_id` trên sync tables — sổ theo thiết bị extension |

### Draft chia sẻ team

- Admin import với **Chia sẻ team** → `is_shared = 1`
- Mỗi **thiết bị** extension tải 1 lần (`device_id` + `group_post_draft_pulls`)
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

- Tab **Cài đặt**: **AI Provider local** + thư mục lưu ảnh; tab **Skill**: skill local cho AI viết
- Tab **Tạo bài → AI viết**: chủ đề + skill local → `POST /ai/generate` với `text_system_prompt` / `image_system_prompt`
- Cài đặt: **lưu ảnh local** (`imageSaveLocal`, `imageSaveSubfolder` trong `chrome.storage`)
- Nút **「⬇ Tải từ website」** → `GET /drafts/pull` (thủ công; mặc định extension **tự pull** khi sync tidien bật)

**Sync (v1.0.63):** Client gửi `last_post_id` (0 nếu trống). **1 phiên** = hỏi status → lấy **lô 20** → lưu → nghỉ 0.8s → hỏi lại đến hết (không request song song). Alarm 10p mới chạy phiên tiếp.

### Hướng dẫn (tab trong extension)

- Có tab **Hướng dẫn** ngay trong popup: cài đặt nhanh, quy trình đăng bài, comment chéo, và các lỗi thường gặp.

### Nhập tay (tab Tạo bài) — v1.0.12

| Tính năng | Mô tả |
|-----------|--------|
| **Skill local** | `chrome.storage.local` — import/export JSON; tab Provider; độc lập website |
| **AI viết** | Gửi prompt skill từ extension → backend chỉ proxy AI (provider từ website) |

### Nhập tay (tab Tạo bài) — v1.0.11

| Tính năng | Mô tả |
|-----------|--------|
| **AI viết bài** | Segment **AI viết** — chủ đề + skill → `POST /ai/generate` → điền Quill + prompt ảnh |
| **Tab Provider** | Chọn text/image provider; xem danh sách; link quản lý đầy đủ trên web |

### Nhập tay (tab Tạo bài) — mặc định trước Excel (v1.0.10)

Segmented control: **Nhập tay** mở trước, Excel sau. Khi nhập tay có thể tick **nhóm đăng** ngay trên form.

### Nhập tay (tab Tạo bài) — v1.0.9

| Tính năng | Mô tả |
|-----------|--------|
| **Quill editor** | B/I, list, emoji picker |
| **Spintax** | `{a\|b\|c}` — chèn / bọc đoạn chọn |
| **Variations A–D** | Mỗi nhóm xoay biến thể khi đăng |
| **AI viết lại** | Hấp dẫn / sửa lỗi / tạo spintax — **Text provider** (hoặc 9Router dự phòng) |
| **Nền màu FB** | 8 màu — chỉ **chế độ Nhanh** + **bài text** (không ảnh/video/prompt AI); `postFormat.js` + `text_format_preset_id` |
| **First comment** | Tự comment sau khi đăng thành công (`fbCommentBg`); card bài có **Mở bài** + **▶ Bot** comment lại tay |
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

Chỉ lấy **nhóm bạn đã tham gia**. GroupPostingPro hiển thị “Extracted Groups — 32 liên kết” vì **tích lũy từ tab `/groups/joins` + scroll + network**; GraphQL session đôi khi chỉ trả ~23. GroupFlow v1.0.26 **merge cả hai nguồn** và ưu tiên joins khi thiếu.

1. **GraphQL nền (SW)** — `fetchJoinedGroupsGraphqlLite`: 1 request, không mở tab FB (mặc định khi mở panel)
2. **Quick (Ctrl+↻)** — GraphQL đủ trang + HTML joins trong SW, không cuộn tab
3. **Deep (↻)** — Tab `/groups/joins` scroll DOM khi cần đủ \(N\) nhóm
4. Mở panel: hiện **cache** ngay; cập nhật lite nền nếu trống/cũ — **không chặn UI**

| File | Việc |
|------|------|
| `modules/fbSessionBg.js` | Session + GraphQL SW |
| `modules/fbGroupsBg.js` | Danh sách nhóm joined + enrich |
| `modules/groupParse.js` | Parse HTML/GraphQL response |
| `content.js` | Deep scroll joins, `extractGroupsFromMainHtml` |
| `background.js` | `GF_SYNC_GROUPS` merge session + joins |

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
| **Cổ điển** | DOM trên tab FB: background mở đúng URL nhóm → content script mở composer, paste text (Lexical), attach ảnh, bấm Đăng — giống GPP Classic | Video, hoặc khi bật fallback trong Cài đặt |

**v1.0.38:** Classic không còn `location.href` trong content script (tránh crash khi chuyển trang). Lịch sử đăng + progress log hiện **message lỗi** cụ thể.

**v1.0.52 — Tìm nhóm:** Dropdown chọn nhóm không còn render lại ô search mỗi phím (giữ focus); lọc bỏ dấu tiếng Việt; gõ `hoi dong` khớp「Hội Đồng」; tab Nhóm dùng cùng logic.

**v1.0.51 — Phản hồi sau đăng:** Toast xanh/vàng/đỏ; bài trong queue được `postStatus: posted` + nhãn **✓ Đã đăng** + thời gian; bỏ tick chọn. Overlay vẫn báo `Đăng thành công X/Y nhóm`.

**v1.0.50 — Log/Lịch sử hiển thị đúng:** Tab Log mặc định「Sắp tới」nên dễ tưởng không có lịch sử. Sau đăng: tự chuyển「Lịch sử」, badge đếm, push `GF_ACTIVITY_REFRESH` mỗi lần ghi `activityHistory`; overlay log có link「Mở」từng nhóm.

**v1.0.49 — Lịch sử + link bài:** Tab Log →「Lịch sử」(`activityHistory` trong `chrome.storage.local`). Mỗi dòng OK có nút **Mở bài trên FB** (`permalink/{post_id}` hoặc `res.url` từ Fast); chờ duyệt → **Mở nhóm**. Sau `GF_PROGRESS` `done`, UI tự mở tab Log + sub-tab Lịch sử; `storage.onChanged` refresh danh sách khi đang đăng.

**v1.0.47 — Cài đặt automation theo từng bài:** Form tạo bài bước 3 (chu kỳ nghỉ, bảo mật, Nhanh/Cổ điển, tránh đêm, first comment) lưu vào `postQueue`; `runPostMatrix` áp dụng giãn cách + nghỉ dài theo từng bài.

**v1.0.46 — Nhiều ảnh + composer GPP:** `input[multiple]` tối đa 10 ảnh; `post.images[]`; UI `unified-composer-box` + magic blocks Media/Nền; thumbnail strip xóa từng ảnh.

**v1.0.45 — Port UI từ source GPP (`ref-group-posting/2.3.2_0`):**
- Chọn nhóm: `custom-multiselect` + `options-container` (dropdown dưới input, `position:absolute; top:100%`) — **không** bottom-sheet modal
- Đăng bài: `.LoadingDiv` → `#postingOverlay` + `active-run-dashboard` (progress ring, live log, Stop) — **không** giữ form tạo bài phía sau

**v1.0.44 — Đăng ngay (tạm):** chuyển tab Log — đã thay bằng overlay v1.0.45.

**Không** dùng Graph API developer token (paste token cá nhân). Extension dùng **session trình duyệt** đang login FB — cùng cơ chế extension Pro thương mại.

Luồng Fast (nền):
1. `fbSessionBg.resolveSession()` — fetch `/me`, parse `fb_dtsg`, `lsd`, `__rev` (cache 5 phút)
2. Upload ảnh → `upload.facebook.com` → `photo_id`
3. `ComposerStoryCreateMutation` doc_id `24010394355227871` (GPP 2.3.2)
4. Kết quả: `post_id`, `pending_approval`, hoặc rate limit → **dừng job**
5. Lỗi khác → **không** tự mở FB (mặc định giống GPP). Chỉ fallback Cổ điển khi bật **「Nhanh lỗi → Cổ điển」** trong Cài đặt.

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
2. Extension user B/C: **tự** `GET /pending-comments` (alarm + tab Comment) — incremental, không full pull mỗi lần
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
