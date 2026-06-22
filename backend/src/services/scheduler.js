import cron from 'node-cron';
import { query } from '../db.js';
import { processPendingJobs } from './jobWorker.js';
import { postToFacebook } from './fbService.js';
import { publishToFacebookWithFallback } from './facebookPublishService.js';
import { createNotification } from './notifyService.js';
import { persistFacebookPublishIds } from './postPublishService.js';
import { ensurePostImageForPublish } from './postImageService.js';
import { runDueTopicSlots } from './topicSlotService.js';
import { claimDueScheduledPosts, recoverStuckPublishingPosts } from './publishClaimService.js';
import { runNextScheduledImageJob } from './imageGenerateJobService.js';
import { getAssignedPageIds } from './pageAccessService.js';
import {
  getEnabledPageImageSchedules,
  filterPagesWithoutOwnSchedule,
  touchPageImageScheduleLastRun,
  isPageScheduleDue,
  pageScheduleWindowConfig,
} from './pageImageSchedule.js';
import {
  getEnabledImageSchedules,
  isWithinImageWindow,
  getZonedNow,
  touchImageScheduleLastRun,
} from './imageScheduleConfig.js';
import { checkAllPageTokens } from './tokenHealthService.js';

let started = false;
let publishDuePostsRunning = false;
let runDueTopicSlotsRunning = false;
let tickImageScheduleRunning = false;
const nightlyStatsByUser = new Map();
const nightlyStatsByPage = new Map();

export function startScheduler() {
  if (started || process.env.DISABLE_SCHEDULER === 'true') return;
  started = true;

  cron.schedule('* * * * *', () => runExclusive(publishDuePosts, 'publishDuePosts'));
  cron.schedule('* * * * *', () => runExclusive(runDueTopicSlots, 'runDueTopicSlots'));
  cron.schedule('* * * * *', () => runExclusive(tickImageSchedule, 'tickImageSchedule'));
  cron.schedule('*/5 * * * *', () => processPendingJobs(5));
  cron.schedule('0 * * * *', () => runExclusive(checkPageTokens, 'checkPageTokens'));

  getEnabledImageSchedules().then((rows) => {
    console.log(`Image schedule: ${rows.length} admin đang bật lịch (mỗi admin chỉ fanpage được gán)`);
  }).catch(() => {});
  getEnabledPageImageSchedules().then((rows) => {
    console.log(`Page image schedule: ${rows.length} fanpage đang bật lịch riêng`);
  }).catch(() => {});

  recoverStuckPublishingPosts().catch((error) => {
    console.warn('recoverStuckPublishingPosts failed:', error.message);
  });

  query(
    `UPDATE posts SET image_job_status = 'pending'
     WHERE image_job_status = 'processing' AND (image_url IS NULL OR image_url = '')`
  ).catch((error) => {
    console.warn('recoverStuckImageJobs failed:', error.message);
  });

  console.log('Scheduler started');
}

async function runExclusive(task, label) {
  const flags = {
    publishDuePosts: publishDuePostsRunning,
    runDueTopicSlots: runDueTopicSlotsRunning,
    tickImageSchedule: tickImageScheduleRunning,
  };
  if (flags[label]) return;

  if (label === 'publishDuePosts') publishDuePostsRunning = true;
  else if (label === 'runDueTopicSlots') runDueTopicSlotsRunning = true;
  else tickImageScheduleRunning = true;

  try {
    await task();
  } catch (error) {
    console.error(`${label} failed:`, error.message);
  } finally {
    if (label === 'publishDuePosts') publishDuePostsRunning = false;
    else if (label === 'runDueTopicSlots') runDueTopicSlotsRunning = false;
    else tickImageScheduleRunning = false;
  }
}

function windowKey(zonedNow, config) {
  return `${config.user_id}-${zonedNow.dateKey}-${config.start_hour}:${config.start_minute}`;
}

function pageWindowKey(zonedNow, pageId, config) {
  return `page-${pageId}-${zonedNow.dateKey}-${config.start_hour}:${config.start_minute}`;
}

async function flushNightlyStats(userId, userName, stats) {
  if (!stats || (stats.ok <= 0 && stats.failed <= 0)) return;
  await createNotification({
    type: stats.failed > 0 ? 'warning' : 'success',
    title: 'Xuất ảnh theo lịch',
    message: stats.failed > 0
      ? `${userName}: ${stats.ok} ảnh OK — ${stats.failed} job hủy (lỗi)`
      : `${userName}: đã xuất ${stats.ok} ảnh (fanpage của bạn)`,
    relatedType: 'post',
  });
}

async function flushPageNightlyStats(pageId, pageName, stats) {
  if (!stats || (stats.ok <= 0 && stats.failed <= 0)) return;
  await createNotification({
    type: stats.failed > 0 ? 'warning' : 'success',
    title: 'Xuất ảnh theo lịch fanpage',
    message: stats.failed > 0
      ? `${pageName}: ${stats.ok} ảnh OK — ${stats.failed} job hủy (lỗi)`
      : `${pageName}: đã xuất ${stats.ok} ảnh ban đêm`,
    relatedType: 'page',
    relatedId: pageId,
  });
}

async function tickPageImageSchedules(zonedNow) {
  const pages = await getEnabledPageImageSchedules();
  const activePageIds = new Set();

  for (const page of pages) {
    const config = pageScheduleWindowConfig(page);
    const key = pageWindowKey(zonedNow, page.id, config);

    if (!isWithinImageWindow(config, zonedNow)) {
      const prev = nightlyStatsByPage.get(page.id);
      if (prev?.lastWindowKey && prev.lastWindowKey !== key) {
        await flushPageNightlyStats(page.id, page.name, prev);
        nightlyStatsByPage.delete(page.id);
      }
      continue;
    }

    activePageIds.add(page.id);

    if (!nightlyStatsByPage.has(page.id)) {
      nightlyStatsByPage.set(page.id, { ok: 0, failed: 0, lastWindowKey: key });
    }
    const stats = nightlyStatsByPage.get(page.id);
    if (stats.lastWindowKey !== key) {
      await flushPageNightlyStats(page.id, page.name, stats);
      nightlyStatsByPage.set(page.id, { ok: 0, failed: 0, lastWindowKey: key });
    }

    if (!isPageScheduleDue(page, zonedNow)) continue;

    const result = await runNextScheduledImageJob([page.id], null);
    if (!result.processed) continue;

    await touchPageImageScheduleLastRun(page.id);
    stats.ok += result.ok || 0;
    stats.failed += result.failed || 0;

    if (result.ok) {
      console.log(`Page image schedule #${page.id} (${page.name}): +1 ảnh`);
    }
  }

  for (const [pageId, stats] of nightlyStatsByPage.entries()) {
    if (!activePageIds.has(pageId) && stats.lastWindowKey) {
      const rows = await query('SELECT name FROM fb_pages WHERE id = ?', [pageId]);
      await flushPageNightlyStats(pageId, rows[0]?.name || `Page #${pageId}`, stats);
      nightlyStatsByPage.delete(pageId);
    }
  }
}

async function tickImageSchedule() {
  const zonedNow = getZonedNow();
  await tickPageImageSchedules(zonedNow);

  const schedules = await getEnabledImageSchedules();
  const activeUserIds = new Set();

  for (const schedule of schedules) {
    const config = {
      user_id: schedule.user_id,
      enabled: true,
      start_hour: schedule.start_hour,
      start_minute: schedule.start_minute,
      end_hour: schedule.end_hour,
      end_minute: schedule.end_minute,
      interval_minutes: schedule.interval_minutes,
      timezone: schedule.timezone,
      last_run_at: schedule.last_run_at,
    };

    const key = windowKey(zonedNow, config);

    if (!isWithinImageWindow(config, zonedNow)) {
      const prev = nightlyStatsByUser.get(schedule.user_id);
      if (prev?.lastWindowKey && prev.lastWindowKey !== key) {
        await flushNightlyStats(schedule.user_id, schedule.user_name, prev);
        nightlyStatsByUser.delete(schedule.user_id);
      }
      continue;
    }

    activeUserIds.add(schedule.user_id);

    if (!nightlyStatsByUser.has(schedule.user_id)) {
      nightlyStatsByUser.set(schedule.user_id, { ok: 0, failed: 0, lastWindowKey: key });
    }
    const stats = nightlyStatsByUser.get(schedule.user_id);
    if (stats.lastWindowKey !== key) {
      await flushNightlyStats(schedule.user_id, schedule.user_name, stats);
      nightlyStatsByUser.set(schedule.user_id, { ok: 0, failed: 0, lastWindowKey: key });
    }

    if (schedule.last_run_at) {
      const elapsed = Date.now() - new Date(schedule.last_run_at).getTime();
      if (elapsed < schedule.interval_minutes * 60 * 1000) continue;
    }

    const pageIds = await filterPagesWithoutOwnSchedule(await getAssignedPageIds(schedule.user_id));
    if (!pageIds.length) continue;

    const result = await runNextScheduledImageJob(pageIds, schedule.user_id);
    if (!result.processed) continue;

    await touchImageScheduleLastRun(schedule.user_id);
    const current = nightlyStatsByUser.get(schedule.user_id);
    current.ok += result.ok || 0;
    current.failed += result.failed || 0;

    if (result.ok) {
      console.log(
        `Image schedule user #${schedule.user_id} (${schedule.user_name}): +1 ảnh, `
        + `${pageIds.length} fanpage trong phạm vi`
      );
    }
  }

  for (const [userId, stats] of nightlyStatsByUser.entries()) {
    if (!activeUserIds.has(userId) && stats.lastWindowKey) {
      const rows = await query('SELECT name FROM users WHERE id = ?', [userId]);
      await flushNightlyStats(userId, rows[0]?.name || `User #${userId}`, stats);
      nightlyStatsByUser.delete(userId);
    }
  }
}

async function publishDuePosts() {
  const posts = await claimDueScheduledPosts();

  for (const post of posts) {
    try {
      const readyPost = await ensurePostImageForPublish(post, post.image_provider_id);
      const response = await publishToFacebookWithFallback({
        internalPageId: post.page_id,
        pageId: readyPost.fb_page_id,
        message: readyPost.content,
        imageUrl: readyPost.media_type === 'image' ? readyPost.image_url : null,
        videoUrl: readyPost.media_type === 'video' ? readyPost.video_url : null,
        published: true,
      });
      await persistFacebookPublishIds(readyPost.id, response, {
        hasImage: readyPost.media_type === 'image',
        hasVideo: readyPost.media_type === 'video',
      });
      await query(
        'UPDATE posts SET status = ?, published_at = NOW(), error_message = NULL WHERE id = ?',
        ['published', post.id]
      );
      await createNotification({ type: 'success', title: 'Auto-published', message: `Post #${post.id} published`, relatedType: 'post', relatedId: post.id });
    } catch (error) {
      await query('UPDATE posts SET status = ?, error_message = ? WHERE id = ?', ['failed', error.message, post.id]);
      await createNotification({ type: 'error', title: 'Publish failed', message: `Post #${post.id}: ${error.message}`, relatedType: 'post', relatedId: post.id });
    }
  }
}

async function checkPageTokens() {
  const results = await checkAllPageTokens(query);

  for (const item of results) {
    if (!item.ok) {
      await createNotification({
        type: 'warning',
        title: 'Kiểm tra token thất bại',
        message: `Fanpage "${item.name}": ${item.error}`,
        relatedType: 'page',
        relatedId: item.id,
      });
      continue;
    }
    const health = item.health || {};
    for (const [label, status, expiresAt, prevStatus] of [
      ['Thủ công', health.manual_token_status, health.manual_token_expires_at, item.prevManualStatus],
      ['Composio', health.composio_token_status, health.composio_token_expires_at, item.prevComposioStatus],
    ]) {
      if ((status === 'expired' || status === 'expiring') && status !== prevStatus) {
        await createNotification({
          type: status === 'expired' ? 'error' : 'warning',
          title: `Token ${label} ${status === 'expired' ? 'hết hạn' : 'sắp hết hạn'}`,
          message: `Fanpage "${item.name}" — token ${label}${expiresAt ? ` (đến ${new Date(expiresAt).toLocaleString('vi-VN')})` : ''}${item.composioRefreshed && label === 'Composio' ? ' — đã lấy token mới' : ''}`,
          relatedType: 'page',
          relatedId: item.id,
        });
      }
    }
  }
}

