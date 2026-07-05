window.GF = window.GF || {};

GF.localSkills = {
  STORAGE_KEY: 'localSkills',

  normalizeType(type) {
    const t = String(type || 'text').toLowerCase();
    return ['text', 'image', 'video'].includes(t) ? t : 'text';
  },

  async list() {
    const d = await chrome.storage.local.get(this.STORAGE_KEY);
    return Array.isArray(d[this.STORAGE_KEY]) ? d[this.STORAGE_KEY] : [];
  },

  async saveAll(skills) {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: skills });
    return skills;
  },

  async getById(id) {
    const skills = await this.list();
    return skills.find((s) => String(s.id) === String(id)) || null;
  },

  async upsert(skill) {
    const skills = await this.list();
    const payload = {
      id: skill.id || `ls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(skill.name || 'Skill').trim() || 'Skill',
      description: String(skill.description || '').trim(),
      skill_type: this.normalizeType(skill.skill_type),
      system_prompt: String(skill.system_prompt || '').trim(),
      updated_at: new Date().toISOString(),
    };
    if (!payload.system_prompt) throw new Error('Skill cần system_prompt');
    const idx = skills.findIndex((s) => s.id === payload.id);
    if (idx >= 0) skills[idx] = { ...skills[idx], ...payload };
    else skills.push({ ...payload, created_at: payload.updated_at });
    await this.saveAll(skills);
    return payload;
  },

  async remove(id) {
    const skills = (await this.list()).filter((s) => String(s.id) !== String(id));
    await this.saveAll(skills);
    return skills;
  },

  parseImportJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('File JSON không hợp lệ');
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (!rows.length) throw new Error('JSON rỗng');
    return rows.map((row, i) => {
      const prompt = row.system_prompt || row.prompt || row.content;
      if (!String(prompt || '').trim()) {
        throw new Error(`Dòng ${i + 1}: thiếu system_prompt / prompt / content`);
      }
      return {
        name: String(row.name || `Skill ${i + 1}`).trim(),
        description: String(row.description || '').trim(),
        skill_type: this.normalizeType(row.skill_type),
        system_prompt: String(prompt).trim(),
      };
    });
  },

  async importFromJson(text, { merge = true } = {}) {
    const incoming = await Promise.all(
      this.parseImportJson(text).map((row) => this.upsert(row)),
    );
    if (!merge) {
      const ids = new Set(incoming.map((s) => s.id));
      const kept = (await this.list()).filter((s) => ids.has(s.id));
      await this.saveAll(kept);
    }
    return this.list();
  },

  async importFromPromptFile(text, filename) {
    const content = String(text || '').trim();
    if (!content) throw new Error('File rỗng — không có nội dung prompt');
    const name = String(filename || 'Skill').replace(/\.[^.]+$/, '').trim() || 'Skill';
    await this.upsert({ name, skill_type: 'text', system_prompt: content });
    return this.list();
  },

  exportJson() {
    return this.list().then((skills) => JSON.stringify(
      skills.map(({ id, name, description, skill_type, system_prompt }) => ({
        name, description, skill_type, system_prompt,
      })),
      null,
      2,
    ));
  },
};
