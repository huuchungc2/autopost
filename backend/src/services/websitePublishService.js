import axios from 'axios';
import { query } from '../db.js';
import { resolveImagePreviewUrl } from './mediaStorage.js';

/**
 * Publish 1 bài platform='website' lên CMS ngoài, qua API do chủ website tự build.
 * Spec đầy đủ: docs/WEBSITE_PUBLISH_API.md
 * Cấu hình endpoint/API key lưu theo từng website (bảng `websites`, độc lập với fb_pages —
 * 1 website không nhất thiết gắn với 1 fanpage Facebook nào).
 */
export async function publishPostToWebsite(postId) {
  const rows = await query(
    `SELECT p.id, p.website_id, p.platform, p.content, p.image_url, p.seo_meta,
            w.publish_url, w.api_key
     FROM posts p
     JOIN websites w ON w.id = p.website_id
     WHERE p.id = ?`,
    [postId]
  );
  const post = rows[0];
  if (!post) {
    const err = new Error('Bài viết không tồn tại');
    err.status = 404;
    throw err;
  }
  if (post.platform !== 'website') {
    const err = new Error('Bài viết này không phải loại Website Blog');
    err.status = 400;
    throw err;
  }
  if (!post.publish_url) {
    const err = new Error('Website chưa cấu hình API publish — vào Website → Sửa để nhập URL/API key');
    err.status = 400;
    throw err;
  }

  let seoMeta = {};
  try {
    seoMeta = typeof post.seo_meta === 'string' ? JSON.parse(post.seo_meta) : (post.seo_meta || {});
  } catch {
    seoMeta = {};
  }

  const imageUrl = post.image_url ? resolveImagePreviewUrl(post.image_url) : null;

  const payload = {
    external_id: `autopost-${post.id}`,
    title: seoMeta.title || '',
    slug: seoMeta.slug || '',
    meta_description: seoMeta.meta_description || '',
    primary_keyword: seoMeta.primary_keyword || '',
    content_markdown: post.content || '',
    image_url: imageUrl,
    status: 'draft',
  };

  let response;
  try {
    response = await axios.post(post.publish_url, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...(post.api_key ? { Authorization: `Bearer ${post.api_key}` } : {}),
      },
      timeout: 20000,
    });
  } catch (error) {
    const message = error.response?.data?.error || error.message;
    const err = new Error(`Publish lên website thất bại: ${message}`);
    err.status = 502;
    throw err;
  }

  const websitePostId = response.data?.id ? String(response.data.id) : null;
  const websitePostUrl = response.data?.url || null;

  await query(
    'UPDATE posts SET website_post_id = ?, website_post_url = ?, website_published_at = NOW() WHERE id = ?',
    [websitePostId, websitePostUrl, post.id]
  );

  return { website_post_id: websitePostId, website_post_url: websitePostUrl };
}
