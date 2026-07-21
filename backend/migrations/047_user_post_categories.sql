-- Ngành nghề của TỪNG bài — quan hệ NHIỀU-NHIỀU (1 bài thuộc 1 hoặc nhiều ngành). Bảng nối thay cho
-- cột đơn: extension gán tập ngành khi soạn, push lên qua POST /api/user-sync/posts (category_ids[]);
-- /my-posts + /cross-posts trả GROUP_CONCAT(category_id) để lọc theo ngành cả ở tab Tạo bài lẫn
-- tab Comment (seeding). Không FK cứng tới user_posts/group_post_categories để tránh rủi ro migration;
-- xoá 1 ngành → route xoá tự DELETE các dòng nối (routes/groupCategories.js).
CREATE TABLE IF NOT EXISTS user_post_categories (
  user_post_id INT NOT NULL,
  category_id INT NOT NULL,
  PRIMARY KEY (user_post_id, category_id),
  KEY idx_upc_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
