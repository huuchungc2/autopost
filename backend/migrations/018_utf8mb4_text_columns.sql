-- Emoji (4-byte UTF-8) need utf8mb4 — MySQL "utf8" is only 3-byte utf8mb3 and turns emoji into "?".
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE posts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
