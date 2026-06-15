import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManageProviders } from '../middleware/rbac.js';
import { generateText } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';
import {
  getAccessibleProviderIds,
  assertProviderAccess,
  providerIdInClause,
  linkProviderToUser,
} from '../services/providerAccessService.js';
import { isSuperAdmin } from '../services/pageAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const accessibleIds = await getAccessibleProviderIds(req.user);
  const { clause, params } = providerIdInClause(accessibleIds);
  const providers = await query(
    `SELECT id, name, type, model, is_active, user_id, created_at FROM ai_providers WHERE 1=1${clause} ORDER BY name ASC`,
    params
  );
  res.json(providers);
}));

router.post('/', canManageProviders, asyncHandler(async (req, res) => {
  const { name, type, api_key, model, is_active = true } = req.body;
  if (!name || !type || !api_key) return res.status(400).json({ error: 'Missing required fields' });

  const ownerId = isSuperAdmin(req.user) ? null : req.user.id;
  const result = await query(
    'INSERT INTO ai_providers (name, type, api_key, model, is_active, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
    [name, type, api_key, model, is_active, ownerId]
  );

  if (!isSuperAdmin(req.user)) {
    await linkProviderToUser(req.user.id, result.insertId);
  }

  res.status(201).json({ id: result.insertId, name, type, model, is_active });
}));

router.put('/:id', canManageProviders, asyncHandler(async (req, res) => {
  await assertProviderAccess(req.user, req.params.id);
  const { name, type, api_key, model, is_active } = req.body;
  const existing = (await query('SELECT api_key FROM ai_providers WHERE id = ?', [req.params.id]))[0];
  if (!existing) return res.status(404).json({ error: 'Provider not found' });
  await query(
    'UPDATE ai_providers SET name = ?, type = ?, api_key = ?, model = ?, is_active = ? WHERE id = ?',
    [name, type, api_key || existing.api_key, model, is_active, req.params.id]
  );
  res.json({ message: 'Provider updated' });
}));

router.delete('/:id', canManageProviders, asyncHandler(async (req, res) => {
  await assertProviderAccess(req.user, req.params.id);
  await query('DELETE FROM ai_providers WHERE id = ?', [req.params.id]);
  res.json({ message: 'Provider deleted' });
}));

router.post('/:id/test', canManageProviders, asyncHandler(async (req, res) => {
  await assertProviderAccess(req.user, req.params.id);
  const provider = (await query('SELECT id, name, type, api_key, model FROM ai_providers WHERE id = ?', [req.params.id]))[0];
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  if (provider.type === 'text') {
    const result = await generateText('Say hello in one sentence.', provider);
    return res.json({ ok: true, sample: result.text });
  }
  if (provider.type === 'image') {
    const result = await generateImage('A simple blue circle on white background', provider);
    return res.json({ ok: true, sample: result.image_url });
  }
  res.json({ ok: true, message: 'Provider configured' });
}));

export default router;
