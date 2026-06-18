import { query } from '../db.js';
import { generateImageForPost } from './postImageCore.js';

function wantsAutoGenerate(post) {
  return post.auto_generate_image === 1 || post.auto_generate_image === true;
}

export async function ensurePostImageForPublish(post, imageProviderId) {
  if (post.image_url) return post;

  const prompt = String(post.image_prompt || '').trim();
  if (!prompt || !wantsAutoGenerate(post)) return post;

  const { runImageJobForPostId } = await import('./imageGenerateJobService.js');
  const result = await runImageJobForPostId(post.id, { source: 'publish' });
  if (result.skipped && post.image_url) return post;
  if (result.post) return result.post;
  if (result.error) throw new Error(result.error);

  const rows = await query('SELECT * FROM posts WHERE id = ?', [post.id]);
  return rows[0] || post;
}

export { generateImageForPost } from './postImageCore.js';
