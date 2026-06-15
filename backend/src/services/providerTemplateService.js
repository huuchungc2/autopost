import { query } from '../db.js';

export const DEFAULT_TEMPLATES = [
  {
    slug: 'openai-text',
    name: 'OpenAI Text',
    type: 'text',
    provider_kind: 'openai',
    api_endpoint: 'https://api.openai.com/v1/chat/completions',
    default_model: 'gpt-4o-mini',
    description: 'Viết caption / nội dung bài (GPT)',
    key_label: 'OpenAI API Key',
    key_placeholder: 'sk-proj-...',
    key_help: 'Lấy tại platform.openai.com → API keys',
    sort_order: 1,
  },
  {
    slug: 'openai-image',
    name: 'OpenAI DALL-E',
    type: 'image',
    provider_kind: 'openai',
    api_endpoint: 'https://api.openai.com/v1/images/generations',
    default_model: 'dall-e-3',
    description: 'Tạo ảnh minh họa bài đăng',
    key_label: 'OpenAI API Key',
    key_placeholder: 'sk-proj-...',
    key_help: 'Cùng key OpenAI với Text',
    sort_order: 2,
  },
  {
    slug: 'claude-text',
    name: 'Claude Text',
    type: 'text',
    provider_kind: 'claude',
    api_endpoint: 'https://api.anthropic.com/v1/messages',
    default_model: 'claude-3-5-sonnet-20241022',
    description: 'Viết bài bằng Claude',
    key_label: 'Anthropic API Key',
    key_placeholder: 'sk-ant-...',
    key_help: 'Lấy tại console.anthropic.com',
    sort_order: 3,
  },
  {
    slug: 'gemini-text',
    name: 'Gemini Text',
    type: 'text',
    provider_kind: 'gemini',
    api_endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    default_model: 'gemini-1.5-flash',
    description: 'Viết bài bằng Google Gemini',
    key_label: 'Google AI API Key',
    key_placeholder: 'AIza...',
    key_help: 'Lấy tại aistudio.google.com/apikey',
    sort_order: 4,
  },
  {
    slug: 'ideogram-image',
    name: 'Ideogram Image',
    type: 'image',
    provider_kind: 'ideogram',
    api_endpoint: 'https://api.ideogram.ai/generate',
    default_model: 'V_2',
    description: 'Tạo ảnh bằng Ideogram',
    key_label: 'Ideogram API Key',
    key_placeholder: '...',
    key_help: 'Lấy tại ideogram.ai',
    sort_order: 5,
  },
];

export async function seedProviderTemplates() {
  for (const tpl of DEFAULT_TEMPLATES) {
    const existing = await query('SELECT id FROM ai_provider_templates WHERE slug = ?', [tpl.slug]);
    if (existing.length) {
      await query(
        `UPDATE ai_provider_templates SET name = ?, type = ?, provider_kind = ?, api_endpoint = ?,
         default_model = ?, description = ?, key_label = ?, key_placeholder = ?, key_help = ?, sort_order = ?
         WHERE slug = ?`,
        [
          tpl.name, tpl.type, tpl.provider_kind, tpl.api_endpoint, tpl.default_model,
          tpl.description, tpl.key_label, tpl.key_placeholder, tpl.key_help, tpl.sort_order, tpl.slug,
        ]
      );
    } else {
      await query(
        `INSERT INTO ai_provider_templates
         (slug, name, type, provider_kind, api_endpoint, default_model, description, key_label, key_placeholder, key_help, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)`,
        [
          tpl.slug, tpl.name, tpl.type, tpl.provider_kind, tpl.api_endpoint, tpl.default_model,
          tpl.description, tpl.key_label, tpl.key_placeholder, tpl.key_help, tpl.sort_order,
        ]
      );
    }
  }
}

export async function listProviderTemplates() {
  return query(
    `SELECT id, slug, name, type, provider_kind, api_endpoint, default_model, description,
            key_label, key_placeholder, key_help, sort_order
     FROM ai_provider_templates
     WHERE is_active = true
     ORDER BY sort_order ASC, name ASC`
  );
}

export async function getProviderTemplateById(id) {
  const rows = await query(
    `SELECT id, slug, name, type, provider_kind, api_endpoint, default_model, description,
            key_label, key_placeholder, key_help
     FROM ai_provider_templates WHERE id = ? AND is_active = true`,
    [id]
  );
  return rows[0] || null;
}

/** Gán kind + endpoint cho provider cũ chưa có metadata */
export async function backfillProviderMetadata() {
  const templates = await listProviderTemplates();
  const providers = await query(
    'SELECT id, name, type, template_id, provider_kind, api_endpoint FROM ai_providers'
  );

  for (const provider of providers) {
    if (provider.api_endpoint && provider.provider_kind) continue;
    const tpl = templates.find((t) => t.name === provider.name && t.type === provider.type)
      || templates.find((t) => t.type === provider.type && provider.name?.toLowerCase().includes(t.provider_kind));
    if (!tpl) continue;
    await query(
      'UPDATE ai_providers SET template_id = ?, provider_kind = ?, api_endpoint = ? WHERE id = ?',
      [tpl.id, tpl.provider_kind, tpl.api_endpoint, provider.id]
    );
  }
}
