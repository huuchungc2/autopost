window.GF = window.GF || {};

const IDB_NAME = 'groupflow-fs';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'imageSaveDir';

GF.imageFolder = {
  _db: null,

  async openDb() {
    if (this._db) return this._db;
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._db;
  },

  async saveHandle(handle) {
    const db = await this.openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await chrome.storage.local.set({ imageSaveDirName: handle.name });
  },

  async loadHandle() {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async pickFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('Trình duyệt không hỗ trợ chọn thư mục — dùng Downloads hoặc bật saveAs');
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await this.saveHandle(handle);
    return handle.name;
  },

  async getMode() {
    const d = await chrome.storage.local.get([
      'imageSaveMode', 'imageSaveLocal', 'imageSaveSubfolder', 'imageSaveDirName', 'imageSaveAskEachTime',
    ]);
    return {
      enabled: d.imageSaveLocal !== false,
      mode: d.imageSaveMode || 'downloads',
      subfolder: d.imageSaveSubfolder || 'GroupFlow',
      dirName: d.imageSaveDirName || '',
      askEachTime: d.imageSaveAskEachTime === true,
    };
  },

  base64ToBlob(base64, mime = 'image/png') {
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  },

  async saveImage(base64, filename, settings) {
    const cfg = settings || await this.getMode();
    if (!cfg.enabled) return;

    const safeName = String(filename || `groupflow-${Date.now()}.png`).replace(/[/\\]/g, '-');
    const blob = this.base64ToBlob(base64);

    if (cfg.askEachTime) {
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({ url, filename: safeName, saveAs: true });
      URL.revokeObjectURL(url);
      return;
    }

    if (cfg.mode === 'folder') {
      try {
        const handle = await this.loadHandle();
        if (handle) {
          const perm = await handle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted') {
            const req = await handle.requestPermission({ mode: 'readwrite' });
            if (req !== 'granted') throw new Error('Chưa có quyền ghi thư mục');
          }
          const fileHandle = await handle.getFileHandle(safeName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        }
      } catch (e) {
        console.warn('[GroupFlow] imageFolder save failed, fallback Downloads', e);
      }
    }

    const sub = String(cfg.subfolder || 'GroupFlow').replace(/^[/\\]+|[/\\]+$/g, '');
    const path = sub ? `${sub}/${safeName}` : safeName;
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: path, saveAs: false });
    URL.revokeObjectURL(url);
  },
};
