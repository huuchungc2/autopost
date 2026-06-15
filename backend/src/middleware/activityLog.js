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

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  ['password', 'api_key', 'page_token', 'old_password', 'new_password'].forEach((key) => {
    if (copy[key]) copy[key] = '[REDACTED]';
  });
  return copy;
}
