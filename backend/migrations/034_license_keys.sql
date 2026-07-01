CREATE TABLE IF NOT EXISTS license_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  key_value VARCHAR(64) NOT NULL UNIQUE,
  plan ENUM('free', 'pro', 'enterprise') NOT NULL DEFAULT 'free',
  status ENUM('active', 'expired', 'suspended') NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_validated_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_key_value (key_value),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
