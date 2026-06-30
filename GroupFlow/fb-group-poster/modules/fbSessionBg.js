/**
 * Session Facebook + GraphQL từ service worker (cookie Chrome, không cần tab FB).
 */
const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';

const S = globalThis.GF.fbSessionBg = {
  _cacheByActor: new Map(),
  _lastCacheKey: null,
  _webSessionId: null,
  CACHE_MS: 5 * 60 * 1000,
  reqCounter: 1,

  freshWebSessionId() {
    const seg = () => Math.floor(Math.random() * (36 ** 6)).toString(36).padStart(6, '0');
    return `${seg()}:${seg()}:${seg()}`;
  },

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

  parseAllGraphqlJson(text) {
    const cleaned = this.stripFbJsonPrefix(text);
    const chunks = [];
    for (const line of cleaned.split('\n').filter(Boolean)) {
      try {
        chunks.push(JSON.parse(line));
      } catch {
        /* bỏ qua dòng không phải JSON */
      }
    }
    if (!chunks.length) {
      try {
        chunks.push(JSON.parse(cleaned));
      } catch {
        /* ignore */
      }
    }
    return chunks;
  },

  pickGraphqlPayload(chunks) {
    for (const j of chunks || []) {
      if (j?.data?.story_create) return j;
      if (j?.data?.createGroupPost) return j;
    }
    return chunks?.[0] || {};
  },

  parseGraphqlJson(text) {
    const chunks = this.parseAllGraphqlJson(text);
    for (const json of chunks) {
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message || 'GraphQL lỗi');
      }
    }
    return this.pickGraphqlPayload(chunks);
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

  async resolveSession({ force = false, actorId: preferredActorId, groupId } = {}) {
    const cacheKey = preferredActorId ? String(preferredActorId) : '__default__';
    const cached = this._cacheByActor.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < this.CACHE_MS) {
      return { ...cached.session };
    }
    if (!(await this.hasFbLogin())) {
      throw new Error('Chưa đăng nhập Facebook trên Chrome');
    }
    let html = await this.fetchAuthHtml();
    if (groupId) {
      try {
        const groupUrl = `https://www.facebook.com/groups/${groupId}`;
        const res = await this.fetchWithRetry(groupUrl, {
          credentials: 'include',
          redirect: 'follow',
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: 'https://www.facebook.com/',
          },
        });
        const groupHtml = await res.text();
        if (groupHtml.length > 500 && !this.isLoginPage(groupHtml)) {
          html = groupHtml;
          this._warmupTokens = globalThis.GF?.fbCometTokens?.parseFromHtml?.(groupHtml) || null;
        }
      } catch { /* giữ html /settings */ }
    }
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
    this._cacheByActor.set(cacheKey, { session: { ...session }, at: Date.now() });
    this._lastCacheKey = cacheKey;
    return session;
  },

  invalidateCache() {
    this._cacheByActor.clear();
    this._lastCacheKey = null;
  },

  buildGraphqlBody(session, friendlyName, docId, variables) {
    const apiUser = session.personalId || session.uid;
    const body = new URLSearchParams();
    body.set('av', session.actorId || session.uid);
    body.set('__user', apiUser);
    body.set('__a', '1');
    body.set('__comet_req', '15');
    body.set('__req', (this.reqCounter++).toString(36));
    body.set('__ccg', 'EXCELLENT');
    body.set('dpr', '1');
    if (!this._webSessionId) this._webSessionId = this.freshWebSessionId();
    body.set('__s', this._webSessionId);
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
    globalThis.GF?.fbCometTokens?.applyToSearchParams?.(body, session, this._warmupTokens);
    return body;
  },

  graphqlHeaders(session, friendlyName, referer = 'https://www.facebook.com/') {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-ASBD-ID': '129477',
      'X-FB-Friendly-Name': friendlyName,
      Origin: 'https://www.facebook.com',
      Referer: referer,
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;
    return headers;
  },

  /** Query string upload ảnh — khớp GPP worker (Comet). */
  buildUploadQueryParams(session) {
    const apiUser = session.uid || session.personalId;
    const params = new URLSearchParams();
    params.set('av', session.actorId || session.uid);
    params.set('__user', apiUser);
    params.set('__a', '1');
    params.set('__comet_req', '15');
    params.set('__req', (this.reqCounter++).toString(36));
    params.set('__ccg', 'EXCELLENT');
    params.set('dpr', '1');
    if (!this._webSessionId) this._webSessionId = this.freshWebSessionId();
    params.set('__s', this._webSessionId);
    if (session.rev) params.set('__rev', session.rev);
    params.set('fb_dtsg', session.dtsg || session.fb_dtsg);
    if (session.lsd) params.set('lsd', session.lsd);
    params.set('jazoest', session.jazoest || '25669');
    if (session.spin_r) params.set('__spin_r', session.spin_r);
    if (session.spin_b) params.set('__spin_b', session.spin_b);
    if (session.spin_t) params.set('__spin_t', session.spin_t);
    params.set('fb_api_caller_class', 'RelayModern');
    params.set('server_timestamps', 'true');
    globalThis.GF?.fbCometTokens?.applyToSearchParams?.(params, session, this._warmupTokens);
    return params;
  },

  async warmupGroupContext(url) {
    if (!url) return null;
    try {
      const res = await this.fetchWithRetry(url, {
        credentials: 'include',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://www.facebook.com/',
        },
      });
      const html = await res.text();
      const tokens = globalThis.GF?.fbCometTokens?.parseFromHtml?.(html) || null;
      this._warmupTokens = tokens;
      if (tokens?.__hs && this._cache) {
        this._cache.hs = tokens.__hs;
      }
      await new Promise((r) => setTimeout(r, 2500));
      return tokens;
    } catch {
      return null;
    }
  },

  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i += 1) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429) {
          if (i === retries - 1) return res;
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

  async graphqlRequest(session, friendlyName, docId, variables, opts = {}) {
    const referer = opts.referer || 'https://www.facebook.com/';
    const body = this.buildGraphqlBody(session, friendlyName, docId, variables);
    const res = await this.fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: this.graphqlHeaders(session, friendlyName, referer),
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const chunks = this.parseAllGraphqlJson(text);
    for (const j of chunks) {
      for (const gqlErr of j?.errors || []) {
        if (gqlErr?.severity === 'WARNING') continue;
        throw new Error(gqlErr?.message || 'GraphQL lỗi');
      }
    }
    const json = this.pickGraphqlPayload(chunks);
    return { json, text, chunks };
  },
};
