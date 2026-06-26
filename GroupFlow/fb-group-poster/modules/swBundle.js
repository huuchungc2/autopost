/* AUTO-GENERATED — chạy: node build-sw-bundle.js */

// ----- gfShared.js -----
(function () {
/** Shared GF namespace — dùng trong SW bundle (IIFE) và content script. */
globalThis.GF = globalThis.GF || {};
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
})();

// ----- groupParse.js -----
(function () {
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
/**
 * Session Facebook + GraphQL từ service worker (cookie Chrome, không cần tab FB).
 */
const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';

const S = globalThis.GF.fbSessionBg = {
  _cache: null,
  _cacheAt: 0,
  CACHE_MS: 5 * 60 * 1000,
  reqCounter: 1,

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

  parseGraphqlJson(text) {
    const cleaned = this.stripFbJsonPrefix(text);
    const lines = cleaned.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.errors?.length) {
          throw new Error(json.errors[0]?.message || 'GraphQL lỗi');
        }
        return json;
      } catch (e) {
        if (e.message && !e.message.startsWith('Unexpected token')) throw e;
      }
    }
    return JSON.parse(cleaned);
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
    return {
      uid,
      personalId: uid,
      dtsg,
      lsd,
      jazoest: '25669',
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

  async resolveSession({ force = false, actorId: preferredActorId } = {}) {
    if (!force && this._cache && Date.now() - this._cacheAt < this.CACHE_MS) {
      const s = { ...this._cache };
      if (preferredActorId) s.actorId = String(preferredActorId);
      return s;
    }
    if (!(await this.hasFbLogin())) {
      throw new Error('Chưa đăng nhập Facebook trên Chrome');
    }
    const html = await this.fetchAuthHtml();
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
    this._cache = { ...session };
    this._cacheAt = Date.now();
    return session;
  },

  invalidateCache() {
    this._cache = null;
    this._cacheAt = 0;
  },

  buildGraphqlBody(session, friendlyName, docId, variables) {
    const apiUser = session.personalId || session.uid;
    const body = new URLSearchParams();
    body.set('av', session.actorId || session.uid);
    body.set('__user', apiUser);
    body.set('__a', '1');
    body.set('__comet_req', '15');
    body.set('__req', (this.reqCounter++).toString(36));
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
    return body;
  },

  graphqlHeaders(session, friendlyName) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-ASBD-ID': '129477',
      'X-FB-Friendly-Name': friendlyName,
      Origin: 'https://www.facebook.com',
      Referer: 'https://www.facebook.com/',
    };
    if (session.lsd) headers['X-FB-LSD'] = session.lsd;
    return headers;
  },

  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i += 1) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 15000 + i * 5000));
          continue;
        }
        if (res.status >= 500 && i < retries - 1) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        return res;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw new Error('Fetch thất bại sau nhiều lần thử');
  },

  async graphqlRequest(session, friendlyName, docId, variables) {
    const body = this.buildGraphqlBody(session, friendlyName, docId, variables);
    const res = await this.fetchWithRetry(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: this.graphqlHeaders(session, friendlyName),
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = this.parseGraphqlJson(text);
    return { json, text };
  },
};
})();

// ----- postFormat.js -----
(function () {
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
/**
 * Đăng group qua GraphQL nền (không mở tab Facebook) — học từ Group Posting Pro directApi.
 */
const DOC_COMPOSER_POST = '24010394355227871';

const FP = globalThis.GF.fbPostBg = {
  base64ToBlob(base64, mime = 'image/png') {
    const raw = String(base64).replace(/^data:[^;]+;base64,/, '');
    const bin = atob(raw);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  parseFbErrors(rawText) {
    const t = String(rawText || '').toLowerCase();
    if (/rate_limit|rate limit|temporarily blocked|you can't post right now|action_blocked/.test(t)) {
      return { critical: true, message: 'Facebook giới hạn tạm thời — dừng đăng, thử lại sau' };
    }
    if (/checkpoint|account restricted/.test(t)) {
      return { critical: true, message: 'Tài khoản FB bị checkpoint/hạn chế' };
    }
    if (/please log in|not logged in|session|expired/.test(t)) {
      return { auth: true, message: 'Session Facebook hết hạn — mở facebook.com' };
    }
    if (/permission|does_not_have_permission/.test(t)) {
      return { soft: true, message: 'Không có quyền đăng vào nhóm này' };
    }
    return null;
  },

  extractPostId(json, rawText) {
    const story = json?.data?.story_create?.story;
    let id = json?.data?.story_create?.story_id
      || json?.data?.story_create?.post_id
      || story?.legacy_story_hideable_id
      || story?.id;
    if (id && !/^\d+$/.test(String(id))) {
      try {
        const m = atob(String(id)).match(/(?:VK:|:)(\d+)(?:\D|$)/);
        if (m) id = m[1];
      } catch { /* ignore */ }
    }
    if (!id) {
      const m = String(rawText).match(/"legacy_story_hideable_id":"(\d+)"/)
        || String(rawText).match(/"story_id":"(\d+)"/)
        || String(rawText).match(/"post_id":"(\d+)"/);
      id = m?.[1];
    }
    return id ? String(id) : null;
  },

  async uploadPhoto(imageBase64, session, groupId, mime = 'image/png') {
    const S = globalThis.GF.fbSessionBg;
    const blob = this.base64ToBlob(imageBase64, mime);
    const uploadId = `gf-${Date.now()}`;
    const apiUser = session.personalId || session.uid;
    const url = new URL('https://upload.facebook.com/ajax/react_composer/attachments/photo/upload');
    url.searchParams.set('av', session.actorId || session.uid);
    url.searchParams.set('__user', apiUser);
    url.searchParams.set('__a', '1');
    url.searchParams.set('__comet_req', '15');
    url.searchParams.set('fb_dtsg', session.dtsg || session.fb_dtsg);
    if (session.lsd) url.searchParams.set('lsd', session.lsd);

    const form = new FormData();
    form.append('source', '8');
    form.append('profile_id', session.actorId || session.uid);
    form.append('target_id', groupId);
    form.append('upload_id', uploadId);
    form.append('farr', blob, 'groupflow.png');

    const res = await S.fetchWithRetry(url.toString(), {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    const text = await res.text();
    let photoId = text.match(/"photoID":"(\d+)"/)?.[1]
      || text.match(/"photo_id":"(\d+)"/)?.[1];
    if (!photoId) {
      try {
        const j = JSON.parse(S.stripFbJsonPrefix(text));
        photoId = j?.payload?.photoID || j?.payload?.photo_id;
      } catch { /* ignore */ }
    }
    if (!photoId) throw new Error('Upload ảnh thất bại');
    return String(photoId);
  },

  buildComposeVariables({ groupId, text, attachments, session, backgroundColor }) {
    const mutationId = String(Date.now());
    const token = `gf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const variables = {
      input: {
        composer_entry_point: 'inline_composer',
        composer_source_surface: 'group',
        composer_type: 'group',
        logging: { composer_session_id: token },
        source: 'WWW',
        message: { ranges: [], text },
        attachments,
        audience: { to_id: String(groupId) },
        actor_id: session.actorId || session.uid,
        client_mutation_id: mutationId,
        idempotence_token: token,
        navigation_data: {
          attribution_id_v2: 'CometGroupDiscussionRoot.react,comet.group,tap_bookmark,,,,,',
        },
      },
      feedLocation: 'GROUP',
      feedbackSource: 0,
      focusCommentID: null,
      groupID: String(groupId),
      scale: 1,
      privacySelectorRenderLocation: 'COMET_STREAM',
      renderLocation: 'group',
      useDefaultActor: false,
      isFeed: false,
      isGroup: true,
      isTimeline: false,
      isPageNewsFeed: false,
      isEvent: false,
      isFundraiser: false,
    };
    const PF = globalThis.GF?.postFormat;
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
    const attachments = [];
    for (const img of imgList) {
      const photoId = await this.uploadPhoto(img.base64, session, groupId, img.mime || 'image/png');
      attachments.push({ photo: { id: photoId } });
    }

    const variables = this.buildComposeVariables({ groupId, text, attachments, session, backgroundColor });
    const { json, text: rawText } = await S.graphqlRequest(
      session,
      'ComposerStoryCreateMutation',
      DOC_COMPOSER_POST,
      variables,
    );

    const err = this.parseFbErrors(rawText);
    if (err?.critical) throw new Error(err.message);
    if (err?.auth) {
      S.invalidateCache();
      throw new Error(err.message);
    }

    const pending = /requires_approval|pending_approval|is_pending/i.test(rawText);
    const postId = this.extractPostId(json, rawText);

    if (postId) {
      return {
        postId,
        mode: 'fast-bg',
        url: `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`,
      };
    }
    if (pending) {
      return {
        postId: 'pending',
        status: 'pending_approval',
        mode: 'fast-bg',
        url: `https://www.facebook.com/groups/${groupId}/`,
        warning: 'Đã gửi — chờ admin duyệt',
      };
    }
    if (err?.soft) throw new Error(err.message);
    throw new Error('Đăng GraphQL không trả post_id');
  },

  async postToGroup({ groupId, text, imageBase64, images, mediaMime, actorId, backgroundColor }) {
    const S = globalThis.GF.fbSessionBg;
    let session;
    try {
      session = await S.resolveSession({ actorId });
      return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
    } catch (e) {
      if (e.message?.includes('hết hạn') || e.message?.includes('fb_dtsg') || e.message?.includes('token')) {
        S.invalidateCache();
        session = await S.resolveSession({ force: true, actorId });
        return await this.createGroupPost({ groupId, text, imageBase64, images, mediaMime, session, backgroundColor });
      }
      throw e;
    }
  },
};
})();

// ----- fbCommentBg.js -----
(function () {
/**
 * Comment group qua GraphQL nền (không mở tab Facebook) — port từ GPP worker.js H()/q().
 */
const DOC_COMMENT = '9550500205043457';
const DOC_TYPING_START = '5359232510868548';
const DOC_TYPING_STOP = '6911603175550464';

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
    return `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`;
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
        return { canComment: false, reason: 'Bài không tồn tại (404) — có thể bị xóa hoặc chờ duyệt' };
      }
      if (!res.ok) {
        return { canComment: false, reason: `Không đọc được bài (HTTP ${res.status})` };
      }
      const html = await res.text();
      if (html.includes("This content isn't available at the moment")) {
        return { canComment: false, reason: 'Bài đã bị xóa hoặc ẩn' };
      }
      if (html.includes('Your post is pending approval')) {
        return { canComment: false, reason: 'Bài đang chờ admin duyệt' };
      }
      if (html.includes('story_title') || html.includes('story_token') || html.includes('likeAction')) {
        return { canComment: true };
      }
      return { canComment: false, reason: 'Không xác nhận được bài (có thể pending/hạn chế)' };
    } catch (e) {
      return { canComment: false, reason: e.message || 'Lỗi kiểm tra bài' };
    }
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
    const fromJson = json?.data?.comment_create?.comment?.id
      || json?.data?.comment_create?.comment?.legacy_fbid
      || json?.data?.comment_create?.feedback_comment_edge?.node?.id;
    if (fromJson) return String(fromJson);

    const m = String(rawText).match(/\?comment_id=(\d+)/)
      || String(rawText).match(/"legacy_fbid"\s*:\s*"(\d+)"/)
      || String(rawText).match(/"comment_id"\s*:\s*"(\d+)"/);
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

    const { json, text: rawText } = await S.graphqlRequest(
      session,
      'useCometUFICreateCommentMutation',
      DOC_COMMENT,
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
      const check = await this.checkPostCommentable({
        groupId,
        postId,
        session,
        isTimeline,
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
