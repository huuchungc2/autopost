/* AUTO-GENERATED — chạy: node build-sw-bundle.js */

// ----- gfShared.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/** Shared GF namespace — dùng trong SW bundle (IIFE) và content script. */
globalThis.GF = globalThis.GF || {};
const GF = globalThis.GF;

GF.textFormat = {
  escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /** Quill delta → HTML đơn giản cho paste Cổ điển (bold/italic/xuống dòng). */
  deltaToHtml(delta) {
    if (!delta?.ops?.length) return '';
    let html = '';
    let inList = false;
    const closeList = () => {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    };
    for (const op of delta.ops) {
      if (typeof op.insert !== 'string') continue;
      let chunk = this.escapeHtml(op.insert);
      const attrs = op.attributes || {};
      if (attrs.list === 'bullet') {
        if (!inList) {
          closeList();
          html += '<ul>';
          inList = true;
        }
        chunk = chunk.replace(/\n$/, '');
        if (!chunk) continue;
        chunk = `<li>${chunk}</li>`;
      } else {
        closeList();
        if (attrs.bold && attrs.italic) chunk = `<strong><em>${chunk}</em></strong>`;
        else if (attrs.bold) chunk = `<strong>${chunk}</strong>`;
        else if (attrs.italic) chunk = `<em>${chunk}</em>`;
        chunk = chunk.replace(/\n/g, '<br>');
      }
      html += chunk;
    }
    closeList();
    return html
      .replace(/<br><\/ul>/g, '</ul>')
      .replace(/<ul><li>/g, '<ul><li>')
      .replace(/<\/li><br>/g, '</li>');
  },

  plainFromHtml(html) {
    const el = document.createElement('div');
    el.innerHTML = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '');
    return (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  },

  /** `**bold**`, `*italic*`, xuống dòng — cho nội dung lưu plain/markdown trong queue. */
  markdownToHtml(text) {
    const raw = String(text || '');
    if (!raw.trim()) return '';
    const lines = raw.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
      let s = this.escapeHtml(line);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
      // Chỉ `-` / `•` / số — giữ emoji đầu dòng (✅📦🌐) vì FB không render list HTML chuẩn
      if (/^[-•]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())) {
        out.push(`<li>${s.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '')}</li>`);
      } else if (s) {
        out.push(s);
      } else {
        out.push('');
      }
    }
    const html = [];
    let inList = false;
    for (const chunk of out) {
      if (chunk.startsWith('<li>')) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(chunk);
      } else {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        if (chunk) html.push(chunk);
        else html.push('<br>');
      }
    }
    if (inList) html.push('</ul>');
    return html.join('<br>').replace(/(<br>)+<ul>/g, '<ul>').replace(/<\/ul>(<br>)+/g, '</ul>');
  },

  UNICODE_BOLD: {
    A: '𝗔', B: '𝗕', C: '𝗖', D: '𝗗', E: '𝗘', F: '𝗙', G: '𝗚', H: '𝗛', I: '𝗜', J: '𝗝',
    K: '𝗞', L: '𝗟', M: '𝗠', N: '𝗡', O: '𝗢', P: '𝗣', Q: '𝗤', R: '𝗥', S: '𝗦', T: '𝗧',
    U: '𝗨', V: '𝗩', W: '𝗪', X: '𝗫', Y: '𝗬', Z: '𝗭',
    a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶', j: '𝗷',
    k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿', s: '𝘀', t: '𝘁',
    u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇',
    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵',
  },

  toUnicodeBold(inner) {
    const map = this.UNICODE_BOLD;
    return String(inner || '').split('').map((ch) => map[ch] || ch).join('');
  },

  markdownToUnicode(text) {
    return String(text || '')
      .replace(/\*\*([^*]+)\*\*/g, (_, inner) => this.toUnicodeBold(inner))
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  },

  stripMarkdown(text) {
    return String(text || '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  },

  hasMarkdown(text) {
    return /\*\*[^*]+\*\*|\*[^*]+\*/.test(String(text || ''));
  },

  /** Dòng cần paste: có emoji bất kỳ chỗ nào hoặc `**đậm**` — còn lại gõ. */
  lineHasEmoji(text) {
    return /\p{Extended_Pictographic}/u.test(String(text || ''));
  },

  hasAnyEmoji(text) {
    return this.lineHasEmoji(text);
  },

  needsPasteLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    if (this.hasMarkdown(trimmed)) return true;
    return this.lineHasEmoji(trimmed);
  },

  /** Gom dòng liên tiếp cùng mode paste/type cho Cổ điển hybrid. */
  splitHybridSegments(text) {
    const lines = String(text || '').split(/\r?\n/);
    const segments = [];
    let buf = [];
    let bufMode = null;

    const flush = () => {
      if (!buf.length) return;
      const joined = buf.join('\n');
      if (joined.trim()) segments.push({ mode: bufMode, text: joined });
      buf = [];
      bufMode = null;
    };

    for (const line of lines) {
      let mode;
      if (!String(line).trim()) {
        mode = bufMode || 'type';
      } else {
        mode = this.needsPasteLine(line) ? 'paste' : 'type';
      }
      if (bufMode && bufMode !== mode) flush();
      bufMode = mode;
      buf.push(line);
    }
    flush();
    return segments;
  },

  segmentPasteHtml(text) {
    return this.markdownToHtml(text);
  },

  prepareClassicPayload({ text, htmlFromDelta }) {
    const plain = String(text || '');
    const html = htmlFromDelta || this.markdownToHtml(plain);
    const unicode = this.markdownToUnicode(plain);
    const stripped = this.stripMarkdown(plain);
    return { plain, html, unicode, stripped, hasMd: this.hasMarkdown(plain) };
  },
};
})();

// ----- localProviders.js -----
(function () {
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
})();

// ----- localAi.js -----
(function () {
globalThis.GF = globalThis.GF || {};

globalThis.GF.localAi = {
  DEFAULT_TEXT_RULES: 'Viết bài Facebook bằng tiếng Việt, hấp dẫn, có emoji phù hợp.',
  DEFAULT_IMAGE_RULES: 'image_prompt: tiếng Anh, mô tả một khung hình cụ thể khớp nội dung bài; phong cách ảnh thật hoặc minh họa đẹp; không có chữ trên ảnh; bố cục vuông 1:1.',

  formatEndpoint(endpoint, model) {
    return String(endpoint || '').replace(/\{model\}/g, model || '');
  },

  async ensureFetchPermission(url) {
    if (!url || typeof chrome?.permissions?.request !== 'function') return;
    try {
      const { origin } = new URL(url);
      const pattern = `${origin}/*`;
      const known = [
        'https://api.openai.com/*',
        'https://api.anthropic.com/*',
        'https://generativelanguage.googleapis.com/*',
        'https://api.ideogram.ai/*',
        'https://tidien.xyz/*',
        'http://localhost/*',
      ];
      if (known.includes(pattern)) return;
      const has = await chrome.permissions.contains({ origins: [pattern] });
      if (!has) await chrome.permissions.request({ origins: [pattern] });
    } catch {
      // ignore malformed URL
    }
  },

  buildSystemPrompt({ textPrompt, imagePrompt, mediaMode }) {
    const parts = [];
    parts.push(`[QUY TẮC VIẾT BÀI]\n${textPrompt || this.DEFAULT_TEXT_RULES}`);
    if (mediaMode === 'image') {
      parts.push(`[SKILL ẢNH]\n${imagePrompt || this.DEFAULT_IMAGE_RULES}`);
      parts.push('Trả về CHỈ một JSON hợp lệ (không markdown): {"content":"...","image_prompt":"..."}');
    } else {
      parts.push('Trả về CHỈ một JSON hợp lệ (không markdown): {"content":"..."}');
    }
    return parts.join('\n\n');
  },

  parseGenerationResponse(raw, mediaMode) {
    const text = String(raw || '').trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { /* */ }
    }
    if (parsed?.content) {
      return {
        content: String(parsed.content).trim(),
        image_prompt: mediaMode === 'image' ? String(parsed.image_prompt || '').trim() : '',
        parse_failed: false,
      };
    }
    return { content: text, image_prompt: '', parse_failed: true };
  },

  async callText(provider, systemPrompt, userPrompt) {
    if (!provider?.api_key) throw new Error('Chưa cấu hình Text provider trong Cài đặt');
    const kind = provider.provider_kind || 'openai';
    const model = provider.model || (kind === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini');
    const endpoint = this.formatEndpoint(provider.api_endpoint, model);
    await this.ensureFetchPermission(endpoint);

    if (kind === 'claude') {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': provider.api_key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || data.error?.type || 'Claude thất bại');
      return data.content?.[0]?.text?.trim() || '';
    }

    if (kind === 'gemini') {
      const url = endpoint.includes('?') ? endpoint : `${endpoint}?key=${encodeURIComponent(provider.api_key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || 'Gemini thất bại');
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || data.error || 'AI text thất bại');
    return data.choices?.[0]?.message?.content?.trim() || '';
  },

  async callImage(provider, prompt) {
    if (!provider?.api_key) throw new Error('Chưa cấu hình Image provider trong Cài đặt');
    const endpoint = this.formatEndpoint(provider.api_endpoint, provider.model);
    await this.ensureFetchPermission(endpoint);
    const kind = provider.provider_kind || 'openai';

    if (kind === 'ideogram') {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Api-Key': provider.api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_request: { prompt, aspect_ratio: 'ASPECT_1_1', model: provider.model || 'V_2' },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Ideogram thất bại');
      const url = data.data?.[0]?.url;
      if (!url) throw new Error('Không nhận được URL ảnh');
      await this.ensureFetchPermission(url);
      const imgRes = await fetch(url);
      const buf = await imgRes.arrayBuffer();
      return { base64: btoa(String.fromCharCode(...new Uint8Array(buf))), mime: 'image/png' };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model || 'dall-e-3',
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

  async generatePost({ topic, textSystemPrompt, imageSystemPrompt, mediaType }) {
    const { textProvider } = await globalThis.GF.localProviders.getActiveProviders();
    const mode = mediaType === 'none' ? 'none' : 'image';
    const systemPrompt = this.buildSystemPrompt({
      textPrompt: textSystemPrompt,
      imagePrompt: imageSystemPrompt,
      mediaMode: mode,
    });
    const userPrompt = `Viết bài Facebook group về: ${topic}.`;
    const raw = await this.callText(textProvider, systemPrompt, userPrompt);
    const parsed = this.parseGenerationResponse(raw, mode);
    if (mode === 'image' && !parsed.image_prompt) {
      parsed.image_prompt = `Facebook post illustration about "${topic}". Square 1:1, warm lighting, no text overlay, photorealistic.`;
    }
    return {
      topic,
      content: parsed.content,
      image_prompt: parsed.image_prompt,
      parse_failed: parsed.parse_failed,
    };
  },
};
})();

// ----- postMedia.js -----
(function () {
globalThis.GF = globalThis.GF || {};
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
    const provider = (d.localProviders || []).find((p) => String(p.id) === String(d.activeImageLocalProviderId)) || null;
    return provider?.is_active !== false ? provider : null;
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
    const PMS = globalThis.GF?.postMediaStore;
    const d = await chrome.storage.local.get('postQueue');
    const queue = d.postQueue || [];
    const idx = queue.findIndex((p) => p.id === post.id);
    if (PMS) {
      if (PMS.hasPayload(post)) await PMS.save(post.id, post);
      const lite = PMS.stripForQueue(post);
      if (idx >= 0) queue[idx] = { ...queue[idx], ...lite };
      else queue.push(lite);
    } else if (idx >= 0) {
      queue[idx] = { ...queue[idx], ...post };
    } else {
      queue.push(post);
    }
    await chrome.storage.local.set({ postQueue: queue });
    return post;
  },

  async ensurePostMedia(post, settings) {
    if (!post) return post;
    if (post.imageBase64 || post.videoBase64 || post.images?.length) return post;
    if (!this.needsImageGeneration(post)) return post;

    post.imageStatus = 'generating';
    await this.persistPost(post);

    try {
      const img = await this.generateImage(String(post.prompt_anh).trim(), settings);
      this.applyImageToPost(post, img);
      await this.maybeSaveImageLocal(img.base64, `groupflow-${post.id}.png`, settings);
      await this.persistPost(post);
      return post;
    } catch (e) {
      // Không để imageStatus kẹt ở 'generating' mãi — post nhìn như đang chạy vô thời hạn dù
      // generateImage() đã lỗi từ lâu (thiếu provider/API key/network). Ghi rõ lỗi để card + Log
      // hiển thị được, rồi ném lại cho runPostMatrix() xử lý (đánh dấu bài 'failed', không lặp).
      post.imageStatus = 'error';
      post.imageError = e.message;
      await this.persistPost(post);
      throw e;
    }
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
})();

// ----- postMediaStore.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Lưu media bài đăng trong IndexedDB — tránh mất ảnh khi postQueue vượt quota chrome.storage.
 */
globalThis.GF = globalThis.GF || {};

const PMS_DB = 'groupflow-media';
const PMS_STORE = 'byPostId';
const PMS_VER = 1;

globalThis.GF.postMediaStore = {
  _db: null,
  _dbPromise: null,

  invalidate() {
    this._db = null;
    this._dbPromise = null;
  },

  isDbClosingError(err) {
    const msg = String(err?.message || err || '');
    return /closing|InvalidState|connection is closing|database connection/i.test(msg);
  },

  attachDbHandlers(db) {
    db.onclose = () => {
      this.invalidate();
    };
    db.onversionchange = () => {
      try {
        db.close();
      } catch { /* ignore */ }
      this.invalidate();
    };
  },

  async db() {
    if (this._db) {
      try {
        if (this._db.objectStoreNames?.contains?.(PMS_STORE)) return this._db;
      } catch {
        this.invalidate();
      }
    }
    if (!this._dbPromise) {
      this._dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(PMS_DB, PMS_VER);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(PMS_STORE)) {
            req.result.createObjectStore(PMS_STORE);
          }
        };
        req.onsuccess = () => {
          this._db = req.result;
          this.attachDbHandlers(this._db);
          resolve(this._db);
        };
        req.onerror = () => {
          this.invalidate();
          reject(req.error || new Error('IndexedDB open failed'));
        };
        req.onblocked = () => {
          this.invalidate();
          reject(new Error('IndexedDB blocked'));
        };
      });
    }
    try {
      return await this._dbPromise;
    } catch (e) {
      this.invalidate();
      throw e;
    }
  },

  async runTx(mode, fn, retries = 2) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const db = await this.db();
        return await new Promise((resolve, reject) => {
          let tx;
          try {
            tx = db.transaction(PMS_STORE, mode);
          } catch (e) {
            reject(e);
            return;
          }
          const store = tx.objectStore(PMS_STORE);
          let output;
          tx.oncomplete = () => resolve(output);
          tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
          tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
          Promise.resolve(fn(store))
            .then((val) => {
              output = val;
            })
            .catch((e) => {
              try {
                tx.abort();
              } catch { /* ignore */ }
              reject(e);
            });
        });
      } catch (e) {
        lastErr = e;
        if (attempt < retries && this.isDbClosingError(e)) {
          this.invalidate();
          await new Promise((r) => setTimeout(r, 60 + attempt * 80));
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('IndexedDB transaction failed');
  },

  hasPayload(post) {
    if (!post) return false;
    if (post.videoBase64) return true;
    if (post.imageBase64) return true;
    const imgs = post.images?.length ? post.images : [];
    return imgs.some((img) => img?.base64);
  },

  pack(post) {
    if (!this.hasPayload(post)) return null;
    return {
      imageBase64: post.imageBase64 || null,
      videoBase64: post.videoBase64 || null,
      images: post.images?.length
        ? post.images.filter((img) => img?.base64).map((img) => ({ ...img }))
        : null,
      mediaType: post.mediaType || null,
      mediaMime: post.mediaMime || null,
      imageStatus: post.imageStatus || null,
    };
  },

  applyPack(post, pack) {
    if (!post || !pack) return post;
    if (pack.videoBase64) {
      post.videoBase64 = pack.videoBase64;
      post.mediaType = pack.mediaType || 'video';
      post.mediaMime = pack.mediaMime || 'video/mp4';
      post.imageStatus = pack.imageStatus || 'ready';
      post.imageBase64 = null;
      post.images = null;
      return post;
    }
    if (pack.images?.length) {
      post.images = pack.images.map((img) => ({ ...img }));
      post.imageBase64 = pack.imageBase64 || post.images[0]?.base64 || null;
      post.mediaType = 'image';
      post.mediaMime = pack.mediaMime || post.images[0]?.mime || 'image/png';
      post.imageStatus = pack.imageStatus || 'ready';
      post.videoBase64 = null;
      return post;
    }
    if (pack.imageBase64) {
      post.imageBase64 = pack.imageBase64;
      post.mediaType = pack.mediaType || 'image';
      post.mediaMime = pack.mediaMime || 'image/png';
      post.imageStatus = pack.imageStatus || 'ready';
    }
    return post;
  },

  async save(postId, post) {
    if (!postId) return;
    const pack = this.pack(post);
    if (!pack) {
      await this.delete(postId);
      return;
    }
    await this.runTx('readwrite', (store) => {
      store.put(pack, String(postId));
    });
  },

  async load(postId) {
    if (!postId) return null;
    return this.runTx('readonly', (store) => new Promise((resolve, reject) => {
      const req = store.get(String(postId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    }));
  },

  async delete(postId) {
    if (!postId) return;
    await this.runTx('readwrite', (store) => {
      store.delete(String(postId));
    });
  },

  stripForQueue(post) {
    const lite = { ...post };
    const cached = this.hasPayload(post);
    lite.mediaCached = cached;
    delete lite.imageBase64;
    delete lite.videoBase64;
    delete lite.images;
    delete lite._gfMediaBackup;
    if (!cached) lite.mediaCached = false;
    return lite;
  },

  async hydratePost(post) {
    if (!post?.id) return post;
    if (this.hasPayload(post)) {
      try {
        await this.save(post.id, post);
      } catch (e) {
        if (!this.isDbClosingError(e)) console.warn('[GroupFlow] IDB save', e.message);
      }
      return post;
    }
    try {
      const pack = await this.load(post.id);
      if (pack) this.applyPack(post, pack);
    } catch (e) {
      if (!this.isDbClosingError(e)) console.warn('[GroupFlow] IDB load', e.message);
    }
    return post;
  },

  async hydratePosts(posts) {
    const list = posts || [];
    for (const p of list) {
      if (p.mediaCached || p.mediaType || p.imageStatus === 'ready') {
        await this.hydratePost(p);
      }
    }
    return list;
  },

  async persistAll(posts) {
    for (const p of posts || []) {
      try {
        if (this.hasPayload(p)) {
          await this.save(p.id, p);
        } else if (!p.mediaCached) {
          await this.delete(p.id);
        }
      } catch (e) {
        if (!this.isDbClosingError(e)) console.warn('[GroupFlow] IDB persist', p.id, e.message);
      }
    }
  },
};
})();

// ----- groupParse.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Parse danh sách nhóm đã tham gia từ HTML/GraphQL FB — chạy được cả service worker lẫn content script.
 */
const GP = globalThis.GF.groupParse = {
  ABOUT_QUERY_NAMES: [
    'GroupsCometAboutQuery',
    'CometGroupAboutRootQuery',
    'GroupsCometGroupAboutContainerQuery',
    'GroupsCometAboutTabQuery',
    'GroupsCometGroupAboutRootQuery',
    'useGroupsCometAboutQuery',
  ],

  findDocIdsInHtml(html, names) {
    const out = {};
    const h = String(html || '');
    (names || []).forEach((name) => {
      const patterns = [
        new RegExp(`"fb_api_req_friendly_name":"${name}"[\\s\\S]{0,900}?"doc_id":"(\\d+)"`),
        new RegExp(`"doc_id":"(\\d+)"[\\s\\S]{0,900}?"fb_api_req_friendly_name":"${name}"`),
      ];
      for (const re of patterns) {
        const m = h.match(re);
        if (m) {
          out[name] = m[1];
          break;
        }
      }
    });
    return out;
  },

  findAboutDocIdsInHtml(html) {
    const found = this.findDocIdsInHtml(html, this.ABOUT_QUERY_NAMES);
    const h = String(html || '');
    const re = /"fb_api_req_friendly_name":"([^"]*About[^"]*)"[\s\S]{0,900}?"doc_id":"(\d+)"/g;
    let m;
    while ((m = re.exec(h)) !== null) {
      found[m[1]] = m[2];
    }
    return found;
  },

  parseVietnameseLabels(text) {
    const t = String(text || '');
    let privacy = 'UNKNOWN';
    if (/Nh[oô]m\s+k[ií]n|nhom\s+kin|GROUP_PRIVACY_SECRET/i.test(t)) privacy = 'SECRET';
    else if (/Nh[oô]m\s+[đd][óo]ng|nhom\s+dong|GROUP_PRIVACY_CLOSED/i.test(t)) privacy = 'CLOSED';
    else if (/Nh[oô]m\s+c[oô]ng\s+khai|nhom\s+cong\s+khai|GROUP_PRIVACY_OPEN/i.test(t)) privacy = 'OPEN';

    let post_approval = 'unknown';
    if (/if_viewer_can_post_without_admin_approval":true/i.test(t)) post_approval = 'none';
    else if (/if_viewer_can_post_without_admin_approval":false/i.test(t)) post_approval = 'required';
    else if (/kh[oô]ng\s+cần\s+phê\s+duyệt|khong\s+can\s+phe\s+duyet|đăng\s+ngay|dang\s+ngay/i.test(t)) post_approval = 'none';
    else if (/chờ\s+phê\s+duyệt|cho\s+phe\s+duyet|chờ\s+duyệt|bài\s+viết.*phê\s+duyệt/i.test(t)) post_approval = 'required';

    return {
      privacy,
      post_approval,
      requires_approval: post_approval === 'required',
    };
  },

  normalizeInvitePermission(node, raw) {
    const text = String(raw || '');
    const v = node?.viewer_can_invite_to_group
      ?? node?.can_viewer_invite_to_group
      ?? node?.if_viewer_can_invite_to_group
      ?? node?.viewer_can_invite
      ?? node?.can_invite
      ?? node?.can_invite_friends
      ?? node?.group_invite_permission;

    if (v === true) return 'can';
    if (v === false) return 'cannot';

    // GraphQL-ish booleans
    if (/"(?:viewer_can_invite_to_group|can_viewer_invite_to_group|if_viewer_can_invite_to_group|viewer_can_invite|can_invite_friends)"\s*:\s*true/i.test(text)) {
      return 'can';
    }
    if (/"(?:viewer_can_invite_to_group|can_viewer_invite_to_group|if_viewer_can_invite_to_group|viewer_can_invite|can_invite_friends)"\s*:\s*false/i.test(text)) {
      return 'cannot';
    }

    // UI text heuristics (vi/en)
    const hasInvite = /(Mời\s+bạn|Mời\s+bè|Mời\s+thành\s+viên|Invite\s+friends|Invite\s+people|Invite\s+members)/i.test(text);
    const blocked = /(Bạn\s+không\s+thể\s+mời|không\s+thể\s+mời|Only\s+admins?\s+can\s+invite|You\s+can't\s+invite|invite\s+disabled)/i.test(text);
    if (hasInvite && !blocked) return 'can';
    if (blocked) return 'cannot';
    return 'unknown';
  },

  normalizeJoinRole(node, raw) {
    const text = String(raw || '');

    const explicit = node?.viewer_join_state
      || node?.viewer_join_state_v2
      || node?.viewer_group_role
      || node?.viewer_role;
    if (explicit) return String(explicit).toUpperCase();

    // Common boolean flags used across various group payloads.
    const isOwner = node?.viewer_is_owner === true || /"viewer_is_owner"\s*:\s*true/i.test(text);
    const isAdmin = node?.viewer_is_admin === true
      || node?.viewer_is_group_admin === true
      || node?.can_viewer_manage_group === true
      || /"(viewer_is_admin|viewer_is_group_admin|can_viewer_manage_group)"\s*:\s*true/i.test(text);
    const isMod = node?.viewer_is_moderator === true
      || node?.viewer_is_group_moderator === true
      || /"(viewer_is_moderator|viewer_is_group_moderator)"\s*:\s*true/i.test(text);

    if (isOwner) return 'OWNER';
    if (isAdmin) return 'ADMIN';
    if (isMod) return 'MODERATOR';

    // Enum-like strings
    if (/"admin_type"\s*:\s*"(OWNER|ADMIN|MODERATOR)"/i.test(text)) {
      return text.match(/"admin_type"\s*:\s*"(OWNER|ADMIN|MODERATOR)"/i)?.[1]?.toUpperCase() || null;
    }
    if (/"viewer_join_state"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i.test(text)) {
      return text.match(/"viewer_join_state"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i)?.[1]?.toUpperCase() || null;
    }
    if (/"role"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i.test(text)) {
      return text.match(/"role"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i)?.[1]?.toUpperCase() || null;
    }

    // Fallback: if payload contains admin tools keywords, don't guess Admin (too risky) — return null.
    return null;
  },

  parseGroupMetaFromGraphqlJson(json, groupId) {
    const targetId = String(groupId);
    let best = { privacy: 'UNKNOWN', post_approval: 'unknown', requires_approval: false };
    const seen = new Set();

    const walk = (node, depth) => {
      if (!node || depth > 24 || typeof node !== 'object') return;
      if (seen.has(node)) return;
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
        return;
      }
      seen.add(node);

      const nodeId = node.id || node.group_id || node.groupID;
      const hasMeta = node.privacy_info
        || node.if_viewer_can_post_without_admin_approval != null
        || node.viewer_can_post_without_admin_approval != null
        || node.viewer_join_state != null
        || node.viewer_is_admin != null
        || node.viewer_is_moderator != null
        || node.can_viewer_manage_group != null
        || node.group_privacy
        || node.privacy;

      if (hasMeta && (!nodeId || String(nodeId) === targetId)) {
        const meta = this.parseGroupMeta(node, JSON.stringify(node));
        best = this.mergeGroupMeta(best, meta);
      }

      Object.values(node).forEach((v) => walk(v, depth + 1));
    };

    walk(json, 0);
    return best;
  },

  scanHtmlForGroupMeta(html, groupId) {
    const id = String(groupId);
    const markers = [`"id":"${id}"`, `"group_id":"${id}"`, `/groups/${id}/`, `/groups/${id}"`];
    let best = { privacy: 'UNKNOWN', post_approval: 'unknown', requires_approval: false };

    for (const marker of markers) {
      let from = 0;
      while (from < html.length) {
        const idx = html.indexOf(marker, from);
        if (idx < 0) break;
        const chunk = html.slice(Math.max(0, idx - 4000), idx + 10000);
        best = this.mergeGroupMeta(best, this.parseVietnameseLabels(chunk));
        best = this.mergeGroupMeta(best, this.parseGroupMeta(null, chunk));
        from = idx + marker.length;
        if (best.privacy !== 'UNKNOWN' && best.post_approval !== 'unknown') break;
      }
      if (best.privacy !== 'UNKNOWN' && best.post_approval !== 'unknown') break;
    }

    const privRe = /"privacy_info"\s*:\s*\{[\s\S]{0,800}?\}/g;
    let m;
    while ((m = privRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 1200), m.index + 2500);
      if (!slice.includes(id) && !slice.includes(`/groups/${id}`)) continue;
      best = this.mergeGroupMeta(best, this.parseGroupMeta(null, slice));
    }

    return best;
  },

  decodeFbStr(s) {
    return String(s || '')
      .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  },

  isGenericGroupName(name) {
    return /^(group|nhóm|groups|facebook|xem thêm|see more)$/i.test(String(name || '').trim());
  },

  isFallbackGroupName(name) {
    return /^Group \d{5,}$/.test(String(name || '').trim());
  },

  isJoinedGroupChunk(chunk, { onJoinsPage = true, relaxed = false } = {}) {
    const c = String(chunk).slice(0, 2500);
    if (relaxed && onJoinsPage) {
      if (/viewer_join_state":"NOT_MEMBER"|"is_viewer_member":false/i.test(c)
        && !/viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true/i.test(c)) {
        return false;
      }
      if (/GROUP_SUGGESTION|SUGGESTED_GROUP|recommended_groups|GroupsCometDiscover/i.test(c)) {
        return false;
      }
      return true;
    }
    if (/viewer_join_state":"NOT_MEMBER"|"is_viewer_member":false|GROUP_SUGGESTION|SUGGESTED_GROUP|recommended_groups|GroupsCometDiscover/i.test(c)) {
      return /viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true/i.test(c);
    }
    if (/viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true|has_membership":true/i.test(c)) {
      return true;
    }
    if (onJoinsPage) {
      return !/pending_invite|GROUP_INVITE|SUGGESTED|recommended/i.test(c);
    }
    return false;
  },

  normalizePrivacy(node, raw) {
    const title = String(node?.privacy_info?.title || node?.privacy_info?.subtitle || '').toUpperCase();
    const value = String(
      node?.privacy_info?.value
      || node?.visibility
      || node?.group_privacy
      || node?.privacy
      || '',
    ).toUpperCase();
    const text = `${title} ${value} ${raw}`.toUpperCase();

    if (/SECRET|NH[OÔ]M_K[IÍ]N|NHOM_KIN|PRIVATE_GROUP|GROUP_PRIVACY_SECRET|"SECRET"/.test(text)) {
      return 'SECRET';
    }
    if (/CLOSED|NH[OÔ]M_[ĐD][ÓO]NG|NHOM_DONG|"CLOSED"/.test(text)) {
      return 'CLOSED';
    }
    if (/OPEN|PUBLIC|NH[OÔ]M_C[OÔ]NG_KHAI|NHOM_CONG_KHAI|"OPEN"/.test(text)) {
      return 'OPEN';
    }
    return 'UNKNOWN';
  },

  normalizePostApproval(node, raw) {
    const text = String(raw || '');
    const canPostDirect = node?.if_viewer_can_post_without_admin_approval === true
      || node?.viewer_can_post_without_admin_approval === true
      || /if_viewer_can_post_without_admin_approval":true/i.test(text)
      || /viewer_can_post_without_admin_approval":true/i.test(text)
      || /can_post_without_admin_approval":true/i.test(text);

    const mustApprove = node?.if_viewer_can_post_without_admin_approval === false
      || node?.viewer_can_post_without_admin_approval === false
      || node?.post_permissions?.requires_admin_approval === true
      || node?.admin_approval_required === true
      || /if_viewer_can_post_without_admin_approval":false/i.test(text)
      || /requires_admin_approval":true/i.test(text)
      || /post_requires_admin_approval":true/i.test(text)
      || /approve_all_member_posts":true/i.test(text);

    if (canPostDirect && !mustApprove) return 'none';
    if (mustApprove) return 'required';
    // Soft heuristics (avoid false positives from unrelated "pending_*" blobs)
    if (/(pending_posts|pending_content|posts_must_be_approved)/i.test(text)
      && !/(without\s+admin\s+approval|kh[oô]ng\s+cần\s+phê\s+duyệt|khong\s+can\s+phe\s+duyet)/i.test(text)) {
      return 'required';
    }
    if (/phê duyệt|phe duyet|chờ duyệt|cho duyet|admin approval|pending approval/i.test(text)
      && !/không cần phê duyệt|khong can phe duyet|without admin approval/i.test(text)) {
      return 'required';
    }
    if (/đăng ngay|dang ngay|post without|without approval/i.test(text)) return 'none';
    return 'unknown';
  },

  parseGroupMeta(node, chunkText) {
    const raw = chunkText || JSON.stringify(node || {});
    const privacy = this.normalizePrivacy(node, raw);
    const post_approval = this.normalizePostApproval(node, raw);
    const invite_permission = this.normalizeInvitePermission(node, raw);
    const joinRole = this.normalizeJoinRole(node, raw);
    return {
      privacy,
      join_role: joinRole,
      post_approval,
      requires_approval: post_approval === 'required',
      invite_permission,
    };
  },

  parseGroupMetaFromPage(html, groupId) {
    let best = this.scanHtmlForGroupMeta(html, groupId);
    if (best.privacy === 'UNKNOWN' && best.post_approval === 'unknown') {
      best = this.mergeGroupMeta(best, this.parseVietnameseLabels(String(html).slice(0, 500000)));
    }
    return best;
  },

  mergeGroupMeta(base = {}, incoming = {}) {
    const out = { ...base, ...incoming };
    if (base.privacy && base.privacy !== 'UNKNOWN' && incoming.privacy === 'UNKNOWN') {
      out.privacy = base.privacy;
    }
    if (base.post_approval && base.post_approval !== 'unknown' && incoming.post_approval === 'unknown') {
      out.post_approval = base.post_approval;
      out.requires_approval = base.post_approval === 'required';
    }
    if (incoming.privacy && incoming.privacy !== 'UNKNOWN') out.privacy = incoming.privacy;
    if (incoming.post_approval && incoming.post_approval !== 'unknown') {
      out.post_approval = incoming.post_approval;
      out.requires_approval = incoming.post_approval === 'required';
    }
    if (incoming.invite_permission && incoming.invite_permission !== 'unknown') {
      out.invite_permission = incoming.invite_permission;
    } else if (base.invite_permission && base.invite_permission !== 'unknown' && incoming.invite_permission === 'unknown') {
      out.invite_permission = base.invite_permission;
    }
    if (incoming.join_role) out.join_role = incoming.join_role;
    if (base.meta_source === 'post_learned' && base.post_approval && base.post_approval !== 'unknown' && incoming.post_approval === 'unknown') {
      out.post_approval = base.post_approval;
      out.requires_approval = base.requires_approval;
      out.meta_source = base.meta_source;
    }
    return out;
  },

  mergeGroupEntry(a, b) {
    if (!a) return b;
    if (!b) return a;
    const merged = {
      ...a,
      ...b,
      name: (!this.isFallbackGroupName(b.name) && this.isFallbackGroupName(a.name)) ? b.name : a.name,
      ...this.mergeGroupMeta(a, b),
    };
    if (a.meta_source === 'post_learned' && b.post_approval === 'unknown') {
      merged.post_approval = a.post_approval;
      merged.requires_approval = a.requires_approval;
      merged.meta_source = a.meta_source;
      merged.meta_learned_at = a.meta_learned_at || b.meta_learned_at;
    }
    return merged;
  },

  upsert(map, id, name, meta = {}) {
    if (!id || !/^\d{5,}$/.test(String(id))) return;
    const n = String(name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    const gid = String(id);
    const entry = {
      id: gid,
      name: n,
      href: `https://www.facebook.com/groups/${gid}/`,
      privacy: meta.privacy || 'UNKNOWN',
      join_role: meta.join_role || null,
      post_approval: meta.post_approval || 'unknown',
      requires_approval: meta.post_approval === 'required' || Boolean(meta.requires_approval),
      invite_permission: meta.invite_permission || 'unknown',
    };
    const existing = map.get(gid);
    if (!existing) {
      map.set(gid, entry);
      return;
    }
    const merged = this.mergeGroupEntry(existing, entry);
    if (!this.isFallbackGroupName(n) && (this.isFallbackGroupName(existing.name) || n.length > existing.name.length)) {
      merged.name = n;
    }
    map.set(gid, merged);
  },

  parseJoinedGroupsFromHtml(html, { onJoinsPage = true, relaxed = false } = {}) {
    const map = new Map();
    if (!html || html.length < 200) return [];

    const joinedOnly = true;
    const chunkOpts = { onJoinsPage, relaxed };
    const typeNames = ['"__typename":"Group"', '"__typename":"XFBGroup"'];
    typeNames.forEach((marker) => {
      const chunks = html.split(marker);
      for (let i = 1; i < chunks.length; i += 1) {
        const chunk = chunks[i].slice(0, 2800);
        if (joinedOnly && !this.isJoinedGroupChunk(chunk, chunkOpts)) continue;
        const idM = chunk.match(/"id":"(\d+)"/);
        const nameM = chunk.match(/"name":"((?:[^"\\]|\\.)*)"/);
        if (idM && nameM) {
          const meta = this.parseGroupMeta(null, chunk);
          this.upsert(map, idM[1], this.decodeFbStr(nameM[1]), meta);
        }
      }
    });

    const urlNameRe = /"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)[^"]*"[\s\S]{0,500}?"name":"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = urlNameRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, chunkOpts)) continue;
      this.upsert(map, m[1], this.decodeFbStr(m[2]), this.parseGroupMeta(null, slice));
    }

    const nameUrlRe = /"name":"((?:[^"\\]|\\.)*)"[\s\S]{0,500}?"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)/g;
    while ((m = nameUrlRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, chunkOpts)) continue;
      this.upsert(map, m[2], this.decodeFbStr(m[1]), this.parseGroupMeta(null, slice));
    }

    const nodeRe = /"node"\s*:\s*\{[^}]*"__typename":"(?:Group|XFBGroup)"[^}]*"id":"(\d+)"[^}]*"name":"((?:[^"\\]|\\.)*)"/g;
    let nm;
    while ((nm = nodeRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, nm.index - 400), nm.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, chunkOpts)) continue;
      this.upsert(map, nm[1], this.decodeFbStr(nm[2]), this.parseGroupMeta(null, slice));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  parseJoinedGroupsFromText(text, { onJoinsPage = true } = {}) {
    if (!text || text.length < 80) return [];
    if (!/GroupsCometJoins|GroupsCometYourGroups|groups_tab_list|joined.*groups|your_groups|__typename":"Group"/i.test(text)) {
      return [];
    }
    return this.parseJoinedGroupsFromHtml(text, { onJoinsPage });
  },
};
})();

// ----- groupMetaStore.js -----
(function () {
globalThis.GF = globalThis.GF || {};
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
})();

// ----- fbSessionBg.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Session Facebook + GraphQL từ service worker (cookie Chrome, không cần tab FB).
 */
const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';

const S = globalThis.GF.fbSessionBg = {
  _cacheByActor: new Map(),
  _lastCacheKey: null,
  _webSessionId: null,
  _ajaxIdentityLoaded: false,
  CACHE_MS: 5 * 60 * 1000,
  reqCounter: 1,

  freshWebSessionId() {
    const seg = () => Math.floor(Math.random() * (36 ** 6)).toString(36).padStart(6, '0');
    return `${seg()}:${seg()}:${seg()}`;
  },

  // MV3 service worker bị Chrome tắt sau ~30s không hoạt động — trong khi giãn cách giữa các
  // nhóm (Settings) thường dài hơn thế nhiều, nên hầu như MỖI LẦN đăng nhóm tiếp theo, SW đã bị
  // khởi động lại từ đầu, xoá sạch _webSessionId/reqCounter trong bộ nhớ. Kết quả: mỗi request
  // đều mang __s (session id ajax) mới tinh + __req luôn về lại 1 — không giống hành vi trình
  // duyệt thật (nơi __s sống suốt cả phiên duyệt), dễ bị Facebook nghi ngờ (lỗi 1357004 chung
  // chung). Lưu 2 giá trị này vào chrome.storage.local để sống sót qua các lần SW khởi động lại.
  async ensureAjaxIdentity() {
    if (this._ajaxIdentityLoaded) return;
    this._ajaxIdentityLoaded = true;
    try {
      const d = await chrome.storage.local.get(['gfWebSessionId', 'gfReqCounter']);
      if (d.gfWebSessionId) {
        this._webSessionId = d.gfWebSessionId;
        this.reqCounter = Number(d.gfReqCounter) || 1;
      } else {
        this._webSessionId = this.freshWebSessionId();
        chrome.storage.local.set({ gfWebSessionId: this._webSessionId, gfReqCounter: this.reqCounter }).catch(() => {});
      }
    } catch {
      if (!this._webSessionId) this._webSessionId = this.freshWebSessionId();
    }
  },

  nextReq() {
    const val = this.reqCounter++;
    chrome.storage.local.set({ gfReqCounter: this.reqCounter }).catch(() => {});
    return val;
  },

  async hasFbLogin() {
    try {
      const c = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
      return Boolean(c?.value);
    } catch {
      return false;
    }
  },

  stripFbJsonPrefix(text) {
    const raw = String(text || '').trim();
    if (raw.startsWith('for (;;);')) return raw.slice(9);
    return raw;
  },

  parseAllGraphqlJson(text) {
    const cleaned = this.stripFbJsonPrefix(text);
    const chunks = [];
    for (const line of cleaned.split('\n').filter(Boolean)) {
      try {
        chunks.push(JSON.parse(line));
      } catch {
        /* bỏ qua dòng không phải JSON */
      }
    }
    if (!chunks.length) {
      try {
        chunks.push(JSON.parse(cleaned));
      } catch {
        /* ignore */
      }
    }
    return chunks;
  },

  pickGraphqlPayload(chunks) {
    for (const j of chunks || []) {
      if (j?.data?.story_create) return j;
      if (j?.data?.createGroupPost) return j;
    }
    return chunks?.[0] || {};
  },

  parseGraphqlJson(text) {
    const chunks = this.parseAllGraphqlJson(text);
    for (const json of chunks) {
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message || 'GraphQL lỗi');
      }
    }
    return this.pickGraphqlPayload(chunks);
  },

  // jazoest là checksum của CHÍNH fb_dtsg (tổng mã ký tự, tiền tố "2") — Facebook dùng để phát
  // hiện request giả mạo/dtsg không khớp. Trước đây hardcode cứng '25669' bất kể dtsg thật là gì
  // → dtsg mới lấy được nhưng jazoest cũ không khớp → FB trả lỗi chung chung (vd error 1357004
  // "Vui lòng thử đóng và mở lại cửa sổ trình duyệt") thay vì lỗi rõ ràng, rất khó đoán nguyên nhân.
  computeJazoest(dtsg) {
    if (!dtsg) return null;
    let sum = 0;
    for (let i = 0; i < dtsg.length; i += 1) sum += dtsg.charCodeAt(i);
    return `2${sum}`;
  },

  parseSessionFromHtml(html) {
    const h = String(html || '');
    const uid = h.match(/"USER_ID":"(\d+)"/)?.[1]
      || h.match(/"userID":"(\d+)"/)?.[1]
      || null;
    const dtsg = h.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1]
      || h.match(/"DTSGInitialData",\{"token":"([^"]+)"/)?.[1]
      || h.match(/"dtsg":\{"token":"([^"]+)"/)?.[1]
      || null;
    const lsd = h.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1]
      || h.match(/"lsd":"([^"]+)"/)?.[1]
      || null;
    const jazoest = h.match(/name="jazoest"\s+value="([^"]+)"/)?.[1]
      || h.match(/"jazoest":"([^"]+)"/)?.[1]
      || this.computeJazoest(dtsg)
      || '25669';
    return {
      uid,
      personalId: uid,
      dtsg,
      lsd,
      jazoest,
      rev: h.match(/"client_revision":(\d+)/)?.[1] || '1007600000',
      hs: h.match(/"haste_session":"([^"]+)"/)?.[1] || null,
      spin_r: h.match(/"__spin_r":(\d+)/)?.[1] || null,
      spin_b: h.match(/"__spin_b":"([^"]+)"/)?.[1] || null,
      spin_t: h.match(/"__spin_t":(\d+)/)?.[1] || null,
    };
  },

  isLoginPage(html) {
    const h = String(html || '');
    if (h.includes('"USER_ID"') && !h.includes('id="login_form"')) return false;
    return /id="login_form"|href="\/login\/|Log in to Facebook|Đăng nhập Facebook/i.test(h);
  },

  isCheckpoint(html, url) {
    const h = String(html || '');
    return String(url || '').includes('/checkpoint/') || h.includes('action="/checkpoint/"');
  },

  async readActorCookies(preferredActorId) {
    const cUser = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
    const iUser = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'i_user' });
    const personalId = cUser?.value || null;
    const actingId = iUser?.value || null;
    const actorId = preferredActorId || actingId || personalId;
    return { personalId, actingId, actorId };
  },

  async fetchAuthHtml() {
    const urls = ['https://www.facebook.com/me', 'https://www.facebook.com/settings'];
    const headers = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    };
    let lastErr;
    for (const url of urls) {
      try {
        const res = await this.fetchWithRetry(url, { credentials: 'include', redirect: 'follow', headers });
        const html = await res.text();
        if (this.isCheckpoint(html, res.url)) {
          throw new Error('Facebook checkpoint — mở facebook.com xác minh tài khoản');
        }
        if (this.isLoginPage(html)) {
          throw new Error('Chưa đăng nhập Facebook trên Chrome');
        }
        if (res.ok && html.length > 500) return html;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Không lấy được session Facebook');
  },

  async resolveSession({ force = false, actorId: preferredActorId, groupId } = {}) {
    await this.ensureAjaxIdentity();
    const cacheKey = preferredActorId ? String(preferredActorId) : '__default__';
    const cached = this._cacheByActor.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < this.CACHE_MS) {
      console.info('[GroupFlow] session debug (from cache):', {
        hasDtsg: Boolean(cached.session.dtsg),
        hasLsd: Boolean(cached.session.lsd),
        jazoest: cached.session.jazoest,
        rev: cached.session.rev,
        hs: cached.session.hs,
        spin_r: cached.session.spin_r,
        spin_b: cached.session.spin_b,
        spin_t: cached.session.spin_t,
      });
      return { ...cached.session };
    }
    if (!(await this.hasFbLogin())) {
      throw new Error('Chưa đăng nhập Facebook trên Chrome');
    }
    let html = await this.fetchAuthHtml();
    if (groupId) {
      try {
        const groupUrl = `https://www.facebook.com/groups/${groupId}`;
        const res = await this.fetchWithRetry(groupUrl, {
          credentials: 'include',
          redirect: 'follow',
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: 'https://www.facebook.com/',
          },
        });
        const groupHtml = await res.text();
        if (groupHtml.length > 500 && !this.isLoginPage(groupHtml)) {
          html = groupHtml;
          this._warmupTokens = globalThis.GF?.fbCometTokens?.parseFromHtml?.(groupHtml) || null;
        }
      } catch { /* giữ html /settings */ }
    }
    const parsed = this.parseSessionFromHtml(html);
    const cookies = await this.readActorCookies(preferredActorId);
    const uid = parsed.uid || cookies.personalId;
    const actorId = preferredActorId || cookies.actorId || uid;
    if (!uid || !parsed.dtsg) {
      throw new Error('Thiếu token FB (fb_dtsg) — mở facebook.com một lần');
    }
    const session = {
      ...parsed,
      uid,
      personalId: cookies.personalId || uid,
      actorId: String(actorId),
      userId: String(actorId),
      fb_dtsg: parsed.dtsg,
    };
    // Log chẩn đoán tạm — error 1357004 chung chung của FB thường do thiếu/lỗi __rev, __hs,
    // __spin_r/b/t (tham số "phiên bản build" FB dùng để chặn client cũ), không phải do dtsg/lsd.
    // Không log dtsg/lsd thật (nhạy cảm) — chỉ log CÓ lấy được hay không + giá trị rev/hs/spin.
    console.info('[GroupFlow] session debug:', {
      hasDtsg: Boolean(parsed.dtsg),
      hasLsd: Boolean(parsed.lsd),
      jazoest: session.jazoest,
      rev: session.rev,
      hs: session.hs,
      spin_r: session.spin_r,
      spin_b: session.spin_b,
      spin_t: session.spin_t,
    });
    this._cacheByActor.set(cacheKey, { session: { ...session }, at: Date.now() });
    this._lastCacheKey = cacheKey;
    return session;
  },

  invalidateCache() {
    this._cacheByActor.clear();
    this._lastCacheKey = null;
  },

  async buildGraphqlBody(session, friendlyName, docId, variables) {
    const apiUser = session.personalId || session.uid;
    const body = new URLSearchParams();
    body.set('av', session.actorId || session.uid);
    body.set('__user', apiUser);
    body.set('__a', '1');
    body.set('__comet_req', '15');
    body.set('__req', this.nextReq().toString(36));
    body.set('__ccg', 'EXCELLENT');
    body.set('dpr', '1');
    if (!this._webSessionId) this._webSessionId = this.freshWebSessionId();
    body.set('__s', this._webSessionId);
    if (session.rev) body.set('__rev', session.rev);
    if (session.hs) body.set('__hs', session.hs);
    body.set('fb_dtsg', session.dtsg || session.fb_dtsg);
    if (session.lsd) body.set('lsd', session.lsd);
    body.set('jazoest', session.jazoest || '25669');
    if (session.spin_r) body.set('__spin_r', session.spin_r);
    if (session.spin_b) body.set('__spin_b', session.spin_b);
    if (session.spin_t) body.set('__spin_t', session.spin_t);
    body.set('fb_api_caller_class', 'RelayModern');
    body.set('fb_api_req_friendly_name', friendlyName);
    body.set('variables', JSON.stringify(variables));
    body.set('doc_id', docId);
    body.set('server_timestamps', 'true');
    await globalThis.GF?.fbCometTokens?.applyToSearchParams?.(body, session, this._warmupTokens);
    return body;
  },

  graphqlHeaders(session, friendlyName, referer = 'https://www.facebook.com/') {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-ASBD-ID': '129477',
      'X-FB-Friendly-Name': friendlyName,
      Origin: 'https://www.facebook.com',
      Referer: referer,
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;
    return headers;
  },

  /** Query string upload ảnh — khớp GPP worker (Comet). */
  async buildUploadQueryParams(session) {
    const apiUser = session.uid || session.personalId;
    const params = new URLSearchParams();
    params.set('av', session.actorId || session.uid);
    params.set('__user', apiUser);
    params.set('__a', '1');
    params.set('__comet_req', '15');
    params.set('__req', this.nextReq().toString(36));
    params.set('__ccg', 'EXCELLENT');
    params.set('dpr', '1');
    if (!this._webSessionId) this._webSessionId = this.freshWebSessionId();
    params.set('__s', this._webSessionId);
    if (session.rev) params.set('__rev', session.rev);
    params.set('fb_dtsg', session.dtsg || session.fb_dtsg);
    if (session.lsd) params.set('lsd', session.lsd);
    params.set('jazoest', session.jazoest || '25669');
    if (session.spin_r) params.set('__spin_r', session.spin_r);
    if (session.spin_b) params.set('__spin_b', session.spin_b);
    if (session.spin_t) params.set('__spin_t', session.spin_t);
    params.set('fb_api_caller_class', 'RelayModern');
    params.set('server_timestamps', 'true');
    await globalThis.GF?.fbCometTokens?.applyToSearchParams?.(params, session, this._warmupTokens);
    return params;
  },

  async warmupGroupContext(url) {
    if (!url) return null;
    try {
      const res = await this.fetchWithRetry(url, {
        credentials: 'include',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://www.facebook.com/',
        },
      });
      const html = await res.text();
      const tokens = globalThis.GF?.fbCometTokens?.parseFromHtml?.(html) || null;
      this._warmupTokens = tokens;
      if (tokens?.__hs && this._cache) {
        this._cache.hs = tokens.__hs;
      }
      await new Promise((r) => setTimeout(r, 2500));
      return tokens;
    } catch {
      return null;
    }
  },

  // Bug thật đã gặp: 1 bài đăng "Nhanh" (GraphQL nền) đã ĐƯỢC FB TẠO THẬT phía server, nhưng
  // response bị rớt trước khi về tới đây (mất mạng, service worker bị Chrome tạm ngưng giữa
  // request, 5xx tạm thời...) — createGroupPost() không đọc được kết quả nên coi là lỗi, rồi
  // postGroupItem() (background.js) tự fallback Cổ điển → ĐĂNG TRÙNG THẬT vào cùng 1 nhóm (Fast đã
  // đăng xong, Cổ điển đăng thêm 1 lần nữa). Khác với lỗi GraphQL rõ ràng (vd field_exception —
  // FB trả lỗi kèm response, chắc chắn CHƯA tạo bài, fallback Cổ điển an toàn), 2 trường hợp dưới
  // đây KHÔNG THỂ khẳng định FB đã xử lý request hay chưa — đánh dấu `ambiguousDelivery = true` để
  // postGroupItem() KHÔNG tự ý fallback Cổ điển cho các lỗi này (xem chú thích ở đó).
  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i += 1) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429) {
          if (i === retries - 1) return res;
          await new Promise((r) => setTimeout(r, 15000 + i * 5000));
          continue;
        }
        if (res.status >= 500 && i < retries - 1) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        return res;
      } catch (e) {
        // Fetch tự ném lỗi (mất mạng, connection reset, SW bị Chrome unload giữa chừng...) —
        // request có thể đã tới FB và được xử lý xong trước khi phản hồi bị rớt, không thể biết.
        if (i === retries - 1) {
          e.ambiguousDelivery = true;
          throw e;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    const err = new Error('Fetch thất bại sau nhiều lần thử');
    err.ambiguousDelivery = true;
    throw err;
  },

  async graphqlRequest(session, friendlyName, docId, variables, opts = {}) {
    const referer = opts.referer || 'https://www.facebook.com/';
    const body = await this.buildGraphqlBody(session, friendlyName, docId, variables);
    const res = await this.fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: this.graphqlHeaders(session, friendlyName, referer),
      body,
    });
    if (!res.ok) {
      // 5xx từ chính hạ tầng FB (không phải lỗi GraphQL nghiệp vụ trả kèm response) — request có
      // thể đã được nhận trước khi lỗi hạ tầng xảy ra, không chắc chắn CHƯA tạo bài.
      const err = new Error(`GraphQL HTTP ${res.status}`);
      if (res.status >= 500) err.ambiguousDelivery = true;
      throw err;
    }
    const text = await res.text();
    const chunks = this.parseAllGraphqlJson(text);
    for (const j of chunks) {
      for (const gqlErr of j?.errors || []) {
        if (gqlErr?.severity === 'WARNING') continue;
        // Lỗi GraphQL nghiệp vụ trả kèm response rõ ràng (vd field_exception) — FB CHẮC CHẮN đã
        // xử lý và từ chối request này, không tạo bài. KHÔNG đánh dấu ambiguousDelivery.
        throw new Error(gqlErr?.message || 'GraphQL lỗi');
      }
    }
    const json = this.pickGraphqlPayload(chunks);
    return { json, text, chunks };
  },
};
})();

// ----- fbCometTokens.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Token Comet (__dyn, __csr, …) — khớp GPP worker (BitSet compressor).
 * FB upload ảnh hay trả「Rất tiếc, đã xảy ra lỗi」nếu thiếu các param này.
 */
globalThis.GF = globalThis.GF || {};

class BitSetCompressor {
  constructor() {
    this.bits = [];
  }

  update(indices) {
    let max = -1;
    for (const i of indices) {
      if (i > max) max = i;
    }
    if (max >= this.bits.length) {
      const next = new Array(max + 1).fill(0);
      for (let t = 0; t < this.bits.length; t += 1) next[t] = this.bits[t];
      this.bits = next;
    }
    for (const i of indices) this.bits[i] = 1;
    return this;
  }

  compress() {
    if (!this.bits.length) return '';
    let out = '';
    let run = 1;
    let cur = this.bits[0];
    out += cur.toString();
    for (let i = 1; i < this.bits.length; i += 1) {
      if (this.bits[i] === cur) {
        run += 1;
      } else {
        const bin = run.toString(2);
        out += '0'.repeat(bin.length - 1) + bin;
        cur = this.bits[i];
        run = 1;
      }
    }
    const tail = run.toString(2);
    out += '0'.repeat(tail.length - 1) + tail;
    while (out.length % 6 !== 0) out += '0';
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
    let encoded = '';
    for (let i = 0; i < out.length; i += 6) {
      encoded += alphabet[parseInt(out.slice(i, i + 6), 2)];
    }
    return encoded;
  }
}

function pickRandomIndices(poolSize, count) {
  return Array.from({ length: poolSize }, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

function buildDynLike(poolSize, minPick, maxPick) {
  try {
    const c = new BitSetCompressor();
    const n = Math.floor(Math.random() * (maxPick - minPick)) + minPick;
    return c.update(pickRandomIndices(poolSize, n)).compress();
  } catch {
    return '';
  }
}

function buildHsdpHblp(poolSize) {
  try {
    const c = new BitSetCompressor();
    const n = Math.floor(Math.random() * (0.15 * poolSize)) + Math.floor(0.3 * poolSize);
    return c.update(pickRandomIndices(poolSize, n)).compress();
  } catch {
    return '';
  }
}

globalThis.GF.fbCometTokens = {
  buildDyn() {
    return buildDynLike(1600, 500, 700);
  },
  buildCsr() {
    return buildDynLike(1800, 500, 700);
  },
  buildHsdp() {
    return buildHsdpHblp(1800);
  },
  buildHblp() {
    return buildHsdpHblp(1400);
  },

  parseFromHtml(html) {
    const h = String(html || '');
    const pick = (key) => {
      const m = h.match(new RegExp(`"${key}":"([^"]+)"`))
        || h.match(new RegExp(`${key}=([^&"']+)`));
      return m?.[1] || null;
    };
    return {
      __dyn: pick('__dyn'),
      __csr: pick('__csr'),
      __hs: h.match(/"haste_session":"([^"]+)"/)?.[1] || null,
    };
  },

  // __dyn/__csr là bitset mã hoá CHÍNH XÁC module JS/CSS trang đang tải — không đoán/sinh ngẫu
  // nhiên được, Facebook coi giá trị sai/ngẫu nhiên là dấu hiệu bot rõ ràng (lỗi 1357004 chung
  // chung). Ưu tiên giá trị THẬT bắt được từ chính request trang Facebook tự gửi lúc user browse
  // bình thường (content.js/pageNetworkHook.js → gf_comet_tokens), rồi mới tới giá trị parse từ
  // HTML lúc warmup, ngẫu nhiên chỉ còn là phao cứu sinh cuối cùng khi chưa bắt được lần nào.
  async applyToSearchParams(params, session, htmlTokens) {
    const parsed = htmlTokens || {};
    const CT = globalThis.GF.fbCometTokens;
    const stored = (await chrome.storage.local.get('gf_comet_tokens').catch(() => ({}))).gf_comet_tokens || {};
    params.set('__dyn', stored.dyn || parsed.__dyn || CT.buildDyn());
    params.set('__csr', stored.csr || parsed.__csr || CT.buildCsr());
    params.set('__hsdp', CT.buildHsdp());
    params.set('__hblp', CT.buildHblp());
    params.set('__hs', parsed.__hs || session.hs || '20160.HYP:comet_pkg.2.1...1');
    if (!params.get('__rev')) params.set('__rev', session.rev || '1007600000');
    return params;
  },
};
})();

// ----- postFormat.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/** FB colored post — preset map từ GPP worker (text_format_preset_id). */
const GF_GLOBAL = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : {};
GF_GLOBAL.GF = GF_GLOBAL.GF || {};

GF_GLOBAL.GF.postFormat = {
  PRESETS: {
    '#18191a': '0',
    '#e2013b': '1903718606535395',
    '#dc7a5a': '303063890126415',
    '#c600ff': '1060186232989955',
    '#5d3fda': '1777259169190672',
    '#0073ff': '1365883126823705',
    '#8395d1': '6524876100975152',
    '#33234b': '319468561816672',
    '#5d6374': '1227086461613922',
  },

  presetId(hex) {
    const key = String(hex || '#18191A').toLowerCase();
    return this.PRESETS[key] || '0';
  },

  isColored(hex) {
    return this.presetId(hex) !== '0';
  },

  buildComposedText(plainText) {
    const text = String(plainText || '');
    const blocks = text.split('\n');
    return {
      blocks,
      block_types: blocks.map(() => 0),
      block_depths: blocks.map(() => 0),
      block_data: blocks.map(() => '[]'),
      entities: blocks.map(() => '[]'),
      entity_map: '{}',
      inline_styles: blocks.map(() => '[]'),
    };
  },

  applyToVariables(variables, { text, backgroundColor }) {
    const preset = this.presetId(backgroundColor);
    if (preset === '0') {
      variables.input.message = { ranges: [], text };
      return variables;
    }
    const composed = this.buildComposedText(text);
    variables.input.message = { ranges: [], text };
    variables.input.composed_text = composed;
    variables.input.text_format_preset_id = preset;
    return variables;
  },
};
})();

// ----- fbPostBg.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Đăng group qua GraphQL nền (không mở tab Facebook) — học từ Group Posting Pro directApi.
 */
/** GPP worker defaults — dp=text, dpu=media, l=link preview only */
const DOC_TEXT_POST = '9469644099759635';
const DOC_MEDIA_POST = '9286110778162996';
const DOC_LINK_PREVIEW = '24010394355227871';

/** Relay provider flags — GPP 2.3.2 worker (giúp mutation group khớp Comet). */
const RELAY_INTERNAL_VARS = {
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
  __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
  __relay_internal__pv__CometFeedStoryDynamicResolutionPhotoAttachmentRenderer_experimentWidthrelayprovider: 500,
  __relay_internal__pv__CometIsReplyPagerDisabledrelayprovider: false,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__CometFeedPYMKHScrollInitialPaginationCountrelayprovider: 10,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: false,
  __relay_internal__pv__EventCometCardImage_prefetchEventImagerelayprovider: false,
  __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: true,
};

const FP = globalThis.GF.fbPostBg = {
  base64ToBlob(base64, mime = 'image/png') {
    const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
    const bin = atob(raw);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  buildComposedLexical(text) {
    const t = String(text || '');
    const lines = t.split(/\r?\n/);
    const blocks = lines.length ? lines : [''];
    return {
      message: { ranges: [], text: t },
      composed_text: {
        blocks,
        block_types: blocks.map(() => 0),
        block_depths: blocks.map(() => 0),
        block_data: blocks.map(() => '{}'),
        entities: blocks.map(() => '[]'),
        entity_map: '{}',
        inline_styles: blocks.map(() => '[]'),
      },
    };
  },

  /** Giống GPP worker B() — WARNING/spam không fail cứng. */
  parseGraphqlNotice(json, rawText, chunks = []) {
    for (const p of [...(chunks || []), json]) {
      const story = p?.data?.story_create?.story;
      if (story?.is_marked_as_spam || story?.is_marked_as_spam_by_admin_assistant) {
        return 'FB gắn cờ spam — mở nhóm kiểm tra bài';
      }
      if (this.idFromStoryCreate(p?.data?.story_create)) return null;
    }
    for (const p of [...(chunks || []), json]) {
      const gqlErr = p?.errors?.[0];
      if (gqlErr?.severity === 'WARNING') {
        return gqlErr.message || gqlErr.summary || 'FB cảnh báo';
      }
    }
    return null;
  },

  detectVideoProcessing(rawText) {
    return /video.*processing|processing.*video|is_processing/i.test(String(rawText || ''));
  },

  parseFbErrors(rawText) {
    const t = String(rawText || '').toLowerCase();
    if (/rate_limit|rate limit|rate_limit_exceeded|temporarily blocked|temporarily restricted|you can't post right now|you're temporarily blocked|action_blocked/.test(t)) {
      return { critical: true, message: 'Facebook giới hạn tạm thời — dừng đăng, thử lại sau' };
    }
    if (/checkpoint|account restricted/.test(t)) {
      return { critical: true, message: 'Tài khoản FB bị checkpoint/hạn chế' };
    }
    if (/please log in|not logged in|error_subcode":1348131|error_subcode":1357001|error_subcode":1357004/.test(t)) {
      return { auth: true, message: 'Session Facebook hết hạn — mở facebook.com' };
    }
    if (/permissionerror|permission|does_not_have_permission/.test(t)) {
      return { soft: true, message: 'Không có quyền đăng vào nhóm này' };
    }
    return null;
  },

  normalizePostId(raw) {
    if (raw == null || raw === '') return null;
    let id = String(raw);
    if (/^\d+$/.test(id)) return id;
    try {
      const m = atob(id).match(/(?:VK:|:)(\d+)(?:\D|$)/);
      if (m) return m[1];
    } catch { /* ignore */ }
    const tail = id.split(':').pop();
    if (tail && /^\d+$/.test(tail)) return tail;
    return null;
  },

  idFromStoryCreate(sc) {
    if (!sc) return null;
    const story = sc.story;
    // legacy_story_hideable_id / legacy_api_post_id are the correct public URL IDs.
    // sc.story_id / sc.post_id are internal Facebook graph IDs that look numeric but
    // don't map to the public permalink — so they go last as final fallbacks.
    const candidates = [
      sc.legacy_story_hideable_id,
      sc.legacy_api_post_id,
      sc.legacy_fbid,
      story?.legacy_story_hideable_id,
      story?.legacy_api_post_id,
      story?.legacy_fbid,
      story?.legacy_id,
      story?.legacy_story_id,
      sc.feed_story_edge?.node?.legacy_story_hideable_id,
      sc.feed_story_edge?.node?.legacy_fbid,
      sc.feed_story_edge?.node?.id,
      // last resort: internal IDs that may not match the public URL
      sc.story_id,
      sc.post_id,
      story?.post_id,
      story?.id,
    ];
    for (const c of candidates) {
      const id = this.normalizePostId(c);
      if (id) return id;
    }
    if (story?.url) {
      const m = String(story.url).match(/\/permalink\/(\d+)/)
        || String(story.url).match(/\/posts\/(\d+)/);
      if (m?.[1]) return m[1];
    }
    return null;
  },

  idFromPayload(json) {
    if (!json?.data) return null;
    const sc = json.data.story_create;
    const fromStory = this.idFromStoryCreate(sc);
    if (fromStory) return fromStory;
    const altStory = json.data.createGroupPost?.group_feed_item_edge?.node?.story;
    if (altStory) {
      const id = this.normalizePostId(altStory.legacy_story_hideable_id || altStory.id);
      if (id) return id;
    }
    return null;
  },

  idFromGraphqlLines(rawText) {
    const S = globalThis.GF.fbSessionBg;
    for (const line of String(rawText || '').split('\n')) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(S.stripFbJsonPrefix(line))?.data;
        if (!data) continue;
        const id = this.idFromStoryCreate(data.story_create);
        if (id) return id;
      } catch { /* ignore */ }
    }
    return null;
  },

  idFromRawText(rawText) {
    const t = String(rawText || '');

    // Anchor search to the story_create section only — the full response can contain
    // other users' posts (feed refresh), and a global search would pick up their IDs.
    const scStart = t.indexOf('"story_create"');
    if (scStart === -1) return null; // response has no story_create → not our target

    // Take up to 8 KB after "story_create" to cover nested story object
    const context = t.slice(scStart, scStart + 8000);

    const patterns = [
      /"legacy_story_hideable_id"\s*:\s*"(\d+)"/,
      /"legacy_api_post_id"\s*:\s*"(\d+)"/,
      /"legacy_fbid"\s*:\s*"(\d+)"/,
      /"legacy_story_id"\s*:\s*"(\d+)"/,
      /"story_id"\s*:\s*"(\d+)"/,
      /"post_id"\s*:\s*"(\d+)"/,
    ];
    for (const re of patterns) {
      const m = context.match(re);
      if (m?.[1]) return m[1];
    }
    return null;
  },

  extractPostId(json, rawText, chunks = [], _debugLog) {
    const log = _debugLog || (() => {});
    const list = [...(chunks || []), json].filter(Boolean);
    for (const p of list) {
      const id = this.idFromPayload(p);
      if (id) {
        const sc = p?.data?.story_create;
        const scKeys = sc ? Object.keys(sc).join(',') : 'n/a';
        const storyKeys = sc?.story ? Object.keys(sc.story).join(',') : 'n/a';
        log(`[DEBUG post_id] method=payload id=${id} sc_keys=[${scKeys}] story_keys=[${storyKeys}]`);
        return id;
      }
    }
    const fromLines = this.idFromGraphqlLines(rawText);
    if (fromLines) {
      log(`[DEBUG post_id] method=graphql_lines id=${fromLines}`);
      return fromLines;
    }
    const fromRaw = this.idFromRawText(rawText);
    if (fromRaw) {
      log(`[DEBUG post_id] method=raw_text id=${fromRaw}`);
    } else {
      const scIdx = rawText.indexOf('"story_create"');
      const snippet = scIdx >= 0 ? rawText.slice(scIdx, scIdx + 300) : '(story_create not found)';
      log(`[DEBUG post_id] KHÔNG tìm được post_id. snippet: ${snippet}`);
    }
    return fromRaw;
  },

  storyCreateHasId(json, chunks = []) {
    for (const p of [...(chunks || []), json]) {
      if (this.idFromStoryCreate(p?.data?.story_create)) return true;
    }
    return false;
  },

  extractStoryCreateError(json, chunks = []) {
    if (this.storyCreateHasId(json, chunks)) return null;
    for (const p of [...(chunks || []), json]) {
      const sc = p?.data?.story_create;
      if (!sc) continue;
      const err = sc.errors?.[0] || sc.error;
      if (err) return err.description || err.message || String(err);
    }
    for (const p of [...(chunks || []), json]) {
      const gqlErr = p?.errors?.[0];
      if (gqlErr && gqlErr.severity !== 'WARNING') {
        return gqlErr.message || gqlErr.summary || 'GraphQL lỗi';
      }
    }
    return null;
  },

  detectSpamWarning(json, chunks = []) {
    for (const p of [...(chunks || []), json]) {
      const story = p?.data?.story_create?.story;
      if (story?.is_marked_as_spam || story?.is_marked_as_spam_by_admin_assistant) {
        return 'FB đánh dấu spam — mở nhóm kiểm tra';
      }
    }
    return null;
  },

  detectPending(json, rawText, chunks = []) {
    if (/requires_approval|pending_approval|is_pending|pending_review|GROUP_POST_PENDING|approval_required|admin_approval|post_pending|pending_post|needs_admin|group_pending|awaiting_approval|chờ duyệt|pending_story/i.test(rawText)) {
      return true;
    }
    for (const p of [...(chunks || []), json]) {
      const sc = p?.data?.story_create;
      if (sc?.is_pending || sc?.story?.is_pending || sc?.story?.is_published === false) return true;
      if (sc?.story == null && sc?.composer_session_id && !sc?.errors?.length) return true;
    }
    return false;
  },

  detectSubmittedWithoutId(json, rawText, chunks = []) {
    if (this.extractStoryCreateError(json, chunks)) return false;
    if (this.extractPostId(json, rawText, chunks)) return true;

    for (const p of [...(chunks || []), json]) {
      if (p?.errors?.some((e) => e.severity && e.severity !== 'WARNING')) return false;
      const data = p?.data;
      if (!data || !Object.prototype.hasOwnProperty.call(data, 'story_create')) continue;
      const sc = data.story_create;
      if (sc?.errors?.length) return false;
      // story_create có mặt, không lỗi — kể cả null/{} (nhóm duyệt bài hay hay gặp)
      return true;
    }

    if (/story_create/.test(rawText) && !this.extractStoryCreateError(json, chunks)) {
      return true;
    }
    return false;
  },

  inspectGraphqlFailure(json, rawText, chunks = []) {
    if (this.detectSubmittedWithoutId(json, rawText, chunks)) return null;
    for (const p of [...(chunks || []), json]) {
      const sc = p?.data?.story_create;
      if (sc && !sc.story && !sc.story_id && !sc.post_id && !sc.legacy_story_hideable_id) {
        return 'FB trả story_create rỗng — nhóm có thể chặn API hoặc cần duyệt';
      }
    }
    if (/spam|action.?blocked/i.test(rawText)) {
      return 'có thể bị FB chặn/spam';
    }
    return null;
  },

  mimeToUploadFilename(mime = 'image/png') {
    const m = String(mime).toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return 'image.jpg';
    if (m.includes('webp')) return 'image.webp';
    if (m.includes('gif')) return 'image.gif';
    return 'image.png';
  },

  describeUploadFailure(text, S) {
    const err = this.parseFbErrors(text);
    if (err?.message) return err.message;
    const stripped = S.stripFbJsonPrefix(text);
    try {
      const j = JSON.parse(stripped);
      const msg = j?.errorSummary || j?.errorDescription || j?.error;
      if (msg) return String(msg);
    } catch { /* ignore */ }
    if (/login|not logged/i.test(text)) return 'Session hết hạn — F5 facebook.com';
    if (stripped.length < 8) return 'FB không phản hồi';
    return stripped.slice(0, 140);
  },

  async uploadPhoto(imageBase64, session, groupId, mime = 'image/png') {
    const S = globalThis.GF.fbSessionBg;
    const raw = String(imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!raw || raw.length < 64) {
      throw new Error('Ảnh trống hoặc chưa load — Sửa bài, gắn lại ảnh');
    }
    const blob = this.base64ToBlob(raw, mime);
    if (!blob.size) throw new Error('File ảnh không hợp lệ');
    if (blob.size > 8 * 1024 * 1024) {
      throw new Error('Ảnh > 8MB — thu nhỏ hoặc dùng Cổ điển');
    }

    const groupUrl = groupId ? `https://www.facebook.com/groups/${groupId}` : 'https://www.facebook.com/';
    const url = new URL('https://upload.facebook.com/ajax/react_composer/attachments/photo/upload');
    const qp = await S.buildUploadQueryParams(session);
    qp.forEach((v, k) => url.searchParams.set(k, v));

    const form = new FormData();
    form.append('source', '8');
    form.append('profile_id', session.actorId || session.uid);
    form.append('waterfallxapp', 'comet');
    form.append('upload_id', `upload_${Date.now()}`);
    form.append('farr', blob, this.mimeToUploadFilename(mime));

    const headers = {
      Accept: '*/*',
      Origin: 'https://www.facebook.com',
      Referer: groupUrl,
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;

    const res = await S.fetchWithRetry(url.toString(), {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers,
    });
    const text = await res.text();
    const stripped = S.stripFbJsonPrefix(text);
    try {
      const j = JSON.parse(stripped);
      const photoId = j?.payload?.photoID || j?.payload?.photo_id;
      if (photoId) return String(photoId);
      const errMsg = j?.errorSummary || j?.errorDescription || j?.error?.message || j?.error;
      if (errMsg) throw new Error(String(errMsg));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
    }
    let photoId = text.match(/"photoID":"(\d+)"/)?.[1]
      || text.match(/"photo_id":"(\d+)"/)?.[1];
    if (!photoId) {
      try {
        const j = JSON.parse(stripped);
        photoId = j?.payload?.photoID || j?.payload?.photo_id;
      } catch { /* ignore */ }
    }
    if (!photoId) {
      if (/fb_dtsg|login|session/i.test(text)) S.invalidateCache?.();
      throw new Error(`Upload ảnh thất bại — ${this.describeUploadFailure(text, S)}`);
    }
    return String(photoId);
  },

  // content.js tự "nghe" request GraphQL thật của chính trang Facebook lúc user browse bình
  // thường, bắt doc_id mới nhất cho ComposerStoryCreateMutation và lưu vào gf_key_doc_ids — nên
  // khi FB đổi doc_id, máy nào có mở Facebook là tự cập nhật, không cần chờ bản extension mới.
  // Ưu tiên giá trị bắt được thật; hằng số cứng chỉ là fallback khi chưa bắt được lần nào.
  async pickComposerDocId({ hasMedia } = {}) {
    const stored = (await chrome.storage.local.get('gf_key_doc_ids')).gf_key_doc_ids || {};
    const captured = stored.ComposerStoryCreateMutation;
    if (captured) return captured;
    return hasMedia ? DOC_MEDIA_POST : DOC_TEXT_POST;
  },

  buildComposeVariables({ groupId, text, attachments, session, backgroundColor, hasImages }) {
    const clientToken = `client:${typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `gf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
    const mutationId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now());
    const lexical = this.buildComposedLexical(text);
    const PF = globalThis.GF?.postFormat;
    const presetId = PF?.isColored?.(backgroundColor) ? PF.presetId(backgroundColor) : '0';
    const variables = {
      input: {
        composer_entry_point: hasImages ? 'publisher_bar_media' : 'inline_composer',
        composer_source_surface: 'group',
        composer_type: 'group',
        idempotence_token: clientToken,
        source: 'WWW',
        ...lexical,
        text_format_preset_id: presetId,
        attachments,
        audience: { to_id: String(groupId) },
        actor_id: session.actorId || session.uid,
        client_mutation_id: mutationId,
        navigation_data: {
          attribution_id_v2: 'CometGroupDiscussionRoot.react,comet.group,tap_bookmark,,,,,',
        },
        tracking: [null],
        event_share_metadata: { surface: 'newsfeed' },
        inline_activities: [],
        with_tags_ids: null,
        logging: { composer_session_id: clientToken },
      },
      displayCommentsContextEnableComment: null,
      displayCommentsContextIsAdPreview: null,
      displayCommentsContextIsAggregatedShare: null,
      displayCommentsContextIsStorySet: null,
      feedLocation: 'GROUP',
      feedbackSource: 0,
      focusCommentID: null,
      gridMediaWidth: hasImages ? 230 : null,
      groupID: String(groupId),
      scale: 1,
      privacySelectorRenderLocation: 'COMET_STREAM',
      checkPhotosToReelsUpsellEligibility: false,
      checkVideoToReelsUpsellEligibility: false,
      renderLocation: 'group',
      useDefaultActor: false,
      inviteShortLinkKey: null,
      isFeed: false,
      isGroup: true,
      isTimeline: false,
      isPageNewsFeed: false,
      isEvent: false,
      isFundraiser: false,
      isFunFactPost: false,
      isSocialLearning: false,
      isProfileReviews: false,
      isWorkSharedDraft: false,
      UFI2CommentsProvider_commentsKey: 'CometGroupDiscussionRootSuccessQuery',
      hashtag: null,
      canUserManageOffers: false,
      ...RELAY_INTERNAL_VARS,
    };
    if (PF?.isColored?.(backgroundColor)) {
      PF.applyToVariables(variables, { text, backgroundColor });
    }
    return variables;
  },

  async createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    const colored = globalThis.GF?.postFormat?.isColored?.(backgroundColor);
    const imgList = colored
      ? []
      : (images?.length
        ? images
        : (imageBase64 ? [{ base64: imageBase64, mime: mediaMime || 'image/png' }] : []));
    const groupUrl = `https://www.facebook.com/groups/${groupId}`;
    await S.warmupGroupContext?.(groupUrl);

    const attachments = [];
    for (const img of imgList) {
      const photoId = await this.uploadPhoto(img.base64, session, groupId, img.mime || 'image/png');
      attachments.push({ photo: { id: photoId } });
    }

    const hasMedia = imgList.length > 0;
    const docId = await this.pickComposerDocId({ hasMedia });
    const variables = this.buildComposeVariables({
      groupId, text, attachments, session, backgroundColor, hasImages: hasMedia,
    });
    const { json, text: rawText, chunks } = await S.graphqlRequest(
      session,
      'ComposerStoryCreateMutation',
      docId,
      variables,
      { referer: groupUrl },
    );

    // Bug thật đã gặp: Tony báo "nhóm 2 đăng Nhanh thành công (thấy bài thật trên FB) nhưng vẫn
    // đăng Cổ điển tiếp" — parseFbErrors() quét TOÀN BỘ raw response (có thể chứa nhiều story
    // bundle khác nhau trong 1 response GraphQL batch của FB) tìm substring RẤT RỘNG (vd
    // "checkpoint"/"permission"/"please log in" ở bất kỳ đâu) — comment cũ bên dưới đã tự cảnh báo
    // rủi ro match nhầm này nhưng trước đây check critical/auth chạy TRƯỚC KHI thử trích post_id,
    // nên 1 match nhầm (vd nội dung bài hoặc dữ liệu feed khác bundle chung vô tình chứa đúng từ
    // khoá) khiến code throw NGAY dù story_create thực ra đã tạo bài thành công thật. Giờ trích
    // post_id TRƯỚC — có post_id thật (bằng chứng cấu trúc, đáng tin hơn hẳn 1 regex match) thì
    // coi là thành công ngay, bỏ qua mọi nghi ngờ critical/auth phía dưới.
    const debugMsgs = [];
    const postId = this.extractPostId(json, rawText, chunks, (m) => debugMsgs.push(m));
    if (debugMsgs.length) {
      globalThis.GF?.bg?.appendEngineLog?.({
        level: 'info', phase: 'post-id-debug', message: debugMsgs.join(' | '),
        groupId: String(groupId),
      }).catch?.(() => {});
    }

    const err = postId ? null : this.parseFbErrors(rawText);
    if (err?.critical || err?.auth) {
      // Log raw text khi gặp lỗi critical/auth (checkpoint, rate limit, session hết hạn...) —
      // parseFbErrors chỉ match substring rất rộng, nên cần thấy nguyên văn để biết có đúng là
      // lỗi thật hay match nhầm vào field không liên quan.
      console.warn('[GroupFlow] Fast post critical/auth error:', err.message, '| raw:', rawText.slice(0, 800));
    }
    if (err?.critical) throw new Error(err.message);
    if (err?.auth) {
      S.invalidateCache();
      throw new Error(err.message);
    }

    const notice = this.parseGraphqlNotice(json, rawText, chunks);
    const pending = !postId && this.detectPending(json, rawText, chunks);
    const spamWarn = this.detectSpamWarning(json, chunks) || notice;
    const videoProcessing = !postId && this.detectVideoProcessing(rawText);

    if (postId) {
      return {
        postId,
        mode: 'fast-bg',
        url: `https://www.facebook.com/groups/${groupId}/posts/${postId}/`,
        warning: notice || undefined,
      };
    }
    if (pending) {
      return {
        postId: 'pending',
        status: 'pending_approval',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: notice || 'Đã gửi — chờ admin duyệt',
      };
    }
    if (spamWarn) {
      return {
        postId: 'hidden',
        status: 'posted_uncertain',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: spamWarn,
      };
    }
    if (videoProcessing) {
      return {
        postId: 'processing',
        status: 'successful',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: 'Video đang xử lý trên FB',
      };
    }

    const submitted = !postId && this.detectSubmittedWithoutId(json, rawText, chunks);
    if (submitted) {
      return {
        postId: 'pending',
        status: 'pending_approval',
        mode: 'fast-bg',
        url: `${groupUrl}/`,
        warning: notice || 'Đã gửi API — FB không trả post_id (nhóm duyệt bài?). Mở nhóm kiểm tra.',
      };
    }

    const storyErr = this.extractStoryCreateError(json, chunks);
    if (storyErr) throw new Error(storyErr);
    if (err?.soft) throw new Error(err.message);

    // Bug thật đã gặp: Tony báo "bật Cổ điển lên là thấy đã đăng Nhanh rồi nhưng vẫn đăng Cổ điển
    // tiếp" — request Nhanh có response HTTP sạch (không lỗi mạng/5xx, không bị extractStoryCreateError()
    // bắt được lỗi rõ ràng), tức FB CÓ THỂ đã tạo bài thật, chỉ là extractPostId()/detectSubmittedWithoutId()
    // không nhận ra được post_id trong response (nghi do FB đang đổi schema — cùng đợt với lỗi
    // field_exception gặp song song) — response hạ tầng OK nên fetchWithRetry()/graphqlRequest()
    // (fbSessionBg.js) không đánh dấu ambiguousDelivery, khiến postGroupItem() (background.js) tưởng
    // đây là lỗi rõ ràng và tự fallback Cổ điển → đăng trùng thật. "spam/action_blocked" là tín hiệu
    // FB từ chối rõ ràng (không tạo bài) nên KHÔNG đánh dấu ambiguous; mọi trường hợp còn lại (kể cả
    // "story_create rỗng" và "không rõ gì cả") đều không thể khẳng định CHƯA tạo bài — đánh dấu
    // ambiguousDelivery để postGroupItem() không tự fallback, bắt user tự kiểm tra trước khi đăng lại.
    const hint = this.inspectGraphqlFailure(json, rawText, chunks);
    console.warn('[GroupFlow] Fast post no post_id', groupId, rawText.slice(0, 600));
    const isDefiniteReject = /spam|action.?blocked/i.test(hint || '');
    const failErr = new Error(
      hint
        ? `FB từ chối hoặc không phản hồi (${hint}) — mở nhóm kiểm tra; thử Cổ điển`
        : 'Không rõ FB đã tạo bài chưa (response không nhận dạng được) — mở nhóm kiểm tra trước khi đăng lại, tránh đăng trùng',
    );
    if (!isDefiniteReject) failErr.ambiguousDelivery = true;
    throw failErr;
  },

  async postToGroup({ groupId, text, imageBase64, images, mediaMime, actorId, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    try {
      session = await S.resolveSession({ actorId, groupId });
      return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
    } catch (e) {
      if (e.message?.includes('hết hạn') || e.message?.includes('fb_dtsg') || e.message?.includes('token')) {
        S.invalidateCache();
        session = await S.resolveSession({ force: true, actorId, groupId });
        return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
      }
      throw e;
    }
  },
};
})();

// ----- fbCommentBg.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Comment group qua GraphQL nền (không mở tab Facebook) — port từ GPP worker.js H()/q().
 */
const DOC_COMMENT = '9550500205043457';
const DOC_TYPING_START = '5359232510868548';
const DOC_TYPING_STOP = '6911603175550464';

// v1.0.221 — cache kết quả checkPostCommentable() theo post_id, tránh fetch lại mỗi lần
// chạy/lên lịch comment cho cùng 1 bài (Tony: "đã check rồi thì khỏi check nữa mất công").
// 'deleted' là trạng thái BỀN (bài đã xóa không tự "hết xóa") nên cache vô thời hạn. 'pending'
// (chờ duyệt, hoặc tín hiệu mơ hồ như 404/lỗi mạng) là trạng thái CÓ THỂ ĐỔI (admin duyệt sau,
// mạng chỉ lỗi tạm) nên chỉ cache ngắn hạn rồi phải check lại — xem getPostAccess().
const PENDING_ACCESS_TTL_MS = 20 * 60 * 1000;
// v1.0.229 — Tony xác nhận bằng ảnh chụp thật 1 bài "Bạn hiện không xem được nội dung này" (chủ
// bài giới hạn người xem/đã xóa — đúng marker đã có ở checkPostCommentable() bên dưới) nhưng vẫn
// bị cache 'ok' — nghĩa là marker string-match không khớp được HTML thô fetch() lấy về (rất có thể
// do fetch() nền thiếu header điều hướng thật/Facebook trả biến thể khác cho request không phải
// browser navigation, hoặc trang render phần lỗi bằng JS sau khi tải chứ không có sẵn trong HTML
// gốc) — checkPostCommentable() rơi vào nhánh fail-open ("không xác định được thì coi là OK").
// Kiểu lỗi string-match kiểu này đã tái diễn nhiều lần (v1.0.219/220/222) mỗi khi Facebook đổi
// cách hiển thị — thay vì tiếp tục vá từng chuỗi (dễ vỡ lại), 'ok' KHÔNG còn cache vĩnh viễn nữa:
// hết hạn sau `OK_ACCESS_TTL_MS` để tự check lại định kỳ — false positive (nếu marker vẫn không
// khớp được) tự bị giới hạn phạm vi theo thời gian thay vì tin sai mãi mãi, thay vì phải chờ user
// phát hiện + báo cáo thủ công như lần này.
const OK_ACCESS_TTL_MS = 6 * 60 * 60 * 1000;
const POST_ACCESS_CACHE_KEY = 'gf_post_access_cache';
// v1.0.222 — bug ở buildPermalink() (dùng route `/permalink/` thay vì `/posts/` thật) khiến
// checkPostCommentable() gần như LUÔN fail-open ("ok") bất kể bài thật có xem được hay không —
// nghĩa là mọi entry 'ok' ghi TRƯỚC bản vá này đều không đáng tin, mà 'ok' lại cache vĩnh viễn nên
// sẽ không bao giờ tự check lại. Bump schema để tự xoá sạch cache cũ đúng 1 lần khi lên bản này —
// xem readPostAccessCache().
// v1.0.251 — Tony hỏi "sao không reset DB cho đỡ khổ" — cache này KHÔNG nằm ở DB server, nằm ngay
// trong chrome.storage.local của máy đang chạy extension, nên không có "lệnh DB" nào xoá được nó.
// Bump schema lần 2 (2→3) để tự xoá sạch TOÀN BỘ cache cũ ngay khi reload extension lên bản này —
// đơn giản hơn hẳn việc tự tay gọi force:true qua console cho từng bài — đổi lại mọi bài (không chỉ
// đúng 1 bài đang lỗi) đều mất cache, phải chờ cron warmPostAccessCache() check lại dần (2 bài/~3
// phút, hoặc 6 bài ngay khi mở tab Comment) — chấp nhận được vì đây chỉ là cache hiệu năng, không
// phải dữ liệu thật.
const POST_ACCESS_CACHE_SCHEMA = 3;
const POST_ACCESS_CACHE_SCHEMA_KEY = 'gf_post_access_cache_schema';

const FC = globalThis.GF.fbCommentBg = {
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  randomSessionId() {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  parseFbErrors(rawText) {
    const parse = globalThis.GF.fbPostBg?.parseFbErrors;
    if (parse) return parse(rawText);
    const t = String(rawText || '').toLowerCase();
    if (/rate_limit|action_blocked|temporarily blocked/.test(t)) {
      return { critical: true, message: 'Facebook giới hạn tạm thời' };
    }
    if (/please log in|session|expired/.test(t)) {
      return { auth: true, message: 'Session Facebook hết hạn' };
    }
    return null;
  },

  buildPermalink({ groupId, postId, session, isTimeline }) {
    if (isTimeline) {
      const uid = session?.actorId || session?.uid;
      return `https://www.facebook.com/${uid}/posts/${postId}/`;
    }
    // v1.0.222 — TỪNG dùng `/groups/{gid}/permalink/{pid}/` (route rút gọn/redirect của FB, khác
    // hẳn trang thật `/groups/{gid}/posts/{pid}/` mà "Mở bài" mở ra — xem 043c139). Route permalink
    // rất có thể trả về HTML rút gọn không chứa marker lỗi ("Bạn hiện không xem được nội dung
    // này"...) LẪN marker OK (story_title/story_token/likeAction) — khiến checkPostCommentable()
    // luôn rơi vào nhánh "fail open" (coi là commentable) bất kể bài thật có xem được hay không.
    // Tony xác nhận thật bằng ảnh chụp: bài được cache đánh dấu "✓ Có thể comment" nhưng mở
    // `/posts/{pid}/` bằng tay lại thấy "Bạn hiện không xem được nội dung này". Đổi sang đúng URL
    // thật, khớp với `buildPostedGroupUrl()`/`buildHistoryPostUrl()` (sidepanel.js) và
    // `buildGroupPostUrl()` (background.js).
    return `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
  },

  async checkPostCommentable({ groupId, postId, session, isTimeline }) {
    const url = this.buildPermalink({ groupId, postId, session, isTimeline });
    const S = globalThis.GF.fbSessionBg;
    try {
      const res = await S.fetchWithRetry(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (res.status === 404) {
        // Tín hiệu mơ hồ (có thể xóa thật, có thể chỉ đang chờ duyệt nên FB tạm giấu) — xếp
        // `kind: 'pending'` (retry-able) thay vì 'deleted' (vĩnh viễn) để không lỡ chặn cứng
        // 1 bài thực ra sẽ hiện lại sau khi admin duyệt.
        return { canComment: false, kind: 'pending', reason: 'Bài không tồn tại (404) — có thể bị xóa hoặc chờ duyệt' };
      }
      if (!res.ok) {
        return { canComment: false, kind: 'pending', reason: `Không đọc được bài (HTTP ${res.status})` };
      }
      // v1.0.229 — Tony xác nhận bằng 2 bài KHÁC NHAU, cả 2 đều hiện đúng marker "Bạn hiện không
      // xem được nội dung này" trên màn hình nhưng checkPostCommentable() vẫn báo canComment:true
      // MỖI LẦN (không phải lỗi cache 1 lần) — nghĩa là bản thân string-match luôn thất bại, không
      // phải do FB thay đổi wording. Nghi vấn cao nhất: HTML server trả về encode tiếng Việt có dấu
      // ở dạng NFD (ký tự gốc + dấu tổ hợp tách rời) trong khi chuỗi marker trong code là NFC (ký
      // tự có dấu dựng sẵn) — 2 dạng hiển thị giống hệt nhau cho mắt người/trình duyệt (browser tự
      // normalize khi render) nhưng so sánh chuỗi thô (`.includes()`) coi là 2 chuỗi byte khác nhau
      // nên không bao giờ khớp. `.normalize('NFC')` chuẩn hóa lại HTML thô về cùng dạng với marker
      // trước khi so khớp — không đổi gì nếu HTML vốn đã là NFC (fix vô hại nếu đoán sai nguyên
      // nhân), chỉ có tác dụng khi thật sự lệch chuẩn hóa.
      const html = (await res.text()).normalize('NFC');
      // v1.0.219 — trước bản này chỉ dò marker TIẾNG ANH ("This content isn't available…",
      // "Your post is pending approval"). Tài khoản FB đặt ngôn ngữ Việt (mặc định của cả hệ
      // thống — xem `settings.fbLang || 'vi'`) trả HTML với text tiếng Việt bất kể header
      // accept-language gửi lên, nên 2 marker tiếng Anh KHÔNG BAO GIỜ khớp trên tài khoản VN thật
      // — checkPostCommentable() luôn rơi xuống nhánh "fail open" (coi là commentable) dù bài
      // đang thực sự ở trạng thái chờ duyệt/đã xóa/không xem được, khiến job vẫn tốn công mở tab
      // Cổ điển chạy tiếp và thất bại ở đó thay vì bị chặn sớm, rẻ tiền ngay tại đây. Thêm marker
      // tiếng Việt tương ứng (xác nhận từ ảnh chụp thật của Tony: "Bạn hiện không xem được nội
      // dung này").
      // v1.0.230 (ĐÃ REVERT ở v1.0.232) — từng đổi sang ưu tiên marker OK trước, với giả thuyết
      // bài CỦA CHÍNH MÌNH chờ duyệt vẫn commentable bình thường (FB chỉ chặn người khác). Tony
      // xác nhận bằng thao tác tay thực tế: bài của chính mình chờ duyệt vẫn hiện ĐẦY ĐỦ nội
      // dung (có marker OK thật) NHƯNG KHÔNG CÓ Ô BÌNH LUẬN nào cả (tùy cấu hình duyệt bài từng
      // nhóm — Facebook không cho tương tác kể cả với chủ bài tới khi duyệt xong) — giả thuyết
      // v1.0.230 SAI. Banner "chờ phê duyệt" là tín hiệu ĐÁNG TIN CẬY HƠN marker OK để xác định
      // có comment được hay không (marker OK chỉ xác nhận NỘI DUNG hiện ra, không xác nhận Ô
      // BÌNH LUẬN có tồn tại) — quay lại kiểm tra deleted/pending TRƯỚC marker OK.
      if (
        html.includes("This content isn't available at the moment")
        || html.includes('Bạn hiện không xem được nội dung này')
        || html.includes('Nội dung này hiện không có sẵn')
        || html.includes('đã xóa nội dung')
      ) {
        return { canComment: false, kind: 'deleted', reason: 'Bài đã bị xóa hoặc ẩn' };
      }
      if (
        html.includes('Your post is pending approval')
        || html.includes('đang chờ phê duyệt')
        || html.includes('đang chờ duyệt')
        || html.includes('chờ quản trị viên nhóm phê duyệt')
      ) {
        return { canComment: false, kind: 'pending', reason: 'Bài đang chờ admin duyệt' };
      }
      if (html.includes('story_title') || html.includes('story_token') || html.includes('likeAction')) {
        // v1.0.251 — thêm log NGAY CẢ khi khớp marker OK (trước đây chỉ log lúc fail-open, không có
        // bằng chứng gì khi nghi ngờ marker OK khớp NHẦM trên bài thực ra đang chờ duyệt — Tony báo
        // bài chờ duyệt vẫn hiện "có thể comment" ở tab Của tôi, cần dữ liệu thật để sửa đúng chỗ
        // thay vì đoán thêm 1 marker mới không có bằng chứng, như 4-5 lần trước đã làm).
        // v1.0.254 — Tony test thật (post 4450720991842547): matchedStoryTitle:true, HTML ~908KB
        // (không phải trang rỗng/login wall), nhưng không thấy được `looseHintsOnOk` vì Chrome
        // console thu gọn object lồng nhau. Giờ trích luôn ĐOẠN VĂN BẢN quanh mỗi từ khoá tìm thấy
        // (±150 ký tự) in thẳng ra console — không cần bấm mở rộng gì nữa, không cần đoán thêm
        // marker mới khi chưa thấy đúng câu chữ Facebook dùng.
        const lowerHtml = html.toLowerCase();
        const looseHintsOnOk = ['duyệt', 'approv', 'pending', 'chờ', 'review'].filter((kw) => lowerHtml.includes(kw));
        const hintSnippets = {};
        for (const kw of looseHintsOnOk) {
          const idx = lowerHtml.indexOf(kw);
          hintSnippets[kw] = html.slice(Math.max(0, idx - 150), idx + 150);
        }
        // v1.0.255 — Tony copy log từ console nhưng Chrome vẫn thu gọn object lồng nhau (kể cả sau
        // v1.0.254 thêm hintSnippets) — console.info nhận object thì DevTools luôn hiện dạng cây có
        // thể thu gọn, copy text thường chỉ lấy được dòng tóm tắt, không lấy được nội dung bên
        // trong. In thẳng 1 CHUỖI JSON (console.log, không phải console.info(obj)) — không thể thu
        // gọn được nữa, copy paste là dán được nguyên văn.
        console.log('[GroupFlow] checkPostCommentable OK-match JSON: ' + JSON.stringify({
          postId, groupId, htmlLength: html.length,
          matchedStoryTitle: html.includes('story_title'),
          matchedStoryToken: html.includes('story_token'),
          matchedLikeAction: html.includes('likeAction'),
          // Nếu mảng này KHÔNG rỗng — nghĩa là HTML có tín hiệu liên quan chờ duyệt NGAY CẢNH marker
          // OK, nhưng 3 marker pending/deleted phía trên không khớp được — bằng chứng trực tiếp cho
          // giả thuyết "chờ duyệt dùng từ khác với marker đang dò", khác hẳn "JS mới dựng banner".
          looseHintsOnOk,
          hintSnippets,
        }));
        return { canComment: true, kind: 'ok' };
      }
      // Trang tải OK (không 404), khong thay dau hieu bi xoa/pending ro rang - nhung cung khong
      // tim thay marker cu (story_title/story_token/likeAction) de XAC NHAN chac chan, rat co
      // the do Facebook doi cau truc trang tu luc code nay viet. Truoc day coi "khong xac nhan
      // duoc" = KHONG cho comment (fail closed) - chan nham ca bai hoan toan binh thuong moi khi
      // marker cu khong khop, khien Nhanh luon rot xuong Co dien du bai comment duoc binh thuong.
      // Doi sang fail open: trang load duoc, khong co tin hieu xau ro rang thi cu coi la
      // commentable, de createComment() that su quyet dinh dung/sai - neu van sai thi co che
      // fallback Co dien da co san lo.
      // v1.0.229 — log lại khi rơi vào fail-open để có dữ liệu chẩn đoán nếu marker (kể cả sau khi
      // đã normalize NFC) vẫn không khớp được lần nào đó trong tương lai — xem qua
      // chrome://extensions → GroupFlow → "service worker" → Console (không hiện trong Log UI).
      // v1.0.251 — thêm quét từ khoá RỘNG hơn (không phân biệt hoa/thường, không cần khớp cả cụm) để
      // phân biệt 2 khả năng: (a) HTML thô THẬT SỰ không mang tín hiệu gì (rất có thể do Facebook
      // dựng banner "chờ duyệt" bằng JS phía client SAU khi tải trang — fetch() ở đây không chạy JS
      // nên không bao giờ thấy được, khác hẳn lỗi marker sai chữ) — hay (b) tín hiệu CÓ mặt nhưng
      // dùng từ khác/cách viết khác với 3 marker cụm đang dò. Không tự đoán thêm marker mới ở đây —
      // chỉ log, chờ Tony gửi lại đúng đoạn console này để sửa CÓ BẰNG CHỨNG, tránh lặp lại kiểu vá
      // mù đã làm 4-5 lần (v1.0.219/220/222/229/232) mà không dứt điểm.
      const looseHints = ['duyệt', 'approv', 'pending', 'chờ', 'review'].filter((kw) => html.toLowerCase().includes(kw));
      console.warn('[GroupFlow] checkPostCommentable fail-open — không khớp marker nào', {
        postId, groupId, htmlLength: html.length, htmlHead: html.slice(0, 400), looseHints,
      });
      return { canComment: true, kind: 'ok' };
    } catch (e) {
      return { canComment: false, kind: 'pending', reason: e.message || 'Lỗi kiểm tra bài' };
    }
  },

  async readPostAccessCache() {
    const d = await chrome.storage.local.get([POST_ACCESS_CACHE_KEY, POST_ACCESS_CACHE_SCHEMA_KEY]);
    if (d[POST_ACCESS_CACHE_SCHEMA_KEY] !== POST_ACCESS_CACHE_SCHEMA) {
      await chrome.storage.local.set({ [POST_ACCESS_CACHE_KEY]: {}, [POST_ACCESS_CACHE_SCHEMA_KEY]: POST_ACCESS_CACHE_SCHEMA });
      return {};
    }
    return d[POST_ACCESS_CACHE_KEY] || {};
  },

  async writePostAccessEntry(postId, entry) {
    const store = await this.readPostAccessCache();
    store[String(postId)] = entry;
    await chrome.storage.local.set({ [POST_ACCESS_CACHE_KEY]: store });
    return entry;
  },

  isAccessEntryFresh(entry) {
    if (!entry) return false;
    if (entry.kind === 'deleted') return true;
    const ttl = entry.kind === 'pending' ? PENDING_ACCESS_TTL_MS : OK_ACCESS_TTL_MS;
    return Date.now() - (entry.checkedAt || 0) < ttl;
  },

  // Bọc checkPostCommentable() bằng cache theo post_id — dùng chung cho cả luồng comment thật
  // (commentOnPost() bên dưới), cron nền quét trước (background.js warmPostAccessCache()), lẫn
  // UI đọc trực tiếp storage để hiện tag/chặn nút (sidepanel.js không load module này, chỉ đọc
  // thẳng key `gf_post_access_cache` — xem ghi chú ở buildPermalink()/PENDING_ACCESS_TTL_MS).
  async getPostAccess({ groupId, postId, session, isTimeline, force = false }) {
    const cached = force ? null : (await this.readPostAccessCache())[String(postId)];
    if (this.isAccessEntryFresh(cached)) return cached;
    // v1.0.258 — đổi sang check bằng tab thật (GF_BG.checkPostCommentableViaTab(), background.js) —
    // xem chú thích đầy đủ ở đó. `this.checkPostCommentable()` (fetch() HTML thô, KHÔNG BAO GIỜ thấy
    // được banner "chờ duyệt" do Facebook lược bớt nội dung cho request không phải điều hướng thật)
    // vẫn giữ nguyên trong file này, không xoá — dùng để so sánh/debug tay qua console nếu cần, xem
    // docs/GROUPFLOW.md. `GF_BG` tham chiếu được ở đây vì `background.js` (nơi khai báo `const
    // GF_BG`) và module này (nạp qua `importScripts('modules/swBundle.js')`) chạy CHUNG 1 global
    // scope của service worker cổ điển (không phải ES module) — không cần `globalThis.GF_BG`.
    const result = await GF_BG.checkPostCommentableViaTab({ groupId, postId, session, isTimeline });
    const entry = { ...result, checkedAt: Date.now() };
    await this.writePostAccessEntry(postId, entry);
    return entry;
  },

  async simulateTyping(session, feedbackId, sessionId) {
    const S = globalThis.GF.fbSessionBg;
    const variables = {
      input: {
        feedback_id: feedbackId,
        session_id: sessionId,
        actor_id: session.actorId || session.uid,
        client_mutation_id: '1',
      },
    };
    await S.graphqlRequest(
      session,
      'CometUFILiveTypingBroadcastMutation_StartMutation',
      DOC_TYPING_START,
      variables,
    );
  },

  async stopTyping(session, feedbackId, sessionId) {
    const S = globalThis.GF.fbSessionBg;
    const variables = {
      input: {
        feedback_id: feedbackId,
        session_id: sessionId,
        actor_id: session.actorId || session.uid,
        client_mutation_id: '3',
      },
    };
    try {
      await S.graphqlRequest(
        session,
        'CometUFILiveTypingBroadcastMutation_StopMutation',
        DOC_TYPING_STOP,
        variables,
      );
    } catch { /* ignore */ }
  },

  extractCommentId(json, rawText) {
    // Try structured JSON paths first (multiple response shapes FB has used)
    const fromJson = json?.data?.comment_create?.comment?.id
      || json?.data?.comment_create?.comment?.legacy_fbid
      || json?.data?.comment_create?.feedback_comment_edge?.node?.id
      || json?.data?.commentCreate?.comment?.id
      || json?.data?.commentCreate?.comment?.legacy_fbid
      || json?.data?.create_comment?.comment?.id
      || json?.data?.create_comment?.comment?.legacy_fbid
      || json?.data?.comment?.id
      || json?.data?.comment?.legacy_fbid
      || json?.extensions?.comment_id
      || json?.extensions?.commentId;
    if (fromJson) return String(fromJson);

    // Fallback: search raw text — anchor to comment_create context to avoid false positives
    const t = String(rawText || '');
    const ctxStart = t.search(/comment_create|commentCreate|create_comment/i);
    const ctx = ctxStart >= 0 ? t.slice(ctxStart, ctxStart + 4000) : t;
    const m = ctx.match(/\?comment_id=(\d+)/)
      || ctx.match(/"legacy_fbid"\s*:\s*"(\d{8,})"/)
      || ctx.match(/"comment_id"\s*:\s*"(\d{8,})"/)
      || ctx.match(/"id"\s*:\s*"(\d{8,})"/)
      || t.match(/\?comment_id=(\d+)/);
    return m?.[1] ? String(m[1]) : null;
  },

  humanDelayMs(text) {
    const len = String(text || '').length;
    const base = Math.max(3000, Math.min(8000, len * 40));
    return base + Math.floor(Math.random() * 1500);
  },

  async createComment({ postId, text, session }) {
    const S = globalThis.GF.fbSessionBg;
    if (!postId || !/^\d+$/.test(String(postId))) {
      throw new Error('post_id không hợp lệ hoặc đang pending');
    }

    const feedbackId = btoa(`feedback:${postId}`);
    const typingSessionId = this.randomSessionId();

    try {
      await this.simulateTyping(session, feedbackId, typingSessionId);
      await this.sleep(this.humanDelayMs(text));
    } catch { /* typing optional */ }

    const variables = {
      input: {
        feedback_id: feedbackId,
        message: { ranges: [], text: String(text) },
        actor_id: session.actorId || session.uid,
        client_mutation_id: String(Math.round(Math.random() * 1000)),
      },
      useDefaultActor: false,
      scale: 1,
    };

    const storedIds = (await chrome.storage.local.get('gf_key_doc_ids')).gf_key_doc_ids || {};
    const resolvedDocId = storedIds['useCometUFICreateCommentMutation'] || DOC_COMMENT;
    const { json, text: rawText } = await S.graphqlRequest(
      session,
      'useCometUFICreateCommentMutation',
      resolvedDocId,
      variables,
    );

    this.stopTyping(session, feedbackId, typingSessionId).catch(() => {});

    const err = this.parseFbErrors(rawText);
    if (err?.critical) throw new Error(err.message);
    if (err?.auth) {
      S.invalidateCache();
      throw new Error(err.message);
    }

    const commentId = this.extractCommentId(json, rawText);
    if (commentId) {
      return { ok: true, commentId, mode: 'fast-bg' };
    }
    if (err?.soft) throw new Error(err.message);

    // Không thấy lỗi GraphQL (đã throw ở graphqlRequest nếu có) nhưng cũng không trích được
    // commentId — nghĩa là response 200 OK nhưng đúng shape JSON không khớp path nào trong
    // extractCommentId() (rất có thể FB đổi shape mutation, giống loạt lỗi __dyn/__csr/jazoest đã
    // gặp ở luồng đăng bài trước đây). Không đoán mò thêm path — log lại top-level keys + đoạn
    // response thật để lần sau có dữ liệu thật mà sửa đúng, thay vì luôn âm thầm rớt xuống Cổ điển
    // không rõ lý do.
    console.warn('[GroupFlow] Nhanh comment: không trích được commentId — top-level keys:',
      json?.data ? Object.keys(json.data) : json && Object.keys(json), 'raw snippet:', String(rawText || '').slice(0, 800));

    return {
      ok: true,
      commentId: null,
      mode: 'fast-bg',
      warning: 'Comment có thể đã gửi nhưng không lấy được ID',
    };
  },

  async commentOnPost({ groupId, postId, text, actorId, isTimeline }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    const run = async (force) => {
      session = await S.resolveSession({ force, actorId });
      const check = await this.getPostAccess({
        groupId,
        postId,
        session,
        isTimeline,
        // Session vừa bị buộc làm mới (lỗi auth ở lượt trước) — đừng tin cache cũ, check lại
        // thật vì rất có thể lần trước fail do session hết hạn chứ không phải do bài.
        force,
      });
      if (!check.canComment) {
        throw new Error(check.reason || 'Không thể comment bài này');
      }
      return this.createComment({ postId, text, session });
    };

    try {
      return await run(false);
    } catch (e) {
      if (e.message?.includes('hết hạn') || e.message?.includes('Session') || e.message?.includes('token')) {
        S.invalidateCache();
        return run(true);
      }
      throw e;
    }
  },
};
})();

// ----- fbGroupsBg.js -----
(function () {
globalThis.GF = globalThis.GF || {};
/**
 * Lấy nhóm đã tham gia qua session Chrome + GraphQL nội bộ FB (giống Group Posting Pro).
 * Không mở/chuyển tab Facebook.
 */
const DOC_PINNED = '7740459739385247';
const DOC_UNPINNED = '7218669964900608';

const FB = globalThis.GF.fbGroupsBg = {
  session() {
    return globalThis.GF.fbSessionBg;
  },

  async hasFbLogin() {
    return this.session().hasFbLogin();
  },

  isLoginPage(html) {
    return this.session().isLoginPage(html);
  },

  async resolveSession() {
    return this.session().resolveSession();
  },

  async graphqlRequest(session, friendlyName, docId, variables) {
    const { json } = await this.session().graphqlRequest(session, friendlyName, docId, variables);
    return json;
  },

  collectGroupEdges(map, edges) {
    const GP = globalThis.GF.groupParse;
    (edges || []).forEach((edge) => {
      const node = edge?.node;
      const id = node?.id ? String(node.id) : '';
      const name = String(node?.name || '').trim();
      if (!id || !name) return;
      const meta = GP?.parseGroupMeta ? GP.parseGroupMeta(node, JSON.stringify(edge)) : {};
      const entry = {
        id,
        name,
        href: `https://www.facebook.com/groups/${id}/`,
        privacy: meta.privacy || 'UNKNOWN',
        join_role: meta.join_role || null,
        post_approval: meta.post_approval || 'unknown',
        requires_approval: meta.post_approval === 'required',
      };
      const existing = map.get(id);
      map.set(id, existing && GP?.mergeGroupEntry ? GP.mergeGroupEntry(existing, entry) : entry);
    });
  },

  mergeGroupLists(primary, secondary) {
    const GP = globalThis.GF.groupParse;
    const map = new Map();
    (secondary || []).forEach((g) => map.set(String(g.id), g));
    (primary || []).forEach((g) => {
      const prev = map.get(String(g.id));
      map.set(String(g.id), prev && GP?.mergeGroupEntry ? GP.mergeGroupEntry(prev, g) : g);
    });
    return [...map.values()];
  },

  needsMetaEnrich(group) {
    return group?.privacy === 'UNKNOWN'
      || group?.post_approval === 'unknown'
      || group?.post_approval == null
      || !group?.join_role
      || group?.invite_permission === 'unknown'
      || group?.invite_permission == null;
  },

  async loadDocIds() {
    const GMS = globalThis.GF?.groupMetaStore;
    return GMS ? GMS.getDocIds() : {};
  },

  async fetchGroupPageHtml(groupId, path = '') {
    const S = this.session();
    const res = await S.fetchWithRetry(`https://www.facebook.com/groups/${groupId}${path}`, {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    return { html: await res.text(), ok: res.ok };
  },

  async fetchGroupMetaGraphql(groupId, session, docIds) {
    const GP = globalThis.GF.groupParse;
    const names = GP?.ABOUT_QUERY_NAMES || [];
    const varSets = [
      { groupID: String(groupId), scale: 1 },
      { group_id: String(groupId), scale: 1 },
      { id: String(groupId), scale: 1 },
      { groupID: String(groupId), inviteShortLinkKey: null, isChainingRecommendationUnit: false, scale: 1 },
    ];

    for (const name of names) {
      const docId = docIds[name];
      if (!docId) continue;
      for (const variables of varSets) {
        try {
          const json = await this.graphqlRequest(session, name, docId, variables);
          const meta = GP.parseGroupMetaFromGraphqlJson(json, groupId);
          if (meta.privacy !== 'UNKNOWN' || meta.post_approval !== 'unknown') {
            return { ...meta, meta_source: 'graphql_about' };
          }
        } catch {
          // thử biến / query khác
        }
      }
    }
    return null;
  },

  async enrichSingleGroup(g, session, docIds) {
    const GP = globalThis.GF.groupParse;
    const GMS = globalThis.GF.groupMetaStore;
    const S = this.session();
    let current = { ...g };

    const needsPrivacy = current.privacy === 'UNKNOWN';
    const needsApproval = current.post_approval === 'unknown' || current.post_approval == null;
    const needsRole = !current.join_role;
    const needsInvite = current.invite_permission === 'unknown' || current.invite_permission == null;
    if (!needsPrivacy && !needsApproval && !needsRole && !needsInvite) return current;

    const gqlMeta = await this.fetchGroupMetaGraphql(g.id, session, docIds);
    if (gqlMeta) {
      current = { ...current, ...GP.mergeGroupMeta(current, gqlMeta) };
      const doneNow = current.privacy !== 'UNKNOWN'
        && current.post_approval !== 'unknown'
        && (current.join_role || !needsRole)
        && (current.invite_permission !== 'unknown' && current.invite_permission != null || !needsInvite);
      if (doneNow) return current;
    }

    for (const path of ['/about', '/']) {
      const done = current.privacy !== 'UNKNOWN'
        && current.post_approval !== 'unknown'
        && (current.join_role || !needsRole)
        && (current.invite_permission !== 'unknown' && current.invite_permission != null || !needsInvite);
      if (done) break;
      try {
        const { html, ok } = await this.fetchGroupPageHtml(g.id, path === '/' ? '' : path);
        if (!ok || S.isLoginPage(html)) break;

        if (path === '/about' && GP?.findAboutDocIdsInHtml) {
          const discovered = GP.findAboutDocIdsInHtml(html);
          if (Object.keys(discovered).length && GMS) {
            await GMS.saveDocIds(discovered);
            Object.assign(docIds, discovered);
            const gql2 = await this.fetchGroupMetaGraphql(g.id, session, docIds);
            if (gql2) current = { ...current, ...GP.mergeGroupMeta(current, gql2) };
          }
        }

        const pageMeta = GP.parseGroupMetaFromPage(html, g.id);
        if (pageMeta.privacy !== 'UNKNOWN'
          || pageMeta.post_approval !== 'unknown'
          || pageMeta.join_role
          || (pageMeta.invite_permission && pageMeta.invite_permission !== 'unknown')) {
          current = {
            ...current,
            ...GP.mergeGroupMeta(current, { ...pageMeta, meta_source: path === '/about' ? 'about_html' : 'group_html' }),
          };
        }
      } catch {
        // thử path khác
      }
    }

    return current;
  },

  async enrichGroupsMetadata(groups, { max = 80, delayMs = 280 } = {}) {
    let docIds = await this.loadDocIds();
    let session;
    try {
      session = await this.resolveSession();
    } catch {
      return groups;
    }

    const map = new Map((groups || []).map((g) => [String(g.id), { ...g }]));
    const targets = (groups || []).filter((g) => this.needsMetaEnrich(g)).slice(0, max);

    for (const g of targets) {
      try {
        const enriched = await this.enrichSingleGroup(g, session, docIds);
        map.set(String(g.id), enriched);
      } catch {
        // skip group
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsGraphqlLite() {
    const session = await this.resolveSession();
    const map = new Map();

    const pinned = await this.graphqlRequest(
      session,
      'GroupsCometPinnedGroupsDialogQuery',
      DOC_PINNED,
      { ordering: ['viewer_added'], scale: 1 },
    );
    const viewer = pinned?.data?.viewer;
    if (!viewer) throw new Error('GraphQL không trả viewer — session có thể hết hạn');

    this.collectGroupEdges(map, viewer.groups_tab?.pinned_groups?.edges);
    this.collectGroupEdges(map, viewer.groups_tab?.tab_groups_list?.edges);

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsGraphql() {
    const session = await this.resolveSession();
    const map = new Map();

    const pinned = await this.graphqlRequest(
      session,
      'GroupsCometPinnedGroupsDialogQuery',
      DOC_PINNED,
      { ordering: ['viewer_added'], scale: 1 },
    );
    const viewer = pinned?.data?.viewer;
    if (!viewer) throw new Error('GraphQL không trả viewer — session có thể hết hạn');

    this.collectGroupEdges(map, viewer.groups_tab?.pinned_groups?.edges);
    const tabList = viewer.groups_tab?.tab_groups_list;
    this.collectGroupEdges(map, tabList?.edges);

    let hasNext = tabList?.page_info?.has_next_page;
    let cursor = tabList?.page_info?.end_cursor;
    let page = 1;

    while (hasNext && cursor && page < 50) {
      await new Promise((r) => setTimeout(r, 400));
      const pageRes = await this.graphqlRequest(
        session,
        'GroupsCometUnpinnedGroupsPaginationListPaginatedQuery',
        DOC_UNPINNED,
        { count: 50, cursor, ordering: ['viewer_added'], scale: 1 },
      );
      const list = pageRes?.data?.viewer?.groups_tab?.tab_groups_list;
      if (!list) break;
      this.collectGroupEdges(map, list.edges);
      hasNext = list.page_info?.has_next_page;
      cursor = list.page_info?.end_cursor;
      page += 1;
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsHtmlFallback() {
    const res = await this.session().fetchWithRetry('https://www.facebook.com/groups/joins/', {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`Facebook trả HTTP ${res.status}`);
    const html = await res.text();
    if (this.isLoginPage(html)) {
      throw new Error('Session Facebook hết hạn — mở facebook.com một lần');
    }
    const GP = globalThis.GF.groupParse;
    if (!GP) return [];
    return GP.parseJoinedGroupsFromHtml(html, { onJoinsPage: true, relaxed: true });
  },

  async fetchJoinedGroupsLite() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    try {
      const groups = await this.fetchJoinedGroupsGraphqlLite();
      if (!groups.length) {
        return { groups: [], error: 'GraphQL chưa trả nhóm — bấm ↻ hoặc mở facebook.com' };
      }
      return { groups, count: groups.length };
    } catch (e) {
      return { groups: [], error: e.message };
    }
  },

  /** GraphQL đủ trang + HTML joins (SW only, không cuộn tab) — Ctrl+↻ */
  async fetchJoinedGroupsQuick() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    let groups = [];
    let lastError = null;

    try {
      groups = await this.fetchJoinedGroupsGraphql();
    } catch (e) {
      lastError = e.message;
    }

    try {
      const htmlGroups = await this.fetchJoinedGroupsHtmlFallback();
      if (htmlGroups.length) {
        groups = this.mergeGroupLists(groups, htmlGroups);
      }
    } catch (e) {
      if (!groups.length) lastError = e.message;
    }

    if (!groups.length) {
      return { groups: [], error: lastError || 'Không lấy được danh sách nhóm' };
    }

    return { groups, count: groups.length };
  },

  async fetchJoinedGroups() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    const quick = await this.fetchJoinedGroupsQuick();
    if (!quick.groups?.length) return quick;

    const enriched = await this.enrichGroupsMetadata(quick.groups, {
      max: Math.min(quick.groups.length, 100),
    });

    return { groups: enriched, count: enriched.length };
  },
};
})();
