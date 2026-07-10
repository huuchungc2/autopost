-- Sửa dứt điểm bug thiết kế gốc: `uq_post_group` (migration 035) định nghĩa theo
-- (user_account_id, post_queue_id, group_id) — SAI, vì post_queue_id là ID nội bộ client (thường
-- rỗng ''), không phải định danh thật của 1 bài Facebook. Định danh thật là (group_id, post_id) —
-- xem upsertUserPost() (groupPostService.js), đã dùng đúng cặp này để tìm dòng đã tồn tại từ lâu,
-- chỉ riêng UNIQUE KEY của bảng là định nghĩa sai. Hệ quả thật đã gặp: 2 bài THẬT KHÁC NHAU
-- (post_id khác) do cùng 1 user đăng vào cùng 1 nhóm với post_queue_id rỗng bị chặn nhầm bởi unique
-- key này (migration 039b từng bị lỗi Duplicate entry vì đúng lý do này — xem CHANGELOG), trong khi
-- lẽ ra unique key phải ngăn ĐÚNG trường hợp cần ngăn: chèn trùng CÙNG 1 bài thật (cùng post_id) 2
-- lần.

-- 1) Dồn comment (nếu có) từ dòng TRÙNG THẬT (cùng user_account_id+group_id+post_id, khác id) về
--    dòng giữ lại (id nhỏ nhất trong nhóm trùng) — bỏ qua nếu dòng giữ đã có comment của đúng người
--    đó (tránh đụng UNIQUE KEY uq_post_commenter của user_post_comments) — phần hiếm bị bỏ qua này sẽ
--    mất theo ở bước 2 khi xóa dòng trùng — chấp nhận được vì đây chỉ là dữ liệu duplicate hiếm gặp.
UPDATE user_post_comments upc
JOIN user_posts up_loser ON upc.user_post_id = up_loser.id
JOIN user_posts up_keeper
  ON up_keeper.user_account_id = up_loser.user_account_id
  AND up_keeper.group_id = up_loser.group_id
  AND up_keeper.post_id = up_loser.post_id
  AND up_keeper.id < up_loser.id
LEFT JOIN user_post_comments existing
  ON existing.user_post_id = up_keeper.id AND existing.commenter_user_id = upc.commenter_user_id
SET upc.user_post_id = up_keeper.id
WHERE existing.id IS NULL;

-- 2) Xóa dòng trùng thật (giữ id nhỏ nhất mỗi nhóm trùng) — comment còn sót lại trên dòng bị xóa
--    (đụng uq_post_commenter ở bước 1, không dồn được) mất theo do ON DELETE CASCADE của
--    fk_upc_post — chấp nhận được, đây là dữ liệu duplicate hiếm gặp từ bug thiết kế cũ.
DELETE up1 FROM user_posts up1
INNER JOIN user_posts up2
  ON up1.user_account_id = up2.user_account_id
  AND up1.group_id = up2.group_id
  AND up1.post_id = up2.post_id
  AND up1.id > up2.id;

-- 3) Tính lại comment_count cho mọi dòng còn lại từ nguồn sự thật (user_post_comments), phòng
--    trường hợp bước 1 đã dồn thêm comment vào dòng giữ lại.
UPDATE user_posts up
LEFT JOIN (
  SELECT user_post_id, COUNT(*) AS cnt FROM user_post_comments GROUP BY user_post_id
) c ON c.user_post_id = up.id
SET up.comment_count = COALESCE(c.cnt, 0);

-- 4) Đổi lại đúng unique key theo định danh thật của 1 bài Facebook — đặt tên mới (uq_post_group_v2)
--    thay vì tái dùng tên cũ để tránh nhầm lẫn/xung đột nếu có deployment nào đó chưa chạy qua bước
--    DROP kịp thời.
ALTER TABLE user_posts
  DROP INDEX uq_post_group,
  ADD UNIQUE KEY uq_post_group_v2 (user_account_id, group_id, post_id);
