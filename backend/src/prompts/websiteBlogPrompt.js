/**
 * Prompt viết bài Blog SEO cho Website
 * Lấy ý tưởng cấu trúc từ SEO Machine (write.md + research.md), đã chỉnh:
 * - Bỏ rule "Mini-Stories" bịa nhân vật giả
 * - Sửa cho tiếng Việt
 * - Thêm AEO (để được AI trích dẫn)
 *
 * Port từ prompts/website-blog-prompt.js (CommonJS) sang ESM cho backend.
 * Dùng: ghép PROJECT_CONTEXT (lấy từ DB dự án, xem projectContentService.js)
 * + topic vào prompt này, gửi cho AI, nhận về bài viết hoàn chỉnh.
 */

export function buildWebsiteBlogPrompt({ projectContext, topic, researchBrief }) {
  return `
Bạn là chuyên gia viết content SEO tiếng Việt. Viết 1 bài blog hoàn chỉnh theo đúng yêu cầu dưới đây.

## THÔNG TIN DỰ ÁN (BẮT BUỘC dùng đúng, KHÔNG được bịa số liệu/giá/thông tin khác)
${projectContext}

## CHỦ ĐỀ BÀI VIẾT
${topic}

${researchBrief ? `## DỮ LIỆU RESEARCH (từ khóa, đối thủ, khoảng trống nội dung)\n${researchBrief}\n` : ''}

## NGUYÊN TẮC BẮT BUỘC - GATE TRƯỚC KHI VIẾT
Trước khi viết, tự kiểm tra:
1. Tôi có đủ thông tin thật (giá/specs/USP) từ THÔNG TIN DỰ ÁN ở trên không?
   → Nếu thiếu thông tin quan trọng (giá, đặc điểm cụ thể) → KHÔNG bịa,
     hãy viết bài với placeholder rõ ràng dạng [CẦN BỔ SUNG: giá cụ thể]
     thay vì tự nghĩ ra con số.
2. Bài này có lặp lại nội dung/góc độ đã viết trước đó cho cùng dự án không?
   → Nếu là chủ đề tương tự bài đã viết, hãy chọn góc độ khác biệt rõ ràng.

## CẤU TRÚC BÀI VIẾT (bắt buộc theo đúng thứ tự)

### 1. Tiêu đề (H1)
- Chứa từ khóa chính
- Tối đa 60 ký tự cho meta title

### 2. Đoạn mở đầu (50-70 từ) - QUAN TRỌNG NHẤT CHO AEO
- 2-3 câu đầu PHẢI trả lời thẳng câu hỏi chính của bài
- KHÔNG dẫn dắt lan man, KHÔNG mở bài kiểu "Trong thời đại ngày nay..."
- Đây là đoạn AI (ChatGPT/Perplexity/Google AI Overview) sẽ trích dẫn trực tiếp

### 3. Khối TL;DR (3-5 gạch đầu dòng)
- Tóm tắt nhanh nội dung chính, dùng số liệu cụ thể nếu có

### 4. Thân bài (4-7 mục H2)
- Mỗi H2 là 1 câu hỏi/nhu cầu CỤ THỂ người đọc thật quan tâm
  (ưu tiên câu hỏi có trong THÔNG TIN DỰ ÁN nếu có mục "câu hỏi khách hay hỏi")
- Mỗi đoạn dưới H2: 2-4 câu, có số liệu cụ thể, KHÔNG mơ hồ
  (không viết "giá tốt", "nhanh chóng" - phải có số/thời gian/đơn vị cụ thể)
- Mỗi đoạn phải ĐỨNG ĐỘC LẬP được - người đọc chỉ đọc 1 đoạn vẫn hiểu đủ ý
- TUYỆT ĐỐI KHÔNG bịa case study/khách hàng giả có tên cụ thể nếu không có
  trong dữ liệu THÔNG TIN DỰ ÁN. Nếu muốn có ví dụ minh họa, chỉ dùng tình
  huống chung chung không gắn tên người/số liệu cụ thể, hoặc bỏ qua phần này.

### 5. Khối FAQ (cuối bài, 3-5 câu hỏi)
- Format: **Câu hỏi?** / Trả lời ngắn gọn, trực tiếp
- Lấy từ câu hỏi khách thật (nếu có trong THÔNG TIN DỰ ÁN), không tự bịa câu hỏi

### 6. Kết bài + CTA
- 1-2 câu, có hotline/link liên hệ (lấy từ THÔNG TIN DỰ ÁN)

## YÊU CẦU KỸ THUẬT
- Tổng độ dài: 1200-2000 từ (điều chỉnh theo độ phức tạp chủ đề, không ép cứng)
- Mật độ từ khóa chính: tự nhiên, không nhồi nhét (không cần tính % cứng)
- Slug đề xuất: chữ thường, không dấu, gạch ngang (vd: xe-khach-sai-gon-tanh-linh)
- Meta description: 150-160 ký tự, có CTA

## QUY TẮC TIẾNG VIỆT
- Giữ đúng dấu, viết hoa đúng tên địa danh/thương hiệu
- Nếu từ khóa có cả dạng có dấu và không dấu được tìm kiếm, ưu tiên viết
  có dấu trong nội dung, để bản không dấu trong slug

## OUTPUT FORMAT
Trả về đúng cấu trúc sau:

---
TITLE: [tiêu đề]
META_DESCRIPTION: [meta description]
SLUG: [slug]
PRIMARY_KEYWORD: [từ khóa chính]
---

[Nội dung bài viết đầy đủ theo cấu trúc ở trên]

---
IMAGE_PROMPTS: [2-3 mô tả ảnh cần thiết - ghi rõ nếu cần ảnh THẬT (không
được dùng AI generate) do bài có yếu tố sản phẩm/địa điểm cụ thể, hay
ảnh minh họa AI generate được (bài khái niệm chung)]
INTERNAL_LINKS_SUGGESTED: [đề xuất 2-3 trang nội bộ nên link tới, nếu biết]
TODO_MISSING_INFO: [liệt kê rõ những thông tin còn thiếu phải hỏi lại
chủ dự án, nếu có]
---
`.trim();
}
