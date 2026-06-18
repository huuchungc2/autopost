import { query } from '../db.js';
import { getPageGenerationConfig } from './providerService.js';
import { generatePostWithMedia } from './contentGenerationService.js';
import { postToFacebook } from './fbService.js';
import { persistFacebookPublishIds } from './postPublishService.js';
import { createNotification } from './notifyService.js';
import { claimTopicSlot } from './publishClaimService.js';

const pad = (n) => String(n).padStart(2, '0');

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function currentTimeString() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}

/** Mỗi ngày đúng khung giờ: AI tạo bài + đăng Facebook ngay. */
export async function runDueTopicSlots() {
  const today = todayDateString();
  const timeNow = currentTimeString();
  const day = new Date().getDay();

  let topics;
  try {
    topics = await query(
      `SELECT ct.*, fp.id AS page_id, fp.page_id AS fb_page_id, fp.page_token, fp.name AS page_name
       FROM content_topics ct
       JOIN fb_pages fp ON fp.id = ct.page_id
       WHERE ct.is_active = true AND fp.is_active = true
         AND TIME_FORMAT(ct.post_time, '%H:%i:00') = ?
         AND (ct.last_run_date IS NULL OR ct.last_run_date < ?)
         AND (ct.repeat_daily = true OR ct.day_of_week = ?)`,
      [timeNow, today, day]
    );
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') return [];
    throw error;
  }

  for (const topic of topics) {
    try {
      if (!(await claimTopicSlot(topic.id, today))) continue;
      await generateAndPublishTopic(topic);
    } catch (error) {
      console.error(`Topic slot ${topic.id} failed:`, error.message);
      await createNotification({
        type: 'error',
        title: 'Lịch hằng ngày thất bại',
        message: `${topic.page_name}: "${topic.topic}" — ${error.message}`,
        relatedType: 'page',
        relatedId: topic.page_id,
      });
    }
  }

  return topics.length;
}

export async function generateAndPublishTopic(topic) {
  const config = await getPageGenerationConfig(topic.page_id);
  if (!config) throw new Error('Fanpage không khả dụng hoặc chưa cấu hình AI');

  const userPrompt = `Viết bài Facebook về: ${topic.topic}.`;
  const generated = await generatePostWithMedia({
    topic: topic.topic,
    userPrompt,
    config,
    mediaMode: config.mediaMode,
  });

  const inserted = await query(
    `INSERT INTO posts (page_id, topic, content, image_url, image_prompt, video_prompt, media_type, status, created_by_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'auto', NOW())`,
    [
      topic.page_id,
      topic.topic,
      generated.content,
      generated.image_url,
      generated.image_prompt,
      generated.video_prompt,
      generated.media_type,
    ]
  );

  const postId = inserted.insertId;

  if (generated.media_type === 'video') {
    throw new Error('Bài video cần file video — chưa hỗ trợ AI tạo video tự động');
  }

  const response = await postToFacebook({
    pageId: topic.fb_page_id,
    pageToken: topic.page_token,
    message: generated.content,
    imageUrl: generated.media_type === 'image' ? generated.image_url : null,
    published: true,
  });

  await persistFacebookPublishIds(postId, response, {
    hasImage: generated.media_type === 'image',
    hasVideo: generated.media_type === 'video',
  });
  await query(
    'UPDATE posts SET status = ?, published_at = NOW() WHERE id = ?',
    ['published', postId]
  );

  await createNotification({
    type: 'success',
    title: 'Đã đăng theo lịch',
    message: `"${topic.topic}" — fanpage ${topic.page_name}`,
    relatedType: 'post',
    relatedId: postId,
  });

  return postId;
}

