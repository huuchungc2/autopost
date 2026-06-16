import { query } from '../db.js';
import { getPageGenerationConfig } from './providerService.js';
import { generatePostWithMedia } from './contentGenerationService.js';
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

export async function processJob(job, cachedConfig = null) {
  await query('UPDATE generate_jobs SET status = ? WHERE id = ?', ['processing', job.id]);
  try {
    const config = cachedConfig || await getPageGenerationConfig(job.page_id);
    if (!config) throw new Error('Page not found or inactive');

    const userPrompt = `Viết bài Facebook về chủ đề: ${job.topic}.`;
    const generated = await generatePostWithMedia({
      topic: job.topic,
      userPrompt,
      config,
      mediaMode: config.mediaMode,
    });

    const scheduledAt = job.scheduled_date ? `${job.scheduled_date} ${job.scheduled_time || '08:00:00'}` : null;
    const postStatus = scheduledAt ? 'scheduled' : 'pending_approval';

    const inserted = await query(
      `INSERT INTO posts (page_id, topic, content, image_url, image_prompt, video_prompt, media_type, status, scheduled_at, created_by_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', NOW())`,
      [
        job.page_id,
        job.topic,
        generated.content,
        generated.image_url,
        generated.image_prompt,
        generated.video_prompt,
        generated.media_type,
        postStatus,
        scheduledAt,
      ]
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
  const jobs = await query(
    'SELECT id, batch_id, page_id, topic, scheduled_date, scheduled_time FROM generate_jobs WHERE batch_id = ? AND status = ?',
    [batchId, 'pending']
  );

  const configCache = new Map();
  const results = [];

  for (const job of jobs) {
    if (!configCache.has(job.page_id)) {
      configCache.set(job.page_id, await getPageGenerationConfig(job.page_id));
    }
    results.push(await processJob(job, configCache.get(job.page_id)));
  }

  return results;
}
