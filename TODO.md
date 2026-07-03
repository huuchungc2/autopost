# AutoPost — TODO

> Cập nhật: 2026-07-04

## GroupFlow: fix "Extension context invalidated" trong content.js (2026-07-04)

Tony gửi ảnh chụp `chrome://extensions` → Lỗi, trace `content.js:208` — "Uncaught Error: Extension context invalidated".

- [x] **Root cause**: `chrome.runtime.sendMessage()` ném lỗi đồng bộ khi extension reload/update trong lúc content script cũ còn sống trên tab FB mở từ trước — pattern `.catch(() => {})` chỉ bắt reject bất đồng bộ, không bắt throw đồng bộ.
- [x] **Fix**: thêm `gfSafeSendMessage()` (content.js, bọc try/catch + .catch()), thay toàn bộ 9 lời gọi trực tiếp trong file. Đã kiểm tra `gfPanelShell.js`/`pageNetworkHook.js`/các module khác — không có pattern tương tự cần sửa thêm.
- [ ] **Cần Tony xác nhận**: reload extension (v1.0.190), F5 lại tab FB đang mở sẵn từ trước khi reload (để hết trạng thái context cũ), theo dõi vài lần reload extension tiếp theo xem còn thấy lỗi này trong Tiện ích → Lỗi không. Lưu ý: dù đã vá, tab FB **đang mở từ TRƯỚC KHI reload lần này** thì vẫn cần F5 1 lần — bản vá chỉ có tác dụng từ content script MỚI (sau F5) trở đi, không "chữa" được content script cũ đang chạy dở.

## BUG MẤT DỮ LIỆU: Composio config bị xoá mỗi lần Lưu khi form trống (2026-07-04)

Tony: "composio là tao cấu hình rồi mà tại sao giờ kêu là chưa hay vậy? thực tế mọi thứ có dưới database hết rồi mà" — sau khi mở tab "Facebook Token" mới (đã tách từ tổ chức lại /settings), thấy báo "Chưa Cấu Hình" dù đã từng điền + Lưu trước đó.

- [x] **Root cause đã xác nhận qua hỏi lại Tony**: `saveComposioSettings()` (Settings.jsx) gửi 3 trường `composio_facebook_auth_config_id`/`composio_default_user_id`/`composio_default_connected_account_id` **LUÔN LUÔN** trong payload, khác `composio_api_key` (chỉ gửi khi có giá trị). Backend coi field rỗng = lệnh XOÁ hẳn key khỏi `app_settings`. Nếu form từng ở trạng thái rỗng lúc bấm Lưu (vd F5 giữa lúc `GET /settings` chưa kịp trả về) → xoá sạch cấu hình đã lưu trước đó, kể cả khi chỉ định đổi toolkit version/auto-fallback không liên quan.
- [x] **Fix**: 3 trường này giờ chỉ gửi khi có giá trị (trim non-empty), giống hệt `composio_api_key` — không còn silent-wipe được nữa.
- [ ] **QUAN TRỌNG — dữ liệu đã mất KHÔNG tự khôi phục**: cần Tony vào tab "Facebook Token" → điền lại đủ 4 trường (API Key, Auth Config ID, User ID, Connected Account ID) → Lưu vào database **1 lần nữa**. Sau lần này, bug đã vá nên sẽ không bị xoá lại nữa dù bấm Lưu nhiều lần hay form tạm trống lúc nào đó.
- [ ] **Cần Tony xác nhận trên máy thật**: sau khi nhập lại + build frontend mới, thử bấm "Lưu vào database" vài lần liên tiếp (kể cả khi form đang trống 1 trường nào đó) — xác nhận 4 giá trị không bị xoá mất nữa.

## Website /settings: fix bug lưu Google Drive + tổ chức lại tab (2026-07-04)

Tony gửi screenshot `tidien.xyz/settings` — báo "không thể lưu được chế độ google drive", xác nhận KHÔNG xoá phần API tidien trên website (chỉ xoá ở extension), và muốn tổ chức lại UI trang này.

- [x] **Root cause bug Drive**: `getMediaStorageStatus()` âm thầm đè lựa chọn `media_storage='google_drive'` admin đã chọn về lại `'local'` nếu OAuth2 credentials chưa đủ 3 trường ngay lúc tính — không phải lỗi lưu thật, mà là hiển thị tự đảo ngược ngay sau khi lưu, khiến nhìn như save thất bại. `getMediaStorageMode()` (hàm quyết định runtime thật lúc lưu ảnh) không có bug này.
- [x] **Fix**: mode đã lưu tường minh luôn được tôn trọng, chỉ tự đoán khi chưa từng cấu hình. Xem `docs/GOOGLE_DRIVE.md`.
- [x] **Xác nhận**: KHÔNG đụng tới phần "tidien API"/license key trên website (`GroupExtensionSettings.jsx`) — chỉ đã xoá ở extension theo yêu cầu trước đó.
- [x] **Tổ chức lại `/settings` thành 5 tab**: Tổng quan / Extension / Lưu trữ ảnh (Drive) / Facebook Token / Lịch xuất ảnh — dùng chung class `.tabs`/`.tab` đã có sẵn ở `Generate.jsx`.
- [ ] **Cần Tony xác nhận trên máy thật**: restart backend, mở `/settings` — kiểm tra 5 tab hiển thị đúng nội dung, chọn "Google Drive" + điền đủ Client ID/Secret/Refresh Token + bấm Lưu → dropdown "Nơi lưu ảnh" phải giữ nguyên "Google Drive" (không tự nhảy về "VPS local" nữa). **Lưu ý: tôi chưa test được bằng trình duyệt thật (sandbox không có DB/server sống) — chỉ verify qua đọc code + `npm run build`, cần bạn xác nhận thực tế.**

## GroupFlow: bỏ tidien API key + tổ chức lại tab Cài đặt (2026-07-04)

Tony: "api key tidien đâu cần thiết nữa thì bỏ đi" + tổ chức lại bố cục trang Cài đặt cho hợp lý hơn.

- [x] **Bỏ field "tidien API Key"**: đào sâu grep toàn bộ codebase trước khi xoá — phát hiện cơ chế auth cũ (email/password + API key thủ công) đã chết gần hết: `login()`/`testConnection()`/`saveFbProfile()` (`modules/tidienAuth.js`) zero-caller, `runCommentOwn()` có nhánh gọi route đã xoá ở migration 039 (luôn 404 âm thầm). Dọn sạch toàn bộ, license key là danh tính duy nhất còn lại.
- [x] **Tổ chức lại tab Cài đặt** (chọn hướng "tổ chức lại bố cục" thay vì chỉ tinh chỉnh trực quan): nhãn tab "Ảnh" → "Ảnh & Comment" (khớp tiêu đề card); "9Router API Key" chuyển sang tab AI Provider; "Lịch xuất ảnh ban đêm" chuyển sang tab Ảnh & Comment. Tab Nâng cao giờ chỉ còn Google Drive (legacy).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension (v1.0.189), mở Cài đặt kiểm tra: field tidien API Key đã biến mất, 9Router key nằm đúng ở tab AI, lịch xuất ảnh đêm nằm đúng ở tab Ảnh & Comment, Lưu cài đặt vẫn hoạt động bình thường (không có field nào bị mất giá trị do di chuyển).

## Fix phân trang Nhật ký + Thông báo (2026-07-04)

Tony báo tiếp: "Nhật ký" (`/activity`) và "Thông báo" (`/notifications`) cũng chưa phân trang, không thấy ngày hiện tại.

- [x] **Root cause**: cả 2 route trả cứng `LIMIT 100`/`LIMIT 50`, không nhận tham số trang — giống hệt bug đã sửa ở `/user/dashboard`.
- [x] **Fix**: đổi response sang `{ data, pagination }` cho cả 2 route; thêm `page`/`limit`. Cập nhật đồng bộ mọi nơi gọi API cũ (đã grep xác nhận không sót): `ActivityLog.jsx`, `useNotifications.js` (dùng bởi `Notifications.jsx`), `NotificationDropdown.jsx` (badge chuông header).
- [x] **Bug suýt tự tạo ra khi sửa**: `useNotifications.js` có `window.addEventListener('notificationsUpdated', refresh)` — sau khi đổi `refresh` nhận tham số `page`, gọi trực tiếp qua addEventListener sẽ vô tình truyền `Event` object làm `page`. Đã bọc qua hàm rỗng `() => refresh()` trước khi đăng ký listener.
- [ ] **Ô lọc ngày trống "dd/mm/yyyy" ở trang `/groups`**: giữ nguyên, chưa đổi — đây là input ngày rỗng chuẩn (trống = không lọc, hiện tất cả), không phải bug. Nếu Tony muốn nó tự điền sẵn ngày hôm nay làm mặc định, cần nói rõ để làm — hiện tại để trống là có chủ đích.
- [ ] **Cần Tony xác nhận**: restart backend, mở "Nhật ký" và "Thông báo" — kiểm tra nút Trước/Sau hoạt động, badge chuông header vẫn đếm đúng số chưa đọc.

## Fix phân trang tidien.xyz/user/dashboard (2026-07-04)

Tony gửi screenshot `/user/dashboard` (self-serve, KHÁC trang admin `/groups` đã sửa hôm 2026-07-03) — tab "Bài đã đăng" không phân trang.

- [x] **Xác nhận đúng trang khác**: `/user/dashboard` (`UserDashboard.jsx`) đọc `GET /user-auth/me/detail` — route hoàn toàn riêng, chưa từng đụng tới trước đây, khác `GET /group-posts` của trang admin.
- [x] **Root cause**: route trả cứng `LIMIT 30`, không nhận `page`/`limit` — chưa từng có phân trang từ đầu (không phải bug regression, là tính năng thiếu).
- [x] **Fix**: thêm `page`/`limit` + `pagination` vào response; đổi sort `created_at DESC` → `COALESCE(posted_at, created_at) DESC` (đồng bộ fix NULL-safe đã làm ở trang admin); frontend thêm nút Trước/Sau (tab "Nhóm" giữ nguyên không phân trang — số nhóm dùng thường ít).
- [ ] **Cần Tony xác nhận**: restart backend, mở lại `/user/dashboard` → tab "Bài đã đăng" — kiểm tra bài mới nhất (hôm nay) có lên đầu danh sách không, nút Trước/Sau hoạt động đúng không.

## Fix BUG NGHIÊM TRỌNG: 1 bài bị comment lặp nhiều lần (2026-07-04)

Tony phát hiện ngay sau khi deploy v1.0.187 (Flow 1 chạy nền): cùng tài khoản comment 2-3 lần lên đúng 1 bài trong vài phút.

- [x] **Root cause bug trùng lịch**: `runFlow1BackgroundSync()` (chạy nền) và `autoScheduleUnscheduledComments()` (chạy khi mở tab Comment) check "đã lên lịch chưa" bằng 2 storage key khác nhau — không thấy lịch của nhau, cả 2 cùng lên lịch cho cùng 1 bài.
- [x] **Vá 3 lớp**: (1) đồng bộ nguồn check "đã lên lịch" giữa 2 nơi (`activityUpcoming`/`dailyFixedSchedules`); (2) `runComment()` tự kiểm tra `commentedRecords` trước khi đăng, bỏ qua nếu đã comment rồi — chặn cả alarm trùng đã lỡ tồn tại; (3) `dedupeUpcomingCommentAlarms()` — tự dọn alarm trùng cũ mỗi chu kỳ nền.
- [x] **Root cause riêng bug "giờ khác nhau khi click vào sửa lịch"** (Tony hỏi lại, hoá ra KHÔNG phải hệ quả của bug trùng lịch ở trên mà là bug độc lập): `renderComments()` tính 1 giờ mặc định ("bây giờ+30p") dùng chung cho ô sửa lịch của MỌI card, kể cả card đã có lịch thật — chưa từng đọc lại giờ đã lưu. Đã vá: ưu tiên đổ đúng giờ đã lưu (`scheduleWhenInputValue()`) nếu bài đã có lịch.
- [x] Di chuyển checkbox "Chọn tất cả" tab Comment xuống dưới hàng filter (Người/Mẫu bình luận/Lịch/Bình luận).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension (v1.0.188), theo dõi Log → Lịch sử vài chu kỳ xem còn thấy 2 comment trùng giờ trên cùng 1 bài không; bấm vào tag lịch trên card xem giờ hiện ra trong ô sửa có khớp đúng giờ ghi trên tag không (giờ phải khớp 100%, không còn ra giờ "bây giờ+30p" ngẫu nhiên nữa).

## Fix trang /groups: bài hôm nay không hiện, phân trang, thêm xoá hàng loạt (2026-07-03)

Tony báo sau khi deploy đợt gộp bảng: bài đăng hôm nay không hiện trong danh sách, phân trang có vẻ không hoạt động, thiếu checkbox chọn nhiều để xoá.

- [x] **Xoá hàng loạt**: checkbox "chọn tất cả trên trang" + từng dòng, nút "Xoá đã chọn (N)" — `POST /group-posts/bulk-delete` (mirror convention `bulk-delete` đã có ở fanpage `Posts.jsx`). Admin xoá bất kỳ bài nào, user thường chỉ xoá bài của mình.
- [x] **Lỗi tải danh sách không còn bị nuốt im lặng** — trước chỉ `console.error`, trang hiện y hệt "trống" dù có thể đang lỗi thật (vd migration 039/039b chưa kịp chạy). Thêm toast báo lỗi.
- [x] **Defensive fix cho khả năng bài mới rớt khỏi trang 1**: `ORDER BY posted_at DESC` + filter ngày đổi sang `COALESCE(posted_at, created_at)` — nếu có bài nào lỡ `posted_at` NULL sẽ không còn bị đẩy xuống tận trang cuối / bị filter ngày loại thẳng.
- [ ] **Chưa xác nhận được root cause thật của "bài hôm nay không hiện"** — đã rà kỹ code (`listPublishedGroupPosts`, extension `pushPostToTidien`/`upsertUserPost`) không thấy bug rõ ràng nào ngoài khả năng NULL `posted_at` vừa vá phòng ngừa ở trên; không có DB thật để tái hiện. **Cần Tony**: sau khi deploy bản này, nếu bài hôm nay vẫn không hiện — báo lại kèm: mở DevTools → tab Network lúc load `/groups`, xem response của `GET /api/group-posts` (đặc biệt field `posted_at` của bài bị thiếu) hoặc lỗi cụ thể hiện trong toast mới.
- [ ] **Phân trang**: code phân trang (nút Trước/Sau) đã có sẵn từ trước, không đổi gì thêm ở bản này — nếu vẫn thấy "không phân trang" sau khi deploy, khả năng cao là hệ quả của bug "bài hôm nay không hiện" (ít bài hiển thị hơn thực tế nên `pagination.total`/`pages` tính đúng theo view đã lọc sai, không phải phân trang tự nó hỏng). Theo dõi cùng lúc với mục trên.

## Định nghĩa lại 3 flow đồng bộ + gộp group_posts vào user_posts (2026-07-03)

Theo yêu cầu Tony: thu gọn đồng bộ extension↔backend về đúng 3 luồng "thật sự cần thiết" (AI/skill/provider giữ nguyên local, không đụng backend).

- [x] **Flow 1 (đồng bộ bài để đi comment)**: chuyển vào chu kỳ nền `gf_tidien_sync` (`runFlow1BackgroundSync()` — background.js) thay vì chỉ chạy khi mở tab Comment — giải quyết đúng vấn đề "user ít mở tab thì cache mãi mãi = 0" đã phân tích qua ví dụ A/B/C/D. Đổi cờ boolean `needs_comment` sang `comment_target`/`comment_count` (bảng join `user_post_comments`) — nhiều người khác nhau cùng comment 1 bài thay vì 1 người là khoá lại cho tất cả; thêm `visible_after` (độ trễ 5–60 phút, hiệu ứng "từ từ"); ưu tiên bài `comment_count` thấp nhất.
- [x] **Flow 2 (đồng bộ sau khi đăng bài)**: `POST /group-posts/sync` + `POST /user-sync/posts` dùng chung `upsertUserPost()`, khớp theo `(user_account_id, group_id, post_id)` — hết tạo 2 dòng trùng.
- [x] **Flow 3 (đồng bộ sau khi comment)**: `PATCH .../commented` đổi sang bảng join + đếm lại; PATCH fail xếp hàng đợi retry cục bộ (`pendingCommentedSync`) thay vì nuốt lỗi im lặng.
- [x] **Gộp bảng**: migration 039 + 039b — `group_posts`/`group_post_comments` gộp vào `user_posts`/`user_post_comments`. Không xoá bảng cũ (rollback thủ công nếu cần). `listPublishedGroupPosts()`/`getGroupPostsStats()`/`listGroupPostComments()` (trang web `/groups`) chuyển sang đọc bảng gộp, giữ nguyên response shape.
- [x] **Dọn dead code**: xoá `GET /pending-comments`, `PATCH /group-posts/:id/commented`, `POST/GET /group-posts/posts/pull` (route + service). Đây chính là **#1 + #2** trong danh sách đề xuất cũ bên dưới — đã giải quyết trong đợt này.
- [x] **So le giờ đồng bộ (jitter)** — mỗi máy tự bốc thăm độ trễ ban đầu cố định trước khi tạo alarm `gf_tidien_sync`, tránh dồn cục khi nhiều máy cùng khởi động 1 thời điểm.
- [ ] **Cần Tony xác nhận trên server thật**: restart backend (migration 039/039b tự chạy, có backfill dữ liệu cũ nếu còn `group_posts`) — kiểm tra trang web `/groups` vẫn hiện đúng danh sách/comment/stats như trước; reload extension, đăng bài + comment chéo giữa ≥2 tài khoản license key, để 1 tài khoản KHÔNG mở tab Comment xem có tự nhận được bài để comment qua chu kỳ nền không (đúng kịch bản "C" trong ví dụ A/B/C/D).
- [ ] **Chưa làm (đề xuất mở rộng, không thuộc phạm vi 3 flow lần này)**: rate limiting tầng Express (chưa có `express-rate-limit`), tăng `connectionLimit` pool MySQL (hiện `10`, dùng chung toàn hệ thống), AI proxy (`/ai/generate`, `/ai/text`, `/ai/image`) vẫn giữ 1 slot Node đồng bộ chờ LLM — cân nhắc hàng đợi nếu traffic AI tăng thật. Cả 3 việc này chỉ cần khi thực sự scale lớn, không phải fix cấp bách.

## Đồng bộ thông minh my-posts/cross-posts — cursor + merge-cache + throttle (2026-07-03)

- [x] **Root cause "bài đã tải rồi vẫn tải lại hoài"**: `GET /api/user-sync/my-posts` (tham số `since` có sẵn nhưng client chưa từng gửi) và `GET /api/user-sync/cross-posts` (chưa hề có `since`) luôn trả full 200/100 bài mới nhất mỗi lần gọi, không cursor, không throttle, không cache incremental phía client — tải lại gần như y hệt lần trước ở mọi thao tác (mở panel/tab, đăng bài, comment xong, Làm mới).
- [x] **Fix**: migration `038` — `user_posts.updated_at` (`ON UPDATE CURRENT_TIMESTAMP`) + index `(user_account_id, updated_at)`/`(updated_at)`. 2 route trên nhận `?since=<updated_at cuối>`. Extension: `pullMyPostsFromServer()`/`fetchCrossPostsFromServer()` lưu cursor (`myPostsSyncMeta`/`crossPostsSyncMeta`) + merge-upsert (`mergeUserPostsById()`) thay vì ghi đè cache; throttle 30s giữa 2 lần gọi mạng thật, bấm "Làm mới" tay (`#btnRefreshComments`) mới bỏ throttle (`force: true`). GroupFlow bump `1.0.186`. Chi tiết: `docs/GROUPFLOW.md` đầu file.
- [ ] **Cần Tony xác nhận**: restart backend (migration 038 tự chạy lúc khởi động), reload extension, test đăng bài + comment chéo giữa 2 tài khoản license key khác nhau — bài mới/trạng thái đã comment phải vẫn lan truyền đúng qua nhiều lần refresh, không còn tải lặp lại y hệt mỗi lần.
- [ ] **Đề xuất mở rộng, chưa làm (nếu cần scale tới hàng nghìn user)**: rate limiting tầng Express (chưa có `express-rate-limit` nào trong repo), endpoint `status`-rẻ kiểu `sync/status` cho `user-sync/*` để hỏi "có gì mới không" trước khi full pull, tăng `connectionLimit` pool MySQL (hiện `10`, dùng chung toàn hệ thống) nếu tải tăng thật.

## Fix GroupFlow tab Comment tự lên lịch + tự comment lặp lại vô hạn (2026-07-03)

- [x] **Root cause**: bài đồng đội (cross) và bài của mình kéo về từ thiết bị khác (server) không có cách nào ghi nhớ CỤC BỘ đã comment xong — `isCommentDone()` chỉ tin vào 2 nguồn phụ thuộc mạng (`markPostedGroupCommented()` no-op vì bài không nằm trong `postQueue` cục bộ, và PATCH `/commented` best-effort im lặng nuốt lỗi khi fail). Hễ 1 trong 2 fail thì extension quên mất đã comment — mỗi lần refresh tab Comment, `autoScheduleUnscheduledComments()` tự lên lịch lại rồi tự chạy lại, spam comment trùng lặp vô hạn lên cùng 1 bài FB.
- [x] **Fix**: thêm `commentedRecords` (`chrome.storage.local`) — nguồn-sự-thật cục bộ, ghi bởi `markCommentDoneLocal()` trong `runComment()` (background.js) ngay khi comment lên FB thành công, không phụ thuộc sync mạng nào. `isCommentDone()` (sidepanel.js) đọc nguồn này trước tiên. GroupFlow bump `1.0.185`. Xem `docs/GROUPFLOW.md` mục đầu file.
- [ ] **Cần Tony xác nhận trên thiết bị thật**: reload extension, comment vài bài (cả bài của mình lẫn bài đồng đội nếu có), refresh panel nhiều lần xem có còn tự lên lịch/tự comment lại bài đã xong không. Lưu ý: các bài đã bị lặp lịch TRƯỚC bản vá này (`activityUpcoming`/`dailyFixedSchedules` cũ) không tự dọn — cần vào tab Log → Sắp tới / tag lịch trên card để hủy tay nếu còn sót.

## Fix popup Modal lệch vị trí PC / không hiện trên mobile + touch scroll khó (2026-07-03)

- [x] **`Modal.jsx` giờ dùng React Portal (`createPortal(..., document.body)`)**: trước đây render lồng tại chỗ gọi khiến `.card:hover` (transform) trên PC và `.post-card { overflow: hidden }` trên mobile (view lưới) phá vỡ `position: fixed` của overlay — popup lệch vị trí/kích thước (PC) hoặc gần như vô hình (mobile, bug WebKit cắt fixed lồng trong overflow:hidden). Portal loại bỏ hoàn toàn vì modal mount thẳng `document.body`. Đã build frontend xác nhận không lỗi.
- [x] **Fix touch scroll khó ở hầu hết trang có bảng (nguyên nhân chính, riêng biệt với popup)**: `.table-wrapper`/`.table-wrap` đặt `touch-action: pan-x` — chặn hẳn vuốt dọc thành cuộn trang khi chạm bắt đầu trên vùng bảng, ảnh hưởng gần như mọi trang danh sách (bài viết, fanpage, user...) đúng như mô tả "tất cả UI". Đổi thành `touch-action: pan-x pan-y`. Đã build frontend xác nhận không lỗi.
- [ ] **Cần Tony xác nhận trên thiết bị thật**: build lại frontend (`npm run build`) rồi deploy, test popup lỗi bài trên cả PC lẫn mobile + thử vuốt cuộn dọc ngay trên vùng bảng danh sách xem còn kẹt không.

## Fix ảnh AI xuất sai folder Drive (rơi vào root My Drive) (2026-07-03)

- [x] **Fix `uploadBufferToDrive()` tạo file thành công nhưng Drive API âm thầm bỏ qua `parents`**: xác nhận qua thực tế (Tony đã khai báo đúng cả folder cha + folder con, test "OK", nhưng ảnh vẫn xuất thẳng ra gốc "Drive của tôi", tên file `autopost-...`). Sửa: sau khi `files.create`, đọc lại `parents` thật trong response, nếu không khớp folder yêu cầu thì tự `files.update(addParents/removeParents)` sửa lại, throw lỗi rõ nếu vẫn thất bại (không còn âm thầm sai chỗ). `testDriveConnection()` giờ validate ID nhập vào đúng là 1 folder (`mimeType`), không phải file. Thêm script chẩn đoán `backend/scripts/check-drive-folders.js` (gọi thẳng Drive API kiểm tra `parents` thật của ảnh đã tạo).
- [x] **Fix `isDriveConfiguredFromSettings()` bắt buộc Folder ID gốc trong Cài đặt mới bật chế độ Drive**: đã sửa kèm (không phải nguyên nhân chính vụ trên, nhưng là lỗ hổng thật riêng biệt) — chỉ cần OAuth2 để bật Drive, không cần Folder ID gốc nếu mọi fanpage đã có folder riêng. Xem `docs/GOOGLE_DRIVE.md`.
- [ ] **Cần Tony xác nhận trên server thật**: restart backend, xuất thử ảnh cho 1-2 fanpage, kiểm tra Drive — ảnh phải vào đúng folder riêng, không còn rơi ra root.

## Gộp user_accounts vào users + fix GroupFlow license key (2026-07-01)

- [x] **Fix "Tải web" báo "Chưa đăng nhập tidien" cho tài khoản license key**: `authenticateExtension` (`extensionAuth.js`) thêm nhánh chấp nhận `license_keys.key_value` trực tiếp; `tidienAuth.authHeader()` (extension) fallback thêm `licenseKey`. GroupFlow bump `1.0.146`.
- [x] **Gộp `user_accounts`/`license_keys`/`user_posts` vào `users`** (role mới `group_user`): migration `036` + `ensureUserAccountsMergedIntoUsers()` (di trú dữ liệu qua email, repoint FK, xoá `user_accounts`). `userAuth.js`/`licenseAuth.js` đổi sang query `users`. `routes/users.js` loại trừ `group_user` khỏi danh sách quản lý nội bộ.
- [x] **Provider/skill riêng theo user tự đăng ký**: `canManageProviders`/`canManageSkills` mở cho `group_user` (chỉ tác động tài nguyên của chính họ, dùng lại `ai_providers.user_id`/`skills.created_by`). `skills.js` thêm lọc theo `created_by` khi role là `group_user` (trước đây skill dùng chung cho mọi role, khác với providers). Thêm `POST/DELETE /api/providers/:id/share` để chủ provider tự cấp quyền dùng chung cho người khác.
- [ ] **Chưa làm (cố ý, cần quyết định riêng)**: UI soạn/generate nội dung draft cho `group_user` trong `UserDashboard.jsx` — `POST/GET /api/group-posts/drafts` đã hoạt động đúng theo quyền sở hữu ngay khi có JWT hợp lệ, nhưng chưa có form nào gọi tới; nút "Tải web" sẽ hết báo lỗi nhưng trả rỗng cho tới khi có UI này.
- [ ] **Chưa làm (cố ý, phạm vi đã thống nhất với Tony là để sau)**: Google Drive/Composio hiện vẫn là cấu hình dùng chung toàn deployment (`app_settings`) — chưa tách riêng theo user. Đã xác nhận module Group hiện tại không đụng tới 2 dịch vụ này (`extensionGenerateImage` dùng `persist:false`, không lưu Drive) nên không chặn việc mở module Group cho user tự đăng ký.
- [x] **Fix regression: `group_user` login nhầm vào app admin**: sau khi gộp bảng, tài khoản tự đăng ký có mật khẩu thật trong `users` nên vô tình đăng nhập được qua `/api/auth/login` (app admin không có nav cho role này → màn hình trống). Chặn `role='group_user'` ở `authenticateUser()`, trả message hướng dẫn sang `/user/login`. Extension: thêm link "Đăng nhập" (bên cạnh "Đăng ký") trong overlay kích hoạt.
- [x] **License key tự cấp cho admin/super_admin/editor**: `GET/POST /api/auth/my-license` + UI trong Settings (`GroupExtensionSettings.jsx`) — admin dùng extension GroupFlow dưới đúng tài khoản của mình, không cần đăng ký tài khoản `group_user` riêng.
- [x] **Fix mỗi lần retry mở tab FB khác thay vì dùng lại tab cũ (v1.0.152)**: `_postingFbTabId` chỉ sống trong bộ nhớ SW, mất theo mỗi lần SW restart (cùng nguyên nhân với bug v1.0.151). Đã fallback đọc `chrome.storage.session.gfPanelTabId` (sống sót qua SW restart) khi bộ nhớ trống.
- [x] **Fix đăng lặp vô hạn, không dừng được — phải gỡ extension (v1.0.151)**: root cause là `resolvePostGroups()` không loại trừ nhóm đã đăng thành công, cộng với tiến độ chỉ được lưu ở cuối job — nếu service worker MV3 restart giữa chừng (rất dễ xảy ra), tiến độ mất sạch, lần sau đăng lại từ đầu kể cả nhóm đã xong, lặp vô hạn vì `stopRequested` cũng mất theo SW restart. Đã ghi tiến độ ngay sau mỗi nhóm + loại trừ nhóm đã đăng khi tính lại danh sách nhóm cần đăng. **Đây là bug nghiêm trọng nhất trong đợt này — rất cần Tony test kỹ lại với job nhiều nhóm trước khi tin tưởng dùng lại.**
- [x] **Fix nút "Chạy" từng dòng comment im re không phản hồi**: `runComment(id)` (sidepanel.js) gọi xong không đọc kết quả trả về, dù thành công hay lỗi cũng không hiện gì. Đã thêm toast báo kết quả.
- [x] **Fix "Lịch sử" mất entry khi đăng nhiều nhóm (v1.0.150)**: `appendHistory()` bị race điều kiện đọc-sửa-ghi trên `chrome.storage.local` — 2 lệnh gọi gần nhau ghi đè nhau, mất 1 entry dù cả 2 nhóm đều đăng thành công (đã xác nhận qua bảng `group_posts` trên server, dashboard user vẫn hiện đủ). Đã nối tiếp các lệnh gọi qua 1 promise chain.
- [x] **Fix Dừng không cắt được bài đăng/comment (v1.0.149)**: root cause là `injectText()` nuốt luôn lỗi "Đã dừng đăng" (catch-all để fallback paste), và `waitFor()`/`commentOnPost()` không kiểm tra cờ dừng — content script cứ tiếp tục gõ/đăng dù background.js đã coi job "stopped". Đã sửa cả 3 điểm. **Chưa test thật trên FB** — cần Tony xác nhận bấm Dừng giữa chừng có cắt kịp không, và comment "Nhanh" chạy tuần tự/lên lịch có còn bị "chết" (treo) không.

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
- [x] Picker chọn nhóm mục tiêu, dedup theo `radarSeenPostIds`, giới hạn nhóm/lượt quét, cảnh báo trong trang, mark đã xem/xóa/tìm kiếm/lọc/xuất CSV-JSON lead — v1.0.176 (xem CHANGELOG)
- [x] Nút "Lên lịch" hết bắt buộc chọn nhóm trước (giống Dàn) — bỏ qua bài chưa có nhóm lúc chạy thay vì chặn lên lịch + nút "Tải file mẫu Excel" đúng cột `parseWorkbook()` cần — v1.0.177 (xem CHANGELOG)
- [x] Tab Comment: đổi tên "Mẫu" → "Mẫu bình luận" (dropdown + tag), thêm filter Bình luận (Đã/Chưa comment/Tất cả) dùng chung cho bài của mình lẫn đồng đội, bỏ list lịch lặp lại riêng (dùng tag + nút Hủy lịch ngay trên bài) — v1.0.178 (xem CHANGELOG)
- [x] Tag lịch trên card Tạo bài phản ánh đúng lịch lặp lại hàng ngày (bỏ list riêng `#postDailyScheduleList`) — v1.0.179 (xem CHANGELOG)
- [x] Bài chưa có mẫu bình luận tự random 1 mẫu từ Settings ngay khi tải danh sách (`autoFillMissingCommentDrafts`) — v1.0.180 (xem CHANGELOG)
- [x] Footer Tạo bài bỏ nút "Dàn" + ô ngày/giờ rời, hợp nhất còn 1 nút "Lên lịch đã chọn" giống footer Comment — v1.0.181 (xem CHANGELOG)
- [x] Mẫu bình luận mặc định: 10 dòng × 5 câu spintax/dòng (đồng bộ `commentTemplates.js` + `background.js`) — v1.0.182 (xem CHANGELOG)
- [x] Fix mẫu mặc định mới không hiện cho user đã lưu Cài đặt trước đó — tự nâng cấp giá trị storage khớp mẫu cũ (`migrateLegacyCommentTemplates`) — v1.0.183 (xem CHANGELOG)
- [x] Fix auto-fill mẫu bình luận spin sẵn thành 1 câu cố định thay vì giữ nguyên cụm spintax để spin lại mỗi lần chạy — v1.0.184 (xem CHANGELOG)

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
