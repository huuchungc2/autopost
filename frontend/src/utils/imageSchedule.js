function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toMinutes(hour, minute) {
  return clampInt(hour, 0, 23, 0) * 60 + clampInt(minute, 0, 59, 0);
}

export function computeMaxImagesPerNight({
  start_hour: startHour,
  start_minute: startMinute,
  end_hour: endHour,
  end_minute: endMinute,
  interval_minutes: intervalMinutes,
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
