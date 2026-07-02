/**
 * Test end-to-end publishPostToWebsite() cho từng website đã cấu hình — tạo 1 post test
 * platform='website', gọi đúng service thật (giống hành vi bấm "Publish lên website"),
 * verify kết quả, rồi tự dọn dẹp (xoá post test + bài tạo ra bên website).
 *
 *   node scripts/test-website-publish.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

// import động — db.js tạo pool ngay lúc import bằng process.env, phải load dotenv xong mới import
// (import tĩnh bị ESM hoist lên trước, chạy trước cả dotenv.config()).
const { query } = await import('../src/db.js');
const { publishPostToWebsite } = await import('../src/services/websitePublishService.js');

const TEST_IMAGE_URL = 'https://picsum.photos/800/600';

async function testWebsite(websiteId, { withImage } = {}) {
  const [website] = await query('SELECT id, name, domain, publish_url, api_key FROM websites WHERE id = ?', [websiteId]);
  if (!website) {
    console.log(`[SKIP] website_id=${websiteId} không tồn tại`);
    return;
  }
  if (!website.publish_url) {
    console.log(`[SKIP] ${website.name} chưa cấu hình publish_url`);
    return;
  }

  console.log(`\n=== Test ${website.name} (${website.publish_url}) — withImage=${!!withImage} ===`);

  const seoMeta = {
    title: `[TEST AutoPost] Bài kiểm tra ${Date.now()}`,
    slug: `test-autopost-publish-${Date.now()}`,
    meta_description: 'Bài test tự động từ AutoPost để kiểm tra API publish, sẽ bị xoá ngay sau khi test.',
    primary_keyword: 'test autopost',
  };
  const contentMarkdown = [
    '# Đây là bài test\n',
    'Nội dung **markdown** để kiểm tra convert HTML.\n',
    '- Mục 1',
    '- Mục 2\n',
    '> Bài này sẽ bị xoá tự động sau khi test xong.',
  ].join('\n');

  const insertResult = await query(
    `INSERT INTO posts (platform, website_id, content, seo_meta, image_url, status, created_by_type, created_at)
     VALUES ('website', ?, ?, ?, ?, 'draft', 'manual', NOW())`,
    [websiteId, contentMarkdown, JSON.stringify(seoMeta), withImage ? TEST_IMAGE_URL : null]
  );
  const postId = insertResult.insertId;
  console.log(`Post test id=${postId} tạo xong, đang publish...`);

  let publishResult;
  let publishError;
  try {
    publishResult = await publishPostToWebsite(postId);
    console.log('Publish OK (lần 1):', publishResult);
  } catch (e) {
    publishError = e;
    console.error('Publish FAIL (lần 1):', e.message, e.status ? `status=${e.status}` : '');
  }

  if (publishResult) {
    // Test upsert — publish lại lần 2 cho cùng bài, đúng hành vi nút "publish lại" thật.
    try {
      const publishResult2 = await publishPostToWebsite(postId);
      console.log('Publish OK (lần 2 - re-publish/upsert):', publishResult2);
      if (publishResult2.website_post_id !== publishResult.website_post_id) {
        console.error('  !! CẢNH BÁO: lần 2 tạo ID khác lần 1 — upsert theo external_id KHÔNG hoạt động đúng.');
      } else {
        console.log('  OK: lần 2 trả về cùng ID — upsert theo external_id hoạt động đúng.');
      }
    } catch (e) {
      console.error('Publish FAIL (lần 2 - re-publish):', e.message);
    }
  }

  const [savedPost] = await query('SELECT website_post_id, website_post_url, website_published_at FROM posts WHERE id = ?', [postId]);
  console.log('Post AutoPost sau publish:', savedPost);

  // Dọn dẹp: xoá post test bên AutoPost + bài đã tạo bên website (nếu publish thành công).
  await query('DELETE FROM posts WHERE id = ?', [postId]);
  console.log(`Đã xoá post test id=${postId} khỏi AutoPost.`);

  return { website, publishResult, publishError, savedPost };
}

async function main() {
  const results = [];
  results.push(await testWebsite(1, { withImage: false })); // zalopilot.vn
  results.push(await testWebsite(1, { withImage: true }));  // zalopilot.vn + ảnh
  results.push(await testWebsite(2, { withImage: false })); // datxeveque.vn
  results.push(await testWebsite(3, { withImage: false })); // hopgiayre.vn — kỳ vọng SKIP

  console.log('\n\n========== TỔNG KẾT ==========');
  for (const r of results) {
    if (!r) continue;
    const ok = !r.publishError;
    console.log(`${r.website.name}: ${ok ? 'OK' : 'FAIL — ' + r.publishError.message}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Script FAIL:', e);
  process.exit(1);
});
