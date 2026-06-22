import { Composio } from '@composio/core';
import { query } from '../db.js';
import {
  getEffectiveComposioApiKey,
  getEffectiveComposioAuthConfigId,
  getEffectiveComposioConnectedAccountId,
  getEffectiveComposioToolkitVersion,
  getEffectiveComposioUserId,
  getComposioSettingsStatus,
  isComposioConfiguredFromSettings,
} from './appSettingsService.js';
import { inspectFacebookToken } from './fbService.js';
import {
  computeTokenStatus,
  syncSummaryTokenFields,
} from './tokenHealthService.js';

const GET_PAGES_TOOL_SLUG = 'FACEBOOK_GET_USER_PAGES';

function getComposioClient() {
  const apiKey = getEffectiveComposioApiKey();
  if (!apiKey) {
    const error = new Error('Composio API key chưa cấu hình — vào Cài đặt → Composio');
    error.status = 400;
    throw error;
  }
  return new Composio({
    apiKey,
    toolkitVersions: { facebook: getEffectiveComposioToolkitVersion() },
  });
}

export function isComposioConfigured() {
  return isComposioConfiguredFromSettings();
}

export function getComposioDefaults() {
  return getComposioSettingsStatus();
}

function resolveComposioIds(overrides = {}) {
  const userId = overrides.composio_user_id?.trim() || getEffectiveComposioUserId();
  const connectedAccountId = overrides.composio_connected_account_id?.trim()
    || getEffectiveComposioConnectedAccountId();

  if (!userId || !connectedAccountId) {
    const error = new Error('Thiếu Composio user ID hoặc connected account ID');
    error.status = 400;
    throw error;
  }

  return { userId, connectedAccountId };
}

function unwrapToolPayload(result) {
  if (!result) return null;
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.data?.data)) return result.data.data;
  if (Array.isArray(result.data?.pages)) return result.data.pages;
  if (Array.isArray(result.pages)) return result.pages;
  if (Array.isArray(result.data?.items)) return result.data.items;
  return null;
}

function normalizePageEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = entry.id || entry.page_id || entry.pageId;
  const accessToken = entry.access_token || entry.accessToken || entry.page_access_token;
  if (!id || !accessToken) return null;
  const picture = entry.picture?.data?.url
    || entry.picture?.url
    || (typeof entry.picture === 'string' ? entry.picture : null);
  return {
    id: String(id),
    name: entry.name || null,
    access_token: String(accessToken),
    picture,
  };
}

function extractPagesFromToolResult(result) {
  const raw = unwrapToolPayload(result?.data)
    ?? unwrapToolPayload(result?.result)
    ?? unwrapToolPayload(result?.successful)
    ?? unwrapToolPayload(result);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePageEntry).filter(Boolean);
}

function formatComposioError(error) {
  const msg = error?.cause?.error?.error?.message
    || error?.cause?.message
    || error?.message
    || 'Composio error';
  if (/INITIATED/i.test(msg) || /ACTIVE state/i.test(msg)) {
    return 'Facebook trên Composio chưa ACTIVE — hoàn tất OAuth trên Composio Dashboard.';
  }
  return msg;
}

export async function getConnectedAccountStatus(connectedAccountId) {
  const composio = getComposioClient();
  const account = await composio.connectedAccounts.get(connectedAccountId);
  return {
    id: account.id,
    status: account.status,
    toolkit: account.toolkit?.slug || null,
    is_active: account.status === 'ACTIVE',
  };
}

export async function createComposioFacebookLink(userId) {
  const composio = getComposioClient();
  const authConfigId = getEffectiveComposioAuthConfigId();
  if (!authConfigId) {
    const error = new Error('Composio Auth Config ID chưa cấu hình');
    error.status = 400;
    throw error;
  }
  const uid = userId?.trim() || getEffectiveComposioUserId();
  if (!uid) {
    const error = new Error('Thiếu Composio user ID');
    error.status = 400;
    throw error;
  }
  const link = await composio.connectedAccounts.link(uid, authConfigId);
  return {
    connected_account_id: link.id,
    status: link.status,
    redirect_url: link.redirectUrl,
  };
}

async function ensureConnectedAccountActive(composio, connectedAccountId) {
  const account = await composio.connectedAccounts.get(connectedAccountId);
  if (account.status === 'ACTIVE') return account;

  try {
    await composio.connectedAccounts.refresh(connectedAccountId);
    const refreshed = await composio.connectedAccounts.get(connectedAccountId);
    if (refreshed.status === 'ACTIVE') return refreshed;
  } catch {
    // fall through
  }

  const error = new Error(
    `Composio connection ${connectedAccountId} đang "${account.status}" — cần ACTIVE.`
  );
  error.status = 400;
  throw error;
}

async function fetchPagesViaTool(composio, { userId, connectedAccountId }) {
  try {
    const result = await composio.tools.execute(GET_PAGES_TOOL_SLUG, {
      userId,
      connectedAccountId,
      arguments: {},
    });
    return extractPagesFromToolResult(result);
  } catch (error) {
    const wrapped = new Error(formatComposioError(error));
    wrapped.status = error?.status || error?.cause?.status || 400;
    throw wrapped;
  }
}

export async function fetchFacebookPageFromComposio(facebookPageId, overrides = {}) {
  const composio = getComposioClient();
  const { userId, connectedAccountId } = resolveComposioIds(overrides);

  await ensureConnectedAccountActive(composio, connectedAccountId);
  const pages = await fetchPagesViaTool(composio, { userId, connectedAccountId });
  const match = pages.find((page) => String(page.id) === String(facebookPageId));

  if (!match) {
    const available = pages.map((p) => `${p.name || p.id} (${p.id})`).join(', ');
    const error = new Error(
      available
        ? `Không tìm thấy Page ID ${facebookPageId} trong Composio. Có: ${available}`
        : `Không lấy được danh sách fanpage từ Composio`
    );
    error.status = 400;
    throw error;
  }

  return {
    page_token: match.access_token,
    name: match.name,
    avatar_url: match.picture,
    composio_user_id: userId,
    composio_connected_account_id: connectedAccountId,
  };
}

export async function syncComposioTokenForPage(pageRow) {
  return fetchFacebookPageFromComposio(pageRow.page_id, {
    composio_user_id: pageRow.composio_user_id,
    composio_connected_account_id: pageRow.composio_connected_account_id,
  });
}

export async function syncComposioPageTokenForPage(internalPageId) {
  const rows = await query(
    `SELECT id, page_id, name, page_token, composio_page_token, token_source,
            composio_user_id, composio_connected_account_id
     FROM fb_pages WHERE id = ?`,
    [internalPageId]
  );
  const page = rows[0];
  if (!page) {
    const error = new Error('Fanpage không tồn tại');
    error.status = 404;
    throw error;
  }

  const synced = await syncComposioTokenForPage(page);
  const inspected = await inspectFacebookToken(synced.page_token);
  const composioExpiresAt = inspected?.expiresAt
    || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const composioStatus = inspected
    ? (inspected.isValid ? computeTokenStatus(composioExpiresAt) : 'expired')
    : 'valid';
  const keepActiveSource = page.token_source === 'manual' && String(page.page_token || '').trim();
  const tokenSource = keepActiveSource ? 'manual' : 'composio';
  const summary = syncSummaryTokenFields({
    ...page,
    token_source: tokenSource,
    composio_token_status: composioStatus,
    composio_token_expires_at: composioExpiresAt,
  });

  await query(
    `UPDATE fb_pages
     SET composio_page_token = ?,
         composio_token_status = ?, composio_token_expires_at = ?,
         token_status = ?, token_expires_at = ?,
         token_source = ?,
         name = COALESCE(?, name),
         avatar_url = COALESCE(?, avatar_url),
         composio_user_id = ?, composio_connected_account_id = ?
     WHERE id = ?`,
    [
      synced.page_token,
      composioStatus,
      composioExpiresAt,
      summary.token_status,
      summary.token_expires_at,
      tokenSource,
      synced.name,
      synced.avatar_url,
      synced.composio_user_id,
      synced.composio_connected_account_id,
      internalPageId,
    ]
  );

  return {
    composio_page_token: synced.page_token,
    composio_token_expires_at: composioExpiresAt,
    composio_token_status: composioStatus,
    token_expires_at: summary.token_expires_at,
    page_id: page.page_id,
    name: synced.name || page.name,
    token_source: tokenSource,
  };
}

/** @deprecated use syncComposioPageTokenForPage */
export async function syncAndPersistPageTokenFromComposio(internalPageId) {
  const result = await syncComposioPageTokenForPage(internalPageId);
  return {
    page_token: result.composio_page_token,
    token_expires_at: result.token_expires_at,
    page_id: result.page_id,
    name: result.name,
  };
}

export async function syncAllComposioPages(queryFn) {
  const pages = await queryFn(
    `SELECT id, name, page_id, composio_user_id, composio_connected_account_id
     FROM fb_pages
     WHERE is_active = true
       AND (
         composio_page_token IS NOT NULL AND composio_page_token != ''
         OR composio_connected_account_id IS NOT NULL
         OR composio_user_id IS NOT NULL
       )`
  );

  const results = [];
  for (const page of pages) {
    try {
      await syncComposioPageTokenForPage(page.id);
      results.push({ id: page.id, name: page.name, ok: true });
    } catch (error) {
      results.push({ id: page.id, name: page.name, ok: false, error: error.message });
      await queryFn(
        `UPDATE fb_pages SET composio_token_status = 'expired', token_status = 'expired' WHERE id = ?`,
        [page.id]
      ).catch(() => {});
    }
  }
  return results;
}
