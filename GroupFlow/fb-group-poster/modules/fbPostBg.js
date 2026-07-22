/**
 * Đăng group qua GraphQL nền (không mở tab Facebook) — học từ Group Posting Pro directApi.
 */
/** GPP worker defaults — dp=text, dpu=media, l=link preview only */
const DOC_TEXT_POST = '9469644099759635';
const DOC_MEDIA_POST = '9286110778162996';
const DOC_LINK_PREVIEW = '24010394355227871';

/** Relay provider flags — GPP 2.3.2 worker (giúp mutation group khớp Comet). */
const RELAY_INTERNAL_VARS = {
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
  __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
  __relay_internal__pv__CometFeedStoryDynamicResolutionPhotoAttachmentRenderer_experimentWidthrelayprovider: 500,
  __relay_internal__pv__CometIsReplyPagerDisabledrelayprovider: false,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__CometFeedPYMKHScrollInitialPaginationCountrelayprovider: 10,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: false,
  __relay_internal__pv__EventCometCardImage_prefetchEventImagerelayprovider: false,
  __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: true,
};

const FP = globalThis.GF.fbPostBg = {
  base64ToBlob(base64, mime = 'image/png') {
    const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
    const bin = atob(raw);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  buildComposedLexical(text) {
    const t = String(text || '');
    const lines = t.split(/\r?\n/);
    const blocks = lines.length ? lines : [''];
    return {
      message: { ranges: [], text: t },
      composed_text: {
        blocks,
        block_types: blocks.map(() => 0),
        block_depths: blocks.map(() => 0),
        block_data: blocks.map(() => '{}'),
        entities: blocks.map(() => '[]'),
        entity_map: '{}',
        inline_styles: blocks.map(() => '[]'),
      },
    };
  },

  /** Giống GPP worker B() — WARNING/spam không fail cứng. */
  parseGraphqlNotice(json, rawText, chunks = []) {
    for (const p of [...(chunks || []), json]) {
      const story = p?.data?.story_create?.story;
      if (story?.is_marked_as_spam || story?.is_marked_as_spam_by_admin_assistant) {
        return 'FB gắn cờ spam — mở nhóm kiểm tra bài';
      }
      if (this.idFromStoryCreate(p?.data?.story_create)) return null;
    }
    for (const p of [...(chunks || []), json]) {
      const gqlErr = p?.errors?.[0];
      if (gqlErr?.severity === 'WARNING') {
        return gqlErr.message || gqlErr.summary || 'FB cảnh báo';
      }
    }
    return null;
  },

  detectVideoProcessing(rawText) {
    return /video.*processing|processing.*video|is_processing/i.test(String(rawText || ''));
  },

  parseFbErrors(rawText) {
    const t = String(rawText || '').toLowerCase();
    if (/rate_limit|rate limit|rate_limit_exceeded|temporarily blocked|temporarily restricted|you can't post right now|you're temporarily blocked|action_blocked/.test(t)) {
      return { critical: true, message: 'Facebook giới hạn tạm thời — dừng đăng, thử lại sau' };
    }
    if (/checkpoint|account restricted/.test(t)) {
      return { critical: true, message: 'Tài khoản FB bị checkpoint/hạn chế' };
    }
    if (/please log in|not logged in|error_subcode":1348131|error_subcode":1357001|error_subcode":1357004/.test(t)) {
      return { auth: true, message: 'Session Facebook hết hạn — mở facebook.com' };
    }
    if (/permissionerror|permission|does_not_have_permission/.test(t)) {
      return { soft: true, message: 'Không có quyền đăng vào nhóm này' };
    }
    return null;
  },

  normalizePostId(raw) {
    if (raw == null || raw === '') return null;
    let id = String(raw);
    if (/^\d+$/.test(id)) return id;
    try {
      const m = atob(id).match(/(?:VK:|:)(\d+)(?:\D|$)/);
      if (m) return m[1];
    } catch { /* ignore */ }
    const tail = id.split(':').pop();
    if (tail && /^\d+$/.test(tail)) return tail;
    return null;
  },

  idFromStoryCreate(sc) {
    if (!sc) return null;
    const story = sc.story;
    // legacy_story_hideable_id / legacy_api_post_id are the correct public URL IDs.
    // sc.story_id / sc.post_id are internal Facebook graph IDs that look numeric but
    // don't map to the public permalink — so they go last as final fallbacks.
    const candidates = [
      sc.legacy_story_hideable_id,
      sc.legacy_api_post_id,
      sc.legacy_fbid,
      story?.legacy_story_hideable_id,
      story?.legacy_api_post_id,
      story?.legacy_fbid,
      story?.legacy_id,
      story?.legacy_story_id,
      sc.feed_story_edge?.node?.legacy_story_hideable_id,
      sc.feed_story_edge?.node?.legacy_fbid,
      sc.feed_story_edge?.node?.id,
      // last resort: internal IDs that may not match the public URL
      sc.story_id,
      sc.post_id,
      story?.post_id,
      story?.id,
    ];
    for (const c of candidates) {
      const id = this.normalizePostId(c);
      if (id) return id;
    }
    if (story?.url) {
      const m = String(story.url).match(/\/permalink\/(\d+)/)
        || String(story.url).match(/\/posts\/(\d+)/);
      if (m?.[1]) return m[1];
    }
    return null;
  },

  idFromPayload(json) {
    if (!json?.data) return null;
    const sc = json.data.story_create;
    const fromStory = this.idFromStoryCreate(sc);
    if (fromStory) return fromStory;
    const altStory = json.data.createGroupPost?.group_feed_item_edge?.node?.story;
    if (altStory) {
      const id = this.normalizePostId(altStory.legacy_story_hideable_id || altStory.id);
      if (id) return id;
    }
    return null;
  },

  idFromGraphqlLines(rawText) {
    const S = globalThis.GF.fbSessionBg;
    for (const line of String(rawText || '').split('\n')) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(S.stripFbJsonPrefix(line))?.data;
        if (!data) continue;
        const id = this.idFromStoryCreate(data.story_create);
        if (id) return id;
      } catch { /* ignore */ }
    }
    return null;
  },

  // v1.0.295 — lưới bắt id ĐỘC LẬP với schema story_create: dò URL permalink bài trong nhóm chứa
  // ĐÚNG groupId của ta (`/groups/<gid>/posts/<id>` hoặc `/permalink/<id>`). FB hay đổi tên
  // field/mutation làm idFromStoryCreate()/idFromRawText() trượt hết → báo "không rõ đã đăng chưa"
  // dù bài ĐÃ lên; nhưng URL bài thì FB vẫn trả và mang groupId của ta nên không đụng bài người
  // khác trong feed. Chuẩn hoá `\/` (JSON escape) về `/` trước khi khớp.
  idFromGroupPermalink(rawText, groupId) {
    const gid = String(groupId || '');
    if (!gid) return null;
    const clean = String(rawText || '').replace(/\\\//g, '/');
    const m = clean.match(new RegExp(`groups/${gid}/(?:posts|permalink)/(\\d+)`))
      || clean.match(new RegExp(`/${gid}/(?:posts|permalink)/(\\d+)`));
    return m?.[1] ? this.normalizePostId(m[1]) : null;
  },

  idFromRawText(rawText) {
    const t = String(rawText || '');

    // Anchor search to the story_create section only — the full response can contain
    // other users' posts (feed refresh), and a global search would pick up their IDs.
    const scStart = t.indexOf('"story_create"');
    if (scStart === -1) return null; // response has no story_create → not our target

    // Take up to 8 KB after "story_create" to cover nested story object
    const context = t.slice(scStart, scStart + 8000);

    const patterns = [
      /"legacy_story_hideable_id"\s*:\s*"(\d+)"/,
      /"legacy_api_post_id"\s*:\s*"(\d+)"/,
      /"legacy_fbid"\s*:\s*"(\d+)"/,
      /"legacy_story_id"\s*:\s*"(\d+)"/,
      /"story_id"\s*:\s*"(\d+)"/,
      /"post_id"\s*:\s*"(\d+)"/,
    ];
    for (const re of patterns) {
      const m = context.match(re);
      if (m?.[1]) return m[1];
    }
    return null;
  },

  extractPostId(json, rawText, chunks = [], _debugLog) {
    const log = _debugLog || (() => {});
    const list = [...(chunks || []), json].filter(Boolean);
    for (const p of list) {
      const id = this.idFromPayload(p);
      if (id) {
        const sc = p?.data?.story_create;
        const scKeys = sc ? Object.keys(sc).join(',') : 'n/a';
        const storyKeys = sc?.story ? Object.keys(sc.story).join(',') : 'n/a';
        log(`[DEBUG post_id] method=payload id=${id} sc_keys=[${scKeys}] story_keys=[${storyKeys}]`);
        return id;
      }
    }
    const fromLines = this.idFromGraphqlLines(rawText);
    if (fromLines) {
      log(`[DEBUG post_id] method=graphql_lines id=${fromLines}`);
      return fromLines;
    }
    const fromRaw = this.idFromRawText(rawText);
    if (fromRaw) {
      log(`[DEBUG post_id] method=raw_text id=${fromRaw}`);
    } else {
      const scIdx = rawText.indexOf('"story_create"');
      const snippet = scIdx >= 0 ? rawText.slice(scIdx, scIdx + 300) : '(story_create not found)';
      log(`[DEBUG post_id] KHÔNG tìm được post_id. snippet: ${snippet}`);
    }
    return fromRaw;
  },

  storyCreateHasId(json, chunks = []) {
    for (const p of [...(chunks || []), json]) {
      if (this.idFromStoryCreate(p?.data?.story_create)) return true;
    }
    return false;
  },

  extractStoryCreateError(json, chunks = []) {
    if (this.storyCreateHasId(json, chunks)) return null;
    for (const p of [...(chunks || []), json]) {
      const sc = p?.data?.story_create;
      if (!sc) continue;
      const err = sc.errors?.[0] || sc.error;
      if (err) return err.description || err.message || String(err);
    }
    for (const p of [...(chunks || []), json]) {
      const gqlErr = p?.errors?.[0];
      if (gqlErr && gqlErr.severity !== 'WARNING') {
        return gqlErr.message || gqlErr.summary || 'GraphQL lỗi';
      }
    }
    return null;
  },

  detectSpamWarning(json, chunks = []) {
    for (const p of [...(chunks || []), json]) {
      const story = p?.data?.story_create?.story;
      if (story?.is_marked_as_spam || story?.is_marked_as_spam_by_admin_assistant) {
        return 'FB đánh dấu spam — mở nhóm kiểm tra';
      }
    }
    return null;
  },

  detectPending(json, rawText, chunks = []) {
    if (/requires_approval|pending_approval|is_pending|pending_review|GROUP_POST_PENDING|approval_required|admin_approval|post_pending|pending_post|needs_admin|group_pending|awaiting_approval|chờ duyệt|pending_story/i.test(rawText)) {
      return true;
    }
    for (const p of [...(chunks || []), json]) {
      const sc = p?.data?.story_create;
      if (sc?.is_pending || sc?.story?.is_pending || sc?.story?.is_published === false) return true;
      if (sc?.story == null && sc?.composer_session_id && !sc?.errors?.length) return true;
    }
    return false;
  },

  detectSubmittedWithoutId(json, rawText, chunks = []) {
    if (this.extractStoryCreateError(json, chunks)) return false;
    if (this.extractPostId(json, rawText, chunks)) return true;

    for (const p of [...(chunks || []), json]) {
      if (p?.errors?.some((e) => e.severity && e.severity !== 'WARNING')) return false;
      const data = p?.data;
      if (!data || !Object.prototype.hasOwnProperty.call(data, 'story_create')) continue;
      const sc = data.story_create;
      if (sc?.errors?.length) return false;
      // story_create có mặt, không lỗi — kể cả null/{} (nhóm duyệt bài hay hay gặp)
      return true;
    }

    if (/story_create/.test(rawText) && !this.extractStoryCreateError(json, chunks)) {
      return true;
    }
    return false;
  },

  inspectGraphqlFailure(json, rawText, chunks = []) {
    if (this.detectSubmittedWithoutId(json, rawText, chunks)) return null;
    for (const p of [...(chunks || []), json]) {
      const sc = p?.data?.story_create;
      if (sc && !sc.story && !sc.story_id && !sc.post_id && !sc.legacy_story_hideable_id) {
        return 'FB trả story_create rỗng — nhóm có thể chặn API hoặc cần duyệt';
      }
    }
    if (/spam|action.?blocked/i.test(rawText)) {
      return 'có thể bị FB chặn/spam';
    }
    return null;
  },

  mimeToUploadFilename(mime = 'image/png') {
    const m = String(mime).toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return 'image.jpg';
    if (m.includes('webp')) return 'image.webp';
    if (m.includes('gif')) return 'image.gif';
    return 'image.png';
  },

  describeUploadFailure(text, S) {
    const err = this.parseFbErrors(text);
    if (err?.message) return err.message;
    const stripped = S.stripFbJsonPrefix(text);
    try {
      const j = JSON.parse(stripped);
      const msg = j?.errorSummary || j?.errorDescription || j?.error;
      if (msg) return String(msg);
    } catch { /* ignore */ }
    if (/login|not logged/i.test(text)) return 'Session hết hạn — F5 facebook.com';
    if (stripped.length < 8) return 'FB không phản hồi';
    return stripped.slice(0, 140);
  },

  async uploadPhoto(imageBase64, session, groupId, mime = 'image/png') {
    const S = globalThis.GF.fbSessionBg;
    const raw = String(imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!raw || raw.length < 64) {
      throw new Error('Ảnh trống hoặc chưa load — Sửa bài, gắn lại ảnh');
    }
    const blob = this.base64ToBlob(raw, mime);
    if (!blob.size) throw new Error('File ảnh không hợp lệ');
    if (blob.size > 8 * 1024 * 1024) {
      throw new Error('Ảnh > 8MB — thu nhỏ hoặc dùng Cổ điển');
    }

    const groupUrl = groupId ? `https://www.facebook.com/groups/${groupId}` : 'https://www.facebook.com/';
    const url = new URL('https://upload.facebook.com/ajax/react_composer/attachments/photo/upload');
    const qp = await S.buildUploadQueryParams(session);
    qp.forEach((v, k) => url.searchParams.set(k, v));

    const form = new FormData();
    form.append('source', '8');
    form.append('profile_id', session.actorId || session.uid);
    form.append('waterfallxapp', 'comet');
    form.append('upload_id', `upload_${Date.now()}`);
    form.append('farr', blob, this.mimeToUploadFilename(mime));

    const headers = {
      Accept: '*/*',
      Origin: 'https://www.facebook.com',
      Referer: groupUrl,
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;

    const res = await S.fetchWithRetry(url.toString(), {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers,
    });
    const text = await res.text();
    const stripped = S.stripFbJsonPrefix(text);
    try {
      const j = JSON.parse(stripped);
      const photoId = j?.payload?.photoID || j?.payload?.photo_id;
      if (photoId) return String(photoId);
      const errMsg = j?.errorSummary || j?.errorDescription || j?.error?.message || j?.error;
      if (errMsg) throw new Error(String(errMsg));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
    let photoId = text.match(/"photoID":"(\d+)"/)?.[1]
      || text.match(/"photo_id":"(\d+)"/)?.[1];
    if (!photoId) {
      try {
        const j = JSON.parse(stripped);
        photoId = j?.payload?.photoID || j?.payload?.photo_id;
      } catch { /* ignore */ }
    }
    if (!photoId) {
      if (/fb_dtsg|login|session/i.test(text)) S.invalidateCache?.();
      throw new Error(`Upload ảnh thất bại — ${this.describeUploadFailure(text, S)}`);
    }
    return String(photoId);
  },

  // content.js tự "nghe" request GraphQL thật của chính trang Facebook lúc user browse bình
  // thường, bắt doc_id mới nhất cho ComposerStoryCreateMutation và lưu vào gf_key_doc_ids — nên
  // khi FB đổi doc_id, máy nào có mở Facebook là tự cập nhật, không cần chờ bản extension mới.
  // Ưu tiên giá trị bắt được thật; hằng số cứng chỉ là fallback khi chưa bắt được lần nào.
  async pickComposerDocId({ hasMedia } = {}) {
    const stored = (await chrome.storage.local.get('gf_key_doc_ids')).gf_key_doc_ids || {};
    const captured = stored.ComposerStoryCreateMutation;
    if (captured) return captured;
    return hasMedia ? DOC_MEDIA_POST : DOC_TEXT_POST;
  },

  buildComposeVariables({ groupId, text, attachments, session, backgroundColor, hasImages }) {
    const clientToken = `client:${typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `gf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
    const mutationId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now());
    const lexical = this.buildComposedLexical(text);
    const PF = globalThis.GF?.postFormat;
    const presetId = PF?.isColored?.(backgroundColor) ? PF.presetId(backgroundColor) : '0';
    const variables = {
      input: {
        composer_entry_point: hasImages ? 'publisher_bar_media' : 'inline_composer',
        composer_source_surface: 'group',
        composer_type: 'group',
        idempotence_token: clientToken,
        source: 'WWW',
        ...lexical,
        text_format_preset_id: presetId,
        attachments,
        audience: { to_id: String(groupId) },
        actor_id: session.actorId || session.uid,
        client_mutation_id: mutationId,
        navigation_data: {
          attribution_id_v2: 'CometGroupDiscussionRoot.react,comet.group,tap_bookmark,,,,,',
        },
        tracking: [null],
        event_share_metadata: { surface: 'newsfeed' },
        inline_activities: [],
        with_tags_ids: null,
        logging: { composer_session_id: clientToken },
      },
      displayCommentsContextEnableComment: null,
      displayCommentsContextIsAdPreview: null,
      displayCommentsContextIsAggregatedShare: null,
      displayCommentsContextIsStorySet: null,
      feedLocation: 'GROUP',
      feedbackSource: 0,
      focusCommentID: null,
      gridMediaWidth: hasImages ? 230 : null,
      groupID: String(groupId),
      scale: 1,
      privacySelectorRenderLocation: 'COMET_STREAM',
      checkPhotosToReelsUpsellEligibility: false,
      checkVideoToReelsUpsellEligibility: false,
      renderLocation: 'group',
      useDefaultActor: false,
      inviteShortLinkKey: null,
      isFeed: false,
      isGroup: true,
      isTimeline: false,
      isPageNewsFeed: false,
      isEvent: false,
      isFundraiser: false,
      isFunFactPost: false,
      isSocialLearning: false,
      isProfileReviews: false,
      isWorkSharedDraft: false,
      UFI2CommentsProvider_commentsKey: 'CometGroupDiscussionRootSuccessQuery',
      hashtag: null,
      canUserManageOffers: false,
      ...RELAY_INTERNAL_VARS,
    };
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
    const groupUrl = `https://www.facebook.com/groups/${groupId}`;
    await S.warmupGroupContext?.(groupUrl);

    const attachments = [];
    for (const img of imgList) {
      const photoId = await this.uploadPhoto(img.base64, session, groupId, img.mime || 'image/png');
      attachments.push({ photo: { id: photoId } });
    }

    const hasMedia = imgList.length > 0;
    const docId = await this.pickComposerDocId({ hasMedia });
    const variables = this.buildComposeVariables({
      groupId, text, attachments, session, backgroundColor, hasImages: hasMedia,
    });
    const { json, text: rawText, chunks } = await S.graphqlRequest(
      session,
      'ComposerStoryCreateMutation',
      docId,
      variables,
      { referer: groupUrl },
    );

    // Bug thật đã gặp: Tony báo "nhóm 2 đăng Nhanh thành công (thấy bài thật trên FB) nhưng vẫn
    // đăng Cổ điển tiếp" — parseFbErrors() quét TOÀN BỘ raw response (có thể chứa nhiều story
    // bundle khác nhau trong 1 response GraphQL batch của FB) tìm substring RẤT RỘNG (vd
    // "checkpoint"/"permission"/"please log in" ở bất kỳ đâu) — comment cũ bên dưới đã tự cảnh báo
    // rủi ro match nhầm này nhưng trước đây check critical/auth chạy TRƯỚC KHI thử trích post_id,
    // nên 1 match nhầm (vd nội dung bài hoặc dữ liệu feed khác bundle chung vô tình chứa đúng từ
    // khoá) khiến code throw NGAY dù story_create thực ra đã tạo bài thành công thật. Giờ trích
    // post_id TRƯỚC — có post_id thật (bằng chứng cấu trúc, đáng tin hơn hẳn 1 regex match) thì
    // coi là thành công ngay, bỏ qua mọi nghi ngờ critical/auth phía dưới.
    const debugMsgs = [];
    let postId = this.extractPostId(json, rawText, chunks, (m) => debugMsgs.push(m));
    // v1.0.295 — lưới cuối bắt id qua URL permalink chứa đúng groupId của ta (FB đổi schema field
    // thì idFromStoryCreate trượt, nhưng URL bài vẫn có) → xác nhận SẠCH thay vì rơi vào "không rõ".
    if (!postId) {
      const fromUrl = this.idFromGroupPermalink(rawText, groupId);
      if (fromUrl) {
        postId = fromUrl;
        debugMsgs.push(`[DEBUG post_id] method=group_permalink id=${fromUrl}`);
      }
    }
    if (debugMsgs.length) {
      globalThis.GF?.bg?.appendEngineLog?.({
        level: 'info', phase: 'post-id-debug', message: debugMsgs.join(' | '),
        groupId: String(groupId),
      }).catch?.(() => {});
    }

    // v1.0.295 — QUY TẮC CHỐNG TRÙNG CỐT LÕI: story_create mutation ĐÃ GỬI lên FB (qua
    // graphqlRequest ở trên). Từ điểm này, KHÔNG thể khẳng định FB CHƯA tạo bài — nên MỌI lỗi đều
    // đánh `ambiguousDelivery` để postGroupItem() KHÔNG fallback Cổ điển (đăng lần 2). Đây chính là
    // gốc bug Tony gặp lặp lại: response không nhận dạng được / bị coi là "action_blocked"/"soft" →
    // trước đây fallback Cổ điển → 1 bài lên 2 lần (log chỉ báo 1). Thà báo "không rõ, mở nhóm kiểm
    // tra" (runPostMatrix ghi posted_uncertain, không retry) còn hơn đăng trùng nhìn như spam.
    // Fallback Cổ điển giờ CHỈ còn cho lỗi TRƯỚC khi gửi mutation (uploadPhoto/session throw ở trên).
    const markAmbiguous = (message) => {
      const e = new Error(message);
      e.ambiguousDelivery = true;
      return e;
    };

    const err = postId ? null : this.parseFbErrors(rawText);
    if (err?.critical || err?.auth) {
      console.warn('[GroupFlow] Fast post critical/auth error:', err.message, '| raw:', rawText.slice(0, 800));
    }
    if (err?.critical) throw markAmbiguous(err.message);
    if (err?.auth) {
      S.invalidateCache();
      throw markAmbiguous(err.message);
    }

    const notice = this.parseGraphqlNotice(json, rawText, chunks);
    const pending = !postId && this.detectPending(json, rawText, chunks);
    const spamWarn = this.detectSpamWarning(json, chunks) || notice;
    const videoProcessing = !postId && this.detectVideoProcessing(rawText);

    if (postId) {
      return {
        postId,
        mode: 'fast-bg',
        url: `https://www.facebook.com/groups/${groupId}/posts/${postId}/`,
        warning: notice || undefined,
      };
    }
    if (pending) {
      return {
        postId: 'pending',
        status: 'pending_approval',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: notice || 'Đã gửi — chờ admin duyệt',
      };
    }
    if (spamWarn) {
      return {
        postId: 'hidden',
        status: 'posted_uncertain',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: spamWarn,
      };
    }
    if (videoProcessing) {
      return {
        postId: 'processing',
        status: 'successful',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: 'Video đang xử lý trên FB',
      };
    }

    const submitted = !postId && this.detectSubmittedWithoutId(json, rawText, chunks);
    if (submitted) {
      return {
        postId: 'pending',
        status: 'pending_approval',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: notice || 'Đã gửi API — FB không trả post_id (nhóm duyệt bài?). Mở nhóm kiểm tra.',
      };
    }

    const storyErr = this.extractStoryCreateError(json, chunks);
    if (storyErr) throw markAmbiguous(storyErr);
    if (err?.soft) throw markAmbiguous(err.message);

    // v1.0.295 — mutation ĐÃ GỬI mà không nhận dạng được kết quả: LUÔN ambiguous (kể cả khi hint
    // có "spam"/"action_blocked" — trước đây coi là "chắc chắn từ chối" rồi fallback Cổ điển, nhưng
    // FB VẪN có thể đã tạo bài rồi mới gắn cờ spam → đăng Cổ điển thành bài thứ 2). Không fallback.
    const hint = this.inspectGraphqlFailure(json, rawText, chunks);
    console.warn('[GroupFlow] Fast post no post_id', groupId, '| raw:', rawText.slice(0, 1200));
    globalThis.GF?.bg?.appendEngineLog?.({
      level: 'warn',
      phase: 'fast-post-no-id',
      message: `Nhanh không nhận ra post_id (mở nhóm kiểm tra). hint=${hint || 'n/a'} | raw: ${rawText.slice(0, 500)}`,
      groupId: String(groupId),
    }).catch?.(() => {});
    throw markAmbiguous(
      hint
        ? `FB không rõ đã tạo bài chưa (${hint}) — mở nhóm kiểm tra, KHÔNG đăng lại kẻo trùng`
        : 'Không rõ FB đã tạo bài chưa (response không nhận dạng được) — mở nhóm kiểm tra, KHÔNG đăng lại kẻo trùng',
    );
  },

  async postToGroup({ groupId, text, imageBase64, images, mediaMime, actorId, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    try {
      session = await S.resolveSession({ actorId, groupId });
      return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
    } catch (e) {
      // v1.0.295 — KHÔNG retry Nhanh nếu lỗi là ambiguous (mutation đã gửi, FB có thể đã tạo bài)
      // — retry lúc này sẽ upload ảnh + gửi mutation LẦN NỮA = đăng trùng ngay trong postToGroup.
      // Chỉ retry cho lỗi auth/token XẢY RA TRƯỚC KHI gửi mutation (session resolve/ chưa post gì).
      if (
        !e.ambiguousDelivery
        && (e.message?.includes('hết hạn') || e.message?.includes('fb_dtsg') || e.message?.includes('token'))
      ) {
        S.invalidateCache();
        session = await S.resolveSession({ force: true, actorId, groupId });
        return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
      }
      throw e;
    }
  },
};
