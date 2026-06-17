import cron from 'node-cron';
import { query } from '../db.js';
import { processPendingJobs } from './jobWorker.js';
import { postToFacebook } from './fbService.js';
import { createNotification } from './notifyService.js';
import { persistFacebookPublishIds } from './postPublishService.js';
import { ensurePostImageForPublish } from './postImageService.js';
import { runDueTopicSlots } from './topicSlotService.js';

let started = false;

export function startScheduler() {
  if (started || process.env.DISABLE_SCHEDULER === 'true') return;
  started = true;

  cron.schedule('* * * * *', publishDuePosts);
  cron.schedule('* * * * *', runDueTopicSlots);
  cron.schedule('*/5 * * * *', () => processPendingJobs(5));
  cron.schedule('0 * * * *', checkTokenExpiry);

  console.log('Scheduler started');
}

async function publishDuePosts() {
  const posts = await query(
    `SELECT p.*, fp.page_id AS fb_page_id, fp.page_token, fp.image_provider_id
     FROM posts p
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE p.status = 'scheduled' AND p.scheduled_at <= NOW()`
  );

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
