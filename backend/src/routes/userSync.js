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

// GET /api/user-sync/cross-posts — kéo bài của user KHÁC về để comment chéo
router.get('/cross-posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = await query(
    `SELECT up.id, up.post_queue_id, up.group_id, up.group_name,
            up.post_id, up.noi_dung, up.posted_at, up.needs_comment,
            ua.name AS user_name, ua.email AS user_email
     FROM user_posts up
     JOIN user_accounts ua ON ua.id = up.user_account_id
     WHERE up.user_account_id != ? AND up.needs_comment = 1
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

export default router;
