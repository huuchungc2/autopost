const pad = (n) => String(n).padStart(2, '0');

export const INTERVAL_OPTIONS = [
  { value: 10, label: '10 phút' },
  { value: 20, label: '20 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
  { value: 120, label: '2 giờ' },
  { value: 1440, label: '1 ngày' },
];

export function formatDateLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeLocal(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeTimeForApi(time) {
  if (!time) return '08:00:00';
  if (time.length === 5) return `${time}:00`;
  return time;
}

/** Slot mặc định: 8h sáng ngày mai (hoặc 8h sáng hôm nay nếu còn sớm). */
export function getDefaultStartSlot() {
  const now = new Date();
  const slot = new Date(now);
  slot.setSeconds(0, 0);
  slot.setHours(8, 0, 0, 0);

  if (now.getHours() >= 8) {
    slot.setDate(slot.getDate() + 1);
  }

  return {
    scheduled_date: formatDateLocal(slot),
    scheduled_time: formatTimeLocal(slot),
  };
}

export function toLocalDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.slice(0, 5).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0, 0);
}

export function addMinutesToSlot(dateStr, timeStr, minutes) {
  const base = toLocalDateTime(dateStr, timeStr) || new Date();
  base.setMinutes(base.getMinutes() + minutes);
  return {
    scheduled_date: formatDateLocal(base),
    scheduled_time: formatTimeLocal(base),
  };
}

/** Bài tiếp theo = bài cuối + khoảng cách; nếu chưa có lịch thì dùng mặc định. */
export function getNextJobSlot(jobs, intervalMinutes) {
  const last = jobs[jobs.length - 1];
  if (last?.scheduled_date && last?.scheduled_time) {
    return addMinutesToSlot(last.scheduled_date, last.scheduled_time, intervalMinutes);
  }
  return getDefaultStartSlot();
}

/** Tính lại giờ cho tất cả bài từ bài đầu + khoảng cách × thứ tự. */
export function recalculateJobSchedule(jobs, intervalMinutes) {
  if (!jobs.length) return jobs;

  const first = jobs[0];
  const anchor = first.scheduled_date && first.scheduled_time
    ? { scheduled_date: first.scheduled_date, scheduled_time: first.scheduled_time }
    : getDefaultStartSlot();

  return jobs.map((job, index) => {
    if (index === 0) {
      if (job.repeat_daily) {
        return { ...job, scheduled_time: anchor.scheduled_time, scheduled_date: '' };
      }
      return { ...job, ...anchor };
    }
    const slot = addMinutesToSlot(anchor.scheduled_date, anchor.scheduled_time, intervalMinutes * index);
    if (job.repeat_daily) {
      return { ...job, scheduled_time: slot.scheduled_time, scheduled_date: '' };
    }
    return { ...job, ...slot };
  });
}

export function createEmptyJob(jobs, intervalMinutes) {
  const slot = getNextJobSlot(jobs, intervalMinutes);
  return { topic: '', repeat_daily: false, ...slot };
}
