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
