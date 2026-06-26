-- Extension: mỗi user tidien ghi nhận đã tải bài nào (theo group_posts.id)
CREATE TABLE IF NOT EXISTS group_post_client_syncs (
  group_post_id INT NOT NULL,
  user_id INT NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_post_id, user_id),
  KEY idx_gpcs_user (user_id),
  CONSTRAINT fk_gpcs_post FOREIGN KEY (group_post_id) REFERENCES group_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_gpcs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
