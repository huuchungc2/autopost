import express from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticateLicenseKey } from '../middleware/licenseAuth.js';
import { upsertUserPost, VISIBLE_AFTER_MAX_MINUTES } from '../services/groupPostService.js';
import { getEffectivePostsSyncLookbackDays, getEffectiveGroupflowAnnouncement } from '../services/appSettingsService.js';

const router = express.Router();

// 2026-07-13 — Tony: bài viết cũ hơn N ngày (kể từ NGÀY ĐĂNG — posted_at, không phải updated_at)
// không nên tải về extension nữa (giảm tải server) — N cấu hình qua Cài đặt (super_admin), mặc định
// 60 ngày (getEffectivePostsSyncLookbackDays(), appSettingsService.js), thay cho hardcode cứng cũ.
// Áp dụng cho CẢ /my-posts (bài của chính mình) lẫn /cross-posts (bài đồng đội) — vì cả 2 đều là
// nguồn extension dùng để quyết định bài nào cần tự check "còn comment được không"
// (warmPostAccessCache(), background.js) — bài không được sync về thì tự nhiên không nằm trong
// hàng đợi check nữa, không cần thêm điều kiện lọc riêng ở phía check.
function getPostsSyncLookbackFloor() {
  return new Date(Date.now() - getEffectivePostsSyncLookbackDays() * 24 * 60 * 60 * 1000);
}

// GET /api/user-sync/config — extension đọc lại đúng số ngày N đang cấu hình (Cài đặt website) để
// tự áp CÙNG luật ẩn/không-check ở phía client cho những bài ĐÃ LỠ nằm sẵn trong cache cục bộ
// (postQueue/serverMyPosts/crossPostsCache — merge cộng dồn, server ngừng trả bài cũ không tự xoá
// được các bài đã cache trước đó) — không có route này, extension không có cách nào biết N hiện tại
// đang là bao nhiêu để tự lọc theo cùng ngưỡng.
router.get('/config', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const ann = getEffectiveGroupflowAnnouncement();
  res.json({
    posts_sync_lookback_days: getEffectivePostsSyncLookbackDays(),
    // Thông báo website → extension (null nếu admin không bật) + latest_version để cảnh báo bản mới.
    announcement: ann.announcement,
    latest_version: ann.latest_version || null,
  });
}));

// GET /api/user-sync/categories — extension kéo danh mục ngành nghề dùng chung (quản lý trên website,
// xem routes/groupCategories.js) để hiện dropdown gán ngành + bộ lọc. Read-only phía extension.
router.get('/categories', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id, name FROM group_post_categories ORDER BY sort_order ASC, name ASC'
  ).catch(() => []);
  res.json(rows);
}));

// POST /api/user-sync/posts — Flow 2 (đồng bộ sau khi đăng bài). Dùng chung upsertUserPost() với
// POST /group-posts/sync (routes/groupPosts.js) — cùng 1 bảng user_posts, khớp theo
// (user_account_id, group_id, post_id) chứ không phải post_queue_id, để 2 đường push không tạo 2
// dòng trùng cho cùng 1 bài thật (xem chú thích upsertUserPost() trong groupPostService.js).
router.post('/posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const { posts } = req.body;
  if (!Array.isArray(posts) || !posts.length) return res.json({ ok: true, inserted: 0 });

  let inserted = 0;
  // Trần 200 — không như /activity (đã cap sẵn .slice(0,100)), route này trước đây KHÔNG có cap
  // nào, mỗi phần tử tốn 2 query tuần tự (SELECT rồi INSERT/UPDATE, xem upsertUserPost()) — client
  // lỗi/cũ gửi mảng cực lớn (vd resync toàn bộ postQueue tích lũy nhiều năm) sẽ tự tạo hàng trăm-
  // nghìn query tuần tự trong 1 request duy nhất. Extension đã tự giới hạn chỉ gửi item CHƯA sync
  // (xem CHANGELOG — sửa cùng đợt), 200 là biên an toàn phía server, không phụ thuộc client đúng.
  for (const p of posts.slice(0, 200)) {
    if (!p.post_id || !p.group_id) continue;
    try {
      await upsertUserPost(req.userAccount.id, {
        group_id: String(p.group_id),
        group_name: p.group_name || null,
        post_id: String(p.post_id),
        noi_dung: p.noi_dung || null,
        posted_at: p.posted_at || null,
        post_queue_id: p.post_queue_id || '',
        // FB uid của tài khoản/Fanpage đã đăng bài (extension gửi kèm từ 2026-07-15) — nuôi cột
        // `fb_user_id` để /cross-posts trả `user_fb_id` cho tag tác giả bấm-mở-profile; optional,
        // thiếu thì COALESCE giữ giá trị cũ (upsertUserPost).
        fb_user_id: p.fb_user_id ? String(p.fb_user_id) : undefined,
        // "Báo hộ" trạng thái chờ duyệt cho đồng đội (xem GET /cross-posts) — optional, chỉ
        // extension của CHÍNH CHỦ bài mới gửi field này (đã tự check quyền comment trên bài của
        // mình). `undefined` khi client không gửi (mọi lần sync thường) → upsertUserPost() giữ
        // nguyên giá trị cũ, không tự xoá cờ.
        pending_approval: typeof p.pending_approval === 'boolean' ? p.pending_approval : undefined,
        // Ngành nghề nhiều-nhiều (đồng bộ đầy đủ, 2026-07-15) — MẢNG id ngành. Có gửi (kể cả [] để gỡ
        // hết) → thay toàn bộ tập ngành của bài; `undefined` (client cũ không gửi) → giữ nguyên.
        category_ids: Array.isArray(p.category_ids) ? p.category_ids : undefined,
      });
      inserted++;
    } catch { /* best-effort, tiếp tục bài khác */ }
  }
  res.json({ ok: true, inserted });
}));

// GET /api/user-sync/my-posts — kéo bài của chính mình từ server về extension (multi-device sync).
//
// Cursor theo `updated_at` (không phải `created_at`) — v1.0.185: `created_at` chỉ bắt được bài MỚI,
// không bao giờ bắt lại được 1 bài cũ vừa đổi `needs_comment` (comment ở thiết bị khác) vì created_at
// không đổi theo. Không có `since` (lần đầu / cold start) → trả cửa sổ mới nhất (DESC, hành vi cũ);
// có `since` → trả phần đã ĐỔI kể từ mốc đó theo thứ tự tăng dần để client tiến cursor an toàn
// (client set cursor mới = updated_at lớn nhất trong lô nhận được, xem pullMyPostsFromServer()).
router.get('/my-posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const since = req.query.since ? new Date(req.query.since) : null;
  const lookbackFloor = getPostsSyncLookbackFloor();
  // COALESCE(posted_at, created_at) — không dùng `posted_at` thô: cột này CÓ THỂ NULL cho bài cũ
  // (extension cũ chưa gửi kịp trường này, hoặc dữ liệu backfill thiếu — xem pattern y hệt đã dùng
  // ở groupPostService.js listUserPosts()). Nếu lọc bằng `posted_at > ?` thô, MySQL coi so sánh với
  // NULL là unknown (loại khỏi kết quả) — bài đó biến mất VĨNH VIỄN khỏi sync dù có thể mới tạo gần
  // đây (created_at gần), không liên quan gì tới tuổi bài thật.
  const rows = since
    ? await query(
        `SELECT id, post_queue_id, group_id, group_name, post_id, noi_dung, posted_at, needs_comment,
                pending_approval, pending_checked_at, created_at, updated_at,
                (SELECT GROUP_CONCAT(category_id) FROM user_post_categories WHERE user_post_id = user_posts.id) AS category_ids
         FROM user_posts WHERE user_account_id = ? AND updated_at > ? AND COALESCE(posted_at, created_at) > ?
         ORDER BY updated_at ASC LIMIT ?`,
        [req.userAccount.id, since, lookbackFloor, limit]
      )
    : await query(
        `SELECT id, post_queue_id, group_id, group_name, post_id, noi_dung, posted_at, needs_comment,
                pending_approval, pending_checked_at, created_at, updated_at,
                (SELECT GROUP_CONCAT(category_id) FROM user_post_categories WHERE user_post_id = user_posts.id) AS category_ids
         FROM user_posts WHERE user_account_id = ? AND COALESCE(posted_at, created_at) > ?
         ORDER BY updated_at DESC LIMIT ?`,
        [req.userAccount.id, lookbackFloor, limit]
      );
  res.json(rows);
}));

// GET /api/user-sync/cross-posts — Flow 1 (đồng bộ bài để đi comment).
//
// v1.0.201 — Tony chốt rõ: "1 bài ai thích comment bao nhiêu là tùy chứ mắc gì đặt comment target
// thiết kế này để làm gì, không giới hạn". Bỏ hẳn điều kiện `comment_count < comment_target` khỏi
// WHERE — không còn khoá bài lại sau khi đủ N người khác nhau comment. Điều kiện duy nhất còn lại
// quyết định "còn cần comment không" là `NOT EXISTS (chính tôi đã comment)` — tức 1 bài chỉ ẩn khỏi
// cross-posts của MỘT NGƯỜI sau khi CHÍNH người đó đã comment rồi, không còn đóng lại cho TẤT CẢ
// mọi người chỉ vì đã đủ target. Giữ nguyên cột `comment_target`/`comment_count` trong DB (thông
// tin thống kê "đã có bao nhiêu người comment", vô hại) — chỉ bỏ vai trò GATE của nó, không xoá
// cột/migration (tránh thay đổi schema không cần thiết cho 1 quyết định hành vi).
//   1. `visible_after <= NOW()` — bài mới có độ trễ ngẫu nhiên trước khi lộ diện (né dấu hiệu
//      comment-ring, tạo hiệu ứng "từ từ" đúng nghĩa sản phẩm), xem upsertUserPost().
//   2. Ưu tiên `comment_count ASC` (bài đang có ít người comment nhất) trước `posted_at`/`updated_at`
//      — chỉ để dàn đều lượt comment, không phải để khoá bài — tránh dồn hết vào bài mới nhất của
//      người đăng nhiều, bỏ quên bài của người đăng ít.
// Trần lookback cho query bên dưới — không có cột nào index `visible_after`/`comment_count`
// (audit 2026-07-06, xem CHANGELOG), nên nếu không chặn cửa sổ thời gian, WHERE chỉ còn lọc được
// bằng `updated_at` (đã có index `idx_user_posts_updated`) — thiếu chặn này, 1 request cold-start
// (thiết bị mới/`since` rỗng) hoặc 1 thiết bị lâu ngày chưa mở app (`since` cũ) phải quét TOÀN BỘ
// lịch sử `user_posts` của MỌI user rồi filesort — chi phí tăng vô hạn theo thời gian hệ thống tồn
// tại, bất kể user đó có bao nhiêu bài. Số ngày lấy từ getEffectivePostsSyncLookbackDays() (Cài đặt
// → super_admin, mặc định 60) thay vì hardcode cứng — đủ rộng để không bỏ sót bài thật (bài cũ hơn
// gần như chắc chắn đã được ai đó comment hoặc hết liên quan) mà vẫn chặn được chi phí tăng vô hạn.

// 2026-07-10 — REVERT hướng "loại bài chờ duyệt" (opt-out) sang "chỉ gửi bài đã CONFIRM" (opt-in).
// Lý do đảo hẳn hướng: bài "bị hạn chế xem" (không phải chờ duyệt, mà nhóm riêng tư/đã đổi audience/
// đã xóa) hiện trang khóa trắng KHÔNG CÓ BẤT KỲ THÔNG TIN GÌ cho người KHÔNG PHẢI chủ bài — nên
// extension của ĐỒNG ĐỘI tự check bài đó (fetch nhẹ, không chạy JS) LUÔN fail-open (đoán bừa
// "commentable") vì không dò được gì cả — không có cách nào sửa được ở phía đồng đội (Tony xác nhận
// bằng nhiều bài chụp thật). Chỉ CHỦ BÀI mới check đáng tin (Facebook luôn cho chủ bài xem thật, kể
// cả bài chờ duyệt — chỉ khác 1 banner nhỏ) — nên đảo lại: CHỦ BÀI check + báo kết quả lên server
// (piggyback POST /posts, upsertUserPost()) cho MỌI kết quả (cả 'ok' lẫn 'pending', không chỉ
// 'pending' như thiết kế opt-out cũ) — GET /cross-posts giờ CHỈ gửi bài đã có `pending_approval=0`
// VÀ `pending_checked_at` (chủ bài đã tự confirm KHÔNG chờ duyệt) — bài chưa được chủ bài
// check tới (dù có thể thực ra bình thường) tạm thời KHÔNG hiện cho đồng đội cho tới khi chủ bài
// check xong — đánh đổi "chậm lộ diện hơn" lấy "không bao giờ hiện sai nữa" (đúng yêu cầu: "check
// được bài nào thì hiện bài đó, còn lại để đó, cứ check dần theo cron").
//
// 2026-07-15 — BỎ HẲN hạn 6 giờ (`OK_CONFIRMED_TTL_MS`/`okConfirmedFloor` cũ). Tony chốt lại: "thằng
// Lâu đã tự duyệt 26 bài OK đồng bộ lên website thì mọi người ở phần đồng đội phải thấy 26 bài —
// bài nào đã duyệt thì mọi người phải được đồng bộ về nếu nó chưa quá N ngày". Trước đó hạn 6h khiến
// máy chủ bài tắt quá 6 tiếng là TOÀN BỘ bài của người đó biến mất khỏi tab Đồng đội của mọi người
// (và là lý do số đếm mỗi máy mỗi khác — 20 vs 24). Giờ: xác nhận OK 1 lần là hiện cho tới khi quá
// N ngày (lookbackFloor). Nhiệm vụ thứ 2 của hạn 6h cũ (gỡ bài ĐÃ TỪNG OK nhưng sau đó chuyển
// xấu — chủ bài recheck thấy chờ duyệt/khoá) được thay bằng cơ chế chính xác hơn: nhánh sync TĂNG
// DẦN (`since`) trả CẢ bài `pending_approval = 1` (SELECT thêm field này) — client
// (fetchCrossPostsFromServer(), sidepanel.js) nhận được là tự gỡ khỏi cache, thay vì đoán mò theo
// tuổi xác nhận. Nhánh cold-start (thiết bị mới, cache trống) vẫn chỉ trả bài OK — bài xấu không có
// gì để gỡ. Lưới an toàn cuối: máy đồng đội comment trúng bài xấu (chủ bài offline chưa kịp báo)
// thì timeout 1 lần là tự đánh dấu bỏ qua cục bộ (v1.0.267).
router.get('/cross-posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const requestedSince = req.query.since ? new Date(req.query.since) : null;
  const lookbackFloor = getPostsSyncLookbackFloor();
  // Bug đã gặp thật: client (fetchCrossPostsFromServer(), sidepanel.js) đẩy cursor `since` = MAX
  // updated_at của các bài ĐÃ THẤY (visible) trong lượt gọi trước — nhưng `visible_after` (độ trễ
  // ngẫu nhiên 5-60', xem randomVisibleAfter() ở trên) không đồng bộ với updated_at. Nếu 1 bài A
  // (updated_at sớm hơn) có độ trễ dài hơn 1 bài B (updated_at trễ hơn A) đăng SAU nó nhưng có độ
  // trễ ngắn hơn, B lộ diện trước và đẩy cursor vượt qua A trước khi A kịp lộ diện — A bị cursor
  // "since > updated_at" loại vĩnh viễn ở mọi lần gọi sau, dù visible_after của A rồi cũng qua NOW().
  // Chặn floor của since ở NOW() - VISIBLE_AFTER_MAX_MINUTES: mọi bài update trong cửa sổ này luôn
  // được quét lại (an toàn, dư vài phần tử không đáng kể) — bài cũ hơn cửa sổ này thì visible_after
  // của nó chắc chắn đã ngã ngũ (tối đa 60' sau updated_at) nên bỏ qua vẫn đúng. Kẹp thêm CẬN DƯỚI
  // (lookbackFloor) — nếu 1 thiết bị không mở app cả tháng, `since` cũ không được để scan lùi vô hạn.
  const safetyFloor = new Date(Date.now() - VISIBLE_AFTER_MAX_MINUTES * 60_000);
  const since = requestedSince
    ? new Date(Math.max(Math.min(requestedSince.getTime(), safetyFloor.getTime()), lookbackFloor.getTime()))
    : null;
  const myId = req.userAccount.id;
  // 2026-07-13 — Tony chốt rõ: "tao có X bài kiểm tra được phép comment thì luôn hiển thị X ở đồng
  // đội của người khác" — bài ĐÃ được TÔI bình luận rồi vẫn phải tiếp tục hiện (không biến mất khỏi
  // tổng số), vì mục tiêu là "đẩy bài" (thấy đủ toàn bộ số bài đã duyệt của đồng đội), không phải
  // danh sách việc-cần-làm thu hẹp dần. TRƯỚC ĐÂY `NOT EXISTS (...)` ở WHERE loại hẳn bài tôi đã
  // comment khỏi kết quả — khiến tổng số bài hiện ra cho MỖI người xem KHÁC NHAU tuỳ người đó đã tự
  // comment bao nhiêu bài rồi (đúng con số 24 vs 17 Tony chỉ ra, cùng 1 người nhưng 2 máy thấy 2 số
  // khác nhau) — gây hiểu lầm tưởng lỗi đồng bộ. Bỏ điều kiện này khỏi WHERE — mọi bài đã duyệt của
  // MỌI người khác đều luôn trả về, không phụ thuộc người xem đã tự comment hay chưa.
  // AND COALESCE(up.posted_at, up.created_at) > ? (lookbackFloor) — bài đăng cũ hơn N ngày (kể từ
  // NGÀY ĐĂNG, không phải lần sửa gần nhất) không còn trả về cho đồng đội nữa, xem
  // getPostsSyncLookbackFloor() phía trên. Dùng COALESCE(posted_at, created_at) chứ không phải
  // `posted_at` thô — cột này CÓ THỂ NULL cho bài cũ (extension cũ chưa gửi kịp trường này, dữ liệu
  // backfill thiếu — cùng pattern đã dùng ở groupPostService.js listUserPosts()); lọc bằng cột NULL
  // trực tiếp sẽ khiến bài đó biến mất vĩnh viễn khỏi kết quả, không liên quan gì tuổi bài thật.
  // `pending_approval = 0` CHỈ nằm ở nhánh cold-start (ghép thêm bên dưới) — nhánh incremental cố ý
  // trả cả bài vừa chuyển pending để client gỡ khỏi cache (xem chú thích 2026-07-15 phía trên).
  const baseWhere = `up.user_account_id != ?
    AND up.visible_after <= NOW()
    AND up.pending_checked_at IS NOT NULL
    AND COALESCE(up.posted_at, up.created_at) > ?`;
  // `needs_comment` giờ tính THẬT theo đúng người đang hỏi (myId) thay vì hardcode `1` — client
  // (`isCommentDone()`, sidepanel.js: `c._source === 'cross' ? c._needsComment === false`) đã có sẵn
  // hạ tầng đọc field này để đánh dấu tag "✓ Đã comment" mà KHÔNG lọc mất khỏi danh sách/tổng số —
  // hạ tầng này từng được xây rồi bị bỏ dở dang khi NOT EXISTS ở WHERE làm field này thành vô nghĩa
  // (luôn ra 1 vì hàng đã bị loại từ WHERE rồi thì querynày không bao giờ thấy hàng needs_comment=0).
  // `up.fb_user_id AS user_fb_id` (2026-07-15) — FB uid của TÁC GIẢ bài (ghi lúc extension sync
  // bài lên, migration 039) — extension dùng để render tên tác giả thành link mở thẳng profile
  // Facebook (tag ↔ trên card Comment + Lịch sử), có thể NULL với bài cũ/extension cũ chưa gửi.
  // `up.pending_approval` trong SELECT (2026-07-15) — client cần field này để phân biệt "bài OK"
  // với "bài vừa chuyển chờ duyệt" trong cùng 1 response incremental (xem chú thích đầu route).
  const selectFields = `up.id, up.post_queue_id, up.group_id, up.group_name,
                (SELECT GROUP_CONCAT(upc2.category_id) FROM user_post_categories upc2 WHERE upc2.user_post_id = up.id) AS category_ids,
                up.post_id, up.noi_dung, up.posted_at, up.updated_at,
                up.comment_count, up.comment_target, up.pending_checked_at,
                up.pending_approval,
                up.fb_user_id AS user_fb_id,
                (NOT EXISTS (
                  SELECT 1 FROM user_post_comments upc
                  WHERE upc.user_post_id = up.id AND upc.commenter_user_id = ?
                )) AS needs_comment,
                u.name AS user_name, u.email AS user_email`;
  const rows = since
    ? await query(
        `SELECT ${selectFields}
         FROM user_posts up
         JOIN users u ON u.id = up.user_account_id
         WHERE ${baseWhere} AND up.updated_at > ?
         ORDER BY up.comment_count ASC, up.updated_at ASC
         LIMIT ?`,
        [myId, myId, lookbackFloor, since, limit]
      )
    // Cold-start (thiết bị mới, chưa có cursor) — giữ nguyên thứ tự ưu tiên cũ (bài mới nhất
    // trước), chỉ thêm bound `updated_at` (dùng chung idx_user_posts_updated) để tận dụng index
    // thay vì quét hết bảng — không đổi kết quả trả về so với chỉ lọc bằng posted_at, chỉ khác khi
    // hệ thống đã chạy lâu và có bài rất cũ (vốn cũng hiếm khi còn cần comment). Chỉ nhánh này lọc
    // `pending_approval = 0` — cache đang trống, bài xấu không có gì để gỡ, trả về chỉ tốn băng thông.
    : await query(
        `SELECT ${selectFields}
         FROM user_posts up
         JOIN users u ON u.id = up.user_account_id
         WHERE ${baseWhere} AND up.pending_approval = 0 AND up.updated_at > ?
         ORDER BY up.comment_count ASC, up.posted_at DESC
         LIMIT ?`,
        [myId, myId, lookbackFloor, lookbackFloor, limit]
      );
  res.json(rows);
}));

// PATCH /api/user-sync/posts/:id/commented — Flow 3 (đồng bộ sau khi comment xong). v1.0.187 —
// đổi từ UPDATE cờ boolean sang INSERT vào bảng join user_post_comments (UNIQUE theo
// user_post_id+commenter_user_id nên gọi lại nhiều lần vẫn an toàn, không đếm trùng 1 người 2 lần)
// rồi tính lại comment_count từ CHÍNH bảng join đó (nguồn sự thật duy nhất) — cho phép nhiều người
// KHÁC NHAU cùng comment 1 bài thay vì người đầu tiên đóng bài lại cho tất cả.
router.patch('/posts/:id/commented', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const postId = req.params.id;
  const posts = await query('SELECT id FROM user_posts WHERE id = ? AND user_account_id != ?', [postId, req.userAccount.id]);
  if (!posts[0]) return res.json({ ok: true, comment_count: 0 });

  await query(
    `INSERT IGNORE INTO user_post_comments (user_post_id, commenter_user_id, commenter_fb_user_id)
     VALUES (?, ?, ?)`,
    [postId, req.userAccount.id, req.body?.commenter_fb_user_id || null]
  );
  const [countRow] = await query(
    'SELECT COUNT(*) AS cnt FROM user_post_comments WHERE user_post_id = ?',
    [postId]
  );
  const commentCount = Number(countRow?.cnt) || 0;
  await query('UPDATE user_posts SET comment_count = ? WHERE id = ?', [commentCount, postId]);
  res.json({ ok: true, comment_count: commentCount });
}));

// POST /api/user-sync/activity — extension đẩy Log/Lịch sử cục bộ lên, đồng bộ theo license key
router.post('/activity', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) return res.json({ ok: true, inserted: 0 });

  let inserted = 0;
  for (const e of entries.slice(0, 100)) {
    if (!e.client_entry_id || !e.occurred_at) continue;
    try {
      await query(
        `INSERT IGNORE INTO user_activity_log
           (user_account_id, client_entry_id, type, ok, snippet, group_id, group_name, post_id, author_name, author_fb_id, url, error, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.userAccount.id,
          String(e.client_entry_id).slice(0, 64),
          String(e.type || 'post').slice(0, 20),
          e.ok === false ? 0 : 1,
          e.snippet ? String(e.snippet).slice(0, 255) : null,
          e.group_id ? String(e.group_id).slice(0, 64) : null,
          e.group_name ? String(e.group_name).slice(0, 255) : null,
          e.post_id ? String(e.post_id).slice(0, 64) : null,
          e.author_name ? String(e.author_name).slice(0, 255) : null,
          e.author_fb_id ? String(e.author_fb_id).slice(0, 64) : null,
          e.url ? String(e.url).slice(0, 500) : null,
          e.error ? String(e.error).slice(0, 800) : null,
          new Date(e.occurred_at),
        ]
      );
      inserted++;
    } catch { /* ignore duplicate/invalid */ }
  }
  res.json({ ok: true, inserted });
}));

// POST /api/user-sync/log-report — extension gửi TOÀN BỘ tab Nhật ký (engineLog cục bộ) lên server
// qua nút bấm thủ công (không tự động — GroupFlow chạy trên máy riêng của từng người, im lặng đẩy
// log liên tục sẽ vừa tốn traffic/DB vừa dễ lộ nội dung bài/nhóm không cần thiết mỗi khi có lỗi vặt).
// Giới hạn CỨNG 1 lần/ngày/thiết bị ngay ở DB (UNIQUE device_id+report_date, migration 050) — bấm
// thêm trong ngày cùng 1 máy sẽ nhận 409, KHÔNG dựa vào client tự giác không bấm lại.
router.post('/log-report', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const { device_id, device_label, extension_version, entries } = req.body;
  if (!device_id) return res.status(400).json({ error: 'Thiếu device_id' });
  if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: 'Không có log để gửi' });

  const capped = entries.slice(0, 400);
  const reportDate = new Date().toISOString().slice(0, 10);
  try {
    await query(
      `INSERT INTO groupflow_log_reports
         (user_id, device_id, device_label, extension_version, entry_count, entries_json, report_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userAccount.id,
        String(device_id).slice(0, 64),
        device_label ? String(device_label).slice(0, 255) : null,
        extension_version ? String(extension_version).slice(0, 20) : null,
        capped.length,
        JSON.stringify(capped),
        reportDate,
      ]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Máy này đã gửi log hôm nay rồi — mai gửi tiếp' });
    }
    throw e;
  }
  res.json({ ok: true, sent: capped.length });
}));

// GET /api/user-sync/activity — kéo Log/Lịch sử của chính license key này (đa thiết bị), KHÔNG chia sẻ cross-user
router.get('/activity', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 300);
  const since = req.query.since ? new Date(req.query.since) : null;
  const rows = await query(
    `SELECT id, type, ok, snippet, group_id, group_name, post_id, author_name, author_fb_id, url, error, occurred_at, created_at
     FROM user_activity_log WHERE user_account_id = ?${since ? ' AND created_at > ?' : ''}
     ORDER BY occurred_at DESC LIMIT ?`,
    since ? [req.userAccount.id, since, limit] : [req.userAccount.id, limit]
  );
  res.json(rows);
}));

export default router;
