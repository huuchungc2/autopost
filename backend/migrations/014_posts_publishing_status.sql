-- Trạng thái trung gian khi scheduler đang đăng, tránh đăng trùng
ALTER TABLE posts
  MODIFY status ENUM('draft','pending_approval','scheduled','publishing','published','failed') DEFAULT 'draft';
