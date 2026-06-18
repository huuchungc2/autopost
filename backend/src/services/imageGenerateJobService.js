import { query } from '../db.js';
import { generateImageForPost } from './postImageCore.js';

export async function logImageGenerate(postId, status, errorMessage, source = 'schedule', scheduleUserId = null) {
  await query(
    `INSERT INTO image_generate_logs (post_id, schedule_user_id, source, status, error_message)
     VALUES (?, ?, ?, ?, ?)`,
    [postId, scheduleUserId, source, status, errorMessage || null]
  );
}

function pageIdClause(pageIds) {
  if (!pageIds?.length) return { sql: ' AND 1=0', params: [] };
  const placeholders = pageIds.map(() => '?').join(', ');
  return { sql: ` AND p.page_id IN (${placeholders})`, params: pageIds };
}

/** Chỉ bài thuộc fanpage được gán cho admin bật lịch. */
export async function findNextPostForImageJob(pageIds) {
  const { sql, params } = pageIdClause(pageIds);
  const rows = await query(
    `SELECT p.*, fp.image_provider_id, fp.name AS page_name
     FROM posts p
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE fp.is_active = true
       AND (p.image_url IS NULL OR p.image_url = '')
       AND p.image_prompt IS NOT NULL AND TRIM(p.image_prompt) != ''
       AND p.auto_generate_image = true
       AND (p.image_job_status IS NULL OR p.image_job_status = 'pending')
       AND p.status IN ('scheduled', 'draft', 'pending_approval')
       AND p.media_type != 'video'
       ${sql}
     ORDER BY p.scheduled_at IS NULL, p.scheduled_at ASC, p.id ASC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function claimPostForImageJob(postId, pageIds) {
  if (!pageIds?.length) return false;
  const placeholders = pageIds.map(() => '?').join(', ');
  const result = await query(
    `UPDATE posts SET image_job_status = 'processing'
     WHERE id = ? AND page_id IN (${placeholders})
       AND (image_url IS NULL OR image_url = '')
       AND (image_job_status IS NULL OR image_job_status = 'pending')`,
    [postId, ...pageIds]
  );
  return result.affectedRows > 0;
}

export async function runImageJobForPost(post, { source = 'schedule', scheduleUserId = null, pageIds = [] } = {}) {
  const claimed = pageIds.length
    ? await claimPostForImageJob(post.id, pageIds)
    : (await query(
      `UPDATE posts SET image_job_status = 'processing'
       WHERE id = ? AND (image_url IS NULL OR image_url = '')
         AND (image_job_status IS NULL OR image_job_status = 'pending')`,
      [post.id]
    )).affectedRows > 0;

  if (!claimed) {
    return { processed: 0, skipped: true };
  }

  await logImageGenerate(post.id, 'processing', null, source, scheduleUserId);

  try {
    const updated = await generateImageForPost(post, post.image_provider_id);
    await query(
      `UPDATE posts SET image_job_status = 'done', error_message = NULL WHERE id = ?`,
      [post.id]
    );
    await logImageGenerate(post.id, 'done', null, source, scheduleUserId);
    return { processed: 1, ok: 1, failed: 0, post: updated };
  } catch (error) {
    await query(
      `UPDATE posts SET image_job_status = 'failed', error_message = ? WHERE id = ?`,
      [error.message, post.id]
    );
    await logImageGenerate(post.id, 'cancelled', error.message, source, scheduleUserId);
    console.error(`Image job #${post.id} cancelled:`, error.message);
    return {
      processed: 1,
      ok: 0,
      failed: 1,
      error: error.message,
      postId: post.id,
    };
  }
}

/** Job lịch của 1 admin — chỉ fanpage được gán cho admin đó. */
export async function runNextScheduledImageJob(pageIds, scheduleUserId) {
  if (!pageIds?.length) return { processed: 0, ok: 0, failed: 0 };

  const post = await findNextPostForImageJob(pageIds);
  if (!post) return { processed: 0, ok: 0, failed: 0 };

  return runImageJobForPost(post, { source: 'schedule', scheduleUserId, pageIds });
}

export async function runImageJobForPostId(postId, { source = 'manual', scheduleUserId = null } = {}) {
  const rows = await query(
    `SELECT p.*, fp.image_provider_id
     FROM posts p
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE p.id = ?`,
    [postId]
  );
  const post = rows[0];
  if (!post) throw new Error('Post not found');
  if (post.image_url) return { processed: 0, skipped: true, post };

  if (post.image_job_status === 'failed' || post.image_job_status === 'done') {
    await query(
      `UPDATE posts SET image_job_status = 'pending' WHERE id = ? AND (image_url IS NULL OR image_url = '')`,
      [postId]
    );
    post.image_job_status = 'pending';
  }

  return runImageJobForPost(post, { source, scheduleUserId });
}
