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
      'textProviderId', 'imageProviderId',
      'routerApiKey', 'driveJson', 'driveFolderId',
      'maxGroups', 'securityLevel', 'avoidNight', 'fbLang', 'retryMissed', 'postMode', 'classicFallbackOnFastFail',
      'tidienAutoSyncEnabled', 'tidienAutoSyncMinutes', 'tidienAutoPullDrafts',
      'fbUser', 'extractedGroups', 'selectedGroupIds', 'fbProfiles', 'activeActorId',
      'groupImageScheduleEnabled', 'groupImageScheduleStart', 'groupImageScheduleEnd',
      'groupImageScheduleInterval',
      'imageSaveLocal', 'imageSaveSubfolder', 'imageSaveMode', 'imageSaveDirName', 'imageSaveAskEachTime',
      'groupsByActor',
    ]);
    return {
      tidienBaseUrl: d.tidienBaseUrl || 'https://tidien.xyz',
      tidienToken: d.tidienToken || '',
      tidienApiKey: d.tidienApiKey || '',
      tidienUser: d.tidienUser || null,
      textProviderId: d.textProviderId ? Number(d.textProviderId) : null,
      imageProviderId: d.imageProviderId ? Number(d.imageProviderId) : null,
      routerApiKey: d.routerApiKey || '',
      driveJson: d.driveJson || '',
      driveFolderId: d.driveFolderId || '',
      maxGroups: d.maxGroups ?? 10,
      securityLevel: d.securityLevel || 'balanced',
      avoidNight: d.avoidNight !== false,
      fbLang: d.fbLang || 'vi',
      retryMissed: d.retryMissed !== false,
      postMode: d.postMode === 'classic' ? 'classic' : 'fast',
      classicFallbackOnFastFail: d.classicFallbackOnFastFail === true,
      tidienAutoSyncEnabled: d.tidienAutoSyncEnabled !== false,
      tidienAutoSyncMinutes: Math.max(5, Number(d.tidienAutoSyncMinutes) || 10),
      tidienAutoPullDrafts: d.tidienAutoPullDrafts !== false,
      fbUser: d.fbUser || null,
      fbProfiles: d.fbProfiles || null,
      activeActorId: d.activeActorId || d.fbUser?.id || null,
      extractedGroups: d.extractedGroups || [],
      selectedGroupIds: d.selectedGroupIds || [],
      groupImageScheduleEnabled: d.groupImageScheduleEnabled === true,
      groupImageScheduleStart: d.groupImageScheduleStart ?? 1,
      groupImageScheduleEnd: d.groupImageScheduleEnd ?? 5,
      groupImageScheduleInterval: d.groupImageScheduleInterval ?? 10,
      imageSaveLocal: d.imageSaveLocal !== false,
      imageSaveSubfolder: d.imageSaveSubfolder || 'GroupFlow',
      imageSaveMode: d.imageSaveMode || 'downloads',
      imageSaveDirName: d.imageSaveDirName || '',
      imageSaveAskEachTime: d.imageSaveAskEachTime === true,
      groupsByActor: d.groupsByActor || {},
    };
  },
  async saveSettings(patch) {
    return this.set(patch);
  },
};
