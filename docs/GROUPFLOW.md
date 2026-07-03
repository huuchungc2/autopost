# GroupFlow — Chrome Extension FB Group

**v1.0.188 — Fix bug NGHIÊM TRỌNG: 1 bài bị comment lặp nhiều lần + panel sửa lịch hiện sai giờ (2026-07-04):** ngay sau khi triển khai `runFlow1BackgroundSync()` (v1.0.187, chạy nền), Tony phát hiện cùng 1 bài bị chính tài khoản mình comment 2-3 lần liên tiếp trong vài phút — kèm hiện tượng tag lịch trên card hiện 1 giờ nhưng bấm vào sửa lại ra giờ khác. Hoá ra là **2 bug độc lập**, cả 2 đều vá trong bản này:

**Bug 1 — trùng lịch, đăng lặp comment.** Root cause: `runFlow1BackgroundSync()` (background.js) dùng `bgAutoScheduledCrossIds` — 1 storage key **RIÊNG**, hoàn toàn tách biệt với `activityUpcoming` mà `autoScheduleUnscheduledComments()` (sidepanel.js, chạy khi mở tab Comment) ghi vào — nên user mở tab Comment (sidepanel lên lịch bài X) rồi sau đó chu kỳ nền chạy (không thấy bài X đã có lịch vì check sai key) → lên lịch THÊM 1 lần nữa cho đúng bài X → 2 alarm độc lập cùng nổ gần nhau, đăng 2 comment trùng lặp lên cùng 1 bài. Vá theo 3 lớp:
1. **Chặn tạo trùng lúc lên lịch**: `runFlow1BackgroundSync()` đổi sang đọc thẳng `activityUpcoming`/`dailyFixedSchedules` (đúng nguồn `loadCommentScheduleMap()` — sidepanel.js — dùng) thay vì storage key riêng.
2. **Chặn tại lúc CHẠY** (lớp phòng thủ thứ 2, độc lập): `runComment()` giờ check `commentedRecords` NGAY ĐẦU HÀM — nếu bài này đã comment thành công trước đó (kể cả bởi job khác) thì bỏ qua êm, không đăng lại lên Facebook. Cần thiết vì `chrome.alarms` không tự re-check trạng thái mới nhất trước khi nổ — alarm trùng đã lỡ lên lịch (từ trước khi vá #1) vẫn nổ bình thường nếu không có lớp chặn này.
3. **Tự dọn alarm trùng đã lỡ tồn tại**: `dedupeUpcomingCommentAlarms()` (mới, background.js) — chạy đầu mỗi `runFlow1BackgroundSync()`, gom `activityUpcoming` theo `recordId`, chỉ giữ bản đến sớm nhất, huỷ hẳn (`chrome.alarms.clear` + xoá storage) các bản trùng còn lại.

**Bug 2 — panel sửa lịch luôn hiện "bây giờ + 30 phút" thay vì giờ thật đã đặt.** Độc lập với bug 1 — không liên quan tới trùng lặp, mà do `renderComments()` (sidepanel.js) tính 1 giá trị `defaultWhen` DUY NHẤT (`defaultScheduleWhenValue()`, luôn = giờ hiện tại + 30 phút) dùng CHUNG cho ô `datetime-local` của MỌI card, kể cả card đã có lịch thật (tag hiện đúng "🕒 18:31" nhờ đọc từ `state.commentScheduleMap`) — bấm sửa thì panel vẫn tự đổ "bây giờ+30p" vào ô giờ, không hề đọc lại giờ đã lưu. Thêm `scheduleWhenInputValue(ms)` (định dạng cho input, cùng epoch với `formatScheduleWhen()` mà tag dùng) — `renderComments()` giờ ưu tiên đổ đúng giờ đã lưu (`scheduleInfo.when` nếu lịch 1 lần, hoặc hôm nay + `timeOfDay` nếu lịch lặp hàng ngày — kèm tick sẵn checkbox "Lặp lại hàng ngày") thay vì luôn dùng giá trị mặc định chung.

Đồng thời di chuyển checkbox "Chọn tất cả" tab Comment xuống **dưới** hàng filter (Người/Mẫu bình luận/Lịch/Bình luận) thay vì nằm trên — theo yêu cầu Tony, thuần HTML reorder không đổi logic.

**v1.0.187 — Định nghĩa lại 3 flow đồng bộ "thật sự cần thiết" + gộp bảng group_posts vào user_posts (2026-07-03):** theo yêu cầu Tony — thu gọn toàn bộ đồng bộ extension↔backend về đúng 3 luồng (AI/skill/provider giữ nguyên hoàn toàn local, không qua backend):

1. **Flow 1 — đồng bộ bài để đi comment** (`GET /api/user-sync/cross-posts`): chạy trong **chu kỳ nền `gf_tidien_sync`** (không cần mở tab Comment nữa — trước bản này chỉ chạy khi user tự mở/refresh tab, user nào ít mở thì cache mãi mãi = 0 dù bài vẫn tồn tại trên server, xem `runFlow1BackgroundSync()` — background.js, thay thế hẳn nhánh `posts/pull` chết cũ). Lọc `comment_count < comment_target` + `visible_after <= NOW()` + loại bài chính mình đã comment (`NOT EXISTS user_post_comments`), ưu tiên `comment_count ASC` (bài đang thiếu người) trước `posted_at`/`updated_at` — không còn cờ boolean `needs_comment` (1 người comment là khoá bài cho tất cả) mà là **đếm nhiều người khác nhau** tới khi đủ target. Bài mới có độ trễ ngẫu nhiên 5–60 phút trước khi lộ diện (`visible_after`, xem `upsertUserPost()`) — hiệu ứng "từ từ" đúng nghĩa, né dấu hiệu comment-ring. Cache lấy về (`crossPostsCache`) tự lên lịch comment (job `comment: ''` — `resolveJobComment()` sẵn có tự random mẫu lúc chạy thật), bỏ qua trong khung giờ đêm 22:00–07:00.
2. **Flow 2 — đồng bộ sau khi đăng bài** (`POST /group-posts/sync` + `POST /user-sync/posts`, cả 2 dùng chung `upsertUserPost()` — `groupPostService.js`): trước bản này 2 route ghi 2 bảng khác nhau (`group_posts` cho web `/groups`, `user_posts` cho comment chéo) cho cùng 1 sự kiện — giờ khớp theo `(user_account_id, group_id, post_id)` (post_id Facebook mới là định danh thật, không phải `post_queue_id` nội bộ máy) nên không tạo 2 dòng trùng dù 2 route đều được gọi cho cùng 1 bài.
3. **Flow 3 — đồng bộ sau khi comment xong** (`PATCH /api/user-sync/posts/:id/commented`): đổi từ `UPDATE needs_comment=0` sang **insert vào bảng join `user_post_comments`** (UNIQUE theo người, không đếm trùng) rồi tính lại `comment_count` — cho phép nhiều người khác nhau cùng comment 1 bài. PATCH fail không còn bị nuốt lỗi im lặng — xếp vào hàng đợi retry cục bộ (`pendingCommentedSync`, `queuePendingCommentedSync()`/`flushPendingCommentedSync()`), thử lại mỗi chu kỳ `gf_tidien_sync` tới khi server xác nhận OK.

**Migration 039 + 039b** — gộp `group_posts`/`group_post_comments` (hệ JWT cũ) vào `user_posts`/`user_post_comments` (hệ license-key) làm 1 nguồn sự thật duy nhất: thêm cột `fb_user_id`, `prompt_anh`, `ngay_dang`, `gio_dang`, `fb_url`, `comment_target` (mặc định 5), `comment_count`, `visible_after` vào `user_posts`; bảng mới `user_post_comments` (thay `group_post_comments`). 039 (schema, luôn chạy) tách khỏi 039b (backfill dữ liệu cũ, chỉ chạy nếu `group_posts` còn tồn tại) để không làm gãy chuỗi migration trên deployment mới tinh chưa từng có `group_posts`. **`group_posts`/`group_post_comments` KHÔNG bị xoá** (rollback thủ công nếu cần) nhưng không còn service nào đọc/ghi 2 bảng đó sau bản này — `listPublishedGroupPosts()`/`getGroupPostsStats()`/`listGroupPostComments()` (nuôi trang web `/groups`) đã chuyển hẳn sang đọc `user_posts`/`user_post_comments`, giữ nguyên response shape cho frontend.

**Dọn dead code cùng đợt**: xoá hẳn `GET /pending-comments`, `PATCH /group-posts/:id/commented`, `POST/GET /group-posts/posts/pull` (route lẫn service function `listPostsForComments`/`recordComment`/`pullPostsForExtension`) — xác nhận không extension nào còn gọi (kết quả cũ `tidienPendingComments` không có UI nào đọc lại, xem chú thích cũ trong `background.js`). `getExtensionSyncStatus()` chỉ còn lo phần draft; trả field `pending_posts_sync`/`total_posts`/`up_to_date` cứng (0/0/true) để extension bản cũ chưa cập nhật tự hiểu "hết việc" và ngưng gọi `/posts/pull`, không cần chờ user cập nhật mới hết tải rác.

**So le giờ đồng bộ (jitter, `scheduleTidienSyncAlarm()`)**: mỗi máy tự "bốc thăm" 1 độ trễ ban đầu cố định (0..chu kỳ phút, lưu `tidienSyncJitterMin`, chỉ random 1 lần) trước khi `chrome.alarms.create` — tránh 1000 máy cùng khởi động/kết nối lại 1 thời điểm (giờ hành chính, sau khi server phục hồi…) khiến alarm đồng loạt rung chuông cùng giây, dồn tải server thay vì rải đều suốt chu kỳ.

**v1.0.186 — Đồng bộ thông minh cho `my-posts`/`cross-posts`: cursor `updated_at` + merge-cache + throttle (2026-07-03):** trước bản này `GET /api/user-sync/my-posts` (dùng `since` theo `created_at`, nhưng client chưa từng gửi) và `GET /api/user-sync/cross-posts` (không hề có tham số `since`) đều bị gọi **full window mới nhất** mỗi lần (200 + 100 bài) từ ~5 điểm khác nhau trong `sidepanel.js` (mở panel, mở tab Comment, sau khi đăng bài, sau khi comment xong, bấm Làm mới) — không throttle, không cache incremental — mỗi lần user thao tác là tải lại gần như y hệt lần trước, tốn băng thông + query DB, và bài nào rớt khỏi top-100/200 (theo `posted_at`) sẽ **không bao giờ** được thấy lại kể cả khi `needs_comment` của nó đổi sau đó (vì không có cột nào đánh dấu "vừa đổi"). Migration `038` thêm `user_posts.updated_at` (`ON UPDATE CURRENT_TIMESTAMP`, tự bump khi PATCH `.../commented`) + index `(user_account_id, updated_at)`/`(updated_at)`. 2 route trên nhận thêm `?since=<updated_at cuối>` — không có `since` (cold start) trả cửa sổ mới nhất như cũ; có `since` thì trả đúng phần đã ĐỔI (mới lẫn cập nhật trạng thái) theo `updated_at ASC`. Client: `pullMyPostsFromServer()`/`fetchCrossPostsFromServer()` (`sidepanel.js`) giờ lưu cursor (`myPostsSyncMeta`/`crossPostsSyncMeta`) + merge-upsert theo `id` vào cache đã có (`mergeUserPostsById()`) thay vì ghi đè toàn bộ, cộng throttle `USER_SYNC_MIN_INTERVAL_MS = 30s` giữa 2 lần gọi mạng thật (bỏ qua khi `force: true` — nút "Làm mới" tay). `crossPostsCache` giờ được cache ra `chrome.storage.local` (trước đây sống trong biến tạm, mất giữa 2 lần gọi).

**v1.0.185 — Fix tab Comment tự lên lịch + tự comment lặp lại vô hạn (2026-07-03):** bài đồng đội (`_source: 'cross'`) và bài của mình kéo về từ thiết bị khác (`_source: 'server'`) trước bản này **không có cách nào ghi nhớ cục bộ** đã comment xong — `isCommentDone()` chỉ tin vào 2 nguồn phụ thuộc mạng: `markPostedGroupCommented()` (chỉ tìm thấy entry nếu bài nằm trong `postQueue` cục bộ — bài `server`/`cross` thì luôn no-op) và PATCH `/api/user-sync/posts/:id/commented` best-effort (`markCrossPostCommentedFromBg()`, im lặng nuốt lỗi khi fail — sai loại token/license key, mất mạng, server down…). Hễ 1 trong 2 đường không ghi nhận được thì `isCommentDone()` mãi mãi trả `false` dù đã đăng comment thành công thật lên FB — mỗi lần mở/làm mới tab Comment, `autoScheduleUnscheduledComments()` (chạy tự động mỗi lần tải tab, xem mục "Auto-lên-lịch bài chưa có lịch" bên dưới) coi bài là "chưa có lịch + chưa xong" rồi tự xếp lịch mới (+15 phút), tới giờ lại tự chạy comment lại — vòng lặp vô hạn, spam nhiều comment trùng lặp lên cùng 1 bài FB mỗi lần user comment xong rồi refresh panel. Đã thêm `commentedRecords` (`chrome.storage.local`, key `post_queue_id` → `{group_id: timestamp}`, cắt 3000 gần nhất) — ghi bởi `markCommentDoneLocal()` ngay trong `runComment()` (background.js) lúc comment lên FB vừa thành công, **trước** cả 2 lần gọi sync mạng còn lại nên không phụ thuộc chúng. `isCommentDone()` (sidepanel.js) giờ đọc nguồn này trước tiên — dùng chung cho cả 4 cách chạy comment (▶ Chạy / Chạy đã chọn / Lên lịch / auto-lên-lịch, tất cả đều đi qua `runComment()`).

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

**Comment chạy trên tab "lạ" (v1.0.172):** vì panel không tự hiện trên tab khác (dòng trên), `getFbTab()` phải ưu tiên đúng tab đã ghim (`gfPanelTabId`) khi làm bất kỳ thao tác nào cần tab Facebook thật — trước bản này chỉ ưu tiên tab ghim khi `this.running` (chỉ true lúc đăng bài), comment (`this.commentRunning`) luôn rơi xuống `pickBestFbTab()` chấm điểm lại toàn bộ tab FB đang mở, có thể chọn nhầm 1 tab khác hẳn tab đang mở panel — cảm giác "tự nhảy tab" vì panel không hiện ở tab đó để theo dõi. Đã sửa: luôn ưu tiên tab ghim cho mọi thao tác (không riêng đăng bài).

**Cổ điển comment không active hoá tab, dễ bị Chrome giảm tốc (v1.0.175):** khác đăng bài (`sendToFb()` ép `active: true` lúc mở tab nhóm lần đầu), Cổ điển comment trước đây chỉ đổi URL tab bằng `chrome.tabs.update()` không kèm `active` — tab nằm nền (user đang xem tab khác) bị Chrome giảm tốc mạnh `setTimeout` (gõ DOM/chờ composer đều dùng) → "đứng hình" tới khi user tình cờ chuyển đúng sang tab đó mới chạy tiếp. Đã thêm `active: true`; đồng thời tự lưu + restore lại tab/window đang active trước đó ngay sau khi comment xong (dù thành công hay lỗi), không kẹt user ở tab Facebook.

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
| GET | `/` | Website JWT | Danh sách bài đã đăng (đọc `user_posts`, xem mục "Định nghĩa lại 3 flow" đầu file) |
| POST | `/drafts` | Website JWT | Import draft (không vào `posts`) |
| GET | `/drafts` | Website JWT | Xem draft pending/pulled |
| DELETE | `/drafts/:id` | Website JWT | Xoá draft pending |
| GET | `/drafts/pull` | Extension | Tải draft cá nhân + shared chưa tải (`?limit=`) |
| GET | `/sync/status` | Extension | Chỉ còn phần draft (`pending_drafts`) — phần "posts" đã bỏ cùng Flow 1 (xem `/api/user-sync/cross-posts`) |
| PATCH | `/drafts/:id` | Website | Sửa draft (pending / shared admin) |
| POST | `/drafts/:id/repull` | Website | Reset để extension tải lại |
| POST | `/login` | Extension | Đăng nhập |
| POST | `/sync` | Extension | Flow 2 — metadata sau đăng, ghi `user_posts` qua `upsertUserPost()` |
| GET | `/ai-providers` | Extension | Danh sách text/image provider user được dùng |
| POST | `/ai/generate` | Extension | Viết bài: `topic` + `text_system_prompt` / `image_system_prompt` (skill local) → `{content, image_prompt}` |
| POST | `/ai/image` | Extension | Xuất ảnh qua **Image provider** đã chọn |
| POST | `/ai/text` | Extension | Viết lại / comment qua **Text provider** đã chọn |

`GET /posts/pull`, `GET /pending-comments`, `PATCH /:id/commented` đã **xoá hẳn** (v1.0.187) — hệ `group_posts`-based cũ, thay bằng Flow 1/3 qua `/api/user-sync/*` (license-key) bên dưới.

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
| 038 | `user_posts.updated_at` (`ON UPDATE CURRENT_TIMESTAMP`) + index `(user_account_id, updated_at)`/`(updated_at)` — cursor đồng bộ `my-posts`/`cross-posts`, xem mục "Đồng bộ thông minh" |
| 039 + 039b | Gộp `group_posts`/`group_post_comments` vào `user_posts`/`user_post_comments` — thêm `fb_user_id`, `prompt_anh`, `ngay_dang`, `gio_dang`, `fb_url`, `comment_target`, `comment_count`, `visible_after`; bảng mới `user_post_comments` (join, UNIQUE theo người). 039 = schema (luôn chạy), 039b = backfill dữ liệu cũ (chỉ chạy nếu `group_posts` còn tồn tại). Xem mục "Định nghĩa lại 3 flow" đầu file |

### Comment chéo qua license key (`/api/user-sync/cross-posts`)

Gọi qua `authenticateLicenseKey` (`middleware/licenseAuth.js`), route `backend/src/routes/userSync.js`. Extension gọi trong `loadPostedPostsForComment()` (`sidepanel.js`, khi mở/refresh tab Comment) **và** trong chu kỳ nền `gf_tidien_sync` (`runFlow1BackgroundSync()` — `background.js`, v1.0.187) — cả 2 nơi đọc/ghi CHUNG `crossPostsCache`/`crossPostsSyncMeta`: `GET /api/user-sync/cross-posts` (bài của user KHÁC) trộn cùng `myServerItems`/`localPosts` (bài của chính mình) thành `state.comments`.

**`comment_target`/`comment_count` thay cờ boolean `needs_comment` (v1.0.187):** bài mở cho tới khi đủ N người KHÁC NHAU comment (mặc định `comment_target = 5`, xem `upsertUserPost()`), không phải chỉ 1 người là khoá lại cho tất cả như cờ boolean cũ. Đếm qua bảng join `user_post_comments` (UNIQUE `user_post_id + commenter_user_id`), server tự loại bài mình đã comment khỏi kết quả trả về, ưu tiên `comment_count ASC` (bài đang thiếu người) trước thời gian. Field `needs_comment` vẫn được trả về (tính động `comment_count < comment_target`) để tương thích ngược, không cần code client thay đổi ngay.

**`visible_after` — độ trễ "từ từ" (v1.0.187):** bài mới có `visible_after = posted_at + random(5–60 phút)` (server tự stamp lúc `upsertUserPost()`), chỉ lộ diện trong `/cross-posts` sau mốc đó — né dấu hiệu nhiều tài khoản lạ cùng comment 1 bài ngay phút đầu (comment-ring), đồng thời đúng ý sản phẩm "mọi người từ từ thấy bài".

**Cursor `since=updated_at` + merge-cache (v1.0.186, mở rộng v1.0.187):** cả `/my-posts` lẫn `/cross-posts` nhận `?since=<updated_at cuối>` — không có thì trả cửa sổ mới nhất (cold start), có thì chỉ trả phần đã đổi kể từ đó. Client lưu cursor trong `myPostsSyncMeta`/`crossPostsSyncMeta` (`chrome.storage.local`), merge-upsert kết quả mới vào cache đã có thay vì tải/ghi đè lại từ đầu mỗi lần.

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
| `/groups` | Bài group đã sync — lọc search/ngày/user, click xem chi tiết + comment, checkbox chọn nhiều → **Xoá đã chọn** (`POST /group-posts/bulk-delete`, v1.0.187 — admin xoá được bất kỳ bài nào, user thường chỉ xoá bài của mình; xoá `user_posts` CASCADE luôn `user_post_comments`) |
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

**v1.0.126:** Chỉ **Cổ điển** (bỏ Nhanh). Cài đặt → **Paste cả bài** / **Hybrid**. Tab Nhóm: chip bộ gán nhanh. *(Đã bật lại Nhanh làm mặc định ở v1.0.161 — xem mục "Chiến lược đăng bài" bên dưới; lý do tắt lúc này không có ghi chú lại trong repo.)*

**v1.0.124:** Tab Nhóm — sửa list bài tràn chồng UI; nút đóng panel **✕** góc phải trên (icon gọn).

**v1.0.123:** Mỗi card queue có nút **Đăng** (đăng ngay 1 bài); toggle **Tự xuất ảnh** trên card — bỏ tick → đăng text, không gọi API. Có lịch → extension vẫn tự chạy đúng giờ.

**v1.0.122:** Import Excel đọc `cell.w` + `importTextNormalize` (emoji Wingdings → Unicode, giống website). Danh sách bài: tick nhiều → **Xóa đã chọn** / **Đổi trạng thái** (Chờ đăng, Đã đăng, Chờ duyệt…).

**v1.0.177 — Tải file mẫu Excel:** nút **"⬇ Tải file mẫu Excel"** trong panel Import (`GF.excel.buildTemplateWorkbook()`/`templateArrayBuffer()`, `modules/excel.js`) — xuất `.xlsx` sheet tên **Import** (đúng sheet `parseWorkbook()` ưu tiên đọc) với đúng cột `HEADER_ALIASES` cần: `noi_dung, prompt_anh, ngay_dang, gio_dang, auto_generate_image, anh_ngay_dang, anh_gio_dang` + 1 dòng ví dụ. Trước bản này không có file mẫu nào để tải dù thông báo lỗi từng nhắc tới nó.

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
| **Campaign** | Tên chiến dịch + nút **Lên lịch đã chọn** (footer) — lên lịch giãn cách (giờ bắt đầu + gap phút/giờ/ngày, tuỳ chọn lặp lại hàng ngày), xem [Lên lịch giãn cách](#lên-lịch-giãn-cách-v10165) |
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

Luồng lên lịch (v1.0.181+): tick bài (1 hay nhiều) → footer **Lên lịch đã chọn** → mở panel giãn cách (giờ bắt đầu + gap, tuỳ chọn lặp lại hàng ngày) — xem [Lên lịch giãn cách](#lên-lịch-giãn-cách-v10165); gap = 0/1 bài thì hiệu quả như "cùng 1 giờ". **Không bắt buộc** đã chọn nhóm — bài chưa có nhóm lúc tới giờ tự bị bỏ qua (báo Log), không chặn bài khác. Bấm tag lịch trên card (`+ Hẹn giờ`/`Đăng: ...`) → tick riêng bài đó + mở thẳng panel này (prefill giờ đang có). Giờ riêng từng bài lúc soạn: **Sửa** → ô lịch trên form (`#editScheduleDate`/`#editScheduleTime`, độc lập với panel này).

**Alarm (v1.0.113):** Sidepanel gửi `GF_SCHEDULE_ALARM` — payload **không** chứa base64 (media lấy từ queue/IndexedDB lúc chạy). Background lưu `alarm_${name}` rồi `chrome.alarms.create`. Đến giờ: `runScheduledJob` → `refreshScheduledPostPayload` → `runPostMatrix`. Thành công → xóa khỏi `activityUpcoming`. Lỗi / miss → `gf_retry_missed` (mỗi phút, Settings `retryMissed`) thử lại — cộng thêm `reconcileQueueSchedules()` chạy lại **mỗi lần service worker khởi động lại** (MV3 tự tắt sau ~30s rảnh) để bắt các bài bị miss lịch khi máy tắt/đóng trình duyệt.

**Job crash giữa chừng (v1.0.165):** nếu `runPostMatrix()` ném lỗi trước khi kịp đăng nhóm nào (vd `ensurePostMedia()` lỗi vì thiếu Image provider) — bài được đánh dấu `postStatus: 'failed'` + dọn alarm/`activityUpcoming` ngay (không chờ user bấm Dừng), và Live Activity báo đúng `phase: 'error'` kèm message thật. Trước bản này, các case này bị `finally` báo nhầm `phase: 'done'`, `postStatus` không bao giờ thành "xong" nên bị `reconcileQueueSchedules()`/`gf_retry_missed` chạy lại job y hệt liên tục — nhìn như engine kẹt chạy mãi không rõ lý do.

**Hàng đợi tuần tự chung (v1.0.174):** `GF_BG.enqueueTask(taskFn)` — 1 Promise chain duy nhất, mọi thao tác đụng tab Facebook (đăng bài, comment; chạy tay lẫn theo lịch) xếp vào đây, chạy đúng 1 việc tại 1 thời điểm, không còn báo lỗi "đang bận" hay chạy chồng khi 2 lịch trùng giờ. `tickDailyFixedSchedules()` tách "phát hiện + đánh dấu đã nhận" (nhanh, đồng bộ) khỏi "chạy thật" (`enqueueTask`, có thể chờ) để tick 1-phút-sau không phát hiện lại đúng entry đang chờ hàng đợi. Lịch lặp lại hàng ngày giờ cũng **bắt kịp lịch bị lỡ** — khớp "giờ đã qua trong ngày mà chưa chạy" thay vì chỉ khớp đúng phút, nên máy tắt đúng lúc lịch tới vẫn chạy bù khi mở lại (thay vì bỏ qua hẳn tới hôm sau).

### Lên lịch giãn cách (v1.0.165)

Theo phản hồi Tony — khung lên lịch cũ (nút **Dàn** dùng `window.prompt()`, chỉ theo phút, không lặp lại; Comment "1 lần cụ thể"/"Lặp lại hàng ngày" tách rời, khung giờ ngẫu nhiên) đổi thành **1 component dùng chung cho cả Tạo bài và Comment**, cùng chung tên nút **"Lên lịch đã chọn"** ở cả 2 tab (v1.0.181 — Tạo bài đổi tên nút từ "Dàn" sang "Lên lịch đã chọn", bỏ hẳn nút "Lên lịch"/ô ngày-giờ rời cũ, xem thêm bên dưới):

- **Giờ bắt đầu** (bài/comment đầu tiên) + **giãn cách** (giá trị + đơn vị phút/giờ/ngày) — mục thứ *i* (0-based) được gán `start + i × gap`. Ví dụ bài A 8h, giãn cách 30 phút → bài B 8h30, bài C 9h...
- **Lặp lại hàng ngày** (checkbox, tắt mặc định = chạy 1 lần): bật lên thì KHÔNG đặt alarm 1 lần — ghi vào `dailyFixedSchedules` (`chrome.storage.local`) với `timeOfDay` = giờ:phút đã tính cho mục đó, chạy lại **đúng giờ này mỗi ngày**. Thay hẳn cơ chế "khung giờ ngẫu nhiên, tối đa 1 job/3 phút" cũ của Comment.
- **Tạo bài không còn bắt buộc đã chọn nhóm** (`buildPostJobRelaxed()` — từ v1.0.181 là builder DUY NHẤT của nút "Lên lịch đã chọn", `buildPostJob()` cũ đã xóa hẳn) — tới giờ chạy, `runPostMatrix()` tự bỏ qua đúng bài chưa có nhóm (log `phase: 'error'`, snippet "Bỏ qua — bài chưa chọn nhóm"), không chặn các bài khác trong job.
- **Comment không còn bắt buộc nhập mẫu** ở bất kỳ đường nào (Chạy / Chạy đã chọn / Lên lịch) — để trống thì `resolveJobComment()` (background.js) tự random mẫu Settings lúc chạy thật, giống hệt cơ chế "Lặp lại hàng ngày" cũ đã làm.
- **UI (v1.0.168)**: dropdown đơn vị đặt **trước** ô số (không phải sau) — đổi đơn vị thì `bindGapUnitDefaultReset()` tự reset số về mặc định của đơn vị (phút=15, giờ=1, ngày=1), tránh giữ số cũ sai nghĩa (vd "10" từ phút giữ nguyên khi đổi sang ngày). Tab Comment: 3 trường Giờ bắt đầu/Giãn cách/Lặp lại hàng ngày không còn cố định trên đầu — dồn vào khung `#commentStaggerPanel` ẩn/hiện khi bấm "Lên lịch đã chọn" (nút "Xác nhận" riêng bên trong), y hệt khung `#campaignStaggerPanel` của nút "Lên lịch đã chọn" bên Tạo bài.
- **Auto-lên-lịch bài chưa có lịch (v1.0.169)**: `autoScheduleUnscheduledComments()` chạy mỗi lần tab Comment tải/làm mới (không cần bật gì, không còn Settings toggle `commentAutoScheduleEnabled` cũ) — MỌI bài trong `state.comments` chưa có trong `commentScheduleMap` (kể cả bài cũ còn sót, không chỉ bài đồng đội mới kéo về) tự động xếp "1 lần cụ thể", cách nhau 15 phút, bắt đầu sau lịch comment muộn nhất trong `activityUpcoming` (hoặc từ giờ hiện tại nếu chưa có lịch nào). Gọi lại nhiều lần vẫn an toàn — chỉ nhắm bài chưa có lịch.
- **Tránh đêm cứng (v1.0.169)**: `avoidNightTime(ms)`/`avoidNightHHMM(hhmm)` (`sidepanel.js`) — mốc nào rơi 22:00–06:59 tự dời về 07:00 (cùng ngày nếu đang trước 07:00, hôm sau nếu đã qua 22:00). Áp dụng bên trong `scheduleCommentJobsOnce()` (nên tự động che luôn mọi caller: bulk stagger, lên lịch riêng 1 bài, auto-lên-lịch) và ở `confirmCampaignStagger()`/`scheduleSelectedComments()`/`scheduleOneComment()` cho nhánh lặp lại hàng ngày (`timeOfDay`). Thay hẳn `confirmNightAction()`/`isNightBlocked()` cho các luồng LÊN LỊCH (không hỏi confirm nữa, tự dời) — luồng CHẠY NGAY (▶ Chạy, Chạy đã chọn, Đăng ngay) vẫn giữ confirm cũ vì không có "ngày mai" để dời tới.

**v1.0.177 (đã thay bởi v1.0.181):** nút "Lên lịch" (thường, cùng giờ cho mọi bài tick, ô ngày/giờ rời trong footer) từng được sửa hết bắt buộc chọn nhóm qua `schedulePost()`/`buildPostJob()`/`upsertSinglePostSchedule()`. Cả 3 hàm này **đã bị xóa hẳn** ở v1.0.181 — nút "Lên lịch" riêng biệt cũng bị bỏ, hợp nhất hoàn toàn vào panel giãn cách (`buildPostJobRelaxed()` + `confirmCampaignStagger()`) như mô tả ở trên.

**v1.0.179 — tag lịch trên card phản ánh đúng cả lịch lặp lại hàng ngày:** `loadPostScheduleMap()` (giống `commentScheduleMap`) gộp `activityUpcoming` (1 lần) + `dailyFixedSchedules` (lặp lại) theo `post.id` — `postScheduleTagHtml()` đọc map này thay vì đọc thẳng `post.ngay_dang`/`gio_dang` (trước đây bài lên lịch lặp lại **không** set 2 field này nên tag vẫn hiện "+ Hẹn giờ" như chưa có lịch). Đã bỏ hẳn list riêng `#postDailyScheduleList` — bấm tag "🔁 HH:MM hàng ngày" để hủy (`cancelPostDailySchedule()`).

| Storage key | Việc |
|-------------|------|
| `activityUpcoming` | Alarm 1 lần (`gf_job_*`/`gf_cmt_*`) — không đổi |
| `dailyFixedSchedules` | Lặp lại hàng ngày giờ cố định — entry `{id, kind:'post'\|'comment', timeOfDay:'HH:MM', payload, label, lastRunDate}`, tick mỗi phút qua alarm `gf_comment_daily` (tên cũ, dùng chung) → `tickDailyFixedSchedules()` |

| File | Việc |
|------|------|
| `sidepanel.js` | `staggerGapMs`, `timeOfDayHHMM`, `avoidNightTime`, `avoidNightHHMM`, `addDailyFixedSchedules`, `renderDailyFixedSchedules`, `autoScheduleUnscheduledComments`; Tạo bài: `confirmCampaignStagger`, `buildPostJobRelaxed`; Comment: `scheduleSelectedComments`, `scheduleOneComment` |
| `background.js` | `tickDailyFixedSchedules` (alarm `gf_comment_daily`, mỗi phút, chạy MỌI entry khớp giờ:phút hiện tại + chưa chạy hôm nay, cả `runPostMatrix` lẫn `runComment`) |

**Filter tab Comment (v1.0.169)**: 3 select độc lập kết hợp AND — `#commentFilterPerson` (Người: Tất cả/Của tôi/tên đồng đội, option tên đồng đội tự sinh qua `populateCommentFilterPersonOptions()`), `#commentFilterTemplate` (Mẫu: Tất cả/Có/Chưa có, đọc `commentDrafts`), `#commentFilterSchedule` (Lịch: Tất cả/Đã/Chưa lên lịch, đọc `commentScheduleMap`) — thay combobox gõ-tìm gộp chung trước đó, cùng kiểu `<select class="gf-select-sm">` như "Nhóm:"/"Ảnh:" ở tab Tạo bài. Nút "Điền mẫu vào ô trống" đã bỏ (không còn ý nghĩa vì mẫu trống tự random lúc chạy).

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

### Radar Lead (tab Radar) — v1.0.176

**100% local** (`chrome.storage.local`) — không sync tidien (dữ liệu nhạy cảm, giữ trên máy user). Spec đầy đủ: Module 6, `fb-group-poster-PRD.md`.

| Việc | Cơ chế |
|------|--------|
| Cấu hình | Bật/tắt, từ khóa (`-` để loại), chu kỳ quét (5/15/30/60p), số nhóm quét/lượt (`radarMaxGroupsPerScan`, mặc định 10 — tránh FB nghi ngờ), thông báo desktop, cảnh báo trong trang |
| **Nhóm mục tiêu** | Picker tìm-kiếm-và-tick trong tab Radar (`renderRadarGroupPicker`, giống picker tab Nhóm) — lưu `radarGroupIds`; để trống thì fallback "tất cả nhóm đã dùng trong bài đăng" |
| Quét | `chrome.alarms` (`radar_scan`) hoặc nút **Quét ngay** → `runRadarScan()` (`background.js`): mở tab tới từng nhóm mục tiêu (giới hạn + xoay vòng cursor `radarScanCursor` qua từng chu kỳ), `content.js` quét `[role="article"]` đang hiện, khớp từ khóa (`matchKeywords`) |
| **Dedup** | `radarSeenPostIds` (key `group_id:post_id`, cắt 3000 gần nhất) — chặn lead cũ bị bắt lại mỗi chu kỳ (trước v1.0.176 không dedup, phình vô hạn dù không có gì mới) |
| Cảnh báo trong trang | `radarInPage` bật → `content.js` hiện toast góc phải trên (`GF_RADAR_TOAST`, tự ẩn 8s) khi có lead mới lúc tab đang mở đúng nhóm |
| Danh sách lead | Tìm theo tên người đăng/nội dung, lọc theo trạng thái (Tất cả/Mới/Đã xem), nút "✓ Đã xem"/xóa từng dòng/xóa tất cả, xuất CSV/JSON |
| Live update | `GF_RADAR_UPDATED` (background gửi sau mỗi lượt quét) → sidepanel tự load lại `radarLeads`, không cần đóng/mở panel |

| File | Việc |
|------|------|
| `modules/leadRadar.js` | `getConfig`/`saveConfig`/`setAlarm`/`parseKeywords` — **chỉ dùng ở sidepanel** (chưa từng vào `build-sw-bundle.js` nên service worker không thấy module này; `background.js` tự viết lại logic quét) |
| `content.js` | `scanFeedPosts` (kèm `author_name`), `matchKeywords`, `showGfRadarToast` |
| `background.js` | `runRadarScan`, alarm `radar_scan` |
| `sidepanel.js` | `renderRadarGroupPicker`, `renderLeads`, `exportLeadsCsv`/`exportLeadsJson`, `setLeadStatus`/`deleteLead`/`clearAllLeads` |

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

**v1.0.161 — bật lại Nhanh làm mặc định (đã tắt từ v1.0.126, xem ghi chú bên dưới):** `postGroupItem()` (`background.js`) thử `fbPostBg.postToGroup()` (Nhanh) trước, bỏ qua thẳng Cổ điển nếu là video (GraphQL nền chưa hỗ trợ upload video), lỗi gì cũng fallback Cổ điển — không cần bật gì trong Cài đặt, tự động hoàn toàn, cùng kiểu `commentOnPostBgOrClassic()` đã dùng cho comment. Đồng thời sửa `fbPostBg.js` đọc `gf_key_doc_ids` (doc_id `ComposerStoryCreateMutation` do `content.js` tự bắt được từ traffic GraphQL thật của Facebook lúc user browse — xem mục doc_id bên dưới) thay vì chỉ dùng hằng số cứng, để khi FB đổi doc_id thì Nhanh tự cập nhật theo, không cần chờ bản extension mới. **Nhớ chạy `node build-sw-bundle.js` sau khi sửa bất kỳ file nào trong `modules/` — `background.js` load code qua `modules/swBundle.js` (bundle build sẵn), không đọc trực tiếp từng file.**

**v1.0.161 — chuỗi debug lỗi 1357004 (FB error chung chung "Rất tiếc, đã xảy ra lỗi") sau khi bật Nhanh, theo đúng thứ tự phát hiện:**
1. `jazoest` hardcode cứng trong `fbSessionBg.js` (không tính từ `fb_dtsg` thật) → `computeJazoest(dtsg)`.
2. `__s`/`__req` (session id + bộ đếm ajax) chỉ lưu bộ nhớ, mất mỗi lần service worker MV3 tự tắt (~30s idle, ngắn hơn giãn cách giữa các nhóm) → mỗi lần đăng đều là "khởi động lạnh" → `ensureAjaxIdentity()`/`nextReq()` lưu vào `chrome.storage.local`.
3. **Nguyên nhân chính:** `fbCometTokens.js` tự sinh ngẫu nhiên `__dyn`/`__csr` (bitset mã hoá module JS/CSS đang tải) khi không lấy được từ HTML — giá trị giả này gần như chắc chắn bị FB phát hiện. Đã thêm bắt giá trị **thật**: `pageNetworkHook.js` chặn request (không chỉ response) của chính trang FB tìm `__dyn=`/`__csr=` → `GF_SAVE_COMET_TOKENS` → lưu `chrome.storage.local.gf_comet_tokens` → `applyToSearchParams()` (đổi `async`) ưu tiên đọc giá trị này. **User cần browse Facebook bình thường vài giây trước khi đăng** để cơ chế bắt kịp giá trị thật, nếu không vẫn rơi về ngẫu nhiên như cũ.

| Chế độ | Cách hoạt động | Khi nào dùng |
|--------|----------------|--------------|
| **Nhanh** (mặc định, v1.0.161+) | GraphQL nền trong service worker (`fbPostBg.js`): session cookie + `fb_dtsg`, upload + `ComposerStoryCreateMutation` — **không mở tab FB** | Text + ảnh; nhanh, giống Group Posting Pro `directApi`, miễn nhiễm throttle tab của Chrome khi trình duyệt bị đẩy xuống nền |
| **Cổ điển** | DOM trên tab FB: background mở đúng URL nhóm → content script mở composer, paste text (Lexical), attach ảnh, bấm Đăng — giống GPP Classic | Video (bắt buộc), hoặc dự phòng tự động khi Nhanh lỗi |

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

1. User A đăng + `POST /api/user-sync/posts` (license key) → `user_posts` trên website (`needs_comment=1`)
2. Extension user B/C: tab Comment tự `GET /api/user-sync/cross-posts` — trả **cả** bài của user khác đã comment lẫn chưa (v1.0.171: bỏ lọc `needs_comment=1` để bài không biến mất khỏi danh sách sau khi comment xong — client tự hiện tag "✓ Đã comment" theo field `needs_comment`/`_needsComment` thay vì server lọc mất). Bài của mình cũng vậy — không biến mất, và từ v1.0.178 cũng hiện tag "✓ Đã comment" qua `isCommentDone()` (đọc `postedGroups[].firstCommentOk`, xem bảng filter bên dưới). Badge số tab Comment chỉ đếm bài còn chưa comment (`!isCommentDone(c)`, dùng chung cho cả 2 nguồn).
   - **Tự động lên lịch (luôn bật, v1.0.169)**: mỗi lần tab Comment tải/làm mới, `autoScheduleUnscheduledComments()` (`sidepanel.js`) tự xếp MỌI bài chưa có lịch (bỏ qua bài cross đã comment rồi) vào "1 lần cụ thể", cách nhau 15 phút, sau lịch muộn nhất hiện có — không cần bật gì, không cần tự tay chọn/bấm. Xem thêm mục "Lên lịch giãn cách" bên dưới.
3. Soạn / chọn mẫu → **▶ Chạy** (1 bài) / **Chạy đã chọn** (nhiều bài) / **Lên lịch** (1 lần cụ thể hoặc lặp lại hàng ngày) — hoặc để tự động như trên
4. `fbCommentBg.commentOnPost` (nền):
   - Fetch permalink — bỏ qua nếu 404 / pending approval / bài ẩn
   - `CometUFILiveTypingBroadcastMutation` + delay theo độ dài text
   - `useCometUFICreateCommentMutation` doc_id `9550500205043457`
5. **Chạy đã chọn** — `runCommentBatch`: delay ngẫu nhiên giữa từng comment (theo Settings)
6. **Lên lịch đã chọn** — datetime bắt đầu + alarm `gf_cmt_*` giãn cách tự động; xem tab Activity
7. Comment thành công → `runComment()` (`background.js`) tự gọi `markCrossPostCommentedFromBg()` → `PATCH /api/user-sync/posts/:id/commented` (chỉ khi job có `crossServerId` — tức bài của người khác, không phải bài của chính mình) + ghi Activity log. Dùng chung, gọi đúng 1 lần cho cả 4 cách chạy ở trên (trước đây "Chạy đã chọn" và "Lên lịch 1 lần" thiếu `crossServerId` trong job nên không đồng bộ được, đã sửa).
8. Lỗi GraphQL → fallback DOM (`content.js` `GF_COMMENT`) — trừ bài không comment được

**UI card** (`renderComments()`, `sidepanel.js`) dùng chung class với card tab Tạo bài (`post-card`/`post-meta`/`post-actions`/`tag`) thay vì layout riêng: tag lịch đọc từ `commentScheduleMap` (gộp `activityUpcoming` + `dailyFixedSchedules`) hiện đúng ngày giờ/giờ lặp lại đang có, tag mẫu bình luận hiện đã nhập hay chưa, tag "✓ Đã comment" (nếu xong) — bấm tag mẫu/lịch để mở khung sửa tương ứng, không cần nút riêng.

**Filter (4 select độc lập, kết hợp AND, `bindCommentFilters()`):**

| Select | Option | Đọc từ |
|--------|--------|--------|
| `#commentFilterPerson` | Tất cả / Của tôi / tên đồng đội (tự sinh) | `_source`/`_userLabel` |
| `#commentFilterTemplate` | Mẫu bình luận: Tất cả / Có / Chưa có | `state.commentDrafts[c.id]` |
| `#commentFilterSchedule` | Lịch: Tất cả / Đã / Chưa lên lịch | `state.commentScheduleMap[c.id]` |
| `#commentFilterStatus` (v1.0.178) | Bình luận: Tất cả / Chưa comment / Đã comment | `isCommentDone(c)` |

**`isCommentDone(c)` (v1.0.178, sửa v1.0.185, `sidepanel.js`):** ưu tiên `state.commentedRecords[c.id]` (cục bộ, không phụ thuộc mạng — xem mục "Fix tab Comment tự lên lịch..." đầu file); nếu chưa có thì bài cross đọc `c._needsComment === false` (server); bài của mình đọc `postedGroups[].firstCommentOk === true` trên **mọi** nhóm hợp lệ (field đã được `markPostedGroupCommented()` — `background.js` — ghi sẵn mỗi lần comment/first-comment thành công, trước đây chỉ dùng nội bộ, chưa từng đọc lại ở UI cho bài của mình). Dùng chung cho: tag "✓ Đã comment" trên card, badge số tab Comment, và `autoScheduleUnscheduledComments()` — bài đã comment xong không còn bị tự lên lịch lại.

**Hủy lịch lặp lại ngay trên bài (v1.0.178):** đã bỏ list "Đang lặp lại hàng ngày" riêng của tab Comment — bấm tag lịch "🔁 HH:MM hàng ngày" trên card → panel sửa lịch hiện thêm nút **"🗑 Hủy lịch"** (`cancelCommentSchedule()` — gọi `cancelUpcoming()`/`cancelDailyFixedSchedule()` tùy loại 1 lần/lặp lại). List tương tự của tab Tạo bài (`#postDailyScheduleList`) cũng đã bỏ ở v1.0.179 — bấm thẳng tag "🔁 HH:MM hàng ngày" trên card để hủy (`cancelPostDailySchedule()`).

**Mẫu bình luận tự random khi thiếu (v1.0.180, sửa v1.0.184):** `autoFillMissingCommentDrafts()` (gọi trong `loadPostedPostsForComment()`) — bài nào chưa có draft thì random 1 **dòng** mẫu (`GF.commentTemplates.pickLine()`) từ Settings → Comment mẫu ngay lúc tải danh sách (không cần chờ auto-lên-lịch), gán **nguyên cụm spintax `{a|b|c|d|e}` chưa spin** vào draft (v1.0.180 dùng nhầm `resolve()` spin sẵn thành 1 câu cố định — bài lặp lại hàng ngày sẽ gửi y hệt câu đó mãi mãi, đã sửa ở v1.0.184). `resolveJobComment()` (background.js) mới thật sự spin, và spin lại mỗi lần chạy — draft không persist ra storage nên có thể đổi dòng mẫu khác ở lần mở panel sau nếu chưa tự sửa/lên lịch.

**Mẫu mặc định 10 dòng × 5 câu (v1.0.182):** khi chưa tự cấu hình, textarea Settings → Comment mẫu hiện sẵn 10 dòng, mỗi dòng `{câu 1|câu 2|câu 3|câu 4|câu 5}` (5 câu chung chung, không CTA/liên hệ — dùng an toàn cho mọi bài/nhóm). Định nghĩa ở **2 nơi trùng lặp bắt buộc**: `GF.commentTemplates.DEFAULT` (`modules/commentTemplates.js`, sidepanel dùng) và `COMMENT_TEMPLATE_DEFAULT` (`background.js`, `resolveJobComment()` dùng lúc chạy thật) — sửa 1 trong 2 phải sửa luôn chỗ kia, vì `commentTemplates.js` không nằm trong `build-sw-bundle.js` nên service worker không thấy được module.

**Fix mẫu mới không hiện cho user cũ (v1.0.183):** `getSettings()` luôn ưu tiên `commentTemplates` đã lưu trong storage hơn `DEFAULT` trong code — user nào từng bấm Lưu Cài đặt lúc textarea còn hiện mẫu mặc định CŨ (4 dòng × 3 câu, trước v1.0.182) thì mẫu cũ đó bị ghi thẳng vào storage, mắc kẹt vĩnh viễn dù code đã đổi `DEFAULT`. `migrateLegacyCommentTemplates()` (`sidepanel.js`, chạy trong `loadSettingsForm()` mỗi lần mở panel) so khớp giá trị đã lưu với `GF.commentTemplates.LEGACY_DEFAULTS` — khớp y hệt thì tự nâng cấp lên `DEFAULT` mới + ghi lại storage; không đụng nếu user đã tự sửa nội dung khác.

| Mức giãn cách | Giữa các comment |
|---------------|------------------|
| Nhanh | 1.5–3 phút |
| Cân bằng | 3–5 phút |
| An toàn | 5–10 phút |

| File | Việc |
|------|------|
| `modules/fbCommentBg.js` | Comment GraphQL nền |
| `sidepanel.js` | Tab Comment, AI, batch + lịch; `fetchCrossPostsFromServer()`, `autoScheduleNewCrossComments()` |
| `background.js` | `runComment`, `runCommentBatch`, `tickCommentDailySchedule`, `commentOnPostBgOrClassic`, `markCrossPostCommentedFromBg`; alarm `gf_cmt_*` |
| `modules/scheduler.js` | `DELAYS.betweenComments`, `getDelays()` |

`modules/tidienSync.js` (`fetchPendingComments`, `markCommented`) là phần còn sót lại của hệ thống JWT cũ (`/pending-comments`, `group_posts`) — không còn được gọi ở đâu, đã bị thay bằng hệ thống license-key (`/api/user-sync/cross-posts`) ở trên.

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
