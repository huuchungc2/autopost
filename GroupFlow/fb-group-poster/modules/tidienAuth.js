window.GF = window.GF || {};

// login()/testConnection()/saveFbProfile() (kiểu đăng nhập email/password cũ) đã bỏ hẳn — zero
// caller trong toàn bộ codebase, và route backend PATCH .../commented mà saveFbProfile-adjacent
// flow từng phụ thuộc cũng đã xoá khi gộp bảng (migration 039). License key là danh tính DUY NHẤT
// còn dùng — xem docs/GROUPFLOW.md.
GF.tidienAuth = {
  async apiBase() {
    const s = await GF.storage.getSettings();
    return s.tidienBaseUrl.replace(/\/$/, '');
  },

  async authHeader() {
    const { licenseKey } = await chrome.storage.local.get('licenseKey');
    if (!licenseKey) throw new Error('Chưa kích hoạt license key');
    return { Authorization: `Bearer ${licenseKey}` };
  },
};
