import express from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const skills = await query('SELECT id, name, description, created_by, created_at FROM skills');
  res.json(skills);
});

router.post('/', requireRole('super_admin'), async (req, res) => {
  const { name, description, system_prompt, created_by } = req.body;
  if (!name || !system_prompt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const result = await query(
    'INSERT INTO skills (name, description, system_prompt, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
    [name, description, system_prompt, created_by]
  );
  res.status(201).json({ id: result.insertId, name, description });
});

router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { name, description, system_prompt } = req.body;
  await query('UPDATE skills SET name = ?, description = ?, system_prompt = ? WHERE id = ?', [name, description, system_prompt, req.params.id]);
  res.json({ message: 'Skill updated' });
});

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  await query('DELETE FROM skills WHERE id = ?', [req.params.id]);
  res.json({ message: 'Skill deleted' });
});

export default router;
