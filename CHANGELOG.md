# Changelog

## [Unreleased]

### Changed
- **Google Drive**: migrate từ Service Account sang OAuth2 User Authentication (Client ID/Secret + Refresh Token) — fix lỗi `Service Accounts do not have storage quota`. DB: 3 cột mới `google_drive_client_id/secret/refresh_token` thay `google_drive_service_account_json`; route `GET /api/auth/drive` + `/callback` để lấy refresh token qua consent flow. Xem `docs/GOOGLE_DRIVE.md`.

### Fixed
- **Google Drive OAuth2 migration**: migration `029_app_settings_drive_oauth.sql` (dọn key Service Account cũ) đã được tạo nhưng chưa wire vào `app.js`/`migrationRunner.js` như các migration khác — đã thêm `ensureDriveOAuthMigration()` để tự chạy lúc khởi động.

### Added
- **GroupFlow v1.0.136** — Tab **Log → Nhật ký**: ghi lại từng bước đăng + lỗi chi tiết (lưu 400 dòng); overlay Live Activity log đầy đủ hơn; tự mở Nhật ký khi lỗi

### Fixed
- **GroupFlow v1.0.140** — Fix crash `scrollIntoView` (trigger/editor undefined); đóng dialog cũ khi chuyển nhóm; tìm editor dialog FB chắc hơn
- **GroupFlow v1.0.139** — Composer dialog đã mở → chèn chữ ngay; không reload feed phía dưới
- **GroupFlow v1.0.138** — Countdown composer; tidien đồng bộ push + message rõ
- **GroupFlow v1.0.137** — Đăng nhiều nhóm: chờ lâu hơn khi chuyển nhóm, ép về feed, retry composer
- **GroupFlow v1.0.135** — Fix đăng treo composer: Hybrid + chữ thuần paste một lần; verify trước bấm Đăng
- **GroupFlow v1.0.134** — Cài đặt: **1 pane/mục** (menu con), **Lưu** cố định đáy panel; tab extension luôn hiện; không còn nút Lưu giữa màn hình
- **GroupFlow v1.0.133** — **Đồng bộ ngay** tidien; nghỉ giữa nhóm rõ (1 nhóm → random phút); lịch hẹn chờ tuần tự khi đang đăng
- **GroupFlow v1.0.132** — Cài đặt: menu con sticky + nút **←** quay tab; cuộn trong panel (không `scrollIntoView` làm lệch); countdown đăng cập nhật **mỗi giây** (trước 5s)
- **GroupFlow v1.0.131** — **Hybrid** Cổ điển: paste/gõ theo đoạn (emoji/**đậm** paste, chữ thuần gõ) — bỏ shortcut paste cả bài khi có emoji
- **GroupFlow v1.0.130** — **Chọn nhóm** trên card: hiện chip **bộ custom** gán nhanh (giống tab Nhóm / form soạn)
- **GroupFlow v1.0.129** — Tab **Cài đặt** sắp xếp lại: nav 5 mục, card riêng (Đăng bài / AI / Ảnh / Đồng bộ / Nâng cao gập), nút Lưu sticky
- **GroupFlow v1.0.128** — Cài đặt **Nghỉ dài**: sau mỗi N nhóm (1 = mỗi nhóm), phút nghỉ random min–max; áp đăng ngay + lịch
- **GroupFlow v1.0.127** — Overlay đăng: hiện **1/7 nhóm** + % sau mỗi nhóm; nghỉ có **đếm ngược**; mặc định nghỉ dài **5 nhóm/lần** (không còn 2 phút sau mỗi nhóm)
- **GroupFlow v1.0.126** — Bỏ đăng **Nhanh** (luôn Cổ điển); Cài đặt có **Paste cả bài / Hybrid**; tab Nhóm: ẩn filter, chip bộ custom gán nhanh + sửa membership bộ
- **GroupFlow v1.0.125** — Nút **Đăng** trên card chỉ đăng **đúng 1 bài** (`singlePostId`); bỏ **Đăng X bài** footer; checkbox chỉ dùng Lên lịch/Dàn; bài hẹn giờ không auto-tick
- **GroupFlow v1.0.124** — Tab Nhóm: fix list tràn chồng nút/card (`scroll-sm` thiếu overflow); nút **✕** góc phải header gọn
- **GroupFlow v1.0.123** — Mỗi bài trong danh sách có nút **Đăng** riêng + toggle **Tự xuất ảnh** (bỏ tick = đăng chữ, không gọi API generate)
- **GroupFlow v1.0.122** — Import Excel: đọc ô qua `cell.w` + chuẩn hóa emoji PUA/Wingdings (giống website); danh sách bài có **xóa/đổi trạng thái hàng loạt**
- **GroupFlow v1.0.121** — Cổ điển: sau paste không treo im — luôn mở dialog composer (không dùng inline feed sớm), nudge Lexical bật nút Đăng, re-paste nếu chuyển dialog; status「chờ nút Đăng sáng」
- **GroupFlow v1.0.120** — Composer copy/export: bỏ xuống dòng thừa giữa mỗi dòng (mỗi `<p>` Quill = 1 `\n`, không double)
- **GroupFlow v1.0.119** — Composer: copy/paste giữ emoji (FB/Zalo paste emoji dạng `img` — đọc `alt`, chuẩn hóa Unicode, copy ra clipboard đủ emoji)
- **GroupFlow v1.0.118** — Cổ điển: bài có emoji **paste cả khối** (không hybrid paste/gõ — FB hay nuốt emoji); sau đăng xong **xóa lịch + alarm** tránh đăng lại; watchdog bỏ qua bài đã đăng/chờ duyệt
- **GroupFlow v1.0.116** — Lịch đồng bộ: thanh dưới = giờ bài đã tick; đổi thanh dưới → cập nhật bài ngay; bấm tag **Đăng: …** / **+ Hẹn giờ** trên card để sửa
- **GroupFlow v1.0.114** — UX lịch: ngày/giờ ở **thanh queue** (áp hàng loạt), chỉ hiện ô lịch riêng khi **Sửa bài**; fix crash `Cannot set properties of null` (field ảnh lịch đã xóa)
- **GroupFlow v1.0.113** — Lên lịch đăng bài không chạy: payload alarm không lưu được khi kèm ảnh base64 (strip media, lưu storage trước khi tạo alarm); đến giờ đọc lại queue + IDB; retry miss (`gf_retry_missed`) tạo lại khi mở Chrome; bỏ đăng trùng sau alarm thành công; parse `gio_dang` HH:mm:ss

### Added
- **GroupFlow v1.0.112** — Bỏ「Lịch xuất ảnh」khỏi form nhập tay; mặc định xuất ảnh **ngay trước giờ đăng** (giống website)
- **GroupFlow v1.0.107** — Cổ điển: paste HTML giữ emoji + đậm (fallback gõ theo code point, không cắt surrogate); scroll composer nhẹ (`nearest`, 120px, bỏ lặp scroll-to-top)
- **GroupFlow v1.0.105** — Fix IndexedDB `connection is closing` khi Cổ điển reload tab (retry + mở lại DB); không hydrate IDB khi đang đăng
- **GroupFlow v1.0.104** — Đăng batch: **1 tab FB** ghim dùng chung (10 bài ≠ 10 tab); chỉ focus tab lần đầu; đổi nhóm trên cùng tab
- **GroupFlow v1.0.103** — Cổ điển: `**bold**` → HTML/unicode (không còn dấu `**` trên FB); sau ảnh **gõ chữ** giữ emoji; tự scroll tìm composer nhóm
- **GroupFlow v1.0.102** — Panel tự mở lại sau Cổ điển (FB reload tab xóa iframe); giữ overlay tiến trình khi đang đăng
- **GroupFlow v1.0.101** — Cổ điển: ảnh trước chữ (GPP); paste HTML giữ bold/list; composer đóng = đăng OK (không báo đỏ); nút Ảnh/video + file input mạnh hơn
- **GroupFlow v1.0.100** — Fix SW crash: `const PF` trùng trong `buildComposeVariables` → `Service worker registration failed` (status 15)
- **GroupFlow v1.0.99** — Nhanh lỗi → Cổ điển trong một lần (`postGroupItem`); session lấy từ HTML trang nhóm; cookie `i_user` cho Page (không `switchActor` DOM); Cổ điển tìm「Bạn viết gì」theo text; GraphQL referer đúng nhóm
- **GroupFlow v1.0.98** — Nhanh khớp GPP: `doc_id` đúng (text vs ảnh), Comet token trên GraphQL, auto Cổ điển khi Nhanh lỗi, clear `i_user` khi đăng cá nhân
- **GroupFlow v1.0.97** — Cổ điển: tìm composer rộng hơn, chờ UI load
- **GroupFlow v1.0.96** — Cổ điển: gõ chữ từng đoạn chậm (giống người)
- **GroupFlow v1.0.95** — Cổ điển: không bấm「Chia sẻ」feed cá nhân; chỉ trigger trong `GroupInlineComposer`
- **GroupFlow v1.0.94** — Upload Nhanh: token Comet (`__dyn`, `__csr`…). Cổ điển: quay lại trang nhóm sau đổi profile
- **GroupFlow v1.0.93** — Cổ điển: ảnh qua bridge (không gửi base64 qua message); giữ xuống dòng FB; merge queue giữ `variationDeltas`
- **GroupFlow v1.0.92** — Nhanh upload ảnh: khớp GPP (`waterfallxapp`, query Comet, không `target_id`); báo lỗi FB cụ thể; kiểm tra ảnh trống
- **GroupFlow v1.0.91** — Giữ format Quill (B/I, list, xuống dòng): lưu `variationDeltas` + nháp; `noi_dung` plain vẫn dùng khi đăng FB
- **GroupFlow v1.0.90** — Fix mất ảnh queue: `persistAll` không xóa IDB khi chỉ strip metadata; hydrate ảnh khi mở panel; nháp lưu nhóm+media; sync nhóm mỗi 5p
- **GroupFlow v1.0.89** — Nhanh/Cổ điển: **không** listener `change` trên radio — browser tick, lưu `postMode` khi Thêm/Đăng/Lưu cài đặt
- **GroupFlow v1.0.88** — Fix panel trắng/xám khi đổi Nhanh/Cổ điển: chặn scroll nhảy từ radio ẩn (`sr-only`)
- **GroupFlow v1.0.87** — Đổi Nhanh/Cổ điển: zero render (chỉ lưu `postMode` nền; browser tick radio)
- **GroupFlow v1.0.86** — Debounce lưu mode, giữ scroll iframe
- **GroupFlow v1.0.85** — Sync nhóm: ↻ mặc định GraphQL nền (SW, không mở tab FB); Shift+↻ mới quét joins
- **GroupFlow v1.0.84** — Đổi Cổ điển/Nhanh: chỉ tick radio + lưu `postMode` (không hydrate/re-render queue)
- **GroupFlow v1.0.83** — Fix đơ/giật UI: bỏ hydrate ảnh hàng loạt; debounce render
- **GroupFlow v1.0.82** — Fix SW: `postMediaStore` dùng `globalThis` (không `window`)
- **GroupFlow v1.0.81** — Ảnh bài lưu IndexedDB (`postMediaStore`); queue nhẹ, sửa/lưu không mất media
- **GroupFlow v1.0.80** — Một scroll duy nhất: header/tab cố định, chỉ `.content` cuộn; footer batch không fixed
- **GroupFlow v1.0.79** — UI rõ: bài mới **Thêm danh sách** / **Đăng ngay**; sửa bài chỉ **Cập nhật** (ghi đè, không thêm bài)
- **GroupFlow v1.0.78** — Tab Tạo bài: bỏ footer cố định chồng queue; nút soạn 2 hàng; batch queue nằm dưới danh sách bài
- **GroupFlow v1.0.77** — UX soạn bài: **Lưu** khi sửa xóa form → soạn bài mới; nút **+ Bài mới**; banner sửa trên đầu composer
- **GroupFlow v1.0.76** — Mặc định **Cổ điển** (giống GPP popup); sửa bài giữ ảnh (snapshot backup + không ghi đè media rỗng)
- **GroupFlow v1.0.75** — Nhanh align GPP: composed_text nhiều dòng; WARNING GraphQL không throw
- **GroupFlow v1.0.74** — Nhanh: `story_create` rỗng → Chờ duyệt (không báo đỏ)
- **GroupFlow v1.0.73** — Sửa bài giữ xuống dòng + emoji: Lưu dùng Quill `getText()` thay vì `textContent`
- **GroupFlow v1.0.72** — Nhanh: không coi thiếu post_id là fail nếu FB có thể đã nhận bài (chờ duyệt); Sửa bài giữ media (snapshot + không reset form sau Lưu)
- **GroupFlow v1.0.71** — Cổ điển: bỏ qua popup FB「Bài viết ẩn danh」, chỉ composer công khai
- **GroupFlow v1.0.70** — Cổ điển: không dùng tab ẩn danh Chrome; chọn tab FB cửa sổ thường đã login
- **GroupFlow v1.0.69** — Cổ điển: mở tab FB active + chờ composer lâu hơn; sửa bài không xóa ảnh khi không đổi media
- **GroupFlow v1.0.68** — UI compose kiểu GPP (bảo mật + chiến lược + comment + footer)
- **GroupFlow v1.0.67** — Sửa bài mở form Viết tay; thanh cấu hình đăng đọc đúng form
- **GroupFlow v1.0.66** — Đăng Nhanh: `composed_text` + relay vars (GPP), warmup trang nhóm, parse `post_id`/`legacy_fbid`/pending/spam tốt hơn
- **GroupFlow v1.0.65** — Form **Sửa bài**: chọn Chế độ đăng (Nhanh/Cổ điển) + Giãn cách
- **GroupFlow v1.0.64** — Fix đăng Nhanh: parse GraphQL multi-chunk + thêm pattern lấy `post_id`
- **GroupFlow v1.0.62** — Sync cursor `last_post_id` (0 nếu trống)
- **GroupFlow v1.0.60** — Sync theo **ID client đang giữ**: extension gửi `known_post_ids` / `known_draft_ids` → server trả phần thiếu; xóa local / máy mới = sync lại đủ (không khóa theo sổ server)
- **GroupFlow v1.0.59** — **Sync bài theo ID (server sổ cái)**: bảng `group_post_client_syncs` + `GET /posts/pull` — A/B mỗi người biết `pending_posts_sync` (còn bao nhiêu bài chưa tải), không kéo lại 100 bài
- **GroupFlow v1.0.58** — **Sync tidien thông minh**: `GET /sync/status` so sánh trước khi pull; comment incremental (`since` + `needs_comment`, merge cache); draft tối đa 5/lần auto; throttle 90s; không sync nặng mỗi lần mở panel; full refresh ~mỗi 15 chu kỳ
- **GroupFlow v1.0.57** — **Tự đồng bộ tidien → extension**: alarm ~10 phút — kéo bài comment + draft (chỉ cần API key/đăng nhập trong Cài đặt extension)

### Fixed
- **GroupFlow v1.0.55** — **Nền màu FB** hoạt động đúng: chỉ bài text + chế độ Nhanh; tự bỏ ảnh/media khi chọn nền; chấm màu「Nền」cập nhật khi chọn
- **GroupFlow v1.0.55** — Chế độ **Nhanh** không còn tự mở tab FB khi lỗi (mặc định giống GPP); Lịch sử hiện đúng lỗi Nhanh; tuỳ chọn「Nhanh lỗi → Cổ điển」trong Cài đặt

### Added
- **GroupFlow v1.0.54** — Load nhóm đúng cơ chế GPP: **lite** = 1 GraphQL request trong SW (không pagination/HTML/joins tab); panel không `await` sync; Ctrl+↻ = quick; ↻ = deep scroll
- **GroupFlow v1.0.53** — Sync nhóm giống GPP: mở panel dùng cache + GraphQL nhẹ (không tự quét FB/deep scroll); chỉ **↻ Làm mới** mới quét đủ tab joins
- **GroupFlow v1.0.52** — Tìm nhóm dễ gõ hơn: không mất focus khi lọc (chỉ cập nhật list), tìm không dấu + nhiều từ, hỗ trợ gõ tiếng Việt (IME)
- **GroupFlow v1.0.51** — Sau đăng: toast thành công/thất bại, đánh dấu bài **✓ Đã đăng** (bỏ tick, `postStatus` + thời gian); quay tab Tạo bài để thấy ngay
- **GroupFlow v1.0.50** — Fix Log/Lịch sử: tự chuyển sub-tab「Lịch sử」sau đăng, badge số mục, refresh realtime (`GF_ACTIVITY_REFRESH` + storage); link trong overlay khi đăng
- **GroupFlow v1.0.49** — Lịch sử đăng: luôn có link FB khi OK (permalink từ `post_id`/`url`); tự mở sub-tab「Lịch sử」sau khi đăng xong; refresh live khi `activityHistory` đổi
- **GroupFlow v1.0.48** — Cổ điển: không cướp focus tab FB (`active: false`), chờ FB load, timeout 120s, báo tiến trình từng bước; Nhanh retry session trước khi fallback Cổ điển
- **GroupFlow v1.0.47** — **Bước 3** trên form tạo bài (GPP): tạm dừng/bảo vệ, cấp bảo mật, chiến lược Nhanh/Cổ điển, first comment — **lưu theo từng bài**
- **GroupFlow v1.0.46** — Nhiều ảnh mỗi bài (tối đa 10, `multiple` + drag-drop) như GPP; UI composer `unified-composer-box` + magic blocks (Nền + Media); upload/đăng Fast + Classic hỗ trợ `post.images[]`
- **GroupFlow v1.0.45** — Port đúng GPP: chọn nhóm = **dropdown** (`custom-multiselect` / `options-container`), đăng bài = **full overlay** `.LoadingDiv` + `active-run-dashboard` (vòng %, live log, nút Dừng) — không còn modal sheet tự chế
- **GroupFlow v1.0.44** — **Đăng ngay** giống GPP: đóng modal chọn nhóm, chuyển tab **Log** hiện tiến trình (không còn form tạo bài + list nhóm chồng lên nhau); modal chọn nhóm đưa ra ngoài form; chỉ render picker khi modal mở
- **GroupFlow v1.0.43** — Cấu hình đăng (Nhanh/Cổ điển + Giãn cách) đưa lên **đầu tab Cài đặt**; thanh tóm tắt trên tab Tạo bài; đổi tên「Tùy chọn nâng cao」→「Lịch & campaign」
- **GroupFlow v1.0.41** — UI tab Tạo bài theo GPP: bước 1 nhóm → bước 2 nội dung
- **GroupFlow v1.0.40** — Form Nhập tay: tìm nhóm theo tên + chọn nhanh **bộ custom** khi tạo bài (không chỉ list 80 nhóm không search)
- **GroupFlow v1.0.38** — Fix đăng nhóm: classic mode navigate tab từ background (không `location.href` trong content script); composer DOM giống GPP (paste Lexical, selector đa ngôn ngữ); fix `base64` ảnh; lịch sử + progress hiện **lỗi cụ thể**
- **GroupFlow v1.0.37** — Panel **nổi trên trang** (iframe `gfPanelShell.js`), giống GroupPostingPro: bấm icon → panel trượt bên phải; chuyển tab Chrome quay lại vẫn còn; nút **✕ Đóng** thu gọn (không còn mở tab pinned)
- **GroupFlow v1.0.36** — ~~Bỏ popup: mở tab pinned~~ (đã thay bằng v1.0.37 — panel iframe)
- **GroupFlow v1.0.34** — UI Nhập tay: gom **nội dung + media** cùng một khối (cạnh nhau); danh sách bài hiển thị text + thumb cùng hàng; sửa bài: nội dung + media cạnh nhau
- **GroupFlow v1.0.35** — `Mở tab Chrome`: mở tab pinned (không tự tắt như popup), quay lại tab vẫn còn
- **GroupFlow** — Fix UI Nhập tay: editor Quill auto-init ổn định ngay khi mở (không cần đổi tab); preview bài trong danh sách giữ xuống dòng (không còn dính chữ)
- **GroupFlow** — Fix mất nội dung khi chuyển tab: autosave nháp Nhập tay (A–D + nền) vào storage và tự restore khi quay lại
- **GroupFlow** — Thêm nút **Mở tab riêng** để không bị Chrome tự đóng popup khi chuyển tab/click ra ngoài
- **GroupFlow** — `Mở tab riêng` đổi sang mở **cửa sổ riêng** để tránh tình trạng “đóng hết” khi popup bị auto-close
- **GroupFlow** — Gỡ tính năng **Mời bạn bè vào nhóm** (không ổn định, ưu tiên thao tác tay trên Facebook)
- **GroupFlow** — Fix filter **Admin** + **Có duyệt/Không duyệt**: enrich `join_role` + `invite_permission` từ `/about` HTML/GraphQL (không còn skip); giảm false-positive “có duyệt” do keyword `pending_*`
- **GroupFlow v1.0.29** — Bỏ hardcode “32 nhóm”: deep sync tự đọc số \(N\) từ header `/groups/joins` (đã tham gia \(N\)), chỉ deep khi list thiếu; UI hiển thị \(x/N\) nếu vẫn thiếu
- **GroupFlow v1.0.28** — Fix kẹt 23 nhóm: quick sync (GraphQL+HTML relaxed) chạy trước khi mở panel; deep scroll chạy **nền trong SW** (không timeout); merge union không ghi đè ít hơn; tự mở tab joins khi quét đủ; Ctrl+↻ = nhanh (~23), ↻ = quét nền lên 32
- **GroupFlow v1.0.27** — Auto-sync nhóm mỗi lần mở panel: quick sync ngay (session + joins) rồi deep scroll nền; không xóa list khi lỗi; ↻ = quét đầy đủ, Ctrl+↻ = đọc nhanh; tab Nhóm không còn gọi deep sync nặng gây timeout/0 nhóm
- **GroupFlow v1.0.26** — Fix đủ 32 nhóm như GroupPostingPro: merge session GraphQL + tab `/groups/joins` (không return sớm 23); deep scroll đến khi khớp header FB; quét toàn `[role=main]`; ↻ dùng `GF_SYNC_GROUPS` full pipeline; tự mở tab joins nếu chưa có; auto re-sync khi cache <32; enrich metadata sau merge
- **GroupFlow v1.0.25** — Extract nhóm từ DOM joins tốt hơn: bắt cả nút “Xem nhóm / View group” (không chỉ thẻ `<a>`) để khớp số nhóm hiển thị
- **GroupFlow v1.0.24** — Đồng bộ nhóm “chắc như GroupPostingPro”: auto deep scroll tab `/groups/joins` khi bấm ↻ hoặc phát hiện list thiếu; nút ↻ mặc định deep (Ctrl+↻ để đọc nhanh)
- **GroupFlow v1.0.23** — Detect role admin tốt hơn: parse thêm `viewer_is_admin` / `viewer_is_moderator` / `can_viewer_manage_group` / `admin_type`
- **GroupFlow v1.0.22** — `syncGroups`: luôn merge thêm dữ liệu từ tab `/groups/joins` đang mở (đủ nhóm + role như Group Posting Pro)
- **GroupFlow v1.0.21** — Enrich nhóm cũng chạy khi thiếu `join_role` / `invite_permission`; map OWNER/MODERATOR vào filter **Admin**
- **GroupFlow v1.0.20** — Mời bạn bè: lưu lịch sử `gfInviteHistory` để **không mời lại**; tự sync nhóm khi mở extension nếu cache cũ (>30 phút)
- **GroupFlow v1.0.19** — Lọc nhóm theo **Vai trò** (Admin/Member) + trạng thái **Mời bạn bè**; thêm công cụ **Mời bạn bè vào nhóm** (Classic DOM trên tab Facebook)
- **GroupFlow v1.0.18** — Học **duyệt/không duyệt** sau mỗi lần đăng; enrich nhóm qua GraphQL About + `/about` HTML; content script bắt `doc_id` khi mở trang nhóm
- **GroupFlow v1.0.17** — Phân loại nhóm chính xác hơn (GraphQL + HTML joins + fetch trang nhóm); filter tab Nhóm: **Công khai/Đóng/Kín** + **Có duyệt/Không duyệt**; badge + tóm tắt số lượng
- **GroupFlow v1.0.16** — Fix SW `GF is not defined` trong bundle: gán `globalThis.GF.localProviders` / `localAi` (service worker không có biến global `GF`)
- **GroupFlow v1.0.15** — Fix SW crash status 15: `window` → `globalThis`
- **GroupFlow v1.0.14** — `manifest.json`: thêm `host_permissions` AI provider local
- **GroupFlow v1.0.13** — **Provider local** trong Cài đặt (import JSON, API key/endpoint); AI gọi thẳng không qua website; chọn **thư mục lưu ảnh** (folder picker); reload nhóm khi đổi fanpage; badge nhóm (công khai/đóng/kín, chờ duyệt)
- **GroupFlow v1.0.12** — **Skill local** trên extension (import/export JSON); AI viết gửi prompt từ máy
- **GroupFlow v1.0.11** — Tab **Provider** riêng (chọn text/image provider + danh sách); **AI viết bài** từ chủ đề; cấu hình **lưu ảnh PNG** vào folder local trong Downloads; API `POST /ai/generate`
- **GroupFlow v1.0.10** — Cài đặt **Text/Image provider** giống website (proxy `/api/group-posts/ai/*`); tab Tạo bài **Nhập tay trước Excel**; chọn nhóm inline trên từng bài + tick nhóm khi nhập tay
- **GroupFlow tab Hướng dẫn** — hướng dẫn cài đặt, quy trình đăng bài, troubleshooting ngay trong popup extension
- **GroupFlow composer v1.0.9** — Quill + emoji + spintax + tab A/B/C/D, AI viết lại (9Router), nền màu FB (Nhanh), first comment tự động, lên lịch dàn campaign
- **GroupFlow đăng nền (directApi)** — chế độ Nhanh đăng qua `fbPostBg.js` + `fbSessionBg.js` trong service worker: không mở tab FB, doc_id cố định GPP, nhận `pending_approval`, dừng khi rate limit; video vẫn Classic
- **GroupFlow comment nền** — tab Comment chéo team: `fbCommentBg.js` GraphQL (`useCometUFICreateCommentMutation`), kiểm tra bài trước khi comment, giả lập typing; fallback DOM; vẫn `PATCH /commented` tidien
- **GroupFlow comment batch + lịch** — delay ngẫu nhiên giữa comment theo `securityLevel`; lên lịch nhiều comment (`gf_cmt_*` alarm); tab Activity hiển thị/hủy/sửa giờ
- **GroupFlow docs** — `GROUPFLOW.md` + PRD + README: đăng/comment nền, giãn cách comment, cài extension, ref GPP folder
- **GroupFlow nhập tay media** — upload ảnh/video + prompt AI tạo ảnh trong tab Tạo bài
- **GroupFlow profile switcher** — chọn Cá nhân/Fanpage trên header, `fbActor.js` + sync `actor_id` khi đăng
- **GroupFlow sidepanel UI** — redesign header, tabs, cards, empty states, typography DM Sans
- **GroupFlow website UI polish** — Settings extension key, `/groups` filter + chi tiết/comment, import preview, drafts pagination, Dashboard GroupFlow, mobile nav Group
- **Group shared drafts + group_name** — migration `026`, admin import chia sẻ team, sửa/re-pull draft, `group_name` sync từ extension
- **Group API** — `GET /extension-key`, `GET /stats`, `GET /:id/comments`, lọc search/ngày/user
- **Draft pull API** — `POST/GET /drafts`, `GET /drafts/pull`, migration `025_group_post_drafts.sql`
- Extension nút **Tải từ website** → merge queue local
- **GroupFlow lịch xuất ảnh** — giống fanpage: chưa ảnh → xuất rồi đăng; lịch `anh_*` riêng; quét đêm queue (`postMedia.js`)
- **GroupFlow** — Chrome extension `GroupFlow/fb-group-poster/`
- Backend API `/api/group-posts/*` + migration `024`; doc `docs/GROUPFLOW.md`
- Folder Google Drive riêng từng fanpage (`fb_pages.google_drive_folder_id`) — ảnh AI/upload vào subfolder, fallback folder gốc Cài đặt; doc `docs/GOOGLE_DRIVE.md`

### Fixed
- **GroupFlow v1.0.8** — SW gộp `modules/swBundle.js` (IIFE từng module) — hết crash `GF_GLOBAL`/`const` trùng trong `importScripts`
- **GroupFlow v1.0.7** — fix SW crash: `importScripts` dùng chung scope, nhiều `const GF_GLOBAL` khiến service worker không khởi động (nút Lỗi + Inactive); thêm `gfShared.js`
- **GroupFlow v1.0.6** — bỏ Google Fonts (CSP popup), icon PNG nhỏ, script `validate.ps1`; xóa `_ref-group-posting` gây nút Lỗi Chrome
- **GroupFlow v1.0.5** — xóa lại `_ref-group-posting` trong folder extension (nút Lỗi Chrome); nhận FB từ cookie/session nền, không bắt buộc mở tab FB trước
- **GroupFlow load extension** — thư mục tham chiếu GPP `_ref-group-posting` trong `fb-group-poster/` khiến Chrome từ chối load (`_*` reserved); chuyển ra `GroupFlow/ref-group-posting/`
- **GroupFlow UI popup** — bỏ Side Panel API; `default_popup: sidepanel.html` (bấm icon mở popup, không phụ thuộc SW gesture)
- Extension profile switch: lỗi `unknown` khi mở sidepanel / chọn fanpage — bridge version + bỏ broadcast nhầm trong background GraphQL hook + `/groups/joins/` ưu tiên, merge 2 trang, scroll dài hơn
- **GroupFlow Extract group** — tên nhóm chỉ hiện `Group {id}`: parse JSON nhúng trong HTML (như `fbActor`), hook GraphQL ở page context (`pageNetworkHook.js`), DOM leo parent tìm tên thật
- **GroupFlow `GF_SYNC_GROUPS`** — `postMedia.js` dùng `window` làm service worker crash → background không đăng ký handler; sửa dùng `globalThis`
- **GroupFlow extract nhóm** — GraphQL nền qua cookie session (`fbGroupsBg.js`, giống Group Posting Pro); không mở tab FB
- **GroupFlow queue UX** — tab **Nhóm** riêng: auto-sync FB, tìm tên, gán batch nhiều bài, bộ custom (`groupSets.js`); mỗi bài `groupIds` riêng
- `/posts`: giữ filter, trang phân trang, chế độ lưới/bảng (URL) và scroll khi quay lại từ Sửa/Import/Lên lịch
- `migrationRunner.js`: stray `}` broke backend startup on deploy
- `facebookPublishService.js`: import `isComposioAutoFallbackEnabled` from correct module
- Settings: Google Drive test trước khi lưu; validate Folder ID (không nhận email)
- Settings: thêm nút upload file JSON (Service Account) để auto-fill textarea
- Settings: UI Browse file JSON Drive (khung chọn file rõ, giống Skills)
- Google Drive: đổi scope `drive.file` → `drive` — service account đọc được folder đã share (hết lỗi File not found khi đã Share đúng)
- Settings: Composio UI (field thiếu, nhãn nút rõ); fanpage preview token; chặn ghi đè token rỗng
- Composio: chỉ đọc từ database — bỏ fallback/seed từ `.env`
- Đồng bộ Composio: fix `token_status` truncated (`unknown` → `valid` trên cột legacy)
- Fanpage: tự hiện cấu hình Composio từ Cài đặt; ô readonly `composio_page_token`; fix hiển thị hạn token Composio sau đồng bộ

### Added — Composio & dual token
- Composio settings in DB + UI (Settings → Composio)
- Per-page dual tokens: `page_token` + `composio_page_token` with `token_source` active pointer
- `tokenHealthService`: Graph API validity check per token; hourly cron `checkPageTokens`
- Auto-switch manual ↔ Composio on publish token errors
- Composio refresh only when token status is `expired` (not proactive 6h sync)
- Migrations `019`–`022`; docs: `docs/TOKENS_AND_COMPOSIO.md`
- Script `npm run test:composio-publish` — smoke test đăng bài qua Composio (3 fanpage)

## [0.2.0] — 2026-06-15

### Added — Backend
- Real AI integration: OpenAI, Claude, Gemini (text), DALL-E, Ideogram (image) with placeholder fallback
- `providerService.js` — page generation config from DB
- `jobWorker.js` — batch queue processor
- `scheduler.js` — cron: auto-publish, batch processing, token expiry, daily topic auto-generate
- `activityLog` middleware — auto-log mutations
- `settings` route — storage usage + config
- Facebook photo/video publish via Graph API with local file upload
- Provider test endpoint
- Pagination params on posts list
- Users soft delete filter

### Added — Frontend
- React Query, Toast system, Error boundary
- UI: Badge, Button, Modal, Skeleton, PostCard, FacebookPreview, VideoUpload, Calendar
- NotificationDropdown in header
- BottomNav for mobile
- `useJobPolling`, `useNotifications` hooks
- Posts: filters, grid/table view, edit modal with preview
- Generate: text+image and video tabs
- BatchGenerate: progress bar + auto-polling
- Pages: content topics modal + token update modal
- Dashboard: status breakdown, calendar, upcoming posts
- Settings: storage stats + notifications
- must_change_password forced redirect

### Changed
- Posts default status → `pending_approval` after generate
- Approve sets scheduled if has scheduled_at

## [0.1.0] — 2026-06-15

Initial MVP scaffold (see previous entry).
