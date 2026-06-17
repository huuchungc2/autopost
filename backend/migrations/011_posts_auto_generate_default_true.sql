-- Bài có prompt ảnh nhưng chưa có ảnh: mặc định bật tự xuất khi đăng
UPDATE posts
SET auto_generate_image = true
WHERE TRIM(COALESCE(image_prompt, '')) != ''
  AND (image_url IS NULL OR TRIM(image_url) = '')
  AND auto_generate_image = false;

ALTER TABLE posts
  MODIFY COLUMN auto_generate_image BOOLEAN NOT NULL DEFAULT true;
