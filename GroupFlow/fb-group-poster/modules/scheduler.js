window.GF = window.GF || {};

GF.scheduler = {
  DELAYS: {
    fast: { betweenGroups: [60, 120], betweenPosts: 180, betweenComments: [90, 180] },
    balanced: { betweenGroups: [180, 300], betweenPosts: 420, betweenComments: [180, 300] },
    safe: { betweenGroups: [420, 600], betweenPosts: 900, betweenComments: [300, 600] },
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
    const iso = `${ngayDang}T${gioDang}:00`;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
  },
};
