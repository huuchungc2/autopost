window.GF = window.GF || {};

GF.tidienAuth = {
  async apiBase() {
    const s = await GF.storage.getSettings();
    return s.tidienBaseUrl.replace(/\/$/, '');
  },

  authHeader() {
    return GF.storage.getSettings().then((s) => {
      const token = s.tidienApiKey || s.tidienToken;
      if (!token) throw new Error('Chưa đăng nhập tidien hoặc thiếu API key');
      return { Authorization: `Bearer ${token}` };
    });
  },

  async login(email, password) {
    const base = await this.apiBase();
    const res = await fetch(`${base}/api/group-posts/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại');
    const patch = {
      tidienToken: data.token,
      tidienApiKey: data.api_key,
      tidienUser: data.user,
    };
    if (data.fb_user_id) {
      patch.fbUser = { id: data.fb_user_id, name: data.fb_user_name || data.user?.name };
    }
    await GF.storage.set(patch);
    return data;
  },

  async saveFbProfile(fbUser) {
    const base = await this.apiBase();
    const headers = await this.authHeader();
    const res = await fetch(`${base}/api/group-posts/fb-profile`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fb_user_id: fbUser.id, fb_user_name: fbUser.name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Lưu FB profile thất bại');
    await GF.storage.set({ fbUser });
    return data;
  },

  async testConnection() {
    const base = await this.apiBase();
    const headers = await this.authHeader();
    const res = await fetch(`${base}/api/group-posts/me`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Kết nối thất bại');
    return data;
  },
};
