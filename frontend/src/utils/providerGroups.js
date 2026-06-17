export const PROVIDER_FAMILIES = [
  { id: 'openai', label: 'OpenAI', description: 'GPT viết bài · DALL-E tạo ảnh' },
  { id: '9router', label: '9Router', description: 'Gateway OpenAI-compatible (Claude, GPT, ảnh…)' },
  { id: 'claude', label: 'Claude', description: 'Anthropic — viết bài Facebook' },
  { id: 'gemini', label: 'Gemini', description: 'Google — viết bài · xuất ảnh (gemini-2.5-flash-image-preview)' },
  { id: 'ideogram', label: 'Ideogram', description: 'Tạo ảnh minh họa bài đăng' },
  { id: 'custom', label: 'Khác / tùy chỉnh', description: 'API gateway hoặc provider riêng' },
];

export function familyFromSlug(slug = '') {
  const s = String(slug).toLowerCase();
  if (s.startsWith('openai')) return 'openai';
  if (s.startsWith('9router')) return '9router';
  if (s.startsWith('claude')) return 'claude';
  if (s.startsWith('gemini')) return 'gemini';
  if (s.startsWith('ideogram')) return 'ideogram';
  return 'custom';
}

export function familyFromTemplate(template) {
  if (!template) return 'custom';
  if (template.slug) return familyFromSlug(template.slug);
  const name = String(template.name || '').toLowerCase();
  if (name.includes('openai') || name.includes('dall-e')) return 'openai';
  if (name.includes('9router')) return '9router';
  if (name.includes('claude') || name.includes('anthropic')) return 'claude';
  if (name.includes('gemini')) return 'gemini';
  if (name.includes('ideogram')) return 'ideogram';
  return 'custom';
}

export function familyFromProvider(provider, templates = []) {
  if (provider?.template_id) {
    const tpl = templates.find((t) => t.id === provider.template_id);
    if (tpl) return familyFromTemplate(tpl);
  }
  const name = String(provider?.name || '').toLowerCase();
  if (name.includes('openai') || name.includes('dall-e')) return 'openai';
  if (name.includes('9router')) return '9router';
  if (name.includes('claude') || name.includes('anthropic')) return 'claude';
  if (name.includes('gemini')) return 'gemini';
  if (name.includes('ideogram')) return 'ideogram';
  if (provider?.template_id) return 'custom';
  return 'custom';
}

export function groupTemplatesByFamily(templates = []) {
  const map = Object.fromEntries(PROVIDER_FAMILIES.map((f) => [f.id, { text: null, image: null }]));
  for (const template of templates) {
    const familyId = familyFromTemplate(template);
    const bucket = map[familyId] || map.custom;
    if (template.type === 'image') {
      if (!bucket.image) bucket.image = template;
    } else {
      if (!bucket.text) bucket.text = template;
    }
  }
  return map;
}

export function groupProvidersByFamily(providers = [], templates = []) {
  const map = Object.fromEntries(PROVIDER_FAMILIES.map((f) => [f.id, { text: [], image: [] }]));
  for (const provider of providers) {
    const familyId = familyFromProvider(provider, templates);
    const bucket = map[familyId] || map.custom;
    if (provider.type === 'image') bucket.image.push(provider);
    else bucket.text.push(provider);
  }
  return map;
}
