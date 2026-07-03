-- Gộp group_posts (hệ JWT cũ, nuôi trang web /groups) vào user_posts (hệ license-key, nuôi Flow
-- 1/2/3 comment chéo) — 1 nguồn sự thật duy nhất, không còn 2 bảng song song cho cùng 1 sự kiện
-- "vừa đăng bài". Phần SCHEMA này luôn an toàn chạy (không phụ thuộc group_posts có tồn tại hay
-- không — cài đặt mới tinh chưa từng có group_posts vẫn cần đủ cột này cho Flow 1/2/3). Phần BACKFILL
-- dữ liệu từ group_posts nằm riêng ở 039b, chỉ chạy khi group_posts thực sự tồn tại.

ALTER TABLE user_posts
  ADD COLUMN fb_user_id VARCHAR(64) NULL AFTER post_id,
  ADD COLUMN prompt_anh TEXT NULL AFTER noi_dung,
  ADD COLUMN ngay_dang DATE NULL AFTER posted_at,
  ADD COLUMN gio_dang VARCHAR(8) NULL AFTER ngay_dang,
  ADD COLUMN fb_url VARCHAR(500) NULL AFTER gio_dang,
  ADD COLUMN comment_target INT NOT NULL DEFAULT 5 AFTER needs_comment,
  ADD COLUMN comment_count INT NOT NULL DEFAULT 0 AFTER comment_target,
  ADD COLUMN visible_after TIMESTAMP NULL AFTER comment_count;

CREATE TABLE IF NOT EXISTS user_post_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_post_id INT NOT NULL,
  commenter_user_id INT NOT NULL,
  commenter_fb_user_id VARCHAR(64) NULL,
  commented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_post_commenter (user_post_id, commenter_user_id),
  KEY idx_upc_post (user_post_id),
  KEY idx_upc_commenter (commenter_user_id),
  CONSTRAINT fk_upc_post FOREIGN KEY (user_post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_upc_commenter FOREIGN KEY (commenter_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bài đã có sẵn trước bản này không nên bị độ trễ "visible_after" mới thêm che mất — cho hiện ngay
UPDATE user_posts SET visible_after = COALESCE(posted_at, created_at, NOW()) WHERE visible_after IS NULL;
