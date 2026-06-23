window.GF = window.GF || {};

GF.tidienSync = {
  async syncPost(payload) {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const res = await fetch(`${base}/api/group-posts/sync`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sync thất bại');
    return data;
  },

  async fetchPendingComments(filters = {}) {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const qs = new URLSearchParams();
    if (filters.page) qs.set('page', filters.page);
    if (filters.limit) qs.set('limit', filters.limit);
    if (filters.group_id) qs.set('group_id', filters.group_id);
    if (filters.posted_by) qs.set('posted_by', filters.posted_by);
    const res = await fetch(`${base}/api/group-posts/pending-comments?${qs}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Tải bài thất bại');
    return data;
  },

  /** Tải draft từ website → extension queue */
  async pullDraftsFromWebsite() {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const res = await fetch(`${base}/api/group-posts/drafts/pull`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Tải draft thất bại');
    return data;
  },

  async markCommented(recordId, fbUserId) {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const res = await fetch(`${base}/api/group-posts/${recordId}/commented`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commenter_fb_user_id: fbUserId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Cập nhật comment thất bại');
    return data;
  },
};
