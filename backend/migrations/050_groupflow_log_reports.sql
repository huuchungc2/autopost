CREATE TABLE IF NOT EXISTS groupflow_log_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  device_label VARCHAR(255) NULL,
  extension_version VARCHAR(20) NULL,
  entry_count INT NOT NULL DEFAULT 0,
  entries_json LONGTEXT NOT NULL,
  report_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_device_day (device_id, report_date),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
