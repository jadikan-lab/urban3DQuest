// ── Supabase env + global state ─────────────────────
// SUPABASE_ENVS est défini dans js/supabase-env.js (source de vérité).
// Ce fichier suppose que supabase-env.js est chargé en premier.

function resolveSupabaseEnv() {
  const params = new URLSearchParams(location.search);
  const requestedEnv = (params.get('env') || 'prod').toLowerCase();
  const activeEnv = SUPABASE_ENVS[requestedEnv] ? requestedEnv : 'prod';

  const config = SUPABASE_ENVS[activeEnv];
  if (!config.key) {
    throw new Error(`Clé Supabase manquante pour l'environnement ${config.label}. Renseigne SUPABASE_ENVS.${activeEnv}.key.`);
  }
  return { name: activeEnv, ...config };
}

const SUPABASE_ENV = resolveSupabaseEnv();
const SUPABASE_URL = SUPABASE_ENV.url;
const SUPABASE_KEY = SUPABASE_ENV.key;
const GAME_VERSION = 'v3.14.28';
const ASSET_VERSION = '20260531-v31428';
const GAME_EDITION = 'arles-fixes-2026';
const FIXED_ONLY_EDITION = true;
const loginVersion = document.getElementById('loginVersion');
if (loginVersion) loginVersion.textContent = (FIXED_ONLY_EDITION ? 'ARLES FIXES 2026 · ' : 'JOUEUR · ') + GAME_VERSION + ' · ' + SUPABASE_ENV.label;
document.getElementById('gameVersion').textContent = 'Urban3DQuest.fr · Jadikan ' + (FIXED_ONLY_EDITION ? 'ARLES FIXES 2026 · ' : '') + GAME_VERSION + ' · JOUEUR · ' + SUPABASE_ENV.label;
const gameEnvChip = document.getElementById('gameEnvChip');
if (gameEnvChip) gameEnvChip.textContent = SUPABASE_ENV.label;
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let minSupportedVersion = null;
let appVersionBlocked = false;

function _parseSemver(v) {
  const m = String(v || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  const pa = _parseSemver(a);
  const pb = _parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function _openVersionLock(requiredVersion) {
  const lock = document.getElementById('versionLockScreen');
  if (!lock) return;
  const req = document.getElementById('versionLockRequired');
  const cur = document.getElementById('versionLockCurrent');
  if (req) req.textContent = requiredVersion || 'inconnue';
  if (cur) cur.textContent = GAME_VERSION;
  lock.classList.add('open');
}

function _closeVersionLock() {
  const lock = document.getElementById('versionLockScreen');
  if (!lock) return;
  lock.classList.remove('open');
}

function enforceMinSupportedVersion(requiredVersion) {
  const required = String(requiredVersion || '').trim();
  if (!required) {
    minSupportedVersion = null;
    appVersionBlocked = false;
    _closeVersionLock();
    return true;
  }
  minSupportedVersion = required;
  const isBelow = compareSemver(GAME_VERSION, minSupportedVersion) < 0;
  appVersionBlocked = isBelow;
  if (isBelow) {
    _openVersionLock(minSupportedVersion);
    return false;
  }
  _closeVersionLock();
  return true;
}

async function ensureVersionManifestFresh() {
  const params = new URLSearchParams(location.search);
  let changedUrl = false;

  try {
    const res = await fetch(`version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return true;
    const manifest = await res.json();
    const remoteVersion = String(manifest?.gameVersion || '').trim();
    const remoteAsset = String(manifest?.assetVersion || '').trim();
    const remoteMin = String(manifest?.minSupportedVersion || '').trim();

    if (remoteMin) {
      enforceMinSupportedVersion(remoteMin);
    }

    const targetCb = remoteAsset || remoteVersion || ASSET_VERSION;
    const currentCb = params.get('cachebust') || '';
    if (targetCb && currentCb !== targetCb) {
      params.set('cachebust', targetCb);
      changedUrl = true;
    }

    const normalizedEnv = SUPABASE_ENV.name === 'stg' ? 'stg' : 'prod';
    if ((params.get('env') || 'prod').toLowerCase() !== normalizedEnv) {
      params.set('env', normalizedEnv);
      changedUrl = true;
    }

    if (remoteVersion && compareSemver(GAME_VERSION, remoteVersion) < 0) {
      changedUrl = true;
      if (!params.get('cachebust')) params.set('cachebust', targetCb || ASSET_VERSION);
    }
  } catch {
    return true;
  }

  if (changedUrl) {
    const nextUrl = `${location.pathname}?${params.toString()}${location.hash || ''}`;
    location.replace(nextUrl);
    return false;
  }
  return true;
}

function retryVersionRefresh() {
  const params = new URLSearchParams(location.search);
  params.set('cachebust', ASSET_VERSION);
  const nextUrl = `${location.pathname}?${params.toString()}${location.hash || ''}`;
  location.replace(nextUrl);
}

let myPseudo     = localStorage.getItem('u3dq_pseudo') || '';
let myScore      = 0;
let myFoundCount = 0;
let gameMap      = null;
let treasures    = [];
let mapMarkers   = {};
let proximityR   = 100;
let fixedTotal   = 5;   // total fixed beacons, overridden by config key 'fixedTotal'
let modeMap      = true;  // show map tab
let modeCompass  = true;  // show compass tab
let activeTab    = 'explore';
let deviceHeading = null; // effective heading used by UI (degrees clockwise from north)
let sensorHeading = null; // heading from device orientation events
let headingSource = 'none'; // compass | gps-course | none
let headingAutoOffset = 0; // degrees applied to sensorHeading to align with true travel course
let headingOffsetSampleCount = 0;
let compassInterval = null;
let batterySaverMode = false;
let compassRenderQueued = false;
let compassLastRenderAt = 0;
let compassRawHeading = null;
let compassLastEventSource = 'none';
let compassEventCount = 0;
let compassEventRate = 0;
let compassLastRateTick = Date.now();
let compassDebugInterval = null;
let compassLastRawAt = 0;
let orientationListenersAttached = false;
let compassVisualAngle = null;
let mapVisualAngle = null;
let mapCenter    = [45.1885, 5.7245]; // default Grenoble, overridden by config
let activeQuests = [];  // empty = all quests visible
let gameStart    = null;  // Date or null — reference timestamp for score calc
let gameCode     = '';    // empty = open access
let egressEmergencyMode = false; // true = reduce heavy public reads during incidents
let questScanMaxGpsAccuracy = 35; // max GPS accuracy (meters) allowed to enable Quest scan
let playerLat    = null, playerLng = null;
let playerAccuracy = null; // GPS accuracy in meters
let gpsCourseHeading = null;
let gpsCourseSpeed = 0;
let gpsCourseLastAt = 0;
let gpsCourseLastPoint = null;
let gpsHistory   = []; // last N positions for smoothing
let nearestFixed  = null;
let nearestUnique = null;
let flashCaptureStickyId = null; // keep flash scanner visible briefly to avoid GPS flicker near threshold
const FLASH_CAPTURE_M = 20; // metres — seuil d'apparition du FAB Flash
const FLASH_HINT_M   = 50; // metres — seuil de révélation de la photo indice
const FLASH_ZONE_RADIUS_M = 90; // metres — visual search circle radius shown on the map
const FLASH_ZONE_OFFSET_MIN_M = 40; // metres — minimum offset between true point and circle center
const FLASH_ZONE_OFFSET_MAX_M = 80; // metres — maximum offset between true point and circle center
let lbInterval   = null;
let geoWatch        = null;
let geoWatchdog     = null;
let geoLastFixAt    = 0;
let geoLastStartAt  = 0;
let geoLastErrorCode = null;
let geoLastErrorAt   = 0;
let geoPreferHighAccuracy = true;
let geoNoFixHintTimer = null;
let geoGestureKickBound = false;
let playerMarker    = null; // GPS position marker on miniMap
let accuracyCircle  = null; // GPS accuracy circle on miniMap
let lastHapticZone  = null;
let hapticEnabled = localStorage.getItem('u3dq_haptic_enabled') === '1';
let directionLayers = []; // arrow markers on minimap
let compassArrowMode = true; // toggle: show direction arrows on minimap
let mapFollowing = true; // true = map follows GPS, false = user is panning freely
let lastArrowLat = null, lastArrowLng = null, lastArrowHeading = null; // throttle
const ARROW_PALETTE = ['#f472b6', '#fb923c', '#22d3ee', '#a78bfa', '#4ade80'];
const MAX_FIXED_ARROWS = 3;
let myToken = localStorage.getItem('u3dq_token') || ''; // session token for single-session enforcement
let activeGameMode = (localStorage.getItem('u3dq_game_mode') || 'fixed') === 'unique' ? 'unique' : 'fixed';
const revealedFixedClues = new Set(myPseudo ? JSON.parse(localStorage.getItem(`u3dq_clues_${myPseudo}`) || '[]') : []); // fixed clues unlocked by proximity, persisted per player
let tutorialSeen = localStorage.getItem('u3dq_tuto_seen') === '1';
let qrGuideFlashUrl = '';
let qrGuideFixedUrl = '';
let qrGuideGenericUrl = '';


// ── Pure heading math (needed at init time) ─────────
function _normHeading(h) {
  return ((h % 360) + 360) % 360;
}

function _smoothHeading(prev, next, factor) {
  if (prev === null || !Number.isFinite(prev)) return _normHeading(next);
  const delta = ((next - prev + 540) % 360) - 180;
  return _normHeading(prev + delta * factor);
}

// Flash map circle helper: deterministic pseudo-random center offset from treasure id.
function getFlashSearchZone(t) {
  if (!t || !t.id) return null;
  let seed = 0;
  const tid = String(t.id);
  for (let i = 0; i < tid.length; i++) seed = (seed * 31 + tid.charCodeAt(i)) & 0xffffffff;
  const angle = (seed % 628) / 100; // 0..2pi
  const offsetM = FLASH_ZONE_OFFSET_MIN_M
    + (Math.abs(seed >> 8) % (FLASH_ZONE_OFFSET_MAX_M - FLASH_ZONE_OFFSET_MIN_M + 1));
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(t.lat * Math.PI / 180);
  const centerLat = t.lat + (offsetM * Math.sin(angle)) / mPerLat;
  const centerLng = t.lng + (offsetM * Math.cos(angle)) / mPerLng;
  return { centerLat, centerLng, radiusM: FLASH_ZONE_RADIUS_M, offsetM };
}

function _nextVisualAngle(previous, target) {
  if (!Number.isFinite(target)) return previous;
  if (!Number.isFinite(previous)) return target;
  const delta = ((target - previous + 540) % 360) - 180;
  return previous + delta;
}

const savedHeadingOffset = parseFloat(localStorage.getItem('u3dq_heading_offset') || '0');
if (Number.isFinite(savedHeadingOffset)) {
  headingAutoOffset = _normHeading(savedHeadingOffset);
}

