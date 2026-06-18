import cron from 'node-cron';
import { query } from '../db.js';
import { processPendingJobs } from './jobWorker.js';
import { postToFacebook } from './fbService.js';
import { createNotification } from './notifyService.js';
import { persistFacebookPublishIds } from './postPublishService.js';
import { ensurePostImageForPublish, generateImageForPost } from './postImageService.js';
import { runDueTopicSlots } from './topicSlotService.js';
import { claimDueScheduledPosts, recoverStuckPublishingPosts } from './publishClaimService.js';
import { generatePendingPostImages } from './postImageService.js';

let started = false;
let publishDuePostsRunning = false;
let runDueTopicSlotsRunning = false;
let generatePendingImagesRunning = false;

function parseAutoGenerateSchedule() {
  const hour = Math.min(23, Math.max(0, parseInt(process.env.AUTO_GENERATE_HOUR || '23', 10) || 23));
  const minute = Math.min(59, Math.max(0, parseInt(process.env.AUTO_GENERATE_MINUTE || '0', 10) || 0));
  return { hour, minute, cronExpr: `${minute} ${hour} * * *` };
}

export function startScheduler() {
  if (started || process.env.DISABLE_SCHEDULER === 'true') return;
  started = true;

  cron.schedule('* * * * *', () => runExclusive(publishDuePosts, 'publishDuePosts'));
  cron.schedule('* * * * *', () => runExclusive(runDueTopicSlots, 'runDueTopicSlots'));
  cron.schedule('*/5 * * * *', () => processPendingJobs(5));
  cron.schedule('0 * * * *', checkTokenExpiry);

  const { hour, minute, cronExpr } = parseAutoGenerateSchedule();
  cron.schedule(cronExpr, () => runExclusive(generatePendingImages, 'generatePendingImages'));
  console.log(`Nightly image generation scheduled at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

  recoverStuckPublishingPosts().catch((error) => {
    console.warn('recoverStuckPublishingPosts failed:', error.message);
  });

  console.log('Scheduler started');
}

async function runExclusive(task, label) {
  const flags = {
    publishDuePosts: publishDuePostsRunning,
    runDueTopicSlots: runDueTopicSlotsRunning,
    generatePendingImages: generatePendingImagesRunning,
  };
  if (flags[label]) return;

  if (label === 'publishDuePosts') publishDuePostsRunning = true;
  else if (label === 'runDueTopicSlots') runDueTopicSlotsRunning = true;
  else generatePendingImagesRunning = true;

  try {
    await task();
  } catch (error) {
    console.error(`${label} failed:`, error.message);
  } finally {
    if (label === 'publishDuePosts') publishDuePostsRunning = false;
    else if (label === 'runDueTopicSlots') runDueTopicSlotsRunning = false;
    else generatePendingImagesRunning = false;
  }
}

async function generatePendingImages() {
  const limit = parseInt(process.env.AUTO_GENERATE_BATCH_LIMIT || '50', 10) || 50;
  const result = await generatePendingPostImages({ limit });
  if (result.processed > 0) {
    console.log(`Nightly images: ${result.ok} ok, ${result.failed} failed (${result.processed} total)`);
  }
}

async function publishDuePosts() {
  const posts = await claimDueScheduledPosts();

  for (const post of posts) {
    try {
      const readyPost = await ensurePostImageForPublish(post, post.image_provider_id);
      const response = await postToFacebook({
        pageId: readyPost.fb_page_id,
        pageToken: readyPost.page_token,
        message: readyPost.content,
        imageUrl: readyPost.media_type === 'image' ? readyPost.image_url : null,
        videoUrl: readyPost.media_type === 'video' ? readyPost.video_url : null,
        published: true,
      });
      await persistFacebookPublishIds(readyPost.id, response, {
        hasImage: readyPost.media_type === 'image',
        hasVideo: readyPost.media_type === 'video',
      });
      await query('UPDATE posts SET status = ?, published_at = NOW() WHERE id = ?', ['published', post.id]);
      await createNotification({ type: 'success', title: 'Auto-published', message: `Post #${post.id} published`, relatedType: 'post', relatedId: post.id });
    } catch (error) {
      await query('UPDATE posts SET status = ?, error_message = ? WHERE id = ?', ['failed', error.message, post.id]);
      await createNotification({ type: 'error', title: 'Publish failed', message: `Post #${post.id}: ${error.message}`, relatedType: 'post', relatedId: post.id });
    }
  }
}

async function checkTokenExpiry() {
  const pages = await query('SELECT id, name, token_expires_at, token_status FROM fb_pages WHERE is_active = true');
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  for (const page of pages) {
    if (!page.token_expires_at) continue;
    const expires = new Date(page.token_expires_at).getTime();
    let status = 'valid';
    if (expires <= now) status = 'expired';
    else if (expires - now <= sevenDays) status = 'expiring';

    if (status !== page.token_status) {
      await query('UPDATE fb_pages SET token_status = ? WHERE id = ?', [status, page.id]);
      if (status !== 'valid') {
        await createNotification({
          type: status === 'expired' ? 'error' : 'warning',
          title: `Token ${status}`,
          message: `Page "${page.name}" token is ${status}`,
          relatedType: 'page',
          relatedId: page.id,
        });
      }
    }
  }
}
