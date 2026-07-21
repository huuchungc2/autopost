import { query } from '../db.js';

// Phân quyền website (blog) theo user — mirror pageAccessService (user_pages). super_admin thấy tất cả;
// user khác chỉ thấy website được gán trong bảng user_websites (migration 049).
// KHÔNG import pageAccessService ở đây để tránh vòng lặp import (pageAccessService dùng ngược file này
// trong assertPostAccess).

export function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

export async function getAssignedWebsiteIds(userId) {
  try {
    const rows = await query('SELECT website_id FROM user_websites WHERE user_id = ?', [userId]);
    return rows.map((row) => Number(row.website_id)).filter((id) => Number.isFinite(id));
  } catch (error) {
    // Bảng chưa tạo (migration chưa chạy) → coi như chưa gán gì, không làm chết request.
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

/** null = mọi website (super_admin); [] = không có website nào */
export async function getAccessibleWebsiteIds(user) {
  if (isSuperAdmin(user)) return null;
  return getAssignedWebsiteIds(user.id);
}

export async function assertWebsiteAccess(user, websiteId) {
  if (isSuperAdmin(user)) return;
  const ids = await getAssignedWebsiteIds(user.id);
  if (!ids.some((id) => id === Number(websiteId))) {
    const error = new Error('Forbidden: no access to this website');
    error.status = 403;
    throw error;
  }
}

/** Mảnh WHERE lọc theo website được phép — cùng contract với pageIdInClause(). */
export function websiteIdInClause(accessibleIds, column = 'id') {
  if (accessibleIds === null) return { clause: '', params: [] };
  if (!accessibleIds.length) return { clause: ' AND 1=0', params: [] };
  const placeholders = accessibleIds.map(() => '?').join(', ');
  return { clause: ` AND ${column} IN (${placeholders})`, params: accessibleIds };
}

function normalizeWebsiteIds(websiteIds) {
  if (!Array.isArray(websiteIds)) return [];
  return [...new Set(websiteIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

export async function getUserWebsites(userId) {
  try {
    return await query(
      `SELECT w.id, w.name, w.domain
       FROM user_websites uw JOIN websites w ON w.id = uw.website_id
       WHERE uw.user_id = ? ORDER BY w.name`,
      [userId]
    );
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

/** Gán 1 website cho user (dùng khi admin vừa TẠO website — không gán thì họ mất quyền xem chính nó). */
export async function assignWebsiteToUser(user, websiteId) {
  if (!user || isSuperAdmin(user)) return; // super_admin thấy tất cả, không cần gán
  const id = Number(websiteId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    await query(
      'INSERT IGNORE INTO user_websites (user_id, website_id) VALUES (?, ?)',
      [user.id, id]
    );
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return; // migration chưa chạy — bỏ qua êm
    throw error;
  }
}

export async function setUserWebsites(userId, websiteIds) {
  const ids = normalizeWebsiteIds(websiteIds);
  try {
    await query('DELETE FROM user_websites WHERE user_id = ?', [userId]);
    for (const websiteId of ids) {
      await query(
        'INSERT IGNORE INTO user_websites (user_id, website_id) VALUES (?, ?)',
        [userId, websiteId]
      );
    }
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Bảng user_websites chưa tồn tại — restart backend để tự tạo bảng');
      err.status = 503;
      throw err;
    }
    throw error;
  }
  return ids;
}
