window.GF = window.GF || {};

GF.aiApi = {
  async getAuth() {
    const s = await GF.storage.getSettings();
    const token = s.tidienApiKey || s.tidienToken;
    if (!token) throw new Error('Chưa đăng nhập tidien — mở Cài đặt');
    const base = (s.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
    return { base, token, settings: s };
  },

  async listProviders() {
    const { base, token } = await this.getAuth();
    const res = await fetch(`${base}/api/group-posts/ai-providers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không tải providers');
    return data;
  },

  usesProviderProxy(settings) {
    return Boolean(
      (settings?.tidienApiKey || settings?.tidienToken)
      && (settings?.imageProviderId || settings?.textProviderId),
    );
  },

  async generateImage(prompt, settings) {
    const s = settings || (await GF.storage.getSettings());
    if (s.imageProviderId && (s.tidienApiKey || s.tidienToken)) {
      const base = (s.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
      const token = s.tidienApiKey || s.tidienToken;
      const res = await fetch(`${base}/api/group-posts/ai/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider_id: s.imageProviderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Generate ảnh thất bại');
      if (!data.base64) throw new Error('Không nhận được ảnh base64');
      return { base64: data.base64, mime: data.mime || 'image/png' };
    }
    if (!s.routerApiKey) {
      throw new Error('Chọn Image provider hoặc nhập 9Router API key trong Cài đặt');
    }
    return GF.imageGen.generateDirect(prompt, s.routerApiKey, s.tidienBaseUrl);
  },

  async generateText(task, text, settings, mode) {
    const s = settings || (await GF.storage.getSettings());
    if (s.textProviderId && (s.tidienApiKey || s.tidienToken)) {
      const base = (s.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
      const token = s.tidienApiKey || s.tidienToken;
      const res = await fetch(`${base}/api/group-posts/ai/text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, text, mode, provider_id: s.textProviderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI text thất bại');
      return data.text || '';
    }
    if (!s.routerApiKey) {
      throw new Error('Chọn Text provider hoặc nhập 9Router API key trong Cài đặt');
    }
    if (task === 'comment') return GF.imageGen.generateCommentDirect(text, s.routerApiKey, s.tidienBaseUrl);
    return GF.imageGen.rewritePostDirect(text, s.routerApiKey, s.tidienBaseUrl, mode);
  },
};
