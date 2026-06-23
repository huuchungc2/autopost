window.GF = window.GF || {};

GF.imageGen = {
  async generate(prompt, apiKey, baseUrl) {
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

  async generateComment(noiDung, apiKey, baseUrl) {
    const url = `${(baseUrl || 'https://tidien.xyz').replace(/\/$/, '')}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cx/gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: `Viết 1 comment ngắn tự nhiên để đẩy bài Facebook sau, không quảng cáo lộ liễu:\n${noiDung}`,
          },
        ],
        max_tokens: 120,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || data.error || 'Generate comment thất bại');
    return data.choices?.[0]?.message?.content?.trim() || '';
  },

  base64ToBlob(base64, mime = 'image/png') {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  async saveLocal(base64, filename) {
    const blob = this.base64ToBlob(base64);
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: filename || `groupflow-${Date.now()}.png`, saveAs: false });
    URL.revokeObjectURL(url);
  },
};
