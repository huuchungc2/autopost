-- Migrate từ Service Account sang OAuth2 User Authentication
-- Xoá key cũ; 3 key mới (google_drive_client_id/secret/refresh_token) được insert qua UI
DELETE FROM app_settings WHERE setting_key = 'google_drive_service_account_json';
