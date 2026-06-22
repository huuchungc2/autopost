import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canManagePages } from '../middleware/rbac.js';
import { verifyFacebookToken, inspectFacebookToken } from '../services/fbService.js';
import {
  fetchFacebookPageFromComposio,
  getComposioDefaults,
  getConnectedAccountStatus,
  createComposioFacebookLink,
  isComposioConfigured,
  syncComposioPageTokenForPage,
} from '../services/composioService.js';
import {
  getActiveTokenSource,
  hasComposioPageToken,
  hasManualPageToken,
  resolveInitialActiveSource,
  tokenPreview,
} from '../services/pageTokenService.js';
import { computeTokenStatus, syncSummaryTokenFields } from '../services/tokenHealthService.js';
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
import {
  normalizePageImageSchedule,
  parsePageImageScheduleInput,
  releaseInFlightImageJobsForPages,
} from '../services/pageImageSchedule.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

function normalizeSkillIds(body) {
  if (Array.isArray(body.skill_ids)) {
    return body.skill_ids.map((id) => Number(id)).filter(Boolean);
  }
  if (body.skill_id) return [Number(body.skill_id)].filter(Boolean);
  return [];
}

function normalizeOptionalProviderId(value) {
  if (value === '' || value === null || value === undefined) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function pageScheduleSqlValues(schedule) {
  return [
    schedule.enabled ? 1 : 0,
    schedule.start_hour,
    schedule.start_minute,
    schedule.end_hour,
    schedule.end_minute,
    schedule.interval_minutes,
  ];
}

function attachImageSchedule(pageRow) {
  if (!pageRow) return pageRow;
  const image_schedule = normalizePageImageSchedule(pageRow);
  return { ...pageRow, image_schedule };
}

async function resolveAssignableUserIds(userIds) {
  const ids = (userIds || []).map((id) => Number(id)).filter(Boolean);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const queries = [
    {
      sql: `SELECT id FROM users WHERE id IN (${placeholders})
            AND deleted_at IS NULL AND role IN ('admin', 'editor')`,
      params: ids,
    },
    {
      sql: `SELECT id FROM users WHERE id IN (${placeholders})
            AND role IN ('admin', 'editor')`,
      params: ids,
    },
  ];
  for (const { sql, params } of queries) {
    try {
      return await query(sql, params);
    } catch (error) {
      if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    }
  }
  return [];
}

function normalizeTokenSource(value) {
  return value === 'composio' ? 'composio' : 'manual';
}

/** Không ghi đè token đang có bằng chuỗi rỗng khi lưu fanpage. */
function preserveExistingTokens({ manualToken, composioToken, existing }) {
  let manual = manualToken;
  let composio = composioToken;
  if (!String(manual || '').trim() && hasManualPageToken(existing)) {
    manual = existing.page_token;
  }
  if (!String(composio || '').trim() && hasComposioPageToken(existing)) {
    composio = existing.composio_page_token;
  }
  return { manualToken: manual, composioToken: composio };
}

async function resolveDualTokensForSave({
  page_id,
  page_token,
  composio_user_id,
  composio_connected_account_id,
  sync_composio,
  existing,
}) {
  let manualToken = existing?.page_token ? String(existing.page_token) : '';
  let composioToken = existing?.composio_page_token ? String(existing.composio_page_token) : '';
  let composioUserId = composio_user_id !== undefined ? composio_user_id : existing?.composio_user_id;
  let composioConnectedAccountId = composio_connected_account_id !== undefined
    ? composio_connected_account_id
    : existing?.composio_connected_account_id;
  let resolvedName = null;
  let avatarUrl = null;

  let manualExpiresAt = existing?.manual_token_expires_at || null;
  let manualStatus = existing?.manual_token_status || 'unknown';
  let composioExpiresAt = existing?.composio_token_expires_at || null;
  let composioStatus = existing?.composio_token_status || 'unknown';

  if (page_token?.trim()) {
    await verifyFacebookToken(page_id, page_token.trim());
    manualToken = page_token.trim();
    const inspected = await inspectFacebookToken(manualToken);
    if (inspected) {
      manualExpiresAt = inspected.expiresAt;
      manualStatus = inspected.isValid ? computeTokenStatus(inspected.expiresAt) : 'expired';
    } else {
      manualStatus = 'valid';
      manualExpiresAt = manualExpiresAt || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    }
  }

  if (sync_composio) {
    if (!isComposioConfigured()) {
      const error = new Error('Composio chưa cấu hình — vào Cài đặt → Composio');
      error.status = 400;
      throw error;
    }
    const synced = await fetchFacebookPageFromComposio(page_id, {
      composio_user_id: composioUserId,
      composio_connected_account_id: composioConnectedAccountId,
    });
    composioToken = synced.page_token;
    composioUserId = synced.composio_user_id;
    composioConnectedAccountId = synced.composio_connected_account_id;
    resolvedName = synced.name;
    avatarUrl = synced.avatar_url || null;
    const inspected = await inspectFacebookToken(composioToken);
    if (inspected) {
      composioExpiresAt = inspected.expiresAt;
      composioStatus = inspected.isValid ? computeTokenStatus(inspected.expiresAt) : 'expired';
    } else {
      composioStatus = 'valid';
      composioExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    }
  }

  if (!manualToken?.trim() && !composioToken?.trim()) {
    const error = new Error('Cần ít nhất token thủ công hoặc đồng bộ Composio');
    error.status = 400;
    throw error;
  }

  const token_source = existing?.token_source
    ? normalizeTokenSource(existing.token_source)
    : resolveInitialActiveSource({ manualToken, composioToken });
  const summary = syncSummaryTokenFields({
    token_source,
    page_token: manualToken,
    composio_page_token: composioToken,
    manual_token_status: manualStatus,
    manual_token_expires_at: manualExpiresAt,
    composio_token_status: composioStatus,
    composio_token_expires_at: composioExpiresAt,
  });

  return {
    page_token: manualToken || '',
    composio_page_token: composioToken || null,
    composio_user_id: composioUserId || null,
    composio_connected_account_id: composioConnectedAccountId || null,
    token_source,
    manual_token_status: manualStatus,
    manual_token_expires_at: manualExpiresAt,
    composio_token_status: composioStatus,
    composio_token_expires_at: composioExpiresAt,
    resolved_name: resolvedName,
    avatar_url: avatarUrl,
    tokenExpiresAt: summary.token_expires_at,
    tokenStatus: summary.token_status,
  };
}

async function applyComposioSyncToPage(pageId) {
  const synced = await syncComposioPageTokenForPage(pageId);
  return { synced, tokenExpiresAt: synced.token_expires_at };
}

router.get('/composio/config', authenticate, canManagePages, asyncHandler(async (req, res) => {
  const defaults = getComposioDefaults();
  let connection = null;
  if (defaults.default_connected_account_id && isComposioConfigured()) {
    try {
      connection = await getConnectedAccountStatus(defaults.default_connected_account_id);
    } catch (error) {
      connection = { error: error.message };
    }
  }
  res.json({ ...defaults, connection });
}));

router.post('/composio/connect-link', authenticate, canManagePages, asyncHandler(async (req, res) => {
  const link = await createComposioFacebookLink(req.body?.composio_user_id);
  res.json({
    message: 'Mở link để hoàn tất kết nối Facebook trên Composio',
    ...link,
  });
}));

router.post('/composio/preview-sync', authenticate, canManagePages, asyncHandler(async (req, res) => {
  const { page_id, composio_user_id, composio_connected_account_id } = req.body || {};
  if (!page_id?.trim()) return res.status(400).json({ error: 'page_id is required' });
  const synced = await fetchFacebookPageFromComposio(page_id.trim(), {
    composio_user_id,
    composio_connected_account_id,
  });
  res.json({
    message: 'Lấy token từ Composio thành công',
    page_id: page_id.trim(),
    page_name: synced.name,
    avatar_url: synced.avatar_url,
    composio_user_id: synced.composio_user_id,
    composio_connected_account_id: synced.composio_connected_account_id,
    token_preview: `${synced.page_token.slice(0, 8)}…${synced.page_token.slice(-6)}`,
  });
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const accessibleIds = await getAccessiblePageIds(req.user);
  const { clause, params } = pageIdInClause(accessibleIds, 'fp.id');
  const pages = await query(
    `SELECT fp.id, fp.name, fp.page_id, fp.avatar_url, fp.is_active, fp.token_status,
            fp.token_expires_at, fp.token_source,
            fp.manual_token_status, fp.composio_token_status,
            fp.manual_token_expires_at, fp.composio_token_expires_at,
            fp.composio_connected_account_id,
            fp.skill_id, fp.text_provider_id, fp.image_provider_id, fp.created_at,
            CONCAT(LEFT(fp.page_token, 8), '…', RIGHT(fp.page_token, 6)) AS page_token_preview,
            CONCAT(LEFT(fp.composio_page_token, 8), '…', RIGHT(fp.composio_page_token, 6)) AS composio_page_token_preview
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
    `SELECT id, name, page_id, page_token, composio_page_token, avatar_url, skill_id, text_provider_id, image_provider_id,
            is_active, token_status, token_expires_at, token_source,
            manual_token_status, manual_token_expires_at, composio_token_status, composio_token_expires_at,
            composio_user_id, composio_connected_account_id, created_at,
            image_schedule_enabled, image_schedule_start_hour, image_schedule_start_minute,
            image_schedule_end_hour, image_schedule_end_minute, image_schedule_interval_minutes,
            image_schedule_last_run_at
     FROM fb_pages WHERE id = ?`,
    [req.params.id]
  );
  if (!pages.length) return res.status(404).json({ error: 'Page not found' });
  const skills = await getPageSkills(req.params.id);
  const page = pages[0];
  const assigned_user_ids = isSuperAdmin(req.user) ? await getPageAssignedUserIds(req.params.id) : undefined;
  res.json({
    ...attachImageSchedule(page),
    page_token_preview: tokenPreview(page.page_token),
    composio_page_token_preview: tokenPreview(page.composio_page_token),
    skills,
    skill_ids: skills.map((s) => s.id),
    ...(assigned_user_ids !== undefined ? { assigned_user_ids } : {}),
  });
}));

router.post('/', authenticate, canManagePages, asyncHandler(async (req, res) => {
  const {
    name, page_id, page_token, avatar_url, text_provider_id, image_provider_id, is_active = true,
    assign_user_ids = [],
    image_schedule: imageScheduleInput,
    composio_user_id,
    composio_connected_account_id,
    sync_composio = false,
  } = req.body;
  const skillIds = normalizeSkillIds(req.body);
  if (!name || !page_id) return res.status(400).json({ error: 'Thiếu tên hoặc Page ID' });

  const resolvedTextProviderId = normalizeOptionalProviderId(text_provider_id);
  const resolvedImageProviderId = normalizeOptionalProviderId(image_provider_id);
  const pageSchedule = parsePageImageScheduleInput(imageScheduleInput);

  if (resolvedTextProviderId) await assertProviderAccess(req.user, resolvedTextProviderId);
  if (resolvedImageProviderId) await assertProviderAccess(req.user, resolvedImageProviderId);

  const resolvedToken = await resolveDualTokensForSave({
    page_id,
    page_token,
    composio_user_id,
    composio_connected_account_id,
    sync_composio: !!sync_composio,
  });
  const scheduleValues = pageScheduleSqlValues(pageSchedule);
  const result = await query(
    `INSERT INTO fb_pages (
       name, page_id, page_token, composio_page_token, token_source, composio_user_id, composio_connected_account_id,
       manual_token_status, manual_token_expires_at, composio_token_status, composio_token_expires_at,
       token_expires_at, token_status, avatar_url, skill_id,
       text_provider_id, image_provider_id, is_active,
       image_schedule_enabled, image_schedule_start_hour, image_schedule_start_minute,
       image_schedule_end_hour, image_schedule_end_minute, image_schedule_interval_minutes,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      resolvedToken.resolved_name || name,
      page_id,
      resolvedToken.page_token,
      resolvedToken.composio_page_token,
      resolvedToken.token_source,
      resolvedToken.composio_user_id,
      resolvedToken.composio_connected_account_id,
      resolvedToken.manual_token_status,
      resolvedToken.manual_token_expires_at,
      resolvedToken.composio_token_status,
      resolvedToken.composio_token_expires_at,
      resolvedToken.tokenExpiresAt,
      resolvedToken.tokenStatus,
      avatar_url || resolvedToken.avatar_url || null,
      skillIds[0] || null,
      resolvedTextProviderId, resolvedImageProviderId, is_active,
      ...scheduleValues,
    ]
  );
  await syncPageSkills(result.insertId, skillIds);

  if (!isSuperAdmin(req.user)) {
    await assignPageToUser(req.user.id, result.insertId);
  } else if (Array.isArray(assign_user_ids) && assign_user_ids.length) {
    const targets = await resolveAssignableUserIds(assign_user_ids);
    await assignPageToUsers(result.insertId, targets.map((u) => u.id));
  }

  res.status(201).json({ id: result.insertId, name, page_id, avatar_url, is_active, skill_ids: skillIds });
}));

router.put('/:id', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const {
    name, page_token, avatar_url, text_provider_id, image_provider_id, is_active,
    assign_user_ids,
    image_schedule: imageScheduleInput,
    composio_user_id,
    composio_connected_account_id,
    sync_composio,
    token_source: tokenSourceInput,
  } = req.body;
  const skillIds = req.body.skill_ids !== undefined || req.body.skill_id !== undefined
    ? normalizeSkillIds(req.body)
    : null;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Tên fanpage là bắt buộc' });
  }

  const existing = (await query(
    `SELECT page_id, page_token, composio_page_token, avatar_url, skill_id, text_provider_id, image_provider_id, is_active,
            token_source, token_status, token_expires_at,
            manual_token_status, manual_token_expires_at, composio_token_status, composio_token_expires_at,
            composio_user_id, composio_connected_account_id,
            image_schedule_enabled, image_schedule_start_hour, image_schedule_start_minute,
            image_schedule_end_hour, image_schedule_end_minute, image_schedule_interval_minutes
     FROM fb_pages WHERE id = ?`,
    [req.params.id]
  ))[0];
  if (!existing) return res.status(404).json({ error: 'Page not found' });

  const shouldSyncComposio = !!sync_composio;
  const shouldUpdateManual = page_token?.trim();
  const shouldUpdateTokens = shouldSyncComposio || shouldUpdateManual;

  let manualToken = existing.page_token;
  let composioToken = existing.composio_page_token;
  let composioUserId = composio_user_id !== undefined ? composio_user_id : existing.composio_user_id;
  let composioConnectedAccountId = composio_connected_account_id !== undefined
    ? composio_connected_account_id
    : existing.composio_connected_account_id;
  let tokenStatus = existing.token_status || 'valid';
  let tokenExpiresAt = existing.token_expires_at || null;
  let manualTokenStatus = existing.manual_token_status || 'unknown';
  let manualTokenExpiresAt = existing.manual_token_expires_at || null;
  let composioTokenStatus = existing.composio_token_status || 'unknown';
  let composioTokenExpiresAt = existing.composio_token_expires_at || null;
  let token_source = tokenSourceInput !== undefined
    ? normalizeTokenSource(tokenSourceInput)
    : (existing.token_source || 'manual');

  if (shouldUpdateTokens) {
    const resolvedToken = await resolveDualTokensForSave({
      page_id: existing.page_id,
      page_token: shouldUpdateManual ? page_token : undefined,
      composio_user_id: composioUserId,
      composio_connected_account_id: composioConnectedAccountId,
      sync_composio: shouldSyncComposio,
      existing,
    });
    manualToken = resolvedToken.page_token;
    composioToken = resolvedToken.composio_page_token;
    composioUserId = resolvedToken.composio_user_id;
    composioConnectedAccountId = resolvedToken.composio_connected_account_id;
    tokenStatus = resolvedToken.tokenStatus;
    tokenExpiresAt = resolvedToken.tokenExpiresAt;
    manualTokenStatus = resolvedToken.manual_token_status;
    manualTokenExpiresAt = resolvedToken.manual_token_expires_at;
    composioTokenStatus = resolvedToken.composio_token_status;
    composioTokenExpiresAt = resolvedToken.composio_token_expires_at;
    if (tokenSourceInput === undefined) {
      token_source = resolvedToken.token_source;
    }
  } else if (!hasManualPageToken(existing) && !hasComposioPageToken(existing)) {
    return res.status(400).json({ error: 'Fanpage cần ít nhất một token' });
  }

  ({ manualToken, composioToken } = preserveExistingTokens({
    manualToken,
    composioToken,
    existing,
  }));

  const resolvedTextProviderId = text_provider_id !== undefined
    ? normalizeOptionalProviderId(text_provider_id)
    : existing.text_provider_id;
  const resolvedImageProviderId = image_provider_id !== undefined
    ? normalizeOptionalProviderId(image_provider_id)
    : existing.image_provider_id;
  const resolvedAvatarUrl = avatar_url !== undefined ? (avatar_url || null) : existing.avatar_url;
  const resolvedIsActive = is_active !== undefined ? is_active !== false : !!existing.is_active;

  if (resolvedTextProviderId) await assertProviderAccess(req.user, resolvedTextProviderId);
  if (resolvedImageProviderId) await assertProviderAccess(req.user, resolvedImageProviderId);

  const primarySkillId = skillIds !== null ? (skillIds[0] || null) : undefined;
  const skillIdToSave = skillIds !== null ? primarySkillId : existing.skill_id;
  const pageSchedule = imageScheduleInput !== undefined
    ? parsePageImageScheduleInput(imageScheduleInput, normalizePageImageSchedule(existing))
    : null;
  const scheduleValues = pageSchedule ? pageScheduleSqlValues(pageSchedule) : null;

  await query(
    scheduleValues
      ? `UPDATE fb_pages SET name = ?, page_token = ?, composio_page_token = ?, token_source = ?, composio_user_id = ?, composio_connected_account_id = ?,
         manual_token_status = ?, manual_token_expires_at = ?, composio_token_status = ?, composio_token_expires_at = ?,
         avatar_url = ?, skill_id = ?, text_provider_id = ?, image_provider_id = ?, is_active = ?,
         image_schedule_enabled = ?, image_schedule_start_hour = ?, image_schedule_start_minute = ?,
         image_schedule_end_hour = ?, image_schedule_end_minute = ?, image_schedule_interval_minutes = ?,
         token_expires_at = COALESCE(?, token_expires_at), token_status = ? WHERE id = ?`
      : `UPDATE fb_pages SET name = ?, page_token = ?, composio_page_token = ?, token_source = ?, composio_user_id = ?, composio_connected_account_id = ?,
         manual_token_status = ?, manual_token_expires_at = ?, composio_token_status = ?, composio_token_expires_at = ?,
         avatar_url = ?, skill_id = ?, text_provider_id = ?, image_provider_id = ?, is_active = ?,
         token_expires_at = COALESCE(?, token_expires_at), token_status = ? WHERE id = ?`,
    scheduleValues
      ? [
        name.trim(), manualToken, composioToken, token_source, composioUserId, composioConnectedAccountId,
        manualTokenStatus, manualTokenExpiresAt, composioTokenStatus, composioTokenExpiresAt,
        resolvedAvatarUrl, skillIdToSave, resolvedTextProviderId, resolvedImageProviderId, resolvedIsActive,
        ...scheduleValues,
        tokenExpiresAt, tokenStatus, req.params.id,
      ]
      : [
        name.trim(), manualToken, composioToken, token_source, composioUserId, composioConnectedAccountId,
        manualTokenStatus, manualTokenExpiresAt, composioTokenStatus, composioTokenExpiresAt,
        resolvedAvatarUrl, skillIdToSave, resolvedTextProviderId, resolvedImageProviderId, resolvedIsActive,
        tokenExpiresAt, tokenStatus, req.params.id,
      ]
  );

  if (pageSchedule && !pageSchedule.enabled) {
    await releaseInFlightImageJobsForPages([Number(req.params.id)]);
  }

  if (skillIds !== null) {
    await syncPageSkills(req.params.id, skillIds);
  }

  if (isSuperAdmin(req.user) && Array.isArray(assign_user_ids)) {
    const targets = await resolveAssignableUserIds(assign_user_ids);
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
  const dow = Number(day_of_week);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6 || !String(topic || '').trim()) {
    return res.status(400).json({ error: 'Thiếu hoặc sai ngày trong tuần (0–6) / chủ đề' });
  }
  const result = await query(
    'INSERT INTO content_topics (page_id, day_of_week, topic, post_time, is_active) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, dow, String(topic).trim(), post_time, is_active]
  );
  res.status(201).json({ id: result.insertId, page_id: req.params.id, day_of_week: dow, topic: String(topic).trim(), post_time, is_active });
}));

router.post('/:id/composio/sync', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const { synced, tokenExpiresAt } = await applyComposioSyncToPage(req.params.id);
  res.json({
    message: 'Đã đồng bộ token Composio',
    page_name: synced.name,
    token_expires_at: tokenExpiresAt,
    composio_page_token_preview: tokenPreview(synced.composio_page_token),
    composio_token_status: synced.composio_token_status,
    composio_token_expires_at: synced.composio_token_expires_at,
    token_source: synced.token_source,
  });
}));

router.put('/:id/token', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const { page_token } = req.body;
  if (!page_token) return res.status(400).json({ error: 'page_token is required' });
  const page = (await query('SELECT page_id FROM fb_pages WHERE id = ?', [req.params.id]))[0];
  if (!page) return res.status(404).json({ error: 'Page not found' });
  await verifyFacebookToken(page.page_id, page_token);
  const inspected = await inspectFacebookToken(page_token);
  const manualExpiresAt = inspected?.expiresAt || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const manualStatus = inspected
    ? (inspected.isValid ? computeTokenStatus(manualExpiresAt) : 'expired')
    : 'valid';
  await query(
    `UPDATE fb_pages SET page_token = ?, manual_token_expires_at = ?, manual_token_status = ?,
         token_expires_at = ?, token_status = ?, token_source = 'manual' WHERE id = ?`,
    [page_token, manualExpiresAt, manualStatus, manualExpiresAt, manualStatus, req.params.id]
  );
  res.json({ message: 'Token updated' });
}));

router.post('/:id/verify-token', authenticate, canManagePages, asyncHandler(async (req, res) => {
  await assertPageAccess(req.user, req.params.id);
  const page = (await query(
    `SELECT page_id, page_token, composio_page_token, name, token_source,
            composio_user_id, composio_connected_account_id
     FROM fb_pages WHERE id = ?`,
    [req.params.id]
  ))[0];
  if (!page) return res.status(404).json({ error: 'Page not found' });
  try {
    const results = [];
    if (hasManualPageToken(page)) {
      const fb = await verifyFacebookToken(page.page_id, page.page_token);
      results.push({ source: 'manual', ok: true, fb_name: fb.name });
    }
    if (hasComposioPageToken(page) || isComposioConfigured()) {
      await applyComposioSyncToPage(req.params.id);
      const refreshed = (await query(
        'SELECT composio_page_token, token_source FROM fb_pages WHERE id = ?',
        [req.params.id]
      ))[0];
      const fb = await verifyFacebookToken(page.page_id, refreshed.composio_page_token);
      results.push({ source: 'composio', ok: true, fb_name: fb.name, token_source: refreshed.token_source });
    }
    await query('UPDATE fb_pages SET token_status = ? WHERE id = ?', ['valid', req.params.id]);
    res.json({
      ok: true,
      message: 'Token hợp lệ',
      active_source: getActiveTokenSource(page),
      tokens: results,
      matches_configured_page: results.every((r) => r.ok),
    });
  } catch (error) {
    await query('UPDATE fb_pages SET token_status = ? WHERE id = ?', ['expired', req.params.id]);
    res.status(400).json({ ok: false, error: error.message });
  }
}));

export default router;
