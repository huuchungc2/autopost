import axios from 'axios';
import { callWithRateLimit } from './aiService.js';
import { resolveProviderKind } from './providerService.js';
import { storeImageBuffer } from './mediaStorage.js';

const DEFAULT_IMAGE_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/images/generations',
  ideogram: 'https://api.ideogram.ai/generate',
};

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

async function generateDalle({ apiKey, model, prompt, endpoint }) {
  const url = endpoint || DEFAULT_IMAGE_ENDPOINTS.openai;
  const response = await axios.post(
    url,
    { model: model || 'dall-e-3', prompt, n: 1, size: '1024x1024' },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  const { buffer, ext, mimeType } = await downloadBuffer(response.data.data[0].url);
  const imageUrl = await storeImageBuffer(buffer, { ext, mimeType });
  return { image_url: imageUrl, image_prompt: prompt };
}

async function generateIdeogram({ apiKey, prompt, endpoint }) {
  const url = endpoint || DEFAULT_IMAGE_ENDPOINTS.ideogram;
  const response = await axios.post(
    url,
    { image_request: { prompt, aspect_ratio: 'ASPECT_1_1', model: 'V_2' } },
    { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' } }
  );
  const remoteUrl = response.data?.data?.[0]?.url;
  if (!remoteUrl) throw new Error('Ideogram returned no image');
  const { buffer, ext, mimeType } = await downloadBuffer(remoteUrl);
  const imageUrl = await storeImageBuffer(buffer, { ext, mimeType });
  return { image_url: imageUrl, image_prompt: prompt };
}

export async function generateImage(prompt, providerConfig = null) {
  const kind = resolveProviderKind(providerConfig);
  const apiKey = providerConfig?.api_key || process.env.IDEOGRAM_API_KEY || process.env.OPENAI_API_KEY;
  const endpoint = imageEndpoint(providerConfig);

  return callWithRateLimit(kind === 'ideogram' ? 'ideogram' : 'openai', async () => {
    try {
      if (kind === 'ideogram' && (apiKey || process.env.IDEOGRAM_API_KEY)) {
        return await generateIdeogram({ apiKey: apiKey || process.env.IDEOGRAM_API_KEY, prompt, endpoint });
      }
      if ((kind === 'openai' || providerConfig) && (apiKey || process.env.OPENAI_API_KEY)) {
        return await generateDalle({ apiKey: apiKey || process.env.OPENAI_API_KEY, model: providerConfig?.model, prompt, endpoint });
      }
      throw new Error('Chưa cấu hình Image AI provider');
    } catch (error) {
      console.error('AI image generation failed:', error?.response?.data || error.message);
      throw error;
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
