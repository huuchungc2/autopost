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
    chrome.runtime.sendMessage({ type: 'GF_SAVE_GRAPHQL_DOC_IDS', docIds }).catch(() => {});
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
          chrome.runtime.sendMessage({ type: 'GF_APPLY_GROUP_META', groups }).catch(() => {});
        }
      }

      const GP = GF.groupParse;
      if (GP?.findAboutDocIdsInHtml) {
        const docIds = GP.findAboutDocIdsInHtml(text);
        if (Object.keys(docIds).length) {
          chrome.runtime.sendMessage({ type: 'GF_SAVE_GRAPHQL_DOC_IDS', docIds }).catch(() => {});
        }
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

  findCreatePostButton() {
    const phrases = [
      'write something', "what's on your mind", 'create a public post',
      'bạn viết gì', 'viết gì', 'đang nghĩ', 'tạo bài', 'đăng bài', 'bài viết',
      'bài viết công khai', 'viết bài', 'créer', 'publicación',
    ];
    const buttons = this.qsa('div[role="button"], span[role="button"], a[role="button"]')
      .filter((el) => el.offsetParent);
    for (const el of buttons) {
      if (el.closest('[role="article"]')) continue;
      const t = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
      if (phrases.some((p) => t.includes(p))) return el.closest('[role="button"]') || el;
    }
    const pagelets = this.qsa('[data-pagelet="GroupInlineComposer"], [data-pagelet="FeedComposer"], [data-pagelet="InlineComposer"], [data-pagelet*="Composer"]');
    for (const p of pagelets) {
      const btn = [...p.querySelectorAll('div[role="button"]')].find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 100 && r.height > 20 && b.textContent.trim();
      });
      if (btn) return btn;
    }
    return null;
  },

  async findComposerEditor(timeout = 15000) {
    const sel = "div[data-lexical-editor='true'], div.notranslate[contenteditable='true'], div[role='textbox'][contenteditable='true']";
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const candidates = this.qsa(sel).filter(isVisible).filter((el) => {
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        return !label.includes('comment') && !label.includes('bình luận') && !label.includes('search');
      });
      if (candidates.length) {
        candidates.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (rb.width * rb.height) - (ra.width * ra.height);
        });
        return candidates[0];
      }
      await this.sleep(200);
    }
    throw new Error('Không tìm thấy ô soạn bài (composer)');
  },

  async injectText(el, text) {
    const plain = String(text || '');
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.click();
    await this.sleep(300);

    let pasted = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', plain);
      dt.setData('text/html', plain);
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      el.dispatchEvent(ev);
      pasted = (el.innerText || el.textContent || '').trim().length > 0;
    } catch { /* ignore */ }

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

  async openComposer(lang) {
    try {
      const existing = await this.findComposerEditor(800);
      if (existing) return existing;
    } catch { /* mở modal */ }

    const triggerSel = gfPickSelector(lang, 'postTrigger');
    let trigger = this.qsa(triggerSel.split(',').map((s) => s.trim()).join(','))
      .find((el) => el.offsetParent);
    if (!trigger) trigger = this.findCreatePostButton();
    if (!trigger) throw new Error('Không tìm thấy nút tạo bài — mở trang nhóm FB rồi thử lại');
    trigger.scrollIntoView({ block: 'center' });
    trigger.click();
    await this.sleep(1200);
    return this.findComposerEditor();
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
    const dialog = document.querySelector('[role="dialog"]');
    const scope = dialog || document;
    const labels = ['đăng', 'post', 'publish', 'đăng bài', 'publier', 'publicar'];
    let btn = [...scope.querySelectorAll('div[role="button"], button')].find((el) => {
      if (!el.offsetParent) return false;
      const t = (el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (['x', 'đóng', 'close', 'cancel', 'hủy', 'huỷ'].includes(t)) return false;
      return labels.some((l) => t === l || t.includes(l));
    });
    if (!btn) btn = this.qs(gfPickSelector(lang, 'postBtn'));
    if (!btn) throw new Error('Không tìm thấy nút Đăng');

    this.capturedPostId = null;
    btn.click();

    for (let i = 0; i < 25; i += 1) {
      await this.sleep(2000);
      const errEl = [...document.querySelectorAll('[role="alert"], [role="dialog"] span, [role="dialog"] div')]
        .find((el) => /couldn't be posted|không thể đăng|đăng thất bại|failed to post|không đăng được/i.test(el.textContent || ''));
      if (errEl?.offsetParent) {
        throw new Error(`Facebook từ chối: ${errEl.textContent.trim().slice(0, 120)}`);
      }
      if (!document.querySelector('[role="dialog"] div[contenteditable="true"]')) break;
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
      throw new Error('Không xác nhận được bài đã đăng — kiểm tra nhóm trên FB');
    }
    return this.capturedPostId;
  },

  gfProgress(phase, snippet, group) {
    chrome.runtime.sendMessage({
      type: 'GF_PROGRESS',
      data: { phase, snippet, group },
    }).catch(() => {});
  },

  async postToGroupClassic({ groupId, text, imageBase64, images, videoBase64, mediaMime, lang, actorId }) {
    if (!location.href.includes(`/groups/${groupId}`)) {
      throw new Error(`Tab chưa ở nhóm ${groupId} — thử lại`);
    }
    await this.ensureActor(actorId);
    this.hookPostIdCapture();
    this.gfProgress('classic-composer', 'Cổ điển: mở ô soạn bài…', groupId);
    const textbox = await this.openComposer(lang);
    await this.injectText(textbox, text);
    if (videoBase64) {
      const mime = mediaMime || 'video/mp4';
      const ext = mime.includes('quicktime') ? 'mov' : mime.split('/')[1] || 'mp4';
      await this.attachMedia(this.base64ToBlob(videoBase64, mime), lang, `groupflow.${ext}`);
    } else {
      const PM = globalThis.GF?.postMedia;
      const imgList = images?.length
        ? images
        : (PM?.getPostImages?.({ imageBase64, mediaMime }) || (imageBase64 ? [{ base64: imageBase64, mime: mediaMime }] : []));
      for (const img of imgList) {
        const mime = img.mime || 'image/png';
        const ext = mime.includes('jpeg') ? 'jpg' : mime.split('/')[1] || 'png';
        await this.attachMedia(this.base64ToBlob(img.base64, mime), lang, `groupflow-${Date.now()}.${ext}`);
        if (imgList.length > 1) await this.sleep(500);
      }
    }
    this.gfProgress('classic-submit', 'Cổ điển: bấm Đăng…', groupId);
    const submitRes = await this.submitPost(lang);
    if (typeof submitRes === 'object') {
      return { ...submitRes, groupId, mode: 'classic' };
    }
    return { postId: submitRes, groupId, mode: 'classic' };
  },

  async postToGroup({ groupId, text, imageBase64, images, videoBase64, mediaMime, mediaType, lang, postMode, actorId }) {
    const hasVideo = mediaType === 'video' || Boolean(videoBase64);
    const mode = hasVideo ? 'classic' : (postMode === 'classic' ? 'classic' : 'fast');
    if (mode === 'fast' && GF.fbGraphApi) {
      try {
        return await GF.fbGraphApi.postToGroup({ groupId, text, imageBase64, images, actorId });
      } catch (e) {
        throw new Error(e.message || 'Đăng Nhanh thất bại');
      }
    }
    return this.postToGroupClassic({ groupId, text, imageBase64, images, videoBase64, mediaMime, lang, actorId });
  },

  async commentOnPost({ groupId, postId, text, lang }) {
    const url = `https://www.facebook.com/groups/${groupId}/posts/${postId}`;
    if (!location.href.includes(`/groups/${groupId}/posts/${postId}`)) {
      throw new Error('Tab chưa ở đúng bài — thử lại');
    }
    const boxSel = gfPickSelector(lang, 'commentBox');
    const box = await this.waitFor(boxSel);
    await this.injectText(box, text);
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

if (!globalThis.GF_CONTENT) {
  globalThis.GF_CONTENT = GF_CONTENT;
}

if (location.hostname.includes('facebook.com') && location.pathname.includes('/groups')) {
  globalThis.GF_CONTENT.hookGroupCapture();
  globalThis.GF_CONTENT.reportDocIdsFromHtml(document.documentElement.innerHTML);
}

const GF_BRIDGE_VERSION = globalThis.__gfBridgeVersion || 5;
globalThis.__gfBridgeVersion = GF_BRIDGE_VERSION;

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
      if (msg.type === 'GF_POST') {
        C.lang = msg.lang || 'vi';
        const result = await C.postToGroup(msg);
        chrome.runtime.sendMessage({
          type: 'GF_LEARN_GROUP_META',
          groupId: msg.groupId,
          res: result,
        }).catch(() => {});
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
