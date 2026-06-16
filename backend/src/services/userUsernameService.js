import { query } from '../db.js';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 50);
}

export function validateUsername(username) {
  if (!username) return 'Username là bắt buộc';
  if (username.length < 3) return 'Username tối thiểu 3 ký tự';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username chỉ gồm chữ thường, số, dấu . _ - (bắt đầu bằng chữ hoặc số)';
  }
  return null;
}

export function usernameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'user';
  const normalized = normalizeUsername(local);
  return normalized.length >= 3 ? normalized : `user_${normalized || 'x'}`;
}

export async function assertUsernameAvailable(username, excludeUserId = null) {
  const error = validateUsername(username);
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }

  const params = [username];
  let sql = 'SELECT id FROM users WHERE deleted_at IS NULL AND LOWER(username) = LOWER(?)';
  if (excludeUserId) {
    sql += ' AND id <> ?';
    params.push(excludeUserId);
  }
  const rows = await query(sql, params);
  if (rows.length) {
    const err = new Error('Username đã được sử dụng');
    err.status = 400;
    throw err;
  }
}

export async function backfillMissingUsernames() {
  let users;
  try {
    users = await query(
      'SELECT id, email, name FROM users WHERE deleted_at IS NULL AND (username IS NULL OR username = "")'
    );
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') return;
    throw error;
  }
  if (!users.length) return;

  const existing = await query(
    'SELECT username FROM users WHERE username IS NOT NULL AND username <> ""'
  );
  const used = new Set(existing.map((row) => row.username.toLowerCase()));

  for (const user of users) {
    let base = usernameFromEmail(user.email);
    if (!base || base.length < 3) {
      base = normalizeUsername(user.name) || `user${user.id}`;
    }
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    await query('UPDATE users SET username = ? WHERE id = ?', [candidate, user.id]);
    used.add(candidate.toLowerCase());
  }
}
