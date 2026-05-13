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

function getPhotoUrls(raw){if(!raw)return[];if(raw.charAt(0)==='['){try{return JSON.parse(raw).filter(Boolean);}catch(e){}}return[raw];}

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

    const popup = isTaken && !isMine
      ? `<b>${escHtml(tLabel(t))}</b><br>🔒 Flash déjà pris`
      : (() => {
          const urls = getPhotoUrls(t.photo_url);
          const safeUrls = urls.map(safeImgUrl).filter(Boolean);
          const ph = safeUrls.map(u =>
            `<img src="${escHtml(u)}" onclick="openPhotoViewer('${jsSingleQuoted(u)}')" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:6px;display:block;cursor:zoom-in">`
          ).join('');
          return `<div style="min-width:220px">${ph}<b style="font-size:0.95rem">${escHtml(tLabel(t))}</b><br><span style="font-size:0.82em;color:#888">${t.type === 'fixed' ? '📷 Quête' : '⚡ Flash'}</span>${t.hint ? `<br><span style="font-size:0.82em;color:#93c5fd">💡 ${escHtml(t.hint)}</span>` : ''}${safeUrls.length ? `<br><span style="font-size:0.75em;color:#64748b">👆 Tap photo pour agrandir</span>` : ''}</div>`;
        })();

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
function _onGeoSuccess(pos) {
  geoLastFixAt = Date.now();
  geoLastErrorCode = null;
  geoLastErrorAt = 0;
  geoPreferHighAccuracy = true;
  if (geoNoFixHintTimer) { clearTimeout(geoNoFixHintTimer); geoNoFixHintTimer = null; }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn) gpsKickBtn.style.display = 'none';
  // Smooth GPS: keep last 5 positions, weighted average
  gpsHistory.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
  if (gpsHistory.length > 3) gpsHistory.shift();
  const firstFix = gpsHistory.length === 1;
  const weights = [1, 2, 3].slice(3 - gpsHistory.length);
  const totalW = weights.reduce((a,b) => a+b, 0);
  playerLat = gpsHistory.reduce((s, p, i) => s + p.lat * weights[i], 0) / totalW;
  playerLng = gpsHistory.reduce((s, p, i) => s + p.lng * weights[i], 0) / totalW;
  playerAccuracy = pos.coords.accuracy;

  const now = Date.now();
  const rawHeading = pos && pos.coords ? pos.coords.heading : null;
  const rawSpeed = pos && pos.coords ? pos.coords.speed : null;
  let computedCourse = null;
  let computedSpeed = Number.isFinite(rawSpeed) && rawSpeed >= 0 ? rawSpeed : 0;

  if (Number.isFinite(rawHeading) && rawHeading >= 0) {
    computedCourse = _normHeading(rawHeading);
  } else if (gpsCourseLastPoint) {
    const dtSec = Math.max(0.001, (now - gpsCourseLastPoint.at) / 1000);
    const distM = haversine(gpsCourseLastPoint.lat, gpsCourseLastPoint.lng, playerLat, playerLng);
    if (!Number.isFinite(rawSpeed) || rawSpeed < 0) computedSpeed = distM / dtSec;
    if (dtSec >= 0.8 && distM >= 2.0) {
      computedCourse = bearingTo(gpsCourseLastPoint.lat, gpsCourseLastPoint.lng, playerLat, playerLng);
    }
  }

  gpsCourseSpeed = Number.isFinite(computedSpeed) ? computedSpeed : 0;
  if (Number.isFinite(computedCourse)) {
    gpsCourseHeading = computedCourse;
    gpsCourseLastAt = now;
  }
  gpsCourseLastPoint = { lat: playerLat, lng: playerLng, at: now };
  refreshEffectiveHeading();

  // Update GPS chip in header
  const chip = document.getElementById('gpsChip');
  const lbl  = document.getElementById('gpsLabel');
  const acc  = Math.round(playerAccuracy);
  if (chip && lbl) {
    lbl.textContent = `±${acc}m`;
    chip.className = acc <= 15 ? 'gps-ok' : acc <= 40 ? 'gps-mid' : 'gps-bad';
    chip.title = acc <= 15 ? `GPS précis (±${acc}m)` : acc <= 40 ? `GPS moyen (±${acc}m) — reste à l'air libre` : `GPS faible (±${acc}m) — éloigne-toi des bâtiments`;
  }

  if (gameMap) {
    const pos2 = [playerLat, playerLng];
    const circleColor = acc <= 15 ? '#22c55e' : acc <= 40 ? '#f59e0b' : '#ef4444';
    if (!accuracyCircle) {
      accuracyCircle = L.circle(pos2, { radius: playerAccuracy, color: circleColor, fillColor: circleColor, fillOpacity: 0.08, weight: 1.5, opacity: 0.4 }).addTo(gameMap);
    } else {
      accuracyCircle.setLatLng(pos2).setRadius(playerAccuracy).setStyle({ color: circleColor, fillColor: circleColor });
    }
    if (!playerMarker) {
      const icon = L.divIcon({
        html: `<div class="me-dot"></div>`,
        className: '', iconSize: [16, 16], iconAnchor: [8, 8]
      });
      playerMarker = L.marker(pos2, { icon, zIndexOffset: 1000 }).addTo(gameMap);
    } else {
      playerMarker.setLatLng(pos2);
    }
    if (activeTab === 'explore') {
      if (activeGameMode === 'fixed') mapFollowing = true;
      if (mapFollowing) gameMap.setView(pos2, gameMap.getZoom(), { animate: true });
    }
  }

  updateRadar();
  updateNearestCard();
  applyMapHeadingRotation();
  scheduleCompassRender(true);
  updateGpsLoadingPanel();
  // Force immediate arrow draw on first GPS fix (don't wait for compass interval)
  if (firstFix) scheduleCompassRender(true);
}

function _onGeoError(err) {
  geoLastErrorCode = err.code;
  geoLastErrorAt = Date.now();
  const msgs = {
    1: 'Permission GPS refusée — Réglages > Localisation > Autoriser',
    2: 'GPS indisponible — passe en zone dégagée puis relance GPS',
    3: 'GPS trop lent — reste a l\'air libre puis relance GPS'
  };
  const bar = document.getElementById('radarBar');
  bar.textContent = msgs[err.code] || 'Erreur GPS';
  bar.className = '';
  const chip = document.getElementById('gpsChip');
  const lbl  = document.getElementById('gpsLabel');
  if (chip && lbl) { lbl.textContent = 'off'; chip.className = 'gps-bad'; }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn && isIOSDevice() && activeTab === 'explore' && playerLat === null) {
    gpsKickBtn.style.display = 'block';
  }

  // iOS can stall geolocation; retry automatically except when permission is denied.
  if (err.code !== 1) {
    geoPreferHighAccuracy = false;
    if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
    setTimeout(() => startGeoWatch(true, false), 1200);
  }
  updateGpsLoadingPanel();
}

function requestGpsKick() {
  if (!navigator.geolocation) return;
  const bar = document.getElementById('radarBar');
  if (bar) {
    bar.textContent = 'Relance GPS…';
    bar.className = '';
  }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn) gpsKickBtn.style.display = 'none';
  geoPreferHighAccuracy = false;
  updateGpsLoadingPanel();
  startGeoWatch(true, false);
  navigator.geolocation.getCurrentPosition(pos => {
    _onGeoSuccess(pos);
  }, err => {
    _onGeoError(err);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
}

function startGeoWatch(forceRestart, preferredHighAccuracy) {
  if (!navigator.geolocation) {
    document.getElementById('radarBar').textContent = 'GPS non disponible sur cet appareil';
    updateGpsLoadingPanel();
    return;
  }
  if (geoWatch !== null) {
    if (!forceRestart) return; // already watching
    navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
  }

  // Show "searching" state immediately so the chip is never stuck grey
  const chip0 = document.getElementById('gpsChip');
  const lbl0  = document.getElementById('gpsLabel');
  if (chip0 && lbl0) { lbl0.textContent = '…'; chip0.className = 'gps-mid'; }
  updateGpsLoadingPanel();

  const useHighAccuracy = preferredHighAccuracy !== undefined ? preferredHighAccuracy : geoPreferHighAccuracy;
  geoLastStartAt = Date.now();

  // Warmup one-shot often helps iOS Safari deliver the first fix reliably.
  navigator.geolocation.getCurrentPosition(pos => {
    _onGeoSuccess(pos);
  }, () => {}, { enableHighAccuracy: useHighAccuracy, timeout: 9000, maximumAge: 0 });

  geoWatch = navigator.geolocation.watchPosition(pos => {
    _onGeoSuccess(pos);
  }, err => {
    _onGeoError(err);
  }, { enableHighAccuracy: useHighAccuracy, maximumAge: 3000, timeout: 9000 });

  if (geoNoFixHintTimer) clearTimeout(geoNoFixHintTimer);
  geoNoFixHintTimer = setTimeout(() => {
    if (playerLat !== null) return;
    const bar = document.getElementById('radarBar');
    const gpsKickBtn = document.getElementById('gpsKickBtn');
    if (bar && isIOSDevice()) {
      bar.textContent = 'GPS lent sur iOS — touche le badge GPS pour relancer';
      bar.className = '';
      if (gpsKickBtn) gpsKickBtn.style.display = 'block';
    }
  }, 8000);

  if (!geoWatchdog) {
    geoWatchdog = setInterval(() => {
      if (document.hidden || !navigator.geolocation) return;
      const now = Date.now();
      const noFirstFix = playerLat === null && geoLastStartAt > 0 && (now - geoLastStartAt > 10000);
      const staleFix = playerLat !== null && geoLastFixAt > 0 && (now - geoLastFixAt > 22000);
      if (noFirstFix || staleFix) {
        const nextHigh = staleFix ? true : false;
        geoPreferHighAccuracy = nextHigh;
        startGeoWatch(true, nextHigh);
      }
    }, 6000);
  }
}

function recenterMap() {
  if (!gameMap || playerLat === null) return;
  mapFollowing = true;
  gameMap.setView([playerLat, playerLng], gameMap.getZoom(), { animate: true });
  var btn = document.getElementById('locateMeBtn');
  if (btn) btn.style.display = 'none';
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns a point at given distance (meters) and bearing (degrees) from lat/lng
function destinationPoint(lat, lng, bearing, distM) {
  const R = 6371000, d = distM / R, b = bearing * Math.PI / 180;
  const lat1 = lat * Math.PI / 180, lng1 = lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return [lat2 * 180/Math.PI, lng2 * 180/Math.PI];
}

// Human-readable label for a treasure (never shows raw ID or generic "sans nom")
function tLabel(t) {
  if (t.label && t.label.trim()) return t.label.trim();
  return t.type === 'fixed' ? '� Polaroid' : '⚡ Flash';
}

function distLabel(d) {
  if (d < 10)   return 'moins de 10m';
  if (d < 50)   return 'moins de 50m';
  if (d < 100)  return 'moins de 100m';
  if (d < 200)  return 'moins de 200m';
  if (d < 500)  return 'moins de 500m';
  if (d < 1000) return 'moins de 1km';
  return 'environ ' + (d / 1000).toFixed(1) + 'km';
}

function haptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function updateRadar() {
  if (playerLat === null) return;
  const bar = document.getElementById('radarBar');
  if (activeTab !== 'explore') { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  const fab = document.getElementById('captureFab');

  const flashFabEl = document.getElementById('flashFab');
  if (!myPseudo) {
    bar.textContent = '👀 Mode invité — carte visible · pas de score · tape en haut pour jouer';
    bar.className = '';
    fab.style.display = 'none';
    flashFabEl.style.display = 'none';
    hideFlashHint();
    nearestFixed = null;
    nearestUnique = null;
    lastHapticZone = null;
    return;
  }

  // GPS accuracy warning
  const accStr = playerAccuracy ? ` · GPS ±${Math.round(playerAccuracy)}m` : '';
  const gpsWeak = playerAccuracy && playerAccuracy > 40;

  if (activeGameMode === 'unique') {
    const uniqueLeft = treasures
      .filter(t => t.type === 'unique')
      .filter(t => !(t.found_by && t.found_by.length > 0))
      .filter(t => !(t.found_by && t.found_by.split(',').includes(myPseudo)));

    if (!uniqueLeft.length) {
      bar.textContent = '✅ Tous les flashs ont été pris !';
      bar.className = '';
      fab.style.display = 'none';
      nearestFixed = null;
      lastHapticZone = null;
      return;
    }

    const nearestU = uniqueLeft
      .map(t => ({ t, d: haversine(playerLat, playerLng, t.lat, t.lng) }))
      .sort((a, b) => a.d - b.d)[0];

    const available = uniqueLeft.length;
    const cStr = available === 1 ? '⚡ 1 trésor dispo' : `⚡ ${available} trésors dispos`;

    // Update guide bar count
    const guideText = document.getElementById('modeGuideText');
    if (guideText) guideText.textContent = available === 1
      ? '1 trésor disponible · sois le premier !'
      : `${available} trésors disponibles · sois le premier !`;

    const uniqueDist = Math.round(nearestU.d);
    const flashFab = document.getElementById('flashFab');

    if (uniqueDist <= FLASH_CAPTURE_M) {
      // Palier 3 — < 20m : FAB + hint + "scanne maintenant"
      bar.textContent = `${cStr} · 📷 Scanne-le maintenant !${accStr}`;
      bar.className = 'very-near';
      nearestUnique = nearestU.t;
      flashFab.style.display = 'block';
      if (nearestU.t.photo_url) showFlashHint(nearestU.t, 'Tu es dessus — scanne !');
      if (lastHapticZone !== 'unique-capture') { lastHapticZone = 'unique-capture'; haptic([100, 50, 100, 50, 200]); }
    } else if (uniqueDist <= FLASH_HINT_M) {
      // Palier 2 — < 50m : photo indice révélée, pas encore de FAB
      bar.textContent = `${cStr} · Cherche bien, il est là !${accStr}`;
      bar.className = 'very-near';
      nearestUnique = null;
      flashFab.style.display = 'none';
      if (nearestU.t.photo_url) showFlashHint(nearestU.t, `À ~${uniqueDist}m — trouve l'objet`);
      else hideFlashHint();
      if (lastHapticZone !== 'unique-near2') { lastHapticZone = 'unique-near2'; haptic([100, 50, 100, 50, 200]); }
    } else if (uniqueDist <= proximityR * 5) {
      // Palier 1 — < 500m : "tu chauffes", rien de révélé
      bar.textContent = uniqueDist <= proximityR
        ? `${cStr} · Tu chauffes !${accStr}`
        : `${cStr} · Un polaroid se cache dans ce quartier…${accStr}`;
      bar.className = uniqueDist <= proximityR ? 'near' : '';
      nearestUnique = null;
      flashFab.style.display = 'none';
      hideFlashHint();
      if (uniqueDist <= proximityR) {
        if (lastHapticZone !== 'unique-near') { lastHapticZone = 'unique-near'; haptic([80, 60, 80]); }
      } else {
        if (lastHapticZone !== 'unique-far') { lastHapticZone = 'unique-far'; }
      }
    } else {
      bar.textContent = `${cStr} · Un polaroid se cache dans ce quartier…${accStr}`;
      bar.className = '';
      nearestUnique = null;
      flashFab.style.display = 'none';
      hideFlashHint();
      if (lastHapticZone !== 'unique-far') { lastHapticZone = 'unique-far'; }
    }

    fab.style.display = 'none';
    nearestFixed = null;
    return;
  }

  const fixedLeft = treasures
    .filter(t => t.type === 'fixed')
    .filter(t => !(t.found_by && t.found_by.split(',').includes(myPseudo)));

  flashFabEl.style.display = 'none';
  nearestUnique = null;
  hideFlashHint();

  if (!fixedLeft.length) {
    bar.textContent = '✅ Ta quete est complete !';
    bar.className = '';
    fab.style.display = 'none';
    nearestFixed = null;
    lastHapticZone = null;
    return;
  }

  const nearestF = fixedLeft
    .map(t => ({ t, d: haversine(playerLat, playerLng, t.lat, t.lng) }))
    .sort((a, b) => a.d - b.d)[0];

  const dist = Math.round(nearestF.d);
  const label = distLabel(dist);

  if (dist > proximityR * 5) {
    bar.textContent = `Un polaroid se cache dans ce quartier…${accStr}`;
    bar.className = gpsWeak ? 'near' : '';
    fab.style.display = 'none';
    nearestFixed = null;
    if (lastHapticZone !== 'far') { lastHapticZone = 'far'; }
  } else if (dist > proximityR) {
    bar.textContent = `Tu chauffes — il est tout près.${accStr}`;
    bar.className = 'near';
    fab.style.display = 'none';
    nearestFixed = null;
    if (lastHapticZone !== 'near') { lastHapticZone = 'near'; haptic([80, 60, 80]); }
  } else {
    const canCapture = !gpsWeak || playerAccuracy < proximityR * 1.5;
    bar.textContent = `Cherche bien, il est là.${gpsWeak ? ' ⚠️ GPS faible' : ''}${accStr}`;
    bar.className = 'very-near';
    nearestFixed = canCapture ? nearestF.t : null;
    // Révélation photo unique à la première entrée dans la zone
    const t = nearestF.t;
    if (t.photo_url && !revealedFixedClues.has(t.id)) {
      revealedFixedClues.add(t.id);
      if (myPseudo) localStorage.setItem(`u3dq_clues_${myPseudo}`, JSON.stringify([...revealedFixedClues]));
      showFlashHint(t, 'Voilà ce que tu cherches — tu es dans la zone !', 'quest');
    }
    if (activeTab === 'explore' && canCapture && gameMap) {
      const mapEl = document.getElementById('miniMap');
      const p = gameMap.latLngToContainerPoint([playerLat, playerLng]);
      const margin = 44;
      const x = Math.max(margin, Math.min(mapEl.offsetWidth - margin, p.x));
      const y = Math.max(margin, Math.min(mapEl.offsetHeight - margin, p.y));
      fab.style.left = x + 'px';
      fab.style.top = y + 'px';
      fab.style.display = 'block';
    } else {
      fab.style.display = 'none';
    }
    if (lastHapticZone !== 'capture') { lastHapticZone = 'capture'; haptic([100, 50, 100, 50, 200]); }
  }
}

function showFlashHint(t, sub, mode) {
  const hint = document.getElementById('flashHint');
  const photoEl = document.getElementById('flashHintPhoto');
  const subEl = document.getElementById('flashHintSub');
  const url = safeImgUrl(getPhotoUrls(t.photo_url)[0]);
  if (url) {
    photoEl.src = url;
    photoEl.style.display = 'block';
  } else {
    photoEl.style.display = 'none';
  }
  subEl.textContent = sub;
  hint.classList.toggle('quest-mode', mode === 'quest');
  hint.classList.add('active');
  // En mode Quête : révélation unique, on cache après 7s
  clearTimeout(hint._autoHide);
  if (mode === 'quest') {
    hint._autoHide = setTimeout(() => hint.classList.remove('active'), 7000);
  }
}

function hideFlashHint() {
  const hint = document.getElementById('flashHint');
  clearTimeout(hint._autoHide);
  hint.classList.remove('active');
}

async function captureFixed() {
  if (!myPseudo) { _checkinError('Mode invité : connecte-toi pour révéler des polaroids.'); return; }
  if (!nearestFixed) return;
  haptic([50, 30, 50]);
  openQRScanner(nearestFixed.id);
}

async function captureUnique() {
  if (!myPseudo) { _checkinError('Mode invité : connecte-toi pour jouer.'); return; }
  if (!nearestUnique) return;
  if (nearestUnique.found_by && nearestUnique.found_by.length > 0) {
    _checkinError('Ce trésor vient d\'être pris — trop tard ! 😅'); return;
  }
  haptic([50, 30, 50]);
  openQRScanner(nearestUnique.id);
}

// ── Compass orientation ───────────────────────────────
function bearingTo(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1r = lat1 * Math.PI / 180, lat2r = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}


// ── Compass & heading ───────────────────────────────
function _setHeading(nextHeading, source) {
  if (!Number.isFinite(nextHeading)) return;
  const normalized = _normHeading(nextHeading);
  const now = Date.now();

  // Ignore abrupt jumps coming from noisy magnetic readings.
  if (compassRawHeading !== null && compassLastRawAt > 0) {
    const dt = Math.max(1, now - compassLastRawAt);
    const jump = Math.abs((((normalized - compassRawHeading) + 540) % 360) - 180);
    if (dt < 220 && jump > 70) return;
  }

  compassRawHeading = normalized;
  compassLastRawAt = now;
  compassLastEventSource = source || 'unknown';
  compassEventCount += 1;
  if (now - compassLastRateTick >= 1000) {
    compassEventRate = Math.round((compassEventCount * 1000) / (now - compassLastRateTick));
    compassEventCount = 0;
    compassLastRateTick = now;
  }
  sensorHeading = normalized;
  refreshEffectiveHeading();
  applyMapHeadingRotation();
  scheduleCompassRender();
}

function _getScreenOrientationAngle() {
  if (typeof screen !== 'undefined' && screen.orientation && Number.isFinite(screen.orientation.angle)) {
    return _normHeading(screen.orientation.angle);
  }
  if (typeof window.orientation === 'number') {
    return _normHeading(window.orientation);
  }
  return 0;
}

function _headingFromAlpha(alphaDeg) {
  if (!Number.isFinite(alphaDeg)) return null;
  const correctedAlpha = _normHeading(alphaDeg + _getScreenOrientationAngle());
  return _normHeading(360 - correctedAlpha);
}

function refreshEffectiveHeading() {
  const now = Date.now();
  const gpsCourseFresh = Number.isFinite(gpsCourseHeading) && gpsCourseSpeed >= 1.5 && (now - gpsCourseLastAt) <= 4500;
  const correctedSensorHeading = Number.isFinite(sensorHeading)
    ? _normHeading(sensorHeading + headingAutoOffset)
    : null;

  // Auto-calibration: when moving with acceptable GPS accuracy, align compass axis to GPS course.
  if (gpsCourseFresh && Number.isFinite(correctedSensorHeading) && Number.isFinite(playerAccuracy) && playerAccuracy <= 30) {
    const err = ((gpsCourseHeading - correctedSensorHeading + 540) % 360) - 180;
    const gain = Math.abs(err) > 45 ? 0.18 : 0.07;
    headingAutoOffset = _normHeading(headingAutoOffset + err * gain);
    headingOffsetSampleCount += 1;
    if (headingOffsetSampleCount % 6 === 0) {
      localStorage.setItem('u3dq_heading_offset', String(Math.round(headingAutoOffset * 10) / 10));
    }
  }

  const target = gpsCourseFresh ? gpsCourseHeading : correctedSensorHeading;
  if (!Number.isFinite(target)) {
    deviceHeading = null;
    headingSource = 'none';
    return;
  }
  headingSource = gpsCourseFresh ? 'gps-course' : 'compass';
  const factor = headingSource === 'gps-course' ? 0.38 : 0.26;
  deviceHeading = _smoothHeading(deviceHeading, target, factor);
}

function applyMapHeadingRotation() {
  if (!gameMap) return;
  const mapPane = gameMap.getPane('mapPane');
  const radarBg = document.getElementById('radarBg');
  if (!mapPane) return;
  const shouldRotate = activeTab === 'explore' && activeGameMode === 'fixed' && playerLat !== null && deviceHeading !== null;
  if (!shouldRotate) {
    mapVisualAngle = null;
    mapPane.style.rotate = '0deg';
    mapPane.style.scale = '1';
    mapPane.style.transformOrigin = '50% 50%';
    if (radarBg) {
      radarBg.style.rotate = '0deg';
      radarBg.style.scale = '1';
      radarBg.style.transformOrigin = '50% 50%';
    }
    return;
  }
  const p = gameMap.latLngToContainerPoint([playerLat, playerLng]);
  const origin = `${p.x}px ${p.y}px`;
  mapVisualAngle = _nextVisualAngle(mapVisualAngle, -deviceHeading);
  const rot = `${mapVisualAngle}deg`;
  const mapSize = gameMap.getSize ? gameMap.getSize() : null;
  const minSide = mapSize ? Math.max(1, Math.min(mapSize.x, mapSize.y)) : 1;
  const diag = mapSize ? Math.hypot(mapSize.x, mapSize.y) : minSide;
  const radarScale = Math.max(1.45, diag / minSide);
  mapPane.style.transformOrigin = origin;
  mapPane.style.rotate = rot;
  mapPane.style.scale = String(radarScale);
  if (radarBg) {
    radarBg.style.transformOrigin = origin;
    radarBg.style.rotate = rot;
    radarBg.style.scale = String(radarScale);
  }
}

function scheduleCompassRender(force) {
  if (force) {
    lastArrowLat = null; lastArrowLng = null; lastArrowHeading = null;
  }
  if (compassRenderQueued) return;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const minGap = 120;
  const wait = Math.max(0, minGap - (now - compassLastRenderAt));
  compassRenderQueued = true;
  setTimeout(() => {
    requestAnimationFrame(() => {
      compassRenderQueued = false;
      compassLastRenderAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      updateCompass();
    });
  }, wait);
}

function startOrientationWatch() {
  // iOS 13+: needs explicit permission via a user-gesture button tap
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const btn = document.getElementById('compassPermBtn');
    btn.style.display = 'block';
    btn.classList.add('compass-perm-pulse');
    // Show a one-time toast to make the button discoverable
    if (!localStorage.getItem('u3dq_compassAsked')) {
      _showCompassToast();
    }
    return;
  }
  _attachOrientationListeners();
}

function _showCompassToast() {
  if (document.getElementById('compassToast')) return;
  const toast = document.createElement('div');
  toast.id = 'compassToast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:2000;background:#1e293b;color:#f1f5f9;padding:10px 18px;border-radius:14px;font-size:0.82rem;text-align:center;max-width:290px;border:1px solid #334155;box-shadow:0 4px 20px rgba(0,0,0,.5);pointer-events:none';
  toast.innerHTML = '🧭 <strong>Active le compas</strong> — touche le bouton bleu en haut de la carte pour orienter les flèches.';
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

async function requestCompassPermission() {
  if (typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') {
    _attachOrientationListeners();
    scheduleCompassRender(true);
    return;
  }
  try {
    const res = await DeviceOrientationEvent.requestPermission();
    localStorage.setItem('u3dq_compassAsked', '1');
    const btn = document.getElementById('compassPermBtn');
    if (res === 'granted') {
      btn.style.display = 'none';
      _attachOrientationListeners();
      scheduleCompassRender(true);
      if (playerLat === null) requestGpsKick();
    } else {
      btn.textContent = '⚠️ Compas refusé — flèches statiques';
      btn.classList.remove('compass-perm-pulse');
    }
  } catch(e) {
    localStorage.setItem('u3dq_compassAsked', '1');
    document.getElementById('compassPermBtn').textContent = '⚠️ Erreur compas';
  }
}

function _attachOrientationListeners() {
  if (orientationListenersAttached) return;
  orientationListenersAttached = true;
  let hasAbsolute = false;

  // Prefer deviceorientationabsolute (Android Chrome 67+) — true north
  window.addEventListener('deviceorientationabsolute', e => {
    if (e.alpha !== null && e.alpha !== undefined) {
      hasAbsolute = true;
      _setHeading(_headingFromAlpha(e.alpha), 'absolute');
    }
  }, true);

  // Fallback: standard deviceorientation
  window.addEventListener('deviceorientation', e => {
    // iOS: webkitCompassHeading is directly clockwise from north
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      if (typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy > 45) return;
      _setHeading(e.webkitCompassHeading, 'webkit');
      return;
    }
    // Android fallback if absolute didn't fire
    if (!hasAbsolute && e.alpha !== null && e.alpha !== undefined) {
      _setHeading(_headingFromAlpha(e.alpha), 'alpha');
    }
  }, true);

  const onOrientationChanged = () => {
    refreshEffectiveHeading();
    applyMapHeadingRotation();
    scheduleCompassRender(true);
  };
  window.addEventListener('orientationchange', onOrientationChanged, true);
  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
    screen.orientation.addEventListener('change', onOrientationChanged, true);
  }
}


function updateProgressBar() {
  const bar = document.getElementById('progressBar');
  if (!myPseudo) { bar.style.display = 'none'; return; }
  if (activeGameMode === 'unique') {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'block';

  const myFixedFound = treasures.filter(t =>
    t.type === 'fixed' &&
    t.found_by && t.found_by.split(',').includes(myPseudo)
  ).length;
  const pct = fixedTotal > 0 ? Math.min(100, Math.round(myFixedFound / fixedTotal * 100)) : 0;
  document.getElementById('pbCount').textContent = myFixedFound + ' / ' + fixedTotal;
  document.getElementById('pbFill').style.width = pct + '%';
  document.getElementById('pbFill').style.background =
    myFixedFound >= fixedTotal
      ? 'linear-gradient(90deg,#22c55e,#4ade80)'
      : 'linear-gradient(90deg,#3b82f6,#6366f1)';
}

// ── QR Scanner ───────────────────────────────────────
// Scan natif : le joueur utilise la caméra de son téléphone (Android/iOS).
// Les QR codes encodent une URL complète (?found=ID) qui est détectée au chargement.

// ── Compass ───────────────────────────────────────────
function startCompassInterval() {
  if (compassInterval) return;
  scheduleCompassRender(true);
  // Watchdog refresh: real-time updates are now driven by sensor events.
  compassInterval = setInterval(() => scheduleCompassRender(false), 1000);
}
function stopCompassInterval() {
  if (compassInterval) { clearInterval(compassInterval); compassInterval = null; }
}

function toggleBatterySaver() {
  batterySaverMode = !batterySaverMode;
  localStorage.setItem('u3dq_bsaver', batterySaverMode ? '1' : '');
  const overlay = document.getElementById('batterySaverOverlay');
  if (overlay) overlay.classList.toggle('active', batterySaverMode);
  if (batterySaverMode) {
    stopCompassInterval();
  } else {
    startCompassInterval();
  }
  const btn = document.getElementById('bsaverBtn');
  if (btn) {
    btn.textContent = batterySaverMode ? '⚡ Désactiver mode éco' : '🔋 Mode économie batterie';
    btn.classList.toggle('active', batterySaverMode);
  }
}

function _clearArrows() {
  directionLayers.forEach(l => gameMap && gameMap.removeLayer(l));
  directionLayers = [];
  const ov = document.getElementById('arrowOverlay');
  if (ov) ov.innerHTML = '';
}

function _updateRadarBg() {
  const bg = document.getElementById('radarBg');
  if (bg) bg.classList.remove('active');
}

function updateCompassCorner() {
  const el = document.getElementById('compassCorner');
  const rose = document.getElementById('compassRose');
  if (!el || !rose) return;
  const show = activeTab === 'explore' && activeGameMode === 'fixed' && playerLat !== null && deviceHeading !== null;
  el.classList.toggle('active', show);
  if (!show) {
    compassVisualAngle = null;
    rose.style.transform = 'rotate(0deg)';
    return;
  }
  compassVisualAngle = _nextVisualAngle(compassVisualAngle, -deviceHeading);
  rose.style.transform = `rotate(${compassVisualAngle}deg)`;
}

function updateCompass() {
  _updateRadarBg();
  updateCompassCorner();
  if (activeTab !== 'explore') return;
  if (playerLat === null || !treasures.length) return;
  applyMapHeadingRotation();

  if (gameMap) {
    const headingDelta = lastArrowHeading === null ? 999 : Math.abs((((deviceHeading || 0) - lastArrowHeading + 540) % 360) - 180);
    const headingChanged = lastArrowHeading === null || headingDelta > 2;
    const posChanged = lastArrowLat === null || haversine(playerLat, playerLng, lastArrowLat, lastArrowLng) > 0.8;

    if (posChanged || headingChanged) {
      lastArrowLat = playerLat; lastArrowLng = playerLng; lastArrowHeading = deviceHeading || 0;

      _clearArrows();

      const overlay = document.getElementById('arrowOverlay');
      if (!overlay) return;
      const mapElC = document.getElementById('miniMap');
      const pPt    = gameMap.latLngToContainerPoint([playerLat, playerLng]);
      const cx     = pPt && Number.isFinite(pPt.x) ? pPt.x : (mapElC.offsetWidth / 2);
      const cy     = pPt && Number.isFinite(pPt.y) ? pPt.y : (mapElC.offsetHeight / 2);
      const baseR  = Math.min(mapElC.offsetWidth, mapElC.offsetHeight) * 0.34;
      const maxR   = Math.max(60, Math.min(cx - 24, mapElC.offsetWidth - cx - 24, cy - 44, mapElC.offsetHeight - cy - 86));
      const R      = Math.min(baseR, maxR);

      // Size radar rings
      const rings = mapElC.querySelectorAll('.radar-ring');
      [0.33, 0.66, 1.0].forEach((f, i) => {
        if (rings[i]) {
          const d = f * R * 2 + 'px';
          rings[i].style.width = d;
          rings[i].style.height = d;
          rings[i].style.left = cx + 'px';
          rings[i].style.top = cy + 'px';
        }
      });

      const centerDot = document.getElementById('radarCenterDot');
      if (centerDot) {
        centerDot.style.left = cx + 'px';
        centerDot.style.top = cy + 'px';
      }
      const centerLabel = document.getElementById('radarCenterLabel');
      if (centerLabel) {
        centerLabel.style.left = cx + 'px';
        centerLabel.style.top = cy + 'px';
      }
      const spokes = mapElC.querySelectorAll('.radar-spoke');
      spokes.forEach((s) => {
        s.style.left = cx + 'px';
        s.style.top = cy + 'px';
      });
      // Cardinal indicators stay in map/world coordinates.
      // The shared world rotation is applied in applyMapHeadingRotation().
      const cardinals = { N: 0, E: 90, S: 180, O: 270 };
      const cardinalEls = mapElC.querySelectorAll('.radar-cardinal');
      cardinalEls.forEach((el) => {
        const dir = el.dataset.dir;
        const base = cardinals[dir];
        if (base === undefined) return;
        const rad = base * Math.PI / 180;
        el.style.left = (cx + R * 0.87 * Math.sin(rad)) + 'px';
        el.style.top = (cy - R * 0.87 * Math.cos(rad)) + 'px';
      });

      if (compassArrowMode && activeGameMode === 'fixed') {
        const fixedPlaced = treasures
          .filter(t => t.type === 'fixed')
          .filter(t => Number.isFinite(t.lat) && Number.isFinite(t.lng))
          .filter(t => !!t.placed_at)
          .filter(t => !(t.found_by && t.found_by.split(',').includes(myPseudo)))
          .map(t => ({ ...t, dist: haversine(playerLat, playerLng, t.lat, t.lng) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, MAX_FIXED_ARROWS);

        fixedPlaced.forEach((t, idx) => {
          const absBearing = bearingTo(playerLat, playerLng, t.lat, t.lng);
          // Keep arrows in screen coordinates so they always point toward the target
          // even while the map/radar rotate with the device heading.
          const relBearing = (absBearing - (deviceHeading || 0) + 360) % 360;
          const color   = ARROW_PALETTE[idx % ARROW_PALETTE.length];
          const distStr = t.dist < 1000 ? `${Math.round(t.dist)}m` : `${(t.dist/1000).toFixed(1)}km`;
          const inRange = t.dist <= proximityR;
          const rad     = relBearing * Math.PI / 180;
          const x       = cx + R * Math.sin(rad);
          let y         = cy - R * Math.cos(rad);
          y = Math.max(38, Math.min(mapElC.offsetHeight - 82, y));

          const div = document.createElement('div');
          div.className = 'dir-arrow';
          div.style.left = x + 'px';
          div.style.top  = y + 'px';
          div.innerHTML = `
            <svg width="44" height="54" viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg"
                 style="transform:rotate(${relBearing}deg);transform-origin:50% 72%;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7));display:block">
              <polygon points="22,2 38,40 22,28 6,40" fill="${color}" stroke="#0f172a" stroke-width="3"/>
            </svg>
          `;
          div.addEventListener('click', () => openTreasureSheet(t));
          overlay.appendChild(div);
          // Label pushed further along the same axis to avoid overlap
          const labelR = Math.min(R + 70, Math.min(mapElC.offsetWidth, mapElC.offsetHeight) * 0.47);
          const lx = cx + labelR * Math.sin(rad);
          const ly = cy - labelR * Math.cos(rad);
          const lbl = document.createElement('div');
          lbl.className = 'dir-arrow-label';
          lbl.style.left = Math.max(28, Math.min(mapElC.offsetWidth - 28, lx)) + 'px';
          lbl.style.top  = Math.max(16, Math.min(mapElC.offsetHeight - 16, ly)) + 'px';
          lbl.style.color = color;
          lbl.style.borderColor = color;
          lbl.textContent = distStr + (inRange ? ' ✓' : '');
          lbl.addEventListener('click', () => openTreasureSheet(t));
          overlay.appendChild(lbl);
        });
      }
    }
  }
}

// ── QR Scanner (photo native) ─────────────────────────

// ── Compass UI controls ─────────────────────────────
function toggleCompassArrows() {
  compassArrowMode = !compassArrowMode;
  const btn = document.getElementById('arrowToggleBtn');
  if (btn) {
    btn.style.borderColor = compassArrowMode ? '#3b82f6' : '#334155';
    btn.style.color       = compassArrowMode ? '#93c5fd' : '#94a3b8';
    btn.style.background  = compassArrowMode ? 'rgba(30,58,138,.88)' : 'rgba(15,23,42,.88)';
  }
  // Clear and redraw immediately by resetting throttle
  lastArrowLat = null; lastArrowLng = null; lastArrowHeading = null;
  _clearArrows();
  updateCompass();
}

function toggleCompassDebug() {
  const el = document.getElementById('compassDebug');
  const visible = el.style.display !== 'none';
  if (visible) {
    el.style.display = 'none';
    if (compassDebugInterval) {
      clearInterval(compassDebugInterval);
      compassDebugInterval = null;
    }
    return;
  }
  const render = () => {
    const allFixed = treasures.filter(t => t.type === 'fixed');
    const correctedSensorHeading = Number.isFinite(sensorHeading)
      ? _normHeading(sensorHeading + headingAutoOffset)
      : null;
    const gpsFresh = Number.isFinite(gpsCourseHeading) && (Date.now() - gpsCourseLastAt) <= 4500;
    const headingDrift = (Number.isFinite(correctedSensorHeading) && Number.isFinite(gpsCourseHeading))
      ? Math.round((((gpsCourseHeading - correctedSensorHeading + 540) % 360) - 180))
      : null;
    el.innerHTML = [
      `GPS: ${playerLat !== null ? playerLat.toFixed(5)+', '+playerLng.toFixed(5) : '❌ null'}`,
      `Heading lissé: ${deviceHeading !== null ? Math.round(deviceHeading)+'°' : '❌ null'}`,
      `Heading brut: ${compassRawHeading !== null ? Math.round(compassRawHeading)+'°' : '❌ null'}`,
      `Heading capteur: ${sensorHeading !== null ? Math.round(sensorHeading)+'°' : '❌ null'}`,
      `Heading capteur corrigé: ${correctedSensorHeading !== null ? Math.round(correctedSensorHeading)+'°' : '❌ null'}`,
      `Source cap effective: ${headingSource}`,
      `Source capteur: ${compassLastEventSource}`,
      `Offset auto: ${Math.round(headingAutoOffset)}° (${headingOffsetSampleCount} échantillons)`,
      `Cap GPS: ${Number.isFinite(gpsCourseHeading) ? Math.round(gpsCourseHeading)+'°' : '❌ null'} (${gpsFresh ? 'frais' : 'stale'})`,
      `Vitesse GPS: ${Number.isFinite(gpsCourseSpeed) ? gpsCourseSpeed.toFixed(2)+' m/s' : '—'}`,
      `Drift compas↔GPS: ${headingDrift !== null ? headingDrift+'°' : '—'}`,
      `Events/sec: ${compassEventRate}`,
      `Dernière erreur GPS: ${geoLastErrorCode !== null ? 'code '+geoLastErrorCode : 'aucune'}`,
      `Âge dernier fix: ${geoLastFixAt ? Math.round((Date.now()-geoLastFixAt)/1000)+'s' : '—'}`,
      `Âge dernière erreur: ${geoLastErrorAt ? Math.round((Date.now()-geoLastErrorAt)/1000)+'s' : '—'}`,
      `Trésors total: ${treasures.length}`,
      `Balises fixes: ${allFixed.length}`,
      `activeTab: ${activeTab}`,
      `compassInterval: ${compassInterval !== null ? '✅ actif' : '❌ null'}`,
      `modeMap: ${modeMap} / modeCompass: ${modeCompass}`,
      `myPseudo: ${myPseudo||'—'}`,
    ].join('<br>');
  };
  render();
  el.style.display = 'block';
  if (compassDebugInterval) clearInterval(compassDebugInterval);
  compassDebugInterval = setInterval(render, 500);
}




// ── Compass calibration ─────────────────────────────
function resetCompassCalibration() {
  headingAutoOffset = 0;
  headingOffsetSampleCount = 0;
  deviceHeading = null;
  localStorage.removeItem('u3dq_heading_offset');
  const btn = document.getElementById('calibBtn');
  if (btn) {
    btn.textContent = '✓ Compas réinitialisé';
    setTimeout(() => { btn.textContent = '🧭 Recalibrer le compas'; }, 2500);
  }
  refreshEffectiveHeading();
  applyMapHeadingRotation();
  scheduleCompassRender(true);
}
