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

