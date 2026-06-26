-- Sync ledger theo thiết bị extension (device_id) — client không gửi hàng nghìn ID

ALTER TABLE group_post_client_syncs
  DROP PRIMARY KEY,
  ADD COLUMN device_id VARCHAR(64) NOT NULL DEFAULT 'legacy' AFTER user_id,
  ADD PRIMARY KEY (group_post_id, user_id, device_id),
  ADD KEY idx_gpcs_device (user_id, device_id);

ALTER TABLE group_post_draft_pulls
  DROP PRIMARY KEY,
  ADD COLUMN device_id VARCHAR(64) NOT NULL DEFAULT 'legacy' AFTER user_id,
  ADD PRIMARY KEY (draft_id, user_id, device_id),
  ADD KEY idx_gpdp_device (user_id, device_id);
