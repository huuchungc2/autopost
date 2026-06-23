const GF_CONTENT = {
  lang: 'vi',
  capturedPostId: null,

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
    const map = new Map();
    document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const m = a.href.match(/\/groups\/(\d+)/);
      if (!m) return;
      const id = m[1];
      const name = (a.textContent || a.getAttribute('aria-label') || '').trim();
      if (!name || name.length < 2) return;
      if (!map.has(id)) map.set(id, { id, name, href: a.href });
    });
    return [...map.values()];
  },

  getFbUser() {
    const scripts = [...document.querySelectorAll('script')];
    for (const s of scripts) {
      const t = s.textContent || '';
      const m = t.match(/"USER_ID":"(\d+)"/) || t.match(/"actorID":(\d+)/);
      if (m) return { id: m[1], name: document.title.split('|')[0]?.trim() || 'FB User' };
    }
    const meta = document.querySelector('meta[property="al:ios:url"]');
    if (meta?.content) {
      const id = meta.content.match(/(\d+)/)?.[1];
      if (id) return { id, name: 'FB User' };
    }
    return null;
  },

  async scrollSidebar(maxRounds = 8) {
    const aside = document.querySelector('[role="navigation"]') || document.body;
    for (let i = 0; i < maxRounds; i += 1) {
      aside.scrollTop = aside.scrollHeight;
      await this.sleep(600);
    }
  },

  async extractAllGroups() {
    if (location.pathname.includes('/groups')) {
      await this.scrollSidebar();
    }
    return this.extractGroups();
  },

  base64ToBlob(base64) {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'image/png' });
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
    if (window.__gfHooked) return;
    window.__gfHooked = true;
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      try {
        const clone = res.clone();
        const text = await clone.text();
        const m = text.match(/"legacy_story_id":"(\d+)"/) || text.match(/"post_id":"(\d+)"/);
        if (m) this.capturedPostId = m[1];
      } catch { /* ignore */ }
      return res;
    };
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

  async attachImage(fileBlob, lang) {
    const photoBtn = this.qs(gfPickSelector(lang, 'photoBtn'));
    if (photoBtn) photoBtn.click();
    await this.sleep(500);
    const input = this.qs(gfPickSelector(lang, 'fileInput'));
    if (!input) throw new Error('Không tìm thấy input upload ảnh');
    const dt = new DataTransfer();
    dt.items.add(new File([fileBlob], 'groupflow.png', { type: fileBlob.type || 'image/png' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await this.sleep(2000);
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

  async postToGroup({ groupId, text, imageBase64, lang }) {
    this.hookPostIdCapture();
    if (!location.href.includes(`/groups/${groupId}`)) {
      location.href = `https://www.facebook.com/groups/${groupId}`;
      await this.sleep(3500);
    }
    const textbox = await this.openComposer(lang);
    this.injectText(textbox, text);
    if (imageBase64) {
      await this.attachImage(this.base64ToBlob(imageBase64), lang);
    }
    const postId = await this.submitPost(lang);
    return { postId, groupId };
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'GF_PING') return sendResponse({ ok: true });
      if (msg.type === 'GF_GET_FB_USER') return sendResponse({ user: GF_CONTENT.getFbUser() });
      if (msg.type === 'GF_EXTRACT_GROUPS') {
        const groups = await GF_CONTENT.extractAllGroups();
        return sendResponse({ groups });
      }
      if (msg.type === 'GF_POST') {
        GF_CONTENT.lang = msg.lang || 'vi';
        const result = await GF_CONTENT.postToGroup(msg);
        return sendResponse({ ok: true, ...result });
      }
      if (msg.type === 'GF_COMMENT') {
        GF_CONTENT.lang = msg.lang || 'vi';
        await GF_CONTENT.commentOnPost(msg);
        return sendResponse({ ok: true });
      }
      if (msg.type === 'GF_SCAN_FEED') {
        const keywords = (msg.keywordsText || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        const leads = GF_CONTENT.scanFeedPosts(keywords, msg.since);
        return sendResponse({ leads });
      }
      sendResponse({ error: 'Unknown message' });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
