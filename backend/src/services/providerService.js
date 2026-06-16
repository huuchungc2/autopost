import { query } from '../db.js';
import { resolveGenerationPrompts } from './pageSkillsService.js';
import { resolveMediaMode } from './contentGenerationService.js';

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

export async function getPageGenerationConfig(pageId, options = null) {
  const opts = typeof options === 'object' && options !== null
    ? options
    : { textSkillId: options || null };

  const rows = await query(
    `SELECT fp.id, fp.name, fp.skill_id, fp.text_provider_id, fp.image_provider_id
     FROM fb_pages fp
     WHERE fp.id = ? AND fp.is_active = true`,
    [pageId]
  );
  const page = rows[0];
  if (!page) return null;

  const prompts = await resolveGenerationPrompts(pageId, {
    textSkillId: opts.textSkillId || opts.skill_id || null,
    mediaType: opts.mediaType || opts.media_type || null,
  });

  const textProvider = await getProviderById(page.text_provider_id);
  const imageProvider = await getProviderById(page.image_provider_id);

  const mediaMode = resolveMediaMode({
    mediaType: opts.mediaType || opts.media_type || prompts.mediaType,
    imageSkills: prompts.imageSkills,
    videoSkills: prompts.videoSkills,
    imageProvider,
  });

  return {
    page,
    skills: prompts.skills,
    textSkills: prompts.textSkills,
    imageSkills: prompts.imageSkills,
    videoSkills: prompts.videoSkills,
    textSystemPrompt: prompts.textSystemPrompt,
    imageSystemPrompt: prompts.imageSystemPrompt,
    videoSystemPrompt: prompts.videoSystemPrompt,
    mediaMode,
    activeTextSkill: prompts.activeTextSkill,
    textProvider,
    imageProvider,
    // tương thích cũ
    skillPrompt: prompts.textSystemPrompt,
    activeSkill: prompts.activeTextSkill,
  };
}
