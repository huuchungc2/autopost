window.GF = window.GF || {};

GF.leadRadar = {
  async getConfig() {
    const d = await GF.storage.get([
      'radarActive', 'radarKeywords', 'radarGroupIds', 'radarInterval',
      'radarInPage', 'radarPush', 'radarLeads', 'radarLastScan',
    ]);
    return {
      active: !!d.radarActive,
      keywords: d.radarKeywords || '',
      groupIds: d.radarGroupIds || [],
      interval: d.radarInterval || 15,
      inPage: d.radarInPage !== false,
      push: d.radarPush !== false,
      leads: d.radarLeads || [],
      lastScan: d.radarLastScan || {},
    };
  },

  async saveConfig(patch) {
    return GF.storage.set(patch);
  },

  parseKeywords(text) {
    return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  },

  matchLead(text, keywords) {
    const lower = text.toLowerCase();
    const excludes = keywords.filter((k) => k.startsWith('-')).map((k) => k.slice(1).toLowerCase());
    const includes = keywords.filter((k) => !k.startsWith('-')).map((k) => k.toLowerCase());
    if (excludes.some((ex) => ex && lower.includes(ex))) return null;
    const matched = includes.filter((inc) => inc && lower.includes(inc));
    if (!matched.length) return null;
    return matched;
  },

  async addLead(lead) {
    const cfg = await this.getConfig();
    const leads = [lead, ...cfg.leads].slice(0, 500);
    await this.saveConfig({ radarLeads: leads });
    return leads;
  },

  async setAlarm(minutes) {
    await chrome.alarms.clear('radar_scan');
    if (minutes > 0) {
      chrome.alarms.create('radar_scan', { periodInMinutes: minutes });
    }
  },
};
