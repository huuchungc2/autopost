import { query } from '../db.js';
import { assertWebsiteAccess } from './websiteAccessService.js';

export function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

export async function getAssignedPageIds(userId) {
  try {
    const rows = await query('SELECT page_id FROM user_pages WHERE user_id = ?', [userId]);
    return rows.map((row) => Number(row.page_id)).filter((id) => Number.isFinite(id));
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

function normalizePageIds(pageIds) {
  if (!Array.isArray(pageIds)) return [];
  return [...new Set(pageIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

/** null = all pages (super_admin); [] = none */
export async function getAccessiblePageIds(user) {
  if (isSuperAdmin(user)) return null;
  return getAssignedPageIds(user.id);
}

export async function assertPageAccess(user, pageId) {
  if (isSuperAdmin(user)) return;
  const ids = await getAssignedPageIds(user.id);
  const targetId = Number(pageId);
  if (!ids.some((id) => id === targetId)) {
    const error = new Error('Forbidden: no access to this page');
    error.status = 403;
    throw error;
  }
}

export async function assertPostAccess(user, postId) {
  const rows = await query('SELECT * FROM posts WHERE id = ?', [postId]);
  const post = rows[0];
  if (!post) {
    const error = new Error('Post not found');
    error.status = 404;
    throw error;
  }
  // Bài platform='website' gắn website_id (không page_id) — phân quyền theo bảng user_websites
  // (migration 049). Bài chưa gắn website_id nào thì chỉ super_admin đụng được (không có gì để đối
  // chiếu quyền). Trước đây mọi user đăng nhập đều qua được vì chưa có bảng phân quyền website.
  if (post.platform === 'website') {
    if (isSuperAdmin(user)) return post;
    if (!post.website_id) {
      const error = new Error('Forbidden: no access to this post');
      error.status = 403;
      throw error;
    }
    await assertWebsiteAccess(user, post.website_id);
    return post;
  }
  await assertPageAccess(user, post.page_id);
  return post;
}

export function pageIdInClause(accessibleIds, column = 'id') {
  if (accessibleIds === null) return { clause: '', params: [] };
  if (!accessibleIds.length) return { clause: ' AND 1=0', params: [] };
  const placeholders = accessibleIds.map(() => '?').join(', ');
  return { clause: ` AND ${column} IN (${placeholders})`, params: accessibleIds };
}

export async function assignPageToUser(userId, pageId) {
  try {
    await query(
      'INSERT IGNORE INTO user_pages (user_id, page_id) VALUES (?, ?)',
      [userId, Number(pageId)]
    );
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Bảng user_pages chưa tồn tại — restart backend để tự tạo bảng');
      err.status = 503;
      throw err;
    }
    throw error;
  }
}

export async function assignPageToUsers(pageId, userIds) {
  const uniqueUserIds = [...new Set(
    (userIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  )];
  for (const userId of uniqueUserIds) {
    await assignPageToUser(userId, pageId);
  }
  return uniqueUserIds;
}

export async function setUserPages(userId, pageIds) {
  try {
    await query('DELETE FROM user_pages WHERE user_id = ?', [userId]);
    const unique = normalizePageIds(pageIds);
    for (const pageId of unique) {
      await query('INSERT INTO user_pages (user_id, page_id) VALUES (?, ?)', [userId, pageId]);
    }
    return unique;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Bảng user_pages chưa tồn tại — restart backend để tự tạo bảng');
      err.status = 503;
      throw err;
    }
    throw error;
  }
}

export async function getUserPages(userId) {
  try {
    return await query(
      `SELECT fp.id, fp.name, fp.page_id, fp.token_status, fp.is_active
       FROM user_pages up
       JOIN fb_pages fp ON fp.id = up.page_id
       WHERE up.user_id = ?
       ORDER BY fp.name ASC`,
      [userId]
    );
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw error;
  }
}

export async function getPageAssignedUserIds(pageId) {
  try {
    const rows = await query('SELECT user_id FROM user_pages WHERE page_id = ?', [Number(pageId)]);
    return rows.map((row) => Number(row.user_id)).filter((id) => Number.isFinite(id) && id > 0);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

export async function setPageAssignedUsers(pageId, userIds) {
  const pid = Number(pageId);
  const uniqueUserIds = [...new Set(
    (userIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  )];
  try {
    await query('DELETE FROM user_pages WHERE page_id = ?', [pid]);
    for (const userId of uniqueUserIds) {
      await query('INSERT INTO user_pages (user_id, page_id) VALUES (?, ?)', [userId, pid]);
    }
    return uniqueUserIds;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      const err = new Error('Bảng user_pages chưa tồn tại — restart backend để tự tạo bảng');
      err.status = 503;
      throw err;
    }
    throw error;
  }
}
