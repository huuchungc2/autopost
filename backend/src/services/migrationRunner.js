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
