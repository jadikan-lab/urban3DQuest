// ── Auth, game init, QR scanner, captures ───────────
let bgMap = null;
let accessGateRequired = false;
let accessGateUnlocked = false;
let prelaunchEnabled = false;
let prelaunchLaunchAt = null;
let prelaunchMessage = '';
let prelaunchImageUrl = '';
let prelaunchTimerHandle = null;
let prelaunchPendingAction = null;

function isAllowedPrelaunchImageUrl(raw) {
  const url = String(raw || '').trim();
  return /^(https?:\/\/|data:image\/|\/?media\/)/i.test(url);
}

function normalizePseudo(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function _setLoginFieldsVisibility(show) {
  const pseudoInput = document.getElementById('pseudoInput');
  const passInput = document.getElementById('passwordInput');
  const guestBtn = document.getElementById('guestBtn');
  if (pseudoInput) pseudoInput.style.display = show ? '' : 'none';
  if (passInput) passInput.style.display = show ? '' : 'none';
  if (guestBtn) guestBtn.style.display = show ? '' : 'none';
}

function showAccessGate() {
  accessGateRequired = true;
  accessGateUnlocked = false;
  _setLoginFieldsVisibility(false);
  const codeWrap = document.getElementById('gameCodeWrap');
  const codeInput = document.getElementById('gameCodeInput');
  const startBtn = document.getElementById('startBtn');
  const subtitle = document.querySelector('.ps-sub');
  if (codeWrap) codeWrap.style.display = 'block';
  if (startBtn) startBtn.textContent = 'Entrer';
  if (subtitle) subtitle.textContent = 'Entre le code d\'accès pour ouvrir le jeu';
  if (codeInput) codeInput.focus();
}

function unlockAccessGate() {
  accessGateUnlocked = true;
  _setLoginFieldsVisibility(true);
  const startBtn = document.getElementById('startBtn');
  const subtitle = document.querySelector('.ps-sub');
  const codeWrap = document.getElementById('gameCodeWrap');
  if (startBtn) startBtn.textContent = 'Je cherche';
  if (subtitle) subtitle.innerHTML = 'J\'ai caché des miniatures dans la ville.<br>C\'est à toi de les trouver.';
  if (codeWrap) codeWrap.style.display = 'none';
  const pseudoInput = document.getElementById('pseudoInput');
  if (pseudoInput) pseudoInput.focus();
}

// SHA-256 via Web Crypto — no library needed

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function logoutPlayer() {
  if (!window.confirm('Se déconnecter de Urban3DQuest.fr · Jadikan ?\nTon score est sauvegardé, tu pourras te reconnecter avec le même pseudo et mot de passe.')) return;
  const pseudo = myPseudo;
  if (pseudo) {
    await db.rpc('clear_player_session', { p_pseudo: pseudo });
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

async function loadGuestLandingUrlConfig() {
  try {
    const { data, error } = await db
      .from('config')
      .select('value')
      .eq('key', 'guestLandingUrl')
      .maybeSingle();
    if (error) return 'https://jadikan.carrd.co/';
    const raw = String(data?.value || '').trim();
    return raw || 'https://jadikan.carrd.co/';
  } catch {
    return 'https://jadikan.carrd.co/';
  }
}

async function loadLandingAccessGateConfig() {
  try {
    const { data, error } = await db
      .from('config')
      .select('key,value')
      .in('key', ['gameCode', 'prelaunchEnabled', 'launchAt', 'prelaunchMessage', 'prelaunchImageUrl']);
    if (error || !data) return;

    const cfg = Object.fromEntries(data.map(r => [r.key, r.value]));
    const rawCode = String(cfg.gameCode || '').trim().toUpperCase();
    gameCode = rawCode.replace(/[^A-Z0-9]/g, '');
    if (gameCode) showAccessGate();

    prelaunchEnabled = String(cfg.prelaunchEnabled || '') === 'true';
    prelaunchMessage = String(cfg.prelaunchMessage || '').trim();
    prelaunchImageUrl = String(cfg.prelaunchImageUrl || '').trim();
    prelaunchLaunchAt = null;
    const rawLaunchAt = String(cfg.launchAt || '').trim();
    if (rawLaunchAt) {
      const parsed = new Date(rawLaunchAt);
      if (!Number.isNaN(parsed.getTime())) prelaunchLaunchAt = parsed;
    }
  } catch {
    // Keep landing usable even if config read fails.
  }
}

function isPrelaunchLocked() {
  return !!(prelaunchEnabled && prelaunchLaunchAt && Date.now() < prelaunchLaunchAt.getTime());
}

function closePrelaunchScreen() {
  const screen = document.getElementById('prelaunchScreen');
  if (screen) screen.classList.remove('open');
  if (prelaunchTimerHandle) {
    clearInterval(prelaunchTimerHandle);
    prelaunchTimerHandle = null;
  }
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${days}j ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function openPrelaunchScreen() {
  const screen = document.getElementById('prelaunchScreen');
  const title = document.getElementById('prelaunchTitle');
  const msg = document.getElementById('prelaunchMessage');
  const timer = document.getElementById('prelaunchTimer');
  const meta = document.getElementById('prelaunchMeta');
  const hero = document.getElementById('prelaunchHero');
  const fallback = document.getElementById('prelaunchFallbackIcon');
  if (!screen || !timer) return;

  if (title) title.textContent = 'Lancement bientôt';
  if (msg) msg.textContent = prelaunchMessage || 'Le jeu n\'est pas encore ouvert. Ton compte est prêt.';
  if (hero && fallback) {
    if (isAllowedPrelaunchImageUrl(prelaunchImageUrl)) {
      hero.src = prelaunchImageUrl;
      hero.style.display = 'block';
      fallback.style.display = 'none';
    } else {
      hero.removeAttribute('src');
      hero.style.display = 'none';
      fallback.style.display = '';
    }
  }

  const tick = () => {
    if (!isPrelaunchLocked()) {
      closePrelaunchScreen();
      const action = prelaunchPendingAction;
      prelaunchPendingAction = null;
      if (typeof action === 'function') action();
      return;
    }
    const remain = prelaunchLaunchAt.getTime() - Date.now();
    timer.textContent = formatCountdown(remain);
    if (meta) {
      const launchText = prelaunchLaunchAt.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
      meta.textContent = 'Ouverture automatique: ' + launchText;
    }
  };

  screen.classList.add('open');
  tick();
  if (prelaunchTimerHandle) clearInterval(prelaunchTimerHandle);
  prelaunchTimerHandle = setInterval(tick, 1000);
}

function proceedAfterLogin(action) {
  if (!isPrelaunchLocked()) {
    closePrelaunchScreen();
    action();
    return;
  }
  prelaunchPendingAction = action;
  openPrelaunchScreen();
}

async function refreshPrelaunchConfigAndResume() {
  await loadLandingAccessGateConfig();
  if (!isPrelaunchLocked()) {
    closePrelaunchScreen();
    const action = prelaunchPendingAction;
    prelaunchPendingAction = null;
    if (typeof action === 'function') action();
  } else {
    openPrelaunchScreen();
  }
}

window.addEventListener('load', async () => {
  const versionReady = await ensureVersionManifestFresh();
  if (!versionReady) return;

  await loadLandingAccessGateConfig();

  const TEASER_ROUTE_ENABLED = false;
  const bootParams = new URLSearchParams(location.search);
  if (TEASER_ROUTE_ENABLED && bootParams.get('teaser') === '1') {
    const teaserUrl = new URL('teaser.html', location.href);
    const env = bootParams.get('env');
    const cachebust = bootParams.get('cachebust');
    if (env) teaserUrl.searchParams.set('env', env);
    if (cachebust) teaserUrl.searchParams.set('cachebust', cachebust);
    location.replace(teaserUrl.toString());
    return;
  }

  // Attach QR file input handler (cloneNode approach requires JS init)
  const qrInput = document.getElementById('qrFileInput');
  if (qrInput) qrInput.addEventListener('change', () => handleQRPhoto(qrInput));

  const params    = new URLSearchParams(location.search);
  const foundId   = params.get('found');
  const checkinId = params.get('checkin') || '';   // ID de la balise fixe (ou '1' legacy)
  const checkin   = !!checkinId;

  // QR balise scanné par un non-joueur → carte de visite
  if (checkin && !myPseudo) {
    const guestLandingUrl = await loadGuestLandingUrlConfig();
    window.location.replace(guestLandingUrl);
    return;
  }

  // Returning user: verify session token then skip landing.
  // If access gate is enabled, keep landing visible until gate is unlocked.
  if (myPseudo && !(gameCode && accessGateRequired && !accessGateUnlocked)) {
    if (SUPABASE_ENV.name === 'stg') {
      // STG : on fait confiance au localStorage, pas de vérification session
      const { data: p } = await db.from('players').select('score,found_count').eq('pseudo', myPseudo).single();
      if (p) { myScore = p.score || 0; myFoundCount = p.found_count || 0; }
      if (checkin) sessionStorage.setItem('pendingCheckin', checkinId);
      proceedAfterLogin(() => {
        document.getElementById('pseudoScreen').style.display = 'none';
        document.getElementById('bgMap').style.display = 'none';
        initGame(foundId);
      });
      return;
    }
    const storedToken = localStorage.getItem('u3dq_token');
    const { data: session } = await db.rpc('validate_player_session', { p_pseudo: myPseudo, p_session_token: storedToken });
    if (!session || !session.valid) {
      // Session expired or taken over by another device
      localStorage.removeItem('u3dq_pseudo');
      localStorage.removeItem('u3dq_token');
      myPseudo = ''; myToken = '';
      const errEl = document.getElementById('pseudoErr');
      if (errEl) { errEl.textContent = 'Ta session a expiré ou un autre appareil t\'a déconnecté. Reconnecte-toi.'; errEl.style.display = 'block'; }
      // Fall through to show landing screen
    } else {
      myScore      = session.score      || 0;
      myFoundCount = session.found_count || 0;
      if (checkin) sessionStorage.setItem('pendingCheckin', checkinId);
      proceedAfterLogin(() => {
        document.getElementById('pseudoScreen').style.display = 'none';
        document.getElementById('bgMap').style.display = 'none';
        initGame(foundId);
      });
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
  const pseudo    = normalizePseudo(input.value);
  const pass      = (passInput && passInput.style.display !== 'none') ? passInput.value : '';
  const isStg      = SUPABASE_ENV.name === 'stg';

  if (gameCode && accessGateRequired && !accessGateUnlocked) {
    const entered = (document.getElementById('gameCodeInput').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (entered !== gameCode) {
      err.textContent = 'Code d\'accès incorrect.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    unlockAccessGate();
    return;
  }

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

  const { data: authResult, error: authError } = await db.rpc('authenticate_player', {
    p_pseudo: pseudo,
    p_password_hash: hash,
    p_session_token: token,
    p_is_stg: isStg
  });
  if (authError) {
    const rawMsg = String(authError.message || '').trim();
    const quota = /quota|egress/i.test(rawMsg);
    if (isStg && quota) {
      err.textContent = 'Connexion refusée en STG (quota). Ouvre le jeu en PROD: ?env=prod';
    } else {
      err.textContent = rawMsg || 'Connexion impossible.';
    }
    err.style.display = 'block';
    document.getElementById('startBtn').disabled = false;
    document.getElementById('startBtn').textContent = '🚀 Rejoindre le jeu';
    return;
  }
  if (!authResult?.ok) {
    err.textContent = authResult?.message || (isStg ? 'Connexion impossible en STG. Ouvre le jeu en PROD avec ?env=prod.' : 'Connexion impossible. Vérifie ton pseudo, ton mot de passe et l\'état du backend.');
    err.style.display = 'block';
    document.getElementById('startBtn').disabled = false;
    document.getElementById('startBtn').textContent = '🚀 Rejoindre le jeu';
    return;
  }

  myScore      = authResult.score      || 0;
  myFoundCount = authResult.found_count || 0;

  myPseudo = pseudo;
  myToken  = token;
  localStorage.setItem('u3dq_pseudo', pseudo);
  localStorage.setItem('u3dq_token', token);
  const pending = sessionStorage.getItem('pendingFound');
  sessionStorage.removeItem('pendingFound');
  proceedAfterLogin(() => {
    hideLanding();
    initGame(pending);
  });
}

async function continueAsGuest() {
  const err = document.getElementById('pseudoErr');
  if (gameCode && accessGateRequired && !accessGateUnlocked) {
    err.textContent = 'Entre d\'abord le code d\'accès.';
    err.style.display = 'block';
    return;
  }
  // Keep access-code protection if configured, even for guest browsing.
  if (gameCode) {
    const entered = (document.getElementById('gameCodeInput').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (entered !== gameCode) { err.textContent = 'Code d\'accès incorrect.'; err.style.display = 'block'; return; }
  }
  err.style.display = 'none';
  hideLanding();
  const pending = sessionStorage.getItem('pendingFound');
  sessionStorage.removeItem('pendingFound');
  sessionStorage.removeItem('pendingCheckin');
  history.replaceState({}, '', location.pathname);
  proceedAfterLogin(() => initGame(pending));
}
