CREATE TABLE IF NOT EXISTS user_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_account_id INT NOT NULL,
  post_queue_id VARCHAR(64) NOT NULL DEFAULT '',
  group_id VARCHAR(64) NOT NULL,
  group_name VARCHAR(255) DEFAULT NULL,
  post_id VARCHAR(64) NOT NULL,
  noi_dung TEXT DEFAULT NULL,
  posted_at TIMESTAMP NULL DEFAULT NULL,
  needs_comment TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_account (user_account_id),
  INDEX idx_post_id (post_id),
  INDEX idx_needs_comment (needs_comment, posted_at),
  UNIQUE KEY uq_post_group (user_account_id, post_queue_id, group_id),
  FOREIGN KEY (user_account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
