import express from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticateLicenseKey } from '../middleware/licenseAuth.js';

const router = express.Router();

// POST /api/user-sync/posts — extension submit bài vừa đăng lên server
router.post('/posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const { posts } = req.body;
  if (!Array.isArray(posts) || !posts.length) return res.json({ ok: true, inserted: 0 });

  let inserted = 0;
  for (const p of posts) {
    if (!p.post_id || !p.group_id) continue;
    try {
      await query(
        `INSERT IGNORE INTO user_posts
           (user_account_id, post_queue_id, group_id, group_name, post_id, noi_dung, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.userAccount.id,
          p.post_queue_id || '',
          String(p.group_id),
          p.group_name || null,
          String(p.post_id),
          p.noi_dung || null,
          p.posted_at ? new Date(p.posted_at) : null,
        ]
      );
      inserted++;
    } catch { /* ignore duplicate */ }
  }
  res.json({ ok: true, inserted });
}));

// GET /api/user-sync/my-posts — kéo bài của chính mình từ server về extension (multi-device sync)
router.get('/my-posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const since = req.query.since ? new Date(req.query.since) : null;
  const rows = await query(
    `SELECT id, post_queue_id, group_id, group_name, post_id, noi_dung, posted_at, needs_comment, created_at
     FROM user_posts WHERE user_account_id = ?${since ? ' AND created_at > ?' : ''}
     ORDER BY created_at DESC LIMIT ?`,
    since ? [req.userAccount.id, since, limit] : [req.userAccount.id, limit]
  );
  res.json(rows);
}));

// GET /api/user-sync/cross-posts — kéo bài của user KHÁC về để comment chéo. Trả cả bài đã comment
// rồi (needs_comment=0) — không lọc bỏ nữa — để extension giữ bài trong danh sách kèm trạng thái
// "Đã comment" thay vì biến mất hẳn khỏi tab Comment ngay khi vừa comment xong.
router.get('/cross-posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = await query(
    `SELECT up.id, up.post_queue_id, up.group_id, up.group_name,
            up.post_id, up.noi_dung, up.posted_at, up.needs_comment,
            u.name AS user_name, u.email AS user_email
     FROM user_posts up
     JOIN users u ON u.id = up.user_account_id
     WHERE up.user_account_id != ?
     ORDER BY up.posted_at DESC
     LIMIT ?`,
    [req.userAccount.id, limit]
  );
  res.json(rows);
}));

// PATCH /api/user-sync/posts/:id/commented — đánh dấu đã comment xong
router.patch('/posts/:id/commented', authenticateLicenseKey, asyncHandler(async (req, res) => {
  await query(
    'UPDATE user_posts SET needs_comment = 0 WHERE id = ? AND user_account_id != ?',
    [req.params.id, req.userAccount.id]
  );
  res.json({ ok: true });
}));

// POST /api/user-sync/activity — extension đẩy Log/Lịch sử cục bộ lên, đồng bộ theo license key
router.post('/activity', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) return res.json({ ok: true, inserted: 0 });

  let inserted = 0;
  for (const e of entries.slice(0, 100)) {
    if (!e.client_entry_id || !e.occurred_at) continue;
    try {
      await query(
        `INSERT IGNORE INTO user_activity_log
           (user_account_id, client_entry_id, type, ok, snippet, group_id, group_name, post_id, url, error, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.userAccount.id,
          String(e.client_entry_id).slice(0, 64),
          String(e.type || 'post').slice(0, 20),
          e.ok === false ? 0 : 1,
          e.snippet ? String(e.snippet).slice(0, 255) : null,
          e.group_id ? String(e.group_id).slice(0, 64) : null,
          e.group_name ? String(e.group_name).slice(0, 255) : null,
          e.post_id ? String(e.post_id).slice(0, 64) : null,
          e.url ? String(e.url).slice(0, 500) : null,
          e.error ? String(e.error).slice(0, 800) : null,
          new Date(e.occurred_at),
        ]
      );
      inserted++;
    } catch { /* ignore duplicate/invalid */ }
  }
  res.json({ ok: true, inserted });
}));

// GET /api/user-sync/activity — kéo Log/Lịch sử của chính license key này (đa thiết bị), KHÔNG chia sẻ cross-user
router.get('/activity', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 300);
  const since = req.query.since ? new Date(req.query.since) : null;
  const rows = await query(
    `SELECT id, type, ok, snippet, group_id, group_name, post_id, url, error, occurred_at, created_at
     FROM user_activity_log WHERE user_account_id = ?${since ? ' AND created_at > ?' : ''}
     ORDER BY occurred_at DESC LIMIT ?`,
    since ? [req.userAccount.id, since, limit] : [req.userAccount.id, limit]
  );
  res.json(rows);
}));

export default router;
