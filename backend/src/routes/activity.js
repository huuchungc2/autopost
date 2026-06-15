import express from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, requireRole('super_admin'));

router.get('/', async (req, res) => {
  const logs = await query('SELECT id, user_id, action, target_type, target_id, detail, ip_address, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
});

export default router;
