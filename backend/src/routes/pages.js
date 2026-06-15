import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManagePages, requireSuperAdmin } from '../middleware/rbac.js';
import { verifyFacebookToken } from '../services/fbService.js';
import {
  getAccessiblePageIds,
  assertPageAccess,
  pageIdInClause,
} from '../services/pageAccessService.js';
import { assertProviderAccess } from '../services/providerAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const accessibleIds = await getAccessiblePageIds(req.user);
  const { clause, params } = pageIdInClause(accessibleIds, 'fb_pages.id');
  const pages = await query(
    `SELECT id, name, page_id, avatar_url, is_active, token_status, skill_id, text_provider_id, image_provider_id, created_at
     FROM fb_pages WHERE 1=1${clause} ORDER BY name ASC`,
    params
  );
  res.json(pages);
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const pages = await query(
    'SELECT id, name, page_id, page_token, avatar_url, skill_id, text_provider_id, image_provider_id, is_active, token_status, created_at FROM fb_pages WHERE id = ?',
    [req.params.id]
  );
  if (!pages.length) return res.status(404).json({ error: 'Page not found' });
  res.json(pages[0]);
}));

router.post('/', authenticate, requireSuperAdmin, asyncHandler(async (req, res) => {
  const { name, page_id, page_token, avatar_url, skill_id, text_provider_id, image_provider_id, is_active = true } = req.body;
  if (!name || !page_id || !page_token) return res.status(400).json({ error: 'Missing required fields' });

  await verifyFacebookToken(page_id, page_token);
  const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const result = await query(
    'INSERT INTO fb_pages (name, page_id, page_token, token_expires_at, token_status, avatar_url, skill_id, text_provider_id, image_provider_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [name, page_id, page_token, tokenExpiresAt, 'valid', avatar_url, skill_id, text_provider_id, image_provider_id, is_active]
  );
  res.status(201).json({ id: result.insertId, name, page_id, avatar_url, is_active });
}));

router.put('/:id', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const { name, page_token, avatar_url, skill_id, text_provider_id, image_provider_id, is_active } = req.body;
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

  await query(
    'UPDATE fb_pages SET name = ?, page_token = ?, avatar_url = ?, skill_id = ?, text_provider_id = ?, image_provider_id = ?, is_active = ?, token_expires_at = COALESCE(?, token_expires_at), token_status = ? WHERE id = ?',
    [name, tokenToUpdate, avatar_url, skill_id, text_provider_id, image_provider_id, is_active, tokenExpiresAt, tokenStatus, req.params.id]
  );
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

export default router;
