import { query } from '../db.js';
import { generateImage } from './imageService.js';
import { getProviderById } from './providerService.js';
import { createNotification } from './notifyService.js';

function wantsAutoGenerate(post) {
  return post.auto_generate_image === 1 || post.auto_generate_image === true;
}

function wantsSaveImageLocal(post) {
  return post.save_image_local !== 0 && post.save_image_local !== false;
}

export async function generateImageForPost(post, imageProviderId) {
  const prompt = String(post.image_prompt || '').trim();
  if (!prompt) {
    throw new Error('Bài chưa có prompt ảnh');
  }
  if (post.image_url) return post;

  const imageProvider = imageProviderId
    ? await getProviderById(imageProviderId)
    : null;
  if (!imageProvider) {
    throw new Error('Fanpage chưa cấu hình AI provider ảnh');
  }

  const persist = wantsSaveImageLocal(post);
  const imageResult = await generateImage(prompt, imageProvider, { persist });

  if (persist) {
    await query(
      'UPDATE posts SET image_url = ?, image_prompt = ?, media_type = ? WHERE id = ?',
      [imageResult.image_url, imageResult.image_prompt || prompt, 'image', post.id]
    );
  }

  return {
    ...post,
    image_url: imageResult.image_url,
    image_prompt: imageResult.image_prompt || prompt,
    media_type: 'image',
  };
}

export async function findPostsNeedingImages({ limit = 50 } = {}) {
  return query(
    `SELECT p.*, fp.image_provider_id, fp.name AS page_name
     FROM posts p
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE fp.is_active = true
       AND (p.image_url IS NULL OR p.image_url = '')
       AND p.image_prompt IS NOT NULL AND TRIM(p.image_prompt) != ''
       AND p.auto_generate_image = true
       AND p.status IN ('scheduled', 'draft', 'pending_approval')
       AND p.media_type != 'video'
     ORDER BY p.scheduled_at IS NULL, p.scheduled_at ASC, p.id ASC
     LIMIT ?`,
    [limit]
  );
}

/** Ban khuya: xuất ảnh AI cho bài import/chờ đăng chưa có ảnh. */
export async function generatePendingPostImages({ limit = 50 } = {}) {
  const posts = await findPostsNeedingImages({ limit });
  if (!posts.length) return { processed: 0, ok: 0, failed: 0, errors: [] };

  let ok = 0;
  let failed = 0;
  const errors = [];

  for (const post of posts) {
    try {
      await generateImageForPost(post, post.image_provider_id);
      ok += 1;
    } catch (error) {
      failed += 1;
      errors.push({ id: post.id, topic: post.topic, error: error.message });
      console.error(`generatePendingPostImages #${post.id}:`, error.message);
    }
  }

  if (ok > 0) {
    await createNotification({
      type: failed > 0 ? 'warning' : 'success',
      title: 'Xuất ảnh ban khuya',
      message: failed > 0
        ? `Đã xuất ${ok}/${posts.length} ảnh — ${failed} bài lỗi`
        : `Đã xuất ${ok} ảnh cho bài chờ đăng`,
      relatedType: 'post',
    });
  }

  return { processed: posts.length, ok, failed, errors };
}

export async function ensurePostImageForPublish(post, imageProviderId) {
  if (post.image_url) return post;

  const prompt = String(post.image_prompt || '').trim();
  if (!prompt || !wantsAutoGenerate(post)) return post;

  return generateImageForPost(post, imageProviderId);
}
