import { query } from '../db.js';

export async function authenticateLicenseKey(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Thiếu license key' });

  const rows = await query(
    `SELECT lk.id, lk.user_id, lk.plan, lk.status, lk.expires_at,
            u.email, u.name, u.is_active AS user_status
     FROM license_keys lk
     JOIN users u ON u.id = lk.user_id
     WHERE lk.key_value = ? AND lk.status = 'active' AND u.is_active = 1`,
    [String(token).toUpperCase()]
  );

  if (!rows.length) return res.status(401).json({ error: 'License key không hợp lệ' });
  const k = rows[0];
  if (k.expires_at && new Date(k.expires_at) < new Date()) {
    return res.status(401).json({ error: 'License key đã hết hạn' });
  }

  req.userAccount = { id: k.user_id, email: k.email, name: k.name, plan: k.plan };
  next();
}
