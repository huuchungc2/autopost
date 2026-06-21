-- Chỉ ALTER TABLE — ALTER DATABASE cần quyền SUPER, xử lý riêng trong migrationRunner.
ALTER TABLE posts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE posts MODIFY content LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
