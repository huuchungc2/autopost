-- Chạy một lần nếu DB đã tạo từ schema cũ (thiếu bảng template / cột endpoint)

CREATE TABLE IF NOT EXISTS ai_provider_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('text', 'image') NOT NULL,
  provider_kind VARCHAR(30) NOT NULL,
  api_endpoint VARCHAR(500) NOT NULL,
  default_model VARCHAR(100),
  description TEXT,
  key_label VARCHAR(100),
  key_placeholder VARCHAR(100),
  key_help TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MySQL 8+: bỏ qua lỗi nếu cột đã tồn tại
ALTER TABLE ai_providers ADD COLUMN template_id INT NULL;
ALTER TABLE ai_providers ADD COLUMN provider_kind VARCHAR(30) NULL;
ALTER TABLE ai_providers ADD COLUMN api_endpoint VARCHAR(500) NULL;

-- Sau khi chạy migration: restart backend (tự seed templates) hoặc npm run seed
