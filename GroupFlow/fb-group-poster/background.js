importScripts('modules/swBundle.js');

console.info('[GroupFlow] SW v1.0.39 ready');

const GF_BRIDGE_VERSION = 5;

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

  async injectFbBridge(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['selectors.js', 'modules/fbGraphApi.js', 'modules/fbActor.js', 'content.js'],
    });
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
    const tabs = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
    return tabs.find((t) => t.url?.includes('/groups/joins')) || null;
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

  async getFbTab({ createIfMissing = true } = {}) {
    const tabs = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
    if (tabs[0]) return tabs[0];
    if (!createIfMissing) return null;
    const tab = await chrome.tabs.create({ url: 'https://www.facebook.com/groups/joins/', active: false });
    await this.waitForTabLoad(tab.id);
    await this.ensureFbBridge(tab.id);
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
    const tabs = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
    const merged = new Map();
    for (const tab of tabs) {
      if (!tab.url?.includes('/groups/joins')) continue;
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
        deep: true,
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

  async navigateFbTabToGroup(groupId, { active = false } = {}) {
    const tab = await this.getFbTab();
    const url = `https://www.facebook.com/groups/${groupId}`;
    const needsNav = !tab.url?.includes(`/groups/${groupId}`);
    if (needsNav) {
      await chrome.tabs.update(tab.id, { url, active });
      await this.waitForTabLoad(tab.id);
    } else if (active) {
      await chrome.tabs.update(tab.id, { active: true });
    }
    const ready = await this.ensureFbBridge(tab.id, needsNav ? 15 : 8);
    if (!ready) {
      throw new Error('Không kết nối tab Facebook — mở facebook.com, F5 trang, rồi thử lại');
    }
    return tab;
  },

  async sendToFb(type, payload = {}, { timeoutMs = 120000 } = {}) {
    const classicPost = type === 'GF_POST' && (
      payload.postMode === 'classic'
      || payload.mediaType === 'video'
      || Boolean(payload.videoBase64)
    );
    let tab;
    if (classicPost && payload.groupId) {
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: {
          phase: 'classic-nav',
          group: payload.groupName || payload.groupId,
          snippet: 'Cổ điển: mở trang nhóm FB…',
        },
      }).catch(() => {});
      tab = await this.navigateFbTabToGroup(payload.groupId, { active: false });
      await this.delay(2800);
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
    const sendPromise = chrome.tabs.sendMessage(tab.id, { type, ...payload });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(
        'Cổ điển quá lâu (timeout) — thử Chế độ Nhanh hoặc F5 tab Facebook rồi đăng lại',
      )), timeoutMs);
    });
    const res = await Promise.race([sendPromise, timeoutPromise]);
    if (res && res.ok === false) {
      throw new Error(res.error || 'Thao tác Facebook thất bại');
    }
    return res;
  },

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
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

  pauseDelayMs(minutes) {
    const base = Math.max(0, Number(minutes) || 0) * 60 * 1000;
    if (!base) return 0;
    return Math.round(base * (0.85 + Math.random() * 0.3));
  },

  resolvePostAutomation(post, settings = {}) {
    return {
      postMode: post.postMode || settings.postMode || 'fast',
      securityLevel: post.securityLevel || settings.securityLevel || 'balanced',
      avoidNight: post.avoidNight !== undefined ? post.avoidNight : settings.avoidNight !== false,
      pauseEvery: Math.max(1, Number(post.pauseEvery) || 1),
      pauseMinutes: Math.max(0, Number(post.pauseMinutes) ?? 2),
      delayOnFail: Boolean(post.delayOnFail),
    };
  },

  async waitAfterPostAttempt({ post, settings, postsSincePause, hadError, postedOk, hasMoreInGroup, hasMorePosts }) {
    const auto = this.resolvePostAutomation(post, settings);
    const shouldWait = postedOk || (hadError && auto.delayOnFail);
    if (!shouldWait) return postsSincePause;
    if (!hasMoreInGroup && !hasMorePosts) return postsSincePause;

    let count = postsSincePause + 1;
    if (count >= auto.pauseEvery) {
      const ms = this.pauseDelayMs(auto.pauseMinutes);
      if (ms > 0) {
        chrome.runtime.sendMessage({
          type: 'GF_PROGRESS',
          data: { phase: 'pause', snippet: `Nghỉ ${auto.pauseMinutes} phút (bảo vệ tài khoản)…` },
        }).catch(() => {});
        await this.delay(ms);
      }
      return 0;
    }

    const delays = await this.getSecurityDelays(auto.securityLevel);
    await this.delay(this.randBetween(delays.betweenGroups) * 1000);
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
        enriched.url = `https://www.facebook.com/groups/${enriched.group_id}/permalink/${pid}/`;
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

  async postGroupItem(payload) {
    const postMode = payload.postMode || 'fast';
    if (this.canPostInBackground(payload, postMode)) {
      try {
        return await globalThis.GF.fbPostBg.postToGroup({
          groupId: payload.groupId,
          text: payload.text,
          imageBase64: payload.imageBase64,
          images: payload.images,
          mediaMime: payload.mediaMime,
          actorId: payload.actorId,
          backgroundColor: payload.backgroundColor,
        });
      } catch (e) {
        const S = globalThis.GF?.fbSessionBg;
        if (S && /fb_dtsg|hết hạn|session|token/i.test(e.message || '')) {
          S.invalidateCache?.();
          try {
            return await globalThis.GF.fbPostBg.postToGroup({
              groupId: payload.groupId,
              text: payload.text,
              imageBase64: payload.imageBase64,
              images: payload.images,
              mediaMime: payload.mediaMime,
              actorId: payload.actorId,
              backgroundColor: payload.backgroundColor,
            });
          } catch (e2) {
            if (postMode === 'fast') throw e2;
          }
        } else if (postMode === 'fast') {
          throw e;
        }
      }
    }
    const useClassic = postMode === 'classic'
      || payload.mediaType === 'video'
      || Boolean(payload.videoBase64);
    if (useClassic) {
      return this.sendToFb('GF_POST', { ...payload, postMode: 'classic' });
    }
    throw new Error('Đăng nền chưa sẵn sàng — Reload extension (chrome://extensions) rồi thử lại');
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
      return `https://www.facebook.com/groups/${gid}/permalink/${pid}/`;
    }
    if (gid) return `https://www.facebook.com/groups/${gid}/`;
    return null;
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
    if (!job?.posts?.length || !postResults?.size) return null;
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const now = new Date().toISOString();
    let changed = false;
    for (const post of job.posts) {
      const stats = postResults.get(post.id);
      if (!stats) continue;
      const p = queue.find((x) => x.id === post.id);
      if (!p) continue;
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
      } else if (successGroups > 0) {
        p.postStatus = 'partial';
      } else if (stats.fail > 0) {
        p.postStatus = 'failed';
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

  async runPostMatrix(job) {
    if (this.running) throw new Error('Đang chạy job khác');
    this.running = true;
    this.stopRequested = false;
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'extractedGroups', 'postMode', 'securityLevel', 'avoidNight', 'activeActorId']);
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
        const queueData = await chrome.storage.local.get('postQueue');
        const freshPost = (queueData.postQueue || []).find((p) => p.id === post.id);
        if (freshPost) {
          post = { ...freshPost, groupIds: post.groupIds?.length ? post.groupIds : freshPost.groupIds };
          job.posts[pi] = post;
        }

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
          const postMode = auto.postMode;
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
              snippet: postMode === 'classic' ? 'Cổ điển (DOM trên FB)…' : 'Nhanh (API nền)…',
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
              actorId: job.actorId || settings.activeActorId,
              backgroundColor: post.backgroundColor,
            });
          } catch (e) {
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
            if (postMode === 'fast' && settings.classicFallbackOnFastFail) {
              chrome.runtime.sendMessage({
                type: 'GF_PROGRESS',
                data: {
                  phase: 'classic-fallback',
                  group: group.name,
                  snippet: `Nhanh lỗi → thử Cổ điển: ${e.message}`,
                },
              }).catch(() => {});
              try {
                res = await this.sendToFb('GF_POST', {
                  groupId: group.id,
                  groupName: group.name,
                  text,
                  imageBase64: post.imageBase64,
                  images: post.images,
                  videoBase64: post.videoBase64,
                  mediaType: post.mediaType,
                  mediaMime: post.mediaMime,
                  lang: settings.fbLang || 'vi',
                  postMode: 'classic',
                  actorId: job.actorId || settings.activeActorId,
                  backgroundColor: post.backgroundColor,
                  images: post.images,
                });
              } catch (e2) {
                done += 1;
                bumpPostResult(post.id, 'fail');
                await this.appendHistory({
                  type: 'post',
                  ok: false,
                  group_id: group.id,
                  group_name: group.name,
                  snippet: text.slice(0, 80),
                  error: `Nhanh: ${e.message} → Cổ điển: ${e2.message}`,
                  mode: 'classic-fallback',
                });
                chrome.runtime.sendMessage({
                  type: 'GF_PROGRESS',
                  data: { phase: 'error', done, total, group: group.name, error: e2.message },
                }).catch(() => {});
                postsSincePause = await this.waitAfterPostAttempt({
                  post,
                  settings,
                  postsSincePause,
                  hadError: true,
                  postedOk: false,
                  hasMoreInGroup: gi < groups.length - 1,
                  hasMorePosts: pi < job.posts.length - 1,
                });
                continue;
              }
            } else {
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
              });
              continue;
            }
          }

          postedOk = Boolean(res && ((res.postId && res.postId !== 'pending') || res.status === 'pending_approval'));

          if (res) {
            done += 1;
            let fbUser = settings.fbUser || await this.getFbUserFromCookie();
            if (!fbUser) {
              try {
                fbUser = (await this.sendToFb('GF_GET_FB_USER')).user;
              } catch { /* ignore */ }
            }

            if (res.postId && res.postId !== 'pending' && job.sync) {
              try {
                const base = (await chrome.storage.local.get('tidienBaseUrl')).tidienBaseUrl || 'https://tidien.xyz';
                const key = await chrome.storage.local.get(['tidienApiKey', 'tidienToken']);
                const token = key.tidienApiKey || key.tidienToken;
                await fetch(`${base.replace(/\/$/, '')}/api/group-posts/sync`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    group_id: group.id,
                    group_name: group.name,
                    post_id: res.postId,
                    noi_dung: text,
                    prompt_anh: post.prompt_anh || '',
                    ngay_dang: post.ngay_dang,
                    gio_dang: post.gio_dang,
                    posted_at: new Date().toISOString(),
                    posted_by: fbUser?.id,
                  }),
                });
              } catch (e) {
                console.warn('Sync failed', e);
              }
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
              this.pushPostedGroupResult(postGroupResults, post.id, {
                group_id: String(group.id),
                group_name: group.name,
                post_id: res.postId,
                url: res.url || this.buildGroupPostUrl(group.id, res.postId),
                status: res.status || (res.postId === 'pending' ? 'pending_approval' : 'posted'),
                posted_at: new Date().toISOString(),
                firstCommentOk: null,
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
          });
        }
        if (pi < job.posts.length - 1) {
          const auto = this.resolvePostAutomation(post, settings);
          const delays = await this.getSecurityDelays(auto.securityLevel);
          await this.delay(this.randBetween([delays.betweenPosts, delays.betweenPosts + 60]) * 1000);
        }
      }
    } finally {
      this.running = false;
      const summary = await this.applyPostMatrixResults(job, postResults, postGroupResults);
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: {
          phase: 'done',
          done,
          total,
          okCount: successCount,
          failCount,
          summary,
        },
      }).catch(() => {});
    }
  },

  async commentOnPostBgOrClassic(job, settings) {
    const FC = globalThis.GF?.fbCommentBg;
    const validPostId = job.post_id && /^\d+$/.test(String(job.post_id));
    if (FC && validPostId) {
      try {
        return await FC.commentOnPost({
          groupId: job.group_id,
          postId: job.post_id,
          text: job.comment,
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
      text: job.comment,
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
    let res;
    try {
      res = await this.commentOnPostBgOrClassic(job, settings);
    } catch (e) {
      await this.markPostedGroupCommented(job.post_queue_id, job.group_id, false);
      await this.appendHistory({
        type: 'comment',
        ok: false,
        group_id: job.group_id,
        group_name: job.group_name,
        post_id: job.post_id,
        snippet: job.comment?.slice(0, 80),
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
      snippet: job.comment?.slice(0, 80),
      error: res.warning,
      mode: res.mode,
    });
    return res;
  },

  async runComment(job) {
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'activeActorId']);
    let res;
    try {
      res = await this.commentOnPostBgOrClassic(job, settings);
    } catch (e) {
      await this.appendHistory({
        type: 'comment',
        ok: false,
        group_id: job.group_id,
        post_id: job.post_id,
        snippet: job.comment?.slice(0, 80),
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
      snippet: job.comment?.slice(0, 80),
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
      selected: true,
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
    return {
      last_post_id: this.maxLocalId(cfg.tidienPendingComments),
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
      const cfg = await chrome.storage.local.get(['tidienPendingComments', 'postQueue']);
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
        await chrome.storage.local.set({
          tidienPendingComments: merged,
          tidienCommentsSyncedAt: Date.now(),
        });
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
    if (cfg.tidienAutoSyncEnabled === false) return { ok: false, skipped: 'disabled' };

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

console.log('[GroupFlow] service worker ready');

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'radar_scan') {
    await GF_BG.runRadarScan();
    return;
  }
  if (alarm.name.startsWith('gf_img_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) return;
    if (data.kind === 'generate_image') {
      try {
        await GF_BG.runImageGenerate(data.payload);
      } catch (e) {
        console.warn('Image alarm failed:', e.message);
      }
    }
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    return;
  }
  if (alarm.name.startsWith('gf_job_') || alarm.name.startsWith('gf_cmt_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) return;
    if (data.kind === 'post') await GF_BG.runPostMatrix(data.payload);
    if (data.kind === 'comment') await GF_BG.runComment(data.payload);
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    return;
  }
  if (alarm.name === 'gf_retry_missed') {
    const d = await chrome.storage.local.get('activityUpcoming');
    const now = Date.now();
    const remaining = [];
    for (const item of d.activityUpcoming || []) {
      if (item.when <= now) {
        if (item.kind === 'post') await GF_BG.runPostMatrix(item.payload);
        if (item.kind === 'generate_image') {
          try {
            await GF_BG.runImageGenerate(item.payload);
          } catch (e) {
            console.warn('Missed image job:', e.message);
          }
        }
        if (item.kind === 'comment') await GF_BG.runComment(item.payload);
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      // Broadcast từ chính background — không phải request từ sidepanel
      if (msg.type === 'GF_PROGRESS' || msg.type === 'GF_RADAR_UPDATED' || msg.type === 'GF_ACTIVITY_REFRESH' || msg.type === 'GF_POST_MATRIX_DONE') return;

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
        GF_BG.runPostMatrix(msg.payload);
        sendResponse({ ok: true, started: true });
        return;
      }
      if (msg.type === 'GF_STOP') {
        GF_BG.stopRequested = true;
        sendResponse({ ok: true });
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
      if (msg.type === 'GF_SCHEDULE_ALARM') {
        await chrome.alarms.clear(msg.name);
        chrome.alarms.create(msg.name, { when: msg.when });
        await chrome.storage.local.set({ [`alarm_${msg.name}`]: msg.data });
        sendResponse({ ok: true });
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

chrome.runtime.onInstalled.addListener(() => {
  console.info('[GroupFlow] SW v1.0.9 installed');
  chrome.alarms.create('gf_retry_missed', { periodInMinutes: 5 });
  chrome.alarms.create('gf_image_schedule', { periodInMinutes: 1 });
  GF_BG.scheduleTidienSyncAlarm().catch(() => {});
  GF_BG.prefetchGroups().catch(() => {});
  setTimeout(() => {
    GF_BG.syncFromTidien({ scope: 'comments' }).catch(() => {});
  }, 20_000);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('gf_image_schedule', { periodInMinutes: 1 });
  GF_BG.scheduleTidienSyncAlarm().catch(() => {});
  GF_BG.prefetchGroups().catch(() => {});
});
