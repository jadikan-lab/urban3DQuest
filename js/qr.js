// ── QR Scanner ─────────────────────────────────────────────────────────────
// Moteur : Nimiq qr-scanner (BarcodeDetector natif si dispo, sinon WebWorker
// WASM ZXing). Fonctionne sur Android ET iOS. 2-3× meilleur taux que ZXing JS.
// ────────────────────────────────────────────────────────────────────────────
let qrExpectedId = null;
let qrDecodeLocked = false;
let qrTorchOn = false;
let _qrScannerInst = null; // instance QrScanner (Nimiq)
let _qrVideoElem   = null; // élément <video> courant
// Zoom state
let _qrZoomMin = 1;
let _qrZoomMax = 1;
let _qrZoomStep = 0.5;
let _qrZoomCurrent = 1;
let _qrZoomApply = null; // async fn(zoom) — set when camera is live
const _copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

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

function _extractLastNumber(str) {
  const m = String(str || '').match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

function _fixedBeaconIndexInQuest(t) {
  const sameQuest = treasures
    .filter(x => x.type === 'fixed' && (x.quest || '') === (t.quest || ''))
    .slice()
    .sort((a, b) => {
      const an = _extractLastNumber(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bn = _extractLastNumber(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (an !== bn) return an - bn;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  const idx = sameQuest.findIndex(x => x.id === t.id);
  return idx >= 0 ? idx + 1 : null;
}

function _formatUniqueTreasureRef(t) {
  const idStr = String(t && t.id ? t.id : '');
  const qrMatch = idStr.match(/qr[-_ ]?(\d{1,4})/i);
  if (qrMatch) return 'QR-' + qrMatch[1].padStart(3, '0');
  const n = _extractLastNumber(idStr) ?? _extractLastNumber(t && t.label ? t.label : '');
  if (n !== null) return 'QR-' + String(n).padStart(3, '0');
  return 'QR-000';
}

function _formatTreasureForScanFeedback(id) {
  const t = treasures.find(x => x.id === id);
  if (!t) return `ID ${id}`;
  if (t.type === 'fixed') {
    const beaconIndex = _fixedBeaconIndexInQuest(t);
    return beaconIndex ? `Balise ${beaconIndex}` : 'Balise de quête';
  }
  return _formatUniqueTreasureRef(t);
}

function _extractScannedTreasureId(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;

  // 1) Full URL payload (most common) — prefer found over checkin.
  try {
    const u = new URL(txt);
    const found = u.searchParams.get('found');
    const checkin = u.searchParams.get('checkin');
    const v = found || checkin;
    if (v) return decodeURIComponent(v);
  } catch {}

  // 2) Raw query-like text — again prefer found over checkin.
  const foundMatch = txt.match(/(?:^|[?&#\s])found=([^&\s#]+)/i);
  if (foundMatch) return decodeURIComponent(foundMatch[1]);
  const checkinMatch = txt.match(/(?:^|[?&#\s])checkin=([^&\s#]+)/i);
  if (checkinMatch) return decodeURIComponent(checkinMatch[1]);

  // 3) Some generators nest a URL string in a decoded value; unwrap once.
  try {
    const decoded = decodeURIComponent(txt);
    if (decoded !== txt) {
      const nested = decoded.match(/(?:^|[?&#\s])found=([^&\s#]+)/i)
        || decoded.match(/(?:^|[?&#\s])checkin=([^&\s#]+)/i);
      if (nested) return decodeURIComponent(nested[1]);
    }
  } catch {}

  return null;
}

function _resolveExpectedUniqueAlias(scannedId, expectedId) {
  if (!scannedId || !expectedId || scannedId === expectedId) return scannedId;
  const expected = treasures.find(x => x.id === expectedId);
  if (!expected || expected.type !== 'unique') return scannedId;
  if (treasures.some(x => x.id === scannedId)) return scannedId;

  const scannedNorm = String(scannedId).trim().toLowerCase();
  const expectedRef = _formatUniqueTreasureRef(expected).toLowerCase();
  if (scannedNorm === expectedRef) return expectedId;

  const scannedNum = _extractLastNumber(scannedNorm);
  const expectedNum = _extractLastNumber(expected.id)
    ?? _extractLastNumber(expected.label)
    ?? _extractLastNumber(expectedRef);
  if (scannedNum !== null && expectedNum !== null && scannedNum === expectedNum) return expectedId;

  return scannedId;
}

function _setRetryPhotoVisible(show) {
  const btn = document.getElementById('qrRetryPhotoBtn');
  if (!btn) return;
  btn.style.display = show ? 'flex' : 'none';
}

function retryQRPhoto() {
  const input = document.getElementById('qrFileInput');
  if (!input) return;
  input.click();
}

function openQRScanner(beaconId) {
  qrExpectedId = beaconId || null;
  const status = document.getElementById('qrStatus');
  const photoBtnText = document.getElementById('qrPhotoBtnText');
  const retryBtnText = document.getElementById('qrRetryPhotoBtn');
  status.className = '';
  status.textContent = _copy('QR_STATUS_SCAN', 'Vise le QR pour le révéler.');
  if (photoBtnText) photoBtnText.textContent = _copy('QR_PHOTO_CTA', '📷 Prendre la photo');
  if (retryBtnText) retryBtnText.textContent = _copy('QR_RETRY_PHOTO_CTA', '↻ Reprendre la photo');
  _setRetryPhotoVisible(false);
  document.getElementById('qrPreviewWrap').style.display = 'none';
  document.getElementById('qrReader').style.display = 'none';
  document.getElementById('qrTips').style.display = 'none';
  document.getElementById('qrTorchBtn').style.display = 'none';
  document.getElementById('qrDebugLog').style.display = 'none';
  _resetZoomControls();
  qrDecodeLocked = false;
  _resetQRInput();
  // Show target beacon name so player confirms they're scanning the right object
  const targetEl = document.getElementById('qrTarget');
  if (targetEl) {
    const t = beaconId ? treasures.find(x => x.id === beaconId) : null;
    const lblSpan = targetEl.querySelector('.qrt-lbl');
    const nameSpan = targetEl.querySelector('.qrt-name');
    const questSpan = targetEl.querySelector('.qrt-quest');
    const photoEl = document.getElementById('qrTargetPhoto');
    if (t) {
      if (t.type === 'fixed') {
        const beaconIndex = _fixedBeaconIndexInQuest(t);
        lblSpan.textContent = 'Tu as trouvé la balise';
        nameSpan.textContent = beaconIndex ? `Balise ${beaconIndex} de la quête` : 'Balise de la quête';
        questSpan.textContent = '';
        questSpan.style.display = 'none';
        status.textContent = _copy('QR_STATUS_FIXED', 'Tu as trouvé la balise, prends une photo du QR code pour continuer le jeu.');
        if (photoEl) {
          photoEl.src = '';
          photoEl.style.display = 'none';
        }
      } else {
        lblSpan.textContent = 'Tu cherches';
        nameSpan.textContent = 'Trésor unique';
        questSpan.textContent = _formatUniqueTreasureRef(t);
        questSpan.style.display = 'block';
        status.textContent = _copy('QR_STATUS_FLASH', 'Tu as trouvé la miniature, prends une photo du QR code pour valider ta cueillette.');
        if (photoEl) {
          const photoUrl = safeImgUrl(getPhotoUrls(t.photo_url)[0]);
          if (photoUrl) {
            photoEl.src = photoUrl;
            photoEl.style.display = 'block';
          } else {
            photoEl.src = '';
            photoEl.style.display = 'none';
          }
        }
      }
      targetEl.style.display = 'block';
    } else {
      if (photoEl) {
        photoEl.src = '';
        photoEl.style.display = 'none';
      }
      targetEl.style.display = 'none';
    }
  }
  document.getElementById('qrOverlay').classList.add('open');
}

async function startLiveQRScan() {
  const status = document.getElementById('qrStatus');
  document.getElementById('qrTips').style.display = 'none';
  await stopLiveQRScan();

  const isStg = SUPABASE_ENV.name === 'stg';
  const dbg = document.getElementById('qrDebugLog');
  if (isStg && dbg) { dbg.textContent = ''; dbg.style.display = 'block'; }
  function _qrLog(msg) {
    if (!isStg || !dbg) return;
    dbg.textContent += msg + '\n';
    dbg.scrollTop = dbg.scrollHeight;
  }

  const readerDiv = document.getElementById('qrReader');
  readerDiv.innerHTML = '';
  readerDiv.style.display = 'block';
  _qrVideoElem = document.createElement('video');
  _qrVideoElem.style.cssText = 'width:100%;display:block;max-height:50vh;object-fit:cover;border-radius:14px';
  readerDiv.appendChild(_qrVideoElem);

  try {
    _qrScannerInst = new QrScanner(
      _qrVideoElem,
      async (result) => {
        _qrLog('SCAN OK: ' + result.data.slice(0, 40));
        await _qrHandleResult(result.data);
      },
      {
        returnDetailedScanResult: true,
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 10,
        // Crop carré central 70% → canvas 640×640 (paramètres issus des tests terrain)
        calculateScanRegion: (v) => {
          const dim = Math.min(v.videoWidth || 1280, v.videoHeight || 720);
          const size = Math.round(dim * 0.7);
          return {
            x: Math.round(((v.videoWidth || 1280) - size) / 2),
            y: Math.round(((v.videoHeight || 720) - size) / 2),
            width: size, height: size,
            downScaledWidth: 640, downScaledHeight: 640
          };
        }
      }
    );

    await _qrScannerInst.start();
    status.className = '';
    status.textContent = _copy('QR_STATUS_LIVE', '📷 Vise le QR · appuie sur l\'image pour la mise au point');
    _qrLog('Nimiq QrScanner démarré');

    // Zoom 1.5x + focus continu après démarrage caméra
    setTimeout(async () => {
      try {
        const track = _qrVideoElem.srcObject?.getVideoTracks()[0];
        if (!track) return;
        const caps = track.getCapabilities?.() || {};
        const c = {};
        if (caps.focusMode?.includes('continuous')) c.focusMode = 'continuous';
        if (caps.zoom?.max >= 1.5) {
          c.zoom = 1.5; // 1.5x : plus haut gêne la mise au point macro
          _initZoomControls(caps.zoom.min || 1, caps.zoom.max, 1.5,
            async (z) => { try { await track.applyConstraints({ zoom: z }); } catch {} }
          );
        }
        if (Object.keys(c).length) await track.applyConstraints(c);
        const hasFlash = await _qrScannerInst.hasFlash();
        if (hasFlash) document.getElementById('qrTorchBtn').style.display = 'flex';
        _qrLog('zoom:' + (c.zoom || 1) + 'x focus:' + (c.focusMode || 'n/a'));
      } catch(e) { _qrLog('constraints ERR: ' + (e.message || '').slice(0, 50)); }
    }, 800);

    // Tap-to-focus
    _qrVideoElem.addEventListener('click', async () => {
      try {
        const track = _qrVideoElem.srcObject?.getVideoTracks()[0];
        if (!track) return;
        const caps = track.getCapabilities?.() || {};
        if (caps.focusMode?.includes('single-shot')) {
          await track.applyConstraints({ focusMode: 'single-shot' });
          await new Promise(r => setTimeout(r, 500));
          if (caps.focusMode.includes('continuous'))
            await track.applyConstraints({ focusMode: 'continuous' });
        }
      } catch {}
    });

  } catch(err) {
    _qrLog('QrScanner ERR: ' + (err.message || err).toString().slice(0, 60));
    status.textContent = _copy('QR_STATUS_CAMERA_BLOCKED', '⚠️ Caméra bloquée. Autorise la caméra puis utilise la photo de secours.');
    status.className = 'qr-err';
    document.getElementById('qrTips').style.display = 'block';
  }
}

async function stopLiveQRScan() {
  if (_qrScannerInst) {
    _qrScannerInst.stop();
    _qrScannerInst.destroy();
    _qrScannerInst = null;
  }
  _qrVideoElem = null;
  const reader = document.getElementById('qrReader');
  if (reader) { reader.innerHTML = ''; reader.style.display = 'none'; }
  const torchBtn = document.getElementById('qrTorchBtn');
  if (torchBtn) { torchBtn.style.display = 'none'; torchBtn.textContent = '💡 Lampe'; }
  qrTorchOn = false;
  _resetZoomControls();
}

async function toggleQRTorch() {
  if (!_qrScannerInst) return;
  try {
    qrTorchOn = !qrTorchOn;
    if (qrTorchOn) await _qrScannerInst.turnFlashOn();
    else await _qrScannerInst.turnFlashOff();
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
  _setRetryPhotoVisible(false);
  await stopLiveQRScan();
  const status = document.getElementById('qrStatus');
  status.className = '';
  status.textContent = _copy('QR_STATUS_ANALYZING', '🔍 Révélation en cours…');
  document.getElementById('qrTips').style.display = 'none';
  const file = input.files[0];
  const url = URL.createObjectURL(file);
  document.getElementById('qrPreviewImg').src = url;
  document.getElementById('qrPreviewWrap').style.display = 'block';
  try {
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    URL.revokeObjectURL(url);
    await _qrHandleResult(result.data);
  } catch {
    URL.revokeObjectURL(url);
    status.textContent = _copy('QR_STATUS_BAD_PHOTO', '❌ Polaroid non reconnu — réessaie en te rapprochant et en éclairant bien le polaroid');
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    document.getElementById('qrTips').style.display = 'block';
    _setRetryPhotoVisible(true);
    _resetQRInput();
  }
}
async function _qrHandleResult(raw) {
  if (qrDecodeLocked) return;
  qrDecodeLocked = true;
  const status = document.getElementById('qrStatus');
  const parsedId = _extractScannedTreasureId(raw);
  if (!parsedId) {
    status.textContent = _copy('QR_STATUS_NOT_GAME', '⚠️ Ce code n\'appartient pas au jeu — cherche le bon polaroid !');
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    qrDecodeLocked = false;
    _setRetryPhotoVisible(true);
    return;
  }
  const scannedId = _resolveExpectedUniqueAlias(parsedId, qrExpectedId);

  if (qrExpectedId && scannedId !== qrExpectedId) {
    const expectedLabel = _formatTreasureForScanFeedback(qrExpectedId);
    const scannedLabel = _formatTreasureForScanFeedback(scannedId);
    status.textContent = _copy('QR_STATUS_WRONG_TREASURE_DETAIL', '⚠️ Mauvais QR: détecté {SCANNED}. Cherche {EXPECTED}.')
      .replace('{SCANNED}', scannedLabel)
      .replace('{EXPECTED}', expectedLabel);
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    qrDecodeLocked = false;
    _setRetryPhotoVisible(true);
    // Nimiq continue de scanner — pas besoin de redémarrer
    _resetQRInput(); // permettre de retenter via photo
  } else {
    status.textContent = _copy('QR_STATUS_CAPTURED', '✅ Polaroid révélé !');
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
  _setRetryPhotoVisible(false);
  qrExpectedId = null;
  qrDecodeLocked = false;
}

async function captureFixedById(id) {
  openQRScanner(id);
}


