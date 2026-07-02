/**
 * KIỂM TRA ĐỘC LẬP BẰNG CODE — chạy SAU khi AI viết bài, TRƯỚC khi cho publish.
 * Không tin vào điểm AI tự chấm — tự đếm số thật bằng code.
 *
 * Cách dùng:
 *   const { validateContent } = require('./content-validator');
 *   const check = await validateContent(parsedResult, projectId, db);
 *   if (!check.passed) { ...đánh dấu NEEDS_REVIEW, ghi lý do... }
 */

// ========== 1. ĐẾM ĐỘ DÀI THẬT ==========
function countWords(text) {
  // Tiếng Việt: tách theo khoảng trắng (không dùng quy tắc tiếng Anh)
  return text.trim().split(/\s+/).length;
}

function checkLength(content) {
  const wordCount = countWords(content);
  const passed = wordCount >= 800 && wordCount <= 2500;
  return {
    wordCount,
    passed,
    reason: passed ? null : `Độ dài ${wordCount} từ - ngoài khoảng 800-2500 từ`,
  };
}

// ========== 2. MẬT ĐỘ TỪ KHÓA THẬT ==========
function checkKeywordDensity(content, primaryKeyword) {
  if (!primaryKeyword) return { passed: true, density: 0, reason: null };

  const totalWords = countWords(content);
  const keywordLower = primaryKeyword.toLowerCase();
  const contentLower = content.toLowerCase();

  // Đếm số lần từ khóa xuất hiện (kể cả là cụm từ nhiều từ)
  const occurrences = contentLower.split(keywordLower).length - 1;
  const keywordWordCount = primaryKeyword.split(/\s+/).length;
  const density = ((occurrences * keywordWordCount) / totalWords) * 100;

  // Mật độ hợp lý: 0.3% - 2.5% (không nhồi nhét, không quá ít)
  const passed = density >= 0.3 && density <= 2.5;
  return {
    occurrences,
    density: Math.round(density * 100) / 100,
    passed,
    reason: passed
      ? null
      : density < 0.3
      ? `Từ khóa chính chỉ xuất hiện ${occurrences} lần (${density}%) - quá ít`
      : `Từ khóa chính xuất hiện ${occurrences} lần (${density}%) - có thể bị nhồi nhét`,
  };
}

// ========== 3. CHECK TRÙNG VỚI BÀI CŨ TRONG DB ==========
function similarityScore(textA, textB) {
  // So sánh đơn giản: tách câu, đếm số câu giống/gần giống nhau
  const sentencesA = textA.split(/[.!?]\s+/).filter((s) => s.length > 20);
  const sentencesB = new Set(
    textB.split(/[.!?]\s+/).filter((s) => s.length > 20).map((s) => s.trim().toLowerCase())
  );

  let matchCount = 0;
  for (const s of sentencesA) {
    if (sentencesB.has(s.trim().toLowerCase())) matchCount++;
  }
  return sentencesA.length > 0 ? matchCount / sentencesA.length : 0;
}

async function checkDuplicate(content, projectId, db) {
  // Lấy nội dung 10 bài gần nhất cùng dự án để so sánh
  // SỬA tên bảng/cột cho khớp DB thật của bạn
  const recentPosts = await db.query(
    `SELECT noi_dung FROM posts WHERE project_id = ? AND platform = 'website' 
     ORDER BY created_at DESC LIMIT 10`,
    [projectId]
  );

  let maxSimilarity = 0;
  for (const post of recentPosts) {
    const score = similarityScore(content, post.noi_dung);
    if (score > maxSimilarity) maxSimilarity = score;
  }

  const passed = maxSimilarity < 0.3; // dưới 30% câu trùng thì coi là OK
  return {
    maxSimilarity: Math.round(maxSimilarity * 100),
    passed,
    reason: passed
      ? null
      : `Trùng ${Math.round(maxSimilarity * 100)}% câu với 1 bài đã đăng gần đây`,
  };
}

// ========== 4. CHECK CÓ BỊA SỐ LIỆU KHÔNG CÓ TRONG CONTEXT ==========
function checkUnverifiedNumbers(content, projectContext) {
  // Tìm các số tiền (có "đồng", "k", "đ") trong bài
  const priceMatches = content.match(/[\d.,]+\s*(đồng|đ|k\b|triệu|nghìn)/gi) || [];
  const unverified = priceMatches.filter((price) => !projectContext.includes(price.trim()));

  return {
    passed: unverified.length === 0,
    unverifiedNumbers: unverified,
    reason:
      unverified.length === 0
        ? null
        : `Có ${unverified.length} số liệu giá/tiền không khớp với THÔNG TIN DỰ ÁN: ${unverified.join(', ')}`,
  };
}

// ========== HÀM TỔNG HỢP — gọi hàm này duy nhất ==========
async function validateContent(parsedResult, projectId, db, projectContext) {
  const lengthCheck = checkLength(parsedResult.content);
  const keywordCheck = checkKeywordDensity(parsedResult.content, parsedResult.primaryKeyword);
  const duplicateCheck = await checkDuplicate(parsedResult.content, projectId, db);
  const numberCheck = checkUnverifiedNumbers(parsedResult.content, projectContext);

  const allChecks = [lengthCheck, keywordCheck, duplicateCheck, numberCheck];
  const failedChecks = allChecks.filter((c) => !c.passed);

  return {
    passed: failedChecks.length === 0,
    details: { lengthCheck, keywordCheck, duplicateCheck, numberCheck },
    reasons: failedChecks.map((c) => c.reason).filter(Boolean),
  };
}

module.exports = { validateContent, countWords, checkLength, checkKeywordDensity, checkDuplicate, checkUnverifiedNumbers };
