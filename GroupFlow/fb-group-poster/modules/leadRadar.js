window.GF = window.GF || {};

GF.leadRadar = {
  async getConfig() {
    const d = await GF.storage.get([
      'radarActive', 'radarKeywords', 'radarGroupIds', 'radarInterval',
      'radarInPage', 'radarPush', 'radarLeads', 'radarLastScanAt',
      'radarMaxGroupsPerScan', 'radarScanCursor', 'radarSeenPostIds',
    ]);
    return {
      active: !!d.radarActive,
      keywords: d.radarKeywords || '',
      groupIds: d.radarGroupIds || [],
      interval: d.radarInterval || 15,
      inPage: d.radarInPage !== false,
      push: d.radarPush !== false,
      leads: d.radarLeads || [],
      lastScanAt: d.radarLastScanAt || {},
      maxGroupsPerScan: d.radarMaxGroupsPerScan || 10,
      scanCursor: d.radarScanCursor || 0,
      seenPostIds: d.radarSeenPostIds || [],
    };
  },

  async saveConfig(patch) {
    return GF.storage.set(patch);
  },

  parseKeywords(text) {
    return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  },

  async setAlarm(minutes) {
    await chrome.alarms.clear('radar_scan');
    if (minutes > 0) {
      chrome.alarms.create('radar_scan', { periodInMinutes: minutes });
    }
  },
};
