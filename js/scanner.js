// Barcode scanner using ZXing library + multi-source wine lookup

let scannerActive = false;
let codeReader = null;

async function initScanner(videoElement, onDetect) {
  if (!window.ZXing) {
    throw new Error('ZXing library non chargée');
  }

  const hints = new Map();
  const formats = [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128
  ];
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
  codeReader = new ZXing.BrowserMultiFormatReader(hints);

  scannerActive = true;

  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    await codeReader.decodeFromConstraints(constraints, videoElement, (result, err) => {
      if (!scannerActive) return;
      if (result) {
        stopScanner();
        onDetect(result.getText());
      }
    });
  } catch (err) {
    if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
      await codeReader.decodeFromConstraints(
        { video: true },
        videoElement,
        (result) => {
          if (!scannerActive) return;
          if (result) { stopScanner(); onDetect(result.getText()); }
        }
      );
    } else {
      throw err;
    }
  }
}

function stopScanner() {
  scannerActive = false;
  if (codeReader) {
    try { codeReader.reset(); } catch (_) {}
    codeReader = null;
  }
}

// ── Sommelier Virtuel lookup (via CORS proxy) ─────────────────────────────────

const SV_BASE = 'https://www.sommeliervirtuel.com/chercher-un-vin/search-results/';
const CORS_PROXY = 'https://corsproxy.io/?';

async function lookupSommelierVirtuel(barcode) {
  const url = CORS_PROXY + encodeURIComponent(`${SV_BASE}?keywords=${barcode}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const html = await res.text();
  return parseSommelierVirtuelHTML(html, barcode);
}

function parseSommelierVirtuelHTML(html, barcode) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Try to find the first wine result — try common selectors
  const cardSelectors = [
    '.product', '.wine-card', '.search-result', '.entry',
    'article', '.post', '.item', '.woocommerce-product',
    '[class*="product"]', '[class*="wine"]', '[class*="result"]'
  ];
  let card = null;
  for (const sel of cardSelectors) {
    const els = doc.querySelectorAll(sel);
    if (els.length > 0) { card = els[0]; break; }
  }
  if (!card) card = doc.body; // fallback: search whole page

  // Extract name
  const nameSelectors = [
    'h1','h2','h3','.product-title','.wine-name','.entry-title',
    '[class*="title"]','[class*="name"]'
  ];
  let name = '';
  for (const sel of nameSelectors) {
    const el = card.querySelector(sel);
    if (el?.textContent?.trim()) { name = el.textContent.trim(); break; }
  }

  // Extract structured fields from definition lists, tables or labelled spans
  function extractField(labels) {
    for (const label of labels) {
      // dt/dd pattern
      const dts = card.querySelectorAll('dt, th, label, strong, b, [class*="label"]');
      for (const dt of dts) {
        if (dt.textContent.toLowerCase().includes(label)) {
          const sibling = dt.nextElementSibling || dt.parentElement?.nextElementSibling;
          if (sibling?.textContent?.trim()) return sibling.textContent.trim();
        }
      }
      // Look for text patterns like "Région : Bordeaux"
      const bodyText = card.textContent;
      const rx = new RegExp(`${label}[\\s:]+([^\\n,;]{2,50})`, 'i');
      const m = bodyText.match(rx);
      if (m) return m[1].trim();
    }
    return '';
  }

  const vintage  = extractField(['millésime','millesime','vintage','année','annee']) || extractVintage(name);
  const region   = extractField(['région','region','appellation','provenance']);
  const grape    = extractField(['cépage','cepage','variété','variete','grape','raisin']);
  const producer = extractField(['producteur','producer','domaine','château','chateau','winery']);
  const country  = extractField(['pays','country','origine','origin']);
  const price    = extractField(['prix','price','tarif']);
  const type     = extractField(['type','couleur','color','style']);

  if (!name) return null;

  return { name, vintage, region, grape, producer, country, price, type, barcode, source: 'Sommelier Virtuel' };
}

// ── Lookup cascade: Sommelier Virtuel → SAQ DB → Open Food Facts → UPC Item DB ─

async function lookupBarcode(barcode) {
  // 1. Sommelier Virtuel (spécialisé vins, bonne couverture Québec/SAQ)
  try {
    const result = await lookupSommelierVirtuel(barcode);
    if (result && result.name) return result;
  } catch (_) {}

  // 2. Base SAQ locale
  try {
    const count = await SAQDB.getSAQProductCount();
    if (count > 0) {
      const result = await SAQDB.lookupSAQByBarcode(barcode);
      if (result && result.name) {
        return {
          name: result.name,
          vintage: result.vintage || extractVintage(result.name),
          region: result.region || result.country || '',
          grape: result.grape || '',
          appellation: result.appellation || '',
          price: result.price || '',
          type: result.type || '',
          barcode,
          source: 'SAQ'
        };
      }
    }
  } catch (_) {}

  // 4. Open Food Facts
  try {
    const result = await lookupOpenFoodFacts(barcode);
    if (result) return result;
  } catch (_) {}

  // 5. UPC Item DB
  try {
    const result = await lookupUPCItemDB(barcode);
    if (result) return result;
  } catch (_) {}

  // Nothing found — return just the barcode so user can fill manually
  throw new Error('Vin non trouvé dans les bases de données');
}

async function lookupOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const name = p.product_name_fr || p.product_name || '';
  if (!name) return null;

  return {
    name,
    vintage: extractVintage(name),
    region: p.origins_tags?.[0]?.replace('en:', '') || '',
    grape: '', // OFF rarely has grape info
    appellation: p.labels_tags?.filter(t => !t.startsWith('en:')).join(', ') || '',
    barcode,
    source: 'Open Food Facts'
  };
}

async function lookupUPCItemDB(barcode) {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== 'OK' || !data.items?.length) return null;

  const item = data.items[0];
  const name = item.title || '';
  if (!name) return null;

  // Extract vintage and region from description if available
  const desc = [item.description, item.brand, ...(item.category ? [item.category] : [])].join(' ');

  return {
    name,
    vintage: extractVintage(name + ' ' + desc),
    region: extractRegion(desc),
    grape: extractGrape(desc),
    appellation: item.brand || '',
    barcode,
    source: 'UPC Item DB'
  };
}

function extractVintage(text) {
  const match = (text || '').match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  return match ? match[0] : '';
}

function extractRegion(text) {
  const regions = [
    'Bordeaux','Bourgogne','Burgundy','Champagne','Alsace','Rhône','Loire',
    'Provence','Languedoc','Rioja','Ribera','Toscane','Tuscany','Veneto',
    'Piémont','Piedmont','Sicile','Sicily','Napa','Sonoma','Mendoza',
    'Maipo','Colchagua','Barossa','McLaren','Marlborough','Hawke'
  ];
  const t = (text || '').toLowerCase();
  const found = regions.find(r => t.includes(r.toLowerCase()));
  return found || '';
}

function extractGrape(text) {
  const grapes = [
    'Cabernet Sauvignon','Merlot','Pinot Noir','Syrah','Shiraz','Malbec',
    'Tempranillo','Sangiovese','Nebbiolo','Grenache','Zinfandel',
    'Chardonnay','Sauvignon Blanc','Riesling','Pinot Gris','Pinot Grigio',
    'Gewurztraminer','Viognier','Chenin Blanc','Muscat','Albariño',
    'Gamay','Mourvèdre','Carignan'
  ];
  const t = (text || '').toLowerCase();
  const found = grapes.find(g => t.includes(g.toLowerCase()));
  return found || '';
}

window.Scanner = { initScanner, stopScanner, lookupBarcode };
