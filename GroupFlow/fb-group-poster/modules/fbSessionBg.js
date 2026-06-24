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
