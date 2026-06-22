import { postToFacebook } from './fbService.js';
import { isComposioAutoFallbackEnabled, isComposioConfigured, syncComposioPageTokenForPage } from './composioService.js';
import {
  isTokenInvalid,
  refreshComposioTokenIfInvalid,
  validateTokensBeforePublish,
} from './tokenHealthService.js';
import {
  getActiveTokenSource,
  getAlternateTokenSource,
  getTokenBySource,
  hasComposioPageToken,
  hasManualPageToken,
  loadPageTokenRow,
  switchActiveTokenSource,
} from './pageTokenService.js';

const TOKEN_ERROR_PATTERN = /token|session|oauth|expired|invalid.*access|error validating|190|102|200|permission/i;

export function isFacebookTokenError(error) {
  const msg = String(error?.message || error || '');
  return TOKEN_ERROR_PATTERN.test(msg);
}

async function tryPublish(payload) {
  return postToFacebook(payload);
}

/**
 * Đăng Facebook với token đang active; lỗi token → thử token còn lại (manual ↔ composio).
 * Nếu cần composio mà chưa có / hết hạn → sync từ Composio rồi thử lại.
 */
export async function publishToFacebookWithFallback({
  internalPageId,
  pageId,
  message,
  imageUrl,
  videoUrl,
  scheduledPublishTime,
  published = true,
}) {
  if (!internalPageId) {
    const error = new Error('Thiếu internalPageId để resolve token fanpage');
    error.status = 500;
    throw error;
  }

  let page = await loadPageTokenRow(internalPageId);
  if (!page) {
    const error = new Error('Fanpage không tồn tại');
    error.status = 404;
    throw error;
  }

  await validateTokensBeforePublish(internalPageId).catch(() => {});
  page = await loadPageTokenRow(internalPageId);

  const fbPageId = pageId || page.page_id;
  const basePayload = {
    pageId: fbPageId,
    message,
    imageUrl,
    videoUrl,
    scheduledPublishTime,
    published,
  };

  const attemptOrder = [];
  const activeSource = getActiveTokenSource(page);
  const alternateSource = getAlternateTokenSource(activeSource);
  attemptOrder.push(activeSource);
  if (isComposioAutoFallbackEnabled()) {
    if (getTokenBySource(page, alternateSource) || (alternateSource === 'composio' && isComposioConfigured())) {
      attemptOrder.push(alternateSource);
    }
  }

  let lastError = null;

  for (let i = 0; i < attemptOrder.length; i += 1) {
    const source = attemptOrder[i];
    let token = getTokenBySource(page, source);

    if (source === 'composio' && isComposioConfigured()) {
      if (!token) {
        try {
          await syncComposioPageTokenForPage(internalPageId);
          page = await loadPageTokenRow(internalPageId);
          token = getTokenBySource(page, 'composio');
        } catch {
          // thử token khác
        }
      } else if (isTokenInvalid(page.composio_token_status)) {
        try {
          await refreshComposioTokenIfInvalid(internalPageId, page);
          page = await loadPageTokenRow(internalPageId);
          token = getTokenBySource(page, 'composio');
        } catch {
          // thử token khác
        }
      }
    }

    if (!token) continue;

    try {
      const result = await tryPublish({ ...basePayload, pageToken: token });
      if (source !== getActiveTokenSource(page)) {
        await switchActiveTokenSource(internalPageId, source);
      }
      return result;
    } catch (error) {
      lastError = error;
      if (!isFacebookTokenError(error)) throw error;

      if (source === 'composio' && isComposioConfigured() && isFacebookTokenError(error)) {
        try {
          await syncComposioPageTokenForPage(internalPageId);
          page = await loadPageTokenRow(internalPageId);
          const retryToken = getTokenBySource(page, 'composio');
          if (retryToken) {
            const result = await tryPublish({ ...basePayload, pageToken: retryToken });
            await switchActiveTokenSource(internalPageId, 'composio');
            return result;
          }
        } catch {
          // thử token manual tiếp theo
        }
      }
    }
  }

  if (lastError) throw lastError;

  const error = new Error(
    !hasManualPageToken(page) && !hasComposioPageToken(page)
      ? 'Fanpage chưa có token — dán token thủ công hoặc đồng bộ Composio'
      : 'Không có token hợp lệ để đăng bài'
  );
  error.status = 400;
  throw error;
}
