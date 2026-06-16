-- Username đăng nhập riêng (khác tên hiển thị)

ALTER TABLE users
  ADD COLUMN username VARCHAR(100) NULL UNIQUE AFTER name;
