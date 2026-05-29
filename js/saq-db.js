// SAQ product database — supports multiple sources:
// 1. Known GitHub CSV URLs (tried automatically)
// 2. Custom URL provided by user
// 3. Local file upload (CSV or JSON)

const SAQ_CSV_URLS = [
  // Try several known community sources
  'https://raw.githubusercontent.com/nicbou/saq-data/master/data/saq.csv',
  'https://raw.githubusercontent.com/nicbou/saq-data/main/data/saq.csv',
  'https://raw.githubusercontent.com/nicbou/saq-data/master/saq.csv',
  'https://raw.githubusercontent.com/nicbou/saq-data/main/saq.csv',
  'https://raw.githubusercontent.com/nicbou/saq-data/master/data/products.csv',
  'https://raw.githubusercontent.com/nicbou/saq-data/main/data/products.csv',
];

const SAQ_DB_NAME = 'cellier-saq';
const SAQ_DB_STORE = 'saqProducts';
const SAQ_META_KEY = 'saqDbMeta';

// ── CSV / JSON Parser ─────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) throw new Error('Fichier CSV vide');

  const headers = splitCSVLine(lines[0]).map(h =>
    h.trim().toLowerCase()
      .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ûù]/g, 'u')
      .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  );

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
  let cur = '', inQuote = false;
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

// Flexible column mapping — handles many CSV schemas
function normalizeRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
    }
    return '';
  };
  return {
    code:        get('code', 'code_saq', 'saq_code', 'id', 'code_produit'),
    barcode:     get('barcode', 'upc', 'ean', 'ean13', 'code_barres', 'codebarre', 'gtin'),
    name:        get('name', 'nom', 'title', 'titre', 'product_name', 'nom_produit'),
    price:       get('price', 'prix', 'regular_price', 'prix_regulier'),
    country:     get('country', 'pays'),
    region:      get('region'),
    appellation: get('appellation', 'designation', 'appelation'),
    grape:       get('grape', 'cepage', 'variete', 'grape_variety', 'cepage_principal'),
    type:        get('type', 'categorie', 'category', 'format_type'),
    format:      get('format', 'size', 'volume', 'taille', 'contenant'),
    description: get('description'),
    url:         get('url', 'link', 'lien', 'page_url'),
    producer:    get('producer', 'producteur', 'producer_name'),
    alcohol:     get('alcohol', 'alcool', 'abv', 'taux_alcool'),
    vintage:     get('millesime', 'vintage', 'year', 'annee', 'millesime_annee'),
  };
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

async function getSAQProductDB() {
  return idb.openDB(SAQ_DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(SAQ_DB_STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('barcode', 'barcode');
      store.createIndex('name', 'name');
      store.createIndex('code', 'code');
    }
  });
}

// ── Store products ────────────────────────────────────────────────────────────

async function storeProducts(products, source, onProgress) {
  onProgress?.('Sauvegarde dans la base locale…', 75);
  const db = await getSAQProductDB();
  const tx = db.transaction(SAQ_DB_STORE, 'readwrite');
  await tx.objectStore(SAQ_DB_STORE).clear();
  for (const p of products) {
    await tx.objectStore(SAQ_DB_STORE).add(p);
  }
  await tx.done;

  const meta = {
    updatedAt: new Date().toISOString(),
    count: products.length,
    source,
    withBarcodes: products.filter(p => p.barcode).length,
  };
  await DB.setSetting(SAQ_META_KEY, meta);
  onProgress?.(`✅ ${products.length.toLocaleString()} produits chargés avec succès!`, 100);
  return meta;
}

function parseAndNormalize(text, onProgress) {
  onProgress?.('Analyse du fichier…', 50);
  const { rows } = parseCSV(text);
  if (!rows || rows.length === 0) throw new Error('Aucun produit trouvé dans le fichier');
  onProgress?.(`${rows.length} produits trouvés…`, 65);
  const products = rows.map(normalizeRow).filter(p => p.name);
  if (products.length === 0) throw new Error('Format de fichier non reconnu — aucune colonne "name" ou "nom" trouvée');
  return products;
}

// ── Fetch from URL ────────────────────────────────────────────────────────────

async function fetchAndStoreSAQData(onProgress, customUrl = null) {
  const urls = customUrl ? [customUrl] : SAQ_CSV_URLS;
  let lastError = null;

  for (const url of urls) {
    try {
      onProgress?.(`Connexion à ${new URL(url).hostname}…`, 10);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) { lastError = `HTTP ${res.status} sur ${url}`; continue; }

      onProgress?.('Téléchargement…', 30);
      const text = await res.text();
      if (text.includes('404') && text.length < 500) { lastError = 'Fichier introuvable'; continue; }

      const products = parseAndNormalize(text, onProgress);
      return storeProducts(products, url, onProgress);
    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  throw new Error(
    customUrl
      ? `Impossible de charger ce fichier : ${lastError}`
      : `Aucune source automatique disponible. Utilisez l'import de fichier local ci-dessous.\n\nDétail : ${lastError}`
  );
}

// ── Import from local file ────────────────────────────────────────────────────

async function importFromFile(file, onProgress) {
  onProgress?.(`Lecture de ${file.name}…`, 20);
  const text = await file.text();
  const products = parseAndNormalize(text, onProgress);
  return storeProducts(products, `Fichier local: ${file.name}`, onProgress);
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
  const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return all
    .filter(p => {
      const n = (p.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return n.includes(q);
    })
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
  importFromFile,
  lookupSAQByBarcode,
  searchSAQByName,
  getSAQMeta,
  getSAQProductCount,
};
