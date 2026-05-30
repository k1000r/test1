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
  // Step 1 — search results page to get name, price, country/region/appellation, and detail URL
  const searchUrl = CORS_PROXY + encodeURIComponent(`${SV_BASE}?keywords=${barcode}`);
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
  if (!searchRes.ok) return null;
  const searchHtml = await searchRes.text();
  const basic = parseSearchResults(searchHtml, barcode);
  if (!basic) return null;

  // Step 2 — fetch detail page for cépage, millésime, type, producteur, etc.
  if (basic.detailUrl) {
    try {
      const detailUrl = CORS_PROXY + encodeURIComponent(basic.detailUrl);
      const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(10000) });
      if (detailRes.ok) {
        const detailHtml = await detailRes.text();
        const extra = parseDetailPage(detailHtml);
        // Merge: detail fields override/complement basic fields
        return { ...basic, ...extra, barcode, source: 'Sommelier Virtuel' };
      }
    } catch (_) {}
  }

  return { ...basic, barcode, source: 'Sommelier Virtuel' };
}

// ── Parse search results list page ───────────────────────────────────────────

function parseSearchResults(html, barcode) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // First result row (skip header row)
  const card = doc.querySelector('.jr-listing-outer');
  if (!card) return null;

  // Name + price: "Zonin Prosecco Cuvée 1821, $15.60"
  const titleEl = card.querySelector('.jrListingTitle a');
  if (!titleEl) return null;
  const titleRaw = titleEl.textContent.trim();

  const priceMatch = titleRaw.match(/,\s*\$?([\d.]+)\s*$/);
  const price = priceMatch ? priceMatch[1] : '';
  const nameFull = priceMatch ? titleRaw.slice(0, priceMatch.index).trim() : titleRaw;

  // Vintage: only match realistic wine years (1950–2029)
  const vintageMatch = nameFull.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  const vintage = vintageMatch ? vintageMatch[0] : '';
  const name = vintageMatch
    ? nameFull.replace(vintageMatch[0], '').replace(/\s{2,}/g, ' ').trim().replace(/,\s*$/, '')
    : nameFull;

  // Detail URL for step 2
  const detailUrl = titleEl.href || card.querySelector('.jrListingActions a')?.href || '';

  // Fields available on search page (limited: only Origine, Région, Appellation)
  const country     = card.querySelector('.jrPaysdorigine .jrFieldValue')?.textContent?.trim() || '';
  const region      = card.querySelector('.jrRegion .jrFieldValue')?.textContent?.trim() || '';
  const appellation = card.querySelector('.jrAppellation .jrFieldValue')?.textContent?.trim() || '';

  // Rating (editor score)
  const ratingEl = card.querySelector('.jrOverallEditor .jrRatingValue span');
  const rating = ratingEl?.textContent?.trim() || '';

  return { name, vintage, price, country, region, appellation, rating, detailUrl };
}

// ── Parse detail page — extracts ALL jreviews custom fields ──────────────────

function parseDetailPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Generic extractor: read ALL .jrFieldRow label→value pairs
  const fields = {};
  doc.querySelectorAll('.jrFieldRow').forEach(row => {
    const label = row.querySelector('.jrFieldLabel')?.textContent?.trim().toLowerCase() || '';
    const value = row.querySelector('.jrFieldValue')?.textContent?.trim() || '';
    if (label && value) fields[label] = value;
  });

  // Map French labels to our schema
  const get = (...keys) => {
    for (const k of keys) {
      if (fields[k]) return fields[k];
    }
    return '';
  };

  const vintage     = get('millésime', 'millesime', 'année', 'annee', 'vintage');
  const grape       = get('cépage', 'cepage', 'cépages', 'cepages', 'variété', 'variete');
  const type        = get('type', 'couleur', 'catégorie', 'categorie', 'style');
  const producer    = get('producteur', 'producer', 'domaine', 'château', 'chateau', 'maison', 'winery');
  const country     = get('origine', 'pays', 'country');
  const region      = get('région', 'region');
  const appellation = get('appellation', 'désignation', 'designation');
  const alcohol     = get('alcool', 'alcohol', 'degré', 'degre', 'abv');
  const format      = get('format', 'volume', 'contenant', 'taille');
  const description = doc.querySelector('.jrListingDescription, .jrDescription, .entry-content p')?.textContent?.trim() || '';

  // Clean up result — only return non-empty fields
  const result = {};
  if (vintage)     result.vintage = vintage;
  if (grape)       result.grape = grape;
  if (type)        result.type = type;
  if (producer)    result.producer = producer;
  if (country)     result.country = country;
  if (region)      result.region = region;
  if (appellation) result.appellation = appellation;
  if (alcohol)     result.alcohol = alcohol;
  if (format)      result.format = format;
  if (description) result.description = description;

  return result;
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
