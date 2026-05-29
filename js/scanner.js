// Barcode scanner using ZXing library + Open Food Facts lookup

let scannerActive = false;
let codeReader = null;
let videoEl = null;
let streamRef = null;

async function initScanner(videoElement, onDetect) {
  videoEl = videoElement;
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
  const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
  // Prefer back camera
  const device = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1] || devices[0];
  const deviceId = device?.deviceId;

  scannerActive = true;
  codeReader.decodeFromVideoDevice(deviceId, videoEl, (result, err) => {
    if (!scannerActive) return;
    if (result) {
      stopScanner();
      onDetect(result.getText());
    }
  });
}

function stopScanner() {
  scannerActive = false;
  if (codeReader) {
    codeReader.reset();
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
