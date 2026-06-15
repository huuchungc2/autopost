import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { processBatch } from '../services/jobWorker.js';
import { assertPageAccess } from '../services/pageAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

router.get('/:batch_id/status', asyncHandler(async (req, res) => {
  const jobs = await query(
    'SELECT id, batch_id, page_id, topic, scheduled_date, scheduled_time, status, post_id, error_message, created_at, processed_at FROM generate_jobs WHERE batch_id = ? ORDER BY id ASC',
    [req.params.batch_id]
  );
  if (!jobs.length) return res.status(404).json({ error: 'Batch not found' });

  await assertPageAccess(req.user, jobs[0].page_id);

  const summary = {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    done: jobs.filter((j) => j.status === 'done').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  res.json({ batch_id: req.params.batch_id, jobs, summary });
}));

router.post('/:batch_id/process', asyncHandler(async (req, res) => {
  const jobs = await query('SELECT page_id FROM generate_jobs WHERE batch_id = ? LIMIT 1', [req.params.batch_id]);
  if (!jobs.length) return res.status(404).json({ error: 'Batch not found' });
  await assertPageAccess(req.user, jobs[0].page_id);

  const results = await processBatch(req.params.batch_id);
  if (!results.length) return res.status(404).json({ error: 'No pending jobs found for this batch' });
  res.json({ batch_id: req.params.batch_id, results });
}));

export default router;
