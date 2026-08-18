'use strict';
// IndexedDB persistence for a browser-hosted world. The host's tab is the server, so
// it is also the only place player saves live — this is the browser equivalent of the
// Node server's `server/players/*.json`.
//
// IndexedDB rather than localStorage: saves are structured objects, there are many of
// them, and localStorage's synchronous ~5 MB budget is shared with everything else the
// page keeps. Two stores:
//   accounts — one row per character: credentials (salt + PRS) and the sim save blob
//   meta     — singletons: the world's peer id and its invite credential
const Store = {
  NAME: 'rune-classic-world',
  VERSION: 1,
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(this.NAME, this.VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'name' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async _tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      // Resolve on the request, not the transaction, so callers get the value back.
      if (req) { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }
      else tx.oncomplete = () => resolve();
    });
  },

  get(store, key) { return this._tx(store, 'readonly', s => s.get(key)); },
  all(store) { return this._tx(store, 'readonly', s => s.getAll()); },
  put(store, value) { return this._tx(store, 'readwrite', s => s.put(value)); },
  del(store, key) { return this._tx(store, 'readwrite', s => s.delete(key)); },

  // Whether persistence is usable at all. Private-browsing modes in some browsers
  // expose `indexedDB` but throw on open, so callers should still catch.
  available() { return typeof indexedDB !== 'undefined'; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Store };
