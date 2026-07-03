ALTER TABLE user_posts
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE INDEX idx_user_posts_account_updated ON user_posts (user_account_id, updated_at);
CREATE INDEX idx_user_posts_updated ON user_posts (updated_at);
