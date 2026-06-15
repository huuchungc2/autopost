import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const notifications = await query('SELECT id, type, title, message, is_read, related_type, related_id, created_at FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json(notifications);
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
