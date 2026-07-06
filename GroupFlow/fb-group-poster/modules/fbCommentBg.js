/**
 * Comment group qua GraphQL nền (không mở tab Facebook) — port từ GPP worker.js H()/q().
 */
const DOC_COMMENT = '9550500205043457';
const DOC_TYPING_START = '5359232510868548';
const DOC_TYPING_STOP = '6911603175550464';

// v1.0.221 — cache kết quả checkPostCommentable() theo post_id, tránh fetch lại mỗi lần
// chạy/lên lịch comment cho cùng 1 bài (Tony: "đã check rồi thì khỏi check nữa mất công").
// 'ok'/'deleted' là trạng thái BỀN (bài hiển thị bình thường hiếm khi tự ẩn lại; bài đã xóa
// không tự "hết xóa") nên cache vô thời hạn. 'pending' (chờ duyệt, hoặc tín hiệu mơ hồ như
// 404/lỗi mạng) là trạng thái CÓ THỂ ĐỔI (admin duyệt sau, mạng chỉ lỗi tạm) nên chỉ cache
// ngắn hạn rồi phải check lại — xem getPostAccess().
const PENDING_ACCESS_TTL_MS = 20 * 60 * 1000;
const POST_ACCESS_CACHE_KEY = 'gf_post_access_cache';

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
        // Tín hiệu mơ hồ (có thể xóa thật, có thể chỉ đang chờ duyệt nên FB tạm giấu) — xếp
        // `kind: 'pending'` (retry-able) thay vì 'deleted' (vĩnh viễn) để không lỡ chặn cứng
        // 1 bài thực ra sẽ hiện lại sau khi admin duyệt.
        return { canComment: false, kind: 'pending', reason: 'Bài không tồn tại (404) — có thể bị xóa hoặc chờ duyệt' };
      }
      if (!res.ok) {
        return { canComment: false, kind: 'pending', reason: `Không đọc được bài (HTTP ${res.status})` };
      }
      const html = await res.text();
      // v1.0.219 — trước bản này chỉ dò marker TIẾNG ANH ("This content isn't available…",
      // "Your post is pending approval"). Tài khoản FB đặt ngôn ngữ Việt (mặc định của cả hệ
      // thống — xem `settings.fbLang || 'vi'`) trả HTML với text tiếng Việt bất kể header
      // accept-language gửi lên, nên 2 marker tiếng Anh KHÔNG BAO GIỜ khớp trên tài khoản VN thật
      // — checkPostCommentable() luôn rơi xuống nhánh "fail open" (coi là commentable) dù bài
      // đang thực sự ở trạng thái chờ duyệt/đã xóa/không xem được, khiến job vẫn tốn công mở tab
      // Cổ điển chạy tiếp và thất bại ở đó thay vì bị chặn sớm, rẻ tiền ngay tại đây. Thêm marker
      // tiếng Việt tương ứng (xác nhận từ ảnh chụp thật của Tony: "Bạn hiện không xem được nội
      // dung này").
      if (
        html.includes("This content isn't available at the moment")
        || html.includes('Bạn hiện không xem được nội dung này')
        || html.includes('Nội dung này hiện không có sẵn')
        || html.includes('đã xóa nội dung')
      ) {
        return { canComment: false, kind: 'deleted', reason: 'Bài đã bị xóa hoặc ẩn' };
      }
      if (
        html.includes('Your post is pending approval')
        || html.includes('đang chờ phê duyệt')
        || html.includes('đang chờ duyệt')
        || html.includes('chờ quản trị viên nhóm phê duyệt')
      ) {
        return { canComment: false, kind: 'pending', reason: 'Bài đang chờ admin duyệt' };
      }
      if (html.includes('story_title') || html.includes('story_token') || html.includes('likeAction')) {
        return { canComment: true, kind: 'ok' };
      }
      // Trang tải OK (không 404), khong thay dau hieu bi xoa/pending ro rang - nhung cung khong
      // tim thay marker cu (story_title/story_token/likeAction) de XAC NHAN chac chan, rat co
      // the do Facebook doi cau truc trang tu luc code nay viet. Truoc day coi "khong xac nhan
      // duoc" = KHONG cho comment (fail closed) - chan nham ca bai hoan toan binh thuong moi khi
      // marker cu khong khop, khien Nhanh luon rot xuong Co dien du bai comment duoc binh thuong.
      // Doi sang fail open: trang load duoc, khong co tin hieu xau ro rang thi cu coi la
      // commentable, de createComment() that su quyet dinh dung/sai - neu van sai thi co che
      // fallback Co dien da co san lo.
      return { canComment: true, kind: 'ok' };
    } catch (e) {
      return { canComment: false, kind: 'pending', reason: e.message || 'Lỗi kiểm tra bài' };
    }
  },

  async readPostAccessCache() {
    const d = await chrome.storage.local.get(POST_ACCESS_CACHE_KEY);
    return d[POST_ACCESS_CACHE_KEY] || {};
  },

  async writePostAccessEntry(postId, entry) {
    const store = await this.readPostAccessCache();
    store[String(postId)] = entry;
    await chrome.storage.local.set({ [POST_ACCESS_CACHE_KEY]: store });
    return entry;
  },

  isAccessEntryFresh(entry) {
    if (!entry) return false;
    if (entry.kind !== 'pending') return true;
    return Date.now() - (entry.checkedAt || 0) < PENDING_ACCESS_TTL_MS;
  },

  // Bọc checkPostCommentable() bằng cache theo post_id — dùng chung cho cả luồng comment thật
  // (commentOnPost() bên dưới), cron nền quét trước (background.js warmPostAccessCache()), lẫn
  // UI đọc trực tiếp storage để hiện tag/chặn nút (sidepanel.js không load module này, chỉ đọc
  // thẳng key `gf_post_access_cache` — xem ghi chú ở buildPermalink()/PENDING_ACCESS_TTL_MS).
  async getPostAccess({ groupId, postId, session, isTimeline, force = false }) {
    const cached = force ? null : (await this.readPostAccessCache())[String(postId)];
    if (this.isAccessEntryFresh(cached)) return cached;
    const result = await this.checkPostCommentable({ groupId, postId, session, isTimeline });
    const entry = { ...result, checkedAt: Date.now() };
    await this.writePostAccessEntry(postId, entry);
    return entry;
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
    // Try structured JSON paths first (multiple response shapes FB has used)
    const fromJson = json?.data?.comment_create?.comment?.id
      || json?.data?.comment_create?.comment?.legacy_fbid
      || json?.data?.comment_create?.feedback_comment_edge?.node?.id
      || json?.data?.commentCreate?.comment?.id
      || json?.data?.commentCreate?.comment?.legacy_fbid
      || json?.data?.create_comment?.comment?.id
      || json?.data?.create_comment?.comment?.legacy_fbid
      || json?.data?.comment?.id
      || json?.data?.comment?.legacy_fbid
      || json?.extensions?.comment_id
      || json?.extensions?.commentId;
    if (fromJson) return String(fromJson);

    // Fallback: search raw text — anchor to comment_create context to avoid false positives
    const t = String(rawText || '');
    const ctxStart = t.search(/comment_create|commentCreate|create_comment/i);
    const ctx = ctxStart >= 0 ? t.slice(ctxStart, ctxStart + 4000) : t;
    const m = ctx.match(/\?comment_id=(\d+)/)
      || ctx.match(/"legacy_fbid"\s*:\s*"(\d{8,})"/)
      || ctx.match(/"comment_id"\s*:\s*"(\d{8,})"/)
      || ctx.match(/"id"\s*:\s*"(\d{8,})"/)
      || t.match(/\?comment_id=(\d+)/);
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

    const storedIds = (await chrome.storage.local.get('gf_key_doc_ids')).gf_key_doc_ids || {};
    const resolvedDocId = storedIds['useCometUFICreateCommentMutation'] || DOC_COMMENT;
    const { json, text: rawText } = await S.graphqlRequest(
      session,
      'useCometUFICreateCommentMutation',
      resolvedDocId,
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

    // Không thấy lỗi GraphQL (đã throw ở graphqlRequest nếu có) nhưng cũng không trích được
    // commentId — nghĩa là response 200 OK nhưng đúng shape JSON không khớp path nào trong
    // extractCommentId() (rất có thể FB đổi shape mutation, giống loạt lỗi __dyn/__csr/jazoest đã
    // gặp ở luồng đăng bài trước đây). Không đoán mò thêm path — log lại top-level keys + đoạn
    // response thật để lần sau có dữ liệu thật mà sửa đúng, thay vì luôn âm thầm rớt xuống Cổ điển
    // không rõ lý do.
    console.warn('[GroupFlow] Nhanh comment: không trích được commentId — top-level keys:',
      json?.data ? Object.keys(json.data) : json && Object.keys(json), 'raw snippet:', String(rawText || '').slice(0, 800));

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
      const check = await this.getPostAccess({
        groupId,
        postId,
        session,
        isTimeline,
        // Session vừa bị buộc làm mới (lỗi auth ở lượt trước) — đừng tin cache cũ, check lại
        // thật vì rất có thể lần trước fail do session hết hạn chứ không phải do bài.
        force,
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
