// ── Supabase env + global state ─────────────────────
const SUPABASE_ENVS = {
  prod: {
    label: 'PROD',
    url: 'https://jocfvobqfpygixrawnbq.supabase.co',
    key: 'sb_publishable_M8SxhXrmh17vrOf1WlOM6Q_ZNKNqQhM'
  },
  stg: {
    label: 'STG',
    url: 'https://uuofsgcwznuwcsaqsmzc.supabase.co',
    key: 'sb_publishable_LzvsvuvfbJvIL8eynQIC4A_dbJ9A2CF'
  }
};

function resolveSupabaseEnv() {
  const params = new URLSearchParams(location.search);
  const requestedEnv = (params.get('env') || localStorage.getItem('u3dq_env') || 'prod').toLowerCase();
  const activeEnv = SUPABASE_ENVS[requestedEnv] ? requestedEnv : 'prod';

  if (params.get('env')) localStorage.setItem('u3dq_env', activeEnv);

  const config = SUPABASE_ENVS[activeEnv];
  if (!config.key) {
    throw new Error(`Clé Supabase manquante pour l'environnement ${config.label}. Renseigne SUPABASE_ENVS.${activeEnv}.key.`);
  }
  return { name: activeEnv, ...config };
}

const SUPABASE_ENV = resolveSupabaseEnv();
const SUPABASE_URL = SUPABASE_ENV.url;
const SUPABASE_KEY = SUPABASE_ENV.key;
const GAME_VERSION = 'v3.14.1';
document.getElementById('gameVersion').textContent = 'Urban3DQuest ' + GAME_VERSION + ' · ' + SUPABASE_ENV.label;
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
let playerLat    = null, playerLng = null;
let playerAccuracy = null; // GPS accuracy in meters
let gpsCourseHeading = null;
let gpsCourseSpeed = 0;
let gpsCourseLastAt = 0;
let gpsCourseLastPoint = null;
let gpsHistory   = []; // last N positions for smoothing
let nearestFixed  = null;
let nearestUnique = null;
const FLASH_CAPTURE_M = 20; // metres — seuil d'apparition du FAB Flash
const FLASH_HINT_M   = 50; // metres — seuil de révélation de la photo indice
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


// ── Pure heading math (needed at init time) ─────────
function _normHeading(h) {
  return ((h % 360) + 360) % 360;
}

function _smoothHeading(prev, next, factor) {
  if (prev === null || !Number.isFinite(prev)) return _normHeading(next);
  const delta = ((next - prev + 540) % 360) - 180;
  return _normHeading(prev + delta * factor);
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

