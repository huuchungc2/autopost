window.GF = window.GF || {};

GF.storage = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },
  async set(data) {
    return chrome.storage.local.set(data);
  },
  async getSettings() {
    const d = await this.get([
      'tidienBaseUrl', 'tidienToken', 'tidienApiKey', 'tidienUser',
      'routerApiKey', 'driveJson', 'driveFolderId',
      'maxGroups', 'securityLevel', 'avoidNight', 'fbLang', 'retryMissed',
      'fbUser', 'extractedGroups', 'selectedGroupIds',
    ]);
    return {
      tidienBaseUrl: d.tidienBaseUrl || 'https://tidien.xyz',
      tidienToken: d.tidienToken || '',
      tidienApiKey: d.tidienApiKey || '',
      tidienUser: d.tidienUser || null,
      routerApiKey: d.routerApiKey || '',
      driveJson: d.driveJson || '',
      driveFolderId: d.driveFolderId || '',
      maxGroups: d.maxGroups ?? 10,
      securityLevel: d.securityLevel || 'balanced',
      avoidNight: d.avoidNight !== false,
      fbLang: d.fbLang || 'vi',
      retryMissed: d.retryMissed !== false,
      fbUser: d.fbUser || null,
      extractedGroups: d.extractedGroups || [],
      selectedGroupIds: d.selectedGroupIds || [],
    };
  },
  async saveSettings(patch) {
    return this.set(patch);
  },
};
