# AutoPost — TODO

> Cập nhật: 2026-07-10

## GroupFlow + backend: bài chờ duyệt tự "báo hộ" đồng đội qua cross-posts (2026-07-10)

Tony chỉ ra: bài của chính mình chờ duyệt thì mình xem được (banner), nhưng đồng đội vào cùng bài đó chỉ thấy trang khóa trắng không dò được gì — vẫn thử comment vô ích. Đề xuất backend field + API để chủ bài báo hộ, nhưng Tony lo ngại đúng 2 điều: (1) quá tải server, (2) nếu chủ bài không mở lại extension thì bị chặn vĩnh viễn.

- [x] Thiết kế né cả 2 lo ngại: KHÔNG thêm endpoint/cron mới (piggyback `POST /api/user-sync/posts` sẵn có, tần suất giới hạn tự nhiên theo cron `warmPostAccessCache()` — vài request/3 phút); có TTL 30 phút (`PENDING_APPROVAL_TTL_MS`) — chủ bài không mở lại app thì cờ tự hết hạn, không chặn vĩnh viễn.
- [x] Backend: migration `041_user_posts_pending_approval.sql` (+ `ensureUserPostsPendingApproval()` trong `migrationRunner.js`/`app.js`) thêm `user_posts.pending_approval`/`pending_checked_at`.
- [x] `upsertUserPost()` (`groupPostService.js`) nhận optional `pending_approval` (undefined = giữ nguyên, không tự xoá cờ khi sync bình thường không liên quan).
- [x] `POST /api/user-sync/posts` (`userSync.js`) nhận field `pending_approval` từ extension; `GET /api/user-sync/cross-posts` thêm điều kiện loại bài đang chờ duyệt còn trong TTL.
- [x] Extension: `warmPostAccessCache()` (`background.js`) đánh dấu target nào là bài CỦA CHÍNH MÌNH (postQueue/serverMyPosts) khác bài đồng đội (crossPostsCache) — chỉ bài của mình mới báo hộ; `reportOwnPendingApproval()` gửi kết quả check (`pending`/`ok`) lên server ngay sau mỗi lần check.
- [x] Bump `manifest.json` → v1.0.234, cập nhật `CHANGELOG.md`. Không cần rebuild `swBundle.js` (`background.js` không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: restart backend (để migration 041 tự chạy), reload extension. Chờ vài phút cho cron `warmPostAccessCache()` check bài chờ duyệt của chính mình — sau đó nhờ đồng đội (tài khoản khác) mở tab Comment → Đồng đội, bài đó phải KHÔNG còn hiện trong danh sách nữa (thay vì hiện ra rồi thử comment thất bại). Sau khi admin duyệt bài xong (hoặc sau 30 phút không ai cập nhật), bài phải tự xuất hiện lại bình thường cho đồng đội.

## GroupFlow: redesign khung sườn (header + tab bar) theo file thiết kế mới (2026-07-10)

Tony gửi file thiết kế (`GroupFlow Redesign.dc.html` + README, mockup màn "Tạo bài") — chọn phạm vi: áp dụng cho khung sườn dùng chung (header/tab bar/token màu/font/radius/shadow) của TẤT CẢ tab, chưa động vào layout chi tiết bên trong từng tab.

- [x] Đổi font `Inter` → `Be Vietnam Pro` (`sidepanel.html` Google Fonts link + `--font` trong `sidepanel.css`).
- [x] Đổi toàn bộ token màu trong `:root` (`sidepanel.css`) sang `oklch()` khớp đúng giá trị thiết kế (bg/surface/primary/header/error...); `--radius`/`--radius-sm` nới 18px/12px.
- [x] `.header` bỏ gradient sang phẳng đúng token; `.brand-mark` (logo G) bỏ gradient, 34px/10px bo góc; `.profile-trigger` (pill Tony) đổi nền `--header-2` phẳng; `.profile-avatar` đổi màu cam riêng (`--avatar-alt`) phân biệt với logo xanh app.
- [x] Đổi đồng bộ 18 chỗ `rgba(37, 99, 235, X)` (glow/ring primary cũ) sang `oklch(56% 0.19 258 / X)` khớp primary mới.
- [x] Bump `manifest.json` → v1.0.233, cập nhật `CHANGELOG.md`. Không cần rebuild `swBundle.js` (CSS/HTML không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, mở panel — kiểm tra header navy phẳng + pill "Tony" cam/navy đúng thiết kế, tab bar/badge đỏ, card/button/segmented control mọi tab (Tạo bài/Comment/Cài đặt/Nhóm/Radar/Log/Hướng dẫn) không bị vỡ layout hay lệch màu do đổi token gốc. Nếu muốn redesign chi tiết bên trong từng tab (không chỉ khung sườn), cần trao đổi thêm scope/mockup cho từng tab cụ thể.


## GroupFlow: REVERT v1.0.230 — banner "chờ phê duyệt" phải chặn hiển thị "✓ Có thể comment" TRƯỚC, không đợi chạy thử (2026-07-10)

Tony làm rõ yêu cầu thật: "phải check bài nào cho phép comment mới hiển thị ra thôi chứ" — chặn ngay bước hiển thị/lọc, không phải để job chạy rồi mới báo "Bỏ qua".

- [x] Xác nhận thêm bằng thao tác tay: bài của chính mình chờ duyệt hiện ĐẦY ĐỦ nội dung (có marker OK) NHƯNG KHÔNG CÓ Ô BÌNH LUẬN — giả thuyết v1.0.230 ("có OK marker → luôn commentable") SAI.
- [x] Revert lại đúng thứ tự ban đầu ở `checkPostCommentable()` (`modules/fbCommentBg.js`) — deleted/pending TRƯỚC marker OK — banner "chờ phê duyệt" luôn thắng, đúng ý ẩn bài khỏi "✓ Có thể comment" ngay từ đầu.
- [x] Giữ nguyên fix v1.0.231 (timeout Cổ điển = "chưa sẵn sàng") làm lớp phòng thủ thứ 2 cho trường hợp lọt qua check (bài mới chưa kịp cache).
- [x] Bump `manifest.json` → v1.0.232, cập nhật `CHANGELOG.md`. Đã chạy lại `node build-sw-bundle.js`.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, xóa cache cũ (`chrome.storage.local.remove('gf_post_access_cache')` trong Console service worker) rồi mở lại tab Comment → bài chờ duyệt của chính mình phải hiện tag "⏳ Chờ duyệt" (không còn "✓ Có thể comment"), không bị chọn khi bấm "Lên lịch đã chọn"/"Chạy" hàng loạt.

## GroupFlow: bài của chính mình chờ duyệt KHÔNG có ô bình luận → job đứng lặp lại lỗi mỗi phút (2026-07-10)

Đây là root cause thật của câu hỏi gốc đầu tiên ("sao đến lịch mở lên lại đứng yên tại đây"). Tony xác nhận bằng thao tác tay: bài của chính mình chờ admin duyệt (tùy cấu hình từng nhóm) có thể HOÀN TOÀN không có ô bình luận nào — không phải lỗi selector sai.

- [x] Root cause: `commentOnPost()` (`content.js`) timeout đúng (`waitFor(boxSel)` — ô chưa tồn tại lúc này) nhưng lỗi này ném thẳng ra ngoài `commentOnPostBgOrClassic()` không qua bước phân loại `skippedNotReady` (nhánh đó chỉ xét lỗi từ đường Nhanh/GraphQL, không áp dụng cho Cổ điển/DOM) — `runComment()`/`runScheduledJob()` coi là lỗi thật, retry mỗi phút vô hạn tới khi admin duyệt xong.
- [x] Fix: bọc lời gọi Cổ điển trong try/catch, đánh dấu `skippedNotReady = true` khi lỗi khớp `/^Timeout chờ/i` — Log ghi "Bỏ qua", lịch "1 lần cụ thể" coi là xong (không retry dồn dập), lịch lặp lại hàng ngày tự thử lại hôm sau.
- [x] Bump `manifest.json` → v1.0.231, cập nhật `CHANGELOG.md`. Không cần rebuild `swBundle.js` (`background.js` không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, chạy/lên lịch comment đúng bài chờ duyệt không có ô bình luận đó — Log phải ghi "Bỏ qua — Timeout chờ..." thay vì lặp lại "Lỗi" mỗi phút; sau khi admin duyệt bài xong, job phải tự chạy được bình thường ở lượt kế tiếp (lịch lặp lại) hoặc cần lên lịch lại (lịch 1 lần đã bị coi là xong).

## GroupFlow: bài của chính mình chờ duyệt bị chặn nhầm "không thể comment" (2026-07-10)

Tony gửi thêm link 1 bài của CHÍNH MÌNH đang chờ admin duyệt ("Bài viết đang chờ phê duyệt"), rồi làm rõ: chủ bài vẫn xem + comment được bình thường trên bài của mình dù chưa duyệt — khác với 2 bài "Bạn hiện không xem được nội dung này" ở mục dưới (bị chặn xem hoàn toàn với người khác).

- [x] Root cause: `checkPostCommentable()` (`modules/fbCommentBg.js`) check marker "chờ phê duyệt" TRƯỚC marker OK (`story_title`/`story_token`/`likeAction`) — banner "chờ phê duyệt" của bài chính mình xuất hiện CHUNG với marker OK thật (nội dung vẫn render đầy đủ cho chủ bài) nên bị bắt nhầm thành `canComment:false` trước khi kịp thấy marker OK.
- [x] Fix: đảo thứ tự — kiểm tra OK marker TRƯỚC, có là commentable ngay bất kể có banner chờ duyệt hay không; chỉ khi KHÔNG có OK marker (trang bị chặn hoàn toàn) mới xét deleted/pending.
- [x] Bump `manifest.json` → v1.0.230, cập nhật `CHANGELOG.md`. Đã chạy lại `node build-sw-bundle.js`.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, kiểm tra lại bài của chính mình đang chờ duyệt (`/groups/2885408438373818/posts/4449138232000823/`) vẫn hiện "✓ Có thể comment" như cũ (không bị regress); đồng thời 2 link ở mục dưới phải chuyển đúng "⏳ Chờ duyệt"/"✕ Đã xóa".

## GroupFlow: "✓ Có thể comment" báo sai cho bài bị hạn chế xem — Facebook không nhúng nội dung/marker vào HTML (2026-07-10)

Tony gửi link 2 bài KHÁC NHAU, cả 2 đều hiện "Bạn hiện không xem được nội dung này" khi mở bằng tay nhưng đều bị extension báo "có thể comment". Đã lấy được log debug thật từ Console service worker.

- [x] Log thật (`checkPostCommentable fail-open`, postId `1875146320534156`) xác nhận: HTML fetch về 870KB (tải đầy đủ, không lỗi mạng) nhưng KHÔNG chứa marker nào — kể cả marker lỗi lẫn marker OK. Giả thuyết ban đầu (lệch chuẩn hóa NFC/NFD) đã bị LOẠI BỎ bởi bằng chứng này.
- [x] Kết luận đúng: Facebook không server-render nội dung/thông báo chặn vào HTML cho bài không có quyền xem (khả năng cao là thiết kế bảo mật cố ý) — phần hiện ra chỉ được dựng bằng JS sau 1 API call riêng mà `fetch()` nền không chạy JS không bao giờ thấy được. Đây là giới hạn thật của cách check nhẹ, không phải bug string-match có thể vá tiếp — đội cũ từng thử fail-closed nhưng gây chặn nhầm bài bình thường nên phải giữ fail-open.
- [x] Giảm rủi ro thay vì cố vá triệt để: `console.warn()` debug khi fail-open (đã dùng để lấy log trên); cache `'ok'` hết hạn sau 6 giờ thay vì vĩnh viễn; **hàng phòng thủ thật** là v1.0.228 (mục dưới) — dù tag pre-check sai, lúc chạy comment thật (tab thật, có JS) sẽ báo Lỗi/timeout thay vì "OK" giả.
- [x] Bump `manifest.json` → v1.0.229, cập nhật `CHANGELOG.md` (đã sửa lại đúng chẩn đoán, bỏ giả thuyết NFC sai). Đã chạy lại `node build-sw-bundle.js`.
- [ ] **Không cần Tony làm gì thêm cho mục này** — tag "✓ Có thể comment" có thể vẫn thỉnh thoảng sai cho bài bị hạn chế (giới hạn kỹ thuật đã biết), nhưng Log sẽ không còn ghi "OK" giả nữa nhờ v1.0.228. Nếu muốn pre-check chính xác 100%, cách duy nhất là mở tab thật để JS render rồi soi DOM — tốn tài nguyên hơn hẳn, cần Tony xác nhận có muốn đánh đổi vậy không trước khi làm.

## GroupFlow: comment Cổ điển báo "OK" trong Log dù chưa gửi được, ô bình luận đứng yên (2026-07-10)

Tony gửi ảnh chụp — lịch comment tới giờ, tab FB mở đúng bài nhưng ô bình luận vẫn đứng yên ở placeholder không có gì xảy ra, trong khi Log lại ghi "OK".

- [x] Root cause: `commentOnPost()` (`content.js`) sau khi gõ chữ chỉ tìm nút gửi đang hiển thị rồi `if (submit) submit.click()` — không tìm thấy nút thì không click gì, không có fallback, vẫn `return { ok: true }` vô điều kiện, không kiểm tra bình luận có thực sự được gửi hay không.
- [x] Fix: thêm fallback nhấn Enter khi không thấy nút gửi; xác nhận gửi thật bằng cách ô soạn bài phải RỖNG LẠI sau khi gửi (chờ thêm 1 lần nếu chưa rỗng ngay) — còn chữ thì ném lỗi thay vì báo OK giả.
- [x] Bump `manifest.json` → v1.0.228, cập nhật `CHANGELOG.md` + `docs/GROUPFLOW.md`. Không cần rebuild `swBundle.js` (content.js không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, chạy/lên lịch comment vài bài — nếu FB không cho gửi thật (mất nút, mất phiên...) Log phải ghi "Lỗi", không còn ghi "OK" giả khi ô bình luận vẫn còn chữ.

## Backend: giờ đăng bài (`posted_at`) đồng bộ từ extension lệch 7 tiếng so với giờ VN (2026-07-06)

Tony báo website ghi nhận giờ đăng bài không đúng giờ Việt Nam khi đồng bộ giờ đăng từ extension.

- [x] Root cause: `toMysqlDatetime()` (`backend/src/services/groupPostService.js`) lưu `posted_at` theo giờ UTC (`.toISOString()`) trong khi cột DATETIME toàn hệ thống quy ước lưu giờ VN wall-clock (xem `scheduleTime.js`, `frontend/src/utils/date.js`) — hiện sớm hơn 7 tiếng.
- [x] Fix `toMysqlDatetime()` cộng `+7h` trước khi format; sửa `upsertUserPost()` để `visible_after` tính trên mốc UTC thật, không re-parse chuỗi đã lệch giờ VN (tránh lệch 2 lần).
- [x] Cập nhật `CHANGELOG.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: restart backend, đăng 1 bài nhóm qua extension, kiểm tra website (`/groups` hoặc dashboard user) hiện đúng giờ đăng theo giờ VN thật (không lệch 7 tiếng).
- [ ] Lưu ý: các bản ghi `posted_at`/`visible_after` cũ (đã đồng bộ trước bản fix này) vẫn còn sai lệch 7 tiếng trong DB — fix chỉ áp dụng cho bài đồng bộ mới, không tự sửa dữ liệu cũ.

## GroupFlow: dọn lỗi rác "File chooser dialog can only be shown with a user activation" (2026-07-05)

Tony gửi ảnh chụp trang Lỗi extension (Cốc Cốc) thấy lỗi này lặp lại liên tục mỗi lần gắn ảnh.

- [x] Root cause: `attachMedia()` (`content.js`) dispatch thêm 1 `MouseEvent('click')` giả lập lên input file sau khi đã gắn file đúng cách — trình duyệt chặn cứng mở hộp thoại chọn file bằng script, dòng này luôn luôn ném lỗi (bị try/catch bắt nên không phá chức năng, chỉ làm rác Log lỗi).
- [x] Bỏ hẳn dòng dispatch 'click' đó — không có tác dụng gì.
- [x] Bump `manifest.json` → v1.0.218, cập nhật `CHANGELOG.md`. Không cần rebuild `swBundle.js` (content.js không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, gắn ảnh đăng vài lượt — không còn thấy lỗi "File chooser dialog..." trong trang Lỗi của extension nữa.

## GroupFlow: tag giờ đăng/lịch hiện đúng định dạng VN (HH:mm dd/mm/yyyy) (2026-07-05)

Tony yêu cầu tag "Đăng: ..." (card Tạo bài) + tag "🕒 .../📌 Đăng ..." (tab Comment) hiện đúng kiểu giờ:phút ngày/tháng/năm VN thay vì ISO "YYYY-MM-DD HH:mm".

- [x] `formatNgayGioVn()` mới (`sidepanel.js`) — đổi `ngay_dang`/`gio_dang` sang "HH:mm dd/mm/yyyy", dùng trong `postScheduleTagHtml()`.
- [x] `formatScheduleWhen()` đổi sang cùng format — áp dụng cho tag lịch comment + "📌 Đăng" (giờ đăng gốc) + "✓ Đã comment · giờ".
- [x] KHÔNG đụng `scheduleWhenInputValue()` (giữ nguyên ISO — bắt buộc cho input `datetime-local`).
- [x] Bump `manifest.json` → v1.0.217, cập nhật `CHANGELOG.md`. Không cần rebuild `swBundle.js` (sidepanel.js không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, mở tab Tạo bài (tag "Đăng: ...") và tab Comment (tag "🕒 .../📌 Đăng ...") — cả 2 phải hiện đúng "HH:mm dd/mm/yyyy".

## GroupFlow: Nhanh đăng thành công thật vẫn bị coi là lỗi → đăng trùng Cổ điển (2026-07-05)

Tony xác nhận nhóm 2 đăng Nhanh thành công thật (thấy bài trên FB) nhưng vẫn bị đăng thêm 1 bài Cổ điển — hỏi tại sao Log không ghi nhận lượt Nhanh, chỉ thấy Cổ điển.

- [x] Root cause: `createGroupPost()` (`fbPostBg.js`) kiểm tra lỗi nghiêm trọng (`parseFbErrors()`) bằng substring rất rộng trên TOÀN BỘ raw response, chạy TRƯỚC KHI trích `post_id` — match nhầm (do response gộp chung nhiều story bundle) khiến throw lỗi ngay dù bài đã tạo thành công thật; lỗi này chỉ `console.warn()` ra DevTools (không vào Log extension) rồi lặng lẽ fallback Cổ điển đăng trùng.
- [x] Đảo thứ tự: trích `post_id` TRƯỚC — có rồi thì coi thành công ngay, bỏ qua nghi ngờ critical/auth phía dưới.
- [x] Chạy lại `node build-sw-bundle.js` (fbPostBg.js nằm trong bundle).
- [x] Bump `manifest.json` → v1.0.216, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension lên v1.0.216, hẹn lịch 1 bài vào 2+ nhóm, để máy tự chạy — không còn nhóm nào bị đăng trùng Nhanh+Cổ điển nữa; nếu Nhanh thành công, Log phải ghi nhận đúng lượt Nhanh đó (không phải Cổ điển).

## GroupFlow: job hẹn lịch đăng nhóm thứ 2+ bị kẹt/mất ảnh (2026-07-05)

Tony xác nhận A/B rõ ràng: đăng tay 2 nhóm ổn, cùng bài đó chạy qua hẹn lịch thì đứng kẹt lâu rồi tự đăng mất ảnh.

- [x] Root cause: `sendToFb()` (`background.js`) chỉ ép tab `active:true` cho nhóm ĐẦU TIÊN trong job — từ nhóm 2 trở đi dùng `active:false`, tab nằm nền bị Chrome giảm tốc khi job chạy tự động không ai theo dõi (đúng bug đã fix cho luồng Comment trước đó, nhưng chưa áp dụng hết cho luồng Đăng bài).
- [x] Bỏ điều kiện `firstClassicFocus` khỏi `active` — luôn `active:true` mọi nhóm; thêm `chrome.windows.update({focused:true})` để ép luôn cả cửa sổ lên foreground (tab active vẫn có thể bị giảm tốc nếu cửa sổ không phải cửa sổ có focus hệ điều hành — quan trọng khi chạy qua remote desktop).
- [x] Bump `manifest.json` → v1.0.215, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`. Không cần rebuild `swBundle.js` (background.js không nằm trong bundle).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, hẹn lịch 1 bài đăng vào 2+ nhóm rồi ĐỂ MÁY TỰ CHẠY (không thao tác gì) — cả 2 nhóm phải đăng đúng, đủ ảnh, không kẹt, không đăng trùng.

## GroupFlow: vẫn đăng trùng Nhanh + Cổ điển (response Nhanh sạch nhưng không đọc được post_id) (2026-07-05)

Tony báo tiếp sau v1.0.211: "bật cổ điển lên là thấy đăng rồi (đã đăng grap) nhưng vẫn đăng cổ điển tiếp... log chỉ ghi nhận cổ điển không ghi nhận nhanh".

- [x] Root cause: v1.0.211 chỉ đánh dấu `ambiguousDelivery` cho lỗi MẠNG (fetch throw, 5xx). Trường hợp này response Nhanh về sạch (HTTP 200) nhưng `extractPostId()`/`detectSubmittedWithoutId()` (`fbPostBg.js`) không nhận diện được post_id — không được đánh dấu ambiguous nên vẫn tự fallback Cổ điển → đăng trùng.
- [x] `createGroupPost()` (`fbPostBg.js`) giờ đánh dấu `ambiguousDelivery = true` cho MỌI trường hợp không khẳng định chắc FB đã từ chối — chỉ giữ KHÔNG ambiguous cho tín hiệu từ chối rõ ràng (spam/action_blocked).
- [x] Chạy lại `node build-sw-bundle.js` (fbPostBg.js nằm trong bundle).
- [x] Bump `manifest.json` → v1.0.214, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, đăng vài lượt — nếu Nhanh gặp lại tình huống "response sạch nhưng không đọc được post_id", phải thấy job DỪNG lại + báo lỗi rõ ("Không rõ FB đã tạo bài chưa...") thay vì tự động đăng Cổ điển tiếp; kiểm tra trên FB xem có còn bị trùng bài không.

## GroupFlow: Cổ điển đăng mất ảnh, chỉ còn chữ (2026-07-05)

Tony báo sau khi gắn ảnh xong, job đứng 1 hồi lâu rồi tự đăng — nhưng bài lên không có ảnh, chỉ còn chữ.

- [x] Root cause: `typeHumanLike()`/`injectHybridText()`/`pasteComposerContent()` (`content.js`) chạy `selectAll`+`delete` vô điều kiện trước khi gõ, kể cả khi ô soạn bài đang trống chữ (đúng lúc vừa gắn ảnh xong, chưa gõ gì) — nếu ảnh nằm chung vùng soạn thảo (Lexical decorator node), lệnh này xóa luôn ảnh.
- [x] Cả 3 hàm giờ chỉ xóa khi ô ĐÃ có chữ thật (`composerTextLength(el) > 0`) — bỏ qua bước xóa khi ô đang trống, không ảnh hưởng retry hợp lệ.
- [x] Bump `manifest.json` → v1.0.213, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`. Không cần rebuild `swBundle.js` (content.js là content script nạp trực tiếp).
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, đăng lại 1 bài có ảnh vào nhóm — bài phải giữ nguyên cả ảnh lẫn chữ, không còn mất ảnh sau khi gõ chữ.

## GroupFlow: Cổ điển báo "không tìm thấy ô soạn bài" dù hộp thoại đã mở sẵn (2026-07-05)

Tony gửi ảnh chụp: hộp thoại "Tạo bài viết" hiện rõ, đã mở sẵn 10-20s+, nhưng Log vẫn báo "Không tìm thấy ô soạn bài nhóm".

- [x] Root cause: `findComposerEditor()`/`getGroupPostDialog()` (`content.js`) dùng `document.querySelector('[role="dialog"]')` — chỉ lấy phần tử ĐẦU TIÊN khớp. FB Comet có thể render nhiều `[role="dialog"]` cùng lúc — nếu phần tử đầu không phải dialog composer thật, vòng lặp không bao giờ thấy composer thật dù nó vẫn đứng yên sẵn đó.
- [x] Đổi sang quét TẤT CẢ `[role="dialog"]` mỗi lượt, thử tìm composer trên từng cái.
- [x] Bump `manifest.json` → v1.0.212, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`. Không cần rebuild `swBundle.js` (content.js là content script nạp trực tiếp).
- [ ] **Cần Tony xác nhận trên máy thật**: thử đăng lại đúng 2 nhóm đã lỗi trước đó ("Chợ Đakai...", "CHỢ SÙNG NHƠN...") — Cổ điển phải tìm thấy ô soạn bài và đăng được, không còn báo "không tìm thấy" nữa.

## GroupFlow: đăng trùng 1 bài vào 1 nhóm (Nhanh + Cổ điển) (2026-07-05)

Tony báo: "1 bài đăng vào 1 nhóm 2 lần nhanh và cổ điển" — đăng Nhanh (GraphQL) có thể đã thành công thật trên FB nhưng response bị rớt, code tưởng lỗi nên tự fallback Cổ điển đăng thêm 1 lần.

- [x] `fetchWithRetry()`/`graphqlRequest()` (`modules/fbSessionBg.js`) đánh dấu `e.ambiguousDelivery = true` cho lỗi mạng (fetch tự ném lỗi) và HTTP 5xx sau khi hết lượt retry — 2 trường hợp không thể khẳng định FB đã xử lý request hay chưa.
- [x] `postGroupItem()` (`background.js`) gặp lỗi `ambiguousDelivery` thì KHÔNG tự fallback Cổ điển — báo lỗi rõ yêu cầu tự kiểm tra nhóm trước khi đăng lại. Lỗi GraphQL rõ ràng (field_exception, không có quyền...) vẫn fallback Cổ điển như cũ vì FB chắc chắn đã từ chối.
- [x] Chạy lại `node build-sw-bundle.js` để cập nhật `modules/swBundle.js` (service worker chạy bundle này qua `importScripts`, không phải file nguồn `fbSessionBg.js` trực tiếp — sửa xong PHẢI rebuild, nếu không extension vẫn chạy code cũ).
- [x] Bump `manifest.json` → v1.0.211, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, chạy vài lượt đăng — nếu gặp lại tình huống Nhanh "lỗi" mơ hồ (mất mạng/5xx), phải thấy bài đó dừng lại + báo lỗi rõ trong Log ("Không rõ Nhanh đã đăng thành công hay chưa...") thay vì tự động đăng Cổ điển; đối chiếu nhóm đó trên FB xem có đúng 1 bài hay bị trùng từ trước khi fix.

## Backend: bài "đồng đội" bị cursor đồng bộ bỏ sót vĩnh viễn (2026-07-05)

Tony hỏi "như này là sao?" trước tab Comment → Đồng đội trống, xác nhận đồng đội ĐÃ đăng bài nhưng không thấy hiện.

- [x] Root cause: cursor `since=updated_at` (`GET /api/user-sync/cross-posts`, `userSync.js`) không tương quan với `visible_after` (độ trễ ngẫu nhiên 5-60' trước khi lộ diện) — bài có độ trễ dài hơn 1 bài đăng sau nó nhưng độ trễ ngắn hơn bị cursor vượt qua trước khi kịp lộ diện, loại vĩnh viễn khỏi các lần đồng bộ sau.
- [x] Export `VISIBLE_AFTER_MAX_MINUTES` từ `groupPostService.js`; `userSync.js` chặn floor của `since` client gửi lên ở `NOW() - VISIBLE_AFTER_MAX_MINUTES` — không cần đổi gì phía extension.
- [ ] **Cần Tony xác nhận trên máy thật**: nhờ 1 tài khoản khác đăng bài qua GroupFlow, đợi vài phút, mở tab Comment → Đồng đội → Làm mới → bài đó phải hiện ra (kể cả khi trước đó đã có 1 bài khác "lộ diện" sớm hơn và đẩy cursor đi).

## GroupFlow: gán bộ custom thứ 2 không còn xóa sạch bộ thứ nhất (2026-07-05)

Tony phản hồi: "1 bài tao chọn 1 hoặc vài custom... đổi mỗi custom lại xóa custom tao đã định nghĩa trước đó" — bấm chip bộ B sau khi đã áp bộ A vào 1 bài xóa sạch nhóm của bộ A.

- [x] `applyCustomSetToPost()` (`sidepanel.js`) đổi từ GHI ĐÈ (`post.groupIds = set.groupIds`) sang GHÉP — giữ `groupIds` hiện có, chỉ thêm nhóm mới từ bộ vừa bấm, dedupe + tôn trọng max nhóm/bài (báo riêng qua toast nếu có nhóm bị bỏ qua vì đã đủ tối đa).
- [x] Bump `manifest.json` → v1.0.210, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: 1 bài, bấm bộ A → có nhóm bộ A; bấm tiếp bộ B → bài có CẢ nhóm bộ A lẫn bộ B (không mất bộ A); bấm ✕ trên bộ A → chỉ mất nhóm bộ A, bộ B vẫn còn.

## GroupFlow: nút 🗑 xóa hẳn "bộ custom" ngay trong khung Chọn nhóm (2026-07-05)

Tiếp theo v1.0.207 (nút ✕ gỡ bộ khỏi 1 bài), Tony phản hồi "phải cho xóa nhóm" — xác nhận muốn xóa hẳn định nghĩa bộ custom ngay tại khung Chọn nhóm trên card, không phải chuyển sang tab Nhóm.

- [x] Thêm nút 🗑 trên mỗi chip trong `inlineCustomSetsRowHtml()` (`sidepanel.js`), luôn hiện (không cần applied).
- [x] `deleteCustomSetFromInline()` — confirm rồi `GF.groupSets.remove()` (dùng chung logic với tab Nhóm), không đụng `groupIds` bài đã gán từ trước.
- [x] CSS `.custom-set-chip-delete` (`sidepanel.css`).
- [x] Bump `manifest.json` → v1.0.209, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: mở khung Chọn nhóm 1 bài → bấm 🗑 trên 1 chip bộ → confirm → bộ biến mất khỏi cả khung này lẫn tab Nhóm → Bộ custom; nhóm đã gán cho bài từ bộ đó trước đây vẫn còn nguyên trên bài.

## GroupFlow: thu gọn khối "Bài đã đăng" trên card (2026-07-05)

Tony hỏi "mở cái này ra làm sao tắt" — khối "Bài đã đăng" (list nhóm đã đăng + Comment bot) trước đây luôn hiện đầy đủ, không có nút đóng.

- [x] `state.postedGroupsOpenIds` (Set, `sidepanel.js`) — mặc định thu gọn, chỉ hiện nút "Bài đã đăng (N nhóm) ▾".
- [x] `renderPostedGroupsBlock()` render nút "Thu gọn ▴" khi đang mở, toggle qua `data-toggle-posted-groups`.
- [x] CSS `.posted-groups-head`/`.posted-groups-toggle` (`sidepanel.css`).
- [x] Bump `manifest.json` → v1.0.208, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: card có bài đã đăng → mặc định chỉ thấy nút "Bài đã đăng (N nhóm) ▾", bấm vào → mở đầy đủ list nhóm + Comment bot, bấm "Thu gọn ▴" → đóng lại.

## GroupFlow: nút X gỡ nguyên "bộ custom" khỏi 1 bài (2026-07-05)

Tony phản hồi: nhóm đã gán qua "bộ" (custom set) trong khung chọn nhóm inline không có cách gỡ nguyên cụm — muốn gỡ phải mò untick từng nhóm trong danh sách "24 nhóm".

- [x] `inlineCustomSetsRowHtml()` (`sidepanel.js`) tính `applied` = mọi nhóm của bộ đã có trong `post.groupIds` — chip chuyển màu xanh + hiện thêm nút ✕ (`data-inline-remove-set`) khi applied.
- [x] `removeCustomSetFromPost()` (`sidepanel.js`) gỡ đúng các nhóm thuộc bộ đó ra khỏi bài, giữ nguyên nhóm khác đã tick thủ công.
- [x] CSS `.custom-set-chip-wrap`/`.custom-set-chip.applied`/`.custom-set-chip-remove` (`sidepanel.css`).
- [x] Bump `manifest.json` → v1.0.207, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: bấm 1 chip bộ để gán → chip chuyển xanh + hiện ✕ → bấm ✕ → nhóm của bộ đó bị bỏ tick, nhóm khác đã tick tay trước đó (ngoài bộ) vẫn giữ nguyên.

## GroupFlow: fix "Hẹn giờ" không set giờ + ảnh vỡ sau khi xác nhận (2026-07-05)

Tony báo: tick "Hẹn giờ" 1 bài, chọn giờ bắt đầu, bấm Xác nhận — tag trên card vẫn hiện "+ Hẹn giờ" như chưa lên lịch, và ảnh trong card không hiển thị nữa.

- [x] `confirmCampaignStagger()` (`sidepanel.js`) set `ngay_dang`/`gio_dang`/`campaignName` lên bản clone (`{ ...p }`) thay vì object thật trong `state.posts` → không lưu được. Thêm `syncToStatePost()` ghi ngược đúng object theo `id`.
- [x] `refreshPostsOnly()` (`sidepanel.js`) nạp lại `postQueue` từ storage (đã bị `stripForQueue()` bóc media) nhưng thiếu bước hydrate lại → card render ảnh vỡ. Thêm `await hydrateCachedMediaInPosts()` trước `renderPosts()`.
- [x] Bump `manifest.json` → v1.0.206, cập nhật `CHANGELOG.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: tick 1 bài → Hẹn giờ → chọn giờ → Xác nhận → tag đổi thành "Đăng: ..." ngay, ảnh vẫn hiển thị đúng trong card; thử cả trường hợp nhiều bài tick cùng lúc (giãn cách).

## GroupFlow: import skill nhận thêm .md/.txt (2026-07-05)

Tony báo ô import skill trong Cài đặt chỉ nhận file JSON — cần nhận cả `.md` (giống website).

- [x] `GF.localSkills.importFromPromptFile()` (`modules/localSkills.js`) — đọc `.md`/`.markdown`/`.txt` nguyên văn làm `system_prompt`, tên skill lấy theo tên file.
- [x] Handler `#skillImportFile` (`sidepanel.js`) rẽ nhánh theo đuôi file: `.json` → `importFromJson()` (hàng loạt), `.md`/`.markdown`/`.txt` → `importFromPromptFile()` (1 skill).
- [x] Cập nhật `accept` + hint trên input (`sidepanel.html`).
- [x] Bump `manifest.json` → v1.0.205, cập nhật `CHANGELOG.md`/`docs/GROUPFLOW.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: import 1 file `.md` thật → tạo đúng 1 skill tên theo file, nội dung đầy đủ; import `.json` mảng nhiều skill vẫn hoạt động như cũ.

## GroupFlow: gộp tab Skill vào Cài đặt + sắp lại thứ tự nav (2026-07-05)

Đồng bộ với thay đổi website ở mục dưới — Tony muốn tab Skill của extension cũng vào trong Cài đặt. Sau đó phản hồi thêm "comment, cài đặt để sau cùng khổ quá" → sắp lại thứ tự nav theo tần suất dùng: Tạo bài → Comment → Cài đặt → Nhóm → Radar → Log → Hướng dẫn.

- [x] Xoá tab nav rời `data-tab="skills"` (`sidepanel.html`), chuyển nội dung (import/export JSON, form tạo/sửa skill, danh sách skill) thành pane `#settings-skills` mới trong `settings-shell`, thêm nút "Skill" vào `settings-nav` (giữa "AI" và "Đồng bộ").
- [x] `sidepanel.js`: bỏ nhánh `if (name === 'skills')` trong `showTab()`; `showSettingsPane()` giờ tự `loadLocalSkillSelects()`/`renderLocalSkillList()` khi mở pane `settings-skills`.
- [x] Sắp lại `#tabBar`: Tạo bài → **Comment** → **Cài đặt** → Nhóm → Radar → Log → Hướng dẫn; bỏ CSS `.tabs button.tab-settings` (thu hẹp riêng, không còn cần vì Cài đặt giờ là tab ngang hàng, không phải icon phụ cuối hàng).
- [x] Cập nhật hint trong tab Tạo bài/Hướng dẫn còn nhắc "tab Skill" riêng.
- [x] Bump `manifest.json` → v1.0.204.
- [x] Cập nhật `CHANGELOG.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: mở panel → thứ tự nav đúng Tạo bài/Comment/Cài đặt/Nhóm/Radar/Log/Hướng dẫn, sub-tab "Skill" trong Cài đặt tạo/sửa/import/export skill hoạt động đúng, dropdown "Skill viết bài"/"Skill ảnh" ở tab Tạo bài vẫn load đúng danh sách.

## Website: gộp "Skill AI" vào trang Cài đặt (2026-07-05)

Tony muốn đưa menu Skill AI vào trong Cài đặt thay vì để riêng ở sidebar.

- [x] Chuyển `pages/Skills.jsx` thành `components/SkillsPanel.jsx` (bỏ `page-shell`/`PageHeader`, giữ nguyên logic CRUD + upload prompt).
- [x] Thêm tab "Skill AI" trong `Settings.jsx`, đọc query `?tab=` để mở đúng tab (kể cả từ link cũ).
- [x] Route `/skills` chuyển thành redirect sang `/settings?tab=skills`; cập nhật 2 link "tạo skill" trong `PageForm.jsx`/`WebsiteForm.jsx`.
- [x] Bỏ mục "Skill AI" khỏi nhóm "Hệ thống" (`navConfig.js`).
- [x] Cập nhật `CHANGELOG.md`.
- [ ] **Cần Tony xác nhận trên máy thật**: mở `/settings` → tab "Skill AI" hoạt động đúng (tạo/sửa/xoá/upload file), link cũ `/skills` tự chuyển sang tab đúng.

## GroupFlow: tách tab Comment thành "Của tôi"/"Đồng đội" + bỏ hẳn auto-schedule (2026-07-04)

Tony chốt thiết kế lại tab Comment: 2 tab con, tab "Của tôi" bỏ filter "Người"; tab "Đồng đội" hiện hết mọi người kèm tổng số bài; bỏ hẳn cơ chế tự động lên lịch vì "mang tính áp đặt, để lịch user tự set".

- [x] Thêm 2 tab con "Của tôi"/"Đồng đội" (`.comment-sub-tabs`, `setCommentSubTab()`) — lọc `state.comments` theo `_source` trước khi áp các filter khác.
- [x] Tab "Của tôi": ẩn hẳn filter "Người" (`#commentPersonFilterWrap`). Tab "Đồng đội": filter "Người" bỏ 2 pseudo-option "Tất cả"/"Của tôi", chỉ còn danh sách tên đồng đội kèm `(N)` bài.
- [x] Xoá hẳn `autoScheduleUnscheduledComments()` (`sidepanel.js`) và điểm gọi.
- [x] Xoá hẳn 2 vòng lặp tự-lên-lịch trong `runFlow1BackgroundSync()` (`background.js`) — giữ lại phần fetch/cache cross-posts (vẫn cần cho tab Đồng đội).
- [x] Dọn field `scheduled`/`postsScheduled` không còn dùng ở `syncFromTidien()`.
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.202.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, kiểm tra 2 tab hiện đúng dữ liệu (Của tôi/Đồng đội), filter Người chỉ còn ở tab Đồng đội, và bài chưa có lịch KHÔNG còn tự động được xếp lịch nữa (phải tự bấm "+ Lên lịch"/"Lên lịch đã chọn").

## Bỏ giới hạn "comment_target" khi comment chéo (2026-07-04)

Tony hỏi "comment target là gì, ai đặt số này" rồi chốt: "1 bài ai thích comment bao nhiêu là tùy chứ mắc gì đặt comment target — không giới hạn".

- [x] Trả lời: `comment_target` là hằng số cứng (`DEFAULT_COMMENT_TARGET = 5`, `groupPostService.js`) từ v1.0.187, chưa từng expose ra Settings/UI, không phải yêu cầu sản phẩm nào trước đó.
- [x] Bỏ điều kiện `comment_count < comment_target` khỏi WHERE của `GET /api/user-sync/cross-posts` (`userSync.js`) — bài chỉ ẩn khỏi cross-posts của người ĐÃ COMMENT nó, không còn đóng lại cho tất cả khi đủ target.
- [x] Bỏ check tương ứng ở `runFlow1BackgroundSync()` (`background.js`, GroupFlow) để đồng bộ hành vi 2 bên.
- [x] Rà frontend (`GroupPosts.jsx`, `GroupPostDetailModal.jsx`) — chỉ hiện `comment_count` làm thống kê, không hiện "X/Y" nên không cần sửa gì thêm.
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.201 (GroupFlow, do sửa `background.js`).
- [ ] **Cần Tony xác nhận**: reload extension + restart backend, kiểm tra 1 bài đã có ≥5 người comment trước đây giờ có xuất hiện lại trong cross-posts của người chưa từng comment nó không.

## GroupFlow: fix tag "Chưa có nhóm" sai trên lịch comment ở Sắp tới + giải thích lệch số Sắp tới vs badge Comment (2026-07-04)

Tony gửi ảnh Log → Sắp tới có 3 lịch comment nhưng tab Comment chỉ hiện 2 bài + badge "2", hỏi tại sao lệch.

- [x] **Xác nhận không phải đếm sai**: `reconcileQueueSchedules()` (`background.js`) chỉ đối chiếu lịch cho `kind:'post'`, không có nhánh nào cho `kind:'comment'` — lịch comment tạo từ 1 bài đang có trong `state.comments`, nếu bài đó sau đó rớt khỏi danh sách (vd cross-post đã đủ người comment ở chỗ khác) thì lịch đã tạo vẫn còn nguyên trong `activityUpcoming` (tự chạy đúng giờ vì payload tự chứa đủ thông tin) — "Sắp tới" và badge Comment đơn giản là đếm 2 nguồn dữ liệu khác nhau, có thể lệch mà không phải lỗi.
- [x] **Fix bug thật phát hiện thêm**: mọi dòng lịch comment ở "Sắp tới" hiện cứng "Chưa có nhóm" dù có nhóm thật — `renderActivity()` đọc sai field (`groupIds`/`payload.posts[0].groupIds`, đúng cho lịch đăng bài) thay vì `payload.group_name`/`payload.group_id` (đúng cho lịch comment). Thêm `upcomingGroupLabel(u)` tách nhánh riêng.
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.200.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, xem tab Log → Sắp tới các dòng Comment đã hiện đúng tên nhóm chưa (không còn "Chưa có nhóm").

## GroupFlow: filter "Người" gõ-tìm + hiện số bài, fix dropdown "Mẫu bình luận" cắt chữ, làm rõ tag "📌 Đăng …" (2026-07-04)

Tony gửi 3 ảnh 2 tài khoản khác nhau, hỏi có phải bug phân quyền (dropdown "Người" khác nhau giữa 2 máy), báo dropdown "Mẫu bình luận" nhìn lỗi ("check box gì kìa"), yêu cầu filter Người gõ-tìm được + hiện tổng số bài từng người, và thắc mắc sao chạy comment xong lịch lặp hàng ngày lại "tự sửa vô lý".

- [x] **Rà lại "bug phân quyền"**: xác nhận KHÔNG có — dropdown "Người" build từ dữ liệu cross-posts đã tải về máy đó (`state.comments`), không phải roster toàn hệ thống; backend không phân biệt role/plan. 2 máy khác nhau chỉ vì tập bài "còn mở để comment chéo" của mỗi tài khoản khác nhau tại thời điểm đó.
- [x] Fix CSS `.post-filter-bar .gf-select-sm { max-width: 110px }` cắt chữ "Mẫu bình luận: Tất cả" — thêm rule riêng cho `#tab-comment` (min-width 150px, chia 2/hàng).
- [x] Đổi `#commentFilterPerson` từ `<select>` sang `<input list> + <datalist>` — gõ-tìm được, mỗi tên hiện `(N)` = số bài đang có trong danh sách đã tải.
- [x] Thêm tiền tố `📌 Đăng` + tooltip cho tag `c.lastPostedAt` (ngày đăng bài gốc) để không còn nhìn giống 1 phần của tag lịch lặp hàng ngày ngay cạnh nó — làm rõ đây không phải bug "lịch tự sửa".
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.199.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, mở tab Comment — gõ vài ký tự tên đồng đội vào ô "Người" xem có tự lọc đúng người không, số `(N)` có hợp lý không; xem dropdown "Mẫu bình luận" đã hiện đủ chữ chưa; xem tag "📌 Đăng …" cạnh lịch lặp hàng ngày đã rõ ràng hơn chưa.

## GroupFlow: fix 1 lịch comment "1 lần cụ thể" chạy 2 lần (2 comment cùng phút) (2026-07-04)

Tony gửi ảnh Log thấy 2 dòng comment liên tiếp cùng phút (`15:17 04-07`) trên cùng 1 bài, nội dung khác nhau — hỏi tại sao "chạy liên tục 2 comment".

- [x] **Root cause**: alarm thật (`gf_cmt_*`/`gf_job_*`, `chrome.alarms`) và `retryMissedActivity()` (chạy bù mỗi phút qua `gf_retry_missed`) độc lập nhau, cùng có thể chạy 1 job — `chrome.alarms` không đảm bảo bắn đúng giờ nên `retryMissedActivity()` dễ "nhận nhầm" job chưa thật sự lỡ hẹn, chạy nó trước, rồi alarm thật vẫn tự bắn sau đó (payload `alarm_<tên>` chưa bị dọn) → chạy lại lần 2.
- [x] **Fix**: `GF_BG._claimedAlarms` (Set trong bộ nhớ, check-and-claim đồng bộ) ở cả `chrome.alarms.onAlarm` lẫn `retryMissedActivity()`; `retryMissedActivity()` tự `chrome.alarms.clear()` + xoá `alarm_<tên>` khi chạy bù thành công.
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.198.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, lên lịch vài comment "1 lần cụ thể" (đặc biệt lúc máy vừa mở lại/service worker vừa restart — điều kiện dễ trigger race nhất), theo dõi Log vài ngày xem còn thấy 2 dòng comment trùng phút trên cùng 1 bài không.

## GroupFlow: hiện giờ comment lần cuối trên tag "✓ Đã comment" (2026-07-04)

Tony hỏi: "vậy bài đó mày có biết là comment lần cuối là lúc nào không?" rồi yêu cầu hiện ra UI.

- [x] Thêm `lastCommentedAtLabel(c)` (`sidepanel.js`) — đọc `state.commentedRecords[c.id]`, lấy mốc mới nhất trong số các nhóm, format qua `formatScheduleWhen()`.
- [x] Hiện ngay trên tag "✓ Đã comment" trong `renderComments()`: `✓ Đã comment · 2026-07-04 15:49`.
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.197.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, comment 1 bài (▶ Chạy) → xác nhận tag hiện đúng giờ vừa comment.

## GroupFlow: đảo ngược 1 phần v1.0.194 — auto-lên-lịch comment chỉ cho bài chưa từng comment (2026-07-04)

Tony test thật trên máy sau khi v1.0.194 lên: "hình như mày comment xong là mày không biết mày đi set lịch lại đéo mẹ kì cục vậy? bài mới chạy comment xong thì mày auto set lịch lại làm gì vậy trời ạ. comment xong rồi thì thôi chứ" — kèm ảnh chụp 1 bài "✓ Đã comment" đã bị tự set lịch mới ("🕒 2026-07-04 15:49") ngay sau khi comment xong.

- [x] **Root cause**: lịch "1 lần cụ thể" chạy xong bị xoá khỏi `activityUpcoming` (đúng thiết kế) → v1.0.194 đã bỏ hết điều kiện chặn theo trạng thái "đã comment" khỏi auto-lên-lịch → lượt tick tiếp theo (nền hoặc mở lại tab Comment) thấy bài "chưa có lịch" là set lại ngay (+15 phút), tạo cảm giác "vừa chạy xong lại bị set lịch lại liền".
- [x] **Fix**: khôi phục lại điều kiện `!isCommentDone(c)` trong `autoScheduleUnscheduledComments()` (`sidepanel.js`), và check `commentedRecords[jobId]` (cross-post) + lọc `pendingGroups` theo `commentedRecords` (bài của chính mình) trong `runFlow1BackgroundSync()` (`background.js`) — về đúng như trước v1.0.194. Auto-lên-lịch giờ chỉ là "mồi lần đầu" cho bài chưa từng comment; đẩy thêm bài đã comment phải chủ động (tự tay "+ Lên lịch"/"▶ Chạy", hoặc "Lặp lại hàng ngày").
- [x] **Giữ nguyên phần đúng của v1.0.194**: `runComment()` (`background.js`) vẫn không chặn "job trùng lặp" lúc CHẠY THẬT — 1 lịch đã tồn tại (tự động lần đầu hay tự tay) vẫn phải chạy khi tới giờ dù trước đó lỡ đã comment bởi đường khác. Không revert phần này.
- [x] Cập nhật `docs/GROUPFLOW.md` (sửa lại các đoạn vừa viết cho v1.0.194 mô tả sai hành vi mới), `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.196.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension. Test — comment xong 1 bài (▶ Chạy tay hoặc lịch chạy tới), làm mới tab Comment → xác nhận bài đó **không** tự có lịch mới nữa (chỉ hiện "+ Lên lịch", không phải "🕒 ..."). Test 2 — 1 bài mới, chưa từng comment lần nào, chưa có lịch → xác nhận vẫn tự động được set lịch như bình thường.

## GroupFlow: chặn máy tự ngủ khi đang chạy lịch (2026-07-04)

Tony hỏi: "vậy có cách nào không cho mày ngủ khi làm chạy không?" — sau khi xác nhận lịch đăng bài/comment chạy bù được cả khi máy tắt/mở lại (`retryMissedActivity()`), câu hỏi tiếp theo là làm sao TRÁNH việc máy tự ngủ giữa chừng ngay từ đầu.

- [x] Thêm quyền `power` vào `manifest.json`.
- [x] Gọi `chrome.power.requestKeepAwake('system')` ở top-level `background.js` (chạy lại mỗi khi service worker (re)start) — chặn Windows tự sleep do idle timeout, không ép sáng màn hình.
- [x] Cập nhật `docs/GROUPFLOW.md`, `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.195.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension, để máy idle qua đúng thời gian Windows cấu hình tự sleep — xác nhận máy KHÔNG tự ngủ nữa khi Chrome/CocCoc + extension đang mở (dù không thao tác gì). Lưu ý: nếu Tony chủ động bấm Sleep hoặc đóng nắp laptop, máy vẫn ngủ bình thường — đây là giới hạn đã biết, không phải bug.

## GroupFlow: bỏ chặn "đã comment rồi" khỏi mọi luồng tự-lên-lịch/tự-chạy comment (2026-07-04)

Tony phản bác thiết kế cũ: "tại sao mày cứ cho là bài đã comment rôi thì không được lên lịch nhỉ? 1 bài có thể comment nhiều lần tùy thích mà" — sau khi hỏi lại để chốt rule cụ thể, Tony trả lời: "local có 10 bài chưa có lịch thì phải tự auto set lịch không quan tâm đã comment hay chưa. nếu lịch đã lên mà chưa chạy (trước đó đã có comment rồi) cũng phải chạy."

- [x] **Rule 1 — auto-lên-lịch không quan tâm đã comment hay chưa**: bỏ điều kiện `!isCommentDone(c)` khỏi `autoScheduleUnscheduledComments()` (`sidepanel.js`) — tiêu chí duy nhất giờ là "chưa có lịch nào đang chờ". Bỏ tương tự ở `runFlow1BackgroundSync()` (`background.js`): xóa check `commentedRecords[jobId]` cho cross-post, xóa lọc `pendingGroups` theo `commentedRecords` cho bài của chính mình (`postQueue`) — chỉ còn `alreadyScheduledIds` (tránh xếp trùng lịch) chặn cả 2 vòng.
- [x] **Rule 2 — lịch đã lên mà chưa chạy thì vẫn phải chạy dù đã comment trước đó**: đây chính là lớp chặn "giữ nguyên cho `runScheduledJob()`" mà v1.0.191 cố tình để lại (coi là đúng rủi ro "2 alarm trùng nổ gần nhau"). Xóa hẳn lớp chặn "job trùng lặp" trong `runComment()` (`background.js`) — không còn phân biệt theo `opts.allowRepeat` nữa vì mọi nơi gọi đều cần chạy thật; xóa tham số `allowRepeat` khỏi 2 nơi gọi còn truyền dư (`tickDailyFixedSchedules()`, handler `GF_RUN_COMMENT`).
- [x] Giữ nguyên `isCommentDone()`/tag "✓ Đã comment"/filter "Bình luận" — vẫn hiển thị đúng trạng thái, chỉ không còn dùng để chặn lên lịch/chạy.
- [x] Cập nhật `docs/GROUPFLOW.md` (sửa lại các đoạn lịch sử v1.0.185/v1.0.188/v1.0.191/v1.0.169 mô tả sai hành vi mới, thêm mục "Đảo ngược ở v1.0.194"), `CHANGELOG.md`.
- [x] Bump `manifest.json` → v1.0.194.
- [ ] **Cần Tony xác nhận trên máy thật (v1.0.194)**: reload extension. Test — 1 bài đã "✓ Đã comment" nhưng chưa có lịch (bấm "Làm mới" tab Comment) → xác nhận tự động được xếp lịch mới (+15 phút) thay vì phải tự bấm "+ Lên lịch". Test 2 — đặt lịch "1 lần cụ thể" cho 1 bài, sau đó comment tay bài đó bằng "▶ Chạy" TRƯỚC khi lịch tới giờ, đợi lịch tới giờ → xác nhận lịch vẫn chạy thật (đăng thêm 1 comment nữa), không bị bỏ qua êm. **Sandbox không test được bằng FB/Chrome thật — chỉ verify qua đọc code + `node --check`.**

## GroupFlow: bỏ nút "Chạy đã chọn" ở tab Comment (2026-07-04)

Tony: "bỏ nút chạy đã chọn chỉ có nút lên lịch đã chọn, sắp xếp UI lại" — đẩy hàng loạt comment thật lên Facebook ngay lập tức (không giãn cách xem trước như lên lịch) dễ bấm nhầm; chỉ giữ đường lên lịch cho hành động hàng loạt.

- [x] Bỏ nút `#btnRunAllComments` ("Chạy đã chọn") khỏi footer hàng loạt tab Comment (`sidepanel.html`) — chỉ còn `#btnScheduleComments` ("Lên lịch đã chọn"), đổi nhãn `batch-queue-label` thành "Tick bài → Lên lịch" giống footer Tạo bài.
- [x] Xóa code không còn nơi gọi: `runAllComments()`/`collectSelectedCommentJobsRaw()`/`estimateCommentBatchMinutes()`/`confirmNightAction()` (`sidepanel.js`), handler `GF_RUN_COMMENT_BATCH` + `runCommentBatch()` (`background.js`). Nút "▶ Chạy" từng bài riêng lẻ (`runComment()`) không đổi.
- [x] Cập nhật `docs/GROUPFLOW.md` (mục "Comment chéo team", "Lên lịch giãn cách") + hướng dẫn trong `sidepanel.html` (tab Hướng dẫn) khớp UI mới.
- [x] **Trả lời câu hỏi "bài chưa lên lịch sao không tự động gán lịch?"**: đọc `autoScheduleUnscheduledComments()` xác nhận tính năng auto-lên-lịch chạy đúng như thiết kế mỗi lần tải/làm mới tab Comment — 2 lý do 1 bài KHÔNG được tự lên lịch: (1) bài đã "✓ Đã comment" bị loại có chủ đích (không cần lên lịch comment cho bài xong rồi — nút "+ Lên lịch" trên card đó chỉ để đặt lịch đẩy lại thủ công); (2) bài chưa có nhóm nào với post_id FB hợp lệ (đang chờ đồng bộ) bị `buildRawJobsForOneComment()` bỏ qua ÂM THẦM — không có cách nào biết vì sao. Đã thêm toast báo riêng số bài rơi vào case (2) thay vì im lặng mãi mãi.
- [x] Bump `manifest.json` → v1.0.193.

## GroupFlow: tự lên lịch comment cho bài chưa có lịch + chạy bù khi mở lại máy (2026-07-04)

Tony: "bài nào chưa set lịch ở local thì tự động set lịch theo rule, nếu bài đó set lịch rồi mà chưa chạy cho thì phải chạy lại khi mở máy, chú ý là phải chạy tuần tự theo hệ thống không được chạy 1 lần nhiều tác vụ." Đã hỏi lại và chốt phạm vi: chỉ lịch comment, "mở máy" = mở lại Chrome/máy tính sau khi tắt hẳn, giữ nguyên rule xếp lịch cũ.

- [x] **Auto-schedule mở rộng sang bài của chính mình**: `runFlow1BackgroundSync()` (background.js) trước chỉ tự lên lịch comment nền cho bài đồng đội (cross-post) — bài của chính mình chỉ được lên lịch khi user tự mở tab Comment. Giờ quét thêm `postQueue`, dùng chung `alreadyScheduledIds`/`commentedRecords` nên không trùng lịch tay.
- [x] **Chạy bù lịch "1 lần cụ thể" quá hạn ngay khi mở lại Chrome**: tách logic từ nhánh `gf_retry_missed` (alarm mỗi phút) ra `retryMissedActivity()`, gọi thêm từ `chrome.runtime.onStartup` — không chờ alarm tự nổ.
- [x] **Fix lỗ hổng thật: lịch "Lặp lại hàng ngày" đánh dấu "xong" TRƯỚC khi chạy thật** — `tickDailyFixedSchedules()` set `lastRunDate = today` ngay khi phát hiện, trước khi job (trong hàng đợi, có delay vài giây) thực sự chạy — Chrome/máy tắt đúng lúc đó thì mất cả ngày, không cách nào phát hiện lại. Tách `pendingRunDate` (đánh dấu "đã nhận") khỏi `lastRunDate` (đánh dấu "chạy xong thật", set sau khi `runComment()` hoàn tất — `markDailyScheduleDone()`). Thêm `recoverStalledDailySchedules()`, gọi lúc `onStartup` — xoá `pendingRunDate` không khớp `lastRunDate` của phiên trước để chạy bù ngay.
- [x] **Fix bug thật phát hiện thêm khi sửa (không phải yêu cầu gốc, nhưng đúng chỗ đang sửa)**: `runFlow1BackgroundSync()` ghi `bgAutoScheduledCrossIds: [...scheduledIds]` với `scheduledIds` không tồn tại trong scope — ném `ReferenceError` mỗi khi tự xếp lịch được ≥1 bài mới, khiến `activityUpcoming` không lưu được dù alarm đã tạo thật. Xoá dòng ghi key chết này.
- [x] **Đảm bảo chạy tuần tự**: mọi hành động chạy thật vẫn qua `enqueueTask()` (hàng đợi promise-chain dùng chung toàn extension — đã có sẵn từ trước). `chrome.runtime.onStartup` đổi sang `await` tuần tự từng bước (không bắn song song) để tránh race đọc-sửa-ghi storage giữa các bước catch-up.
- [x] **Câu hỏi thêm của Tony sau khi dò kịch bản cụ thể**: "1 bài đã comment, lên lịch 10h30, tắt máy, mở lại lúc 2h30 chiều — có biết chưa chạy để đưa vào hàng đợi không?" → có (qua `retryMissedActivity()`), nhưng hỏi tiếp: nếu vừa có lịch đăng bài vừa có lịch comment cùng quá hạn thì tuần tự thế nào, giãn cách bao nhiêu? Phát hiện thêm 1 lỗ hổng: trước đó có TUẦN TỰ (không chồng) nhưng KHÔNG có giãn cách — job sau chạy ngay khi job trước xong. Đã sửa: thêm giãn cách `betweenPosts`/`betweenComments` (theo `securityLevel`, dùng lại `getSecurityDelays()` có sẵn) giữa các tác vụ chạy bù thứ 2 trở đi trong cùng lượt, ở cả `retryMissedActivity()` (lịch 1 lần) và `tickDailyFixedSchedules()` (lịch lặp hàng ngày, khi nhiều entry cùng quá hạn 1 tick) — tác vụ đầu tiên chạy ngay, các tác vụ dồn cục phía sau mới cần giãn.
- [x] Bump `manifest.json` → v1.0.192.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension (v1.0.192). Test 1 — đăng 1 bài mới lên nhóm, KHÔNG mở tab Comment, chờ 1 chu kỳ `gf_tidien_sync` (hoặc bấm "↻ Đồng bộ ngay") — xác nhận bài tự có lịch comment dù chưa từng mở tab Comment. Test 2 — đặt 1 lịch "Lặp lại hàng ngày", tắt hẳn Chrome đúng lúc gần tới giờ chạy hôm đó (mô phỏng bị ngắt giữa chừng), mở lại Chrome sau giờ đó — xác nhận job chạy bù ngay thay vì im lặng chờ đúng giờ hôm sau. Test 3 — đặt 1 lịch "1 lần cụ thể" trong quá khứ gần (bằng cách sửa giờ hệ thống hoặc chờ), tắt Chrome trước giờ chạy, mở lại — xác nhận chạy bù ngay lúc mở máy. Test 4 — đặt cả lịch đăng bài lẫn lịch comment cùng quá hạn (2 lịch trở lên), mở lại Chrome — xác nhận job thứ 2 trở đi chờ vài phút (theo `securityLevel`) trước khi chạy, không bắn sát nhau. **Sandbox không test được bằng FB/Chrome thật — chỉ verify qua đọc code + `node --check`.**

## GroupFlow: fix lịch "Lặp lại hàng ngày" (đẩy bài) chỉ chạy đúng 1 lần rồi tự tắt (2026-07-04)

Tony hỏi: "trong comment extension tại cái nào đã comment rồi lại không được comment nữa? khi chạy comment thì vẫn chạy, mục đích việc comment này là đẩy bài mà, với lại khi load comment về tại sao không set lịch ta?" — đào code xác nhận đây là bug thật (không phải hiểu nhầm thiết kế), Tony chọn hướng "cho phép đẩy bài lặp lại".

- [x] **Root cause**: `runComment(job)` (background.js) chặn "job trùng lặp" dựa vào `commentedRecords` (đã đăng thành công trước đó thì bỏ qua êm) — lớp này đúng cho lịch "1 lần cụ thể" nhưng vô tình chặn luôn lịch **"Lặp lại hàng ngày"** (`dailyFixedSchedules`, kind:`'comment'`) vốn dùng CHUNG hàm này mỗi ngày: ngày 1 chạy thật (ghi `commentedRecords`) → từ ngày 2 trở đi bị chính lớp chặn coi là trùng lặp, âm thầm không đăng nữa — tự triệt tiêu đúng mục đích "đẩy bài" của tính năng. Nút "▶ Chạy"/"Chạy đã chọn" tay lên bài đã comment cũng bị nuốt tương tự (toast báo thành công giả).
- [x] **Fix**: `runComment(job, opts)` thêm `opts.allowRepeat` — bỏ chặn khi hành động là CHỦ ĐỘNG (lịch lặp hàng ngày qua `tickDailyFixedSchedules()`, "▶ Chạy" qua `GF_RUN_COMMENT`, "Chạy đã chọn" qua `runCommentBatch()`). Giữ nguyên chặn cho lịch "1 lần cụ thể" tự động (`runScheduledJob()`, qua `activityUpcoming`/alarm `gf_cmt_*`) — đúng rủi ro gốc (2 alarm trùng nổ gần nhau, bug v1.0.188) mà lớp chặn sinh ra để giải quyết, không đổi. An toàn trùng-ngày của lịch lặp hàng ngày vẫn do `entry.lastRunDate === today` (đánh dấu trước khi chạy) đảm nhiệm, không phụ thuộc lớp chặn này.
- [x] Thêm `window.confirm` khi bấm "▶ Chạy"/"Chạy đã chọn" lên bài đã có tag "✓ Đã comment" — giờ hành động này SẼ đăng lại thật lên Facebook (không còn bị nuốt êm), cần xác nhận để tránh trùng ngoài ý muốn do bấm nhầm.
- [x] Bump `manifest.json` → v1.0.191.
- [ ] **Trả lời câu hỏi phụ "load comment về sao không set lịch"**: thực ra ĐÃ tự động từ trước (`autoScheduleUnscheduledComments()`, luôn bật, chạy mỗi lần tải/làm mới tab Comment) — chỉ bỏ qua bài đã có lịch hoặc đã "xong". Không cần sửa gì thêm trừ khi Tony thấy 1 bài cụ thể KHÔNG được lên lịch dù rõ ràng chưa có lịch nào — cần case cụ thể để soi tiếp.
- [ ] **Cần Tony xác nhận trên máy thật**: reload extension (v1.0.191), đặt 1 lịch "Lặp lại hàng ngày" cho 1 bài, theo dõi 2-3 ngày liên tiếp xem có đăng comment lại đúng giờ mỗi ngày không (trước đây chỉ ngày đầu chạy). Thử bấm "▶ Chạy" tay lên bài đã có tag "✓ Đã comment" — xác nhận có hộp thoại xác nhận + đăng comment thật lần nữa (không còn báo thành công giả). **Sandbox không test được bằng FB thật — chỉ verify qua đọc code + `node --check`.**

## Website /settings: nút "Lấy Refresh Token" cho Google Drive OAuth2 (2026-07-04)

Tony yêu cầu thêm nút bấm để tự lấy Refresh Token thay vì phải chạy script/OAuth Playground thủ công.

- [x] Backend: `GET /api/drive/auth` (super_admin) — đọc Client ID/Secret từ `app_settings`, tự detect redirect URI từ request (`req.protocol` + `req.get('host')`, cần `app.set('trust proxy', 1)` để đọc đúng `https` sau nginx), tạo Google OAuth URL (`access_type=offline`, `prompt=consent`), lưu `redirectUri` kèm `state` tạm trong RAM (10 phút) để callback dùng lại đúng URI đã tạo auth URL.
- [x] Backend: `GET /api/drive/callback` — đổi `code` lấy `refresh_token` bằng đúng `redirectUri` đã lưu theo `state`, lưu vào `app_settings.google_drive_refresh_token`, redirect về `{origin}/settings?driveAuth=success` (hoặc `?driveAuth=error&message=...`).
- [x] Frontend (`Settings.jsx`): nút "Lấy Refresh Token" cạnh ô Refresh Token (mở tab mới tới Google, theo đúng pattern nút "Kết nối Composio" đã có) — chỉ bật khi đã có Client ID + Secret (mới nhập hoặc đã lưu, field mới `has_client_credentials`). Đọc query `driveAuth` lúc mount để hiện toast + tự chuyển sang tab Drive, dọn query khỏi URL sau khi đọc.
- [ ] **Cần Tony xác nhận trên máy thật**: vào Google Cloud Console → Credentials → OAuth Client ID → thêm Authorized redirect URI đúng domain đang chạy (vd. `https://tidien.xyz/api/drive/callback`). Mỗi lần đổi domain thì cập nhật lại URI này trên GCP là xong, không cần sửa code (route tự detect domain qua request, không còn phụ thuộc `PUBLIC_BASE_URL`).
- [ ] **Cần Tony xác nhận trên máy thật**: bấm "Lấy Refresh Token" → tab Google mở ra → đăng nhập + cấp quyền `drive` → quay lại tab Settings thấy toast "✅ Đã lấy Refresh Token thành công" và badge "Drive đã cấu hình". **Sandbox không test được bằng trình duyệt/OAuth thật — chỉ verify qua đọc code + `npm run build`.**

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
- [x] **Rate limiting tầng Express**: xem mục "Audit đồng bộ extension-website" (2026-07-06) bên dưới — đã thêm `express-rate-limit`.
- [ ] **Còn lại, chưa làm**: AI proxy (`/ai/generate`, `/ai/text`, `/ai/image`) vẫn giữ 1 slot Node đồng bộ chờ LLM — cân nhắc hàng đợi nếu traffic AI tăng thật. Chỉ cần khi thực sự scale lớn, không phải fix cấp bách.

## Đồng bộ thông minh my-posts/cross-posts — cursor + merge-cache + throttle (2026-07-03)

- [x] **Root cause "bài đã tải rồi vẫn tải lại hoài"**: `GET /api/user-sync/my-posts` (tham số `since` có sẵn nhưng client chưa từng gửi) và `GET /api/user-sync/cross-posts` (chưa hề có `since`) luôn trả full 200/100 bài mới nhất mỗi lần gọi, không cursor, không throttle, không cache incremental phía client — tải lại gần như y hệt lần trước ở mọi thao tác (mở panel/tab, đăng bài, comment xong, Làm mới).
- [x] **Fix**: migration `038` — `user_posts.updated_at` (`ON UPDATE CURRENT_TIMESTAMP`) + index `(user_account_id, updated_at)`/`(updated_at)`. 2 route trên nhận `?since=<updated_at cuối>`. Extension: `pullMyPostsFromServer()`/`fetchCrossPostsFromServer()` lưu cursor (`myPostsSyncMeta`/`crossPostsSyncMeta`) + merge-upsert (`mergeUserPostsById()`) thay vì ghi đè cache; throttle 30s giữa 2 lần gọi mạng thật, bấm "Làm mới" tay (`#btnRefreshComments`) mới bỏ throttle (`force: true`). GroupFlow bump `1.0.186`. Chi tiết: `docs/GROUPFLOW.md` đầu file.
- [ ] **Cần Tony xác nhận**: restart backend (migration 038 tự chạy lúc khởi động), reload extension, test đăng bài + comment chéo giữa 2 tài khoản license key khác nhau — bài mới/trạng thái đã comment phải vẫn lan truyền đúng qua nhiều lần refresh, không còn tải lặp lại y hệt mỗi lần.
- [x] **Rate limiting tầng Express + trần queueLimit MySQL pool**: xem mục "Audit đồng bộ extension-website" (2026-07-06) bên dưới.
- [ ] **Còn lại, chưa làm (nếu cần scale tới hàng nghìn user)**: endpoint `status`-rẻ kiểu `sync/status` cho `user-sync/*` để hỏi "có gì mới không" trước khi full pull; tăng hẳn `connectionLimit` pool MySQL (hiện vẫn `10`) nếu tải tăng thật (queueLimit đã chặn ở `30` thay vì vô hạn, nhưng chưa tăng số connection thật).

## Audit đồng bộ extension-website — chặn nguy cơ quá tải VPS (2026-07-06)

Tony yêu cầu review lại toàn bộ cơ chế đồng bộ extension↔backend, fix theo hướng "thông minh nhất để VPS không chết mà chạy nhịp nhàng". Audit (agent Explore quét toàn bộ alarm/API call site/query backend) ra 8 vấn đề thật:

- [x] Không có rate-limit nào ở Express — thêm `express-rate-limit` (`backend/src/middleware/rateLimit.js`): `syncApiLimiter` (60 req/phút/license-key) cho `/api/user-sync/*` + các route `authenticateExtension` trong `groupPosts.js`; `licenseValidateLimiter` (10 req/15 phút/IP) riêng cho `/api/user-auth/validate-key` (public, không auth — bề mặt brute-force key duy nhất).
- [x] `db.js` `queueLimit: 0` (hàng đợi MySQL pool vô hạn, dùng chung cho cả website admin) — đổi thành `30`, vượt trần thì lỗi nhanh thay vì cả app treo.
- [x] `GET /api/user-sync/cross-posts` không index `visible_after`/`comment_count`, extension tự gọi mỗi ~10 phút/thiết bị — cold-start/thiết bị lâu ngày phải quét gần hết `user_posts` mọi user. Thêm trần lookback 30 ngày, tái dùng index `idx_user_posts_updated` có sẵn (migration 038) — không cần migration mới.
- [x] `POST /api/user-sync/posts` không cap mảng `posts` (khác `/activity` đã cap 100) — thêm `.slice(0, 200)`.
- [x] `group_post_drafts.is_shared` (migration 026) chưa từng có index — thêm migration `040_group_post_drafts_shared_index.sql` + `ensureGroupPostDraftsSharedIndex()`.
- [x] `syncLocalPostsToServer()` (sidepanel.js) chạy vô điều kiện mỗi lần mở panel, gửi lại TOÀN BỘ bài `posted` trong `postQueue` thay vì chỉ bài mới — sửa dùng lại cờ `tidienSynced` có sẵn (đã dùng đúng bởi `pushUnsyncedPostsFromQueue()`, background.js).
- [x] Nút "Làm mới" (`#btnRefreshComments`) không có disabled-guard + dùng `force:true` bỏ throttle — thêm guard giống `runTidienSyncNow()`.
- [x] "Lưu" Cài đặt luôn force full tidien sync (bỏ cooldown 90s + kích hoạt vòng lặp pull draft ~40 lượt) dù đổi field không liên quan — chỉ force khi field tidien thật sự đổi.
- [ ] **Cần Tony xác nhận trên server thật**: restart backend (migration 040 tự chạy), theo dõi log/CPU MySQL sau vài ngày nhiều user dùng cùng lúc xem tải có giảm rõ so với trước không; test rate-limit không chặn nhầm luồng dùng bình thường (đăng nhiều bài liên tục, mở/đóng panel nhanh).

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
