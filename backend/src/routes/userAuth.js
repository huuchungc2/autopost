import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { usernameFromEmail } from '../services/userUsernameService.js';
import { licenseValidateLimiter } from '../middleware/rateLimit.js';
import { registerOrCheckDevice, listDevicesForKey, getDeviceLimit, removeDevice, DEVICE_STALE_DAYS } from '../services/licenseDeviceService.js';

// Số điện thoại VN thông dụng: 0 + 9 số, hoặc +84 + 9 số — chỉ chặn rác rõ ràng (chữ cái, quá
// ngắn/dài), không cố xác thực đầu số nhà mạng vì hay đổi.
const PHONE_RE = /^(0|\+84)\d{9}$/;

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
// 2026-07-10 — bắt buộc số điện thoại: gói free công khai đổi lại việc thu thập thông tin liên hệ
// người dùng thật (Tony: "public xài free đổi lại là số điện thoại"). Không unique — không muốn
// chặn nhầm người dùng chung số điện thoại gia đình/công ty, chỉ cần thu thập được, không phải
// khoá 1-số-1-tài-khoản.
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (!phone || !PHONE_RE.test(String(phone).trim())) {
    return res.status(400).json({ error: 'Số điện thoại không hợp lệ (VD: 0912345678)' });
  }

  const existing = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (existing.length) return res.status(409).json({ error: 'Email đã được đăng ký' });

  const passwordHash = await bcrypt.hash(password, 10);
  const username = await generateUniqueUsername(email);
  const result = await query(
    `INSERT INTO users (name, username, email, phone, password, role, is_active)
     VALUES (?, ?, ?, ?, ?, 'group_user', true)`,
    [name || username, username, email.toLowerCase(), String(phone).trim(), passwordHash]
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

// GET /api/user-auth/me/detail — groups + recent posts của chính user (posts phân trang, groups
// giữ nguyên không phân trang vì số nhóm dùng thường ít hơn nhiều so với số bài đăng)
router.get('/me/detail', requireUserAuth, asyncHandler(async (req, res) => {
  const uid = req.userAccount.userId;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const offset = (page - 1) * limit;

  const groups = await query(
    `SELECT group_id, group_name, COUNT(*) AS post_count, MAX(posted_at) AS last_posted_at
     FROM user_posts WHERE user_account_id = ?
     GROUP BY group_id, group_name ORDER BY last_posted_at DESC`,
    [uid]
  );
  const [countRow] = await query('SELECT COUNT(*) AS total FROM user_posts WHERE user_account_id = ?', [uid]);
  const total = Number(countRow?.total) || 0;
  // COALESCE(posted_at, created_at) — bài nào lỡ có posted_at NULL vẫn sắp xếp đúng theo created_at
  // thay vì bị đẩy xuống cuối (MySQL xếp NULL cuối cùng khi DESC), tương tự fix ở trang admin /groups.
  const posts = await query(
    `SELECT id, group_name, group_id, post_id, noi_dung, posted_at, needs_comment, created_at
     FROM user_posts WHERE user_account_id = ?
     ORDER BY COALESCE(posted_at, created_at) DESC LIMIT ? OFFSET ?`,
    [uid, limit, offset]
  );
  res.json({ groups, posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
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

// POST /api/user-auth/validate-key  (gọi từ extension — public, không qua auth nào, nên đây là bề
// mặt dò/brute-force license key duy nhất không cần biết trước gì cả — giới hạn chặt hơn hẳn các
// route đã có key hợp lệ, xem middleware/rateLimit.js)
// 2026-07-10 — nhận thêm deviceId (+ deviceLabel tuỳ chọn, vd tên máy/OS) để giới hạn số thiết bị
// dùng chung 1 key theo plan (xem licenseDeviceService.js). Chỉ chặn NGAY LÚC KÍCH HOẠT trên thiết
// bị MỚI — thiết bị đã đăng ký trước đó luôn được cho qua (không lặp lại việc check này ở tầng
// per-request nào khác, giữ đơn giản — xem docs/GROUPFLOW.md).
router.post('/validate-key', licenseValidateLimiter, asyncHandler(async (req, res) => {
  const { key, deviceId, deviceLabel } = req.body;
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

  const deviceCheck = await registerOrCheckDevice({
    licenseKeyId: k.id,
    plan: k.plan,
    deviceId,
    deviceLabel,
  });
  if (!deviceCheck.ok) {
    // error là chuỗi tiếng Việt hiện thẳng ra UI (đúng convention các nhánh lỗi khác ở route này —
    // xem overlayStatus.textContent = data.error || ..., sidepanel.js) — không phải mã lỗi máy đọc.
    return res.json({
      valid: false,
      error: `Key gói ${k.plan} chỉ dùng được tối đa ${deviceCheck.limit} thiết bị — liên hệ admin để gỡ bớt thiết bị cũ`,
      code: 'device_limit_reached',
      limit: deviceCheck.limit,
    });
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

// POST /api/user-auth/reset-devices — tự gỡ TẤT CẢ thiết bị đang đăng ký cho 1 key rồi đăng ký lại
// đúng thiết bị hiện tại. Tony hỏi: đổi hẳn sang key mới thì có ảnh hưởng bài đăng cũ không (bài cũ
// nằm ở `user_posts`, khoá theo `user_account_id` — KHÔNG liên quan gì tới key_value/device, nên đổi
// key mới không xoá/ảnh hưởng bài cũ) — nhưng đổi key mới lại tạo 1 danh tính MỚI nếu dùng
// `GET /admin/my-key` (user_id khác), tách khỏi lịch sử cũ một cách không cần thiết cho đúng nhu cầu
// "chỉ đang kẹt vì thiết bị cũ". Route riêng này KHÔNG đổi key_value, KHÔNG đụng user_posts — chỉ
// dọn sạch `license_key_devices` của ĐÚNG key đang dùng — an toàn hơn hẳn cho đúng use-case "cài lại
// extension mất device_id cũ, chỉ xài đúng 1 máy". Chặn nếu key đã bị admin suspend/hết hạn (không
// cho tự gỡ giới hạn để lách suspend — cùng nguyên tắc với registerOrCheckDevice()).
router.post('/reset-devices', licenseValidateLimiter, asyncHandler(async (req, res) => {
  const { key, deviceId, deviceLabel } = req.body;
  if (!key) return res.status(400).json({ ok: false, error: 'Thiếu key' });

  const rows = await query(
    `SELECT lk.id, lk.status, lk.expires_at, u.is_active AS user_status
     FROM license_keys lk JOIN users u ON u.id = lk.user_id
     WHERE lk.key_value = ?`,
    [String(key).toUpperCase()]
  );
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Key không tồn tại' });
  const k = rows[0];
  if (k.status !== 'active') return res.status(403).json({ ok: false, error: 'Key đã bị khoá — liên hệ admin, không thể tự đặt lại thiết bị' });
  if (!k.user_status) return res.status(403).json({ ok: false, error: 'Tài khoản đã bị khóa' });
  if (k.expires_at && new Date(k.expires_at) < new Date()) {
    return res.status(403).json({ ok: false, error: 'Key đã hết hạn' });
  }

  await query('DELETE FROM license_key_devices WHERE license_key_id = ?', [k.id]);
  if (deviceId) {
    await query(
      'INSERT INTO license_key_devices (license_key_id, device_id, device_label) VALUES (?, ?, ?)',
      [k.id, deviceId, deviceLabel || null]
    );
  }
  res.json({ ok: true });
}));

// POST /api/user-auth/logout
router.post('/logout', requireUserAuth, (req, res) => {
  res.json({ ok: true });
});

// ── Admin routes (yêu cầu admin JWT) ──────────────────────────────────────
// 2026-07-11 — ĐÃ THỬ thêm `GET /admin/my-key` ở đây cho admin tự lấy license key riêng, nhưng phát
// hiện TRÙNG LẶP với tính năng đã có sẵn từ trước: `GET/POST /api/auth/my-license`
// (`routes/auth.js`, UI ở `GroupExtensionSettings.jsx` trong trang Cài đặt — "License key của tôi").
// Route trùng này tạo ra 2 nơi cùng ghi `license_keys` cho cùng 1 user_id với default plan KHÁC
// nhau (free vs enterprise) — rủi ro thật, đã xoá bỏ hẳn. Dùng `/api/auth/my-license` sẵn có.

// GET /api/user-auth/admin/users — danh sách tất cả group_user + key + stats
router.get('/admin/users', authenticate, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.email, u.phone, u.name, IF(u.is_active, 'active', 'suspended') AS status, u.created_at,
            lk.id AS license_key_id, lk.key_value, lk.plan, lk.status AS key_status,
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
  // Đếm theo thiết bị CÒN HOẠT ĐỘNG (last_seen_at trong DEVICE_STALE_DAYS) — khớp đúng số dùng để
  // enforce giới hạn thật (registerOrCheckDevice()), không phải tổng lịch sử mọi thiết bị từng kích
  // hoạt (thiết bị bỏ hoang lâu ngày không còn tính vào giới hạn, xem licenseDeviceService.js).
  const deviceCounts = await query(
    `SELECT license_key_id, COUNT(*) AS c FROM license_key_devices
     WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY license_key_id`,
    [DEVICE_STALE_DAYS]
  );
  const countByKey = new Map(deviceCounts.map((r) => [r.license_key_id, Number(r.c)]));
  res.json(rows.map((r) => ({
    ...r,
    device_count: r.license_key_id ? (countByKey.get(r.license_key_id) || 0) : 0,
    device_limit: getDeviceLimit(r.plan),
  })));
}));

// GET /api/user-auth/admin/users/:id/detail — groups + recent posts + thiết bị đang dùng key của 1 user
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
  const [lk] = await query('SELECT id, plan FROM license_keys WHERE user_id = ? LIMIT 1', [id]);
  const devices = lk ? await listDevicesForKey(lk.id) : [];
  res.json({ groups, posts, devices, deviceLimit: lk ? getDeviceLimit(lk.plan) : null, licenseKeyId: lk?.id || null });
}));

// DELETE /api/user-auth/admin/users/:id/devices/:deviceRowId — gỡ 1 thiết bị khỏi key của user,
// nhường chỗ cho thiết bị mới kích hoạt (không tự ngắt phiên đang chạy của thiết bị bị gỡ — thiết
// bị đó chỉ bị chặn ở lần validate-key TIẾP THEO, xem chú thích ở registerOrCheckDevice()).
router.delete('/admin/users/:id/devices/:deviceRowId', authenticate, asyncHandler(async (req, res) => {
  const { id, deviceRowId } = req.params;
  const [lk] = await query('SELECT id FROM license_keys WHERE user_id = ? LIMIT 1', [id]);
  if (!lk) return res.status(404).json({ error: 'User chưa có license key' });
  await removeDevice(lk.id, deviceRowId);
  res.json({ ok: true });
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
