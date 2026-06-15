import bcrypt from 'bcrypt';
import axios from 'axios';
import dotenv from 'dotenv';
import { query } from './src/db.js';

dotenv.config();

const DEFAULT_FB_PAGES = [
  {
    key: 'zalopilot',
    name: process.env.SEED_FB_ZALOPILOT_NAME || 'ZaloPilot.vn',
    page_id: process.env.SEED_FB_ZALOPILOT_PAGE_ID || '1102694302935427',
    page_token: process.env.SEED_FB_ZALOPILOT_TOKEN || '',
    avatar_url: process.env.SEED_FB_ZALOPILOT_AVATAR || '',
    skill: {
      name: 'ZaloPilot Default',
      description: 'System prompt mặc định cho fanpage ZaloPilot.vn',
      system_prompt:
        'Bạn là content writer cho fanpage ZaloPilot.vn — thương hiệu công nghệ và giải pháp Zalo. Viết bài Facebook bằng tiếng Việt, ngắn gọn, hấp dẫn, có emoji vừa phải, kêu gọi tương tác cuối bài.',
    },
  },
  {
    key: 'datxeveque',
    name: process.env.SEED_FB_DATXEVEQUE_NAME || 'Đặt Xe Về Quê',
    page_id: process.env.SEED_FB_DATXEVEQUE_PAGE_ID || '1101763366359444',
    page_token: process.env.SEED_FB_DATXEVEQUE_TOKEN || '',
    avatar_url: process.env.SEED_FB_DATXEVEQUE_AVATAR || '',
    skill: {
      name: 'Đặt Xe Về Quê Default',
      description: 'System prompt mặc định cho fanpage Đặt Xe Về Quê',
      system_prompt:
        'Bạn là content writer cho fanpage Đặt Xe Về Quê — dịch vụ đặt xe, vận chuyển hành khách về quê dịp lễ Tết và cuối tuần. Viết bài Facebook bằng tiếng Việt, thân thiện, tin cậy, nhấn mạnh an toàn, đúng giờ, tiện lợi. Có emoji vừa phải và kêu gọi inbox/đặt xe cuối bài.',
    },
  },
  {
    key: 'vohopquatet',
    name: process.env.SEED_FB_VOHOPQUATET_NAME || 'Vỏ Hộp Quà Tết',
    page_id: process.env.SEED_FB_VOHOPQUATET_PAGE_ID || '115126876565020',
    page_token: process.env.SEED_FB_VOHOPQUATET_TOKEN || '',
    avatar_url: process.env.SEED_FB_VOHOPQUATET_AVATAR || '',
    skill: {
      name: 'Vỏ Hộp Quà Tết Default',
      description: 'System prompt mặc định cho fanpage Vỏ Hộp Quà Tết',
      system_prompt:
        'Bạn là content writer cho fanpage Vỏ Hộp Quà Tết — chuyên cung cấp vỏ hộp quà Tết, packaging cao cấp, in logo theo yêu cầu. Viết bài Facebook bằng tiếng Việt, sang trọng, gợi cảm giác lễ Tết, nhấn mạnh chất lượng, thiết kế đẹp, giá tốt, giao hàng nhanh. Có emoji vừa phải và kêu gọi inbox/đặt hàng cuối bài.',
    },
  },
];

async function resolvePageFromToken(pageToken, fallbackName, fallbackAvatar) {
  const apiBase = process.env.FB_GRAPH_API || 'https://graph.facebook.com/v19.0';
  const response = await axios.get(`${apiBase}/me`, {
    params: { access_token: pageToken, fields: 'id,name,picture' },
  });
  return {
    page_id: String(response.data.id),
    name: response.data.name || fallbackName,
    avatar_url: response.data.picture?.data?.url || fallbackAvatar,
  };
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@autopost.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const existing = await query('SELECT id FROM users WHERE email = ?', [email]);

  if (existing.length) {
    console.log('Admin user already exists:', email);
    return existing[0].id;
  }

  const hashed = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (name, email, password, role, is_active, must_change_password, created_at) VALUES (?, ?, ?, ?, true, true, NOW())',
    ['Super Admin', email, hashed, 'super_admin']
  );
  console.log('Seeded admin user:', email, 'id:', result.insertId);
  return result.insertId;
}

async function seedSkill(adminId, skillConfig) {
  const existing = await query('SELECT id FROM skills WHERE name = ?', [skillConfig.name]);
  if (existing.length) return existing[0].id;

  const result = await query(
    'INSERT INTO skills (name, description, system_prompt, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
    [skillConfig.name, skillConfig.description, skillConfig.system_prompt, adminId]
  );
  console.log('Seeded skill:', skillConfig.name, 'id:', result.insertId);
  return result.insertId;
}

async function seedFacebookPage(pageConfig) {
  let pageId = pageConfig.page_id;
  let name = pageConfig.name;
  let avatarUrl = pageConfig.avatar_url;

  if (!pageId) {
    try {
      const resolved = await resolvePageFromToken(pageConfig.page_token, name, avatarUrl);
      pageId = resolved.page_id;
      name = resolved.name || name;
      avatarUrl = resolved.avatar_url || avatarUrl;
    } catch (error) {
      throw new Error(
        `[${pageConfig.name}] Cannot resolve page ID — set SEED_FB_*_PAGE_ID in .env. ${error?.response?.data?.error?.message || error.message}`
      );
    }
  }

  const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const existing = await query('SELECT id, page_id FROM fb_pages WHERE page_id = ? OR name = ?', [pageId, pageConfig.name]);

  if (existing.length) {
    await query(
      'UPDATE fb_pages SET name = ?, page_id = ?, page_token = ?, token_expires_at = ?, token_status = ?, avatar_url = COALESCE(NULLIF(?, ""), avatar_url), is_active = true WHERE id = ?',
      [name, pageId, pageConfig.page_token, tokenExpiresAt, 'valid', avatarUrl, existing[0].id]
    );
    console.log('Updated Facebook page:', name, 'page_id:', pageId);
    return existing[0].id;
  }

  const result = await query(
    'INSERT INTO fb_pages (name, page_id, page_token, token_expires_at, token_status, avatar_url, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, true, NOW())',
    [name, pageId, pageConfig.page_token, tokenExpiresAt, 'valid', avatarUrl || null]
  );
  console.log('Seeded Facebook page:', name, 'page_id:', pageId, 'id:', result.insertId);
  return result.insertId;
}

async function linkPageToSkill(pageDbId, skillId) {
  await query('UPDATE fb_pages SET skill_id = ? WHERE id = ?', [skillId, pageDbId]);
}

async function seedProviders() {
  const defaults = [
    {
      name: 'OpenAI Text',
      type: 'text',
      api_key: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o-mini',
    },
    {
      name: 'OpenAI DALL-E',
      type: 'image',
      api_key: process.env.OPENAI_API_KEY || '',
      model: 'dall-e-3',
    },
  ].filter((p) => p.api_key);

  const ids = [];
  for (const provider of defaults) {
    const existing = await query('SELECT id FROM ai_providers WHERE name = ? AND type = ?', [provider.name, provider.type]);
    if (existing.length) {
      ids.push(existing[0].id);
      continue;
    }
    const result = await query(
      'INSERT INTO ai_providers (name, type, api_key, model, is_active, user_id, created_at) VALUES (?, ?, ?, ?, true, NULL, NOW())',
      [provider.name, provider.type, provider.api_key, provider.model]
    );
    ids.push(result.insertId);
    console.log('Seeded provider:', provider.name);
  }
  return ids;
}

async function linkPageProviders(pageDbId, textProviderId, imageProviderId) {
  await query(
    'UPDATE fb_pages SET text_provider_id = COALESCE(?, text_provider_id), image_provider_id = COALESCE(?, image_provider_id) WHERE id = ?',
    [textProviderId || null, imageProviderId || null, pageDbId]
  );
}

async function seed() {
  const adminId = await seedAdmin();
  const providerIds = await seedProviders();
  const textProviderId = providerIds[0] || null;
  const imageProviderId = providerIds[1] || providerIds[0] || null;

  for (const pageConfig of DEFAULT_FB_PAGES) {
    if (!pageConfig.page_token) {
      console.warn(`Skipped ${pageConfig.name}: set SEED_FB_*_TOKEN in .env`);
      continue;
    }
    const skillId = await seedSkill(adminId, pageConfig.skill);
    const pageDbId = await seedFacebookPage(pageConfig);
    await linkPageToSkill(pageDbId, skillId);
    if (textProviderId || imageProviderId) {
      await linkPageProviders(pageDbId, textProviderId, imageProviderId);
    }
  }

  console.log('Seed completed.');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
