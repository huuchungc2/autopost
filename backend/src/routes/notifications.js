import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const [countRow] = await query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? OR user_id IS NULL',
    [req.user.id]
  );
  const total = Number(countRow?.total) || 0;
  const notifications = await query(
    'SELECT id, type, title, message, is_read, related_type, related_id, created_at FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [req.user.id, limit, offset]
  );
  res.json({ data: notifications, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

router.patch('/read-all', async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE user_id = ? OR user_id IS NULL', [req.user.id]);
  res.json({ message: 'All notifications marked read' });
});

router.patch('/:id/read', async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE id = ? AND (user_id = ? OR user_id IS NULL)', [req.params.id, req.user.id]);
  res.json({ message: 'Notification marked read' });
});

export default router;
