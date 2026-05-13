// ── Device detection + GPS loading UI ──────────────
function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '');
}

function updateGpsSettleHint() {
  const el = document.getElementById('gpsSettleHint');
  if (!el) return;
  const shouldShow = isAndroidDevice() && activeTab === 'explore' && playerLat === null;
  el.classList.toggle('active', shouldShow);
}

function updateGpsLoadingPanel() {
  const panel = document.getElementById('gpsLoadingPanel');
  if (!panel) return;
  const shouldShow = activeTab === 'explore' && playerLat === null;
  const titleEl = panel.querySelector('.gps-loading-title');
  const copyEl = panel.querySelector('.gps-loading-copy');
  const noteEl = panel.querySelector('.gps-loading-note');

  if (titleEl && copyEl && noteEl) {
    if (activeGameMode === 'unique') {
      titleEl.textContent = 'Connexion GPS';
      copyEl.textContent = 'Localisation en cours pour détecter les flashs autour de toi.';
      noteEl.textContent = 'Tu peux changer d\'onglet pendant ce temps.';
    } else {
      titleEl.textContent = 'Connexion GPS';
      copyEl.textContent = 'La carte se calibre avant de démarrer la boussole. Attends la première position GPS.';
      noteEl.textContent = 'Les autres panneaux restent accessibles.';
    }
  }

  panel.classList.toggle('active', shouldShow);
  panel.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  updateGpsSettleHint();
}

// ── Startup ──────────────────────────────────────────

// ── Map, GPS, Markers ───────────────────────────────
function initMap() {
  gameMap = L.map('miniMap', { zoomControl: false, attributionControl: false }).setView(mapCenter, 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd', maxZoom: 19,
    keepBuffer: 6,
    updateWhenIdle: false,
    updateWhenZooming: false
  }).addTo(gameMap);
  // Radar bg + arrow overlay created after Leaflet init so they're above all Leaflet panes
  const mapEl = document.getElementById('miniMap');
  const radarBg = document.createElement('div');
  radarBg.id = 'radarBg';
  for (let deg = 0; deg < 360; deg += 30) {
    const s = document.createElement('div');
    s.className = 'radar-spoke ' + (deg % 90 === 0 ? 'major' : 'minor');
    s.style.transform = `translate(-50%,-100%) rotate(${deg}deg)`;
    radarBg.appendChild(s);
  }
  [1, 2, 3].forEach(() => { const r = document.createElement('div'); r.className = 'radar-ring'; radarBg.appendChild(r); });
  const dot = document.createElement('div'); dot.id = 'radarCenterDot'; radarBg.appendChild(dot);
  const centerLabel = document.createElement('div'); centerLabel.id = 'radarCenterLabel'; centerLabel.textContent = 'VOUS'; radarBg.appendChild(centerLabel);
  ['N', 'E', 'S', 'O'].forEach((dir) => {
    const el = document.createElement('div');
    el.className = 'radar-cardinal';
    el.dataset.dir = dir;
    el.textContent = dir;
    radarBg.appendChild(el);
  });
  mapEl.appendChild(radarBg);
  const ov = document.createElement('div');
  ov.id = 'arrowOverlay';
  mapEl.appendChild(ov);
  const captureBtn = document.getElementById('captureFab');
  if (captureBtn && captureBtn.parentElement !== mapEl) mapEl.appendChild(captureBtn);
  gameMap.on('dragstart', function() {
    if (activeGameMode === 'fixed') {
      mapFollowing = true;
      return;
    }
    mapFollowing = false;
    var btn = document.getElementById('locateMeBtn');
    if (btn) btn.style.display = 'block';
  });
  gameMap.on('zoom move moveend resize', () => scheduleCompassRender(true));
  window.addEventListener('resize', () => scheduleCompassRender(true));
  applyExploreMapLock();
  renderMarkers();
}

function applyExploreMapLock() {
  if (!gameMap) return;
  const lockOnPlayer = activeTab === 'explore' && activeGameMode === 'fixed';
  const locateBtn = document.getElementById('locateMeBtn');
  if (lockOnPlayer) {
    mapFollowing = true;
    if (locateBtn) locateBtn.style.display = 'none';
    if (gameMap.dragging) gameMap.dragging.disable();
    if (gameMap.options) gameMap.options.touchZoom = 'center';
    if (gameMap.touchZoom && !gameMap.touchZoom.enabled()) gameMap.touchZoom.enable();
    if (gameMap.scrollWheelZoom) gameMap.scrollWheelZoom.disable();
    if (gameMap.doubleClickZoom) gameMap.doubleClickZoom.disable();
    if (gameMap.boxZoom) gameMap.boxZoom.disable();
    if (gameMap.keyboard) gameMap.keyboard.disable();
    if (gameMap.tap) gameMap.tap.disable();
    if (playerLat !== null && playerLng !== null) {
      gameMap.setView([playerLat, playerLng], gameMap.getZoom(), { animate: true });
    }
  } else {
    if (gameMap.options) gameMap.options.touchZoom = true;
    if (gameMap.dragging && !gameMap.dragging.enabled()) gameMap.dragging.enable();
    if (gameMap.touchZoom && !gameMap.touchZoom.enabled()) gameMap.touchZoom.enable();
    if (gameMap.scrollWheelZoom && !gameMap.scrollWheelZoom.enabled()) gameMap.scrollWheelZoom.enable();
    if (gameMap.doubleClickZoom && !gameMap.doubleClickZoom.enabled()) gameMap.doubleClickZoom.enable();
    if (gameMap.boxZoom && !gameMap.boxZoom.enabled()) gameMap.boxZoom.enable();
    if (gameMap.keyboard && !gameMap.keyboard.enabled()) gameMap.keyboard.enable();
    if (gameMap.tap && !gameMap.tap.enabled()) gameMap.tap.enable();
  }
}

function getPhotoUrls(raw){if(!raw)return[];if(raw.charAt(0)==='['){try{return JSON.parse(raw).filter(Boolean);}catch{}}return[raw];}

function escHtml(v){
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeImgUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(https?:|data:image\/)/i.test(s)) return s;
  return '';
}

function jsSingleQuoted(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderMarkers() {
  Object.values(mapMarkers).forEach(m => gameMap.removeLayer(m));
  mapMarkers = {};

  treasures.forEach(t => {
    const isMine  = t.found_by && t.found_by.split(',').includes(myPseudo);
    // Only show treasures matching the active mode (or already found by this player)
    if (t.type === 'fixed' && activeGameMode !== 'fixed' && !isMine) return;
    if (t.type === 'unique' && activeGameMode !== 'unique' && !isMine) return;
    // Fixed beacons are hidden on the map unless already found by this player
    if (t.type === 'fixed' && !isMine) return;
    const isTaken = t.type === 'unique' && t.found_by && t.found_by.length > 0;
    const color   = isMine ? '#4ade80' : isTaken ? '#475569' : (t.type === 'unique' ? '#c084fc' : '#60a5fa');
    const opacity = isTaken && !isMine ? 0.4 : 1;

    // Unique treasures not yet found: fuzzy circle — center is randomly OFFSET from
    // the real location (deterministic per treasure ID), so zooming in never reveals
    // the exact spot. The treasure is somewhere inside the circle, not at the center.
    if (t.type === 'unique' && !isMine) {
      // Deterministic pseudo-random offset from treasure ID (same result every render)
      let seed = 0;
      for (let i = 0; i < t.id.length; i++) seed = (seed * 31 + t.id.charCodeAt(i)) & 0xffffffff;
      const angle  = (seed % 628) / 100; // 0 to 2π
      const dist   = 40 + (Math.abs(seed >> 8) % 40); // 40–80m offset
      const mPerLat = 111320;
      const mPerLng = 111320 * Math.cos(t.lat * Math.PI / 180);
      const fuzzLat = t.lat + (dist * Math.sin(angle)) / mPerLat;
      const fuzzLng = t.lng + (dist * Math.cos(angle)) / mPerLng;
      const c = L.circle([fuzzLat, fuzzLng], {
        radius: 90, color, fillColor: color,
        fillOpacity: 0.18 * opacity, weight: 2, opacity: 0.75 * opacity
      }).addTo(gameMap).on('click', () => openTreasureSheet(t));
      mapMarkers[t.id] = c;
      return;
    }

    // Fixed found by this player: keep a very small green dot.
    if (t.type === 'fixed' && isMine) {
      mapMarkers[t.id] = L.circleMarker([t.lat, t.lng], {
        radius: 4,
        color: '#166534',
        weight: 1,
        fillColor: '#22c55e',
        fillOpacity: 0.9
      }).addTo(gameMap).on('click', () => openTreasureSheet(t));
      return;
    }

    // All other cases (found uniques): luminous pin
    const icon = L.divIcon({
      html: `<div class="pin found"><div class="pin-halo"></div><div class="pin-core">✓</div></div>`,
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });
    mapMarkers[t.id] = L.marker([t.lat, t.lng], { icon }).addTo(gameMap).on('click', () => openTreasureSheet(t));
  });
}
