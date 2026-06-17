import { query } from '../db.js';
import { generateImage } from './imageService.js';
import { getProviderById } from './providerService.js';

function wantsAutoGenerate(post) {
  return post.auto_generate_image === 1 || post.auto_generate_image === true;
}

function wantsSaveImageLocal(post) {
  return post.save_image_local !== 0 && post.save_image_local !== false;
}

export async function ensurePostImageForPublish(post, imageProviderId) {
  if (post.image_url) return post;

  const prompt = String(post.image_prompt || '').trim();
  if (!prompt || !wantsAutoGenerate(post)) return post;

  const imageProvider = await getProviderById(imageProviderId);
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
