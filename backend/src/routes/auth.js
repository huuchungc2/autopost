import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authenticateUser, signToken, setPassword, verifyPassword } from '../services/authService.js';
import { getUserPages, isSuperAdmin } from '../services/pageAccessService.js';
import { getUserProviders } from '../services/providerAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const login = req.body.login || req.body.email || req.body.username;
  const { password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Email/username và mật khẩu là bắt buộc' });
  }
  const user = await authenticateUser(login, password);
  if (!user) {
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

export default router;
