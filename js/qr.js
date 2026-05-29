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
let _qrHistoryPushed = false;
const _qrCopy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

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

  // 4) Legacy plain tokens: "checkin:...", "found:...", UUID or numeric-only payloads.
  const legacyKeyed = txt.match(/^(?:checkin|found)\s*[:=]\s*(.+)$/i);
  if (legacyKeyed && legacyKeyed[1]) return legacyKeyed[1].trim();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(txt)) {
    return txt;
  }

  if (/^\d{1,6}$/.test(txt)) return txt;

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

function _resolveExpectedFixedAlias(scannedId, expectedId) {
  if (!scannedId || !expectedId || scannedId === expectedId) return scannedId;
  const expected = treasures.find(x => x.id === expectedId);
  if (!expected || expected.type !== 'fixed') return scannedId;

  const norm = String(scannedId).trim().toLowerCase();
  if (norm === '1' || norm === 'checkin' || norm === 'legacy') return expectedId;

  if (treasures.some(x => x.id === scannedId)) return scannedId;

  const scannedNum = _extractLastNumber(norm);
  const expectedNum = _extractLastNumber(expected.id) ?? _extractLastNumber(expected.label);
  if (scannedNum !== null && expectedNum !== null && scannedNum === expectedNum) return expectedId;

  return scannedId;
}

function _setRetryPhotoVisible(show) {
  const btn = document.getElementById('qrRetryPhotoBtn');
  if (!btn) return;
  btn.style.display = show ? 'flex' : 'none';
}

function _renderQRGuideVisual(url) {
  const wrap = document.getElementById('qrGuideVisualWrap');
  const img = document.getElementById('qrGuideVisual');
  const emoji = document.getElementById('qrEmojiFallback');
  if (!wrap || !img || !emoji) return;

  if (url) {
    img.src = url;
    wrap.style.display = 'block';
    emoji.style.display = 'none';
    return;
  }

  img.src = '';
  wrap.style.display = 'none';
  emoji.style.display = 'block';
}

function _resolveQrGuideForType(type) {
  if (type === 'fixed') return qrGuideFixedUrl || qrGuideGenericUrl || '';
  if (type === 'unique') return qrGuideFlashUrl || qrGuideGenericUrl || '';
  return qrGuideGenericUrl || '';
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
  status.textContent = _qrCopy('QR_STATUS_SCAN', 'Vise le QR pour le révéler.');
  if (photoBtnText) photoBtnText.textContent = _qrCopy('QR_PHOTO_CTA', '📷 Prendre la photo');
  if (retryBtnText) retryBtnText.textContent = _qrCopy('QR_RETRY_PHOTO_CTA', '↻ Reprendre la photo');
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
    if (photoEl) {
      photoEl.src = '';
      photoEl.style.display = 'none';
    }
    if (t) {
      _renderQRGuideVisual(_resolveQrGuideForType(t.type));
      if (t.type === 'fixed') {
        const beaconIndex = _fixedBeaconIndexInQuest(t);
        lblSpan.textContent = 'Tu as trouvé la balise';
        nameSpan.textContent = beaconIndex ? `Balise ${beaconIndex} de la quête` : 'Balise de la quête';
        questSpan.textContent = '';
        questSpan.style.display = 'none';
        status.textContent = _qrCopy('QR_STATUS_FIXED', 'Tu as trouvé la balise, prends une photo du QR code pour continuer le jeu.');
        if (photoEl) {
          photoEl.src = '';
          photoEl.style.display = 'none';
        }
      } else {
        lblSpan.textContent = 'Tu cherches';
        nameSpan.textContent = 'Trésor unique';
        questSpan.textContent = _formatUniqueTreasureRef(t);
        questSpan.style.display = 'block';
        status.textContent = _qrCopy('QR_STATUS_FLASH', 'Tu as trouvé la miniature, prends une photo du QR code pour valider ta cueillette.');
        if (photoEl) {
          photoEl.src = '';
          photoEl.style.display = 'none';
        }
      }
      targetEl.style.display = 'block';
    } else {
      _renderQRGuideVisual(_resolveQrGuideForType(null));
      if (photoEl) {
        photoEl.src = '';
        photoEl.style.display = 'none';
      }
      targetEl.style.display = 'none';
    }
  }
  document.getElementById('qrOverlay').classList.add('open');
  if (!_qrHistoryPushed) {
    history.pushState({ ...(history.state || {}), _u3dqQrOverlay: true }, '', location.href);
    _qrHistoryPushed = true;
  }
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
    status.textContent = _qrCopy('QR_STATUS_LIVE', '📷 Vise le QR · appuie sur l\'image pour la mise au point');
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
    status.textContent = _qrCopy('QR_STATUS_CAMERA_BLOCKED', '⚠️ Caméra bloquée. Autorise la caméra puis utilise la photo de secours.');
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
  status.textContent = _qrCopy('QR_STATUS_ANALYZING', '🔍 Révélation en cours…');
  document.getElementById('qrTips').style.display = 'none';
  const file = input.files[0];
  const url = URL.createObjectURL(file);
  document.getElementById('qrPreviewImg').src = url;
  document.getElementById('qrPreviewWrap').style.display = 'block';
  try {
    const result = await _scanImageBestEffort(file);
    URL.revokeObjectURL(url);
    await _qrHandleResult(result.data || result);
  } catch {
    URL.revokeObjectURL(url);
    status.textContent = _qrCopy('QR_STATUS_BAD_PHOTO', '❌ Polaroid non reconnu — réessaie en te rapprochant et en éclairant bien le polaroid');
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    document.getElementById('qrTips').style.display = 'block';
    _setRetryPhotoVisible(true);
    _resetQRInput();
  }
}

async function _scanImageBestEffort(file) {
  const scanOpts = { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true };
  try {
    return await QrScanner.scanImage(file, scanOpts);
  } catch {}

  const img = await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(objectUrl); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image-load-failed')); };
    el.src = objectUrl;
  });

  const fullCanvas = document.createElement('canvas');
  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  fullCanvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * ratio));
  fullCanvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * ratio));
  const fctx = fullCanvas.getContext('2d', { willReadFrequently: true });
  fctx.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);

  try {
    return await QrScanner.scanImage(fullCanvas, scanOpts);
  } catch {}

  // Balises terrain: le QR est souvent au centre de la photo, ce crop augmente le taux de réussite.
  const cropCanvas = document.createElement('canvas');
  const cropSize = Math.round(Math.min(fullCanvas.width, fullCanvas.height) * 0.82);
  const cx = Math.round((fullCanvas.width - cropSize) / 2);
  const cy = Math.round((fullCanvas.height - cropSize) / 2);
  cropCanvas.width = cropSize;
  cropCanvas.height = cropSize;
  const cctx = cropCanvas.getContext('2d', { willReadFrequently: true });
  cctx.drawImage(fullCanvas, cx, cy, cropSize, cropSize, 0, 0, cropSize, cropSize);

  try {
    return await QrScanner.scanImage(cropCanvas, scanOpts);
  } catch {}

  // Dernier essai: agrandissement léger du crop pour les petits QR imprimés.
  const upCanvas = document.createElement('canvas');
  upCanvas.width = cropSize * 2;
  upCanvas.height = cropSize * 2;
  const uctx = upCanvas.getContext('2d', { willReadFrequently: true });
  uctx.imageSmoothingEnabled = false;
  uctx.drawImage(cropCanvas, 0, 0, upCanvas.width, upCanvas.height);
  return await QrScanner.scanImage(upCanvas, scanOpts);
}
async function _qrHandleResult(raw) {
  if (qrDecodeLocked) return;
  qrDecodeLocked = true;
  const status = document.getElementById('qrStatus');
  const parsedId = _extractScannedTreasureId(raw);
  if (!parsedId) {
    status.textContent = _qrCopy('QR_STATUS_NOT_GAME', '⚠️ Ce code n\'appartient pas au jeu — cherche le bon polaroid !');
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    qrDecodeLocked = false;
    _setRetryPhotoVisible(true);
    return;
  }
  let scannedId = _resolveExpectedUniqueAlias(parsedId, qrExpectedId);
  scannedId = _resolveExpectedFixedAlias(scannedId, qrExpectedId);

  if (qrExpectedId && scannedId !== qrExpectedId) {
    const expectedLabel = _formatTreasureForScanFeedback(qrExpectedId);
    const scannedLabel = _formatTreasureForScanFeedback(scannedId);
    status.textContent = _qrCopy('QR_STATUS_WRONG_TREASURE_DETAIL', '⚠️ Mauvais QR: détecté {SCANNED}. Cherche {EXPECTED}.')
      .replace('{SCANNED}', scannedLabel)
      .replace('{EXPECTED}', expectedLabel);
    status.className = 'qr-err';
    haptic([80, 60, 80]);
    qrDecodeLocked = false;
    _setRetryPhotoVisible(true);
    // Nimiq continue de scanner — pas besoin de redémarrer
    _resetQRInput(); // permettre de retenter via photo
  } else {
    status.textContent = _qrCopy('QR_STATUS_CAPTURED', '✅ Polaroid révélé !');
    status.className = 'qr-ok';
    haptic([80, 40, 160]);
    await new Promise(r => setTimeout(r, 400));
    closeQRScanner();
    try {
      await processFindById(scannedId);
    } catch (err) {
      console.error('QR capture processing failed:', err);
      if (typeof _checkinError === 'function') {
        _checkinError('Révélation impossible pour le moment. Réessaie dans quelques secondes.');
      }
    }
  }
}

function closeQRScanner() {
  stopLiveQRScan();
  document.getElementById('qrOverlay').classList.remove('open');
  _setRetryPhotoVisible(false);
  qrExpectedId = null;
  qrDecodeLocked = false;
  if (_qrHistoryPushed) {
    _qrHistoryPushed = false;
    // Do not navigate back here: it can close the next success modal on some mobile browsers.
    try {
      const st = history.state || {};
      if (st && st._u3dqQrOverlay) {
        const next = { ...st };
        delete next._u3dqQrOverlay;
        history.replaceState(next, '', location.href);
      }
    } catch {}
  }
}

window.addEventListener('popstate', () => {
  const overlay = document.getElementById('qrOverlay');
  if (overlay && overlay.classList.contains('open')) {
    stopLiveQRScan();
    overlay.classList.remove('open');
    _setRetryPhotoVisible(false);
    qrExpectedId = null;
    qrDecodeLocked = false;
    _qrHistoryPushed = false;
  }
});

async function captureFixedById(id) {
  openQRScanner(id);
}


