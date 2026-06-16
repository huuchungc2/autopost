-- Page & provider assignments for admin/editor (RBAC)
-- Run on existing DBs created before user_pages was added to schema.sql

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
