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
// Zoom state
let _qrZoomMin = 1;
let _qrZoomMax = 1;
let _qrZoomStep = 0.5;
let _qrZoomCurrent = 1;
let _qrZoomApply = null; // async fn(zoom) — set when camera is live

function _updateZoomUI() {
  const label = document.getElementById('qrZoomLabel');
  const outBtn = document.getElementById('qrZoomOutBtn');
  const inBtn  = document.getElementById('qrZoomInBtn');
  if (label) label.textContent = 'Zoom ' + _qrZoomCurrent.toFixed(1) + 'x';
  if (outBtn) outBtn.disabled = _qrZoomCurrent <= _qrZoomMin;
  if (inBtn)  inBtn.disabled  = _qrZoomCurrent >= _qrZoomMax;
}

async function adjustQRZoom(delta) {
  if (!_qrZoomApply) return;
  const next = Math.max(_qrZoomMin, Math.min(_qrZoomMax,
    Math.round((_qrZoomCurrent + delta * _qrZoomStep) * 10) / 10));
  if (next === _qrZoomCurrent) return;
  _qrZoomCurrent = next;
  await _qrZoomApply(next);
  _updateZoomUI();
}

function _initZoomControls(min, max, initial, applyFn) {
  _qrZoomMin = min;
  _qrZoomMax = max;
  _qrZoomCurrent = initial;
  _qrZoomApply = applyFn;
  const row = document.getElementById('qrZoomRow');
  if (row) row.style.display = 'flex';
  _updateZoomUI();
}

function _resetZoomControls() {
  _qrZoomApply = null;
  const row = document.getElementById('qrZoomRow');
  if (row) row.style.display = 'none';
}

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
      targetEl.querySelector('.qrt-name').textContent = tLabel(t);
      const questSpan = targetEl.querySelector('.qrt-quest');
      questSpan.textContent = t.quest ? t.quest : '';
      questSpan.style.display = t.quest ? 'block' : 'none';
      targetEl.style.display = 'block';
    } else {
      targetEl.style.display = 'none';
    }
  }
  document.getElementById('qrOverlay').classList.add('open');
  // Photo-first : pas de live scan, le bouton photo est l'action principale
  const status = document.getElementById('qrStatus');
  status.className = '';
  status.textContent = '📸 Prends une photo du QR code pour le révéler';
  document.getElementById('qrTips').style.display = 'none';
  document.getElementById('qrReader').style.display = 'none';
  document.getElementById('qrZoomRow').style.display = 'none';
  // Tente d'ouvrir l'appareil photo directement (même geste utilisateur que le FAB)
  const fileInput = document.getElementById('qrFileInput');
  if (fileInput) fileInput.click();
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
    status.textContent = '📷 Vise le QR · appuie sur l\'image pour la mise au point';

    // Focus + zoom directs sur le track
    setTimeout(async () => {
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const c = {};
        if (caps.focusMode && caps.focusMode.includes('continuous')) c.focusMode = 'continuous';
        // Zoom auto : on part au max (≤ 2.5x) pour les petits QR codes
        // Zoom 1.5x intentionnel : > 1.5x gêne la mise au point macro sur petits QR proches
        if (caps.zoom && caps.zoom.max >= 1.5) {
          const autoZoom = 1.5;
          c.zoom = autoZoom;
          _initZoomControls(
            caps.zoom.min || 1,
            caps.zoom.max,
            autoZoom,
            async (z) => { try { await track.applyConstraints({ zoom: z }); } catch {} }
          );
        }
        if (Object.keys(c).length) await track.applyConstraints(c);
        if (caps.torch) document.getElementById('qrTorchBtn').style.display = 'flex';
        _qrLog('zoom:' + (c.zoom||1) + 'x focus:' + (c.focusMode||'n/a'));
      } catch(e) {
        _qrLog('constraints ERR: ' + (e.message||'').slice(0,50));
      }
    }, 800);

    // Tap-to-focus : single-shot → continuous (aide sur iOS et Android)
    video.addEventListener('click', async () => {
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes('single-shot')) {
          await track.applyConstraints({ focusMode: 'single-shot' });
          await new Promise(r => setTimeout(r, 500));
          if (caps.focusMode.includes('continuous'))
            await track.applyConstraints({ focusMode: 'continuous' });
        }
      } catch {}
    });

    // Refocus forcé toutes les 4s : single-shot → continuous
    _nativeRefocusId = setInterval(async () => {
      if (!_nativeStream) return;
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes('single-shot'))
          await track.applyConstraints({ focusMode: 'single-shot' });
        await new Promise(r => setTimeout(r, 350));
        if (caps.focusMode && caps.focusMode.includes('continuous'))
          await track.applyConstraints({ focusMode: 'continuous' });
      } catch {}
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
        // Zone large = tolère un QR moins parfaitement centré
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
      { fps: 10, qrbox: { width: 180, height: 180 }, aspectRatio: 1.0,
        videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
      async (decodedText) => {
        await stopLiveQRScan();
        await _qrHandleResult(decodedText);
      },
      () => {}
    );
    status.className = ''; status.textContent = '📷 Vise le QR · appuie sur l\'image pour la mise au point';
    _qrLog('ZXing start OK');
    setTimeout(async () => {
      if (!html5QrInst) return;
      try {
        const caps = html5QrInst.getRunningTrackCapabilities();
        const constraints = {};
        if (caps && caps.focusMode && caps.focusMode.includes('continuous')) constraints.focusMode = 'continuous';
        // Zoom auto : on part au max (≤ 2.5x) pour les petits QR codes
        // Zoom 1.5x intentionnel : > 1.5x gêne la mise au point macro sur petits QR proches
        if (caps && caps.zoom && caps.zoom.max >= 1.5) {
          const autoZoom = 1.5;
          constraints.zoom = autoZoom;
          _initZoomControls(
            caps.zoom.min || 1,
            caps.zoom.max,
            autoZoom,
            async (z) => { try { await html5QrInst.applyVideoConstraints({ zoom: z }); } catch {} }
          );
        }
        if (Object.keys(constraints).length) await html5QrInst.applyVideoConstraints(constraints);
        if (caps && caps.torch) document.getElementById('qrTorchBtn').style.display = 'flex';
        _qrLog('zoom:' + (constraints.zoom||1) + 'x focus:' + (constraints.focusMode||'n/a'));
      } catch(e) {
        _qrLog('constraints ERR: ' + (e.message||'').slice(0,50));
      }

      // Tap-to-focus sur l'élément vidéo html5-qrcode
      const qrVideo = document.querySelector('#qrReader video');
      if (qrVideo) {
        qrVideo.addEventListener('click', async () => {
          if (!html5QrInst) return;
          try {
            const caps2 = html5QrInst.getRunningTrackCapabilities();
            if (caps2 && caps2.focusMode && caps2.focusMode.includes('single-shot')) {
              await html5QrInst.applyVideoConstraints({ focusMode: 'single-shot' });
              await new Promise(r => setTimeout(r, 500));
              if (caps2.focusMode.includes('continuous'))
                await html5QrInst.applyVideoConstraints({ focusMode: 'continuous' });
            }
          } catch {}
        });
      }

      // Refocus forcé toutes les 4s
      _nativeRefocusId = setInterval(async () => {
        if (!html5QrInst) return;
        try {
          const caps3 = html5QrInst.getRunningTrackCapabilities();
          if (caps3 && caps3.focusMode && caps3.focusMode.includes('single-shot')) {
            await html5QrInst.applyVideoConstraints({ focusMode: 'single-shot' });
            await new Promise(r => setTimeout(r, 350));
            if (caps3.focusMode.includes('continuous'))
              await html5QrInst.applyVideoConstraints({ focusMode: 'continuous' });
          }
        } catch {};
      }, 4000);
    }, 1000);
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
    try { await html5QrInst.stop(); } catch {}
    try { html5QrInst.clear(); } catch {}
    html5QrInst = null;
  }
  const reader = document.getElementById('qrReader');
  if (reader) reader.style.display = 'none';
  const torchBtn = document.getElementById('qrTorchBtn');
  if (torchBtn) { torchBtn.style.display = 'none'; torchBtn.textContent = '💡 Lampe'; }
  qrTorchOn = false;
  _resetZoomControls();
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
  } catch { qrTorchOn = false; }
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
  } catch {
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


