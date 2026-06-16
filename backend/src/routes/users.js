import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManageUsers } from '../middleware/rbac.js';
import { setUserPages, getUserPages } from '../services/pageAccessService.js';
import { setUserProviders, getUserProviders } from '../services/providerAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate, canManageUsers);

router.get('/', asyncHandler(async (req, res) => {
  const users = await query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
            (SELECT COUNT(*) FROM user_pages up WHERE up.user_id = u.id) AS assigned_page_count,
            (SELECT COUNT(*) FROM user_providers uv WHERE uv.user_id = u.id) AS assigned_provider_count
     FROM users u
     WHERE u.deleted_at IS NULL
     ORDER BY u.name ASC`
  );
  res.json(users);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, role = 'editor', page_ids = [], provider_ids = [] } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
  const hashed = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (name, email, password, role, is_active, must_change_password, created_at) VALUES (?, ?, ?, ?, true, false, NOW())',
    [name, email, hashed, role]
  );
  if (role !== 'super_admin') {
    const savedPageIds = await setUserPages(result.insertId, page_ids);
    const savedProviderIds = await setUserProviders(result.insertId, provider_ids);
    return res.status(201).json({
      id: result.insertId,
      name,
      email,
      role,
      assigned_page_count: savedPageIds.length,
      assigned_provider_count: savedProviderIds.length,
    });
  }
  res.status(201).json({ id: result.insertId, name, email, role });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const user = (await query('SELECT id, name, email, role, is_active, must_change_password, created_at FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]))[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') {
    return res.json({ ...user, assigned_pages: [], assigned_providers: [] });
  }
  const assigned_pages = await getUserPages(req.params.id);
  const assigned_providers = await getUserProviders(req.params.id);
  res.json({ ...user, assigned_pages, assigned_providers });
}));

router.get('/:id/pages', asyncHandler(async (req, res) => {
  const user = (await query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]))[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') {
    const all = await query('SELECT id, name, page_id FROM fb_pages ORDER BY name');
    return res.json(all.map((p) => ({ ...p, assigned: true })));
  }
  res.json(await getUserPages(req.params.id));
}));

router.get('/:id/providers', asyncHandler(async (req, res) => {
  const user = (await query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]))[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') {
    const all = await query('SELECT id, name, type, model FROM ai_providers ORDER BY name');
    return res.json(all.map((p) => ({ ...p, assigned: true })));
  }
  res.json(await getUserProviders(req.params.id));
}));

router.put('/:id/pages', asyncHandler(async (req, res) => {
  const user = (await query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]))[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') {
    return res.status(400).json({ error: 'Super admin has access to all pages' });
  }
  const pageIds = await setUserPages(req.params.id, req.body.page_ids || []);
  res.json({ message: 'Page assignments updated', page_ids: pageIds });
}));

router.put('/:id/providers', asyncHandler(async (req, res) => {
  const user = (await query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]))[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') {
    return res.status(400).json({ error: 'Super admin has access to all providers' });
  }
  const providerIds = await setUserProviders(req.params.id, req.body.provider_ids || []);
  res.json({ message: 'Provider assignments updated', provider_ids: providerIds });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, email, role, is_active, page_ids, provider_ids } = req.body;
  const existing = (await query('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.id]))[0];
  if (!existing) return res.status(404).json({ error: 'User not found' });

  await query('UPDATE users SET name = ?, email = ?, role = ?, is_active = ? WHERE id = ?', [name, email, role, is_active, req.params.id]);
  if (role !== 'super_admin') {
    if (page_ids) await setUserPages(req.params.id, page_ids);
    if (provider_ids) await setUserProviders(req.params.id, provider_ids);
  }
  if (role === 'super_admin') {
    await query('DELETE FROM user_pages WHERE user_id = ?', [req.params.id]);
    await query('DELETE FROM user_providers WHERE user_id = ?', [req.params.id]);
  }
  const assigned_pages = role === 'super_admin' ? [] : await getUserPages(req.params.id);
  const assigned_providers = role === 'super_admin' ? [] : await getUserProviders(req.params.id);
  res.json({
    message: 'User updated',
    assigned_page_count: assigned_pages.length,
    assigned_provider_count: assigned_providers.length,
  });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  await query('UPDATE users SET is_active = ? WHERE id = ?', [req.body.is_active, req.params.id]);
  res.json({ message: 'User status updated' });
}));

router.post('/:id/reset-password', asyncHandler(async (req, res) => {
  if (!req.body.password) return res.status(400).json({ error: 'Password is required' });
  const hashed = await bcrypt.hash(req.body.password, 10);
  await query('UPDATE users SET password = ?, must_change_password = true WHERE id = ?', [hashed, req.params.id]);
  res.json({ message: 'Password reset' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query('UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = ?', [req.params.id]);
  await query('DELETE FROM user_pages WHERE user_id = ?', [req.params.id]);
  await query('DELETE FROM user_providers WHERE user_id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
}));

export default router;
