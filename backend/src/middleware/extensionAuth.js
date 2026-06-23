import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const jwtSecret = process.env.JWT_SECRET || 'replace_with_strong_secret';

async function loadUserById(userId) {
  const users = await query(
    'SELECT id, name, username, email, role, is_active, must_change_password FROM users WHERE id = ?',
    [userId]
  ).catch(async () => query(
    'SELECT id, name, email, role, is_active, must_change_password FROM users WHERE id = ?',
    [userId]
  ));
  return users[0] || null;
}

async function loadUserByApiKey(apiKey) {
  const rows = await query(
    `SELECT e.user_id, e.fb_user_id, e.fb_user_name, e.api_key,
            u.id, u.name, u.username, u.email, u.role, u.is_active, u.must_change_password
     FROM extension_api_keys e
     JOIN users u ON u.id = e.user_id
     WHERE e.api_key = ?`,
    [apiKey]
  );
  const row = rows[0];
  if (!row || !row.is_active) return null;
  return {
    user: {
      id: row.id,
      name: row.name,
      username: row.username,
      email: row.email,
      role: row.role,
      is_active: row.is_active,
      must_change_password: row.must_change_password,
    },
    extension: {
      fb_user_id: row.fb_user_id,
      fb_user_name: row.fb_user_name,
      api_key: row.api_key,
    },
  };
}

/** JWT (extension login) hoặc Bearer API key riêng cho extension */
export async function authenticateExtension(req, res, next) {
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
    const user = await loadUserById(payload.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    req.authMode = 'jwt';
    const extRows = await query(
      'SELECT fb_user_id, fb_user_name, api_key FROM extension_api_keys WHERE user_id = ?',
      [user.id]
    );
    req.extension = extRows[0] || null;
    return next();
  } catch {
    // fall through — API key
  }

  const apiResult = await loadUserByApiKey(token);
  if (!apiResult) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = apiResult.user;
  req.extension = {
    fb_user_id: apiResult.extension.fb_user_id,
    fb_user_name: apiResult.extension.fb_user_name,
    api_key: apiResult.extension.api_key,
  };
  req.authMode = 'api_key';
  return next();
}
