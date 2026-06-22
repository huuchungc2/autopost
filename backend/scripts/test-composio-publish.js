/**
 * Test đăng 1 bài text lên mỗi fanpage bằng token lấy từ Composio.
 * Không cần MySQL — đọc COMPOSIO_* từ .env.
 *
 *   node scripts/test-composio-publish.js
 *   node scripts/test-composio-publish.js --dry-run   # chỉ lấy token, không đăng
 */
import dotenv from 'dotenv';
import { Composio } from '@composio/core';
import { postToFacebook } from '../src/services/fbService.js';

dotenv.config();

const PAGE_IDS = [
  { id: '1102694302935427', name: 'ZaloPilot.vn' },
  { id: '1101763366359444', name: 'Đặt Xe Về Quê' },
  { id: '115126876565020', name: 'Vỏ Hộp Quà Tết' },
];

const GET_PAGES_TOOL_SLUG = 'FACEBOOK_GET_USER_PAGES';
const dryRun = process.argv.includes('--dry-run');

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Thiếu ${name} trong .env`);
  return v;
}

function extractPages(result) {
  const raw = result?.data?.data ?? result?.data ?? result?.pages ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => ({
    id: String(entry.id || entry.page_id),
    name: entry.name,
    access_token: entry.access_token || entry.accessToken,
  })).filter((p) => p.id && p.access_token);
}

async function fetchPageToken(composio, userId, connectedAccountId, pageId) {
  const result = await composio.tools.execute(GET_PAGES_TOOL_SLUG, {
    userId,
    connectedAccountId,
    arguments: {},
  });
  const pages = extractPages(result);
  const match = pages.find((p) => p.id === String(pageId));
  if (!match) {
    const available = pages.map((p) => `${p.name} (${p.id})`).join(', ');
    throw new Error(`Không thấy page ${pageId}. Có: ${available || 'rỗng'}`);
  }
  return match;
}

async function main() {
  const apiKey = requireEnv('COMPOSIO_API_KEY');
  const userId = requireEnv('COMPOSIO_DEFAULT_USER_ID');
  const connectedAccountId = requireEnv('COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID');
  const toolkitVersion = process.env.COMPOSIO_FACEBOOK_TOOLKIT_VERSION?.trim() || '20260616_00';

  const composio = new Composio({
    apiKey,
    toolkitVersions: { facebook: toolkitVersion },
  });

  const account = await composio.connectedAccounts.get(connectedAccountId);
  console.log(`Composio connection: ${connectedAccountId} → ${account.status}`);
  if (account.status !== 'ACTIVE') {
    throw new Error(`Connection chưa ACTIVE (${account.status})`);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const results = [];

  for (const page of PAGE_IDS) {
    const row = { page_id: page.id, name: page.name, ok: false };
    try {
      const fbPage = await fetchPageToken(composio, userId, connectedAccountId, page.id);
      row.page_name = fbPage.name;
      row.token_preview = `${fbPage.access_token.slice(0, 8)}…`;

      if (dryRun) {
        row.ok = true;
        row.message = 'dry-run: token OK';
        results.push(row);
        continue;
      }

      const message = `[AutoPost test Composio] ${fbPage.name || page.name} — ${stamp}. Bài test tự động, có thể xóa.`;
      const response = await postToFacebook({
        pageId: page.id,
        pageToken: fbPage.access_token,
        message,
        published: true,
      });
      row.ok = true;
      row.fb_post_id = response?.id || response?.post_id || null;
      row.message = message;
    } catch (error) {
      row.error = error.message;
    }
    results.push(row);
    console.log(JSON.stringify(row));
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(`OK: ${results.length - failed.length}/${results.length}${dryRun ? ' (dry-run)' : ''}`);
  if (failed.length) {
    console.error('FAILED:', failed.map((f) => `${f.name}: ${f.error}`).join('; '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
