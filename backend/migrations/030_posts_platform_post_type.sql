-- Website Blog content integration: phân biệt platform, theo dõi tỷ lệ loại bài fanpage, lưu SEO metadata
ALTER TABLE posts ADD COLUMN platform ENUM('fanpage','website') NOT NULL DEFAULT 'fanpage' AFTER page_id;
ALTER TABLE posts ADD COLUMN post_type ENUM('gia_tri','gioi_thieu','ban_hang') NULL AFTER topic;
ALTER TABLE posts ADD COLUMN seo_meta JSON NULL AFTER video_thumb_url;
