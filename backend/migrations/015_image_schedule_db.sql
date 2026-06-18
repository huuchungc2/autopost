-- Lịch xuất ảnh theo từng admin + log job (giờ Việt Nam)
CREATE TABLE IF NOT EXISTS image_schedule_settings (
  user_id INT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  start_hour TINYINT UNSIGNED NOT NULL DEFAULT 1,
  start_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  end_hour TINYINT UNSIGNED NOT NULL DEFAULT 5,
  end_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  last_run_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS image_generate_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL,
  schedule_user_id INT NULL,
  source ENUM('schedule','manual','publish') NOT NULL DEFAULT 'schedule',
  status ENUM('processing','done','cancelled') NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  INDEX idx_image_generate_logs_post (post_id),
  INDEX idx_image_generate_logs_schedule_user (schedule_user_id),
  INDEX idx_image_generate_logs_created (created_at)
);

ALTER TABLE posts
  ADD COLUMN image_job_status ENUM('pending','processing','done','failed') NULL DEFAULT NULL AFTER auto_generate_image;

UPDATE posts
SET image_job_status = 'pending'
WHERE (image_url IS NULL OR image_url = '')
  AND image_prompt IS NOT NULL AND TRIM(image_prompt) != ''
  AND auto_generate_image = true
  AND image_job_status IS NULL
  AND status IN ('scheduled', 'draft', 'pending_approval')
  AND media_type != 'video';
