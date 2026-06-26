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

  maxLocalPostId(comments) {
    let max = 0;
    for (const c of comments || []) {
      const n = Number.parseInt(c.id, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  },

  maxLocalDraftId(queue) {
    let max = 0;
    for (const p of queue || []) {
      const raw = String(p.draft_id || p.id || '').replace(/^web-/, '');
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  },

  async collectSyncPayload() {
    const d = await chrome.storage.local.get(['tidienPendingComments', 'postQueue']);
    return {
      last_post_id: this.maxLocalPostId(d.tidienPendingComments),
      last_draft_id: this.maxLocalDraftId(d.postQueue),
    };
  },

  async fetchPendingComments(filters = {}) {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const qs = new URLSearchParams();
    if (filters.page) qs.set('page', filters.page);
    if (filters.limit) qs.set('limit', filters.limit);
    if (filters.group_id) qs.set('group_id', filters.group_id);
    if (filters.posted_by) qs.set('posted_by', filters.posted_by);
    if (filters.since) qs.set('since', filters.since);
    if (filters.needs_comment) qs.set('needs_comment', '1');
    const res = await fetch(`${base}/api/group-posts/pending-comments?${qs}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Tải bài thất bại');
    return data;
  },

  async pullPostsFromWebsite({ limit } = {}) {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const payload = await this.collectSyncPayload();
    const res = await fetch(`${base}/api/group-posts/posts/pull`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, limit }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Tải bài thất bại');
    return data;
  },

  async fetchSyncStatus() {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const payload = await this.collectSyncPayload();
    const res = await fetch(`${base}/api/group-posts/sync/status`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không đọc được trạng thái sync');
    return data;
  },

  async pullDraftsFromWebsite({ limit } = {}) {
    const base = await GF.tidienAuth.apiBase();
    const headers = await GF.tidienAuth.authHeader();
    const payload = await this.collectSyncPayload();
    const res = await fetch(`${base}/api/group-posts/drafts/pull`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, limit }),
    });
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
