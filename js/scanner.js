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

  // First result card — jreviews structure
  const card = doc.querySelector('.jr-listing-outer, .jrResults .jrRow:not(.jrDataListHeader)');
  if (!card) return null;

  // Name + price from the title link: "Zonin Prosecco Cuvée 1821, $15.60"
  const titleEl = card.querySelector('.jrListingTitle a');
  if (!titleEl) return null;
  const titleRaw = titleEl.textContent.trim();

  // Split name and price: "Nom du vin 2020, $15.60" → name="Nom du vin 2020", price="15.60"
  const priceMatch = titleRaw.match(/,\s*\$?([\d.,]+)\s*$/);
  const price = priceMatch ? priceMatch[1] : '';
  const nameWithVintage = priceMatch ? titleRaw.slice(0, priceMatch.index).trim() : titleRaw;

  // Extract vintage from name if present: "Zonin Prosecco Cuvée 1821" → vintage="1821" only if 4-digit year
  const vintageMatch = nameWithVintage.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const vintage = vintageMatch ? vintageMatch[0] : '';
  // Remove vintage from name
  const name = vintageMatch
    ? nameWithVintage.replace(vintageMatch[0], '').replace(/\s{2,}/g, ' ').trim().replace(/,\s*$/, '')
    : nameWithVintage;

  // Custom fields: .jrFieldRow contains .jrFieldLabel + .jrFieldValue
  function getField(className) {
    const row = card.querySelector(`.${className} .jrFieldValue, .jr${capitalize(className)} .jrFieldValue`);
    return row?.textContent?.trim() || '';
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Direct class selectors found in the HTML
  const country     = card.querySelector('.jrPaysdorigine .jrFieldValue')?.textContent?.trim() || '';
  const region      = card.querySelector('.jrRegion .jrFieldValue')?.textContent?.trim() || '';
  const appellation = card.querySelector('.jrAppellation .jrFieldValue')?.textContent?.trim() || '';
  const grape       = card.querySelector('.jrCepage .jrFieldValue, .jrCepages .jrFieldValue')?.textContent?.trim() || '';
  const type        = card.querySelector('.jrCategorie .jrFieldValue, .jrType .jrFieldValue')?.textContent?.trim() || '';
  const producer    = card.querySelector('.jrProducteur .jrFieldValue, .jrProducer .jrFieldValue')?.textContent?.trim() || '';
  const url         = titleEl.href || '';

  // Rating
  const ratingEl = card.querySelector('.jrRatingValue');
  const rating = ratingEl?.textContent?.trim() || '';

  return { name, vintage, region, appellation, grape, country, price, type, producer, rating, url, barcode, source: 'Sommelier Virtuel' };
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
