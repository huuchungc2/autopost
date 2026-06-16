const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';

/** URL hiển thị ảnh trong UI (local, https, Google Drive). */
export function mediaSrc(url) {
  if (!url) return null;
  if (url.startsWith('gdrive://')) {
    const id = url.slice('gdrive://'.length);
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE}${url}`;
}
