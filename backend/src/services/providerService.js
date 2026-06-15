import { query } from '../db.js';

export async function getProviderById(id) {
  if (!id) return null;
  const rows = await query('SELECT id, name, type, api_key, model, is_active FROM ai_providers WHERE id = ? AND is_active = true', [id]);
  return rows[0] || null;
}

export async function getPageGenerationConfig(pageId) {
  const rows = await query(
    `SELECT fp.id, fp.name, fp.skill_id, fp.text_provider_id, fp.image_provider_id,
            s.system_prompt AS skill_prompt
     FROM fb_pages fp
     LEFT JOIN skills s ON s.id = fp.skill_id
     WHERE fp.id = ? AND fp.is_active = true`,
    [pageId]
  );
  const page = rows[0];
  if (!page) return null;

  const textProvider = await getProviderById(page.text_provider_id);
  const imageProvider = await getProviderById(page.image_provider_id);

  return {
    page,
    skillPrompt: page.skill_prompt || '',
    textProvider,
    imageProvider,
  };
}

export function detectProviderKind(provider) {
  if (!provider) return 'placeholder';
  const name = (provider.name || '').toLowerCase();
  if (name.includes('claude') || name.includes('anthropic')) return 'claude';
  if (name.includes('gemini') || name.includes('google')) return 'gemini';
  if (name.includes('ideogram')) return 'ideogram';
  if (name.includes('dall') || name.includes('openai') || provider.type === 'image') return 'openai';
  if (provider.type === 'text') return 'openai';
  return 'openai';
}
