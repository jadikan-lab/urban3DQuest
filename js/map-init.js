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
  const shouldShow = isAndroidDevice() && activeTab === 'explore' && activeGameMode === 'fixed' && playerLat === null;
  el.classList.toggle('active', shouldShow);
}

function updateGpsLoadingPanel() {
  const panel = document.getElementById('gpsLoadingPanel');
  if (!panel) return;
  const shouldShow = activeTab === 'explore' && activeGameMode === 'fixed' && playerLat === null;
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
    const fixedFoundByAnyone = t.type === 'fixed' && !!(t.found_by && t.found_by.trim().length > 0);
    // Only show treasures matching the active mode (or already found by this player)
    if (t.type === 'fixed' && activeGameMode !== 'fixed' && !fixedFoundByAnyone) return;
    if (t.type === 'unique' && activeGameMode !== 'unique' && !isMine) return;
    // Fixed beacons stay hidden until captured at least once; then keep a tiny archive dot.
    if (t.type === 'fixed' && !fixedFoundByAnyone) return;
    const isTaken = t.type === 'unique' && t.found_by && t.found_by.length > 0;
    const color   = isMine ? '#4ade80' : isTaken ? '#475569' : (t.type === 'unique' ? '#c084fc' : '#60a5fa');
    const opacity = isTaken && !isMine ? 0.4 : 1;

    // Unique treasures still available: fuzzy search circle.
    // The center is deterministically offset from the true location so map zooming never
    // reveals the exact spot while keeping a stable search zone players can learn.
    if (t.type === 'unique' && !isMine && !isTaken) {
      const zone = getFlashSearchZone(t);
      const c = L.circle([zone.centerLat, zone.centerLng], {
        radius: zone.radiusM, color, fillColor: color,
        fillOpacity: 0.18 * opacity, weight: 2, opacity: 0.75 * opacity
      }).addTo(gameMap).on('click', () => openTreasureSheet(t));
      mapMarkers[t.id] = c;
      return;
    }

    // Unique treasures already taken: keep only tiny archive points to avoid map clutter.
    if (t.type === 'unique' && isTaken) {
      mapMarkers[t.id] = L.circleMarker([t.lat, t.lng], {
        radius: isMine ? 2.6 : 2.2,
        color: isMine ? '#166534' : '#334155',
        weight: 1,
        fillColor: isMine ? '#22c55e' : '#94a3b8',
        fillOpacity: 0.9,
        opacity: 0.95
      }).addTo(gameMap).on('click', () => openTreasureSheet(t));
      return;
    }

    // Fixed found by any player: keep a very small green dot (slightly highlighted if mine).
    if (t.type === 'fixed' && fixedFoundByAnyone) {
      mapMarkers[t.id] = L.circleMarker([t.lat, t.lng], {
        radius: isMine ? 4 : 3.2,
        color: isMine ? '#166534' : '#14532d',
        weight: 1,
        fillColor: '#22c55e',
        fillOpacity: isMine ? 0.95 : 0.8,
        opacity: 0.95
      }).addTo(gameMap).on('click', () => openTreasureSheet(t));
      return;
    }

    // All other cases: luminous pin
    const icon = L.divIcon({
      html: `<div class="pin found"><div class="pin-halo"></div><div class="pin-core">✓</div></div>`,
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });
    mapMarkers[t.id] = L.marker([t.lat, t.lng], { icon }).addTo(gameMap).on('click', () => openTreasureSheet(t));
  });
}
