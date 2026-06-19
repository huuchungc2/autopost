-- AutoPost PRD v2.1 database schema

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'admin', 'editor') DEFAULT 'editor',
  is_active BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  last_login TIMESTAMP NULL,
  created_by INT NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_provider_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('text', 'image') NOT NULL,
  provider_kind VARCHAR(30) NOT NULL,
  api_endpoint VARCHAR(500) NOT NULL,
  default_model VARCHAR(100),
  description TEXT,
  key_label VARCHAR(100),
  key_placeholder VARCHAR(100),
  key_help TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('text', 'image', 'video') NOT NULL,
  api_key TEXT NOT NULL,
  model VARCHAR(100),
  template_id INT NULL,
  provider_kind VARCHAR(30) NULL,
  api_endpoint VARCHAR(500) NULL,
  is_active BOOLEAN DEFAULT true,
  user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (template_id) REFERENCES ai_provider_templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  skill_type ENUM('text', 'image', 'video') NOT NULL DEFAULT 'text',
  system_prompt LONGTEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fb_pages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  page_id VARCHAR(100) UNIQUE NOT NULL,
  page_token TEXT NOT NULL,
  token_expires_at DATETIME NULL,
  token_status ENUM('valid','expiring','expired') DEFAULT 'valid',
  avatar_url TEXT,
  skill_id INT NULL,
  text_provider_id INT NULL,
  image_provider_id INT NULL,
  is_active BOOLEAN DEFAULT true,
  image_schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  image_schedule_start_hour TINYINT UNSIGNED NOT NULL DEFAULT 1,
  image_schedule_start_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  image_schedule_end_hour TINYINT UNSIGNED NOT NULL DEFAULT 5,
  image_schedule_end_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  image_schedule_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  image_schedule_last_run_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (text_provider_id) REFERENCES ai_providers(id),
  FOREIGN KEY (image_provider_id) REFERENCES ai_providers(id)
);

CREATE TABLE IF NOT EXISTS page_skills (
  page_id INT NOT NULL,
  skill_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (page_id, skill_id),
  FOREIGN KEY (page_id) REFERENCES fb_pages(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_topics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  page_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  topic VARCHAR(500) NOT NULL,
  post_time TIME DEFAULT '08:00:00',
  is_active BOOLEAN DEFAULT true,
  repeat_daily BOOLEAN DEFAULT false,
  last_run_date DATE NULL,
  FOREIGN KEY (page_id) REFERENCES fb_pages(id)
);

CREATE TABLE IF NOT EXISTS posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  page_id INT NOT NULL,
  topic VARCHAR(500),
  content LONGTEXT NOT NULL,
  image_url TEXT,
  image_prompt TEXT,
  auto_generate_image BOOLEAN NOT NULL DEFAULT false,
  image_job_status ENUM('pending','processing','done','failed') NULL DEFAULT NULL,
  save_image_local BOOLEAN NOT NULL DEFAULT true,
  video_prompt TEXT,
  video_url TEXT,
  video_thumb_url TEXT,
  media_type ENUM('none','image','video') DEFAULT 'none',
  status ENUM('draft','pending_approval','scheduled','publishing','published','failed') DEFAULT 'draft',
  scheduled_at DATETIME NULL,
  published_at DATETIME NULL,
  fb_post_id VARCHAR(100),
  fb_photo_id VARCHAR(100),
  fb_video_id VARCHAR(100),
  error_message TEXT,
  created_by_type ENUM('auto','manual') DEFAULT 'auto',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_id) REFERENCES fb_pages(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS image_schedule_settings (
  user_id INT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  start_hour TINYINT UNSIGNED NOT NULL DEFAULT 1,
  start_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  end_hour TINYINT UNSIGNED NOT NULL DEFAULT 5,
  end_minute TINYINT UNSIGNED NOT NULL DEFAULT 0,
  interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  last_run_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS image_generate_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL,
  schedule_user_id INT NULL,
  source ENUM('schedule','manual','publish') NOT NULL DEFAULT 'schedule',
  status ENUM('processing','done','cancelled') NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  INDEX idx_image_generate_logs_post (post_id),
  INDEX idx_image_generate_logs_schedule_user (schedule_user_id),
  INDEX idx_image_generate_logs_created (created_at)
);

CREATE TABLE IF NOT EXISTS generate_jobs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_id VARCHAR(36) NOT NULL,
  page_id INT NOT NULL,
  topic VARCHAR(500),
  scheduled_date DATE,
  scheduled_time TIME,
  status ENUM('pending','processing','done','failed') DEFAULT 'pending',
  post_id INT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  FOREIGN KEY (page_id) REFERENCES fb_pages(id),
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  type ENUM('error','warning','info','success') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  related_type VARCHAR(50),
  related_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  detail JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS content_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  prompt_template TEXT NOT NULL,
  variables JSON,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_pages (
  user_id INT NOT NULL,
  page_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, page_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES fb_pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_providers (
  user_id INT NOT NULL,
  provider_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
);
