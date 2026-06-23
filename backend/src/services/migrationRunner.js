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
