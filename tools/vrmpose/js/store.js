// IndexedDB 永続化。models(VRM blob) / scenes(名前付き) / kv(autosave 等)
const DB_NAME = 'vrmpose';
const DB_VER = 1;

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('models')) db.createObjectStore('models');
      if (!db.objectStoreNames.contains('scenes')) db.createObjectStore('scenes');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const idb = {
  putModel: (key, record) => tx('models', 'readwrite', s => s.put(record, key)),
  getModel: (key) => tx('models', 'readonly', s => s.get(key)),
  listModelKeys: () => tx('models', 'readonly', s => s.getAllKeys()),
  deleteModel: (key) => tx('models', 'readwrite', s => s.delete(key)),

  putScene: (name, data) => tx('scenes', 'readwrite', s => s.put(data, name)),
  getScene: (name) => tx('scenes', 'readonly', s => s.get(name)),
  listSceneNames: () => tx('scenes', 'readonly', s => s.getAllKeys()),
  deleteScene: (name) => tx('scenes', 'readwrite', s => s.delete(name)),

  putKV: (key, value) => tx('kv', 'readwrite', s => s.put(value, key)),
  getKV: (key) => tx('kv', 'readonly', s => s.get(key)),
};

/** ArrayBuffer の内容ハッシュ(モデル同定用)。secure context 外では FNV にフォールバック */
export async function hashBuffer(buf) {
  if (globalThis.crypto && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(digest)].slice(0, 12)
        .map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { /* fallthrough */ }
  }
  const view = new Uint8Array(buf);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < view.length; i++) {
    h1 = ((h1 ^ view[i]) * 0x01000193) >>> 0;
    h2 = ((h2 + view[i] + (h2 << 5)) ^ i) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + view.length.toString(16);
}
