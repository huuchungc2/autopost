/**
 * Session Facebook + GraphQL từ service worker (cookie Chrome, không cần tab FB).
 */
const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';

const S = globalThis.GF.fbSessionBg = {
  _cacheByActor: new Map(),
  _lastCacheKey: null,
  _webSessionId: null,
  _ajaxIdentityLoaded: false,
  CACHE_MS: 5 * 60 * 1000,
  reqCounter: 1,

  freshWebSessionId() {
    const seg = () => Math.floor(Math.random() * (36 ** 6)).toString(36).padStart(6, '0');
    return `${seg()}:${seg()}:${seg()}`;
  },

  // MV3 service worker bị Chrome tắt sau ~30s không hoạt động — trong khi giãn cách giữa các
  // nhóm (Settings) thường dài hơn thế nhiều, nên hầu như MỖI LẦN đăng nhóm tiếp theo, SW đã bị
  // khởi động lại từ đầu, xoá sạch _webSessionId/reqCounter trong bộ nhớ. Kết quả: mỗi request
  // đều mang __s (session id ajax) mới tinh + __req luôn về lại 1 — không giống hành vi trình
  // duyệt thật (nơi __s sống suốt cả phiên duyệt), dễ bị Facebook nghi ngờ (lỗi 1357004 chung
  // chung). Lưu 2 giá trị này vào chrome.storage.local để sống sót qua các lần SW khởi động lại.
  async ensureAjaxIdentity() {
    if (this._ajaxIdentityLoaded) return;
    this._ajaxIdentityLoaded = true;
    try {
      const d = await chrome.storage.local.get(['gfWebSessionId', 'gfReqCounter']);
      if (d.gfWebSessionId) {
        this._webSessionId = d.gfWebSessionId;
        this.reqCounter = Number(d.gfReqCounter) || 1;
      } else {
        this._webSessionId = this.freshWebSessionId();
        chrome.storage.local.set({ gfWebSessionId: this._webSessionId, gfReqCounter: this.reqCounter }).catch(() => {});
      }
    } catch {
      if (!this._webSessionId) this._webSessionId = this.freshWebSessionId();
    }
  },

  nextReq() {
    const val = this.reqCounter++;
    chrome.storage.local.set({ gfReqCounter: this.reqCounter }).catch(() => {});
    return val;
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

  // jazoest là checksum của CHÍNH fb_dtsg (tổng mã ký tự, tiền tố "2") — Facebook dùng để phát
  // hiện request giả mạo/dtsg không khớp. Trước đây hardcode cứng '25669' bất kể dtsg thật là gì
  // → dtsg mới lấy được nhưng jazoest cũ không khớp → FB trả lỗi chung chung (vd error 1357004
  // "Vui lòng thử đóng và mở lại cửa sổ trình duyệt") thay vì lỗi rõ ràng, rất khó đoán nguyên nhân.
  computeJazoest(dtsg) {
    if (!dtsg) return null;
    let sum = 0;
    for (let i = 0; i < dtsg.length; i += 1) sum += dtsg.charCodeAt(i);
    return `2${sum}`;
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
    const jazoest = h.match(/name="jazoest"\s+value="([^"]+)"/)?.[1]
      || h.match(/"jazoest":"([^"]+)"/)?.[1]
      || this.computeJazoest(dtsg)
      || '25669';
    return {
      uid,
      personalId: uid,
      dtsg,
      lsd,
      jazoest,
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
    await this.ensureAjaxIdentity();
    const cacheKey = preferredActorId ? String(preferredActorId) : '__default__';
    const cached = this._cacheByActor.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < this.CACHE_MS) {
      console.info('[GroupFlow] session debug (from cache):', {
        hasDtsg: Boolean(cached.session.dtsg),
        hasLsd: Boolean(cached.session.lsd),
        jazoest: cached.session.jazoest,
        rev: cached.session.rev,
        hs: cached.session.hs,
        spin_r: cached.session.spin_r,
        spin_b: cached.session.spin_b,
        spin_t: cached.session.spin_t,
      });
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
    // Log chẩn đoán tạm — error 1357004 chung chung của FB thường do thiếu/lỗi __rev, __hs,
    // __spin_r/b/t (tham số "phiên bản build" FB dùng để chặn client cũ), không phải do dtsg/lsd.
    // Không log dtsg/lsd thật (nhạy cảm) — chỉ log CÓ lấy được hay không + giá trị rev/hs/spin.
    console.info('[GroupFlow] session debug:', {
      hasDtsg: Boolean(parsed.dtsg),
      hasLsd: Boolean(parsed.lsd),
      jazoest: session.jazoest,
      rev: session.rev,
      hs: session.hs,
      spin_r: session.spin_r,
      spin_b: session.spin_b,
      spin_t: session.spin_t,
    });
    this._cacheByActor.set(cacheKey, { session: { ...session }, at: Date.now() });
    this._lastCacheKey = cacheKey;
    return session;
  },

  invalidateCache() {
    this._cacheByActor.clear();
    this._lastCacheKey = null;
  },

  async buildGraphqlBody(session, friendlyName, docId, variables) {
    const apiUser = session.personalId || session.uid;
    const body = new URLSearchParams();
    body.set('av', session.actorId || session.uid);
    body.set('__user', apiUser);
    body.set('__a', '1');
    body.set('__comet_req', '15');
    body.set('__req', this.nextReq().toString(36));
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
    await globalThis.GF?.fbCometTokens?.applyToSearchParams?.(body, session, this._warmupTokens);
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
  async buildUploadQueryParams(session) {
    const apiUser = session.uid || session.personalId;
    const params = new URLSearchParams();
    params.set('av', session.actorId || session.uid);
    params.set('__user', apiUser);
    params.set('__a', '1');
    params.set('__comet_req', '15');
    params.set('__req', this.nextReq().toString(36));
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
    await globalThis.GF?.fbCometTokens?.applyToSearchParams?.(params, session, this._warmupTokens);
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

  // Bug thật đã gặp: 1 bài đăng "Nhanh" (GraphQL nền) đã ĐƯỢC FB TẠO THẬT phía server, nhưng
  // response bị rớt trước khi về tới đây (mất mạng, service worker bị Chrome tạm ngưng giữa
  // request, 5xx tạm thời...) — createGroupPost() không đọc được kết quả nên coi là lỗi, rồi
  // postGroupItem() (background.js) tự fallback Cổ điển → ĐĂNG TRÙNG THẬT vào cùng 1 nhóm (Fast đã
  // đăng xong, Cổ điển đăng thêm 1 lần nữa). Khác với lỗi GraphQL rõ ràng (vd field_exception —
  // FB trả lỗi kèm response, chắc chắn CHƯA tạo bài, fallback Cổ điển an toàn), 2 trường hợp dưới
  // đây KHÔNG THỂ khẳng định FB đã xử lý request hay chưa — đánh dấu `ambiguousDelivery = true` để
  // postGroupItem() KHÔNG tự ý fallback Cổ điển cho các lỗi này (xem chú thích ở đó).
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
        // Fetch tự ném lỗi (mất mạng, connection reset, SW bị Chrome unload giữa chừng...) —
        // request có thể đã tới FB và được xử lý xong trước khi phản hồi bị rớt, không thể biết.
        if (i === retries - 1) {
          e.ambiguousDelivery = true;
          throw e;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    const err = new Error('Fetch thất bại sau nhiều lần thử');
    err.ambiguousDelivery = true;
    throw err;
  },

  async graphqlRequest(session, friendlyName, docId, variables, opts = {}) {
    const referer = opts.referer || 'https://www.facebook.com/';
    const body = await this.buildGraphqlBody(session, friendlyName, docId, variables);
    const res = await this.fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: this.graphqlHeaders(session, friendlyName, referer),
      body,
    });
    if (!res.ok) {
      // 5xx từ chính hạ tầng FB (không phải lỗi GraphQL nghiệp vụ trả kèm response) — request có
      // thể đã được nhận trước khi lỗi hạ tầng xảy ra, không chắc chắn CHƯA tạo bài.
      const err = new Error(`GraphQL HTTP ${res.status}`);
      if (res.status >= 500) err.ambiguousDelivery = true;
      throw err;
    }
    const text = await res.text();
    const chunks = this.parseAllGraphqlJson(text);
    for (const j of chunks) {
      for (const gqlErr of j?.errors || []) {
        if (gqlErr?.severity === 'WARNING') continue;
        // Lỗi GraphQL nghiệp vụ trả kèm response rõ ràng (vd field_exception) — FB CHẮC CHẮN đã
        // xử lý và từ chối request này, không tạo bài. KHÔNG đánh dấu ambiguousDelivery.
        throw new Error(gqlErr?.message || 'GraphQL lỗi');
      }
    }
    const json = this.pickGraphqlPayload(chunks);
    return { json, text, chunks };
  },
};
