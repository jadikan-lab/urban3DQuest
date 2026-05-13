
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

