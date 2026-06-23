CREATE TABLE IF NOT EXISTS extension_api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  api_key VARCHAR(64) NOT NULL,
  fb_user_id VARCHAR(64) NULL,
  fb_user_name VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_extension_user (user_id),
  UNIQUE KEY uk_extension_api_key (api_key),
  CONSTRAINT fk_extension_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  fb_user_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(64) NOT NULL,
  post_id VARCHAR(64) NOT NULL,
  noi_dung TEXT,
  prompt_anh TEXT,
  ngay_dang DATE NULL,
  gio_dang VARCHAR(8) NULL,
  posted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_group_fb_post (group_id, post_id),
  KEY idx_group_posts_posted_at (posted_at DESC),
  KEY idx_group_posts_user (user_id),
  CONSTRAINT fk_group_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_post_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_post_id INT NOT NULL,
  commenter_user_id INT NOT NULL,
  commenter_fb_user_id VARCHAR(64) NULL,
  commented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gpc_post (group_post_id),
  KEY idx_gpc_commenter (commenter_user_id),
  CONSTRAINT fk_gpc_post FOREIGN KEY (group_post_id) REFERENCES group_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_gpc_user FOREIGN KEY (commenter_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
