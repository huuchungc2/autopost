ALTER TABLE posts
  ADD COLUMN auto_generate_image BOOLEAN NOT NULL DEFAULT false AFTER image_prompt;
