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
  const pseudo    = input.value.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '');
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

// ── Init game ────────────────────────────────────────
async function initGame(pendingFoundId) {
  updateHeader();
  updateModeUI();
  updateGpsLoadingPanel();
  document.body.classList.toggle('flash-mode', activeGameMode === 'unique');
  document.getElementById('radarBar').style.display = 'block';

  // Load config
  const { data: cfg } = await db.from('config').select('*');
  if (cfg) {
    const c = Object.fromEntries(cfg.map(r => [r.key, r.value]));
    if (c.proximityRadius) proximityR = Number(c.proximityRadius);
    if (c.fixedTotal)      fixedTotal  = Number(c.fixedTotal);
    if (c.modeMap !== undefined)     modeMap     = c.modeMap !== 'false';
    if (c.modeCompass !== undefined) modeCompass = c.modeCompass !== 'false';
    if (c.gameActive === 'false') showPause();
    if (c.activeQuests) { try { activeQuests = JSON.parse(c.activeQuests); } catch(e) { activeQuests = []; } }
    else if (c.activeQuest) { activeQuests = c.activeQuest ? [c.activeQuest] : []; }
    if (c.mapCenter) {
      const parts = c.mapCenter.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0])) mapCenter = parts;
    }
    if (c.gameStart) {
      const gs = new Date(c.gameStart);
      if (!isNaN(gs.getTime())) gameStart = gs;
    }
    // Tutorial example photo
    if (c.examplePhotoUrl) {
      const qtp = document.getElementById('qtExamplePhoto');
      if (qtp) { qtp.src = c.examplePhotoUrl; qtp.style.display = 'block'; }
    }
  }

  // Load treasures & init map
  await loadTreasures();
  initMap();
  batterySaverMode = !!localStorage.getItem('u3dq_bsaver');
  if (batterySaverMode) {
    const bso = document.getElementById('batterySaverOverlay');
    if (bso) bso.classList.add('active');
  } else {
    startCompassInterval();
  }

  // Start orientation sensor (Android = no permission; iOS = button shown)
  startOrientationWatch();

  // iOS Safari needs a small delay after page load before watchPosition works reliably
  setTimeout(() => startGeoWatch(), 300);
  const gpsChipEl = document.getElementById('gpsChip');
  if (gpsChipEl && !gpsChipEl.dataset.boundKick) {
    gpsChipEl.dataset.boundKick = '1';
    gpsChipEl.style.cursor = 'pointer';
    gpsChipEl.addEventListener('click', () => requestGpsKick());
  }
  const radarBarEl = document.getElementById('radarBar');
  if (radarBarEl && !radarBarEl.dataset.boundKick) {
    radarBarEl.dataset.boundKick = '1';
    radarBarEl.addEventListener('click', () => {
      if (playerLat === null) requestGpsKick();
    });
  }
  if (isIOSDevice() && !geoGestureKickBound) {
    geoGestureKickBound = true;
    const oneShotKick = () => {
      if (playerLat === null) requestGpsKick();
      document.removeEventListener('touchend', oneShotKick, true);
      document.removeEventListener('click', oneShotKick, true);
    };
    document.addEventListener('touchend', oneShotKick, true);
    document.addEventListener('click', oneShotKick, true);
  }
  startLbPolling();
  updateProgressBar();

  // Clean URL & process pending QR
  if (pendingFoundId) {
    history.replaceState({}, '', location.pathname);
    await processFindById(pendingFoundId);
  }

  // Process QR balise checkin
  if (sessionStorage.getItem('pendingCheckin')) {
    const cid = sessionStorage.getItem('pendingCheckin');
    sessionStorage.removeItem('pendingCheckin');
    sessionStorage.setItem('_checkinTargetId', cid);
    history.replaceState({}, '', location.pathname);
    processCheckin();
  }

  maybeOpenQuickTutorial();
  // Welcome back toast for returning players
  if (myPseudo && myFoundCount > 0) {
    const remaining = treasures.filter(t => t.type === 'fixed' && !(t.found_by && t.found_by.split(',').includes(myPseudo))).length;
    if (remaining > 0) {
      const wt = document.getElementById('welcomeToast');
      if (wt) {
        wt.textContent = `Bon retour ${myPseudo} ! Il te reste ${remaining} polaroid${remaining > 1 ? 's' : ''} à trouver.`;
        wt.classList.add('show');
        setTimeout(() => wt.classList.remove('show'), 4000);
      }
    }
  }
}

// ── QR balise checkin ────────────────────────────────
function processCheckin() {
  if (playerLat === null) {
    let waited = 0;
    const poll = setInterval(() => {
      waited += 500;
      if (playerLat !== null) { clearInterval(poll); _doCheckin(); }
      else if (waited >= 10000) { clearInterval(poll); _checkinError('GPS indisponible — active la localisation et réessaie.'); }
    }, 500);
  } else {
    _doCheckin();
  }
}

function _doCheckin() {
  const targetId = sessionStorage.getItem('_checkinTargetId') || '';
  sessionStorage.removeItem('_checkinTargetId');

  // Cas 1 : ID spécifique (QR par balise)
  if (targetId && targetId !== '1') {
    const t = treasures.find(t => t.id === targetId);
    if (!t) { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return; }
    if (t.found_by && t.found_by.split(',').includes(myPseudo)) {
      _checkinError('Tu as déjà révélé ce polaroid. 📷'); return;
    }
    const dist = haversine(playerLat, playerLng, t.lat, t.lng);
    if (dist > proximityR) {
      _checkinError(`Tu es à ${Math.round(dist)}m de "${tLabel(t)}" — trop loin pour révéler.\nApproche-toi à moins de ${proximityR}m.`, t.id);
      return;
    }
    processFindById(t.id);
    return;
  }

  // Cas 2 : QR générique legacy (checkin=1) → balise la plus proche
  const candidates = treasures.filter(t => {
    if (t.type !== 'fixed') return false;
    if (t.found_by && t.found_by.split(',').includes(myPseudo)) return false;
    return true;
  });
  if (!candidates.length) { _checkinError('Tu as révélé tous les polaroids ! 🏆'); return; }
  const nearest = candidates
    .map(t => ({ ...t, dist: haversine(playerLat, playerLng, t.lat, t.lng) }))
    .sort((a, b) => a.dist - b.dist)[0];
  if (nearest.dist > proximityR) {
    _checkinError(`Tu es à ${Math.round(nearest.dist)}m — trop loin pour révéler.\nApproche-toi à moins de ${proximityR}m.`, nearest.id);
    return;
  }
  processFindById(nearest.id);
}

let _lastCheckinId = null; // pour le bouton Réessayer

function _checkinError(msg, retryId) {
  setFoundIcon('gps', 'warn');
  document.getElementById('foundTitle').textContent = 'Polaroid trouvé !';
  document.getElementById('foundDuration').textContent = '';
  document.getElementById('foundDesc').textContent = msg;
  document.getElementById('foundPhotoStrip').style.display = 'none';
  document.getElementById('foundPhoto').style.display = 'none';
  // Bouton Réessayer : visible uniquement si un ID de balise est fourni
  _lastCheckinId = retryId || null;
  const retryBtn = document.getElementById('foundRetryBtn');
  if (retryBtn) retryBtn.style.display = retryId ? 'block' : 'none';
  document.getElementById('foundModal').classList.add('open');
}

function _retryCheckin() {
  closeFound();
  if (_lastCheckinId) {
    openQRScanner(_lastCheckinId);
  } else {
    processCheckin();
  }
}

function updateHeader() {
  const chip = document.getElementById('headerPseudo');
  if (!chip) return;
  if (myPseudo) {
    chip.textContent = myPseudo;
    chip.title = '';
  } else {
    chip.textContent = '👤 Se connecter';
    chip.title = 'Cliquer pour rejoindre le jeu';
  }
}

function updateModeUI() {
  const pbLabel = document.querySelector('#progressBar .pb-label span');
  const arrowBtn = document.getElementById('arrowToggleBtn');
  const guideTitle = document.getElementById('modeGuideTitle');
  const guideText = document.getElementById('modeGuideText');
  const miniMap = document.getElementById('miniMap');

  if (pbLabel) {
    pbLabel.textContent = activeGameMode === 'fixed'
      ? 'Polaroids révélés'
      : 'Flash';
  }

  if (arrowBtn) arrowBtn.style.display = activeGameMode === 'fixed' ? 'block' : 'none';

  if (miniMap) {
    miniMap.classList.toggle('mode-fixed', activeGameMode === 'fixed');
    miniMap.classList.toggle('mode-flash', activeGameMode === 'unique');
  }

  if (guideTitle && guideText) {
    if (activeGameMode === 'fixed') {
      guideTitle.textContent = 'Mode Quête';
      guideText.textContent = 'Balise fixe: approche-toi, trouve l\'objet et scanne.';
    } else {
      guideTitle.textContent = 'Mode Flash';
      guideText.textContent = 'Trésor unique: trouve l\'objet en premier.';
    }
  }
}

function updateTutorialEntryPoints() {
  const bigBtn = document.getElementById('openTutorialBtn');
  const miniBtn = document.getElementById('tutorialMiniBtn');
  if (bigBtn) bigBtn.style.display = tutorialSeen ? 'none' : 'inline-flex';
  if (miniBtn) miniBtn.style.display = tutorialSeen ? 'inline-flex' : 'none';
}

function setGameMode(mode) {
  const nextMode = mode === 'unique' ? 'unique' : 'fixed';
  if (activeGameMode === nextMode) return;
  activeGameMode = nextMode;
  localStorage.setItem('u3dq_game_mode', activeGameMode);
  document.body.classList.toggle('flash-mode', activeGameMode === 'unique');
  updateModeUI();
  updateRadar();
  updateNearestCard();
  updateProgressBar();
  // Si on est sur l'onglet Collection, rafraichit l'affichage de la quete
  if (activeTab === 'moi') {
    const ps = document.getElementById('parcoursSection');
    if (ps) ps.style.display = activeGameMode === 'fixed' ? 'block' : 'none';
    if (activeGameMode === 'fixed') loadBalises();
  }

  lastArrowLat = null;
  lastArrowLng = null;
  lastArrowHeading = null;
  _clearArrows();
  renderMarkers();
  applyExploreMapLock();
  applyMapHeadingRotation();
  updateCompass();
  updateGpsLoadingPanel();
}

// Reconnexion depuis mode invité : rouvre l'écran pseudo
function onHeaderPseudoClick() {
  if (myPseudo) {
    showTabFromMore('moi');
  } else {
    const ps = document.getElementById('pseudoScreen');
    if (ps) ps.style.display = 'flex';
    const inp = document.getElementById('pseudoInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

function openQuickTutorial() {
  const el = document.getElementById('quickTutorial');
  if (!el) return;
  el.classList.add('open');
}

function closeQuickTutorial(evt) {
  const el = document.getElementById('quickTutorial');
  if (!el) return;
  if (evt && evt.target && evt.target.id !== 'quickTutorial') return;
  el.classList.remove('open');
  tutorialSeen = true;
  localStorage.setItem('u3dq_tuto_seen', '1');
  updateTutorialEntryPoints();
}

function tutorialEnableGps() {
  requestGpsKick();
}

function tutorialEnableCompass() {
  const hasCompassPermAPI = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (hasCompassPermAPI) {
    requestCompassPermission();
    return;
  }
  const bar = document.getElementById('radarBar');
  if (bar) {
    bar.textContent = '🧭 Compas actif (ou non requis sur cet appareil)';
    bar.className = '';
  }
}

function maybeOpenQuickTutorial() {
  updateTutorialEntryPoints();
  if (tutorialSeen) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const hasCompassAPI = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (isIOS && hasCompassAPI) {
    const btn = document.getElementById('tutorialCompassBtn');
    const note = document.getElementById('qtCompassNote');
    if (btn) btn.classList.add('compass-required');
    if (note) note.style.display = 'block';
  }
  setTimeout(() => openQuickTutorial(), 500);
}

async function loadTreasures() {
  // Snapshot available flash treasures before refresh (for "just taken nearby" detection)
  const _prevAvailableFlash = new Set(
    treasures.filter(t => t.type === 'unique' && !(t.found_by && t.found_by.length > 0)).map(t => t.id)
  );
  const { data, error } = await db.from('treasures')
    .select('id,type,lat,lng,label,hint,visible,photo_url,found_by,placed_at,quest')
    .eq('visible', true);
  if (error) {
    console.error('loadTreasures error:', error.message);
    const bar = document.getElementById('radarBar');
    if (bar) { bar.textContent = '⚠️ Erreur réseau — vérifie ta connexion'; bar.className = ''; }
    return;
  }
  if (!data) return;
  // Filter client-side: if no active quest, show all. Otherwise show matching quest + no-quest (null or '')
  if (activeQuests.length) {
    treasures = data.filter(t => !t.quest || activeQuests.includes(t.quest));
  } else {
    treasures = data;
  }
  // Sync fixedTotal from actual DB count — stays accurate even if config key 'fixedTotal' is stale
  const actualFixed = treasures.filter(t => t.type === 'fixed').length;
  if (actualFixed > 0) fixedTotal = actualFixed;

  // Detect flash treasures taken by someone else while we were nearby
  if (_prevAvailableFlash.size > 0 && playerLat !== null && activeGameMode === 'unique') {
    const newlyTaken = treasures.filter(t =>
      t.type === 'unique' &&
      _prevAvailableFlash.has(t.id) &&
      t.found_by && t.found_by.length > 0 &&
      !(myPseudo && t.found_by.split(',').includes(myPseudo)) &&
      t.lat && t.lng &&
      haversine(playerLat, playerLng, t.lat, t.lng) <= 300
    );
    if (newlyTaken.length > 0) showFlashTakenToast(newlyTaken);
  }
}

function showFlashTakenToast(taken) {
  const el = document.getElementById('flashTakenToast');
  if (!el) return;
  if (taken.length === 1) {
    const who = taken[0].found_by || '?';
    el.textContent = `⚡ ${who} vient de prendre le trésor !`;
  } else {
    el.textContent = `⚡ ${taken.length} trésors viennent d'être pris !`;
  }
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ── Map ──────────────────────────────────────────────

// ── QR Scanner ───────────────────────────────────────
let qrExpectedId = null;
let qrDecodeLocked = false;
let qrTorchOn = false;
let html5QrInst = null;
// Native BarcodeDetector path (Android Chrome = Google ML Kit)
let _nativeStream = null;
let _nativePollId = null;
let _nativeRefocusId = null;

function openQRScanner(beaconId) {
  qrExpectedId = beaconId || null;
  const status = document.getElementById('qrStatus');
  status.className = '';
  status.textContent = 'Révélation en cours…';
  document.getElementById('qrPreviewWrap').style.display = 'none';
  document.getElementById('qrTorchBtn').style.display = 'none';
  qrDecodeLocked = false;
  _resetQRInput();
  // Show target beacon name so player confirms they're scanning the right object
  const targetEl = document.getElementById('qrTarget');
  if (targetEl) {
    const t = beaconId ? treasures.find(x => x.id === beaconId) : null;
    if (t) {
      targetEl.querySelector('.qrt-name').textContent = t.name;
      const questSpan = targetEl.querySelector('.qrt-quest');
      questSpan.textContent = t.quest ? t.quest : '';
      questSpan.style.display = t.quest ? 'block' : 'none';
      targetEl.style.display = 'block';
    } else {
      targetEl.style.display = 'none';
    }
  }
  document.getElementById('qrOverlay').classList.add('open');
  startLiveQRScan();
}

async function startLiveQRScan() {
  const status = document.getElementById('qrStatus');
  document.getElementById('qrTips').style.display = 'none';
  await stopLiveQRScan();
  const isStg = SUPABASE_ENV.name === 'stg';

  // Réinitialise le log debug STG
  const dbg = document.getElementById('qrDebugLog');
  if (isStg && dbg) { dbg.textContent = ''; dbg.style.display = 'block'; }
  function _qrLog(msg) {
    if (!isStg || !dbg) return;
    dbg.textContent += msg + '\n';
    dbg.scrollTop = dbg.scrollHeight;
  }

  let useNative = false;
  let bdInfo = 'absent';
  if (typeof BarcodeDetector !== 'undefined') {
    try {
      const fmts = await BarcodeDetector.getSupportedFormats();
      useNative = fmts.includes('qr_code');
      bdInfo = useNative ? 'OK qr_code' : 'NO qr_code (' + fmts.slice(0,4).join(',') + ')';
    } catch(e) { bdInfo = 'ERR: ' + (e.message||e).toString().slice(0,40); }
  }
  _qrLog('BD: ' + bdInfo);
  _qrLog('moteur: ' + (useNative ? 'NATIF ML Kit' : 'ZXing fallback'));

  if (useNative) {
    await _startNativeScan(status, isStg, _qrLog);
  } else {
    await _startHtml5Scan(status, isStg, _qrLog);
  }
}

async function _startNativeScan(status, isStg, _qrLog) {
  try {
    _nativeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    const track = _nativeStream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    _qrLog('cam: ' + (settings.width||'?') + 'x' + (settings.height||'?') + ' facing:' + (settings.facingMode||'?'));

    const readerDiv = document.getElementById('qrReader');
    readerDiv.style.display = 'block';
    const video = document.createElement('video');
    video.id = '_nativeQrVideo';
    video.autoplay = true; video.playsInline = true; video.muted = true;
    video.style.cssText = 'width:100%;display:block;max-height:50vh;object-fit:cover;border-radius:14px';
    readerDiv.appendChild(video);
    video.srcObject = _nativeStream;
    await video.play();
    status.className = '';
    status.textContent = '📷 Vise le QR du polaroid';

    // Focus + zoom directs sur le track (1.5x, pas 2x qui peut gêner le macro)
    setTimeout(async () => {
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const c = {};
        if (caps.focusMode && caps.focusMode.includes('continuous')) c.focusMode = 'continuous';
        if (caps.zoom && caps.zoom.max >= 1.5) c.zoom = 1.5;
        if (Object.keys(c).length) await track.applyConstraints(c);
        if (caps.torch) document.getElementById('qrTorchBtn').style.display = 'flex';
        _qrLog('zoom:' + (c.zoom||1) + 'x focus:' + (c.focusMode||'n/a'));
      } catch(e) {
        _qrLog('constraints ERR: ' + (e.message||'').slice(0,50));
      }
    }, 1000);

    // Refocus forcé toutes les 4s : single-shot → continuous
    // Compense l'autofocus qui se bloque sur Android WebRTC
    _nativeRefocusId = setInterval(async () => {
      if (!_nativeStream) return;
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes('single-shot'))
          await track.applyConstraints({ focusMode: 'single-shot' });
        await new Promise(r => setTimeout(r, 400));
        if (caps.focusMode && caps.focusMode.includes('continuous'))
          await track.applyConstraints({ focusMode: 'continuous' });
      } catch(e) {}
    }, 4000);

    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 640;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let frameCount = 0;
    _nativePollId = setInterval(async () => {
      if (!_nativeStream || video.readyState < 2 || !video.videoWidth) return;
      frameCount++;
      try {
        // Crop carré central 70% du min(w,h) → scale 640×640
        // → QR occupe beaucoup plus de pixels, ML Kit le lit mieux
        const minDim = Math.min(video.videoWidth, video.videoHeight);
        const size = minDim * 0.7;
        const sx = (video.videoWidth  - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, 640, 640);
        const codes = await detector.detect(canvas);
        if (frameCount % 20 === 0) _qrLog('f' + frameCount + ' crop:' + Math.round(size) + 'px → ' + codes.length + ' QR');
        if (codes.length > 0) {
          clearInterval(_nativePollId); _nativePollId = null;
          _qrLog('SCAN OK: ' + codes[0].rawValue.slice(0,40));
          await stopLiveQRScan();
          await _qrHandleResult(codes[0].rawValue);
        }
      } catch(e) {
        if (frameCount % 20 === 0) _qrLog('detect ERR: ' + (e.message||'').slice(0,50));
      }
    }, 250);
  } catch(err) {
    if (_nativeStream) { _nativeStream.getTracks().forEach(t => t.stop()); _nativeStream = null; }
    _qrLog('getUserMedia ERR: ' + (err.message||err).toString().slice(0,60));
    status.textContent = '⚠️ Caméra bloquée. Autorise la caméra puis utilise Photo du polaroid (secours).';
    status.className = 'qr-err';
    document.getElementById('qrTips').style.display = 'block';
  }
}

async function _startHtml5Scan(status, isStg, _qrLog) {
  try {
    html5QrInst = new Html5Qrcode('qrReader', { verbose: false });
    document.getElementById('qrReader').style.display = 'block';
    await html5QrInst.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0,
        videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
      async (decodedText) => {
        await stopLiveQRScan();
        await _qrHandleResult(decodedText);
      },
      () => {}
    );
    status.className = ''; status.textContent = '📷 Vise le QR du polaroid';
    _qrLog('ZXing start OK');
    setTimeout(async () => {
      if (!html5QrInst) return;
      try {
        const caps = html5QrInst.getRunningTrackCapabilities();
        const constraints = {};
        if (caps && caps.focusMode && caps.focusMode.includes('continuous')) constraints.focusMode = 'continuous';
        if (caps && caps.zoom) constraints.advanced = [{ zoom: Math.min(2.0, caps.zoom.max) }];
        if (Object.keys(constraints).length) await html5QrInst.applyVideoConstraints(constraints);
        if (caps && caps.torch) document.getElementById('qrTorchBtn').style.display = 'flex';
        const z = (constraints.advanced && constraints.advanced[0]) ? constraints.advanced[0].zoom : 1;
        _qrLog('zoom:' + z + 'x focus:' + (constraints.focusMode||'n/a'));
      } catch(e) {
        _qrLog('constraints ERR: ' + (e.message||'').slice(0,50));
      }
    }, 1500);
  } catch(err) {
    html5QrInst = null;
    _qrLog('ZXing start ERR: ' + (err.message||err).toString().slice(0,60));
    status.textContent = '⚠️ Caméra bloquée. Autorise la caméra puis utilise Photo du polaroid (secours).';
    status.className = 'qr-err';
    document.getElementById('qrTips').style.display = 'block';
  }
}

async function stopLiveQRScan() {
  // Stop native BarcodeDetector path
  if (_nativePollId) { clearInterval(_nativePollId); _nativePollId = null; }
  if (_nativeRefocusId) { clearInterval(_nativeRefocusId); _nativeRefocusId = null; }
  if (_nativeStream) { _nativeStream.getTracks().forEach(t => t.stop()); _nativeStream = null; }
  const nativeVideo = document.getElementById('_nativeQrVideo');
  if (nativeVideo) nativeVideo.remove();
  // Stop html5-qrcode path
  if (html5QrInst) {
    try { await html5QrInst.stop(); } catch(e) {}
    try { html5QrInst.clear(); } catch(e) {}
    html5QrInst = null;
  }
  const reader = document.getElementById('qrReader');
  if (reader) reader.style.display = 'none';
  const torchBtn = document.getElementById('qrTorchBtn');
  if (torchBtn) { torchBtn.style.display = 'none'; torchBtn.textContent = '💡 Lampe'; }
  qrTorchOn = false;
}

async function toggleQRTorch() {
  qrTorchOn = !qrTorchOn;
  try {
    if (_nativeStream) {
      const track = _nativeStream.getVideoTracks()[0];
      if (track) await track.applyConstraints({ advanced: [{ torch: qrTorchOn }] });
    } else if (html5QrInst) {
      await html5QrInst.applyVideoConstraints({ advanced: [{ torch: qrTorchOn }] });
    }
    document.getElementById('qrTorchBtn').textContent = qrTorchOn ? '💡 Lampe ON' : '💡 Lampe';
  } catch(e) { qrTorchOn = false; }
}

function _resetQRInput() {
  // Clone input to guarantee onchange fires even if same file is re-selected (iOS bug)
  const old = document.getElementById('qrFileInput');
  const fresh = document.createElement('input');
  fresh.type = 'file';
  fresh.accept = 'image/*';
  fresh.setAttribute('capture', 'environment');
  fresh.id = 'qrFileInput';
  fresh.style.display = 'none';
  fresh.addEventListener('change', () => handleQRPhoto(fresh));
  old.parentNode.replaceChild(fresh, old);
}

async function handleQRPhoto(input) {
  if (!input.files || !input.files[0]) return;
  await stopLiveQRScan();
  const status = document.getElementById('qrStatus');
  status.className = '';
  status.textContent = '🔍 Révélation en cours…';
  document.getElementById('qrTips').style.display = 'none';
  const file = input.files[0];
  const url = URL.createObjectURL(file);
  document.getElementById('qrPreviewImg').src = url;
  document.getElementById('qrPreviewWrap').style.display = 'block';
  try {
    const scanner = new Html5Qrcode('qrReader', { verbose: false });
    const decodedText = await scanner.scanFile(file, false);
    URL.revokeObjectURL(url);
    await _qrHandleResult(decodedText);
  } catch(err) {
    URL.revokeObjectURL(url);
    status.textContent = '❌ Polaroid non reconnu — réessaie en te rapprochant et en éclairant bien le polaroid';
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    document.getElementById('qrTips').style.display = 'block';
    _resetQRInput();
  }
}
async function _qrHandleResult(raw) {
  if (qrDecodeLocked) return;
  qrDecodeLocked = true;
  const status = document.getElementById('qrStatus');
  const match  = raw.match(/[?&](?:checkin|found)=([^&\s]+)/);
  if (!match) {
    status.textContent = '⚠️ Ce code n\'appartient pas au jeu — cherche le bon polaroid !';
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    qrDecodeLocked = false;
    return;
  }
  const scannedId = decodeURIComponent(match[1]);

  if (qrExpectedId && scannedId !== qrExpectedId) {
    status.textContent = '⚠️ Mauvais polaroid — cherche le bon !';
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    qrDecodeLocked = false;
    startLiveQRScan();
    _resetQRInput(); // permettre de retenter immédiatement
  } else {
    status.textContent = '✅ Polaroid révélé !';
    status.className = 'qr-ok';
    haptic([80, 40, 160]);
    await new Promise(r => setTimeout(r, 400));
    closeQRScanner();
    await processFindById(scannedId);
  }
}

function closeQRScanner() {
  stopLiveQRScan();
  document.getElementById('qrOverlay').classList.remove('open');
  qrExpectedId = null;
  qrDecodeLocked = false;
}

async function captureFixedById(id) {
  openQRScanner(id);
}


// ── Find processing & UI feedback ───────────────────
let _processingFind = false;
const _inFlightCaptures = new Set(); // protection double-scan par balise

async function processFindById(treasureId) {
  if (_processingFind) return;
  if (_inFlightCaptures.has(treasureId)) return;
  _processingFind = true;
  _inFlightCaptures.add(treasureId);
  try {
    await _doProcessFind(treasureId);
  } finally {
    _processingFind = false;
    _inFlightCaptures.delete(treasureId);
  }
}

async function _doProcessFind(treasureId) {
  if (!myPseudo) { _checkinError('Mode invité : connecte-toi pour révéler des polaroids.'); return; }
  const foundCountBefore = myFoundCount;
  // Fetch treasure fresh from DB
  const { data: t, error } = await db.from('treasures').select('*').eq('id', treasureId).single();
  if (error || !t) { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return; }
  if (!t.visible)  { _checkinError('Ce polaroid n\'est pas encore actif.'); return; }

  // Check if already found by me
  const foundList = (t.found_by || '').split(',').filter(Boolean);
  if (foundList.includes(myPseudo)) { showFoundResult('already', t); return; }

  // Unique: check if taken
  if (t.type === 'unique' && foundList.length > 0) { showFoundResult('taken', t); return; }

  // Server-side dedup: prevents double-write from multi-tab or rapid re-scan
  const { data: dupEvent } = await db.from('events').select('id').eq('pseudo', myPseudo).eq('treasure_id', t.id).maybeSingle();
  if (dupEvent) { showFoundResult('already', t); return; }

  // Calculate duration
  // Calculate duration from max(placed_at, gameStart) to now
  const refTime = gameStart && gameStart > new Date(t.placed_at) ? gameStart : new Date(t.placed_at);
  const durationSec = Math.max(0, Math.round((Date.now() - refTime.getTime()) / 1000));

  // Update treasure found_by
  const newFoundBy = t.type === 'unique' ? myPseudo : [...foundList, myPseudo].join(',');
  const updatePayload = { found_by: newFoundBy, found_at: new Date().toISOString() };
  const updateQ = db.from('treasures').update(updatePayload).eq('id', t.id);
  const { error: updateError, data: updatedRows } = t.type === 'unique'
    ? await updateQ.eq('found_by', '').select('id')
    : await updateQ.select('id');
  if (updateError || !updatedRows || !updatedRows.length) {
    if (t.type === 'unique') {
      showFoundResult('taken', t);
    } else {
      _checkinError('Révélation impossible pour le moment. Réessaie dans quelques secondes.');
    }
    return;
  }

  // Log event (server now owns score/found_count aggregation)
  const { error: eventError } = await db.from('events').insert({ pseudo: myPseudo, treasure_id: t.id, treasure_type: t.type, duration_sec: durationSec });
  if (eventError) {
    if (eventError.code === '23505') {
      showFoundResult('already', t);
      return;
    }
    _checkinError('Révélation enregistrée partiellement. Réessaie dans quelques secondes.');
    return;
  }

  let durationSecHunt = null;
  if (t.type === 'fixed') {
    const firstFixedKey = `u3dq_first_fixed_at_${myPseudo}`;
    if (foundCountBefore === 0) {
      localStorage.setItem(firstFixedKey, String(Date.now()));
      durationSecHunt = 0;
    } else {
      const firstFixedAt = Number(localStorage.getItem(firstFixedKey) || 0);
      durationSecHunt = firstFixedAt ? Math.max(0, Math.round((Date.now() - firstFixedAt) / 1000)) : 0;
    }
  }

  // Score/found_count are server-managed from events (trigger-side).
  // Reload local counters from players after event commit.
  const { data: pFresh } = await db.from('players').select('score,found_count').eq('pseudo', myPseudo).single();
  if (pFresh) {
    myScore = pFresh.score || 0;
    myFoundCount = pFresh.found_count || 0;
  }

  // Refresh local treasures
  await loadTreasures();
  renderMarkers();
  updateHeader();
  updateRadar();
  updateProgressBar();

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate([80, 40, 160]);

  // Détecter fin de quête (balises fixes d'une quête nommée toutes trouvées)
  if (t.type === 'fixed' && t.quest) {
    const questBeacons = treasures.filter(x => x.type === 'fixed' && x.quest === t.quest);
    const allFound = questBeacons.every(x => {
      const fl = (x.found_by || '').split(',').filter(Boolean);
      return fl.includes(myPseudo);
    });
    if (allFound && questBeacons.length > 0) {
      showFoundResult('success', t, durationSec, durationSecHunt);
      setTimeout(() => showQuestComplete(t.quest, durationSecHunt, questBeacons.length), 2200);
      return;
    }
  }

  showFoundResult('success', t, durationSec, durationSecHunt);
}

function showFoundResult(status, t, durationSec, durationSecHunt) {
  const modal = document.getElementById('foundModal');
  const emoji  = document.getElementById('foundEmoji');
  const label  = document.getElementById('foundLabel');
  const title  = document.getElementById('foundTitle');
  const dur    = document.getElementById('foundDuration');
  const desc   = document.getElementById('foundDesc');

  // Show photos if available and found
  const photoStrip = document.getElementById('foundPhotoStrip');
  const photoSingle = document.getElementById('foundPhoto');
  photoSingle.style.display = 'none';
  if (status === 'success') {
    const photos = getPhotoUrls(t.photo_url);
    if (photos.length) {
      photoStrip.innerHTML = photos.map(safeImgUrl).filter(Boolean).map(url => `<img src="${escHtml(url)}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-bottom:6px;display:block">`).join('');
      photoStrip.style.display = 'block';
    } else { photoStrip.style.display = 'none'; }
  } else { photoStrip.style.display = 'none'; }

  if (status === 'success') {
    if (t.type === 'fixed') {
      // Compte combien de fixes il reste
      const remaining = treasures.filter(tr =>
        tr.type === 'fixed' &&
        !(tr.found_by && tr.found_by.split(',').includes(myPseudo)) &&
        tr.id !== t.id
      ).length;
      const foundNow = fixedTotal - remaining;
      if (foundNow === 1) {
        setFoundIcon('camera', 'teal');
        label.textContent = 'PREMIÈRE RÉVÉLATION';
        title.textContent = 'La chasse commence !';
        desc.textContent = `Le chrono est lancé. Trouve les ${fixedTotal - 1} autres polaroids le plus vite possible.`;
        dur.textContent = '';
      } else if (remaining === 0) {
        setFoundIcon('camera', 'teal');
        label.textContent = 'POLAROID RÉVÉLÉ';
        title.textContent = 'Polaroid révélé !';
        dur.textContent = durationSec != null ? formatDuration(durationSec) + ' depuis le début' : '';
        desc.textContent = 'Incroyable ! Ta quete est complete !';
        db.from('config').select('key,value').then(({ data: cfgData }) => {
          if (!cfgData) return;
          const cfg = Object.fromEntries(cfgData.map(r => [r.key, r.value]));
          const msg = activeQuests.map(q => cfg['rewardMessage_'+q]).find(m => m) || cfg['rewardMessage'] || '';
          if (msg) desc.innerHTML = `Ta quete est complete !<br><br><strong>${escHtml(msg)}</strong>`;
        });
      } else if (remaining === 1) {
        setFoundIcon('check', 'success');
        label.textContent = 'PRESQUE !';
        title.textContent = 'Plus qu\'un !';
        desc.textContent = 'Un seul polaroid te sépare de la fin. Tout se joue maintenant.';
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      } else if (remaining === 2) {
        setFoundIcon('flash', 'flash');
        label.textContent = 'EN FEU';
        title.textContent = 'Il n\'en reste plus que deux.';
        desc.textContent = 'Tu y es presque. Ne lâche rien.';
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      } else if (remaining === 3) {
        setFoundIcon('gps', 'teal');
        label.textContent = 'BON RYTHME';
        title.textContent = 'Encore trois à trouver.';
        desc.textContent = 'La fin approche. Reste concentré.';
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      } else {
        const midMessages = [
          { icon: 'camera', className: 'teal', label: 'RÉVÉLÉ', title: 'Polaroid révélé.', desc: `Continue, il t'en reste ${remaining}.` },
          { icon: 'gps', className: 'teal', label: 'EN ROUTE', title: 'Belle trouvaille.', desc: `${remaining} polaroids t'attendent encore.` },
          { icon: 'check', className: 'success', label: 'TROUVÉ', title: 'Tu as l\'œil.', desc: `Plus que ${remaining} dans ce quartier.` },
          { icon: 'gps', className: 'warn', label: 'MARQUÉ', title: 'Dans la boîte.', desc: `${remaining} restants. Ne ralentis pas.` },
          { icon: 'flash', className: 'flash', label: 'EN CHASSE', title: 'La quête avance.', desc: `${remaining} polaroids à révéler.` }
        ];
        const msg = midMessages[foundNow % midMessages.length];
        setFoundIcon(msg.icon, msg.className);
        label.textContent = msg.label;
        title.textContent = msg.title;
        desc.textContent = msg.desc;
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      }
    } else {
      setFoundIcon('flash', 'flash');
      label.textContent = 'FLASH !';
      title.textContent = `Flash ! Tu es le seul à l'avoir.`;
      dur.textContent   = formatDuration(durationSec);
      desc.textContent  = '';
    }
  } else if (status === 'already') {
    setFoundIcon('refresh', 'warn');
    label.textContent = 'DÉJÀ RÉVÉLÉ';
    title.textContent = 'Tu as déjà révélé ce polaroid.';
    dur.textContent   = '';
    desc.textContent  = '';
  } else {
    setFoundIcon('lock', 'danger');
    label.textContent = 'TROP TARD';
    title.textContent = 'Trop tard !';
    dur.textContent   = '';
    desc.textContent  = 'Trop tard. Ce flash a déjà été pris.';
  }
  modal.classList.add('open');
  // Flash overlay on success
  if (status === 'success') {
    const overlay = document.getElementById('foundFlashOverlay');
    if (overlay) {
      overlay.classList.remove('flash');
      void overlay.offsetWidth; // force reflow
      overlay.classList.add('flash');
    }
  }
}

function closeFound() { document.getElementById('foundModal').classList.remove('open'); }

function openPhotoViewer(url) {
  document.getElementById('photoViewerImg').src = url;
  document.getElementById('photoViewer').classList.add('open');
}
function closePhotoViewer() {
  document.getElementById('photoViewer').classList.remove('open');
  document.getElementById('photoViewerImg').src = '';
}

function uiIconSvg(name) {
  switch (name) {
    case 'camera':  return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-camera"/></svg>';
    case 'flash':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-flash"/></svg>';
    case 'trophy':  return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-trophy"/></svg>';
    case 'clock':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-clock"/></svg>';
    case 'check':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-check"/></svg>';
    case 'gps':     return '<svg viewBox="0 0 20 20"><use href="icons/icons.svg#icon-gps"/></svg>';
    case 'refresh': return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-refresh"/></svg>';
    case 'lock':    return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-lock"/></svg>';
    default:        return '';
  }
}

function uiIcon(name, className) {
  return `<span class="ui-icon ${className || ''}" aria-hidden="true">${uiIconSvg(name)}</span>`;
}

function setFoundIcon(name, className) {
  const emoji = document.getElementById('foundEmoji');
  if (!emoji) return;
  emoji.innerHTML = uiIcon(name, `lg ${className || ''}`);
}

function formatDuration(sec) {
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}min ${sec%60}s`;
  return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}min`;
}
function pseudoGradient(pseudo) {
  let seed = 0;
  for (let i = 0; i < pseudo.length; i++) seed = (seed * 31 + pseudo.charCodeAt(i)) & 0xffff;
  const palette = ['#ff3d8a','#00e5ff','#ffb020','#a855f7','#4ade80','#60a5fa','#f87171'];
  return `linear-gradient(135deg,${palette[seed % palette.length]},${palette[(seed*7+3) % palette.length]})`;
}

