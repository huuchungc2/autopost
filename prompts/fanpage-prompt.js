/**
 * Prompt viết bài Fanpage - nâng cấp từ prompt hiện tại của AutoPost
 * Thêm: tỷ lệ nội dung 70/20/10, gate chống lặp, native content rule
 */

function buildFanpagePrompt({ projectContext, topic, recentPostsTypes, postType }) {
  // recentPostsTypes: mảng loại 5-7 bài gần nhất, ví dụ ['gioi_thieu', 'gioi_thieu', 'gia_tri', ...]
  // postType: nếu chỉ định sẵn loại bài muốn viết ('gia_tri' | 'gioi_thieu' | 'ban_hang'), 
  //           nếu không có thì để AI tự chọn dựa trên recentPostsTypes

  const ratioGuide = `
## TỶ LỆ LOẠI BÀI (Content Mix) - BẮT BUỘC TUÂN THỦ
- 70% bài: GIÁ TRỊ - chia sẻ kinh nghiệm/mẹo/insight ngành, KHÔNG nhắc thương 
  hiệu hoặc chỉ nhắc rất nhẹ ở cuối (1 câu). Mục đích: tạo tương tác thật, 
  không phải bán hàng.
- 20% bài: GIỚI THIỆU - giới thiệu tính năng/dịch vụ cụ thể, gắn với tình 
  huống/use-case thật.
- 10% bài: BÁN HÀNG - CTA mạnh, có giá/ưu đãi cụ thể.

5-7 bài gần nhất đã đăng thuộc loại: ${recentPostsTypes ? recentPostsTypes.join(', ') : 'chưa có dữ liệu'}
${postType ? `Bài này BẮT BUỘC thuộc loại: ${postType}` : 'Dựa vào tỷ lệ ở trên và các bài gần nhất, hãy TỰ CHỌN loại bài phù hợp để cân bằng lại tỷ lệ 70/20/10, và ghi rõ loại bài đã chọn ở đầu output.'}
`;

  return `
Bạn là chuyên gia viết content Fanpage tiếng Việt, văn phong tự nhiên, gần gũi.

## THÔNG TIN DỰ ÁN (BẮT BUỘC dùng đúng, KHÔNG bịa số liệu)
${projectContext}

## CHỦ ĐỀ / GỢI Ý
${topic}

${ratioGuide}

## NGUYÊN TẮC VIẾT
1. KHÔNG đặt link ngoài (link website) trực tiếp trong nội dung bài - 
   nếu cần dẫn link, ghi rõ "[ĐẶT LINK VÀO COMMENT ĐẦU TIÊN]" ở cuối, 
   không chèn link trong caption (giảm reach nếu để link ngoài).
2. Định dạng: dùng icon/emoji tự nhiên (📌 ✅ 📲 🌐), xuống dòng theo từng 
   ý, KHÔNG viết thành đoạn văn dài liền mạch.
3. Hook mở đầu trong 1-2 câu đầu phải giữ chân người đọc (đặt câu hỏi, 
   tình huống quen thuộc, hoặc số liệu gây chú ý).
4. Nếu là bài loại GIÁ TRỊ: câu hỏi/insight phải dựa trên tình huống có 
   thật (nếu THÔNG TIN DỰ ÁN có câu hỏi khách thật, ưu tiên dùng). 
   TUYỆT ĐỐI không bịa nhân vật/case cụ thể nếu không có trong dữ liệu.
5. CTA cuối bài (nếu có) phải tự nhiên, không ép buộc kiểu "tag 3 người bạn".
6. Độ dài: 80-150 từ cho bài thường, không cần dài như bài blog.

## OUTPUT FORMAT
---
POST_TYPE: [GIÁ TRỊ / GIỚI THIỆU / BÁN HÀNG]
CAPTION:
[nội dung bài viết]

COMMENT_FIRST: [link nếu cần, để trống nếu không cần]
IMAGE_PROMPT: [mô tả ảnh cần thiết]
---
`.trim();
}

module.exports = { buildFanpagePrompt };
