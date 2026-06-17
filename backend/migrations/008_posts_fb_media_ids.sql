-- Lưu ID bài đăng và media trên Facebook sau khi publish
ALTER TABLE posts
  ADD COLUMN fb_photo_id VARCHAR(100) NULL AFTER fb_post_id,
  ADD COLUMN fb_video_id VARCHAR(100) NULL AFTER fb_photo_id;
