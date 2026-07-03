-- Backfill dữ liệu cũ từ group_posts/group_post_comments sang user_posts/user_post_comments —
-- CHỈ chạy khi group_posts thực sự tồn tại (deployment cũ có dữ liệu JWT). Idempotent tự nhiên
-- (WHERE NOT EXISTS / INSERT IGNORE) nên chạy lại nhiều lần vẫn an toàn.

INSERT INTO user_posts
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
