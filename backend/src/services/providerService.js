import { query } from '../db.js';
import { resolveSkillPrompt } from './pageSkillsService.js';

export async function getProviderById(id) {
  if (!id) return null;
  const rows = await query(
    `SELECT id, name, type, api_key, model, template_id, provider_kind, api_endpoint, is_active
     FROM ai_providers WHERE id = ? AND is_active = true`,
    [id]
  );
  return rows[0] || null;
}

export function resolveProviderKind(provider) {
  if (!provider) return 'placeholder';
  if (provider.provider_kind) return provider.provider_kind;
  return detectProviderKind(provider);
}

/** @deprecated dùng resolveProviderKind — giữ cho tương thích */
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

export function formatEndpoint(endpoint, model) {
  if (!endpoint) return endpoint;
  return endpoint.replace(/\{model\}/g, model || '');
}

export async function getPageGenerationConfig(pageId, skillId = null) {
  const rows = await query(
    `SELECT fp.id, fp.name, fp.skill_id, fp.text_provider_id, fp.image_provider_id
     FROM fb_pages fp
     WHERE fp.id = ? AND fp.is_active = true`,
    [pageId]
  );
  const page = rows[0];
  if (!page) return null;

  const { skills, skillPrompt, activeSkill } = await resolveSkillPrompt(pageId, skillId);
  const textProvider = await getProviderById(page.text_provider_id);
  const imageProvider = await getProviderById(page.image_provider_id);

  return {
    page,
    skills,
    activeSkill,
    skillPrompt,
    textProvider,
    imageProvider,
  };
}
