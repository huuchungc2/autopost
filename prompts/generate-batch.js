/**
 * SCRIPT CHẠY HÀNG LOẠT — sản xuất N bài chất lượng, xuất thẳng ra Excel
 * theo đúng format AutoPost đang đọc khi import. KHÔNG cần sửa code AutoPost.
 *
 * Cách dùng:
 *   1. Sửa PROJECT_CONTEXT bên dưới = data thật của dự án (1 lần)
 *   2. Sửa danh sách TOPICS = các chủ đề muốn viết
 *   3. Chạy: node generate-batch.js
 *   4. Ra file output.xlsx -> import vào AutoPost như cách đang làm
 */

const fs = require('fs');
const XLSX = require('xlsx'); // npm install xlsx
const { buildFullPipelinePrompt, parseFullPipelineResult } = require('./full-pipeline-prompt');
const { validateContent } = require('./content-validator');

// ========== SỬA PHẦN NÀY THEO DỰ ÁN THẬT ==========
const PROJECT_CONTEXT = `
Tên dự án: [TÊN DỰ ÁN]
Giọng văn: [brand voice]
Thông tin giá/dịch vụ: [giá, route, specs... - DATA THẬT]
Điểm khác biệt: [USP]
Hotline: [hotline]
Câu hỏi khách hay hỏi: [list câu hỏi thật nếu có]
`.trim();

const TOPICS = [
  'xe khách sài gòn tánh linh',
  'xe khách sài gòn đức linh',
  'gửi hàng về quê sài gòn tánh linh',
  // thêm bao nhiêu chủ đề tùy ý, mỗi dòng 1 bài
];
// ====================================================

async function callClaudeAPI(prompt) {
  // Dùng đúng cách gọi Claude AutoPost đang có sẵn (qua 9Router hoặc trực tiếp)
  // THAY hàm này bằng hàm gọi API thật đang dùng trong code AutoPost
  const response = await fetch('http://localhost:20128/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content[0].text;
}

async function generateBatch() {
  const rows = [];

  for (const topic of TOPICS) {
    console.log(`Đang viết: ${topic}...`);

    const prompt = buildFullPipelinePrompt({ projectContext: PROJECT_CONTEXT, topic });
    const rawResult = await callClaudeAPI(prompt);
    const parsed = parseFullPipelineResult(rawResult);

    // CODE KIỂM TRA LẠI THẬT - không tin điểm AI tự chấm
    // db = null vì đây là script chạy ngoài, không check trùng DB được.
    // Khi tích hợp vào AutoPost thật, truyền db connection thật vào đây.
    const codeCheck = await validateContent(parsed, null, null, PROJECT_CONTEXT);

    // CODE quyết định STATUS cuối cùng, không phải AI tự nói
    const finalStatus = codeCheck.passed ? 'READY_TO_PUBLISH' : 'NEEDS_REVIEW';
    const finalReason = codeCheck.passed ? '' : codeCheck.reasons.join(' | ');

    console.log(`  -> AI tự chấm: ${parsed.qualityScore}/100`);
    console.log(`  -> Code kiểm tra: ${codeCheck.passed ? 'ĐẠT' : 'KHÔNG ĐẠT'} ${finalReason}`);

    rows.push({
      TITLE: parsed.title,
      SLUG: parsed.slug,
      META_DESCRIPTION: parsed.metaDescription,
      NOI_DUNG: parsed.content,
      PROMPT_ANH: parsed.imagePrompts,
      AI_SELF_SCORE: parsed.qualityScore, // điểm AI tự chấm - chỉ để tham khảo
      STATUS: finalStatus, // CODE quyết định, đáng tin hơn AI tự chấm
      REVIEW_REASON: finalReason,
    });

    // Nghỉ 1 chút giữa các lần gọi, tránh rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Xuất ra Excel
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Import');
  XLSX.writeFile(workbook, 'output.xlsx');

  const readyCount = rows.filter((r) => r.STATUS === 'READY_TO_PUBLISH').length;
  const reviewCount = rows.filter((r) => r.STATUS === 'NEEDS_REVIEW').length;

  console.log(`\nXong! Tổng ${rows.length} bài.`);
  console.log(`  - ${readyCount} bài CODE xác nhận đạt, sẵn sàng đăng.`);
  console.log(`  - ${reviewCount} bài CODE phát hiện vấn đề, cần xem lại (xem cột REVIEW_REASON).`);
  console.log(`File: output.xlsx`);
}

generateBatch().catch(console.error);
