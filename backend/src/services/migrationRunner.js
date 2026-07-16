import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function tableExists(tableName) {
  try {
    await query(`SELECT 1 FROM \`${tableName}\` LIMIT 1`);
    return true;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

function parseSqlStatements(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(';')
    .map((part) => part.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);
}

export async function ensureUserPagesTables() {
  const hasUserPages = await tableExists('user_pages');
  const hasUserProviders = await tableExists('user_providers');
  if (hasUserPages && hasUserProviders) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/001_user_pages.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    await query(statement);
  }
  console.log('Migration 001 applied: user_pages + user_providers ready');
}

async function columnExists(tableName, columnName) {
  try {
    const rows = await query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [tableName, columnName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function indexExists(tableName, indexName) {
  try {
    const rows = await query(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [tableName, indexName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function ensurePageSkillsTable() {
  if (await tableExists('page_skills')) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/003_page_skills.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    await query(statement);
  }
  console.log('Migration 003 applied: page_skills ready');
}

export async function ensureContentTopicsRepeatDaily() {
  if (await columnExists('content_topics', 'repeat_daily')) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/004_content_topics_repeat_daily.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    await query(statement);
  }
  console.log('Migration 004 applied: content_topics.repeat_daily ready');
}

export async function ensureContentTopicsLastRun() {
  if (await columnExists('content_topics', 'last_run_date')) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/005_content_topics_last_run.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    await query(statement);
  }
  console.log('Migration 005 applied: content_topics.last_run_date ready');
}

export async function ensureSkillsTypeColumn() {
  const hasSkillType = await columnExists('skills', 'skill_type');
  const hasVideoPrompt = await columnExists('posts', 'video_prompt');
  if (hasSkillType && hasVideoPrompt) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/006_skills_type.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  console.log('Migration 006 applied: skills.skill_type + posts.video_prompt ready');
}

export async function ensureUsersUsernameColumn() {
  if (await columnExists('users', 'username')) {
    await backfillMissingUsernamesFromRunner();
    return;
  }

  const migrationPath = path.resolve(__dirname, '../../migrations/007_users_username.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await backfillMissingUsernamesFromRunner();
  console.log('Migration 007 applied: users.username ready');
}

async function backfillMissingUsernamesFromRunner() {
  const { backfillMissingUsernames } = await import('./userUsernameService.js');
  await backfillMissingUsernames();
}

export async function ensurePostsFbMediaIds() {
  if (await columnExists('posts', 'fb_photo_id')) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/008_posts_fb_media_ids.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  console.log('Migration 008 applied: posts.fb_photo_id + fb_video_id ready');
}

export async function ensurePostsAutoGenerateImage() {
  if (await columnExists('posts', 'auto_generate_image')) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/009_posts_auto_generate_image.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  console.log('Migration 009 applied: posts.auto_generate_image ready');
}

export async function ensurePostsSaveImageLocal() {
  if (await columnExists('posts', 'save_image_local')) return;

  const migrationPath = path.resolve(__dirname, '../../migrations/010_posts_save_image_local.sql');
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }

  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  console.log('Migration 010 applied: posts.save_image_local ready');
}

async function runMigrationFile(filename, logLabel) {
  const migrationPath = path.resolve(__dirname, `../../migrations/${filename}`);
  if (!fs.existsSync(migrationPath)) {
    console.warn('Missing migration file:', migrationPath);
    return;
  }
  const statements = parseSqlStatements(migrationPath);
  for (const statement of statements) {
    await query(statement);
  }
  console.log(logLabel);
}

export async function ensurePostsAutoGenerateDefaultTrue() {
  await runMigrationFile('011_posts_auto_generate_default_true.sql', 'Migration 011 applied: auto_generate defaults');
}

export async function ensureGeminiImageGenerateContent() {
  await runMigrationFile('012_gemini_image_generate_content.sql', 'Migration 012 applied: Gemini image generateContent');
}

export async function ensure9RouterImageModel() {
  await runMigrationFile('013_9router_image_model.sql', 'Migration 013 applied: 9Router image model cx/gpt-5.5-image');
}

async function enumIncludesPublishingStatus() {
  try {
    const rows = await query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'status' LIMIT 1`
    );
    return String(rows[0]?.COLUMN_TYPE || '').includes('publishing');
  } catch {
    return false;
  }
}

export async function ensurePostsPublishingStatus() {
  if (await enumIncludesPublishingStatus()) return;
  await runMigrationFile('014_posts_publishing_status.sql', 'Migration 014 applied: posts.publishing status');
}

export async function ensureImageScheduleDb() {
  if (await tableExists('image_schedule_settings')) {
    if (!(await columnExists('posts', 'image_job_status'))) {
      try {
        await query(
          `ALTER TABLE posts ADD COLUMN image_job_status ENUM('pending','processing','done','failed') NULL DEFAULT NULL AFTER auto_generate_image`
        );
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
    if (!(await tableExists('image_generate_logs'))) {
      await runMigrationFile('015_image_schedule_db.sql', 'Migration 015 applied: image schedule DB + job logs');
    }
    return;
  }
  await runMigrationFile('015_image_schedule_db.sql', 'Migration 015 applied: image schedule DB + job logs');
}

async function scheduleSettingsUsesLegacyIdColumn() {
  if (!(await tableExists('image_schedule_settings'))) return false;
  return await columnExists('image_schedule_settings', 'id');
}

export async function ensureImageSchedulePerUser() {
  if (!(await tableExists('image_schedule_settings'))) {
    await runMigrationFile('015_image_schedule_db.sql', 'Migration 015 applied: image schedule DB + job logs');
    return;
  }

  if (await scheduleSettingsUsesLegacyIdColumn()) {
    await runMigrationFile('016_image_schedule_per_user.sql', 'Migration 016 applied: image schedule per admin');
    return;
  }

  if (!(await columnExists('image_generate_logs', 'schedule_user_id'))) {
    try {
      await query(
        `ALTER TABLE image_generate_logs
         ADD COLUMN schedule_user_id INT NULL AFTER post_id,
         ADD INDEX idx_image_generate_logs_schedule_user (schedule_user_id)`
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

export async function ensurePageImageSchedule() {
  if (await columnExists('fb_pages', 'image_schedule_enabled')) return;
  await runMigrationFile('017_page_image_schedule.sql', 'Migration 017 applied: page image schedule columns');
}

async function tableUsesUtf8mb4(tableName) {
  try {
    const rows = await query(
      `SELECT TABLE_COLLATION FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [tableName]
    );
    return String(rows[0]?.TABLE_COLLATION || '').startsWith('utf8mb4');
  } catch {
    return false;
  }
}

export async function ensureUtf8mb4TextColumns() {
  if (await tableUsesUtf8mb4('posts')) return;

  try {
    await query('ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  } catch (error) {
    console.warn('ALTER DATABASE utf8mb4 skipped (cần quyền admin DB):', error.message);
  }

  await runMigrationFile('018_utf8mb4_text_columns.sql', 'Migration 018 applied: utf8mb4 for posts text');
}

export async function ensureAppSettingsTable() {
  if (await tableExists('app_settings')) return;
  await runMigrationFile('019_app_settings.sql', 'Migration 019 applied: app_settings for media storage');
}

export async function ensureFbPagesComposio() {
  if (!(await columnExists('fb_pages', 'token_source'))) {
    await runMigrationFile('020_fb_pages_composio.sql', 'Migration 020 applied: fb_pages Composio token columns');
    await runMigrationFile('021_fb_pages_dual_tokens.sql', 'Migration 021 applied: dual page tokens');
  } else if (!(await columnExists('fb_pages', 'composio_page_token'))) {
    await runMigrationFile('021_fb_pages_dual_tokens.sql', 'Migration 021 applied: dual page tokens');
  }
  if (!(await columnExists('fb_pages', 'manual_token_status'))) {
    await runMigrationFile('022_fb_pages_token_health.sql', 'Migration 022 applied: per-token health columns');
  }
}

export async function ensureFbPagesDriveFolder() {
  if (await columnExists('fb_pages', 'google_drive_folder_id')) return;
  await runMigrationFile('023_fb_pages_drive_folder.sql', 'Migration 023 applied: per-page Drive folder');
}

export async function ensureGroupPostsTables() {
  if (await tableExists('group_posts')) return;
  await runMigrationFile('024_group_posts.sql', 'Migration 024 applied: group_posts + extension API keys');
}

export async function ensureGroupPostDraftsTable() {
  if (await tableExists('group_post_drafts')) return;
  await runMigrationFile('025_group_post_drafts.sql', 'Migration 025 applied: group_post_drafts');
}

export async function ensureGroupPostNameSharedDrafts() {
  if (!(await tableExists('group_posts'))) return;
  if (!(await columnExists('group_posts', 'group_name'))) {
    await runMigrationFile('026_group_name_shared_drafts.sql', 'Migration 026 applied: group_name + shared drafts');
    return;
  }
  if (!(await tableExists('group_post_draft_pulls'))) {
    await runMigrationFile('026_group_name_shared_drafts.sql', 'Migration 026 applied: group_post_draft_pulls');
  }
}

export async function ensureGroupPostClientSyncs() {
  if (!(await tableExists('group_posts'))) return;
  if (!(await tableExists('group_post_client_syncs'))) {
    await runMigrationFile('027_group_post_client_syncs.sql', 'Migration 027 applied: group_post_client_syncs');
  }
  await ensureGroupPostSyncDeviceId();
}

export async function ensureGroupPostSyncDeviceId() {
  if (!(await tableExists('group_post_client_syncs'))) return;
  if (!(await columnExists('group_post_client_syncs', 'device_id'))) {
    await runMigrationFile('028_group_sync_device_id.sql', 'Migration 028 applied: sync device_id');
  }
}

export async function ensurePostsPlatformPostType() {
  if (await columnExists('posts', 'seo_meta')) return;
  await runMigrationFile('030_posts_platform_post_type.sql', 'Migration 030 applied: posts.platform/post_type/seo_meta');
}

export async function ensureWebsitesTable() {
  if (await tableExists('websites')) return;
  await runMigrationFile('031_websites_table.sql', 'Migration 031 applied: websites table, posts.website_id/website_post_id/website_post_url/website_published_at');
}

export async function ensurePostsWebsiteColumns() {
  // Separate guard so that if 031 ran but failed mid-way (websites table created,
  // ALTER TABLE posts not reached), we still add the missing columns.
  if (await columnExists('posts', 'website_id')) return;
  await query('ALTER TABLE posts MODIFY COLUMN page_id INT NULL');
  await query('ALTER TABLE posts ADD COLUMN website_id INT NULL AFTER page_id');
  await query('ALTER TABLE posts ADD CONSTRAINT fk_posts_website_id FOREIGN KEY (website_id) REFERENCES websites(id)');
  await query('ALTER TABLE posts ADD COLUMN website_post_id VARCHAR(255) NULL AFTER seo_meta');
  await query('ALTER TABLE posts ADD COLUMN website_post_url VARCHAR(500) NULL AFTER website_post_id');
  await query('ALTER TABLE posts ADD COLUMN website_published_at DATETIME NULL AFTER website_post_url');
  console.log('Migration fix: posts.website_id and related columns added');
}

export async function ensureGroupPostsFbUrl() {
  if (await columnExists('group_posts', 'fb_url')) return;
  await runMigrationFile('032_group_posts_fb_url.sql', 'Migration 032 applied: group_posts.fb_url');
}

export async function ensureDriveOAuthMigration() {
  if (!(await tableExists('app_settings'))) return;
  const rows = await query(
    "SELECT 1 FROM app_settings WHERE setting_key = 'google_drive_service_account_json' LIMIT 1"
  );
  if (rows.length === 0) return;
  await runMigrationFile('029_app_settings_drive_oauth.sql', 'Migration 029 applied: Drive OAuth2 migration (service account key removed)');
}

export async function ensureUserAccountsTable() {
  if (await tableExists('user_accounts')) return;
  await runMigrationFile('033_user_accounts.sql', 'Migration 033 applied: user_accounts');
}

export async function ensureLicenseKeysTable() {
  if (await tableExists('license_keys')) return;
  if (!(await tableExists('user_accounts'))) return;
  await runMigrationFile('034_license_keys.sql', 'Migration 034 applied: license_keys');
}

export async function ensureUserPostsTable() {
  if (await tableExists('user_posts')) return;
  if (!(await tableExists('license_keys'))) return;
  await runMigrationFile('035_user_posts.sql', 'Migration 035 applied: user_posts');
}

async function findForeignKeyName(tableName, columnName, referencedTableName) {
  const rows = await query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME = ? LIMIT 1`,
    [tableName, columnName, referencedTableName]
  );
  return rows[0]?.CONSTRAINT_NAME || null;
}

async function dropForeignKeyIfExists(tableName, columnName, referencedTableName) {
  const name = await findForeignKeyName(tableName, columnName, referencedTableName);
  if (!name) return;
  await query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${name}\``);
}

async function addForeignKeyIfMissing(tableName, columnName, referencedTableName, onDelete) {
  const existing = await findForeignKeyName(tableName, columnName, referencedTableName);
  if (existing) return;
  await query(
    `ALTER TABLE \`${tableName}\` ADD FOREIGN KEY (\`${columnName}\`) REFERENCES \`${referencedTableName}\`(id) ON DELETE ${onDelete}`
  );
}

export async function ensureUserAccountsMergedIntoUsers() {
  if (!(await tableExists('user_accounts'))) return;

  await runMigrationFile(
    '036_merge_user_accounts_into_users.sql',
    'Migration 036 applied: users.role ENUM now includes group_user'
  );

  const { usernameFromEmail } = await import('./userUsernameService.js');

  const accounts = await query(
    'SELECT id, email, password_hash, name, status, created_at FROM user_accounts'
  );
  const existingUsernames = await query(
    'SELECT username FROM users WHERE username IS NOT NULL AND username <> ""'
  );
  const usedUsernames = new Set(existingUsernames.map((row) => row.username.toLowerCase()));

  const idMap = new Map();
  let migratedCount = 0;

  for (const account of accounts) {
    const existingUser = await query('SELECT id FROM users WHERE email = ?', [account.email]);
    if (existingUser.length) {
      idMap.set(account.id, existingUser[0].id);
      continue;
    }

    let candidate = usernameFromEmail(account.email);
    let suffix = 1;
    while (usedUsernames.has(candidate.toLowerCase())) {
      candidate = `${usernameFromEmail(account.email)}${suffix}`;
      suffix += 1;
    }
    usedUsernames.add(candidate.toLowerCase());

    const result = await query(
      `INSERT INTO users (name, username, email, password, role, is_active, created_at)
       VALUES (?, ?, ?, ?, 'group_user', ?, ?)`,
      [
        account.name || candidate,
        candidate,
        account.email,
        account.password_hash,
        account.status === 'active' ? 1 : 0,
        account.created_at,
      ]
    );
    idMap.set(account.id, result.insertId);
    migratedCount += 1;
  }

  await dropForeignKeyIfExists('license_keys', 'user_id', 'user_accounts');
  await dropForeignKeyIfExists('user_posts', 'user_account_id', 'user_accounts');

  // Two-phase remap through a negative sentinel so old/new id ranges can never collide mid-migration.
  for (const oldId of idMap.keys()) {
    await query('UPDATE license_keys SET user_id = ? WHERE user_id = ?', [-oldId, oldId]);
    await query('UPDATE user_posts SET user_account_id = ? WHERE user_account_id = ?', [-oldId, oldId]);
  }
  for (const [oldId, newId] of idMap) {
    await query('UPDATE license_keys SET user_id = ? WHERE user_id = ?', [newId, -oldId]);
    await query('UPDATE user_posts SET user_account_id = ? WHERE user_account_id = ?', [newId, -oldId]);
  }

  await addForeignKeyIfMissing('license_keys', 'user_id', 'users', 'CASCADE');
  await addForeignKeyIfMissing('user_posts', 'user_account_id', 'users', 'CASCADE');

  await query('DROP TABLE user_accounts');
  console.log(`Migration 036 applied: merged ${migratedCount} user_accounts into users (role=group_user), dropped user_accounts`);
}

export async function ensureUserActivityLogTable() {
  if (await tableExists('user_activity_log')) return;
  if (!(await tableExists('users'))) return;
  await runMigrationFile('037_user_activity_log.sql', 'Migration 037 applied: user_activity_log');
}

// updated_at bump tự động qua ON UPDATE CURRENT_TIMESTAMP — nền tảng cho cursor đồng bộ theo
// "cái gì đã ĐỔI" (bài mới lẫn needs_comment vừa flip) thay vì chỉ "cái gì mới TẠO" (created_at cũ
// không bắt được PATCH .../commented sau này) — xem GET /api/user-sync/my-posts và /cross-posts.
export async function ensureUserPostsUpdatedAt() {
  if (await columnExists('user_posts', 'updated_at')) return;
  if (!(await tableExists('user_posts'))) return;
  await runMigrationFile('038_user_posts_updated_at.sql', 'Migration 038 applied: user_posts.updated_at + cursor indexes');
}

// Gộp group_posts (hệ JWT cũ, nuôi trang web /groups) vào user_posts (hệ license-key) — 1 nguồn sự
// thật duy nhất cho "bài đã đăng" thay vì 2 bảng song song. group_posts/group_post_comments không
// bị xoá (rollback thủ công nếu cần) nhưng service không còn đọc/ghi 2 bảng đó sau bản này.
//
// Tách 2 file: 039 (schema — luôn an toàn chạy dù cài mới tinh chưa từng có group_posts, vì Flow
// 1/2/3 cần đủ cột này bất kể có dữ liệu cũ để backfill hay không) và 039b (backfill dữ liệu thật
// từ group_posts — CHỈ chạy khi bảng đó thực sự tồn tại, tránh lỗi "table doesn't exist" làm gãy
// toàn bộ chuỗi migration phía sau trên deployment mới).
export async function ensureUserPostsMergedGroupPosts() {
  if (!(await tableExists('user_posts'))) return;
  if (!(await columnExists('user_posts', 'fb_user_id'))) {
    await runMigrationFile(
      '039_user_posts_merge_group_posts.sql',
      'Migration 039 applied: user_posts thêm fb_user_id/prompt_anh/comment_target/comment_count/visible_after + bảng user_post_comments'
    );
  }
  if (await tableExists('group_posts')) {
    await runMigrationFile(
      '039b_user_posts_backfill_group_posts.sql',
      'Migration 039b applied: backfill group_posts/group_post_comments vào user_posts/user_post_comments'
    );
  }
}

// Audit 2026-07-06 (cơ chế đồng bộ extension-website): `is_shared` (migration 026) không có index
// nào — điều kiện "eligibility" của draft (`(user_id=? AND is_shared=0) OR is_shared=1`, dùng ở cả
// getExtensionSyncStatus() lẫn pullDraftsForExtension()) phải quét/đánh giá từng dòng thay vì lọc
// được ngay bằng index khi có nhiều shared draft tích luỹ theo thời gian (draft không bị xoá, chỉ
// đánh dấu đã pull).
export async function ensureGroupPostDraftsSharedIndex() {
  if (!(await tableExists('group_post_drafts'))) return;
  if (!(await columnExists('group_post_drafts', 'is_shared'))) return;
  if (await indexExists('group_post_drafts', 'idx_gpd_shared')) return;
  await runMigrationFile(
    '040_group_post_drafts_shared_index.sql',
    'Migration 040 applied: group_post_drafts.is_shared index'
  );
}

// 2026-07-10 — chủ bài (extension) tự biết bài mình đang "chờ admin duyệt" (thấy banner khi tự
// check quyền comment — checkPostCommentable(), modules/fbCommentBg.js) nhưng đồng đội (khác máy,
// khác extension) không có cách nào tự dò được — Facebook không nhúng gì vào HTML cho người
// KHÔNG PHẢI chủ bài xem 1 bài chưa duyệt (trang khóa trắng, không marker), khiến GET /cross-posts
// vẫn trả về bài đó cho đồng đội dù chắc chắn chưa comment được. Thêm 2 cột để chủ bài "báo hộ"
// đúng 1 lần (piggyback vào POST /user-sync/posts sẵn có — không endpoint/cron mới) — GET
// /cross-posts dùng để loại bài đang chờ duyệt khỏi danh sách đồng đội. Có TTL (xem
// PENDING_APPROVAL_TTL_MS, userSync.js) — nếu chủ bài không mở lại extension để cập nhật (vd đã
// duyệt xong), cờ tự hết hạn, bài lại hiện bình thường — không bao giờ bị chặn vĩnh viễn.
export async function ensureUserPostsPendingApproval() {
  if (!(await tableExists('user_posts'))) return;
  if (await columnExists('user_posts', 'pending_approval')) return;
  await runMigrationFile(
    '041_user_posts_pending_approval.sql',
    'Migration 041 applied: user_posts.pending_approval + pending_checked_at'
  );
}

// 2026-07-10 — bug thiết kế gốc phát hiện khi debug migration 039b bị chặn (xem CHANGELOG):
// `uq_post_group` (migration 035) định nghĩa theo (user_account_id, post_queue_id, group_id) — SAI,
// post_queue_id là ID nội bộ client (thường rỗng), không phải định danh thật của 1 bài Facebook.
// Đổi lại đúng theo (user_account_id, group_id, post_id) — xem chi tiết + cách xử lý dữ liệu trùng
// trước khi đổi key trong 042_user_posts_fix_unique_key.sql.
export async function ensureUserPostsCorrectUniqueKey() {
  if (!(await tableExists('user_posts'))) return;
  if (await indexExists('user_posts', 'uq_post_group_v2')) return;
  await runMigrationFile(
    '042_user_posts_fix_unique_key.sql',
    'Migration 042 applied: user_posts unique key đổi sang (user_account_id, group_id, post_id)'
  );
}

// 2026-07-10 — Tony chốt hướng public free tier đổi lấy số điện thoại người dùng ("public xài free
// đổi lại là số điện thoại"). Cột nullable (user cũ trước bản này không có) nhưng route đăng ký mới
// (userAuth.js POST /register) bắt buộc nhập — validate ở tầng app, không NOT NULL ở DB để không vỡ
// dữ liệu cũ.
export async function ensureUsersPhone() {
  if (!(await tableExists('users'))) return;
  if (await columnExists('users', 'phone')) return;
  await runMigrationFile('043_users_phone.sql', 'Migration 043 applied: users.phone ready');
}

// 2026-07-10 — Tony chốt giới hạn số thiết bị/máy được dùng chung 1 license key, theo từng plan
// (free/pro/enterprise) — trước bản này license_keys hoàn toàn không phân biệt thiết bị, 1 key dùng
// được trên vô hạn máy cùng lúc. Bảng riêng (không thêm cột đếm cứng vào license_keys) để còn lưu
// được danh sách thiết bị thật (device_id, lần thấy đầu/cuối) cho admin xem/gỡ — xem
// licenseDeviceService.js cho logic giới hạn theo plan.
export async function ensureLicenseKeyDevices() {
  if (await tableExists('license_key_devices')) return;
  if (!(await tableExists('license_keys'))) return;
  await runMigrationFile('044_license_key_devices.sql', 'Migration 044 applied: license_key_devices ready');
}

// 2026-07-16 — Log/Lịch sử ghi kèm tác giả bài (extension ghi cục bộ từ v1.0.268, nhưng đường đồng
// bộ Log qua server cắt mất field vì bảng thiếu cột) — xem 045_user_activity_log_author.sql.
export async function ensureUserActivityLogAuthor() {
  if (!(await tableExists('user_activity_log'))) return;
  if (await columnExists('user_activity_log', 'author_name')) return;
  await runMigrationFile('045_user_activity_log_author.sql', 'Migration 045 applied: user_activity_log.author_name/author_fb_id ready');
}
