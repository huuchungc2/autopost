const GF_BG = {
  running: false,
  stopRequested: false,

  async getFbTab() {
    const tabs = await chrome.tabs.query({ url: 'https://www.facebook.com/*' });
    if (tabs[0]) return tabs[0];
    return chrome.tabs.create({ url: 'https://www.facebook.com/groups/feed', active: false });
  },

  async sendToFb(type, payload = {}) {
    const tab = await this.getFbTab();
    return chrome.tabs.sendMessage(tab.id, { type, ...payload });
  },

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  async getSecurityDelays() {
    const s = await chrome.storage.local.get('securityLevel');
    const map = {
      fast: { betweenGroups: [60, 120], betweenPosts: 180 },
      balanced: { betweenGroups: [180, 300], betweenPosts: 420 },
      safe: { betweenGroups: [420, 600], betweenPosts: 900 },
    };
    return map[s.securityLevel] || map.balanced;
  },

  randBetween([a, b]) {
    return a + Math.floor(Math.random() * (b - a + 1));
  },

  async appendHistory(entry) {
    const d = await chrome.storage.local.get('activityHistory');
    const list = d.activityHistory || [];
    list.unshift({ ...entry, at: new Date().toISOString() });
    await chrome.storage.local.set({ activityHistory: list.slice(0, 300) });
  },

  async runPostMatrix(job) {
    if (this.running) throw new Error('Đang chạy job khác');
    this.running = true;
    this.stopRequested = false;
    const delays = await this.getSecurityDelays();
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'extractedGroups']);
    const groups = (settings.extractedGroups || []).filter((g) => job.groupIds.includes(g.id));
    const total = job.posts.length * groups.length;
    let done = 0;

    try {
      for (let pi = 0; pi < job.posts.length; pi += 1) {
        if (this.stopRequested) break;
        const post = job.posts[pi];
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

          const res = await this.sendToFb('GF_POST', {
            groupId: group.id,
            text,
            imageBase64: post.imageBase64,
            lang: settings.fbLang || 'vi',
          });

          done += 1;
          const fbUser = settings.fbUser || (await this.sendToFb('GF_GET_FB_USER')).user;

          if (res.postId && job.sync) {
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
            ok: !!res.postId,
            group_id: group.id,
            group_name: group.name,
            post_id: res.postId,
            snippet: text.slice(0, 80),
            error: res.error,
          });

          if (gi < groups.length - 1) {
            await this.delay(this.randBetween(delays.betweenGroups) * 1000);
          }
        }
        if (pi < job.posts.length - 1) {
          await this.delay(this.randBetween([delays.betweenPosts, delays.betweenPosts + 60]) * 1000);
        }
      }
    } finally {
      this.running = false;
      chrome.runtime.sendMessage({ type: 'GF_PROGRESS', data: { phase: 'done', done, total } }).catch(() => {});
    }
  },

  async runComment(job) {
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser']);
    await this.sendToFb('GF_COMMENT', {
      groupId: job.group_id,
      postId: job.post_id,
      text: job.comment,
      lang: settings.fbLang || 'vi',
    });
    const base = (await chrome.storage.local.get('tidienBaseUrl')).tidienBaseUrl || 'https://tidien.xyz';
    const key = await chrome.storage.local.get(['tidienApiKey', 'tidienToken']);
    const token = key.tidienApiKey || key.tidienToken;
    await fetch(`${base.replace(/\/$/, '')}/api/group-posts/${job.record_id}/commented`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commenter_fb_user_id: settings.fbUser?.id }),
    });
    await this.appendHistory({
      type: 'comment',
      ok: true,
      group_id: job.group_id,
      post_id: job.post_id,
      snippet: job.comment?.slice(0, 80),
    });
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

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'radar_scan') {
    await GF_BG.runRadarScan();
    return;
  }
  if (alarm.name.startsWith('gf_job_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) return;
    if (data.kind === 'post') await GF_BG.runPostMatrix(data.payload);
    if (data.kind === 'comment') await GF_BG.runComment(data.payload);
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
  }
  if (alarm.name === 'gf_retry_missed') {
    const d = await chrome.storage.local.get('activityUpcoming');
    const now = Date.now();
    const remaining = [];
    for (const item of d.activityUpcoming || []) {
      if (item.when <= now) {
        if (item.kind === 'post') await GF_BG.runPostMatrix(item.payload);
        if (item.kind === 'comment') await GF_BG.runComment(item.payload);
      } else {
        remaining.push(item);
      }
    }
    await chrome.storage.local.set({ activityUpcoming: remaining });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
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
        const res = await GF_BG.sendToFb('GF_EXTRACT_GROUPS');
        if (res.groups) await chrome.storage.local.set({ extractedGroups: res.groups });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_GET_FB_USER') {
        const res = await GF_BG.sendToFb('GF_GET_FB_USER');
        if (res.user) await chrome.storage.local.set({ fbUser: res.user });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_RUN_COMMENT') {
        await GF_BG.runComment(msg.payload);
        sendResponse({ ok: true });
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
      sendResponse({ error: 'unknown' });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('gf_retry_missed', { periodInMinutes: 5 });
});
