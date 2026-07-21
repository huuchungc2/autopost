-- Ngành nghề cho draft GroupFlow — CSV id ngành ("3,7") trong group_post_categories.
-- Import chọn ngành (batch + cột "Ngành nghề" trong template) hoặc gán sau ở list draft.
-- Extension pull về thì postQueue mang mảng categories tương ứng.
-- NULL hoặc rỗng = chưa gán ngành (draft thiếu cột coi như chưa gán).
ALTER TABLE group_post_drafts
  ADD COLUMN category_ids VARCHAR(255) NULL DEFAULT NULL AFTER prompt_anh;
