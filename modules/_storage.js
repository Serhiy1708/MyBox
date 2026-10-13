// modules/_storage.js
const DB_NAME = "MyBoxDB";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export const storage = {
  async get(moduleId, key, fallback = null) {
    try {
      const db = await openDB();
      const fullKey = `${moduleId}::${key}`;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(fullKey);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : fallback);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("storage.get:", e);
      return fallback;
    }
  },

  async set(moduleId, key, value) {
    try {
      const db = await openDB();
      const fullKey = `${moduleId}::${key}`;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, fullKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("storage.set:", e);
    }
  },

  async remove(moduleId, key) {
    try {
      const db = await openDB();
      const fullKey = `${moduleId}::${key}`;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(fullKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("storage.remove:", e);
    }
  }
};