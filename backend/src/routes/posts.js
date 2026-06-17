import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generatePostWithMedia } from '../services/contentGenerationService.js';
import { generateImage } from '../services/imageService.js';
import { getPageGenerationConfig, getProviderById } from '../services/providerService.js';
import { postToFacebook } from '../services/fbService.js';
import { persistFacebookPublishIds } from '../services/postPublishService.js';
import { createNotification } from '../services/notifyService.js';
import {
  getAccessiblePageIds,
  assertPageAccess,
  assertPostAccess,
  pageIdInClause,
} from '../services/pageAccessService.js';
import {
  buildImportTemplateXlsx,
  parseExcelBuffer,
  parseCsvText,
  normalizeImportRows,
  buildAutoScheduleSlots,
  MAX_IMPORT_ROWS,
} from '../services/postImportExportService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
router.use(authenticate);

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/', asyncHandler(async (req, res) => {
  const {
    page: pageFilter,
    status,
    media_type,
    date,
    sort = 'scheduled_at',
    order = 'asc',
    limit: limitRaw = 30,
    page_num: pageNumRaw = 1,
    offset: offsetRaw,
  } = req.query;

  const accessibleIds = await getAccessiblePageIds(req.user);
  const conditions = [];
  const params = [];

  const accessFilter = pageIdInClause(accessibleIds, 'posts.page_id');
  if (accessFilter.clause) {
    conditions.push(accessFilter.clause.replace(/^ AND /, ''));
    params.push(...accessFilter.params);
  }

  if (pageFilter) {
    await assertPageAccess(req.user, pageFilter);
    conditions.push('posts.page_id = ?');
    params.push(pageFilter);
  }
  if (status) { conditions.push('posts.status = ?'); params.push(status); }
  if (media_type) { conditions.push('posts.media_type = ?'); params.push(media_type); }
  if (date) { conditions.push('DATE(posts.scheduled_at) = ?'); params.push(date); }

  const sortColumns = {
    scheduled_at: 'posts.scheduled_at',
    created_at: 'posts.created_at',
    published_at: 'posts.published_at',
    id: 'posts.id',
  };
  const sortCol = sortColumns[sort] || sortColumns.scheduled_at;
  const sortDir = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 30, 1), 200);
  const pageNum = Math.max(parseInt(pageNumRaw, 10) || 1, 1);
  const offset = offsetRaw != null && offsetRaw !== ''
    ? Math.max(parseInt(offsetRaw, 10) || 0, 0)
    : (pageNum - 1) * limit;

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fromClause = 'FROM posts JOIN fb_pages ON fb_pages.id = posts.page_id';
  const orderClause = `ORDER BY ${sortCol} IS NULL, ${sortCol} ${sortDir}, posts.id DESC`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total ${fromClause} ${where}`,
    params
  );
  const posts = await query(
    `SELECT posts.*, fb_pages.name AS page_name ${fromClause} ${where} ${orderClause} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    items: posts,
    total: countRow?.total ?? posts.length,
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
    sort,
    order: sortDir.toLowerCase(),
  });
}));

router.post('/bulk-schedule', asyncHandler(async (req, res) => {
  const { post_ids, page_id, start_date, times } = req.body;
  if (!start_date || !Array.isArray(times) || !times.length) {
    return res.status(400).json({ error: 'start_date và times là bắt buộc' });
  }

  const normalizedTimes = times
    .map((t) => String(t).trim().slice(0, 5))
    .filter(Boolean);
  if (!normalizedTimes.length) {
    return res.status(400).json({ error: 'Cần ít nhất một khung giờ' });
  }

  const accessibleIds = await getAccessiblePageIds(req.user);
  const schedulableStatuses = ['draft', 'pending_approval'];
  let posts = [];

  if (Array.isArray(post_ids) && post_ids.length) {
    const ids = post_ids.map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'post_ids không hợp lệ' });

    const placeholders = ids.map(() => '?').join(',');
    posts = await query(
      `SELECT id, page_id, status FROM posts WHERE id IN (${placeholders}) ORDER BY id ASC`,
      ids
    );
    for (const post of posts) {
      await assertPostAccess(req.user, post.id);
      if (!schedulableStatuses.includes(post.status)) {
        return res.status(400).json({ error: `Bài #${post.id} không thể lên lịch (trạng thái: ${post.status})` });
      }
    }
  } else {
    const conditions = [`status IN ('draft', 'pending_approval')`];
    const params = [];

    const accessFilter = pageIdInClause(accessibleIds, 'page_id');
    if (accessFilter.clause) {
      conditions.push(accessFilter.clause.replace(/^ AND /, ''));
      params.push(...accessFilter.params);
    }
    if (page_id) {
      await assertPageAccess(req.user, page_id);
      conditions.push('page_id = ?');
      params.push(page_id);
    }

    posts = await query(
      `SELECT id, page_id, status FROM posts
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC, id ASC
       LIMIT 500`,
      params
    );
  }

  if (!posts.length) {
    return res.status(400).json({ error: 'Không có bài nào để lên lịch' });
  }

  const pad = (n) => String(n).padStart(2, '0');
  const addDays = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  const slotsPerDay = normalizedTimes.length;
  const updates = [];

  for (let i = 0; i < posts.length; i += 1) {
    const dayOffset = Math.floor(i / slotsPerDay);
    const time = normalizedTimes[i % slotsPerDay];
    const date = addDays(start_date, dayOffset);
    const scheduledAt = `${date} ${time}:00`;
    updates.push({ id: posts[i].id, scheduled_at: scheduledAt });
  }

  for (const row of updates) {
    await query(
      'UPDATE posts SET status = ?, scheduled_at = ? WHERE id = ?',
      ['scheduled', row.scheduled_at, row.id]
    );
  }

  res.json({
    scheduled_count: updates.length,
    days: Math.ceil(updates.length / slotsPerDay),
    slots_per_day: slotsPerDay,
    start_date,
    end_date: updates[updates.length - 1]?.scheduled_at?.slice(0, 10) || start_date,
  });
}));

const BULK_STATUSES = new Set(['draft', 'pending_approval', 'scheduled', 'published', 'failed']);

router.post('/bulk-delete', asyncHandler(async (req, res) => {
  const { post_ids } = req.body;
  if (!Array.isArray(post_ids) || !post_ids.length) {
    return res.status(400).json({ error: 'post_ids là bắt buộc' });
  }

  const ids = [...new Set(post_ids.map(Number).filter(Boolean))];
  let deleted_count = 0;
  const errors = [];

  for (const id of ids) {
    try {
      await assertPostAccess(req.user, id);
      const result = await query('DELETE FROM posts WHERE id = ?', [id]);
      if (result.affectedRows) deleted_count += 1;
      else errors.push({ id, error: 'Không tìm thấy bài' });
    } catch (err) {
      errors.push({ id, error: err.message || 'Không xóa được' });
    }
  }

  res.json({ deleted_count, errors });
}));

router.post('/bulk-status', asyncHandler(async (req, res) => {
  const { post_ids, status } = req.body;
  if (!Array.isArray(post_ids) || !post_ids.length) {
    return res.status(400).json({ error: 'post_ids là bắt buộc' });
  }
  if (!BULK_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status không hợp lệ' });
  }

  const ids = [...new Set(post_ids.map(Number).filter(Boolean))];
  let updated_count = 0;
  const errors = [];

  for (const id of ids) {
    try {
      await assertPostAccess(req.user, id);
      const result = await query('UPDATE posts SET status = ? WHERE id = ?', [status, id]);
      if (result.affectedRows) updated_count += 1;
      else errors.push({ id, error: 'Không tìm thấy bài' });
    } catch (err) {
      errors.push({ id, error: err.message || 'Không cập nhật được' });
    }
  }

  res.json({ updated_count, status, errors });
}));

router.get('/import/template', asyncHandler(async (req, res) => {
  const xlsx = buildImportTemplateXlsx();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-import-bai-viet.xlsx"');
  res.send(xlsx);
}));

function parseImportOptions(body = {}) {
  let autoSchedule = body.auto_schedule;
  if (typeof autoSchedule === 'string' && autoSchedule.trim()) {
    try {
      autoSchedule = JSON.parse(autoSchedule);
    } catch {
      autoSchedule = null;
    }
  }
  const autoGenerateImages = body.auto_generate_images === true
    || body.auto_generate_images === '1'
    || body.auto_generate_images === 'true';
  return { autoSchedule, autoGenerateImages };
}

router.post('/import', importUpload.single('file'), asyncHandler(async (req, res) => {
  const { page_id, csv, rows: rawRows, excel_base64 } = req.body;
  const { autoSchedule, autoGenerateImages } = parseImportOptions(req.body);

  if (!page_id) {
    return res.status(400).json({ error: 'page_id là bắt buộc — chọn fanpage trước khi import' });
  }

  await assertPageAccess(req.user, page_id);

  let parsedRows = [];
  if (req.file?.buffer) {
    const parsed = parseExcelBuffer(req.file.buffer);
    parsedRows = parsed.rows;
    if (parsedRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần import` });
    }
    if (!parsedRows.length) {
      return res.status(400).json({ error: 'File Excel không có dòng dữ liệu hợp lệ (sheet Import)' });
    }
  } else if (Array.isArray(rawRows) && rawRows.length) {
    parsedRows = rawRows.map((row, i) => ({ ...row, _line: row._line || i + 2 }));
  } else if (excel_base64 && String(excel_base64).trim()) {
    const buffer = Buffer.from(String(excel_base64), 'base64');
    const parsed = parseExcelBuffer(buffer);
    parsedRows = parsed.rows;
    if (parsedRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần import` });
    }
    if (!parsedRows.length) {
      return res.status(400).json({ error: 'File Excel không có dòng dữ liệu hợp lệ (sheet Import)' });
    }
  } else if (csv && String(csv).trim()) {
    const parsed = parseCsvText(csv);
    parsedRows = parsed.rows;
    if (parsedRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần import` });
    }
    if (!parsedRows.length) {
      return res.status(400).json({ error: 'File không có dòng dữ liệu hợp lệ' });
    }
  } else {
    return res.status(400).json({ error: 'Cần upload file Excel, rows (mảng), excel_base64 hoặc csv' });
  }

  let { rows, errors } = normalizeImportRows(parsedRows, page_id);

  if (!rows.length) {
    return res.status(400).json({
      error: 'Không có dòng hợp lệ để import',
      errors,
    });
  }

  if (autoSchedule?.start_date && Array.isArray(autoSchedule.times) && autoSchedule.times.length) {
    rows = buildAutoScheduleSlots(rows, autoSchedule.start_date, autoSchedule.times);
  }

  const created = [];
  for (const row of rows) {
    await assertPageAccess(req.user, row.page_id);
    const result = await query(
      `INSERT INTO posts (page_id, topic, content, image_url, image_prompt, video_prompt, video_url, video_thumb_url, media_type, status, scheduled_at, created_by_type, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, NOW())`,
      [
        row.page_id,
        row.topic,
        row.content,
        row.image_url,
        row.image_prompt,
        row.video_prompt,
        row.video_url,
        row.video_thumb_url,
        row.media_type,
        row.status,
        row.scheduled_at,
        req.user.id,
      ]
    );
    created.push({
      id: result.insertId,
      line: row.line,
      page_id: row.page_id,
      image_prompt: row.image_prompt,
      scheduled_at: row.scheduled_at,
      status: row.status,
    });
  }

  let imageGeneratedCount = 0;
  const imageErrors = [];

  if (autoGenerateImages) {
    const pageRows = await query('SELECT image_provider_id FROM fb_pages WHERE id = ?', [page_id]);
    const imageProvider = await getProviderById(pageRows[0]?.image_provider_id);

    for (const item of created) {
      const prompt = String(item.image_prompt || '').trim();
      if (!prompt) continue;

      try {
        if (!imageProvider) {
          throw new Error('Fanpage chưa cấu hình AI provider ảnh');
        }
        const imageResult = await generateImage(prompt, imageProvider);
        await query(
          'UPDATE posts SET image_url = ?, image_prompt = ?, media_type = ? WHERE id = ?',
          [imageResult.image_url, imageResult.image_prompt || prompt, 'image', item.id]
        );
        imageGeneratedCount += 1;
      } catch (err) {
        imageErrors.push({
          id: item.id,
          line: item.line,
          error: err.message || 'Xuất ảnh thất bại',
        });
      }
    }
  }

  const scheduledCount = created.filter((c) => c.status === 'scheduled').length;

  res.status(201).json({
    created_count: created.length,
    scheduled_count: scheduledCount,
    image_generated_count: imageGeneratedCount,
    image_errors: imageErrors,
    post_ids: created.map((c) => c.id),
    errors,
    posts: created,
  });
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
  const { page_id, topic, prompt, scheduled_at, skill_id, media_type } = req.body;
  if (!page_id || !topic) return res.status(400).json({ error: 'page_id and topic are required' });
  await assertPageAccess(req.user, page_id);

  const config = await getPageGenerationConfig(page_id, {
    textSkillId: skill_id || null,
    mediaType: media_type || null,
  });
  if (!config) return res.status(404).json({ error: 'Page not found' });

  const userPrompt = prompt || `Viết bài Facebook về: ${topic}.`;
  const generated = await generatePostWithMedia({
    topic,
    userPrompt,
    config,
    mediaMode: config.mediaMode,
  });

  const status = scheduled_at ? 'scheduled' : 'pending_approval';
  const result = await query(
    `INSERT INTO posts (page_id, topic, content, image_url, image_prompt, video_prompt, media_type, status, scheduled_at, created_by_type, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, NOW())`,
    [
      page_id,
      topic,
      generated.content,
      generated.image_url,
      generated.image_prompt,
      generated.video_prompt,
      generated.media_type,
      status,
      scheduled_at || null,
      req.user.id,
    ]
  );

  res.status(201).json({
    id: result.insertId,
    page_id,
    topic,
    content: generated.content,
    image_url: generated.image_url,
    image_prompt: generated.image_prompt,
    video_prompt: generated.video_prompt,
    media_type: generated.media_type,
    skill_id: config.activeTextSkill?.id || null,
    skill_name: config.activeTextSkill?.name || null,
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
  let oneTimeCount = 0;
  let recurringCount = 0;

  for (const job of jobs) {
    if (!job.topic?.trim()) continue;

    const postTime = job.scheduled_time || '08:00:00';
    const normalizedTime = postTime.length === 5 ? `${postTime}:00` : postTime;

    if (job.repeat_daily) {
      await query(
        `INSERT INTO content_topics (page_id, day_of_week, topic, post_time, is_active, repeat_daily)
         VALUES (?, 0, ?, ?, true, true)`,
        [page_id, job.topic.trim(), normalizedTime]
      );
      recurringCount += 1;
      continue;
    }

    // Một lần: chỉ lưu chủ đề — không bắt buộc ngày/giờ (user tự lên lịch sau khi AI tạo)
    await query(
      'INSERT INTO generate_jobs (batch_id, page_id, topic, scheduled_date, scheduled_time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [
        batchId,
        page_id,
        job.topic.trim(),
        job.scheduled_date || null,
        job.scheduled_date ? normalizedTime : null,
        'pending',
      ]
    );
    oneTimeCount += 1;
  }

  if (!oneTimeCount && !recurringCount) {
    return res.status(400).json({ error: 'Cần ít nhất một chủ đề hợp lệ' });
  }

  res.status(201).json({
    batch_id: oneTimeCount ? batchId : null,
    count: oneTimeCount + recurringCount,
    one_time_count: oneTimeCount,
    recurring_count: recurringCount,
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    page_id,
    topic,
    content,
    image_url,
    image_prompt,
    video_prompt,
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
    'INSERT INTO posts (page_id, topic, content, image_url, image_prompt, video_prompt, video_url, video_thumb_url, media_type, status, scheduled_at, created_by_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [
      page_id,
      topic || '',
      content,
      image_url || null,
      image_prompt || null,
      video_prompt || null,
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

  const fbIds = await persistFacebookPublishIds(req.params.id, response, {
    hasImage: post.media_type === 'image',
    hasVideo: post.media_type === 'video',
  });
  const newStatus = post.scheduled_at && new Date(post.scheduled_at) > new Date() ? 'scheduled' : 'published';
  await query(
    'UPDATE posts SET status = ?, published_at = IF(? = "published", NOW(), published_at) WHERE id = ?',
    [newStatus, newStatus, req.params.id]
  );
  await createNotification({ type: 'success', title: 'Post published', message: `Post ${req.params.id} was published.`, relatedType: 'post', relatedId: req.params.id });

  res.json({ message: 'Post published', ...fbIds, status: newStatus });
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
  const {
    page_id,
    topic,
    content,
    image_url,
    image_prompt,
    video_prompt,
    video_url,
    video_thumb_url,
    media_type,
    scheduled_at,
    status,
  } = req.body;

  const targetPageId = page_id != null ? Number(page_id) : post.page_id;
  if (page_id != null && targetPageId !== post.page_id) {
    await assertPageAccess(req.user, targetPageId);
  }

  await query(
    `UPDATE posts SET page_id = ?, topic = ?, content = ?, image_url = ?, image_prompt = ?, video_prompt = ?,
     video_url = ?, video_thumb_url = ?, media_type = ?, scheduled_at = ?, status = ? WHERE id = ?`,
    [
      targetPageId,
      topic,
      content,
      image_url,
      image_prompt ?? post.image_prompt,
      video_prompt ?? post.video_prompt,
      video_url,
      video_thumb_url,
      media_type,
      scheduled_at,
      status,
      req.params.id,
    ]
  );
  res.json({ message: 'Post updated' });
}));

router.post('/:id/generate-image', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  const rows = await query('SELECT page_id, image_prompt FROM posts WHERE id = ?', [req.params.id]);
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const prompt = String(req.body?.prompt || post.image_prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ error: 'Bài chưa có prompt ảnh. Thêm prompt trước khi xuất ảnh.' });
  }

  const pages = await query('SELECT image_provider_id FROM fb_pages WHERE id = ?', [post.page_id]);
  const imageProvider = await getProviderById(pages[0]?.image_provider_id);
  if (!imageProvider) {
    return res.status(400).json({ error: 'Fanpage chưa cấu hình AI provider ảnh' });
  }

  const imageResult = await generateImage(prompt, imageProvider);
  await query(
    'UPDATE posts SET image_url = ?, image_prompt = ?, media_type = ? WHERE id = ?',
    [imageResult.image_url, imageResult.image_prompt || prompt, 'image', req.params.id]
  );

  res.json({
    message: 'Đã xuất ảnh từ prompt',
    image_url: imageResult.image_url,
    image_prompt: imageResult.image_prompt || prompt,
    media_type: 'image',
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  await query('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ message: 'Post deleted' });
}));

export default router;
