import { query } from '../db.js';
import {
  computeMaxImagesPerNight,
  isWithinImageWindow,
  getZonedNow,
} from './imageScheduleConfig.js';

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizePageImageSchedule(row) {
  if (!row) return null;
  const config = {
    enabled: row.image_schedule_enabled === 1 || row.image_schedule_enabled === true,
    start_hour: row.image_schedule_start_hour ?? 1,
    start_minute: row.image_schedule_start_minute ?? 0,
    end_hour: row.image_schedule_end_hour ?? 5,
    end_minute: row.image_schedule_end_minute ?? 0,
    interval_minutes: row.image_schedule_interval_minutes ?? 10,
    last_run_at: row.image_schedule_last_run_at || null,
    timezone: DEFAULT_TIMEZONE,
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

export function parsePageImageScheduleInput(input, current = null) {
  const base = current || normalizePageImageSchedule({});
  if (!input || typeof input !== 'object') return base;

  return {
    enabled: input.enabled != null ? Boolean(input.enabled) : base.enabled,
    start_hour: input.start_hour != null
      ? clampInt(input.start_hour, 0, 23, base.start_hour)
      : base.start_hour,
    start_minute: input.start_minute != null
      ? clampInt(input.start_minute, 0, 59, base.start_minute)
      : base.start_minute,
    end_hour: input.end_hour != null
      ? clampInt(input.end_hour, 0, 23, base.end_hour)
      : base.end_hour,
    end_minute: input.end_minute != null
      ? clampInt(input.end_minute, 0, 59, base.end_minute)
      : base.end_minute,
    interval_minutes: input.interval_minutes != null
      ? clampInt(input.interval_minutes, 1, 24 * 60, base.interval_minutes)
      : base.interval_minutes,
  };
}

export async function getEnabledPageImageSchedules() {
  try {
    return await query(
      `SELECT id, name, image_schedule_enabled, image_schedule_start_hour, image_schedule_start_minute,
              image_schedule_end_hour, image_schedule_end_minute, image_schedule_interval_minutes,
              image_schedule_last_run_at, image_provider_id
       FROM fb_pages
       WHERE is_active = true AND image_schedule_enabled = true
       ORDER BY id ASC`
    );
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') return [];
    throw error;
  }
}

export async function filterPagesWithoutOwnSchedule(pageIds) {
  if (!pageIds?.length) return [];
  try {
    const placeholders = pageIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT id FROM fb_pages
       WHERE id IN (${placeholders}) AND image_schedule_enabled = true`,
      pageIds
    );
    const blocked = new Set(rows.map((r) => Number(r.id)));
    return pageIds.filter((id) => !blocked.has(Number(id)));
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') return pageIds;
    throw error;
  }
}

export async function touchPageImageScheduleLastRun(pageId) {
  await query('UPDATE fb_pages SET image_schedule_last_run_at = NOW() WHERE id = ?', [pageId]);
}

export function pageScheduleWindowConfig(pageRow) {
  return {
    enabled: true,
    start_hour: pageRow.image_schedule_start_hour,
    start_minute: pageRow.image_schedule_start_minute,
    end_hour: pageRow.image_schedule_end_hour,
    end_minute: pageRow.image_schedule_end_minute,
    interval_minutes: pageRow.image_schedule_interval_minutes,
    timezone: DEFAULT_TIMEZONE,
    last_run_at: pageRow.image_schedule_last_run_at,
  };
}

export function isPageScheduleDue(pageRow, zonedNow = null) {
  const config = pageScheduleWindowConfig(pageRow);
  const now = zonedNow || getZonedNow(DEFAULT_TIMEZONE);
  if (!isWithinImageWindow(config, now)) return false;
  if (pageRow.image_schedule_last_run_at) {
    const elapsed = Date.now() - new Date(pageRow.image_schedule_last_run_at).getTime();
    if (elapsed < pageRow.image_schedule_interval_minutes * 60 * 1000) return false;
  }
  return true;
}
