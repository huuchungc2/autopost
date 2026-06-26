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
