# GroupFlow — Mô tả tính năng (cho người dùng)

> **Mục đích file này**: nguồn chuẩn mô tả TÍNH NĂNG theo góc nhìn người dùng — dùng làm chất liệu viết bài giới thiệu/quảng bá, viết tài liệu hướng dẫn, và làm lại menu **Hướng dẫn** trong extension. Khác với `GROUPFLOW.md` (nhật ký kỹ thuật cho dev — vì sao sửa, sửa thế nào), file này chỉ nói **sản phẩm làm được gì và dùng ra sao**. Cập nhật theo phiên bản extension: **v1.0.271** (2026-07-16).

---

## 1. GroupFlow là gì?

GroupFlow là Chrome extension **đăng bài và chăm sóc bài trong các nhóm Facebook** bằng chính tài khoản Facebook đang đăng nhập trên trình duyệt của bạn — không cần token, không cần cấp quyền app, không đưa mật khẩu cho ai.

Giá trị chính:

- **Đăng hàng loạt vào nhiều nhóm** — soạn 1 bài, chọn nhiều nhóm, extension tự đăng lần lượt với khoảng nghỉ ngẫu nhiên như người thật.
- **Lên lịch toàn bộ** — hẹn giờ từng bài, dàn nhiều bài cách đều nhau, hoặc lặp lại hàng ngày; máy tự chạy đúng giờ.
- **Comment chéo đội nhóm** — cả team thấy bài của nhau và vào comment tương tác, đẩy bài lên top một cách tự nhiên.
- **AI hỗ trợ trọn gói** — viết bài từ chủ đề, viết lại cho hấp dẫn, tạo spintax, sinh ảnh minh họa tự động.
- **An toàn là ưu tiên số 1** — mọi hành vi đều được ngẫu nhiên hóa (giờ chạy, khoảng cách, cách gõ chữ) để không tạo "vân tay máy" cho Facebook nhận diện.

Yêu cầu: Chrome đang đăng nhập Facebook. Tính năng đội nhóm (comment chéo, đồng bộ đa thiết bị) cần **license key** kết nối website quản trị.

---

## 2. Tab Tạo bài

### 2.1. Ba cách tạo bài

| Cách | Mô tả |
|---|---|
| **Nhập tay** | Soạn trực tiếp trong composer, đầy đủ công cụ bên dưới. |
| **AI viết** | Nhập chủ đề → chọn skill viết bài + skill ảnh → AI tự viết nội dung (kèm prompt ảnh nếu chọn). |
| **Excel** | Import hàng loạt từ file Excel/CSV (cột `noi_dung · prompt_anh · ngay_dang · gio_dang`), có file mẫu tải sẵn. Emoji/ký tự đặc biệt trong Excel được chuẩn hóa tự động. |

### 2.2. Composer (khung soạn bài)

- **4 biến thể A/B/C/D** cho 1 bài — mỗi nhóm nhận một phiên bản khác nhau, tránh trùng lặp nội dung hàng loạt.
- **Spintax** `{phương án 1|phương án 2}` — chèn nhanh bằng nút, hoặc bôi đen đoạn văn rồi bấm "Bọc". Mỗi lần đăng tự chọn ngẫu nhiên 1 phương án.
- **AI viết lại**: 3 chế độ — làm **hấp dẫn** hơn, **sửa lỗi** chính tả/ngữ pháp, **tạo spintax** tự động từ bài gốc.
- **Điểm chất lượng bài** (thang 100) hiện ngay trên composer.
- **Emoji picker** tích hợp.

### 2.3. Media (ảnh/video/nền màu)

- Đính kèm **ảnh** (≤8MB, tối đa 10 ảnh) hoặc **video** (≤15MB, 1 file) — kéo thả hoặc bấm chọn.
- **Prompt ảnh AI**: chưa có file ảnh thì nhập mô tả — bật "**Tự xuất ảnh khi đăng**" là đến giờ đăng extension tự sinh ảnh rồi mới đăng.
- **Nền màu Facebook**: chọn 1 trong các màu nền — bài chỉ chữ, nổi bật như đăng tay.
- **Lịch xuất ảnh ban đêm**: bật trong Cài đặt — extension tự quét các bài chưa có ảnh và sinh ảnh dần trong khung giờ khuya (mặc định 1h–5h sáng), sáng dậy bài nào cũng có ảnh sẵn.

### 2.4. Bình luận đầu tiên (first comment)

Bật kèm theo bài — đăng xong extension tự comment ngay dòng đầu tiên (hỗ trợ spintax). Dùng để gắn link/hashtag/thông tin liên hệ mà không làm bẩn nội dung bài.

### 2.5. Chọn nhóm & đăng

- Chọn nhóm từ danh sách nhóm đã thu thập (xem Tab Nhóm), có ô tìm kiếm; giới hạn **tối đa N nhóm/bài** (cài được, mặc định 10).
- **Đăng ngay** từng bài, hoặc **Thêm danh sách** để gom vào hàng đợi xử lý sau.
- Trong danh sách bài: sửa nội dung/giờ đăng/nhóm ngay trên card, xem trước, xóa, đăng riêng từng bài. Xóa bài thì mọi lịch của bài đó tự hủy theo.

### 2.6. Lên lịch hàng loạt

- Tick nhiều bài → **Lên lịch đã chọn**: đặt giờ bắt đầu + giãn cách giữa các bài (phút/giờ/ngày). Khoảng cách thực tế được **ngẫu nhiên hóa ±30%** — không bài nào cách bài nào đúng chằn chặn.
- Tùy chọn **Lặp lại hàng ngày**: mỗi bài chạy lại mỗi ngày đúng khung giờ đã dàn (giờ chạy thật cũng tự xê dịch vài phút mỗi ngày).
- **Hủy lịch đã chọn**: tick bài → hủy — gỡ sạch lịch 1 lần lẫn lịch hàng ngày, chắc chắn không "mọc lại".
- Lịch **tự chạy bù**: máy tắt/Chrome đóng qua giờ hẹn → mở máy lại là các lịch bị lỡ tự chạy tiếp, vẫn giữ giãn cách an toàn giữa các job.

---

## 3. Hai chế độ đăng: Nhanh & Cổ điển

| | **Nhanh** | **Cổ điển** |
|---|---|---|
| Cách chạy | Gọi nền, **không mở tab** | Mở tab Facebook thật, tự gõ vào khung soạn như người |
| Tốc độ | Rất nhanh, chạy ngầm | Chậm hơn, thấy được từng bước |
| Video | Không hỗ trợ | Hỗ trợ (video luôn tự đi đường này) |

Mặc định extension **thử Nhanh trước, lỗi thì tự động chuyển Cổ điển** — không cần cài gì thêm. Chế độ Cổ điển có 2 cách chèn chữ: **Paste cả bài** (nhanh, giữ format) hoặc **Hybrid** (paste đoạn đặc biệt, gõ tay đoạn chữ thuần — giống người gõ nhất). Đăng bằng tư cách **cá nhân hoặc Fanpage** (chọn actor ở góc phải trên).

---

## 4. Tab Comment — comment chéo đội nhóm

Tính năng "đinh" cho team: **mọi người comment vào bài của nhau** để bài luôn có tương tác.

### 4.1. Cách hoạt động

1. Bạn đăng bài qua GroupFlow → bài tự đồng bộ lên server của team.
2. Extension của bạn tự kiểm tra từng bài của mình: bài **được duyệt, comment được** thì xác nhận lên server.
3. Đồng đội mở tab Comment → thấy bài của bạn trong mục **Đồng đội** → chạy comment.

### 4.2. Quy tắc hiển thị (quan trọng)

- Chỉ hiện bài **đã được chính chủ xác nhận comment được** — không bao giờ hiện bài chờ duyệt/bài hỏng cho đồng đội phí công.
- Bài xác nhận OK **1 lần là hiện cho cả team đến khi quá N ngày** (N cài trên website, mặc định 60) — kể cả khi máy chủ bài đang tắt.
- Bài đổi trạng thái xấu (bị xóa, chuyển chờ duyệt) → tự biến mất khỏi danh sách của mọi người ở lượt đồng bộ kế tiếp.
- Số đếm: badge đỏ trên tab = số bài **chưa comment**; "Của tôi (N)" / "Đồng đội (N)" = tổng số bài đang hiện (kể cả đã comment — để chạy lại "đẩy bài" khi muốn).

### 4.3. Thao tác

- **Tag tác giả** `👤 tên` trên từng bài — bấm mở thẳng trang Facebook của người đăng.
- Lọc theo **người đăng**, **mẫu bình luận**, **trạng thái lịch**, **đã/chưa bình luận**.
- Nội dung comment: nhập tay từng bài (spintax được), chọn từ **kho mẫu** (Cài đặt → Comment mẫu), hoặc **để trống — tự random mẫu**; nút **AI** sinh comment theo nội dung bài.
- **▶ Chạy** ngay từng bài, hoặc tick nhiều bài → **Lên lịch đã chọn** (giãn cách tự động + tùy chọn lặp hàng ngày). Bài đã comment vẫn chạy lại được để đẩy bài.
- Comment cũng có 2 chế độ Nhanh/Cổ điển với fallback tự động, kèm **mô phỏng đang gõ** (typing indicator) như người thật.

---

## 5. Kiểm tra bài tự động (chạy ngầm)

- Extension tự mở **tab nền** kiểm tra từng bài của bạn: còn xem được không, có đang chờ duyệt không, comment được không — dùng tab thật nên đọc được đúng những gì Facebook thật sự hiển thị.
- Chu kỳ: mỗi 3 phút check 2 bài (mở tab Comment thì check nhanh hơn); kết quả OK tin trong 6 giờ rồi check lại để bắt thay đổi. Bài quá N ngày ngừng check.
- Kết quả check **thay đổi** được ghi vào **Log → Nhật ký**: `✓ Comment được — đã vào danh sách` / `⏳ Chờ duyệt — chưa vào` / `✕ Đã xóa — loại khỏi danh sách` (kèm tên bài, nhóm, lý do).
- Số liệu trên tab Comment **tự cập nhật ngay** khi check xong — không cần bấm Làm mới.
- Comment trúng bài không mở được ô bình luận → **1 lần lỗi là bài tự bị loại** khỏi danh sách/lịch (tự quay lại nếu sau này bài được duyệt/vào được nhóm) — không lặp lại lỗi vô ích.
- Cài lại/reload extension **không phải check lại từ đầu** — kết quả đã có trên server tự nạp về.

---

## 6. Tab Nhóm

- **Thu thập nhóm tự động** từ tài khoản Facebook đang đăng nhập (↻ Làm mới) — tên, ID, đặc điểm từng nhóm.
- **Bộ nhóm tùy chọn (custom set)**: gom nhóm theo chủ đề/chiến dịch (VD "Nhóm BĐS", "Nhóm mẹ bỉm") — chọn cả bộ 1 chạm khi tạo bài.
- **Gán nhóm cho bài** hàng loạt: tick bài + tick nhóm → gán một lần.

---

## 7. Tab Radar — săn lead

- Quét các **nhóm mục tiêu** theo **từ khóa** bạn đặt (VD "cần mua", "xin tư vấn") — ai đăng bài khớp từ khóa là thành lead.
- Lead mới có **thông báo desktop**, hiện trong danh sách kèm tên người đăng, nhóm, đoạn trích, link mở thẳng bài.
- Đánh dấu đã xem, xóa, tìm kiếm, **xuất CSV** danh sách lead.

---

## 8. Tab Log — theo dõi mọi hoạt động

Ba phần:

| Phần | Nội dung |
|---|---|
| **Nhật ký** | Từng bước engine đang chạy (mở tab, gõ chữ, đăng, lỗi ở bước nào) + kết quả kiểm tra bài (✓/⏳/✕). |
| **Lịch sử** | Kết quả từng lượt đăng/comment: OK/Chờ duyệt/Lỗi, **tag tác giả bài** (bấm mở FB), giờ chạy, link mở bài/nhóm, lý do lỗi. Đồng bộ đa thiết bị — máy nào chạy máy kia cũng thấy. |
| **Lịch chờ** | Job sắp chạy: nội dung, giờ, nhóm — **Sửa giờ** hoặc **Hủy** từng job. |

---

## 9. Tab Cài đặt

| Mục | Có gì |
|---|---|
| **Đăng bài** | Cách chèn chữ Cổ điển (Paste/Hybrid) · Nghỉ giữa các nhóm (sau mỗi X nhóm nghỉ random Y–Z phút) · Giãn cách nhanh 3 mức (Nhanh/Cân bằng/An toàn) · **Tránh đăng ban đêm 22:00–07:00** · Ngôn ngữ FB · Max nhóm/bài |
| **Ảnh & Comment** | Tự lưu ảnh generate ra máy (Downloads/thư mục tùy chọn/hỏi mỗi lần) · Lịch xuất ảnh ban đêm · **Kho mẫu comment** spintax dùng chung cho comment chéo |
| **AI** | Khai báo provider chạy trên máy: OpenAI-compatible / Claude / Gemini / Ideogram / 9Router — tách provider viết chữ và sinh ảnh, import/export cấu hình JSON |
| **Skill** | Kho skill local cho "AI viết": skill **viết bài** + skill **prompt ảnh** — tạo/sửa trực tiếp hoặc import `.json`/`.md`/`.txt`, export chia sẻ cho máy khác |
| **Đồng bộ** | License key (hiện/ẩn, thoát) · **Đặt lại thiết bị** (khi đổi máy bị báo vượt giới hạn) · URL server · **Đồng bộ ngay** · tự đồng bộ theo chu kỳ (mặc định 10 phút) |
| **Nâng cao** | Google Drive (legacy, ít dùng) |

---

## 10. An toàn chống phát hiện — thiết kế xuyên suốt

- **Không có gì chạy đều tăm tắp**: khoảng cách giữa nhóm, giữa bài, giữa comment, giờ chạy lịch hàng ngày — tất cả đều random trong biên độ rộng.
- **Nghỉ giữa các nhóm** như người nghỉ tay (random phút, cài được).
- **Tránh khung đêm 22:00–07:00** — lịch rơi vào giờ ngủ tự dời sang sáng.
- **Gõ chữ như người**: chế độ Hybrid gõ xen kẽ paste; comment có mô phỏng "đang gõ…" trước khi gửi.
- **Nội dung không trùng lặp**: 4 biến thể/bài + spintax mỗi lần đăng ra một phiên bản khác.
- **Giới hạn số nhóm/bài** và số job chạy đồng thời (mọi thao tác xếp hàng tuần tự, không bao giờ 2 việc cùng đụng Facebook một lúc).
- **Giữ máy thức**: extension tự chặn máy ngủ/tắt màn hình khi còn lịch cần chạy.
- Đang chạy có **bảng điều khiển trực tiếp** (tiến độ %, log từng bước, nút ⏹ Dừng).

---

## 11. Đồng bộ & làm việc nhóm

- Kết nối website quản trị bằng **license key** — không cần tài khoản/mật khẩu riêng trên extension.
- Giới hạn **số thiết bị/key theo gói** (free/pro/enterprise); nút "Đặt lại thiết bị" tự xử lý khi đổi máy.
- Đồng bộ 2 chiều: bài đã đăng đẩy lên server; bài đồng đội, lịch sử hoạt động, cấu hình N ngày tải về.
- **Đa thiết bị cùng 1 người**: đăng máy này, mở máy khác vẫn thấy đủ bài + lịch sử.
- Website quản trị: quản lý thành viên, license, giới hạn ngày đồng bộ, thống kê.

### Máy tắt thì mất gì?

| Vẫn hoạt động | Cần máy bật + Chrome mở |
|---|---|
| Bài đã xác nhận OK vẫn hiện cho đồng đội (đến khi quá N ngày) | Đăng bài theo lịch của chính máy đó |
| Đồng đội vẫn comment bài của bạn bình thường | Tự kiểm tra bài mới / báo bài chuyển xấu |
| — | Comment theo lịch của chính máy đó |

Lịch bị lỡ do máy tắt sẽ **tự chạy bù** khi mở máy lại.

---

## 12. Lỗi thường gặp & cách hiểu con số

- **"Của tôi (N)" không tăng sau khi đăng** → bài đang **chờ admin nhóm duyệt** (xem Log → Nhật ký sẽ có dòng ⏳). Duyệt xong tự vào danh sách.
- **Số "Đồng đội" mỗi máy hơi khác nhau tại một thời điểm** → mỗi máy đồng bộ ở thời điểm khác nhau; bấm Làm mới là khớp.
- **Comment báo "Bỏ qua — Timeout chờ ô bình luận"** → bài đó Facebook không cho comment lúc này (chờ duyệt/khóa bình luận/chưa vào nhóm) — extension tự loại và sẽ tự thử lại về sau, không cần làm gì.
- **Video không đăng bằng Nhanh** → đúng thiết kế, video luôn đi Cổ điển.
- **Không thấy nhóm** → đăng nhập Facebook trên Chrome rồi vào tab Nhóm bấm ↻ Làm mới.
- **AI báo thiếu key** → Cài đặt → AI: chọn provider + nhập API key.
