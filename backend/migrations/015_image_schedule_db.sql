-- Cấu hình lịch xuất ảnh AI (singleton, giờ Việt Nam)
CREATE TABLE IF NOT EXISTS image_schedule_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  start_hour TINYINT UNSIGNED NOT NULL DEFAULT 1,
  start_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  end_hour TINYINT UNSIGNED NOT NULL DEFAULT 5,
  end_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  last_run_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO image_schedule_settings (id, enabled, start_hour, start_minute, end_hour, end_minute, interval_minutes, timezone)
VALUES (1, true, 1, 0, 5, 0, 10, 'Asia/Ho_Chi_Minh')
ON DUPLICATE KEY UPDATE id = id;

-- Log từng lần chạy job xuất ảnh
CREATE TABLE IF NOT EXISTS image_generate_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL,
  source ENUM('schedule','manual','publish') NOT NULL DEFAULT 'schedule',
  status ENUM('processing','done','cancelled') NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  INDEX idx_image_generate_logs_post (post_id),
  INDEX idx_image_generate_logs_created (created_at)
);

-- Trạng thái job xuất ảnh trên bài (pending → processing → done | failed)
ALTER TABLE posts
  ADD COLUMN image_job_status ENUM('pending','processing','done','failed') NULL DEFAULT NULL AFTER auto_generate_image;

-- Bài cũ có prompt + auto_generate nhưng chưa có ảnh → chờ job
UPDATE posts
SET image_job_status = 'pending'
WHERE (image_url IS NULL OR image_url = '')
  AND image_prompt IS NOT NULL AND TRIM(image_prompt) != ''
  AND auto_generate_image = true
  AND image_job_status IS NULL
  AND status IN ('scheduled', 'draft', 'pending_approval')
  AND media_type != 'video';
