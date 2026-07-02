CREATE TABLE IF NOT EXISTS user_activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_account_id INT NOT NULL,
  client_entry_id VARCHAR(64) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'post',
  ok TINYINT(1) NOT NULL DEFAULT 1,
  snippet VARCHAR(255) DEFAULT NULL,
  group_id VARCHAR(64) DEFAULT NULL,
  group_name VARCHAR(255) DEFAULT NULL,
  post_id VARCHAR(64) DEFAULT NULL,
  url VARCHAR(500) DEFAULT NULL,
  error VARCHAR(800) DEFAULT NULL,
  occurred_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_occurred (user_account_id, occurred_at),
  UNIQUE KEY uq_user_entry (user_account_id, client_entry_id),
  FOREIGN KEY (user_account_id) REFERENCES users(id) ON DELETE CASCADE
);
