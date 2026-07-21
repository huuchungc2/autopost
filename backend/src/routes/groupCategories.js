import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManageUsers } from '../middleware/rbac.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Danh mục ngành nghề GroupFlow (dùng chung toàn hệ thống). Quản lý trên website bởi admin/super_admin
// (canManageUsers); extension chỉ ĐỌC qua GET /api/user-sync/categories (license-key). Xem docs/GROUPFLOW.md.
const router = express.Router();
router.use(authenticate, canManageUsers);

const MAX_NAME = 60;

function cleanName(raw) {
  return String(raw || '').trim();
}

// GET /api/group-categories — danh sách ngành + số bài đang gán mỗi ngành.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT c.id, c.name, c.sort_order,
            (SELECT COUNT(*) FROM user_post_categories upc WHERE upc.category_id = c.id) AS post_count
     FROM group_post_categories c
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  res.json(rows);
}));

// POST /api/group-categories — thêm ngành mới.
router.post('/', asyncHandler(async (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Tên ngành nghề là bắt buộc' });
  if (name.length > MAX_NAME) return res.status(400).json({ error: `Tên ngành tối đa ${MAX_NAME} ký tự` });

  const dup = await query('SELECT id FROM group_post_categories WHERE LOWER(name) = LOWER(?)', [name]);
  if (dup.length) return res.status(409).json({ error: 'Ngành nghề này đã có' });

  const [maxRow] = await query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM group_post_categories');
  const result = await query(
    'INSERT INTO group_post_categories (name, sort_order) VALUES (?, ?)',
    [name, Number(maxRow?.m || 0) + 1]
  );
  res.status(201).json({ id: result.insertId, name, sort_order: Number(maxRow?.m || 0) + 1, post_count: 0 });
}));

// PUT /api/group-categories/:id — đổi tên / thứ tự.
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rows = await query('SELECT id FROM group_post_categories WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Ngành không tồn tại' });

  const sets = [];
  const vals = [];
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Tên ngành không được trống' });
    if (name.length > MAX_NAME) return res.status(400).json({ error: `Tên ngành tối đa ${MAX_NAME} ký tự` });
    const dup = await query('SELECT id FROM group_post_categories WHERE LOWER(name) = LOWER(?) AND id != ?', [name, id]);
    if (dup.length) return res.status(409).json({ error: 'Trùng tên ngành khác' });
    sets.push('name = ?'); vals.push(name);
  }
  if (req.body?.sort_order !== undefined) {
    sets.push('sort_order = ?'); vals.push(Number(req.body.sort_order) || 0);
  }
  if (!sets.length) return res.json({ ok: true });
  vals.push(id);
  await query(`UPDATE group_post_categories SET ${sets.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
}));

// DELETE /api/group-categories/:id — xoá ngành + gỡ mọi dòng nối bài↔ngành đó (không FK cứng, xem
// migration 047). Bài đang gán ngành này sẽ chỉ mất đúng ngành đó, các ngành khác giữ nguyên.
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query('DELETE FROM user_post_categories WHERE category_id = ?', [id]);
  await query('DELETE FROM group_post_categories WHERE id = ?', [id]);
  res.json({ ok: true });
}));

export default router;
