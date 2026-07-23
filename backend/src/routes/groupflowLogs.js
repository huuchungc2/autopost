import express from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, requireRole('super_admin'));

// GET /api/groupflow-logs — danh sách các lượt gửi log (1 dòng/thiết bị/ngày), mới nhất trước.
// entries_json KHÔNG trả ở đây (có thể tới 400 dòng x nhiều report) — xem chi tiết qua
// GET /api/groupflow-logs/:id.
router.get('/', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const offset = (page - 1) * limit;
  const userId = req.query.user_id ? Number.parseInt(req.query.user_id, 10) : null;

  const where = userId ? 'WHERE r.user_id = ?' : '';
  const params = userId ? [userId] : [];

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM groupflow_log_reports r ${where}`,
    params
  );
  const total = Number(countRow?.total) || 0;
  const rows = await query(
    `SELECT r.id, r.user_id, u.name AS user_name, u.email AS user_email,
            r.device_id, r.device_label, r.extension_version, r.entry_count, r.report_date, r.created_at
     FROM groupflow_log_reports r
     JOIN users u ON u.id = r.user_id
     ${where}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

// GET /api/groupflow-logs/:id — chi tiết 1 lượt gửi (toàn bộ entries_json để đọc log thật)
router.get('/:id', async (req, res) => {
  const rows = await query(
    `SELECT r.id, r.user_id, u.name AS user_name, u.email AS user_email,
            r.device_id, r.device_label, r.extension_version, r.entry_count, r.entries_json, r.report_date, r.created_at
     FROM groupflow_log_reports r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
  const row = rows[0];
  let entries = [];
  try { entries = JSON.parse(row.entries_json); } catch { /* ignore */ }
  res.json({ ...row, entries_json: undefined, entries });
});

export default router;
