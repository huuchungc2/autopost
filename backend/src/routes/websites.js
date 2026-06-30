import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManageWebsites } from '../middleware/rbac.js';
import { assertProviderAccess } from '../services/providerAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

function normalizeOptionalId(value) {
  if (value === '' || value === null || value === undefined) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const websites = await query(
    `SELECT id, name, domain, skill_id, text_provider_id, image_provider_id, publish_url, is_active, created_at
     FROM websites ORDER BY name ASC`
  );
  res.json(websites);
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT id, name, domain, skill_id, text_provider_id, image_provider_id, publish_url, api_key, is_active, created_at
     FROM websites WHERE id = ?`,
    [req.params.id]
  );
  const website = rows[0];
  if (!website) return res.status(404).json({ error: 'Website not found' });
  res.json({ ...website, api_key: website.api_key ? true : '' });
}));

router.post('/', authenticate, canManageWebsites, asyncHandler(async (req, res) => {
  const { name, domain, skill_id, text_provider_id, image_provider_id, publish_url, api_key, is_active = true } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Tên website là bắt buộc' });

  const resolvedSkillId = normalizeOptionalId(skill_id);
  const resolvedTextProviderId = normalizeOptionalId(text_provider_id);
  const resolvedImageProviderId = normalizeOptionalId(image_provider_id);
  if (resolvedTextProviderId) await assertProviderAccess(req.user, resolvedTextProviderId);
  if (resolvedImageProviderId) await assertProviderAccess(req.user, resolvedImageProviderId);

  const result = await query(
    `INSERT INTO websites (name, domain, skill_id, text_provider_id, image_provider_id, publish_url, api_key, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      name.trim(),
      domain?.trim() || null,
      resolvedSkillId,
      resolvedTextProviderId,
      resolvedImageProviderId,
      publish_url?.trim() || null,
      api_key?.trim() || null,
      is_active !== false,
    ]
  );
  res.status(201).json({ id: result.insertId, name: name.trim(), domain, is_active });
}));

router.put('/:id', authenticate, canManageWebsites, asyncHandler(async (req, res) => {
  const { name, domain, skill_id, text_provider_id, image_provider_id, publish_url, api_key, is_active } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Tên website là bắt buộc' });

  const existing = (await query(
    'SELECT domain, skill_id, text_provider_id, image_provider_id, publish_url, api_key, is_active FROM websites WHERE id = ?',
    [req.params.id]
  ))[0];
  if (!existing) return res.status(404).json({ error: 'Website not found' });

  const resolvedSkillId = skill_id !== undefined ? normalizeOptionalId(skill_id) : existing.skill_id;
  const resolvedTextProviderId = text_provider_id !== undefined ? normalizeOptionalId(text_provider_id) : existing.text_provider_id;
  const resolvedImageProviderId = image_provider_id !== undefined ? normalizeOptionalId(image_provider_id) : existing.image_provider_id;
  if (resolvedTextProviderId) await assertProviderAccess(req.user, resolvedTextProviderId);
  if (resolvedImageProviderId) await assertProviderAccess(req.user, resolvedImageProviderId);
  const resolvedApiKey = api_key?.trim() ? api_key.trim() : existing.api_key;
  const resolvedDomain = domain !== undefined ? (domain?.trim() || null) : existing.domain;
  const resolvedPublishUrl = publish_url !== undefined ? (publish_url?.trim() || null) : existing.publish_url;
  const resolvedIsActive = is_active !== undefined ? is_active !== false : !!existing.is_active;

  await query(
    `UPDATE websites SET name = ?, domain = ?, skill_id = ?, text_provider_id = ?, image_provider_id = ?,
       publish_url = ?, api_key = ?, is_active = ? WHERE id = ?`,
    [
      name.trim(),
      resolvedDomain,
      resolvedSkillId,
      resolvedTextProviderId,
      resolvedImageProviderId,
      resolvedPublishUrl,
      resolvedApiKey,
      resolvedIsActive,
      req.params.id,
    ]
  );
  res.json({ message: 'Website updated' });
}));

router.delete('/:id', authenticate, canManageWebsites, asyncHandler(async (req, res) => {
  await query('DELETE FROM websites WHERE id = ?', [req.params.id]);
  res.json({ message: 'Website deleted' });
}));

export default router;
