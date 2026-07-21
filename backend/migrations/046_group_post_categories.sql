-- Danh mục ngành nghề dùng chung cho GroupFlow (đồng nhất toàn hệ thống). Admin quản lý trên website;
-- extension kéo về qua GET /api/user-sync/categories (license-key auth) để hiện dropdown gán ngành +
-- bộ lọc. Global (không per-user) — mọi group_user dùng chung 1 vocabulary.
CREATE TABLE IF NOT EXISTS group_post_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gpc_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed vài ngành phổ biến để danh sách không trống lúc đầu — admin tự sửa/xoá/thêm sau.
INSERT INTO group_post_categories (name, sort_order) VALUES
  ('Bất động sản', 1),
  ('Ăn uống', 2),
  ('Du lịch', 3),
  ('Vận tải - Đặt xe', 4),
  ('Spa & Làm đẹp', 5),
  ('Thời trang', 6),
  ('Mẹ & Bé', 7),
  ('Ô tô - Xe máy', 8),
  ('Giáo dục', 9),
  ('Sức khỏe', 10),
  ('Việc làm', 11),
  ('Phần mềm - Công nghệ', 12),
  ('Marketing', 13),
  ('Khác', 14);
