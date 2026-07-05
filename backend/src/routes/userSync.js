import express from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticateLicenseKey } from '../middleware/licenseAuth.js';
import { upsertUserPost, VISIBLE_AFTER_MAX_MINUTES } from '../services/groupPostService.js';

const router = express.Router();

// POST /api/user-sync/posts — Flow 2 (đồng bộ sau khi đăng bài). Dùng chung upsertUserPost() với
// POST /group-posts/sync (routes/groupPosts.js) — cùng 1 bảng user_posts, khớp theo
// (user_account_id, group_id, post_id) chứ không phải post_queue_id, để 2 đường push không tạo 2
// dòng trùng cho cùng 1 bài thật (xem chú thích upsertUserPost() trong groupPostService.js).
router.post('/posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const { posts } = req.body;
  if (!Array.isArray(posts) || !posts.length) return res.json({ ok: true, inserted: 0 });

  let inserted = 0;
  for (const p of posts) {
    if (!p.post_id || !p.group_id) continue;
    try {
      await upsertUserPost(req.userAccount.id, {
        group_id: String(p.group_id),
        group_name: p.group_name || null,
        post_id: String(p.post_id),
        noi_dung: p.noi_dung || null,
        posted_at: p.posted_at || null,
        post_queue_id: p.post_queue_id || '',
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
  const rows = since
    ? await query(
        `SELECT id, post_queue_id, group_id, group_name, post_id, noi_dung, posted_at, needs_comment, created_at, updated_at
         FROM user_posts WHERE user_account_id = ? AND updated_at > ?
         ORDER BY updated_at ASC LIMIT ?`,
        [req.userAccount.id, since, limit]
      )
    : await query(
        `SELECT id, post_queue_id, group_id, group_name, post_id, noi_dung, posted_at, needs_comment, created_at, updated_at
         FROM user_posts WHERE user_account_id = ?
         ORDER BY updated_at DESC LIMIT ?`,
        [req.userAccount.id, limit]
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
router.get('/cross-posts', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const requestedSince = req.query.since ? new Date(req.query.since) : null;
  // Bug đã gặp thật: client (fetchCrossPostsFromServer(), sidepanel.js) đẩy cursor `since` = MAX
  // updated_at của các bài ĐÃ THẤY (visible) trong lượt gọi trước — nhưng `visible_after` (độ trễ
  // ngẫu nhiên 5-60', xem randomVisibleAfter() ở trên) không đồng bộ với updated_at. Nếu 1 bài A
  // (updated_at sớm hơn) có độ trễ dài hơn 1 bài B (updated_at trễ hơn A) đăng SAU nó nhưng có độ
  // trễ ngắn hơn, B lộ diện trước và đẩy cursor vượt qua A trước khi A kịp lộ diện — A bị cursor
  // "since > updated_at" loại vĩnh viễn ở mọi lần gọi sau, dù visible_after của A rồi cũng qua NOW().
  // Chặn floor của since ở NOW() - VISIBLE_AFTER_MAX_MINUTES: mọi bài update trong cửa sổ này luôn
  // được quét lại (an toàn, dư vài phần tử không đáng kể) — bài cũ hơn cửa sổ này thì visible_after
  // của nó chắc chắn đã ngã ngũ (tối đa 60' sau updated_at) nên bỏ qua vẫn đúng.
  const safetyFloor = new Date(Date.now() - VISIBLE_AFTER_MAX_MINUTES * 60_000);
  const since = requestedSince
    ? new Date(Math.min(requestedSince.getTime(), safetyFloor.getTime()))
    : null;
  const myId = req.userAccount.id;
  const baseWhere = `up.user_account_id != ?
    AND up.visible_after <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM user_post_comments upc
      WHERE upc.user_post_id = up.id AND upc.commenter_user_id = ?
    )`;
  const selectFields = `up.id, up.post_queue_id, up.group_id, up.group_name,
                up.post_id, up.noi_dung, up.posted_at, up.updated_at,
                up.comment_count, up.comment_target,
                1 AS needs_comment,
                u.name AS user_name, u.email AS user_email`;
  const rows = since
    ? await query(
        `SELECT ${selectFields}
         FROM user_posts up
         JOIN users u ON u.id = up.user_account_id
         WHERE ${baseWhere} AND up.updated_at > ?
         ORDER BY up.comment_count ASC, up.updated_at ASC
         LIMIT ?`,
        [myId, myId, since, limit]
      )
    : await query(
        `SELECT ${selectFields}
         FROM user_posts up
         JOIN users u ON u.id = up.user_account_id
         WHERE ${baseWhere}
         ORDER BY up.comment_count ASC, up.posted_at DESC
         LIMIT ?`,
        [myId, myId, limit]
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
           (user_account_id, client_entry_id, type, ok, snippet, group_id, group_name, post_id, url, error, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.userAccount.id,
          String(e.client_entry_id).slice(0, 64),
          String(e.type || 'post').slice(0, 20),
          e.ok === false ? 0 : 1,
          e.snippet ? String(e.snippet).slice(0, 255) : null,
          e.group_id ? String(e.group_id).slice(0, 64) : null,
          e.group_name ? String(e.group_name).slice(0, 255) : null,
          e.post_id ? String(e.post_id).slice(0, 64) : null,
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

// GET /api/user-sync/activity — kéo Log/Lịch sử của chính license key này (đa thiết bị), KHÔNG chia sẻ cross-user
router.get('/activity', authenticateLicenseKey, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 300);
  const since = req.query.since ? new Date(req.query.since) : null;
  const rows = await query(
    `SELECT id, type, ok, snippet, group_id, group_name, post_id, url, error, occurred_at, created_at
     FROM user_activity_log WHERE user_account_id = ?${since ? ' AND created_at > ?' : ''}
     ORDER BY occurred_at DESC LIMIT ?`,
    since ? [req.userAccount.id, since, limit] : [req.userAccount.id, limit]
  );
  res.json(rows);
}));

export default router;
