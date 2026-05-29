// IndexedDB layer using idb library
let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await idb.openDB('cellier', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const wines = db.createObjectStore('wines', { keyPath: 'id', autoIncrement: true });
        wines.createIndex('region', 'region');
        wines.createIndex('grape', 'grape');
        wines.createIndex('vintage', 'vintage');

        const notes = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        notes.createIndex('wineId', 'wineId');

        db.createObjectStore('wishlist', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('wishlist')) {
          db.createObjectStore('wishlist', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }
    }
  });
  return _db;
}

// ── Wines ────────────────────────────────────────────────────────────────────

async function getAllWines() {
  const db = await getDB();
  return db.getAll('wines');
}

async function getWine(id) {
  const db = await getDB();
  return db.get('wines', id);
}

async function addWine(wine) {
  const db = await getDB();
  wine.createdAt = new Date().toISOString();
  return db.add('wines', wine);
}

async function updateWine(wine) {
  const db = await getDB();
  wine.updatedAt = new Date().toISOString();
  return db.put('wines', wine);
}

async function deleteWine(id) {
  const db = await getDB();
  const tx = db.transaction(['wines', 'notes'], 'readwrite');
  await tx.objectStore('wines').delete(id);
  const noteIdx = tx.objectStore('notes').index('wineId');
  let cursor = await noteIdx.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

async function adjustQuantity(id, delta) {
  const db = await getDB();
  const wine = await db.get('wines', id);
  if (!wine) return;
  wine.quantity = Math.max(0, (wine.quantity || 0) + delta);
  wine.updatedAt = new Date().toISOString();
  return db.put('wines', wine);
}

// ── Tasting Notes ─────────────────────────────────────────────────────────────

async function getNotesByWine(wineId) {
  const db = await getDB();
  return db.getAllFromIndex('notes', 'wineId', wineId);
}

async function addNote(note) {
  const db = await getDB();
  note.date = note.date || new Date().toISOString().slice(0, 10);
  return db.add('notes', note);
}

async function deleteNote(id) {
  const db = await getDB();
  return db.delete('notes', id);
}

// ── Wishlist ──────────────────────────────────────────────────────────────────

async function getWishlist() {
  const db = await getDB();
  return db.getAll('wishlist');
}

async function addToWishlist(item) {
  const db = await getDB();
  item.addedAt = new Date().toISOString();
  return db.add('wishlist', item);
}

async function removeFromWishlist(id) {
  const db = await getDB();
  return db.delete('wishlist', id);
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSetting(key) {
  const db = await getDB();
  const row = await db.get('settings', key);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  const db = await getDB();
  return db.put('settings', { key, value });
}

window.DB = {
  getAllWines, getWine, addWine, updateWine, deleteWine, adjustQuantity,
  getNotesByWine, addNote, deleteNote,
  getWishlist, addToWishlist, removeFromWishlist,
  getSetting, setSetting
};
