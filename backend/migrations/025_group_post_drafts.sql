CREATE TABLE IF NOT EXISTS group_post_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  noi_dung TEXT NOT NULL,
  prompt_anh TEXT NULL,
  ngay_dang DATE NULL,
  gio_dang VARCHAR(8) NULL,
  status ENUM('pending', 'pulled') NOT NULL DEFAULT 'pending',
  pulled_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gpd_user_status (user_id, status),
  KEY idx_gpd_created (created_at DESC),
  CONSTRAINT fk_gpd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
