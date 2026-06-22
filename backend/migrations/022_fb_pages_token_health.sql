ALTER TABLE fb_pages
  ADD COLUMN manual_token_expires_at DATETIME NULL AFTER token_expires_at,
  ADD COLUMN composio_token_expires_at DATETIME NULL AFTER manual_token_expires_at,
  ADD COLUMN manual_token_status ENUM('valid', 'expiring', 'expired', 'unknown') NOT NULL DEFAULT 'unknown' AFTER composio_token_expires_at,
  ADD COLUMN composio_token_status ENUM('valid', 'expiring', 'expired', 'unknown') NOT NULL DEFAULT 'unknown' AFTER manual_token_status;

UPDATE fb_pages
SET manual_token_expires_at = token_expires_at,
    manual_token_status = COALESCE(token_status, 'unknown')
WHERE page_token IS NOT NULL AND page_token != '';

UPDATE fb_pages
SET composio_token_expires_at = token_expires_at,
    composio_token_status = COALESCE(token_status, 'unknown')
WHERE composio_page_token IS NOT NULL AND composio_page_token != '';
