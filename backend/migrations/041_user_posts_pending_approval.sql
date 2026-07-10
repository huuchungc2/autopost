ALTER TABLE user_posts
  ADD COLUMN pending_approval TINYINT(1) NOT NULL DEFAULT 0 AFTER visible_after,
  ADD COLUMN pending_checked_at DATETIME NULL AFTER pending_approval;
