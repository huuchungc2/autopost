-- Backfill dữ liệu cũ từ group_posts/group_post_comments sang user_posts/user_post_comments —
-- CHỈ chạy khi group_posts thực sự tồn tại (deployment cũ có dữ liệu JWT). Chạy lại MỖI lần backend
-- khởi động (guard chỉ check tableExists('group_posts'), không có cờ "đã chạy xong" — xem
-- ensureUserPostsMergedGroupPosts(), migrationRunner.js) nên bắt buộc phải idempotent thật.
--
-- 2026-07-10 — lỗi thật gặp trên production: WHERE NOT EXISTS bên dưới dedupe theo
-- (group_id, post_id, user_id) — đúng định danh THẬT của 1 bài Facebook — nhưng UNIQUE KEY
-- `uq_post_group` của bảng (migration 035) lại định nghĩa theo (user_account_id, post_queue_id,
-- group_id), KHÔNG có post_id. post_queue_id luôn là '' (rỗng) ở backfill này — nên 2+ bài THẬT SỰ
-- KHÁC NHAU (post_id khác) do CÙNG 1 user đăng vào CÙNG 1 nhóm sẽ đụng unique key dù NOT EXISTS đã
-- cho qua (nó không biết gì về post_queue_id) — INSERT ném lỗi "Duplicate entry", chặn đứng TOÀN BỘ
-- các migration chạy SAU migration này (kể cả migration không liên quan gì, vì mọi ensureXxx() chạy
-- tuần tự trong cùng 1 try/catch ở app.js). Đổi sang INSERT IGNORE — bài nào đụng unique key (hiếm,
-- chỉ xảy ra với dữ liệu backfill từ hệ JWT cũ) thì bỏ qua an toàn thay vì chặn cả chuỗi migration —
-- không mất dữ liệu quan trọng vì đây chỉ là bảng LEGACY đang dọn dần, không phải đường ghi chính.
--
-- Lưu ý: bug thiết kế gốc (uq_post_group nên là (user_account_id, group_id, post_id) mới đúng định
-- danh thật của 1 bài, không phải post_queue_id) vẫn còn nguyên ở đường ghi HIỆN TẠI
-- (upsertUserPost(), groupPostService.js) — 1 user đăng 2+ bài thật khác nhau vào cùng 1 nhóm với
-- post_queue_id rỗng (phổ biến khi sync từ máy khác/không có queue nội bộ) vẫn có thể bị INSERT
-- lỗi âm thầm (nuốt lỗi ở vòng lặp POST /user-sync/posts, routes/userSync.js) — cần 1 migration
-- riêng đổi lại unique key nếu muốn sửa dứt điểm, chưa làm ở đây để tránh đổi index đang dùng khi
-- chưa có xác nhận rõ ràng.

INSERT IGNORE INTO user_posts
  (user_account_id, post_queue_id, group_id, group_name, post_id, fb_user_id, noi_dung, prompt_anh,
   posted_at, ngay_dang, gio_dang, fb_url, needs_comment, comment_target, comment_count, visible_after, created_at)
SELECT
  gp.user_id, '', gp.group_id, gp.group_name, gp.post_id, gp.fb_user_id, gp.noi_dung, gp.prompt_anh,
  gp.posted_at, gp.ngay_dang, gp.gio_dang, gp.fb_url, 1, 5, 0, COALESCE(gp.posted_at, gp.created_at, NOW()), gp.created_at
FROM group_posts gp
WHERE NOT EXISTS (
  SELECT 1 FROM user_posts up2
  WHERE up2.group_id = gp.group_id AND up2.post_id = gp.post_id AND up2.user_account_id = gp.user_id
);

INSERT IGNORE INTO user_post_comments (user_post_id, commenter_user_id, commenter_fb_user_id, commented_at)
SELECT up.id, gpc.commenter_user_id, gpc.commenter_fb_user_id, gpc.commented_at
FROM group_post_comments gpc
JOIN group_posts gp ON gp.id = gpc.group_post_id
JOIN user_posts up ON up.group_id = gp.group_id AND up.post_id = gp.post_id AND up.user_account_id = gp.user_id;

-- Tính lại comment_count từ nguồn sự thật (user_post_comments) cho MỌI bài, kể cả bài vốn đã có
-- sẵn trong user_posts từ trước (không chỉ bài vừa backfill)
UPDATE user_posts up
LEFT JOIN (
  SELECT user_post_id, COUNT(*) AS cnt FROM user_post_comments GROUP BY user_post_id
) c ON c.user_post_id = up.id
SET up.comment_count = COALESCE(c.cnt, 0);
