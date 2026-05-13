// ── Leaderboard, tabs, panels ───────────────────────
async function loadLeaderboard() {
  const el = document.getElementById('lbList');
  el.innerHTML = `<p style="color:var(--ink-3);text-align:center;padding:30px">⏳ Chargement…</p>`;
  let evRes, cfgRes;
  try {
    [evRes, cfgRes] = await Promise.all([
      db.from('events').select('pseudo,treasure_id,treasure_type,duration_sec,created_at').order('created_at', { ascending: true }),
      db.from('config').select('key,value')
    ]);
  } catch(netErr) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px">⚠️ Erreur réseau : ${escHtml(netErr.message)}</p>`;
    return;
  }
  if (evRes.error) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px">⚠️ Erreur Supabase : ${escHtml(evRes.error.message)}</p>`;
    return;
  }
  try {
  const events = evRes.data || [];
  const cfg    = Object.fromEntries((cfgRes.data || []).map(r => [r.key, r.value]));
  const rewardMsg = (activeQuests || []).map(q => cfg['rewardMessage_'+q]).find(m => m) || cfg['rewardMessage'] || '';
  const safeRewardMsg = escHtml(rewardMsg);
  const totalFixed = parseInt(cfg.fixedTotal || fixedTotal || 0);

  // Filter events by active quests (multi-instance isolation)
  const _activeQuestIds = (activeQuests && activeQuests.length > 0 && treasures.length > 0)
    ? new Set(treasures.filter(t => activeQuests.includes(t.quest)).map(t => t.id))
    : null;
  const filteredEvents = _activeQuestIds ? events.filter(e => _activeQuestIds.has(e.treasure_id)) : events;

  // Group events by player
  const players = {};
  filteredEvents.forEach(e => {
    if (!e.pseudo) return;
    if (!players[e.pseudo]) players[e.pseudo] = { fixedEvents: [], uniqueEvents: [] };
    if (e.treasure_type === 'fixed')  players[e.pseudo].fixedEvents.push(e);
    if (e.treasure_type === 'unique') players[e.pseudo].uniqueEvents.push(e);
  });

  // Build rows — only players with at least 1 find
  const rows = Object.entries(players)
    .filter(([, d]) => d.fixedEvents.length > 0 || d.uniqueEvents.length > 0)
    .map(([pseudo, d]) => {
    const fixedCount = d.fixedEvents.length;
    // Total time = last fixed timestamp - first fixed timestamp (only shown when all fixed done)
    let fixedDuration = null;
    if (d.fixedEvents.length >= 2) {
      const times = d.fixedEvents.map(e => new Date(e.created_at).getTime()).sort((a,b) => a-b);
      fixedDuration = Math.round((times[times.length-1] - times[0]) / 1000);
    } else if (d.fixedEvents.length === 1) {
      fixedDuration = 0;
    }
    const allFixed = fixedCount >= totalFixed && totalFixed > 0;
    return { pseudo, fixedCount, fixedDuration, uniqueEvents: d.uniqueEvents, allFixed };
  });

  // Sort: most fixed desc, then shortest duration asc, then most uniques desc
  rows.sort((a, b) => {
    if (b.fixedCount !== a.fixedCount) return b.fixedCount - a.fixedCount;
    if (a.fixedDuration !== null && b.fixedDuration !== null) return a.fixedDuration - b.fixedDuration;
    if (a.fixedDuration !== null) return -1;
    if (b.fixedDuration !== null) return 1;
    return b.uniqueEvents.length - a.uniqueEvents.length;
  });

  const medals = ['🥇','🥈','🥉'];
  const topClass = ['lb-top1','lb-top2','lb-top3'];

  // ── My personal card ──
  const myData = rows.find(p => p.pseudo === myPseudo);
  const myRankNum = myData ? rows.indexOf(myData) + 1 : null;
  const myCardEl = document.getElementById('myCard');
  myCardEl.style.display = myPseudo ? 'block' : 'none';
  if (myData) {
    const pct = totalFixed > 0 ? Math.round((myData.fixedCount / totalFixed) * 100) : 0;
    const rankLabel = myRankNum <= 3 ? medals[myRankNum-1] : `#${myRankNum}`;
    const fillClass = myData.allFixed ? 'my-card-done' : 'my-card-fill';
    const timeTxt = myData.allFixed && myData.fixedDuration !== null ? `<span style="display:inline-flex;align-items:center;gap:5px">${uiIcon('clock', 'success')}${formatDuration(myData.fixedDuration)}</span>` : '';
    const uniqTxt = myData.uniqueEvents.length ? `<span style="display:inline-flex;align-items:center;gap:5px">${uiIcon('flash', 'flash')}${myData.uniqueEvents.length} flash${myData.uniqueEvents.length>1?'s':''}</span>` : '';
    const doneTxt = myData.allFixed ? `<span style="color:#4ade80;font-size:0.78rem;font-weight:700;display:inline-flex;align-items:center;gap:5px">${uiIcon('check', 'success')}Toutes les balises fixes</span>` : '';
    const rewardTxt = myData.allFixed && rewardMsg ? `<div style="margin-top:8px;font-size:0.75rem;color:#4ade80;padding:6px 10px;background:#0d2218;border-radius:8px;border:1px solid #16a34a;display:flex;align-items:center;gap:6px">${uiIcon('gps', 'success')}${safeRewardMsg}</div>` : '';
    myCardEl.innerHTML = `<div class="my-card">
      <div class="my-card-rank">${rankLabel}</div>
      <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
      <div class="my-card-sub">Ma progression</div>
      <div class="my-card-stats">
        <strong>${uiIcon('camera', 'teal')}${myData.fixedCount}${totalFixed?'/'+totalFixed:''}</strong>
        ${timeTxt ? `<span>${timeTxt}</span>` : ''}
        ${uniqTxt ? `<span>${uniqTxt}</span>` : ''}
        ${doneTxt}
      </div>
      ${totalFixed > 0 ? `<div class="my-card-bar"><div class="${fillClass}" style="width:${pct}%"></div></div>` : ''}
      ${rewardTxt}
    </div>`;
  } else {
    myCardEl.innerHTML = `<div class="my-card" style="text-align:center;padding:14px">
      <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
      <div class="my-card-sub" style="margin-top:4px">Tu n'as pas encore révélé de polaroid — en avant !</div>
    </div>`;
  }


  let html = '';
  if (!rows.length) {
    html = '<p style="color:#475569;text-align:center;padding:50px 20px">Pas encore de scores<br><span style="font-size:0.8rem">Sois le premier à trouver un trésor !</span></p>';
  } else {
    html += `<div class="lb-divider">${uiIcon('trophy', 'warn')}<span>Classement · ${rows.length} joueur${rows.length > 1 ? 's' : ''}</span></div>`;

    rows.forEach((p, i) => {
      // If > 10 players: show top 10 + separator + my row
      const myRankInList = rows.findIndex(r => r.pseudo === myPseudo);
      if (i >= 10 && i !== myRankInList) return;
      if (i === 10 && myRankInList >= 10) html += `<div class="lb-you-sep">· · ·</div>`;

      const isMe = p.pseudo === myPseudo;
      const rankIcon = i < 3 ? medals[i] : `<span style="font-size:0.85rem;color:#475569;font-weight:700">${i+1}</span>`;
      const extraClass = i < 3 ? topClass[i] : '';

      // Progress bar
      const pct = totalFixed > 0 ? Math.round((p.fixedCount / totalFixed) * 100) : 0;
      const barColor = p.allFixed ? '#4ade80' : i === 0 ? '#fbbf24' : '#3b82f6';

      // Time badge (only if all fixed done)
      const timeBadge = p.allFixed && p.fixedDuration !== null
        ? `<span class="lb-time">${uiIcon('clock', 'success')}<span>${formatDuration(p.fixedDuration)}</span></span>`
        : '';

      // Unique badge
      const uniqBadge = p.uniqueEvents.length
        ? `<span class="lb-badge">${uiIcon('flash', 'flash')}<span>×${p.uniqueEvents.length}</span></span>`
        : '';

      // All done badge
      const doneBadge = p.allFixed
        ? `<span class="lb-badge lb-badge-done">${uiIcon('check', 'success')}<span>Quête complète</span></span>`
        : '';

      // Reward message (only for the player themselves if all done)
      const rewardLine = p.allFixed && rewardMsg
        ? `<div style="margin-top:5px;font-size:0.75rem;color:#4ade80;padding:5px 8px;background:#0d2218;border-radius:6px;border:1px solid #16a34a;display:flex;align-items:center;gap:6px">${uiIcon('gps', 'success')}${safeRewardMsg}</div>`
        : '';

      html += `<div class="lb-row${isMe ? ' lb-me' : ''}${extraClass ? ' '+extraClass : ''}">
        <div class="lb-rank">${rankIcon}</div>
        <div class="lb-avatar" style="background:${pseudoGradient(p.pseudo)}">${escHtml(p.pseudo[0].toUpperCase())}</div>
        <div class="lb-body">
          <div class="lb-name">${escHtml(p.pseudo)}</div>
          <div class="lb-score">
            <strong>${uiIcon('camera', 'teal')}${p.fixedCount}${totalFixed ? '/'+totalFixed : ''}</strong>
            ${timeBadge}${uniqBadge}${doneBadge}
          </div>
          ${totalFixed > 0 ? `<div class="lb-pbar"><div class="lb-pfill" style="width:${pct}%;background:${barColor}"></div></div>` : ''}
          ${rewardLine}
        </div>
      </div>`;
    });
  }

  document.getElementById('lbList').innerHTML = html;
  // Flash-only leaderboard
  const flashRows = Object.entries(players)
    .map(([pseudo, d]) => ({ pseudo, flashCount: d.uniqueEvents.length }))
    .filter(r => r.flashCount > 0)
    .sort((a, b) => b.flashCount - a.flashCount);

  let flashHtml = '';
  if (!flashRows.length) {
    flashHtml = '<p style="color:#475569;text-align:center;padding:50px 20px">Aucun score Flash pour le moment</p>';
  } else {
    flashHtml += `<div class="lb-divider">${uiIcon('flash', 'flash')}<span>Classement Flash · ${flashRows.length} joueur${flashRows.length > 1 ? 's' : ''}</span></div>`;
    flashRows.forEach((p, i) => {
      const rankIcon = i < 3 ? medals[i] : `<span style="font-size:0.85rem;color:#475569;font-weight:700">${i+1}</span>`;
      const isMe = p.pseudo === myPseudo;
      flashHtml += `<div class="lb-row${isMe ? ' lb-me' : ''}">
        <div class="lb-rank">${rankIcon}</div>
        <div class="lb-avatar" style="background:${pseudoGradient(p.pseudo)}">${escHtml(p.pseudo[0].toUpperCase())}</div>
        <div class="lb-body">
          <div class="lb-name">${escHtml(p.pseudo)}</div>
          <div class="lb-score"><strong>${uiIcon('flash', 'flash')}${p.flashCount} flash${p.flashCount > 1 ? 's' : ''}</strong></div>
        </div>
      </div>`;
    });
  }
  document.getElementById('lbFlashList').innerHTML = flashHtml;
  switchLbTab(_lbActiveTab);
  document.getElementById('lbRefresh').textContent = '↻ ' + new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch(renderErr) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px">⚠️ Erreur rendu : ${escHtml(renderErr.message)}</p>`;
    console.error('loadLeaderboard error:', renderErr);
  }
}

function startLbPolling() {
  loadLeaderboard();
  loadTreasures();
  if (lbInterval) clearInterval(lbInterval);
  lbInterval = setInterval(() => { loadLeaderboard(); loadTreasures(); }, 10000);
}

let _lbActiveTab = 'quete';
function switchLbTab(tab) {
  _lbActiveTab = tab;
  document.getElementById('lbTabQuete').classList.toggle('active', tab === 'quete');
  document.getElementById('lbTabFlash').classList.toggle('active', tab === 'flash');
  document.getElementById('lbList').style.display     = tab === 'quete' ? 'block' : 'none';
  document.getElementById('lbFlashList').style.display = tab === 'flash' ? 'block' : 'none';
  document.getElementById('myCard').style.display = 'block';
}

