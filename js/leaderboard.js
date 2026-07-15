// ── Leaderboard global ───────────────────────────────
let _lbShareData = null;

const GLOBAL_FIXED_WEIGHT = 1;
const GLOBAL_FLASH_WEIGHT = 2;

function _lbIcon(name, className) {
  if (typeof uiIcon === 'function') return uiIcon(name, className);
  const fallback = { camera: '📷', flash: '⚡', trophy: '🏆', clock: '⏱', score: '⭐' };
  return `<span class="ui-icon ${className || ''}" aria-hidden="true">${fallback[name] || ''}</span>`;
}

async function _fetchLeaderboardData() {
  let evQuery = db.from('events')
    .select('pseudo,treasure_id,treasure_type,duration_sec,created_at')
    .order('created_at', { ascending: true });
  if (gameStart) evQuery = evQuery.gte('created_at', gameStart.toISOString());
  const [evRes, cfgRes] = await Promise.all([
    evQuery,
    db.from('config').select('key,value')
  ]);
  if (evRes.error) throw new Error('Supabase : ' + evRes.error.message);
  return {
    events: evRes.data || [],
    cfg: Object.fromEntries((cfgRes.data || []).map(r => [r.key, r.value]))
  };
}

function _computeLeaderboardScores(events, cfg) {
  const totalFixed = parseInt(cfg.fixedTotal || fixedTotal || 0);

  const activeQuestIds = (activeQuests && activeQuests.length > 0 && treasures.length > 0)
    ? new Set(treasures.filter(t => activeQuests.includes(t.quest)).map(t => t.id))
    : null;
  const filteredEvents = activeQuestIds ? events.filter(e => activeQuestIds.has(e.treasure_id)) : events;

  const players = {};
  filteredEvents.forEach(e => {
    if (!e.pseudo) return;
    if (!players[e.pseudo]) players[e.pseudo] = { fixedEvents: [], flashEvents: [] };
    if (e.treasure_type === 'fixed') players[e.pseudo].fixedEvents.push(e);
    if (!FIXED_ONLY_EDITION && e.treasure_type === 'unique') players[e.pseudo].flashEvents.push(e);
  });

  const rows = Object.entries(players)
    .map(([pseudo, d]) => {
      const fixedCount = d.fixedEvents.length;
      const flashCount = d.flashEvents.length;
      const allFixed = totalFixed > 0 && fixedCount >= totalFixed;
      let fixedDuration = null;
      if (d.fixedEvents.length >= 2) {
        const times = d.fixedEvents.map(e => new Date(e.created_at).getTime()).sort((a, b) => a - b);
        fixedDuration = Math.max(0, Math.round((times[times.length - 1] - times[0]) / 1000));
      } else if (d.fixedEvents.length === 1) {
        fixedDuration = 0;
      }
      const globalScore = FIXED_ONLY_EDITION
        ? fixedCount * GLOBAL_FIXED_WEIGHT
        : fixedCount * GLOBAL_FIXED_WEIGHT + flashCount * GLOBAL_FLASH_WEIGHT;
      return { pseudo, fixedCount, flashCount, fixedDuration, globalScore, allFixed };
    })
    .filter(r => r.fixedCount > 0 || (!FIXED_ONLY_EDITION && r.flashCount > 0));

  rows.sort((a, b) => {
    if (b.globalScore !== a.globalScore) return b.globalScore - a.globalScore;
    if (!FIXED_ONLY_EDITION && b.flashCount !== a.flashCount) return b.flashCount - a.flashCount;
    if (b.fixedCount !== a.fixedCount) return b.fixedCount - a.fixedCount;
    if (a.fixedDuration !== null && b.fixedDuration !== null) return a.fixedDuration - b.fixedDuration;
    if (a.fixedDuration !== null) return -1;
    if (b.fixedDuration !== null) return 1;
    return a.pseudo.localeCompare(b.pseudo, 'fr', { sensitivity: 'base' });
  });

  const myData = rows.find(p => p.pseudo === myPseudo) || null;
  const myRankNum = myData ? rows.indexOf(myData) + 1 : null;
  return { rows, totalFixed, myData, myRankNum };
}

function _renderLeaderboard({ rows, totalFixed, myData, myRankNum }) {
  const medals = ['🥇', '🥈', '🥉'];

  _lbShareData = {
    hasData: !!myData,
    pseudo: myPseudo || '',
    rank: myRankNum || null,
    totalPlayers: rows.length,
    fixedCount: myData ? myData.fixedCount : 0,
    totalFixed: totalFixed || 0,
    flashCount: myData ? myData.flashCount : 0,
    fixedDuration: myData ? myData.fixedDuration : null,
    allFixed: myData ? !!myData.allFixed : false,
    globalScore: myData ? myData.globalScore : 0
  };

  const myCardEl = document.getElementById('myCard');
  myCardEl.style.display = myPseudo ? 'block' : 'none';
  if (myData) {
    const rankLabel = myRankNum <= 3 ? medals[myRankNum - 1] : `#${myRankNum}`;
    const fixedTxt = totalFixed > 0 ? `${myData.fixedCount}/${totalFixed}` : `${myData.fixedCount}`;
    const timeTxt = myData.fixedDuration !== null ? formatDuration(myData.fixedDuration) : '—';
    myCardEl.innerHTML = `<div class="my-card">
      <div class="my-card-rank">${rankLabel}</div>
      <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
      <div class="my-card-sub">Classement global</div>
      <div class="my-card-stats">
        <strong>${_lbIcon('score', 'warn')}${myData.globalScore}</strong>
        <span>${_lbIcon('camera', 'teal')}${fixedTxt}</span>
        ${FIXED_ONLY_EDITION ? '' : `<span>${_lbIcon('flash', 'flash')}${myData.flashCount}</span>`}
        <span>${_lbIcon('clock', 'success')}${timeTxt}</span>
      </div>
      <button class="btn-share" id="scoreShareBtn" style="margin-top:10px;padding:11px 12px;font-size:0.88rem" onclick="shareScoreResult()">📤 Partager mon score</button>
    </div>`;
  } else {
    myCardEl.innerHTML = `<div class="my-card" style="text-align:center;padding:14px">
      <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
      <div class="my-card-sub" style="margin-top:4px">Pas encore de score global. Lance ta chasse !</div>
      <button class="btn-share" id="scoreShareBtn" style="margin-top:10px;padding:11px 12px;font-size:0.88rem" onclick="shareScoreResult()">📤 Inviter mes amis</button>
    </div>`;
  }

  let html = '';
  if (!rows.length) {
    html = '<p style="color:#475569;text-align:center;padding:50px 20px">Pas encore de scores<br><span style="font-size:0.8rem">Sois le premier à marquer des points !</span></p>';
  } else {
    html += `<div class="lb-divider">${_lbIcon('trophy', 'warn')}<span>Classement global · ${rows.length} joueur${rows.length > 1 ? 's' : ''}</span></div>`;
    const myRankInList = rows.findIndex(r => r.pseudo === myPseudo);
    rows.forEach((p, i) => {
      if (i >= 12 && i !== myRankInList) return;
      if (i === 12 && myRankInList >= 12) html += `<div class="lb-you-sep">· · ·</div>`;

      const isMe = p.pseudo === myPseudo;
      const rankIcon = i < 3 ? medals[i] : `<span style="font-size:0.85rem;color:#475569;font-weight:700">${i + 1}</span>`;
      const fixedTxt = totalFixed > 0 ? `${p.fixedCount}/${totalFixed}` : `${p.fixedCount}`;
      const timeTxt = p.fixedDuration !== null ? formatDuration(p.fixedDuration) : '—';

      html += `<div class="lb-row${isMe ? ' lb-me' : ''}">
        <div class="lb-rank">${rankIcon}</div>
        <div class="lb-avatar" style="background:${pseudoGradient(p.pseudo)}">${escHtml(p.pseudo[0].toUpperCase())}</div>
        <div class="lb-body">
          <div class="lb-name">${escHtml(p.pseudo)}</div>
          <div class="lb-score">
            <strong>${_lbIcon('score', 'warn')}${p.globalScore}</strong>
            <span>${_lbIcon('camera', 'teal')}${fixedTxt}</span>
            ${FIXED_ONLY_EDITION ? '' : `<span>${_lbIcon('flash', 'flash')}${p.flashCount}</span>`}
            <span>${_lbIcon('clock', 'success')}${timeTxt}</span>
          </div>
        </div>
      </div>`;
    });
  }

  const lbList = document.getElementById('lbList');
  if (lbList.innerHTML !== html) lbList.innerHTML = html;
  lbList.dataset.loaded = '1';
  document.getElementById('lbRefresh').textContent = '↻ ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function loadLeaderboard() {
  const el = document.getElementById('lbList');
  if (egressEmergencyMode) {
    const myCardEl = document.getElementById('myCard');
    if (myCardEl) {
      myCardEl.style.display = myPseudo ? 'block' : 'none';
      if (myPseudo) {
        myCardEl.innerHTML = `<div class="my-card" style="text-align:center;padding:14px">
          <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
          <div class="my-card-sub" style="margin-top:4px">Classement temporairement en pause (mode egress).</div>
        </div>`;
      }
    }
    el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:40px">⏸ Classement temporairement désactivé pour réduire l\'egress.</p>';
    const rf = document.getElementById('lbRefresh');
    if (rf) rf.textContent = '↻ mode egress';
    return;
  }
  if (!el.dataset.loaded) el.innerHTML = `<p style="color:var(--ink-3);text-align:center;padding:30px">⏳ Chargement…</p>`;
  try {
    const data = await _fetchLeaderboardData();
    const computed = _computeLeaderboardScores(data.events, data.cfg);
    _renderLeaderboard(computed);
  } catch (err) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px">⚠️ ${escHtml(err.message)}</p>`;
    console.error('loadLeaderboard error:', err);
  }
}

function startLbPolling() {
  if (lbInterval) clearInterval(lbInterval);
  if (activeTab !== 'scores') return;
  if (egressEmergencyMode) {
    loadLeaderboard();
    return;
  }
  loadLeaderboard();
  lbInterval = setInterval(() => { loadLeaderboard(); }, 120000);
}

