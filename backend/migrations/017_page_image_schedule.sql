-- Lịch xuất ảnh theo từng fanpage (tuỳ chọn, giờ Việt Nam)
ALTER TABLE fb_pages
  ADD COLUMN image_schedule_enabled BOOLEAN NOT NULL DEFAULT false AFTER is_active,
  ADD COLUMN image_schedule_start_hour TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER image_schedule_enabled,
  ADD COLUMN image_schedule_start_minute TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER image_schedule_start_hour,
  ADD COLUMN image_schedule_end_hour TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER image_schedule_start_minute,
  ADD COLUMN image_schedule_end_minute TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER image_schedule_end_hour,
  ADD COLUMN image_schedule_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10 AFTER image_schedule_end_minute,
  ADD COLUMN image_schedule_last_run_at DATETIME NULL AFTER image_schedule_interval_minutes;
