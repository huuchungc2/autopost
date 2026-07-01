import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { usernameFromEmail } from '../services/userUsernameService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'replace_with_strong_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function signUserToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, type: 'user_account' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function requireUserAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user_account') return res.status(401).json({ error: 'Token không hợp lệ' });
    req.userAccount = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
  }
}

async function generateUniqueUsername(email) {
  const base = usernameFromEmail(email);
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await query('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [candidate]);
    if (!existing.length) return candidate;
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

// POST /api/user-auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });

  const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing.length) return res.status(409).json({ error: 'Email đã được đăng ký' });

  const passwordHash = await bcrypt.hash(password, 10);
  const username = await generateUniqueUsername(email);
  const result = await query(
    `INSERT INTO users (name, username, email, password, role, is_active)
     VALUES (?, ?, ?, ?, 'group_user', true)`,
    [name || username, username, email.toLowerCase(), passwordHash]
  );
  const userId = result.insertId;

  const keyValue = randomUUID().replace(/-/g, '').slice(0, 32).toUpperCase();
  await query(
    'INSERT INTO license_keys (user_id, key_value, plan, status, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, keyValue, 'free', 'active', null]
  );

  const user = { id: userId, email: email.toLowerCase(), name: name || username };
  const token = signUserToken(user);
  res.status(201).json({ token, user, key: keyValue });
}));

// POST /api/user-auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });

  const rows = await query(
    `SELECT id, email, name, password, is_active FROM users WHERE email = ? AND role = 'group_user'`,
    [email.toLowerCase()]
  );
  if (!rows.length || !rows[0].is_active) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

  const account = rows[0];
  const valid = await bcrypt.compare(password, account.password);
  if (!valid) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

  const user = { id: account.id, email: account.email, name: account.name };
  const token = signUserToken(user);
  res.json({ token, user });
}));

// GET /api/user-auth/me
router.get('/me', requireUserAuth, asyncHandler(async (req, res) => {
  const uid = req.userAccount.userId;
  const rows = await query(
    `SELECT id, email, name, IF(is_active, 'active', 'suspended') AS status, created_at
     FROM users WHERE id = ? AND role = 'group_user'`,
    [uid]
  );
  if (!rows.length) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

  const keys = await query(
    'SELECT key_value, plan, status, expires_at, created_at, last_validated_at FROM license_keys WHERE user_id = ? ORDER BY created_at DESC',
    [uid]
  );
  const [stats] = await query(
    `SELECT COUNT(DISTINCT group_id) AS group_count, COUNT(*) AS post_count, MAX(posted_at) AS last_post_at
     FROM user_posts WHERE user_account_id = ?`,
    [uid]
  );
  res.json({ user: rows[0], keys, stats: stats || { group_count: 0, post_count: 0, last_post_at: null } });
}));

// GET /api/user-auth/me/detail — groups + recent posts của chính user
router.get('/me/detail', requireUserAuth, asyncHandler(async (req, res) => {
  const uid = req.userAccount.userId;
  const groups = await query(
    `SELECT group_id, group_name, COUNT(*) AS post_count, MAX(posted_at) AS last_posted_at
     FROM user_posts WHERE user_account_id = ?
     GROUP BY group_id, group_name ORDER BY last_posted_at DESC`,
    [uid]
  );
  const posts = await query(
    `SELECT id, group_name, group_id, post_id, noi_dung, posted_at, needs_comment, created_at
     FROM user_posts WHERE user_account_id = ?
     ORDER BY created_at DESC LIMIT 30`,
    [uid]
  );
  res.json({ groups, posts });
}));

// PATCH /api/user-auth/me — đổi tên / mật khẩu
router.patch('/me', requireUserAuth, asyncHandler(async (req, res) => {
  const uid = req.userAccount.userId;
  const { name, current_password, new_password } = req.body;

  if (new_password) {
    if (!current_password) return res.status(400).json({ error: 'Nhập mật khẩu hiện tại' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });
    const [acc] = await query('SELECT password FROM users WHERE id = ?', [uid]);
    const valid = await bcrypt.compare(current_password, acc.password);
    if (!valid) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password = ? WHERE id = ?', [hash, uid]);
  }
  if (name !== undefined) {
    await query('UPDATE users SET name = ? WHERE id = ?', [name || null, uid]);
  }
  res.json({ ok: true });
}));

// POST /api/user-auth/validate-key  (gọi từ extension — public)
router.post('/validate-key', asyncHandler(async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, error: 'Thiếu key' });

  const rows = await query(
    `SELECT lk.id, lk.user_id, lk.plan, lk.status, lk.expires_at,
            u.email, u.name, u.is_active AS user_status
     FROM license_keys lk
     JOIN users u ON u.id = lk.user_id
     WHERE lk.key_value = ?`,
    [String(key).toUpperCase()]
  );

  if (!rows.length) return res.json({ valid: false, error: 'Key không tồn tại' });

  const k = rows[0];
  if (k.status !== 'active') return res.json({ valid: false, error: 'Key đã bị vô hiệu hóa' });
  if (!k.user_status) return res.json({ valid: false, error: 'Tài khoản đã bị khóa' });
  if (k.expires_at && new Date(k.expires_at) < new Date()) {
    return res.json({ valid: false, error: 'Key đã hết hạn' });
  }

  await query('UPDATE license_keys SET last_validated_at = NOW() WHERE id = ?', [k.id]);

  res.json({
    valid: true,
    plan: k.plan,
    userId: k.user_id,
    email: k.email,
    name: k.name,
    expiresAt: k.expires_at,
  });
}));

// POST /api/user-auth/logout
router.post('/logout', requireUserAuth, (req, res) => {
  res.json({ ok: true });
});

// ── Admin routes (yêu cầu admin JWT) ──────────────────────────────────────

// GET /api/user-auth/admin/users — danh sách tất cả group_user + key + stats
router.get('/admin/users', authenticate, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.email, u.name, IF(u.is_active, 'active', 'suspended') AS status, u.created_at,
            lk.key_value, lk.plan, lk.status AS key_status,
            lk.expires_at, lk.last_validated_at,
            COUNT(DISTINCT up.group_id) AS group_count,
            COUNT(up.id) AS post_count,
            MAX(up.posted_at) AS last_post_at
     FROM users u
     LEFT JOIN license_keys lk ON lk.user_id = u.id
     LEFT JOIN user_posts up ON up.user_account_id = u.id
     WHERE u.role = 'group_user'
     GROUP BY u.id, lk.id
     ORDER BY u.created_at DESC`
  );
  res.json(rows);
}));

// GET /api/user-auth/admin/users/:id/detail — groups + recent posts của 1 user
router.get('/admin/users/:id/detail', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const groups = await query(
    `SELECT group_id, group_name, COUNT(*) AS post_count, MAX(posted_at) AS last_posted_at
     FROM user_posts WHERE user_account_id = ?
     GROUP BY group_id, group_name ORDER BY last_posted_at DESC`,
    [id]
  );
  const posts = await query(
    `SELECT id, group_name, group_id, post_id, noi_dung, posted_at, needs_comment, created_at
     FROM user_posts WHERE user_account_id = ?
     ORDER BY created_at DESC LIMIT 20`,
    [id]
  );
  res.json({ groups, posts });
}));

// PATCH /api/user-auth/admin/users/:id — cập nhật status / plan / expires_at
router.patch('/admin/users/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, plan, expires_at, key_status } = req.body;

  if (status) {
    await query(`UPDATE users SET is_active = ? WHERE id = ? AND role = 'group_user'`, [status === 'active' ? 1 : 0, id]);
  }
  if (plan || key_status || expires_at !== undefined) {
    const sets = [];
    const vals = [];
    if (plan) { sets.push('plan = ?'); vals.push(plan); }
    if (key_status) { sets.push('status = ?'); vals.push(key_status); }
    if (expires_at !== undefined) { sets.push('expires_at = ?'); vals.push(expires_at || null); }
    if (sets.length) {
      vals.push(id);
      await query(`UPDATE license_keys SET ${sets.join(', ')} WHERE user_id = ?`, vals);
    }
  }
  res.json({ ok: true });
}));

// DELETE /api/user-auth/admin/users/:id
router.delete('/admin/users/:id', authenticate, asyncHandler(async (req, res) => {
  await query(`DELETE FROM users WHERE id = ? AND role = 'group_user'`, [req.params.id]);
  res.json({ ok: true });
}));

export default router;
