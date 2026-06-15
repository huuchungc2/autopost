/** Lịch dương (Gregorian) — múi giờ local, định dạng vi-VN */

const LOCALE = 'vi-VN';
const GREGORY = { calendar: 'gregory' };

const pad = (n) => String(n).padStart(2, '0');

/** Parse datetime từ API (MySQL "YYYY-MM-DD HH:mm:ss" hoặc ISO) thành Date local */
export function parseApiDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const mysqlMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (mysqlMatch && !value.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(value)) {
      const [, y, m, d, hh = '0', mm = '0', ss = '0'] = mysqlMatch;
      return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** YYYY-MM-DD theo ngày dương lịch local */
export function toDateKey(value) {
  const date = parseApiDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** So sánh/sắp xếp theo thời gian */
export function compareApiDates(a, b) {
  const da = parseApiDate(a);
  const db = parseApiDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}

/** Hiển thị ngày: dd/mm/yyyy */
export function formatDate(value, options = {}) {
  const date = parseApiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(LOCALE, {
    ...GREGORY,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(date);
}

/** Hiển thị ngày giờ: dd/mm/yyyy, HH:mm */
export function formatDateTime(value) {
  const date = parseApiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(LOCALE, {
    ...GREGORY,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Tiêu đề tháng: "tháng 6 năm 2025" */
export function formatMonthYear(year, monthIndex) {
  return new Intl.DateTimeFormat(LOCALE, {
    ...GREGORY,
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1));
}

/** Giá trị cho input datetime-local */
export function toDatetimeLocalInput(value) {
  const date = parseApiDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Gửi API từ datetime-local → MySQL DATETIME */
export function fromDatetimeLocalInput(value) {
  if (!value) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  return normalized.replace('T', ' ');
}

/** Lưới tháng dương lịch — tuần bắt đầu Thứ Hai */
export function buildGregorianMonthGrid(year, monthIndex) {
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function dateKeyFromParts(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function todayDateKey() {
  return toDateKey(new Date());
}

export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
