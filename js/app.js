// ── App State ────────────────────────────────────────────────────────────────
const App = {
  currentPage: 'cellar',
  wines: [],
  filterType: 'tous',
  searchQuery: '',
  editingWineId: null,
  saqSpecials: [],
  saqLoading: false,
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showToast(msg, duration = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function showPage(name) {
  App.currentPage = name;
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const page = $(`#page-${name}`);
  if (page) page.classList.add('active');
  const nav = $(`.nav-item[data-page="${name}"]`);
  if (nav) nav.classList.add('active');

  if (name === 'cellar') renderCellar();
  if (name === 'profile') renderProfile();
  if (name === 'saq') renderSAQ();
  if (name === 'pairing') renderPairing();
}

function openSheet(id) {
  const el = $(`#${id}`);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeSheet(id) {
  const el = $(`#${id}`);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

function getWineTypeClass(type) {
  if (!type) return 'rouge';
  const t = type.toLowerCase();
  if (t.includes('blanc')) return 'type-blanc';
  if (t.includes('rosé') || t.includes('rose')) return 'type-rosé';
  if (t.includes('mousseux') || t.includes('champagne') || t.includes('crémant') || t.includes('bulles')) return 'type-bulles';
  return '';
}

function getTypeEmoji(type) {
  if (!type) return '🍷';
  const t = type.toLowerCase();
  if (t.includes('blanc')) return '🥂';
  if (t.includes('rosé') || t.includes('rose')) return '🌸';
  if (t.includes('mousseux') || t.includes('champagne') || t.includes('crémant')) return '✨';
  return '🍷';
}

// ── Cellar Page ───────────────────────────────────────────────────────────────
async function renderCellar() {
  App.wines = await DB.getAllWines();
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  let wines = App.wines;
  const q = App.searchQuery.toLowerCase();

  if (q) {
    wines = wines.filter(w =>
      (w.name || '').toLowerCase().includes(q) ||
      (w.region || '').toLowerCase().includes(q) ||
      (w.grape || '').toLowerCase().includes(q) ||
      (w.vintage || '').toString().includes(q)
    );
  }

  if (App.filterType !== 'tous') {
    wines = wines.filter(w => {
      const t = (w.type || '').toLowerCase();
      if (App.filterType === 'rouge') return !t || t.includes('rouge');
      if (App.filterType === 'blanc') return t.includes('blanc');
      if (App.filterType === 'rosé') return t.includes('rosé') || t.includes('rose');
      if (App.filterType === 'bulles') return t.includes('mousseux') || t.includes('champagne') || t.includes('crémant') || t.includes('bulles');
      return true;
    });
  }

  const container = $('#cellar-list');
  if (!container) return;

  // Stats bar
  const total = App.wines.reduce((s, w) => s + (w.quantity || 0), 0);
  $('#cellar-stats').textContent = `${App.wines.length} vin${App.wines.length !== 1 ? 's' : ''} · ${total} bouteille${total !== 1 ? 's' : ''}`;

  if (wines.length === 0) {
    container.innerHTML = App.wines.length === 0
      ? `<div class="empty-state">
           <div class="empty-icon">🍾</div>
           <div class="empty-title">Cellier vide</div>
           <div class="empty-text">Ajoutez votre premier vin en appuyant sur <strong>+</strong> ci-dessous.</div>
         </div>`
      : `<div class="empty-state">
           <div class="empty-icon">🔍</div>
           <div class="empty-title">Aucun résultat</div>
           <div class="empty-text">Essayez d'autres termes de recherche.</div>
         </div>`;
    return;
  }

  container.innerHTML = wines.map(w => wineCardHTML(w)).join('');

  // Bind quantity buttons
  container.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const delta = parseInt(btn.dataset.delta);
      await DB.adjustQuantity(id, delta);
      App.wines = await DB.getAllWines();
      applyFiltersAndRender();
    });
  });

  // Bind card click → details
  container.querySelectorAll('.wine-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      openWineDetail(id);
    });
  });
}

function wineCardHTML(w) {
  const typeClass = getWineTypeClass(w.type);
  const emoji = getTypeEmoji(w.type);
  const qty = w.quantity || 0;
  return `
    <div class="card wine-card ${typeClass}" data-id="${w.id}">
      <div class="card-row">
        <div style="flex:1;min-width:0">
          <div class="card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${emoji} ${escHtml(w.name || 'Sans nom')}
          </div>
          <div class="card-sub">
            ${w.vintage ? `<span class="wine-badge">${w.vintage}</span> ` : ''}
            ${w.region ? escHtml(w.region) : ''}
            ${w.grape ? ' · ' + escHtml(w.grape) : ''}
          </div>
        </div>
        <div class="wine-qty" onclick="event.stopPropagation()">
          <button class="qty-btn" data-id="${w.id}" data-delta="-1">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" data-id="${w.id}" data-delta="1">+</button>
        </div>
      </div>
      ${w.price ? `<div class="card-sub mt-8" style="font-size:12px">💰 ${escHtml(String(w.price))} $</div>` : ''}
    </div>`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Wine Detail Sheet ─────────────────────────────────────────────────────────
async function openWineDetail(id) {
  const wine = await DB.getWine(id);
  if (!wine) return;
  const notes = await DB.getNotesByWine(id);
  const sheet = $('#sheet-detail');
  const content = $('#detail-content');
  const emoji = getTypeEmoji(wine.type);

  content.innerHTML = `
    <div style="margin-bottom:8px;font-size:22px;font-weight:700">${emoji} ${escHtml(wine.name || 'Sans nom')}</div>
    ${wine.vintage ? `<span class="wine-badge">${wine.vintage}</span>` : ''}
    <div class="tag-list" style="margin-top:10px">
      ${wine.type ? `<span class="tag">${escHtml(wine.type)}</span>` : ''}
      ${wine.region ? `<span class="tag">📍 ${escHtml(wine.region)}</span>` : ''}
      ${wine.appellation ? `<span class="tag">${escHtml(wine.appellation)}</span>` : ''}
      ${wine.grape ? `<span class="tag">🍇 ${escHtml(wine.grape)}</span>` : ''}
      ${wine.location ? `<span class="tag">🗄️ ${escHtml(wine.location)}</span>` : ''}
    </div>
    <hr class="divider">
    <div class="card-row">
      <span class="card-sub">Quantité</span>
      <div class="wine-qty">
        <button class="qty-btn" onclick="adjustAndRefresh(${wine.id},-1)">−</button>
        <span class="qty-num" id="detail-qty">${wine.quantity || 0}</span>
        <button class="qty-btn" onclick="adjustAndRefresh(${wine.id},1)">+</button>
      </div>
    </div>
    ${wine.price ? `<div class="card-sub mt-8">Prix d'achat : <span class="highlight">${escHtml(String(wine.price))} $</span></div>` : ''}
    ${wine.purchaseDate ? `<div class="card-sub mt-8">Acheté le : ${escHtml(wine.purchaseDate)}</div>` : ''}

    <div class="section-title">Notes de dégustation</div>
    <div id="detail-notes-list">${notesHTML(notes)}</div>
    <button class="btn btn-secondary btn-sm mt-8" onclick="openAddNote(${wine.id})">+ Ajouter une note</button>

    <hr class="divider">
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary btn-sm" style="flex:1" onclick="editWine(${wine.id})">✏️ Modifier</button>
      <button class="btn btn-danger btn-sm" style="flex:1" onclick="confirmDeleteWine(${wine.id})">🗑️ Supprimer</button>
    </div>
  `;

  openSheet('sheet-detail');
}

function notesHTML(notes) {
  if (!notes || notes.length === 0) return '<div class="card-sub">Aucune note de dégustation.</div>';
  return notes.sort((a, b) => b.date.localeCompare(a.date)).map(n => `
    <div class="card" style="margin-bottom:8px;padding:12px">
      <div class="card-row">
        <span class="card-sub">${n.date}</span>
        ${n.score ? `<span class="score-display">⭐ ${n.score}/100</span>` : ''}
      </div>
      ${n.color ? `<div class="card-sub mt-8">Couleur : ${escHtml(n.color)}</div>` : ''}
      ${n.nose ? `<div class="card-sub mt-8">Nez : ${escHtml(n.nose)}</div>` : ''}
      ${n.palate ? `<div class="card-sub mt-8">Bouche : ${escHtml(n.palate)}</div>` : ''}
      ${n.finish ? `<div class="card-sub mt-8">Finale : ${escHtml(n.finish)}</div>` : ''}
      ${n.text ? `<div style="font-size:14px;margin-top:8px;line-height:1.5">${escHtml(n.text)}</div>` : ''}
      <button class="btn btn-danger btn-sm mt-8" onclick="deleteNoteAndRefresh(${n.id}, ${n.wineId})">Supprimer</button>
    </div>
  `).join('');
}

async function adjustAndRefresh(id, delta) {
  await DB.adjustQuantity(id, delta);
  const wine = await DB.getWine(id);
  const el = $('#detail-qty');
  if (el) el.textContent = wine ? (wine.quantity || 0) : 0;
  App.wines = await DB.getAllWines();
  applyFiltersAndRender();
}

async function deleteNoteAndRefresh(noteId, wineId) {
  await DB.deleteNote(noteId);
  const notes = await DB.getNotesByWine(wineId);
  const list = $('#detail-notes-list');
  if (list) list.innerHTML = notesHTML(notes);
  showToast('Note supprimée');
}

function openAddNote(wineId) {
  const form = $('#note-form');
  form.reset();
  form.dataset.wineId = wineId;
  openSheet('sheet-note');
}

async function saveNote(e) {
  e.preventDefault();
  const form = $('#note-form');
  const wineId = parseInt(form.dataset.wineId);
  await DB.addNote({
    wineId,
    date: form.querySelector('[name=date]').value || new Date().toISOString().slice(0, 10),
    score: form.querySelector('[name=score]').value ? parseInt(form.querySelector('[name=score]').value) : null,
    color: form.querySelector('[name=color]').value,
    nose: form.querySelector('[name=nose]').value,
    palate: form.querySelector('[name=palate]').value,
    finish: form.querySelector('[name=finish]').value,
    text: form.querySelector('[name=text]').value
  });
  closeSheet('sheet-note');
  showToast('Note ajoutée ✓');
  openWineDetail(wineId);
}

// ── Add / Edit Wine ───────────────────────────────────────────────────────────
function openAddWine(prefill = {}) {
  App.editingWineId = null;
  const form = $('#wine-form');
  form.reset();
  $('#wine-form-title').textContent = 'Ajouter un vin';
  if (prefill.name) form.querySelector('[name=name]').value = prefill.name;
  if (prefill.vintage) form.querySelector('[name=vintage]').value = prefill.vintage;
  if (prefill.region) form.querySelector('[name=region]').value = prefill.region;
  if (prefill.grape) form.querySelector('[name=grape]').value = prefill.grape;
  if (prefill.barcode) form.querySelector('[name=barcode]').value = prefill.barcode;
  showPage('add');
}

async function editWine(id) {
  const wine = await DB.getWine(id);
  if (!wine) return;
  closeSheet('sheet-detail');
  App.editingWineId = id;
  const form = $('#wine-form');
  form.reset();
  $('#wine-form-title').textContent = 'Modifier le vin';
  for (const [k, v] of Object.entries(wine)) {
    const el = form.querySelector(`[name=${k}]`);
    if (el && v !== null && v !== undefined) el.value = v;
  }
  showPage('add');
}

async function saveWine(e) {
  e.preventDefault();
  const form = $('#wine-form');
  const data = {
    name: form.querySelector('[name=name]').value.trim(),
    type: form.querySelector('[name=type]').value,
    vintage: form.querySelector('[name=vintage]').value,
    region: form.querySelector('[name=region]').value.trim(),
    appellation: form.querySelector('[name=appellation]').value.trim(),
    grape: form.querySelector('[name=grape]').value.trim(),
    quantity: parseInt(form.querySelector('[name=quantity]').value) || 1,
    price: form.querySelector('[name=price]').value,
    purchaseDate: form.querySelector('[name=purchaseDate]').value,
    location: form.querySelector('[name=location]').value.trim(),
    barcode: form.querySelector('[name=barcode]').value.trim(),
  };
  if (!data.name) { showToast('⚠️ Le nom est requis'); return; }

  if (App.editingWineId) {
    data.id = App.editingWineId;
    await DB.updateWine(data);
    showToast('Vin modifié ✓');
  } else {
    await DB.addWine(data);
    showToast('Vin ajouté ✓');
  }
  App.editingWineId = null;
  showPage('cellar');
}

async function confirmDeleteWine(id) {
  if (!confirm('Supprimer ce vin et toutes ses notes?')) return;
  await DB.deleteWine(id);
  closeSheet('sheet-detail');
  showToast('Vin supprimé');
  showPage('cellar');
}

// ── Scanner Page ──────────────────────────────────────────────────────────────
async function startScanner() {
  const video = $('#scanner-video');
  const status = $('#scanner-status');
  status.textContent = 'Pointez la caméra vers le code-barres…';

  try {
    await Scanner.initScanner(video, async (barcode) => {
      status.innerHTML = `🔍 Code détecté: <strong>${barcode}</strong><br><small style="color:var(--text-muted)">Recherche dans les bases de données…</small>`;
      try {
        const info = await Scanner.lookupBarcode(barcode);
        const src = info.source ? ` <small style="color:var(--text-muted)">(via ${info.source})</small>` : '';
        status.innerHTML = `✅ Trouvé : <strong>${info.name}</strong>${src}`;
        setTimeout(() => { openAddWine(info); showPage('add'); }, 900);
      } catch (err) {
        status.innerHTML = `⚠️ Code <strong>${barcode}</strong> non trouvé dans les bases de données.<br>
          <small style="color:var(--text-muted)">Vous pouvez saisir les informations manuellement.</small>`;
        setTimeout(() => { openAddWine({ barcode }); showPage('add'); }, 1800);
      }
    });
  } catch (err) {
    let msg = `Erreur caméra: ${err.message}`;
    if (err.name === 'NotAllowedError') {
      msg = '⛔ Accès à la caméra refusé. Autorisez la caméra dans Réglages → Safari → Caméra.';
    } else if (err.name === 'NotFoundError') {
      msg = '📷 Aucune caméra détectée sur cet appareil.';
    } else if (err.name === 'NotSupportedError' || err.name === 'SecurityError') {
      msg = '🔒 La caméra nécessite HTTPS. Accédez à l\'app via une URL sécurisée (https://).';
    }
    status.innerHTML = `<span style="color:var(--danger)">${msg}</span>`;
  }
}

function stopScannerAndNav(page) {
  Scanner.stopScanner();
  showPage(page);
}

// ── Pairing Page ──────────────────────────────────────────────────────────────
async function renderPairing() {
  const wines = await DB.getAllWines();
  const el = $('#pairing-result');
  if (el) el.innerHTML = '';
}

async function doPairing() {
  const meal = $('#pairing-input').value.trim();
  if (!meal) { showToast('Décrivez d\'abord votre repas'); return; }
  const wines = await DB.getAllWines();
  const result = Pairing.findPairings(meal, wines);
  renderPairingResult(result);
}

function renderPairingResult(result) {
  const el = $('#pairing-result');
  if (!el) return;
  let html = `
    <div class="card" style="border-color:var(--wine);margin-bottom:16px">
      <div style="font-size:15px;line-height:1.5">💡 ${escHtml(result.tip)}</div>
    </div>`;

  if (result.cellarMatches && result.cellarMatches.length > 0) {
    html += `<div class="section-title">🍾 Dans votre cellier</div>`;
    result.cellarMatches.forEach(({ wine }) => {
      html += `<div class="pairing-match">
        <div>
          <div class="match-name">${escHtml(wine.name)}</div>
          <div class="match-score">${wine.vintage || ''} · ${wine.region || ''} · ${wine.quantity} bouteille(s)</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="adjustAndRefreshOnly(${wine.id}, -1)">Ouvrir</button>
      </div>`;
    });
  } else {
    html += `<div class="card-sub" style="margin-bottom:12px">Aucun vin correspondant dans votre cellier actuellement.</div>`;
  }

  if (result.suggestedStyles && result.suggestedStyles.length > 0) {
    html += `<div class="section-title">🛒 Styles recommandés</div>`;
    html += `<div class="tag-list">`;
    result.suggestedStyles.forEach(s => { html += `<span class="tag highlight">${escHtml(s)}</span>`; });
    if (result.suggestedRegions) result.suggestedRegions.forEach(r => { html += `<span class="tag">${escHtml(r)}</span>`; });
    html += `</div>`;
  }

  el.innerHTML = html;
}

async function adjustAndRefreshOnly(id, delta) {
  await DB.adjustQuantity(id, delta);
  showToast('Bouteille retirée du cellier');
  doPairing();
}

// ── SAQ Page ──────────────────────────────────────────────────────────────────
async function renderSAQ() {
  const page = $('#page-saq');
  if (!page) return;

  const wishlist = await DB.getWishlist();
  renderWishlist(wishlist);

  if (App.saqSpecials.length === 0 && !App.saqLoading) {
    loadSAQSpecials();
  } else {
    renderSpecials(App.saqSpecials, wishlist);
  }
}

async function loadSAQSpecials() {
  App.saqLoading = true;
  const specEl = $('#saq-specials');
  if (specEl) specEl.innerHTML = '<div class="spinner"></div>';

  try {
    App.saqSpecials = await SAQ.fetchSAQSpecials();
    const wishlist = await DB.getWishlist();
    renderSpecials(App.saqSpecials, wishlist);
  } catch (err) {
    const specEl = $('#saq-specials');
    if (specEl) {
      specEl.innerHTML = `
        <div class="card" style="text-align:center;padding:24px">
          <div style="font-size:32px;margin-bottom:8px">🔗</div>
          <div class="card-title">Impossible de charger les spéciaux</div>
          <div class="card-sub" style="margin:8px 0">La SAQ bloque l'accès automatique. Consultez directement leur site :</div>
          <a href="${SAQ.SAQ_PROMO_URL}" target="_blank" class="btn btn-primary btn-sm" style="margin-top:8px;display:inline-flex">
            Voir les spéciaux sur SAQ.com ↗
          </a>
        </div>`;
    }
  }
  App.saqLoading = false;
}

function renderSpecials(specials, wishlist) {
  const specEl = $('#saq-specials');
  if (!specEl) return;
  if (specials.length === 0) {
    specEl.innerHTML = `
      <div class="card" style="text-align:center;padding:24px">
        <div style="font-size:32px;margin-bottom:8px">🔗</div>
        <div class="card-title">Consultez les spéciaux SAQ</div>
        <a href="${SAQ.SAQ_PROMO_URL}" target="_blank" class="btn btn-primary btn-sm" style="margin-top:12px;display:inline-flex">
          Voir SAQ.com ↗
        </a>
      </div>`;
    return;
  }
  specEl.innerHTML = specials.slice(0, 20).map(s => `
    <div class="card" style="margin-bottom:10px">
      <div class="saq-card">
        ${s.img ? `<img class="saq-img" src="${escHtml(s.img)}" alt="" onerror="this.style.display='none'">` : '<div class="saq-img-placeholder">🍷</div>'}
        <div class="saq-info">
          <div class="saq-name">${escHtml(s.name)}</div>
          ${s.price ? `<div class="saq-price">${escHtml(s.price)}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:8px">
            ${s.link ? `<a href="${escHtml(s.link)}" target="_blank" class="btn btn-sm btn-secondary">Voir ↗</a>` : ''}
            <button class="btn btn-sm btn-gold" onclick="addToWishlist('${escHtml(s.name).replace(/'/g,"\\'")}')">♡ Liste</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function renderWishlist(wishlist) {
  const el = $('#wishlist-list');
  if (!el) return;
  if (wishlist.length === 0) {
    el.innerHTML = '<div class="card-sub" style="margin-bottom:16px">Votre liste de souhaits est vide.</div>';
    return;
  }
  el.innerHTML = wishlist.map(item => `
    <div class="card" style="margin-bottom:8px;padding:12px">
      <div class="card-row">
        <span style="font-size:14px;font-weight:600">♡ ${escHtml(item.name)}</span>
        <button class="btn btn-danger btn-sm" onclick="removeWishlistItem(${item.id})">×</button>
      </div>
    </div>`).join('');
}

async function addToWishlist(name) {
  await DB.addToWishlist({ name });
  showToast('Ajouté à la liste de souhaits ♡');
  const wishlist = await DB.getWishlist();
  renderWishlist(wishlist);
}

async function removeWishlistItem(id) {
  await DB.removeFromWishlist(id);
  const wishlist = await DB.getWishlist();
  renderWishlist(wishlist);
  showToast('Retiré de la liste');
}

async function addWishlistManual() {
  const input = $('#wishlist-input');
  const name = input.value.trim();
  if (!name) return;
  await DB.addToWishlist({ name });
  input.value = '';
  showToast('Ajouté à la liste ♡');
  const wishlist = await DB.getWishlist();
  renderWishlist(wishlist);
}

// ── Vincod Worker Config ──────────────────────────────────────────────────────

async function renderVincodStatus() {
  const url = await DB.getSetting('vincodWorkerUrl');
  const el = $('#vincod-status');
  const input = $('#vincod-worker-url');
  if (!el) return;
  if (url) {
    el.innerHTML = `<span style="color:var(--success)">✅ Configuré : <span style="font-size:12px">${escHtml(url)}</span></span>`;
    if (input) input.value = url;
  } else {
    el.innerHTML = `<span style="color:var(--text-muted)">Non configuré — le scanner utilisera Open Food Facts et la BD SAQ locale.</span>`;
  }
}

async function saveVincodWorkerUrl() {
  const input = $('#vincod-worker-url');
  const url = (input?.value || '').trim().replace(/\/$/, '');
  if (!url) { showToast('Entrez une URL valide'); return; }
  await DB.setSetting('vincodWorkerUrl', url);
  showToast('URL Vincod enregistrée ✓');
  await renderVincodStatus();
}

async function testVincodWorker() {
  const input = $('#vincod-worker-url');
  const url = (input?.value || '').trim().replace(/\/$/, '');
  const result = $('#vincod-test-result');
  if (!url) { showToast('Entrez une URL d\'abord'); return; }
  if (result) result.innerHTML = '<span style="color:var(--text-muted)">Test en cours…</span>';
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      if (result) result.innerHTML = `<span style="color:var(--success)">✅ Worker opérationnel!</span>`;
    } else {
      if (result) result.innerHTML = `<span style="color:var(--danger)">⚠️ Réponse inattendue : ${escHtml(JSON.stringify(data))}</span>`;
    }
  } catch (err) {
    if (result) result.innerHTML = `<span style="color:var(--danger)">❌ Erreur : ${escHtml(err.message)}</span>`;
  }
}

// ── SAQ Database Refresh ──────────────────────────────────────────────────────

function saqProgressHandler(msg, pct) {
  const bar = $('#saq-progress-bar');
  const text = $('#saq-progress-text');
  const progress = $('#saq-db-progress');
  if (progress) progress.style.display = 'block';
  if (bar) bar.style.width = pct + '%';
  if (text) text.textContent = msg;
}

async function runSAQImport(fetchFn) {
  const btn = $('#btn-refresh-saq');
  if (btn) { btn.disabled = true; }

  try {
    await fetchFn(saqProgressHandler);
    showToast('✅ Catalogue SAQ mis à jour!');
    await renderSAQDBStatus();
  } catch (err) {
    const text = $('#saq-progress-text');
    if (text) text.innerHTML = `<span style="color:var(--danger)">❌ ${escHtml(err.message)}</span>`;
    showToast('❌ Échec du chargement', 4000);
  } finally {
    if (btn) { btn.disabled = false; }
    setTimeout(() => {
      const p = $('#saq-db-progress');
      if (p) p.style.display = 'none';
    }, 5000);
  }
}

async function refreshSAQDatabase() {
  await runSAQImport((onProgress) => SAQDB.fetchAndStoreSAQData(onProgress));
}

async function refreshSAQFromCustomUrl() {
  const urlInput = $('#saq-custom-url');
  const url = urlInput?.value?.trim();
  if (!url) { showToast('Entrez une URL valide'); return; }
  await runSAQImport((onProgress) => SAQDB.fetchAndStoreSAQData(onProgress, url));
}

async function importSAQFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  await runSAQImport((onProgress) => SAQDB.importFromFile(file, onProgress));
  input.value = ''; // reset so same file can be re-imported
}

async function renderSAQDBStatus() {
  const el = $('#saq-db-info');
  if (!el) return;
  const meta = await SAQDB.getSAQMeta();
  const count = await SAQDB.getSAQProductCount();
  if (!meta || count === 0) {
    el.innerHTML = `<span style="color:var(--text-muted)">Catalogue non téléchargé — appuyez sur le bouton ci-dessous pour activer la recherche SAQ.</span>`;
  } else {
    const date = new Date(meta.updatedAt).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    el.innerHTML = `
      <span style="color:var(--success)">✅ ${count.toLocaleString()} produits chargés</span><br>
      <span style="color:var(--text-muted);font-size:12px">Dernière mise à jour : ${date}</span><br>
      <span style="color:var(--text-muted);font-size:12px">Dont ${meta.withBarcodes || '?'} avec code-barres</span>`;
  }
}

// ── Profile / Insights Page ───────────────────────────────────────────────────
async function renderProfile() {
  await renderVincodStatus();
  await renderSAQDBStatus();
  const wines = await DB.getAllWines();
  const insights = Pairing.generateCellarInsights(wines);
  const el = $('#insights-list');
  if (!el) return;

  const total = wines.reduce((s, w) => s + (w.quantity || 0), 0);
  $('#profile-stats').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-row">
        <div><div style="font-size:28px;font-weight:800;color:var(--gold)">${wines.length}</div><div class="card-sub">références</div></div>
        <div style="text-align:center"><div style="font-size:28px;font-weight:800;color:var(--wine-light)">${total}</div><div class="card-sub">bouteilles</div></div>
        <div style="text-align:right"><div style="font-size:28px;font-weight:800;color:var(--text-muted)">${wines.filter(w=>w.quantity>0).length}</div><div class="card-sub">en stock</div></div>
      </div>
    </div>`;

  el.innerHTML = insights.map(i => `
    <div class="insight-card">
      <span class="insight-icon">${i.icon}</span>
      <span class="insight-text">${escHtml(i.text)}</span>
    </div>`).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initNav() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      if (page === 'scanner') {
        showPage('scanner');
        startScanner();
      } else if (page === 'add') {
        Scanner.stopScanner();
        openAddWine();
      } else {
        Scanner.stopScanner();
        showPage(page);
      }
    });
  });
}

function initForms() {
  // Wine form
  $('#wine-form').addEventListener('submit', saveWine);
  $('#btn-cancel-wine').addEventListener('click', () => {
    App.editingWineId = null;
    showPage('cellar');
  });

  // Search
  $('#cellar-search').addEventListener('input', e => {
    App.searchQuery = e.target.value;
    applyFiltersAndRender();
  });

  // Filter chips
  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      App.filterType = chip.dataset.type;
      applyFiltersAndRender();
    });
  });

  // Add wine FAB
  $('#btn-add-wine').addEventListener('click', () => openAddWine());

  // SAQ autocomplete on wine name input
  let autocompleteTimer = null;
  const nameInput = $('#wine-name-input');
  const acList = $('#saq-autocomplete');
  nameInput.addEventListener('input', () => {
    clearTimeout(autocompleteTimer);
    const q = nameInput.value.trim();
    if (q.length < 2) { acList.style.display = 'none'; return; }
    autocompleteTimer = setTimeout(async () => {
      const results = await SAQDB.searchSAQByName(q);
      if (!results.length) { acList.style.display = 'none'; return; }
      acList.innerHTML = results.map(p => `
        <div class="ac-item" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:14px"
             data-name="${escHtml(p.name)}"
             data-region="${escHtml(p.region||p.country||'')}"
             data-grape="${escHtml(p.grape||'')}"
             data-appellation="${escHtml(p.appellation||'')}"
             data-price="${escHtml(p.price||'')}"
             data-type="${escHtml(p.type||'')}"
             data-vintage="${escHtml(p.vintage||'')}">
          <div style="font-weight:600">${escHtml(p.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${[p.region||p.country, p.grape, p.price ? p.price+'$' : ''].filter(Boolean).join(' · ')}</div>
        </div>`).join('');
      acList.style.display = 'block';
      acList.querySelectorAll('.ac-item').forEach(item => {
        item.addEventListener('click', () => {
          const form = $('#wine-form');
          form.querySelector('[name=name]').value = item.dataset.name;
          if (item.dataset.region) form.querySelector('[name=region]').value = item.dataset.region;
          if (item.dataset.grape) form.querySelector('[name=grape]').value = item.dataset.grape;
          if (item.dataset.appellation) form.querySelector('[name=appellation]').value = item.dataset.appellation;
          if (item.dataset.price) form.querySelector('[name=price]').value = item.dataset.price;
          if (item.dataset.vintage) form.querySelector('[name=vintage]').value = item.dataset.vintage;
          if (item.dataset.type) {
            const sel = form.querySelector('[name=type]');
            const t = item.dataset.type.toLowerCase();
            if (t.includes('blanc')) sel.value = 'Blanc';
            else if (t.includes('ros')) sel.value = 'Rosé';
            else if (t.includes('mouss') || t.includes('champagne') || t.includes('crémant')) sel.value = 'Mousseux / Champagne';
            else if (t.includes('rouge')) sel.value = 'Rouge';
          }
          acList.style.display = 'none';
          showToast('Informations SAQ importées ✓');
        });
        item.addEventListener('mouseover', () => item.style.background = 'var(--surface)');
        item.addEventListener('mouseout', () => item.style.background = '');
      });
    }, 300);
  });
  nameInput.addEventListener('blur', () => setTimeout(() => { acList.style.display = 'none'; }, 200));

  // Note form
  $('#note-form').addEventListener('submit', saveNote);
  $('#btn-cancel-note').addEventListener('click', () => closeSheet('sheet-note'));

  // Overlay close on backdrop click
  $$('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov) closeSheet(ov.id);
    });
  });

  // Pairing
  $('#btn-pair').addEventListener('click', doPairing);
  $('#pairing-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doPairing(); }
  });

  // SAQ wishlist manual add
  $('#btn-wishlist-add').addEventListener('click', addWishlistManual);
  $('#wishlist-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addWishlistManual(); }
  });

  // SAQ refresh
  $('#btn-saq-refresh').addEventListener('click', () => {
    App.saqSpecials = [];
    App.saqLoading = false;
    loadSAQSpecials();
  });
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// Wait for all libs to load
document.addEventListener('DOMContentLoaded', async () => {
  initServiceWorker();
  initNav();
  initForms();
  showPage('cellar');
});

// Expose globals needed by inline onclick handlers
window.adjustAndRefresh = adjustAndRefresh;
window.adjustAndRefreshOnly = adjustAndRefreshOnly;
window.openAddNote = openAddNote;
window.editWine = editWine;
window.confirmDeleteWine = confirmDeleteWine;
window.deleteNoteAndRefresh = deleteNoteAndRefresh;
window.addToWishlist = addToWishlist;
window.removeWishlistItem = removeWishlistItem;
window.stopScannerAndNav = stopScannerAndNav;
window.openAddWine = openAddWine;
window.refreshSAQDatabase = refreshSAQDatabase;
window.refreshSAQFromCustomUrl = refreshSAQFromCustomUrl;
window.importSAQFile = importSAQFile;
window.saveVincodWorkerUrl = saveVincodWorkerUrl;
window.testVincodWorker = testVincodWorker;
