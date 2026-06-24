const PM = globalThis.GF.postMedia = {
  wantsAutoGenerate(post) {
    return post?.autoGenerateImage !== false;
  },

  needsImageGeneration(post) {
    if (!post) return false;
    if (post.imageBase64 || post.videoBase64) return false;
    if (!this.wantsAutoGenerate(post)) return false;
    return Boolean(String(post.prompt_anh || '').trim());
  },

  async generateImageDirect(prompt, apiKey, baseUrl) {
    const url = `${(baseUrl || 'https://tidien.xyz').replace(/\/$/, '')}/v1/images/generations`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cx/gpt-5.5-image',
        prompt,
        n: 1,
        response_format: 'b64_json',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || data.error || 'Generate ảnh thất bại');
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('Không nhận được ảnh base64');
    return { base64: b64, mime: 'image/png' };
  },

  async generateImageViaProxy(prompt, settings) {
    const base = (settings.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
    const token = settings.tidienApiKey || settings.tidienToken;
    if (!token) throw new Error('Chưa đăng nhập tidien — mở Cài đặt');
    if (!settings.imageProviderId) {
      throw new Error('Chưa chọn Image provider trong Cài đặt extension');
    }
    const res = await fetch(`${base}/api/group-posts/ai/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider_id: settings.imageProviderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Generate ảnh thất bại');
    if (!data.base64) throw new Error('Không nhận được ảnh base64');
    return { base64: data.base64, mime: data.mime || 'image/png' };
  },

  async generateImage(prompt, settings) {
    if (settings?.imageProviderId && (settings.tidienApiKey || settings.tidienToken)) {
      return this.generateImageViaProxy(prompt, settings);
    }
    const apiKey = settings?.routerApiKey;
    if (!apiKey) {
      throw new Error('Chọn Image provider hoặc nhập 9Router API key trong Cài đặt');
    }
    return this.generateImageDirect(prompt, apiKey, settings.tidienBaseUrl);
  },

  applyImageToPost(post, img) {
    post.imageBase64 = img.base64;
    post.mediaType = 'image';
    post.mediaMime = img.mime || 'image/png';
    post.imageStatus = 'ready';
    post.imageLocal = true;
    return post;
  },

  async persistPost(post) {
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const idx = queue.findIndex((p) => p.id === post.id);
    if (idx >= 0) queue[idx] = { ...queue[idx], ...post };
    else queue.push(post);
    await chrome.storage.local.set({ postQueue: queue });
    return post;
  },

  async ensurePostMedia(post, settings) {
    if (!post) return post;
    if (post.imageBase64 || post.videoBase64) return post;
    if (!this.needsImageGeneration(post)) return post;

    post.imageStatus = 'generating';
    await this.persistPost(post);

    const img = await this.generateImage(String(post.prompt_anh).trim(), settings);
    this.applyImageToPost(post, img);
    await this.persistPost(post);
    return post;
  },
};
