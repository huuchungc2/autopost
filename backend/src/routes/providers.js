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
import { getProviderTemplateById, listProviderTemplates } from '../services/providerTemplateService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

const providerListFields = `id, name, type, model, template_id, provider_kind, api_endpoint, is_active, user_id, created_at`;

router.get('/templates', asyncHandler(async (req, res) => {
  const templates = await listProviderTemplates();
  res.json(templates);
}));

router.get('/', asyncHandler(async (req, res) => {
  const accessibleIds = await getAccessibleProviderIds(req.user);
  const { clause, params } = providerIdInClause(accessibleIds);
  const providers = await query(
    `SELECT ${providerListFields} FROM ai_providers WHERE 1=1${clause} ORDER BY name ASC`,
    params
  );
  res.json(providers);
}));

router.post('/', canManageProviders, asyncHandler(async (req, res) => {
  const { template_id, api_key, model, is_active = true, name, type } = req.body;

  if (!api_key?.trim()) {
    return res.status(400).json({ error: 'API key là bắt buộc' });
  }

  let payload = { name, type, model, api_key: api_key.trim(), is_active };

  if (template_id) {
    const template = await getProviderTemplateById(template_id);
    if (!template) return res.status(400).json({ error: 'Template không tồn tại' });
    payload = {
      name: template.name,
      type: template.type,
      model: model?.trim() || template.default_model,
      api_key: api_key.trim(),
      is_active,
      template_id: template.id,
      provider_kind: template.provider_kind,
      api_endpoint: template.api_endpoint,
    };
  } else if (!name || !type) {
    return res.status(400).json({ error: 'Chọn template hoặc nhập name + type' });
  }

  const duplicate = await query(
    'SELECT id FROM ai_providers WHERE name = ? AND type = ?',
    [payload.name, payload.type]
  );
  if (duplicate.length) {
    return res.status(400).json({ error: `Đã có provider "${payload.name}" — dùng Sửa để đổi key` });
  }

  const ownerId = isSuperAdmin(req.user) ? null : req.user.id;
  const result = await query(
    `INSERT INTO ai_providers
     (name, type, api_key, model, template_id, provider_kind, api_endpoint, is_active, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      payload.name,
      payload.type,
      payload.api_key,
      payload.model || null,
      payload.template_id || null,
      payload.provider_kind || null,
      payload.api_endpoint || null,
      payload.is_active,
      ownerId,
    ]
  );

  if (!isSuperAdmin(req.user)) {
    await linkProviderToUser(req.user.id, result.insertId);
  }

  res.status(201).json({
    id: result.insertId,
    name: payload.name,
    type: payload.type,
    model: payload.model,
    template_id: payload.template_id,
    provider_kind: payload.provider_kind,
    api_endpoint: payload.api_endpoint,
    is_active: payload.is_active,
  });
}));

router.put('/:id', canManageProviders, asyncHandler(async (req, res) => {
  await assertProviderAccess(req.user, req.params.id);
  const { api_key, model, is_active } = req.body;
  const existing = (await query(
    `SELECT api_key, name, type, template_id, provider_kind, api_endpoint FROM ai_providers WHERE id = ?`,
    [req.params.id]
  ))[0];
  if (!existing) return res.status(404).json({ error: 'Provider not found' });

  await query(
    `UPDATE ai_providers SET api_key = ?, model = ?, is_active = ? WHERE id = ?`,
    [api_key || existing.api_key, model ?? existing.model, is_active ?? true, req.params.id]
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
  const provider = (await query(
    `SELECT id, name, type, api_key, model, provider_kind, api_endpoint FROM ai_providers WHERE id = ?`,
    [req.params.id]
  ))[0];
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  if (provider.type === 'text') {
    const result = await generateText('Say hello in one sentence.', provider);
    return res.json({ ok: true, sample: result.text, endpoint: provider.api_endpoint });
  }
  if (provider.type === 'image') {
    const result = await generateImage('A simple blue circle on white background', provider);
    return res.json({ ok: true, sample: result.image_url, endpoint: provider.api_endpoint });
  }
  res.json({ ok: true, message: 'Provider configured' });
}));

export default router;
