const GF_CONTENT = {
  lang: 'vi',
  capturedPostId: null,
  capturedGroups: new Map(),

  decodeFbStr(s) {
    return String(s || '')
      .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  },

  isGenericGroupName(name) {
    return /^(group|nhóm|groups|facebook|xem thêm|see more)$/i.test(String(name || '').trim());
  },

  isFallbackGroupName(name) {
    return /^Group \d{5,}$/.test(String(name || '').trim());
  },

  isYourGroupsPage() {
    const p = location.pathname.replace(/\/$/, '');
    return p === '/groups/joins' || p.endsWith('/groups/joins');
  },

  isExcludedGroupHref(href) {
    return /\/groups\/\d+\/(posts|user|members|media|files|events|permalink|buy_sell|announcements|chats)/i.test(href);
  },

  isInSuggestedSection(el) {
    let node = el;
    for (let i = 0; i < 10 && node; i += 1, node = node.parentElement) {
      const heading = node.querySelector?.(':scope > h1, :scope > h2, :scope > h3');
      const t = (heading?.textContent || '').trim();
      if (t && /gợi ý|discover|suggested|khám phá|recommended|you might like|nhóm bạn có thể/i.test(t)) {
        return true;
      }
    }
    return false;
  },

  isJoinedGroupChunk(chunk) {
    const c = String(chunk).slice(0, 2500);
    if (/viewer_join_state":"NOT_MEMBER"|"is_viewer_member":false|GROUP_SUGGESTION|SUGGESTED_GROUP|recommended_groups|GroupsCometDiscover/i.test(c)) {
      return /viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true/i.test(c);
    }
    if (/viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true|has_membership":true/i.test(c)) {
      return true;
    }
    if (this.isYourGroupsPage()) {
      return !/pending_invite|GROUP_INVITE|SUGGESTED|recommended/i.test(c);
    }
    return false;
  },

  isJoinsListResponse(text) {
    return /GroupsCometJoins|GroupsCometYourGroups|groups_tab_list|joined.*groups|your_groups/i.test(String(text || ''));
  },

  addCapturedGroup(id, name) {
    if (!id || !/^\d{5,}$/.test(String(id))) return;
    const n = String(name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    const gid = String(id);
    const entry = {
      id: gid,
      name: n,
      href: `https://www.facebook.com/groups/${gid}/`,
    };
    const existing = this.capturedGroups.get(gid);
    if (!existing) {
      this.capturedGroups.set(gid, entry);
      return;
    }
    if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(n)) {
      existing.name = n;
    } else if (!this.isFallbackGroupName(n) && n.length > existing.name.length) {
      existing.name = n;
    }
  },

  findGroupNameInHtml(html, groupId) {
    const id = String(groupId);
    const patterns = [
      new RegExp(`"id":"${id}"[^}]{0,400}?"name":"((?:[^"\\\\]|\\\\.)*)"`),
      new RegExp(`"name":"((?:[^"\\\\]|\\\\.)*)"[^}]{0,400}?"id":"${id}"`),
      new RegExp(`facebook\\.com\\\\/groups\\\\/${id}[^"]*"[^}]{0,400}?"name":"((?:[^"\\\\]|\\\\.)*)"`),
      new RegExp(`"name":"((?:[^"\\\\]|\\\\.)*)"[^}]{0,400}?"url":"https?:\\\\/\\\\/(?:www\\.)?facebook\\.com\\\\/groups\\\\/${id}`),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const name = this.decodeFbStr(m[1]).trim();
        if (name.length >= 2 && !this.isGenericGroupName(name)) return name;
      }
    }
    return null;
  },

  parseGroupsFromHtml(html, opts = {}) {
    if (!html || html.length < 200) return;
    const joinedOnly = opts.joinedOnly === true;
    if (joinedOnly && !this.isYourGroupsPage()) return;
    (GF.groupParse?.parseJoinedGroupsFromHtml(html, { onJoinsPage: true }) || []).forEach((g) => {
      this.addCapturedGroup(g.id, g.name);
    });
  },

  ingestNetworkText(text) {
    try {
      const onJoins = this.isYourGroupsPage();
      const joinsResponse = this.isJoinsListResponse(text);
      if (onJoins || joinsResponse) {
        (GF.groupParse?.parseJoinedGroupsFromText(text, { onJoinsPage: onJoins }) || []).forEach((g) => {
          this.addCapturedGroup(g.id, g.name);
        });
      }
      const m = text.match(/"fb_api_req_friendly_name":"([^"]+)"[\s\S]{0,500}?"doc_id":"(\d+)"/);
      if (m && window.GF?.fbGraphApi) GF.fbGraphApi.rememberDocId(m[1], m[2]);
      const postM = text.match(/"legacy_story_id":"(\d+)"/) || text.match(/"post_id":"(\d+)"/);
      if (postM) this.capturedPostId = postM[1];
    } catch { /* ignore */ }
  },

  injectPageNetworkHook() {
    if (document.documentElement.dataset.gfPageHook) return;
    document.documentElement.dataset.gfPageHook = '1';
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('modules/pageNetworkHook.js');
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  },

  hookNetworkCapture() {
    if (window.__gfNetworkHooked) return;
    window.__gfNetworkHooked = true;

    this.injectPageNetworkHook();
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.source !== 'gf-page-hook' || e.data?.type !== 'ingest') return;
      this.ingestNetworkText(e.data.text);
    });

    const ingest = (text) => this.ingestNetworkText(text);

    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      try {
        const clone = res.clone();
        clone.text().then(ingest).catch(() => {});
      } catch { /* ignore */ }
      return res;
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function sendPatched(...args) {
      this.addEventListener('load', function onLoad() {
        try {
          if (typeof this.responseText === 'string') ingest(this.responseText);
        } catch { /* ignore */ }
      });
      return origSend.apply(this, args);
    };
  },

  hookGroupCapture() {
    this.hookNetworkCapture();
  },

  pickNameFromLink(a, id, html) {
    const skipNames = /^(group|nhóm|groups|facebook|xem thêm|see more)$/i;
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    let name = clean(a.getAttribute('aria-label'));
    if (name.includes(',')) name = name.split(',')[0].trim();
    if (name.length >= 2 && !skipNames.test(name)) return name;

    const img = a.querySelector('img[alt]');
    if (img?.alt) {
      name = clean(img.alt);
      if (name.length >= 2 && !skipNames.test(name)) return name;
    }

    const row = a.closest('[role="listitem"], [role="row"], [role="article"], li, [data-visualcompletion]');
    if (row) {
      const spans = row.querySelectorAll('span[dir="auto"], strong span, h3 span, h2 span');
      for (const sp of spans) {
        const t = clean(sp.textContent);
        if (t.length >= 2 && !skipNames.test(t) && !/^\d+$/.test(t)) return t;
      }
    }

    let el = a.parentElement;
    for (let depth = 0; el && depth < 5; depth += 1, el = el.parentElement) {
      for (const sp of el.querySelectorAll(':scope > span[dir="auto"], :scope > div span[dir="auto"]')) {
        const t = clean(sp.textContent);
        if (t.length >= 2 && !skipNames.test(t) && !/^\d+$/.test(t)) return t;
      }
    }

    const fromHtml = html ? this.findGroupNameInHtml(html, id) : null;
    if (fromHtml) return fromHtml;

    return `Group ${id}`;
  },

  extractGroupsFromDom(html = document.documentElement.innerHTML, { joinedOnly = false } = {}) {
    const onJoins = this.isYourGroupsPage();
    if (joinedOnly && !onJoins) return [];

    const root = onJoins
      ? (document.querySelector('[role="main"]') || document.body)
      : document.documentElement;

    const map = new Map();

    root.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const href = a.href || a.getAttribute('href') || '';
      if (this.isExcludedGroupHref(href)) return;
      const m = href.match(/\/groups\/(\d{5,})(?:\/|$|\?)/);
      if (!m) return;
      if (joinedOnly) {
        if (a.closest('[role="article"]')) return;
        if (this.isInSuggestedSection(a)) return;
      }
      const id = m[1];
      const name = this.pickNameFromLink(a, id, html);
      const existing = map.get(id);
      if (!existing) {
        map.set(id, { id, name, href: `https://www.facebook.com/groups/${id}/` });
        return;
      }
      if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(name)) {
        existing.name = name;
      }
    });

    return [...map.values()];
  },

  upsertMergedGroup(merged, g) {
    if (!g?.id) return;
    const existing = merged.get(g.id);
    if (!existing) {
      merged.set(g.id, g);
      return;
    }
    if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(g.name)) {
      merged.set(g.id, g);
    } else if (!this.isFallbackGroupName(g.name) && g.name.length > existing.name.length) {
      merged.set(g.id, g);
    }
  },

  mergeGroupSources(opts = {}) {
    const joinedOnly = opts.joinedOnly !== false;
    const html = document.documentElement.innerHTML;
    if (!joinedOnly || this.isYourGroupsPage()) {
      this.parseGroupsFromHtml(html, { joinedOnly });
    }

    const merged = new Map();
    this.capturedGroups.forEach((g, id) => this.upsertMergedGroup(merged, g));
    this.extractGroupsFromDom(html, { joinedOnly }).forEach((g) => this.upsertMergedGroup(merged, g));
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  qs(sel, root = document) {
    return root.querySelector(sel);
  },

  qsa(sel, root = document) {
    return [...root.querySelectorAll(sel)];
  },

  waitFor(sel, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const found = this.qs(sel);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = this.qs(sel);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timeout chờ ${sel}`));
      }, timeout);
    });
  },

  injectText(el, text) {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  },

  extractGroups() {
    return this.mergeGroupSources({ joinedOnly: true });
  },

  getFbUser() {
    if (GF.fbActor) return GF.fbActor.getActiveUser();
    const scripts = [...document.querySelectorAll('script')];
    for (const s of scripts) {
      const t = s.textContent || '';
      const m = t.match(/"USER_ID":"(\d+)"/) || t.match(/"actorID":(\d+)/);
      if (m) return { id: m[1], name: document.title.split('|')[0]?.trim() || 'FB User', type: 'user' };
    }
    return null;
  },

  async ensureActor(actorId) {
    if (!actorId || !GF.fbActor) return;
    const current = GF.fbActor.getActiveActorId();
    if (String(current) !== String(actorId)) {
      await GF.fbActor.switchActor(actorId);
    }
  },

  async scrollSidebar(maxRounds = 8) {
    const aside = document.querySelector('[role="navigation"]') || document.body;
    for (let i = 0; i < maxRounds; i += 1) {
      aside.scrollTop = aside.scrollHeight;
      await this.sleep(600);
    }
  },

  async extractAllGroups({ deep = false } = {}) {
    this.hookGroupCapture();
    if (!deep) {
      return this.mergeGroupSources({ joinedOnly: true });
    }

    const scrollTargets = [
      document.querySelector('[role="main"]'),
      document.querySelector('[role="feed"]'),
      document.scrollingElement,
    ].filter(Boolean);

    for (let i = 0; i < 10; i += 1) {
      scrollTargets.forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
      window.scrollTo(0, document.body.scrollHeight);
      await this.sleep(500);
    }
    await this.sleep(600);

    return this.mergeGroupSources({ joinedOnly: true });
  },

  base64ToBlob(base64, mime = 'image/png') {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  matchKeywords(text, keywords) {
    const lower = text.toLowerCase();
    const excludes = keywords.filter((k) => k.startsWith('-')).map((k) => k.slice(1).toLowerCase());
    const includes = keywords.filter((k) => !k.startsWith('-')).map((k) => k.toLowerCase());
    if (excludes.some((ex) => ex && lower.includes(ex))) return null;
    const matched = includes.filter((inc) => inc && lower.includes(inc));
    return matched.length ? matched : null;
  },

  hookPostIdCapture() {
    this.hookNetworkCapture();
  },

  async openComposer(lang) {
    const triggerSel = gfPickSelector(lang, 'postTrigger');
    const triggers = this.qsa(triggerSel.split(',').map((s) => s.trim()).join(','));
    const trigger = triggers.find((el) => el.offsetParent !== null) || triggers[0];
    if (trigger) trigger.click();
    await this.sleep(800);
    const textbox = await this.waitFor(gfPickSelector(lang, 'textbox'));
    return textbox;
  },

  async attachMedia(fileBlob, lang, filename = 'groupflow.png') {
    const photoBtn = this.qs(gfPickSelector(lang, 'photoBtn'));
    if (photoBtn) photoBtn.click();
    await this.sleep(500);
    const inputs = this.qsa('input[type="file"]');
    const input = inputs.find((el) => {
      const acc = (el.getAttribute('accept') || '').toLowerCase();
      const isVideo = (fileBlob.type || '').startsWith('video/');
      return isVideo ? acc.includes('video') : acc.includes('image');
    }) || inputs[0];
    if (!input) throw new Error('Không tìm thấy input upload media');
    const dt = new DataTransfer();
    dt.items.add(new File([fileBlob], filename, { type: fileBlob.type || 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const waitMs = (fileBlob.type || '').startsWith('video/') ? 5000 : 2000;
    await this.sleep(waitMs);
  },

  async attachImage(fileBlob, lang) {
    return this.attachMedia(fileBlob, lang, 'groupflow.png');
  },

  async submitPost(lang) {
    const btn = this.qs(gfPickSelector(lang, 'postBtn'));
    if (!btn) throw new Error('Không tìm thấy nút Đăng');
    this.capturedPostId = null;
    btn.click();
    await this.sleep(4000);
    if (!this.capturedPostId) {
      const link = this.qs('a[href*="/posts/"]');
      const m = link?.href?.match(/posts\/(\d+)/);
      if (m) this.capturedPostId = m[1];
    }
    return this.capturedPostId;
  },

  async postToGroupClassic({ groupId, text, imageBase64, videoBase64, mediaMime, lang, actorId }) {
    await this.ensureActor(actorId);
    this.hookPostIdCapture();
    if (!location.href.includes(`/groups/${groupId}`)) {
      location.href = `https://www.facebook.com/groups/${groupId}`;
      await this.sleep(3500);
    }
    const textbox = await this.openComposer(lang);
    this.injectText(textbox, text);
    if (videoBase64) {
      const mime = mediaMime || 'video/mp4';
      const ext = mime.includes('quicktime') ? 'mov' : mime.split('/')[1] || 'mp4';
      await this.attachMedia(this.base64ToBlob(videoBase64, mime), lang, `groupflow.${ext}`);
    } else if (imageBase64) {
      const mime = mediaMime || 'image/png';
      const ext = mime.includes('jpeg') ? 'jpg' : mime.split('/')[1] || 'png';
      await this.attachMedia(this.base64ToBlob(imageBase64, mime), lang, `groupflow.${ext}`);
    }
    const postId = await this.submitPost(lang);
    return { postId, groupId, mode: 'classic' };
  },

  async postToGroup({ groupId, text, imageBase64, videoBase64, mediaMime, mediaType, lang, postMode, actorId }) {
    const hasVideo = mediaType === 'video' || Boolean(videoBase64);
    const mode = hasVideo ? 'classic' : (postMode === 'classic' ? 'classic' : 'fast');
    if (mode === 'fast' && GF.fbGraphApi) {
      try {
        return await GF.fbGraphApi.postToGroup({ groupId, text, imageBase64, actorId });
      } catch (e) {
        console.warn('[GroupFlow] Fast mode failed, fallback classic:', e.message);
        return this.postToGroupClassic({ groupId, text, imageBase64, videoBase64, mediaMime, lang, actorId });
      }
    }
    return this.postToGroupClassic({ groupId, text, imageBase64, videoBase64, mediaMime, lang, actorId });
  },

  async commentOnPost({ groupId, postId, text, lang }) {
    const url = `https://www.facebook.com/groups/${groupId}/posts/${postId}`;
    if (location.href !== url) {
      location.href = url;
      await this.sleep(3500);
    }
    const boxSel = gfPickSelector(lang, 'commentBox');
    const box = await this.waitFor(boxSel);
    this.injectText(box, text);
    await this.sleep(500);
    const submit = this.qsa(gfPickSelector(lang, 'commentSubmit')).find((el) => el.offsetParent);
    if (submit) submit.click();
    await this.sleep(2000);
    return { ok: true };
  },

  scanFeedPosts(keywords, sinceTs) {
    const matched = [];
    const articles = this.qsa('[role="article"]');
    articles.forEach((article) => {
      const text = article.innerText || '';
      if (!text.trim()) return;
      const kw = this.matchKeywords(text, keywords);
      if (!kw) return;
      const link = article.querySelector('a[href*="/posts/"], a[href*="permalink"]');
      const postId = link?.href?.match(/(\d{8,})/)?.[1] || '';
      const groupId = location.pathname.match(/\/groups\/(\d+)/)?.[1] || '';
      matched.push({
        id: `lead-${groupId}-${postId}-${Date.now()}`,
        group_id: groupId,
        post_id: postId,
        post_url: link?.href || '',
        snippet: text.slice(0, 200),
        matched_keywords: kw,
        found_at: new Date().toISOString(),
        status: 'new',
      });
    });
    return matched;
  },
};

if (location.hostname.includes('facebook.com') && location.pathname.includes('/groups')) {
  GF_CONTENT.hookGroupCapture();
}

const GF_BRIDGE_VERSION = 5;
globalThis.GF_CONTENT = GF_CONTENT;

function handleGfMessage(msg, sendResponse) {
  (async () => {
    try {
      const C = globalThis.GF_CONTENT;
      if (msg.type === 'GF_PING') {
        return sendResponse({ ok: true, v: GF_BRIDGE_VERSION });
      }
      if (msg.type === 'GF_GET_FB_USER') {
        return sendResponse({ user: C.getFbUser() });
      }
      if (msg.type === 'GF_GET_FB_PROFILES') {
        const profiles = GF.fbActor
          ? await GF.fbActor.getProfilesFull()
          : { personal: null, pages: [], active: C.getFbUser(), activeId: null };
        return sendResponse({ profiles });
      }
      if (msg.type === 'GF_SWITCH_ACTOR') {
        if (!GF.fbActor) throw new Error('F5 tab Facebook rồi thử lại');
        const result = await GF.fbActor.switchActor(msg.actorId);
        return sendResponse({ ok: true, ...result, user: GF.fbActor.getActiveUser() });
      }
      if (msg.type === 'GF_EXTRACT_GROUPS') {
        const groups = msg.deep
          ? await C.extractAllGroups({ deep: true })
          : C.extractGroups();
        return sendResponse({ groups });
      }
      if (msg.type === 'GF_EXTRACT_GROUPS_QUICK') {
        C.hookGroupCapture();
        const groups = C.extractGroups();
        return sendResponse({ groups });
      }
      if (msg.type === 'GF_POST') {
        C.lang = msg.lang || 'vi';
        const result = await C.postToGroup(msg);
        return sendResponse({ ok: true, ...result });
      }
      if (msg.type === 'GF_COMMENT') {
        C.lang = msg.lang || 'vi';
        await C.commentOnPost(msg);
        return sendResponse({ ok: true });
      }
      if (msg.type === 'GF_SCAN_FEED') {
        const keywords = (msg.keywordsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        const leads = C.scanFeedPosts(keywords, msg.since);
        return sendResponse({ leads });
      }
      sendResponse({ error: `Message không hỗ trợ: ${msg.type}` });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
}

if (!globalThis.__gfListenerAdded) {
  globalThis.__gfListenerAdded = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => handleGfMessage(msg, sendResponse));
}
globalThis.__gfBridgeVersion = GF_BRIDGE_VERSION;
