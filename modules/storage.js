// modules/_storage.js
// Універсальне сховище для всіх модулів на базі IndexedDB.
// Використання:
//   await storage.set("credit", "data", [...]);
//   const data = await storage.get("credit", "data", []);
//   await storage.remove("credit", "data");
//   const all = await storage.getAll();

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
        req.onsuccess = () => {
          resolve(req.result !== undefined ? req.result : fallback);
        };
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
  },

  // Витягнути всі дані по модулю (для пакетного експорту)
  async getAllForModule(moduleId) {
    try {
      const db = await openDB();
      const prefix = `${moduleId}::`;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const result = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const k = cursor.key;
            if (typeof k === "string" && k.startsWith(prefix)) {
              result[k.slice(prefix.length)] = cursor.value;
            }
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("storage.getAllForModule:", e);
      return {};
    }
  },

  // Витягнути ВСІ дані зі сховища (для повного бекапу)
  async getAll() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const result = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            result[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("storage.getAll:", e);
      return {};
    }
  }
};