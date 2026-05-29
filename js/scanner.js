// Barcode scanner using ZXing library + Open Food Facts lookup

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

  // Use environment-facing camera constraints — works reliably on iOS Safari
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
      // ZXing continuously fires NotFoundException — ignore silently
    });
  } catch (err) {
    // If facingMode fails (e.g. desktop with single camera), retry without constraint
    if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
      await codeReader.decodeFromConstraints(
        { video: true },
        videoElement,
        (result, err) => {
          if (!scannerActive) return;
          if (result) {
            stopScanner();
            onDetect(result.getText());
          }
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

async function lookupBarcode(barcode) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Produit introuvable');
  const data = await res.json();
  if (data.status !== 1 || !data.product) throw new Error('Produit non trouvé dans la base de données');

  const p = data.product;
  return {
    name: p.product_name_fr || p.product_name || '',
    vintage: extractVintage(p.product_name_fr || p.product_name || ''),
    region: p.origins_tags?.[0]?.replace('en:', '') || '',
    grape: p.ingredients_text || '',
    appellation: p.labels_tags?.join(', ') || '',
    barcode
  };
}

function extractVintage(name) {
  const match = name.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
}

window.Scanner = { initScanner, stopScanner, lookupBarcode };
