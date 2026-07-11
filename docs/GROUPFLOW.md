# GroupFlow — Chrome Extension FB Group

**v1.0.242 — Fix lịch "lặp lại hàng ngày" chạy thật 2 lần, đăng 2 comment giống hệt nhau (2026-07-10):** Tony gửi ảnh 1 bài bị comment lặp đúng 1 dòng ("Cảm ơn bạn nhiều lắm") 2 lần cách nhau vài phút — đã reload bản vá giãn cách v1.0.237 rồi mà vẫn xảy ra, bài dùng lịch đặt trước (không phải bấm tay) → bug khác. Root cause: `tickDailyFixedSchedules()` được gọi từ 2 nguồn độc lập (alarm `gf_comment_daily` mỗi phút + `chrome.runtime.onStartup`), không có khoá chống chồng lấp — hàm chỉ ghi `pendingRunDate` trở lại storage ở CUỐI hàm, nên 2 lời gọi chồng nhau có thể cùng đọc thấy 1 entry "chưa pending" và cùng enqueue chạy thật → 2 comment giống hệt (cùng 1 entry, không phải spintax random ra khác nhau). Fix: `_claimedDailyEntries` (Set trong bộ nhớ, check-and-claim đồng bộ theo `entryId_ngày`) — cùng pattern `_claimedAlarms` đã có cho lịch "1 lần cụ thể" nhưng trước đây không phủ tới đường "lặp lại hàng ngày". Xem đủ chi tiết ở `CHANGELOG.md`.

**v1.0.241 — Giới hạn thiết bị/license key theo plan + bắt buộc số điện thoại đăng ký (2026-07-10):** Tony hỏi license key hiện có phân biệt máy không — xác nhận KHÔNG (1 key dùng vô hạn máy cùng lúc). Chốt: giới hạn theo plan (free=1/pro=3/enterprise=10), đồng thời public gói free đổi lại thu thập số điện thoại người dùng thật thay vì chỉ email. Chi tiết đầy đủ ở mục **"Giới hạn thiết bị theo plan + số điện thoại bắt buộc lúc đăng ký"** bên dưới (migration 043/044) và `CHANGELOG.md`.

**v1.0.240 — Fix "Hủy lịch đã chọn" (Tạo bài) báo sai + lịch tự mọc lại sau khi hủy (2026-07-10):** tag lịch "Đăng: ..." trên card Tạo bài (`postScheduleTagHtml()`) đọc thẳng `p.ngay_dang`/`p.gio_dang` trên post — **khác nguồn** với `state.postScheduleMap` (đọc từ `activityUpcoming`/`dailyFixedSchedules`) mà `cancelSelectedPostSchedules()` (v1.0.239) dùng để phát hiện "có lịch hay không". 2 nguồn lệch nhau khiến hủy hàng loạt báo sai "chưa có lịch". Nghiêm trọng hơn: dù hủy đúng `activityUpcoming`/alarm, nếu KHÔNG xoá `ngay_dang`/`gio_dang` trên post thì `reconcileQueueSchedules()` (`background.js`, chạy mỗi phút) coi post "vẫn có lịch nhưng thiếu activityUpcoming khớp" rồi tự tạo lại — hủy xong lịch tự mọc lại, hoặc nếu giờ đã trôi qua thì **tự chạy ngay** (khớp hiện tượng "chưa tới lịch đã chạy, lịch vẫn còn đó"). Fix: coi `ngay_dang`/`gio_dang` là tín hiệu chính (đúng nguồn tag), khi hủy dọn cả `activityUpcoming` (theo `postId`, bắt luôn bản trùng + `generate_image` liên quan) lẫn 2 field này trên post. Xem đủ chi tiết ở `CHANGELOG.md`.

**v1.0.239 — Hủy lịch hàng loạt (2026-07-10):** trước bản này chỉ có "Lên lịch đã chọn" (tick nhiều bài → 1 nút) ở cả tab Tạo bài lẫn Comment, hủy thì phải làm từng bài một (nút "🗑 Hủy lịch" trên card Comment, tag "🔁 hàng ngày"/"Đăng: ..." trên card Tạo bài, hoặc Log → Sắp tới). Thêm nút **"🗑 Hủy lịch đã chọn"** cạnh "Lên lịch đã chọn" ở cả 2 footer — `cancelSelectedCommentSchedules()`/`cancelSelectedPostSchedules()` (`sidepanel.js`) dùng lại đúng checkbox chọn bài sẵn có + `state.commentScheduleMap`/`state.postScheduleMap` để biết bài nào đang có lịch (1 lần hay lặp lại hàng ngày), rồi gọi lại đúng hàm hủy per-item sẵn có (`cancelUpcoming()`/`cancelDailyFixedSchedule()`) cho từng bài — không phải cơ chế hủy mới.

**v1.0.238 — Fix đăng bài/comment vào Nhóm bằng Fanpage sai danh tính khi chạy tự động (2026-07-10):** Tony hỏi "fanpage đăng bài hoặc comment bài viết trong nhóm đó nhưng hình như không được mặc dù tao đăng bằng tay được". Root cause: Facebook nhận biết bạn đang "hoá thân" Page nào qua cookie `i_user` — `preparePostActorCookie()` (`background.js`, set thẳng cookie này bằng `chrome.cookies.set()`) trước đây **chỉ được gọi cho đúng 1 luồng: đăng bài Cổ điển**. Comment (cả Nhanh lẫn Cổ điển) và đăng bài Nhanh (đường thử TRƯỚC, phổ biến nhất) chưa từng gọi hàm này — chạy với actor cookie hiện có trong trình duyệt (thường lệch/cũ) thay vì đúng actor đã lưu trong job lúc lên lịch/bấm Chạy. "Đăng tay được" chỉ đúng vì lúc đó user vừa tự bấm đổi actor (cookie tạm thời đúng) — job tự động chạy sau đó không đảm bảo cookie còn giữ nguyên. Fix: gọi `preparePostActorCookie()` ngay đầu `commentOnPostBgOrClassic()` và `postGroupItem()` — mọi luồng (Nhanh/Cổ điển × đăng/comment) đều tự set đúng actor trước khi chạy. Xem đủ chi tiết ở `CHANGELOG.md`. Xem thêm mục **"Chuyển Cá nhân / Fanpage"** bên dưới cho kiến trúc actor nói chung.

**v1.0.237 — Fix comment theo lịch chạy dồn dập, không rải đều đúng lịch đã đặt (2026-07-10):** Tony gửi ảnh Log: 2 bài đặt lịch cách nhau 15 phút (16:23, 16:38) nhưng thực tế comment chạy cách nhau chỉ ~4 phút — hỏi "sao comment liên tục vậy không theo lịch". Nguyên nhân: giãn cách `betweenComments`/`betweenPosts` (theo mức bảo mật) trước đây chỉ áp dụng lúc TẠO lịch và lúc CHẠY BÙ hàng loạt (`retryMissedActivity()`), **không** áp dụng cho alarm THẬT (`gf_cmt_*`/`gf_job_*`) tự bắn qua `chrome.alarms.onAlarm` — đường phổ biến nhất khi máy/Chrome bị treo (ngủ, service worker bị Chrome tạm ngưng rồi thức dậy) khiến nhiều alarm quá hạn bắn gần như liền nhau, mỗi alarm tự chạy ngay không chờ gì cả. Thêm `runSpacedJob()` (`background.js`) — 1 điểm giãn cách dùng chung cho MỌI job LỊCH (alarm thật lẫn chạy bù, cả 2 đều đi qua `runScheduledJob()`): job đầu tiên chạy ngay, job kế tiếp trong cùng đợt dồn cục phải chờ đủ khoảng theo `securityLevel` kể từ khi job trước CHẠY XONG. Không ảnh hưởng hành động bấm tay (▶ Chạy/▶ Bot/Đăng ngay vẫn chạy ngay lập tức theo đúng ý user). Chi tiết root cause đầy đủ: `CHANGELOG.md`.

**v1.0.202 — Tách tab Comment thành "Của tôi"/"Đồng đội" + bỏ hẳn auto-schedule (2026-07-04):** Tony chốt thiết kế lại toàn bộ tab Comment sau chuỗi hỏi-đáp về comment_target/lịch tự sinh: "thay đổi UI thiết kế ra 2 tab 1 của tôi tab 2 đồng đội... bỏ cơ chế set auto lịch luôn vì chức năng này mang tính áp đặt, để lịch user tự set".

**2 tab con (`.segmented`/`data-comment-sub`, `setCommentSubTab()` — `sidepanel.js`):**
- **"Của tôi"** (mặc định) — chỉ bài `_source !== 'cross'` (local + server-của-mình). **Không còn filter "Người"** — control `#commentFilterPerson`/datalist bị ẩn hẳn (`#commentPersonFilterWrap.hidden`) vì không còn ý nghĩa khi đã ở đúng tab của mình. 3 filter còn lại (Mẫu bình luận/Lịch/Bình luận) giữ nguyên.
- **"Đồng đội"** — chỉ bài `_source === 'cross'`. Filter "Người" (gõ-tìm, hiện `(N)` = số bài, xem v1.0.199) chỉ hiện ở tab này — bỏ hẳn 2 pseudo-option "Tất cả"/"Của tôi" cũ (đã là 2 tab riêng, không cần lặp lại khái niệm), để trống ô = xem hết đồng đội.

`getFilteredComments()` lọc theo `state.commentSubTab` TRƯỚC các filter khác. Empty-state cũng sửa theo — so `state.comments` với đúng nguồn của tab đang xem (trước đây so cả 2 nguồn gộp chung, dễ báo nhầm "không khớp bộ lọc" khi thực ra tab đó chưa có bài nào).

**Bỏ hẳn auto-schedule (không phải sửa nhỏ, xoá thẳng cơ chế):**
- `autoScheduleUnscheduledComments()` (`sidepanel.js`, tồn tại từ v1.0.185, sửa đi sửa lại qua v1.0.192/194/196) — **xoá hẳn hàm** + điểm gọi trong `loadPostedPostsForComment()`. Trước đây: bài nào chưa có lịch, chưa từng comment thì tự động xếp lịch "1 lần cụ thể" cách nhau 15 phút mỗi khi mở/làm mới tab Comment.
- `runFlow1BackgroundSync()` (`background.js`, từ v1.0.187/192) — xoá hẳn 2 vòng lặp tự-lên-lịch (cross-post + `postQueue` của chính mình), giữ lại đúng phần fetch + cache `crossPostsCache` (vẫn cần để tab Đồng đội có dữ liệu mới khi mở lên, không liên quan tới việc tự lên lịch). Hàm giờ chỉ trả `{fetched, cached}` (bỏ field `scheduled` không còn ý nghĩa — dọn theo ở `syncFromTidien()`, biến `postsScheduled` cũng bỏ vì không nơi nào đọc).
- `dedupeUpcomingCommentAlarms()` **giữ nguyên** (an toàn chung, không riêng gì auto-schedule) dù rủi ro gốc nó vá (2 auto-scheduler độc lập đụng nhau) không còn — không có gì tự tạo lịch song song với thao tác tay của user nữa nên về lý thuyết không còn cần thiết, nhưng vẫn rẻ và vô hại nếu giữ làm lưới an toàn.

**v1.0.201 — Bỏ giới hạn "comment_target" khi comment chéo (2026-07-04):** Tony hỏi "comment target là gì, ai đặt số này" rồi chốt luôn: "1 bài ai thích comment bao nhiêu là tùy chứ mắc gì đặt comment target thiết kế này để làm gì — không giới hạn". Trả lời phần hỏi trước khi sửa: `comment_target` là hằng số cứng `DEFAULT_COMMENT_TARGET = 5` trong `groupPostService.js` (từ đợt "Định nghĩa lại 3 flow" v1.0.187) — gán chết cho MỌI bài lúc `upsertUserPost()`, cột DB cũng default 5 (migration 039) — **chưa từng expose ra Settings/UI nào**, không ai chọn số này qua sản phẩm cả, chỉ là default lúc implement.

**Đã bỏ vai trò gate:** `GET /api/user-sync/cross-posts` (`userSync.js`) trước đây có điều kiện `comment_count < comment_target` — 1 bài đủ 5 người khác nhau comment là biến mất khỏi cross-posts của **TẤT CẢ mọi người**, kể cả người chưa từng comment bài đó. Bỏ hẳn điều kiện này khỏi WHERE. Điều kiện duy nhất còn lại quyết định 1 bài còn hiện với 1 người hay không là `NOT EXISTS (chính người đó đã comment)` — tức bài chỉ ẩn khỏi cross-posts của **CHÍNH người đã comment nó**, không còn đóng lại cho người khác. Bỏ theo check tương ứng `Number(cp.comment_count) >= Number(cp.comment_target || 1)` ở `runFlow1BackgroundSync()` (`background.js`) — nếu không, phía extension vẫn tự chặn auto-schedule dù server đã cho phép, gây lệch hành vi 2 bên. `needs_comment` trong response giờ luôn `1` (đúng về logic: nếu 1 bài được trả về nghĩa là requester chắc chắn chưa comment nó — do NOT EXISTS đã lọc). Giữ nguyên cột `comment_target`/`comment_count` trong DB — vẫn đếm/hiển thị được (website `/groups`, `GroupPostDetailModal.jsx` chỉ hiện `comment_count` làm số liệu thống kê, không hiện "X/Y" nên không có gì cần sửa ở frontend) — chỉ bỏ đúng phần dùng nó để KHOÁ bài lại.

**v1.0.200 — Fix tag "Chưa có nhóm" sai trên lịch comment ở "Sắp tới" + lý giải lệch số "Sắp tới" vs badge Comment (2026-07-04):** Tony gửi ảnh Log → Sắp tới có 3 lịch comment (16:10/16:25/16:40, cách nhau đúng 15 phút — dấu hiệu của auto-schedule) nhưng tab Comment chỉ hiện 2 bài + badge "2", hỏi tại sao lệch.

**Nguyên nhân lệch số — không phải đếm sai:** `reconcileQueueSchedules()` (`background.js:1673`) — hàm duy nhất đối chiếu lịch đã tạo với dữ liệu hiện có — chỉ xử lý `kind:'post'` (lịch đăng bài), hoàn toàn không có nhánh tương tự cho `kind:'comment'`. Nghĩa là: lịch comment được tạo ra dựa trên 1 bài đang có mặt trong `state.comments` TẠI THỜI ĐIỂM tạo lịch, nhưng sau đó nếu bài đó rớt khỏi danh sách Comment (ví dụ bài cross-post đã bị người khác comment đủ `comment_target`, lần tải `/cross-posts` sau server không trả về nữa) thì **lịch đã tạo không hề bị dọn theo** — vẫn nằm nguyên trong `activityUpcoming` ("Sắp tới") và vẫn sẽ tự chạy đúng giờ (payload lưu sẵn đủ `group_id`/`post_id`/`comment` nên không phụ thuộc bài đó còn hiển thị hay không). Badge tab Comment (`state.comments.filter(c => !isCommentDone(c)).length`, xem `loadPostedPostsForComment()`) chỉ đếm bài ĐANG CÒN trong `state.comments` — nên "Sắp tới: 3" (gồm 1 lịch đã "mồ côi") vs "Comment: 2" (chỉ còn 2 bài thật trong pool) là đúng theo dữ liệu hiện có ở 2 nguồn khác nhau, không phải bug đếm nhầm. Không auto-huỷ lịch mồ côi này — payload tự chứa đủ thông tin nên chạy vẫn an toàn (chỉ dư 1 lượt comment, đúng tinh thần "đẩy bài" — nhiều comment không phải lỗi); huỷ tự động rủi ro hơn vì cache cross-post là tải tăng dần theo cursor, 1 bài "không thấy trong lần tải này" chưa chắc đã thật sự hết hạn.

**Bug thật phát hiện thêm khi soi chỗ này:** mọi dòng lịch **comment** trong "Sắp tới" đều hiện cứng `"Chưa có nhóm"` dù nhóm thật đã có sẵn — `renderActivity()` (`sidepanel.js`) tính nhóm hiển thị qua `formatGroupList(u.groupIds || u.payload?.posts?.[0]?.groupIds)` — đúng cấu trúc payload của lịch **đăng bài** (`payload.posts[].groupIds`, mảng), nhưng payload lịch **comment** (`scheduleCommentJobsOnce()`) lưu `group_id`/`group_name` dạng đơn, không phải mảng `groupIds` hay có field `posts` — nên luôn khớp `undefined`, rơi vào "Chưa có nhóm". Thêm `upcomingGroupLabel(u)` tách nhánh riêng cho `kind==='comment'`, đọc đúng `payload.group_name`/`payload.group_id`.

**v1.0.199 — Filter "Người" gõ-tìm được + hiện số bài, fix dropdown "Mẫu bình luận" bị cắt chữ, làm rõ tag "📌 Đăng …" (2026-07-04):** Tony gửi 3 ảnh chụp — 2 tài khoản khác nhau (`ngohuuchung9@gmail.com` badge Comment "5", `supperadmin@gmail.com` badge "14") thấy dropdown "Người" khác nhau (1 cái chỉ có "Tất cả"/"Của tôi", cái kia có thêm "NGO HUU CHUNG"), hỏi có phải bug phân quyền + báo dropdown "Mẫu bình luận" nhìn lỗi + thắc mắc sao chạy comment xong lịch lặp hàng ngày lại "tự sửa".

**Việc 1 — không phải bug phân quyền:** `populateCommentFilterPersonOptions()` (`sidepanel.js`) xây danh sách "Người" từ đúng `_userLabel` xuất hiện trong `state.comments` (dữ liệu ĐÃ TẢI VỀ máy này qua `/api/user-sync/cross-posts`) — không phải danh sách toàn bộ user trong hệ thống. Backend (`routes/userSync.js` `GET /cross-posts`, `middleware/licenseAuth.js`) đã rà lại kỹ, không có chỗ nào phân biệt theo role/plan — mọi license key được đối xử như nhau. 2 tài khoản thấy danh sách khác nhau đơn giản vì lúc đó mỗi máy tải về 1 tập bài "còn mở để comment chéo" khác nhau (phụ thuộc `comment_count < comment_target` + `visible_after` + đã tự comment hay chưa của CHÍNH tài khoản đó) — không phải ai đó bị chặn quyền xem.

**Việc 2 — dropdown "Mẫu bình luận" bị cắt chữ (bug UI thật):** `.post-filter-bar .gf-select-sm { max-width: 110px }` (sidepanel.css) dùng chung cho mọi select filter, kể cả 4 filter tab Comment có nhãn dài hơn hẳn "Nhóm:"/"Ảnh:" ở tab Tạo bài (nơi rule 110px được viết ra ban đầu) — "Mẫu bình luận: Tất cả" bị cắt chỉ còn thấy `Mẫu bình luận:` kèm mũi tên, nhìn như control hỏng. Thêm rule riêng `#tab-comment .post-filter-bar .gf-select-sm` (không giới hạn max-width, min-width 150px, `flex: 1 1 calc(50% - 6px)` — chia đều 2 filter/hàng khi wrap thay vì cắt chữ).

**Việc 3 — filter "Người" giờ gõ-tìm được + hiện số bài:** đổi `#commentFilterPerson` từ `<select>` sang `<input list="commentFilterPersonList">` + `<datalist>` (native, không cần tự viết dropdown riêng — trình duyệt tự lọc gợi ý theo chuỗi con khi gõ). Mỗi tên hiện kèm `(N)` = số bài của người đó **đang có trong danh sách đã tải** (không phải tổng mọi bài họ từng đăng — giới hạn kỹ thuật vì `/cross-posts` chỉ trả bài còn "mở" cho mình, không phải toàn bộ lịch sử người đó). Logic khớp (`resolveCommentFilterPersonInput()`): gõ đúng "tất cả"/"của tôi" (không dấu cũng được) → 2 chế độ cũ; gõ khớp DUY NHẤT 1 tên (kể cả gõ dở, so chuỗi con) → áp filter theo người đó ngay, không cần bấm chọn; mơ hồ (0 hoặc ≥2 khớp) → giữ nguyên filter đang áp, chờ gõ tiếp. `getFilteredComments()` không đổi logic filter, chỉ đổi cách nhập.

**Việc 4 — không phải bug, chỉ là UI dễ hiểu lầm:** tag thời gian dạng "12:23:38 2/7/2026" nằm ngay cạnh tag "🔁 15:00 hàng ngày" trên card KHÔNG liên quan tới lịch lặp — đó là `c.lastPostedAt` (lúc bài GỐC được đăng lên Facebook, cố định từ lúc đăng, không đổi theo lịch/kết quả comment sau này), chỉ tình cờ nằm sát tag lịch nên nhìn như "chạy xong tự sửa giờ lịch". Đổi format gọn lại bằng `formatScheduleWhen()` (nhất quán với các tag giờ khác trong app, bỏ giây) + thêm tiền tố `📌 Đăng` và `title` tooltip "Bài gốc đăng lên Facebook lúc này — không đổi theo lịch comment" để tách rõ khỏi tag lịch.

**v1.0.217 — Tag giờ đăng/lịch đổi sang định dạng VN (HH:mm dd/mm/yyyy):** Tony yêu cầu tag "Đăng: ..." (card Tạo bài, `postScheduleTagHtml()`) và tag "🕒 .../📌 Đăng ..." (tab Comment, `formatScheduleWhen()`) hiện đúng kiểu giờ:phút ngày/tháng/năm quen thuộc VN thay vì "YYYY-MM-DD HH:mm" kiểu ISO dễ đọc nhầm ngày/tháng. Thêm `formatNgayGioVn()` chuyển `ngay_dang`/`gio_dang` (lưu nội bộ dạng "YYYY-MM-DD"/"HH:mm", không đổi) sang chuỗi hiển thị mới; sửa `formatScheduleWhen()` sang cùng format — áp dụng luôn cho "✓ Đã comment · giờ" (`lastCommentedAtLabel()`) vì dùng chung hàm. Không đụng `scheduleWhenInputValue()` (bắt buộc giữ ISO cho input `datetime-local` của trình duyệt).

**v1.0.198 — Fix 1 lịch comment "1 lần cụ thể" chạy 2 LẦN, sinh 2 comment cùng phút (2026-07-04):** Tony gửi ảnh chụp tab Log thấy 2 dòng comment liên tiếp cùng phút (`15:17 04-07`), cùng 1 bài, nội dung khác nhau (spintax random mỗi lần chạy) — đúng bug thật, không phải hiển thị trùng.

**Root cause:** lịch "1 lần cụ thể" (`activityUpcoming`, alarm `gf_cmt_*`/`gf_job_*` qua `chrome.alarms`) có **2 đường độc lập** cùng có thể chạy nó, không đường nào biết đường kia đã/đang xử lý:
1. Alarm thật tự bắn đúng giờ → `chrome.alarms.onAlarm` đọc `alarm_<tên>` từ storage, chạy job, xoá `alarm_<tên>` sau khi xong.
2. `retryMissedActivity()` (alarm `gf_retry_missed`, tick mỗi phút — cơ chế "chạy bù" cho job bị lỡ khi máy tắt/Chrome đóng giữa chừng, xem v1.0.192 mục 3) quét `activityUpcoming`, coi **BẤT KỲ** item nào có `when <= now` là "đã lỡ hẹn", chạy ngay qua `runScheduledJob()`.

`chrome.alarms` **không đảm bảo bắn đúng giờ** (tài liệu Chrome: có thể trễ vài giây tới cả phút, nhất là sau khi service worker bị idle-unload rồi thức dậy) — nên rất dễ xảy ra: `gf_retry_missed` quét thấy `when` đã qua (vì alarm thật chỉ mới trễ, CHƯA thật sự bắn) → chạy job đó qua nhánh "chạy bù" → xong, xoá khỏi `activityUpcoming`. Nhưng alarm thật **vẫn còn tồn tại trong `chrome.alarms`** (trước bản này không ai `clear()` nó) và **payload `alarm_<tên>` vẫn còn trong storage** (trước bản này `retryMissedActivity()` không xoá) — nên khi alarm thật tự bắn ngay sau đó, `onAlarm` đọc lại đúng payload còn nguyên, chạy job **lần thứ 2** → 2 comment thật lên Facebook, cách nhau vài giây tới vài chục giây (đúng hiện tượng "2 dòng Log cùng phút, nội dung random khác nhau" Tony thấy).

**Fix:** thêm `GF_BG._claimedAlarms` — `Set` trong bộ nhớ, check-and-claim **đồng bộ** (trước bất kỳ `await` nào) ở cả 2 nơi, nên 2 lần gọi (dù Chrome dispatch gần như cùng lúc) không thể cùng lọt qua: nơi nào tới trước claim được thì chạy, nơi tới sau thấy đã bị claim thì bỏ qua (giữ nguyên trong `activityUpcoming`, sẽ tự được `removeUpcomingByAlarmName()` dọn khi job kia chạy xong). Nếu job chạy bù thất bại (`ok === false`), nhả claim ra (`delete`) để lượt sau còn được thử lại — không tự khoá cứng job đó vĩnh viễn. Thêm `retryMissedActivity()` tự `chrome.alarms.clear(alarmName)` + xoá `alarm_<alarmName>` ngay khi chạy bù THÀNH CÔNG — nguồn gốc thật của bug, vì trước đây chỉ dọn `activityUpcoming`, không dọn alarm gốc. `_claimedAlarms` chỉ sống trong 1 phiên service worker (mất khi restart) — đủ dùng vì race chỉ xảy ra trong cùng phiên (2 alarm cùng active).

**v1.0.197 — Hiện giờ comment lần cuối trên tag "✓ Đã comment" (2026-07-04):** Tony hỏi hệ thống có biết giờ comment gần nhất của 1 bài không. Có — `commentedRecords` (`chrome.storage.local`, key `post_queue_id` → `{group_id: timestamp}`, ghi bởi `markCommentDoneLocal()` — `background.js` — ngay lúc comment thành công) đã lưu timestamp sẵn, chỉ chưa từng hiện ra UI. Thêm `lastCommentedAtLabel(c)` (`sidepanel.js`) — lấy mốc `Math.max()` trong số các nhóm của bài (nếu nhiều nhóm comment lệch giờ), format qua `formatScheduleWhen()` (dùng chung format với tag lịch) — hiện ngay trên tag: `✓ Đã comment · 2026-07-04 15:49`. Nếu bài đó bị dọn khỏi `commentedRecords` (cap 3000 bài gần nhất, xem `markCommentDoneLocal()`) thì mất riêng phần GIỜ hiển thị (trả về `''`, tag chỉ còn "✓ Đã comment" không giờ) — nhưng trạng thái "đã comment" của tag vẫn đúng vì `isCommentDone()` còn 2 nguồn dự phòng khác (`firstCommentOk` cho bài của mình, `_needsComment` server cho bài cross) không phụ thuộc `commentedRecords`.

**v1.0.196 — Đảo ngược 1 phần v1.0.194: auto-lên-lịch comment chỉ cho bài CHƯA TỪNG comment (2026-07-04):** sau khi triển khai v1.0.194 (bỏ hẳn điều kiện "đã comment" khỏi auto-lên-lịch), Tony test trên máy thật thấy bài **VỪA comment xong** bị tự động set 1 lịch mới gần như ngay lập tức, phản ứng "hình như mày comment xong là mày không biết mày đi set lịch lại... comment xong rồi thì thôi chứ". Nguyên nhân: lịch "1 lần cụ thể" chạy xong bị xoá khỏi `activityUpcoming` (đúng thiết kế — coi như xong nhiệm vụ) → lượt tự-lên-lịch kế tiếp (tick nền `gf_tidien_sync` hoặc mở lại tab Comment) lại thấy bài này "chưa có lịch local" → set lại liền (+15 phút) vì v1.0.194 đã bỏ hết điều kiện chặn theo trạng thái đã-comment. Tony chốt: auto-lên-lịch chỉ nên là **"mồi lần đầu"** cho bài chưa từng comment — không phải cơ chế tự-đẩy-lại vô thời hạn mỗi khi lịch cũ chạy xong. Muốn đẩy tiếp bài đã comment thì phải **chủ động** (tự tay "+ Lên lịch"/"▶ Chạy", hoặc set "Lặp lại hàng ngày" — loại này tự tái diễn theo đúng bản chất của nó, không tính là "auto-lên-lịch mới").

Khôi phục lại đúng như trước v1.0.194: điều kiện `!isCommentDone(c)` trong `autoScheduleUnscheduledComments()` (`sidepanel.js`), và check `commentedRecords[jobId]` (cross-post) + lọc `pendingGroups` theo `commentedRecords` (bài của chính mình) trong `runFlow1BackgroundSync()` (`background.js`). **Giữ nguyên phần đúng của v1.0.194**: `runComment()` vẫn KHÔNG chặn "job trùng lặp" lúc CHẠY THẬT — một khi 1 lịch đã tồn tại (dù được tạo tự động lần đầu hay tự tay), nó vẫn phải chạy thật khi tới giờ, kể cả nếu bài đó lỡ đã được comment bởi đường khác trước đó (rule "lịch đã lên mà chưa chạy thì vẫn phải chạy" — không đổi, không liên quan tới việc CÓ SET lịch mới hay không).

**v1.0.195 — Chặn máy tự ngủ khi đang chạy lịch (2026-07-04):** Tony hỏi "có cách nào không cho máy ngủ khi đang chạy không?" — sau khi làm rõ chuỗi hành vi lịch/chạy bù (v1.0.192-194) thì vấn đề còn lại là tầng dưới cùng: lịch nào cũng cần máy đang chạy để `chrome.alarms` đánh thức service worker đúng giờ — nếu Windows tự vào **sleep/suspend** (idle timeout mặc định), toàn bộ dừng cứng tới khi có người mở máy lại (dù có `retryMissedActivity()` chạy bù, vẫn trễ tới lúc đó). Thêm quyền `power` (`manifest.json`) + `chrome.power.requestKeepAwake('system')` gọi ở top-level `background.js` — chặn Windows tự ngủ do idle, không ép sáng màn hình (mức `'system'`, không phải `'display'`). Gọi lại mỗi khi service worker (re)start nên tự tái khẳng định, không cần logic release/renew riêng. **Giới hạn:** không chặn được nếu user chủ động bấm Sleep/đóng nắp laptop — chỉ chặn sleep tự động do không thao tác.

**v1.0.192 — Tự lên lịch comment cho bài chưa có lịch + chạy bù lịch bị lỡ khi mở lại máy (2026-07-04):** Tony: "bài nào chưa set lịch ở local thì tự động set lịch theo rule, nếu bài đó set lịch rồi mà chưa chạy cho thì phải chạy lại khi mở máy, chú ý là phải chạy tuần tự theo hệ thống không được chạy 1 lần nhiều tác vụ." Phạm vi đã chốt cùng Tony: chỉ lịch **comment** (không đụng lịch đăng bài), "mở máy" = mở lại Chrome/máy tính sau khi tắt hẳn, rule xếp lịch giữ nguyên như cũ.

1. **Bug thật phát hiện thêm khi sửa** (không phải yêu cầu của Tony, nhưng nằm đúng chỗ đang sửa): `runFlow1BackgroundSync()` (background.js) — hàm nền tự lên lịch comment cho bài đồng đội (cross-post) — có dòng cuối ghi `bgAutoScheduledCrossIds: [...scheduledIds]` với `scheduledIds` **không hề tồn tại trong scope hàm** (tàn dư cách làm cũ đã bỏ từ v1.0.188, xem chú thích cũ). Mỗi lần hàm tự xếp lịch được ≥1 bài mới (`scheduled > 0`) là ném `ReferenceError`, khiến `activityUpcoming` mới **không được lưu** dù alarm + `alarm_<name>` đã tạo thật — chu kỳ nền sau không thấy bài đã có lịch (vì check dựa vào `activityUpcoming`), tự tạo thêm alarm trùng cho đúng bài đó mỗi lần chạy (may mắn không đăng trùng thật lên FB vì lớp chặn `commentedRecords` ở `runComment()` vẫn chặn được job thứ 2 trở đi — nhưng rác alarm cứ tích luỹ, và toast báo lỗi "scheduledIds is not defined" xuất hiện âm thầm). Xoá hẳn dòng ghi key chết này.
2. **Auto-schedule mở rộng sang bài của chính mình**: `runFlow1BackgroundSync()` trước đây chỉ tự lên lịch comment cho bài **đồng đội** (cross-post, từ v1.0.187) — bài **của chính mình** (`postQueue`, đã đăng lên ít nhất 1 nhóm) chỉ được lên lịch khi user tự mở tab Comment (`autoScheduleUnscheduledComments()`, sidepanel.js) — máy nào ít mở tab đó thì bài tự đăng xong không bao giờ được tự lên lịch comment dù đủ điều kiện. Giờ quét thêm `postQueue` ngay trong cùng chu kỳ nền, dùng chung `alreadyScheduledIds`/`commentedRecords` nên không tạo lịch trùng với lịch tay ở sidepanel — mỗi group còn thiếu comment của 1 bài được xếp riêng 1 alarm, nối tiếp bằng cùng độ trễ `betweenComments` (rule đã có, giữ nguyên).
3. **Chạy bù lịch bị lỡ khi mở lại Chrome/máy** — 2 loại lịch, xử lý khác nhau vì tín hiệu "chưa chạy" đáng tin cậy khác nhau:
   - **Lịch "1 lần cụ thể"** (`activityUpcoming`): tín hiệu đã đáng tin cậy sẵn — item chỉ bị xoá khỏi mảng SAU KHI chạy xong không lỗi (`removeUpcomingByAlarmName()`). Tách logic "chạy bù" (trước đây nằm cứng trong nhánh `gf_retry_missed` của `chrome.alarms.onAlarm`) ra hàm dùng lại được `retryMissedActivity()`, gọi cả từ alarm (mỗi phút, như cũ) **và** từ `chrome.runtime.onStartup` (ngay lúc mở lại Chrome, không chờ alarm tự nổ).
   - **Lịch "Lặp lại hàng ngày"** (`dailyFixedSchedules`) — **lỗ hổng thật**: `tickDailyFixedSchedules()` đánh dấu `lastRunDate = today` NGAY LẬP TỨC, TRƯỚC KHI job thật sự chạy xong (chỉ đưa vào hàng đợi `enqueueTask`, có delay vài giây) — nếu Chrome/máy tắt đúng lúc giữa 2 bước này, `lastRunDate` đã lỡ ghi "hôm nay xong" dù **chưa hề đăng comment thật** — hôm đó mất trắng, không cách nào phát hiện lại, đợi đúng giờ này NGÀY MAI mới chạy tiếp. Sửa: tách `pendingRunDate` (đánh dấu "đã nhận, đang chờ tới lượt" — set NGAY, vẫn chặn tick trùng trong cùng phiên) khỏi `lastRunDate` (đánh dấu "chạy XONG thật" — chỉ set SAU khi `runComment()`/`runPostMatrix()` hoàn tất, hàm mới `markDailyScheduleDone()`). Hàm mới `recoverStalledDailySchedules()`, gọi CHỈ lúc `chrome.runtime.onStartup` (phiên MỚI — bất kỳ "pending" nào của phiên trước chắc chắn đã dở dang) — xoá `pendingRunDate` không khớp `lastRunDate`, để `tickDailyFixedSchedules()` (gọi ngay sau, cùng trong onStartup) coi là "chưa chạy hôm nay" và chạy bù ngay.
4. **Chạy tuần tự, không chạy chồng nhiều tác vụ**: mọi hành động CHẠY THẬT (`runComment()`/`runPostMatrix()`) vẫn luôn đi qua `enqueueTask()` — 1 promise-chain dùng chung toàn extension, xử lý đúng 1 task tại 1 thời điểm bất kể nguồn gọi (alarm định kỳ, `onStartup`, user bấm tay đều xếp chung 1 hàng đợi). `chrome.runtime.onStartup` mới gọi `await` tuần tự từng bước (không bắn song song `retryMissedActivity()`/`recoverStalledDailySchedules()`/`tickDailyFixedSchedules()`/`syncFromTidien()` cùng lúc) để tránh race đọc-sửa-ghi `chrome.storage.local` giữa các bước.
5. **Giãn cách giữa các tác vụ chạy bù (2026-07-04, hỏi thêm sau khi Tony test kịch bản "1 bài đã comment, lên lịch 10h30, tắt máy, mở lại lúc 2h30 chiều")** — Tony hỏi: nếu vừa có lịch đăng bài vừa có lịch comment cùng quá hạn thì xử lý tuần tự thế nào, giãn cách mỗi tác vụ bao nhiêu? Phát hiện: mục 3 ở trên chỉ đảm bảo TUẦN TỰ (không chồng), nhưng KHÔNG có giãn cách nào giữa các tác vụ quá hạn — job sau chạy ngay khi job trước xong, có thể chỉ cách vài giây nếu nhiều lịch dồn cục sau khi máy tắt lâu, khác hẳn tốc độ "tự nhiên" (mỗi job cách nhau nhiều phút/giờ theo đúng lịch gốc) — dễ bị soi hơn do dồn cục hành động ngay lúc mở máy. Sửa cả 2 nơi chạy bù: `retryMissedActivity()` (lịch "1 lần cụ thể", `activityUpcoming`, có thể lẫn cả post lẫn comment) và `tickDailyFixedSchedules()` (lịch "Lặp lại hàng ngày", khi nhiều entry cùng quá hạn trong 1 tick) — tác vụ ĐẦU TIÊN trong lượt chạy ngay (không chờ), tác vụ thứ 2 trở đi chờ đúng `betweenPosts`/`betweenComments` (theo `securityLevel` đã cấu hình, `getSecurityDelays()` có sẵn — không tạo hằng số riêng) trước khi chạy — giống hệt tốc độ giãn cách dùng khi đăng nhiều bài/nhiều comment cùng lúc ở nơi khác trong code.

**v1.0.191 — Fix lịch "Lặp lại hàng ngày" (đẩy bài) chỉ chạy đúng 1 lần rồi tự tắt (2026-07-04):** Tony hỏi "tại cái nào đã comment rồi lại không được comment nữa? mục đích việc comment này là đẩy bài mà" — đúng là bug thật, không phải hiểu nhầm thiết kế.

**Root cause:** `runComment(job)` (background.js) có lớp chặn "job trùng lặp" (v1.0.188, xem bug ngay bên dưới) — nếu `commentedRecords[post_queue_id][group_id]` đã tồn tại (đã đăng comment thành công thật trước đó) thì bỏ qua êm, không đăng lại. Lớp chặn này ĐÚNG cho lịch "1 lần cụ thể" (đúng nghĩa 1 bài chỉ nên chạy 1 lần), nhưng lịch **"Lặp lại hàng ngày"** (`dailyFixedSchedules`, kind:`'comment'`) lại gọi chung đúng hàm này mỗi ngày — nghĩa là: ngày 1 chạy thật (ghi `commentedRecords`) → từ ngày 2 trở đi, mọi lần tick đều bị chính lớp chặn này coi là "trùng lặp" rồi im lặng bỏ qua, dù lịch vẫn hiển thị bình thường như đang hoạt động — tự triệt tiêu đúng mục đích "đẩy bài" (comment lại định kỳ để bài nổi lên) mà tính năng lặp-hàng-ngày sinh ra để làm. Tương tự, nút "▶ Chạy" tay và "Chạy đã chọn" cũng đi qua `runComment()` — bấm lại vào bài đã có tag "✓ Đã comment" trước đây cũng bị âm thầm nuốt (toast vẫn báo "Đã comment 1/1 bài" dù thực chất không đăng gì lên Facebook).

**Fix (v1.0.191):** `runComment(job, opts)` nhận thêm `opts.allowRepeat` — bỏ qua hẳn lớp chặn forever khi `true`. Áp dụng cho 3 nơi mang tính **hành động chủ động** (không phải alarm tự động nổ trùng — rủi ro gốc mà lớp chặn sinh ra để giải quyết): `tickDailyFixedSchedules()` (lịch lặp hàng ngày), `GF_RUN_COMMENT` (nút "▶ Chạy" tay), `runCommentBatch()` ("Chạy đã chọn"). **Giữ nguyên** lớp chặn cho `runScheduledJob()` (lịch "1 lần cụ thể" qua `activityUpcoming`/alarm `gf_cmt_*`) — nơi rủi ro 2 alarm trùng nổ gần nhau (bug v1.0.188) vẫn cần phòng thủ. An toàn trùng-ngày của lịch lặp hàng ngày không phụ thuộc lớp chặn này — vẫn do `entry.lastRunDate === today` (đánh dấu TRƯỚC khi chạy) đảm nhiệm riêng, không đổi.

**Đảo ngược ở v1.0.194, rồi rule (1) đảo ngược LẠI ở v1.0.196:** Tony hỏi lại "tại sao mày cứ cho là bài đã comment rồi thì không được lên lịch nhỉ? 1 bài có thể comment nhiều lần tùy thích mà" + chốt rõ 2 rule: (1) bài chưa có lịch → auto set lịch, KHÔNG quan tâm đã comment hay chưa; (2) lịch đã lên mà chưa chạy (dù trước đó đã có comment rồi) → vẫn phải chạy khi tới giờ. Rule (2) đúng là đúng chỗ lớp chặn "giữ nguyên cho `runScheduledJob()`" ở trên đang vi phạm — 1 lịch "1 lần cụ thể" đã lên nhưng chưa tới giờ, nếu bài đó lỡ được comment bởi đường khác trước đó, sẽ bị chặn "job trùng lặp" bỏ qua êm thay vì chạy thật. Đã xóa hẳn lớp chặn tại điểm chạy trong `runComment()` (không còn phân biệt theo `opts.allowRepeat` nữa — tham số này bỏ luôn, mọi nơi gọi đều chạy thật) — **giữ nguyên, đúng, không đổi lại.** Rule (1) thì SAI khi áp dụng máy móc: test thật thấy bài vừa comment xong bị tự set lịch mới gần như ngay lập tức (chạy xong → xoá khỏi local → tick tự-lên-lịch kế tiếp lại thấy "chưa có lịch"). Tony chốt lại ở v1.0.196: auto-lên-lịch chỉ dành cho bài **chưa từng comment lần nào**, không phải cơ chế tự-đẩy-lại vô thời hạn. Xem mục "Auto-lên-lịch bài chưa có lịch" bên dưới cho chi tiết rule (1) đã revert.

Đồng thời thêm xác nhận (`window.confirm`) khi bấm "▶ Chạy"/"Chạy đã chọn" lên bài đã có tag "✓ Đã comment" — tránh đăng trùng thật lên Facebook ngoài ý muốn do bấm nhầm, vì giờ hành động này sẽ **thực sự đăng lại**, không còn bị nuốt êm như trước.

**v1.0.190 — Fix "Uncaught Error: Extension context invalidated" trong content.js (2026-07-04):** Tony báo lỗi trong `chrome://extensions` → Lỗi, trace tới `content.js:208` (`chrome.runtime.sendMessage({ type: 'GF_SAVE_COMET_TOKENS', ... })`). Nguyên nhân: `chrome.runtime.sendMessage()` ném lỗi **đồng bộ** ("Extension context invalidated") ngay tại lời gọi — không phải reject bất đồng bộ — mỗi khi extension bị reload/update (qua `chrome://extensions`, hoặc tự động update) trong lúc content script cũ vẫn còn sống trên tab FB đang mở từ trước. Pattern cũ `chrome.runtime.sendMessage(...).catch(() => {})` chỉ bắt được lỗi **reject bất đồng bộ**, không bắt được lỗi **throw đồng bộ** này — `.catch()` không kịp gắn vào vì exception xảy ra ngay tại chính lời gọi, trước khi có Promise để gắn `.catch()`. Không phải bug chức năng thật (tab FB cũ chỉ cần F5 lại là hết — hành vi này vốn dĩ là expected khi reload extension), nhưng gây rác trong log lỗi và có rủi ro thật khi extension tự auto-update lúc user đang có sẵn tab FB mở nền. Thêm `gfSafeSendMessage()` (content.js) — bọc cả `try/catch` (bắt throw đồng bộ) lẫn `.catch()` (bắt reject bất đồng bộ) — thay thế toàn bộ 9 lời gọi `chrome.runtime.sendMessage` trực tiếp trong file. `modules/gfPanelShell.js` đã tự làm đúng việc này từ trước (đã có `try/catch` bọc sẵn), chỉ `content.js` là thiếu.

**v1.0.189 — Bỏ hẳn auth tidien kiểu cũ (email/password + API key) + tổ chức lại tab Cài đặt (2026-07-04):** theo yêu cầu Tony ("api key tidien đâu cần thiết nữa thì bỏ đi" + tổ chức lại bố cục Cài đặt).

**Dọn auth cũ:** field "tidien API Key" (paste thủ công, tab Cài đặt → Nâng cao) đã bỏ hẳn — đào sâu phát hiện đây là phần nổi của cả 1 cơ chế auth cũ đã chết gần hết:
- `GF.tidienAuth.login()`/`testConnection()`/`saveFbProfile()` (modules/tidienAuth.js) — **zero caller** trong toàn bộ codebase (đã grep xác nhận), xoá hẳn. Chỉ còn `apiBase()`/`authHeader()` (vẫn dùng bởi `tidienSync.js` → `pullDraftsFromWebsite()`, tính năng "Tải từ website" đang sống) — `authHeader()` giờ chỉ dùng license key, bỏ fallback `tidienApiKey`/`tidienToken`.
- `runCommentOwn()` (background.js) có 1 nhánh gọi `PATCH /api/group-posts/:id/commented` bằng token `tidienApiKey`/`tidienToken` — route này **đã bị xoá hẳn** từ đợt gộp bảng (migration 039, v1.0.187) nên nhánh này từ đó tới giờ luôn 404 âm thầm (bọc try/catch nên không lỗi ra ngoài, nhưng là dead weight gọi mạng vô ích mỗi lần). Xoá hẳn nhánh này.
- `getTidienAuth()` (background.js), `getMediaSettings()`/`tickGroupImageSchedule()` (đọc token nhưng chưa từng dùng vì `postMedia.js` chỉ cần `routerApiKey`/`tidienBaseUrl`) — dọn theo, chỉ còn license key làm danh tính duy nhất.
- `modules/storage.js` bỏ `tidienToken`/`tidienApiKey`/`tidienUser` khỏi danh sách settings.

**Tổ chức lại tab Cài đặt:** nhãn tab điều hướng "Ảnh" đổi thành "Ảnh & Comment" (khớp đúng tiêu đề card đã có sẵn — trước đó lệch nhãn, card đã gồm cả mẫu comment chéo team nhưng nhãn tab chỉ ghi "Ảnh"). Di chuyển 2 mục từ tab "Nâng cao" sang đúng chỗ liên quan hơn: **"9Router API Key"** → tab **AI Provider** (đây là fallback key cho AI, không phải "nâng cao" chung chung); **"Lịch xuất ảnh ban đêm"** → tab **Ảnh & Comment** (cùng chủ đề ảnh, tách khỏi Nâng cao không có lý do rõ ràng trước đó). Tab "Nâng cao" giờ chỉ còn "Google Drive (legacy)" — đúng nghĩa "hiếm khi cần" thay vì là nơi chứa đồ tạp nham 3 chủ đề không liên quan.

**v1.0.188 — Fix bug NGHIÊM TRỌNG: 1 bài bị comment lặp nhiều lần + panel sửa lịch hiện sai giờ (2026-07-04):** ngay sau khi triển khai `runFlow1BackgroundSync()` (v1.0.187, chạy nền), Tony phát hiện cùng 1 bài bị chính tài khoản mình comment 2-3 lần liên tiếp trong vài phút — kèm hiện tượng tag lịch trên card hiện 1 giờ nhưng bấm vào sửa lại ra giờ khác. Hoá ra là **2 bug độc lập**, cả 2 đều vá trong bản này:

**Bug 1 — trùng lịch, đăng lặp comment.** Root cause: `runFlow1BackgroundSync()` (background.js) dùng `bgAutoScheduledCrossIds` — 1 storage key **RIÊNG**, hoàn toàn tách biệt với `activityUpcoming` mà `autoScheduleUnscheduledComments()` (sidepanel.js, chạy khi mở tab Comment) ghi vào — nên user mở tab Comment (sidepanel lên lịch bài X) rồi sau đó chu kỳ nền chạy (không thấy bài X đã có lịch vì check sai key) → lên lịch THÊM 1 lần nữa cho đúng bài X → 2 alarm độc lập cùng nổ gần nhau, đăng 2 comment trùng lặp lên cùng 1 bài. Vá theo 3 lớp:
1. **Chặn tạo trùng lúc lên lịch**: `runFlow1BackgroundSync()` đổi sang đọc thẳng `activityUpcoming`/`dailyFixedSchedules` (đúng nguồn `loadCommentScheduleMap()` — sidepanel.js — dùng) thay vì storage key riêng.
2. ~~**Chặn tại lúc CHẠY** (lớp phòng thủ thứ 2, độc lập): `runComment()` giờ check `commentedRecords` NGAY ĐẦU HÀM — nếu bài này đã comment thành công trước đó (kể cả bởi job khác) thì bỏ qua êm, không đăng lại lên Facebook.~~ **Đã bỏ hẳn ở v1.0.194** — comment chéo dùng để đẩy bài, "đã comment rồi" không còn là lý do hợp lệ để chặn chạy, kể cả job từ alarm trùng. Rủi ro alarm trùng giờ chỉ còn dựa vào lớp #1 (chặn tạo trùng lúc lên lịch) + #3 (dọn alarm trùng đã lỡ tồn tại) bên dưới — xem chi tiết ở mục "Đảo ngược ở v1.0.194" phía trên.
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
| 040 | `group_post_drafts.is_shared` — thêm index (audit đồng bộ 2026-07-06 — cột này từ migration 026 chưa từng có index, filter eligibility `sync/status`/`drafts/pull` phải quét từng dòng khi shared draft tích luỹ) |
| 043 | `users.phone` — bắt buộc lúc đăng ký (`POST /user-auth/register`), nullable ở DB (user cũ không có) |
| 044 | `license_key_devices` — giới hạn số thiết bị/license key theo plan |

### Giới hạn thiết bị theo plan + số điện thoại bắt buộc lúc đăng ký (2026-07-10)

Trước bản này `license_keys` không phân biệt thiết bị nào — 1 key dùng được trên vô hạn máy cùng lúc (đúng thiết kế cũ, migration 037 ghi rõ log "đa thiết bị"). Tony chốt đảo hướng: giới hạn theo plan, đồng thời public gói free đổi lại thu thập số điện thoại người dùng thật (không phải email).

- **`license_key_devices`** (migration 044) — bảng riêng (`license_key_id, device_id, device_label, first_seen_at, last_seen_at`, unique theo `(license_key_id, device_id)`), không phải cột đếm cứng trên `license_keys` — để còn lưu được danh sách thiết bị thật cho admin xem/gỡ qua UI.
- **`licenseDeviceService.js`** — `PLAN_DEVICE_LIMITS = { free: 1, pro: 3, enterprise: 10 }`. `registerOrCheckDevice({licenseKeyId, plan, deviceId, deviceLabel})`: thiết bị đã có sẵn → chỉ cập nhật `last_seen_at`, không tính thêm; thiết bị MỚI mà đã đủ số lượng theo plan → từ chối (không tự "đá" thiết bị cũ ra, admin phải chủ động gỡ qua UI mới nhường chỗ cho thiết bị mới).
- **Điểm chặn — CHỈ đúng 1 chỗ**: `POST /api/user-auth/validate-key` (lúc kích hoạt key trên 1 thiết bị). Cố tình KHÔNG kiểm tra lại `deviceId` theo từng request nền (sync định kỳ, comment chéo...) để giữ đơn giản/rẻ — **hệ quả đã biết**: admin gỡ 1 thiết bị qua UI chỉ chặn được thiết bị đó từ lần `validate-key` TIẾP THEO của nó (thường là lần mở lại panel sau khi `licenseInfo` cache hết hiệu lực/bị xoá thủ công) — không cắt ngay phiên sync nền đang chạy của thiết bị vừa bị gỡ.
- **GroupFlow**: `GF.tidienAuth.getDeviceId()` (`modules/tidienAuth.js`) — sinh `crypto.randomUUID()` đúng 1 lần, lưu vĩnh viễn trong `chrome.storage.local` (key `gfDeviceId`), **không xoá** khi user xoá `licenseKey`/`licenseInfo` (nút "đăng xuất" key) — cùng máy đăng nhập lại vẫn phải tính là cùng 1 thiết bị, không phải mọc thêm slot mới mỗi lần logout/login. Gửi kèm `deviceId` + `deviceLabel` (OS, từ `navigator.userAgentData?.platform || navigator.platform`) trong body `POST /validate-key` (màn kích hoạt, `checkLicenseGate()` — `sidepanel.js`). Bị chặn do đủ thiết bị thì response `error` là chuỗi tiếng Việt hiện thẳng ra UI (đúng convention các nhánh lỗi khác của route này — `error.textContent = data.error`), không phải mã lỗi máy đọc.
- **Admin UI** (`UserManagement.jsx`, tab "GroupFlow Users"): cột "Thiết bị" (`N/limit`, đỏ khi đầy) trên bảng chính (`GET /admin/users` trả thêm `device_count`/`device_limit` mỗi user); tab con "Thiết bị" trong panel chi tiết (`GET /admin/users/:id/detail` trả thêm `devices[]`/`deviceLimit`) liệt kê từng thiết bị (label, lần đầu/cuối hoạt động) kèm nút "Gỡ" (`DELETE /admin/users/:id/devices/:deviceRowId`, route mới).
- **Số điện thoại**: `POST /user-auth/register` validate bắt buộc đúng định dạng VN (`/^(0|\+84)\d{9}$/`), **không unique** (tránh chặn nhầm người dùng chung số điện thoại gia đình/công ty — mục tiêu là thu thập được thông tin liên hệ, không phải khoá 1-số-1-tài-khoản). `UserRegister.jsx` (frontend) thêm input bắt buộc. Admin UI thêm cột "Điện thoại".

### Comment chéo qua license key (`/api/user-sync/cross-posts`)

Gọi qua `authenticateLicenseKey` (`middleware/licenseAuth.js`), route `backend/src/routes/userSync.js`. Extension gọi trong `loadPostedPostsForComment()` (`sidepanel.js`, khi mở/refresh tab Comment) **và** trong chu kỳ nền `gf_tidien_sync` (`runFlow1BackgroundSync()` — `background.js`, v1.0.187) — cả 2 nơi đọc/ghi CHUNG `crossPostsCache`/`crossPostsSyncMeta`: `GET /api/user-sync/cross-posts` (bài của user KHÁC) trộn cùng `myServerItems`/`localPosts` (bài của chính mình) thành `state.comments`.

**`comment_target`/`comment_count` thay cờ boolean `needs_comment` (v1.0.187):** bài mở cho tới khi đủ N người KHÁC NHAU comment (mặc định `comment_target = 5`, xem `upsertUserPost()`), không phải chỉ 1 người là khoá lại cho tất cả như cờ boolean cũ. Đếm qua bảng join `user_post_comments` (UNIQUE `user_post_id + commenter_user_id`), server tự loại bài mình đã comment khỏi kết quả trả về, ưu tiên `comment_count ASC` (bài đang thiếu người) trước thời gian. Field `needs_comment` vẫn được trả về (tính động `comment_count < comment_target`) để tương thích ngược, không cần code client thay đổi ngay.

**`visible_after` — độ trễ "từ từ" (v1.0.187):** bài mới có `visible_after = posted_at + random(5–60 phút)` (server tự stamp lúc `upsertUserPost()`), chỉ lộ diện trong `/cross-posts` sau mốc đó — né dấu hiệu nhiều tài khoản lạ cùng comment 1 bài ngay phút đầu (comment-ring), đồng thời đúng ý sản phẩm "mọi người từ từ thấy bài".

**Bug đã sửa — `posted_at` lệch 7 tiếng so với giờ VN (2026-07-06):** extension gửi `posted_at` là mốc UTC thật (`new Date().toISOString()`), nhưng cột DATETIME trong toàn hệ thống là "naive" — quy ước lưu theo **giờ VN wall-clock** (xem `scheduleTime.js`, `frontend/src/utils/date.js` đọc thẳng con số trong chuỗi không cộng/trừ gì thêm). `toMysqlDatetime()` (`groupPostService.js`) trước đây chỉ `.toISOString().slice(...)` — lưu thẳng giờ UTC, khiến `posted_at` (và `visible_after` tính theo nó) hiện sớm hơn giờ đăng thật 7 tiếng trên website. Fix: `toMysqlDatetime()` cộng `+7h` trước khi format thành chuỗi lưu DB; `upsertUserPost()` tính `visible_after` trên mốc UTC thật (`postedAtReal`, chưa cộng lệch) thay vì re-parse chuỗi wall-clock VN đã lệch — tránh cộng lệch 2 lần. Dữ liệu `posted_at`/`visible_after` đồng bộ TRƯỚC bản fix này vẫn còn sai lệch trong DB (fix không tự backfill lại lịch sử).

**Cursor `since=updated_at` + merge-cache (v1.0.186, mở rộng v1.0.187):** cả `/my-posts` lẫn `/cross-posts` nhận `?since=<updated_at cuối>` — không có thì trả cửa sổ mới nhất (cold start), có thì chỉ trả phần đã đổi kể từ đó. Client lưu cursor trong `myPostsSyncMeta`/`crossPostsSyncMeta` (`chrome.storage.local`), merge-upsert kết quả mới vào cache đã có thay vì tải/ghi đè lại từ đầu mỗi lần.

**Bug đã sửa — bài đồng đội bị cursor bỏ sót vĩnh viễn:** Tony báo đồng đội đã đăng bài nhưng tab "Đồng đội" không thấy hiện. Nguyên nhân: cursor `since` = MAX `updated_at` của các bài đã TRẢ VỀ (đã qua `visible_after`) ở lượt gọi trước — nhưng `visible_after` (độ trễ ngẫu nhiên 5-60') **không tương quan** với `updated_at`. Nếu bài A (updated_at sớm) ngẫu nhiên có độ trễ dài hơn bài B (updated_at trễ hơn A) đăng sau nhưng độ trễ ngắn hơn, B lộ diện trước và đẩy cursor vượt qua `updated_at` của A — khi `visible_after` của A cuối cùng cũng qua `NOW()`, request `WHERE updated_at > since` vẫn loại A vĩnh viễn vì `since` đã vượt qua `updated_at` của nó từ trước. Fix: `GET /cross-posts` (`userSync.js`) chặn floor của `since` client gửi lên ở `NOW() - VISIBLE_AFTER_MAX_MINUTES` (60 phút, export từ `groupPostService.js`) — bài update trong cửa sổ 60' luôn được quét lại (chấp nhận vài request dư, đổi lấy đúng), bài cũ hơn cửa sổ này thì `visible_after` chắc chắn đã ngã ngũ nên bỏ qua vẫn an toàn. Không cần đổi gì phía extension — cursor client gửi lên vẫn vậy, server tự kẹp lại.

- **Audit đồng bộ 2026-07-06 — chặn cửa sổ lookback 30 ngày:** không có index nào trên `visible_after`/`comment_count` (2 cột dùng trong WHERE/ORDER BY của query này) — cold-start (thiết bị mới, `since` rỗng) hoặc thiết bị lâu ngày không mở app (`since` rất cũ) phải quét gần hết `user_posts` của MỌI user rồi filesort, chi phí tăng vô hạn theo tuổi hệ thống. Thêm `CROSS_POSTS_LOOKBACK_MS` (30 ngày) kẹp cả cận trên (đã có, 60' — né bug cursor ở trên) lẫn cận dưới cho nhánh có `since`, và thêm bound `updated_at > lookbackFloor` cho nhánh cold-start — tận dụng lại index `idx_user_posts_updated` (migration 038) có sẵn, không cần migration mới, không đổi kết quả trả về với hệ thống còn "trẻ" (mọi bài đều trong 30 ngày).
- **Audit đồng bộ 2026-07-06 — rate limit:** `/api/user-sync/*` không có giới hạn tốc độ nào (audit phát hiện cùng đợt) — thêm `syncApiLimiter` (`middleware/rateLimit.js`, 60 req/phút theo license key qua header `Authorization`, không phải theo DB lookup) mount trước router này trong `app.js`.
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

- Tab **Cài đặt** (vị trí 3 trong nav — Tạo bài → Comment → Cài đặt → Nhóm → Radar → Log → Hướng dẫn, từ v1.0.204): **AI Provider local** + thư mục lưu ảnh; sub-tab **Skill** trong Cài đặt: skill local cho AI viết (trước v1.0.203 là 1 tab riêng ở cuối nav, nay gộp vào `settings-shell` cạnh "AI")
- Tab **Tạo bài → AI viết**: chủ đề + skill local → `POST /ai/generate` với `text_system_prompt` / `image_system_prompt`
- Cài đặt: **lưu ảnh local** (`imageSaveLocal`, `imageSaveSubfolder` trong `chrome.storage`)
- Nút **「⬇ Tải từ website」** → `GET /drafts/pull` (thủ công; mặc định extension **tự pull** khi sync tidien bật)

**Sync (v1.0.63):** Client gửi `last_post_id` (0 nếu trống). **1 phiên** = hỏi status → lấy **lô 20** → lưu → nghỉ 0.8s → hỏi lại đến hết (không request song song). Alarm 10p mới chạy phiên tiếp.

### Hướng dẫn (tab trong extension)

- Có tab **Hướng dẫn** ngay trong popup: cài đặt nhanh, quy trình đăng bài, comment chéo, và các lỗi thường gặp.

### Nhập tay (tab Tạo bài) — v1.0.12

| Tính năng | Mô tả |
|-----------|--------|
| **Skill local** | `chrome.storage.local` — import/export JSON; sub-tab "Skill" trong Cài đặt (từ v1.0.203; trước đó tab riêng); độc lập website. Import nhận `.json` (nhiều skill, mảng) hoặc `.md`/`.txt` (1 skill, tên theo tên file — từ v1.0.205) |
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
- **Comment không còn bắt buộc nhập mẫu** ở bất kỳ đường nào (▶ Chạy / Lên lịch) — để trống thì `resolveJobComment()` (background.js) tự random mẫu Settings lúc chạy thật, giống hệt cơ chế "Lặp lại hàng ngày" cũ đã làm.
- **UI (v1.0.168)**: dropdown đơn vị đặt **trước** ô số (không phải sau) — đổi đơn vị thì `bindGapUnitDefaultReset()` tự reset số về mặc định của đơn vị (phút=15, giờ=1, ngày=1), tránh giữ số cũ sai nghĩa (vd "10" từ phút giữ nguyên khi đổi sang ngày). Tab Comment: 3 trường Giờ bắt đầu/Giãn cách/Lặp lại hàng ngày không còn cố định trên đầu — dồn vào khung `#commentStaggerPanel` ẩn/hiện khi bấm "Lên lịch đã chọn" (nút "Xác nhận" riêng bên trong), y hệt khung `#campaignStaggerPanel` của nút "Lên lịch đã chọn" bên Tạo bài.
- **Auto-lên-lịch bài chưa có lịch (v1.0.169, đổi qua đổi lại ở v1.0.194 → v1.0.196)**: `autoScheduleUnscheduledComments()` chạy mỗi lần tab Comment tải/làm mới (không cần bật gì, không còn Settings toggle `commentAutoScheduleEnabled` cũ) — bài trong `state.comments` chưa có trong `commentScheduleMap` **và chưa từng comment** (`!isCommentDone(c)`) tự động xếp "1 lần cụ thể", cách nhau 15 phút, bắt đầu sau lịch comment muộn nhất trong `activityUpcoming` (hoặc từ giờ hiện tại nếu chưa có lịch nào). Gọi lại nhiều lần vẫn an toàn — chỉ nhắm bài chưa có lịch. **v1.0.194 từng bỏ hẳn điều kiện `!isCommentDone(c)`** (lý do: "comment chéo dùng để đẩy bài, comment nhiều lần là chủ đích") **nhưng ĐẢO NGƯỢC LẠI ở v1.0.196** sau khi Tony test thật thấy bài VỪA comment xong bị tự set lịch mới gần như ngay lập tức (chạy xong → entry xoá khỏi local → tick tự-lên-lịch kế tiếp lại thấy "chưa có lịch") — phản hồi "comment xong rồi thì thôi chứ". Kết luận cuối: auto-lên-lịch chỉ là **mồi lần đầu** cho bài chưa từng comment; muốn đẩy tiếp bài đã comment phải chủ động (tự tay "+ Lên lịch"/"▶ Chạy", hoặc "Lặp lại hàng ngày"). Áp dụng cả 2 nơi tự-lên-lịch: `autoScheduleUnscheduledComments()` (sidepanel) và `runFlow1BackgroundSync()` (background, cả bài của mình lẫn cross-post, dùng `commentedRecords`). Bài chưa có nhóm nào với post_id FB hợp lệ (`buildRawJobsForOneComment()` trả rỗng — thường do vừa đồng bộ về, permalink FB chưa parse ra post_id) vẫn bị bỏ qua — không thể lên lịch vì chưa biết comment vào bài nào; từ v1.0.193 trường hợp này được đếm và báo riêng qua toast (`X bài chưa lên lịch được — thiếu post_id FB hợp lệ`) thay vì im lặng mãi mãi.
- **Tránh đêm cứng (v1.0.169)**: `avoidNightTime(ms)`/`avoidNightHHMM(hhmm)` (`sidepanel.js`) — mốc nào rơi 22:00–06:59 tự dời về 07:00 (cùng ngày nếu đang trước 07:00, hôm sau nếu đã qua 22:00). Áp dụng bên trong `scheduleCommentJobsOnce()` (nên tự động che luôn mọi caller: bulk stagger, lên lịch riêng 1 bài, auto-lên-lịch) và ở `confirmCampaignStagger()`/`scheduleSelectedComments()`/`scheduleOneComment()` cho nhánh lặp lại hàng ngày (`timeOfDay`). Thay hẳn `confirmNightAction()`/`isNightBlocked()` cho các luồng LÊN LỊCH (không hỏi confirm nữa, tự dời) — luồng CHẠY NGAY (▶ Chạy, Đăng ngay) vẫn giữ confirm cũ vì không có "ngày mai" để dời tới. (v1.0.193: nút "Chạy đã chọn"/`confirmNightAction()` của Comment đã bị xóa hẳn cùng với việc bỏ chạy hàng loạt tức thì ở tab Comment.)

**v1.0.177 (đã thay bởi v1.0.181):** nút "Lên lịch" (thường, cùng giờ cho mọi bài tick, ô ngày/giờ rời trong footer) từng được sửa hết bắt buộc chọn nhóm qua `schedulePost()`/`buildPostJob()`/`upsertSinglePostSchedule()`. Cả 3 hàm này **đã bị xóa hẳn** ở v1.0.181 — nút "Lên lịch" riêng biệt cũng bị bỏ, hợp nhất hoàn toàn vào panel giãn cách (`buildPostJobRelaxed()` + `confirmCampaignStagger()`) như mô tả ở trên.

**v1.0.179 — tag lịch trên card phản ánh đúng cả lịch lặp lại hàng ngày:** `loadPostScheduleMap()` (giống `commentScheduleMap`) gộp `activityUpcoming` (1 lần) + `dailyFixedSchedules` (lặp lại) theo `post.id` — `postScheduleTagHtml()` đọc map này thay vì đọc thẳng `post.ngay_dang`/`gio_dang` (trước đây bài lên lịch lặp lại **không** set 2 field này nên tag vẫn hiện "+ Hẹn giờ" như chưa có lịch). Đã bỏ hẳn list riêng `#postDailyScheduleList` — bấm tag "🔁 HH:MM hàng ngày" để hủy (`cancelPostDailySchedule()`). Lưu ý: `postScheduleTagHtml()` chỉ tra `postScheduleMap` cho nhánh `type==='daily'`; lịch **"1 lần"** vẫn hiển thị "Đăng: ..." dựa vào `p.ngay_dang`/`p.gio_dang` trực tiếp trên post — 2 field này phải được set đúng lên `state.posts`, không phải lên bản clone tạm (xem v1.0.206 ngay dưới).

**v1.0.206 — fix "Hẹn giờ" xác nhận xong giờ không set + ảnh vỡ khi xem lại:** `confirmCampaignStagger()` build `posts[]` từ `getSelectedPosts().map(p => ({ ...p }))` (bản clone, tách khỏi `state.posts`) rồi set `ngay_dang`/`gio_dang`/`campaignName` lên **clone** — `savePosts()` sau đó lưu lại `state.posts` bản gốc chưa có giờ, nên tag vẫn hiện "+ Hẹn giờ" dù đã "Xác nhận" thành công (alarm/`activityUpcoming` vẫn được tạo đúng, chỉ có field hiển thị trên card là sai). Thêm `syncToStatePost(id, fields)` ghi ngược `ngay_dang`/`gio_dang`/`campaignName` vào đúng object trong `state.posts` theo `id`, cho cả nhánh 1-lần và lặp-lại-hàng-ngày. Đồng thời `refreshPostsOnly()` (gọi ngay sau khi lên lịch xong để nạp lại `postQueue` + Activity) thiếu bước hydrate media — `postQueue` lưu trong storage đã bị `stripForQueue()` bóc ảnh/video ra khỏi payload (media thật nằm ở `postMediaStore`, tách riêng để nhẹ storage), nạp lại mà không hydrate thì card render ảnh vỡ ngay sau khi vừa lên lịch. Thêm `await hydrateCachedMediaInPosts()` trước `renderPosts()`, đúng pattern đã dùng ở `loadState()`.

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
| `modules/fbActor.js` | Đọc `c_user` / `i_user`, parse danh sách Page, `POST /profile/switch/` — chạy trong content script (bấm tay qua profile pill) |
| `background.js` `preparePostActorCookie(actorId)` | Set thẳng cookie `i_user` = `actorId` qua `chrome.cookies.set()` (không cần tab/content script) — cách CHẠY TỰ ĐỘNG (job đăng/comment) đảm bảo đúng actor, độc lập với việc user có đang mở tab FB hay không. Gọi ở đầu `commentOnPostBgOrClassic()` và `postGroupItem()` (xem v1.0.238) |
| `sidepanel` | Dropdown chọn actor, lưu `activeActorId` |
| `fbGraphApi` | `av` + `actor_id` = page khi đang acting as page; `__user` = `c_user` |

- **2 cơ chế switch actor riêng biệt**: bấm tay (profile pill) dùng `fbActor.switchActor()` — gọi thật `POST /profile/switch/` (cần tab FB đang mở). Chạy tự động (mọi job đăng/comment) dùng `preparePostActorCookie()` — set thẳng cookie, không cần tab, phải được gọi lại mỗi lần trước khi chạy job vì cookie có thể đã đổi (user tự bấm tay đổi lại, cookie hết hạn...) kể từ lần switch trước đó.
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

**v1.0.207 — nút ✕ gỡ nguyên "bộ custom" khỏi 1 bài:** trong khung **Chọn nhóm** trên card (`inlineCustomSetsRowHtml()`, `sidepanel.js`), khi mọi nhóm của 1 bộ đã có đủ trong `post.groupIds`, chip bộ đó chuyển màu xanh (class `.applied`) và hiện thêm nút **✕** cạnh bên — bấm để gỡ đúng các nhóm thuộc bộ đó ra khỏi bài (`removeCustomSetFromPost()`), không đụng nhóm khác đã tick tay ngoài bộ. Trước bản này chip chỉ dùng để GÁN (ghi đè `post.groupIds` bằng đúng nhóm của bộ) — muốn gỡ phải mò untick từng nhóm trong danh sách nhóm bên dưới.

**v1.0.210 — gán bộ custom thứ 2 cho 1 bài không còn xóa sạch bộ thứ nhất:** Tony phản hồi "1 bài tao chọn 1 hoặc vài custom... đổi mỗi custom lại xóa custom tao đã định nghĩa trước đó" — `applyCustomSetToPost()` trước đây **GHI ĐÈ** hoàn toàn `post.groupIds = set.groupIds...` mỗi lần bấm 1 chip bộ, nên bấm bộ B sau khi đã áp bộ A xóa sạch nhóm của bộ A dù không hề đụng tới nó. Đổi thành **GHÉP**: giữ nguyên `groupIds` hiện có, chỉ thêm các nhóm MỚI (chưa có) từ bộ vừa bấm, dedupe qua `Set`, tôn trọng giới hạn tối đa nhóm/bài (`getMaxGroupsPerPost()`) — nhóm nào không đủ chỗ thì báo riêng qua toast thay vì âm thầm bỏ qua. Nút ✕ gỡ bộ (v1.0.207, `removeCustomSetFromPost()`) không đổi logic — vẫn chỉ gỡ đúng nhóm thuộc bộ bị gỡ, không đụng nhóm từ bộ khác đã áp trước đó.

**v1.0.209 — nút 🗑 xóa hẳn "bộ custom" ngay trong khung Chọn nhóm:** tiếp theo v1.0.207, Tony phản hồi "phải cho xóa nhóm" — muốn xóa hẳn ĐỊNH NGHĨA bộ custom (không chỉ gỡ khỏi 1 bài) mà không phải chuyển sang tab Nhóm → Bộ custom. Mỗi chip trong `inlineCustomSetsRowHtml()` giờ luôn có thêm nút **🗑** (không cần điều kiện applied) — `deleteCustomSetFromInline()` confirm rồi gọi `GF.groupSets.remove()` (đúng hàm dùng chung với nút "Xóa" ở tab Nhóm → Bộ custom), cập nhật cả `state.customGroupSets` lẫn re-render 2 nơi (`renderPosts()` + `renderGroupsTab()`). Chỉ xóa định nghĩa bộ — `groupIds` của các bài đã gán từ bộ đó trước đây giữ nguyên, không bị gỡ theo.

**v1.0.208 — khối "Bài đã đăng" trên card thu gọn được:** Tony hỏi "mở cái này ra làm sao tắt" — khối liệt kê nhóm đã đăng + ô Comment bot/▶ Bot (`renderPostedGroupsBlock()`, `sidepanel.js`) trước đây luôn hiện đầy đủ trên MỌI card có `postedGroups`, không có nút đóng nào. Thêm `state.postedGroupsOpenIds` (Set post id, mặc định rỗng = thu gọn) — card chỉ hiện nút nhỏ "Bài đã đăng (N nhóm) ▾", bấm để mở đầy đủ list nhóm/comment bot kèm nút "Thu gọn ▴" để đóng lại (`data-toggle-posted-groups`). Trạng thái mở/đóng lưu trong `state` nên không mất khi `renderPosts()` chạy lại do thao tác khác trên card (khác với dùng `<details>` gốc — sẽ tự đóng lại mỗi lần `innerHTML` bị build lại).

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

**v1.0.216 — Nhanh đăng thành công thật vẫn bị coi là lỗi → đăng trùng Cổ điển, không lộ trong Log:** Tony hỏi tiếp "tại sao đăng nhanh thành công lại không ghi nhận vào log chỉ ghi nhận mỗi cổ điển". Root cause: `createGroupPost()` (`fbPostBg.js`) kiểm tra dấu hiệu lỗi nghiêm trọng (`parseFbErrors()` — checkpoint/rate limit/hết phiên đăng nhập) bằng cách dò substring RẤT RỘNG trong TOÀN BỘ raw response — chạy TRƯỚC KHI thử trích `post_id`. Response GraphQL của FB có thể gộp chung nhiều story bundle trong 1 lần trả về (chính code đã tự ghi chú rủi ro này từ trước, xem comment cũ tại đây) — nếu tình cờ khớp 1 từ khóa (nội dung bài hoặc dữ liệu khác bundle chung chứa đúng từ đó), code throw lỗi NGAY dù `story_create` thực ra đã tạo bài thành công thật. Lỗi này bị `postGroupItem()` (`background.js`) bắt và chỉ `console.warn()` ra DevTools (không phải Log của extension), rồi lặng lẽ fallback Cổ điển tạo bài thứ 2 — Log chỉ ghi đúng 1 dòng kết quả CUỐI CÙNG (Cổ điển), không hề có dấu vết lượt Nhanh đã thành công trước đó. Fix: đảo thứ tự trong `createGroupPost()` — trích `post_id` TRƯỚC (bằng chứng cấu trúc, đáng tin hơn hẳn 1 regex substring), có `post_id` thật thì coi là thành công ngay, bỏ qua mọi nghi ngờ critical/auth phía dưới. `fbPostBg.js` nằm trong `build-sw-bundle.js` nên đã chạy lại `node build-sw-bundle.js`.

**v1.0.215 — Đảo ngược 1 phần "không steal focus mỗi lần" của v1.0.104 — job hẹn lịch đăng nhóm 2+ bị kẹt/mất ảnh:** Tony xác nhận A/B rõ ràng: đăng tay 2 nhóm chạy ổn, cùng bài đó chạy qua **hẹn lịch** thì đứng kẹt rất lâu rồi tự đăng mất ảnh chỉ còn chữ. Root cause: `firstClassicFocus = !this._postingFbTabWarm` (`sendToFb()`, `background.js`) — thứ v1.0.104 gọi là "không steal focus mỗi lần" — chỉ ép `active:true` cho nhóm ĐẦU trong job, từ nhóm 2 trở đi dùng `active:false`. Khi job chạy TỰ ĐỘNG không ai theo dõi (đúng bản chất hẹn lịch, khác hẳn đăng tay lúc nào cũng có người đang nhìn màn hình), tab nằm nền bị Chrome giảm tốc `setTimeout` mạnh (gõ chữ/chờ composer đều dùng `setTimeout`) → kẹt rất lâu, và khi cuối cùng cũng chạy thì Lexical reconciliation bị trễ/rối làm mất ảnh đã gắn. Đây CHÍNH LÀ bug đã gặp và fix cho luồng Comment (xem chú thích tại nhánh `GF_COMMENT` trong `sendToFb()` — "Khác với luồng đăng bài (ép active: true khi mở nhóm)..." — nhưng thực ra luồng Đăng bài chỉ ép cho nhóm đầu, không phải mọi nhóm như comment đó giả định). Fix: bỏ hẳn `firstClassicFocus` khỏi `active` — LUÔN `active: true` mọi nhóm trong job; thêm `chrome.windows.update({focused: true})` vì tab active vẫn có thể bị giảm tốc nếu cả CỬA SỔ không phải cửa sổ đang có focus hệ điều hành (đặc biệt khi chạy qua remote desktop, không ai ngồi trước máy thật lúc job chạy).

**v1.0.103 — Format + emoji Cổ điển:** Chuyển `**markdown**` → `<strong>` hoặc chữ đậm unicode (GPP); sau upload ảnh refocus composer rồi **gõ** (không paste thô); tự scroll feed tìm「Bạn viết gì đi…」.

**v1.0.214 — Vẫn đăng trùng Nhanh + Cổ điển khi response Nhanh "sạch" nhưng không đọc được post_id:** Tony báo tiếp sau v1.0.211 "bật cổ điển lên là thấy đăng rồi (đã đăng grap) nhưng vẫn đăng cổ điển tiếp... log chỉ ghi nhận cổ điển không ghi nhận nhanh". v1.0.211 chỉ đánh dấu `ambiguousDelivery` cho lỗi hạ tầng (fetch throw, HTTP 5xx) — trường hợp này response Nhanh về HOÀN TOÀN SẠCH (HTTP 200, không lỗi mạng) nhưng `extractPostId()`/`detectSubmittedWithoutId()` (`fbPostBg.js`) không nhận diện được post_id trong response đó (nghi do FB đang đổi schema cho mutation này — cùng đợt bất ổn với lỗi `field_exception` gặp song song, xem v1.0.211/v1.0.212) — vì response "sạch" nên KHÔNG được đánh dấu ambiguous, `postGroupItem()` tưởng đây là lỗi rõ ràng như mọi lỗi Nhanh khác và tự fallback Cổ điển như bình thường → đăng trùng bài thật; do Nhanh "trông như lỗi" (không log thành công) nên Log chỉ thấy đúng 1 dòng Cổ điển, dễ hiểu lầm chỉ có 1 lần chạy. Fix: `createGroupPost()` (`fbPostBg.js`) đổi mặc định — đánh dấu `ambiguousDelivery = true` cho MỌI trường hợp không thể khẳng định chắc chắn FB đã từ chối (kể cả "story_create rỗng" và "không rõ gì cả", vốn trước đây coi là lỗi rõ ràng) — chỉ giữ KHÔNG ambiguous cho đúng 1 tín hiệu từ chối chắc chắn: `spam`/`action_blocked`. `fbPostBg.js` cũng nằm trong `build-sw-bundle.js` nên đã chạy lại `node build-sw-bundle.js`.

**v1.0.213 — Fix Cổ điển đăng mất ảnh, chỉ còn chữ:** Tony báo sau khi gắn ảnh xong, job đứng 1 hồi lâu rồi tự đăng — bài lên không có ảnh, chỉ còn chữ. Root cause: `typeHumanLike()`/`injectHybridText()`/`pasteComposerContent()` (`content.js`) đều chạy `document.execCommand('selectAll')` + `delete` VÔ ĐIỀU KIỆN ngay trước khi gõ/paste chữ — kể cả khi ô soạn bài đang HOÀN TOÀN TRỐNG (đúng lúc này, vì "gắn ảnh trước chèn chữ" là thứ tự cố ý, xem v1.0.101). Composer FB (Lexical) có thể coi ảnh đính kèm là 1 node nằm CHUNG vùng soạn thảo với chữ (decorator node) — lệnh "chọn hết + xóa hết" khi không có chữ nào để xóa vẫn xóa luôn node ảnh đó. Fix: cả 3 hàm chỉ chạy `selectAll`+`delete` khi ô ĐÃ CÓ CHỮ THẬT (`composerTextLength(el) > 0` — đang gõ lại sau 1 lần thử trước, có nội dung sai cần thay), bỏ qua bước xóa khi ô đang trống — không ảnh hưởng các lần retry hợp lệ khác trong `injectRichText()` (vẫn xóa đúng khi có chữ cũ cần thay thế).

**v1.0.212 — Fix Cổ điển báo "không tìm thấy ô soạn bài" dù hộp thoại đã mở sẵn:** Tony gửi ảnh chụp — hộp thoại "Tạo bài viết" hiện rõ trên màn hình, đã mở sẵn 10-20s+ (xác nhận không phải do chậm/timeout race), nhưng Log vẫn báo "Không tìm thấy ô soạn bài nhóm". Root cause: `findComposerEditor()`/`getGroupPostDialog()` (`content.js`) dùng `document.querySelector('[role="dialog"]')` — chỉ lấy ĐÚNG 1 phần tử ĐẦU TIÊN khớp selector trong toàn trang. FB Comet có thể render NHIỀU `[role="dialog"]` cùng lúc (backdrop/layer lồng nhau, dialog ẩn/phụ khác còn sót trong DOM...) — nếu phần tử đầu tiên không phải dialog composer thật, `findComposerInRoot()` chạy trên nó luôn trả `null` suốt cả vòng lặp 28s, dù dialog thật (chứa ô soạn bài, y hệt ảnh Tony gửi) vẫn đứng yên ở chỗ khác trong DOM suốt thời gian đó — không phải bug do chậm, mà do luôn nhìn nhầm phần tử. Fix: cả 2 hàm đổi sang quét TẤT CẢ `[role="dialog"]` hiện có mỗi lượt (`this.qsa(...)`), thử `findComposerInRoot()` trên từng cái thay vì chỉ cái đầu tiên. `content.js` là content script nạp trực tiếp (không nằm trong `build-sw-bundle.js`) nên không cần rebuild `swBundle.js`.

**v1.0.211 — Fix đăng trùng 1 nhóm (Nhanh + Cổ điển) khi response Nhanh bị rớt:** Tony báo "1 bài đăng vào 1 nhóm 2 lần nhanh và cổ điển". Root cause: Nhanh (GraphQL nền) có thể ĐÃ được FB tạo bài thật phía server, nhưng response bị rớt trước khi về tới extension (mất mạng, service worker bị Chrome tạm ngưng giữa request, 5xx tạm thời của hạ tầng FB) — `postGroupItem()` (`background.js`) trước đây coi MỌI lỗi Nhanh là "chưa đăng", tự fallback Cổ điển — nếu Nhanh thực ra đã đăng xong thì Cổ điển đăng thêm 1 lần nữa = trùng bài thật (không lộ ra ngay vì trông như "Nhanh lỗi, Cổ điển mới đăng"). Fix: `fetchWithRetry()`/`graphqlRequest()` (`modules/fbSessionBg.js`) đánh dấu `e.ambiguousDelivery = true` cho đúng 2 trường hợp không thể khẳng định FB đã xử lý hay chưa (fetch tự ném lỗi mạng; HTTP 5xx sau khi hết lượt retry) — phân biệt với lỗi GraphQL nghiệp vụ trả kèm response rõ ràng (vd `field_exception` — FB chắc chắn đã từ chối, chưa tạo bài, fallback Cổ điển vẫn an toàn như cũ). `postGroupItem()` gặp lỗi `ambiguousDelivery` thì KHÔNG tự fallback Cổ điển — báo lỗi rõ yêu cầu tự mở nhóm kiểm tra trước khi đăng lại, thà bỏ lỡ 1 lượt còn hơn đăng trùng nhìn như spam. **Lưu ý build:** service worker chạy `modules/swBundle.js` qua `importScripts()` (xem `build-sw-bundle.js`), không phải file nguồn `fbSessionBg.js` trực tiếp — sửa file nguồn xong phải chạy lại `node build-sw-bundle.js`, nếu không extension vẫn chạy code cũ dù đã sửa source.

**v1.0.102 — Panel không mất sau đăng:** Cổ điển reload/navigate tab FB → iframe panel bị xóa. `gfPanelShell` + SW tự `GF_PANEL_OPEN` sau load; `chrome.storage.session` nhớ `gfPanelOpen` / `gfPostingActive`.

**v1.0.101 — Cổ điển DOM (GPP):** Gắn ảnh **trước** chèn chữ. Paste `text/html` từ `variationDeltas` (bold/italic/list). Composer đóng sau Đăng → `posted_uncertain` (không fail đỏ). Tìm `Photo/video` + `input[type=file]` trong dialog.

**v1.0.218 — Dọn lỗi rác "File chooser dialog can only be shown with a user activation":** Tony gửi ảnh chụp trang Lỗi extension (Cốc Cốc) thấy lỗi này lặp lại 100% mỗi lần gắn ảnh. `attachMedia()` (`content.js`) sau khi gắn file đúng cách (`input.files = dt.files` + dispatch `focus`/`change`/`input`) còn dispatch thêm 1 `MouseEvent('click')` giả lập lên input file — trình duyệt chặn cứng mở hộp thoại chọn file bằng script (không phải người dùng bấm thật) nên dòng này luôn luôn ném lỗi; dù bị try/catch bắt nên không phá chức năng, nó chỉ làm rác Log lỗi, gây nhiễu khi tìm bug thật. Bỏ hẳn dòng đó — không có tác dụng gì.

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
   - **Comment chéo chỉ hiện bài chủ đã CONFIRM OK — thiết kế opt-in (v1.0.236 + backend, đảo từ v1.0.234)**: bài bị hạn chế xem (không phải chờ duyệt — audience riêng/đã xóa/chưa duyệt) hiện trang khóa trắng KHÔNG có bất kỳ thông tin gì cho người KHÔNG PHẢI chủ bài — check nhẹ (fetch, không chạy JS) của máy đồng đội LUÔN fail-open (đoán bừa "OK"), không sửa được ở phía đồng đội. Chỉ CHỦ BÀI (Facebook luôn cho xem thật, kể cả bài chờ duyệt) mới đủ tin cậy để xác nhận. `warmPostAccessCache()` (`background.js`) CHỈ check bài CỦA CHÍNH MÌNH (postQueue/serverMyPosts — không còn quét `crossPostsCache` như v1.0.234, vì đồng đội không tự check bài người khác nữa), báo MỌI kết quả ('ok' lẫn 'pending') qua `POST /api/user-sync/posts` (field optional `pending_approval`, không thêm endpoint/cron nào) — `user_posts.pending_approval`/`pending_checked_at` (migration 041). `GET /cross-posts` (`userSync.js`) đảo từ "loại trừ khi pending" sang "chỉ gửi khi đã confirm ok" — `pending_approval=0 AND pending_checked_at IS NOT NULL` còn trong TTL 6 giờ (`OK_CONFIRMED_TTL_MS`) — bài chủ chưa check tới thì tạm ẩn khỏi đồng đội cho tới khi confirm, TTL để tự hết hạn nếu chủ không mở lại app cập nhật (đề phòng bài sau đó bị xóa/đổi audience). `isCommentActionable()`/`commentAccessTagHtml()` (`sidepanel.js`) bài `_source: 'cross'` tin thẳng — không đọc `state.postAccessCache` cục bộ nữa.
2. Extension user B/C: tab Comment tự `GET /api/user-sync/cross-posts` — trả **cả** bài của user khác đã comment lẫn chưa (v1.0.171: bỏ lọc `needs_comment=1` để bài không biến mất khỏi danh sách sau khi comment xong — client tự hiện tag "✓ Đã comment" theo field `needs_comment`/`_needsComment` thay vì server lọc mất). Bài của mình cũng vậy — không biến mất, và từ v1.0.178 cũng hiện tag "✓ Đã comment" qua `isCommentDone()` (đọc `postedGroups[].firstCommentOk`, xem bảng filter bên dưới). Badge số tab Comment chỉ đếm bài còn chưa comment (`!isCommentDone(c)`, dùng chung cho cả 2 nguồn).
   - **Tự động lên lịch (luôn bật, v1.0.169, sửa v1.0.194)**: mỗi lần tab Comment tải/làm mới, `autoScheduleUnscheduledComments()` (`sidepanel.js`) tự xếp MỌI bài chưa có lịch — **kể cả bài cross đã comment rồi** (từ v1.0.194, không còn loại trừ theo trạng thái đã comment — đẩy bài lặp lại là mục đích chính đáng) — vào "1 lần cụ thể", cách nhau 15 phút, sau lịch muộn nhất hiện có — không cần bật gì, không cần tự tay chọn/bấm. Xem thêm mục "Lên lịch giãn cách" bên dưới.
3. Soạn / chọn mẫu → **▶ Chạy** (1 bài, ngay lập tức) / **Lên lịch** (footer "Lên lịch đã chọn" cho nhiều bài, hoặc tag lịch trên từng card cho 1 bài — 1 lần cụ thể hoặc lặp lại hàng ngày) — hoặc để tự động như trên
4. `fbCommentBg.commentOnPost` (nền):
   - Fetch permalink — bỏ qua nếu 404 / pending approval / bài ẩn
   - `CometUFILiveTypingBroadcastMutation` + delay theo độ dài text
   - `useCometUFICreateCommentMutation` doc_id `9550500205043457`
5. **Lên lịch đã chọn** — datetime bắt đầu + alarm `gf_cmt_*` giãn cách tự động; xem tab Activity. (v1.0.193: bỏ hẳn nút "Chạy đã chọn"/`runCommentBatch()` khỏi footer hàng loạt — đẩy nhiều comment thật lên Facebook cùng lúc không qua bước xem trước/giãn cách như lên lịch, dễ bấm nhầm; chạy hàng loạt giờ chỉ còn qua đường lên lịch.)
6. Comment thành công → `runComment()` (`background.js`) tự gọi `markCrossPostCommentedFromBg()` → `PATCH /api/user-sync/posts/:id/commented` (chỉ khi job có `crossServerId` — tức bài của người khác, không phải bài của chính mình) + ghi Activity log. Dùng chung, gọi đúng 1 lần cho cả các cách chạy ở trên.
7. Lỗi GraphQL → fallback DOM (`content.js` `GF_COMMENT`) — trừ bài không comment được. **Xác nhận gửi thật (v1.0.228)**: `commentOnPost()` (`content.js`) sau khi gõ chữ + click nút gửi (hoặc Enter nếu không thấy nút) phải kiểm tra ô soạn bài RỖNG LẠI mới coi là thành công — trước bản này, không tìm thấy nút gửi thì bỏ qua luôn bước gửi nhưng vẫn báo `ok:true`, khiến Log ghi "OK" dù bình luận chưa hề được đăng (ô vẫn còn chữ/đứng yên ở placeholder).

**UI card** (`renderComments()`, `sidepanel.js`) dùng chung class với card tab Tạo bài (`post-card`/`post-meta`/`post-actions`/`tag`) thay vì layout riêng: tag lịch đọc từ `commentScheduleMap` (gộp `activityUpcoming` + `dailyFixedSchedules`) hiện đúng ngày giờ/giờ lặp lại đang có, tag mẫu bình luận hiện đã nhập hay chưa, tag "✓ Đã comment" (nếu xong) — bấm tag mẫu/lịch để mở khung sửa tương ứng, không cần nút riêng.

**Filter (4 select độc lập, kết hợp AND, `bindCommentFilters()`):**

| Select | Option | Đọc từ |
|--------|--------|--------|
| `#commentFilterPerson` | Tất cả / Của tôi / tên đồng đội (tự sinh) | `_source`/`_userLabel` |
| `#commentFilterTemplate` | Mẫu bình luận: Tất cả / Có / Chưa có | `state.commentDrafts[c.id]` |
| `#commentFilterSchedule` | Lịch: Tất cả / Đã / Chưa lên lịch | `state.commentScheduleMap[c.id]` |
| `#commentFilterStatus` (v1.0.178) | Bình luận: Tất cả / Chưa comment / Đã comment | `isCommentDone(c)` |

**`isCommentDone(c)` (v1.0.178, sửa v1.0.185, `sidepanel.js`):** ưu tiên `state.commentedRecords[c.id]` (cục bộ, không phụ thuộc mạng — xem mục "Fix tab Comment tự lên lịch..." đầu file); nếu chưa có thì bài cross đọc `c._needsComment === false` (server); bài của mình đọc `postedGroups[].firstCommentOk === true` trên **mọi** nhóm hợp lệ (field đã được `markPostedGroupCommented()` — `background.js` — ghi sẵn mỗi lần comment/first-comment thành công, trước đây chỉ dùng nội bộ, chưa từng đọc lại ở UI cho bài của mình). Dùng cho: tag "✓ Đã comment" trên card, badge số tab Comment, filter "Bình luận", **và** để chặn `autoScheduleUnscheduledComments()` (bài đã comment xong không tự lên lịch lại nữa — v1.0.194 từng bỏ chặn này rồi khôi phục lại ở v1.0.196, xem mục "Auto-lên-lịch bài chưa có lịch").

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
