# GroupFlow — Chrome Extension FB Group

**v1.0.142 — Fix bài đăng không tự đánh dấu đã sync tidien (2026-06-30):** `runPostMatrix` (`background.js`) gọi `pushPostToTidien()` ngay sau khi đăng thành công, rồi cố tìm entry trong `postGroupResults` để set `tidienSynced = true` — nhưng entry đó **chưa được tạo** (chỉ tạo sau đó vài dòng qua `pushPostedGroupResult()`), nên `if (entry)` luôn `false`, cờ `tidienSynced` không bao giờ lưu lại dù đã đẩy thành công lên server. Hệ quả: bài có `post_id` FB hợp lệ vẫn bị coi là "chưa sync", gây đẩy lặp lại lần "Đồng bộ" sau và khiến UI báo nhầm "không có gì mới" dù bài đã đăng đúng. Đã sửa: tính `tidienPushRes` trước, gắn `tidienSynced`/`tidienSyncedAt` thẳng vào object truyền cho `pushPostedGroupResult()` lúc tạo entry (không tìm-rồi-sửa entry chưa tồn tại nữa).

**v1.0.141 — Bug sweep (2026-06-30):** rà soát 4 nhóm module (session/đăng, group/comment, UI/composer, storage/AI/sync) bằng agent độc lập, xác minh tay từng phát hiện trước khi sửa. Đã sửa: session cache không phân biệt actor (rủi ro comment/đăng nhầm danh tính Page ↔ cá nhân — `fbSessionBg.js` giờ cache theo key actor), retry 429 trả lỗi chung chung thay vì response thật, cursor đồng bộ comment bị lùi khi bài đã comment bị xoá khỏi danh sách pending (gây gửi lại bài cũ → có thể comment trùng — thêm `tidienSyncMeta.maxSeenPostId` làm mốc không giảm), `runPostMatrix` dừng giữa chừng (rate-limit) không đánh dấu `failed` cho các bài chưa kịp đăng, thiếu `await` khi validate comment hàng loạt (`collectSelectedCommentJobs`), provider ảnh đã tắt (`is_active:false`) vẫn được dùng khi tự xuất ảnh nền, đăng nhập tidien thiếu `fb_user_id` ghi đè `fbUser` đã lưu thành `undefined`, `uploadPhoto` có thể nuốt lỗi upload thật nếu message chứa từ "Unexpected"/"JSON". Chi tiết: `TODO.md` mục tương ứng. **Known issue chưa sửa** (rủi ro thấp, cần test trên FB thật): race điều kiện đọc-sửa-ghi `chrome.storage.local` trong `groupSets.js`/`groupMetaStore.js` khi nhiều thao tác chạy đồng thời.

## Tóm tắt

**GroupFlow**: extension local đăng FB Group + **website tidien.xyz** xem/import draft + sync metadata. **Không** dùng job/cron fanpage (`posts` table).

### Mở UI (giống GroupPostingPro — v1.0.37)

| Cách | Hành vi |
|------|---------|
| Bấm **icon extension** | Panel **iframe nổi** bên phải trang đang mở (FB, tidien.xyz, localhost…) — trượt vào/ra, **không** mở tab Chrome |
| **✕ Đóng** (header) | Thu gọn panel; bấm icon lại để mở |
| Tab sở hữu panel | **Chỉ tab bấm icon extension** hiện panel (`gfPanelTabId`); tab FB khác không tự bật |
| Chuyển tab Chrome | Panel **chỉ** trên tab đã bấm icon; tab FB khác không tự hiện panel |
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
| 033–035 | `user_accounts`, `license_keys`, `user_posts` (self-serve, cho user tự đăng ký bằng license key) |
| 036 | Gộp `user_accounts` vào `users` (role mới `group_user`) — `license_keys.user_id`/`user_posts.user_account_id` giờ FK thẳng tới `users(id)`, `user_accounts` đã bị xoá. `userAuth.js`/`licenseAuth.js` query `users` (điều kiện `role='group_user'`) |
| 037 | `user_activity_log` — Log/Lịch sử (`activityHistory`) đồng bộ theo license key, đa thiết bị |

### Comment chéo qua license key (`/api/user-sync/cross-posts`) — khác `/pending-comments` ở trên

Đường dẫn **khác** với "Comment chéo team" (`/pending-comments`, `authenticateExtension`) mô tả ở dưới — đây là đường dùng cho `group_user` tự đăng ký bằng license key, gọi qua `authenticateLicenseKey` (`middleware/licenseAuth.js`), route `backend/src/routes/userSync.js`. Extension gọi trong `loadPostedPostsForComment()` (`sidepanel.js`): `fetchCrossPostsFromServer()` → `GET /api/user-sync/cross-posts` (bài của user KHÁC, `needs_comment=1`) trộn cùng `myServerItems`/`localPosts` (bài của chính mình) thành `state.comments`.

- **Bug đã sửa:** endpoint này JOIN nhầm bảng `user_accounts` — bảng đã bị xoá từ migration 036 — nên lỗi SQL 500 mọi lúc, extension nuốt lỗi (`fetchCrossPostsFromServer()` trả `[]` khi request fail) nên tab Comment âm thầm chỉ còn hiện bài của chính mình từ sau migration 036. Đổi JOIN sang `users`.
- **Filter Tất cả/Của mình:** 2 nút trong tab Comment, lọc `state.comments` theo `c._source !== 'cross'`.
- **Lên lịch lặp lại hàng ngày:** ngoài kiểu "1 lần cụ thể" cũ (alarm `gf_cmt_*`, xem mục Comment chéo team bên dưới), thêm kiểu daily — lưu `commentDailySchedules` (`chrome.storage.local`), tick mỗi phút qua alarm `gf_comment_daily` → `GF_BG.tickCommentDailySchedule()` (chạy tối đa 1 job/3 phút toàn cục, mỗi bài 1 lần/ngày trong khung giờ, giống cơ chế `tickGroupImageSchedule`). Nội dung **không** resolve spintax lúc đặt lịch — để `resolveJobComment()` random lại mỗi lần chạy thật.
- **Log đồng bộ theo license key:** `appendHistory()` gắn `id` ổn định; `pushUnsyncedActivityToServer()`/`pullActivityFromServer()` (`background.js`) chạy trong cùng chu kỳ `syncFromTidien()`, đẩy/kéo `POST|GET /api/user-sync/activity` — mỗi user chỉ thấy log của chính mình (không cross-user như Comment).

### Auth extension ↔ backend

`authenticateExtension` (`middleware/extensionAuth.js`, gate cho toàn bộ `/api/group-posts/*`) chấp nhận Bearer token theo thứ tự thử: (1) JWT đăng nhập admin/thường (`/api/group-posts/login`), (2) `extension_api_keys.api_key` (tidienApiKey/tidienToken lưu trong extension), (3) `license_keys.key_value` (user tự đăng ký, kích hoạt bằng license key trong overlay activation) — cả 3 đều resolve về cùng 1 `users.id` sau khi gộp `user_accounts`. Extension: `tidienAuth.authHeader()` fallback `tidienApiKey || tidienToken || licenseKey` nên user chỉ có license key vẫn gọi được `/drafts/pull`, `/sync`, `/pending-comments`… mà không cần đăng nhập email/password riêng.

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

**v1.0.140:** Fix crash scrollIntoView; đóng dialog khi đổi nhóm; editor dialog FB.

**v1.0.139:** Dialog composer mở → chèn chữ ngay.

**v1.0.138:** Countdown composer; tidien push/pull rõ.

**v1.0.137:** Chuyển nhóm 2+: chờ composer lâu hơn, retry feed.

**v1.0.136:** Tab **Log → Nhật ký** — engine log 400 dòng (bước + lỗi).

**v1.0.135:** Fix đăng treo — Hybrid/chữ thuần paste nhanh; verify trước bấm Đăng.

**v1.0.134:** Cài đặt — pane từng mục, Lưu cố định đáy, tab chính luôn hiện.

**v1.0.133:** **Đồng bộ ngay** tidien; nghỉ 1 nhóm → random phút; lịch tuần tự.

**v1.0.132:** Cài đặt — menu con sticky + ← quay tab; countdown đăng mỗi giây.

**v1.0.131:** Hybrid — paste/gõ theo đoạn; bỏ paste cả bài khi có emoji.

**v1.0.130:** **Chọn nhóm** trên card — chip bộ custom gán nhanh.

**v1.0.129:** Tab Cài đặt — nav nhanh 5 mục, card tách rõ (Đăng bài · AI · Ảnh & comment · Đồng bộ · Nâng cao).

**v1.0.128:** Cài đặt **Nghỉ dài** — sau N nhóm (1 = mỗi nhóm), phút random min–max; đăng lịch dùng chung.

**v1.0.126:** Chỉ **Cổ điển** (bỏ Nhanh). Cài đặt → **Paste cả bài** / **Hybrid**. Tab Nhóm: chip bộ gán nhanh.

**v1.0.124:** Tab Nhóm — sửa list bài tràn chồng UI; nút đóng panel **✕** góc phải trên (icon gọn).

**v1.0.123:** Mỗi card queue có nút **Đăng** (đăng ngay 1 bài); toggle **Tự xuất ảnh** trên card — bỏ tick → đăng text, không gọi API. Có lịch → extension vẫn tự chạy đúng giờ.

**v1.0.122:** Import Excel đọc `cell.w` + `importTextNormalize` (emoji Wingdings → Unicode, giống website). Danh sách bài: tick nhiều → **Xóa đã chọn** / **Đổi trạng thái** (Chờ đăng, Đã đăng, Chờ duyệt…).

**v1.0.117:** Chỉnh giờ thanh dưới → **tự hẹn alarm** + toast xác nhận; miss ≤1 phút watchdog chạy bù.

**v1.0.116:** Tag **Đăng: …** trên card bấm được → chọn bài + focus thanh giờ dưới; đổi ngày/giờ thanh dưới → lưu vào bài đã tick ngay.

**v1.0.115 — UI gọn:** Chế độ đăng / giãn cách / tránh đêm chỉ ở tab **Cài đặt**. Tab Tạo bài: soạn nội dung + **Thêm danh sách**; **một nút Đăng** ở thanh dưới (bài đang soạn hoặc tick queue). Lịch: ngày/giờ thanh dưới + **Lên lịch**.

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
| **Chọn nhóm / bài** | Mỗi bài `groupIds[]` — **Chọn nhóm** trên card: chip **bộ custom** gán nhanh + tick từng nhóm; tab **Nhóm** cho batch |

File: `modules/composer.js`, `sidepanel.html`, `background.js` (`maybeFirstComment`).

### Nhập tay — lịch & media (trước v1.0.9)

### Lịch đăng + xuất ảnh (giống fanpage website)

| Tình huống | Hành vi |
|------------|---------|
| Bài **đã có** ảnh/video | Đến `ngay_dang`/`gio_dang` → đăng thẳng vào `groupIds` |
| Bài **chưa có** media + `autoGenerateImage` + `prompt_anh` | **Đăng ngay** hoặc đến giờ lịch → `ensurePostMedia` rồi đăng (mặc định, giống website) |
| Có **`anh_*` từ Excel** (tùy chọn) | Xuất ảnh sớm hơn giờ đăng — chỉ import Excel, không còn form nhập tay |
| **Quét đêm** (Settings) | `gf_image_schedule` — xuất ảnh hàng loạt ban đêm (tùy chọn) |

Luồng lên lịch: tick bài → chọn **ngày/giờ ở thanh dưới** → **Lên lịch** (cùng giờ cho mọi bài đã tick). Giờ riêng từng bài: **Sửa** → ô lịch trên form. **Dàn**: nhiều bài cách nhau X phút.

**Alarm (v1.0.113):** Sidepanel gửi `GF_SCHEDULE_ALARM` — payload **không** chứa base64 (media lấy từ queue/IndexedDB lúc chạy). Background lưu `alarm_${name}` rồi `chrome.alarms.create`. Đến giờ: `runScheduledJob` → `refreshScheduledPostPayload` → `runPostMatrix`. Thành công → xóa khỏi `activityUpcoming`. Lỗi / miss → `gf_retry_missed` (5 phút, Settings `retryMissed`) thử lại.

### Nhật ký engine — debug lỗi đăng (v1.0.136)

| Tab Log | Nội dung |
|---------|----------|
| **Sắp tới** | Lịch chờ (alarm) |
| **Lịch sử** | Kết quả từng nhóm (OK / Lỗi + link bài) |
| **Nhật ký** | Chi tiết từng bước engine (~400 dòng, `engineLog` trong storage) |

Ghi khi: bắt đầu job, mở nhóm FB, mở composer, chèn chữ, bấm Đăng, **đẩy tidien**, timeout, lỗi content script. Nguồn: `engine` (background), `content` (tab FB). Khi lỗi → tự chuyển sub-tab **Nhật ký**; overlay **Live Activity** cũng ghi dòng thời gian.

**Báo lỗi:** chụp tab **Log → Nhật ký** (hoặc **Lịch sử** nếu chỉ cần kết quả).

| File | Việc |
|------|------|
| `background.js` | `appendEngineLog`, `logProgress` (hook `GF_PROGRESS`) |
| `content.js` | `gfProgress` → `GF_PROGRESS`; lỗi `GF_POST` push `phase: error` |
| `sidepanel.js` | Tab Nhật ký, overlay log, `GF_APPEND_ENGINE_LOG` |

| File | Việc |
|------|------|
| `modules/postMedia.js` | `needsImageGeneration`, `ensurePostMedia`, proxy `/ai/image` |
| `modules/aiApi.js` | Gọi `/ai-providers`, `/ai/image`, `/ai/text` từ popup |
| `backend/.../groupPostAiService.js` | Proxy AI dùng `ai_providers` + RBAC |
| `background.js` | `runScheduledJob`, `refreshScheduledPostPayload`, alarm `gf_job_*` / `gf_retry_missed` |
| `sidepanel.js` | `schedulePost`, `gfScheduleAlarm`, `buildSchedulePostPayload` |
| `modules/scheduler.js` | `parseScheduleDate` (HH:mm / HH:mm:ss) |

### Chuyển Cá nhân / Fanpage

Header sidepanel: bấm **profile pill** → chọn tài khoản hoặc fanpage quản lý.

| Thành phần | Việc |
|------------|------|
| `modules/fbActor.js` | Đọc `c_user` / `i_user`, parse danh sách Page, `POST /profile/switch/` |
| `sidepanel` | Dropdown chọn actor, lưu `activeActorId` |
| `fbGraphApi` | `av` + `actor_id` = page khi đang acting as page; `__user` = `c_user` |

- **Cá nhân** ở đây = đăng **với tài khoản cá nhân vào các nhóm đã chọn**, không phải đăng lên **bảng feed / timeline trang cá nhân**. GroupFlow **chưa hỗ trợ** đăng lên timeline; code cố tình tránh dialog「Chia sẻ」feed cá nhân (`content.js` → `isPersonalShareDialog`).
- Extension tự inject lại content script nếu tab FB cũ (bridge version). F5 facebook.com nếu profile/switch vẫn lỗi.

### Nghỉ dài giữa nhóm (Cài đặt)

| Key storage | UI | Hành vi |
|-------------|-----|---------|
| `pauseEveryGroups` | Sau mỗi N nhóm | `1` = nghỉ thêm sau **mỗi** nhóm; mặc định `5` |
| `pauseMinutesMin` / `pauseMinutesMax` | Phút nghỉ (random) | Mỗi lần nghỉ chọn ngẫu nhiên trong khoảng min–max |

- **Giãn cách** (Nhanh / Cân bằng / An toàn) vẫn chờ ngắn giữa từng nhóm; **Nghỉ dài** là thêm sau đủ N nhóm.
- Áp **cả đăng ngay và đăng theo lịch** — `runPostMatrix` đọc settings global từ storage; overlay hiện `done/total` + đếm ngược nghỉ.
- File: `background.js` (`resolvePostAutomation`, `waitAfterPostAttempt`, `pauseDelayMs`), `sidepanel.js` (form Cài đặt), `modules/storage.js`.

### Extract danh sách group

Chỉ lấy **nhóm bạn đã tham gia**. GroupPostingPro hiển thị “Extracted Groups — 32 liên kết” vì **tích lũy từ tab `/groups/joins` + scroll + network**; GraphQL session đôi khi chỉ trả ~23. GroupFlow v1.0.26 **merge cả hai nguồn** và ưu tiên joins khi thiếu.

1. **GraphQL nền (SW)** — `fetchJoinedGroupsGraphqlLite` / `fetchJoinedGroupsQuick`: cookie Chrome, **không mở tab FB** (mặc định ↻ Làm mới)
2. **Deep (Shift+↻)** — Chỉ khi GraphQL thiếu: tab `/groups/joins` scroll DOM để đủ \(N\) nhóm
3. Mở panel: hiện **cache** ngay; cập nhật lite nền nếu trống/cũ — **không chặn UI**

**v1.0.85:** Trước đó ↻ mặc định gọi deep sync (mở FB) — đã đảo lại: ↻ = GraphQL nền; Shift+↻ = quét joins.

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

**Lưu ý Cổ điển:** tab Facebook **cửa sổ Chrome thường** (đã login). Một số nhóm có **2 cách đăng**: bài **công khai** (ô「Bạn viết gì đi…」) và **ẩn danh FB** (popup「Bài viết ẩn danh」) — extension v1.0.71+ **chỉ đăng công khai**, tự bấm Hủy popup ẩn danh nếu FB mở nhầm.

**v1.0.121 — Cổ điển sau paste:** Không trả inline feed sớm (paste xong im vì thiếu nút Đăng) — click mở dialog, `finalizeComposerForSubmit` nudge Lexical, re-paste nếu đổi editor; overlay hiện「chờ nút Đăng sáng」.

**v1.0.120 — Xuống dòng composer:** Export plain từ Quill (`extractPlainFromEditorDom`) — mỗi `<p>` = một `\n`, không chèn dòng trống thừa giữa các dòng liền nhau (copy ra FB/Zalo giữ đúng khoảng cách gốc).

**v1.0.119 — Emoji copy composer:** FB/Zalo paste emoji dạng `<img alt="✅">` → chuẩn hóa Unicode trong Quill; copy handler xuất plain đủ emoji.

**v1.0.111 — Footer đăng:** Tab Tạo bài — **Đăng bài này** (bài đang soạn) + **một** bar cuối panel **Đăng X bài** (queue đã tick); bỏ footer queue trùng giữa trang.

**v1.0.110 — Comment mẫu:** Settings → textarea mẫu spintax (`{a|b|c}`, mỗi dòng một mẫu). Tab Comment: ô trống → random dòng + spin khi Chạy; nút **Điền mẫu vào ô trống**. Link bài FB: `/groups/{id}/posts/{post_id}/`.

**v1.0.109 — Hybrid rule đơn giản:** paste nếu dòng có emoji ở **bất kỳ đâu** hoặc `**đậm**`; còn lại gõ. Emoji cuối dòng (`Rất hay ❤️`) cũng paste.

**v1.0.108 — Hybrid paste/gõ:** `splitHybridSegments` — dòng bắt đầu emoji hoặc có `**đậm**` → **paste** khối; đoạn narrative thuần → **gõ** (`typeHumanLike`). Bài ZaloPilot kiểu 📌 hook + đoạn chữ + ✅ bullet + CTA: hook/bullet paste, story gõ. Bài chỉ emoji hoặc chỉ chữ: không hybrid (paste một lần hoặc gõ cả bài).

**v1.0.107 — Emoji + scroll composer:** Cổ điển ưu tiên **paste HTML** một lần (giữ emoji 📦✅🌐 + `<strong>`); fallback `typeHumanLike` duyệt theo code point (không cắt surrogate). `markdownToHtml` không gỡ emoji đầu dòng làm bullet. Scroll: kiểm tra composer đã thấy → bỏ qua; tối đa kéo 120px `instant`/`nearest`; không lặp `scrollTo(0)` trong `waitForGroupComposerUi`; cache `prepareClassicPost` 20s.

**v1.0.106 — Panel một tab + Cổ điển ổn định:** `gfPanelTabId` ghim tab sở hữu panel (đóng panel tab cũ khi mở tab mới). Cổ điển: **chỉ `typeHumanLike`** — unicode bold cho `**text**`, giữ emoji; không paste HTML (tránh double nội dung). Scroll composer tối đa 2 vòng. **Dừng:** `GF_STOP` → `GF_ABORT_POST` trên tab FB + `interruptibleDelay` thoát batch.

**v1.0.105 — IndexedDB media:** `postMediaStore` retry khi DB đóng (panel reload / FB navigate); bỏ hydrate IDB lúc `gfPostingActive`.

**v1.0.104 — Một tab FB / batch:** `runPostMatrix` ghim `_postingFbTabId` — tái dùng tab có sẵn hoặc tạo **một** tab nếu chưa có; bài 2+ chỉ `tabs.update` URL nhóm, không `tabs.create`, không steal focus mỗi lần.

**v1.0.103 — Format + emoji Cổ điển:** Chuyển `**markdown**` → `<strong>` hoặc chữ đậm unicode (GPP); sau upload ảnh refocus composer rồi **gõ** (không paste thô); tự scroll feed tìm「Bạn viết gì đi…」.

**v1.0.102 — Panel không mất sau đăng:** Cổ điển reload/navigate tab FB → iframe panel bị xóa. `gfPanelShell` + SW tự `GF_PANEL_OPEN` sau load; `chrome.storage.session` nhớ `gfPanelOpen` / `gfPostingActive`.

**v1.0.101 — Cổ điển DOM (GPP):** Gắn ảnh **trước** chèn chữ. Paste `text/html` từ `variationDeltas` (bold/italic/list). Composer đóng sau Đăng → `posted_uncertain` (không fail đỏ). Tìm `Photo/video` + `input[type=file]` trong dialog.

**v1.0.99 — Luồng đăng thống nhất:** `postGroupItem`: Nhanh fail → tự `sendToFb` Cổ điển (không fallback trùng trong `runPostMatrix`). Session Nhanh: `resolveSession({ groupId })` + warmup HTML nhóm. Cổ điển: **không** `switchActor` (tránh lạc feed cá nhân); đổi Page qua cookie `i_user` trước khi mở tab. Tìm composer thêm theo text「Bạn viết gì đi…」.

**v1.0.98 — Nhanh = GPP core:** `9469644099759635` (text) / `9286110778162996` (ảnh) thay vì doc link-preview sai; `__dyn`/`__csr` trên GraphQL; Nhanh lỗi → tự Cổ điển (như GPP `failover_popup`).

**v1.0.97 — Tìm ô soạn nhóm:** Quét `role="main"`, nhiều placeholder VI; chờ composer ~32s; tự về feed nếu đang About/Members.

**v1.0.96 — Gõ chữ Cổ điển:** `typeHumanLike` — từng ký tự/đoạn ngắn, pause sau dấu câu & xuống dòng; không paste cả khối một lần.

**v1.0.95 — Cổ điển không lạc Share:** Ảnh user = dialog「Chia sẻ」+ Bảng feed/Bạn bè (sai). Chỉ click composer **trong trang nhóm**; từ chối/đóng Share cá nhân.

**v1.0.94 — Upload + Cổ điển DOM:** Token Comet cho upload ảnh Nhanh (khớp GPP). Cổ điển: `switchActor` xong **quay lại `/groups/{id}`**; chờ preview ảnh rồi mới bấm Đăng (không match「đăng nhập」).

**v1.0.93 — Cổ điển + format queue:** Ảnh lấy từ SW/IDB (`GF_GET_POST_MEDIA`), không nhét base64 vào `tabs.sendMessage`. Cổ điển chèn từng dòng (Enter) giữ xuống dòng. `mergePostsFromStorage` giữ `variationDeltas` như media.

**v1.0.92 — Nhanh upload ảnh:** Căn endpoint upload theo GPP (`waterfallxapp=comet`, đủ token Comet). Warmup nhóm trước upload. Lỗi rõ (session/ảnh trống/FB trả về).

**v1.0.91 — Format soạn bài:** Lưu Quill Delta (`variationDeltas`) khi Thêm danh sách / nháp / Sửa — khôi phục B/I, list, xuống dòng. `noi_dung` plain vẫn dùng lúc đăng FB.

**v1.0.90 — Ảnh / nháp / nhóm:** `persistAll` **không** xóa IndexedDB khi queue chỉ còn `mediaCached` (bug gây mất ảnh sau Lưu). Mở panel → hydrate ảnh từ IDB. Nháp `gfManualDraft` + IDB `__gfManualDraft__` giữ text, nhóm, prompt, ảnh. Sync nhóm nền mỗi **5 phút** (GraphQL SW).

**v1.0.89 — Nhanh/Cổ điển (đúng kiểu GPP):** Radio = state form thuần HTML. **Không** `addEventListener('change')`. `postMode` lưu khi Thêm/Đăng/Lưu cài đặt.

**v1.0.88 — Panel trắng/xám khi đổi mode:** Radio `sr-only` — CSS `position:fixed` chặn scroll nhảy (không JS).

**v1.0.85:** ↻ sync nhóm = GraphQL nền; Shift+↻ = quét joins.

**v1.0.83 — Performance UI:** Không hydrate toàn bộ queue lúc mở panel. Ảnh load lazy (IDB khi Sửa/Đăng).

**v1.0.81 — Media IndexedDB:** Ảnh/video bài queue lưu `IndexedDB` (`modules/postMediaStore.js`); `chrome.storage` chỉ metadata + cờ `mediaCached`. Sửa/Lưu hydrate từ IDB; background đăng bài hydrate trước khi post.

**v1.0.80 — Scroll:** Panel flex — header + tab cố định, **chỉ `.content` cuộn**; footer batch nằm cuối panel (không `position: fixed`). Iframe popup `scrolling=no`.

**v1.0.79 — Bài mới vs sửa:** Soạn mới → **Thêm danh sách** (push queue) hoặc **Đăng ngay**. Sửa bài trong list → **Cập nhật** / **Cập nhật & đăng** (ghi đè post cũ, không tạo bài mới).

**v1.0.78 — Layout tab Tạo bài:** Ẩn footer cố định (Dàn/Lên lịch/Đăng ngay) trên tab Tạo bài — tránh chồng danh sách queue. Batch queue chuyển xuống **dưới Danh sách bài** (inline). Nút soạn bài xếp **2 hàng** (Bài mới · Xem trước · Lịch / Queue · Đăng ngay).

**v1.0.77 — UX soạn bài sau Sửa:** Bấm **💾 Lưu** → cập nhật queue + **xóa form** (soạn bài mới ngay). **+ Bài mới** / **Hủy sửa** xóa form không lưu. Banner sửa nằm trên composer.

**v1.0.76 — Cổ điển mặc định + giữ ảnh khi sửa:** `postMode` mặc định `classic` (giống GPP popup). Sửa bài: snapshot media lúc mở Sửa (`_gfMediaBackup`), `resolvePostMediaOnSave` khôi phục nếu không đổi file.

**v1.0.74 — Nhanh / post_id:** Check **sau** khi gọi `ComposerStoryCreateMutation` (upload ảnh → GraphQL → đọc response). `story_create` rỗng/null **không lỗi** → Lịch sử **Chờ duyệt** (nhóm hương duyệt bài). Chỉ đỏ khi FB trả lỗi rõ hoặc không có `story_create`.

**v1.0.72 — Nhanh + sửa media:** Nhanh không fail cứng khi FB không trả `post_id` nhưng `story_create` có vẻ đã nhận (nhóm duyệt bài → **Chờ duyệt**). Sửa bài: snapshot media lúc mở Sửa; Lưu không reset form/xóa ảnh.

**v1.0.71 — Bỏ popup ẩn danh FB:** `openComposer` ưu tiên trigger công khai; detect + dismiss dialog「Bài viết ẩn danh」; không bấm「Tạo bài viết ẩn danh」.

**v1.0.70 — Tab thường:** chấm điểm tab (ưu tiên window đang focus, bỏ URL login); tạo tab mới chỉ trong cửa sổ thường; kiểm tra cookie `c_user` + `GF_GET_FB_USER` trước Cổ điển.

**v1.0.69 — Cổ điển + sửa bài:** Đăng Cổ điển **bật tab FB** (FB không render composer trên tab nền); retry mở composer 3 lần; `GF_PREPARE_CLASSIC_POST` scroll feed. Lưu bài **giữ ảnh** nếu không chọn media mới.

**v1.0.38:** Classic không còn `location.href` trong content script (tránh crash khi chuyển trang). Lịch sử đăng + progress log hiện **message lỗi** cụ thể.

**v1.0.52 — Tìm nhóm:** Dropdown chọn nhóm không còn render lại ô search mỗi phím (giữ focus); lọc bỏ dấu tiếng Việt; gõ `hoi dong` khớp「Hội Đồng」; tab Nhóm dùng cùng logic.

**v1.0.51 — Phản hồi sau đăng:** Toast xanh/vàng/đỏ; bài trong queue được `postStatus: posted` + nhãn **✓ Đã đăng** + thời gian; bỏ tick chọn. Overlay vẫn báo `Đăng thành công X/Y nhóm`.

**v1.0.50 — Log/Lịch sử hiển thị đúng:** Tab Log mặc định「Sắp tới」nên dễ tưởng không có lịch sử. Sau đăng: tự chuyển「Lịch sử」, badge đếm, push `GF_ACTIVITY_REFRESH` mỗi lần ghi `activityHistory`; overlay log có link「Mở」từng nhóm.

**v1.0.49 — Lịch sử + link bài:** Tab Log →「Lịch sử」(`activityHistory` trong `chrome.storage.local`). Mỗi dòng OK có nút **Mở bài trên FB** (`permalink/{post_id}` hoặc `res.url` từ Fast); chờ duyệt → **Mở nhóm**. Sau `GF_PROGRESS` `done`, UI tự mở tab Log + sub-tab Lịch sử; `storage.onChanged` refresh danh sách khi đang đăng.

**v1.0.47 — Cài đặt automation theo từng bài:** Form tạo bài bước 3 (chu kỳ nghỉ, bảo mật, Nhanh/Cổ điển, tránh đêm, first comment) lưu vào `postQueue`; `runPostMatrix` áp dụng giãn cách + nghỉ dài theo từng bài.

**v1.0.68 — UI compose GPP:** Cấp độ bảo mật + Chiến lược (2 card) + Cài đặt bình luận (chip + Add spintax) luôn hiện; footer **Preview · Lên lịch · + Queue · Đăng ngay**; Nâng cao (nghỉ/đêm/lịch) trong `<details>`.

**v1.0.67 — Sửa bài:** bấm **Sửa** trên queue → nhảy tab **Tạo bài / Viết tay**, nút **Lưu bài** (cùng form lúc tạo). Tag trên bài:「Đang sửa ↑」. Thanh「Cấu hình đăng」phản ánh `manualPostMode` (trước đó chỉ đọc Cài đặt chung).

**v1.0.66 — Đăng Nhanh (fix post_id):** Mutation group khớp GPP hơn (`composed_text`, relay provider flags, warmup `groups/{id}` trước GraphQL, Referer nhóm). Parse `post_id` từ `legacy_fbid`, từng dòng JSON, pending/spam; lỗi rõ hơn khi `story_create` rỗng.

**v1.0.65 — Sửa bài (đã thay v1.0.67):** ~~form inline trong card~~ → mở form Viết tay.

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
