import express from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateUser, signToken, setPassword, verifyPassword } from '../services/authService.js';
import { getUserPages, isSuperAdmin } from '../services/pageAccessService.js';
import { getUserProviders } from '../services/providerAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const login = req.body.login || req.body.email || req.body.username;
  const { password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Email/username và mật khẩu là bắt buộc' });
  }
  const user = await authenticateUser(login, password);
  if (!user) {
    const groupUser = await query(
      `SELECT id FROM users WHERE role = 'group_user' AND (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?))`,
      [login, login]
    );
    if (groupUser.length) {
      return res.status(401).json({ error: 'Tài khoản này đăng ký qua GroupFlow — đăng nhập tại /user/login' });
    }
    return res.status(401).json({ error: 'Sai email/username hoặc mật khẩu' });
  }
  const token = signToken(user);
  res.json({ token, user });
}));

router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logout successful' });
});

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const assigned_pages = isSuperAdmin(req.user) ? null : await getUserPages(req.user.id);
  const assigned_providers = isSuperAdmin(req.user) ? null : await getUserProviders(req.user.id);
  res.json({ ...req.user, assigned_pages, assigned_providers });
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }

  if (!req.user.must_change_password) {
    if (!old_password) {
      return res.status(400).json({ error: 'Old password is required' });
    }
    const validOld = await verifyPassword(req.user.id, old_password);
    if (!validOld) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }
  } else if (old_password) {
    const validOld = await verifyPassword(req.user.id, old_password);
    if (!validOld) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }
  }

  await setPassword(req.user.id, new_password, false);
  res.json({ message: 'Password updated successfully' });
}));

/** License key để dùng extension GroupFlow dưới đúng tài khoản đang đăng nhập (mọi role) — không tạo user mới như /api/user-auth/register. */
router.get('/my-license', authenticate, asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT key_value, plan, status, expires_at, created_at, last_validated_at FROM license_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.id]
  );
  res.json(rows[0] || null);
}));

router.post('/my-license', authenticate, asyncHandler(async (req, res) => {
  const existing = await query(
    'SELECT key_value, plan, status, expires_at, created_at, last_validated_at FROM license_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [req.user.id]
  );
  if (existing.length) return res.json(existing[0]);

  const keyValue = randomUUID().replace(/-/g, '').slice(0, 32).toUpperCase();
  await query(
    'INSERT INTO license_keys (user_id, key_value, plan, status, expires_at) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, keyValue, 'free', 'active', null]
  );
  res.status(201).json({ key_value: keyValue, plan: 'free', status: 'active', expires_at: null, created_at: new Date() });
}));

export default router;
