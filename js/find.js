// ── Find processing & UI feedback ───────────────────
let _processingFind = false;
const _inFlightCaptures = new Set(); // protection double-scan par balise

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
  if (!myPseudo) { _checkinError('Mode invité : connecte-toi pour révéler des polaroids.'); return; }
  const foundCountBefore = myFoundCount;
  // Fetch treasure fresh from DB
  const { data: t, error } = await db.from('treasures').select('*').eq('id', treasureId).single();
  if (error || !t) { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return; }
  if (!t.visible)  { _checkinError('Ce polaroid n\'est pas encore actif.'); return; }

  // Check if already found by me
  const foundList = (t.found_by || '').split(',').filter(Boolean);
  if (foundList.includes(myPseudo)) { showFoundResult('already', t); return; }

  // Unique: check if taken
  if (t.type === 'unique' && foundList.length > 0) { showFoundResult('taken', t); return; }

  // Server-side dedup: prevents double-write from multi-tab or rapid re-scan
  const { data: dupEvent } = await db.from('events').select('id').eq('pseudo', myPseudo).eq('treasure_id', t.id).maybeSingle();
  if (dupEvent) { showFoundResult('already', t); return; }

  // Calculate duration
  // Calculate duration from max(placed_at, gameStart) to now
  const refTime = gameStart && gameStart > new Date(t.placed_at) ? gameStart : new Date(t.placed_at);
  const durationSec = Math.max(0, Math.round((Date.now() - refTime.getTime()) / 1000));

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
    _checkinError('Révélation enregistrée partiellement. Réessaie dans quelques secondes.');
    return;
  }

  let durationSecHunt = null;
  if (t.type === 'fixed') {
    const firstFixedKey = `u3dq_first_fixed_at_${myPseudo}`;
    if (foundCountBefore === 0) {
      localStorage.setItem(firstFixedKey, String(Date.now()));
      durationSecHunt = 0;
    } else {
      const firstFixedAt = Number(localStorage.getItem(firstFixedKey) || 0);
      durationSecHunt = firstFixedAt ? Math.max(0, Math.round((Date.now() - firstFixedAt) / 1000)) : 0;
    }
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
  if (navigator.vibrate) navigator.vibrate([80, 40, 160]);

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
  const modal = document.getElementById('foundModal');
  const emoji  = document.getElementById('foundEmoji');
  const label  = document.getElementById('foundLabel');
  const title  = document.getElementById('foundTitle');
  const dur    = document.getElementById('foundDuration');
  const desc   = document.getElementById('foundDesc');

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
        label.textContent = 'POLAROID RÉVÉLÉ';
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
        desc.textContent = 'Un seul polaroid te sépare de la fin. Tout se joue maintenant.';
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
          { icon: 'camera', className: 'teal', label: 'RÉVÉLÉ', title: 'Polaroid révélé.', desc: `Continue, il t'en reste ${remaining}.` },
          { icon: 'gps', className: 'teal', label: 'EN ROUTE', title: 'Belle trouvaille.', desc: `${remaining} polaroids t'attendent encore.` },
          { icon: 'check', className: 'success', label: 'TROUVÉ', title: 'Tu as l\'œil.', desc: `Plus que ${remaining} dans ce quartier.` },
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
      label.textContent = 'FLASH !';
      title.textContent = `Flash ! Tu es le seul à l'avoir.`;
      dur.textContent   = formatDuration(durationSec);
      desc.textContent  = '';
    }
  } else if (status === 'already') {
    setFoundIcon('refresh', 'warn');
    label.textContent = 'DÉJÀ RÉVÉLÉ';
    title.textContent = 'Tu as déjà révélé ce polaroid.';
    dur.textContent   = '';
    desc.textContent  = '';
  } else {
    setFoundIcon('lock', 'danger');
    label.textContent = 'TROP TARD';
    title.textContent = 'Trop tard !';
    dur.textContent   = '';
    desc.textContent  = 'Trop tard. Ce flash a déjà été pris.';
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
  return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}min`;
}
function pseudoGradient(pseudo) {
  let seed = 0;
  for (let i = 0; i < pseudo.length; i++) seed = (seed * 31 + pseudo.charCodeAt(i)) & 0xffff;
  const palette = ['#ff3d8a','#00e5ff','#ffb020','#a855f7','#4ade80','#60a5fa','#f87171'];
  return `linear-gradient(135deg,${palette[seed % palette.length]},${palette[(seed*7+3) % palette.length]})`;
}

