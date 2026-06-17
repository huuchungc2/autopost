import { query } from '../db.js';
import { normalizeFacebookPublishIds } from './fbService.js';

export async function persistFacebookPublishIds(postId, response, { hasImage = false, hasVideo = false } = {}) {
  const ids = normalizeFacebookPublishIds(response, { hasImage, hasVideo });
  await query(
    'UPDATE posts SET fb_post_id = ?, fb_photo_id = ?, fb_video_id = ? WHERE id = ?',
    [ids.fb_post_id, ids.fb_photo_id, ids.fb_video_id, postId]
  );
  return ids;
}
