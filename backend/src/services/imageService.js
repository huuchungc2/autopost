import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callWithRateLimit } from './aiService.js';
import { detectProviderKind } from './providerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesDir = path.resolve(__dirname, '../../../public/images');

function ensureImagesDir() {
  fs.mkdirSync(imagesDir, { recursive: true });
}

function saveImageBuffer(buffer, ext = 'png') {
  ensureImagesDir();
  const filename = `generated-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(imagesDir, filename), buffer);
  return `/images/${filename}`;
}

async function downloadAndSave(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const ext = url.includes('.jpg') ? 'jpg' : 'png';
  return saveImageBuffer(Buffer.from(response.data), ext);
}

async function generateDalle({ apiKey, model, prompt }) {
  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    { model: model || 'dall-e-3', prompt, n: 1, size: '1024x1024' },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  const url = response.data.data[0].url;
  const imageUrl = await downloadAndSave(url);
  return { image_url: imageUrl, image_prompt: prompt };
}

async function generateIdeogram({ apiKey, prompt }) {
  const response = await axios.post(
    'https://api.ideogram.ai/generate',
    { image_request: { prompt, aspect_ratio: 'ASPECT_1_1', model: 'V_2' } },
    { headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' } }
  );
  const url = response.data?.data?.[0]?.url;
  if (!url) throw new Error('Ideogram returned no image');
  const imageUrl = await downloadAndSave(url);
  return { image_url: imageUrl, image_prompt: prompt };
}

export async function generateImage(prompt, providerConfig = null) {
  const kind = providerConfig ? detectProviderKind(providerConfig) : 'placeholder';
  const apiKey = providerConfig?.api_key || process.env.IDEOGRAM_API_KEY || process.env.OPENAI_API_KEY;

  return callWithRateLimit(kind === 'ideogram' ? 'ideogram' : 'openai', async () => {
    try {
      if (kind === 'ideogram' && (apiKey || process.env.IDEOGRAM_API_KEY)) {
        return await generateIdeogram({ apiKey: apiKey || process.env.IDEOGRAM_API_KEY, prompt });
      }
      if ((kind === 'openai' || providerConfig) && (apiKey || process.env.OPENAI_API_KEY)) {
        return await generateDalle({ apiKey: apiKey || process.env.OPENAI_API_KEY, model: providerConfig?.model, prompt });
      }
      ensureImagesDir();
      return { image_url: `/images/placeholder-${Date.now()}.png`, image_prompt: prompt };
    } catch (error) {
      console.error('AI image generation failed:', error?.response?.data || error.message);
      ensureImagesDir();
      return { image_url: `/images/placeholder-${Date.now()}.png`, image_prompt: prompt };
    }
  });
}

export async function validateImageUpload(file) {
  if (!file) throw new Error('No image file uploaded');
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) throw new Error('Unsupported image format');
  return true;
}
