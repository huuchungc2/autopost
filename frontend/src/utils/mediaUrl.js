const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/** URL hiển thị ảnh trong UI (local, https, Google Drive qua proxy backend). */
export function mediaSrc(url) {
  if (!url) return null;
  if (url.startsWith('gdrive://')) {
    const token = window.localStorage.getItem('autopost_token');
    const ref = encodeURIComponent(url);
    if (token) {
      return `${API_BASE}/media/image?ref=${ref}&access_token=${encodeURIComponent(token)}`;
    }
    const id = url.slice('gdrive://'.length);
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const publicBase = API_BASE.replace(/\/api$/, '');
  return `${publicBase}${url}`;
}
