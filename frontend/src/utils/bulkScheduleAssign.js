const pad = (n) => String(n).padStart(2, '0');

export const DEFAULT_DAILY_SLOTS = ['08:00', '11:00', '14:00', '18:00'];

export function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function normalizeSlotTime(time) {
  if (!time) return '08:00:00';
  const parts = String(time).trim().slice(0, 5).split(':');
  return `${pad(Number(parts[0]) || 8)}:${pad(Number(parts[1]) || 0)}:00`;
}

/** Gán lịch: bài i → ngày floor(i/slots) + giờ slots[i % slots]. */
export function buildBulkSchedulePlan(postCount, startDate, times) {
  const slots = times.filter(Boolean).map((t) => t.slice(0, 5));
  if (!slots.length || !startDate || postCount <= 0) return [];

  return Array.from({ length: postCount }, (_, index) => {
    const dayOffset = Math.floor(index / slots.length);
    const time = slots[index % slots.length];
    return {
      index,
      date: addDaysToDateString(startDate, dayOffset),
      time,
      scheduled_at: `${addDaysToDateString(startDate, dayOffset)} ${normalizeSlotTime(time)}`,
    };
  });
}

export function describeBulkPlan(postCount, times) {
  const slotsPerDay = times.filter(Boolean).length;
  if (!slotsPerDay || !postCount) return '';
  const days = Math.ceil(postCount / slotsPerDay);
  return `${postCount} bài → ${days} ngày × ${slotsPerDay} bài/ngày`;
}

export function getDefaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
