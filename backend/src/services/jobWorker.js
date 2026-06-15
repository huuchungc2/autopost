import { query } from '../db.js';
import { generateText } from './aiService.js';
import { generateImage } from './imageService.js';
import { getPageGenerationConfig } from './providerService.js';
import { createNotification } from './notifyService.js';

export async function processPendingJobs(limit = 10) {
  const jobs = await query(
    'SELECT id, batch_id, page_id, topic, scheduled_date, scheduled_time FROM generate_jobs WHERE status = ? ORDER BY id ASC LIMIT ?',
    ['pending', limit]
  );

  const results = [];
  for (const job of jobs) {
    const result = await processJob(job);
    results.push(result);
  }
  return results;
}

export async function processJob(job) {
  await query('UPDATE generate_jobs SET status = ? WHERE id = ?', ['processing', job.id]);
  try {
    const config = await getPageGenerationConfig(job.page_id);
    if (!config) throw new Error('Page not found or inactive');

    const userPrompt = `Viết bài Facebook về chủ đề: ${job.topic}. Viết bằng tiếng Việt, hấp dẫn, có emoji phù hợp.`;
    const textResult = await generateText(userPrompt, config.textProvider, config.skillPrompt);
    const imageResult = await generateImage(`Illustration for Facebook post about: ${job.topic}`, config.imageProvider);
    const scheduledAt = job.scheduled_date ? `${job.scheduled_date} ${job.scheduled_time || '08:00:00'}` : null;

    const inserted = await query(
      'INSERT INTO posts (page_id, topic, content, image_url, image_prompt, media_type, status, scheduled_at, created_by_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [job.page_id, job.topic, textResult.text, imageResult.image_url, imageResult.image_prompt, 'image', scheduledAt ? 'scheduled' : 'pending_approval', scheduledAt, 'auto']
    );

    await query('UPDATE generate_jobs SET status = ?, post_id = ?, processed_at = NOW() WHERE id = ?', ['done', inserted.insertId, job.id]);
    await createNotification({
      type: 'success',
      title: 'Batch job completed',
      message: `Generated post for topic "${job.topic}"`,
      relatedType: 'post',
      relatedId: inserted.insertId,
    });

    return { job_id: job.id, status: 'done', post_id: inserted.insertId };
  } catch (error) {
    await query('UPDATE generate_jobs SET status = ?, error_message = ? WHERE id = ?', ['failed', error.message, job.id]);
    await createNotification({
      type: 'error',
      title: 'Batch job failed',
      message: `Job ${job.id}: ${error.message}`,
      relatedType: 'job',
      relatedId: job.id,
    });
    return { job_id: job.id, status: 'failed', error_message: error.message };
  }
}

export async function processBatch(batchId) {
  const jobs = await query('SELECT id, batch_id, page_id, topic, scheduled_date, scheduled_time FROM generate_jobs WHERE batch_id = ? AND status = ?', [batchId, 'pending']);
  const results = [];
  for (const job of jobs) {
    results.push(await processJob(job));
  }
  return results;
}
