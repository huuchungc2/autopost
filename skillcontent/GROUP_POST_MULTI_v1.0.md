---
name: group-post-multi
description: "Dùng skill này khi viết bài Facebook GROUP để PR 1 trong các dự án của Chung (ZaloPilot.vn, DatXeVeQue.vn, GroupFlow) — kể cả khi user nói ngắn như 'viết bài group', 'xuất Excel group', 'viết bài PR GroupFlow'. File này TỰ ĐỦ — không cần đọc thêm file nào khác. Nếu user chưa nói rõ PR cho dự án nào, PHẢI hỏi lại trước khi viết."
---

# SKILL: Viết bài Facebook GROUP — Multi-Project PR (standalone v1.0)

File này nhúng đầy đủ data của cả 3 dự án + toàn bộ rule chung. Dùng được
độc lập trong bất kỳ cuộc chat nào, không cần upload thêm file khác.

---

## BƯỚC 0 — XÁC ĐỊNH DỰ ÁN TRƯỚC KHI VIẾT (bắt buộc, làm đầu tiên)

```
Nếu yêu cầu hiện tại KHÔNG nói rõ PR cho dự án nào → HỎI LẠI ngay:
"PR cho dự án nào — ZaloPilot.vn, DatXeVeQue.vn, GroupFlow, hay dự án khác?"
KHÔNG tự đoán theo ngữ cảnh mơ hồ.

Ngoại lệ — được suy ra không cần hỏi: nếu tin nhắn NGAY TRƯỚC ĐÓ trong cùng
cuộc chat đã xác nhận rõ đang làm cho dự án nào → tiếp tục dùng đúng dự án
đó, không hỏi lại mỗi bài.

Nếu user nhắc dự án CHƯA có trong file này → hỏi gộp 1 lần: "Cho mình data
cố định: Website? SĐT/Zalo? Fanpage? Tính năng/sản phẩm thật? Có gì KHÔNG
được nói (từ cấm, tính năng nhạy cảm) không?" — không tự bịa.
```

---

## PHẦN CHUNG — áp dụng cho MỌI dự án bên dưới, không lặp lại ở từng mục

```
- Vai trò mặc định: người dùng thật kể chuyện/trải nghiệm, KHÔNG phải page
  tự quảng cáo — trừ khi mục riêng của dự án ghi rõ ngoại lệ (vd GroupFlow:
  Chung là chủ thật, được công bố chính chủ).
- Format: đoạn văn tự nhiên, KHÔNG liệt kê icon-đầu-dòng kiểu Fanpage.
  Emoji dùng linh hoạt tuỳ bài — cảm xúc thật khi kể chuyện (vd "...đỡ mệt
  hẳn 😅"), KHÔNG dùng làm bullet/marker đầu dòng thay gạch đầu dòng.
- Trình bày — BẮT BUỘC: giữa mỗi cụm 1-2 câu PHẢI có 1 dòng trống thật
  (Enter 2 lần), không chỉ xuống dòng đơn. Xuống dòng đơn nhìn trên
  Facebook vẫn dính sát nhau, đọc như 1 khối đặc, mất tác dụng dễ đọc
  (phát hiện từ test thực tế đăng lên Facebook).
- CTA follow Fanpage: chỉ gián tiếp/gợi ý tự nhiên để người đọc tự chọn
  theo dõi — KHÔNG viết câu mệnh lệnh "Like/Follow giúp mình". Lý do:
  Facebook coi đây là "engagement bait", giảm reach bài và có thể hạn chế
  phân phối cả trang. Chỉ làm trực tiếp nếu user chủ động chọn, biết rõ
  đang đánh đổi rủi ro giảm reach lấy tốc độ tăng follow.
- Batch: user nói rõ số bài → batch = đúng số đó. Yêu cầu xuất Excel không
  nói rõ số → batch suy ra từ (số ngày x số bài/ngày). Nói chung chung
  "viết vài bài" → mặc định 8 bài, nói rõ giả định trước khi viết. Bài đơn
  lẻ (không phải batch) → tỷ lệ loại bài và rule 1/4 không áp cứng.
- Chống lặp hook (mọi dự án):
  1. Log hook đã dùng — giữ file riêng hoặc cột Excel, dán log 20-30 bài
     gần nhất trước khi viết batch mới nếu muốn enforce thật (không có
     log này thì rule chống lặp chỉ là hình thức).
  2. Công thức sinh hook mới khi thư viện không đủ (5 khung):
     [Quan sát/nỗi đau]  : "<Việc lặp lại X> mệt nhất không phải <bề nổi>, mà là <bề chìm>."
     [Câu hỏi]           : "Có ai <tình huống cụ thể> mà <vấn đề> không?"
     [Kể chuyện thật]     : "<Mốc thời gian> mình <sự việc cụ thể>, kết quả <hệ quả>."
     [So sánh trước/sau]  : "Trước <cách cũ>, giờ <cách mới> nên <lợi ích mềm>."
     [Xác nhận/trả lời]   : "Có bạn hỏi <câu hỏi>, mình đang <hành động>, để <hé lộ nhẹ>."
     Batch >15 bài → tối thiểu 30% hook là bản sinh mới theo khung.
  3. Nghỉ hưu hook: không dùng quá 2 lần/30 ngày trên toàn bộ group đang
     chạy song song.
  4. Đăng nhiều group cùng lúc → đổi tối thiểu hook + xưng hô + 1 câu bối
     cảnh giữa các bản, không dùng nguyên văn.
- Prompt ảnh — 2 lớp, mọi dự án:
  Lớp 1 (AI-render): CHỈ dùng cho scene/mood đời thường, không kỳ vọng AI
  render chữ/số chính xác. Ảnh Group phải trông như người dùng thật tự
  chụp — KHÔNG watermark, KHÔNG banner, KHÔNG bố cục quảng cáo.
  Lớp 2 (Canva/Figma): overlay tay mọi chữ cần chính xác (SĐT, website,
  headline) — không để AI tự render số điện thoại/tên miền.
- Không tự bịa SĐT/Zalo/Fanpage/tính năng cho bất kỳ dự án nào — thiếu thì
  hỏi, không đoán.
- Excel export (nếu user yêu cầu): đúng 4 cột `noi_dung · prompt_anh ·
  ngay_dang · gio_dang`, hỏi gộp 1 câu "Ngày bắt đầu? Mấy bài/ngày? Giờ
  đăng cố định?" nếu thiếu.
```

---

## DỰ ÁN 1 — ZALOPILOT.VN

### Dữ liệu cố định
```
App          : ZaloPilot
Website      : ZaloPilot.vn
SĐT/Zalo     : 087 914 7576 (viết có khoảng trắng, không viết liền)
Email        : hotro@zalopilot.vn
Fanpage      : facebook.com/zalopilot.vn
```

### Product knowledge — CÓ THẬT
Chăm sóc danh sách khách hàng (VIP/quen/đội nhóm, 1 cú bấm) · Đăng bài theo
lịch, hẹn giờ tự động · Duy trì tương tác Nhật ký Zalo (like/comment theo
cấu hình) · Nhiều nick Zalo trên 1 điện thoại, mở nick nào chạy nick đó ·
ZP Menu chọn nhanh tính năng.

### KHÔNG CÓ — không được ám chỉ
Tự tìm khách mới · quét data · auto kết bạn · auto inbox · gửi tin hàng
loạt · buff like/comment · spam · nuôi nick · bypass/hack chính sách Zalo.

### Ràng buộc kỹ thuật
Chỉ chạy Android · phải mở app Zalo mới thao tác được · mỗi lần chạy 1 nick.

### Chân dung khách hàng
Người bán tại nhà · chủ shop nhỏ · sale nhiều nick · người bán dịch vụ
(bảo hiểm/BĐS/spa).

### Từ cấm
spam · buff · hack · bypass · nuôi nick · quét data · auto inbox · cam kết
tăng đơn · 100% an toàn · không bao giờ bị khoá.

### Từ cấm riêng cho CTV/Sale
Cam kết thu nhập cụ thể · "duyệt tự động" · % hoa hồng cụ thể · % giảm giá
cụ thể chưa xác nhận · giải thích cơ chế mã giới thiệu = SĐT · "giảm tới
90%" như mức thường trực · ngôn ngữ tầng bậc ("tuyến dưới", "F1 F2", nhiều
tầng — CTV ZaloPilot CHỈ giới thiệu trực tiếp 1 tầng) · gọi CTV là "kinh
doanh/làm giàu/thu nhập thụ động".
→ Ngôn ngữ mềm: "hoa hồng tháng đầu cao hơn, các tháng sau vẫn ăn đều",
"đang có ưu đãi, xem chi tiết trong app/web", "đăng ký xong đợi admin duyệt".

### Loại bài & tỷ lệ
```
40% GIÁ TRỊ — mẹo bán Zalo, không/ít nhắc app
25% GIỚI THIỆU SẢN PHẨM — kể trải nghiệm dùng ZaloPilot
20% CTV/KIẾM TIỀN — mời làm CTV (ngôn ngữ mềm ở trên)
15% KHUYẾN MÃI — không ghi cứng %
```
Gate: liệt kê loại 5-7 bài gần nhất, lệch xa thì bù loại thiếu.

### Hook library
**GIÁ TRỊ:** Bán Zalo mệt nhất không phải chốt đơn, mà là phải xuất hiện
đều mỗi ngày. · Khách cũ không tự nhớ tới mình nếu mình biến mất quá lâu. ·
Một nick Zalo đã mệt, hai ba nick thì làm tay sao nổi. · Ngày nào cũng định
đăng bài mà cứ quên, tới lúc nhớ ra thì muộn cả buổi. · Chăm 200 khách quen
bằng tay, đọc tin nhắn thôi cũng hết nửa ngày. · Có ai bán Zalo mà vẫn ngồi
tick từng khách 1 để nhắn tin không? · Hôm qua suýt mất 1 khách quen chỉ vì
quên nhắn hỏi thăm dịp lễ. · So với hồi mới bán, giờ số lượng khách quen
tăng gấp mấy lần mà thời gian chăm sóc lại không đủ chia đều.

**GIỚI THIỆU SẢN PHẨM:** Tao mới thử cái app hỗ trợ chăm khách Zalo, đỡ
được kha khá việc lặp lại. · Có app hỗ trợ đăng bài hẹn giờ trên Zalo, ai
hay quên lịch thì thử xem. · Dùng thử được ít bữa cái app quản lý Zalo,
thấy đỡ phải ngồi canh giờ đăng bài. · Có bạn hỏi mình dùng gì để quản
khách Zalo, mình đang dùng thử 1 app hỗ trợ, để review sau. · Trước ngồi tự
tick từng khách, giờ có app hỗ trợ nên đỡ mất công lặp lại hơn.

**CTV/KIẾM TIỀN:** Ai đang dùng app hỗ trợ Zalo mà rảnh, giới thiệu thêm
người dùng cũng có thêm thu nhập nha. · Có chương trình cộng tác viên cho
ai hay giới thiệu bạn bè xài app, ai quan tâm inbox hỏi thử. · Không cần
vốn, chỉ cần giới thiệu người quen dùng thử app là có thêm khoản nho nhỏ.

**KHUYẾN MÃI:** Đang có đợt ưu đãi cho ai mới dùng thử ZaloPilot, ai định
dùng thì tranh thủ. · Thấy page báo có ưu đãi mới, để ý coi hợp thì đăng ký
sớm.

### FAQ CTV
Đăng ký cần điều kiện gì? Không cần license/từng mua gói, đăng ký xong
admin xét duyệt. · Duyệt nhanh không? Admin xét tay, không mốc cố định. ·
Hoa hồng tính sao? Tháng đầu cao hơn, sau vẫn có, chi tiết xem trong
app/web. · Rút tiền được không? Được, có mức tối thiểu.

### Prompt ảnh riêng
SĐT duy nhất trong ảnh: `087 914 7576`. Ảnh Group không mặc định có
SĐT/logo (khác Fanpage) — chỉ đưa vào nếu bài thực sự cần. Scene: người
Việt đang cầm điện thoại xem Zalo, bối cảnh nhà/shop nhỏ, ánh sáng tự
nhiên, không giống ảnh dàn dựng, không watermark.

---

## DỰ ÁN 2 — DATXEVEQUE.VN

### Dữ liệu cố định
```
Website      : datxeveque.vn
SĐT/Zalo     : 0962 100 600 (viết có khoảng trắng, không viết liền)
Fanpage      : facebook.com/datxeveque.vn
Tuyến biết rõ: Sài Gòn ⇄ Đức Linh (Bình Thuận) — gửi hàng 2 chiều
Tuyến khác   : CHƯA XÁC NHẬN — không tự bịa thêm tuyến nếu user không nói rõ
Loại dịch vụ : Trang chủ có các tab Xe ghép / Bao xe / Xe hợp đồng / Gửi
               hàng / Đi chợ quê — nếu bài PR nhắc dịch vụ cụ thể ngoài
               "gửi hàng 2 chiều Sài Gòn-Đức Linh", cần xác nhận thêm chi
               tiết (giá, tuyến, điều kiện) trước khi viết
```

### Product knowledge — CÓ THẬT
Gửi hàng nhỏ gọn 2 chiều Sài Gòn ⇄ Đức Linh · Nhắn Zalo để được sắp xếp
lịch gửi · Giao nhận rõ ràng, an toàn · Giá báo trước, minh bạch · (theo
web) có thêm Xe ghép/Bao xe/Xe hợp đồng/Đi chợ quê — chỉ PR các dịch vụ
này khi user xác nhận chi tiết cụ thể.

### Ràng buộc — nói thật
Chỉ gửi hàng theo lịch đã sắp qua Zalo, không phải giao ngay tức thời.
Chưa xác nhận có nhận hàng dễ vỡ/giá trị cao/hàng cấm vận chuyển hay không
— KHÔNG tự khẳng định nhận mọi loại hàng.

### Từ cấm
an toàn tuyệt đối · không bao giờ trễ giờ · cam kết đúng giờ 100% · bồi
thường vô điều kiện · nhận mọi loại hàng · rẻ nhất thị trường.
→ Ngôn ngữ mềm: "Giao nhận rõ ràng, có báo giá trước", "Sắp xếp lịch cụ thể
qua Zalo, có gì cứ trao đổi trước cho chắc".

### Loại bài & tỷ lệ
```
45% GIÁ TRỊ — mẹo gửi hàng về quê an toàn/tiết kiệm
35% GIỚI THIỆU/DEMO — kể trải nghiệm gửi/nhận hàng qua DatXeVeQue
20% KHUYẾN MÃI — CHỈ dùng khi user xác nhận có ưu đãi cụ thể đang chạy
```

### Hook library
**GIÁ TRỊ:** Gửi đồ về quê mà không dặn trước giờ xe chạy là dễ trễ hẹn với
người nhà lắm. · Đóng gói hàng gửi xe khách, cột dây kỹ 1 chút đỡ lo vỡ dọc
đường. · Nhiều người gửi quà Tết về quê mà không hỏi giá trước, tới nơi mới
biết hơi chát. · Gửi hàng 2 chiều tiện thật, nhưng nhớ ghi rõ tên người
nhận không thì tới bến lại loay hoay.

**GIỚI THIỆU/DEMO:** Mới gửi ít đồ về Đức Linh qua DatXeVeQue, nhắn Zalo
cái là được sắp lịch liền. · Có dịch vụ gửi hàng Sài Gòn - Đức Linh khá
tiện, báo giá trước rõ ràng nên yên tâm. · Tính gửi ít trái cây về nhà, hỏi
thử bên DatXeVeQue thấy trả lời nhanh, giá cũng rõ. · Bạn mình hay gửi đồ
về Bình Thuận qua tuyến này, review là giao nhận đàng hoàng.

**KHUYẾN MÃI:** chờ Chung xác nhận nội dung ưu đãi cụ thể trước khi dùng
loại này.

### Prompt ảnh riêng
Scene: thùng hàng/túi quà đang đóng gói, góc bến xe/xe khách mờ hậu cảnh,
ánh sáng tự nhiên, không chữ đọc được, không logo. Banner rõ tuyến/giá
(lớp 2 Canva): overlay tay tên tuyến + `0962 100 600` + `datxeveque.vn`.

---

## DỰ ÁN 3 — GROUPFLOW (CTA luôn dẫn về datxeveque.vn)

### Dữ liệu cố định
```
Tên công cụ : GroupFlow (Chrome extension)
Cách nhận   : Tải tại datxeveque.vn (nút tải GroupFlow ngay trang chủ)
Chi phí     : MIỄN PHÍ HOÀN TOÀN — dùng thẳng câu này, không rào trước sau
SĐT/Zalo    : 0962 100 600 (dùng chung với DatXeVeQue)
Fanpage     : facebook.com/datxeveque.vn
Đơn vị liên quan: cùng nhóm làm ZaloPilot.vn và DatXeVeQue.vn — nhắc nhẹ,
              không ép mọi bài
```

⚠️ Lưu ý: GroupFlow có phân hạn mức theo license (free/pro/enterprise) cho
1 số tính năng (đồng bộ đội nhóm...). Nói "miễn phí hoàn toàn" mà bản free
có giới hạn nào đó thì người dùng thử dễ hụt hẫng — rủi ro thật, nhưng đã
theo chỉ đạo Chung nên áp dụng, chỉ ghi chú để biết trước.
Không ghi số version cụ thể (v1.0.27x...) vào bài PR.

### Vai trò — KHÁC các dự án khác
Chung là **chủ thật của GroupFlow**, không phải member tình cờ thấy hay.
Bài là công bố chính chủ: "mình làm ra tool này, tặng free cho cộng đồng
bán hàng" — nói thật vai trò, không giả danh. Được phép nói rõ "mình là
người làm ra GroupFlow" ngay đầu bài. Vẫn giữ nguyên tắc trình bày Group ở
PHẦN CHUNG (đoạn văn tự nhiên, dòng trống thật, không icon-đầu-dòng).

**Cộng đồng mục tiêu:** người tự đăng bài bán hàng trong group nói chung —
người bán tại nhà, chủ shop nhỏ, sale nhiều nick, người bán dịch vụ. Không
cần tách persona.

**Hook/CTA "chuyên nghiệp":** hook mở bằng nỗi đau thật (bài trôi, không
biết đăng đâu); có 1 câu khẳng định rõ nguồn gốc ("Mình làm ra GroupFlow,
tặng free cho anh em bán hàng"); CTA rõ ràng 1 hành động cụ thể ("Tải tại
datxeveque.vn") — vẫn tránh liệt kê tính năng dạng bullet ✅ và mọi lời hứa
quá ("giải pháp tối ưu/duy nhất").

### Product knowledge — CÓ THẬT
Đăng 1 bài vào nhiều group cùng lúc, không copy-paste tay · Lên lịch đăng
trước (hẹn giờ, dàn bài cách đều, lặp lại hàng ngày) · Máy tắt/lỡ giờ vẫn
tự chạy bù khi mở lại · AI hỗ trợ viết bài/viết lại/sinh ảnh minh hoạ · Có
Excel import hàng loạt · Đăng qua tài khoản Facebook đang đăng nhập sẵn,
không giao mật khẩu/token · Thu thập danh sách nhóm tự động, gom bộ nhóm
theo chủ đề.

### KHÔNG được PR (thật nhưng nhạy cảm)
Comment chéo đội nhóm (đẩy tương tác giả) — dễ hiểu là mua tương tác ảo,
KHÔNG PR công khai · Tab Radar (quét lead) — nhạy cảm quyền riêng tư, không
PR · Cơ chế random hoá giờ/gõ chữ "chống vân tay máy" — KHÔNG mô tả cơ chế
kỹ thuật này dù có thật.

### Về nỗi đau "bài trôi" — kể thật, giải pháp giữ mờ
Nỗi đau thật, khai thác kỹ: đăng xong bị trôi mất, đăng nhiều group không
nhớ đăng chỗ nào, bài người khác nổi lâu còn bài mình chìm nhanh — hook
tốt, mô tả cụ thể. NHƯNG phần "vì sao bài người khác nổi lâu" — KHÔNG nêu
đích danh "nhờ comment chéo đẩy bài" (hành vi tương tác giả, Facebook xếp
loại inauthentic behavior — nói toạc là tự khai báo vi phạm). Viết mờ:
"có cách giữ bài đỡ chìm nhanh hơn", không giải thích cụ thể là gì.

### Ràng buộc kỹ thuật — nói thật
Chỉ chạy Chrome, cần đăng nhập Facebook sẵn · Cài bằng tải file + giải nén
tay (không phải Web Store) — Chrome có thể cảnh báo lạ, cần hướng dẫn ngắn
cách bật chế độ nhà phát triển.

### Từ cấm
spam · bypass · né kiểm duyệt · vượt chính sách Facebook · không bao giờ
bị khoá/die nhóm · 100% an toàn · tăng tương tác ảo · mua like/comment.
→ Ngôn ngữ mềm khi nói đăng nhiều nhóm: "Đỡ phải ngồi copy-paste tay từng
nhóm", "Đăng xong khỏi phải canh giờ dán lại từng chỗ" — KHÔNG viết "đăng
spam cả trăm nhóm", "né Facebook phát hiện".

### Loại bài & tỷ lệ
```
40% GIÁ TRỊ — mẹo đăng bán trong group
35% GIỚI THIỆU/DEMO — kể trải nghiệm dùng GroupFlow
25% HƯỚNG DẪN CÀI ĐẶT — xử lý rào cản "cài ngoài Web Store an toàn không"
    (loại bài quan trọng hơn bình thường, cần trấn an rõ, không lướt qua)
```

### Hook library
**GIÁ TRỊ:** Đăng 1 bài vào chục cái group mà giờ nào cũng phải ngồi
copy-paste lại là biết mệt cỡ nào rồi. · Bán hàng trong group nhiều khi
thua không phải vì sản phẩm dở, mà vì đăng không đều tay. · Đăng bài xong
5-10 phút sau lướt lại tìm không ra, y như chưa đăng vậy. · Đăng cùng lúc
chục group mà không nhớ nổi mình đã đăng những chỗ nào rồi. · Bài vừa đăng
bị đẩy trôi xuống dưới chỉ sau vài phút, ai lướt group cũng không kịp
thấy. · Thấy bài người ta cứ nổi hoài trên đầu group, còn bài mình đăng
phát chìm phát, không hiểu vì sao.

**GIỚI THIỆU/DEMO:** Mới thử cái extension đăng bài group đỡ phải ngồi
copy-paste từng nhóm, xài thấy được. · Có cái tool Chrome hỗ trợ lên lịch
đăng bài group trước, tới giờ tự chạy, ai hay quên lịch thử xem. · Từ hồi
dùng thử, đỡ hẳn vụ đăng xong không nhớ đã đăng ở đâu — có ghi lại lịch sử
đăng luôn. · Cũng có cách để bài đỡ chìm nhanh hơn so với đăng tay như
trước, dùng thử thấy ổn hơn hẳn.

**HƯỚNG DẪN CÀI ĐẶT:** Cái extension này không có trên Chrome Web Store nên
phải tải về cài tay, nghe hơi ngại nhưng làm theo là được, để mình chỉ. ·
Có bạn hỏi cài extension kiểu tải file ngoài có an toàn không — mình dùng
ổn, chỉ cần làm đúng vài bước là xong. · Thấy nhiều người ngại cài vì
Chrome báo cảnh báo lạ, thật ra chỉ cần bật 1 chế độ trong Chrome là qua
thôi.

### Prompt ảnh riêng
Scene: tay cầm điện thoại/laptop xem giao diện group Facebook (mờ, không
chữ đọc được), ánh sáng tự nhiên, không giống dàn dựng. CTA overlay tay
(lớp 2): "Tải tại datxeveque.vn" — không để AI tự render chữ này. Không có
SĐT/Fanpage riêng cho GroupFlow trong ảnh, chỉ dùng `datxeveque.vn`.

### Bài mẫu đã duyệt (tham khảo văn phong)
```
Có ai đăng bài bán hàng trong mấy group mà sáng đăng, chiều lướt lại tìm
không ra bài đâu luôn chưa 😅

Mình bị hoài — đăng cùng lúc chục cái group mà không nhớ nổi đã đăng ở
đâu, bài thì trôi, bài thì chìm mất tăm. Nên mình làm luôn 1 cái extension
cho Chrome, đặt tên GroupFlow: đăng 1 lần là vô được nhiều group cùng lúc,
lên lịch trước cũng được, khỏi ngồi copy dán tay từng chỗ. Cũng có cách
giúp bài đỡ chìm nhanh hơn hồi tự đăng tay.

Làm ra thấy hữu ích nên tặng FREE hoàn toàn cho anh em bán hàng trong
group, không thu phí gì.

📥 Tải free: datxeveque.vn
📞 Zalo/SĐT: 0962 100 600
📄 Fanpage: facebook.com/datxeveque.vn — page cũng hay cập nhật tool mới
với ưu đãi, ai thấy hữu ích thì follow theo dõi luôn cho tiện
```

---

## THÊM DỰ ÁN MỚI VÀO FILE NÀY

Khi PR cho 1 dự án chưa có ở trên và sẽ dùng lâu dài (nhiều bài, nhiều
lần): hỏi đủ data cố định (mẫu câu hỏi ở BƯỚC 0), viết xong đề xuất thêm 1
mục "DỰ ÁN N — Tên" vào file này theo đúng cấu trúc các mục trên (Dữ liệu
cố định / Product knowledge / Từ cấm / Loại bài & tỷ lệ / Hook library /
Prompt ảnh riêng), để lần sau dùng lại được luôn mà không phải hỏi lại.

---

## QA CHECKLIST CHUNG (áp dụng mọi dự án)

```
□ Đã xác định đúng dự án trước khi viết chưa? (không đoán khi chưa rõ)
□ Có dòng trống thật giữa mỗi cụm 1-2 câu chưa? (không chỉ Enter 1 lần)
□ Có dùng icon/emoji làm bullet-đầu-dòng kiểu Fanpage không? (PHẢI KHÔNG CÓ)
□ Có viết CTA follow/like Fanpage kiểu mệnh lệnh không? (PHẢI KHÔNG CÓ — chỉ gián tiếp, trừ khi user chủ động chọn trực tiếp)
□ Có dùng đúng SĐT/Website/Fanpage của ĐÚNG dự án đang viết không?
□ Có dùng từ cấm riêng của dự án đó không?
□ Nếu là bài CTV/KM (ZaloPilot/DatXeVeQue): có ghi cứng % hay bịa khuyến mãi chưa xác nhận không? (PHẢI KHÔNG CÓ)
□ Nếu là GroupFlow: có nhắc Comment chéo/Radar/cơ chế random-hoá không? (PHẢI KHÔNG CÓ)
```
