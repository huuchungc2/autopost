globalThis.GF = globalThis.GF || {};

globalThis.GF.localProviders = {
  STORAGE_KEY: 'localProviders',
  ACTIVE_TEXT_KEY: 'activeTextLocalProviderId',
  ACTIVE_IMAGE_KEY: 'activeImageLocalProviderId',

  defaultEndpoint(kind, type) {
    if (kind === 'claude') return 'https://api.anthropic.com/v1/messages';
    if (kind === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';
    if (kind === 'ideogram') return 'https://api.ideogram.ai/generate';
    if (type === 'image') return 'https://api.openai.com/v1/images/generations';
    return 'https://api.openai.com/v1/chat/completions';
  },

  async list() {
    const d = await chrome.storage.local.get(this.STORAGE_KEY);
    return Array.isArray(d[this.STORAGE_KEY]) ? d[this.STORAGE_KEY] : [];
  },

  async saveAll(providers) {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: providers });
    return providers;
  },

  async getById(id) {
    const list = await this.list();
    return list.find((p) => String(p.id) === String(id)) || null;
  },

  async upsert(provider) {
    const list = await this.list();
    const payload = {
      id: provider.id || `lp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(provider.name || 'Provider').trim() || 'Provider',
      type: provider.type === 'image' ? 'image' : 'text',
      provider_kind: ['claude', 'gemini', 'ideogram', 'openai'].includes(provider.provider_kind)
        ? provider.provider_kind
        : 'openai',
      api_key: String(provider.api_key || '').trim(),
      model: String(provider.model || '').trim(),
      api_endpoint: String(provider.api_endpoint || '').trim()
        || this.defaultEndpoint(provider.provider_kind, provider.type),
      is_active: provider.is_active !== false,
      updated_at: new Date().toISOString(),
    };
    if (!payload.api_key) throw new Error('Provider cần API key');
    const idx = list.findIndex((p) => p.id === payload.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...payload };
    else list.push({ ...payload, created_at: payload.updated_at });
    await this.saveAll(list);
    return payload;
  },

  async remove(id) {
    const list = (await this.list()).filter((p) => String(p.id) !== String(id));
    await this.saveAll(list);
    const d = await chrome.storage.local.get([this.ACTIVE_TEXT_KEY, this.ACTIVE_IMAGE_KEY]);
    const patch = {};
    if (String(d[this.ACTIVE_TEXT_KEY]) === String(id)) patch[this.ACTIVE_TEXT_KEY] = null;
    if (String(d[this.ACTIVE_IMAGE_KEY]) === String(id)) patch[this.ACTIVE_IMAGE_KEY] = null;
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
    return list;
  },

  async getActiveIds() {
    const d = await chrome.storage.local.get([this.ACTIVE_TEXT_KEY, this.ACTIVE_IMAGE_KEY]);
    return {
      textProviderId: d[this.ACTIVE_TEXT_KEY] || null,
      imageProviderId: d[this.ACTIVE_IMAGE_KEY] || null,
    };
  },

  async setActiveIds({ textProviderId, imageProviderId }) {
    await chrome.storage.local.set({
      [this.ACTIVE_TEXT_KEY]: textProviderId || null,
      [this.ACTIVE_IMAGE_KEY]: imageProviderId || null,
    });
  },

  async getActiveProviders() {
    const { textProviderId, imageProviderId } = await this.getActiveIds();
    const textProvider = textProviderId ? await this.getById(textProviderId) : null;
    const imageProvider = imageProviderId ? await this.getById(imageProviderId) : null;
    return {
      textProviderId,
      imageProviderId,
      textProvider: textProvider?.is_active !== false ? textProvider : null,
      imageProvider: imageProvider?.is_active !== false ? imageProvider : null,
    };
  },

  parseImportJson(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('File JSON không hợp lệ'); }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row, i) => {
      if (!String(row.api_key || '').trim()) throw new Error(`Dòng ${i + 1}: thiếu api_key`);
      return {
        name: row.name || `Provider ${i + 1}`,
        type: row.type === 'image' ? 'image' : 'text',
        provider_kind: row.provider_kind || 'openai',
        api_key: row.api_key,
        model: row.model || '',
        api_endpoint: row.api_endpoint || '',
        is_active: row.is_active !== false,
      };
    });
  },

  async importFromJson(text) {
    const rows = this.parseImportJson(text);
    for (const row of rows) await this.upsert(row);
    return this.list();
  },

  exportJson() {
    return this.list().then((list) => JSON.stringify(
      list.map(({ name, type, provider_kind, api_key, model, api_endpoint, is_active }) => ({
        name, type, provider_kind, api_key, model, api_endpoint, is_active,
      })),
      null,
      2,
    ));
  },
};
