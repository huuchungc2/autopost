import crypto from 'crypto';
import { query } from '../db.js';

function parseLimit(value, fallback = 50, max = 200) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function parsePage(value) {
  const n = Number.parseInt(value, 10);
  return !Number.isFinite(n) || n < 1 ? 1 : n;
}

function parseCursorId(raw) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function draftEligibilitySql(alias = 'd') {
  return `((${alias}.user_id = ? AND ${alias}.is_shared = 0) OR ${alias}.is_shared = 1)`;
}

export async function getExtensionKeyInfo(userId) {
  const rows = await query(
    `SELECT api_key, fb_user_id, fb_user_name, created_at, updated_at
     FROM extension_api_keys WHERE user_id = ?`,
    [userId]
  );
  if (!rows[0]) return null;
  const key = rows[0].api_key;
  return {
    api_key: key,
    api_key_preview: key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key,
    fb_user_id: rows[0].fb_user_id,
    fb_user_name: rows[0].fb_user_name,
    created_at: rows[0].created_at,
    updated_at: rows[0].updated_at,
  };
}

export async function getOrCreateExtensionKey(userId) {
  const existing = await query(
    'SELECT api_key, fb_user_id, fb_user_name FROM extension_api_keys WHERE user_id = ?',
    [userId]
  );
  if (existing[0]) return existing[0];

  const apiKey = crypto.randomBytes(32).toString('hex');
  await query(
    'INSERT INTO extension_api_keys (user_id, api_key) VALUES (?, ?)',
    [userId, apiKey]
  );
  return { api_key: apiKey, fb_user_id: null, fb_user_name: null };
}

export async function regenerateExtensionKey(userId) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  const existing = await query('SELECT id FROM extension_api_keys WHERE user_id = ?', [userId]);
  if (existing[0]) {
    await query('UPDATE extension_api_keys SET api_key = ? WHERE user_id = ?', [apiKey, userId]);
  } else {
    await query('INSERT INTO extension_api_keys (user_id, api_key) VALUES (?, ?)', [userId, apiKey]);
  }
  return apiKey;
}

export async function updateExtensionFbProfile(userId, { fb_user_id, fb_user_name }) {
  await getOrCreateExtensionKey(userId);
  await query(
    'UPDATE extension_api_keys SET fb_user_id = ?, fb_user_name = ? WHERE user_id = ?',
    [fb_user_id || null, fb_user_name || null, userId]
  );
  return { fb_user_id, fb_user_name };
}

function toMysqlDatetime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// Bài mới nên "từ từ" xuất hiện với người khác thay vì lộ diện ngay lập tức (đỡ giống comment-ring
// bị FB soi, đúng tinh thần "từ từ mọi người thấy bài" — xem GET /cross-posts).
const VISIBLE_AFTER_MIN_MINUTES = 5;
const VISIBLE_AFTER_MAX_MINUTES = 60;
const DEFAULT_COMMENT_TARGET = 5;

function randomVisibleAfter(fromDate) {
  const base = fromDate instanceof Date && !isNaN(fromDate.getTime()) ? fromDate : new Date();
  const delayMin = VISIBLE_AFTER_MIN_MINUTES
    + Math.random() * (VISIBLE_AFTER_MAX_MINUTES - VISIBLE_AFTER_MIN_MINUTES);
  return new Date(base.getTime() + delayMin * 60_000);
}

// Flow 2 (đồng bộ sau khi đăng bài) — nguồn ghi DUY NHẤT cho user_posts, dùng chung bởi cả
// POST /group-posts/sync (JWT/api_key/license_key qua authenticateExtension) lẫn
// POST /user-sync/posts (license_key qua authenticateLicenseKey, routes/userSync.js) — trước bản
// gộp bảng 2 route này ghi 2 bảng khác nhau (group_posts / user_posts) cho cùng 1 sự kiện "vừa đăng
// bài", giờ khớp theo (user_account_id, group_id, post_id) — post_id (Facebook post id) mới là định
// danh thật của 1 bài, post_queue_id chỉ là id nội bộ máy client nên KHÔNG dùng để so khớp (nếu
// không sẽ tạo 2 dòng trùng cho cùng 1 bài thật khi 2 route trên đều được gọi).
export async function upsertUserPost(userAccountId, post) {
  const {
    group_id,
    group_name,
    post_id,
    fb_url,
    noi_dung,
    prompt_anh,
    ngay_dang,
    gio_dang,
    posted_at,
    post_queue_id,
  } = post;
  const fbUserId = post.posted_by || post.fb_user_id;

  if (!group_id || !post_id) return null;

  const existing = await query(
    'SELECT id FROM user_posts WHERE user_account_id = ? AND group_id = ? AND post_id = ?',
    [userAccountId, group_id, post_id]
  );
  const storedUrl = fb_url || `https://www.facebook.com/groups/${group_id}/posts/${post_id}/`;

  if (existing[0]) {
    await query(
      `UPDATE user_posts
       SET noi_dung = COALESCE(?, noi_dung), prompt_anh = COALESCE(?, prompt_anh),
           ngay_dang = COALESCE(?, ngay_dang), gio_dang = COALESCE(?, gio_dang),
           posted_at = COALESCE(?, posted_at), fb_user_id = COALESCE(?, fb_user_id),
           group_name = COALESCE(?, group_name), fb_url = COALESCE(fb_url, ?),
           post_queue_id = COALESCE(NULLIF(?, ''), post_queue_id)
       WHERE id = ?`,
      [
        noi_dung || null,
        prompt_anh || null,
        ngay_dang || null,
        gio_dang || null,
        toMysqlDatetime(posted_at),
        fbUserId || null,
        group_name || null,
        storedUrl,
        post_queue_id || '',
        existing[0].id,
      ]
    );
    return { id: existing[0].id, updated: true };
  }

  const postedAtDate = toMysqlDatetime(posted_at);
  const result = await query(
    `INSERT INTO user_posts
      (user_account_id, post_queue_id, group_id, group_name, post_id, fb_user_id, noi_dung, prompt_anh,
       posted_at, ngay_dang, gio_dang, fb_url, comment_target, comment_count, visible_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      userAccountId,
      post_queue_id || '',
      group_id,
      group_name || null,
      post_id,
      fbUserId || null,
      noi_dung || null,
      prompt_anh || null,
      postedAtDate,
      ngay_dang || null,
      gio_dang || null,
      storedUrl,
      DEFAULT_COMMENT_TARGET,
      toMysqlDatetime(randomVisibleAfter(postedAtDate ? new Date(postedAtDate) : new Date())),
    ]
  );
  return { id: result.insertId, updated: false };
}

export async function syncGroupPost(userId, body) {
  if (!body.group_id || !body.post_id) {
    const err = new Error('group_id và post_id là bắt buộc');
    err.status = 400;
    throw err;
  }
  if (!(body.posted_by || body.fb_user_id)) {
    const err = new Error('posted_by (fb_user_id) là bắt buộc');
    err.status = 400;
    throw err;
  }
  const res = await upsertUserPost(userId, body);
  return { success: true, id: String(res.id), updated: res.updated };
}

/** Extension: client gửi ID draft lớn nhất đang giữ — server trả còn bao nhiêu draft mới hơn.
 * (Phần "posts" cũ — pending_posts_sync/total_posts/pending_comments — đã bỏ cùng nhánh posts/pull
 * chết; giữ field rỗng/an toàn trong response để extension bản cũ chưa cập nhật không lỗi, chỉ tự
 * hiểu là "không còn gì cần pull" và ngưng gọi /posts/pull nữa.) */
export async function getExtensionSyncStatus(userId, {
  lastDraftId = 0,
} = {}) {
  const afterDraft = parseCursorId(lastDraftId);

  const [draftMaxRow] = await query(
    `SELECT MAX(d.id) AS max_id FROM group_post_drafts d WHERE ${draftEligibilitySql('d')}`,
    [userId]
  );
  const serverMaxDraftId = Number(draftMaxRow?.max_id) || 0;

  const draftRows = await query(
    `SELECT COUNT(*) AS pending_drafts FROM group_post_drafts d
     WHERE d.id > ? AND ${draftEligibilitySql('d')}`,
    [afterDraft, userId]
  );

  return {
    last_draft_id: afterDraft,
    server_max_draft_id: serverMaxDraftId,
    pending_drafts: Number(draftRows[0]?.pending_drafts) || 0,
    // Legacy — extension bản cũ (< v1.0.187) còn đọc các field này để quyết định có gọi
    // /posts/pull tiếp không; luôn báo "hết" để nhánh chết đó tự ngưng, không cần chờ user cập nhật.
    total_posts: 0,
    pending_posts_sync: 0,
    up_to_date: true,
  };
}

export async function listPublishedGroupPosts(filters = {}) {
  const page = parsePage(filters.page);
  const limit = parseLimit(filters.limit);
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (filters.group_id) {
    conditions.push('up.group_id = ?');
    params.push(filters.group_id);
  }
  if (filters.user_id) {
    conditions.push('up.user_account_id = ?');
    params.push(filters.user_id);
  }
  if (filters.posted_by) {
    conditions.push('up.fb_user_id = ?');
    params.push(filters.posted_by);
  }
  if (filters.from_date) {
    conditions.push('up.posted_at >= ?');
    params.push(`${filters.from_date} 00:00:00`);
  }
  if (filters.to_date) {
    conditions.push('up.posted_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.to_date);
  }
  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    conditions.push('(up.noi_dung LIKE ? OR u.name LIKE ? OR up.group_id LIKE ? OR up.group_name LIKE ? OR up.post_id LIKE ?)');
    params.push(term, term, term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM user_posts up
     JOIN users u ON u.id = up.user_account_id
     ${where}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const rows = await query(
    `SELECT up.*, u.name AS poster_name
     FROM user_posts up
     JOIN users u ON u.id = up.user_account_id
     ${where}
     ORDER BY up.posted_at DESC, up.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    data: rows.map((r) => ({
      id: String(r.id),
      group_id: r.group_id,
      group_name: r.group_name,
      post_id: r.post_id,
      noi_dung: r.noi_dung,
      prompt_anh: r.prompt_anh,
      posted_by: r.fb_user_id,
      poster_name: r.poster_name,
      user_id: r.user_account_id,
      posted_at: r.posted_at,
      ngay_dang: r.ngay_dang,
      gio_dang: r.gio_dang,
      comment_count: Number(r.comment_count) || 0,
      comment_target: Number(r.comment_target) || 0,
      fb_url: r.fb_url || `https://www.facebook.com/groups/${r.group_id}/posts/${r.post_id}/`,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
}

export async function createGroupPostDrafts(userId, rows, options = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('Danh sách bài trống');
    err.status = 400;
    throw err;
  }

  const isShared = Boolean(options.isShared);
  const ids = [];
  for (const row of rows) {
    const noi_dung = String(row.noi_dung || '').trim();
    if (!noi_dung) continue;
    const result = await query(
      `INSERT INTO group_post_drafts (user_id, is_shared, noi_dung, prompt_anh, ngay_dang, gio_dang)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        isShared ? 1 : 0,
        noi_dung,
        row.prompt_anh || null,
        row.ngay_dang || null,
        row.gio_dang || null,
      ]
    );
    ids.push(result.insertId);
  }

  if (!ids.length) {
    const err = new Error('Không có dòng hợp lệ');
    err.status = 400;
    throw err;
  }

  return { success: true, created_count: ids.length, ids: ids.map(String), is_shared: isShared };
}

function draftEffectiveStatus(row) {
  if (row.is_shared) return row.my_pull_user_id ? 'pulled' : 'pending';
  return row.status;
}

function mapDraftRow(row) {
  const effectiveStatus = draftEffectiveStatus(row);
  return {
    id: String(row.id),
    user_id: row.user_id,
    creator_name: row.creator_name,
    is_shared: Boolean(row.is_shared),
    noi_dung: row.noi_dung,
    prompt_anh: row.prompt_anh,
    ngay_dang: row.ngay_dang,
    gio_dang: row.gio_dang,
    status: effectiveStatus,
    raw_status: row.status,
    pulled_at: row.my_pulled_at || row.pulled_at || null,
    pull_count: Number(row.pull_count) || 0,
    created_at: row.created_at,
    can_edit: Boolean(row.can_edit),
    can_repull: Boolean(row.can_repull),
    can_delete: Boolean(row.can_delete),
  };
}

export async function listGroupPostDrafts(userId, filters = {}, userRole = 'editor') {
  const page = parsePage(filters.page);
  const limit = parseLimit(filters.limit);
  const offset = (page - 1) * limit;
  const status = filters.status === 'pulled' ? 'pulled' : filters.status === 'all' ? null : 'pending';
  const scope = filters.scope === 'team' && ['super_admin', 'admin'].includes(userRole) ? 'team' : 'mine';
  const isAdmin = ['super_admin', 'admin'].includes(userRole);

  let countSql;
  let listSql;
  let countParams;
  let listParams;

  if (scope === 'team') {
    const conditions = ['d.is_shared = 0'];
    const params = [];
    if (status === 'pending') {
      conditions.push("d.status = 'pending'");
    } else if (status === 'pulled') {
      conditions.push("d.status = 'pulled'");
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    countSql = `SELECT COUNT(*) AS total FROM group_post_drafts d ${where}`;
    countParams = params;
    listSql = `SELECT d.id, d.user_id, d.is_shared, d.noi_dung, d.prompt_anh, d.ngay_dang, d.gio_dang,
            d.status, d.pulled_at, d.created_at,
            u.name AS creator_name,
            NULL AS my_pull_user_id,
            NULL AS my_pulled_at,
            0 AS pull_count
     FROM group_post_drafts d
     JOIN users u ON u.id = d.user_id
     ${where}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`;
    listParams = [...params, limit, offset];
  } else {
    const conditions = [];
    const params = [userId];
    conditions.push('((d.user_id = ? AND d.is_shared = 0) OR d.is_shared = 1)');
    params.push(userId);

    if (status === 'pending') {
      conditions.push(`(
      (d.is_shared = 0 AND d.status = 'pending')
      OR (d.is_shared = 1 AND p.user_id IS NULL)
    )`);
    } else if (status === 'pulled') {
      conditions.push(`(
      (d.is_shared = 0 AND d.status = 'pulled')
      OR (d.is_shared = 1 AND p.user_id IS NOT NULL)
    )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    countSql = `SELECT COUNT(*) AS total
     FROM group_post_drafts d
     LEFT JOIN group_post_draft_pulls p ON p.draft_id = d.id AND p.user_id = ?
     ${where}`;
    countParams = params;
    listSql = `SELECT d.id, d.user_id, d.is_shared, d.noi_dung, d.prompt_anh, d.ngay_dang, d.gio_dang,
            d.status, d.pulled_at, d.created_at,
            u.name AS creator_name,
            p.user_id AS my_pull_user_id,
            p.pulled_at AS my_pulled_at,
            (SELECT COUNT(*) FROM group_post_draft_pulls gpdp WHERE gpdp.draft_id = d.id) AS pull_count
     FROM group_post_drafts d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN group_post_draft_pulls p ON p.draft_id = d.id AND p.user_id = ?
     ${where}
     ORDER BY d.created_at DESC
     LIMIT ? OFFSET ?`;
    listParams = [...params, limit, offset];
  }

  const countRows = await query(countSql, countParams);
  const total = countRows[0]?.total || 0;

  const rows = await query(listSql, listParams);

  return {
    data: rows.map((row) => mapDraftRow({
      ...row,
      can_edit: scope === 'team'
        ? false
        : (row.is_shared ? isAdmin : (row.user_id === userId && row.status === 'pending')),
      can_repull: scope === 'team'
        ? false
        : (row.is_shared
          ? Boolean(row.my_pull_user_id)
          : (row.user_id === userId && row.status === 'pulled')),
      can_delete: scope === 'team'
        ? isAdmin
        : (row.is_shared
          ? isAdmin || row.user_id === userId
          : (row.user_id === userId && row.status === 'pending')),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    scope,
  };
}

/** Extension: pull draft có id > after_draft_id */
export async function pullDraftsForExtension(userId, { limit: rawLimit, afterDraftId = 0 } = {}) {
  const afterDraft = parseCursorId(afterDraftId);
  const limit = parseLimit(rawLimit, 20, 30);

  const rows = await query(
    `SELECT d.id, d.is_shared, d.noi_dung, d.prompt_anh, d.ngay_dang, d.gio_dang, d.created_at
     FROM group_post_drafts d
     WHERE d.id > ? AND ${draftEligibilitySql('d')}
     ORDER BY d.id ASC
     LIMIT ?`,
    [afterDraft, userId, limit]
  );

  const remainRows = await query(
    `SELECT COUNT(*) AS n FROM group_post_drafts d
     WHERE d.id > ? AND ${draftEligibilitySql('d')}`,
    [afterDraft, userId]
  );
  const pendingBefore = Number(remainRows[0]?.n) || 0;

  return {
    data: rows.map((r) => ({
      id: String(r.id),
      noi_dung: r.noi_dung,
      prompt_anh: r.prompt_anh,
      ngay_dang: r.ngay_dang,
      gio_dang: r.gio_dang,
      created_at: r.created_at,
      is_shared: Boolean(r.is_shared),
    })),
    pulled_count: rows.length,
    pending_remaining: Math.max(0, pendingBefore - rows.length),
    after_draft_id: afterDraft,
  };
}

export async function listGroupPostComments(postId) {
  const posts = await query('SELECT id FROM user_posts WHERE id = ?', [postId]);
  if (!posts[0]) {
    const err = new Error('Bài đăng không tồn tại');
    err.status = 404;
    throw err;
  }

  const rows = await query(
    `SELECT upc.id, upc.commenter_user_id, upc.commenter_fb_user_id, upc.commented_at,
            u.name AS commenter_name
     FROM user_post_comments upc
     JOIN users u ON u.id = upc.commenter_user_id
     WHERE upc.user_post_id = ?
     ORDER BY upc.commented_at DESC`,
    [postId]
  );

  return {
    data: rows.map((r) => ({
      id: String(r.id),
      commenter_user_id: r.commenter_user_id,
      commenter_name: r.commenter_name,
      commenter_fb_user_id: r.commenter_fb_user_id,
      commented_at: r.commented_at,
    })),
  };
}

export async function getGroupPostsStats(userId) {
  const [postsRow] = await query('SELECT COUNT(*) AS total FROM user_posts');
  const [weekRow] = await query(
    `SELECT COUNT(*) AS total FROM user_posts
     WHERE posted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
  );
  const [commentsRow] = await query('SELECT COUNT(*) AS total FROM user_post_comments');
  const [draftsRow] = await query(
    `SELECT COUNT(*) AS total FROM group_post_drafts d
     LEFT JOIN group_post_draft_pulls p ON p.draft_id = d.id AND p.user_id = ?
     WHERE (d.user_id = ? AND d.is_shared = 0 AND d.status = 'pending')
        OR (d.is_shared = 1 AND p.user_id IS NULL)`,
    [userId, userId]
  );
  const [sharedRow] = await query(
    `SELECT COUNT(*) AS total FROM group_post_drafts
     WHERE is_shared = 1`
  );

  return {
    total_posts: Number(postsRow?.total) || 0,
    posts_last_7_days: Number(weekRow?.total) || 0,
    total_comments: Number(commentsRow?.total) || 0,
    my_pending_drafts: Number(draftsRow?.total) || 0,
    shared_drafts_total: Number(sharedRow?.total) || 0,
  };
}

export async function updateGroupPostDraft(userId, userRole, draftId, body) {
  const rows = await query(
    'SELECT id, user_id, is_shared, status FROM group_post_drafts WHERE id = ?',
    [draftId]
  );
  const draft = rows[0];
  if (!draft) {
    const err = new Error('Draft không tồn tại');
    err.status = 404;
    throw err;
  }

  const isAdmin = ['super_admin', 'admin'].includes(userRole);
  if (draft.is_shared) {
    if (!isAdmin) {
      const err = new Error('Chỉ admin mới sửa draft chia sẻ');
      err.status = 403;
      throw err;
    }
  } else if (draft.user_id !== userId || draft.status !== 'pending') {
    const err = new Error('Chỉ sửa được draft cá nhân đang chờ tải');
    err.status = 403;
    throw err;
  }

  const noi_dung = String(body.noi_dung ?? '').trim();
  if (!noi_dung) {
    const err = new Error('Nội dung không được trống');
    err.status = 400;
    throw err;
  }

  await query(
    `UPDATE group_post_drafts
     SET noi_dung = ?, prompt_anh = ?, ngay_dang = ?, gio_dang = ?
     WHERE id = ?`,
    [
      noi_dung,
      body.prompt_anh || null,
      body.ngay_dang || null,
      body.gio_dang || null,
      draftId,
    ]
  );

  return { success: true };
}

export async function repullGroupPostDraft(userId, draftId) {
  const rows = await query(
    'SELECT id, user_id, is_shared, status FROM group_post_drafts WHERE id = ?',
    [draftId]
  );
  const draft = rows[0];
  if (!draft) {
    const err = new Error('Draft không tồn tại');
    err.status = 404;
    throw err;
  }

  if (draft.is_shared) {
    const result = await query(
      'DELETE FROM group_post_draft_pulls WHERE draft_id = ? AND user_id = ?',
      [draftId, userId]
    );
    if (!result.affectedRows) {
      const err = new Error('Bạn chưa tải draft chia sẻ này');
      err.status = 400;
      throw err;
    }
    return { success: true, mode: 'shared' };
  }

  if (draft.user_id !== userId || draft.status !== 'pulled') {
    const err = new Error('Chỉ re-pull draft cá nhân đã tải');
    err.status = 400;
    throw err;
  }

  await query(
    `UPDATE group_post_drafts SET status = 'pending', pulled_at = NULL WHERE id = ?`,
    [draftId]
  );
  return { success: true, mode: 'personal' };
}

export async function deleteGroupPostDraft(userId, userRole, draftId) {
  const rows = await query(
    'SELECT id, user_id, is_shared, status FROM group_post_drafts WHERE id = ?',
    [draftId]
  );
  const draft = rows[0];
  if (!draft) {
    const err = new Error('Draft không tồn tại');
    err.status = 404;
    throw err;
  }

  const isAdmin = ['super_admin', 'admin'].includes(userRole);
  if (draft.is_shared) {
    if (!isAdmin && draft.user_id !== userId) {
      const err = new Error('Không có quyền xoá draft chia sẻ');
      err.status = 403;
      throw err;
    }
    await query('DELETE FROM group_post_drafts WHERE id = ?', [draftId]);
    return { success: true };
  }

  const result = await query(
    `DELETE FROM group_post_drafts WHERE id = ? AND user_id = ? AND status = 'pending'`,
    [draftId, userId]
  );
  if (!result.affectedRows) {
    const err = new Error('Draft không tồn tại hoặc đã được extension tải');
    err.status = 404;
    throw err;
  }
  return { success: true };
}
