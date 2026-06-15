import { query } from '../db.js';
import { isSuperAdmin } from './pageAccessService.js';

export async function getAssignedProviderIds(userId) {
  const rows = await query('SELECT provider_id FROM user_providers WHERE user_id = ?', [userId]);
  return rows.map((row) => row.provider_id);
}

/** null = all providers (super_admin) */
export async function getAccessibleProviderIds(user) {
  if (isSuperAdmin(user)) return null;
  const assigned = await getAssignedProviderIds(user.id);
  const owned = await query('SELECT id FROM ai_providers WHERE user_id = ?', [user.id]);
  const ownedIds = owned.map((row) => row.id);
  return [...new Set([...assigned, ...ownedIds])];
}

export async function assertProviderAccess(user, providerId) {
  if (isSuperAdmin(user)) return;
  const ids = await getAccessibleProviderIds(user);
  if (!ids.includes(Number(providerId))) {
    const error = new Error('Forbidden: no access to this provider');
    error.status = 403;
    throw error;
  }
}

export function providerIdInClause(accessibleIds, column = 'ai_providers.id') {
  if (accessibleIds === null) return { clause: '', params: [] };
  if (!accessibleIds.length) return { clause: ' AND 1=0', params: [] };
  const placeholders = accessibleIds.map(() => '?').join(', ');
  return { clause: ` AND ${column} IN (${placeholders})`, params: accessibleIds };
}

export async function setUserProviders(userId, providerIds) {
  await query('DELETE FROM user_providers WHERE user_id = ?', [userId]);
  const unique = [...new Set(providerIds.map(Number).filter(Boolean))];
  for (const providerId of unique) {
    await query('INSERT INTO user_providers (user_id, provider_id) VALUES (?, ?)', [userId, providerId]);
  }
  return unique;
}

export async function getUserProviders(userId) {
  return query(
    `SELECT ap.id, ap.name, ap.type, ap.model, ap.is_active
     FROM user_providers up
     JOIN ai_providers ap ON ap.id = up.provider_id
     WHERE up.user_id = ?
     ORDER BY ap.name ASC`,
    [userId]
  );
}

export async function linkProviderToUser(userId, providerId) {
  await query('INSERT IGNORE INTO user_providers (user_id, provider_id) VALUES (?, ?)', [userId, providerId]);
}
