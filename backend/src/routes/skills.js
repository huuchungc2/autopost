import express from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

const SKILL_TYPES = new Set(['text', 'image', 'video']);

function normalizeSkillType(value) {
  const type = String(value || 'text').trim().toLowerCase();
  return SKILL_TYPES.has(type) ? type : 'text';
}

async function getSkillPages(skillId) {
  return query(
    `SELECT fp.id, fp.name, fp.page_id, fp.is_active
     FROM page_skills ps
     JOIN fb_pages fp ON fp.id = ps.page_id
     WHERE ps.skill_id = ?
     ORDER BY fp.name ASC`,
    [skillId]
  );
}

router.get('/', asyncHandler(async (req, res) => {
  const skills = await query(
    `SELECT s.id, s.name, s.description, s.skill_type, s.created_by, s.created_at,
            LEFT(s.system_prompt, 120) AS prompt_preview,
            CHAR_LENGTH(s.system_prompt) AS prompt_length,
            COUNT(ps.page_id) AS page_count
     FROM skills s
     LEFT JOIN page_skills ps ON ps.skill_id = s.id
     GROUP BY s.id, s.name, s.description, s.skill_type, s.created_by, s.created_at, s.system_prompt
     ORDER BY s.skill_type ASC, s.name ASC`
  ).catch(async () => {
    const rows = await query(
      `SELECT s.id, s.name, s.description, s.created_by, s.created_at,
              LEFT(s.system_prompt, 120) AS prompt_preview,
              CHAR_LENGTH(s.system_prompt) AS prompt_length,
              COUNT(ps.page_id) AS page_count
       FROM skills s
       LEFT JOIN page_skills ps ON ps.skill_id = s.id
       GROUP BY s.id, s.name, s.description, s.created_by, s.created_at, s.system_prompt
       ORDER BY s.name ASC`
    );
    return rows.map((r) => ({ ...r, skill_type: 'text' }));
  });

  const pageRows = await query(
    `SELECT fp.id, fp.name, ps.skill_id, fp.is_active
     FROM page_skills ps
     JOIN fb_pages fp ON fp.id = ps.page_id
     ORDER BY fp.name ASC`
  );

  const pagesBySkill = pageRows.reduce((acc, page) => {
    if (!acc[page.skill_id]) acc[page.skill_id] = [];
    acc[page.skill_id].push({ id: page.id, name: page.name, is_active: !!page.is_active });
    return acc;
  }, {});

  res.json(
    skills.map((skill) => ({
      ...skill,
      skill_type: skill.skill_type || 'text',
      pages: pagesBySkill[skill.id] || [],
    }))
  );
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const skills = await query(
    'SELECT id, name, description, skill_type, system_prompt, created_by, created_at FROM skills WHERE id = ?',
    [req.params.id]
  ).catch(async () => {
    const rows = await query(
      'SELECT id, name, description, system_prompt, created_by, created_at FROM skills WHERE id = ?',
      [req.params.id]
    );
    return rows.map((r) => ({ ...r, skill_type: 'text' }));
  });

  if (!skills.length) return res.status(404).json({ error: 'Skill not found' });
  const pages = await getSkillPages(req.params.id);
  res.json({ ...skills[0], skill_type: skills[0].skill_type || 'text', pages });
}));

router.post('/', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name, description, system_prompt, skill_type } = req.body;
  if (!name?.trim() || !system_prompt?.trim()) {
    return res.status(400).json({ error: 'Tên và system prompt là bắt buộc' });
  }
  const type = normalizeSkillType(skill_type);
  const result = await query(
    'INSERT INTO skills (name, description, skill_type, system_prompt, created_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [name.trim(), description || '', type, system_prompt.trim(), req.user.id]
  ).catch(async () => {
    return query(
      'INSERT INTO skills (name, description, system_prompt, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
      [name.trim(), description || '', system_prompt.trim(), req.user.id]
    );
  });
  res.status(201).json({ id: result.insertId, name, description, skill_type: type });
}));

router.put('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name, description, system_prompt, skill_type } = req.body;
  if (!name?.trim() || !system_prompt?.trim()) {
    return res.status(400).json({ error: 'Tên và system prompt là bắt buộc' });
  }
  const type = normalizeSkillType(skill_type);
  await query(
    'UPDATE skills SET name = ?, description = ?, skill_type = ?, system_prompt = ? WHERE id = ?',
    [name.trim(), description || '', type, system_prompt.trim(), req.params.id]
  ).catch(async () => {
    await query(
      'UPDATE skills SET name = ?, description = ?, system_prompt = ? WHERE id = ?',
      [name.trim(), description || '', system_prompt.trim(), req.params.id]
    );
  });
  res.json({ message: 'Skill updated', skill_type: type });
}));

router.delete('/:id', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const linked = await query('SELECT COUNT(*) AS count FROM page_skills WHERE skill_id = ?', [req.params.id]);
  if (linked[0]?.count > 0) {
    return res.status(400).json({
      error: `Skill đang được ${linked[0].count} fanpage sử dụng. Gỡ gán ở Pages trước khi xóa.`,
    });
  }
  await query('DELETE FROM skills WHERE id = ?', [req.params.id]);
  res.json({ message: 'Skill deleted' });
}));

export default router;
