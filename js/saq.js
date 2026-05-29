// SAQ integration — fetches promotions via CORS proxy with graceful fallback

const SAQ_PROMO_URL = 'https://www.saq.com/fr/promotions';
const CORS_PROXY = 'https://corsproxy.io/?';

async function fetchSAQSpecials() {
  const url = CORS_PROXY + encodeURIComponent(SAQ_PROMO_URL);
  const response = await fetch(url, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  return parseSAQHTML(html);
}

function parseSAQHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = [];

  // Try multiple selectors since SAQ may change their markup
  const selectors = [
    '.product-item',
    '[data-product-name]',
    '.search-result-product-name',
    'li.item.product',
    '.product-info-main'
  ];

  let productEls = [];
  for (const sel of selectors) {
    productEls = doc.querySelectorAll(sel);
    if (productEls.length > 0) break;
  }

  productEls.forEach(el => {
    const name = el.querySelector('.product-item-name, .product-name, [data-product-name]')?.textContent?.trim();
    const priceEl = el.querySelector('.price, .special-price, .final-price');
    const price = priceEl?.textContent?.trim();
    const link = el.querySelector('a')?.href;
    const img = el.querySelector('img')?.src;

    if (name) {
      items.push({ name, price: price || '', link: link || SAQ_PROMO_URL, img: img || '' });
    }
  });

  // Fallback: extract product names from JSON-LD or script tags
  if (items.length === 0) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'ItemList' && data.itemListElement) {
          data.itemListElement.forEach(item => {
            if (item.name) items.push({ name: item.name, price: '', link: item.url || SAQ_PROMO_URL, img: '' });
          });
        }
      } catch (e) { /* ignore */ }
    });
  }

  return items;
}

async function checkWishlistAgainstSpecials(wishlist, specials) {
  const matches = [];
  for (const wish of wishlist) {
    const wishName = (wish.name || '').toLowerCase();
    for (const special of specials) {
      const specName = (special.name || '').toLowerCase();
      // Fuzzy match: check if key words overlap
      const wishWords = wishName.split(/\s+/).filter(w => w.length > 3);
      const matchScore = wishWords.filter(w => specName.includes(w)).length;
      if (matchScore >= 1) {
        matches.push({ wish, special, score: matchScore });
      }
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

window.SAQ = { fetchSAQSpecials, checkWishlistAgainstSpecials, SAQ_PROMO_URL };
