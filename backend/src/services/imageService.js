import axios from 'axios';
import { callWithRateLimit } from './aiService.js';
import { formatEndpoint, resolveProviderKind } from './providerService.js';
import { storeImageBuffer } from './mediaStorage.js';

const DEFAULT_IMAGE_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/images/generations',
  ideogram: 'https://api.ideogram.ai/generate',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
};

const GEMINI_IMAGE_DEFAULT_MODEL = 'gemini-2.5-flash-image-preview';
const IMAGE_REQUEST_TIMEOUT_MS = 180000;

function wrapImageError(error, fallback = 'Xuất ảnh AI thất bại') {
  const upstream = error?.response?.data;
  const message = upstream?.error?.message
    || (typeof upstream?.error === 'string' ? upstream.error : null)
    || upstream?.message
    || error.message
    || fallback;
  const err = new Error(typeof message === 'string' ? message : fallback);
  const upstreamStatus = error?.response?.status;
  // Không trả 401 ra client — tránh frontend hiểu nhầm là hết phiên đăng nhập
  err.status = upstreamStatus === 401 ? 400 : (upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500);
  return err;
}

async function downloadBuffer(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const ext = url.includes('.jpg') ? 'jpg' : 'png';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : 'image/png';
  return { buffer: Buffer.from(response.data), ext, mimeType };
}

function imageEndpoint(provider) {
  const kind = resolveProviderKind(provider);
  if (provider?.api_endpoint) return provider.api_endpoint;
  return DEFAULT_IMAGE_ENDPOINTS[kind] || DEFAULT_IMAGE_ENDPOINTS.openai;
}

function buildGeminiImageUrl(endpoint, model, apiKey) {
  const modelName = model || GEMINI_IMAGE_DEFAULT_MODEL;
  let url = endpoint
    ? formatEndpoint(endpoint, modelName)
    : formatEndpoint(DEFAULT_IMAGE_ENDPOINTS.gemini, modelName);

  if (!url.includes('generateContent')) {
    url = formatEndpoint(DEFAULT_IMAGE_ENDPOINTS.gemini, modelName);
  }

  if (url.includes('key=')) return url;
  return url.includes('?') ? `${url}&key=${encodeURIComponent(apiKey)}` : `${url}?key=${encodeURIComponent(apiKey)}`;
}

function extractGeminiImagePart(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.find((part) => part.inlineData?.mimeType?.startsWith('image/'));
}

async function generateGeminiImage({ apiKey, model, prompt, endpoint, persist = true }) {
  const finalUrl = buildGeminiImageUrl(endpoint, model, apiKey);
  const response = await axios.post(
    finalUrl,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: IMAGE_REQUEST_TIMEOUT_MS,
    }
  );

  const imagePart = extractGeminiImagePart(response.data);
  if (!imagePart?.inlineData?.data) {
    const textPart = response.data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    throw new Error(
      textPart
        || response.data?.error?.message
        || 'Gemini không trả về ảnh — kiểm tra model (gemini-2.5-flash-image-preview) và quyền API key'
    );
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';

  if (!persist) {
    return {
      image_url: `data:${mimeType};base64,${imagePart.inlineData.data}`,
      image_prompt: prompt,
      ephemeral: true,
    };
  }

  const imageUrl = await storeImageBuffer(buffer, { ext, mimeType });
  return { image_url: imageUrl, image_prompt: prompt };
}

function parseOpenAiImageItem(item) {
  if (!item) return null;

  if (item.b64_json) {
    const mimeType = 'image/png';
    const ext = 'png';
    const buffer = Buffer.from(item.b64_json, 'base64');
    return { buffer, ext, mimeType, dataUrl: `data:${mimeType};base64,${item.b64_json}` };
  }

  if (item.url) {
    return { remoteUrl: item.url };
  }

  return null;
}

async function generateDalle({ apiKey, model, prompt, endpoint, persist = true }) {
  const url = endpoint || DEFAULT_IMAGE_ENDPOINTS.openai;
  const response = await axios.post(
    url,
    { model: model || 'dall-e-3', prompt, n: 1, size: '1024x1024' },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: IMAGE_REQUEST_TIMEOUT_MS,
    }
  );

  const parsed = parseOpenAiImageItem(response.data?.data?.[0]);
  if (!parsed) {
    throw new Error('OpenAI image API không trả về url hoặc b64_json');
  }

  if (parsed.dataUrl) {
    if (!persist) {
      return { image_url: parsed.dataUrl, image_prompt: prompt, ephemeral: true };
    }
    const imageUrl = await storeImageBuffer(parsed.buffer, {
      ext: parsed.ext,
      mimeType: parsed.mimeType,
    });
    return { image_url: imageUrl, image_prompt: prompt };
  }

  const remoteUrl = parsed.remoteUrl;
  if (!persist) {
    return { image_url: remoteUrl, image_prompt: prompt, ephemeral: true };
  }
  const { buffer, ext, mimeType } = await downloadBuffer(remoteUrl);
  const imageUrl = await storeImageBuffer(buffer, { ext, mimeType });
  return { image_url: imageUrl, image_prompt: prompt };
}

async function generateIdeogram({ apiKey, prompt, endpoint, persist = true }) {
  const url = endpoint || DEFAULT_IMAGE_ENDPOINTS.ideogram;
  const response = await axios.post(
    url,
    { image_request: { prompt, aspect_ratio: 'ASPECT_1_1', model: 'V_2' } },
    {
      headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: IMAGE_REQUEST_TIMEOUT_MS,
    }
  );
  const remoteUrl = response.data?.data?.[0]?.url;
  if (!remoteUrl) throw new Error('Ideogram returned no image');
  if (!persist) {
    return { image_url: remoteUrl, image_prompt: prompt, ephemeral: true };
  }
  const { buffer, ext, mimeType } = await downloadBuffer(remoteUrl);
  const imageUrl = await storeImageBuffer(buffer, { ext, mimeType });
  return { image_url: imageUrl, image_prompt: prompt };
}

export async function generateImage(prompt, providerConfig = null, options = {}) {
  const persist = options.persist !== false;
  const kind = resolveProviderKind(providerConfig);
  const apiKey = providerConfig?.api_key
    || (kind === 'gemini' ? process.env.GEMINI_API_KEY : null)
    || (kind === 'ideogram' ? process.env.IDEOGRAM_API_KEY : null)
    || process.env.OPENAI_API_KEY;
  const endpoint = imageEndpoint(providerConfig);
  const model = providerConfig?.model;
  const rateKind = kind === 'ideogram' ? 'ideogram' : kind === 'gemini' ? 'gemini' : 'openai';

  if (!apiKey) {
    throw Object.assign(new Error('Chưa cấu hình API key cho image provider'), { status: 400 });
  }

  return callWithRateLimit(rateKind, async () => {
    try {
      if (kind === 'gemini') {
        return await generateGeminiImage({ apiKey, model, prompt, endpoint, persist });
      }
      if (kind === 'ideogram') {
        return await generateIdeogram({ apiKey, prompt, endpoint, persist });
      }
      if (kind === 'openai') {
        return await generateDalle({ apiKey, model, prompt, endpoint, persist });
      }
      throw Object.assign(
        new Error(`Loại image provider "${kind}" chưa được hỗ trợ — dùng Gemini, OpenAI hoặc Ideogram`),
        { status: 400 }
      );
    } catch (error) {
      console.error('AI image generation failed:', error?.response?.data || error.message);
      if (error.status) throw error;
      throw wrapImageError(error);
    }
  });
}

export async function validateImageUpload(file) {
  if (!file) throw new Error('No image file uploaded');
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) throw new Error('Unsupported image format');
  return true;
}

export async function storeUploadedImage(file) {
  const ext = file.originalname?.split('.').pop() || 'jpg';
  return storeImageBuffer(file.buffer, { ext, mimeType: file.mimetype });
}
