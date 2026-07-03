import express from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, requireRole('super_admin'));

router.get('/', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const [countRow] = await query('SELECT COUNT(*) AS total FROM activity_logs');
  const total = Number(countRow?.total) || 0;
  const logs = await query(
    'SELECT id, user_id, action, target_type, target_id, detail, ip_address, created_at FROM activity_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  res.json({ data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

export default router;
