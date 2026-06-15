-- Một fanpage gắn được nhiều skill (many-to-many)

CREATE TABLE IF NOT EXISTS page_skills (
  page_id INT NOT NULL,
  skill_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (page_id, skill_id),
  FOREIGN KEY (page_id) REFERENCES fb_pages(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

INSERT IGNORE INTO page_skills (page_id, skill_id, sort_order)
SELECT id, skill_id, 0 FROM fb_pages WHERE skill_id IS NOT NULL;
