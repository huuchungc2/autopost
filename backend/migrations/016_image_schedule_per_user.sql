-- Nâng cấp bảng lịch cũ (cột id) → theo user_id (chỉ chạy nếu DB cũ dùng schema singleton)
DROP TABLE IF EXISTS image_schedule_settings;

CREATE TABLE image_schedule_settings (
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

ALTER TABLE image_generate_logs
  ADD COLUMN schedule_user_id INT NULL AFTER post_id,
  ADD INDEX idx_image_generate_logs_schedule_user (schedule_user_id);
