// ── Auth, game init, QR scanner, captures ───────────
let bgMap = null;

// SHA-256 via Web Crypto — no library needed

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function logoutPlayer() {
  const pseudo = myPseudo;
  if (pseudo) {
    await db.from('players').update({ session_token: null }).eq('pseudo', pseudo);
    localStorage.removeItem(`u3dq_clues_${pseudo}`);
    localStorage.removeItem(`u3dq_first_fixed_at_${pseudo}`);
  }
  localStorage.removeItem('u3dq_pseudo');
  localStorage.removeItem('u3dq_token');
  location.reload();
}

function initEnvUI() {
  if (SUPABASE_ENV.name !== 'stg') return;
  document.body.classList.add('env-stg');
  const dbgBtn = document.getElementById('compassDebugBtn');
  if (dbgBtn) dbgBtn.style.display = 'block';
  const banner = document.getElementById('envBanner');
  if (banner) banner.textContent = 'PREPROD STG ' + GAME_VERSION + ' · BASE DE TEST';
  // STG : pas de mot de passe, juste le pseudo
  const passInput = document.getElementById('passwordInput');
  if (passInput) passInput.style.display = 'none';
  const psSub = document.querySelector('.ps-sub');
  if (psSub) psSub.textContent = 'Entre ton pseudo pour tester';
}

initEnvUI();

window.addEventListener('load', async () => {
  // Attach QR file input handler (cloneNode approach requires JS init)
  const qrInput = document.getElementById('qrFileInput');
  if (qrInput) qrInput.addEventListener('change', () => handleQRPhoto(qrInput));

  // Pre-fetch config to get mapCenter + gameCode for landing screen
  const { data: cfgData } = await db.from('config').select('key,value').in('key',['mapCenter','gameCode']);
  if (cfgData) {
    const cMap = Object.fromEntries(cfgData.map(r => [r.key, r.value]));
    if (cMap.mapCenter) {
      const parts = cMap.mapCenter.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0])) mapCenter = parts;
    }
    if (cMap.gameCode) {
      gameCode = cMap.gameCode;
      document.getElementById('gameCodeWrap').style.display = 'block';
    }
  }

  const params    = new URLSearchParams(location.search);
  const foundId   = params.get('found');
  const checkinId = params.get('checkin') || '';   // ID de la balise fixe (ou '1' legacy)
  const checkin   = !!checkinId;

  // QR balise scanné par un non-joueur → carte de visite
  if (checkin && !myPseudo) {
    window.location.replace('https://jadikan.carrd.co/');
    return;
  }

  // Returning user: verify session token then skip landing
  if (myPseudo) {
    if (SUPABASE_ENV.name === 'stg') {
      // STG : on fait confiance au localStorage, pas de vérification session
      const { data: p } = await db.from('players').select('score,found_count').eq('pseudo', myPseudo).single();
      if (p) { myScore = p.score || 0; myFoundCount = p.found_count || 0; }
      document.getElementById('pseudoScreen').style.display = 'none';
      document.getElementById('bgMap').style.display = 'none';
      if (checkin) sessionStorage.setItem('pendingCheckin', checkinId);
      initGame(foundId);
      return;
    }
    const { data: p } = await db.from('players').select('session_token,score,found_count').eq('pseudo', myPseudo).single();
    const storedToken = localStorage.getItem('u3dq_token');
    if (!p || !storedToken || p.session_token !== storedToken) {
      // Session expired or taken over by another device
      localStorage.removeItem('u3dq_pseudo');
      localStorage.removeItem('u3dq_token');
      myPseudo = ''; myToken = '';
      const errEl = document.getElementById('pseudoErr');
      if (errEl) { errEl.textContent = 'Ta session a expiré ou un autre appareil t\'a déconnecté. Reconnecte-toi.'; errEl.style.display = 'block'; }
      // Fall through to show landing screen
    } else {
      myScore      = p.score      || 0;
      myFoundCount = p.found_count || 0;
      document.getElementById('pseudoScreen').style.display = 'none';
      document.getElementById('bgMap').style.display = 'none';
      if (checkin) sessionStorage.setItem('pendingCheckin', checkinId);
      initGame(foundId);
      return;
    }
  }

  // New user: show animated landing with bgMap
  if (foundId) sessionStorage.setItem('pendingFound', foundId);
  if (checkin) sessionStorage.setItem('pendingCheckin', checkinId);

  bgMap = L.map('bgMap', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false, keyboard: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>', subdomains: 'abcd', maxZoom: 19 }).addTo(bgMap);
  bgMap.setView(mapCenter, 14);
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      bgMap && bgMap.setView([pos.coords.latitude, pos.coords.longitude], 15);
    }, () => {}, { timeout: 5000 });
  }
});

function hideLanding() {
  document.getElementById('pseudoScreen').style.display = 'none';
  if (bgMap) { bgMap.remove(); bgMap = null; }
  document.getElementById('bgMap').style.display = 'none';
}

// ── Register & start ─────────────────────────────────
async function startGame() {
  const input     = document.getElementById('pseudoInput');
  const passInput = document.getElementById('passwordInput');
  const err       = document.getElementById('pseudoErr');
  const pseudo    = input.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const pass      = (passInput && passInput.style.display !== 'none') ? passInput.value : '';
  const isStg      = SUPABASE_ENV.name === 'stg';

  if (pseudo.length < 2) { err.textContent = 'Pseudo trop court (min 2 caractères)'; err.style.display = 'block'; return; }
  if (!isStg && pass.length < 4) { err.textContent = 'Mot de passe trop court (min 4 caractères)'; err.style.display = 'block'; return; }

  // Check game code if required
  if (gameCode) {
    const entered = (document.getElementById('gameCodeInput').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (entered !== gameCode) { err.textContent = 'Code d\'accès incorrect.'; err.style.display = 'block'; return; }
  }
  err.style.display = 'none';

  document.getElementById('startBtn').disabled = true;
  document.getElementById('startBtn').textContent = '⏳ Connexion…';

  const hash  = isStg ? null : await sha256(pass);
  const token = crypto.randomUUID();

  // Check/insert player
  const { data: existing } = await db.from('players').select('pseudo,score,found_count,password_hash').eq('pseudo', pseudo).single();
  if (!existing) {
    // New player — register
    const insertData = { pseudo, joined_at: new Date().toISOString(), score: 0, found_count: 0, session_token: token };
    if (!isStg) insertData.password_hash = hash;
    const { error } = await db.from('players').insert(insertData);
    if (error && error.code !== '23505') {
      err.textContent = 'Erreur réseau : ' + error.message;
      err.style.display = 'block';
      document.getElementById('startBtn').disabled = false;
      document.getElementById('startBtn').textContent = '🚀 Rejoindre le jeu';
      return;
    }
    if (error) {
      // Race: pseudo registered between our read and insert → treat as login
      const { data: raced } = await db.from('players').select('pseudo,score,found_count,password_hash').eq('pseudo', pseudo).single();
      if (!raced || (!isStg && raced.password_hash && raced.password_hash !== hash)) {
        err.textContent = 'Pseudo déjà pris — choisis-en un autre ou entre ton mot de passe.';
        err.style.display = 'block';
        document.getElementById('startBtn').disabled = false;
        document.getElementById('startBtn').textContent = '🚀 Rejoindre le jeu';
        return;
      }
      myScore = raced.score || 0; myFoundCount = raced.found_count || 0;
      await db.from('players').update({ session_token: token }).eq('pseudo', pseudo);
    }
  } else {
    // Existing player — verify password (PROD only)
    if (!isStg && existing.password_hash && existing.password_hash !== hash) {
      err.textContent = 'Mot de passe incorrect.';
      err.style.display = 'block';
      document.getElementById('startBtn').disabled = false;
      document.getElementById('startBtn').textContent = '🚀 Rejoindre le jeu';
      return;
    }
    // If password_hash is empty (pre-auth player): accept any password and set it now (first-login claim)
    const updates = { session_token: token };
    if (!isStg && !existing.password_hash) updates.password_hash = hash;
    await db.from('players').update(updates).eq('pseudo', pseudo);
    myScore      = existing.score      || 0;
    myFoundCount = existing.found_count || 0;
  }

  myPseudo = pseudo;
  myToken  = token;
  localStorage.setItem('u3dq_pseudo', pseudo);
  localStorage.setItem('u3dq_token', token);
  hideLanding();

  const pending = sessionStorage.getItem('pendingFound');
  sessionStorage.removeItem('pendingFound');
  initGame(pending);
}

async function continueAsGuest() {
  const err = document.getElementById('pseudoErr');
  // Keep access-code protection if configured, even for guest browsing.
  if (gameCode) {
    const entered = (document.getElementById('gameCodeInput').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (entered !== gameCode) { err.textContent = 'Code d\'accès incorrect.'; err.style.display = 'block'; return; }
  }
  err.style.display = 'none';
  hideLanding();
  sessionStorage.removeItem('pendingFound');
  sessionStorage.removeItem('pendingCheckin');
  history.replaceState({}, '', location.pathname);
  initGame(null);
}
