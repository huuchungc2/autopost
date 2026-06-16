import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManagePages } from '../middleware/rbac.js';
import { verifyFacebookToken } from '../services/fbService.js';
import {
  getAccessiblePageIds,
  assertPageAccess,
  pageIdInClause,
  isSuperAdmin,
  assignPageToUser,
  assignPageToUsers,
  getPageAssignedUserIds,
  setPageAssignedUsers,
} from '../services/pageAccessService.js';
import { assertProviderAccess } from '../services/providerAccessService.js';
import { enrichPagesWithSkills, getPageSkills, syncPageSkills } from '../services/pageSkillsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

function normalizeSkillIds(body) {
  if (Array.isArray(body.skill_ids)) {
    return body.skill_ids.map((id) => Number(id)).filter(Boolean);
  }
  if (body.skill_id) return [Number(body.skill_id)].filter(Boolean);
  return [];
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const accessibleIds = await getAccessiblePageIds(req.user);
  const { clause, params } = pageIdInClause(accessibleIds, 'fb_pages.id');
  const pages = await query(
    `SELECT fp.id, fp.name, fp.page_id, fp.avatar_url, fp.is_active, fp.token_status,
            fp.token_expires_at,
            fp.skill_id, fp.text_provider_id, fp.image_provider_id, fp.created_at,
            CONCAT(LEFT(fp.page_token, 8), '…', RIGHT(fp.page_token, 6)) AS page_token_preview
     FROM fb_pages fp
     WHERE 1=1${clause}
     ORDER BY fp.name ASC`,
    params
  );
  res.json(await enrichPagesWithSkills(pages));
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const pages = await query(
    `SELECT id, name, page_id, page_token, avatar_url, skill_id, text_provider_id, image_provider_id,
            is_active, token_status, token_expires_at, created_at
     FROM fb_pages WHERE id = ?`,
    [req.params.id]
  );
  if (!pages.length) return res.status(404).json({ error: 'Page not found' });
  const skills = await getPageSkills(req.params.id);
  const page = pages[0];
  const assigned_user_ids = isSuperAdmin(req.user) ? await getPageAssignedUserIds(req.params.id) : undefined;
  res.json({
    ...page,
    skills,
    skill_ids: skills.map((s) => s.id),
    ...(assigned_user_ids !== undefined ? { assigned_user_ids } : {}),
  });
}));

router.post('/', authenticate, canManagePages, asyncHandler(async (req, res) => {
  const {
    name, page_id, page_token, avatar_url, text_provider_id, image_provider_id, is_active = true,
    assign_user_ids = [],
  } = req.body;
  const skillIds = normalizeSkillIds(req.body);
  if (!name || !page_id || !page_token) return res.status(400).json({ error: 'Missing required fields' });

  if (text_provider_id) await assertProviderAccess(req.user, text_provider_id);
  if (image_provider_id) await assertProviderAccess(req.user, image_provider_id);

  await verifyFacebookToken(page_id, page_token);
  const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const result = await query(
    'INSERT INTO fb_pages (name, page_id, page_token, token_expires_at, token_status, avatar_url, skill_id, text_provider_id, image_provider_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [name, page_id, page_token, tokenExpiresAt, 'valid', avatar_url, skillIds[0] || null, text_provider_id, image_provider_id, is_active]
  );
  await syncPageSkills(result.insertId, skillIds);

  if (!isSuperAdmin(req.user)) {
    await assignPageToUser(req.user.id, result.insertId);
  } else if (Array.isArray(assign_user_ids) && assign_user_ids.length) {
    const targets = await query(
      `SELECT id FROM users WHERE id IN (${assign_user_ids.map(() => '?').join(', ')})
       AND deleted_at IS NULL AND role IN ('admin', 'editor')`,
      assign_user_ids.map((id) => Number(id)).filter(Boolean)
    );
    await assignPageToUsers(result.insertId, targets.map((u) => u.id));
  }

  res.status(201).json({ id: result.insertId, name, page_id, avatar_url, is_active, skill_ids: skillIds });
}));

router.put('/:id', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const {
    name, page_token, avatar_url, text_provider_id, image_provider_id, is_active,
    assign_user_ids,
  } = req.body;
  const skillIds = req.body.skill_ids !== undefined || req.body.skill_id !== undefined
    ? normalizeSkillIds(req.body)
    : null;

  const existing = (await query('SELECT page_id, page_token FROM fb_pages WHERE id = ?', [req.params.id]))[0];
  if (!existing) return res.status(404).json({ error: 'Page not found' });

  let tokenToUpdate = existing.page_token;
  let tokenStatus = 'valid';
  let tokenExpiresAt = null;

  if (page_token) {
    await verifyFacebookToken(existing.page_id, page_token);
    tokenToUpdate = page_token;
    tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  }

  if (text_provider_id) await assertProviderAccess(req.user, text_provider_id);
  if (image_provider_id) await assertProviderAccess(req.user, image_provider_id);

  const primarySkillId = skillIds !== null ? (skillIds[0] || null) : undefined;
  const current = await query('SELECT skill_id FROM fb_pages WHERE id = ?', [req.params.id]);
  const skillIdToSave = skillIds !== null ? primarySkillId : current[0]?.skill_id;

  await query(
    'UPDATE fb_pages SET name = ?, page_token = ?, avatar_url = ?, skill_id = ?, text_provider_id = ?, image_provider_id = ?, is_active = ?, token_expires_at = COALESCE(?, token_expires_at), token_status = ? WHERE id = ?',
    [name, tokenToUpdate, avatar_url, skillIdToSave, text_provider_id, image_provider_id, is_active, tokenExpiresAt, tokenStatus, req.params.id]
  );

  if (skillIds !== null) {
    await syncPageSkills(req.params.id, skillIds);
  }

  // Super admin can assign/unassign page visibility for admin/editor users
  if (isSuperAdmin(req.user) && Array.isArray(assign_user_ids)) {
    const ids = assign_user_ids.map((id) => Number(id)).filter(Boolean);
    let targets = [];
    if (ids.length) {
      targets = await query(
        `SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(', ')})
         AND deleted_at IS NULL AND role IN ('admin', 'editor')`,
        ids
      );
    }
    await setPageAssignedUsers(req.params.id, targets.map((u) => u.id));
  }

  res.json({ message: 'Page updated' });
}));

router.delete('/:id', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  await query('DELETE FROM fb_pages WHERE id = ?', [req.params.id]);
  res.json({ message: 'Page deleted' });
}));

router.get('/:id/topics', authenticate, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const topics = await query('SELECT id, day_of_week, topic, post_time, is_active FROM content_topics WHERE page_id = ?', [req.params.id]);
  res.json(topics);
}));

router.post('/:id/topics', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const { day_of_week, topic, post_time = '08:00:00', is_active = true } = req.body;
  if (day_of_week === undefined || !topic) return res.status(400).json({ error: 'Missing required fields' });
  const result = await query(
    'INSERT INTO content_topics (page_id, day_of_week, topic, post_time, is_active) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, day_of_week, topic, post_time, is_active]
  );
  res.status(201).json({ id: result.insertId, page_id: req.params.id, day_of_week, topic, post_time, is_active });
}));

router.put('/:id/token', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const { page_token } = req.body;
  if (!page_token) return res.status(400).json({ error: 'page_token is required' });
  const page = (await query('SELECT page_id FROM fb_pages WHERE id = ?', [req.params.id]))[0];
  if (!page) return res.status(404).json({ error: 'Page not found' });
  await verifyFacebookToken(page.page_id, page_token);
  const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  await query('UPDATE fb_pages SET page_token = ?, token_expires_at = ?, token_status = ? WHERE id = ?', [page_token, tokenExpiresAt, 'valid', req.params.id]);
  res.json({ message: 'Token updated' });
}));

router.post('/:id/verify-token', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const page = (await query('SELECT page_id, page_token, name FROM fb_pages WHERE id = ?', [req.params.id]))[0];
  if (!page) return res.status(404).json({ error: 'Page not found' });
  try {
    const fb = await verifyFacebookToken(page.page_id, page.page_token);
    await query('UPDATE fb_pages SET token_status = ? WHERE id = ?', ['valid', req.params.id]);
    res.json({
      ok: true,
      message: 'Token hợp lệ',
      fb_page_id: fb.id,
      fb_name: fb.name,
      matches_configured_page: String(fb.id) === String(page.page_id),
    });
  } catch (error) {
    await query('UPDATE fb_pages SET token_status = ? WHERE id = ?', ['expired', req.params.id]);
    res.status(400).json({ ok: false, error: error.message });
  }
}));

export default router;
