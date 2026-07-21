/**
 * Comment group qua GraphQL nền (không mở tab Facebook) — port từ GPP worker.js H()/q().
 */
const DOC_COMMENT = '9550500205043457';
const DOC_TYPING_START = '5359232510868548';
const DOC_TYPING_STOP = '6911603175550464';

// v1.0.221 — cache kết quả checkPostCommentable() theo post_id, tránh fetch lại mỗi lần
// chạy/lên lịch comment cho cùng 1 bài (Tony: "đã check rồi thì khỏi check nữa mất công").
// 'deleted' là trạng thái BỀN (bài đã xóa không tự "hết xóa") nên cache vô thời hạn. 'pending'
// (chờ duyệt, hoặc tín hiệu mơ hồ như 404/lỗi mạng) là trạng thái CÓ THỂ ĐỔI (admin duyệt sau,
// mạng chỉ lỗi tạm) nên chỉ cache ngắn hạn rồi phải check lại — xem getPostAccess().
const PENDING_ACCESS_TTL_MS = 20 * 60 * 1000;
// v1.0.229 — Tony xác nhận bằng ảnh chụp thật 1 bài "Bạn hiện không xem được nội dung này" (chủ
// bài giới hạn người xem/đã xóa — đúng marker đã có ở checkPostCommentable() bên dưới) nhưng vẫn
// bị cache 'ok' — nghĩa là marker string-match không khớp được HTML thô fetch() lấy về (rất có thể
// do fetch() nền thiếu header điều hướng thật/Facebook trả biến thể khác cho request không phải
// browser navigation, hoặc trang render phần lỗi bằng JS sau khi tải chứ không có sẵn trong HTML
// gốc) — checkPostCommentable() rơi vào nhánh fail-open ("không xác định được thì coi là OK").
// Kiểu lỗi string-match kiểu này đã tái diễn nhiều lần (v1.0.219/220/222) mỗi khi Facebook đổi
// cách hiển thị — thay vì tiếp tục vá từng chuỗi (dễ vỡ lại), 'ok' từng KHÔNG còn cache vĩnh viễn:
// hết hạn sau 6h để tự check lại định kỳ, giới hạn phạm vi false positive theo thời gian.
// v1.0.276 (2026-07-18) — Tony: "check OK rồi thì không check nữa chứ". Từ v1.0.258 check bằng TAB
// THẬT (đọc document.body.innerText, đáng tin như user thật nhìn) nên lý do gốc của TTL 6h (fetch()
// fail-open sai) KHÔNG CÒN — bỏ hẳn hằng `OK_ACCESS_TTL_MS`, 'ok' lại BỀN vô thời hạn như 'deleted'
// (khớp `isPostAccessFresh()` bên sidepanel.js vốn đã coi 'ok' vĩnh viễn; trước đây 2 bên lệch nhau
// khiến service worker cứ mở tab re-check bài mà panel đã coi là xong — "3 tab nhấp nháy không đổi
// gì"). Bài từng OK mà sau hóa xấu (admin gỡ/khoá) → lưới an toàn v1.0.267 tự loại (comment timeout
// 1 lần → ghi đè 'pending').
const POST_ACCESS_CACHE_KEY = 'gf_post_access_cache';
// v1.0.222 — bug ở buildPermalink() (dùng route `/permalink/` thay vì `/posts/` thật) khiến
// checkPostCommentable() gần như LUÔN fail-open ("ok") bất kể bài thật có xem được hay không —
// nghĩa là mọi entry 'ok' ghi TRƯỚC bản vá này đều không đáng tin, mà 'ok' lại cache vĩnh viễn nên
// sẽ không bao giờ tự check lại. Bump schema để tự xoá sạch cache cũ đúng 1 lần khi lên bản này —
// xem readPostAccessCache().
// v1.0.251 — Tony hỏi "sao không reset DB cho đỡ khổ" — cache này KHÔNG nằm ở DB server, nằm ngay
// trong chrome.storage.local của máy đang chạy extension, nên không có "lệnh DB" nào xoá được nó.
// Bump schema lần 2 (2→3) để tự xoá sạch TOÀN BỘ cache cũ ngay khi reload extension lên bản này —
// đơn giản hơn hẳn việc tự tay gọi force:true qua console cho từng bài — đổi lại mọi bài (không chỉ
// đúng 1 bài đang lỗi) đều mất cache, phải chờ cron warmPostAccessCache() check lại dần (2 bài/~3
// phút, hoặc 6 bài ngay khi mở tab Comment) — chấp nhận được vì đây chỉ là cache hiệu năng, không
// phải dữ liệu thật.
const POST_ACCESS_CACHE_SCHEMA = 3;
const POST_ACCESS_CACHE_SCHEMA_KEY = 'gf_post_access_cache_schema';

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
    // v1.0.222 — TỪNG dùng `/groups/{gid}/permalink/{pid}/` (route rút gọn/redirect của FB, khác
    // hẳn trang thật `/groups/{gid}/posts/{pid}/` mà "Mở bài" mở ra — xem 043c139). Route permalink
    // rất có thể trả về HTML rút gọn không chứa marker lỗi ("Bạn hiện không xem được nội dung
    // này"...) LẪN marker OK (story_title/story_token/likeAction) — khiến checkPostCommentable()
    // luôn rơi vào nhánh "fail open" (coi là commentable) bất kể bài thật có xem được hay không.
    // Tony xác nhận thật bằng ảnh chụp: bài được cache đánh dấu "✓ Có thể comment" nhưng mở
    // `/posts/{pid}/` bằng tay lại thấy "Bạn hiện không xem được nội dung này". Đổi sang đúng URL
    // thật, khớp với `buildPostedGroupUrl()`/`buildHistoryPostUrl()` (sidepanel.js) và
    // `buildGroupPostUrl()` (background.js).
    return `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
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
      // v1.0.229 — Tony xác nhận bằng 2 bài KHÁC NHAU, cả 2 đều hiện đúng marker "Bạn hiện không
      // xem được nội dung này" trên màn hình nhưng checkPostCommentable() vẫn báo canComment:true
      // MỖI LẦN (không phải lỗi cache 1 lần) — nghĩa là bản thân string-match luôn thất bại, không
      // phải do FB thay đổi wording. Nghi vấn cao nhất: HTML server trả về encode tiếng Việt có dấu
      // ở dạng NFD (ký tự gốc + dấu tổ hợp tách rời) trong khi chuỗi marker trong code là NFC (ký
      // tự có dấu dựng sẵn) — 2 dạng hiển thị giống hệt nhau cho mắt người/trình duyệt (browser tự
      // normalize khi render) nhưng so sánh chuỗi thô (`.includes()`) coi là 2 chuỗi byte khác nhau
      // nên không bao giờ khớp. `.normalize('NFC')` chuẩn hóa lại HTML thô về cùng dạng với marker
      // trước khi so khớp — không đổi gì nếu HTML vốn đã là NFC (fix vô hại nếu đoán sai nguyên
      // nhân), chỉ có tác dụng khi thật sự lệch chuẩn hóa.
      const html = (await res.text()).normalize('NFC');
      // v1.0.219 — trước bản này chỉ dò marker TIẾNG ANH ("This content isn't available…",
      // "Your post is pending approval"). Tài khoản FB đặt ngôn ngữ Việt (mặc định của cả hệ
      // thống — xem `settings.fbLang || 'vi'`) trả HTML với text tiếng Việt bất kể header
      // accept-language gửi lên, nên 2 marker tiếng Anh KHÔNG BAO GIỜ khớp trên tài khoản VN thật
      // — checkPostCommentable() luôn rơi xuống nhánh "fail open" (coi là commentable) dù bài
      // đang thực sự ở trạng thái chờ duyệt/đã xóa/không xem được, khiến job vẫn tốn công mở tab
      // Cổ điển chạy tiếp và thất bại ở đó thay vì bị chặn sớm, rẻ tiền ngay tại đây. Thêm marker
      // tiếng Việt tương ứng (xác nhận từ ảnh chụp thật của Tony: "Bạn hiện không xem được nội
      // dung này").
      // v1.0.230 (ĐÃ REVERT ở v1.0.232) — từng đổi sang ưu tiên marker OK trước, với giả thuyết
      // bài CỦA CHÍNH MÌNH chờ duyệt vẫn commentable bình thường (FB chỉ chặn người khác). Tony
      // xác nhận bằng thao tác tay thực tế: bài của chính mình chờ duyệt vẫn hiện ĐẦY ĐỦ nội
      // dung (có marker OK thật) NHƯNG KHÔNG CÓ Ô BÌNH LUẬN nào cả (tùy cấu hình duyệt bài từng
      // nhóm — Facebook không cho tương tác kể cả với chủ bài tới khi duyệt xong) — giả thuyết
      // v1.0.230 SAI. Banner "chờ phê duyệt" là tín hiệu ĐÁNG TIN CẬY HƠN marker OK để xác định
      // có comment được hay không (marker OK chỉ xác nhận NỘI DUNG hiện ra, không xác nhận Ô
      // BÌNH LUẬN có tồn tại) — quay lại kiểm tra deleted/pending TRƯỚC marker OK.
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
        // v1.0.251 — thêm log NGAY CẢ khi khớp marker OK (trước đây chỉ log lúc fail-open, không có
        // bằng chứng gì khi nghi ngờ marker OK khớp NHẦM trên bài thực ra đang chờ duyệt — Tony báo
        // bài chờ duyệt vẫn hiện "có thể comment" ở tab Của tôi, cần dữ liệu thật để sửa đúng chỗ
        // thay vì đoán thêm 1 marker mới không có bằng chứng, như 4-5 lần trước đã làm).
        // v1.0.254 — Tony test thật (post 4450720991842547): matchedStoryTitle:true, HTML ~908KB
        // (không phải trang rỗng/login wall), nhưng không thấy được `looseHintsOnOk` vì Chrome
        // console thu gọn object lồng nhau. Giờ trích luôn ĐOẠN VĂN BẢN quanh mỗi từ khoá tìm thấy
        // (±150 ký tự) in thẳng ra console — không cần bấm mở rộng gì nữa, không cần đoán thêm
        // marker mới khi chưa thấy đúng câu chữ Facebook dùng.
        const lowerHtml = html.toLowerCase();
        const looseHintsOnOk = ['duyệt', 'approv', 'pending', 'chờ', 'review'].filter((kw) => lowerHtml.includes(kw));
        const hintSnippets = {};
        for (const kw of looseHintsOnOk) {
          const idx = lowerHtml.indexOf(kw);
          hintSnippets[kw] = html.slice(Math.max(0, idx - 150), idx + 150);
        }
        // v1.0.255 — Tony copy log từ console nhưng Chrome vẫn thu gọn object lồng nhau (kể cả sau
        // v1.0.254 thêm hintSnippets) — console.info nhận object thì DevTools luôn hiện dạng cây có
        // thể thu gọn, copy text thường chỉ lấy được dòng tóm tắt, không lấy được nội dung bên
        // trong. In thẳng 1 CHUỖI JSON (console.log, không phải console.info(obj)) — không thể thu
        // gọn được nữa, copy paste là dán được nguyên văn.
        console.log('[GroupFlow] checkPostCommentable OK-match JSON: ' + JSON.stringify({
          postId, groupId, htmlLength: html.length,
          matchedStoryTitle: html.includes('story_title'),
          matchedStoryToken: html.includes('story_token'),
          matchedLikeAction: html.includes('likeAction'),
          // Nếu mảng này KHÔNG rỗng — nghĩa là HTML có tín hiệu liên quan chờ duyệt NGAY CẢNH marker
          // OK, nhưng 3 marker pending/deleted phía trên không khớp được — bằng chứng trực tiếp cho
          // giả thuyết "chờ duyệt dùng từ khác với marker đang dò", khác hẳn "JS mới dựng banner".
          looseHintsOnOk,
          hintSnippets,
        }));
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
      // v1.0.229 — log lại khi rơi vào fail-open để có dữ liệu chẩn đoán nếu marker (kể cả sau khi
      // đã normalize NFC) vẫn không khớp được lần nào đó trong tương lai — xem qua
      // chrome://extensions → GroupFlow → "service worker" → Console (không hiện trong Log UI).
      // v1.0.251 — thêm quét từ khoá RỘNG hơn (không phân biệt hoa/thường, không cần khớp cả cụm) để
      // phân biệt 2 khả năng: (a) HTML thô THẬT SỰ không mang tín hiệu gì (rất có thể do Facebook
      // dựng banner "chờ duyệt" bằng JS phía client SAU khi tải trang — fetch() ở đây không chạy JS
      // nên không bao giờ thấy được, khác hẳn lỗi marker sai chữ) — hay (b) tín hiệu CÓ mặt nhưng
      // dùng từ khác/cách viết khác với 3 marker cụm đang dò. Không tự đoán thêm marker mới ở đây —
      // chỉ log, chờ Tony gửi lại đúng đoạn console này để sửa CÓ BẰNG CHỨNG, tránh lặp lại kiểu vá
      // mù đã làm 4-5 lần (v1.0.219/220/222/229/232) mà không dứt điểm.
      const looseHints = ['duyệt', 'approv', 'pending', 'chờ', 'review'].filter((kw) => html.toLowerCase().includes(kw));
      console.warn('[GroupFlow] checkPostCommentable fail-open — không khớp marker nào', {
        postId, groupId, htmlLength: html.length, htmlHead: html.slice(0, 400), looseHints,
      });
      return { canComment: true, kind: 'ok' };
    } catch (e) {
      return { canComment: false, kind: 'pending', reason: e.message || 'Lỗi kiểm tra bài' };
    }
  },

  async readPostAccessCache() {
    const d = await chrome.storage.local.get([POST_ACCESS_CACHE_KEY, POST_ACCESS_CACHE_SCHEMA_KEY]);
    if (d[POST_ACCESS_CACHE_SCHEMA_KEY] !== POST_ACCESS_CACHE_SCHEMA) {
      await chrome.storage.local.set({ [POST_ACCESS_CACHE_KEY]: {}, [POST_ACCESS_CACHE_SCHEMA_KEY]: POST_ACCESS_CACHE_SCHEMA });
      return {};
    }
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
    // v1.0.276 — 'ok'/'deleted' BỀN vô thời hạn (không re-check bài đã OK — xem khối chú thích chỗ
    // gỡ `OK_ACCESS_TTL_MS` đầu file); chỉ 'pending' (chờ duyệt / tín hiệu mơ hồ 404/lỗi mạng) còn
    // hết hạn 20 phút để tự check lại. Khớp đúng `isPostAccessFresh()` bên sidepanel.js.
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
    // v1.0.258 — đổi sang check bằng tab thật (GF_BG.checkPostCommentableViaTab(), background.js) —
    // xem chú thích đầy đủ ở đó. `this.checkPostCommentable()` (fetch() HTML thô, KHÔNG BAO GIỜ thấy
    // được banner "chờ duyệt" do Facebook lược bớt nội dung cho request không phải điều hướng thật)
    // vẫn giữ nguyên trong file này, không xoá — dùng để so sánh/debug tay qua console nếu cần, xem
    // docs/GROUPFLOW.md. `GF_BG` tham chiếu được ở đây vì `background.js` (nơi khai báo `const
    // GF_BG`) và module này (nạp qua `importScripts('modules/swBundle.js')`) chạy CHUNG 1 global
    // scope của service worker cổ điển (không phải ES module) — không cần `globalThis.GF_BG`.
    const result = await GF_BG.checkPostCommentableViaTab({ groupId, postId, session, isTimeline });
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
