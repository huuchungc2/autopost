-- Merge self-serve user_accounts identity into the main users table (role='group_user').
ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'admin', 'editor', 'group_user') DEFAULT 'editor';
