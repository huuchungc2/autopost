window.GF = window.GF || {};

GF.googleDrive = {
  async parseServiceAccount(jsonText) {
    try {
      return JSON.parse(jsonText);
    } catch {
      throw new Error('JSON Service Account không hợp lệ');
    }
  },

  base64url(data) {
    return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  async signJwt(sa) {
    const header = this.base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const claim = this.base64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
    const input = `${header}.${claim}`;
    const pem = sa.private_key.replace(/\\n/g, '\n');
    const keyBuf = await crypto.subtle.importKey(
      'pkcs8',
      this.pemToArrayBuffer(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyBuf, new TextEncoder().encode(input));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${input}.${sigB64}`;
  },

  pemToArrayBuffer(pem) {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  },

  async getAccessToken(sa) {
    const jwt = await this.signJwt(sa);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || 'Drive auth thất bại');
    return data.access_token;
  },

  async uploadBase64(base64, mime, filename, folderId, saJson) {
    const sa = await this.parseServiceAccount(saJson);
    const token = await this.getAccessToken(sa);
    const blob = GF.imageGen.base64ToBlob(base64, mime);
    const metadata = { name: filename, parents: folderId ? [folderId] : undefined };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Upload Drive thất bại');
    return data.id;
  },

  async downloadFile(fileId, saJson) {
    const sa = await this.parseServiceAccount(saJson);
    const token = await this.getAccessToken(sa);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Tải ảnh từ Drive thất bại');
    return res.blob();
  },

  async testConnection(saJson, folderId) {
    const sa = await this.parseServiceAccount(saJson);
    const token = await this.getAccessToken(sa);
    if (!folderId) return { ok: true, message: 'Token Drive hợp lệ' };
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Folder không truy cập được');
    return { ok: true, message: data.name };
  },
};
