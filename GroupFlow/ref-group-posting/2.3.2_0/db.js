/*!
 * Group Posting Pro - Centralized IndexedDB Manager
 */

const DB_NAME = "GPP_Database";
const DB_VERSION = 2; // Bumped to 2 to introduce the media store
const STORE_HISTORY = "postingHistory";
const STORE_MEDIA = "media"; // Replaces the old scattered 'videos' store

class GPPDatabase {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  // --- CORE INITIALIZATION ---
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error("[GPPDB] IndexedDB error:", event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. History Store
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          const historyStore = db.createObjectStore(STORE_HISTORY, {
            keyPath: "id",
          });
          historyStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        // 2. Media Store (New unified store for videos/images)
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const mediaStore = db.createObjectStore(STORE_MEDIA, {
            keyPath: "id",
          });
          mediaStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  // ==========================================
  // HISTORY MANAGEMENT
  // ==========================================

  async addHistory(entry) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readwrite");
      const store = transaction.objectStore(STORE_HISTORY);

      if (!entry.id)
        entry.id =
          "hist_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      if (!entry.timestamp) entry.timestamp = Date.now();

      const request = store.put(entry);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async updateHistory(id, entryUpdates) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readwrite");
      const store = transaction.objectStore(STORE_HISTORY);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        let entry = getRequest.result || { id };
        entry = { ...entry, ...entryUpdates };

        const putRequest = store.put(entry);
        putRequest.onsuccess = () => resolve(entry);
        putRequest.onerror = (e) => reject(e.target.error);
      };
      getRequest.onerror = (e) => reject(e.target.error);
    });
  }

  async getHistoryById(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readonly");
      const store = transaction.objectStore(STORE_HISTORY);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Fetches ALL history (Used for searching/filtering in the UI)
  async getAllHistory() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readonly");
      const store = transaction.objectStore(STORE_HISTORY);
      const index = store.index("timestamp");

      const request = index.openCursor(null, "prev"); // Sort descending
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // NEW: Paginated fetch to save RAM on initial load
  async getHistoryPaginated(limit = 20, offset = 0) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readonly");
      const store = transaction.objectStore(STORE_HISTORY);
      const index = store.index("timestamp");
      const request = index.openCursor(null, "prev");

      const results = [];
      let advanced = false;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(results);
          return;
        }

        // Fast-forward cursor if offset is provided
        if (offset > 0 && !advanced) {
          advanced = true;
          cursor.advance(offset);
          return;
        }

        if (results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // NEW: Fetch history strictly within a time frame (Saves massive amounts of RAM)
  async getHistorySince(minTimestamp) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readonly");
      const store = transaction.objectStore(STORE_HISTORY);
      const index = store.index("timestamp");

      // Get all records where timestamp >= minTimestamp
      const range = IDBKeyRange.lowerBound(minTimestamp);
      const request = index.getAll(range);

      request.onsuccess = () => {
        // getAll returns ascending by default. Reverse it to match UI expectations.
        const results = request.result || [];
        resolve(results.reverse());
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // NEW: Fetch history strictly within a specific start and end time (For Graph Day Clicks)
  async getHistoryByDateRange(minTimestamp, maxTimestamp) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_HISTORY], "readonly");
      const store = transaction.objectStore(STORE_HISTORY);
      const index = store.index("timestamp");

      // Get all records between the start and end of the day
      const range = IDBKeyRange.bound(minTimestamp, maxTimestamp);
      const request = index.getAll(range);

      request.onsuccess = () => {
        // Reverse to show newest posts at the top
        const results = request.result || [];
        resolve(results.reverse());
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }
  // ==========================================
  // MEDIA (VIDEO/IMAGE) MANAGEMENT
  // ==========================================

  async saveMedia(id, blob, mimeType) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_MEDIA], "readwrite");
      const store = transaction.objectStore(STORE_MEDIA);
      const request = store.put({
        id: id,
        blob: blob,
        type: mimeType,
        timestamp: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getMedia(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_MEDIA], "readonly");
      const store = transaction.objectStore(STORE_MEDIA);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteMedia(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_MEDIA], "readwrite");
      const store = transaction.objectStore(STORE_MEDIA);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

// Export for Modules or Global for background/popup/worker
if (typeof module !== "undefined" && module.exports) {
  module.exports = { GPPDatabase };
} else {
  globalThis.GPPDB = new GPPDatabase();
}
