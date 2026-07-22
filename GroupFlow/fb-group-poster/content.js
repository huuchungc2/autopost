// Idempotent: file này có thể bị inject lại; tránh redeclare const.
let GF_CONTENT = globalThis.GF_CONTENT;
if (!GF_CONTENT) GF_CONTENT = {
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

  addCapturedGroup(id, name, meta = {}) {
    if (!id || !/^\d{5,}$/.test(String(id))) return;
    const n = String(name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    this.addCapturedGroupEntry({
      id: String(id),
      name: n,
      href: `https://www.facebook.com/groups/${id}/`,
      ...meta,
    });
  },

  addCapturedGroupEntry(g) {
    if (!g?.id || !/^\d{5,}$/.test(String(g.id))) return;
    const n = String(g.name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    const gid = String(g.id);
    const entry = {
      id: gid,
      name: n,
      href: g.href || `https://www.facebook.com/groups/${gid}/`,
      privacy: g.privacy || 'UNKNOWN',
      post_approval: g.post_approval || 'unknown',
      requires_approval: g.requires_approval || g.post_approval === 'required',
      join_role: g.join_role || null,
      meta_source: g.meta_source,
    };
    const existing = this.capturedGroups.get(gid);
    const merged = GF.groupParse?.mergeGroupEntry
      ? GF.groupParse.mergeGroupEntry(existing, entry)
      : { ...existing, ...entry };
    if (existing && this.isFallbackGroupName(merged.name) && !this.isFallbackGroupName(n)) {
      merged.name = n;
    }
    this.capturedGroups.set(gid, merged);
  },

  reportDocIdsFromHtml(html) {
    const GP = GF.groupParse;
    if (!GP?.findAboutDocIdsInHtml) return;
    const docIds = GP.findAboutDocIdsInHtml(html);
    if (!Object.keys(docIds).length) return;
    gfSafeSendMessage({ type: 'GF_SAVE_GRAPHQL_DOC_IDS', docIds });
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
    this.reportDocIdsFromHtml(html);
    (GF.groupParse?.parseJoinedGroupsFromHtml(html, { onJoinsPage: true }) || []).forEach((g) => {
      this.addCapturedGroupEntry(g);
    });
  },

  ingestNetworkText(text) {
    try {
      const onJoins = this.isYourGroupsPage();
      const joinsResponse = this.isJoinsListResponse(text);
      if (onJoins || joinsResponse) {
        (GF.groupParse?.parseJoinedGroupsFromText(text, { onJoinsPage: onJoins }) || []).forEach((g) => {
          this.addCapturedGroupEntry(g);
        });
      }

      if (/privacy_info|if_viewer_can_post_without_admin_approval|group_privacy/i.test(text)) {
        const groups = GF.groupParse?.parseJoinedGroupsFromText(text, { onJoinsPage: false }) || [];
        if (groups.length) {
          groups.forEach((g) => this.addCapturedGroupEntry(g));
          gfSafeSendMessage({ type: 'GF_APPLY_GROUP_META', groups });
        }
      }

      const GP = GF.groupParse;
      if (GP?.findAboutDocIdsInHtml) {
        const docIds = GP.findAboutDocIdsInHtml(text);
        if (Object.keys(docIds).length) {
          gfSafeSendMessage({ type: 'GF_SAVE_GRAPHQL_DOC_IDS', docIds });
        }
      }

      const m = text.match(/"fb_api_req_friendly_name":"([^"]+)"[\s\S]{0,500}?"doc_id":"(\d+)"/);
      if (m && window.GF?.fbGraphApi) {
        GF.fbGraphApi.rememberDocId(m[1], m[2]);
        // Persist key mutation doc_ids so service worker can use them
        const KEY_MUTATIONS = ['useCometUFICreateCommentMutation', 'ComposerStoryCreateMutation'];
        if (KEY_MUTATIONS.includes(m[1])) {
          gfSafeSendMessage({ type: 'GF_SAVE_KEY_DOC_ID', name: m[1], docId: m[2] });
        }
      }
      // Only extract post_id from responses that contain story_create — searching
      // all responses causes capturedPostId to be overwritten by other users' posts
      // that appear in feed-refresh chunks bundled with the same FB response.
      if (text.includes('"story_create"')) {
        const scIdx = text.indexOf('"story_create"');
        const ctx = text.slice(scIdx, scIdx + 8000);
        const postM = ctx.match(/"legacy_story_hideable_id":"(\d+)"/)
          || ctx.match(/"legacy_api_post_id":"(\d+)"/)
          || ctx.match(/"legacy_story_id":"(\d+)"/)
          || ctx.match(/"legacy_fbid":"(\d+)"/)
          || ctx.match(/"post_id":"(\d+)"/)
          || ctx.match(/story_create[\s\S]{0,3000}?"id":"(\d{8,})"/);
        if (postM) this.capturedPostId = postM[1];
      }
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
      if (e.source !== window || e.data?.source !== 'gf-page-hook') return;
      if (e.data.type === 'ingest') {
        this.ingestNetworkText(e.data.text);
      } else if (e.data.type === 'ingest-req' && (e.data.dyn || e.data.csr)) {
        gfSafeSendMessage({ type: 'GF_SAVE_COMET_TOKENS', dyn: e.data.dyn, csr: e.data.csr });
      }
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

    const collectHrefEl = (el) => {
      const href = el?.href || el?.getAttribute?.('href') || el?.getAttribute?.('data-lynx-uri') || '';
      if (!href) return;
      if (this.isExcludedGroupHref(href)) return;
      const m = href.match(/\/groups\/(\d{5,})(?:\/|$|\?)/);
      if (!m) return;
      if (joinedOnly) {
        if (el.closest?.('[role="article"]')) return;
        if (this.isInSuggestedSection(el)) return;
      }
      const id = m[1];
      const name = this.pickNameFromLink(el, id, html);
      const existing = map.get(id);
      if (!existing) {
        map.set(id, { id, name, href: `https://www.facebook.com/groups/${id}/` });
        return;
      }
      if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(name)) {
        existing.name = name;
      }
    };

    // Classic anchors
    root.querySelectorAll('a[href*="/groups/"]').forEach((a) => collectHrefEl(a));

    // Some joins UIs render “Xem nhóm / View group” as button-like elements.
    // Try to locate the nearest group link around those buttons.
    root.querySelectorAll('[role="button"], div[role="link"], a[role="link"]').forEach((btn) => {
      const t = String(btn?.innerText || btn?.getAttribute?.('aria-label') || '').toLowerCase();
      if (!/(xem\s+nhóm|view\s+group)/i.test(t)) return;
      const link = btn.closest('a[href*="/groups/"]') || btn.querySelector?.('a[href*="/groups/"]');
      if (link) return collectHrefEl(link);
      collectHrefEl(btn);
    });

    return [...map.values()];
  },

  parseJoinsCountFromHeader() {
    const text = document.querySelector('[role="main"]')?.innerText || document.body?.innerText || '';
    const m = text.match(/đã tham gia\s*\((\d+)\)/i)
      || text.match(/joined\s*\((\d+)\)/i)
      || text.match(/(\d+)\s*(?:nhóm|groups?)/i);
    return m ? parseInt(m[1], 10) : null;
  },

  extractGroupsFromMainHtml(html = document.documentElement.innerHTML) {
    if (!this.isYourGroupsPage()) return [];
    const main = document.querySelector('[role="main"]');
    const slice = main?.innerHTML || html;
    const map = new Map();
    const re = /\/groups\/(\d{5,})/g;
    let m;
    while ((m = re.exec(slice)) !== null) {
      const id = m[1];
      if (this.isExcludedGroupHref(`/groups/${id}/`)) continue;
      const name = this.findGroupNameInHtml(slice, id) || `Group ${id}`;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, { id, name, href: `https://www.facebook.com/groups/${id}/` });
      } else if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(name)) {
        existing.name = name;
      }
    }
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
    if (joinedOnly && this.isYourGroupsPage()) {
      this.extractGroupsFromMainHtml(html).forEach((g) => this.upsertMergedGroup(merged, g));
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  checkAborted() {
    if (window.__gfAbortPost) throw new Error('Đã dừng đăng');
  },

  sleep(ms) {
    const step = 250;
    return (async () => {
      for (let t = 0; t < ms; t += step) {
        this.checkAborted();
        await new Promise((r) => setTimeout(r, Math.min(step, ms - t)));
      }
    })();
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
      const cleanup = () => {
        obs.disconnect();
        clearTimeout(to);
        clearInterval(abortTimer);
      };
      const obs = new MutationObserver(() => {
        const el = this.qs(sel);
        if (el) {
          cleanup();
          resolve(el);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const abortTimer = setInterval(() => {
        if (window.__gfAbortPost) {
          cleanup();
          reject(new Error('Đã dừng đăng'));
        }
      }, 300);
      const to = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout chờ ${sel}`));
      }, timeout);
    });
  },

  isAnonymousPostText(text = '') {
    const t = String(text).toLowerCase();
    return /ẩn danh|anonymous|post anonymously|đăng ẩn danh|tạo bài viết ẩn danh|bài viết ẩn danh/.test(t);
  },

  elementLabel(el) {
    if (!el) return '';
    return `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('aria-placeholder') || ''}`.toLowerCase();
  },

  isAnonymousPostTrigger(el) {
    if (!el?.offsetParent) return false;
    const node = el.closest('[role="button"]') || el;
    return this.isAnonymousPostText(this.elementLabel(node));
  },

  isGroupFeedPath(groupId) {
    const gid = String(groupId || '');
    const path = location.pathname.replace(/\/$/, '');
    if (!gid || !path.includes(`/groups/${gid}`)) return false;
    if (/\/groups\/\d+\/(about|members|media|events|files|chats|buy_sell|announcements|pending)/i.test(path)) {
      return false;
    }
    return true;
  },

  isLikelyComposerTrigger(el) {
    if (!el?.offsetParent || this.isAnonymousPostTrigger(el)) return false;
    if (el.closest('[role="article"]')) return false;
    const t = this.elementLabel(el);
    if (/comment|bình luận|search|tìm kiếm|trả lời|messenger/i.test(t)) return false;
    if (/chia sẻ ngay|share now|bảng feed|bạn bè$/i.test(t)) return false;
    return /viết|write|nghĩ|bài viết|công khai|public post|compose/i.test(t)
      || Boolean(el.querySelector?.('[aria-placeholder*="viết"], [aria-placeholder*="Write"], [data-lexical-editor="true"]'));
  },

  scorePostTrigger(el) {
    const t = this.elementLabel(el);
    if (this.isAnonymousPostText(t)) return -1000;
    if (/chia sẻ ngay|share now|gửi bằng messenger/i.test(t)) return -500;
    if (/bảng feed|bạn bè|news feed|your story/i.test(t)) return -400;
    if (!el.closest('[data-pagelet="GroupInlineComposer"], [data-pagelet*="Composer"], [role="main"]')) {
      if (/bạn muốn chia sẻ|what.?s on your mind/i.test(t)) return -200;
    }
    if (/bài viết công khai|create a public post|public post|tạo bài viết/i.test(t)) return 120;
    if (/bạn viết gì|viết gì đi|viết gì|write something|đang nghĩ|hãy viết/i.test(t)) return 100;
    if (/tạo bài|create post|viết bài/i.test(t)) return 70;
    if (el.closest('[data-pagelet="GroupInlineComposer"]')) return 55;
    if (el.closest('[role="main"]') && el.querySelector?.('[aria-placeholder]')) return 48;
    return 15;
  },

  isPersonalShareDialog(dialog) {
    if (!dialog) return false;
    const heading = dialog.querySelector('h2, h3, [role="heading"]')?.textContent?.trim().toLowerCase() || '';
    const t = (dialog.textContent || '').toLowerCase().slice(0, 2500);
    if (heading === 'chia sẻ' || heading === 'share') return true;
    if (/chia sẻ ngay|share now/i.test(t) && /bảng feed|bạn bè|news feed|friends|public/i.test(t)) return true;
    if (/gửi bằng messenger|send in messenger/i.test(t) && !/nhóm|group/i.test(t)) return true;
    return false;
  },

  async dismissPersonalShareDialog() {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog || !this.isPersonalShareDialog(dialog)) return false;
    const close = dialog.querySelector(
      '[aria-label="Đóng"], [aria-label="Close"], [aria-label*="Đóng hộp thoại"], [aria-label*="Close dialog"]',
    ) || [...dialog.querySelectorAll('[role="button"]')].find((el) => {
      const l = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
      return l === 'đóng' || l === 'close' || l === '×';
    });
    if (close) {
      close.click();
      await this.sleep(700);
      return true;
    }
    return false;
  },

  findGroupPostTriggers(lang, groupId) {
    const gid = String(groupId || '');
    if (!gid || !location.href.includes(`/groups/${gid}`)) return [];

    const seen = new Set();
    const list = [];
    const add = (el, bonus = 0) => {
      if (!el?.offsetParent || !this.isLikelyComposerTrigger(el)) return;
      const clickTarget = el.closest('[role="button"]') || el.closest('[tabindex]') || el;
      if (seen.has(clickTarget)) return;
      seen.add(clickTarget);
      const score = this.scorePostTrigger(clickTarget) + bonus;
      if (score > 0) list.push({ el: clickTarget, score });
    };

    const main = document.querySelector('[role="main"]');
    const roots = [
      ...this.qsa('[data-pagelet="GroupInlineComposer"]'),
      ...this.qsa('[data-pagelet="FeedComposer"]'),
      ...this.qsa('[data-pagelet="InlineComposer"]'),
      ...(main?.querySelectorAll('[data-pagelet*="Composer"]') || []),
      ...(main ? [main] : []),
    ];

    const triggerSel = gfPickSelector(lang, 'postTrigger');
    for (const root of roots) {
      if (!root) continue;
      this.qsa(triggerSel, root).forEach((el) => add(el, 25));
      for (const el of root.querySelectorAll('[aria-placeholder], [role="textbox"], [data-lexical-editor="true"]')) {
        if (this.isLikelyComposerTrigger(el)) add(el, 20);
      }
      for (const el of root.querySelectorAll('div[role="button"], div[tabindex="0"]')) {
        if (el.querySelector('[aria-placeholder*="viết"], [aria-placeholder*="Write"], [aria-placeholder*="nghĩ"]')) {
          add(el, 35);
        }
      }
    }

    const groupBtn = this.findCreatePostButton(groupId);
    if (groupBtn) add(groupBtn, 40);

    if (main) {
      const textHits = [/bạn viết gì/i, /viết gì đi/i, /write something/i, /đang nghĩ gì/i, /hãy viết/i];
      for (const el of main.querySelectorAll('span, div[role="button"], div[tabindex="0"]')) {
        const txt = (el.textContent || '').trim();
        if (txt.length < 4 || txt.length > 72) continue;
        if (!textHits.some((re) => re.test(txt))) continue;
        const r = el.getBoundingClientRect();
        if (r.top > 560 || r.width < 40) continue;
        const click = el.closest('[role="button"]') || el.closest('div[tabindex]') || el;
        add(click, 50);
      }
    }

    return list
      .sort((a, b) => b.score - a.score)
      .map((x) => x.el);
  },

  async waitForGroupComposerUi(groupId, lang, timeout = 38000) {
    const gid = String(groupId || '');
    const existing = this.findOpenComposerEditor();
    if (existing) return { ready: true, inline: existing };
    const end = Date.now() + timeout;
    let scrollRound = 0;
    let lastPing = 0;
    while (Date.now() < end) {
      this.checkAborted();
      await this.dismissPostSuccessDialogs();
      await this.dismissPersonalShareDialog();
      if (!location.href.includes(`/groups/${gid}`) || !this.isGroupFeedPath(gid)) {
        this.panelPersistBeforeNav();
        location.assign(`https://www.facebook.com/groups/${gid}`);
        await this.sleep(2800);
        continue;
      }
      if (scrollRound % 4 === 0 && !this.getGroupPostDialog()) {
        await this.scrollGroupFeedForComposer(gid, lang);
      }
      scrollRound += 1;
      try {
        const inline = this.findComposerInRoot(document.querySelector('[role="main"]') || document);
        if (inline) return { ready: true, inline };
      } catch { /* ignore */ }
      if (this.findGroupPostTriggers(lang, gid).length) return { ready: true };
      if (this.findCreatePostButton(gid)) return { ready: true };
      if (Date.now() - lastPing > 4000) {
        lastPing = Date.now();
        const remain = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        this.gfProgress('classic-composer', `Chờ composer nhóm… (còn ~${remain}s)`, gid);
      }
      await this.sleep(500);
    }
    return { ready: false };
  },

  findPublicPostTriggers(lang) {
    const gid = location.pathname.match(/\/groups\/(\d+)/)?.[1];
    if (gid) return this.findGroupPostTriggers(lang, gid);
    return [];
  },

  isAnonymousIntroDialog(dialog) {
    if (!dialog) return false;
    const t = (dialog.textContent || '').toLowerCase();
    if (!/bài viết ẩn danh|post anonymously|anonymous post/.test(t)) return false;
    return !this.findComposerInRoot(dialog);
  },

  async dismissAnonymousIntroDialog() {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog || !this.isAnonymousIntroDialog(dialog)) return false;

    const buttons = [...dialog.querySelectorAll('[role="button"], a[role="button"]')];
    const cancel = buttons.find((el) => {
      const label = (el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
      return label === 'hủy' || label === 'cancel' || label === 'huỷ';
    });
    if (cancel) {
      cancel.click();
      await this.sleep(700);
      return true;
    }

    const close = dialog.querySelector('[aria-label="Đóng"], [aria-label="Close"], [aria-label*="Đóng hộp thoại"]');
    if (close) {
      close.click();
      await this.sleep(700);
      return true;
    }
    return false;
  },

  findCreatePostButton(groupId) {
    const phrases = [
      'write something', "what's on your mind", 'create a public post',
      'bạn viết gì', 'viết gì đi', 'viết gì', 'hãy viết', 'đang nghĩ', 'tạo bài', 'đăng bài', 'bài viết',
      'bài viết công khai', 'viết bài', 'tạo bài viết', 'créer', 'publicación', 'create post',
    ];
    const scopes = [
      ...this.qsa('[data-pagelet="GroupInlineComposer"], [data-pagelet="FeedComposer"], [data-pagelet="InlineComposer"]'),
      document.querySelector('[role="main"]'),
    ].filter(Boolean);
    for (const scope of scopes) {
      const btn = [...scope.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"]')].find((b) => {
        const r = b.getBoundingClientRect();
        if (r.width < 60 || r.height < 16 || r.top > 520) return false;
        const t = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''} ${b.getAttribute('aria-placeholder') || ''}`.toLowerCase();
        if (this.isAnonymousPostText(t)) return false;
        if (/chia sẻ ngay|share now|messenger|bảng feed/i.test(t)) return false;
        return phrases.some((ph) => t.includes(ph)) || Boolean(b.querySelector('[aria-placeholder*="viết"], [aria-placeholder*="Write"]'));
      });
      if (btn) return btn.closest('[role="button"]') || btn;
    }
    return null;
  },

  isComposerEditor(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    if (r.width < 12 || r.height < 8 || s.display === 'none' || s.visibility === 'hidden') return false;
    const inDialog = el.closest('[role="dialog"]');
    if (!inDialog && !el.offsetParent) return false;
    const label = (el.getAttribute('aria-label') || el.getAttribute('aria-placeholder') || '').toLowerCase();
    if (/comment|bình luận|search|tìm kiếm|trả lời/.test(label)) return false;
    if (el.closest('[role="article"]') && !inDialog) return false;
    return true;
  },

  composerEditorSelector() {
    return [
      "div[data-lexical-editor='true']",
      "div.notranslate[contenteditable='true']",
      "div[role='textbox'][contenteditable='true']",
      "div[contenteditable='true'][aria-placeholder]",
      "div[contenteditable='true'][data-lexical-editor]",
    ].join(', ');
  },

  getGroupPostDialog() {
    // Quét TẤT CẢ [role="dialog"] hiện có, không chỉ phần tử đầu tiên — FB Comet có thể render
    // nhiều dialog cùng lúc (backdrop/layer lồng nhau...), lấy đúng 1 phần tử đầu dễ trúng nhầm
    // dialog không phải composer thật (xem chú thích findComposerEditor()).
    for (const dialog of this.qsa('[role="dialog"]')) {
      if (this.isPersonalShareDialog(dialog)) continue;
      if (this.isAnonymousIntroDialog(dialog)) continue;
      const heading = dialog.querySelector('h2, h3, [role="heading"]')?.textContent?.trim().toLowerCase() || '';
      const t = (dialog.textContent || '').slice(0, 1200).toLowerCase();
      if (/tạo bài viết|create post|bài viết công khai|public post|write something/.test(heading + t)) return dialog;
      if (this.findComposerInRoot(dialog)) return dialog;
    }
    return null;
  },

  findOpenComposerEditor() {
    const dialog = this.getGroupPostDialog();
    if (dialog) {
      const ed = this.findComposerInRoot(dialog);
      if (ed) return ed;
    }
    for (const pagelet of this.qsa('[data-pagelet="GroupInlineComposer"], [data-pagelet*="Composer"]')) {
      const ed = this.findComposerInRoot(pagelet);
      if (ed) return ed;
    }
    return null;
  },

  findComposerInRoot(root) {
    if (!root) return null;
    const sel = this.composerEditorSelector();
    let candidates = this.qsa(sel, root).filter((el) => this.isComposerEditor(el));
    if (!candidates.length && root.getAttribute?.('role') === 'dialog') {
      candidates = [...root.querySelectorAll('[contenteditable="true"]')].filter((el) => {
        const ph = (el.getAttribute('aria-placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
        if (!/viết|write|nghĩ|think|public post|công khai/.test(ph)) return false;
        return this.isComposerEditor(el);
      });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    });
    return candidates[0];
  },

  assertComposerEditor(el, context = 'composer') {
    if (el && typeof el.scrollIntoView === 'function') return el;
    throw new Error(`Không lấy được ô soạn bài (${context}) — F5 tab FB rồi thử lại`);
  },

  async dismissOpenPostDialog() {
    const dialog = this.getGroupPostDialog();
    if (!dialog) return false;
    const close = dialog.querySelector(
      '[aria-label="Đóng"], [aria-label="Close"], [aria-label*="Đóng hộp thoại"], [aria-label*="Close dialog"]',
    ) || [...dialog.querySelectorAll('[role="button"]')].find((el) => {
      const l = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
      return l === 'đóng' || l === 'close' || l === '×';
    });
    if (close) {
      close.click();
      await this.sleep(500);
      return true;
    }
    return false;
  },

  async findComposerEditor(timeout = 28000) {
    const quick = this.findOpenComposerEditor();
    if (quick) return quick;
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      // Bug thật đã gặp: hộp thoại "Tạo bài viết" mở sẵn, đứng yên >10-20s, vẫn báo "không tìm
      // thấy ô soạn bài" sau khi hết timeout. Nguyên nhân: FB Comet có thể render NHIỀU
      // [role="dialog"] cùng lúc (backdrop/layer lồng nhau, dialog ẩn/phụ khác...) —
      // document.querySelector chỉ lấy ĐÚNG 1 phần tử ĐẦU TIÊN khớp; nếu đó không phải dialog
      // composer thật, findComposerInRoot() trên nó luôn trả null suốt cả vòng lặp dù dialog
      // thật vẫn nằm sẵn ở chỗ khác trong DOM. Giờ quét TẤT CẢ dialog hiện có mỗi lượt.
      const dialogs = this.qsa('[role="dialog"]');
      const shareDialog = dialogs.find((d) => this.isPersonalShareDialog(d));
      if (shareDialog) {
        await this.dismissPersonalShareDialog();
        await this.sleep(400);
        continue;
      }
      const anonDialog = dialogs.find((d) => this.isAnonymousIntroDialog(d));
      if (anonDialog) {
        await this.dismissAnonymousIntroDialog();
        await this.sleep(400);
        continue;
      }
      for (const dialog of dialogs) {
        const ed = this.findComposerInRoot(dialog);
        if (ed) return ed;
      }

      for (const pagelet of this.qsa('[data-pagelet="GroupInlineComposer"], [data-pagelet*="Composer"]')) {
        const ed = this.findComposerInRoot(pagelet);
        if (ed) return ed;
      }

      const main = document.querySelector('[role="main"]');
      if (main) {
        const ed = this.findComposerInRoot(main);
        if (ed) return ed;
      }

      await this.sleep(250);
    }
    throw new Error('Không tìm thấy ô soạn bài nhóm — mở đúng trang nhóm FB (không phải Chia sẻ cá nhân); F5 rồi thử lại');
  },

  isComposerTriggerVisible(el) {
    if (!el?.offsetParent) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 48 && r.top < window.innerHeight * 0.82 && r.width > 40;
  },

  async scrollGroupFeedForComposer(groupId, lang) {
    const gid = String(groupId || '');
    const main = document.querySelector('[role="main"]');

    const triggers = this.findGroupPostTriggers(lang, gid);
    if (triggers.length && this.isComposerTriggerVisible(triggers[0])) return;

    window.scrollTo({ top: 0, behavior: 'instant' });
    if (main) main.scrollTop = 0;
    await this.sleep(200);

    for (let round = 0; round < 2; round += 1) {
      this.checkAborted();
      const found = this.findGroupPostTriggers(lang, gid);
      if (found.length) {
        if (!this.isComposerTriggerVisible(found[0])) {
          found[0].scrollIntoView({ block: 'nearest', behavior: 'instant' });
          await this.sleep(200);
        }
        return;
      }
      if (round === 0) {
        window.scrollBy({ top: 120, behavior: 'instant' });
        if (main) main.scrollTop += 120;
        await this.sleep(200);
      }
    }
  },

  panelPersistBeforeNav() {
    try {
      chrome.storage.session.set({ gfPostingActive: true });
    } catch { /* ignore */ }
  },

  async ensureGroupFeedReady(groupId, lang = 'vi') {
    const gid = String(groupId || '');
    if (!gid) return;
    const curGid = location.pathname.match(/\/groups\/(\d+)/)?.[1];
    if (curGid && curGid !== gid) {
      await this.dismissOpenPostDialog();
    }
    if (this.findOpenComposerEditor() && curGid === gid) return;
    await this.dismissPostSuccessDialogs();
    await this.dismissPersonalShareDialog();
    const feed = `https://www.facebook.com/groups/${gid}`;
    if (!location.href.includes(`/groups/${gid}`) || !this.isGroupFeedPath(gid)) {
      this.panelPersistBeforeNav();
      location.assign(feed);
      const end = Date.now() + 32000;
      while (Date.now() < end) {
        this.checkAborted();
        if (location.href.includes(`/groups/${gid}`) && this.isGroupFeedPath(gid) && document.querySelector('[role="main"]')) break;
        await this.sleep(400);
      }
      await this.sleep(3200);
    }
    if (this._gfPreparedGroupId !== gid) {
      this._gfPreparedGroupId = null;
      this._gfPreparedAt = 0;
    }
    await this.scrollGroupFeedForComposer(gid, lang);
  },

  async prepareClassicPost(groupId) {
    const gid = String(groupId || '');
    if (!gid) return;
    if (
      this._gfPreparedGroupId === gid
      && this._gfPreparedAt
      && Date.now() - this._gfPreparedAt < 12000
    ) {
      return;
    }
    await this.ensureGroupFeedReady(gid, 'vi');
    this._gfPreparedGroupId = gid;
    this._gfPreparedAt = Date.now();
  },

  clearClassicPrepareCache() {
    this._gfPreparedGroupId = null;
    this._gfPreparedAt = 0;
  },

  async openComposer(lang, groupId) {
    const gid = String(groupId || location.pathname.match(/\/groups\/(\d+)/)?.[1] || '');
    if (!gid || !location.href.includes(`/groups/${gid}`)) {
      throw new Error('Chưa ở trang nhóm FB — extension cần URL /groups/… không phải trang cá nhân');
    }

    const alreadyOpen = this.findOpenComposerEditor();
    if (alreadyOpen) {
      this.gfProgress('classic-text', 'Composer đã mở — chèn chữ…', gid);
      return this.assertComposerEditor(alreadyOpen, 'dialog-open');
    }

    await this.prepareClassicPost(gid);
    await this.dismissPersonalShareDialog();

    const recentlyPrepared = this._gfPreparedGroupId === gid
      && this._gfPreparedAt
      && Date.now() - this._gfPreparedAt < 10000;
    const hasTriggers = this.findGroupPostTriggers(lang, gid).length > 0
      || Boolean(this.findCreatePostButton(gid));

    let ui = { ready: false };
    if (recentlyPrepared) {
      ui = { ready: Boolean(this.findOpenComposerEditor() || hasTriggers) };
    }
    if (!ui.ready) {
      ui = await this.waitForGroupComposerUi(gid, lang, 32000);
    }
    if (!ui.ready) {
      this.gfProgress('classic-composer', 'Composer chưa sẵn sàng — tải lại feed nhóm…', gid);
      this.clearClassicPrepareCache();
      await this.ensureGroupFeedReady(gid, lang);
      ui = await this.waitForGroupComposerUi(gid, lang, 22000);
    }
    if (!ui.ready) {
      throw new Error(`Trang nhóm chưa load composer (${gid}) — F5 tab facebook.com/groups/… đợi 5s rồi thử lại`);
    }

    const dialogEd = this.findOpenComposerEditor();
    if (dialogEd) {
      return this.assertComposerEditor(dialogEd, 'dialog');
    }

    // Không dùng inline feed sớm — cần mở dialog đầy đủ để có nút Đăng.
    try {
      const existing = await this.findComposerEditor(2500);
      if (existing) {
        existing.focus();
        existing.click();
        await this.sleep(1800);
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog && !this.isPersonalShareDialog(dialog)) {
          const dialogEd = this.findComposerInRoot(dialog);
          if (dialogEd) return dialogEd;
        }
      }
    } catch { /* mở modal qua trigger */ }

    await this.dismissAnonymousIntroDialog();

    let triggers = this.findGroupPostTriggers(lang, gid);
    if (!triggers.length) {
      const legacy = this.findCreatePostButton(gid);
      if (legacy) triggers = [legacy];
    }
    if (!triggers.length) {
      await this.sleep(900);
      triggers = this.findGroupPostTriggers(lang, gid);
      if (!triggers.length) {
        const legacy = this.findCreatePostButton(gid);
        if (legacy) triggers = [legacy];
      }
    }
    if (!triggers.length && this.getGroupPostDialog()) {
      const ed = this.findOpenComposerEditor();
      if (ed) return ed;
    }
    if (!triggers.length) {
      throw new Error('Không tìm thấy ô「Bạn viết gì đi…」— mở tab feed nhóm (không phải Giới thiệu/Thành viên), F5 rồi thử lại');
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (this.getGroupPostDialog()) {
        const ed = this.findOpenComposerEditor();
        if (ed) return this.assertComposerEditor(ed, 'dialog-loop');
      }
      triggers = this.findGroupPostTriggers(lang, gid);
      if (!triggers.length) {
        const legacy = this.findCreatePostButton(gid);
        if (legacy) triggers = [legacy];
      }
      if (!triggers.length) {
        const ed = this.findOpenComposerEditor();
        if (ed) return this.assertComposerEditor(ed, 'no-trigger');
        break;
      }
      await this.dismissPersonalShareDialog();
      const trigger = triggers[Math.min(attempt, triggers.length - 1)];
      if (!trigger?.scrollIntoView) {
        await this.sleep(600);
        continue;
      }
      trigger.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      trigger.click();
      await this.sleep(attempt === 0 ? 1800 : 2400);

      if (await this.dismissPersonalShareDialog()) {
        triggers = this.findGroupPostTriggers(lang, gid);
        continue;
      }
      if (await this.dismissAnonymousIntroDialog()) {
        triggers = this.findGroupPostTriggers(lang, gid);
        continue;
      }

      try {
        const ed = await this.findComposerEditor(8000);
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog && !this.isPersonalShareDialog(dialog)) {
          const dialogEd = this.findComposerInRoot(dialog);
          if (dialogEd) return dialogEd;
        }
        if (ed) return ed;
      } catch {
        await this.dismissAnonymousIntroDialog();
        await this.dismissPersonalShareDialog();
        triggers = this.findGroupPostTriggers(lang, gid);
      }
    }
    if (document.querySelector('[role="dialog"]') && this.isPersonalShareDialog(document.querySelector('[role="dialog"]'))) {
      throw new Error('FB mở「Chia sẻ」cá nhân thay vì đăng nhóm — mở tab đúng trang nhóm, F5, thử Cổ điển lại');
    }
    return this.assertComposerEditor(await this.findComposerEditor(), 'final');
  },

  charTypingDelay(ch, prevCh) {
    let ms = 48 + Math.floor(Math.random() * 72);
    if (/[.,!?;:…]/.test(ch)) ms += 120 + Math.floor(Math.random() * 200);
    if (ch === ' ') ms += 25 + Math.floor(Math.random() * 55);
    if (ch === '\n') ms += 280 + Math.floor(Math.random() * 420);
    if (prevCh && /[.!?]/.test(prevCh) && ch !== ' ') ms += 80 + Math.floor(Math.random() * 160);
    if (Math.random() < 0.07) ms += 220 + Math.floor(Math.random() * 380);
    return ms;
  },

  async typeHumanLike(el, text, { clearFirst = true } = {}) {
    const plain = String(text || '');
    // Chỉ xóa khi ô ĐANG CÓ CHỮ THẬT (đang gõ lại sau lần thử trước) — bug thật đã gặp: bài có
    // ảnh gắn trước (đúng thứ tự "gắn ảnh trước chèn chữ"), lần gõ ĐẦU TIÊN ô soạn bài chưa có chữ
    // gì, nhưng selectAll+delete vẫn chạy vô điều kiện — nếu ảnh đính kèm nằm chung vùng soạn thảo
    // (kiểu decorator node của Lexical, không phải khối tách biệt) thì lệnh này xóa luôn cả ảnh,
    // đăng ra bài mất ảnh chỉ còn chữ. Không có gì để xóa thì bỏ qua bước này.
    if (clearFirst && this.composerTextLength(el) > 0) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      await this.sleep(180 + Math.floor(Math.random() * 220));
    }

    const chars = [...plain];
    let i = 0;
    while (i < chars.length) {
      this.checkAborted();
      const ch = chars[i];
      if (ch === '\n') {
        el.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
        }));
        el.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
        }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertLineBreak' }));
        await this.sleep(this.charTypingDelay('\n', chars[i - 1]));
        i += 1;
        continue;
      }

      const burstLen = Math.random() < 0.82 ? 1 : Math.min(chars.length - i, 2 + Math.floor(Math.random() * 2));
      let chunk = '';
      for (let j = 0; j < burstLen && i + j < chars.length; j += 1) {
        if (chars[i + j] === '\n') break;
        chunk += chars[i + j];
      }
      if (!chunk) {
        i += 1;
        continue;
      }

      document.execCommand('insertText', false, chunk);
      let delay = 0;
      for (let j = 0; j < chunk.length; j += 1) {
        delay += this.charTypingDelay(chunk[j], chunk[j - 1]);
      }
      await this.sleep(delay);
      i += [...chunk].length;
      if (i % 15 === 0) {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
      }
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
    await this.sleep(250 + Math.floor(Math.random() * 350));
  },

  textInjectedOk(el, expected) {
    const plain = String(expected || '').trim();
    if (!plain) return true;
    const got = (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
    // San toi thieu 8 ky tu khong duoc vuot qua do dai that can go (plain.length) - neu khong,
    // comment ngan (vd 6 ky tu) se luon bi coi la go thieu du da go du, khien code tuong loi roi
    // tu xoa-go-lai (execCommand khong xoa sach duoc Lexical editor cua FB), noi dung bi nhan doi.
    const minLen = Math.min(plain.length, Math.max(8, Math.floor(plain.length * 0.82)));
    return got.length >= minLen;
  },

  async nudgeComposerForSubmit(el) {
    if (!el) return;
    try {
      el.focus();
      el.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: 'insertText',
        data: ' ',
      }));
      document.execCommand('insertText', false, ' ');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
      await this.sleep(100);
      document.execCommand('delete', false, null);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }));
      await this.sleep(120);
    } catch { /* ignore */ }
  },

  async finalizeComposerForSubmit(el, lang = 'vi') {
    if (!el) return el;
    if (!el.isConnected) el = this.findOpenComposerEditor() || el;
    await this.nudgeComposerForSubmit(el);
    let btn = this.findSubmitButton(lang);
    if (btn && !this.isDisabledBtn(btn)) return el;

    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog || this.isPersonalShareDialog(dialog)) {
      el.focus();
      el.click();
      await this.sleep(1600);
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg && !this.isPersonalShareDialog(dlg)) {
        const dialogEd = this.findComposerInRoot(dlg);
        if (dialogEd) {
          await this.nudgeComposerForSubmit(dialogEd);
          return dialogEd;
        }
      }
    }
    return el;
  },

  composerDialogGone() {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      return !dialog.querySelector('div[contenteditable="true"], div[data-lexical-editor="true"]');
    }
    for (const pagelet of this.qsa('[data-pagelet="GroupInlineComposer"], [data-pagelet*="Composer"]')) {
      const ed = this.findComposerInRoot(pagelet);
      if (ed && (ed.innerText || '').trim().length > 12) return false;
    }
    return true;
  },

  async dismissPostSuccessDialogs() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    for (const dialog of dialogs) {
      const t = (dialog.textContent || '').toLowerCase();
      if (!/whatsapp|boost|quảng cáo|promote|add a button/i.test(t)) continue;
      const close = dialog.querySelector(
        '[aria-label="Đóng"], [aria-label="Close"], [aria-label="Not now"], [aria-label="Không phải bây giờ"]',
      ) || [...dialog.querySelectorAll('[role="button"]')].find((el) => {
        const l = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
        return l === 'đóng' || l === 'close' || l === 'not now' || l === 'không phải bây giờ';
      });
      if (close) {
        close.click();
        await this.sleep(700);
      }
    }
  },

  isMediaUploading() {
    const spinners = document.querySelectorAll(
      '[data-visualcompletion="loading-state"], [role="progressbar"], [role="status"] img[src*=".gif"]',
    );
    for (const el of spinners) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || s.display === 'none' || s.visibility === 'hidden') continue;
      if (r.height <= 3) continue;
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      if (/volume|seek|âm lượng/.test(label)) continue;
      return true;
    }
    return false;
  },

  async refocusComposerEditor(fallback) {
    await this.sleep(400);
    try {
      const ed = await this.findComposerEditor(12000);
      if (ed) {
        ed.scrollIntoView({ block: 'center' });
        ed.focus();
        ed.click();
        await this.sleep(350);
        return ed;
      }
    } catch { /* keep fallback */ }
    // 2026-07-21 — sau khi gắn media, FB render lại dialog → tham chiếu ô soạn cũ có thể đã bị
    // tháo khỏi DOM (isConnected=false). Gõ/paste vào node chết là no-op im lặng: cursor vẫn
    // nhấp nháy, user gõ tay được, còn tool "gõ" mãi không ra chữ rồi kẹt nhiều phút ở vòng chờ
    // nút Đăng. Báo lỗi rõ để engine retry, thay vì tiếp tục với node chết.
    if (fallback && !fallback.isConnected) {
      throw new Error('Ô soạn bài bị FB render lại sau khi gắn media — thử Đăng lại hoặc F5 tab FB');
    }
    if (fallback) {
      fallback.focus();
      fallback.click();
    }
    return fallback;
  },

  async pasteFragment(el, { plain, html }) {
    const chunk = String(plain || '');
    if (!chunk) return false;
    try {
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', chunk);
      if (html) dt.setData('text/html', html);
      el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertFromPaste',
      }));
      await this.sleep(280);
      if (this.textInjectedOk(el, chunk)) return true;
    } catch { /* fallback insertText */ }
    try {
      document.execCommand('insertText', false, chunk);
      await this.sleep(120);
      return this.textInjectedOk(el, chunk);
    } catch {
      return false;
    }
  },

  composerTextLength(el) {
    return (el?.innerText || el?.textContent || '').replace(/\u00a0/g, ' ').trim().length;
  },

  composerHasText(el, expectedPlain) {
    const expect = String(expectedPlain || '').trim();
    if (!expect) return true;
    const got = this.composerTextLength(el);
    return got >= Math.max(8, Math.floor(expect.length * 0.55));
  },

  async injectPlainFast(el, { plain, html }) {
    const text = String(plain || '');
    if (!text.trim()) return true;
    if (html && await this.pasteComposerContent(el, { plain: text, html })) return true;
    if (await this.pasteComposerContent(el, { plain: text, html: null })) return true;
    await this.typeHumanLike(el, text, { clearFirst: true });
    return this.composerHasText(el, text);
  },

  async insertComposerLineBreak(el) {
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    el.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
    }));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertLineBreak' }));
    await this.sleep(this.charTypingDelay('\n', ' '));
  },

  async injectHybridText(el, segments, TF) {
    // Xem chú thích ở typeHumanLike() — chỉ xóa khi ô đã có chữ thật, tránh xóa nhầm ảnh đã gắn
    // trước đó khi ô soạn bài đang trống (lần gõ đầu tiên).
    if (this.composerTextLength(el) > 0) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      await this.sleep(180 + Math.floor(Math.random() * 160));
    }

    for (let i = 0; i < segments.length; i += 1) {
      this.checkAborted();
      if (i > 0) await this.insertComposerLineBreak(el);

      const seg = segments[i];
      if (seg.mode === 'paste') {
        const plain = TF.stripMarkdown(seg.text);
        const segHtml = TF.segmentPasteHtml(seg.text);
        const ok = await this.pasteFragment(el, { plain, html: segHtml });
        if (!ok) {
          const fallback = TF.hasMarkdown(seg.text)
            ? TF.markdownToUnicode(seg.text)
            : plain;
          await this.typeHumanLike(el, fallback, { clearFirst: false });
        }
      } else {
        const toType = TF.hasMarkdown(seg.text)
          ? TF.markdownToUnicode(seg.text)
          : TF.stripMarkdown(seg.text);
        await this.typeHumanLike(el, toType, { clearFirst: false });
      }
      await this.sleep(120 + Math.floor(Math.random() * 180));
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    await this.sleep(250);
  },

  async pasteComposerContent(el, { plain, html }) {
    const expect = String(plain || '').trim();
    if (!expect) return false;
    try {
      el.focus();
      // Xem chú thích ở typeHumanLike() — chỉ xóa khi ô đã có chữ thật, tránh xóa nhầm ảnh đã
      // gắn trước đó khi ô soạn bài đang trống (lần gõ đầu tiên).
      if (this.composerTextLength(el) > 0) {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        await this.sleep(120);
      }
      const dt = new DataTransfer();
      dt.setData('text/plain', plain);
      if (html) dt.setData('text/html', html);
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      el.dispatchEvent(ev);
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertFromPaste',
      }));
      await this.sleep(450);
      return this.textInjectedOk(el, expect);
    } catch {
      return false;
    }
  },

  async injectRichText(el, { text, html, classicTextMode = 'hybrid' }) {
    this.checkAborted();
    // Node bị FB tháo khỏi DOM (re-render sau khi gắn media) → tìm lại editor thật, đừng gõ vào node chết.
    let target = el;
    if (!target?.isConnected) {
      target = await this.findComposerEditor(8000).catch(() => null);
    }
    const editor = this.assertComposerEditor(target, 'inject');
    const TF = globalThis.GF?.textFormat;
    const pack = TF?.prepareClassicPayload?.({ text, htmlFromDelta: html }) || {
      plain: String(text || ''),
      html: null,
      unicode: String(text || ''),
      stripped: String(text || ''),
      hasMd: false,
    };
    const toType = pack.hasMd
      ? (pack.unicode !== pack.plain ? pack.unicode : pack.stripped)
      : pack.plain;
    const pastePlain = pack.stripped || pack.plain;

    editor.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    editor.focus();
    editor.click();
    await this.sleep(300);
    this.checkAborted();

    if (classicTextMode === 'paste') {
      if (pack.html && await this.pasteComposerContent(editor, { plain: pastePlain, html: pack.html })) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await this.sleep(300);
        return;
      }
      if (await this.pasteComposerContent(editor, { plain: pastePlain, html: null })) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await this.sleep(300);
        return;
      }
      await this.typeHumanLike(editor, pastePlain, { clearFirst: true });
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      await this.sleep(300);
      return;
    }

    // Hybrid — chỉ segment khi có dòng emoji/**đậm**; chữ thuần → paste một lần (tránh gõ từng chữ treo composer).
    const segments = TF?.splitHybridSegments?.(pastePlain) || [{ mode: 'type', text: pastePlain }];
    const hasPaste = segments.some((s) => s.mode === 'paste');

    if (!hasPaste) {
      await this.injectPlainFast(editor, { plain: pastePlain, html: pack.html });
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      await this.sleep(300);
      return;
    }

    await this.injectHybridText(editor, segments, TF);
    if (this.composerHasText(editor, pastePlain)) {
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      await this.sleep(300);
      return;
    }
    // Hybrid thất bại — fallback paste cả bài (giữ emoji/format)
    await this.injectPlainFast(editor, { plain: pastePlain, html: pack.html });
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    await this.sleep(300);
  },

  async injectText(el, text, { human = true } = {}) {
    const plain = String(text || '');
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    await this.sleep(280 + Math.floor(Math.random() * 180));

    if (human && plain.length > 0) {
      try {
        await this.typeHumanLike(el, plain);
        if (this.textInjectedOk(el, plain)) return;
      } catch (e) {
        if (/đã dừng/i.test(e?.message || '')) throw e;
        /* fallback paste */
      }
    }

    const lines = plain.split(/\r?\n/);
    let pasted = false;
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      for (let i = 0; i < lines.length; i += 1) {
        if (i > 0) {
          el.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
          }));
          el.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
          }));
          await this.sleep(120 + Math.floor(Math.random() * 180));
        }
        if (lines[i]) {
          document.execCommand('insertText', false, lines[i]);
          await this.sleep(40 + Math.floor(Math.random() * 80));
        }
      }
      pasted = this.textInjectedOk(el, plain);
    } catch { /* fallback */ }

    if (!pasted) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', plain);
        const ev = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        el.dispatchEvent(ev);
        pasted = this.textInjectedOk(el, plain);
      } catch { /* ignore */ }
    }

    if (!pasted) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, plain);
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    await this.sleep(300);
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
    if (!actorId || !GF.fbActor) return false;
    const current = GF.fbActor.getActiveActorId();
    if (String(current) === String(actorId)) return false;
    await GF.fbActor.switchActor(actorId);
    return true;
  },

  async ensureOnGroupPage(groupId, { afterActorSwitch = false } = {}) {
    const gid = String(groupId);
    if (afterActorSwitch) this.clearClassicPrepareCache();
    const curGid = location.pathname.match(/\/groups\/(\d+)/)?.[1];
    if (curGid && curGid !== gid) {
      await this.dismissOpenPostDialog();
      this.clearClassicPrepareCache();
    }
    if (this.findOpenComposerEditor() && curGid === gid) {
      await this.dismissAnonymousIntroDialog();
      return;
    }
    if (location.href.includes(`/groups/${gid}`) && this.isGroupFeedPath(gid)) {
      await this.prepareClassicPost(gid);
      return;
    }
    await this.ensureGroupFeedReady(gid, this.lang || 'vi');
    if (afterActorSwitch) await this.sleep(2000);
    await this.prepareClassicPost(gid);
  },

  isDisabledBtn(el) {
    if (!el) return true;
    if (el.getAttribute('aria-disabled') === 'true') return true;
    if (el.hasAttribute('disabled')) return true;
    const parent = el.closest('[aria-disabled="true"]');
    return Boolean(parent);
  },

  findSubmitButton(lang) {
    const dialog = document.querySelector('[role="dialog"]');
    const scopes = dialog ? [dialog] : [
      ...this.qsa('[data-pagelet="GroupInlineComposer"], [data-pagelet*="Composer"]'),
      document,
    ];
    const exact = [
      'đăng', 'post', 'đăng bài', 'publish', 'chia sẻ', 'share',
    ];
    const skip = ['x', 'đóng', 'close', 'cancel', 'hủy', 'huỷ', 'đăng nhập', 'đăng ký', 'trở lại', 'back'];

    for (const scope of scopes) {
      const buttons = [...scope.querySelectorAll('div[role="button"], button, [role="button"]')]
        .filter((el) => el.offsetParent && !this.isDisabledBtn(el));
      for (const el of buttons) {
        const t = (el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
        if (!t || skip.some((s) => t === s || t.startsWith(`${s} `))) continue;
        if (exact.some((l) => t === l || t === `${l}…` || t === `${l}...`)) return el;
      }
    }

    const bySel = this.qs(gfPickSelector(lang, 'postBtn'));
    if (bySel && !this.isDisabledBtn(bySel)) return bySel;

    for (const scope of scopes) {
      const loose = [...scope.querySelectorAll('div[role="button"], button')]
        .find((el) => {
          if (!el.offsetParent || this.isDisabledBtn(el)) return false;
          const t = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
          if (skip.some((s) => t.includes(s))) return false;
          return /^đăng$|^post$|đăng bài|^publish$/i.test(t);
        });
      if (loose) return loose;
    }
    return null;
  },

  async waitForSubmitButton(lang, timeout = 90000, { onWait } = {}) {
    const end = Date.now() + timeout;
    let lastPing = 0;
    while (Date.now() < end) {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog && this.isPersonalShareDialog(dialog)) {
        throw new Error('Đang ở dialog「Chia sẻ」cá nhân — cần composer nhóm (nút Đăng, không phải Chia sẻ ngay)');
      }
      const btn = this.findSubmitButton(lang);
      if (btn) return btn;
      if (onWait && Date.now() - lastPing > 8000) {
        lastPing = Date.now();
        onWait();
      }
      await this.sleep(500);
    }
    throw new Error('Không tìm thấy nút Đăng — nội dung có thể chưa nhận (thử F5 tab FB) hoặc ảnh chưa upload xong');
  },

  // FB Comet có thể render nhiều [role="dialog"] cùng lúc — quét TẤT CẢ, không chỉ dialog đầu
  // tiên (cùng bug đã gặp ở findComposerEditor()). Trả về SỐ media đang gắn (max qua các scope).
  mediaPreviewCountNow() {
    const dialogs = this.qsa('[role="dialog"]');
    const scopes = dialogs.length ? dialogs : [document];
    let best = 0;
    for (const scope of scopes) {
      const n = this.mediaPreviewCount(scope);
      if (n > best) best = n;
    }
    return best;
  },

  // v1.0.297 — `minCount` là mấu chốt của fix "đăng nhiều ảnh chỉ lên 1 ảnh": trước đây hàm này
  // chỉ hỏi "có preview nào không", nên từ ảnh thứ 2 trở đi nó thấy preview của ảnh THỨ NHẤT rồi
  // trả true ngay lập tức — attachMedia() không hề chờ ảnh 2..N được FB nhận.
  async waitForMediaPreview(timeout = 45000, minCount = 1) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (this.mediaPreviewCountNow() >= minCount) return true;
      await this.sleep(600);
    }
    return false;
  },

  // 2026-07-21 — FB đổi DOM composer: preview video là thẻ <video> (không phải <img>), preview
  // ảnh có thể render bằng background-image: url(blob:...) trên div, nút xoá media đổi nhãn
  // "Xóa" → "Gỡ". Selector cũ không khớp cái nào → video chờ đủ 120s rồi ném "Video chưa hiện
  // preview" dù media ĐÃ gắn thành công.
  //
  // 2026-07-22 (v1.0.294) — BUG MẤT MEDIA do chính bản v1.0.284: 2 tín hiệu quá RỘNG khiến
  // mediaPreviewInScope() trả true NGAY khi composer vừa mở, TRƯỚC khi ảnh/video thật kịp gắn →
  // attachMedia() tưởng "đã có preview" nên gõ chữ + bấm Đăng luôn → bài lên KHÔNG có media:
  //   (1) `img[src*="scontent"]` khớp AVATAR người đăng (luôn có sẵn trong dialog "Tạo bài viết");
  //   (2) quét mọi [role=button] có text "Chỉnh sửa"/"Edit" khớp nút "Chỉnh sửa" của bộ chọn đối
  //       tượng ("Công khai · Chỉnh sửa") — cũng có sẵn trước khi gắn media.
  //   (`[data-testid*="media"]` cũng bỏ — dễ khớp NÚT "Ảnh/video" thêm media, không phải media đã gắn.)
  // Chỉ giữ tín hiệu CHẮC CHẮN chỉ xuất hiện SAU khi media thật đã đính: thẻ <video>, ảnh preview
  // dạng blob: (object URL cục bộ của file vừa chọn — khác avatar https/scontent), và nút GỠ media
  // đính kèm (aria-label Xóa/Gỡ/Remove — luôn nằm cạnh mỗi ảnh/video đã gắn).
  //
  // 2026-07-22 (v1.0.297) — tách thành ĐẾM thay vì chỉ có/không: xem chú thích `minCount` ở
  // waitForMediaPreview(). Mỗi media đã gắn cho ra ~1 preview (blob img / <video> / div
  // background-image blob:) VÀ ~1 nút Gỡ, nên lấy max của 2 cách đếm thay vì cộng (cộng sẽ đếm
  // đôi mỗi item, làm vòng chờ thoát sớm — đúng loại lỗi đang đi vá).
  mediaPreviewCount(scope) {
    let blobs = scope.querySelectorAll('video, img[src^="blob:"], img[src*="blob:"]').length;
    for (const el of scope.querySelectorAll('div[style*="background-image"]')) {
      if ((el.getAttribute('style') || '').includes('blob:')) blobs += 1;
    }
    const removers = scope.querySelectorAll(
      '[aria-label*="Remove"], [aria-label*="Xóa"], [aria-label*="Gỡ"]',
    ).length;
    return Math.max(blobs, removers);
  },

  mediaPreviewInScope(scope) {
    return this.mediaPreviewCount(scope) > 0;
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

    const expected = this.parseJoinsCountFromHeader();
    let prevCount = 0;
    let stableRounds = 0;

    for (let round = 0; round < 35; round += 1) {
      const scrollables = [
        document.querySelector('[role="main"]'),
        document.querySelector('[role="feed"]'),
        document.scrollingElement,
        document.body,
      ].filter(Boolean);

      scrollables.forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
      window.scrollTo(0, document.body.scrollHeight);
      await this.sleep(650);

      const groups = this.mergeGroupSources({ joinedOnly: true });
      const n = groups.length;

      if (expected && n >= expected) return groups;
      if (n === prevCount) {
        stableRounds += 1;
        if (stableRounds >= 4 && round > 6) return groups;
      } else {
        stableRounds = 0;
        prevCount = n;
      }
    }

    return this.mergeGroupSources({ joinedOnly: true });
  },

  base64ToBlob(base64, mime = 'image/png') {
    const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
    const bin = atob(raw);
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

  async findFileInputInScope(scope, isVideo) {
    const sel = isVideo
      ? 'input[type="file"][accept*="video"], input[type="file"][accept*="image"]'
      : 'input[type="file"][accept*="image"], input[type="file"]';
    const inputs = [...(scope || document).querySelectorAll(sel)];
    return inputs[inputs.length - 1] || null;
  },

  async clickPhotoVideoButton(scope) {
    const root = scope || document;
    const byAria = root.querySelector('div[aria-label="Photo/video"][role="button"]')
      || root.querySelector('div[aria-label="Ảnh/video"][role="button"]');
    if (byAria?.offsetParent) {
      byAria.click();
      return true;
    }
    const btn = [...root.querySelectorAll('[role="button"], div[tabindex="0"]')].find((el) => {
      if (!el.offsetParent) return false;
      const l = (el.getAttribute('aria-label') || '').toLowerCase();
      if (/live|story|reel|camera|messenger/.test(l)) return false;
      return /photo|video|ảnh|hình/.test(l);
    });
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  },

  async attachMedia(fileBlob, lang, filename = 'groupflow.png', { expectCount = 0 } = {}) {
    const isVideo = (fileBlob.type || '').startsWith('video/');
    const editor = document.querySelector('[role="dialog"] div[data-lexical-editor="true"], [role="dialog"] div[role="textbox"][contenteditable="true"]');
    const dialog = document.querySelector('[role="dialog"]');
    const scope = dialog || editor?.closest('[role="dialog"]') || document;

    let input = await this.findFileInputInScope(scope, isVideo);
    if (!input) {
      const photoBtn = this.qs(gfPickSelector(lang, 'photoBtn'), scope);
      if (photoBtn) photoBtn.click();
      else await this.clickPhotoVideoButton(scope);
      await this.sleep(900);
      input = await this.findFileInputInScope(scope, isVideo)
        || await this.findFileInputInScope(document, isVideo);
    }
    if (!input) {
      await this.clickPhotoVideoButton(document);
      await this.sleep(1200);
      input = await this.findFileInputInScope(document, isVideo);
    }
    if (!input) {
      throw new Error('Không tìm thấy nút Ảnh/video — mở composer nhóm, F5 trang FB rồi thử lại');
    }

    // Chụp số media ĐANG có TRƯỚC khi gắn — mốc để biết file này có thật sự vào composer không
    // (ảnh thứ 2..N: composer vốn đã có preview của ảnh trước, không thể dùng "có preview" làm dấu).
    const baseCount = this.mediaPreviewCountNow();
    const wantCount = Math.max(expectCount || 0, baseCount + 1);

    const dt = new DataTransfer();
    dt.items.add(new File([fileBlob], filename, { type: fileBlob.type || 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Bug đã gặp: dispatch 'click' giả lập trên input file — trình duyệt (Cốc Cốc/Chrome) chặn
    // cứng việc mở hộp thoại chọn file bằng script (không phải người dùng bấm thật), nên dòng này
    // LUÔN LUÔN ném "File chooser dialog can only be shown with a user activation" (100% mọi lần
    // gắn ảnh) — dù được try/catch bắt nên không phá gì (file đã gắn đúng cách ở trên rồi), nó chỉ
    // làm rác Log lỗi của extension, gây nhiễu khi tìm lỗi thật. Bỏ hẳn — không có tác dụng gì.

    const previewOk = await this.waitForMediaPreview(isVideo ? 120000 : 60000, wantCount);
    // v1.0.294 — ẢNH timeout cũng NÉM lỗi (trước đây chỉ video ném; ảnh cứ đăng tiếp) — nếu ảnh
    // thật sự chưa gắn (preview không hiện) mà vẫn gõ chữ + bấm Đăng thì bài lên KHÔNG có ảnh. Thà
    // huỷ lượt đăng này (retry sau) còn hơn đăng bài mất ảnh. Huỷ ở đây là an toàn: chưa hề submit,
    // nên không tạo bài trùng — postToGroupClassic() ném lên trên, runPostMatrix() bắt theo từng
    // nhóm rồi đánh 'fail', không đăng gì cả.
    if (!previewOk) {
      if (isVideo) throw new Error('Video chưa hiện preview — đợi thêm hoặc thử file nhỏ hơn');
      throw new Error(wantCount > 1
        ? `Ảnh thứ ${wantCount} chưa vào composer (mới thấy ${this.mediaPreviewCountNow()}/${wantCount}) — huỷ để tránh đăng thiếu ảnh; thử lại`
        : 'Ảnh chưa hiện preview trong composer — huỷ để tránh đăng bài mất ảnh; thử lại');
    }
    await this.sleep(isVideo ? 3000 : 1500);
  },

  async attachImage(fileBlob, lang) {
    return this.attachMedia(fileBlob, lang, 'groupflow.png');
  },

  async submitPost(lang, editorHint = null) {
    let editor = editorHint;
    if (!editor) {
      const dialog = document.querySelector('[role="dialog"]');
      editor = dialog && this.findComposerInRoot(dialog);
    }
    if (!editor) {
      try {
        editor = await this.findComposerEditor(4000);
      } catch { /* ignore */ }
    }
    await this.finalizeComposerForSubmit(editor, lang);

    const waitPing = () => {
      this.gfProgress('classic-submit', 'Cổ điển: chờ nút Đăng sáng…', '');
    };

    let btn = null;
    for (let attempt = 0; attempt < 8 && !btn; attempt += 1) {
      btn = await this.waitForSubmitButton(lang, attempt === 0 ? 45000 : 6000, { onWait: waitPing }).catch(() => null);
      if (btn && this.isDisabledBtn(btn)) {
        await this.finalizeComposerForSubmit(editor, lang);
        await this.sleep(1500);
        btn = null;
      }
    }
    if (!btn) throw new Error('Không tìm thấy nút Đăng — kiểm tra composer trên FB (nội dung đã paste chưa?)');

    this.capturedPostId = null;
    btn.scrollIntoView({ block: 'center' });
    btn.click();

    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      await this.sleep(1200);
      const errEl = [...document.querySelectorAll('[role="alert"], [role="dialog"] span, [role="dialog"] div')]
        .find((el) => /couldn't be posted|không thể đăng|đăng thất bại|failed to post|không đăng được/i.test(el.textContent || ''));
      if (errEl?.offsetParent) {
        throw new Error(`Facebook từ chối: ${errEl.textContent.trim().slice(0, 120)}`);
      }
      if (this.capturedPostId) break;
      if (this.composerDialogGone()) {
        await this.dismissPostSuccessDialogs();
        if (this.isMediaUploading()) {
          await this.sleep(2000);
          continue;
        }
        await this.sleep(1500);
        break;
      }
    }

    if (!this.capturedPostId) {
      const link = this.qs('a[href*="/posts/"], a[href*="permalink"]');
      const m = link?.href?.match(/(\d{8,})/);
      if (m) this.capturedPostId = m[1];
    }

    if (!this.capturedPostId) {
      const pending = [...document.querySelectorAll('[role="alert"]')]
        .find((el) => /chờ duyệt|pending|admin duyệt/i.test(el.textContent || ''));
      if (pending) {
        return { postId: 'pending', status: 'pending_approval', warning: 'Đã gửi — chờ admin duyệt' };
      }
    }

    if (this.capturedPostId) return { postId: this.capturedPostId, status: 'posted' };

    if (this.composerDialogGone()) {
      return {
        postId: 'uncertain',
        status: 'posted_uncertain',
        warning: 'Composer đã đóng — bài có thể đã lên, mở nhóm FB kiểm tra',
      };
    }

    throw new Error('Không xác nhận được bài đã đăng — kiểm tra nhóm trên FB (composer vẫn mở)');
  },

  gfProgress(phase, snippet, group) {
    gfSafeSendMessage({
      type: 'GF_PROGRESS',
      data: { phase, snippet, group },
    });
  },

  resolveClassicHtml({ text, variationDeltas, variationKey }) {
    const TF = globalThis.GF?.textFormat;
    const key = variationKey || 'A';
    const delta = variationDeltas?.[key] || variationDeltas?.A;
    if (delta && TF?.deltaToHtml) {
      const html = TF.deltaToHtml(delta);
      if (html) return html;
    }
    if (TF?.markdownToHtml && TF.hasMarkdown?.(text)) {
      return TF.markdownToHtml(text);
    }
    return null;
  },

  async postToGroupClassic({
    groupId, text, imageBase64, images, videoBase64, mediaMime, lang, actorId,
    variationDeltas, variationKey, classicTextMode,
  }) {
    window.__gfAbortPost = false;
    this.checkAborted();
    await this.ensureOnGroupPage(groupId);
    if (!location.href.includes(`/groups/${groupId}`)) {
      throw new Error(`Không mở được trang nhóm ${groupId} — F5 facebook.com rồi thử Cổ điển lại`);
    }
    this.hookPostIdCapture();
    if (actorId) {
      const cur = GF.fbActor?.getActiveActorId?.();
      if (cur && String(cur) !== String(actorId)) {
        this.gfProgress('classic-actor', `Actor tab (${cur}) ≠ job (${actorId}) — dùng profile đang mở trên tab`, groupId);
      }
    }
    this.gfProgress('classic-composer', 'Cổ điển: mở ô soạn bài…', groupId);
    let textbox = this.assertComposerEditor(await this.openComposer(lang, groupId), 'openComposer');

    const PM = globalThis.GF?.postMedia;
    const imgList = images?.length
      ? images
      : (PM?.getPostImages?.({ imageBase64, mediaMime }) || (imageBase64 ? [{ base64: imageBase64, mime: mediaMime }] : []));

    if (videoBase64) {
      const mime = mediaMime || 'video/mp4';
      const ext = mime.includes('quicktime') ? 'mov' : mime.split('/')[1] || 'mp4';
      this.gfProgress('classic-media', 'Cổ điển: gắn video…', groupId);
      await this.attachMedia(this.base64ToBlob(videoBase64, mime), lang, `groupflow.${ext}`);
    } else if (imgList.length) {
      this.gfProgress('classic-media', `Cổ điển: gắn ${imgList.length} ảnh…`, groupId);
      for (let i = 0; i < imgList.length; i += 1) {
        const img = imgList[i];
        const mime = img.mime || 'image/png';
        const ext = mime.includes('jpeg') ? 'jpg' : mime.split('/')[1] || 'png';
        if (imgList.length > 1) {
          this.gfProgress('classic-media', `Cổ điển: gắn ảnh ${i + 1}/${imgList.length}…`, groupId);
        }
        await this.attachMedia(
          this.base64ToBlob(img.base64, mime), lang, `groupflow-${Date.now()}.${ext}`,
          { expectCount: i + 1 },
        );
        if (imgList.length > 1) await this.sleep(800);
      }
    }

    if (imgList.length || videoBase64) {
      this.gfProgress('classic-text', 'Cổ điển: gõ chữ (giữ emoji & đậm)…', groupId);
      textbox = await this.refocusComposerEditor(textbox);
      await this.sleep(600);
    }

    const textHtml = this.resolveClassicHtml({ text, variationDeltas, variationKey });
    const mode = classicTextMode === 'paste' ? 'paste' : 'hybrid';
    const pastePlain = String(text || '').trim();
    await this.injectRichText(textbox, { text, html: textHtml, classicTextMode: mode });
    let activeBox = await this.finalizeComposerForSubmit(textbox, lang);
    if (activeBox && activeBox !== textbox) {
      this.gfProgress('classic-text', 'Cổ điển: chuyển sang dialog — paste lại…', groupId);
      await this.injectRichText(activeBox, { text, html: textHtml, classicTextMode: mode });
      activeBox = await this.finalizeComposerForSubmit(activeBox, lang);
    }
    if (pastePlain && !this.composerHasText(activeBox || textbox, pastePlain)) {
      this.gfProgress('classic-text', 'Cổ điển: chèn lại nội dung (paste)…', groupId);
      const box = activeBox || textbox;
      await this.injectRichText(box, { text, html: textHtml, classicTextMode: 'paste' });
      activeBox = await this.finalizeComposerForSubmit(box, lang);
    }

    // v1.0.297 — CHỐT CHẶN CUỐI trước khi bấm Đăng. Giữa lúc gắn media xong và lúc submit còn 3
    // bước có thể làm rơi media mà không ai kiểm lại: refocusComposerEditor() (FB render lại
    // dialog), finalizeComposerForSubmit() (có nhánh `el.click()` mở SANG dialog khác —
    // postToGroupClassic bên dưới thậm chí có sẵn nhánh "chuyển sang dialog — paste lại", tức
    // chuyện đổi composer là có thật), và vòng paste lại nội dung. Media gắn ở composer CŨ không
    // đi theo sang composer mới ⇒ bài lên chỉ có chữ, im lặng. Kiểm lại ngay trước cú click là chỗ
    // rẻ nhất và chắc nhất; huỷ ở đây vẫn an toàn (chưa submit ⇒ không thể trùng bài).
    if (imgList.length || videoBase64) {
      const wanted = videoBase64 ? 1 : imgList.length;
      const seen = this.mediaPreviewCountNow();
      if (seen < wanted) {
        throw new Error(seen === 0
          ? 'Media rơi khỏi composer trước khi Đăng (FB render lại ô soạn) — huỷ để không đăng bài mất media; thử lại'
          : `Composer chỉ còn ${seen}/${wanted} media trước khi Đăng — huỷ để không đăng thiếu; thử lại`);
      }
    }

    this.gfProgress('classic-submit', 'Cổ điển: bấm Đăng…', groupId);
    const submitRes = await this.submitPost(lang, activeBox || textbox);
    this.clearClassicPrepareCache();
    if (typeof submitRes === 'object') {
      return { ...submitRes, groupId, mode: 'classic' };
    }
    return { postId: submitRes, groupId, mode: 'classic' };
  },

  async postToGroup({
    groupId, text, imageBase64, images, videoBase64, mediaMime, mediaType, lang, postMode, actorId,
    variationDeltas, variationKey, classicTextMode,
  }) {
    return this.postToGroupClassic({
      groupId, text, imageBase64, images, videoBase64, mediaMime, lang, actorId,
      variationDeltas, variationKey,
      classicTextMode: classicTextMode === 'paste' ? 'paste' : 'hybrid',
    });
  },

  async commentOnPost({ groupId, postId, text, lang }) {
    const url = `https://www.facebook.com/groups/${groupId}/posts/${postId}`;
    if (!location.href.includes(`/groups/${groupId}/posts/${postId}`)) {
      throw new Error('Tab chưa ở đúng bài — thử lại');
    }
    this.checkAborted();
    const boxSel = gfPickSelector(lang, 'commentBox');
    const box = await this.waitFor(boxSel);
    this.checkAborted();
    await this.injectText(box, text);
    this.checkAborted();
    await this.sleep(500);
    const submit = this.qsa(gfPickSelector(lang, 'commentSubmit')).find((el) => el.offsetParent);
    if (submit) {
      submit.click();
    } else {
      // Không phải lúc nào FB cũng render nút gửi riêng (kể cả khi đang hiện, selector có thể
      // không khớp) — Enter là cách chuẩn FB dùng để gửi 1 bình luận (khác Enter trong composer bài
      // viết chính, ở đây không có phím tắt xuống dòng riêng nên Enter luôn có nghĩa là gửi).
      box.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
      }));
      box.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
      }));
    }
    await this.sleep(2000);
    // Bug thật đã báo cáo: trước đây return {ok:true} VÔ ĐIỀU KIỆN dù không tìm thấy nút gửi (không
    // click gì) hoặc click/Enter không có tác dụng thật (FB chặn ngầm, sai selector, mất focus...)
    // — chữ vẫn nằm nguyên trong ô, nhưng Log vẫn ghi "OK" như đã gửi thành công. Xác nhận đã gửi
    // thật bằng cách ô phải rỗng lại (FB luôn tự xóa sạch ô soạn bình luận sau khi đăng thành công,
    // dù gửi qua nút hay Enter) — còn chữ sau khi chờ thêm nghĩa là gửi thất bại, không được báo OK.
    if (this.composerTextLength(box) > 0) {
      await this.sleep(1500);
      if (this.composerTextLength(box) > 0) {
        throw new Error('Gửi bình luận không thành công — ô soạn bài vẫn còn chữ sau khi gửi');
      }
    }
    return { ok: true };
  },

  scanFeedPosts(keywords) {
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
      const authorLink = article.querySelector('a[href*="/user/"], a[href*="profile.php?id="], a[href*="/groups/"][href*="/user/"]');
      matched.push({
        id: `lead-${groupId}-${postId}-${Date.now()}`,
        group_id: groupId,
        post_id: postId,
        post_url: link?.href || '',
        author_name: authorLink?.innerText?.trim() || '',
        snippet: text.slice(0, 200),
        matched_keywords: kw,
        found_at: new Date().toISOString(),
        status: 'new',
      });
    });
    return matched;
  },
};

if (!globalThis.GF_CONTENT) {
  globalThis.GF_CONTENT = GF_CONTENT;
}

if (location.hostname.includes('facebook.com') && location.pathname.includes('/groups')) {
  globalThis.GF_CONTENT.hookGroupCapture();
  globalThis.GF_CONTENT.reportDocIdsFromHtml(document.documentElement.innerHTML);
}

const GF_BRIDGE_VERSION = globalThis.__gfBridgeVersion || 9;
globalThis.__gfBridgeVersion = GF_BRIDGE_VERSION;

// chrome.runtime.sendMessage() ném lỗi ĐỒNG BỘ ("Extension context invalidated") ngay tại lời gọi
// — không phải reject bất đồng bộ — mỗi khi extension bị reload/update (qua chrome://extensions,
// hoặc tự động update) trong lúc content script cũ vẫn còn sống trên tab FB đang mở. `.catch(() =>
// {})` KHÔNG bắt được kiểu lỗi này (exception ném ra trước khi kịp trả về Promise để gắn .catch)
// — đây là nguyên nhân "Uncaught Error: Extension context invalidated" xuất hiện trong Tiện ích →
// Lỗi mỗi lần reload extension trong lúc dev/test. Không phải bug chức năng (tab FB cũ chỉ cần F5
// lại là hết), nhưng gói hàm này lại 1 chỗ để mọi lời gọi trong content script đều an toàn — vừa
// bớt rác trong log lỗi, vừa phòng trường hợp thật (extension tự auto-update trong lúc user đang
// mở sẵn tab FB nền, không phải chỉ lúc dev).
function gfSafeSendMessage(msg) {
  try {
    return chrome.runtime.sendMessage(msg).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

function showGfRadarToast(count, snippet) {
  try {
    const id = 'gf-radar-toast';
    document.getElementById(id)?.remove();
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#1877F2;'
      + 'color:#fff;padding:12px 16px;border-radius:8px;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;'
      + 'max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;';
    el.innerHTML = `<strong>📡 Radar: ${count > 1 ? `${count} lead mới` : 'Lead mới'}</strong>`
      + (snippet ? `<div style="margin-top:4px;opacity:.9">${String(snippet).slice(0, 100)}</div>` : '');
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  } catch (e) { /* trang FB có CSP chặn — bỏ qua, không chặn quét */ }
}

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
      if (msg.type === 'GF_GET_JOINS_COUNT') {
        const count = C.parseJoinsCountFromHeader?.() ?? null;
        return sendResponse({ count });
      }
      if (msg.type === 'GF_ABORT_POST') {
        window.__gfAbortPost = true;
        return sendResponse({ ok: true });
      }
      if (msg.type === 'GF_PREPARE_CLASSIC_POST') {
        await C.prepareClassicPost(msg.groupId);
        const gid = String(msg.groupId || '');
        const triggers = C.findGroupPostTriggers('vi', gid);
        const btn = C.findCreatePostButton(gid);
        const inline = C.findComposerInRoot(document.querySelector('[role="main"]') || document);
        const ready = triggers.length > 0 || Boolean(btn) || Boolean(inline) || Boolean(C.findOpenComposerEditor());
        if (!ready) {
          const ui = await C.waitForGroupComposerUi(msg.groupId, 'vi', 14000);
          return sendResponse({ ok: true, ready: ui.ready });
        }
        return sendResponse({ ok: true, ready: true });
      }
      if (msg.type === 'GF_POST') {
        window.__gfAbortPost = false;
        C.lang = msg.lang || 'vi';
        let postMsg = { ...msg };
        if (postMsg.mediaFromBg && postMsg.queuePostId) {
          const pack = await gfSafeSendMessage({
            type: 'GF_GET_POST_MEDIA',
            postId: postMsg.queuePostId,
          });
          if (pack?.videoBase64) {
            postMsg.videoBase64 = pack.videoBase64;
            postMsg.mediaMime = pack.mediaMime;
            postMsg.mediaType = 'video';
          } else if (pack?.images?.length) {
            postMsg.images = pack.images;
            postMsg.imageBase64 = pack.imageBase64 || pack.images[0]?.base64;
            postMsg.mediaMime = pack.mediaMime;
            postMsg.mediaType = 'image';
          } else if (pack?.imageBase64) {
            postMsg.imageBase64 = pack.imageBase64;
            postMsg.mediaMime = pack.mediaMime;
            postMsg.mediaType = 'image';
          } else if (postMsg.mediaFromBg) {
            throw new Error('Ảnh chưa load từ extension — Sửa bài, gắn lại ảnh');
          }
        }
        const result = await C.postToGroup(postMsg);
        gfSafeSendMessage({
          type: 'GF_LEARN_GROUP_META',
          groupId: msg.groupId,
          res: result,
        });
        return sendResponse({ ok: true, ...result });
      }
      if (msg.type === 'GF_COMMENT') {
        window.__gfAbortPost = false;
        C.lang = msg.lang || 'vi';
        await C.commentOnPost(msg);
        return sendResponse({ ok: true });
      }
      if (msg.type === 'GF_SCAN_FEED') {
        const keywords = (msg.keywordsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        const leads = C.scanFeedPosts(keywords);
        return sendResponse({ leads });
      }
      if (msg.type === 'GF_RADAR_TOAST') {
        showGfRadarToast(msg.count, msg.snippet);
        return sendResponse({ ok: true });
      }
      sendResponse({ error: `Message không hỗ trợ: ${msg.type}` });
    } catch (e) {
      gfSafeSendMessage({
        type: 'GF_PROGRESS',
        data: {
          phase: 'error',
          error: e.message,
          snippet: e.message,
          group: msg.groupName || msg.groupId,
        },
      });
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
