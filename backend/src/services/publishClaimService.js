import { query } from '../db.js';

/** Claim bài scheduled trước khi gọi Facebook — tránh cron chạy chồng đăng 2 lần. */
export async function claimDueScheduledPosts(limit = 20) {
  const due = await query(
    `SELECT id FROM posts
     WHERE status = 'scheduled'
       AND scheduled_at IS NOT NULL
       AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT ?`,
    [limit]
  );

  const claimed = [];
  for (const { id } of due) {
    const result = await query(
      `UPDATE posts SET status = 'publishing' WHERE id = ? AND status = 'scheduled'`,
      [id]
    );
    if (result.affectedRows > 0) claimed.push(id);
  }

  if (!claimed.length) return [];

  const placeholders = claimed.map(() => '?').join(', ');
  return query(
    `SELECT p.*, fp.page_id AS fb_page_id, fp.page_token, fp.image_provider_id
     FROM posts p
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE p.id IN (${placeholders})`,
    claimed
  );
}

/** Claim slot lịch hằng ngày trước khi AI tạo bài — tránh chạy trùng cùng ngày. */
export async function claimTopicSlot(topicId, today) {
  const result = await query(
    `UPDATE content_topics SET last_run_date = ?
     WHERE id = ? AND (last_run_date IS NULL OR last_run_date < ?)`,
    [today, topicId, today]
  );
  return result.affectedRows > 0;
}

/** Bài kẹt ở publishing (crash giữa chừng) — đánh failed để không tự đăng lại. */
export async function recoverStuckPublishingPosts() {
  await query(
    `UPDATE posts
     SET status = 'failed',
         error_message = COALESCE(error_message, 'Đăng tự động bị gián đoạn — kiểm tra fanpage và thử lại thủ công')
     WHERE status = 'publishing'
       AND fb_post_id IS NULL
       AND scheduled_at <= DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
  );
}
