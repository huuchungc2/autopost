-- Phân quyền website (blog) theo user — mirror đúng pattern user_pages (migration 001).
-- Trước đây bài platform='website' KHÔNG phân quyền: assertPostAccess() cho mọi user đăng nhập đi qua
-- vì chưa có bảng này. Giờ user thường chỉ thấy/sửa bài của website được gán; super_admin thấy tất cả.
CREATE TABLE IF NOT EXISTS user_websites (
  user_id INT NOT NULL,
  website_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, website_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
