import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

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

// POST /api/user-auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });

  const existing = await query('SELECT id FROM user_accounts WHERE email = ?', [email.toLowerCase()]);
  if (existing.length) return res.status(409).json({ error: 'Email đã được đăng ký' });

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO user_accounts (email, password_hash, name) VALUES (?, ?, ?)',
    [email.toLowerCase(), passwordHash, name || null]
  );
  const userId = result.insertId;

  const keyValue = randomUUID().replace(/-/g, '').slice(0, 32).toUpperCase();
  await query(
    'INSERT INTO license_keys (user_id, key_value, plan, status, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, keyValue, 'free', 'active', null]
  );

  const user = { id: userId, email: email.toLowerCase(), name: name || null };
  const token = signUserToken(user);
  res.status(201).json({ token, user, key: keyValue });
}));

// POST /api/user-auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });

  const rows = await query('SELECT * FROM user_accounts WHERE email = ? AND status = ?', [email.toLowerCase(), 'active']);
  if (!rows.length) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

  const account = rows[0];
  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

  const user = { id: account.id, email: account.email, name: account.name };
  const token = signUserToken(user);
  res.json({ token, user });
}));

// GET /api/user-auth/me
router.get('/me', requireUserAuth, asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, email, name, status, created_at FROM user_accounts WHERE id = ?', [req.userAccount.userId]);
  if (!rows.length) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

  const keys = await query(
    'SELECT key_value, plan, status, expires_at, created_at, last_validated_at FROM license_keys WHERE user_id = ? ORDER BY created_at DESC',
    [req.userAccount.userId]
  );
  res.json({ user: rows[0], keys });
}));

// POST /api/user-auth/validate-key  (gọi từ extension — public)
router.post('/validate-key', asyncHandler(async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, error: 'Thiếu key' });

  const rows = await query(
    `SELECT lk.id, lk.user_id, lk.plan, lk.status, lk.expires_at,
            ua.email, ua.name, ua.status AS user_status
     FROM license_keys lk
     JOIN user_accounts ua ON ua.id = lk.user_id
     WHERE lk.key_value = ?`,
    [String(key).toUpperCase()]
  );

  if (!rows.length) return res.json({ valid: false, error: 'Key không tồn tại' });

  const k = rows[0];
  if (k.status !== 'active') return res.json({ valid: false, error: 'Key đã bị vô hiệu hóa' });
  if (k.user_status !== 'active') return res.json({ valid: false, error: 'Tài khoản đã bị khóa' });
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

// GET /api/user-auth/admin/users — danh sách tất cả user_accounts + key
router.get('/admin/users', authenticate, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT ua.id, ua.email, ua.name, ua.status, ua.created_at,
            lk.key_value, lk.plan, lk.status AS key_status,
            lk.expires_at, lk.last_validated_at
     FROM user_accounts ua
     LEFT JOIN license_keys lk ON lk.user_id = ua.id
     ORDER BY ua.created_at DESC`
  );
  res.json(rows);
}));

// PATCH /api/user-auth/admin/users/:id — cập nhật status / plan / expires_at
router.patch('/admin/users/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, plan, expires_at, key_status } = req.body;

  if (status) {
    await query('UPDATE user_accounts SET status = ? WHERE id = ?', [status, id]);
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
  await query('DELETE FROM user_accounts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
