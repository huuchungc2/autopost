/* AUTO-GENERATED — chạy: node build-sw-bundle.js */

// ----- gfShared.js -----
(function () {
/** Shared GF namespace — dùng trong SW bundle (IIFE) và content script. */
globalThis.GF = globalThis.GF || {};
})();

// ----- postMedia.js -----
(function () {
const PM = globalThis.GF.postMedia = {
  wantsAutoGenerate(post) {
    return post?.autoGenerateImage !== false;
  },

  needsImageGeneration(post) {
    if (!post) return false;
    if (post.imageBase64 || post.videoBase64) return false;
    if (!this.wantsAutoGenerate(post)) return false;
    return Boolean(String(post.prompt_anh || '').trim());
  },

  async generateImageDirect(prompt, apiKey, baseUrl) {
    const url = `${(baseUrl || 'https://tidien.xyz').replace(/\/$/, '')}/v1/images/generations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cx/gpt-5.5-image',
        prompt,
        n: 1,
        response_format: 'b64_json',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || data.error || 'Generate ảnh thất bại');
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('Không nhận được ảnh base64');
    return { base64: b64, mime: 'image/png' };
  },

  async generateImageViaProxy(prompt, settings) {
    const base = (settings.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
    const token = settings.tidienApiKey || settings.tidienToken;
    if (!token) throw new Error('Chưa đăng nhập tidien — mở Cài đặt');
    if (!settings.imageProviderId) {
      throw new Error('Chưa chọn Image provider trong Cài đặt extension');
    }
    const res = await fetch(`${base}/api/group-posts/ai/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider_id: settings.imageProviderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Generate ảnh thất bại');
    if (!data.base64) throw new Error('Không nhận được ảnh base64');
    return { base64: data.base64, mime: data.mime || 'image/png' };
  },

  async generateImage(prompt, settings) {
    if (settings?.imageProviderId && (settings.tidienApiKey || settings.tidienToken)) {
      return this.generateImageViaProxy(prompt, settings);
    }
    const apiKey = settings?.routerApiKey;
    if (!apiKey) {
      throw new Error('Chọn Image provider hoặc nhập 9Router API key trong Cài đặt');
    }
    return this.generateImageDirect(prompt, apiKey, settings.tidienBaseUrl);
  },

  applyImageToPost(post, img) {
    post.imageBase64 = img.base64;
    post.mediaType = 'image';
    post.mediaMime = img.mime || 'image/png';
    post.imageStatus = 'ready';
    post.imageLocal = true;
    return post;
  },

  async persistPost(post) {
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const idx = queue.findIndex((p) => p.id === post.id);
    if (idx >= 0) queue[idx] = { ...queue[idx], ...post };
    else queue.push(post);
    await chrome.storage.local.set({ postQueue: queue });
    return post;
  },

  async ensurePostMedia(post, settings) {
    if (!post) return post;
    if (post.imageBase64 || post.videoBase64) return post;
    if (!this.needsImageGeneration(post)) return post;

    post.imageStatus = 'generating';
    await this.persistPost(post);

    const img = await this.generateImage(String(post.prompt_anh).trim(), settings);
    this.applyImageToPost(post, img);
    await this.persistPost(post);
    return post;
  },
};
})();

// ----- groupParse.js -----
(function () {
/**
 * Parse danh sách nhóm đã tham gia từ HTML/GraphQL FB — chạy được cả service worker lẫn content script.
 */
const GP = globalThis.GF.groupParse = {
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

  isJoinedGroupChunk(chunk, { onJoinsPage = true } = {}) {
    const c = String(chunk).slice(0, 2500);
    if (/viewer_join_state":"NOT_MEMBER"|"is_viewer_member":false|GROUP_SUGGESTION|SUGGESTED_GROUP|recommended_groups|GroupsCometDiscover/i.test(c)) {
      return /viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true/i.test(c);
    }
    if (/viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true|has_membership":true/i.test(c)) {
      return true;
    }
    if (onJoinsPage) {
      return !/pending_invite|GROUP_INVITE|SUGGESTED|recommended/i.test(c);
    }
    return false;
  },

  upsert(map, id, name) {
    if (!id || !/^\d{5,}$/.test(String(id))) return;
    const n = String(name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    const gid = String(id);
    const entry = {
      id: gid,
      name: n,
      href: `https://www.facebook.com/groups/${gid}/`,
    };
    const existing = map.get(gid);
    if (!existing) {
      map.set(gid, entry);
      return;
    }
    if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(n)) {
      existing.name = n;
    } else if (!this.isFallbackGroupName(n) && n.length > existing.name.length) {
      existing.name = n;
    }
  },

  parseJoinedGroupsFromHtml(html, { onJoinsPage = true } = {}) {
    const map = new Map();
    if (!html || html.length < 200) return [];

    const joinedOnly = true;
    const typeNames = ['"__typename":"Group"', '"__typename":"XFBGroup"'];
    typeNames.forEach((marker) => {
      const chunks = html.split(marker);
      for (let i = 1; i < chunks.length; i += 1) {
        const chunk = chunks[i].slice(0, 1400);
        if (joinedOnly && !this.isJoinedGroupChunk(chunk, { onJoinsPage })) continue;
        const idM = chunk.match(/"id":"(\d+)"/);
        const nameM = chunk.match(/"name":"((?:[^"\\]|\\.)*)"/);
        if (idM && nameM) this.upsert(map, idM[1], this.decodeFbStr(nameM[1]));
      }
    });

    const urlNameRe = /"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)[^"]*"[\s\S]{0,500}?"name":"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = urlNameRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, { onJoinsPage })) continue;
      this.upsert(map, m[1], this.decodeFbStr(m[2]));
    }

    const nameUrlRe = /"name":"((?:[^"\\]|\\.)*)"[\s\S]{0,500}?"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)/g;
    while ((m = nameUrlRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, { onJoinsPage })) continue;
      this.upsert(map, m[2], this.decodeFbStr(m[1]));
    }

    const nodeRe = /"node"\s*:\s*\{[^}]*"__typename":"(?:Group|XFBGroup)"[^}]*"id":"(\d+)"[^}]*"name":"((?:[^"\\]|\\.)*)"/g;
    let nm;
    while ((nm = nodeRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, nm.index - 400), nm.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, { onJoinsPage })) continue;
      this.upsert(map, nm[1], this.decodeFbStr(nm[2]));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  parseJoinedGroupsFromText(text, { onJoinsPage = true } = {}) {
    if (!text || text.length < 80) return [];
    if (!/GroupsCometJoins|GroupsCometYourGroups|groups_tab_list|joined.*groups|your_groups|__typename":"Group"/i.test(text)) {
      return [];
    }
    return this.parseJoinedGroupsFromHtml(text, { onJoinsPage });
  },
};
})();

// ----- fbSessionBg.js -----
(function () {
/**
 * Session Facebook + GraphQL từ service worker (cookie Chrome, không cần tab FB).
 */
const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';

const S = globalThis.GF.fbSessionBg = {
  _cache: null,
  _cacheAt: 0,
  CACHE_MS: 5 * 60 * 1000,
  reqCounter: 1,

  async hasFbLogin() {
    try {
      const c = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
      return Boolean(c?.value);
    } catch {
      return false;
    }
  },

  stripFbJsonPrefix(text) {
    const raw = String(text || '').trim();
    if (raw.startsWith('for (;;);')) return raw.slice(9);
    return raw;
  },

  parseGraphqlJson(text) {
    const cleaned = this.stripFbJsonPrefix(text);
    const lines = cleaned.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.errors?.length) {
          throw new Error(json.errors[0]?.message || 'GraphQL lỗi');
        }
        return json;
      } catch (e) {
        if (e.message && !e.message.startsWith('Unexpected token')) throw e;
      }
    }
    return JSON.parse(cleaned);
  },

  parseSessionFromHtml(html) {
    const h = String(html || '');
    const uid = h.match(/"USER_ID":"(\d+)"/)?.[1]
      || h.match(/"userID":"(\d+)"/)?.[1]
      || null;
    const dtsg = h.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1]
      || h.match(/"DTSGInitialData",\{"token":"([^"]+)"/)?.[1]
      || h.match(/"dtsg":\{"token":"([^"]+)"/)?.[1]
      || null;
    const lsd = h.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1]
      || h.match(/"lsd":"([^"]+)"/)?.[1]
      || null;
    return {
      uid,
      personalId: uid,
      dtsg,
      lsd,
      jazoest: '25669',
      rev: h.match(/"client_revision":(\d+)/)?.[1] || '1007600000',
      hs: h.match(/"haste_session":"([^"]+)"/)?.[1] || null,
      spin_r: h.match(/"__spin_r":(\d+)/)?.[1] || null,
      spin_b: h.match(/"__spin_b":"([^"]+)"/)?.[1] || null,
      spin_t: h.match(/"__spin_t":(\d+)/)?.[1] || null,
    };
  },

  isLoginPage(html) {
    const h = String(html || '');
    if (h.includes('"USER_ID"') && !h.includes('id="login_form"')) return false;
    return /id="login_form"|href="\/login\/|Log in to Facebook|Đăng nhập Facebook/i.test(h);
  },

  isCheckpoint(html, url) {
    const h = String(html || '');
    return String(url || '').includes('/checkpoint/') || h.includes('action="/checkpoint/"');
  },

  async readActorCookies(preferredActorId) {
    const cUser = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
    const iUser = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'i_user' });
    const personalId = cUser?.value || null;
    const actingId = iUser?.value || null;
    const actorId = preferredActorId || actingId || personalId;
    return { personalId, actingId, actorId };
  },

  async fetchAuthHtml() {
    const urls = ['https://www.facebook.com/me', 'https://www.facebook.com/settings'];
    const headers = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    };
    let lastErr;
    for (const url of urls) {
      try {
        const res = await this.fetchWithRetry(url, { credentials: 'include', redirect: 'follow', headers });
        const html = await res.text();
        if (this.isCheckpoint(html, res.url)) {
          throw new Error('Facebook checkpoint — mở facebook.com xác minh tài khoản');
        }
        if (this.isLoginPage(html)) {
          throw new Error('Chưa đăng nhập Facebook trên Chrome');
        }
        if (res.ok && html.length > 500) return html;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Không lấy được session Facebook');
  },

  async resolveSession({ force = false, actorId: preferredActorId } = {}) {
    if (!force && this._cache && Date.now() - this._cacheAt < this.CACHE_MS) {
      const s = { ...this._cache };
      if (preferredActorId) s.actorId = String(preferredActorId);
      return s;
    }
    if (!(await this.hasFbLogin())) {
      throw new Error('Chưa đăng nhập Facebook trên Chrome');
    }
    const html = await this.fetchAuthHtml();
    const parsed = this.parseSessionFromHtml(html);
    const cookies = await this.readActorCookies(preferredActorId);
    const uid = parsed.uid || cookies.personalId;
    const actorId = preferredActorId || cookies.actorId || uid;
    if (!uid || !parsed.dtsg) {
      throw new Error('Thiếu token FB (fb_dtsg) — mở facebook.com một lần');
    }
    const session = {
      ...parsed,
      uid,
      personalId: cookies.personalId || uid,
      actorId: String(actorId),
      userId: String(actorId),
      fb_dtsg: parsed.dtsg,
    };
    this._cache = { ...session };
    this._cacheAt = Date.now();
    return session;
  },

  invalidateCache() {
    this._cache = null;
    this._cacheAt = 0;
  },

  buildGraphqlBody(session, friendlyName, docId, variables) {
    const apiUser = session.personalId || session.uid;
    const body = new URLSearchParams();
    body.set('av', session.actorId || session.uid);
    body.set('__user', apiUser);
    body.set('__a', '1');
    body.set('__comet_req', '15');
    body.set('__req', (this.reqCounter++).toString(36));
    if (session.rev) body.set('__rev', session.rev);
    if (session.hs) body.set('__hs', session.hs);
    body.set('fb_dtsg', session.dtsg || session.fb_dtsg);
    if (session.lsd) body.set('lsd', session.lsd);
    body.set('jazoest', session.jazoest || '25669');
    if (session.spin_r) body.set('__spin_r', session.spin_r);
    if (session.spin_b) body.set('__spin_b', session.spin_b);
    if (session.spin_t) body.set('__spin_t', session.spin_t);
    body.set('fb_api_caller_class', 'RelayModern');
    body.set('fb_api_req_friendly_name', friendlyName);
    body.set('variables', JSON.stringify(variables));
    body.set('doc_id', docId);
    body.set('server_timestamps', 'true');
    return body;
  },

  graphqlHeaders(session, friendlyName) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-ASBD-ID': '129477',
      'X-FB-Friendly-Name': friendlyName,
      Origin: 'https://www.facebook.com',
      Referer: 'https://www.facebook.com/',
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;
    return headers;
  },

  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i += 1) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 15000 + i * 5000));
          continue;
        }
        if (res.status >= 500 && i < retries - 1) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        return res;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw new Error('Fetch thất bại sau nhiều lần thử');
  },

  async graphqlRequest(session, friendlyName, docId, variables) {
    const body = this.buildGraphqlBody(session, friendlyName, docId, variables);
    const res = await this.fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: this.graphqlHeaders(session, friendlyName),
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = this.parseGraphqlJson(text);
    return { json, text };
  },
};
})();

// ----- postFormat.js -----
(function () {
/** FB colored post — preset map từ GPP worker (text_format_preset_id). */
const GF_GLOBAL = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : {};
GF_GLOBAL.GF = GF_GLOBAL.GF || {};

GF_GLOBAL.GF.postFormat = {
  PRESETS: {
    '#18191a': '0',
    '#e2013b': '1903718606535395',
    '#dc7a5a': '303063890126415',
    '#c600ff': '1060186232989955',
    '#5d3fda': '1777259169190672',
    '#0073ff': '1365883126823705',
    '#8395d1': '6524876100975152',
    '#33234b': '319468561816672',
    '#5d6374': '1227086461613922',
  },

  presetId(hex) {
    const key = String(hex || '#18191A').toLowerCase();
    return this.PRESETS[key] || '0';
  },

  buildComposedText(plainText) {
    const text = String(plainText || '');
    const blocks = text.split('\n');
    return {
      blocks,
      block_types: blocks.map(() => 0),
      block_depths: blocks.map(() => 0),
      block_data: blocks.map(() => '[]'),
      entities: blocks.map(() => '[]'),
      entity_map: '{}',
      inline_styles: blocks.map(() => '[]'),
    };
  },

  applyToVariables(variables, { text, backgroundColor }) {
    const preset = this.presetId(backgroundColor);
    if (preset === '0') {
      variables.input.message = { ranges: [], text };
      return variables;
    }
    const composed = this.buildComposedText(text);
    variables.input.message = { ranges: [], text };
    variables.input.composed_text = composed;
    variables.input.text_format_preset_id = preset;
    return variables;
  },
};
})();

// ----- fbPostBg.js -----
(function () {
/**
 * Đăng group qua GraphQL nền (không mở tab Facebook) — học từ Group Posting Pro directApi.
 */
const DOC_COMPOSER_POST = '24010394355227871';

const FP = globalThis.GF.fbPostBg = {
  base64ToBlob(base64, mime = 'image/png') {
    const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
    const bin = atob(raw);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  parseFbErrors(rawText) {
    const t = String(rawText || '').toLowerCase();
    if (/rate_limit|rate limit|temporarily blocked|you can't post right now|action_blocked/.test(t)) {
      return { critical: true, message: 'Facebook giới hạn tạm thời — dừng đăng, thử lại sau' };
    }
    if (/checkpoint|account restricted/.test(t)) {
      return { critical: true, message: 'Tài khoản FB bị checkpoint/hạn chế' };
    }
    if (/please log in|not logged in|session|expired/.test(t)) {
      return { auth: true, message: 'Session Facebook hết hạn — mở facebook.com' };
    }
    if (/permission|does_not_have_permission/.test(t)) {
      return { soft: true, message: 'Không có quyền đăng vào nhóm này' };
    }
    return null;
  },

  extractPostId(json, rawText) {
    const story = json?.data?.story_create?.story;
    let id = json?.data?.story_create?.story_id
      || json?.data?.story_create?.post_id
      || story?.legacy_story_hideable_id
      || story?.id;
    if (id && !/^\d+$/.test(String(id))) {
      try {
        const m = atob(String(id)).match(/(?:VK:|:)(\d+)(?:\D|$)/);
        if (m) id = m[1];
      } catch { /* ignore */ }
    }
    if (!id) {
      const m = String(rawText).match(/"legacy_story_hideable_id":"(\d+)"/)
        || String(rawText).match(/"story_id":"(\d+)"/)
        || String(rawText).match(/"post_id":"(\d+)"/);
      id = m?.[1];
    }
    return id ? String(id) : null;
  },

  async uploadPhoto(imageBase64, session, groupId, mime = 'image/png') {
    const S = globalThis.GF.fbSessionBg;
    const blob = this.base64ToBlob(imageBase64, mime);
    const uploadId = `gf-${Date.now()}`;
    const apiUser = session.personalId || session.uid;
    const url = new URL('https://upload.facebook.com/ajax/react_composer/attachments/photo/upload');
    url.searchParams.set('av', session.actorId || session.uid);
    url.searchParams.set('__user', apiUser);
    url.searchParams.set('__a', '1');
    url.searchParams.set('__comet_req', '15');
    url.searchParams.set('fb_dtsg', session.dtsg || session.fb_dtsg);
    if (session.lsd) url.searchParams.set('lsd', session.lsd);

    const form = new FormData();
    form.append('source', '8');
    form.append('profile_id', session.actorId || session.uid);
    form.append('target_id', groupId);
    form.append('upload_id', uploadId);
    form.append('farr', blob, 'groupflow.png');

    const res = await S.fetchWithRetry(url.toString(), {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const text = await res.text();
    let photoId = text.match(/"photoID":"(\d+)"/)?.[1]
      || text.match(/"photo_id":"(\d+)"/)?.[1];
    if (!photoId) {
      try {
        const j = JSON.parse(S.stripFbJsonPrefix(text));
        photoId = j?.payload?.photoID || j?.payload?.photo_id;
      } catch { /* ignore */ }
    }
    if (!photoId) throw new Error('Upload ảnh thất bại');
    return String(photoId);
  },

  buildComposeVariables({ groupId, text, attachments, session, backgroundColor }) {
    const mutationId = String(Date.now());
    const token = `gf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const variables = {
      input: {
        composer_entry_point: 'inline_composer',
        composer_source_surface: 'group',
        composer_type: 'group',
        logging: { composer_session_id: token },
        source: 'WWW',
        message: { ranges: [], text },
        attachments,
        audience: { to_id: String(groupId) },
        actor_id: session.actorId || session.uid,
        client_mutation_id: mutationId,
        idempotence_token: token,
        navigation_data: {
          attribution_id_v2: 'CometGroupDiscussionRoot.react,comet.group,tap_bookmark,,,,,',
        },
      },
      feedLocation: 'GROUP',
      feedbackSource: 0,
      focusCommentID: null,
      groupID: String(groupId),
      scale: 1,
      privacySelectorRenderLocation: 'COMET_STREAM',
      renderLocation: 'group',
      useDefaultActor: false,
      isFeed: false,
      isGroup: true,
      isTimeline: false,
      isPageNewsFeed: false,
      isEvent: false,
      isFundraiser: false,
    };
    const PF = globalThis.GF?.postFormat;
    if (PF && backgroundColor) {
      PF.applyToVariables(variables, { text, backgroundColor });
    }
    return variables;
  },

  async createGroupPost({ groupId, text, imageBase64, mediaMime, session, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    let attachments = [];
    if (imageBase64) {
      const photoId = await this.uploadPhoto(imageBase64, session, groupId, mediaMime || 'image/png');
      attachments = [{ photo: { id: photoId } }];
    }

    const variables = this.buildComposeVariables({ groupId, text, attachments, session, backgroundColor });
    const { json, text: rawText } = await S.graphqlRequest(
      session,
      'ComposerStoryCreateMutation',
      DOC_COMPOSER_POST,
      variables,
    );

    const err = this.parseFbErrors(rawText);
    if (err?.critical) throw new Error(err.message);
    if (err?.auth) {
      S.invalidateCache();
      throw new Error(err.message);
    }

    const pending = /requires_approval|pending_approval|is_pending/i.test(rawText);
    const postId = this.extractPostId(json, rawText);

    if (postId) {
      return {
        postId,
        mode: 'fast-bg',
        url: `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`,
      };
    }
    if (pending) {
      return {
        postId: 'pending',
        status: 'pending_approval',
        mode: 'fast-bg',
        url: `https://www.facebook.com/groups/${groupId}/`,
        warning: 'Đã gửi — chờ admin duyệt',
      };
    }
    if (err?.soft) throw new Error(err.message);
    throw new Error('Đăng GraphQL không trả post_id');
  },

  async postToGroup({ groupId, text, imageBase64, mediaMime, actorId, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    try {
      session = await S.resolveSession({ actorId });
      return await this.createGroupPost({ groupId, text, imageBase64, mediaMime, session, backgroundColor });
    } catch (e) {
      if (e.message?.includes('hết hạn') || e.message?.includes('fb_dtsg') || e.message?.includes('token')) {
        S.invalidateCache();
        session = await S.resolveSession({ force: true, actorId });
        return await this.createGroupPost({ groupId, text, imageBase64, mediaMime, session, backgroundColor });
      }
      throw e;
    }
  },
};
})();

// ----- fbCommentBg.js -----
(function () {
/**
 * Comment group qua GraphQL nền (không mở tab Facebook) — port từ GPP worker.js H()/q().
 */
const DOC_COMMENT = '9550500205043457';
const DOC_TYPING_START = '5359232510868548';
const DOC_TYPING_STOP = '6911603175550464';

const FC = globalThis.GF.fbCommentBg = {
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  randomSessionId() {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  parseFbErrors(rawText) {
    const parse = globalThis.GF.fbPostBg?.parseFbErrors;
    if (parse) return parse(rawText);
    const t = String(rawText || '').toLowerCase();
    if (/rate_limit|action_blocked|temporarily blocked/.test(t)) {
      return { critical: true, message: 'Facebook giới hạn tạm thời' };
    }
    if (/please log in|session|expired/.test(t)) {
      return { auth: true, message: 'Session Facebook hết hạn' };
    }
    return null;
  },

  buildPermalink({ groupId, postId, session, isTimeline }) {
    if (isTimeline) {
      const uid = session?.actorId || session?.uid;
      return `https://www.facebook.com/${uid}/posts/${postId}/`;
    }
    return `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`;
  },

  async checkPostCommentable({ groupId, postId, session, isTimeline }) {
    const url = this.buildPermalink({ groupId, postId, session, isTimeline });
    const S = globalThis.GF.fbSessionBg;
    try {
      const res = await S.fetchWithRetry(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (res.status === 404) {
        return { canComment: false, reason: 'Bài không tồn tại (404) — có thể bị xóa hoặc chờ duyệt' };
      }
      if (!res.ok) {
        return { canComment: false, reason: `Không đọc được bài (HTTP ${res.status})` };
      }
      const html = await res.text();
      if (html.includes("This content isn't available at the moment")) {
        return { canComment: false, reason: 'Bài đã bị xóa hoặc ẩn' };
      }
      if (html.includes('Your post is pending approval')) {
        return { canComment: false, reason: 'Bài đang chờ admin duyệt' };
      }
      if (html.includes('story_title') || html.includes('story_token') || html.includes('likeAction')) {
        return { canComment: true };
      }
      return { canComment: false, reason: 'Không xác nhận được bài (có thể pending/hạn chế)' };
    } catch (e) {
      return { canComment: false, reason: e.message || 'Lỗi kiểm tra bài' };
    }
  },

  async simulateTyping(session, feedbackId, sessionId) {
    const S = globalThis.GF.fbSessionBg;
    const variables = {
      input: {
        feedback_id: feedbackId,
        session_id: sessionId,
        actor_id: session.actorId || session.uid,
        client_mutation_id: '1',
      },
    };
    await S.graphqlRequest(
      session,
      'CometUFILiveTypingBroadcastMutation_StartMutation',
      DOC_TYPING_START,
      variables,
    );
  },

  async stopTyping(session, feedbackId, sessionId) {
    const S = globalThis.GF.fbSessionBg;
    const variables = {
      input: {
        feedback_id: feedbackId,
        session_id: sessionId,
        actor_id: session.actorId || session.uid,
        client_mutation_id: '3',
      },
    };
    try {
      await S.graphqlRequest(
        session,
        'CometUFILiveTypingBroadcastMutation_StopMutation',
        DOC_TYPING_STOP,
        variables,
      );
    } catch { /* ignore */ }
  },

  extractCommentId(json, rawText) {
    const fromJson = json?.data?.comment_create?.comment?.id
      || json?.data?.comment_create?.comment?.legacy_fbid
      || json?.data?.comment_create?.feedback_comment_edge?.node?.id;
    if (fromJson) return String(fromJson);

    const m = String(rawText).match(/\?comment_id=(\d+)/)
      || String(rawText).match(/"legacy_fbid"\s*:\s*"(\d+)"/)
      || String(rawText).match(/"comment_id"\s*:\s*"(\d+)"/);
    return m?.[1] ? String(m[1]) : null;
  },

  humanDelayMs(text) {
    const len = String(text || '').length;
    const base = Math.max(3000, Math.min(8000, len * 40));
    return base + Math.floor(Math.random() * 1500);
  },

  async createComment({ postId, text, session }) {
    const S = globalThis.GF.fbSessionBg;
    if (!postId || !/^\d+$/.test(String(postId))) {
      throw new Error('post_id không hợp lệ hoặc đang pending');
    }

    const feedbackId = btoa(`feedback:${postId}`);
    const typingSessionId = this.randomSessionId();

    try {
      await this.simulateTyping(session, feedbackId, typingSessionId);
      await this.sleep(this.humanDelayMs(text));
    } catch { /* typing optional */ }

    const variables = {
      input: {
        feedback_id: feedbackId,
        message: { ranges: [], text: String(text) },
        actor_id: session.actorId || session.uid,
        client_mutation_id: String(Math.round(Math.random() * 1000)),
      },
      useDefaultActor: false,
      scale: 1,
    };

    const { json, text: rawText } = await S.graphqlRequest(
      session,
      'useCometUFICreateCommentMutation',
      DOC_COMMENT,
      variables,
    );

    this.stopTyping(session, feedbackId, typingSessionId).catch(() => {});

    const err = this.parseFbErrors(rawText);
    if (err?.critical) throw new Error(err.message);
    if (err?.auth) {
      S.invalidateCache();
      throw new Error(err.message);
    }

    const commentId = this.extractCommentId(json, rawText);
    if (commentId) {
      return { ok: true, commentId, mode: 'fast-bg' };
    }
    if (err?.soft) throw new Error(err.message);

    return {
      ok: true,
      commentId: null,
      mode: 'fast-bg',
      warning: 'Comment có thể đã gửi nhưng không lấy được ID',
    };
  },

  async commentOnPost({ groupId, postId, text, actorId, isTimeline }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    const run = async (force) => {
      session = await S.resolveSession({ force, actorId });
      const check = await this.checkPostCommentable({
        groupId,
        postId,
        session,
        isTimeline,
      });
      if (!check.canComment) {
        throw new Error(check.reason || 'Không thể comment bài này');
      }
      return this.createComment({ postId, text, session });
    };

    try {
      return await run(false);
    } catch (e) {
      if (e.message?.includes('hết hạn') || e.message?.includes('Session') || e.message?.includes('token')) {
        S.invalidateCache();
        return run(true);
      }
      throw e;
    }
  },
};
})();

// ----- fbGroupsBg.js -----
(function () {
/**
 * Lấy nhóm đã tham gia qua session Chrome + GraphQL nội bộ FB (giống Group Posting Pro).
 * Không mở/chuyển tab Facebook.
 */
const DOC_PINNED = '7740459739385247';
const DOC_UNPINNED = '7218669964900608';

const FB = globalThis.GF.fbGroupsBg = {
  session() {
    return globalThis.GF.fbSessionBg;
  },

  async hasFbLogin() {
    return this.session().hasFbLogin();
  },

  isLoginPage(html) {
    return this.session().isLoginPage(html);
  },

  async resolveSession() {
    return this.session().resolveSession();
  },

  async graphqlRequest(session, friendlyName, docId, variables) {
    const { json } = await this.session().graphqlRequest(session, friendlyName, docId, variables);
    return json;
  },

  collectGroupEdges(map, edges) {
    (edges || []).forEach((edge) => {
      const node = edge?.node;
      const id = node?.id ? String(node.id) : '';
      const name = String(node?.name || '').trim();
      if (!id || !name || map.has(id)) return;
      map.set(id, {
        id,
        name,
        href: `https://www.facebook.com/groups/${id}/`,
      });
    });
  },

  async fetchJoinedGroupsGraphql() {
    const session = await this.resolveSession();
    const map = new Map();

    const pinned = await this.graphqlRequest(
      session,
      'GroupsCometPinnedGroupsDialogQuery',
      DOC_PINNED,
      { ordering: ['viewer_added'], scale: 1 },
    );
    const viewer = pinned?.data?.viewer;
    if (!viewer) throw new Error('GraphQL không trả viewer — session có thể hết hạn');

    this.collectGroupEdges(map, viewer.groups_tab?.pinned_groups?.edges);
    const tabList = viewer.groups_tab?.tab_groups_list;
    this.collectGroupEdges(map, tabList?.edges);

    let hasNext = tabList?.page_info?.has_next_page;
    let cursor = tabList?.page_info?.end_cursor;
    let page = 1;

    while (hasNext && cursor && page < 50) {
      await new Promise((r) => setTimeout(r, 400));
      const pageRes = await this.graphqlRequest(
        session,
        'GroupsCometUnpinnedGroupsPaginationListPaginatedQuery',
        DOC_UNPINNED,
        { count: 50, cursor, ordering: ['viewer_added'], scale: 1 },
      );
      const list = pageRes?.data?.viewer?.groups_tab?.tab_groups_list;
      if (!list) break;
      this.collectGroupEdges(map, list.edges);
      hasNext = list.page_info?.has_next_page;
      cursor = list.page_info?.end_cursor;
      page += 1;
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsHtmlFallback() {
    const res = await this.session().fetchWithRetry('https://www.facebook.com/groups/joins/', {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`Facebook trả HTTP ${res.status}`);
    const html = await res.text();
    if (this.isLoginPage(html)) {
      throw new Error('Session Facebook hết hạn — mở facebook.com một lần');
    }
    const GP = globalThis.GF.groupParse;
    if (!GP) return [];
    return GP.parseJoinedGroupsFromHtml(html, { onJoinsPage: true });
  },

  async fetchJoinedGroups() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    try {
      const groups = await this.fetchJoinedGroupsGraphql();
      if (groups.length) return { groups, count: groups.length };
    } catch (e) {
      try {
        const groups = await this.fetchJoinedGroupsHtmlFallback();
        if (groups.length) return { groups, count: groups.length, via: 'html' };
        return { groups: [], error: e.message };
      } catch (e2) {
        return { groups: [], error: e.message || e2.message };
      }
    }

    try {
      const groups = await this.fetchJoinedGroupsHtmlFallback();
      return { groups, count: groups.length, via: 'html' };
    } catch (e) {
      return { groups: [], error: e.message };
    }
  },
};
})();
