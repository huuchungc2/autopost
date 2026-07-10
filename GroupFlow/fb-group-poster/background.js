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
  /** Tab đang active trước khi Cổ điển comment tự active hoá tab FB — restore lại sau khi xong. */
  _prevActiveTabBeforeComment: null,

  // Hàng đợi tuần tự DUY NHẤT cho mọi thao tác đụng tới tab Facebook dùng chung (đăng bài, comment
  // — cả chạy tay lẫn theo lịch alarm/tick). Trước đây `running`/`commentRunning` chỉ chặn riêng
  // post-với-post và comment-với-comment (chạy tay) — 1 lịch đăng bài và 1 lịch comment trùng giờ,
  // hoặc lịch alarm bắn trong lúc user đang bấm "▶ Chạy" tay, vẫn chạy CHỒNG NHAU, tranh giành cùng
  // 1 tab FB (nhảy nhóm/gõ nhầm bài đang mở). Giờ mọi task xếp vào 1 hàng đợi Promise duy nhất —
  // task nào tới lượt mới chạy, không còn báo lỗi "đang bận" hay chạy chồng nữa.
  _taskQueue: Promise.resolve(),
  _queueLength: 0,

  // v1.0.198 — chặn 1 job lịch "1 lần cụ thể" chạy 2 LẦN: chrome.alarms một-lần (gf_cmt_*/gf_job_*)
  // và gf_retry_missed (quét activityUpcoming mỗi phút, coi bất kỳ item nào when<=now là "lỡ hẹn")
  // trước đây hoàn toàn ĐỘC LẬP nhau — không bên nào biết bên kia đã/đang xử lý cùng 1 alarmName.
  // chrome.alarms không đảm bảo bắn ĐÚNG giờ (có thể trễ), nên rất dễ xảy ra: gf_retry_missed quét
  // thấy when đã qua (vì trễ vài giây/chục giây), chạy job đó qua nhánh "lỡ hẹn" — trong khi alarm
  // thật vẫn còn tồn tại trong Chrome và sẽ tự bắn sau đó, đọc lại đúng payload alarm_<tên> (chưa bị
  // xoá) rồi chạy lại lần 2 → 2 comment với nội dung random khác nhau (đúng hiện tượng Tony báo,
  // 2 dòng Log cùng phút). Set trong bộ nhớ, đồng bộ (không await trước khi check-and-claim) nên
  // 2 lần gọi listener/tick không thể cùng lọt qua — mất khi service worker restart, nhưng chỉ cần
  // sống trong đúng 1 phiên là đủ chặn race này.
  _claimedAlarms: new Set(),

  enqueueTask(taskFn) {
    this._queueLength += 1;
    const run = async () => {
      try {
        return await taskFn();
      } finally {
        this._queueLength -= 1;
      }
    };
    const result = this._taskQueue.then(run, run);
    // Chain tiếp tục dù task này lỗi — 1 task lỗi không được làm kẹt toàn bộ hàng đợi sau nó.
    this._taskQueue = result.then(() => {}, () => {});
    return result;
  },

  async getPostingFbTabId() {
    // _postingFbTabId chỉ sống trong bộ nhớ — service worker MV3 bị Chrome tắt/khởi động lại
    // giữa chừng sẽ làm mất biến này, khiến extension "quên" tab đang dùng và mở tab khác dù
    // tab cũ vẫn còn mở. chrome.storage.session sống sót qua restart (chỉ mất khi đóng browser)
    // nên fallback đọc từ đó để tiếp tục dùng đúng 1 tab thay vì mở tràn lan.
    let tabId = this._postingFbTabId;
    if (!tabId) {
      try {
        const stored = await chrome.storage.session.get('gfPanelTabId');
        tabId = stored.gfPanelTabId || null;
      } catch { /* ignore */ }
    }
    if (!tabId) return null;
    try {
      const t = await chrome.tabs.get(tabId);
      if (t?.id && !t.incognito && /facebook\.com/i.test(t.url || '')) {
        this._postingFbTabId = t.id;
        return t.id;
      }
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
    // Trước đây chỉ check tab đã ghim (gfPanelTabId — tab đang mở panel extension) khi
    // this.running (chỉ true lúc đăng bài) — comment (this.commentRunning) không bao giờ vào
    // nhánh này, nên luôn rơi xuống pickBestFbTab() chấm điểm TOÀN BỘ tab FB đang mở, có thể chọn
    // 1 tab khác hẳn tab người dùng đang nhìn (vd nhiều cửa sổ, nhiều tab FB) — cảm giác "tự nhảy
    // sang tab khác". Bỏ điều kiện this.running, luôn ưu tiên tab đã ghim nếu còn hợp lệ.
    const pinned = await this.getPostingFbTabId();
    if (pinned) return chrome.tabs.get(pinned);
    const tabs = await this.listFbTabs();
    const existing = await this.pickBestFbTab(tabs);
    if (existing) {
      // Ghim luôn (không chỉ lúc đăng bài) — lần chạy tiếp theo (kể cả comment) dùng lại đúng tab
      // này thay vì chấm điểm lại từ đầu mỗi lần.
      await this.bindPostingFbTab(existing);
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
      // Bug thật đã gặp: job hẹn lịch (chạy tự động, không ai theo dõi) đăng vào 2+ nhóm — nhóm
      // ĐẦU dùng active:true (firstClassicFocus) chạy ổn, nhưng từ nhóm THỨ 2 trở đi (tab đã
      // "warm") trước đây dùng active:false để đỡ giật focus liên tục — tab nằm NỀN, Chrome giảm
      // tốc setTimeout mạnh (gõ chữ/chờ composer đều dùng setTimeout) → "kẹt" rất lâu, có khi gõ
      // ra chữ mà mất luôn ảnh do reconciliation của Lexical bị trễ/rối khi cuối cùng cũng chạy.
      // Đúng bug đã từng gặp + đã fix cho luồng Comment (xem chú thích ở nhánh GF_COMMENT bên
      // dưới) — nay áp dụng lại cho luồng Đăng bài: LUÔN active:true, không chỉ nhóm đầu tiên.
      tab = await this.navigateFbTabToGroup(payload.groupId, {
        active: true,
        forClassic: true,
      });
      // tabs.active:true chỉ đảm bảo đây là tab được chọn TRONG cửa sổ của nó — nếu cả CỬA SỔ
      // không phải cửa sổ đang có focus hệ điều hành (job chạy tự động không ai ngồi trước máy,
      // hoặc đang xem màn hình khác qua remote desktop), Chrome vẫn có thể giảm tốc tab như bình
      // thường. Ép luôn cửa sổ lên foreground cho chắc.
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
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
        await chrome.tabs.update(tab.id, { url: groupUrl, active: true });
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
      // Khác với luồng đăng bài (ép active: true khi mở nhóm), luồng comment trước đây KHÔNG bao
      // giờ active hoá tab — nếu user đang xem tab khác, tab comment nằm nền, Chrome giảm tốc
      // setTimeout mạnh (gõ DOM/chờ composer dùng setTimeout) → tự "kẹt" tới khi user tình cờ
      // chuyển sang đúng tab đó thì mới chạy tiếp (đúng hiện tượng đã báo cáo). Ghi lại tab đang
      // active để restore lại sau khi comment xong (xem cuối hàm) — không ép user kẹt luôn ở tab
      // Facebook.
      const [prevActiveTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
      this._prevActiveTabBeforeComment = prevActiveTab?.id ? prevActiveTab : null;
      const tab0 = await this.getFbTab();
      const url = `https://www.facebook.com/groups/${payload.groupId}/posts/${payload.postId}`;
      if (!tab0.url?.includes(`/groups/${payload.groupId}/posts/${payload.postId}`)) {
        await chrome.tabs.update(tab0.id, { url, active: true });
        await this.waitForTabLoad(tab0.id);
      } else {
        await chrome.tabs.update(tab0.id, { active: true }).catch(() => {});
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
    let res;
    try {
      res = await Promise.race([sendPromise, timeoutPromise, stopPromise]);
    } finally {
      // Restore lại tab/window user đang xem trước khi comment tự active hoá tab FB — chạy dù
      // thành công hay lỗi/timeout, không để user bị "kẹt" ở tab Facebook sau khi xong.
      if (type === 'GF_COMMENT' && this._prevActiveTabBeforeComment) {
        const prev = this._prevActiveTabBeforeComment;
        this._prevActiveTabBeforeComment = null;
        chrome.tabs.update(prev.id, { active: true }).catch(() => {});
        if (prev.windowId) chrome.windows.update(prev.windowId, { focused: true }).catch(() => {});
      }
    }
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
      fast: { betweenGroups: [5, 60], betweenPosts: 180, betweenComments: [90, 180] },
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

  // chrome.storage là read-modify-write không nguyên tử — 2 lệnh gọi song song (vd 2 nhóm
  // đăng gần như cùng lúc ở mode nền) có thể đọc cùng 1 bản cũ rồi ghi đè lẫn nhau, làm mất
  // 1 entry. Nối tiếp mọi lệnh gọi qua 1 chain để đảm bảo không lệnh nào ghi đè lệnh khác.
  _historyWriteChain: Promise.resolve(),
  async appendHistory(entry) {
    const run = async () => {
      const d = await chrome.storage.local.get('activityHistory');
      const list = d.activityHistory || [];
      const enriched = { ...entry, at: new Date().toISOString(), id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
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
    };
    this._historyWriteChain = this._historyWriteChain.then(run, run);
    return this._historyWriteChain;
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
      'routerApiKey', 'tidienBaseUrl', 'imageProviderId',
    ]);
    return {
      routerApiKey: s.routerApiKey || '',
      tidienBaseUrl: s.tidienBaseUrl || 'https://tidien.xyz',
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

  // Lịch "lặp lại hàng ngày" giờ CỐ ĐỊNH cho cả bài đăng (kind:'post') lẫn comment (kind:'comment')
  // — thay cơ chế khung giờ ngẫu nhiên cũ (chỉ chạy 1 job/3 phút trong 1 range giờ). Giờ mỗi entry
  // có sẵn timeOfDay riêng (tính từ giờ bắt đầu + giãn cách user tự chọn lúc lên lịch — xem
  // sidepanel.js scheduleSelectedComments()/confirmCampaignStagger()), nên không cần random nữa —
  // mỗi tick (1 phút) chạy MỌI entry khớp đúng giờ:phút hiện tại và chưa chạy hôm nay.
  //
  // v1.0.192 — tách `pendingRunDate` (đánh dấu "đã NHẬN, đang chờ tới lượt chạy trong hàng đợi",
  // set NGAY, đồng bộ) khỏi `lastRunDate` (đánh dấu "đã CHẠY XONG thật", chỉ set SAU khi
  // runComment()/runPostMatrix() hoàn tất — markDailyScheduleDone()). Trước bản này chỉ có
  // `lastRunDate`, set NGAY trước khi enqueue — nếu Chrome/máy tắt (hoặc service worker bị kill)
  // đúng lúc job còn nằm trong hàng đợi (chưa kịp chạy thật), storage đã lỡ ghi "hôm nay xong" dù
  // CHƯA hề đăng gì lên Facebook — hôm đó mất trắng, không cách nào phát hiện lại được, tick ngày
  // mai chỉ chờ đúng `timeOfDay` mới chạy tiếp. Giờ: `pendingRunDate` vẫn chặn tick TRONG CÙNG
  // PHIÊN (không enqueue trùng khi đang chờ tới lượt) y hệt trước, nhưng `recoverStalledDailySchedules()`
  // (gọi lúc `chrome.runtime.onStartup` — phiên MỚI, nên "pending" từ phiên trước chắc chắn đã dở
  // dang) xoá `pendingRunDate` không khớp `lastRunDate`, để tick kế tiếp coi là "chưa chạy" và chạy
  // bù ngay — đúng yêu cầu "chưa chạy thì phải chạy lại khi mở máy".
  async tickDailyFixedSchedules() {
    const d = await chrome.storage.local.get(['dailyFixedSchedules', 'securityLevel']);
    const list = d.dailyFixedSchedules || [];
    if (!list.length) return;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const today = now.toISOString().slice(0, 10);
    let changed = false;
    const delays = await this.getSecurityDelays(d.securityLevel);
    let dueCount = 0;

    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (entry.lastRunDate === today || entry.pendingRunDate === today) continue;
      // So sánh chuỗi "HH:MM" (đã zero-pad) hoạt động đúng như so sánh giờ thật. Trước đây chỉ
      // khớp ĐÚNG phút hiện tại — service worker/trình duyệt tắt đúng lúc đó (máy tắt, Chrome
      // đóng) thì bị bỏ qua hẳn hôm đó, chỉ chạy lại vào đúng giờ này NGÀY MAI. Giờ bắt kịp: giờ
      // đã qua hôm nay mà chưa chạy thì vẫn chạy ngay khi tick tiếp theo tới (dù trễ), chỉ bỏ qua
      // nếu giờ đó CHƯA tới.
      if (entry.timeOfDay > hhmm) continue;
      changed = true;
      // Đánh dấu "đã nhận" NGAY (trước khi chạy thật) — tách phát hiện (nhanh) khỏi chạy thật (có
      // thể chờ lâu trong hàng đợi nếu đang bận việc khác). Nếu không, tick sau (1 phút, có thể
      // tới trước khi task này tới lượt chạy) sẽ phát hiện lại đúng entry này lần nữa → xếp hàng
      // đợi trùng lặp. CHỈ đánh dấu pendingRunDate — lastRunDate chỉ set sau khi chạy xong thật.
      list[i] = { ...entry, pendingRunDate: today };
      const entryId = entry.id;
      // Entry đầu tiên trong tick này: jitter nhỏ (0-20s) như cũ — chỉ để tránh bắn đúng giây y hệt
      // mỗi ngày. Entry thứ 2 trở đi TRONG CÙNG TICK (2026-07-04 — vd nhiều lịch cùng bị lỡ dồn lại
      // sau khi mở lại máy) dùng đúng betweenPosts/betweenComments theo securityLevel — tránh dồn
      // cục nhiều tác vụ sát nhau, cùng lý do với retryMissedActivity().
      const gapMs = dueCount === 0
        ? Math.floor(Math.random() * 20) * 1000
        : (entry.kind === 'post'
          ? this.randBetween([delays.betweenPosts, delays.betweenPosts + 60]) * 1000
          : this.randBetween(delays.betweenComments) * 1000);
      dueCount += 1;
      this.enqueueTask(async () => {
        await this.delay(gapMs);
        try {
          if (entry.kind === 'post') await this.runPostMatrix(entry.payload);
          else if (entry.kind === 'comment') await this.runComment(entry.payload);
          await this.markDailyScheduleDone(entryId, today);
        } catch (e) {
          console.warn('[GroupFlow] daily fixed schedule failed:', entryId, e.message);
        }
      });
    }
    if (changed) await chrome.storage.local.set({ dailyFixedSchedules: list });
  },

  async markDailyScheduleDone(id, today) {
    const d = await chrome.storage.local.get('dailyFixedSchedules');
    const list = d.dailyFixedSchedules || [];
    const idx = list.findIndex((e) => e.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], lastRunDate: today, lastRunAt: Date.now() };
    await chrome.storage.local.set({ dailyFixedSchedules: list });
  },

  // Gọi CHỈ lúc chrome.runtime.onStartup — đây là phiên MỚI của service worker, nên bất kỳ entry
  // nào còn "pendingRunDate" mà KHÔNG khớp "lastRunDate" chắc chắn là job của phiên TRƯỚC đã bị
  // ngắt giữa chừng (máy/Chrome tắt trước khi runComment()/runPostMatrix() kịp chạy xong) — xoá
  // pendingRunDate để tickDailyFixedSchedules() (gọi ngay sau, cùng trong onStartup) coi là "chưa
  // chạy hôm nay" và chạy bù ngay, thay vì im lặng chờ tới đúng giờ hôm sau.
  async recoverStalledDailySchedules() {
    const d = await chrome.storage.local.get('dailyFixedSchedules');
    const list = d.dailyFixedSchedules || [];
    let changed = false;
    const recovered = list.map((entry) => {
      if (entry.pendingRunDate && entry.pendingRunDate !== entry.lastRunDate) {
        changed = true;
        return { ...entry, pendingRunDate: null };
      }
      return entry;
    });
    if (changed) await chrome.storage.local.set({ dailyFixedSchedules: recovered });
  },

  // Flow 3 (đồng bộ sau khi comment xong) — v1.0.187: KHÔNG còn best-effort-im-lặng thuần tuý. Trước
  // bản này, PATCH fail (mất mạng, server bận, license key hết hạn giữa chừng…) là mất vĩnh viễn —
  // server không bao giờ biết đã comment, comment_count không tăng, người khác vẫn bị gán vào đúng
  // bài đó tưởng còn thiếu. `commentedRecords` (local, v1.0.185) chỉ dùng để hiện tag "✓ Đã comment"
  // TRÊN CHÍNH MÁY NÀY (từ v1.0.194 không còn chặn tự-comment-lại nữa), không giúp SERVER và MÁY
  // KHÁC biết — cần retry thật, không chỉ nuốt lỗi.
  async markCrossPostCommentedFromBg(serverId) {
    if (!serverId) return;
    const auth = await this.getTidienAuth();
    if (!auth) {
      await this.queuePendingCommentedSync(serverId);
      return;
    }
    try {
      const res = await fetch(`${auth.base}/api/user-sync/posts/${serverId}/commented`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      await this.queuePendingCommentedSync(serverId);
    }
  },

  async queuePendingCommentedSync(serverId) {
    const d = await chrome.storage.local.get('pendingCommentedSync');
    const list = d.pendingCommentedSync || [];
    const key = String(serverId);
    if (!list.includes(key)) list.push(key);
    await chrome.storage.local.set({ pendingCommentedSync: list.slice(-500) });
  },

  // Chạy trong mỗi chu kỳ gf_tidien_sync (cùng chỗ đẩy/kéo activity log) — thử lại các lượt PATCH
  // .../commented đã fail trước đó, tới khi server xác nhận OK mới bỏ khỏi hàng đợi.
  async flushPendingCommentedSync(auth, headers) {
    const d = await chrome.storage.local.get('pendingCommentedSync');
    const list = d.pendingCommentedSync || [];
    if (!list.length) return { flushed: 0, remaining: 0 };
    const remaining = [];
    let flushed = 0;
    for (const serverId of list) {
      try {
        const res = await fetch(`${auth.base}/api/user-sync/posts/${serverId}/commented`, {
          method: 'PATCH',
          headers,
        });
        if (res.ok) flushed += 1;
        else remaining.push(serverId);
      } catch {
        remaining.push(serverId);
      }
    }
    await chrome.storage.local.set({ pendingCommentedSync: remaining });
    return { flushed, remaining: remaining.length };
  },

  resolvePostGroups(post, job, groupsMap) {
    const ids = post.groupIds || job.groupIds || [];
    // Bỏ qua nhóm đã có trong postedGroups (đăng thành công từ lần chạy trước) — quan trọng để
    // 1 job bị gián đoạn giữa chừng (SW restart, lỗi, retry) không đăng trùng vào nhóm đã xong.
    const alreadyPosted = new Set((post.postedGroups || []).map((g) => String(g.group_id)));
    return ids
      .filter((id) => !alreadyPosted.has(String(id)))
      .map((id) => groupsMap.get(String(id)))
      .filter(Boolean);
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
    // Nhanh (GraphQL nền, không mở tab) thử trước — giống hệt cách comment đã làm
    // (commentOnPostBgOrClassic). Video chưa hỗ trợ upload qua GraphQL nền nên bỏ qua thẳng
    // sang Cổ điển. Lỗi Nhanh RÕ RÀNG (session hết hạn, FB từ chối kèm response — field_exception,
    // không có quyền...) mới fallback Cổ điển — 2 cơ chế độc lập nhau nên lỗi rõ bên Nhanh không có
    // nghĩa Cổ điển cũng lỗi.
    //
    // Bug thật đã gặp: request Nhanh ĐƯỢC FB TẠO BÀI THẬT phía server nhưng response bị rớt trước
    // khi về tới đây (mất mạng, service worker bị Chrome tạm ngưng giữa request, 5xx tạm thời của
    // hạ tầng FB...) — graphqlRequest()/fetchWithRetry() (fbSessionBg.js) không thể phân biệt "FB
    // chưa xử lý" với "FB xử lý rồi nhưng mất phản hồi", nên đánh dấu `e.ambiguousDelivery = true`
    // cho đúng 2 trường hợp này. Nếu tự fallback Cổ điển như mọi lỗi khác → ĐĂNG TRÙNG THẬT vào
    // cùng 1 nhóm (Nhanh đã đăng xong, Cổ điển đăng thêm 1 lần nữa) — không lộ ra ngay vì Nhanh
    // "trông như lỗi" nên không ai để ý bài đã lên. Với lỗi ambiguousDelivery: KHÔNG fallback Cổ
    // điển, báo lỗi rõ để user tự mở nhóm kiểm tra trước khi đăng lại tay — thà bỏ lỡ 1 lượt đăng
    // còn hơn đăng trùng nhìn như spam (rủi ro nhóm/tài khoản bị FB gắn cờ).
    const FP = globalThis.GF?.fbPostBg;
    const isVideo = payload.mediaType === 'video' || Boolean(payload.videoBase64);
    if (FP && !isVideo && payload.groupId) {
      try {
        const res = await FP.postToGroup({
          groupId: payload.groupId,
          text: payload.text,
          imageBase64: payload.imageBase64,
          images: payload.images,
          mediaMime: payload.mediaMime,
          actorId: payload.actorId,
          backgroundColor: payload.backgroundColor,
        });
        if (res?.postId) return res;
      } catch (e) {
        if (e.ambiguousDelivery) {
          throw new Error(
            `Không rõ Nhanh đã đăng thành công hay chưa (mất phản hồi từ FB) — mở nhóm kiểm tra trước khi đăng lại, tránh đăng trùng. Chi tiết: ${e.message}`,
          );
        }
        console.warn('[GroupFlow] fast post failed, fallback Classic:', e.message);
      }
      if (this.stopRequested) throw new Error('Đã dừng đăng');
    }
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

  // Giữ ĐỒNG BỘ với GF.commentTemplates.DEFAULT (modules/commentTemplates.js) — buộc phải trùng
  // lặp vì modules/commentTemplates.js chưa từng được đưa vào build-sw-bundle.js nên service
  // worker (chạy file này) không thấy được module đó, chỉ sidepanel (UI) mới load trực tiếp.
  COMMENT_TEMPLATE_DEFAULT: `{Hay quá|Đúng ý ghê|Cảm ơn bạn chia sẻ|Thông tin hữu ích quá|Cảm ơn bạn nhé}
{Mình cũng đang cần|Để mình lưu lại|Hữu ích thật sự|Đang tìm đúng cái này|Lưu lại xem sau}
{Ủng hộ bạn|Tuyệt vời luôn|Like mạnh cho bạn|Ủng hộ nhiệt tình|Quá đỉnh}
{Cảm ơn thông tin|Bổ ích quá|Hay đó bạn ơi|Thông tin quý giá|Cảm ơn đã chia sẻ nha}
{Bài viết chất lượng|Nội dung hay quá|Đọc xong thấy hữu ích|Chia sẻ hay đó|Cảm ơn bạn đã đăng bài}
{Đúng thứ mình đang tìm|Vừa đúng ý mình luôn|Tìm được rồi nè|May quá gặp đúng bài này|Đang cần đúng cái này}
{Theo dõi bạn để cập nhật thêm|Follow trang luôn|Sẽ theo dõi thường xuyên|Lưu bài để xem lại|Đánh dấu bài này}
{Chúc bạn thuận lợi|Chúc mọi việc suôn sẻ|Chúc bạn sớm thành công|Chúc bạn nhiều may mắn|Chúc bạn thật tốt}
{Rất đáng tham khảo|Nên đọc bài này|Bạn nào cần thì xem thử|Đáng để tìm hiểu|Nên lưu lại tham khảo}
{Chia sẻ hữu ích thế này hiếm lắm|Cảm ơn bạn đã dành thời gian chia sẻ|Bài chia sẻ tâm huyết|Rất chân thành cảm ơn|Cảm ơn bạn nhiều lắm}`,

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

  // Ghi ngay 1 group vừa đăng thành công vào postQueue — không đợi tới cuối job (finally của
  // runPostMatrix) mới lưu. Nếu service worker bị Chrome tắt/khởi động lại giữa chừng (rất hay
  // gặp với job nhiều nhóm/nhiều delay ở MV3), tiến độ các nhóm đã đăng vẫn không bị mất, nên
  // lần retry sau (reconcileQueueSchedules hoặc job mới) sẽ không đăng lại nhóm đã xong.
  async persistGroupProgress(postId, groupDetail) {
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const p = queue.find((x) => x.id === postId);
    if (!p) return;
    p.postedGroups = this.mergePostedGroups(p.postedGroups, [groupDetail]);
    p.lastPostedAt = new Date().toISOString();
    await chrome.storage.local.set({ postQueue: queue });
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

  // Ghi nhớ CỤC BỘ, độc lập với postQueue/server, rằng đã comment xong post_queue_id+group_id
  // này — nguồn-sự-thật duy nhất không phụ thuộc round-trip mạng. Trước bản này, "đã comment hay
  // chưa" của bài server/cross chỉ dựa vào markPostedGroupCommented() (chỉ tìm thấy entry nếu bài
  // nằm trong postQueue cục bộ — bài kéo về từ server/đồng đội thì KHÔNG, nên luôn no-op) hoặc
  // markCrossPostCommentedFromBg() (PATCH best-effort, nuốt lỗi khi fail). Hễ 1 trong 2 đường đó
  // không ghi nhận được (401/mismatch license key, mất mạng, server down…) thì extension hoàn toàn
  // không nhớ đã comment — mỗi lần refresh tab Comment, autoScheduleUnscheduledComments() lại coi
  // bài là "chưa có lịch + chưa xong" rồi tự lên lịch lại, chạy lại, comment trùng lặp vô hạn. Ghi
  // ngay tại đây (chạy trong runComment() ngay sau khi comment lên FB thành công, trước khi có bất
  // kỳ sync mạng nào) đảm bảo isCommentDone() (sidepanel.js) luôn biết bài đã xong dù mọi sync khác
  // đều fail. Cắt bớt (giữ 3000 postQueueId chạm gần nhất) tránh phình vô hạn.
  async markCommentDoneLocal(postQueueId, groupId) {
    if (!postQueueId || !groupId) return;
    const d = await chrome.storage.local.get('commentedRecords');
    const map = d.commentedRecords || {};
    const key = String(postQueueId);
    if (!map[key]) map[key] = {};
    map[key][String(groupId)] = Date.now();
    const keys = Object.keys(map);
    if (keys.length > 3000) {
      keys
        .map((k) => ({ k, ts: Math.max(...Object.values(map[k])) }))
        .sort((a, b) => a.ts - b.ts)
        .slice(0, keys.length - 3000)
        .forEach(({ k }) => delete map[k]);
    }
    await chrome.storage.local.set({ commentedRecords: map });
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

  async applyPostMatrixResults(job, postResults, postGroupResults, crashError) {
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
        // Không có stats nghĩa là bài này chưa kịp thử đăng nhóm nào — do user bấm Dừng, HOẶC do
        // job crash giữa chừng (vd generateImage() lỗi trước bước đăng). Cả 2 trường hợp đều phải
        // đánh dấu 'failed' — nếu không, postStatus giữ nguyên như cũ (chưa "done"),
        // reconcileQueueSchedules() sẽ coi bài vẫn "chưa xong" và lặp lại job y hệt mỗi khi service
        // worker khởi động lại, tạo vòng lặp lỗi vô hạn mà người dùng không thấy lý do.
        if ((this.stopRequested || crashError) && !['posted', 'pending_approval', 'partial'].includes(p.postStatus)) {
          p.postStatus = 'failed';
          changed = true;
          // Job crash (không phải user bấm Dừng) => lỗi không tự khỏi khi thử lại y hệt (thiếu
          // provider, sai cấu hình...) — dọn luôn alarm/activityUpcoming của bài này, nếu không
          // gf_retry_missed (mỗi phút) vẫn cứ chạy lại job đã biết chắc sẽ lỗi.
          if (crashError) await this.clearPostScheduleAlarms(post.id);
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
        // Xếp vào hàng đợi tuần tự chung thay vì tự chờ-rồi-báo-lỗi sau 30 phút — lịch đăng bài
        // và lịch comment trùng giờ (hoặc trùng với thao tác tay của user) giờ chạy tuần tự, không
        // còn báo "đang bận, thử lại sau" nữa.
        await this.enqueueTask(() => this.runPostMatrix(payload));
      } else if (data.kind === 'generate_image') {
        await this.runImageGenerate(data.payload);
      } else if (data.kind === 'comment') {
        await this.enqueueTask(() => this.runComment(data.payload));
      } else {
        return false;
      }
      if (alarmName) await this.removeUpcomingByAlarmName(alarmName);
      return true;
    } catch (e) {
      // v1.0.221 — lịch "1 lần cụ thể" gặp bài chưa sẵn sàng (chờ duyệt/đã xóa — getPostAccess()
      // đã xác nhận) coi như XỬ LÝ XONG, không lặp lại retry mỗi phút vô hạn (khác lỗi mạng/session
      // thật, vẫn cần giữ lại để retryMissedActivity() thử lại). Tony: "tới lịch thì bỏ qua", không
      // phải "báo lỗi liên tục cho tới khi admin duyệt".
      if (e.skippedNotReady) {
        console.info('[GroupFlow] scheduled comment skipped — bài chưa sẵn sàng:', alarmName || data.kind, e.message);
        chrome.notifications.create(`gf_sched_skip_${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'GroupFlow — Bỏ qua lịch comment',
          message: e.message?.slice(0, 120) || 'Bài chưa sẵn sàng',
        }).catch(() => {});
        if (alarmName) await this.removeUpcomingByAlarmName(alarmName);
        return true;
      }
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

    let matrixError = null;
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
        if (!groups.length) {
          // Lên lịch không còn bắt buộc chọn nhóm trước — nếu tới giờ chạy vẫn chưa gán nhóm thì
          // bỏ qua đúng bài này (không chặn cả job), báo rõ trong Log để user tự vào gán nhóm rồi
          // đăng tay/chờ lượt lặp lại kế tiếp (lịch cố định hàng ngày) thay vì im lặng bỏ qua.
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'error',
              done,
              total,
              post: post.noi_dung?.slice(0, 40) || '',
              snippet: 'Bỏ qua — bài chưa chọn nhóm',
            },
          }).catch(() => {});
          continue;
        }
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
              snippet: 'Đang đăng (Nhanh, dự phòng Cổ điển nếu lỗi)…',
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
              const groupDetail = {
                group_id: String(group.id),
                group_name: group.name,
                post_id: res.postId,
                url: res.url || this.buildGroupPostUrl(group.id, res.postId),
                status: res.status || (res.postId === 'pending' ? 'pending_approval' : 'posted'),
                posted_at: new Date().toISOString(),
                firstCommentOk: null,
                tidienSynced: Boolean(tidienPushRes?.ok),
                tidienSyncedAt: tidienPushRes?.ok ? new Date().toISOString() : null,
              };
              this.pushPostedGroupResult(postGroupResults, post.id, groupDetail);
              await this.persistGroupProgress(post.id, groupDetail);
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
    } catch (e) {
      // Job crash giữa chừng (vd generateImage() lỗi trước khi kịp đăng nhóm nào) — bắt lại để
      // finally bên dưới còn kịp đánh dấu bài 'failed' + báo lỗi thật ra Log, thay vì để finally
      // luôn báo phase 'done' như thành công dù chưa đăng được gì (đã gây vòng lặp job lỗi vô hạn:
      // reconcileQueueSchedules() thấy bài chưa "done" nên cứ chạy lại job y hệt mỗi khi service
      // worker khởi động lại, không có lỗi rõ ràng nào hiện ra để biết vì sao).
      matrixError = e;
    } finally {
      this.running = false;
      this.resetPostingFbTab();
      const summary = await this.applyPostMatrixResults(job, postResults, postGroupResults, matrixError);
      const sess = await chrome.storage.session.get(['gfPanelTabId']).catch(() => ({}));
      await this.markPostingSession(false);
      if (sess.gfPanelTabId) {
        await this.ensurePanelOpenOnTab(sess.gfPanelTabId);
      }
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: {
          phase: matrixError ? 'error' : (this.stopRequested ? 'stopped' : 'done'),
          done,
          total,
          okCount: successCount,
          failCount,
          summary,
          snippet: matrixError
            ? `Lỗi — dừng giữa chừng: ${String(matrixError.message || matrixError).slice(0, 150)}`
            : (this.stopRequested ? 'Đã dừng đăng bài' : undefined),
        },
      }).catch(() => {});
    }
    if (matrixError) throw matrixError;
  },

  async commentOnPostBgOrClassic(job, settings) {
    const FC = globalThis.GF?.fbCommentBg;
    const comment = String(job.comment || '').trim();
    if (!comment) throw new Error('Chưa có nội dung comment');
    const validPostId = job.post_id && /^\d+$/.test(String(job.post_id));
    if (FC && validPostId) {
      let bgRes;
      try {
        bgRes = await FC.commentOnPost({
          groupId: job.group_id,
          postId: job.post_id,
          text: comment,
          actorId: job.actorId || settings.activeActorId,
        });
      } catch (e) {
        const noDomFallback = /không tồn tại|chờ admin|bị xóa|pending|không hợp lệ|không thể comment|không xác nhận/i
          .test(e.message || '');
        if (noDomFallback) {
          // v1.0.221 — đánh dấu riêng lỗi "bài chưa sẵn sàng" (khác lỗi mạng/session thật) để
          // runComment()/runCommentOwn() ghi Log rõ ràng là "bỏ qua" thay vì "lỗi", và
          // runScheduledJob() coi lịch "1 lần cụ thể" là ĐÃ XỬ LÝ XONG (không lặp lại retry mỗi
          // phút cho tới khi admin duyệt — bài chờ duyệt còn cache 20 phút, tickDailyFixedSchedules
          // (lặp lại hàng ngày) đã tự thử lại vào ngày mai sẵn, không cần retry dồn dập ở đây nữa).
          e.skippedNotReady = true;
          throw e;
        }
        console.warn('[GroupFlow] comment bg failed, fallback DOM:', e.message);
      }
      // Nếu Quick trả về commentId hợp lệ → dùng kết quả đó
      if (bgRes?.commentId) return bgRes;
      // Nếu Quick trả về ok:true nhưng không có commentId (doc_id hết hạn, FB không tạo comment)
      // → fallback sang Classic DOM thay vì báo "OK" giả
      if (bgRes) {
        console.warn('[GroupFlow] comment bg returned no commentId, falling back to Classic DOM');
      }
    }
    try {
      await this.sendToFb('GF_COMMENT', {
        groupId: job.group_id,
        postId: job.post_id,
        text: comment,
        lang: settings.fbLang || 'vi',
        actorId: job.actorId || settings.activeActorId,
      });
    } catch (e) {
      // v1.0.231 — Tony xác nhận bằng thực tế: bài CỦA CHÍNH MÌNH đang chờ admin duyệt có thể
      // hoàn toàn KHÔNG có ô bình luận nào cả (tùy cấu hình duyệt bài của từng nhóm — Facebook
      // không cho tương tác kể cả với chủ bài tới khi duyệt xong), không phải lỗi tìm sai
      // selector — content.js waitFor(boxSel) timeout ĐÚNG vì ô thật sự chưa tồn tại lúc này,
      // không phải sẽ không bao giờ tồn tại (chờ admin duyệt xong là có). Lỗi timeout này trước
      // đây rơi thẳng ra ngoài như lỗi thật — nhánh noDomFallback ở trên chỉ xét lỗi TỪ NHANH,
      // không áp dụng cho lỗi timeout của CỔ ĐIỂN — khiến runScheduledJob() coi là lỗi thật, tự
      // retry mỗi phút vô hạn tới khi admin duyệt (đúng hiện tượng gốc đã báo cáo: "lịch mở lên
      // lại đứng yên tại đây"). Coi timeout chờ ô bình luận cũng là "chưa sẵn sàng" giống các lý
      // do khác — Log ghi "Bỏ qua" thay vì lặp lại báo lỗi mỗi phút.
      if (/^Timeout chờ/i.test(e.message || '')) {
        e.skippedNotReady = true;
      }
      throw e;
    }
    return { ok: true, mode: 'classic' };
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
        skipped: Boolean(e.skippedNotReady),
        group_id: job.group_id,
        group_name: job.group_name,
        post_id: job.post_id,
        snippet: comment.slice(0, 80),
        error: e.skippedNotReady ? `Bỏ qua — ${e.message}` : e.message,
      });
      throw e;
    }

    // job.record_id trỏ tới PATCH /api/group-posts/:id/commented — route thuộc hệ JWT cũ
    // (group_posts/group_post_comments) đã XOÁ HẲN khi gộp bảng (migration 039, xem groupPosts.js)
    // — gọi vào đây giờ luôn 404. Bỏ hẳn nhánh này (không còn nơi nào tạo job có record_id nữa —
    // hệ cross-comment hiện dùng job.crossServerId qua PATCH /api/user-sync/posts/:id/commented,
    // xử lý trong runComment(), không phải runCommentOwn()).

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

  // v1.0.194 — BỎ HẲN lớp chặn "job trùng lặp" (đã comment rồi thì bỏ qua) từng có ở đây. Comment
  // chéo dùng để ĐẨY BÀI — 1 bài được comment lại nhiều lần (kể cả bởi cùng 1 lịch "1 lần cụ thể"
  // đã lỡ hẹn, kể cả job khác đã comment trước đó) là hành vi ĐÚNG MONG MUỐN, không phải job trùng
  // lặp cần chặn. Trước bản này lớp chặn (dựa vào `commentedRecords`) chỉ áp cho lịch "1 lần cụ
  // thể" chạy qua `runScheduledJob()` (không nơi gọi nào khác còn thiếu `allowRepeat:true`) — nghĩa
  // là 1 lịch đã lên nhưng CHƯA CHẠY, nếu bài đó lỡ đã được comment bởi đường khác trước khi lịch
  // này tới giờ, sẽ bị bỏ qua êm thay vì chạy thật — đúng thứ Tony yêu cầu sửa ("lịch đã lên mà
  // chưa chạy thì vẫn phải chạy, dù trước đó đã comment rồi"). Tham số `opts`/`allowRepeat` không
  // còn ý nghĩa gì (luôn chạy) nên đã bỏ khỏi chữ ký hàm — dọn theo ở mọi nơi gọi.
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
        skipped: Boolean(e.skippedNotReady),
        group_id: job.group_id,
        post_id: job.post_id,
        snippet: comment.slice(0, 80),
        error: e.skippedNotReady ? `Bỏ qua — ${e.message}` : e.message,
      });
      throw e;
    }

    // Ghi cục bộ TRƯỚC — nguồn-sự-thật không phụ thuộc mạng, xem chú thích markCommentDoneLocal().
    await this.markCommentDoneLocal(job.post_queue_id, job.group_id);
    await this.markPostedGroupCommented(job.post_queue_id, job.group_id, true);
    if (job.crossServerId) {
      await this.markCrossPostCommentedFromBg(job.crossServerId);
    }
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
  },

  // License key là danh tính DUY NHẤT extension dùng để đồng bộ với server (không còn kiểu đăng
  // nhập email/password cũ — tidienApiKey/tidienToken đã bỏ hẳn, xem docs/GROUPFLOW.md).
  async getTidienAuth() {
    const cfg = await chrome.storage.local.get(['tidienBaseUrl', 'licenseKey']);
    const token = cfg.licenseKey;
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

  // Đẩy các dòng Log/Lịch sử (activityHistory) chưa từng gửi lên server, theo license key đang
  // active — mỗi user chỉ thấy log của chính mình (đa thiết bị), KHÔNG chia sẻ chéo như Comment.
  // Bỏ qua entry đã kéo VỀ từ server (id bắt đầu "srv_") để tránh đẩy ngược lại vô ích.
  async pushUnsyncedActivityToServer(auth, headers) {
    const d = await chrome.storage.local.get(['activityHistory', 'activityLastPushedAt']);
    const list = d.activityHistory || [];
    const cursor = d.activityLastPushedAt || '';
    const toPush = list.filter((e) => e.id && !String(e.id).startsWith('srv_') && (!cursor || e.at > cursor));
    if (!toPush.length) return { pushed: 0 };
    const batch = toPush.slice(0, 100);
    const entries = batch.map((e) => ({
      client_entry_id: e.id,
      type: e.type || 'post',
      ok: e.ok !== false,
      snippet: e.snippet || '',
      group_id: e.group_id ? String(e.group_id) : null,
      group_name: e.group_name || null,
      post_id: e.post_id ? String(e.post_id) : null,
      url: e.url || null,
      error: e.error || null,
      occurred_at: e.at,
    }));
    await this.tidienPostJson(auth, '/api/user-sync/activity', { entries }, headers);
    const newest = batch.reduce((max, e) => (e.at > max ? e.at : max), cursor);
    await chrome.storage.local.set({ activityLastPushedAt: newest });
    return { pushed: batch.length };
  },

  // Kéo về các dòng Log/Lịch sử của chính license key này từ server (đa thiết bị), merge vào
  // activityHistory cục bộ theo id, không ghi đè entry đã có.
  async pullActivityFromServer(auth, headers) {
    const d = await chrome.storage.local.get(['activityHistory', 'activityLastPulledAt']);
    const since = d.activityLastPulledAt || '';
    const res = await fetch(`${auth.base}/api/user-sync/activity${since ? `?since=${encodeURIComponent(since)}` : ''}`, { headers });
    if (!res.ok) return { pulled: 0 };
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return { pulled: 0 };

    const list = d.activityHistory || [];
    const existingIds = new Set(list.map((e) => e.id).filter(Boolean));
    let added = 0;
    let newestCreatedAt = since;
    for (const r of rows) {
      if (r.created_at && r.created_at > newestCreatedAt) newestCreatedAt = r.created_at;
      const id = `srv_${r.id}`;
      if (existingIds.has(id)) continue;
      list.push({
        id,
        type: r.type,
        ok: !!r.ok,
        snippet: r.snippet,
        group_id: r.group_id,
        group_name: r.group_name,
        post_id: r.post_id,
        url: r.url,
        error: r.error,
        at: r.occurred_at,
      });
      existingIds.add(id);
      added += 1;
    }
    if (added) {
      list.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      const trimmed = list.slice(0, 300);
      await chrome.storage.local.set({ activityHistory: trimmed, activityLastPulledAt: newestCreatedAt });
      chrome.runtime.sendMessage({ type: 'GF_ACTIVITY_REFRESH', data: { total: trimmed.length } }).catch(() => {});
    } else {
      await chrome.storage.local.set({ activityLastPulledAt: newestCreatedAt });
    }
    return { pulled: added };
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

  // Dọn alarm comment trùng lặp (cùng recordId — tức cùng post_queue_id) đã lỡ tồn tại trong
  // activityUpcoming TRƯỚC khi bug dedup ở runFlow1BackgroundSync() được vá — chỉ giữ lại job đến
  // sớm nhất, huỷ hẳn (chrome.alarms + storage) các bản trùng còn lại. Tự chạy mỗi chu kỳ nền, rẻ
  // vì activityUpcoming thường nhỏ — không cần cờ "đã dọn rồi" vì không tìm thấy trùng thì no-op.
  async dedupeUpcomingCommentAlarms() {
    const d = await chrome.storage.local.get('activityUpcoming');
    const upcoming = d.activityUpcoming || [];
    const earliestByRecord = new Map();
    for (const u of upcoming) {
      if (u.kind !== 'comment' || !u.recordId) continue;
      const cur = earliestByRecord.get(u.recordId);
      if (!cur || (u.when || 0) < (cur.when || 0)) earliestByRecord.set(u.recordId, u);
    }
    const keep = [];
    const removed = [];
    for (const u of upcoming) {
      if (u.kind === 'comment' && u.recordId && earliestByRecord.get(u.recordId) !== u) {
        removed.push(u);
      } else {
        keep.push(u);
      }
    }
    if (!removed.length) return 0;
    for (const u of removed) {
      const name = u.alarmName || u.id;
      if (!name) continue;
      chrome.alarms.clear(name);
      await chrome.storage.local.remove(`alarm_${name}`);
    }
    await chrome.storage.local.set({ activityUpcoming: keep });
    console.warn('[GroupFlow] dedupe: removed', removed.length, 'duplicate comment alarms');
    return removed.length;
  },

  // Flow 1 (đồng bộ bài để đi comment) — v1.0.187. Gọi trong MỌI chu kỳ nền gf_tidien_sync (không
  // cần user mở tab Comment), thay thế hẳn nhánh posts/pull cũ (group_posts, đã gộp vào user_posts
  // — migration 039). Dùng CHUNG storage key crossPostsCache/crossPostsSyncMeta với
  // fetchCrossPostsFromServer() (sidepanel.js) — cursor theo updated_at, merge-upsert vào cache đã
  // có (không ghi đè), để cả 2 nơi (nền lẫn khi mở panel) luôn thấy cùng 1 dữ liệu, không tải trùng.
  //
  // v1.0.202 — BỎ HẲN phần tự động lên lịch từng có ở đây (v1.0.192-196): Tony chốt "bỏ cơ chế set
  // auto lịch luôn vì chức năng này mang tính áp đặt, để lịch user tự set" — hàm này giờ CHỈ còn
  // đồng bộ cache cross-posts (để tab Comment → Đồng đội luôn có dữ liệu mới khi mở lên), không tự
  // tạo bất kỳ activityUpcoming/alarm nào nữa. Lên lịch (1 lần hay lặp lại hàng ngày) giờ hoàn toàn
  // do user chủ động bấm "+ Lên lịch"/"Lên lịch đã chọn".
  async runFlow1BackgroundSync(auth, headers) {
    await this.dedupeUpcomingCommentAlarms();
    const d = await chrome.storage.local.get(['crossPostsCache', 'crossPostsSyncMeta']);
    const cache = d.crossPostsCache || [];
    const meta = d.crossPostsSyncMeta || { lastAt: 0, cursor: null };

    let rows = [];
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (meta.cursor) qs.set('since', meta.cursor);
      const res = await fetch(`${auth.base}/api/user-sync/cross-posts?${qs}`, { headers });
      if (res.ok) rows = await res.json();
    } catch { /* best-effort — giữ cache cũ nếu mạng lỗi */ }

    const newestUpdatedAt = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), meta.cursor || '');
    const byId = new Map(cache.map((p) => [String(p.id), p]));
    for (const row of Array.isArray(rows) ? rows : []) byId.set(String(row.id), row);
    const merged = [...byId.values()]
      .sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0))
      .slice(0, 500);
    await chrome.storage.local.set({
      crossPostsCache: merged,
      crossPostsSyncMeta: { lastAt: Date.now(), cursor: newestUpdatedAt || meta.cursor || null },
    });

    return { fetched: rows.length, cached: merged.length };
  },

  // So le giờ chạy (v1.0.187) — mỗi máy tự "bốc thăm" 1 độ trễ ban đầu cố định (0..mins phút), lưu
  // lại dùng mãi (không random lại mỗi lần gọi hàm này). Không có bước này, `periodInMinutes` tính
  // từ đúng lúc gọi create() — nhiều máy khởi động/kết nối lại cùng thời điểm (giờ hành chính, sau
  // khi server phục hồi khiến hàng loạt máy re-schedule cùng lúc…) sẽ có alarm dồn cục cùng giây,
  // 1000 request đổ về server cùng lúc thay vì rải đều suốt chu kỳ. Độ lệch riêng biệt lưu cố định
  // theo máy đảm bảo dù "now" trùng nhau, giờ CHẠY THẬT vẫn tách rời nhau vĩnh viễn.
  async scheduleTidienSyncAlarm() {
    const cfg = await chrome.storage.local.get(['tidienAutoSyncEnabled', 'tidienAutoSyncMinutes', 'tidienSyncJitterMin']);
    await chrome.alarms.clear('gf_tidien_sync');
    if (cfg.tidienAutoSyncEnabled === false) return;
    const mins = Math.max(5, Number(cfg.tidienAutoSyncMinutes) || 10);

    let jitterMin = Number(cfg.tidienSyncJitterMin);
    if (!Number.isFinite(jitterMin) || jitterMin < 0) {
      jitterMin = Math.random() * mins;
      await chrome.storage.local.set({ tidienSyncJitterMin: jitterMin });
    }
    chrome.alarms.create('gf_tidien_sync', { delayInMinutes: Math.max(0.1, jitterMin), periodInMinutes: mins });
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
    const maxRounds = force ? TIDIEN_SYNC.MAX_ROUNDS_FORCE : TIDIEN_SYNC.MAX_ROUNDS;
    const wantComments = scope === 'comments' || scope === 'all' || scope === 'auto';
    let shouldPullDrafts = pullDrafts && cfg.tidienAutoPullDrafts !== false
      && (scope === 'drafts' || scope === 'all'
        || (scope === 'auto' && (!meta.lastDraftsAt || (now - meta.lastDraftsAt) >= TIDIEN_SYNC.DRAFTS_INTERVAL_MS)));

    let postsFetched = 0;
    let postsMerged = 0;
    let pendingPostsSync = 0;
    let draftsAdded = 0;
    let pendingDrafts = 0;
    let draftRounds = 0;
    let postsError;
    let draftError;
    let skippedDrafts = false;
    let postsPushed = 0;
    let postsPushFailed = 0;

    if (scope === 'all' || scope === 'push' || force) {
      const pushRes = await this.pushUnsyncedPostsFromQueue();
      postsPushed = pushRes.pushed || 0;
      postsPushFailed = pushRes.failed || 0;
    }

    // Flow 1 (đồng bộ bài để đi comment) — v1.0.187: thay thế hẳn nhánh posts/pull cũ (group_posts,
    // đã gộp bảng — xem migration 039). Trước bản này, Flow 1 CHỈ chạy khi user tự mở/refresh tab
    // Comment (fetchCrossPostsFromServer() trong sidepanel.js) — user nào ít mở tab đó thì cache
    // luôn trống, không bao giờ được tự động gán bài để comment dù bài vẫn tồn tại trên server. Giờ
    // chạy ngay trong chu kỳ nền này (không cần mở panel) — vừa giữ cache tươi cho UI, vừa tự lên
    // lịch comment cho bài mới thấy được (dùng chung storage key crossPostsCache/crossPostsSyncMeta
    // với sidepanel.js để 2 nơi luôn nhìn thấy cùng 1 dữ liệu).
    if (wantComments) {
      try {
        const res = await this.runFlow1BackgroundSync(auth, headers);
        postsFetched = res.fetched;
        postsMerged = res.cached;
        meta.lastCommentsAt = now;
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

    // Log/Lịch sử đồng bộ theo license key (đa thiết bị) — best-effort, không được phép làm hỏng
    // luồng đồng bộ bài/comment chính ở trên nếu lỗi.
    try {
      await this.pushUnsyncedActivityToServer(auth, headers);
      await this.pullActivityFromServer(auth, headers);
    } catch (e) {
      console.warn('[GroupFlow] activity log sync:', e.message);
    }

    // Flow 3 retry — thử lại các lượt PATCH .../commented đã fail (best-effort, không chặn chu kỳ
    // chính nếu lỗi tiếp).
    try {
      await this.flushPendingCommentedSync(auth, headers);
    } catch (e) {
      console.warn('[GroupFlow] flush pending commented sync:', e.message);
    }

    const payload = {
      posts: postsMerged,
      postsFetched,
      postsPushed,
      postsPushFailed,
      pendingPostsSync,
      pendingDrafts,
      draftRounds,
      draftsAdded,
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
      'radarActive', 'radarKeywords', 'radarGroupIds', 'radarPush', 'radarInPage', 'radarLeads',
      'extractedGroups', 'radarMaxGroupsPerScan', 'radarScanCursor', 'radarSeenPostIds', 'radarLastScanAt',
    ]);
    if (!cfg.radarActive) return;
    const targetIds = cfg.radarGroupIds || [];
    const allGroups = (cfg.extractedGroups || []).filter((g) => targetIds.includes(g.id));
    if (!allGroups.length) return;

    // Giới hạn số nhóm quét mỗi lượt (tránh FB nghi ngờ do mở quá nhiều nhóm liên tiếp) — xoay vòng
    // qua cursor để mỗi chu kỳ quét nhóm khác nhau thay vì luôn chỉ N nhóm đầu danh sách.
    const maxPerScan = Math.max(1, Number(cfg.radarMaxGroupsPerScan) || 10);
    const cursor = Number(cfg.radarScanCursor) || 0;
    const start = cursor % allGroups.length;
    const groups = [];
    for (let i = 0; i < Math.min(maxPerScan, allGroups.length); i += 1) {
      groups.push(allGroups[(start + i) % allGroups.length]);
    }
    const nextCursor = (start + groups.length) % allGroups.length;

    let leads = cfg.radarLeads || [];
    const seenPostIds = new Set(cfg.radarSeenPostIds || []);
    const lastScanAt = { ...(cfg.radarLastScanAt || {}) };
    let newLeadsThisRun = [];

    for (const group of groups) {
      try {
        const tab = await this.getFbTab();
        await chrome.tabs.update(tab.id, { url: `https://www.facebook.com/groups/${group.id}` });
        await this.delay(3500);
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: 'GF_SCAN_FEED',
          keywordsText: cfg.radarKeywords,
        });
        lastScanAt[group.id] = new Date().toISOString();
        const fresh = (res?.leads || []).filter((l) => {
          const key = `${l.group_id}:${l.post_id || l.id}`;
          if (seenPostIds.has(key)) return false;
          seenPostIds.add(key);
          return true;
        });
        if (fresh.length) {
          const tagged = fresh.map((l) => ({ ...l, group_name: group.name }));
          leads = [...tagged, ...leads].slice(0, 500);
          newLeadsThisRun = [...newLeadsThisRun, ...tagged];
          if (cfg.radarInPage !== false) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'GF_RADAR_TOAST',
              count: tagged.length,
              snippet: tagged[0].snippet,
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[GroupFlow] radar scan lỗi nhóm', group.id, e.message);
      }
    }

    // Giữ seen-ids gọn (không phình vô hạn) — chỉ cần đủ để chặn trùng giữa các lần quét gần nhau.
    const seenList = [...seenPostIds].slice(-3000);

    await chrome.storage.local.set({
      radarLeads: leads,
      radarSeenPostIds: seenList,
      radarLastScanAt: lastScanAt,
      radarScanCursor: nextCursor,
    });

    if (newLeadsThisRun.length && cfg.radarPush) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        title: 'GroupFlow — Lead mới',
        message: newLeadsThisRun.length === 1
          ? (newLeadsThisRun[0].snippet?.slice(0, 120) || 'Có lead mới')
          : `${newLeadsThisRun.length} lead mới từ ${groups.length} nhóm vừa quét`,
      });
    }
    chrome.runtime.sendMessage({ type: 'GF_RADAR_UPDATED' }).catch(() => {});
  },

  // v1.0.192 — tách ra từ nhánh gf_retry_missed trong chrome.alarms.onAlarm để dùng lại được ở
  // chrome.runtime.onStartup (chạy NGAY lúc mở lại Chrome/máy, không chờ alarm 1 phút tự nổ) — xem
  // "Fix lịch chưa chạy phải chạy lại khi mở máy" trong docs/GROUPFLOW.md. Quét activityUpcoming
  // (lịch "1 lần cụ thể" — post lẫn comment) có `when <= now` mà vẫn còn tồn tại trong mảng (item
  // chỉ bị xoá SAU KHI chạy xong không lỗi — removeUpcomingByAlarmName() trong runScheduledJob())
  // — tín hiệu "chưa chạy" đáng tin cậy, không như dailyFixedSchedules (xem markDailyScheduleDone()).
  //
  // Giãn cách giữa CÁC TÁC VỤ QUÁ HẠN chạy bù cùng lượt (2026-07-04) — Tony hỏi: nếu vừa có lịch
  // đăng bài vừa có lịch comment cùng quá hạn (máy tắt qua giờ hẹn của cả 2) thì xử lý sao, giãn
  // cách bao nhiêu? Trước bản này KHÔNG có giãn cách nào giữa các tác vụ chạy bù — vòng lặp chỉ
  // đảm bảo TUẦN TỰ (không chồng), nhưng job sau chạy NGAY khi job trước xong (có thể chỉ cách vài
  // giây) — khác hẳn tốc độ "tự nhiên" lúc máy chạy liên tục (mỗi job cách nhau nhiều phút/giờ theo
  // đúng lịch gốc), dồn cục nhiều hành động sát nhau ngay lúc mở máy dễ bị soi hơn. Giờ dùng lại
  // đúng betweenPosts/betweenComments (getSecurityDelays() theo securityLevel đã cấu hình — không
  // tạo hằng số riêng) làm khoảng chờ TRƯỚC mỗi tác vụ chạy bù thứ 2 trở đi trong cùng lượt (tác vụ
  // đầu tiên chạy ngay, không chờ — chỉ tác vụ dồn cục phía sau mới cần giãn).
  async retryMissedActivity() {
    await this.reconcileQueueSchedules().catch((e) => {
      console.warn('[GroupFlow] reconcile schedules:', e.message);
    });
    const d = await chrome.storage.local.get(['activityUpcoming', 'retryMissed', 'securityLevel']);
    if (d.retryMissed === false) return;
    const now = Date.now();
    const due = [];
    const remaining = [];
    for (const item of d.activityUpcoming || []) {
      (item.when <= now ? due : remaining).push(item);
    }
    if (!due.length) return;

    const delays = await this.getSecurityDelays(d.securityLevel);
    for (let i = 0; i < due.length; i += 1) {
      const item = due[i];
      const alarmName = item.alarmName || item.id;
      // Alarm thật (gf_cmt_*/gf_job_*) đã tự bắn và đang/vừa xử lý đúng entry này — không giành chạy
      // lại, chỉ giữ trong activityUpcoming (sẽ tự bị removeUpcomingByAlarmName() dọn khi job xong).
      if (this._claimedAlarms.has(alarmName)) {
        remaining.push(item);
        continue;
      }
      this._claimedAlarms.add(alarmName);
      if (i > 0) {
        const gapSec = item.kind === 'post'
          ? this.randBetween([delays.betweenPosts, delays.betweenPosts + 60])
          : this.randBetween(delays.betweenComments);
        await this.delay(gapSec * 1000);
      }
      const ok = await this.runScheduledJob(
        { kind: item.kind, payload: item.payload },
        { alarmName },
      );
      if (ok) {
        // Chạy bù xong rồi — dọn luôn alarm thật + payload của nó, nếu không chrome.alarms vẫn sẽ tự
        // bắn sau đó (chrome.alarms không tự huỷ chỉ vì ta đã xử lý payload theo đường khác) và đọc
        // lại đúng alarm_<tên> (nếu còn) để chạy job này LẦN NỮA — chính là nguyên nhân "2 comment".
        await chrome.alarms.clear(alarmName).catch(() => {});
        await chrome.storage.local.remove(`alarm_${alarmName}`);
      } else {
        this._claimedAlarms.delete(alarmName);
        remaining.push(item);
      }
    }
    await chrome.storage.local.set({ activityUpcoming: remaining });
  },

  // v1.0.221 — Tony: "đã check rồi thì khỏi check nữa, bài mới đồng bộ về thì tự check tiếp".
  // Quét TOÀN BỘ bài có thể cần comment (của mình — `postQueue`/`serverMyPosts`, VÀ đồng đội —
  // `crossPostsCache`, cả 3 đã persist sẵn ra chrome.storage.local qua các luồng pull hiện có,
  // không cần thêm bước lưu riêng nào) tìm bài CHƯA có cache hoặc cache 'pending' đã hết hạn
  // (`isAccessEntryFresh()` — fbCommentBg.js) rồi check dần — chỉ 1-2 bài/lượt, rải delay ngẫu
  // nhiên, tránh dồn dập gọi Facebook cùng lúc dễ bị soi (cùng lý do giãn cách các job đăng/comment
  // thật). Nhờ vậy khi user bấm ▶ Chạy hay tới giờ lịch, phần lớn bài ĐÃ có sẵn cache — khỏi phải
  // chờ fetch ngay lúc đó, và UI (sidepanel đọc thẳng `gf_post_access_cache`) có thể hiện tag
  // trạng thái mà không cần tự gọi kiểm tra.
  // v1.0.224 — Tony: list Comment giờ CHỈ hiện bài đã CHECK XONG với kết quả OK (hoặc đã comment
  // rồi — xem isCommentActionable(), sidepanel.js), không còn hiện luôn bài "chưa check" như bản
  // trước. Nghĩa là tốc độ cron quét quyết định trực tiếp tốc độ bài "hiện ra" trong list — batch
  // mặc định 2 bài/3 phút quá chậm với queue vài chục bài (phải đợi cả tiếng mới thấy hết). Thêm
  // `batchSize` để lượt quét THỦ CÔNG (bấm vào tab Comment — xem `GF_WARM_POST_ACCESS`,
  // chrome.runtime.onMessage bên dưới) check nhiều hơn hẳn 1 lượt so với tick nền định kỳ (vẫn giữ
  // 2 để tránh dồn dập khi chạy im lặng không ai để ý).
  async warmPostAccessCache({ batchSize = 2 } = {}) {
    const FC = globalThis.GF?.fbCommentBg;
    const S = globalThis.GF?.fbSessionBg;
    if (!FC || !S) return;
    const d = await chrome.storage.local.get([
      'postQueue', 'serverMyPosts', 'activeActorId',
    ]);
    const targets = new Map();
    // v1.0.236 — REVERT quét cả `crossPostsCache` (v1.0.234): check quyền comment trên bài của
    // NGƯỜI KHÁC luôn fail-open (Facebook không cho non-owner thấy gì để dò — trang khóa trắng),
    // không có cách nào sửa được ở phía đồng đội. Đảo hướng đúng: GET /cross-posts (backend) giờ
    // CHỈ gửi về bài mà CHỦ BÀI đã tự confirm OK (xem userSync.js) — đồng đội không cần và không
    // nên tự check lại bài không phải của mình nữa, chỉ cần check ĐÚNG bài của chính mình (nguồn
    // duy nhất đáng tin — Facebook luôn cho chủ bài xem thật) rồi báo hộ lên server.
    const addTarget = (groupId, postId) => {
      const pid = String(postId || '');
      if (!groupId || !/^\d+$/.test(pid)) return;
      if (targets.has(pid)) return;
      targets.set(pid, { groupId: String(groupId), postId: pid });
    };
    (d.postQueue || []).forEach((p) => (p.postedGroups || []).forEach((g) => addTarget(g.group_id, g.post_id)));
    (d.serverMyPosts || []).forEach((sp) => addTarget(sp.group_id, sp.post_id));
    if (!targets.size) return;

    const cache = await FC.readPostAccessCache();
    const stale = [...targets.values()].filter((t) => !FC.isAccessEntryFresh(cache[t.postId]));
    if (!stale.length) return;

    let session;
    try {
      session = await S.resolveSession({ actorId: d.activeActorId });
    } catch (e) {
      console.warn('[GroupFlow] warmPostAccessCache: không lấy được session:', e.message);
      return;
    }
    const batch = stale.slice(0, batchSize);
    for (const t of batch) {
      try {
        const result = await FC.getPostAccess({ groupId: t.groupId, postId: t.postId, session, isTimeline: false });
        if (result?.kind === 'pending' || result?.kind === 'ok') {
          await this.reportOwnPendingApproval(t.groupId, t.postId, result.kind === 'pending');
        }
      } catch (e) {
        console.warn('[GroupFlow] warmPostAccessCache: check lỗi', t.postId, e.message);
      }
      await this.delay(1200 + Math.floor(Math.random() * 1800));
    }
  },

  // v1.0.234 — "báo hộ" trạng thái chờ duyệt của CHÍNH BÀI MÌNH lên server, để GET /cross-posts
  // (backend) tự loại bài này khỏi danh sách của đồng đội — quá giang đúng route POST
  // /api/user-sync/posts đã có sẵn (không thêm endpoint/cron mới, tần suất gọi đã bị giới hạn tự
  // nhiên theo batchSize của warmPostAccessCache() — vài request/3 phút là tối đa). Best-effort:
  // lỗi mạng/chưa đăng nhập tidien thì bỏ qua im lặng, không throw — không ảnh hưởng luồng check
  // access cục bộ, và tự thử lại ở lượt cron kế tiếp nếu vẫn còn stale.
  async reportOwnPendingApproval(groupId, postId, pendingApproval) {
    const auth = await this.getTidienAuth();
    if (!auth) return;
    try {
      await fetch(`${auth.base}/api/user-sync/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          posts: [{ group_id: groupId, post_id: postId, pending_approval: pendingApproval }],
        }),
      });
    } catch { /* best-effort — lượt cron kế tiếp tự thử lại nếu access cache còn stale */ }
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
  if (!names.has('gf_comment_daily')) {
    chrome.alarms.create('gf_comment_daily', { periodInMinutes: 1 });
  }
  if (!names.has('gf_check_post_access')) {
    chrome.alarms.create('gf_check_post_access', { periodInMinutes: 3 });
  }
}

// v1.0.195 — Tony hỏi "có cách nào không cho máy ngủ khi đang chạy không?" (lịch đăng bài/comment
// cần chạy không người trông, máy tự sleep giữa chừng thì mọi tác vụ dừng hẳn tới khi user tự đánh
// thức lại). `chrome.power.requestKeepAwake('system')` chặn Windows tự vào chế độ NGỦ (sleep/suspend)
// do idle timeout — dùng mức 'system' (không phải 'display') vì chỉ cần MÁY không ngủ để service
// worker/alarm còn chạy, không cần ép màn hình luôn sáng (tốn điện, gây khó chịu vô ích). Gọi ở top
// level — chạy lại mỗi khi service worker (re)start (kể cả sau khi bị idle-unload rồi có
// alarm/message đánh thức lại) nên luôn tự tái khẳng định, không cần release/renew thủ công. KHÔNG
// chặn được sleep do user chủ động bấm Sleep/đóng nắp laptop — chỉ chặn sleep tự động do không thao
// tác (idle timer của Windows).
chrome.power.requestKeepAwake('system');

console.log('[GroupFlow] service worker ready');
ensureGroupFlowPeriodicAlarms().catch(() => {});
GF_BG.reconcileQueueSchedules().catch(() => {});
// v1.0.222 — dọn ngay lúc khởi động (không đợi tới lần checkPostAccess/comment đầu tiên) cache
// 'gf_post_access_cache' cũ ghi sai do bug buildPermalink() (route /permalink/ khiến check luôn
// fail-open "ok") — readPostAccessCache() tự xoá nếu schema cũ, xem fbCommentBg.js.
globalThis.GF?.fbCommentBg?.readPostAccessCache().catch(() => {});

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
    // Đã bị gf_retry_missed "nhận" trước (xem retryMissedActivity) — payload alarm_<tên> đã bị xoá
    // ở đó rồi nên bên dưới cũng sẽ thấy !data, nhưng check claim trước để khỏi tốn 1 lượt storage.get.
    if (GF_BG._claimedAlarms.has(alarm.name)) return;
    GF_BG._claimedAlarms.add(alarm.name);
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) {
      console.warn('[GroupFlow] alarm fired but payload missing:', alarm.name);
      return;
    }
    const ok = await GF_BG.runScheduledJob(data, { alarmName: alarm.name });
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    if (!ok) {
      console.warn('[GroupFlow] post/comment alarm will retry via activityUpcoming:', alarm.name);
      GF_BG._claimedAlarms.delete(alarm.name);
    }
    return;
  }
  if (alarm.name === 'gf_retry_missed') {
    await GF_BG.retryMissedActivity().catch((e) => {
      console.warn('[GroupFlow] retry missed activity:', e.message);
    });
    return;
  }
  if (alarm.name === 'gf_image_schedule') {
    await GF_BG.tickGroupImageSchedule();
  }
  if (alarm.name === 'gf_comment_daily') {
    await GF_BG.tickDailyFixedSchedules().catch((e) => {
      console.warn('[GroupFlow] daily fixed schedule tick:', e.message);
    });
  }
  if (alarm.name === 'gf_tidien_sync') {
    await GF_BG.syncFromTidien().catch((e) => {
      console.warn('[GroupFlow] tidien auto-sync:', e.message);
    });
  }
  if (alarm.name === 'gf_check_post_access') {
    await GF_BG.warmPostAccessCache().catch((e) => {
      console.warn('[GroupFlow] warm post access cache:', e.message);
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

      if (msg.type === 'GF_WARM_POST_ACCESS') {
        // v1.0.224 — sidepanel gọi khi mở/chuyển vào tab Comment, tranh thủ check thêm ngay (batch
        // lớn hơn tick nền 3 phút/2 bài) thay vì bắt user ngồi đợi cron — không await lâu (không
        // block UI): bắn đi rồi trả lời ngay, panel tự loadComments() lại sau vài giây để thấy kết
        // quả (xem bindEvents(), sidepanel.js).
        GF_BG.warmPostAccessCache({ batchSize: 6 }).catch((e) => {
          console.warn('[GroupFlow] manual warm post access:', e.message);
        });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_COMMENT_OWN_POST') {
        const settings = await chrome.storage.local.get(['activeActorId']);
        await GF_BG.enqueueTask(() => GF_BG.runCommentOwn({
          ...msg.payload,
          actorId: msg.payload?.actorId || settings.activeActorId,
        }));
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
        GF_BG.enqueueTask(() => GF_BG.runPostMatrix(msg.payload)).catch((e) => {
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
        // Trước đây bấm "Chạy" liên tục nhiều bài khác nhau chạy CHỒNG NHAU (không hàng đợi), 2
        // job Cổ điển cùng lúc sẽ giành quyền điều khiển chung 1 tab FB (nhảy nhóm/gõ nhầm bài),
        // Nhanh thì bắn nhiều request đồng thời dễ bị FB để ý hơn — trước đó vá bằng cách báo lỗi
        // "đang bận" nếu chạy chồng. Giờ dùng hàng đợi tuần tự chung (`enqueueTask`) — không còn
        // báo lỗi, tự chờ tới lượt và chạy sau, kể cả khi trùng với lịch alarm đang chạy.
        try {
          await GF_BG.enqueueTask(async () => {
            GF_BG.commentRunning = true;
            try {
              await GF_BG.runComment(msg.payload);
            } finally {
              GF_BG.commentRunning = false;
            }
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
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
      if (msg.type === 'GF_SAVE_KEY_DOC_ID' && msg.name && msg.docId) {
        const d = await chrome.storage.local.get('gf_key_doc_ids');
        const existing = d.gf_key_doc_ids || {};
        if (existing[msg.name] !== msg.docId) {
          await chrome.storage.local.set({ gf_key_doc_ids: { ...existing, [msg.name]: msg.docId } });
        }
        sendResponse({ ok: true });
        return;
      }
      // __dyn/__csr là bitset mã hoá module JS/CSS trang đang tải thật — không tự sinh ngẫu
      // nhiên được (fbCometTokens.js cũ làm vậy, gần như chắc chắn là nguyên nhân lỗi 1357004
      // dai dẳng của Nhanh). Bắt giá trị THẬT từ chính request mà trang Facebook tự gửi đi lúc
      // user browse bình thường (content.js/pageNetworkHook.js), lưu lại dùng cho Nhanh.
      if (msg.type === 'GF_SAVE_COMET_TOKENS' && (msg.dyn || msg.csr)) {
        const d = await chrome.storage.local.get('gf_comet_tokens');
        const existing = d.gf_comet_tokens || {};
        await chrome.storage.local.set({
          gf_comet_tokens: {
            dyn: msg.dyn || existing.dyn,
            csr: msg.csr || existing.csr,
            capturedAt: Date.now(),
          },
        });
        sendResponse({ ok: true });
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

// v1.0.192 — "mở máy" (mở lại Chrome/máy tính sau khi tắt hẳn) giờ chủ động chạy bù NGAY, tuần tự
// (await từng bước, không bắn song song) thay vì chỉ đảm bảo alarm định kỳ tồn tại rồi ngồi chờ
// tick tiếp theo (có thể trễ vài phút tuỳ Chrome quyết định đánh thức service worker lúc nào):
// (1) reconcile + chạy bù lịch "1 lần cụ thể" quá hạn (activityUpcoming — post lẫn comment);
// (2) phục hồi + chạy bù lịch "Lặp lại hàng ngày" bị ngắt giữa chừng ở phiên trước (xem
// recoverStalledDailySchedules()/markDailyScheduleDone()); (3) đồng bộ + tự lên lịch comment cho
// bài (của mình lẫn đồng đội) chưa từng có lịch (runFlow1BackgroundSync(), qua syncFromTidien()).
// Việc CHẠY THẬT (runComment()/runPostMatrix()) vẫn luôn đi qua enqueueTask() dùng chung — nhiều
// nguồn gọi vào (onStartup, alarm định kỳ, user bấm tay) không bao giờ chạy chồng lên nhau.
chrome.runtime.onStartup.addListener(async () => {
  await ensureGroupFlowPeriodicAlarms().catch(() => {});
  await GF_BG.scheduleTidienSyncAlarm().catch(() => {});
  await GF_BG.prefetchGroups().catch(() => {});
  await GF_BG.retryMissedActivity().catch((e) => {
    console.warn('[GroupFlow] onStartup retry missed activity:', e.message);
  });
  await GF_BG.recoverStalledDailySchedules().catch((e) => {
    console.warn('[GroupFlow] onStartup recover stalled daily schedules:', e.message);
  });
  await GF_BG.tickDailyFixedSchedules().catch((e) => {
    console.warn('[GroupFlow] onStartup daily fixed schedule tick:', e.message);
  });
  await GF_BG.syncFromTidien({ scope: 'comments' }).catch((e) => {
    console.warn('[GroupFlow] onStartup comment sync:', e.message);
  });
});
