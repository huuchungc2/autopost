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
