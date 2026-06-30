import { query } from '../db.js';
import { getProviderById } from './providerService.js';
import { generateBlogImage } from './projectContentService.js';
import { logImageGenerate } from './imageGenerateJobService.js';

function slugifyFallback(post, seoMeta) {
  return seoMeta?.slug || seoMeta?.title || post.topic || `bai-viet-${post.id}`;
}

function parseSeoMeta(post) {
  try {
    return typeof post.seo_meta === 'string' ? JSON.parse(post.seo_meta) : (post.seo_meta || {});
  } catch {
    return {};
  }
}

/** Bài website chờ generate ảnh hàng loạt sau import Excel — xem websiteImportExportService.js. */
export async function findNextWebsitePostForImageJob() {
  const rows = await query(
    `SELECT p.*, w.image_provider_id, w.name AS website_name
     FROM posts p
     JOIN websites w ON w.id = p.website_id
     WHERE w.is_active = true
       AND p.platform = 'website'
       AND (p.image_url IS NULL OR p.image_url = '')
       AND p.image_prompt IS NOT NULL AND TRIM(p.image_prompt) != ''
       AND p.auto_generate_image = true
       AND (p.image_job_status IS NULL OR p.image_job_status = 'pending')
     ORDER BY p.id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function claimWebsitePostForImageJob(postId) {
  const result = await query(
    `UPDATE posts SET image_job_status = 'processing'
     WHERE id = ? AND platform = 'website'
       AND (image_url IS NULL OR image_url = '')
       AND (image_job_status IS NULL OR image_job_status = 'pending')`,
    [postId]
  );
  return result.affectedRows > 0;
}

export async function runWebsiteImageJobForPost(post) {
  const claimed = await claimWebsitePostForImageJob(post.id);
  if (!claimed) return { processed: 0, skipped: true };

  await logImageGenerate(post.id, 'processing', null, 'manual');

  try {
    const imageProvider = post.image_provider_id ? await getProviderById(post.image_provider_id) : null;
    if (!imageProvider) throw new Error('Website chưa cấu hình AI provider ảnh');

    const seoMeta = parseSeoMeta(post);
    const generated = await generateBlogImage(post.image_prompt, imageProvider, {
      slug: slugifyFallback(post, seoMeta),
      index: 1,
    });

    await query(
      `UPDATE posts SET image_url = ?, image_prompt = ?, media_type = 'image', image_job_status = 'done', error_message = NULL WHERE id = ?`,
      [generated.image_url, generated.image_prompt || post.image_prompt, post.id]
    );
    await logImageGenerate(post.id, 'done', null, 'manual');
    return {
      processed: 1,
      ok: 1,
      failed: 0,
      post_id: post.id,
      post: { ...post, image_url: generated.image_url, image_prompt: generated.image_prompt || post.image_prompt, media_type: 'image' },
    };
  } catch (error) {
    await query(
      `UPDATE posts SET image_job_status = 'failed', error_message = ? WHERE id = ?`,
      [error.message, post.id]
    );
    await logImageGenerate(post.id, 'cancelled', error.message, 'manual');
    console.error(`Website image job #${post.id} thất bại:`, error.message);
    return { processed: 1, ok: 0, failed: 1, error: error.message, post_id: post.id };
  }
}

/** Gọi từ cron mỗi 5 phút (xem scheduler.js) — xử lý tối đa `limit` bài chờ ảnh mỗi lượt. */
export async function processPendingWebsiteImageJobs(limit = 5) {
  const results = [];
  for (let i = 0; i < limit; i += 1) {
    const post = await findNextWebsitePostForImageJob();
    if (!post) break;
    results.push(await runWebsiteImageJobForPost(post));
  }
  return results;
}

export async function runWebsiteImageJobForPostId(postId) {
  const rows = await query(
    `SELECT p.*, w.image_provider_id
     FROM posts p
     JOIN websites w ON w.id = p.website_id
     WHERE p.id = ? AND p.platform = 'website'`,
    [postId]
  );
  const post = rows[0];
  if (!post) throw new Error('Bài viết không tồn tại hoặc không phải Website Blog');
  if (post.image_url) return { processed: 0, skipped: true, post };

  if (post.image_job_status === 'failed' || post.image_job_status === 'done') {
    await query(
      `UPDATE posts SET image_job_status = 'pending' WHERE id = ? AND (image_url IS NULL OR image_url = '')`,
      [postId]
    );
    post.image_job_status = 'pending';
  }

  return runWebsiteImageJobForPost(post);
}