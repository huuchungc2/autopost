-- Tránh chạy trùng slot lịch trong cùng một ngày
ALTER TABLE content_topics
  ADD COLUMN last_run_date DATE NULL;
