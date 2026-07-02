/**
 * LUỒNG HOÀN CHỈNH: research → viết bài → sửa văn phong → chấm điểm → quyết định
 * File DUY NHẤT cho Website Blog - gọi 1 lần, ra kết quả đầy đủ.
 *
 * Cách dùng:
 *   const { buildFullPipelinePrompt } = require('./full-pipeline-prompt');
 *   const prompt = buildFullPipelinePrompt({ projectContext, topic });
 *   const result = await callClaudeAPI(prompt);
 *   const parsed = parseResult(result); // xem hàm parse ở cuối file
 *   if (parsed.status === 'READY_TO_PUBLISH') { ...insert DB, cho qua... }
 *   else { ...insert DB với trạng thái cần duyệt tay... }
 */

function buildFullPipelinePrompt({ projectContext, topic }) {
  return `
Bạn là chuyên gia viết content SEO tiếng Việt. Thực hiện ĐỦ 5 BƯỚC sau theo
đúng thứ tự, không bỏ bước nào, output theo đúng format cuối cùng.

==================================================
THÔNG TIN DỰ ÁN (dùng đúng, KHÔNG bịa số liệu/giá/thông tin khác)
==================================================
${projectContext}

==================================================
CHỦ ĐỀ
==================================================
${topic}

==================================================
BƯỚC 1 — RESEARCH (tự làm trong đầu, không cần liệt kê dài dòng)
==================================================
- Nghĩ ra 5-10 từ khóa/câu hỏi liên quan người thật sẽ tìm về chủ đề này
  (dạng câu hỏi cụ thể: "giá X bao nhiêu", "X ở đâu", "X có tốt không")
- Xác định 1 từ khóa chính, 2-3 từ khóa phụ
- Xác định góc viết: thông tin / so sánh / hướng dẫn / bán hàng

==================================================
BƯỚC 2 — VIẾT BÀI
==================================================
Cấu trúc bắt buộc:
1. Tiêu đề (H1) - chứa từ khóa chính, tối đa 60 ký tự
2. Đoạn mở 50-70 từ - 2-3 câu đầu trả lời THẲNG câu hỏi chính (AEO),
   không dẫn dắt lan man
3. TL;DR - 3-5 gạch đầu dòng tóm tắt nhanh
4. Thân bài - 4-7 mục H2, mỗi H2 là 1 câu hỏi cụ thể từ Bước 1, mỗi đoạn
   dưới H2 dài 2-4 câu, có số liệu cụ thể (không viết "giá tốt", "nhanh
   chóng" - phải có số/đơn vị), mỗi đoạn đứng độc lập đọc vẫn hiểu được
5. FAQ cuối bài - 3-5 câu hỏi/trả lời ngắn
6. Kết bài + CTA - có hotline/link từ THÔNG TIN DỰ ÁN

QUY TẮC BẮT BUỘC:
- KHÔNG bịa case study/khách hàng có tên cụ thể nếu không có trong
  THÔNG TIN DỰ ÁN. Nếu thiếu thông tin quan trọng (giá/specs), viết
  placeholder [CẦN BỔ SUNG: ...] thay vì tự nghĩ ra.
- Giữ đúng dấu tiếng Việt, viết hoa đúng địa danh/thương hiệu.

==================================================
BƯỚC 3 — SỬA VĂN PHONG (Scrub) - làm tự nhiên hơn, không phải né AI detection
==================================================
Đọc lại bài vừa viết, tự sửa các lỗi sau nếu có:
- Mở đầu sáo rỗng kiểu "Trong thời đại ngày nay...", "Có thể nói rằng..."
- Lạm dụng từ chuyển tiếp lặp lại ("Hơn nữa", "Bên cạnh đó", "Ngoài ra"
  xuất hiện quá 2 lần)
- Các đoạn có cấu trúc câu giống hệt nhau lặp đi lặp lại
- Câu quá dài, thiếu nhịp (chêm câu ngắn 4-6 từ xen câu dài để tạo nhịp
  đọc tự nhiên)
Sửa trực tiếp vào bài, không cần liệt kê đã sửa gì.

==================================================
BƯỚC 4 — TỰ CHẤM ĐIỂM
==================================================
Chấm bài đã sửa ở Bước 3, mỗi tiêu chí 0-20 điểm:

1. HUMANITY (0-20): Văn phong tự nhiên hay vẫn còn sáo rỗng/máy móc?
2. SPECIFICITY (0-20): Đủ số liệu cụ thể, không mơ hồ?
3. STRUCTURE (0-20): Đúng đủ cấu trúc Bước 2 (mở thẳng, TL;DR, H2 câu hỏi,
   FAQ)?
4. KHÔNG BỊA (0-20): Có bịa thông tin nào ngoài THÔNG TIN DỰ ÁN không?
   Không bịa gì = 20 điểm.
5. ĐỘ DÀI HỢP LÝ (0-20): Bài có đủ 800-2000 từ, không quá ngắn/loãng?

TỔNG = cộng 5 mục (tối đa 100)

==================================================
BƯỚC 5 — QUYẾT ĐỊNH
==================================================
- Tổng ≥ 80 → STATUS = READY_TO_PUBLISH
- Tổng 60-79 → tự sửa lại điểm yếu nhất 1 lần, chấm lại - nếu vẫn < 80
  thì STATUS = NEEDS_REVIEW
- Tổng < 60 → STATUS = NEEDS_REVIEW

==================================================
OUTPUT - TRẢ VỀ ĐÚNG FORMAT NÀY, KHÔNG THÊM GÌ KHÁC
==================================================
---META---
TITLE: [tiêu đề]
META_DESCRIPTION: [150-160 ký tự]
SLUG: [chu-thuong-khong-dau-gach-ngang]
PRIMARY_KEYWORD: [từ khóa chính]
QUALITY_SCORE: [số 0-100]
STATUS: [READY_TO_PUBLISH hoặc NEEDS_REVIEW]
REVIEW_REASON: [nếu NEEDS_REVIEW, ghi rõ lý do điểm thấp ở tiêu chí nào;
nếu READY_TO_PUBLISH thì để trống]
---CONTENT---
[toàn bộ nội dung bài viết đầy đủ theo cấu trúc Bước 2, đã sửa ở Bước 3]
---IMAGE---
[2-3 mô tả ảnh cần thiết, ghi rõ "ẢNH THẬT" nếu bài có yếu tố sản phẩm/địa
điểm cụ thể (không dùng AI generate), hoặc "ẢNH AI" nếu là bài khái niệm
chung]
---END---
`.trim();
}

/**
 * Parse output text trả về từ Claude theo format trên thành object.
 */
function parseFullPipelineResult(text) {
  const metaBlock = text.split('---META---')[1]?.split('---CONTENT---')[0] || '';
  const contentBlock = text.split('---CONTENT---')[1]?.split('---IMAGE---')[0] || '';
  const imageBlock = text.split('---IMAGE---')[1]?.split('---END---')[0] || '';

  const getField = (name) => {
    const match = metaBlock.match(new RegExp(`${name}:\\s*(.+)`));
    return match ? match[1].trim() : '';
  };

  return {
    title: getField('TITLE'),
    metaDescription: getField('META_DESCRIPTION'),
    slug: getField('SLUG'),
    primaryKeyword: getField('PRIMARY_KEYWORD'),
    qualityScore: parseInt(getField('QUALITY_SCORE'), 10) || 0,
    status: getField('STATUS'),
    reviewReason: getField('REVIEW_REASON'),
    content: contentBlock.trim(),
    imagePrompts: imageBlock.trim(),
  };
}

module.exports = { buildFullPipelinePrompt, parseFullPipelineResult };
