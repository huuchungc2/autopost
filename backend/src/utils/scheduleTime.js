const VN_OFFSET = '+07:00';

/** MySQL DATETIME lưu theo giờ VN (wall clock) → Date so sánh đúng múi giờ. */
export function parseMysqlDatetimeAsVn(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
  const date = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}${VN_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isScheduledInFuture(scheduledAt, now = new Date()) {
  const at = parseMysqlDatetimeAsVn(scheduledAt);
  if (!at) return false;
  return at.getTime() > now.getTime();
}
