ALTER TABLE fb_pages
  ADD COLUMN token_source ENUM('manual', 'composio') NOT NULL DEFAULT 'manual' AFTER page_token,
  ADD COLUMN composio_user_id VARCHAR(128) NULL AFTER token_source,
  ADD COLUMN composio_connected_account_id VARCHAR(64) NULL AFTER composio_user_id;
