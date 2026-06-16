-- Loại skill: text (viết bài), image (prompt ảnh), video (prompt video)

ALTER TABLE skills
  ADD COLUMN skill_type ENUM('text', 'image', 'video') NOT NULL DEFAULT 'text' AFTER description;

ALTER TABLE posts
  ADD COLUMN video_prompt TEXT NULL AFTER image_prompt;
