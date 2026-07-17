import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generatePostWithMedia } from '../services/contentGenerationService.js';
import { generateWebsiteBlog } from '../services/projectContentService.js';
import { publishPostToWebsite } from '../services/websitePublishService.js';
import { getPageGenerationConfig } from '../services/providerService.js';
import { publishToFacebookWithFallback } from '../services/facebookPublishService.js';
import { persistFacebookPublishIds } from '../services/postPublishService.js';
import { ensurePostImageForPublish } from '../services/postImageService.js';
import { runImageJobForPostId } from '../services/imageGenerateJobService.js';
import { runWebsiteImageJobForPostId } from '../services/websiteImageJobService.js';
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
import {
  WEBSITE_HEADER_ALIASES,
  WEBSITE_REQUIRED_FIELD,
  buildWebsiteImportTemplateXlsx,
  normalizeWebsiteImportRows,
} from '../services/websiteImportExportService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isScheduledInFuture } from '../utils/scheduleTime.js';
import { normalizeImportContent } from '../utils/importTextNormalize.js';

const router = express.Router();
router.use(authenticate);

const ALLOWED_MEDIA_TYPES = new Set(['none', 'image', 'video']);

function normalizePageId(value) {
  if (value === '' || value == null) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function resolveMediaType(mediaType, { videoUrl, imageUrl, imagePrompt, fallback = 'none' } = {}) {
  if (ALLOWED_MEDIA_TYPES.has(mediaType)) return mediaType;
  if (videoUrl) return 'video';
  if (imageUrl || String(imagePrompt || '').trim()) return 'image';
  return ALLOWED_MEDIA_TYPES.has(fallback) ? fallback : 'none';
}

function normalizeScheduleDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return raw;
}

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/', asyncHandler(async (req, res) => {
  const {
    page: pageFilter,
    website_id: websiteFilter,
    status,
    media_type,
    date,
    platform = 'fanpage',
    sort = 'scheduled_at',
    order = 'asc',
    limit: limitRaw = 30,
    page_num: pageNumRaw = 1,
    offset: offsetRaw,
  } = req.query;

  const conditions = [];
  const params = [];

  // Website posts không có page_id (gắn website_id riêng, không qua user_pages) — bỏ filter
  // theo quyền fanpage cho các bài này; mọi user đăng nhập đều thấy được (chưa có user_websites).
  if (platform === 'website') {
    // không filter theo fanpage
  } else {
    const accessibleIds = await getAccessiblePageIds(req.user);
    const accessFilter = pageIdInClause(accessibleIds, 'posts.page_id');
    if (accessFilter.clause) {
      const fanpageAccessClause = accessFilter.clause.replace(/^ AND /, '');
      conditions.push(
        platform === 'all'
          ? `(posts.platform = 'website' OR (${fanpageAccessClause}))`
          : fanpageAccessClause
      );
      params.push(...accessFilter.params);
    }
  }

  if (pageFilter) {
    await assertPageAccess(req.user, pageFilter);
    conditions.push('posts.page_id = ?');
    params.push(pageFilter);
  }
  if (websiteFilter) { conditions.push('posts.website_id = ?'); params.push(websiteFilter); }
  if (status) { conditions.push('posts.status = ?'); params.push(status); }
  if (media_type) { conditions.push('posts.media_type = ?'); params.push(media_type); }
  if (date) { conditions.push('DATE(posts.scheduled_at) = ?'); params.push(date); }
  if (platform && platform !== 'all') { conditions.push('posts.platform = ?'); params.push(platform); }

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
  const fromClause = `FROM posts
    LEFT JOIN fb_pages ON fb_pages.id = posts.page_id
    LEFT JOIN websites ON websites.id = posts.website_id`;
  const orderClause = `ORDER BY ${sortCol} IS NULL, ${sortCol} ${sortDir}, posts.id DESC`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total ${fromClause} ${where}`,
    params
  );
  const posts = await query(
    `SELECT posts.*, fb_pages.name AS page_name, websites.name AS website_name ${fromClause} ${where} ${orderClause} LIMIT ? OFFSET ?`,
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

  const normalizedStartDate = normalizeScheduleDate(start_date);
  if (!normalizedStartDate) {
    return res.status(400).json({ error: 'start_date không hợp lệ (YYYY-MM-DD)' });
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
      const normalizedPageId = normalizePageId(page_id);
      if (!normalizedPageId) {
        return res.status(400).json({ error: 'page_id không hợp lệ' });
      }
      await assertPageAccess(req.user, normalizedPageId);
      conditions.push('page_id = ?');
      params.push(normalizedPageId);
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
    const date = addDays(normalizedStartDate, dayOffset);
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

function parseBoolDefaultTrue(value) {
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return true;
}

function parseImportOptions(body = {}) {
  let autoSchedule = body.auto_schedule;
  if (typeof autoSchedule === 'string' && autoSchedule.trim()) {
    try {
      autoSchedule = JSON.parse(autoSchedule);
    } catch {
      autoSchedule = null;
    }
  }
  const autoGenerateImages = body.auto_generate_images === false
    || body.auto_generate_images === '0'
    || body.auto_generate_images === 'false'
    ? false
    : true;
  const saveImageLocal = parseBoolDefaultTrue(body.save_image_local);
  return { autoSchedule, autoGenerateImages, saveImageLocal };
}

router.post('/import', importUpload.single('file'), asyncHandler(async (req, res) => {
  const { page_id, csv, rows: rawRows, excel_base64 } = req.body;
  const { autoSchedule, autoGenerateImages, saveImageLocal } = parseImportOptions(req.body);

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
    const autoGenerateImage = autoGenerateImages && Boolean(String(row.image_prompt || '').trim());
    const imageJobStatus = autoGenerateImage ? 'pending' : null;
    const result = await query(
      `INSERT INTO posts (page_id, topic, content, image_url, image_prompt, auto_generate_image, image_job_status, save_image_local, video_prompt, video_url, video_thumb_url, media_type, status, scheduled_at, created_by_type, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, NOW())`,
      [
        row.page_id,
        row.topic,
        row.content,
        row.image_url,
        row.image_prompt,
        autoGenerateImage,
        imageJobStatus,
        autoGenerateImage ? saveImageLocal : true,
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
      auto_generate_image: autoGenerateImage,
      scheduled_at: row.scheduled_at,
      status: row.status,
    });
  }

  const scheduledCount = created.filter((c) => c.status === 'scheduled').length;
  const autoImageCount = created.filter((c) => c.auto_generate_image).length;

  res.status(201).json({
    created_count: created.length,
    scheduled_count: scheduledCount,
    auto_generate_image_count: autoImageCount,
    post_ids: created.map((c) => c.id),
    errors,
    posts: created,
  });
}));

router.get('/import-website-blog/template', asyncHandler(async (req, res) => {
  const xlsx = buildWebsiteImportTemplateXlsx();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-import-website-blog.xlsx"');
  res.send(xlsx);
}));

router.post('/import-website-blog', importUpload.single('file'), asyncHandler(async (req, res) => {
  const { website_id, csv, rows: rawRows, excel_base64 } = req.body;
  const { autoGenerateImages, saveImageLocal } = parseImportOptions(req.body);

  if (!website_id) {
    return res.status(400).json({ error: 'website_id là bắt buộc — chọn website trước khi import' });
  }

  let parsedRows = [];
  const parseOptions = { headerAliases: WEBSITE_HEADER_ALIASES, requiredField: WEBSITE_REQUIRED_FIELD };
  if (req.file?.buffer) {
    const parsed = parseExcelBuffer(req.file.buffer, parseOptions);
    parsedRows = parsed.rows;
  } else if (Array.isArray(rawRows) && rawRows.length) {
    parsedRows = rawRows.map((row, i) => ({ ...row, _line: row._line || i + 2 }));
  } else if (excel_base64 && String(excel_base64).trim()) {
    const buffer = Buffer.from(String(excel_base64), 'base64');
    const parsed = parseExcelBuffer(buffer, parseOptions);
    parsedRows = parsed.rows;
  } else if (csv && String(csv).trim()) {
    const parsed = parseCsvText(csv, parseOptions);
    parsedRows = parsed.rows;
  } else {
    return res.status(400).json({ error: 'Cần upload file Excel, rows (mảng), excel_base64 hoặc csv' });
  }

  if (parsedRows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần import` });
  }
  if (!parsedRows.length) {
    return res.status(400).json({ error: 'File không có dòng dữ liệu hợp lệ (sheet Import, cần cột noi_dung)' });
  }

  const { rows, errors } = normalizeWebsiteImportRows(parsedRows, website_id);
  if (!rows.length) {
    return res.status(400).json({ error: 'Không có dòng hợp lệ để import', errors });
  }

  const created = [];
  for (const row of rows) {
    const autoGenerateImage = autoGenerateImages && Boolean(String(row.image_prompt || '').trim());
    const imageJobStatus = autoGenerateImage ? 'pending' : null;
    const result = await query(
      `INSERT INTO posts (website_id, platform, content, image_prompt, auto_generate_image, image_job_status, save_image_local, media_type, status, seo_meta, created_by_type, created_by, created_at)
       VALUES (?, 'website', ?, ?, ?, ?, ?, ?, 'draft', ?, 'manual', ?, NOW())`,
      [
        row.website_id,
        row.content,
        row.image_prompt,
        autoGenerateImage,
        imageJobStatus,
        autoGenerateImage ? saveImageLocal : true,
        row.image_prompt ? 'image' : 'none',
        JSON.stringify(row.seo_meta),
        req.user.id,
      ]
    );
    created.push({
      id: result.insertId,
      line: row.line,
      website_id: row.website_id,
      auto_generate_image: autoGenerateImage,
    });
  }

  res.status(201).json({
    created_count: created.length,
    auto_generate_image_count: created.filter((c) => c.auto_generate_image).length,
    post_ids: created.map((c) => c.id),
    errors,
    posts: created,
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  const posts = await query(
    `SELECT posts.*, fb_pages.name AS page_name, websites.name AS website_name
     FROM posts
     LEFT JOIN fb_pages ON fb_pages.id = posts.page_id
     LEFT JOIN websites ON websites.id = posts.website_id
     WHERE posts.id = ?`,
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
    `INSERT INTO posts (page_id, platform, post_type, topic, content, image_url, image_prompt, auto_generate_image, image_job_status, save_image_local, video_prompt, media_type, status, scheduled_at, created_by_type, created_by, created_at)
     VALUES (?, 'fanpage', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, NOW())`,
    [
      page_id,
      generated.post_type || null,
      topic,
      generated.content,
      generated.image_url,
      generated.image_prompt,
      generated.auto_generate_image,
      generated.image_job_status,
      generated.save_image_local,
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
    post_type: generated.post_type,
    media_type: generated.media_type,
    auto_generate_image: generated.auto_generate_image,
    image_job_status: generated.image_job_status,
    skill_id: config.activeTextSkill?.id || null,
    skill_name: config.activeTextSkill?.name || null,
  });
}));

router.post('/generate-website-blog', asyncHandler(async (req, res) => {
  const { website_id, topic, research_brief } = req.body;
  if (!website_id || !topic) return res.status(400).json({ error: 'website_id and topic are required' });

  const generated = await generateWebsiteBlog({ websiteId: website_id, topic, researchBrief: research_brief || '' });

  const result = await query(
    `INSERT INTO posts (website_id, platform, topic, content, image_url, image_prompt, media_type, status, seo_meta, created_by_type, created_by, created_at)
     VALUES (?, 'website', ?, ?, ?, ?, ?, 'draft', ?, 'manual', ?, NOW())`,
    [
      website_id,
      topic,
      generated.content,
      generated.image_url,
      generated.image_prompt,
      generated.image_url ? 'image' : 'none',
      JSON.stringify(generated.seoMeta),
      req.user.id,
    ]
  );

  res.status(201).json({
    id: result.insertId,
    website_id,
    topic,
    content: generated.content,
    image_url: generated.image_url,
    image_prompt: generated.image_prompt,
    seo_meta: generated.seoMeta,
    missing_project_fields: generated.missingProjectFields,
    parse_failed: generated.parseFailed,
  });
}));

router.post('/:id/publish-website', asyncHandler(async (req, res) => {
  const post = (await query('SELECT id, platform FROM posts WHERE id = ?', [req.params.id]))[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const result = await publishPostToWebsite(req.params.id);
  res.json(result);
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
    auto_generate_image,
    save_image_local,
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
  const normalizedContent = normalizeImportContent(content).trim();
  if (!normalizedContent) {
    return res.status(400).json({ error: 'content is required' });
  }
  const resolvedPageId = normalizePageId(page_id);
  if (!resolvedPageId) {
    return res.status(400).json({ error: 'page_id không hợp lệ' });
  }
  await assertPageAccess(req.user, resolvedPageId);

  const resolvedMediaType = resolveMediaType(media_type, {
    videoUrl: video_url,
    imageUrl: image_url,
    imagePrompt: image_prompt,
  });
  const resolvedAutoGenerate = auto_generate_image === true
    || auto_generate_image === 1
    || auto_generate_image === '1'
    || (
      auto_generate_image !== false
      && auto_generate_image !== 0
      && auto_generate_image !== '0'
      && Boolean(image_prompt?.trim())
      && !image_url
      && resolvedMediaType === 'image'
    );
  let resolvedStatus = status || 'draft';
  if (scheduled_at) resolvedStatus = 'scheduled';
  if (!['draft', 'pending_approval', 'scheduled'].includes(resolvedStatus)) {
    resolvedStatus = scheduled_at ? 'scheduled' : 'draft';
  }

  const resolvedSaveImageLocal = save_image_local === false
    || save_image_local === 0
    || save_image_local === '0'
    ? false
    : true;

  const result = await query(
    'INSERT INTO posts (page_id, topic, content, image_url, image_prompt, auto_generate_image, save_image_local, video_prompt, video_url, video_thumb_url, media_type, status, scheduled_at, created_by_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [
      resolvedPageId,
      topic || '',
      normalizedContent,
      image_url || null,
      image_prompt || null,
      resolvedAutoGenerate,
      resolvedSaveImageLocal,
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

  if (post.status === 'published') {
    return res.status(409).json({ error: 'Bài đã được đăng' });
  }
  if (post.status === 'publishing') {
    return res.status(409).json({ error: 'Bài đang được đăng tự động' });
  }

  const claim = await query(
    `UPDATE posts SET status = 'publishing' WHERE id = ? AND status IN ('draft', 'pending_approval', 'scheduled', 'failed')`,
    [req.params.id]
  );
  if (!claim.affectedRows) {
    return res.status(409).json({ error: 'Không thể đăng bài ở trạng thái hiện tại' });
  }

  const pages = await query('SELECT page_id, page_token, image_provider_id FROM fb_pages WHERE id = ?', [post.page_id]);
  const page = pages[0];
  if (!page) {
    await query('UPDATE posts SET status = ? WHERE id = ?', ['failed', req.params.id]);
    return res.status(404).json({ error: 'Page not found' });
  }

  try {
    const readyPost = await ensurePostImageForPublish(post, page.image_provider_id);

    // Đăng thủ công = đăng ngay; không gửi scheduled_at cũ (cron lên lịch xử lý riêng).
    const response = await publishToFacebookWithFallback({
      internalPageId: post.page_id,
      pageId: page.page_id,
      message: readyPost.content,
      imageUrl: readyPost.media_type === 'image' ? readyPost.image_url : null,
      videoUrl: readyPost.media_type === 'video' ? readyPost.video_url : null,
      published: true,
    });

    const fbIds = await persistFacebookPublishIds(req.params.id, response, {
      hasImage: readyPost.media_type === 'image',
      hasVideo: readyPost.media_type === 'video',
    });
    const newStatus = isScheduledInFuture(post.scheduled_at) ? 'scheduled' : 'published';
    await query(
      'UPDATE posts SET status = ?, published_at = IF(? = "published", NOW(), published_at), error_message = NULL WHERE id = ?',
      [newStatus, newStatus, req.params.id]
    );
    await createNotification({ type: 'success', title: 'Post published', message: `Post ${req.params.id} was published.`, relatedType: 'post', relatedId: req.params.id });

    res.json({ message: 'Post published', ...fbIds, status: newStatus });
  } catch (error) {
    const statusAfterError = isScheduledInFuture(post.scheduled_at) ? 'scheduled' : 'failed';
    await query('UPDATE posts SET status = ?, error_message = ? WHERE id = ?', [statusAfterError, error.message, req.params.id]);
    throw error;
  }
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
    auto_generate_image,
    save_image_local,
    video_prompt,
    video_url,
    video_thumb_url,
    media_type,
    scheduled_at,
    status,
    seo_meta: seoMetaInput,
  } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  const normalizedContent = normalizeImportContent(content).trim();
  if (!normalizedContent) {
    return res.status(400).json({ error: 'content is required' });
  }

  const targetPageId = page_id !== undefined
    ? (() => {
      const normalized = normalizePageId(page_id);
      if (!normalized) return null;
      return normalized;
    })()
    : post.page_id;
  if (page_id !== undefined && !targetPageId) {
    return res.status(400).json({ error: 'page_id không hợp lệ' });
  }
  if (page_id !== undefined && targetPageId !== post.page_id) {
    await assertPageAccess(req.user, targetPageId);
  }

  const finalTopic = topic !== undefined ? (topic || '') : (post.topic || '');
  const finalImagePrompt = image_prompt !== undefined
    ? (String(image_prompt || '').trim() || null)
    : post.image_prompt;
  const finalImageUrl = image_url !== undefined ? (image_url || null) : post.image_url;
  const finalVideoPrompt = video_prompt !== undefined
    ? (String(video_prompt || '').trim() || null)
    : post.video_prompt;
  const finalVideoUrl = video_url !== undefined ? (video_url || null) : post.video_url;
  const finalVideoThumb = video_thumb_url !== undefined ? (video_thumb_url || null) : post.video_thumb_url;
  const finalScheduledAt = scheduled_at !== undefined ? (scheduled_at || null) : post.scheduled_at;

  const resolvedMediaType = resolveMediaType(media_type, {
    videoUrl: finalVideoUrl,
    imageUrl: finalImageUrl,
    imagePrompt: finalImagePrompt,
    fallback: post.media_type || 'none',
  });

  const resolvedAutoGenerate = auto_generate_image === true
    || auto_generate_image === 1
    || auto_generate_image === '1'
    ? true
    : auto_generate_image === false
      || auto_generate_image === 0
      || auto_generate_image === '0'
      ? false
      : Boolean(String(finalImagePrompt || '').trim())
        && !finalImageUrl
        && resolvedMediaType === 'image';

  const resolvedSaveImageLocal = save_image_local === false
    || save_image_local === 0
    || save_image_local === '0'
    ? false
    : save_image_local === true
      || save_image_local === 1
      || save_image_local === '1'
      ? true
      : post.save_image_local !== 0 && post.save_image_local !== false;

  const ALLOWED_STATUS = ['draft', 'pending_approval', 'scheduled', 'published', 'failed'];
  let resolvedStatus = status ?? post.status ?? 'draft';
  if (!ALLOWED_STATUS.includes(resolvedStatus)) resolvedStatus = post.status || 'draft';
  if (finalScheduledAt) {
    resolvedStatus = 'scheduled';
  } else if (resolvedStatus === 'scheduled' && !finalScheduledAt) {
    resolvedStatus = ['published', 'failed', 'pending_approval'].includes(post.status)
      ? post.status
      : 'draft';
  }

  let finalSeoMeta = post.seo_meta;
  if (seoMetaInput !== undefined) {
    let existingSeoMeta = {};
    try {
      existingSeoMeta = typeof post.seo_meta === 'string' ? JSON.parse(post.seo_meta) : (post.seo_meta || {});
    } catch {
      existingSeoMeta = {};
    }
    finalSeoMeta = JSON.stringify({ ...existingSeoMeta, ...seoMetaInput });
  }

  const clearImageJobStatus = finalImageUrl && (!post.image_url || image_url !== undefined);
  await query(
    `UPDATE posts SET page_id = ?, topic = ?, content = ?, image_url = ?, image_prompt = ?, auto_generate_image = ?, save_image_local = ?, video_prompt = ?,
     video_url = ?, video_thumb_url = ?, media_type = ?, scheduled_at = ?, status = ?, seo_meta = ?${clearImageJobStatus ? ', image_job_status = ?, error_message = ?' : ''} WHERE id = ?`,
    [
      targetPageId,
      finalTopic,
      normalizedContent,
      finalImageUrl,
      finalImagePrompt,
      resolvedAutoGenerate,
      resolvedSaveImageLocal,
      finalVideoPrompt,
      finalVideoUrl,
      finalVideoThumb,
      resolvedMediaType,
      finalScheduledAt,
      resolvedStatus,
      finalSeoMeta,
      ...(clearImageJobStatus ? ['done', null] : []),
      req.params.id,
    ]
  );
  res.json({ message: 'Post updated' });
}));

router.post('/:id/generate-website-image', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);

  if (req.body?.prompt) {
    await query(
      `UPDATE posts SET image_prompt = ? WHERE id = ? AND platform = 'website'`,
      [String(req.body.prompt).trim(), req.params.id]
    );
  }

  const result = await runWebsiteImageJobForPostId(req.params.id);
  if (result.skipped && result.post?.image_url) {
    return res.json({ message: 'Bài đã có ảnh', image_url: result.post.image_url });
  }
  if (result.error) {
    return res.status(502).json({ error: result.error });
  }
  res.json({ message: 'Đã generate ảnh', image_url: result.post?.image_url });
}));

router.post('/:id/generate-image', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  const rows = await query(
    'SELECT id, page_id, image_url, image_prompt, save_image_local, image_job_status FROM posts WHERE id = ?',
    [req.params.id]
  );
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const prompt = String(req.body?.prompt || post.image_prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ error: 'Bài chưa có prompt ảnh. Thêm prompt trước khi xuất ảnh.' });
  }

  if (req.body?.prompt && req.body.prompt !== post.image_prompt) {
    await query('UPDATE posts SET image_prompt = ? WHERE id = ?', [prompt, req.params.id]);
  }

  if (req.body?.save_image_local != null) {
    await query('UPDATE posts SET save_image_local = ? WHERE id = ?', [
      parseBoolDefaultTrue(req.body.save_image_local) ? 1 : 0,
      req.params.id,
    ]);
  }

  const result = await runImageJobForPostId(req.params.id, { source: 'manual' });
  if (result.skipped && post.image_url) {
    return res.json({ message: 'Bài đã có ảnh', image_url: post.image_url });
  }
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const updated = result.post || (await query('SELECT * FROM posts WHERE id = ?', [req.params.id]))[0];
  const persist = updated.save_image_local !== 0 && updated.save_image_local !== false;

  res.json({
    message: persist ? 'Đã xuất ảnh từ prompt' : 'Đã tạo ảnh AI (chưa lưu — dùng URL tạm khi đăng)',
    image_url: updated.image_url,
    image_prompt: updated.image_prompt,
    media_type: 'image',
    image_job_status: updated.image_job_status,
    saved: persist,
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await assertPostAccess(req.user, req.params.id);
  await query('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ message: 'Post deleted' });
}));

export default router;
