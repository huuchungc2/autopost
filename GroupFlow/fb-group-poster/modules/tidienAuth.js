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

  // 2026-07-10 — mã định danh máy, sinh 1 lần rồi lưu vĩnh viễn trong chrome.storage.local (per
  // Chrome profile/install — đúng phạm vi "1 máy" cần cho việc giới hạn số thiết bị/license key
  // theo plan, xem POST /user-auth/validate-key backend). KHÔNG xoá khi user "Đăng xuất" key (xem
  // nút xoá licenseKey/licenseInfo, sidepanel.js) — cùng máy đăng nhập lại vẫn phải tính là cùng 1
  // thiết bị, không phải mọc thêm slot mới mỗi lần logout/login.
  async getDeviceId() {
    const d = await chrome.storage.local.get('gfDeviceId');
    if (d.gfDeviceId) return d.gfDeviceId;
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ gfDeviceId: id });
    return id;
  },
};
