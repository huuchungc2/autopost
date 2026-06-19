import { query } from '../src/db.js';
import { getEnabledImageSchedules, isWithinImageWindow, getZonedNow } from '../src/services/imageScheduleConfig.js';
import { getAssignedPageIds } from '../src/services/pageAccessService.js';
import { findNextPostForImageJob } from '../src/services/imageGenerateJobService.js';

async function diag() {
  console.log('=== Scheduler env ===');
  console.log('DISABLE_SCHEDULER:', process.env.DISABLE_SCHEDULER || '(not set)');

  const schedules = await getEnabledImageSchedules();
  console.log('\n=== Lịch đang bật ===', schedules.length);
  for (const s of schedules) {
    const config = {
      enabled: true,
      start_hour: s.start_hour,
      start_minute: s.start_minute,
      end_hour: s.end_hour,
      end_minute: s.end_minute,
      timezone: s.timezone,
    };
    const zonedNow = getZonedNow(config.timezone);
    const inWindow = isWithinImageWindow(config, zonedNow);
    const pageIds = await getAssignedPageIds(s.user_id);
    const nextPost = pageIds.length ? await findNextPostForImageJob(pageIds) : null;
    console.log({
      user: s.user_name,
      user_id: s.user_id,
      window: `${s.start_hour}:${String(s.start_minute).padStart(2, '0')}-${s.end_hour}:${String(s.end_minute).padStart(2, '0')}`,
      now_vn: `${zonedNow.hour}:${String(zonedNow.minute).padStart(2, '0')}`,
      in_window_now: inWindow,
      assigned_pages: pageIds.length,
      last_run_at: s.last_run_at,
      next_post_id: nextPost?.id || null,
    });
  }

  const allSchedules = await query(
    'SELECT s.*, u.name AS user_name FROM image_schedule_settings s JOIN users u ON u.id = s.user_id'
  );
  console.log('\n=== Tất cả cấu hình lịch ===');
  console.table(allSchedules.map((r) => ({
    user: r.user_name,
    enabled: r.enabled,
    window: `${r.start_hour}:${String(r.start_minute).padStart(2, '0')}-${r.end_hour}:${String(r.end_minute).padStart(2, '0')}`,
    interval: r.interval_minutes,
    last_run: r.last_run_at,
  })));

  const eligible = await query(`
    SELECT COUNT(*) AS cnt FROM posts p
    JOIN fb_pages fp ON fp.id = p.page_id
    WHERE fp.is_active = true
      AND (p.image_url IS NULL OR p.image_url = '')
      AND p.image_prompt IS NOT NULL AND TRIM(p.image_prompt) != ''
      AND p.auto_generate_image = true
      AND (p.image_job_status IS NULL OR p.image_job_status = 'pending')
      AND p.status IN ('scheduled', 'draft', 'pending_approval')
      AND p.media_type != 'video'
  `);
  console.log('\n=== Bài trong hàng đợi xuất ảnh ===', eligible[0].cnt);

  const blocked = await query(`
    SELECT COALESCE(image_job_status, 'NULL') AS job_status, COUNT(*) AS cnt
    FROM posts p
    WHERE (p.image_url IS NULL OR p.image_url = '')
      AND p.image_prompt IS NOT NULL AND TRIM(p.image_prompt) != ''
      AND p.auto_generate_image = true
    GROUP BY image_job_status
  `);
  console.log('\n=== Bài có prompt nhưng chưa có ảnh (theo job status) ===');
  console.table(blocked);

  const logs = await query(`
    SELECT DATE(created_at) AS day, status, COUNT(*) AS cnt
    FROM image_generate_logs
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
    GROUP BY DATE(created_at), status
    ORDER BY day DESC, status
  `);
  console.log('\n=== Log xuất ảnh 3 ngày gần đây ===');
  console.table(logs);

  const recentErrors = await query(`
    SELECT l.created_at, l.post_id, l.status, l.source, l.error_message, fp.name AS page_name
    FROM image_generate_logs l
    JOIN posts p ON p.id = l.post_id
    JOIN fb_pages fp ON fp.id = p.page_id
    WHERE l.created_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
    ORDER BY l.id DESC
    LIMIT 20
  `);
  console.log('\n=== 20 log gần nhất (2 ngày) ===');
  console.table(recentErrors);

  const noProvider = await query(`
    SELECT fp.id, fp.name, fp.image_provider_id
    FROM fb_pages fp
    WHERE fp.is_active = true AND fp.image_provider_id IS NULL
  `);
  console.log('\n=== Fanpage active nhưng thiếu image provider ===');
  console.table(noProvider);

  const noAutoGen = await query(`
    SELECT COUNT(*) AS cnt FROM posts p
    WHERE (p.image_url IS NULL OR p.image_url = '')
      AND p.image_prompt IS NOT NULL AND TRIM(p.image_prompt) != ''
      AND p.auto_generate_image = false
  `);
  console.log('\n=== Bài có prompt nhưng auto_generate_image=false ===', noAutoGen[0].cnt);
}

diag()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Lỗi:', e.message);
    process.exit(1);
  });
