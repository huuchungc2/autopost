import express from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateText } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';
import { getPageGenerationConfig } from '../services/providerService.js';
import { postToFacebook } from '../services/fbService.js';
import { createNotification } from '../services/notifyService.js';
import {
  getAccessiblePageIds,
  assertPageAccess,
  assertPostAccess,
  pageIdInClause,
} from '../services/pageAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { page, status, media_type, date, limit = 50, offset = 0 } = req.query;
  const accessibleIds = await getAccessiblePageIds(req.user);
  const conditions = [];
  const params = [];

  const accessFilter = pageIdInClause(accessibleIds, 'posts.page_id');
  if (accessFilter.clause) {
    conditions.push(accessFilter.clause.replace(/^ AND /, ''));
    params.push(...accessFilter.params);
  }

  if (page) {
    await assertPageAccess(req.user, page);
    conditions.push('posts.page_id = ?');
    params.push(page);
  }
  if (status) { conditions.push('posts.status = ?'); params.push(status); }
  if (media_type) { conditions.push('posts.media_type = ?'); params.push(media_type); }
  if (date) { conditions.push('DATE(posts.scheduled_at) = ?'); params.push(date); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const posts = await query(
    `SELECT posts.*, fb_pages.name AS page_name FROM posts JOIN fb_pages ON fb_pages.id = posts.page_id ${where} ORDER BY posts.created_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(limit, 10), parseInt(offset, 10)]
  );
  res.json(posts);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  const posts = await query(
    'SELECT posts.*, fb_pages.name AS page_name FROM posts JOIN fb_pages ON fb_pages.id = posts.page_id WHERE posts.id = ?',
    [req.params.id]
  );
  res.json(posts[0]);
}));

router.post('/generate', asyncHandler(async (req, res) => {
  const { page_id, topic, prompt, scheduled_at, skill_id } = req.body;
  if (!page_id || !topic) return res.status(400).json({ error: 'page_id and topic are required' });
  await assertPageAccess(req.user, page_id);

  const config = await getPageGenerationConfig(page_id, skill_id || null);
  if (!config) return res.status(404).json({ error: 'Page not found' });

  const userPrompt = prompt || `Viết bài Facebook về: ${topic}. Viết bằng tiếng Việt.`;
  const textResult = await generateText(userPrompt, config.textProvider, config.skillPrompt);
  const imageResult = await generateImage(`Facebook post illustration: ${topic}`, config.imageProvider);

  const result = await query(
    'INSERT INTO posts (page_id, topic, content, image_url, image_prompt, media_type, status, scheduled_at, created_by_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [page_id, topic, textResult.text, imageResult.image_url, imageResult.image_prompt, 'image', scheduled_at ? 'scheduled' : 'pending_approval', scheduled_at || null, 'auto', req.user.id]
  );

  res.status(201).json({
    id: result.insertId,
    page_id,
    topic,
    content: textResult.text,
    image_url: imageResult.image_url,
    skill_id: config.activeSkill?.id || null,
    skill_name: config.activeSkill?.name || null,
  });
}));

router.post('/generate-video', asyncHandler(async (req, res) => {
  const { page_id, caption, video_url, video_thumb_url, scheduled_at } = req.body;
  if (!page_id || !video_url) return res.status(400).json({ error: 'page_id and video_url are required' });
  await assertPageAccess(req.user, page_id);

  const status = scheduled_at ? 'scheduled' : 'pending_approval';
  const result = await query(
    'INSERT INTO posts (page_id, topic, content, video_url, video_thumb_url, media_type, status, scheduled_at, created_by_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [page_id, caption || '', caption || '', video_url, video_thumb_url || null, 'video', status, scheduled_at || null, 'manual', req.user.id]
  );

  res.status(201).json({ id: result.insertId, page_id, video_url, status });
}));

router.post('/generate-batch', asyncHandler(async (req, res) => {
  const { page_id, jobs, batch_id } = req.body;
  if (!page_id || !Array.isArray(jobs) || !jobs.length) {
    return res.status(400).json({ error: 'page_id and jobs are required' });
  }
  await assertPageAccess(req.user, page_id);

  const batchId = batch_id || crypto.randomUUID();
  for (const job of jobs) {
    await query(
      'INSERT INTO generate_jobs (batch_id, page_id, topic, scheduled_date, scheduled_time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [batchId, page_id, job.topic, job.scheduled_date || null, job.scheduled_time || '08:00:00', 'pending']
    );
  }

  res.status(201).json({ batch_id: batchId, count: jobs.length });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    page_id,
    topic,
    content,
    image_url,
    video_url,
    video_thumb_url,
    media_type,
    scheduled_at,
    status,
  } = req.body;

  if (!page_id || !content?.trim()) {
    return res.status(400).json({ error: 'page_id and content are required' });
  }
  await assertPageAccess(req.user, page_id);

  const resolvedMediaType = media_type || (video_url ? 'video' : image_url ? 'image' : 'none');
  let resolvedStatus = status || 'draft';
  if (scheduled_at) resolvedStatus = 'scheduled';
  if (!['draft', 'pending_approval', 'scheduled'].includes(resolvedStatus)) {
    resolvedStatus = scheduled_at ? 'scheduled' : 'draft';
  }

  const result = await query(
    'INSERT INTO posts (page_id, topic, content, image_url, video_url, video_thumb_url, media_type, status, scheduled_at, created_by_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [
      page_id,
      topic || '',
      content,
      image_url || null,
      video_url || null,
      video_thumb_url || null,
      resolvedMediaType,
      resolvedStatus,
      scheduled_at || null,
      'manual',
      req.user.id,
    ]
  );

  const posts = await query(
    'SELECT posts.*, fb_pages.name AS page_name FROM posts JOIN fb_pages ON fb_pages.id = posts.page_id WHERE posts.id = ?',
    [result.insertId]
  );
  res.status(201).json(posts[0]);
}));

router.post('/:id/publish', asyncHandler(async (req, res) => {
  const post = await assertPostAccess(req.user, req.params.id);

  const pages = await query('SELECT page_id, page_token FROM fb_pages WHERE id = ?', [post.page_id]);
  const page = pages[0];
  if (!page) return res.status(404).json({ error: 'Page not found' });

  const response = await postToFacebook({
    pageId: page.page_id,
    pageToken: page.page_token,
    message: post.content,
    imageUrl: post.media_type === 'image' ? post.image_url : null,
    videoUrl: post.media_type === 'video' ? post.video_url : null,
    scheduledPublishTime: post.scheduled_at,
    published: !post.scheduled_at || new Date(post.scheduled_at) <= new Date(),
  });

  const fbPostId = response.id || response.post_id || null;
  const newStatus = post.scheduled_at && new Date(post.scheduled_at) > new Date() ? 'scheduled' : 'published';
  await query(
    'UPDATE posts SET status = ?, published_at = IF(? = "published", NOW(), published_at), fb_post_id = ? WHERE id = ?',
    [newStatus, newStatus, fbPostId, req.params.id]
  );
  await createNotification({ type: 'success', title: 'Post published', message: `Post ${req.params.id} was published.`, relatedType: 'post', relatedId: req.params.id });

  res.json({ message: 'Post published', fb_post_id: fbPostId, status: newStatus });
}));

router.post('/:id/schedule', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  const { scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at is required' });
  await query('UPDATE posts SET status = ?, scheduled_at = ? WHERE id = ?', ['scheduled', scheduled_at, req.params.id]);
  res.json({ message: 'Post scheduled', scheduled_at });
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const post = await assertPostAccess(req.user, req.params.id);
  const status = post.scheduled_at ? 'scheduled' : 'draft';
  await query('UPDATE posts SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ message: 'Post approved', status });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const post = await assertPostAccess(req.user, req.params.id);
  const { page_id, topic, content, image_url, video_url, video_thumb_url, media_type, scheduled_at, status } = req.body;

  const targetPageId = page_id != null ? Number(page_id) : post.page_id;
  if (page_id != null && targetPageId !== post.page_id) {
    await assertPageAccess(req.user, targetPageId);
  }

  await query(
    'UPDATE posts SET page_id = ?, topic = ?, content = ?, image_url = ?, video_url = ?, video_thumb_url = ?, media_type = ?, scheduled_at = ?, status = ? WHERE id = ?',
    [targetPageId, topic, content, image_url, video_url, video_thumb_url, media_type, scheduled_at, status, req.params.id]
  );
  res.json({ message: 'Post updated' });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  await query('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ message: 'Post deleted' });
}));

export default router;
