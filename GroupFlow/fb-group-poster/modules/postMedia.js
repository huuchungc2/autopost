const PM = globalThis.GF.postMedia = {
  getPostImages(post) {
    if (post?.images?.length) return post.images;
    if (post?.imageBase64) {
      return [{ base64: post.imageBase64, mime: post.mediaMime || 'image/png' }];
    }
    return [];
  },

  hasPostMedia(post) {
    return Boolean(post?.videoBase64 || post?.imageBase64 || post?.images?.length);
  },

  wantsAutoGenerate(post) {
    return post?.autoGenerateImage !== false;
  },

  needsImageGeneration(post) {
    if (!post) return false;
    const PF = globalThis.GF?.postFormat;
    if (PF?.isColored?.(post.backgroundColor)) return false;
    if (post.imageBase64 || post.videoBase64 || post.images?.length) return false;
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

  async generateImageViaProxy() {
    throw new Error('Provider website đã bỏ — cấu hình Image provider local trong Cài đặt');
  },

  async resolveLocalImageProvider() {
    const d = await chrome.storage.local.get(['localProviders', 'activeImageLocalProviderId']);
    return (d.localProviders || []).find((p) => String(p.id) === String(d.activeImageLocalProviderId)) || null;
  },

  async generateImage(prompt, settings) {
    const provider = await this.resolveLocalImageProvider();
    const LA = globalThis.GF?.localAi;
    if (provider?.api_key && LA) {
      return LA.callImage(provider, prompt);
    }
    const d = await chrome.storage.local.get(['routerApiKey', 'tidienBaseUrl']);
    const apiKey = settings?.routerApiKey || d.routerApiKey;
    if (!apiKey) {
      throw new Error('Chọn Image provider trong Cài đặt hoặc nhập 9Router API key');
    }
    return this.generateImageDirect(prompt, apiKey, settings?.tidienBaseUrl || d.tidienBaseUrl);
  },

  applyImageToPost(post, img) {
    post.images = [{ base64: img.base64, mime: img.mime || 'image/png' }];
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
    if (post.imageBase64 || post.videoBase64 || post.images?.length) return post;
    if (!this.needsImageGeneration(post)) return post;

    post.imageStatus = 'generating';
    await this.persistPost(post);

    const img = await this.generateImage(String(post.prompt_anh).trim(), settings);
    this.applyImageToPost(post, img);
    await this.maybeSaveImageLocal(img.base64, `groupflow-${post.id}.png`, settings);
    await this.persistPost(post);
    return post;
  },

  async maybeSaveImageLocal(base64, filename, settings) {
    const d = await chrome.storage.local.get([
      'imageSaveLocal', 'imageSaveSubfolder', 'imageSaveMode', 'imageSaveAskEachTime',
    ]);
    const cfg = {
      enabled: (settings?.imageSaveLocal ?? d.imageSaveLocal) !== false,
      mode: settings?.imageSaveMode || d.imageSaveMode || 'downloads',
      subfolder: settings?.imageSaveSubfolder || d.imageSaveSubfolder || 'GroupFlow',
      askEachTime: settings?.imageSaveAskEachTime ?? d.imageSaveAskEachTime === true,
    };
    if (!cfg.enabled) return;
    const sub = String(cfg.subfolder).replace(/^[/\\]+|[/\\]+$/g, '');
    const safeName = String(filename || `groupflow-${Date.now()}.png`).replace(/[/\\]/g, '-');
    const path = sub ? `${sub}/${safeName}` : safeName;
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: path, saveAs: cfg.askEachTime === true });
    URL.revokeObjectURL(url);
  },
};
