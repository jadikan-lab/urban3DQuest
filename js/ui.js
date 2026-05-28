// ── Page Visibility API — pause timers en arrière-plan ──
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (_configRefreshInterval) { clearInterval(_configRefreshInterval); _configRefreshInterval = null; }
    if (lbInterval) { clearInterval(lbInterval); lbInterval = null; }
    stopCompassInterval();
    if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
  } else {
    startConfigRefreshPolling();
    setTimeout(() => startGeoWatch(true), 300);
    if (myPseudo || activeTab === 'scores') startLbPolling();
    if (activeTab === 'explore') startCompassInterval();
    updateRadar();
    updateGpsLoadingPanel();
  }
});

window.addEventListener('beforeunload', () => {
  if (_configRefreshInterval) { clearInterval(_configRefreshInterval); _configRefreshInterval = null; }
  if (gameSyncChannel && db && typeof db.removeChannel === 'function') db.removeChannel(gameSyncChannel);
  if (geoWatch !== null) navigator.geolocation.clearWatch(geoWatch);
  if (geoWatchdog) { clearInterval(geoWatchdog); geoWatchdog = null; }
});

// ── Tabs ─────────────────────────────────────────────
function showTab(name, btn) {
  activeTab = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
  if (name !== 'explore') {
    document.getElementById('radarBar').style.display = 'none';
    document.getElementById('progressBar').style.display = 'none';
  }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn) gpsKickBtn.style.display = (name === 'explore' && isIOSDevice() && playerLat === null) ? 'block' : 'none';
  updateGpsLoadingPanel();
  if (name === 'explore') {
    setTimeout(() => gameMap && gameMap.invalidateSize(), 60);
    startCompassInterval();
    updateProgressBar();
    updateRadar();
    _updateRadarBg();
    applyExploreMapLock();
    applyMapHeadingRotation();
    updateCompassCorner();
  } else if (name === 'scores') {
    stopCompassInterval();
    document.getElementById('captureFab').style.display = 'none';
    _clearArrows();
    _updateRadarBg();
    applyMapHeadingRotation();
    updateCompassCorner();
    loadLeaderboard();
  } else if (name === 'moi') {
    stopCompassInterval();
    document.getElementById('captureFab').style.display = 'none';
    _clearArrows();
    _updateRadarBg();
    applyMapHeadingRotation();
    updateCompassCorner();
    const ps = document.getElementById('parcoursSection');
    if (ps) ps.style.display = activeGameMode === 'fixed' ? 'block' : 'none';
    if (activeGameMode === 'fixed') loadBalises();
    loadMoi();
    loadCarnet();
  } else {
    stopCompassInterval();
    document.getElementById('captureFab').style.display = 'none';
    _clearArrows();
    _updateRadarBg();
    updateCompassCorner();
  }
}

function toggleMoreMenu() {}
function _fmtDuration(secs) {
  if (!secs || secs < 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

let _qcData = {};
window._uniqueCaptureShareData = window._uniqueCaptureShareData || null;

async function showQuestComplete(questName, totalSecs, beaconCount) {
  _qcData = { questName, totalSecs, beaconCount };
  document.getElementById('qcQuestName').textContent = questName;
  document.getElementById('qcCount').textContent = beaconCount + '/' + beaconCount;
  document.getElementById('qcTime').textContent = _fmtDuration(totalSecs);
  document.getElementById('qcRank').textContent = '…';
  document.getElementById('questCompleteModal').classList.add('open');

  // Calcul du rang parmi les joueurs ayant complété cette quête
  try {
    const questBeaconIds = treasures
      .filter(x => x.type === 'fixed' && x.quest === questName)
      .map(x => x.id);
    if (questBeaconIds.length > 0) {
      const { data: evts } = await db.from('events')
        .select('pseudo,treasure_id,duration_sec')
        .in('treasure_id', questBeaconIds);
      if (evts) {
        const byPseudo = {};
        evts.forEach(e => {
          if (!byPseudo[e.pseudo]) byPseudo[e.pseudo] = { ids: new Set(), total: 0 };
          byPseudo[e.pseudo].ids.add(e.treasure_id);
          byPseudo[e.pseudo].total += (e.duration_sec || 0);
        });
        const completers = Object.entries(byPseudo)
          .filter(([, v]) => v.ids.size >= questBeaconIds.length)
          .sort((a, b) => a[1].total - b[1].total);
        const idx = completers.findIndex(([p]) => p === myPseudo);
        const rank = idx >= 0 ? '#' + (idx + 1) : '—';
        document.getElementById('qcRank').textContent = rank + (completers.length > 1 ? '/' + completers.length : '');
        _qcData.rank = rank;
        _qcData.total = completers.length;
      }
    }
  } catch {
    document.getElementById('qcRank').textContent = '—';
  }
}

function closeQuestComplete() {
  document.getElementById('questCompleteModal').classList.remove('open');
}

function shareQuestResult() {
  const { questName, totalSecs, beaconCount, rank, total } = _qcData;
  const timeStr = _fmtDuration(totalSecs);
  const rankStr = rank && total ? ` · ${rank} sur ${total} joueurs` : '';
  const text = `🏆 J'ai terminé la quête "${questName}" sur Urban3DQuest !\n📷 ${beaconCount} polaroids révélés · ⏱ ${timeStr}${rankStr}\n\nViens jouer : ${location.origin + location.pathname}`;
  if (navigator.share) {
    navigator.share({ title: 'Urban3DQuest — Quête accomplie !', text }).catch(() => {});
  } else {
    navigator.clipboard && navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('qcShareBtn');
      if (btn) { btn.textContent = '✓ Copié !'; setTimeout(() => { btn.textContent = '📤 Partager'; }, 2000); }
    });
  }
}

function shareScoreResult() {
  const d = _lbShareData;
  if (!d || !myPseudo) return;
  const playUrl = location.origin + location.pathname;
  let text = '';
  if (d.hasData) {
    const rankTxt = d.rank && d.totalPlayers ? `#${d.rank}/${d.totalPlayers}` : '—';
    const fixedTxt = d.totalFixed > 0 ? `${d.fixedCount}/${d.totalFixed}` : `${d.fixedCount}`;
    const flashTxt = d.flashCount;
    const timeTxt = d.allFixed && d.fixedDuration !== null ? ` · ⏱ ${formatDuration(d.fixedDuration)}` : '';
    text = `🏙 Urban 3D Quest\n👤 ${d.pseudo}\n🏅 Rang Quête: ${rankTxt}\n📷 Balises fixes: ${fixedTxt}${timeTxt}\n⚡ Flash: ${flashTxt}\n\nViens jouer : ${playUrl}`;
  } else {
    text = `🏙 Je joue à Urban 3D Quest !\nRejoins-moi pour trouver les polaroids dans la ville.\n\n${playUrl}`;
  }

  if (navigator.share) {
    navigator.share({ title: 'Urban 3D Quest — Mon score', text }).catch(() => {});
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('scoreShareBtn');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = '✓ Copié !';
        setTimeout(() => {
          btn.textContent = original && original.indexOf('Inviter') >= 0 ? '📤 Inviter mes amis' : '📤 Partager mon score';
        }, 2000);
      }
    }).catch(() => {});
  }
}

function _escapeCanvasText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function _wrapCanvasText(ctx, text, maxWidth) {
  const words = _escapeCanvasText(text).split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function _setShareButtonState(buttonId, label) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const original = btn.dataset.originalLabel || btn.textContent;
  btn.dataset.originalLabel = original;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = btn.dataset.originalLabel || original; }, 2200);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function _buildUniqueCaptureCanvas(data) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, '#150818');
  bg.addColorStop(0.5, '#251033');
  bg.addColorStop(1, '#09131f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(290, 270, 40, 290, 270, 460);
  glow.addColorStop(0, 'rgba(255,61,138,0.42)');
  glow.addColorStop(1, 'rgba(255,61,138,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow2 = ctx.createRadialGradient(820, 190, 30, 820, 190, 360);
  glow2.addColorStop(0, 'rgba(0,229,255,0.24)');
  glow2.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let y = 160; y < canvas.height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(84, y);
    ctx.lineTo(canvas.width - 84, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 18; i++) {
    const x = 120 + (i * 53) % 860;
    const y = 100 + (i * 97) % 1120;
    ctx.beginPath();
    ctx.arc(x, y, i % 3 === 0 ? 4 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '700 34px JetBrains Mono, monospace';
  ctx.fillText('URBAN 3D QUEST', 84, 92);

  ctx.fillStyle = '#ff3d8a';
  ctx.font = '800 22px JetBrains Mono, monospace';
  ctx.fillText('FLASH CAPTURÉ', 84, 142);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 74px Space Grotesk, sans-serif';
  _wrapCanvasText(ctx, _escapeCanvasText(data.label || 'Trésor unique'), 912).forEach((line, index) => {
    ctx.fillText(line, 84, 260 + (index * 82));
  });

  const sharePseudo = _escapeCanvasText(data.pseudo || myPseudo || 'Joueur');
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '500 28px Space Grotesk, sans-serif';
  const subLines = _wrapCanvasText(ctx, `Par ${sharePseudo} · ${_escapeCanvasText(data.durationText || '')}`, 900);
  subLines.forEach((line, index) => ctx.fillText(line, 84, 440 + (index * 38)));

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '700 24px JetBrains Mono, monospace';
  ctx.fillText(_escapeCanvasText(data.quest ? `QUÊTE ${data.quest}` : 'CAPTURE UNIQUE'), 84, 520);

  // Player badge stays highly visible in the exported image.
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  roundRect(ctx, 770, 80, 226, 56, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 22px JetBrains Mono, monospace';
  ctx.fillText(`JOUEUR ${sharePseudo.toUpperCase()}`, 792, 115);

  const cardX = 84;
  const cardY = 586;
  const cardW = 912;
  const cardH = 520;
  const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  cardGrad.addColorStop(0, 'rgba(255,255,255,0.14)');
  cardGrad.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = cardGrad;
  roundRect(ctx, cardX, cardY, cardW, cardH, 42);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 42);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,61,138,0.14)';
  roundRect(ctx, 124, 626, 250, 52, 18);
  ctx.fill();
  ctx.fillStyle = '#ff6aa8';
  ctx.font = '800 20px JetBrains Mono, monospace';
  ctx.fillText(`CAPTURE DE ${sharePseudo.toUpperCase()}`, 144, 659);

  ctx.fillStyle = '#fff';
  ctx.font = '800 46px Space Grotesk, sans-serif';
  _wrapCanvasText(ctx, 'Partage ta capture et continue la chasse.', 760).forEach((line, index) => {
    ctx.fillText(line, 124, 742 + (index * 52));
  });

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '500 28px Space Grotesk, sans-serif';
  const inviteText = _wrapCanvasText(ctx, 'Un trésor unique a été capturé. Rejoins Urban 3D Quest pour retrouver les prochains.', 760);
  inviteText.forEach((line, index) => ctx.fillText(line, 124, 850 + (index * 38)));

  ctx.fillStyle = '#8cecff';
  ctx.font = '700 24px JetBrains Mono, monospace';
  ctx.fillText(_escapeCanvasText(data.shareUrl || location.origin + location.pathname), 124, 956);

  ctx.fillStyle = '#fff';
  ctx.font = '700 20px JetBrains Mono, monospace';
  ctx.fillText('Invite d’autres joueurs à se joindre à la chasse.', 124, 1034);

  return canvas;
}

async function shareUniqueCapture() {
  const data = window._uniqueCaptureShareData;
  if (!data) return;
  const canvas = _buildUniqueCaptureCanvas(data);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
  const shareUrl = data.shareUrl || location.origin + location.pathname;
  const shareText = `J'ai capturé "${data.label}" sur Urban 3D Quest. Rejoins la chasse : ${shareUrl}`;
  const file = blob ? new File([blob], `urban3dquest-${data.id}.png`, { type: 'image/png' }) : null;

  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        title: 'Urban 3D Quest — Flash capturé',
        text: shareText,
        files: [file]
      });
      _setShareButtonState('foundShareCaptureBtn', '✓ Image prête');
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Urban 3D Quest — Flash capturé',
        text: shareText,
        url: shareUrl
      });
      _setShareButtonState('foundShareCaptureBtn', '✓ Partage ouvert');
      return;
    } catch {
      // fall through
    }
  }

  if (blob && navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      _setShareButtonState('foundShareCaptureBtn', '✓ Image copiée');
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(shareText);
    _setShareButtonState('foundShareCaptureBtn', '✓ Lien copié');
  }
}

async function inviteFriendsFromCapture() {
  const data = window._uniqueCaptureShareData;
  if (!data) return;
  const shareUrl = data.shareUrl || location.origin + location.pathname;
  const text = `J'ai capturé un trésor unique sur Urban 3D Quest. Rejoins-moi ici : ${shareUrl}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Urban 3D Quest — Rejoins la chasse',
        text,
        url: shareUrl
      });
      _setShareButtonState('foundInviteBtn', '✓ Invitation ouverte');
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    _setShareButtonState('foundInviteBtn', '✓ Lien copié');
  }
}

function closeMoreMenu() {}
function showTabFromMore(name) { showTab(name, null); }

// ── Pause ────────────────────────────────────────────
function showPause() { document.getElementById('pauseScreen').classList.add('open'); }

// ── Carnet ───────────────────────────────────────────
async function loadCarnet() {
  const el = document.getElementById('carnetList');
  const countEl = document.getElementById('carnetCount');
  if (!myPseudo) {
    el.innerHTML = `<div class="cn-empty"><span class="cn-empty-icon">📖</span><span class="cn-empty-label">Connecte-toi pour voir ton carnet</span></div>`;
    countEl.textContent = '';
    return;
  }
  el.innerHTML = `<p style="color:var(--ink-3);text-align:center;padding:30px;font-family:var(--mono);font-size:0.78rem">⏳ Chargement…</p>`;
  try {
    const { data: evts, error } = await db.from('events')
      .select('treasure_id,treasure_type,duration_sec,created_at')
      .eq('pseudo', myPseudo)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!evts || evts.length === 0) {
      el.innerHTML = `<div class="cn-empty"><span class="cn-empty-icon">🌍</span><span class="cn-empty-label">Aucun polaroid trouvés pour l'instant</span></div>`;
      countEl.textContent = '';
      return;
    }
    countEl.textContent = `${evts.length} révélé${evts.length > 1 ? 's' : ''}`;
    // Build a quick lookup from treasures already loaded in memory
    const tMap = Object.fromEntries(treasures.map(t => [t.id, t]));
    el.innerHTML = evts.map(ev => {
      const t = tMap[ev.treasure_id];
      const label = t ? escHtml(tLabel(t)) : escHtml(ev.treasure_id);
      const isUnique = ev.treasure_type === 'unique';
      const typeLabel = isUnique ? 'Flash' : 'Quête';
      const typeClass = isUnique ? 'cn-unique' : 'cn-fixed';
      const date = new Date(ev.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      const durStr = ev.duration_sec ? `⏱ ${formatDuration(ev.duration_sec)}` : '';
      // Photo
      let photoHtml = '';
      if (t && t.photo_url) {
        const url = safeImgUrl(getPhotoUrls(t.photo_url)[0]);
        if (url) photoHtml = `<img class="cn-thumb" src="${escHtml(url)}" alt="" loading="lazy" onclick="openPhotoViewer('${jsSingleQuoted(url)}')" style="cursor:zoom-in">`;
      }
      if (!photoHtml) photoHtml = `<div class="cn-thumb-placeholder">${isUnique ? '⚡' : '📷'}</div>`;
      const hintHtml = t && t.hint ? `<div class="cn-hint">${escHtml(t.hint)}</div>` : '';
      return `<div class="cn-card ${typeClass}">
        ${photoHtml}
        <div class="cn-body">
          <div class="cn-type">${typeLabel}</div>
          <div class="cn-name">${label}</div>
          <div class="cn-meta"><span>${date}</span>${durStr ? `<span>${durStr}</span>` : ''}</div>
          ${hintHtml}
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px;font-size:0.85rem">⚠️ ${escHtml(err.message)}</p>`;
  }
}

// ── Offline detection ────────────────────────────────
function _setOfflineBanner(isOffline) {
  const el = document.getElementById('offlineBanner');
  if (el) el.classList.toggle('visible', isOffline);
}
window.addEventListener('online',  () => _setOfflineBanner(false));
window.addEventListener('offline', () => _setOfflineBanner(true));

let gameSyncChannel = null;
let _treasureRefreshTimer = null;
let _leaderboardRefreshTimer = null;
let _configRefreshInterval = null;

function scheduleTreasureRefresh(delayMs = 0) {
  if (_treasureRefreshTimer) clearTimeout(_treasureRefreshTimer);
  _treasureRefreshTimer = setTimeout(() => {
    _treasureRefreshTimer = null;
    loadTreasures();
  }, delayMs);
}

function scheduleLeaderboardRefresh(delayMs = 0) {
  if (_leaderboardRefreshTimer) clearTimeout(_leaderboardRefreshTimer);
  _leaderboardRefreshTimer = setTimeout(() => {
    _leaderboardRefreshTimer = null;
    loadLeaderboard();
  }, delayMs);
}

function _isTreasureInActiveScope(t) {
  if (!t) return false;
  if (!Array.isArray(activeQuests) || activeQuests.length === 0) return true;
  const quest = String(t.quest || '').trim();
  return !quest || activeQuests.includes(quest);
}

function applyTreasureRealtimePayload(payload) {
  if (!payload || !Array.isArray(treasures)) return false;
  const eventType = String(payload.eventType || '').toUpperCase();
  const newRow = payload.new || null;
  const oldRow = payload.old || null;
  const targetId = (newRow && newRow.id) || (oldRow && oldRow.id);
  if (!targetId) return false;

  const idx = treasures.findIndex(t => t.id === targetId);

  if (eventType === 'DELETE') {
    if (idx >= 0) treasures.splice(idx, 1);
  } else {
    if (!newRow || newRow.visible !== true || !_isTreasureInActiveScope(newRow)) {
      if (idx >= 0) treasures.splice(idx, 1);
    } else if (idx >= 0) {
      treasures[idx] = { ...treasures[idx], ...newRow };
    } else {
      treasures.push(newRow);
    }
  }

  const actualFixed = treasures.filter(t => t.type === 'fixed').length;
  if (actualFixed > 0) fixedTotal = actualFixed;

  renderMarkers();
  if (activeTab === 'explore') {
    updateRadar();
    updateNearestCard();
  }
  updateProgressBar();
  return true;
}

function ensureGameRealtimeSync() {
  if (gameSyncChannel) return gameSyncChannel;
  if (!window.supabase || !db || typeof db.channel !== 'function') return null;

  gameSyncChannel = db.channel('u3dq-game-sync');
  gameSyncChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
      scheduleLeaderboardRefresh(150);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'treasures' }, (payload) => {
      const applied = applyTreasureRealtimePayload(payload);
      if (!applied) scheduleTreasureRefresh(180);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, () => {
      scheduleTreasureRefresh(150);
      scheduleLeaderboardRefresh(250);
      if (activeTab === 'explore') updateRadar();
      if (activeTab === 'scores') loadLeaderboard();
    })
    .subscribe();

  return gameSyncChannel;
}

function startConfigRefreshPolling() {
  if (_configRefreshInterval) clearInterval(_configRefreshInterval);
  if (document.hidden) return;

  _configRefreshInterval = setInterval(async () => {
    if (!navigator.onLine) {
      _setOfflineBanner(true);
      return;
    }
    _setOfflineBanner(false);
    try {
      // Session guard: if another device logged in with same credentials, force re-login
      if (myPseudo && myToken) {
        const { data: sp } = await db.rpc('validate_player_session', { p_pseudo: myPseudo, p_session_token: myToken });
        if (!sp || !sp.valid) {
          localStorage.removeItem('u3dq_pseudo');
          localStorage.removeItem('u3dq_token');
          alert('⚠️ Ta session a été prise par un autre appareil. Reconnecte-toi.');
          location.reload();
          return;
        }
      }
      const { data: cfg } = await db.from('config').select('key,value');
      if (cfg) {
        const c = Object.fromEntries(cfg.map(r => [r.key, r.value]));
        if (c.gameActive === 'false') showPause();
        else document.getElementById('pauseScreen').classList.remove('open');
        if (c.proximityRadius) proximityR = Number(c.proximityRadius);
      }
      scheduleTreasureRefresh(0);
      if (activeTab === 'scores') scheduleLeaderboardRefresh(0);
    } catch {
      _setOfflineBanner(true);
    }
  }, 120000);
}

// ── Periodic refresh (treasures + config) ────────────
startConfigRefreshPolling();

// ── Nearest list ─────────────────────────────────────
let _nearestTreasure = null;
function updateNearestCard() {
  const el = document.getElementById('nearestList');
  if (playerLat === null) { el.style.display = 'none'; return; }
  const isUniqueMode = activeGameMode === 'unique';
  if (isUniqueMode) { el.style.display = 'none'; return; }
  const pool = treasures
    .filter(t => t.type === (isUniqueMode ? 'unique' : 'fixed'))
    .filter(t => t.lat && t.lng)
    .filter(t => !(t.found_by && t.found_by.split(',').includes(myPseudo)))
    .filter(t => !isUniqueMode || !(t.found_by && t.found_by.length > 0))
    .map(t => ({ ...t, _dist: haversine(playerLat, playerLng, t.lat, t.lng) }))
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 4);

  if (!pool.length) { el.style.display = 'none'; return; }

  _nearestTreasure = pool[0];
  const count = pool.length;
  const header = `${count} POLAROID${count > 1 ? 'S' : ''} LES PLUS PROCHES`;

  el.style.display = 'flex';
  el.innerHTML = `<div class="nl-header">${header}</div>` +
    pool.map((t, idx) => {
      const color = isUniqueMode ? '#db2777' : ARROW_PALETTE[idx % ARROW_PALETTE.length];
      const dist = t._dist < 1000 ? Math.round(t._dist) + '\u202fm' : (t._dist / 1000).toFixed(1) + '\u202fkm';
      const name = tLabel(t);
      const shortName = name.length > 20 ? name.slice(0, 19) + '\u2026' : name;
      const safeId = t.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<div class="nl-item" onclick="openTreasureSheet(treasures.find(x=>x.id==='${safeId}'))">
        <div class="nl-dot" style="background:${color};box-shadow:0 0 6px ${color}55"></div>
        <div class="nl-name">${escHtml(shortName)}</div>
        <div class="nl-dist">${escHtml(dist)}</div>
      </div>`;
    }).join('');
}
function onNearestCardClick() {
  if (_nearestTreasure) openTreasureSheet(_nearestTreasure);
}

function revealFixedClueFromSheet(id) {
  if (!id) return;
  revealedFixedClues.add(id);
  if (myPseudo) localStorage.setItem(`u3dq_clues_${myPseudo}`, JSON.stringify([...revealedFixedClues]));
  const t = treasures.find(x => x.id === id);
  if (t) openTreasureSheet(t);
}

// ── Treasure sheet ───────────────────────────────────
function openTreasureSheet(t) {
  const isMine   = t.found_by && t.found_by.split(',').includes(myPseudo);
  const isTaken  = t.type === 'unique' && t.found_by && t.found_by.length > 0;
  const typeLabel = t.type === 'fixed' ? 'Polaroid · Quete' : 'Polaroid · Flash';
  const isFixedLocked = t.type === 'fixed' && !isMine;
  const urls     = getPhotoUrls(t.photo_url);
  const safeUrls = urls.map(safeImgUrl).filter(Boolean);
  const distM = (playerLat !== null && t.lat && t.lng)
    ? haversine(playerLat, playerLng, t.lat, t.lng)
    : null;
  const isNearForClue = isFixedLocked && distM !== null && distM <= (proximityR * 2);
  const clueUnlocked = !isFixedLocked || revealedFixedClues.has(t.id);
  const canShowFixedMedia = !isFixedLocked || clueUnlocked;
  const photoHtml = (canShowFixedMedia ? safeUrls : []).map(u =>
    `<img src="${escHtml(u)}" onclick="openPhotoViewer('${jsSingleQuoted(u)}')" class="ts-photo">`
  ).join('');
  const badge = isMine ? '<span class="ts-badge ts-badge-found">✓ Révélé</span>'
    : isTaken ? '<span class="ts-badge ts-badge-taken">🔒 Flash pris</span>'
    : '<span class="ts-badge ts-badge-open">· À révéler</span>';
  const cta = (!isMine && !isTaken && t.type === 'unique' && t.lat && t.lng)
    ? `<button class="ts-cta" onclick="recenterOn(${t.lat},${t.lng})">M'y emmener →</button>` : '';
  const clueCta = (isFixedLocked && !clueUnlocked)
    ? (isNearForClue
        ? `<button class="ts-cta" onclick="revealFixedClueFromSheet('${jsSingleQuoted(t.id)}')">Voir la photo + indice</button>`
        : `<div class="ts-hint">📍 Approche-toi encore pour débloquer la photo et l'indice.</div>`)
    : '';
  const dist = distM !== null
    ? (() => { const d = distM; return d < 1000 ? Math.round(d) + ' m' : (d/1000).toFixed(1) + ' km'; })()
    : '';
  document.getElementById('tsBody').innerHTML = `
    <div class="ts-top-row">${badge}<span class="ts-type">${escHtml(typeLabel)}</span></div>
    ${photoHtml ? `<div class="ts-photos">${photoHtml}</div>` : ''}
    <div class="ts-name">${escHtml(tLabel(t))}</div>
    ${dist ? `<div class="ts-dist">${escHtml(dist)} de moi</div>` : ''}
    ${(t.hint && canShowFixedMedia) ? `<div class="ts-hint">💡 ${escHtml(t.hint)}</div>` : ''}
    ${clueCta}
    ${cta}
  `;
  document.getElementById('treasureSheet').classList.add('open');
}
function closeTreasureSheet() {
  document.getElementById('treasureSheet').classList.remove('open');
}

// ── Recenter map ─────────────────────────────────────
function recenterOn(lat, lng) {
  closeTreasureSheet();
  const navBtn = document.getElementById(activeGameMode === 'fixed' ? 'navSerie' : 'navDeclic');
  showTab('explore', navBtn);
  if (gameMap) gameMap.setView([lat, lng], 16, { animate: true });
}

// ── Balises panel ────────────────────────────────────
function loadBalises() {
  const fixed = treasures.filter(t => t.type === 'fixed');
  const totalFound = fixed.filter(t => t.found_by && t.found_by.split(',').includes(myPseudo)).length;
  const countEl = document.getElementById('balisesCount');
  if (countEl) countEl.textContent = totalFound + ' / ' + fixed.length + ' révélés';

  const list = document.getElementById('balisList');
  if (!fixed.length) { list.innerHTML = '<p class="bl-empty">Aucune balise</p>'; return; }

  // Group by quest field
  const groups = {};
  fixed.forEach(t => {
    const q = t.quest || '';
    if (!groups[q]) groups[q] = [];
    groups[q].push(t);
  });

  const questNames = Object.keys(groups).sort((a, b) => {
    if (!a && b) return 1;
    if (a && !b) return -1;
    return a.localeCompare(b);
  });

  const showGroups = questNames.length > 1 || (questNames.length === 1 && questNames[0] !== '');

  let html = '';
  questNames.forEach(questName => {
    const items = groups[questName]
      .map(t => ({ ...t, _dist: playerLat !== null ? haversine(playerLat, playerLng, t.lat, t.lng) : Infinity }))
      .sort((a, b) => a._dist - b._dist);

    const qFound = items.filter(t => t.found_by && t.found_by.split(',').includes(myPseudo)).length;
    const qTotal = items.length;
    const progClass = qFound >= qTotal ? 'done' : qFound > 0 ? 'started' : '';

    if (showGroups) {
      const label = questName || 'Sans quête';
      html += `<div class="bl-section">${escHtml(label)}<span class="bl-quest-prog ${progClass}">${qFound}/${qTotal}</span></div>`;
    }

    items.forEach((t, i) => {
      const isMine = t.found_by && t.found_by.split(',').includes(myPseudo);
      const distStr = t._dist === Infinity ? '' : t._dist < 1000 ? Math.round(t._dist) + 'm' : (t._dist / 1000).toFixed(1) + 'km';
      const bg = isMine ? '#22c55e' : '#6b7280';
      const tid = escHtml(t.id);
      html += `<div class="bl-item${isMine ? ' found' : ''}" onclick="openTreasureSheet(treasures.find(x=>x.id==='${tid}'))">
        <div class="bl-num" style="background:${bg}">${isMine ? '✓' : i + 1}</div>
        <div class="bl-info">
          <div class="bl-item-name">${escHtml(tLabel(t))}</div>
          <div class="bl-item-sub">${distStr ? escHtml(distStr) + ' · ' : ''}${isMine ? '✓ Révélé' : 'À révéler'}</div>
        </div>
        <div class="bl-arr">${isMine ? '✓' : '→'}</div>
      </div>`;
    });
  });

  list.innerHTML = html;
}

// ── Moi panel ────────────────────────────────────────
async function loadMoi() {
  const el = document.getElementById('moiContent');
  const actionsEl = document.getElementById('moiActions');
  if (!el) return;
  const fixed = treasures.filter(t => t.type === 'fixed');
  const unique = treasures.filter(t => t.type === 'unique');
  const myFixed = fixed.filter(t => t.found_by && t.found_by.split(',').includes(myPseudo)).length;
  const myUnique = unique.filter(t => t.found_by && t.found_by.split(',').includes(myPseudo)).length;

  // Fetch rank from leaderboard
  let rank = '—';
  if (myPseudo) {
    const { data } = await db.from('players').select('pseudo,score').order('score', { ascending: true });
    if (data) {
      const idx = data.findIndex(p => p.pseudo === myPseudo);
      if (idx >= 0) rank = '#' + (idx + 1);
    }
  }

  const pseudo = myPseudo || 'Invité';
  const grad = pseudoGradient(pseudo);
  el.innerHTML = `
    <div class="moi-avatar" style="background:${grad}">${escHtml(pseudo.charAt(0))}</div>
    <div class="moi-pseudo">${escHtml(pseudo)}</div>
    <div class="moi-grid">
      <div class="moi-tile"><div class="moi-tile-val">${myFixed}</div><div class="moi-tile-lbl">Quête</div></div>
      <div class="moi-tile"><div class="moi-tile-val">${myFixed + myUnique}</div><div class="moi-tile-lbl">Total</div></div>
      <div class="moi-tile"><div class="moi-tile-val">${rank}</div><div class="moi-tile-lbl">Classement</div></div>
    </div>
  `;

  if (actionsEl) {
    actionsEl.innerHTML = myPseudo ? `
      <label class="moi-toggle" for="hapticToggleInput">
        <span class="moi-toggle-copy">
          <strong>Haptic buzz</strong>
          <small>Vibrations de feedback</small>
        </span>
        <input id="hapticToggleInput" type="checkbox" ${hapticEnabled ? 'checked' : ''}>
        <span class="moi-toggle-track" aria-hidden="true"></span>
      </label>
      <button class="moi-calib" id="calibBtn" onclick="resetCompassCalibration()">🧭 Recalibrer le compas</button>
      <button class="moi-logout" id="logoutBtn">Se déconnecter</button>
    ` : '';
  }

  const hapticToggle = document.getElementById('hapticToggleInput');
  if (hapticToggle) {
    hapticToggle.addEventListener('change', () => {
      hapticEnabled = !!hapticToggle.checked;
      localStorage.setItem('u3dq_haptic_enabled', hapticEnabled ? '1' : '0');
      if (hapticEnabled) haptic([40]);
    });
  }

  // addEventListener garanti même si le bouton est injecté dynamiquement
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logoutPlayer);
}
