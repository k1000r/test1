/**
 * Cloudflare Worker — Proxy Vincod API pour Mon Cellier
 *
 * Ce Worker sert d'intermédiaire entre l'application et l'API Vincod.
 * La clé API Vincod est stockée côté serveur (jamais exposée dans le navigateur).
 *
 * DÉPLOIEMENT :
 *   1. Installez Wrangler : npm install -g wrangler
 *   2. Connectez-vous : wrangler login
 *   3. Ajoutez votre clé Vincod : wrangler secret put VINCOD_API_KEY
 *   4. Déployez : wrangler deploy
 *
 * ENDPOINTS EXPOSÉS :
 *   GET /ean/{barcode}       → lookup par code-barres EAN
 *   GET /vincod/{code}       → lookup par code Vincod
 *   GET /search?q={query}    → recherche par nom
 *   GET /health              → vérification que le Worker fonctionne
 */

const VINCOD_BASE = 'https://www.vincod.com/api2/json';

// Domaines autorisés à appeler ce Worker (ajoutez votre domaine GitHub Pages)
const ALLOWED_ORIGINS = [
  'https://k1000r.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin, isAllowed);
    }

    if (!isAllowed && origin !== '') {
      return new Response(JSON.stringify({ error: 'Origine non autorisée' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/health') {
        return corsResponse({ status: 'ok', timestamp: new Date().toISOString() }, 200, origin, isAllowed);
      }

      const apiKey = env.VINCOD_API_KEY;
      if (!apiKey) {
        return corsResponse({ error: 'VINCOD_API_KEY non configurée dans les secrets Cloudflare' }, 500, origin, isAllowed);
      }

      let vincodUrl = null;

      // GET /ean/{barcode}
      const eanMatch = path.match(/^\/ean\/(\d+)$/);
      if (eanMatch) {
        vincodUrl = `${VINCOD_BASE}/getWinesByEAN/${eanMatch[1]}`;
      }

      // GET /vincod/{code}
      const vincodMatch = path.match(/^\/vincod\/([A-Z0-9]+)$/i);
      if (vincodMatch) {
        vincodUrl = `${VINCOD_BASE}/getWinesByVincod/${vincodMatch[1]}`;
      }

      // GET /search?q={query}
      if (path === '/search') {
        const q = url.searchParams.get('q');
        if (!q) return corsResponse({ error: 'Paramètre q requis' }, 400, origin, isAllowed);
        vincodUrl = `${VINCOD_BASE}/getWinesByName/${encodeURIComponent(q)}`;
      }

      if (!vincodUrl) {
        return corsResponse({ error: 'Endpoint inconnu', endpoints: ['/ean/{barcode}', '/vincod/{code}', '/search?q={query}', '/health'] }, 404, origin, isAllowed);
      }

      const vincodRes = await fetch(vincodUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'MonCellier-PWA/1.0'
        }
      });

      const data = await vincodRes.json();
      return corsResponse(data, vincodRes.status, origin, isAllowed);

    } catch (err) {
      return corsResponse({ error: 'Erreur serveur: ' + err.message }, 500, origin, isAllowed);
    }
  }
};

function corsResponse(body, status, origin, isAllowed) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (isAllowed || origin === '') {
    headers['Access-Control-Allow-Origin'] = origin || '*';
  }
  return new Response(body !== null ? JSON.stringify(body) : null, { status, headers });
}
