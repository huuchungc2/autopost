import { query } from '../db.js';

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULTS = {
  enabled: false,
  start_hour: 1,
  start_minute: 0,
  end_hour: 5,
  end_minute: 0,
  interval_minutes: 10,
  timezone: DEFAULT_TIMEZONE,
};

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toMinutes(hour, minute) {
  return clampInt(hour, 0, 23, 0) * 60 + clampInt(minute, 0, 59, 0);
}

export function computeMaxImagesPerNight({
  startHour,
  startMinute,
  endHour,
  endMinute,
  intervalMinutes,
}) {
  const start = toMinutes(startHour, startMinute);
  let end = toMinutes(endHour, endMinute);
  if (end <= start) end += 24 * 60;
  const interval = Math.max(1, clampInt(intervalMinutes, 1, 24 * 60, 10));
  return Math.floor((end - start) / interval);
}

export function formatScheduleTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getZonedNow(timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value || '0';
  return {
    hour: clampInt(get('hour'), 0, 23, 0),
    minute: clampInt(get('minute'), 0, 59, 0),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    timezone,
  };
}

function normalizeRow(row, pageCount = 0) {
  if (!row) return null;
  const config = {
    user_id: row.user_id,
    enabled: row.enabled === 1 || row.enabled === true,
    start_hour: row.start_hour,
    start_minute: row.start_minute,
    end_hour: row.end_hour,
    end_minute: row.end_minute,
    interval_minutes: row.interval_minutes,
    timezone: row.timezone || DEFAULT_TIMEZONE,
    last_run_at: row.last_run_at || null,
    updated_at: row.updated_at || null,
    page_count: pageCount,
  };
  config.max_per_night = computeMaxImagesPerNight({
    startHour: config.start_hour,
    startMinute: config.start_minute,
    endHour: config.end_hour,
    endMinute: config.end_minute,
    intervalMinutes: config.interval_minutes,
  });
  return config;
}

async function countAssignedPages(userId) {
  try {
    const rows = await query(
      'SELECT COUNT(*) AS cnt FROM user_pages up JOIN fb_pages fp ON fp.id = up.page_id WHERE up.user_id = ? AND fp.is_active = true',
      [userId]
    );
    return Number(rows[0]?.cnt || 0);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return 0;
    throw error;
  }
}

async function ensureScheduleRow(userId) {
  const existing = await query('SELECT * FROM image_schedule_settings WHERE user_id = ? LIMIT 1', [userId]);
  if (existing.length) return existing[0];

  await query(
    `INSERT INTO image_schedule_settings
     (user_id, enabled, start_hour, start_minute, end_hour, end_minute, interval_minutes, timezone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, DEFAULTS.enabled, DEFAULTS.start_hour, DEFAULTS.start_minute, DEFAULTS.end_hour, DEFAULTS.end_minute, DEFAULTS.interval_minutes, DEFAULTS.timezone]
  );
  const rows = await query('SELECT * FROM image_schedule_settings WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0];
}

export async function getImageScheduleConfig(userId) {
  const row = await ensureScheduleRow(userId);
  const pageCount = await countAssignedPages(userId);
  return normalizeRow(row, pageCount);
}

export function isWithinImageWindow(config, zonedNow = null) {
  if (!config?.enabled) return false;

  const now = zonedNow || getZonedNow(config.timezone);
  const nowMin = now.hour * 60 + now.minute;
  const start = toMinutes(config.start_hour, config.start_minute);
  let end = toMinutes(config.end_hour, config.end_minute);

  if (end > start) {
    return nowMin >= start && nowMin < end;
  }
  return nowMin >= start || nowMin < end;
}

export async function saveImageScheduleConfig(userId, updates) {
  await ensureScheduleRow(userId);
  const current = await getImageScheduleConfig(userId);

  const next = {
    enabled: updates.enabled != null ? Boolean(updates.enabled) : current.enabled,
    start_hour: updates.start_hour != null
      ? clampInt(updates.start_hour, 0, 23, current.start_hour)
      : current.start_hour,
    start_minute: updates.start_minute != null
      ? clampInt(updates.start_minute, 0, 59, current.start_minute)
      : current.start_minute,
    end_hour: updates.end_hour != null
      ? clampInt(updates.end_hour, 0, 23, current.end_hour)
      : current.end_hour,
    end_minute: updates.end_minute != null
      ? clampInt(updates.end_minute, 0, 59, current.end_minute)
      : current.end_minute,
    interval_minutes: updates.interval_minutes != null
      ? clampInt(updates.interval_minutes, 1, 24 * 60, current.interval_minutes)
      : current.interval_minutes,
  };

  await query(
    `UPDATE image_schedule_settings
     SET enabled = ?, start_hour = ?, start_minute = ?, end_hour = ?, end_minute = ?, interval_minutes = ?
     WHERE user_id = ?`,
    [next.enabled, next.start_hour, next.start_minute, next.end_hour, next.end_minute, next.interval_minutes, userId]
  );

  return getImageScheduleConfig(userId);
}

export async function getEnabledImageSchedules() {
  return query(
    `SELECT s.*, u.name AS user_name
     FROM image_schedule_settings s
     JOIN users u ON u.id = s.user_id
     WHERE s.enabled = true AND u.is_active = true`
  );
}

export async function touchImageScheduleLastRun(userId) {
  await query('UPDATE image_schedule_settings SET last_run_at = NOW() WHERE user_id = ?', [userId]);
}

export async function getImageGenerateLogs(userId, limit = 50) {
  return query(
    `SELECT l.*, p.topic, p.page_id, fp.name AS page_name
     FROM image_generate_logs l
     JOIN posts p ON p.id = l.post_id
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE p.page_id IN (SELECT page_id FROM user_pages WHERE user_id = ?)
     ORDER BY l.id DESC
     LIMIT ?`,
    [userId, clampInt(limit, 1, 200, 50)]
  );
}
