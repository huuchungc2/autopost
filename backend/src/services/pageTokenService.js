import { query } from '../db.js';

export function hasManualPageToken(pageRow) {
  return !!String(pageRow?.page_token || '').trim();
}

export function hasComposioPageToken(pageRow) {
  return !!String(pageRow?.composio_page_token || '').trim();
}

export function getTokenBySource(pageRow, source) {
  if (source === 'composio') return String(pageRow?.composio_page_token || '').trim();
  return String(pageRow?.page_token || '').trim();
}

export function getActiveTokenSource(pageRow) {
  const source = pageRow?.token_source === 'composio' ? 'composio' : 'manual';
  if (source === 'composio' && hasComposioPageToken(pageRow)) return 'composio';
  if (hasManualPageToken(pageRow)) return 'manual';
  if (hasComposioPageToken(pageRow)) return 'composio';
  return source;
}

export function getActivePageToken(pageRow) {
  return getTokenBySource(pageRow, getActiveTokenSource(pageRow));
}

export function getAlternateTokenSource(currentSource) {
  return currentSource === 'composio' ? 'manual' : 'composio';
}

export function tokenPreview(token) {
  const value = String(token || '').trim();
  if (!value) return null;
  if (value.length <= 16) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export async function loadPageTokenRow(internalPageId) {
  const rows = await query(
    `SELECT id, page_id, page_token, composio_page_token, token_source,
            composio_user_id, composio_connected_account_id, token_status,
            manual_token_status, composio_token_status,
            manual_token_expires_at, composio_token_expires_at
     FROM fb_pages WHERE id = ?`,
    [internalPageId]
  );
  return rows[0] || null;
}

export async function switchActiveTokenSource(internalPageId, newSource) {
  const source = newSource === 'composio' ? 'composio' : 'manual';
  await query(
    'UPDATE fb_pages SET token_source = ?, token_status = ? WHERE id = ?',
    [source, 'valid', internalPageId]
  );
  return source;
}

export function resolveInitialActiveSource({ manualToken, composioToken }) {
  if (manualToken?.trim()) return 'manual';
  if (composioToken?.trim()) return 'composio';
  return 'manual';
}
