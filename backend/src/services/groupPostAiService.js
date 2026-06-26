import axios from 'axios';
import { query } from '../db.js';
import {
  assertProviderAccess,
  getAccessibleProviderIds,
  providerIdInClause,
} from './providerAccessService.js';
import { generateText } from './aiService.js';
import { generateImage } from './imageService.js';
import {
  generatePostWithMedia,
  resolveMediaMode,
} from './contentGenerationService.js';
import { getProviderById } from './providerService.js';

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

export async function buildExtensionGenerationConfig(user, {
  text_system_prompt: textSystemPrompt = '',
  image_system_prompt: imageSystemPrompt = '',
  text_provider_id: textProviderId,
  image_provider_id: imageProviderId,
  media_type: mediaType,
}) {
  const textProvider = await getProviderForAi(user, textProviderId, 'text');
  const imageProvider = imageProviderId ? await getProviderById(imageProviderId) : null;
  if (imageProviderId) {
    await assertProviderAccess(user, imageProviderId);
    if (!imageProvider?.is_active || imageProvider.type !== 'image') {
      const err = new Error('Image provider không hợp lệ');
      err.status = 400;
      throw err;
    }
  }

  const textPrompt = String(textSystemPrompt || '').trim();
  const imagePrompt = String(imageSystemPrompt || '').trim();
  const imageSkills = imagePrompt ? [{ system_prompt: imagePrompt }] : [];

  const resolvedMediaType = resolveMediaMode({
    mediaType: mediaType || 'image',
    imageSkills,
    videoSkills: [],
    imageProvider,
  });

  return {
    textSystemPrompt: textPrompt,
    imageSystemPrompt: imagePrompt,
    videoSystemPrompt: '',
    mediaMode: resolvedMediaType,
    textProvider,
    imageProvider,
  };
}

export async function extensionGeneratePost(user, body) {
  const topic = String(body.topic || '').trim();
  if (!topic) {
    const err = new Error('Thiếu chủ đề (topic)');
    err.status = 400;
    throw err;
  }

  const config = await buildExtensionGenerationConfig(user, body);
  const userPrompt = body.prompt?.trim() || `Viết bài Facebook group về: ${topic}.`;
  const generated = await generatePostWithMedia({
    topic,
    userPrompt,
    config,
    mediaMode: config.mediaMode,
  });

  return {
    topic,
    content: generated.content,
    image_prompt: generated.image_prompt || '',
    video_prompt: generated.video_prompt || '',
    media_type: generated.media_type,
    parse_failed: generated.parseFailed || false,
  };
}
