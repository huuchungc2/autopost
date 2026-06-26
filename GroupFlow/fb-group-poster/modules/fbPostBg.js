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
    if (PF?.isColored?.(backgroundColor)) {
      PF.applyToVariables(variables, { text, backgroundColor });
    }
    return variables;
  },

  async createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    const colored = globalThis.GF?.postFormat?.isColored?.(backgroundColor);
    const imgList = colored
      ? []
      : (images?.length
        ? images
        : (imageBase64 ? [{ base64: imageBase64, mime: mediaMime || 'image/png' }] : []));
    const attachments = [];
    for (const img of imgList) {
      const photoId = await this.uploadPhoto(img.base64, session, groupId, img.mime || 'image/png');
      attachments.push({ photo: { id: photoId } });
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

  async postToGroup({ groupId, text, imageBase64, images, mediaMime, actorId, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    try {
      session = await S.resolveSession({ actorId });
      return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
    } catch (e) {
      if (e.message?.includes('hết hạn') || e.message?.includes('fb_dtsg') || e.message?.includes('token')) {
        S.invalidateCache();
        session = await S.resolveSession({ force: true, actorId });
        return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
      }
      throw e;
    }
  },
};
