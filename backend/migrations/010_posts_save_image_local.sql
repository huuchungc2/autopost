ALTER TABLE posts
  ADD COLUMN save_image_local BOOLEAN NOT NULL DEFAULT true AFTER auto_generate_image;
