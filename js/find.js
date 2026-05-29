// ── Find processing & UI feedback ───────────────────
let _processingFind = false;
const _inFlightCaptures = new Set(); // protection double-scan par balise
window._uniqueCaptureShareData = window._uniqueCaptureShareData || null;
let _lastUniqueSuccessModal = { id: null, at: 0 };
const _findCopy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

function _getUniqueDurationFromLastActivationSec(treasure) {
  if (!treasure) return 0;
  const anchorIso = treasure.activated_at || treasure.placed_at;
  if (!anchorIso) return 0;
  const anchor = new Date(anchorIso).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return Math.max(0, Math.round((Date.now() - anchor) / 1000));
}

async function _getFixedHuntDurationSec(pseudo) {
  if (!pseudo) return 0;
  try {
    const { data, error } = await db.from('events')
      .select('created_at')
      .eq('pseudo', pseudo)
      .eq('treasure_type', 'fixed')
      .order('created_at', { ascending: true });
    if (error || !data || data.length <= 1) return 0;
    const firstAt = new Date(data[0].created_at).getTime();
    const lastAt = new Date(data[data.length - 1].created_at).getTime();
    if (!Number.isFinite(firstAt) || !Number.isFinite(lastAt)) return 0;
    return Math.max(0, Math.round((lastAt - firstAt) / 1000));
  } catch {
    return 0;
  }
}

function _isMissingSecureFindRpcError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code === '42883' || /process_find_secure/i.test(msg);
}

function _isTreasureAllowedInActiveScope(treasure) {
  if (!treasure) return false;
  if (!Array.isArray(activeQuests) || activeQuests.length === 0) return true;
  const quest = String(treasure.quest || '').trim();
  // Keep unassigned treasures available across instances, same rule as loadTreasures().
  return !quest || activeQuests.includes(quest);
}

async function _tryProcessFindSecure(t, foundCountBefore) {
  const hasGps = Number.isFinite(playerLat) && Number.isFinite(playerLng);
  const payload = {
    p_pseudo: myPseudo,
    p_session_token: myToken || null,
    p_treasure_id: t.id,
    p_player_lat: hasGps ? playerLat : null,
    p_player_lng: hasGps ? playerLng : null,
    p_proximity_m: Math.max(10, Number(proximityR) || 100)
  };

  const { data, error } = await db.rpc('process_find_secure', payload);
  if (error) {
    if (_isMissingSecureFindRpcError(error)) return false;
    _checkinError('Révélation impossible pour le moment. Réessaie dans quelques secondes.');
    return true;
  }
  if (!data || !data.status) return false;

  if (data.status === 'not_found') { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return true; }
  if (data.status === 'hidden')   { _checkinError('Ce polaroid n\'est pas encore actif.'); return true; }
  if (data.status === 'no_gps')   { _checkinError('GPS requis pour valider cette capture.'); return true; }
  if (data.status === 'invalid_session') {
    _checkinError('Session expirée — reconnecte-toi puis réessaie.');
    return true;
  }
  if (data.status === 'too_far') {
    const dist = Math.round(Number(data.distance_m || 0));
    _checkinError(`Tu es à ${dist}m de "${tLabel(t)}" — trop loin pour révéler.\nApproche-toi à moins de ${proximityR}m.`, t.id);
    return true;
  }
  if (data.status === 'already') { showFoundResult('already', t); return true; }
  if (data.status === 'taken')   { showFoundResult('taken', t); return true; }
  if (data.status !== 'success') return false;

  let durationSec = Math.max(0, Number(data.duration_sec || 0));
  if (t.type === 'unique') {
    // Product rule: Flash timer starts from the latest activation of that Flash.
    durationSec = _getUniqueDurationFromLastActivationSec(t);
  }
  let durationSecHunt = null;
  if (t.type === 'fixed') {
    durationSecHunt = await _getFixedHuntDurationSec(myPseudo);
  }

  const { data: pFresh } = await db.from('players').select('score,found_count').eq('pseudo', myPseudo).single();
  if (pFresh) {
    myScore = pFresh.score || 0;
    myFoundCount = pFresh.found_count || 0;
  }

  await loadTreasures();
  renderMarkers();
  updateHeader();
  updateRadar();
  updateProgressBar();

  haptic([80, 40, 160]);

  if (t.type === 'fixed' && t.quest) {
    const questBeacons = treasures.filter(x => x.type === 'fixed' && x.quest === t.quest);
    const allFound = questBeacons.every(x => {
      const fl = (x.found_by || '').split(',').filter(Boolean);
      return fl.includes(myPseudo);
    });
    if (allFound && questBeacons.length > 0) {
      showFoundResult('success', t, durationSec, durationSecHunt);
      setTimeout(() => showQuestComplete(t.quest, durationSecHunt, questBeacons.length), 2200);
      return true;
    }
  }

  showFoundResult('success', t, durationSec, durationSecHunt);
  return true;
}

async function _rollbackFoundBy(treasure, previousFoundBy, expectedFoundBy) {
  const rollbackPayload = {
    found_by: previousFoundBy,
    found_at: treasure.found_at || null
  };
  const { error } = await db.from('treasures')
    .update(rollbackPayload)
    .eq('id', treasure.id)
    .eq('found_by', expectedFoundBy)
    .select('id');
  return !error;
}

async function _tryGuestUniqueCapture(treasure) {
  if (myPseudo) return false;
  if (!treasure || treasure.type !== 'unique') return false;

  const foundList = (treasure.found_by || '').split(',').filter(Boolean);
  if (foundList.length > 0) {
    showFoundResult('taken', treasure);
    return true;
  }

  const updatePayload = { found_by: 'INVITE', found_at: new Date().toISOString() };
  const { data: updatedRows, error } = await db.from('treasures')
    .update(updatePayload)
    .eq('id', treasure.id)
    .eq('found_by', '')
    .select('id');

  if (error || !updatedRows || !updatedRows.length) {
    showFoundResult('taken', treasure);
    return true;
  }

  await loadTreasures();
  renderMarkers();
  updateHeader();
  updateRadar();
  updateProgressBar();

  haptic([80, 40, 160]);
  const durationSec = _getUniqueDurationFromLastActivationSec(treasure);
  showFoundResult('success', treasure, durationSec, null);
  return true;
}

async function processFindById(treasureId) {
  if (_processingFind) return;
  if (_inFlightCaptures.has(treasureId)) return;
  _processingFind = true;
  _inFlightCaptures.add(treasureId);
  try {
    await _doProcessFind(treasureId);
  } finally {
    _processingFind = false;
    _inFlightCaptures.delete(treasureId);
  }
}

async function _doProcessFind(treasureId) {
  const foundCountBefore = myFoundCount;
  // Fetch treasure fresh from DB
  const { data: t, error } = await db.from('treasures').select('*').eq('id', treasureId).single();
  if (error || !t) { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return; }
  if (!t.visible)  { _checkinError('Ce polaroid n\'est pas encore actif.'); return; }
  if (!_isTreasureAllowedInActiveScope(t)) {
    _checkinError('Cette balise n\'est pas active dans cette partie. Scanne une balise de la quête en cours.');
    return;
  }

  if (!myPseudo) {
    if (await _tryGuestUniqueCapture(t)) return;
    _checkinError('Mode invité : connecte-toi pour révéler des polaroids.');
    return;
  }

  // Check if already found by me
  const foundList = (t.found_by || '').split(',').filter(Boolean);
  if (foundList.includes(myPseudo)) { showFoundResult('already', t); return; }

  // Unique: check if taken
  if (t.type === 'unique' && foundList.length > 0) { showFoundResult('taken', t); return; }

  // Preferred secure server path; falls back to legacy flow if RPC is not deployed yet.
  if (await _tryProcessFindSecure(t, foundCountBefore)) return;

  // Server-side dedup: prevents double-write from multi-tab or rapid re-scan
  const { data: dupEvent } = await db.from('events').select('id').eq('pseudo', myPseudo).eq('treasure_id', t.id).maybeSingle();
  if (dupEvent) { showFoundResult('already', t); return; }

  // Duration rule:
  // - Flash (unique): from latest activation timestamp.
  // - Quete (fixed): from max(gameStart, activation/placement timestamp).
  const activationTime = t.activated_at ? new Date(t.activated_at) : new Date(t.placed_at);
  const durationSec = t.type === 'unique'
    ? _getUniqueDurationFromLastActivationSec(t)
    : Math.max(0, Math.round((Date.now() - (gameStart && gameStart > activationTime ? gameStart : activationTime).getTime()) / 1000));

  // Update treasure found_by
  const newFoundBy = t.type === 'unique' ? myPseudo : [...foundList, myPseudo].join(',');
  const updatePayload = { found_by: newFoundBy, found_at: new Date().toISOString() };
  const updateQ = db.from('treasures').update(updatePayload).eq('id', t.id);
  const { error: updateError, data: updatedRows } = t.type === 'unique'
    ? await updateQ.eq('found_by', '').select('id')
    : await updateQ.select('id');
  if (updateError || !updatedRows || !updatedRows.length) {
    if (t.type === 'unique') {
      showFoundResult('taken', t);
    } else {
      _checkinError('Révélation impossible pour le moment. Réessaie dans quelques secondes.');
    }
    return;
  }

  // Log event (server now owns score/found_count aggregation)
  const { error: eventError } = await db.from('events').insert({ pseudo: myPseudo, treasure_id: t.id, treasure_type: t.type, duration_sec: durationSec });
  if (eventError) {
    if (eventError.code === '23505') {
      showFoundResult('already', t);
      return;
    }
    // Keep treasure/events consistency when event insert fails.
    const rolledBack = await _rollbackFoundBy(t, t.found_by || '', newFoundBy);
    if (!rolledBack) {
      _checkinError('Révélation enregistrée partiellement. Réessaie dans quelques secondes.');
      return;
    }
    _checkinError('Révélation impossible pour le moment. Réessaie dans quelques secondes.');
    return;
  }

  let durationSecHunt = null;
  if (t.type === 'fixed') {
    durationSecHunt = await _getFixedHuntDurationSec(myPseudo);
  }

  // Score/found_count are server-managed from events (trigger-side).
  // Reload local counters from players after event commit.
  const { data: pFresh } = await db.from('players').select('score,found_count').eq('pseudo', myPseudo).single();
  if (pFresh) {
    myScore = pFresh.score || 0;
    myFoundCount = pFresh.found_count || 0;
  }

  // Refresh local treasures
  await loadTreasures();
  renderMarkers();
  updateHeader();
  updateRadar();
  updateProgressBar();

  // Haptic feedback
  haptic([80, 40, 160]);

  // Détecter fin de quête (balises fixes d'une quête nommée toutes trouvées)
  if (t.type === 'fixed' && t.quest) {
    const questBeacons = treasures.filter(x => x.type === 'fixed' && x.quest === t.quest);
    const allFound = questBeacons.every(x => {
      const fl = (x.found_by || '').split(',').filter(Boolean);
      return fl.includes(myPseudo);
    });
    if (allFound && questBeacons.length > 0) {
      showFoundResult('success', t, durationSec, durationSecHunt);
      setTimeout(() => showQuestComplete(t.quest, durationSecHunt, questBeacons.length), 2200);
      return;
    }
  }

  showFoundResult('success', t, durationSec, durationSecHunt);
}

function showFoundResult(status, t, durationSec, durationSecHunt) {
  if (t && t.type === 'unique' && status !== 'success') {
    const ageMs = Date.now() - (_lastUniqueSuccessModal.at || 0);
    if (_lastUniqueSuccessModal.id === t.id && ageMs < 8000) return;
  }

  const modal = document.getElementById('foundModal');
  const label  = document.getElementById('foundLabel');
  const title  = document.getElementById('foundTitle');
  const dur    = document.getElementById('foundDuration');
  const desc   = document.getElementById('foundDesc');
  const sharePanel = document.getElementById('foundSharePanel');
  const shareKicker = sharePanel ? sharePanel.querySelector('.found-share-kicker') : null;
  const shareTitle = sharePanel ? sharePanel.querySelector('.found-share-title') : null;
  const shareText = sharePanel ? sharePanel.querySelector('.found-share-text') : null;
  const shareBtn = document.getElementById('foundShareCaptureBtn');
  const inviteBtn = document.getElementById('foundInviteBtn');

  window._uniqueCaptureShareData = null;
  if (sharePanel) sharePanel.classList.add('field-hidden');
  if (shareKicker) {
    const kickerTpl = _findCopy('FLASH_SHARE_KICKER', 'FLASH CAPTURÉ · {PSEUDO}');
    shareKicker.textContent = kickerTpl.replace('{PSEUDO}', myPseudo || 'JOUEUR');
  }
  if (shareTitle) {
    const shareHeadline = _findCopy('FLASH_SHARE_TITLE', '').trim();
    shareTitle.textContent = shareHeadline;
    shareTitle.classList.toggle('field-hidden', !shareHeadline);
  }
  if (shareText) {
    const helper = _findCopy('FLASH_SHARE_TEXT', '').trim();
    shareText.textContent = helper;
    shareText.classList.toggle('field-hidden', !helper);
  }
  if (shareBtn) shareBtn.textContent = _findCopy('FLASH_SHARE_CAPTURE_CTA', 'Partager');
  if (inviteBtn) inviteBtn.textContent = _findCopy('FLASH_SHARE_INVITE_CTA', 'Inviter');

  // Show photos if available and found
  const photoStrip = document.getElementById('foundPhotoStrip');
  const photoSingle = document.getElementById('foundPhoto');
  photoSingle.style.display = 'none';
  if (status === 'success') {
    const photos = getPhotoUrls(t.photo_url);
    if (photos.length) {
      photoStrip.innerHTML = photos.map(safeImgUrl).filter(Boolean).map(url => `<img src="${escHtml(url)}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-bottom:6px;display:block">`).join('');
      photoStrip.style.display = 'block';
    } else { photoStrip.style.display = 'none'; }
  } else { photoStrip.style.display = 'none'; }

  if (status === 'success') {
    if (t.type === 'fixed') {
      // Compte combien de fixes il reste
      const remaining = treasures.filter(tr =>
        tr.type === 'fixed' &&
        !(tr.found_by && tr.found_by.split(',').includes(myPseudo)) &&
        tr.id !== t.id
      ).length;
      const foundNow = fixedTotal - remaining;
      if (foundNow === 1) {
        setFoundIcon('camera', 'teal');
        label.textContent = 'PREMIÈRE RÉVÉLATION';
        title.textContent = 'La chasse commence !';
        desc.textContent = `Le chrono est lancé. Trouve les ${fixedTotal - 1} autres polaroids le plus vite possible.`;
        dur.textContent = '';
      } else if (remaining === 0) {
        setFoundIcon('camera', 'teal');
        label.textContent = 'BALISE TROUVÉE';
        title.textContent = 'Polaroid révélé !';
        dur.textContent = durationSec != null ? formatDuration(durationSec) + ' depuis le début' : '';
        desc.textContent = 'Incroyable ! Ta quete est complete !';
        db.from('config').select('key,value').then(({ data: cfgData }) => {
          if (!cfgData) return;
          const cfg = Object.fromEntries(cfgData.map(r => [r.key, r.value]));
          const msg = activeQuests.map(q => cfg['rewardMessage_'+q]).find(m => m) || cfg['rewardMessage'] || '';
          if (msg) desc.innerHTML = `Ta quete est complete !<br><br><strong>${escHtml(msg)}</strong>`;
        });
      } else if (remaining === 1) {
        setFoundIcon('check', 'success');
        label.textContent = 'PRESQUE !';
        title.textContent = 'Plus qu\'un !';
        desc.textContent = 'Une seule Balise te sépare de la fin. Tout se joue maintenant.';
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      } else if (remaining === 2) {
        setFoundIcon('flash', 'flash');
        label.textContent = 'EN FEU';
        title.textContent = 'Il n\'en reste plus que deux.';
        desc.textContent = 'Tu y es presque. Ne lâche rien.';
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      } else if (remaining === 3) {
        setFoundIcon('gps', 'teal');
        label.textContent = 'BON RYTHME';
        title.textContent = 'Encore trois à trouver.';
        desc.textContent = 'La fin approche. Reste concentré.';
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      } else {
        const midMessages = [
          { icon: 'camera', className: 'teal', label: 'RÉVÉLÉ', title: 'Balise révélé.', desc: `Continue, il t'en reste ${remaining}.` },
          { icon: 'gps', className: 'teal', label: 'EN ROUTE', title: 'Belle trouvaille.', desc: `${remaining} polaroids t'attendent encore.` },
          { icon: 'check', className: 'success', label: 'TROUVÉ', title: 'Tu as l\'œil.', desc: `Plus que ${remaining} en attente.` },
          { icon: 'gps', className: 'warn', label: 'MARQUÉ', title: 'Dans la boîte.', desc: `${remaining} restants. Ne ralentis pas.` },
          { icon: 'flash', className: 'flash', label: 'EN CHASSE', title: 'La quête avance.', desc: `${remaining} polaroids à révéler.` }
        ];
        const msg = midMessages[foundNow % midMessages.length];
        setFoundIcon(msg.icon, msg.className);
        label.textContent = msg.label;
        title.textContent = msg.title;
        desc.textContent = msg.desc;
        dur.textContent = durationSecHunt != null ? formatDuration(durationSecHunt) : '';
      }
    } else {
      setFoundIcon('flash', 'flash');
      label.textContent = _findCopy('FLASH_WIN_LABEL', 'CAPTURÉ');
      title.textContent = _findCopy('FLASH_WIN_TITRE', 'Trésor unique capturé');
      dur.textContent   = formatDuration(durationSec);
      desc.textContent  = _findCopy('FLASH_WIN_DESC', 'Trésor validé. Partage ta capture et continue la chasse.');
      _lastUniqueSuccessModal = { id: t.id, at: Date.now() };
      window._uniqueCaptureShareData = {
        id: t.id,
        label: tLabel(t),
        quest: t.quest || '',
        durationSec: durationSec || 0,
        durationText: durationSec != null ? formatDuration(durationSec) : '',
        shareUrl: location.origin + location.pathname,
        pseudo: myPseudo || '',
        photoUrl: t.photo_url || ''
      };
      if (sharePanel) sharePanel.classList.remove('field-hidden');
    }
  } else if (status === 'already') {
    setFoundIcon('refresh', 'warn');
    label.textContent = _findCopy('FLASH_ALREADY_LABEL', 'DÉJÀ FLASHÉ');
    title.textContent = _findCopy('FLASH_ALREADY_TITRE', 'Tu as déjà flashé ce polaroid.');
    dur.textContent   = '';
    desc.textContent  = '';
  } else {
    setFoundIcon('lock', 'danger');
    label.textContent = _findCopy('FLASH_PRIS_LABEL', 'TROP TARD');
    title.textContent = _findCopy('FLASH_PRIS_TITRE', 'Trop tard !');
    dur.textContent   = '';
    desc.textContent  = _findCopy('FLASH_PRIS_DESC', 'Ce trésor Flash a déjà été pris.');
  }
  modal.classList.add('open');
  // Flash overlay on success
  if (status === 'success') {
    const overlay = document.getElementById('foundFlashOverlay');
    if (overlay) {
      overlay.classList.remove('flash');
      void overlay.offsetWidth; // force reflow
      overlay.classList.add('flash');
    }
  }
}

function closeFound() { document.getElementById('foundModal').classList.remove('open'); }

function openPhotoViewer(url) {
  document.getElementById('photoViewerImg').src = url;
  document.getElementById('photoViewer').classList.add('open');
}
function closePhotoViewer() {
  document.getElementById('photoViewer').classList.remove('open');
  document.getElementById('photoViewerImg').src = '';
}

function uiIconSvg(name) {
  switch (name) {
    case 'camera':  return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-camera"/></svg>';
    case 'flash':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-flash"/></svg>';
    case 'trophy':  return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-trophy"/></svg>';
    case 'clock':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-clock"/></svg>';
    case 'check':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-check"/></svg>';
    case 'gps':     return '<svg viewBox="0 0 20 20"><use href="icons/icons.svg#icon-gps"/></svg>';
    case 'refresh': return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-refresh"/></svg>';
    case 'lock':    return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-lock"/></svg>';
    default:        return '';
  }
}

function uiIcon(name, className) {
  return `<span class="ui-icon ${className || ''}" aria-hidden="true">${uiIconSvg(name)}</span>`;
}

function setFoundIcon(name, className) {
  const emoji = document.getElementById('foundEmoji');
  if (!emoji) return;
  emoji.innerHTML = uiIcon(name, `lg ${className || ''}`);
}

function formatDuration(sec) {
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}min ${sec%60}s`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}min`;
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  return `${days}j ${hours}h ${mins}min`;
}
function pseudoGradient(pseudo) {
  let seed = 0;
  for (let i = 0; i < pseudo.length; i++) seed = (seed * 31 + pseudo.charCodeAt(i)) & 0xffff;
  const palette = ['#ff3d8a','#00e5ff','#ffb020','#a855f7','#4ade80','#60a5fa','#f87171'];
  return `linear-gradient(135deg,${palette[seed % palette.length]},${palette[(seed*7+3) % palette.length]})`;
}

