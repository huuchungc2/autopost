-- Lịch chủ đề lặp hằng ngày (dùng từ batch-generate)
ALTER TABLE content_topics
  ADD COLUMN repeat_daily BOOLEAN NOT NULL DEFAULT FALSE;
