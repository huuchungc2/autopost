import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const jwtSecret = process.env.JWT_SECRET || 'replace_with_strong_secret';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query?.access_token;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : (typeof queryToken === 'string' ? queryToken : null);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    const users = await query(
      'SELECT id, name, username, email, role, is_active, must_change_password FROM users WHERE id = ?',
      [payload.userId]
    ).catch(async () => query(
      'SELECT id, name, email, role, is_active, must_change_password FROM users WHERE id = ?',
      [payload.userId]
    ));
    const user = users[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
