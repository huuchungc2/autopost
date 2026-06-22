import { query } from '../db.js';
import { inspectFacebookToken, verifyFacebookToken } from './fbService.js';
import { isComposioConfigured, syncComposioPageTokenForPage } from './composioService.js';
import {
  getActiveTokenSource,
  hasComposioPageToken,
  hasManualPageToken,
} from './pageTokenService.js';

export const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function computeTokenStatus(expiresAt, now = Date.now()) {
  if (!expiresAt) return 'unknown';
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return 'unknown';
  if (expires <= now) return 'expired';
  if (expires - now <= EXPIRING_SOON_MS) return 'expiring';
  return 'valid';
}

export function isTokenInvalid(status) {
  return status === 'expired';
}

export function syncSummaryTokenFields(pageRow) {
  const activeSource = getActiveTokenSource(pageRow);
  if (activeSource === 'composio') {
    return {
      token_status: pageRow.composio_token_status || computeTokenStatus(pageRow.composio_token_expires_at),
      token_expires_at: pageRow.composio_token_expires_at || null,
    };
  }
  return {
    token_status: pageRow.manual_token_status || computeTokenStatus(pageRow.manual_token_expires_at),
    token_expires_at: pageRow.manual_token_expires_at || null,
  };
}

async function inspectStoredToken(pageId, token) {
  if (!token?.trim()) {
    return { status: 'unknown', expiresAt: null, valid: false };
  }
  const inspected = await inspectFacebookToken(token);
  if (inspected) {
    return {
      status: inspected.isValid ? computeTokenStatus(inspected.expiresAt) : 'expired',
      expiresAt: inspected.expiresAt,
      valid: inspected.isValid,
    };
  }
  try {
    await verifyFacebookToken(pageId, token);
    return { status: 'valid', expiresAt: null, valid: true };
  } catch {
    return { status: 'expired', expiresAt: null, valid: false };
  }
}

export async function persistPageTokenHealth(internalPageId, {
  manualStatus,
  manualExpiresAt,
  composioStatus,
  composioExpiresAt,
}) {
  const rows = await query(
    `SELECT token_source, page_token, composio_page_token,
            manual_token_status, manual_token_expires_at,
            composio_token_status, composio_token_expires_at
     FROM fb_pages WHERE id = ?`,
    [internalPageId]
  );
  const page = rows[0];
  if (!page) return null;

  const next = {
    manual_token_status: manualStatus ?? page.manual_token_status ?? 'unknown',
    manual_token_expires_at: manualExpiresAt !== undefined ? manualExpiresAt : page.manual_token_expires_at,
    composio_token_status: composioStatus ?? page.composio_token_status ?? 'unknown',
    composio_token_expires_at: composioExpiresAt !== undefined ? composioExpiresAt : page.composio_token_expires_at,
  };
  const summary = syncSummaryTokenFields({ ...page, ...next });

  await query(
    `UPDATE fb_pages
     SET manual_token_status = ?, manual_token_expires_at = ?,
         composio_token_status = ?, composio_token_expires_at = ?,
         token_status = ?, token_expires_at = ?
     WHERE id = ?`,
    [
      next.manual_token_status,
      next.manual_token_expires_at,
      next.composio_token_status,
      next.composio_token_expires_at,
      summary.token_status,
      summary.token_expires_at,
      internalPageId,
    ]
  );

  return { ...next, ...summary };
}

/** Chỉ kiểm tra hợp lệ qua Graph API — không gọi Composio sync. */
export async function checkAndPersistPageTokenHealth(pageRow) {
  const manual = hasManualPageToken(pageRow)
    ? await inspectStoredToken(pageRow.page_id, pageRow.page_token)
    : { status: 'unknown', expiresAt: null, valid: false };

  const composio = hasComposioPageToken(pageRow)
    ? await inspectStoredToken(pageRow.page_id, pageRow.composio_page_token)
    : { status: 'unknown', expiresAt: null, valid: false };

  return persistPageTokenHealth(pageRow.id, {
    manualStatus: manual.status,
    manualExpiresAt: manual.expiresAt,
    composioStatus: composio.status,
    composioExpiresAt: composio.expiresAt,
  });
}

/** Chỉ refresh Composio khi token đã **hết hạn / không hợp lệ** — không refresh sớm. */
export function composioNeedsRefreshAfterInvalidCheck(pageRow) {
  if (!isComposioConfigured()) return false;
  if (!hasComposioPageToken(pageRow)
    && !pageRow.composio_connected_account_id
    && !pageRow.composio_user_id) {
    return false;
  }
  return isTokenInvalid(pageRow.composio_token_status);
}

export async function refreshComposioTokenIfInvalid(internalPageId, pageRow) {
  if (!composioNeedsRefreshAfterInvalidCheck(pageRow)) {
    return { refreshed: false };
  }
  await syncComposioPageTokenForPage(internalPageId);
  return { refreshed: true };
}

/** Trước đăng bài: chỉ kiểm tra trạng thái token, không refresh sớm. */
export async function validateTokensBeforePublish(internalPageId) {
  const rows = await query(
    `SELECT id, page_id, page_token, composio_page_token, token_source,
            composio_user_id, composio_connected_account_id,
            manual_token_status, manual_token_expires_at,
            composio_token_status, composio_token_expires_at
     FROM fb_pages WHERE id = ?`,
    [internalPageId]
  );
  const page = rows[0];
  if (!page) return null;

  await checkAndPersistPageTokenHealth(page);

  return query(
    `SELECT id, page_id, page_token, composio_page_token, token_source,
            composio_user_id, composio_connected_account_id,
            manual_token_status, manual_token_expires_at,
            composio_token_status, composio_token_expires_at, token_status
     FROM fb_pages WHERE id = ?`,
    [internalPageId]
  ).then((r) => r[0] || null);
}

export async function checkAllPageTokens(queryFn) {
  const pages = await queryFn(
    `SELECT id, page_id, name, page_token, composio_page_token, token_source,
            composio_user_id, composio_connected_account_id,
            manual_token_status, manual_token_expires_at,
            composio_token_status, composio_token_expires_at, token_status
     FROM fb_pages WHERE is_active = true`
  );

  const results = [];
  for (const page of pages) {
    const prevManualStatus = page.manual_token_status;
    const prevComposioStatus = page.composio_token_status;
    try {
      const health = await checkAndPersistPageTokenHealth(page);
      let composioRefreshed = false;
      const merged = { ...page, ...health };
      if (composioNeedsRefreshAfterInvalidCheck(merged)) {
        await syncComposioPageTokenForPage(page.id);
        composioRefreshed = true;
      }
      results.push({
        id: page.id,
        name: page.name,
        ok: true,
        composioRefreshed,
        health,
        prevManualStatus,
        prevComposioStatus,
      });
    } catch (error) {
      results.push({ id: page.id, name: page.name, ok: false, error: error.message });
    }
  }
  return results;
}
