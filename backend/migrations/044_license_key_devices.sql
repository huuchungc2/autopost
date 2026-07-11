CREATE TABLE IF NOT EXISTS license_key_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  license_key_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  device_label VARCHAR(255) NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_license_device (license_key_id, device_id),
  INDEX idx_license_key_id (license_key_id),
  FOREIGN KEY (license_key_id) REFERENCES license_keys(id) ON DELETE CASCADE
);
