import axios from 'axios';
import { query } from '../db.js';
import {
  assertProviderAccess,
  getAccessibleProviderIds,
  providerIdInClause,
} from './providerAccessService.js';
import { generateText } from './aiService.js';
import { generateImage } from './imageService.js';

const REWRITE_PROMPTS = {
  persuasive: 'Viết lại bài đăng Facebook group sau cho hấp dẫn, tự nhiên, có CTA nhẹ. Giữ tiếng Việt. Không thêm hashtag dư.',
  grammar: 'Sửa chính tả và ngữ pháp, giữ nguyên ý và độ dài tương đương:',
  spintax: 'Chuyển bài sau thành spintax {a|b|c} hợp lý, giữ ý chính. Chỉ trả nội dung spintax:',
};

export async function listExtensionAiProviders(user) {
  const accessibleIds = await getAccessibleProviderIds(user);
  const { clause, params } = providerIdInClause(accessibleIds);
  return query(
    `SELECT id, name, type, model, provider_kind, is_active
     FROM ai_providers WHERE is_active = 1${clause} ORDER BY type ASC, name ASC`,
    params,
  );
}

export async function getProviderForAi(user, providerId, type) {
  if (!providerId) {
    const err = new Error(`Chưa chọn ${type === 'text' ? 'Text' : 'Image'} provider trong Cài đặt extension`);
    err.status = 400;
    throw err;
  }
  await assertProviderAccess(user, providerId);
  const rows = await query(
    `SELECT id, name, type, api_key, model, provider_kind, api_endpoint, is_active
     FROM ai_providers WHERE id = ? AND type = ?`,
    [providerId, type],
  );
  const provider = rows[0];
  if (!provider?.is_active) {
    const err = new Error('Provider không tồn tại hoặc đã tắt');
    err.status = 400;
    throw err;
  }
  return provider;
}

async function imageUrlToBase64(imageUrl) {
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Data URL không hợp lệ');
    return { base64: match[2], mime: match[1] };
  }
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 120000 });
  const mime = response.headers['content-type'] || 'image/png';
  return { base64: Buffer.from(response.data).toString('base64'), mime };
}

export async function extensionGenerateImage(user, prompt, providerId) {
  const provider = await getProviderForAi(user, providerId, 'image');
  const result = await generateImage(prompt, provider, { persist: false });
  return imageUrlToBase64(result.image_url);
}

export async function extensionGenerateText(user, { task, text, mode, provider_id: providerId }) {
  const provider = await getProviderForAi(user, providerId, 'text');
  let userPrompt;
  if (task === 'rewrite') {
    userPrompt = `${REWRITE_PROMPTS[mode] || REWRITE_PROMPTS.persuasive}\n\n${text}`;
  } else if (task === 'comment') {
    userPrompt = `Viết 1 comment ngắn tự nhiên để đẩy bài Facebook sau, không quảng cáo lộ liễu:\n${text}`;
  } else {
    userPrompt = text;
  }
  const result = await generateText(userPrompt, provider);
  return result.text || '';
}
