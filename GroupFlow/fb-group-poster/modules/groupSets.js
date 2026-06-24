window.GF = window.GF || {};

GF.groupSets = {
  async getAll() {
    const d = await chrome.storage.local.get('customGroupSets');
    return d.customGroupSets || [];
  },

  async saveAll(sets) {
    await chrome.storage.local.set({ customGroupSets: sets });
    return sets;
  },

  async create(name, groupIds = []) {
    const sets = await this.getAll();
    const set = {
      id: `set-${Date.now()}`,
      name: String(name || '').trim() || 'Bộ mới',
      groupIds: [...new Set((groupIds || []).map(String))],
      createdAt: new Date().toISOString(),
    };
    sets.push(set);
    await this.saveAll(sets);
    return set;
  },

  async update(id, patch) {
    const sets = await this.getAll();
    const idx = sets.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error('Không tìm thấy bộ custom');
    sets[idx] = { ...sets[idx], ...patch };
    if (patch.groupIds) {
      sets[idx].groupIds = [...new Set(patch.groupIds.map(String))];
    }
    await this.saveAll(sets);
    return sets[idx];
  },

  async remove(id) {
    const sets = (await this.getAll()).filter((s) => s.id !== id);
    await this.saveAll(sets);
    return sets;
  },
};
