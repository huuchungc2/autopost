import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectProviderKind } from './providerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, '../../../public');

const providerDelays = { claude: 1000, openai: 500, gemini: 500, ideogram: 800, placeholder: 200 };
const limit = pLimit(3);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callWithRateLimit(kind, fn) {
  return limit(async () => {
    await sleep(providerDelays[kind] || 500);
    return fn();
  });
}

function placeholderText(prompt) {
  return { text: `[Draft] ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}` };
}

async function callOpenAI({ apiKey, model, systemPrompt, userPrompt }) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: model || 'gpt-4o-mini',
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
  );
  return { text: response.data.choices[0].message.content.trim() };
}

async function callClaude({ apiKey, model, systemPrompt, userPrompt }) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: systemPrompt || undefined,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );
  return { text: response.data.content[0].text.trim() };
}

async function callGemini({ apiKey, model, systemPrompt, userPrompt }) {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const parts = [{ text: userPrompt }];
  const body = { contents: [{ parts }] };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  const response = await axios.post(url, body);
  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return { text: text.trim() };
}

export async function generateText(userPrompt, providerConfig = null, systemPrompt = '') {
  const kind = providerConfig ? detectProviderKind(providerConfig) : 'placeholder';
  const apiKey = providerConfig?.api_key || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey && kind !== 'placeholder') {
    return callWithRateLimit('placeholder', () => placeholderText(userPrompt));
  }

  return callWithRateLimit(kind, async () => {
    try {
      if (kind === 'claude') {
        return await callClaude({ apiKey: apiKey || process.env.CLAUDE_API_KEY, model: providerConfig?.model, systemPrompt, userPrompt });
      }
      if (kind === 'gemini') {
        return await callGemini({ apiKey: apiKey || process.env.GEMINI_API_KEY, model: providerConfig?.model, systemPrompt, userPrompt });
      }
      if (kind === 'openai' || providerConfig) {
        return await callOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY, model: providerConfig?.model, systemPrompt, userPrompt });
      }
      return placeholderText(userPrompt);
    } catch (error) {
      console.error('AI text generation failed:', error?.response?.data || error.message);
      return placeholderText(userPrompt);
    }
  });
}
