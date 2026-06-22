ALTER TABLE fb_pages
  ADD COLUMN composio_page_token TEXT NULL AFTER page_token;

UPDATE fb_pages
SET composio_page_token = page_token
WHERE token_source = 'composio'
  AND page_token IS NOT NULL
  AND page_token != ''
  AND (composio_page_token IS NULL OR composio_page_token = '');
