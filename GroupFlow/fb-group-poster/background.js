importScripts('modules/swBundle.js');

console.info('[GroupFlow] SW v1.0.117 ready');

const GF_BRIDGE_VERSION = 9;

let tidienSyncInFlight = null;

const TIDIEN_SYNC = {
  MIN_INTERVAL_MS: 90_000,
  DRAFTS_INTERVAL_MS: 30 * 60_000,
  BATCH_SIZE: 20,
  BATCH_PAUSE_MS: 800,
  MAX_ROUNDS: 20,
  MAX_ROUNDS_FORCE: 40,
  CACHE_MAX_COMMENTS: 500,
};

/** Panel nổi trên trang (iframe) — giống GroupPostingPro, không mở tab Chrome. */
async function togglePanelOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await GF_BG.claimPanelTab(tab.id);
  const msg = { type: 'GF_TOGGLE_PANEL' };
  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['modules/gfPanelShell.js'],
      });
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['modules/gfPanelShell.js'],
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'GF_PANEL_RESET' }).catch(() => {});
      await chrome.tabs.sendMessage(tab.id, msg);
    }
  }
}

const GF_BG = {
  running: false,
  commentRunning: false,
  stopRequested: false,
  /** Media cho Cổ điển — tránh gửi base64 qua tabs.sendMessage (giới hạn ~64MB, hay lỗi ảnh lớn). */
  _classicMediaCache: new Map(),
  /** Một tab FB dùng chung cả batch đăng — không mở tab mới mỗi bài. */
  _postingFbTabId: null,
  _postingFbTabWarm: false,
  _lastClassicGroupId: null,

  async getPostingFbTabId() {
    if (!this._postingFbTabId) return null;
    try {
      const t = await chrome.tabs.get(this._postingFbTabId);
      if (t?.id && !t.incognito && /facebook\.com/i.test(t.url || '')) return t.id;
    } catch { /* tab đã đóng */ }
    this._postingFbTabId = null;
    this._postingFbTabWarm = false;
    this._lastClassicGroupId = null;
    return null;
  },

  async bindPostingFbTab(tab) {
    if (!tab?.id) return tab;
    this._postingFbTabId = tab.id;
    try {
      await chrome.storage.session.set({ gfPanelTabId: tab.id, gfPanelOpen: true });
    } catch { /* ignore */ }
    return tab;
  },

  async resolvePostingFbTab({ createIfMissing = true, forClassic = false } = {}) {
    const pinned = await this.getPostingFbTabId();
    if (pinned) return chrome.tabs.get(pinned);
    const tab = await this.getFbTab({ createIfMissing, forClassic });
    return this.bindPostingFbTab(tab);
  },

  resetPostingFbTab() {
    this._postingFbTabId = null;
    this._postingFbTabWarm = false;
    this._lastClassicGroupId = null;
  },

  async getPostMediaPack(postId) {
    if (!postId) return null;
    if (this._classicMediaCache.has(postId)) {
      return this._classicMediaCache.get(postId);
    }
    const PMS = globalThis.GF?.postMediaStore;
    if (!PMS) return null;
    const stub = { id: postId };
    await PMS.hydratePost(stub);
    const pack = PMS.pack(stub);
    if (pack) this._classicMediaCache.set(postId, pack);
    return pack || null;
  },

  stripMediaFromPayload(payload) {
    const lite = { ...payload };
    delete lite.imageBase64;
    delete lite.videoBase64;
    delete lite.images;
    delete lite._gfMediaBackup;
    return lite;
  },

  assertPostMediaReady(post) {
    const wantsMedia = post.mediaCached || post.mediaType === 'image' || post.mediaType === 'video'
      || post.imageStatus === 'ready';
    const PF = globalThis.GF?.postFormat;
    if (PF?.isColored?.(post.backgroundColor)) return;
    if (!wantsMedia) return;
    const PMS = globalThis.GF?.postMediaStore;
    if (PMS?.hasPayload(post)) return;
    throw new Error('Ảnh/video chưa load — Sửa bài, gắn lại media, bấm Thêm rồi đăng lại');
  },

  async injectFbBridge(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['selectors.js', 'modules/fbGraphApi.js', 'modules/fbActor.js', 'content.js'],
    });
  },

  async injectPanelShell(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['modules/gfPanelShell.js'],
    });
  },

  async claimPanelTab(tabId) {
    if (!tabId) return;
    try {
      const prev = await chrome.storage.session.get('gfPanelTabId');
      if (prev.gfPanelTabId && prev.gfPanelTabId !== tabId) {
        chrome.tabs.sendMessage(prev.gfPanelTabId, { type: 'GF_PANEL_CLOSE' }).catch(() => {});
      }
      await chrome.storage.session.set({ gfPanelTabId: tabId, gfPanelOpen: true });
    } catch { /* ignore */ }
  },

  async releasePanelTab(tabId) {
    try {
      const d = await chrome.storage.session.get(['gfPanelTabId', 'gfPostingActive']);
      if (d.gfPostingActive) return;
      if (tabId && d.gfPanelTabId && d.gfPanelTabId !== tabId) return;
      await chrome.storage.session.set({ gfPanelOpen: false });
    } catch { /* ignore */ }
  },

  async canRestorePanelOnTab(tabId) {
    if (!tabId) return false;
    const d = await chrome.storage.session.get(['gfPanelTabId', 'gfPanelOpen', 'gfPostingActive']);
    if (!d.gfPanelTabId || d.gfPanelTabId !== tabId) return false;
    return Boolean(d.gfPanelOpen || d.gfPostingActive);
  },

  async abortClassicPost() {
    const tabId = await this.getPostingFbTabId()
      || (await chrome.storage.session.get('gfPanelTabId').catch(() => ({}))).gfPanelTabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'GF_ABORT_POST' }).catch(() => {});
    }
  },

  async ensurePanelOpenOnTab(tabId) {
    if (!tabId) return;
    try {
      await this.claimPanelTab(tabId);
      const msg = { type: 'GF_PANEL_OPEN' };
      try {
        await chrome.tabs.sendMessage(tabId, msg);
      } catch {
        await this.injectPanelShell(tabId);
        await this.delay(300);
        await chrome.tabs.sendMessage(tabId, msg);
      }
    } catch { /* tab chưa sẵn sàng */ }
  },

  async markPostingSession(active, tabId) {
    try {
      const patch = { gfPostingActive: Boolean(active) };
      if (active) {
        patch.gfPanelOpen = true;
        if (tabId) patch.gfPanelTabId = tabId;
      } else {
        patch.gfPostingActive = false;
      }
      await chrome.storage.session.set(patch);
    } catch { /* ignore */ }
  },

  async ensureFbBridge(tabId, attempts = 12) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'GF_PING' });
        if (res?.ok && (res.v || 0) >= GF_BRIDGE_VERSION) return true;
        await this.injectFbBridge(tabId);
      } catch {
        try {
          await this.injectFbBridge(tabId);
        } catch {
          /* tab chưa sẵn sàng */
        }
        await this.delay(400 + i * 300);
      }
    }
    return false;
  },

  async findJoinsTab() {
    const tabs = await this.listFbTabs();
    return tabs.find((t) => !t.incognito && t.url?.includes('/groups/joins')) || null;
  },

  async getFbUserFromCookie() {
    try {
      const c = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
      return c?.value ? { id: c.value } : null;
    } catch {
      return null;
    }
  },

  async getFbUserBg() {
    const cookie = await this.getFbUserFromCookie();
    if (!cookie?.id) return null;
    const S = globalThis.GF?.fbSessionBg;
    if (S) {
      try {
        const session = await S.resolveSession();
        const id = session.actorId || session.uid || cookie.id;
        return { id, name: `Facebook (${id})`, type: session.actingId ? 'page' : 'personal' };
      } catch {
        /* cookie có nhưng session chưa đủ — vẫn hiện id */
      }
    }
    return { id: cookie.id, name: `FB #${String(cookie.id).slice(-4)}`, type: 'personal' };
  },

  async listFbTabs() {
    return chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
  },

  isFbLoginUrl(url = '') {
    const u = String(url).toLowerCase();
    return u.includes('/login') || u.includes('checkpoint') || u.includes('/recover');
  },

  async getNormalWindowId() {
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    return wins.find((w) => !w.incognito)?.id ?? null;
  },

  scoreFbTab(tab, focusedWindowId) {
    let score = 0;
    const url = tab.url || '';
    if (!tab.incognito) score += 200;
    else score -= 1000;
    if (focusedWindowId && tab.windowId === focusedWindowId) score += 80;
    if (tab.active) score += 50;
    if (url.includes('www.facebook.com')) score += 40;
    if (url.includes('/groups/')) score += 30;
    if (this.isFbLoginUrl(url)) score -= 500;
    return score;
  },

  async pickBestFbTab(tabs) {
    const pool = tabs.filter((t) => !t.incognito);
    if (!pool.length) return null;
    const win = await chrome.windows.getLastFocused({ populate: false }).catch(() => null);
    const focusedId = win && !win.incognito ? win.id : await this.getNormalWindowId();
    return pool
      .map((tab) => ({ tab, score: this.scoreFbTab(tab, focusedId) }))
      .sort((a, b) => b.score - a.score)[0].tab;
  },

  async assertFbLoggedInCookie() {
    const user = await this.getFbUserFromCookie();
    if (!user?.id) {
      throw new Error(
        'Chưa đăng nhập Facebook — mở facebook.com trong cửa sổ Chrome thường (không ẩn danh), đăng nhập, F5 rồi thử lại',
      );
    }
    return user;
  },

  async verifyTabFbSession(tabId) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'GF_GET_FB_USER' });
      if (res?.user?.id) return res.user;
    } catch { /* chưa inject */ }
    return null;
  },

  async getFbTab({ createIfMissing = true, forClassic = false } = {}) {
    if (this.running) {
      const pinned = await this.getPostingFbTabId();
      if (pinned) return chrome.tabs.get(pinned);
    }
    const tabs = await this.listFbTabs();
    const existing = await this.pickBestFbTab(tabs);
    if (existing) {
      if (this.running) await this.bindPostingFbTab(existing);
      return existing;
    }

    if (!createIfMissing) return null;

    await this.assertFbLoggedInCookie();

    const windowId = await this.getNormalWindowId();
    if (!windowId) {
      throw new Error(
        'Không có cửa sổ Chrome thường — đóng cửa sổ ẩn danh, mở facebook.com và đăng nhập rồi thử lại',
      );
    }

    const tab = await chrome.tabs.create({
      url: forClassic ? 'https://www.facebook.com/' : 'https://www.facebook.com/groups/joins/',
      active: forClassic,
      windowId,
    });
    await this.waitForTabLoad(tab.id);
    await this.ensureFbBridge(tab.id, forClassic ? 15 : 8);
    if (this.running) await this.bindPostingFbTab(tab);
    return tab;
  },

  async waitForTabLoad(tabId, timeout = 20000) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === 'complete') return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeout);
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  },

  isFallbackGroupName(name) {
    return /^Group \d{5,}$/.test(String(name || '').trim());
  },

  groupsNeedFullResync(groups) {
    if (!groups.length) return true;
    const fallback = groups.filter((g) => /^Group \d{5,}$/.test(String(g.name || '').trim())).length;
    return fallback / groups.length > 0.5;
  },

  cacheLooksBloated(groups) {
    return groups.length > 50;
  },

  async fetchGroupsFromSession({ lite = true } = {}) {
    try {
      const FB = globalThis.GF?.fbGroupsBg;
      if (!FB) return { groups: [] };
      return lite ? await FB.fetchJoinedGroupsLite() : await FB.fetchJoinedGroupsQuick();
    } catch (e) {
      return { groups: [], error: e.message };
    }
  },

  unionGroupLists(...lists) {
    const merged = new Map();
    lists.flat().forEach((g) => {
      if (g?.id) merged.set(String(g.id), g);
    });
    return [...merged.values()];
  },

  async prefetchGroups() {
    const cached = (await chrome.storage.local.get('extractedGroups')).extractedGroups || [];
    if (cached.length) return { groups: cached, count: cached.length };
    return this.fetchGroupsFromSession({ lite: true });
  },

  async passiveExtractFromJoinsTabs() {
    const tabs = await this.listFbTabs();
    const merged = new Map();
    for (const tab of tabs) {
      if (tab.incognito || !tab.url?.includes('/groups/joins')) continue;
      try {
        const ready = await this.ensureFbBridge(tab.id, 3);
        if (!ready) continue;
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GF_EXTRACT_GROUPS_QUICK' });
        (res?.groups || []).forEach((g) => merged.set(String(g.id), g));
      } catch { /* tab chưa sẵn sàng */ }
    }
    return [...merged.values()];
  },

  async getExpectedJoinedGroupCount() {
    try {
      const tab = await this.findJoinsTab();
      if (!tab?.id) return null;
      const ready = await this.ensureFbBridge(tab.id, 3);
      if (!ready) return null;
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GF_GET_JOINS_COUNT' });
      const n = Number(res?.count);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  },

  mergeGroupNames(freshGroups, cached) {
    const cacheMap = new Map((cached || []).map((g) => [String(g.id), g]));
    const GP = globalThis.GF?.groupParse;
    return freshGroups.map((g) => {
      const id = String(g.id);
      let name = g.name;
      const cachedG = cacheMap.get(id);
      if (cachedG?.name && !this.isFallbackGroupName(cachedG.name) && this.isFallbackGroupName(name)) {
        name = cachedG.name;
      }
      const base = { ...g, id, name };
      return cachedG && GP?.mergeGroupEntry ? GP.mergeGroupEntry(cachedG, base) : base;
    });
  },

  async syncGroups({ forceRefresh = false, passive = true, deep = false, enrich = false } = {}) {
    const cached = (await chrome.storage.local.get('extractedGroups')).extractedGroups || [];
    let merged = new Map();
    let lastError;

    const useLite = passive && !deep && !forceRefresh;
    const session = await this.fetchGroupsFromSession({ lite: useLite });
    (session.groups || []).forEach((g) => merged.set(String(g.id), g));
    if (!merged.size) lastError = session.error;

    let expectedCount = null;
    if (!useLite && !deep) {
      try {
        const quick = await this.passiveExtractFromJoinsTabs();
        quick.forEach((g) => merged.set(String(g.id), g));
      } catch { /* ignore */ }
    }

    if (deep) {
      expectedCount = await this.getExpectedJoinedGroupCount();
    }
    const looksShort = expectedCount
      ? (merged.size > 0 && merged.size < expectedCount)
      : false;

    try {
      if (deep || (forceRefresh && looksShort)) {
        const full = await this.extractGroupsFromFb({
          navigate: true,
          deep: true,
          skipSession: true,
        });
        (full.groups || []).forEach((g) => merged.set(String(g.id), g));
      }
    } catch (e) {
      console.warn('Deep group extract failed', e.message);
    }

    if (!passive && forceRefresh && !merged.size) {
      const full = await this.extractGroupsFromFb({ navigate: true, deep: false, skipSession: true });
      lastError = full.error;
      (full.groups || []).forEach((g) => merged.set(String(g.id), g));
    }

    cached.forEach((g) => merged.set(String(g.id), g));

    const groups = this.mergeGroupNames([...merged.values()], cached)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    let finalGroups = groups;
    const FB = globalThis.GF?.fbGroupsBg;
    if (enrich && FB && groups.length) {
      try {
        finalGroups = await FB.enrichGroupsMetadata(groups, {
          max: Math.min(groups.length, deep ? 100 : 20),
        });
      } catch { /* giữ bản chưa enrich */ }
    }

    if (finalGroups.length) {
      await chrome.storage.local.set({ extractedGroups: finalGroups, groupsSyncedAt: Date.now() });
    }
    return {
      groups: finalGroups,
      count: finalGroups.length,
      expectedCount,
      error: finalGroups.length ? undefined : (lastError || 'Đăng nhập Facebook trên Chrome rồi bấm ↻'),
    };
  },

  async syncGroupsInBackground() {
    try {
      const res = await this.syncGroups({
        forceRefresh: true,
        passive: false,
        deep: false,
        enrich: false,
      });
      chrome.runtime.sendMessage({
        type: 'GF_GROUPS_SYNCED',
        groups: res.groups,
        count: res.count,
        expectedCount: res.expectedCount,
        error: res.error,
      }).catch(() => {});
      return res;
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'GF_GROUPS_SYNCED',
        error: e.message,
      }).catch(() => {});
      return { groups: [], error: e.message };
    }
  },

  async extractGroupsFromFb({ navigate = false, deep = false, skipSession = false } = {}) {
    const merged = new Map();

    if (!skipSession) {
      const session = await this.fetchGroupsFromSession({ lite: true });
      (session.groups || []).forEach((g) => merged.set(String(g.id), g));
    }

    let tab = await this.findJoinsTab();
    let lastError;

    if (!tab && navigate) {
      const any = await this.getFbTab({ createIfMissing: true });
      if (any) {
        await chrome.tabs.update(any.id, { url: 'https://www.facebook.com/groups/joins/', active: false });
        await this.waitForTabLoad(any.id);
        await this.delay(3500);
        tab = await chrome.tabs.get(any.id);
      }
    }

    if (!tab) {
      if (merged.size) {
        const cached = (await chrome.storage.local.get('extractedGroups')).extractedGroups || [];
        const groups = this.mergeGroupNames([...merged.values()], cached)
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        return { groups, count: groups.length };
      }
      return {
        groups: [],
        count: 0,
        error: 'Mở facebook.com/groups/joins trong tab Facebook — hoặc bấm ↻ để extension tự mở tab',
      };
    }

    const ready = await this.ensureFbBridge(tab.id, 4);
    if (!ready) {
      lastError = 'Tab Facebook chưa sẵn sàng — F5 trang joins rồi thử lại';
    } else {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: 'GF_EXTRACT_GROUPS',
          deep: Boolean(deep),
        });
        (res?.groups || []).forEach((g) => merged.set(String(g.id), g));
      } catch (e) {
        lastError = e.message;
        console.warn('Extract groups failed', e.message);
      }
    }

    const cached = (await chrome.storage.local.get('extractedGroups')).extractedGroups || [];
    const groups = this.mergeGroupNames([...merged.values()], cached)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return {
      groups,
      count: groups.length,
      error: groups.length ? undefined : lastError,
    };
  },

  async navigateFbTabToGroup(groupId, { active = false, forClassic = false } = {}) {
    await this.assertFbLoggedInCookie();
    const tab = this.running
      ? await this.resolvePostingFbTab({ createIfMissing: true, forClassic: forClassic || active })
      : await this.getFbTab({ createIfMissing: true, forClassic: forClassic || active });
    const gid = String(groupId);
    const url = `https://www.facebook.com/groups/${gid}`;
    const tabUrl = tab.url || '';
    const onGroupFeed = tabUrl.includes(`/groups/${gid}`)
      && !/\/groups\/\d+\/(about|members|media|events|files|chats|buy_sell|announcements|pending|posts)/i.test(tabUrl);
    const needsNav = !onGroupFeed;
    if (needsNav) {
      await chrome.tabs.update(tab.id, { url, active });
      await this.waitForTabLoad(tab.id);
    } else if (active) {
      await chrome.tabs.update(tab.id, { active: true });
    }
    const ready = await this.ensureFbBridge(tab.id, needsNav ? 15 : 8);
    if (!ready) {
      throw new Error('Không kết nối tab Facebook — mở facebook.com (cửa sổ thường), F5 trang, rồi thử lại');
    }
    const fresh = await chrome.tabs.get(tab.id).catch(() => tab);
    if (this.isFbLoginUrl(fresh.url)) {
      throw new Error('Tab Facebook chưa đăng nhập — dùng cửa sổ Chrome thường (không ẩn danh), đăng nhập FB rồi F5');
    }
    const user = await this.verifyTabFbSession(tab.id);
    if (!user?.id) {
      throw new Error('Facebook chưa load phiên đăng nhập — F5 tab facebook.com (cửa sổ thường) rồi thử Cổ điển lại');
    }
    return tab;
  },

  async sendToFb(type, payload = {}, { timeoutMs } = {}) {
    const classicPost = type === 'GF_POST' && (
      payload.postMode === 'classic'
      || payload.mediaType === 'video'
      || Boolean(payload.videoBase64)
    );
    const classicTimeout = classicPost
      ? (payload.mediaFromBg || payload.imageBase64 || payload.images?.length ? 240000 : 210000)
      : 120000;
    const effectiveTimeout = timeoutMs ?? classicTimeout;
    let tab;
    if (classicPost && payload.groupId) {
      await this.preparePostActorCookie(payload.actorId);
      const firstClassicFocus = !this._postingFbTabWarm;
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: {
          phase: 'classic-nav',
          group: payload.groupName || payload.groupId,
          snippet: firstClassicFocus
            ? 'Cổ điển: 1 tab FB dùng chung — mở nhóm…'
            : `Cổ điển: cùng tab FB → nhóm ${payload.groupName || payload.groupId}`,
        },
      }).catch(() => {});
      tab = await this.navigateFbTabToGroup(payload.groupId, {
        active: firstClassicFocus,
        forClassic: firstClassicFocus,
      });
      await this.markPostingSession(true, tab.id);
      const gid = String(payload.groupId);
      const prevGroup = this._lastClassicGroupId;
      const switchedGroup = Boolean(prevGroup && prevGroup !== gid);
      this._lastClassicGroupId = gid;
      const freshTab = await chrome.tabs.get(tab.id).catch(() => tab);
      const tabUrl = freshTab.url || '';
      const onGroupFeed = tabUrl.includes(`/groups/${gid}`)
        && !/\/groups\/\d+\/(about|members|media|events|files|chats|buy_sell|announcements|pending|posts)/i.test(tabUrl);
      const needsGroupUrl = !onGroupFeed;
      if (needsGroupUrl) {
        const groupUrl = `https://www.facebook.com/groups/${gid}`;
        await chrome.tabs.update(tab.id, { url: groupUrl, active: firstClassicFocus });
        await this.waitForTabLoad(tab.id);
        tab = await chrome.tabs.get(tab.id);
      }
      const waitMs = !this._postingFbTabWarm
        ? 7000
        : (needsGroupUrl || switchedGroup ? 6500 : 1800);
      if (!this._postingFbTabWarm) this._postingFbTabWarm = true;
      await this.interruptibleDelayWithProgress(waitMs, {
        phase: 'classic-nav',
        group: payload.groupName || gid,
        snippet: needsGroupUrl || switchedGroup
          ? 'Chờ Facebook load feed nhóm…'
          : 'Chuẩn bị tab Facebook…',
      });
      await this.ensureFbBridge(tab.id, 12);
      await this.ensurePanelOpenOnTab(tab.id);
      const runPrepare = async () => {
        try {
          return await chrome.tabs.sendMessage(tab.id, {
            type: 'GF_PREPARE_CLASSIC_POST',
            groupId: gid,
          });
        } catch {
          return { ready: false };
        }
      };
      let prep = await runPrepare();
      if (!prep?.ready) {
        await this.interruptibleDelayWithProgress(switchedGroup ? 3500 : 2200, {
          phase: 'classic-composer',
          group: payload.groupName || gid,
          snippet: 'Đang tìm ô soạn bài trên nhóm…',
        });
        prep = await runPrepare();
      }
      if (!prep?.ready) {
        await this.interruptibleDelay(2000);
        chrome.runtime.sendMessage({
          type: 'GF_PROGRESS',
          data: {
            phase: 'classic-composer',
            group: payload.groupName || gid,
            snippet: 'Composer nhóm chậm load — vẫn thử mở…',
          },
        }).catch(() => {});
      }
    } else if (type === 'GF_COMMENT' && payload.groupId && payload.postId) {
      const tab0 = await this.getFbTab();
      const url = `https://www.facebook.com/groups/${payload.groupId}/posts/${payload.postId}`;
      if (!tab0.url?.includes(`/groups/${payload.groupId}/posts/${payload.postId}`)) {
        await chrome.tabs.update(tab0.id, { url });
        await this.waitForTabLoad(tab0.id);
      }
      const ready = await this.ensureFbBridge(tab0.id, 10);
      if (!ready) throw new Error('Không kết nối tab Facebook — F5 trang rồi thử lại');
      tab = tab0;
    } else if (type === 'GF_COMMENT' && payload.groupId) {
      tab = await this.navigateFbTabToGroup(payload.groupId);
    } else {
      tab = await this.getFbTab();
      const ready = await this.ensureFbBridge(tab.id);
      if (!ready) {
        throw new Error('Không kết nối tab Facebook — mở facebook.com, F5 trang, rồi thử lại');
      }
    }
    let outbound = { type, ...payload };
    if (type === 'GF_POST' && classicPost && payload.queuePostId) {
      const pack = await this.getPostMediaPack(payload.queuePostId);
      if (pack) this._classicMediaCache.set(payload.queuePostId, pack);
      outbound = {
        type,
        ...this.stripMediaFromPayload(payload),
        queuePostId: payload.queuePostId,
        mediaFromBg: Boolean(pack),
      };
    }
    const sendPromise = chrome.tabs.sendMessage(tab.id, outbound);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(
        'Cổ điển quá lâu (timeout) — F5 tab Facebook rồi đăng lại',
      )), effectiveTimeout);
    });
    const stopPromise = (async () => {
      while (!this.stopRequested) await this.delay(350);
      throw new Error('Đã dừng đăng');
    })();
    const res = await Promise.race([sendPromise, timeoutPromise, stopPromise]);
    if (payload.queuePostId) this._classicMediaCache.delete(payload.queuePostId);
    if (classicPost && tab?.id) {
      await this.ensurePanelOpenOnTab(tab.id);
    }
    if (res && res.ok === false) {
      throw new Error(res.error || 'Thao tác Facebook thất bại');
    }
    return res;
  },

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  async interruptibleDelay(ms) {
    const step = 400;
    for (let t = 0; t < ms; t += step) {
      if (this.stopRequested) throw new Error('Đã dừng đăng');
      await this.delay(Math.min(step, ms - t));
    }
  },

  async interruptibleDelayWithProgress(ms, progress = {}) {
    if (!ms || ms <= 0) return;
    const tickMs = 1000;
    const start = Date.now();
    let lastEmit = 0;
    while (Date.now() - start < ms) {
      if (this.stopRequested) throw new Error('Đã dừng đăng');
      const elapsed = Date.now() - start;
      const remainSec = Math.max(0, Math.ceil((ms - elapsed) / 1000));
      if (elapsed < tickMs || Date.now() - lastEmit >= tickMs) {
        this.emitProgress({
          ...progress,
          pauseRemainSec: remainSec,
          snippet: progress.snippet,
        });
        lastEmit = Date.now();
      }
      const left = ms - elapsed;
      await this.delay(Math.min(tickMs, left));
    }
  },

  async getSecurityDelays(level) {
    const s = await chrome.storage.local.get('securityLevel');
    const key = level || s.securityLevel || 'balanced';
    const map = {
      fast: { betweenGroups: [60, 120], betweenPosts: 180, betweenComments: [90, 180] },
      balanced: { betweenGroups: [180, 300], betweenPosts: 420, betweenComments: [180, 300] },
      safe: { betweenGroups: [420, 600], betweenPosts: 900, betweenComments: [300, 600] },
    };
    return map[key] || map.balanced;
  },

  pauseDelayMs(minMinutes, maxMinutes) {
    const min = Math.max(0, Number(minMinutes) || 0);
    const max = Math.max(min, Number(maxMinutes) || min);
    if (!max && !min) return 0;
    const chosen = min >= max ? min : min + Math.random() * (max - min);
    return Math.round(chosen * 60 * 1000);
  },

  resolvePostAutomation(post, settings = {}) {
    const pauseEvery = Math.max(1, Number(settings.pauseEveryGroups ?? post.pauseEvery) || 1);
    const pauseMin = Math.max(0, Number(settings.pauseMinutesMin ?? post.pauseMinutesMin ?? post.pauseMinutes ?? 1) || 1);
    const pauseMax = Math.max(pauseMin, Number(settings.pauseMinutesMax ?? post.pauseMinutesMax ?? post.pauseMinutes ?? 3) || 3);
    return {
      postMode: 'classic',
      classicTextMode: post.classicTextMode || settings.classicTextMode || 'hybrid',
      securityLevel: post.securityLevel || settings.securityLevel || 'balanced',
      avoidNight: post.avoidNight !== undefined ? post.avoidNight : settings.avoidNight !== false,
      pauseEvery,
      pauseMinutesMin: pauseMin,
      pauseMinutesMax: pauseMax,
      delayOnFail: Boolean(post.delayOnFail),
    };
  },

  async waitAfterPostAttempt({
    post, settings, postsSincePause, hadError, postedOk, hasMoreInGroup, hasMorePosts, done, total,
  }) {
    const auto = this.resolvePostAutomation(post, settings);
    const shouldWait = postedOk || (hadError && auto.delayOnFail);
    if (!shouldWait) return postsSincePause;
    if (!hasMoreInGroup && !hasMorePosts) return postsSincePause;

    let count = postsSincePause + 1;
    if (count >= auto.pauseEvery) {
      const ms = this.pauseDelayMs(auto.pauseMinutesMin, auto.pauseMinutesMax);
      if (ms > 0) {
        const label = auto.pauseMinutesMin === auto.pauseMinutesMax
          ? `${auto.pauseMinutesMin} phút`
          : `${auto.pauseMinutesMin}–${auto.pauseMinutesMax} phút`;
        await this.interruptibleDelayWithProgress(ms, {
          phase: 'pause',
          done,
          total,
          snippet: `Nghỉ ${label} (ngẫu nhiên) — ${done}/${total} nhóm xong`,
        });
      }
      return 0;
    }

    const delays = await this.getSecurityDelays(auto.securityLevel);
    const sec = this.randBetween(delays.betweenGroups);
    if (sec > 0 && (hasMoreInGroup || hasMorePosts)) {
      await this.interruptibleDelayWithProgress(sec * 1000, {
        phase: 'pause',
        done,
        total,
        snippet: `Chờ ${sec}s trước nhóm tiếp (${done}/${total})…`,
      });
    }
    return count;
  },

  randBetween([a, b]) {
    return a + Math.floor(Math.random() * (b - a + 1));
  },

  async appendHistory(entry) {
    const d = await chrome.storage.local.get('activityHistory');
    const list = d.activityHistory || [];
    const enriched = { ...entry, at: new Date().toISOString() };
    if (!enriched.url && enriched.group_id && enriched.post_id && enriched.post_id !== 'pending') {
      const pid = String(enriched.post_id);
      if (/^\d+$/.test(pid)) {
        enriched.url = `https://www.facebook.com/groups/${enriched.group_id}/posts/${pid}/`;
      }
    }
    list.unshift(enriched);
    const trimmed = list.slice(0, 300);
    await chrome.storage.local.set({ activityHistory: trimmed });
    chrome.runtime.sendMessage({
      type: 'GF_ACTIVITY_REFRESH',
      data: { entry: enriched, total: trimmed.length },
    }).catch(() => {});
  },

  shouldLogProgress(data = {}) {
    const p = data.phase || '';
    if (data.error) return true;
    if (['error', 'done', 'stopped', 'started'].includes(p)) return true;
    if (p.startsWith('classic-')) return true;
    if (p === 'generating' || p === 'classic-nav') return true;
    if (p === 'posting' && data.snippet) return true;
    if (p === 'pause' && data.pauseRemainSec != null && data.pauseRemainSec <= 8) return true;
    if (p === 'ok') return true;
    return false;
  },

  async appendEngineLog(entry) {
    const d = await chrome.storage.local.get('engineLog');
    const list = d.engineLog || [];
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      level: entry.level || 'info',
      phase: entry.phase || '',
      message: String(entry.message || entry.snippet || '').slice(0, 500),
      group: entry.group || entry.groupName || '',
      groupId: entry.groupId ? String(entry.groupId) : '',
      error: entry.error ? String(entry.error).slice(0, 800) : '',
      source: entry.source || 'engine',
      postId: entry.postId ? String(entry.postId) : '',
    };
    if (!row.message && !row.error && !row.phase) return row;
    list.unshift(row);
    const trimmed = list.slice(0, 400);
    await chrome.storage.local.set({ engineLog: trimmed });
    chrome.runtime.sendMessage({
      type: 'GF_ENGINE_LOG',
      data: { entry: row, total: trimmed.length },
    }).catch(() => {});
    return row;
  },

  logProgress(data = {}, source = 'engine') {
    if (!this.shouldLogProgress(data)) return;
    const phase = data.phase || '';
    let level = 'info';
    if (phase === 'error' || data.error) level = 'error';
    else if (phase === 'ok' || phase === 'done') level = 'ok';
    else if (phase === 'stopped') level = 'warn';
    const message = data.snippet
      || (data.group && phase === 'posting' ? `Đang đăng: ${data.group}` : '')
      || phase;
    this.appendEngineLog({
      level,
      phase,
      message,
      group: data.group || data.groupName,
      groupId: data.groupId,
      error: data.error,
      source,
    }).catch(() => {});
  },

  emitProgress(data) {
    chrome.runtime.sendMessage({ type: 'GF_PROGRESS', data }).catch(() => {});
  },

  async getMediaSettings() {
    const s = await chrome.storage.local.get([
      'routerApiKey', 'tidienBaseUrl', 'tidienToken', 'tidienApiKey', 'imageProviderId',
    ]);
    return {
      routerApiKey: s.routerApiKey || '',
      tidienBaseUrl: s.tidienBaseUrl || 'https://tidien.xyz',
      tidienToken: s.tidienToken || '',
      tidienApiKey: s.tidienApiKey || '',
      imageProviderId: s.imageProviderId ? Number(s.imageProviderId) : null,
    };
  },

  async runImageGenerate(payload) {
    let post = payload?.posts?.[0];
    if (!post) return;
    const d = await chrome.storage.local.get('postQueue');
    const fresh = (d.postQueue || []).find((p) => p.id === post.id);
    if (fresh) post = fresh;
    const PMS = globalThis.GF?.postMediaStore;
    if (PMS) await PMS.hydratePost(post);
    const PM = globalThis.GF?.postMedia;
    if (!PM) throw new Error('Thiếu module postMedia');
    chrome.runtime.sendMessage({
      type: 'GF_PROGRESS',
      data: {
        phase: 'generating',
        post: post.noi_dung?.slice(0, 40) || '',
        snippet: 'Đang xuất ảnh AI…',
      },
    }).catch(() => {});
    const settings = await this.getMediaSettings();
    await PM.ensurePostMedia(post, settings);
    await this.appendHistory({
      type: 'image',
      ok: true,
      snippet: post.noi_dung?.slice(0, 80) || '',
      post_id: post.id,
    });
  },

  async tickGroupImageSchedule() {
    const cfg = await chrome.storage.local.get([
      'groupImageScheduleEnabled',
      'groupImageScheduleStart',
      'groupImageScheduleEnd',
      'groupImageScheduleInterval',
      'groupImageScheduleLastRun',
      'postQueue',
      'routerApiKey',
      'tidienBaseUrl',
      'tidienToken',
      'tidienApiKey',
      'imageProviderId',
    ]);
    if (!cfg.groupImageScheduleEnabled) return;

    const hour = new Date().getHours();
    const start = Number(cfg.groupImageScheduleStart ?? 1);
    const end = Number(cfg.groupImageScheduleEnd ?? 5);
    if (hour < start || hour >= end) return;

    const intervalMs = (Number(cfg.groupImageScheduleInterval) || 10) * 60 * 1000;
    if (cfg.groupImageScheduleLastRun && Date.now() - cfg.groupImageScheduleLastRun < intervalMs) return;

    const PM = globalThis.GF?.postMedia;
    if (!PM) return;
    const candidate = (cfg.postQueue || []).find((p) => PM.needsImageGeneration(p));
    if (!candidate) return;

    try {
      await PM.ensurePostMedia(candidate, {
        routerApiKey: cfg.routerApiKey,
        tidienBaseUrl: cfg.tidienBaseUrl || 'https://tidien.xyz',
        tidienToken: cfg.tidienToken || '',
        tidienApiKey: cfg.tidienApiKey || '',
        imageProviderId: cfg.imageProviderId ? Number(cfg.imageProviderId) : null,
      });
      await chrome.storage.local.set({ groupImageScheduleLastRun: Date.now() });
      await this.appendHistory({
        type: 'image',
        ok: true,
        snippet: candidate.noi_dung?.slice(0, 80) || '',
        post_id: candidate.id,
      });
    } catch (e) {
      console.warn('[GroupFlow] image schedule:', e.message);
      await this.appendHistory({
        type: 'image',
        ok: false,
        snippet: candidate.noi_dung?.slice(0, 80) || '',
        error: e.message,
      });
    }
  },

  resolvePostGroups(post, job, groupsMap) {
    const ids = post.groupIds || job.groupIds || [];
    return ids.map((id) => groupsMap.get(String(id))).filter(Boolean);
  },

  canPostInBackground(post, postMode) {
    if (postMode === 'classic') return false;
    if (post.videoBase64 || post.mediaType === 'video') return false;
    return Boolean(globalThis.GF?.fbPostBg);
  },

  async preparePostActorCookie(actorId) {
    try {
      const cUser = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
      const personalId = cUser?.value;
      if (!personalId) return;
      if (!actorId || String(actorId) === String(personalId)) {
        await chrome.cookies.remove({ url: 'https://www.facebook.com', name: 'i_user' });
      } else {
        await chrome.cookies.set({
          url: 'https://www.facebook.com',
          name: 'i_user',
          value: String(actorId),
          domain: '.facebook.com',
          path: '/',
          secure: true,
          sameSite: 'no_restriction',
        });
      }
      globalThis.GF?.fbSessionBg?.invalidateCache?.();
    } catch { /* ignore */ }
  },

  /** @deprecated alias */
  async prepareFastPostActor(actorId) {
    return this.preparePostActorCookie(actorId);
  },

  async postGroupItem(payload) {
    if (this.stopRequested) throw new Error('Đã dừng đăng');
    return this.sendToFb('GF_POST', {
      ...payload,
      postMode: 'classic',
      classicTextMode: payload.classicTextMode === 'paste' ? 'paste' : 'hybrid',
      queuePostId: payload.queuePostId,
    });
  },

  spinText(text) {
    if (!text || !String(text).includes('{')) return text;
    return String(text).replace(/\{([^{}]+)\}/g, (_, o) => {
      const p = o.split('|').map((s) => s.trim()).filter(Boolean);
      return p[Math.floor(Math.random() * p.length)] || '';
    });
  },

  buildGroupPostUrl(groupId, postId) {
    const gid = String(groupId || '');
    const pid = String(postId || '');
    if (gid && pid && pid !== 'pending' && /^\d+$/.test(pid)) {
      return `https://www.facebook.com/groups/${gid}/posts/${pid}/`;
    }
    if (gid) return `https://www.facebook.com/groups/${gid}/`;
    return null;
  },

  COMMENT_TEMPLATE_DEFAULT: `{Hay quá|Đúng ý|Cảm ơn bạn chia sẻ}
{Mình cũng cần|Để lưu lại|Hữu ích thật}
{Ủng hộ bạn|Tuyệt vời|Like mạnh}
{Cảm ơn thông tin|Bổ ích quá|Hay đó bạn}`,

  async resolveJobComment(job) {
    const c = String(job?.comment || '').trim();
    if (c) return this.spinText(c);
    const d = await chrome.storage.local.get('commentTemplates');
    const raw = String(d.commentTemplates || '').trim() || this.COMMENT_TEMPLATE_DEFAULT;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Chưa có comment — nhập hoặc cấu hình mẫu Settings');
    return this.spinText(lines[Math.floor(Math.random() * lines.length)]);
  },

  pushPostedGroupResult(map, postId, entry) {
    if (!map || !postId || !entry) return;
    if (!map.has(postId)) map.set(postId, []);
    const list = map.get(postId);
    const idx = list.findIndex((x) => String(x.group_id) === String(entry.group_id));
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.push(entry);
  },

  mergePostedGroups(existing, incoming) {
    const map = new Map((existing || []).map((x) => [String(x.group_id), x]));
    (incoming || []).forEach((x) => {
      const key = String(x.group_id);
      map.set(key, { ...(map.get(key) || {}), ...x });
    });
    return [...map.values()];
  },

  async markPostedGroupCommented(postQueueId, groupId, ok = true) {
    if (!postQueueId) return;
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const p = queue.find((x) => x.id === postQueueId);
    if (!p?.postedGroups?.length) return;
    const g = p.postedGroups.find((x) => String(x.group_id) === String(groupId));
    if (g) g.firstCommentOk = ok;
    await chrome.storage.local.set({ postQueue: queue });
  },

  async maybeFirstComment(post, res, group, settings, job, postGroupResults) {
    if (!post?.firstCommentEnabled) return;
    const raw = String(post.firstComment || '').trim();
    if (!raw) return;
    const postId = res?.postId;
    if (!postId || !/^\d+$/.test(String(postId))) return;
    const comment = this.spinText(raw);
    const list = postGroupResults?.get(post.id);
    const entry = list?.find((x) => String(x.group_id) === String(group.id));
    try {
      await this.commentOnPostBgOrClassic({
        group_id: group.id,
        post_id: postId,
        comment,
        actorId: job.actorId || settings.activeActorId,
      }, settings);
      if (entry) entry.firstCommentOk = true;
      await this.appendHistory({
        type: 'first_comment',
        ok: true,
        group_id: group.id,
        group_name: group.name,
        post_id: postId,
        snippet: comment.slice(0, 80),
      });
    } catch (e) {
      if (entry) entry.firstCommentOk = false;
      await this.appendHistory({
        type: 'first_comment',
        ok: false,
        group_id: group.id,
        group_name: group.name,
        post_id: postId,
        snippet: comment.slice(0, 80),
        error: e.message,
      });
    }
  },

  async applyPostMatrixResults(job, postResults, postGroupResults) {
    if (!job?.posts?.length) return null;
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const now = new Date().toISOString();
    let changed = false;
    for (const post of job.posts) {
      const p = queue.find((x) => x.id === post.id);
      if (!p) continue;
      const stats = postResults?.get(post.id);
      if (!stats) {
        if (this.stopRequested && !['posted', 'pending_approval', 'partial'].includes(p.postStatus)) {
          p.postStatus = 'failed';
          changed = true;
        }
        continue;
      }
      p.lastPostedAt = now;
      p.lastPostStats = { ok: stats.ok, fail: stats.fail, pending: stats.pending, total: stats.total };
      const details = postGroupResults?.get(post.id);
      if (details?.length) {
        p.postedGroups = this.mergePostedGroups(p.postedGroups, details);
      }
      const successGroups = stats.ok + stats.pending;
      if (successGroups > 0 && stats.fail === 0) {
        p.postStatus = stats.pending > 0 && stats.ok === 0 ? 'pending_approval' : 'posted';
        p.selected = false;
        p.ngay_dang = '';
        p.gio_dang = '';
        await this.clearPostScheduleAlarms(post.id);
      } else if (successGroups > 0) {
        p.postStatus = 'partial';
        p.ngay_dang = '';
        p.gio_dang = '';
        await this.clearPostScheduleAlarms(post.id);
      } else if (stats.fail > 0) {
        p.postStatus = 'failed';
        await this.clearPostScheduleAlarms(post.id);
      }
      changed = true;
    }
    if (changed) await chrome.storage.local.set({ postQueue: queue });
    const summary = {
      okCount: [...postResults.values()].reduce((a, s) => a + s.ok + s.pending, 0),
      failCount: [...postResults.values()].reduce((a, s) => a + s.fail, 0),
      total: [...postResults.values()].reduce((a, s) => a + s.total, 0),
      posts: job.posts.map((p) => ({
        id: p.id,
        snippet: (p.noi_dung || '').slice(0, 60),
        stats: postResults.get(p.id) || null,
      })),
    };
    chrome.runtime.sendMessage({ type: 'GF_POST_MATRIX_DONE', data: summary }).catch(() => {});
    return summary;
  },

  async refreshScheduledPostPayload(job) {
    if (!job?.posts?.length) return job;
    const d = await chrome.storage.local.get([
      'postQueue', 'postMode', 'securityLevel', 'avoidNight', 'activeActorId',
    ]);
    const queue = d.postQueue || [];
    const settings = {
      postMode: d.postMode,
      securityLevel: d.securityLevel,
      avoidNight: d.avoidNight,
      activeActorId: d.activeActorId,
    };
    job.posts = job.posts.map((stub) => {
      const fresh = queue.find((p) => p.id === stub.id);
      const merged = fresh
        ? { ...fresh, groupIds: stub.groupIds?.length ? stub.groupIds : fresh.groupIds }
        : { ...stub };
      return merged;
    });
    if (!job.actorId) job.actorId = settings.activeActorId;
    if (!job.postMode) job.postMode = settings.postMode;
    return job;
  },

  parsePostScheduleMs(ngayDang, gioDang) {
    if (!ngayDang || !gioDang) return null;
    const parts = String(gioDang).trim().split(':');
    if (parts.length < 2) return null;
    const hh = String(Number(parts[0])).padStart(2, '0');
    const mm = parts[1].slice(0, 2).padStart(2, '0');
    const iso = `${String(ngayDang).trim()}T${hh}:${mm}:00`;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
  },

  async registerPostScheduleFromQueue(post, when, settings = {}) {
    const alarmName = `gf_job_${post.id}_${Date.now()}`;
    const payload = {
      posts: [this.stripMediaFromPayload({ ...post })],
      sync: true,
      postMode: settings.postMode || 'classic',
      actorId: settings.activeActorId,
    };
    await chrome.alarms.clear(alarmName);
    await chrome.storage.local.set({ [`alarm_${alarmName}`]: { kind: 'post', payload } });
    chrome.alarms.create(alarmName, { when });
    const d = await chrome.storage.local.get('activityUpcoming');
    const upcoming = (d.activityUpcoming || []).filter((u) => !(u.kind === 'post' && u.postId === post.id));
    upcoming.push({
      id: alarmName,
      alarmName,
      kind: 'post',
      when,
      postId: post.id,
      snippet: (post.noi_dung || '').slice(0, 80) || '',
      groupIds: [...(post.groupIds || [])],
      payload,
      label: `Đăng → ${(post.groupIds || []).length} nhóm`,
    });
    await chrome.storage.local.set({ activityUpcoming: upcoming });
    chrome.runtime.sendMessage({ type: 'GF_ACTIVITY_REFRESH' }).catch(() => {});
    return alarmName;
  },

  async clearPostScheduleAlarms(postId) {
    if (!postId) return;
    const d = await chrome.storage.local.get('activityUpcoming');
    for (const item of (d.activityUpcoming || []).filter((u) => u.kind === 'post' && u.postId === postId)) {
      const name = item.alarmName || item.id;
      if (name) {
        await chrome.alarms.clear(name).catch(() => {});
        await chrome.storage.local.remove(`alarm_${name}`).catch(() => {});
      }
    }
    const upcoming = (d.activityUpcoming || []).filter((u) => !(u.kind === 'post' && u.postId === postId));
    await chrome.storage.local.set({ activityUpcoming: upcoming });
  },

  postScheduleAlreadyDone(post) {
    if (!post) return false;
    if (['posted', 'pending_approval', 'partial', 'failed'].includes(post.postStatus)) return true;
    const stats = post.lastPostStats;
    if (stats && (stats.ok > 0 || stats.pending > 0)) return true;
    if (post.lastPostedAt && (post.postedGroups?.length || stats?.ok > 0)) return true;
    return false;
  },

  async reconcileQueueSchedules() {
    const d = await chrome.storage.local.get([
      'postQueue', 'activityUpcoming', 'retryMissed', 'postMode', 'activeActorId',
    ]);
    if (d.retryMissed === false) return;
    const now = Date.now();
    const upcoming = d.activityUpcoming || [];
    const settings = { postMode: d.postMode, activeActorId: d.activeActorId };

    for (const post of d.postQueue || []) {
      if (!post.ngay_dang || !post.gio_dang) continue;
      if (this.postScheduleAlreadyDone(post)) continue;
      if (!post.groupIds?.length) continue;
      const when = this.parsePostScheduleMs(post.ngay_dang, post.gio_dang);
      if (!when) continue;

      const item = upcoming.find((u) => u.kind === 'post' && u.postId === post.id);
      if (item) {
        if (item.when > now && item.alarmName) {
          const alarms = await chrome.alarms.getAll();
          if (!alarms.some((a) => a.name === item.alarmName)) {
            await this.registerPostScheduleFromQueue(post, item.when, settings);
          }
        }
        continue;
      }

      if (when <= now) {
        console.info('[GroupFlow] missed queue schedule — run now:', post.id);
        const payload = {
          posts: [this.stripMediaFromPayload({ ...post })],
          sync: true,
          postMode: settings.postMode || 'classic',
          actorId: settings.activeActorId,
        };
        await this.runScheduledJob({ kind: 'post', payload });
      } else {
        await this.registerPostScheduleFromQueue(post, when, settings);
      }
    }
  },

  async removeUpcomingByAlarmName(alarmName) {
    if (!alarmName) return;
    const d = await chrome.storage.local.get('activityUpcoming');
    const prev = d.activityUpcoming || [];
    const upcoming = prev.filter((u) => (u.alarmName || u.id) !== alarmName);
    if (upcoming.length === prev.length) return;
    await chrome.storage.local.set({ activityUpcoming: upcoming });
    chrome.runtime.sendMessage({ type: 'GF_ACTIVITY_REFRESH' }).catch(() => {});
  },

  async runScheduledJob(data, { alarmName } = {}) {
    if (!data?.kind) return false;
    const snippet = data.kind === 'post'
      ? (data.payload?.posts?.[0]?.noi_dung || '').slice(0, 80)
      : '';
    try {
      chrome.notifications.create(`gf_sched_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'GroupFlow — Đăng theo lịch',
        message: snippet || 'Bắt đầu đăng bài…',
      }).catch(() => {});
      if (data.kind === 'post') {
        const payload = await this.refreshScheduledPostPayload({ ...data.payload });
        if (this.running) {
          const maxWaitMs = 30 * 60 * 1000;
          const stepMs = 5000;
          let waited = 0;
          while (this.running && waited < maxWaitMs) {
            await this.delay(stepMs);
            waited += stepMs;
          }
          if (this.running) {
            throw new Error('Đang đăng bài khác — lịch này chờ trong hàng đợi, thử lại sau');
          }
        }
        await this.runPostMatrix(payload);
      } else if (data.kind === 'generate_image') {
        await this.runImageGenerate(data.payload);
      } else if (data.kind === 'comment') {
        await this.runComment(data.payload);
      } else {
        return false;
      }
      if (alarmName) await this.removeUpcomingByAlarmName(alarmName);
      return true;
    } catch (e) {
      console.error('[GroupFlow] scheduled job failed:', alarmName || data.kind, e.message);
      chrome.notifications.create(`gf_sched_err_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'GroupFlow — Lịch lỗi',
        message: e.message?.slice(0, 120) || 'Không chạy được',
      }).catch(() => {});
      return false;
    }
  },

  async runPostMatrix(job) {
    if (this.running) throw new Error('Đang chạy job khác');
    if (job?.singlePostId && job.posts?.length) {
      job.posts = job.posts.filter((p) => p.id === job.singlePostId);
      if (!job.posts.length) throw new Error('Không tìm thấy bài trong payload');
    }
    this.running = true;
    this.stopRequested = false;
    this.resetPostingFbTab();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await this.markPostingSession(true, activeTab?.id);
    try {
      const fbTabs = await this.listFbTabs();
      const best = await this.pickBestFbTab(fbTabs);
      if (best) await this.bindPostingFbTab(best);
    } catch { /* sẽ tạo tab khi Cổ điển cần */ }
    const settings = await chrome.storage.local.get([
      'fbLang', 'fbUser', 'extractedGroups', 'postMode', 'classicTextMode', 'securityLevel', 'avoidNight', 'activeActorId',
      'pauseEveryGroups', 'pauseMinutesMin', 'pauseMinutesMax',
    ]);
    const groupsMap = new Map((settings.extractedGroups || []).map((g) => [String(g.id), g]));
    let total = 0;
    job.posts.forEach((post) => {
      total += this.resolvePostGroups(post, job, groupsMap).length;
    });
    let done = 0;
    let successCount = 0;
    let failCount = 0;
    const postResults = new Map();
    const postGroupResults = new Map();
    this.emitProgress({
      phase: 'started',
      done: 0,
      total,
      snippet: job.posts.length === 1
        ? `Bắt đầu — 0/${total} nhóm`
        : `Bắt đầu — ${job.posts.length} bài, ${total} nhóm`,
    });
    const bumpPostResult = (postId, outcome) => {
      if (!postResults.has(postId)) postResults.set(postId, { ok: 0, fail: 0, pending: 0, total: 0 });
      const s = postResults.get(postId);
      s.total += 1;
      if (outcome === 'ok') {
        s.ok += 1;
        successCount += 1;
      } else if (outcome === 'pending') {
        s.pending += 1;
        successCount += 1;
      } else {
        s.fail += 1;
        failCount += 1;
      }
    };
    let postsSincePause = 0;
    const PM = globalThis.GF?.postMedia;
    const mediaSettings = await this.getMediaSettings();

    try {
      for (let pi = 0; pi < job.posts.length; pi += 1) {
        if (this.stopRequested) break;
        let post = job.posts[pi];
        const payloadPost = post;
        const queueData = await chrome.storage.local.get('postQueue');
        const freshPost = (queueData.postQueue || []).find((p) => p.id === post.id);
        const PMS = globalThis.GF?.postMediaStore;
        if (freshPost) {
          post = { ...freshPost, groupIds: post.groupIds?.length ? post.groupIds : freshPost.groupIds };
        }
        if (PMS) {
          await PMS.hydratePost(post);
          if (!PMS.hasPayload(post) && PMS.hasPayload(payloadPost)) {
            PMS.applyPack(post, PMS.pack(payloadPost));
          }
        }
        this.assertPostMediaReady(post);
        job.posts[pi] = post;

        if (PM?.needsImageGeneration(post)) {
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'generating',
              done,
              total,
              post: post.noi_dung?.slice(0, 40) || '',
              snippet: 'Xuất ảnh trước khi đăng…',
            },
          }).catch(() => {});
          post = await PM.ensurePostMedia(post, mediaSettings);
          job.posts[pi] = post;
        }

        const groups = this.resolvePostGroups(post, job, groupsMap);
        for (let gi = 0; gi < groups.length; gi += 1) {
          if (this.stopRequested) break;
          const group = groups[gi];
          let text = post.noi_dung;
          if (post.variations?.length) {
            text = post.variations[gi % post.variations.length];
          }
          if (text.includes('{')) {
            text = text.replace(/\{([^{}]+)\}/g, (_, o) => {
              const p = o.split('|').map((s) => s.trim()).filter(Boolean);
              return p[Math.floor(Math.random() * p.length)] || '';
            });
          }

          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: { phase: 'posting', done, total, group: group.name, post: text.slice(0, 40) },
          }).catch(() => {});

          const auto = this.resolvePostAutomation(post, settings);
          const postMode = 'classic';
          const classicTextMode = auto.classicTextMode;
          let res;
          let hadError = false;
          let postedOk = false;
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'posting',
              done,
              total,
              group: group.name,
              snippet: 'Cổ điển (DOM trên FB)…',
            },
          }).catch(() => {});
          try {
            res = await this.postGroupItem({
              groupId: group.id,
              groupName: group.name,
              text,
              imageBase64: post.imageBase64,
              images: post.images,
              videoBase64: post.videoBase64,
              mediaType: post.mediaType,
              mediaMime: post.mediaMime,
              lang: settings.fbLang || 'vi',
              postMode,
              classicTextMode,
              actorId: job.actorId || settings.activeActorId,
              backgroundColor: post.backgroundColor,
              queuePostId: post.id,
              variationDeltas: post.variationDeltas,
              variationKey: post.variations?.length
                ? ['A', 'B', 'C', 'D'][gi % 4]
                : 'A',
            });
          } catch (e) {
            if (/đã dừng/i.test(e.message || '')) {
              this.stopRequested = true;
              break;
            }
            hadError = true;
            const rateLimited = /giới hạn tạm thời|rate limit|action_blocked/i.test(e.message || '');
            if (rateLimited) {
              done += 1;
              bumpPostResult(post.id, 'fail');
              await this.appendHistory({
                type: 'post',
                ok: false,
                group_id: group.id,
                group_name: group.name,
                snippet: text.slice(0, 80),
                error: e.message,
              });
              chrome.runtime.sendMessage({
                type: 'GF_PROGRESS',
                data: { phase: 'error', done, total, group: group.name, error: e.message },
              }).catch(() => {});
              this.stopRequested = true;
              break;
            }
            done += 1;
            bumpPostResult(post.id, 'fail');
            await this.appendHistory({
              type: 'post',
              ok: false,
              group_id: group.id,
              group_name: group.name,
              snippet: text.slice(0, 80),
              error: e.message,
              mode: postMode,
            });
            chrome.runtime.sendMessage({
              type: 'GF_PROGRESS',
              data: { phase: 'error', done, total, group: group.name, error: e.message },
            }).catch(() => {});
            postsSincePause = await this.waitAfterPostAttempt({
              post,
              settings,
              postsSincePause,
              hadError: true,
              postedOk: false,
              hasMoreInGroup: gi < groups.length - 1,
              hasMorePosts: pi < job.posts.length - 1,
              done,
              total,
            });
            continue;
          }

          postedOk = Boolean(res && (
            (res.postId && !['hidden', 'uncertain'].includes(String(res.postId)))
            || res.status === 'pending_approval'
            || res.status === 'posted_uncertain'
            || res.status === 'posted'
            || res.status === 'successful'
          ));

          if (res) {
            done += 1;
            let fbUser = settings.fbUser || await this.getFbUserFromCookie();
            if (!fbUser) {
              try {
                fbUser = (await this.sendToFb('GF_GET_FB_USER')).user;
              } catch { /* ignore */ }
            }

            let tidienPushRes = null;
            if (res.postId && res.postId !== 'pending' && job.sync) {
              tidienPushRes = await this.pushPostToTidien({ group, post, text, res, fbUser });
            }

            await this.appendHistory({
              type: 'post',
              ok: postedOk,
              group_id: group.id,
              group_name: group.name,
              post_id: res.postId,
              url: res.url || null,
              snippet: text.slice(0, 80),
              error: res.error || res.warning,
              mode: res.mode || postMode,
              status: res.status,
            });

            if (postedOk) {
              // tidienSynced phải nằm trong object lúc tạo entry — entry chưa tồn tại trước
              // pushPostedGroupResult() nên không thể tìm-rồi-sửa (bug cũ: luôn no-op vì entry
              // chưa được tạo, khiến bài đẩy tidien thành công nhưng cờ tidienSynced không lưu
              // lại, gây đẩy lặp lần sau "Đồng bộ").
              this.pushPostedGroupResult(postGroupResults, post.id, {
                group_id: String(group.id),
                group_name: group.name,
                post_id: res.postId,
                url: res.url || this.buildGroupPostUrl(group.id, res.postId),
                status: res.status || (res.postId === 'pending' ? 'pending_approval' : 'posted'),
                posted_at: new Date().toISOString(),
                firstCommentOk: null,
                tidienSynced: Boolean(tidienPushRes?.ok),
                tidienSyncedAt: tidienPushRes?.ok ? new Date().toISOString() : null,
              });
            }

            if (postedOk) {
              const pending = res.postId === 'pending' || res.status === 'pending_approval';
              bumpPostResult(post.id, pending ? 'pending' : 'ok');
            } else {
              bumpPostResult(post.id, 'fail');
            }

            if (postedOk) {
              await globalThis.GF?.groupMetaStore?.learnFromPost(group.id, res);
              await this.maybeFirstComment(post, res, group, settings, job, postGroupResults);
            }

            this.emitProgress({
              phase: postedOk ? 'ok' : 'error',
              done,
              total,
              group: group.name,
              error: postedOk ? undefined : (res?.error || res?.warning),
            });
          }

          const hasMoreInGroup = gi < groups.length - 1;
          const hasMorePosts = pi < job.posts.length - 1;
          postsSincePause = await this.waitAfterPostAttempt({
            post,
            settings,
            postsSincePause,
            hadError: hadError && !res,
            postedOk,
            hasMoreInGroup,
            hasMorePosts: hasMoreInGroup || (hasMorePosts && gi === groups.length - 1),
            done,
            total,
          });
        }
        if (pi < job.posts.length - 1) {
          const auto = this.resolvePostAutomation(post, settings);
          const delays = await this.getSecurityDelays(auto.securityLevel);
          await this.interruptibleDelay(this.randBetween([delays.betweenPosts, delays.betweenPosts + 60]) * 1000);
        }
      }
    } finally {
      this.running = false;
      this.resetPostingFbTab();
      const summary = await this.applyPostMatrixResults(job, postResults, postGroupResults);
      const sess = await chrome.storage.session.get(['gfPanelTabId']).catch(() => ({}));
      await this.markPostingSession(false);
      if (sess.gfPanelTabId) {
        await this.ensurePanelOpenOnTab(sess.gfPanelTabId);
      }
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: {
          phase: this.stopRequested ? 'stopped' : 'done',
          done,
          total,
          okCount: successCount,
          failCount,
          summary,
          snippet: this.stopRequested ? 'Đã dừng đăng bài' : undefined,
        },
      }).catch(() => {});
    }
  },

  async commentOnPostBgOrClassic(job, settings) {
    const FC = globalThis.GF?.fbCommentBg;
    const comment = String(job.comment || '').trim();
    if (!comment) throw new Error('Chưa có nội dung comment');
    const validPostId = job.post_id && /^\d+$/.test(String(job.post_id));
    if (FC && validPostId) {
      try {
        return await FC.commentOnPost({
          groupId: job.group_id,
          postId: job.post_id,
          text: comment,
          actorId: job.actorId || settings.activeActorId,
        });
      } catch (e) {
        const noDomFallback = /không tồn tại|chờ admin|bị xóa|pending|không hợp lệ|không thể comment|không xác nhận/i
          .test(e.message || '');
        if (noDomFallback) throw e;
        console.warn('[GroupFlow] comment bg failed, fallback DOM:', e.message);
      }
    }
    await this.sendToFb('GF_COMMENT', {
      groupId: job.group_id,
      postId: job.post_id,
      text: comment,
      lang: settings.fbLang || 'vi',
      actorId: job.actorId || settings.activeActorId,
    });
    return { ok: true, mode: 'classic' };
  },

  async runCommentBatch(jobs, actorId) {
    if (this.commentRunning) throw new Error('Đang chạy batch comment khác');
    if (!jobs?.length) return { ok: true, done: 0 };
    this.commentRunning = true;
    const delays = await this.getSecurityDelays();
    const settings = await chrome.storage.local.get(['activeActorId']);
    const resolvedActor = actorId || settings.activeActorId;
    let done = 0;
    try {
      for (let i = 0; i < jobs.length; i += 1) {
        if (this.stopRequested) break;
        const job = { ...jobs[i], actorId: jobs[i].actorId || resolvedActor };
        chrome.runtime.sendMessage({
          type: 'GF_PROGRESS',
          data: {
            phase: 'commenting',
            done,
            total: jobs.length,
            snippet: job.comment?.slice(0, 50) || '',
          },
        }).catch(() => {});
        await this.runComment(job);
        done += 1;
        if (i < jobs.length - 1 && !this.stopRequested) {
          const waitSec = this.randBetween(delays.betweenComments);
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'comment_wait',
              done,
              total: jobs.length,
              snippet: `Chờ ${waitSec}s trước comment tiếp…`,
            },
          }).catch(() => {});
          await this.delay(waitSec * 1000);
        }
      }
    } finally {
      this.commentRunning = false;
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: { phase: 'done', done, total: jobs.length },
      }).catch(() => {});
    }
    return { ok: true, done };
  },

  async runCommentOwn(job) {
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'activeActorId']);
    const comment = await this.resolveJobComment(job);
    const runJob = { ...job, comment };
    let res;
    try {
      res = await this.commentOnPostBgOrClassic(runJob, settings);
    } catch (e) {
      await this.markPostedGroupCommented(job.post_queue_id, job.group_id, false);
      await this.appendHistory({
        type: 'comment',
        ok: false,
        group_id: job.group_id,
        group_name: job.group_name,
        post_id: job.post_id,
        snippet: comment.slice(0, 80),
        error: e.message,
      });
      throw e;
    }

    if (job.record_id) {
      try {
        const fbUser = settings.fbUser || await this.getFbUserFromCookie();
        const base = (await chrome.storage.local.get('tidienBaseUrl')).tidienBaseUrl || 'https://tidien.xyz';
        const key = await chrome.storage.local.get(['tidienApiKey', 'tidienToken']);
        const token = key.tidienApiKey || key.tidienToken;
        await fetch(`${base.replace(/\/$/, '')}/api/group-posts/${job.record_id}/commented`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ commenter_fb_user_id: fbUser?.id }),
        });
      } catch (e) {
        console.warn('Sync commented failed', e);
      }
    }

    await this.markPostedGroupCommented(job.post_queue_id, job.group_id, true);
    await this.appendHistory({
      type: 'comment',
      ok: true,
      group_id: job.group_id,
      group_name: job.group_name,
      post_id: job.post_id,
      comment_id: res.commentId,
      snippet: comment.slice(0, 80),
      error: res.warning,
      mode: res.mode,
    });
    return res;
  },

  async runComment(job) {
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'activeActorId']);
    const comment = await this.resolveJobComment(job);
    const runJob = { ...job, comment };
    let res;
    try {
      res = await this.commentOnPostBgOrClassic(runJob, settings);
    } catch (e) {
      await this.appendHistory({
        type: 'comment',
        ok: false,
        group_id: job.group_id,
        post_id: job.post_id,
        snippet: comment.slice(0, 80),
        error: e.message,
      });
      throw e;
    }

    const fbUser = settings.fbUser || await this.getFbUserFromCookie();
    const base = (await chrome.storage.local.get('tidienBaseUrl')).tidienBaseUrl || 'https://tidien.xyz';
    const key = await chrome.storage.local.get(['tidienApiKey', 'tidienToken']);
    const token = key.tidienApiKey || key.tidienToken;
    await fetch(`${base.replace(/\/$/, '')}/api/group-posts/${job.record_id}/commented`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commenter_fb_user_id: fbUser?.id }),
    });
    const cached = await chrome.storage.local.get('tidienPendingComments');
    const pruned = (cached.tidienPendingComments || [])
      .filter((c) => String(c.id) !== String(job.record_id));
    if (pruned.length !== (cached.tidienPendingComments || []).length) {
      await chrome.storage.local.set({ tidienPendingComments: pruned });
      chrome.runtime.sendMessage({ type: 'GF_TIDIEN_SYNCED', data: { comments: pruned.length } }).catch(() => {});
    }
    await this.appendHistory({
      type: 'comment',
      ok: true,
      group_id: job.group_id,
      post_id: job.post_id,
      comment_id: res.commentId,
      snippet: comment.slice(0, 80),
      error: res.warning,
      mode: res.mode,
    });
  },

  async getTidienAuth() {
    const cfg = await chrome.storage.local.get(['tidienBaseUrl', 'tidienApiKey', 'tidienToken']);
    const token = cfg.tidienApiKey || cfg.tidienToken;
    if (!token) return null;
    return {
      token,
      base: (cfg.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, ''),
    };
  },

  async pushPostToTidien({ group, post, text, res, fbUser }) {
    const auth = await this.getTidienAuth();
    if (!auth) {
      await this.appendEngineLog({
        level: 'warn',
        phase: 'tidien-push',
        message: 'Chưa đăng nhập tidien — bài chưa đẩy lên web',
        group: group?.name,
        groupId: group?.id,
      });
      return { ok: false, skipped: 'no_auth' };
    }
    const postId = res?.postId;
    if (!postId || postId === 'pending' || !/^\d+$/.test(String(postId))) {
      await this.appendEngineLog({
        level: 'warn',
        phase: 'tidien-push',
        message: `Không có post_id FB hợp lệ (${postId || 'trống'}) — chưa đẩy tidien`,
        group: group?.name,
        groupId: group?.id,
      });
      return { ok: false, skipped: 'no_post_id' };
    }
    try {
      const data = await this.tidienPostJson(auth, '/api/group-posts/sync', {
        group_id: group.id,
        group_name: group.name,
        post_id: postId,
        fb_url: this.buildGroupPostUrl(group.id, postId),
        noi_dung: text,
        prompt_anh: post.prompt_anh || '',
        ngay_dang: post.ngay_dang,
        gio_dang: post.gio_dang,
        posted_at: new Date().toISOString(),
        posted_by: fbUser?.id,
      }, { Authorization: `Bearer ${auth.token}` });
      await this.appendEngineLog({
        level: 'ok',
        phase: 'tidien-push',
        message: `Đã đẩy bài lên tidien (post_id ${postId})`,
        group: group?.name,
        groupId: group?.id,
        postId: String(postId),
      });
      return { ok: true, data };
    } catch (e) {
      await this.appendEngineLog({
        level: 'error',
        phase: 'tidien-push',
        message: 'Đẩy bài lên tidien thất bại',
        group: group?.name,
        groupId: group?.id,
        error: e.message,
      });
      return { ok: false, error: e.message };
    }
  },

  async pushUnsyncedPostsFromQueue() {
    const auth = await this.getTidienAuth();
    if (!auth) return { pushed: 0, failed: 0, skipped: 'no_auth' };
    const d = await chrome.storage.local.get(['postQueue', 'fbUser']);
    const queue = d.postQueue || [];
    let pushed = 0;
    let failed = 0;
    let changed = false;
    const fbUser = d.fbUser || await this.getFbUserFromCookie();
    for (const post of queue) {
      for (const g of post.postedGroups || []) {
        if (g.tidienSynced) continue;
        const pid = g.post_id;
        if (!pid || !/^\d+$/.test(String(pid))) continue;
        const r = await this.pushPostToTidien({
          group: { id: g.group_id, name: g.group_name },
          post,
          text: post.noi_dung || '',
          res: { postId: pid, url: g.url },
          fbUser,
        });
        if (r.ok) {
          g.tidienSynced = true;
          g.tidienSyncedAt = new Date().toISOString();
          pushed += 1;
          changed = true;
        } else if (!r.skipped) failed += 1;
      }
    }
    if (changed) await chrome.storage.local.set({ postQueue: queue });
    return { pushed, failed };
  },

  draftRowToQueuePost(row) {
    return {
      id: `web-${row.id}`,
      source: 'website',
      is_shared: Boolean(row.is_shared),
      draft_id: row.id,
      noi_dung: row.noi_dung,
      prompt_anh: row.prompt_anh || '',
      autoGenerateImage: row.auto_generate_image !== false && row.auto_generate_image !== 0,
      anh_ngay_dang: row.anh_ngay_dang || '',
      anh_gio_dang: row.anh_gio_dang || '',
      ngay_dang: row.ngay_dang,
      gio_dang: row.gio_dang,
      groupIds: [],
      imageStatus: 'pending',
      imageBase64: null,
      selected: false,
    };
  },

  async mergeDraftsIntoQueue(rows) {
    if (!rows?.length) return 0;
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const known = new Set(queue.map((p) => String(p.draft_id || p.id || '').replace(/^web-/, '')));
    let added = 0;
    for (const row of rows) {
      const draftId = String(row.id);
      if (known.has(draftId)) continue;
      queue.push(this.draftRowToQueuePost(row));
      known.add(draftId);
      added += 1;
    }
    if (added) await chrome.storage.local.set({ postQueue: queue });
    return added;
  },

  mergeCommentsIncremental(existing, incoming) {
    const byId = new Map((existing || []).map((c) => [String(c.id), c]));
    for (const row of incoming || []) {
      const id = String(row.id);
      if ((row.my_comment_count || 0) > 0) byId.delete(id);
      else byId.set(id, row);
    }
    return [...byId.values()]
      .sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0))
      .slice(0, TIDIEN_SYNC.CACHE_MAX_COMMENTS);
  },

  commentWatermark(comments) {
    let max = 0;
    for (const c of comments || []) {
      const t = c.posted_at ? new Date(c.posted_at).getTime() : 0;
      if (t > max) max = t;
    }
    return max ? new Date(max).toISOString() : null;
  },

  maxLocalId(items, idField = 'id') {
    let max = 0;
    for (const row of items || []) {
      const n = Number.parseInt(row[idField], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  },

  maxLocalDraftId(queue) {
    let max = 0;
    for (const p of queue || []) {
      const raw = String(p.draft_id || p.id || '').replace(/^web-/, '');
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  },

  buildSyncPayload(cfg) {
    const localMax = this.maxLocalId(cfg.tidienPendingComments);
    const seenMax = Number(cfg.tidienSyncMeta?.maxSeenPostId) || 0;
    return {
      last_post_id: Math.max(localMax, seenMax),
      last_draft_id: this.maxLocalDraftId(cfg.postQueue),
    };
  },

  async tidienPostJson(auth, path, body, headers) {
    const res = await fetch(`${auth.base}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  /** Hỏi (status) → lấy 1 lô → cập nhật local → nghỉ → hỏi tiếp — trong 1 phiên, không song song */
  async pullCursorSession(auth, headers, {
    kind = 'posts',
    limit = TIDIEN_SYNC.BATCH_SIZE,
    maxRounds = TIDIEN_SYNC.MAX_ROUNDS,
  } = {}) {
    const isPosts = kind === 'posts';
    const pendingKey = isPosts ? 'pending_posts_sync' : 'pending_drafts';
    const pullPath = isPosts ? '/api/group-posts/posts/pull' : '/api/group-posts/drafts/pull';
    let fetched = 0;
    let pending = 0;
    let rounds = 0;

    for (let i = 0; i < maxRounds; i += 1) {
      const cfg = await chrome.storage.local.get(['tidienPendingComments', 'postQueue', 'tidienSyncMeta']);
      const payload = this.buildSyncPayload(cfg);

      const status = await this.tidienPostJson(auth, '/api/group-posts/sync/status', payload, headers);
      pending = Number(status[pendingKey]) || 0;
      if (pending <= 0 || (isPosts && status.up_to_date)) break;

      const pullBody = isPosts
        ? { last_post_id: payload.last_post_id, limit }
        : { last_draft_id: payload.last_draft_id, limit };
      const data = await this.tidienPostJson(auth, pullPath, pullBody, headers);
      const rows = data.data || [];
      if (!rows.length) break;

      if (isPosts) {
        const merged = this.mergeCommentsIncremental(cfg.tidienPendingComments, rows);
        const incomingMax = this.maxLocalId(rows);
        const prevSeen = Number(cfg.tidienSyncMeta?.maxSeenPostId) || 0;
        const nextMeta = { ...(cfg.tidienSyncMeta || {}), maxSeenPostId: Math.max(prevSeen, incomingMax) };
        await chrome.storage.local.set({
          tidienPendingComments: merged,
          tidienCommentsSyncedAt: Date.now(),
          tidienSyncMeta: nextMeta,
        });
        cfg.tidienSyncMeta = nextMeta;
        cfg.tidienPendingComments = merged;
      } else {
        await this.mergeDraftsIntoQueue(rows);
      }

      fetched += rows.length;
      rounds += 1;
      pending = Number(data.pending_remaining) || 0;
      if (pending <= 0) break;
      await this.delay(TIDIEN_SYNC.BATCH_PAUSE_MS);
    }

    return { fetched, pending, rounds };
  },

  async scheduleTidienSyncAlarm() {
    const cfg = await chrome.storage.local.get(['tidienAutoSyncEnabled', 'tidienAutoSyncMinutes']);
    await chrome.alarms.clear('gf_tidien_sync');
    if (cfg.tidienAutoSyncEnabled === false) return;
    const mins = Math.max(5, Number(cfg.tidienAutoSyncMinutes) || 10);
    chrome.alarms.create('gf_tidien_sync', { periodInMinutes: mins });
  },

  async syncFromTidien({ force = false, pullDrafts = true, scope = 'auto' } = {}) {
    if (tidienSyncInFlight) return tidienSyncInFlight;
    tidienSyncInFlight = this._syncFromTidienImpl({ force, pullDrafts, scope })
      .finally(() => { tidienSyncInFlight = null; });
    return tidienSyncInFlight;
  },

  async _syncFromTidienImpl({ force = false, pullDrafts = true, scope = 'auto' } = {}) {
    const auth = await this.getTidienAuth();
    if (!auth) return { ok: false, skipped: 'no_auth' };

    const cfg = await chrome.storage.local.get([
      'tidienAutoSyncEnabled', 'tidienAutoPullDrafts',
      'tidienPendingComments', 'tidienSyncMeta', 'postQueue',
    ]);
    if (cfg.tidienAutoSyncEnabled === false && !force) return { ok: false, skipped: 'disabled' };

    const meta = {
      lastAt: 0,
      lastCommentsAt: 0,
      lastDraftsAt: 0,
      pendingPostsSync: null,
      pendingComments: null,
      pendingDrafts: null,
      totalPosts: null,
      syncCount: 0,
      ...(cfg.tidienSyncMeta || {}),
    };
    const now = Date.now();
    if (!force && meta.lastAt && (now - meta.lastAt) < TIDIEN_SYNC.MIN_INTERVAL_MS) {
      return { ok: true, skipped: 'throttle', lastAt: meta.lastAt };
    }

    const headers = { Authorization: `Bearer ${auth.token}` };
    const syncPayload = this.buildSyncPayload(cfg);
    const maxRounds = force ? TIDIEN_SYNC.MAX_ROUNDS_FORCE : TIDIEN_SYNC.MAX_ROUNDS;
    const wantComments = scope === 'comments' || scope === 'all' || scope === 'auto';
    let shouldPullDrafts = pullDrafts && cfg.tidienAutoPullDrafts !== false
      && (scope === 'drafts' || scope === 'all'
        || (scope === 'auto' && (!meta.lastDraftsAt || (now - meta.lastDraftsAt) >= TIDIEN_SYNC.DRAFTS_INTERVAL_MS)));

    let postsFetched = 0;
    let postsMerged = (cfg.tidienPendingComments || []).length;
    let pendingPostsSync = 0;
    let postRounds = 0;
    let draftsAdded = 0;
    let pendingDrafts = 0;
    let draftRounds = 0;
    let postsError;
    let draftError;
    let skippedPosts = false;
    let skippedDrafts = false;
    let postsPushed = 0;
    let postsPushFailed = 0;

    if (scope === 'all' || scope === 'push' || force) {
      const pushRes = await this.pushUnsyncedPostsFromQueue();
      postsPushed = pushRes.pushed || 0;
      postsPushFailed = pushRes.failed || 0;
    }

    if (wantComments) {
      try {
        const peek = await this.tidienPostJson(auth, '/api/group-posts/sync/status', {
          last_post_id: syncPayload.last_post_id,
          last_draft_id: syncPayload.last_draft_id,
        }, headers);
        meta.totalPosts = Number(peek.total_posts) || 0;
        meta.serverMaxPostId = Number(peek.server_max_post_id) || 0;
        meta.lastPostId = Number(peek.last_post_id) ?? syncPayload.last_post_id;
        if (!force && (Number(peek.pending_posts_sync) || 0) === 0) {
          skippedPosts = true;
          pendingPostsSync = 0;
        } else {
          const res = await this.pullCursorSession(auth, headers, {
            kind: 'posts',
            maxRounds,
          });
          postsFetched = res.fetched;
          pendingPostsSync = res.pending;
          postRounds = res.rounds;
          const after = await chrome.storage.local.get('tidienPendingComments');
          postsMerged = (after.tidienPendingComments || []).length;
          meta.lastCommentsAt = now;
        }
      } catch (e) {
        postsError = e.message;
      }
    }

    if (shouldPullDrafts) {
      try {
        const peek = await this.tidienPostJson(auth, '/api/group-posts/sync/status', {
          last_post_id: this.buildSyncPayload(await chrome.storage.local.get(['tidienPendingComments', 'postQueue'])).last_post_id,
          last_draft_id: this.buildSyncPayload(await chrome.storage.local.get(['tidienPendingComments', 'postQueue'])).last_draft_id,
        }, headers);
        if (!force && (Number(peek.pending_drafts) || 0) === 0) {
          skippedDrafts = true;
        } else {
          const res = await this.pullCursorSession(auth, headers, {
            kind: 'drafts',
            maxRounds,
          });
          draftsAdded = res.fetched;
          pendingDrafts = res.pending;
          draftRounds = res.rounds;
          meta.lastDraftsAt = now;
        }
      } catch (e) {
        draftError = e.message;
      }
    }

    meta.pendingPostsSync = pendingPostsSync;
    meta.pendingDrafts = pendingDrafts;

    meta.lastAt = now;
    meta.syncCount = (meta.syncCount || 0) + 1;
    await chrome.storage.local.set({ tidienSyncMeta: meta });

    const payload = {
      posts: postsMerged,
      postsFetched,
      postsPushed,
      postsPushFailed,
      postRounds,
      pendingPostsSync,
      pendingDrafts,
      draftRounds,
      draftsAdded,
      skippedPosts,
      skippedDrafts,
      at: now,
      postsError,
      draftError,
    };
    chrome.runtime.sendMessage({ type: 'GF_TIDIEN_SYNCED', data: payload }).catch(() => {});
    return { ok: true, ...payload };
  },

  async runRadarScan() {
    const cfg = await chrome.storage.local.get([
      'radarActive', 'radarKeywords', 'radarGroupIds', 'radarPush', 'radarLeads', 'extractedGroups',
    ]);
    if (!cfg.radarActive) return;
    const groups = (cfg.extractedGroups || []).filter((g) => (cfg.radarGroupIds || []).includes(g.id));
    let leads = cfg.radarLeads || [];

    for (const group of groups) {
      const tab = await this.getFbTab();
      await chrome.tabs.update(tab.id, { url: `https://www.facebook.com/groups/${group.id}` });
      await this.delay(3500);
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: 'GF_SCAN_FEED',
        keywordsText: cfg.radarKeywords,
      });
      if (res?.leads?.length) {
        leads = [...res.leads.map((l) => ({ ...l, group_name: group.name })), ...leads].slice(0, 500);
        if (cfg.radarPush) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            title: 'GroupFlow — Lead mới',
            message: res.leads[0].snippet?.slice(0, 120) || 'Có lead mới',
          });
        }
      }
    }
    await chrome.storage.local.set({ radarLeads: leads });
    chrome.runtime.sendMessage({ type: 'GF_RADAR_UPDATED' }).catch(() => {});
  },
};

async function ensureGroupFlowPeriodicAlarms() {
  const existing = await chrome.alarms.getAll();
  const names = new Set(existing.map((a) => a.name));
  if (!names.has('gf_retry_missed')) {
    chrome.alarms.create('gf_retry_missed', { periodInMinutes: 1 });
  }
  if (!names.has('gf_image_schedule')) {
    chrome.alarms.create('gf_image_schedule', { periodInMinutes: 1 });
  }
}

console.log('[GroupFlow] service worker ready');
ensureGroupFlowPeriodicAlarms().catch(() => {});
GF_BG.reconcileQueueSchedules().catch(() => {});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'radar_scan') {
    await GF_BG.runRadarScan();
    return;
  }
  if (alarm.name.startsWith('gf_img_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) return;
    const ok = await GF_BG.runScheduledJob(data, { alarmName: alarm.name });
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    if (!ok) console.warn('[GroupFlow] image alarm will retry via activityUpcoming:', alarm.name);
    return;
  }
  if (alarm.name.startsWith('gf_job_') || alarm.name.startsWith('gf_cmt_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) {
      console.warn('[GroupFlow] alarm fired but payload missing:', alarm.name);
      return;
    }
    const ok = await GF_BG.runScheduledJob(data, { alarmName: alarm.name });
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    if (!ok) console.warn('[GroupFlow] post/comment alarm will retry via activityUpcoming:', alarm.name);
    return;
  }
  if (alarm.name === 'gf_retry_missed') {
    await GF_BG.reconcileQueueSchedules().catch((e) => {
      console.warn('[GroupFlow] reconcile schedules:', e.message);
    });
    const d = await chrome.storage.local.get(['activityUpcoming', 'retryMissed']);
    if (d.retryMissed === false) return;
    const now = Date.now();
    const remaining = [];
    for (const item of d.activityUpcoming || []) {
      if (item.when <= now) {
        const ok = await GF_BG.runScheduledJob(
          { kind: item.kind, payload: item.payload },
          { alarmName: item.alarmName || item.id },
        );
        if (!ok) remaining.push(item);
      } else {
        remaining.push(item);
      }
    }
    await chrome.storage.local.set({ activityUpcoming: remaining });
    return;
  }
  if (alarm.name === 'gf_image_schedule') {
    await GF_BG.tickGroupImageSchedule();
  }
  if (alarm.name === 'gf_tidien_sync') {
    await GF_BG.syncFromTidien().catch((e) => {
      console.warn('[GroupFlow] tidien auto-sync:', e.message);
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // Broadcast GF_PROGRESS — ghi nhật ký rồi thoát (sidepanel tự nhận qua runtime)
      if (msg.type === 'GF_PROGRESS') {
        const source = sender.tab?.id ? 'content' : 'engine';
        GF_BG.logProgress(msg.data || {}, source);
        return;
      }
      if (msg.type === 'GF_RADAR_UPDATED' || msg.type === 'GF_ACTIVITY_REFRESH' || msg.type === 'GF_POST_MATRIX_DONE') return;

      if (msg.type === 'GF_APPEND_ENGINE_LOG') {
        await GF_BG.appendEngineLog({ ...msg.entry, source: msg.entry?.source || 'panel' });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_CLEAR_ENGINE_LOG') {
        await chrome.storage.local.set({ engineLog: [] });
        chrome.runtime.sendMessage({ type: 'GF_ENGINE_LOG', data: { cleared: true } }).catch(() => {});
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'GF_COMMENT_OWN_POST') {
        const settings = await chrome.storage.local.get(['activeActorId']);
        await GF_BG.runCommentOwn({
          ...msg.payload,
          actorId: msg.payload?.actorId || settings.activeActorId,
        });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_TIDIEN_SYNC') {
        const res = await GF_BG.syncFromTidien({
          force: Boolean(msg.force),
          pullDrafts: msg.pullDrafts !== false,
          scope: msg.scope || 'auto',
        });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_SCHEDULE_TIDIEN_SYNC') {
        await GF_BG.scheduleTidienSyncAlarm();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_START_POST') {
        GF_BG.runPostMatrix(msg.payload).catch((e) => {
          console.warn('[GroupFlow] GF_START_POST:', e.message);
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'error',
              error: e.message,
              snippet: e.message?.slice(0, 200) || 'Không chạy được job đăng',
            },
          }).catch(() => {});
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: { phase: 'stopped', snippet: e.message?.slice(0, 120) || 'Không chạy được job đăng' },
          }).catch(() => {});
        });
        sendResponse({ ok: true, started: true });
        return;
      }
      if (msg.type === 'GF_STOP') {
        GF_BG.stopRequested = true;
        await GF_BG.abortClassicPost();
        chrome.runtime.sendMessage({
          type: 'GF_PROGRESS',
          data: { phase: 'stopped', snippet: 'Đã dừng đăng bài' },
        }).catch(() => {});
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_PANEL_CLAIM_TAB') {
        const tabId = sender.tab?.id;
        if (tabId) await GF_BG.claimPanelTab(tabId);
        sendResponse({ ok: true, tabId });
        return;
      }
      if (msg.type === 'GF_PANEL_RELEASE_TAB') {
        await GF_BG.releasePanelTab(sender.tab?.id);
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_PANEL_CAN_RESTORE') {
        const ok = await GF_BG.canRestorePanelOnTab(sender.tab?.id);
        sendResponse({ ok });
        return;
      }
      if (msg.type === 'GF_EXTRACT_GROUPS') {
        const res = await GF_BG.extractGroupsFromFb({
          navigate: Boolean(msg.navigate),
          deep: Boolean(msg.deep),
        });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_SYNC_GROUPS') {
        const res = await GF_BG.syncGroups({
          forceRefresh: Boolean(msg.force),
          passive: msg.passive !== false,
          deep: Boolean(msg.deep),
          enrich: Boolean(msg.enrich),
        });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_SYNC_GROUPS_BACKGROUND') {
        GF_BG.syncGroupsInBackground();
        sendResponse({ ok: true, started: true });
        return;
      }
      if (msg.type === 'GF_GET_POST_MEDIA') {
        const pack = await GF_BG.getPostMediaPack(msg.postId || msg.queuePostId);
        sendResponse(pack || {});
        return;
      }
      if (msg.type === 'GF_GET_FB_USER') {
        let user = await GF_BG.getFbUserBg();
        if (!user) {
          const res = await GF_BG.sendToFb('GF_GET_FB_USER');
          user = res.user;
        }
        if (user) await chrome.storage.local.set({ fbUser: user });
        sendResponse({ user });
        return;
      }
      if (msg.type === 'GF_GET_FB_PROFILES') {
        const res = await GF_BG.sendToFb('GF_GET_FB_PROFILES');
        if (res.profiles) {
          await chrome.storage.local.set({
            fbProfiles: res.profiles,
            fbUser: res.profiles.active,
            activeActorId: res.profiles.activeId,
          });
        }
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_SWITCH_ACTOR') {
        const res = await GF_BG.sendToFb('GF_SWITCH_ACTOR', { actorId: msg.actorId });
        if (res.user) {
          await chrome.storage.local.set({
            fbUser: res.user,
            activeActorId: msg.actorId,
          });
        }
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_RUN_COMMENT') {
        await GF_BG.runComment(msg.payload);
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_RUN_COMMENT_BATCH') {
        const res = await GF_BG.runCommentBatch(msg.payload?.jobs, msg.payload?.actorId);
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_RADAR_SCAN') {
        await GF_BG.runRadarScan();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_RECONCILE_SCHEDULES') {
        await GF_BG.reconcileQueueSchedules();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_SCHEDULE_ALARM') {
        try {
          const data = msg.data ? { ...msg.data } : msg.data;
          if (data?.kind === 'post' && data.payload?.posts?.length) {
            data.payload = {
              ...data.payload,
              posts: data.payload.posts.map((p) => GF_BG.stripMediaFromPayload(p)),
            };
          }
          if (data?.kind === 'generate_image' && data.payload?.posts?.length) {
            data.payload = {
              ...data.payload,
              posts: data.payload.posts.map((p) => GF_BG.stripMediaFromPayload(p)),
            };
          }
          await chrome.alarms.clear(msg.name);
          await chrome.storage.local.set({ [`alarm_${msg.name}`]: data });
          chrome.alarms.create(msg.name, { when: msg.when });
          sendResponse({ ok: true });
        } catch (e) {
          await chrome.alarms.clear(msg.name).catch(() => {});
          await chrome.storage.local.remove(`alarm_${msg.name}`).catch(() => {});
          sendResponse({ ok: false, error: e.message || 'Không lưu được lịch' });
        }
        return;
      }
      if (msg.type === 'GF_CANCEL_ALARM') {
        await chrome.alarms.clear(msg.name);
        await chrome.storage.local.remove(`alarm_${msg.name}`);
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_LEARN_GROUP_META') {
        const updated = await globalThis.GF?.groupMetaStore?.learnFromPost(msg.groupId, msg.res || msg);
        sendResponse({ ok: true, group: updated });
        return;
      }
      if (msg.type === 'GF_SAVE_GRAPHQL_DOC_IDS') {
        const docIds = await globalThis.GF?.groupMetaStore?.saveDocIds(msg.docIds || {});
        sendResponse({ ok: true, docIds });
        return;
      }
      if (msg.type === 'GF_APPLY_GROUP_META') {
        await globalThis.GF?.groupMetaStore?.applyMetaFromNetwork(msg.groups || []);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ error: `Loại message không hỗ trợ: ${msg.type || '?'}` });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

chrome.action.onClicked.addListener(() => {
  togglePanelOnActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'complete') return;
  chrome.storage.session.get(['gfPanelOpen', 'gfPostingActive', 'gfPanelTabId'], (d) => {
    if (chrome.runtime.lastError) return;
    if (!d?.gfPanelTabId || d.gfPanelTabId !== tabId) return;
    if (!d?.gfPanelOpen && !d?.gfPostingActive) return;
    chrome.tabs.get(tabId).then((tab) => {
      if (!tab?.url?.includes('facebook.com')) return;
      GF_BG.ensurePanelOpenOnTab(tabId);
    }).catch(() => {});
  });
});

chrome.runtime.onInstalled.addListener(() => {
  console.info('[GroupFlow] SW v1.0.113 installed');
  ensureGroupFlowPeriodicAlarms().catch(() => {});
  GF_BG.scheduleTidienSyncAlarm().catch(() => {});
  GF_BG.prefetchGroups().catch(() => {});
  setTimeout(() => {
    GF_BG.syncFromTidien({ scope: 'comments' }).catch(() => {});
  }, 20_000);
});

chrome.runtime.onStartup.addListener(() => {
  ensureGroupFlowPeriodicAlarms().catch(() => {});
  GF_BG.scheduleTidienSyncAlarm().catch(() => {});
  GF_BG.prefetchGroups().catch(() => {});
});
