ALTER TABLE group_posts
  ADD COLUMN group_name VARCHAR(255) NULL AFTER group_id;

ALTER TABLE group_post_drafts
  ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0 AFTER user_id;

CREATE TABLE IF NOT EXISTS group_post_draft_pulls (
  draft_id INT NOT NULL,
  user_id INT NOT NULL,
  pulled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (draft_id, user_id),
  KEY idx_gpdp_user (user_id),
  CONSTRAINT fk_gpdp_draft FOREIGN KEY (draft_id) REFERENCES group_post_drafts(id) ON DELETE CASCADE,
  CONSTRAINT fk_gpdp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
