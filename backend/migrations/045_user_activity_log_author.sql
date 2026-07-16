-- 2026-07-16 — Log/Lịch sử ghi kèm TÁC GIẢ bài (comment chéo chạy nhiều người dễ lẫn bài của ai).
-- Extension đã ghi author_name/author_fb_id vào entry cục bộ từ v1.0.268 — nhưng đường đồng bộ
-- Log qua server (POST/GET /api/user-sync/activity) cắt mất 2 field này vì bảng không có cột.
ALTER TABLE user_activity_log
  ADD COLUMN author_name VARCHAR(255) NULL AFTER post_id,
  ADD COLUMN author_fb_id VARCHAR(64) NULL AFTER author_name;
