-- Website là 1 entity độc lập với fanpage Facebook (không phải lúc nào cũng 1-1 với fb_pages).
-- Mỗi website là 1 "dự án" riêng cho generate bài blog SEO + publish API, giống cách fb_pages
-- đã làm cho fanpage (skill = brand voice, text/image provider riêng).
CREATE TABLE IF NOT EXISTS websites (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NULL,
  skill_id INT NULL,
  text_provider_id INT NULL,
  image_provider_id INT NULL,
  publish_url VARCHAR(500) NULL,
  api_key VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (text_provider_id) REFERENCES ai_providers(id),
  FOREIGN KEY (image_provider_id) REFERENCES ai_providers(id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- posts.page_id chỉ áp dụng cho platform='fanpage' — bài platform='website' dùng website_id thay thế.
ALTER TABLE posts MODIFY COLUMN page_id INT NULL;
ALTER TABLE posts ADD COLUMN website_id INT NULL AFTER page_id;
ALTER TABLE posts ADD CONSTRAINT fk_posts_website_id FOREIGN KEY (website_id) REFERENCES websites(id);
ALTER TABLE posts ADD COLUMN website_post_id VARCHAR(255) NULL AFTER seo_meta;
ALTER TABLE posts ADD COLUMN website_post_url VARCHAR(500) NULL AFTER website_post_id;
ALTER TABLE posts ADD COLUMN website_published_at DATETIME NULL AFTER website_post_url;
