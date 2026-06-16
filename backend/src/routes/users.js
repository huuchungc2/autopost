import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManageUsers, isSuperAdminUser } from '../middleware/rbac.js';
import {
  setUserPages,
  getUserPages,
  getAccessiblePageIds,
  getAssignedPageIds,
} from '../services/pageAccessService.js';
import {
  setUserProviders,
  getUserProviders,
  getAccessibleProviderIds,
  getAssignedProviderIds,
} from '../services/providerAccessService.js';
import {
  normalizeUsername,
  usernameFromEmail,
  assertUsernameAvailable,
} from '../services/userUsernameService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate, canManageUsers);

function requesterIsSuperAdmin(req) {
  return isSuperAdminUser(req.user);
}

function assertCanAccessTargetUser(req, targetUser) {
  if (!targetUser) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  if (!requesterIsSuperAdmin(req) && targetUser.role === 'super_admin') {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
}

function normalizeIdList(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

async function resolvePageIdsForAssignment(req, targetUserId, pageIds) {
  const requested = normalizeIdList(pageIds);
  if (requesterIsSuperAdmin(req)) return requested;
  const accessible = await getAccessiblePageIds(req.user);
  if (!accessible?.length) return requested.length ? [] : [];
  const allowed = new Set(accessible);
  const scoped = requested.filter((id) => allowed.has(id));
  if (!targetUserId) return scoped;
  const existing = await getAssignedPageIds(targetUserId);
  const preserved = existing.filter((id) => !allowed.has(id));
  return [...new Set([...preserved, ...scoped])];
}

async function resolveProviderIdsForAssignment(req, targetUserId, providerIds) {
  const requested = normalizeIdList(providerIds);
  if (requesterIsSuperAdmin(req)) return requested;
  const accessible = await getAccessibleProviderIds(req.user);
  if (!accessible?.length) return requested.length ? [] : [];
  const allowed = new Set(accessible);
  const scoped = requested.filter((id) => allowed.has(id));
  if (!targetUserId) return scoped;
  const existing = await getAssignedProviderIds(targetUserId);
  const preserved = existing.filter((id) => !allowed.has(id));
  return [...new Set([...preserved, ...scoped])];
}

function resolveRoleForRequester(req, role, existingRole = null) {
  const nextRole = role || existingRole || 'editor';
  if (nextRole === 'super_admin' && !requesterIsSuperAdmin(req)) {
    const error = new Error('Không có quyền gán vai trò Super Admin');
    error.status = 403;
    throw error;
  }
  if (!['super_admin', 'admin', 'editor'].includes(nextRole)) {
    return existingRole || 'editor';
  }
  return nextRole;
}

async function getUserById(id) {
  try {
    const rows = await query(
      'SELECT id, name, username, email, role, is_active, must_change_password, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const rows = await query(
      'SELECT id, name, email, role, is_active, must_change_password, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    return rows[0] ? { ...rows[0], username: null } : null;
  }
}

function resolveUsernameInput(body, email, existingUsername = null) {
  const raw = body.username != null ? body.username : existingUsername;
  const normalized = normalizeUsername(raw || usernameFromEmail(email));
  return normalized || existingUsername;
}

router.get('/', asyncHandler(async (req, res) => {
  const hideSuperAdmin = requesterIsSuperAdmin(req) ? '' : " AND u.role <> 'super_admin'";
  try {
    const users = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
              (SELECT COUNT(*) FROM user_pages up WHERE up.user_id = u.id) AS assigned_page_count,
              (SELECT COUNT(*) FROM user_providers uv WHERE uv.user_id = u.id) AS assigned_provider_count
       FROM users u
       WHERE u.deleted_at IS NULL${hideSuperAdmin}
       ORDER BY u.name ASC`
    );
    return res.json(users);
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
    const users = await query(
      `SELECT id, name, email, role, is_active, must_change_password, created_at
       FROM users WHERE deleted_at IS NULL${hideSuperAdmin.replace(/u\./g, '')}
       ORDER BY name ASC`
    );
    res.json(users.map((u) => ({ ...u, assigned_page_count: null, assigned_provider_count: null })));
  }
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, role = 'editor', page_ids = [], provider_ids = [] } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Thiếu tên, email hoặc mật khẩu' });
  const username = resolveUsernameInput(req.body, email);
  await assertUsernameAvailable(username);
  const resolvedRole = resolveRoleForRequester(req, role);
  const hashed = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (name, username, email, password, role, is_active, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, true, false, NOW())',
    [name, username, email, hashed, resolvedRole]
  ).catch(async (error) => {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    return query(
      'INSERT INTO users (name, email, password, role, is_active, must_change_password, created_at) VALUES (?, ?, ?, ?, true, false, NOW())',
      [name, email, hashed, resolvedRole]
    );
  });
  if (resolvedRole !== 'super_admin') {
    const savedPageIds = await setUserPages(
      result.insertId,
      await resolvePageIdsForAssignment(req, null, page_ids)
    );
    const savedProviderIds = await setUserProviders(
      result.insertId,
      await resolveProviderIdsForAssignment(req, null, provider_ids)
    );
    return res.status(201).json({
      id: result.insertId,
      name,
      username,
      email,
      role: resolvedRole,
      assigned_page_count: savedPageIds.length,
      assigned_provider_count: savedProviderIds.length,
    });
  }
  res.status(201).json({ id: result.insertId, name, username, email, role: resolvedRole });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, user);
  if (user.role === 'super_admin') {
    return res.json({ ...user, assigned_pages: [], assigned_providers: [] });
  }
  const assigned_pages = await getUserPages(req.params.id);
  const assigned_providers = await getUserProviders(req.params.id);
  res.json({ ...user, assigned_pages, assigned_providers });
}));

router.get('/:id/pages', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, user);
  if (user.role === 'super_admin') {
    const all = await query('SELECT id, name, page_id FROM fb_pages ORDER BY name');
    return res.json(all.map((p) => ({ ...p, assigned: true })));
  }
  res.json(await getUserPages(req.params.id));
}));

router.get('/:id/providers', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, user);
  if (user.role === 'super_admin') {
    const all = await query('SELECT id, name, type, model FROM ai_providers ORDER BY name');
    return res.json(all.map((p) => ({ ...p, assigned: true })));
  }
  res.json(await getUserProviders(req.params.id));
}));

router.put('/:id/pages', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, user);
  if (user.role === 'super_admin') {
    return res.status(400).json({ error: 'Super admin has access to all pages' });
  }
  const pageIds = await setUserPages(
    req.params.id,
    await resolvePageIdsForAssignment(req, req.params.id, req.body.page_ids || [])
  );
  res.json({ message: 'Page assignments updated', page_ids: pageIds });
}));

router.put('/:id/providers', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, user);
  if (user.role === 'super_admin') {
    return res.status(400).json({ error: 'Super admin has access to all providers' });
  }
  const providerIds = await setUserProviders(
    req.params.id,
    await resolveProviderIdsForAssignment(req, req.params.id, req.body.provider_ids || [])
  );
  res.json({ message: 'Provider assignments updated', provider_ids: providerIds });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, email, role, is_active, page_ids, provider_ids } = req.body;
  const existing = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, existing);
  const resolvedRole = resolveRoleForRequester(req, role, existing.role);
  const username = resolveUsernameInput(req.body, email, existing.username);
  await assertUsernameAvailable(username, req.params.id);

  await query(
    'UPDATE users SET name = ?, username = ?, email = ?, role = ?, is_active = ? WHERE id = ?',
    [name, username, email, resolvedRole, is_active, req.params.id]
  ).catch(async (error) => {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    await query(
      'UPDATE users SET name = ?, email = ?, role = ?, is_active = ? WHERE id = ?',
      [name, email, resolvedRole, is_active, req.params.id]
    );
  });
  if (resolvedRole !== 'super_admin') {
    if (Array.isArray(page_ids)) {
      await setUserPages(
        req.params.id,
        await resolvePageIdsForAssignment(req, req.params.id, page_ids)
      );
    }
    if (Array.isArray(provider_ids)) {
      await setUserProviders(
        req.params.id,
        await resolveProviderIdsForAssignment(req, req.params.id, provider_ids)
      );
    }
  }
  if (resolvedRole === 'super_admin') {
    await query('DELETE FROM user_pages WHERE user_id = ?', [req.params.id]);
    await query('DELETE FROM user_providers WHERE user_id = ?', [req.params.id]);
  }
  const assigned_pages = resolvedRole === 'super_admin' ? [] : await getUserPages(req.params.id);
  const assigned_providers = resolvedRole === 'super_admin' ? [] : await getUserProviders(req.params.id);
  res.json({
    message: 'User updated',
    assigned_page_count: assigned_pages.length,
    assigned_provider_count: assigned_providers.length,
    assigned_page_ids: assigned_pages.map((p) => p.id),
  });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const existing = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, existing);
  await query('UPDATE users SET is_active = ? WHERE id = ?', [req.body.is_active, req.params.id]);
  res.json({ message: 'User status updated' });
}));

router.post('/:id/reset-password', asyncHandler(async (req, res) => {
  const existing = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, existing);
  if (!req.body.password) return res.status(400).json({ error: 'Password is required' });
  const hashed = await bcrypt.hash(req.body.password, 10);
  await query('UPDATE users SET password = ?, must_change_password = true WHERE id = ?', [hashed, req.params.id]);
  res.json({ message: 'Password reset' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await getUserById(req.params.id);
  assertCanAccessTargetUser(req, existing);
  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Không thể tự xóa tài khoản của mình' });
  }
  await query('UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = ?', [req.params.id]);
  await query('DELETE FROM user_pages WHERE user_id = ?', [req.params.id]);
  await query('DELETE FROM user_providers WHERE user_id = ?', [req.params.id]);
  res.json({ message: 'User deleted' });
}));

export default router;
