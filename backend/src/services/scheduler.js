import cron from 'node-cron';
import { query } from '../db.js';
import { processPendingJobs } from './jobWorker.js';
import { postToFacebook } from './fbService.js';
import { createNotification } from './notifyService.js';
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
    `SELECT p.*, fp.page_id AS fb_page_id, fp.page_token
     FROM posts p
     JOIN fb_pages fp ON fp.id = p.page_id
     WHERE p.status = 'scheduled' AND p.scheduled_at <= NOW()`
  );

  for (const post of posts) {
    try {
      const response = await postToFacebook({
        pageId: post.fb_page_id,
        pageToken: post.page_token,
        message: post.content,
        imageUrl: post.media_type === 'image' ? post.image_url : null,
        videoUrl: post.media_type === 'video' ? post.video_url : null,
        published: true,
      });
      const fbPostId = response.id || response.post_id || null;
      await query('UPDATE posts SET status = ?, published_at = NOW(), fb_post_id = ? WHERE id = ?', ['published', fbPostId, post.id]);
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
