window.GF = window.GF || {};

GF.scheduler = {
  // 2026-07-13 — giữ ĐỒNG BỘ với map tương ứng trong `background.js` (`getSecurityDelays()`) —
  // 2 bản sao độc lập (context sidepanel vs service worker), nhớ đổi cả 2 nếu sửa lại lần nữa.
  // `betweenPosts` đổi từ số cố định sang range thật — khoảng cách +0-60s cũ quá hẹp, dễ lộ chu
  // kỳ đăng bài đều đặn giống máy chạy tự động.
  DELAYS: {
    fast: { betweenGroups: [5, 60], betweenPosts: [120, 300], betweenComments: [90, 180], dailyJitter: [0, 300] },
    balanced: { betweenGroups: [180, 300], betweenPosts: [300, 600], betweenComments: [180, 300], dailyJitter: [0, 600] },
    safe: { betweenGroups: [420, 600], betweenPosts: [600, 1200], betweenComments: [300, 600], dailyJitter: [0, 900] },
  },

  async getDelays(level) {
    const d = await GF.storage.get(['securityLevel']);
    const key = level || d.securityLevel || 'balanced';
    return this.DELAYS[key] || this.DELAYS.balanced;
  },

  randBetween([min, max]) {
    return min + Math.floor(Math.random() * (max - min + 1));
  },

  isNightBlocked() {
    const h = new Date().getHours();
    return h >= 22 || h < 7;
  },

  async scheduleAlarm(name, whenMs, data) {
    await chrome.alarms.clear(name);
    chrome.alarms.create(name, { when: whenMs });
    await GF.storage.set({ [`alarm_${name}`]: data });
  },

  async getAlarmData(name) {
    const d = await GF.storage.get(`alarm_${name}`);
    return d[`alarm_${name}`];
  },

  async clearAlarm(name) {
    await chrome.alarms.clear(name);
    await chrome.storage.local.remove(`alarm_${name}`);
  },

  parseScheduleDate(ngayDang, gioDang) {
    if (!ngayDang || !gioDang) return null;
    const parts = String(gioDang).trim().split(':');
    if (parts.length < 2) return null;
    const hh = String(Number(parts[0])).padStart(2, '0');
    const mm = String(parts[1]).slice(0, 2).padStart(2, '0');
    const iso = `${String(ngayDang).trim()}T${hh}:${mm}:00`;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
  },
};
