
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
