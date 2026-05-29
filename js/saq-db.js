// SAQ product database — CSV from github.com/nicbou/saq-data
// Stored locally in IndexedDB for offline use + barcode/name lookup

const SAQ_CSV_URLS = [
  'https://raw.githubusercontent.com/nicbou/saq-data/master/saq.csv',
  'https://raw.githubusercontent.com/nicbou/saq-data/main/saq.csv',
];
const SAQ_DB_STORE = 'saqProducts';
const SAQ_META_KEY = 'saqDbMeta';

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase()
    .replace(/[éè]/g, 'e').replace(/[àâ]/g, 'a').replace(/\s+/g, '_'));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// Map CSV columns to our standard fields (flexible — handles different CSV schemas)
function normalizeRow(row, headers) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
    }
    return '';
  };

  return {
    code: get('code', 'code_saq', 'saq_code', 'id'),
    barcode: get('barcode', 'upc', 'ean', 'code_barres', 'ean13', 'code-barres'),
    name: get('name', 'nom', 'title', 'titre', 'product_name'),
    price: get('price', 'prix', 'regular_price', 'price_regular'),
    country: get('country', 'pays'),
    region: get('region'),
    appellation: get('appellation', 'designation'),
    grape: get('grape', 'cepage', 'variete', 'grape_variety', 'cépage'),
    type: get('type', 'categorie', 'category'),
    format: get('format', 'size', 'volume', 'taille'),
    description: get('description'),
    url: get('url', 'link', 'lien'),
    producer: get('producer', 'producteur', 'producer_name'),
    alcohol: get('alcohol', 'alcool', 'abv'),
    vintage: get('millesime', 'vintage', 'year', 'annee', 'année'),
  };
}

// ── IndexedDB (reuses existing DB but adds a new store) ───────────────────────

async function getSAQProductDB() {
  return idb.openDB('cellier-saq', 1, {
    upgrade(db) {
      const store = db.createObjectStore(SAQ_DB_STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('barcode', 'barcode');
      store.createIndex('name', 'name');
      store.createIndex('code', 'code');
    }
  });
}

// ── Fetch & Store ─────────────────────────────────────────────────────────────

async function fetchAndStoreSAQData(onProgress) {
  let csvText = null;
  let usedUrl = null;

  for (const url of SAQ_CSV_URLS) {
    try {
      onProgress?.('Téléchargement des données SAQ…', 10);
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      csvText = await res.text();
      usedUrl = url;
      break;
    } catch (_) { continue; }
  }

  if (!csvText) {
    throw new Error('Impossible de télécharger les données SAQ. Vérifiez votre connexion internet.');
  }

  onProgress?.('Analyse du fichier CSV…', 40);
  const { headers, rows } = parseCSV(csvText);

  if (!rows || rows.length === 0) {
    throw new Error('Fichier CSV vide ou format non reconnu.');
  }

  onProgress?.(`${rows.length} produits trouvés — stockage en cours…`, 60);

  const db = await getSAQProductDB();
  const tx = db.transaction(SAQ_DB_STORE, 'readwrite');
  await tx.objectStore(SAQ_DB_STORE).clear();

  const normalized = rows.map(row => normalizeRow(row, headers)).filter(r => r.name);
  for (const product of normalized) {
    await tx.objectStore(SAQ_DB_STORE).add(product);
  }
  await tx.done;

  // Save metadata
  const meta = {
    updatedAt: new Date().toISOString(),
    count: normalized.length,
    source: usedUrl,
    withBarcodes: normalized.filter(r => r.barcode).length,
  };
  await DB.setSetting(SAQ_META_KEY, meta);

  onProgress?.(`✅ ${normalized.length} produits SAQ chargés avec succès!`, 100);
  return meta;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

async function lookupSAQByBarcode(barcode) {
  const db = await getSAQProductDB();
  const results = await db.getAllFromIndex(SAQ_DB_STORE, 'barcode', barcode);
  return results[0] || null;
}

async function searchSAQByName(query, limit = 8) {
  if (!query || query.length < 2) return [];
  const db = await getSAQProductDB();
  const all = await db.getAll(SAQ_DB_STORE);
  const q = query.toLowerCase();
  return all
    .filter(p => (p.name || '').toLowerCase().includes(q))
    .slice(0, limit);
}

async function getSAQMeta() {
  return DB.getSetting(SAQ_META_KEY);
}

async function getSAQProductCount() {
  try {
    const db = await getSAQProductDB();
    return db.count(SAQ_DB_STORE);
  } catch (_) { return 0; }
}

window.SAQDB = {
  fetchAndStoreSAQData,
  lookupSAQByBarcode,
  searchSAQByName,
  getSAQMeta,
  getSAQProductCount,
};
