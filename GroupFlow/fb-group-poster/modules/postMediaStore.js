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
