/**
 * Chế độ Nhanh — đăng group qua GraphQL nội bộ FB (session cookie + fb_dtsg).
 * Không phải Graph API developer token — dùng session đăng nhập Chrome hiện tại.
 */
window.GF = window.GF || {};

GF.fbGraphApi = {
  capturedDocIds: {},

  rememberDocId(friendlyName, docId) {
    if (friendlyName && docId) this.capturedDocIds[friendlyName] = docId;
  },

  findDocId(...friendlyNames) {
    for (const name of friendlyNames) {
      if (this.capturedDocIds[name]) return this.capturedDocIds[name];
    }
    const html = document.documentElement.innerHTML;
    for (const name of friendlyNames) {
      const patterns = [
        new RegExp(`"fb_api_req_friendly_name":"${name}"[^}]{0,400}?"doc_id":"(\\d+)"`),
        new RegExp(`"doc_id":"(\\d+)"[^}]{0,400}?"fb_api_req_friendly_name":"${name}"`),
        new RegExp(`"${name}"[\\s\\S]{0,300}?"doc_id":"(\\d+)"`),
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m) return m[1];
      }
    }
    return null;
  },

  getSession(preferredActorId) {
    const personalId = document.cookie.match(/(?:^|;\s*)c_user=(\d+)/)?.[1] || null;
    const actingId = document.cookie.match(/(?:^|;\s*)i_user=(\d+)/)?.[1] || null;
    const actorId = preferredActorId || actingId || personalId;
    let fb_dtsg = document.querySelector('input[name="fb_dtsg"]')?.value || '';
    let lsd = document.querySelector('input[name="lsd"]')?.value || '';
    let jazoest = document.querySelector('input[name="jazoest"]')?.value || '';

    const html = document.documentElement.innerHTML;
    if (!fb_dtsg) {
      fb_dtsg = html.match(/"DTSGInitialData",\{"token":"([^"]+)"/)?.[1]
        || html.match(/"dtsg":\{"token":"([^"]+)"/)?.[1]
        || '';
    }
    if (!lsd) {
      lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1]
        || html.match(/"lsd":"([^"]+)"/)?.[1]
        || '';
    }

    return {
      personalId,
      userId: actorId,
      actorId,
      actingAsPage: Boolean(actingId && personalId && actingId !== personalId),
      fb_dtsg,
      lsd,
      jazoest,
    };
  },

  parseGraphqlResponse(text) {
    const lines = String(text).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.errors?.length) {
          throw new Error(json.errors[0]?.message || 'GraphQL lỗi');
        }
        return json;
      } catch (e) {
        if (e.message && e.message !== 'Unexpected token') throw e;
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  },

  extractPostId(payload, rawText) {
    const story = payload?.data?.story_create?.story
      || payload?.data?.createGroupPost?.group_feed_item_edge?.node?.story;
    if (story?.legacy_story_hideable_id) return String(story.legacy_story_hideable_id);
    if (story?.id) return String(story.id).split(':').pop();
    const m = String(rawText).match(/"legacy_story_hideable_id":"(\d+)"/)
      || String(rawText).match(/"story_create":\{[^}]*"id":"(\d+)"/);
    return m?.[1] || null;
  },

  async graphqlRequest({ friendlyName, docId, variables, session }) {
    if (!session.userId || !session.fb_dtsg) {
      throw new Error('Thiếu session FB — mở tab group và F5');
    }

    const apiUser = session.personalId || session.userId;

    const body = new URLSearchParams();
    body.set('av', session.userId);
    body.set('__user', apiUser);
    body.set('__a', '1');
    body.set('__comet_req', '15');
    body.set('fb_dtsg', session.fb_dtsg);
    if (session.lsd) body.set('lsd', session.lsd);
    if (session.jazoest) body.set('jazoest', session.jazoest);
    body.set('fb_api_caller_class', 'RelayModern');
    body.set('fb_api_req_friendly_name', friendlyName);
    body.set('variables', JSON.stringify(variables));
    body.set('doc_id', docId);
    body.set('server_timestamps', 'true');

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': friendlyName,
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;

    const res = await fetch('https://www.facebook.com/api/graphql/', {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = this.parseGraphqlResponse(text);
    if (json.errors?.length) {
      throw new Error(json.errors[0]?.message || 'GraphQL thất bại');
    }
    return { json, text };
  },

  async uploadPhoto(imageBase64, session, groupId) {
    const blob = await GF_CONTENT.base64ToBlob(imageBase64);
    const uploadId = `gf-${Date.now()}`;
    const url = new URL('https://upload.facebook.com/ajax/react_composer/attachments/photo/upload');
    const apiUser = session.personalId || session.userId;
    url.searchParams.set('av', session.userId);
    url.searchParams.set('__user', apiUser);
    url.searchParams.set('__a', '1');
    url.searchParams.set('__comet_req', '15');
    url.searchParams.set('fb_dtsg', session.fb_dtsg);
    if (session.lsd) url.searchParams.set('lsd', session.lsd);

    const form = new FormData();
    form.append('source', '8');
    form.append('profile_id', session.userId);
    form.append('target_id', groupId);
    form.append('upload_id', uploadId);
    form.append('farr', blob, 'groupflow.png');

    const res = await fetch(url.toString(), {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const text = await res.text();
    let photoId = text.match(/"photoID":"(\d+)"/)?.[1]
      || text.match(/"photo_id":"(\d+)"/)?.[1];
    if (!photoId) {
      try {
        const j = JSON.parse(text.replace(/^for\s*\(;;\);\s*/, ''));
        photoId = j?.payload?.photoID || j?.payload?.photo_id;
      } catch { /* ignore */ }
    }
    if (!photoId) throw new Error('Upload ảnh GraphQL thất bại');
    return String(photoId);
  },

  async createGroupPost({ groupId, text, imageBase64, session }) {
    const friendlyCandidates = [
      'ComposerStoryCreateMutation',
      'CreateGroupStoryMutation',
      'GroupsCometComposerCreateMutation',
    ];
    let docId = null;
    let friendlyName = null;
    for (const name of friendlyCandidates) {
      docId = this.findDocId(name);
      if (docId) {
        friendlyName = name;
        break;
      }
    }
    if (!docId) {
      throw new Error('Không tìm thấy doc_id composer — F5 trang group hoặc dùng Chế độ Cổ điển');
    }

    let attachments = [];
    if (imageBase64) {
      const photoId = await this.uploadPhoto(imageBase64, session, groupId);
      attachments = [{ photo: { id: photoId } }];
    }

    const variables = {
      input: {
        composer_entry_point: 'inline_composer',
        composer_source_surface: 'group',
        composer_type: 'group',
        logging: { composer_session_id: `gf-${Date.now()}` },
        source: 'WWW',
        message: { ranges: [], text },
        attachments,
        audience: { to_id: groupId },
        actor_id: session.actorId || session.userId,
        client_mutation_id: String(Date.now()),
      },
      feedLocation: 'GROUP',
      feedbackSource: 0,
      focusCommentID: null,
      groupID: groupId,
      scale: 2,
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

    const { json, text: rawText } = await this.graphqlRequest({
      friendlyName,
      docId,
      variables,
      session,
    });

    const postId = this.extractPostId(json, rawText);
    if (!postId) {
      throw new Error('Đăng GraphQL không trả post_id — thử Chế độ Cổ điển');
    }
    return { postId, mode: 'fast', friendlyName };
  },

  async postToGroup({ groupId, text, imageBase64, actorId }) {
    if (actorId && GF.fbActor) {
      const current = GF.fbActor.getActiveActorId();
      if (String(current) !== String(actorId)) {
        await GF.fbActor.switchActor(actorId);
      }
    }
    if (!location.href.includes(`/groups/${groupId}`)) {
      location.href = `https://www.facebook.com/groups/${groupId}`;
      await GF_CONTENT.sleep(3500);
    }
    const session = this.getSession(actorId);
    return this.createGroupPost({ groupId, text, imageBase64, session });
  },
};
