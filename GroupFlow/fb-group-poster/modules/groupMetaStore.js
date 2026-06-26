/**
 * Lưu / học metadata nhóm (privacy, duyệt bài) vào extractedGroups.
 */
const GMS = globalThis.GF.groupMetaStore = {
  async getDocIds() {
    const d = await chrome.storage.local.get('gfGraphqlDocIds');
    return d.gfGraphqlDocIds || {};
  },

  async saveDocIds(partial) {
    if (!partial || !Object.keys(partial).length) return {};
    const cur = await this.getDocIds();
    const merged = { ...cur, ...partial };
    await chrome.storage.local.set({ gfGraphqlDocIds: merged });
    return merged;
  },

  async patchGroup(groupId, patch) {
    const GP = globalThis.GF?.groupParse;
    const data = await chrome.storage.local.get('extractedGroups');
    const groups = [...(data.extractedGroups || [])];
    const id = String(groupId);
    const idx = groups.findIndex((g) => String(g.id) === id);
    const base = idx >= 0
      ? groups[idx]
      : {
        id,
        name: `Group ${id}`,
        href: `https://www.facebook.com/groups/${id}/`,
        privacy: 'UNKNOWN',
        post_approval: 'unknown',
      };
    const merged = GP?.mergeGroupEntry
      ? GP.mergeGroupEntry(base, { ...patch, id })
      : { ...base, ...patch, id };
    if (idx >= 0) groups[idx] = merged;
    else groups.push(merged);
    groups.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    await chrome.storage.local.set({ extractedGroups: groups, groupsSyncedAt: Date.now() });
    return merged;
  },

  async learnFromPost(groupId, res) {
    let post_approval = null;
    if (res?.status === 'pending_approval' || res?.postId === 'pending') {
      post_approval = 'required';
    } else if (res?.postId && /^\d+$/.test(String(res.postId))) {
      post_approval = 'none';
    }
    if (!post_approval) return null;
    return this.patchGroup(groupId, {
      post_approval,
      requires_approval: post_approval === 'required',
      meta_source: 'post_learned',
      meta_learned_at: Date.now(),
    });
  },

  async applyMetaFromNetwork(groups) {
    if (!groups?.length) return;
    for (const g of groups) {
      if (!g?.id) continue;
      if (g.privacy === 'UNKNOWN' && g.post_approval === 'unknown') continue;
      await this.patchGroup(g.id, {
        privacy: g.privacy,
        post_approval: g.post_approval,
        requires_approval: g.requires_approval,
        join_role: g.join_role,
        meta_source: g.meta_source || 'network_capture',
        meta_learned_at: Date.now(),
      });
    }
  },
};
