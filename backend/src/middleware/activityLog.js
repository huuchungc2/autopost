import { query } from '../db.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function activityLogger(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400 && req.user) {
      logActivity(req, body).catch(console.error);
    }
    return originalJson(body);
  };

  next();
}

async function logActivity(req, responseBody) {
  const action = `${req.method} ${req.originalUrl}`;
  const targetType = inferTargetType(req.originalUrl);
  const targetId = req.params?.id || responseBody?.id || null;

  await query(
    'INSERT INTO activity_logs (user_id, action, target_type, target_id, detail, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
    [req.user.id, action, targetType, targetId, JSON.stringify({ body: sanitizeBody(req.body), response: sanitizeBody(responseBody) }), req.ip]
  );
}

function inferTargetType(url) {
  const map = [
    ['/api/auth', 'auth'],
    ['/api/users', 'user'],
    ['/api/providers', 'provider'],
    ['/api/pages', 'page'],
    ['/api/skills', 'skill'],
    ['/api/posts', 'post'],
    ['/api/jobs', 'job'],
    ['/api/notifications', 'notification'],
    ['/api/upload', 'upload'],
  ];
  const match = map.find(([prefix]) => url.startsWith(prefix));
  return match ? match[1] : 'unknown';
}

// Che mọi trường nhạy cảm trước khi ghi vào activity_logs. Đệ quy vì payload ghi log gói cả `response`
// lồng bên trong (vd POST /my-license trả về key_value, Settings trả về client_secret/refresh_token...).
const SENSITIVE_KEYS = new Set([
  'password', 'old_password', 'new_password', 'current_password',
  'api_key', 'apikey', 'page_token', 'composio_page_token', 'composio_api_key',
  'key', 'key_value', 'token', 'access_token', 'refresh_token', 'secret', 'client_secret',
  'google_drive_client_secret', 'google_drive_refresh_token',
]);

function sanitizeBody(value, depth = 0) {
  if (depth > 6 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeBody(v, depth + 1));
  const copy = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase()) && v) {
      copy[k] = '[REDACTED]';
    } else {
      copy[k] = sanitizeBody(v, depth + 1);
    }
  }
  return copy;
}
