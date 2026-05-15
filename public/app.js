const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let STATE = { players: [], groups: [], pairs: [], matches: [], standings: {} };

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function refresh() {
  STATE = await api('GET', '/api/state');
  renderPlayers();
  renderGroups();
  renderMatches();
  renderStandings();
}

function setLockedUI() {
  const locked = STATE.groups.length > 0;
  $('#register-locked').classList.toggle('hidden', !locked);
  for (const el of $$('#tab-register input, #tab-register button:not(.tab)')) {
    el.disabled = locked;
  }
}

function renderPlayers() {
  $('#player-count').textContent = STATE.players.length;
  const tbody = $('#players-table tbody');
  tbody.innerHTML = '';
  STATE.players
    .slice()
    .sort((a, b) => b.level - a.level)
    .forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.level}</td>
        <td><button class="danger" data-del="${p.id}">移除</button></td>`;
      tbody.appendChild(tr);
    });
  tbody.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`移除此選手？`)) return;
      try {
        await api('DELETE', `/api/players/${btn.dataset.del}`);
        await refresh();
      } catch (e) { alert(e.message); }
    });
  });
  setLockedUI();
}

function renderGroups() {
  const view = $('#groups-view');
  view.innerHTML = '';
  if (!STATE.groups.length) {
    view.innerHTML = '<p class="muted">尚未執行分組。</p>';
    return;
  }
  const playerById = Object.fromEntries(STATE.players.map(p => [p.id, p]));
  for (const g of STATE.groups) {
    const groupPairs = STATE.pairs.filter(p => p.groupId === g.groupId);
    const groupNum = g.groupId.replace('g', '');
    const card = document.createElement('div');
    card.className = 'group-card';
    const memberLine = g.playerIds
      .map(id => playerById[id])
      .filter(Boolean)
      .map(p => `${p.name}(${p.level})`)
      .join('、');
    const pairsHtml = groupPairs.map((pair, i) => {
      const names = pair.playerIds.map(id => playerById[id]?.name || id).join(' & ');
      return `<span class="pair-chip">配對 ${i + 1}：${escapeHtml(names)}</span>`;
    }).join('');
    card.innerHTML = `
      <h3>分組 ${groupNum}</h3>
      <p class="muted">成員：${escapeHtml(memberLine)}</p>
      <div class="pair-list">${pairsHtml}</div>`;
    view.appendChild(card);
  }
}

function renderMatches() {
  const view = $('#matches-view');
  view.innerHTML = '';
  if (!STATE.matches.length) {
    view.innerHTML = '<p class="muted">尚未產生賽程。</p>';
    return;
  }
  const playerById = Object.fromEntries(STATE.players.map(p => [p.id, p]));
  const pairById = Object.fromEntries(STATE.pairs.map(p => [p.pairId, p]));
  const pairLabel = (pid) => {
    const pair = pairById[pid];
    if (!pair) return pid;
    return pair.playerIds.map(id => playerById[id]?.name || id).join(' & ');
  };

  for (const g of STATE.groups) {
    const groupMatches = STATE.matches.filter(m => m.groupId === g.groupId);
    if (!groupMatches.length) continue;
    const card = document.createElement('div');
    card.className = 'group-card';
    const groupNum = g.groupId.replace('g', '');
    card.innerHTML = `<h3>分組 ${groupNum} 賽程</h3>`;
    for (const m of groupMatches) {
      const row = document.createElement('div');
      row.className = 'match-row';
      const done = m.score1 !== null && m.score2 !== null;
      row.innerHTML = `
        <div>${escapeHtml(pairLabel(m.pair1Id))} <span class="muted">vs</span> ${escapeHtml(pairLabel(m.pair2Id))}</div>
        <input type="number" min="0" data-mid="${m.matchId}" data-side="1" value="${m.score1 ?? ''}" placeholder="分數" />
        <span class="vs">:</span>
        <input type="number" min="0" data-mid="${m.matchId}" data-side="2" value="${m.score2 ?? ''}" placeholder="分數" />
        <span class="status">${done ? '已完賽' : '未進行'}</span>`;
      card.appendChild(row);
    }
    view.appendChild(card);
  }

  view.querySelectorAll('input[data-mid]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const mid = inp.dataset.mid;
      const row = inp.parentElement;
      const s1 = row.querySelector('input[data-side="1"]').value;
      const s2 = row.querySelector('input[data-side="2"]').value;
      try {
        await api('POST', `/api/matches/${mid}/score`, { score1: s1, score2: s2 });
        await refresh();
      } catch (e) { alert(e.message); }
    });
  });
}

function renderStandings() {
  const view = $('#standings-view');
  view.innerHTML = '';
  if (!STATE.groups.length) {
    view.innerHTML = '<p class="muted">尚未分組。</p>';
    return;
  }
  for (const g of STATE.groups) {
    const rows = STATE.standings[g.groupId] || [];
    if (!rows.length) continue;
    const card = document.createElement('div');
    card.className = 'group-card';
    const groupNum = g.groupId.replace('g', '');
    const trs = rows.map(r => `
      <tr class="rank-${r.rank}">
        <td>${r.rank}</td>
        <td>${escapeHtml(r.playerNames.join(' & '))}</td>
        <td>${r.played}</td>
        <td>${r.wins}</td>
        <td>${r.losses}</td>
        <td>${r.pointsFor}</td>
        <td>${r.pointsAgainst}</td>
        <td>${r.diff > 0 ? '+' + r.diff : r.diff}</td>
      </tr>`).join('');
    card.innerHTML = `
      <h3>分組 ${groupNum}</h3>
      <table>
        <thead><tr><th>名次</th><th>配對</th><th>場次</th><th>勝</th><th>敗</th><th>得分</th><th>失分</th><th>分差</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>`;
    view.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

$$('nav .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('nav .tab').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-' + btn.dataset.tab).classList.add('active');
  });
});

$('#form-add-player').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#player-name').value.trim();
  const level = $('#player-level').value;
  if (!name) return;
  try {
    await api('POST', '/api/players', { name, level });
    $('#player-name').value = '';
    $('#player-level').value = '';
    await refresh();
  } catch (err) { alert(err.message); }
});

$('#btn-bulk-add').addEventListener('click', async () => {
  const csv = $('#csv-input').value;
  if (!csv.trim()) return;
  try {
    const r = await api('POST', '/api/players/bulk', { csv });
    $('#csv-input').value = '';
    const msg = `已新增 ${r.added} 筆${r.errors.length ? `，錯誤 ${r.errors.length} 筆：${r.errors.join(' / ')}` : ''}`;
    $('#bulk-status').textContent = msg;
    await refresh();
  } catch (err) { alert(err.message); }
});

$('#btn-clear-players').addEventListener('click', async () => {
  if (!confirm('確定清空所有選手？')) return;
  try {
    await api('DELETE', '/api/players');
    await refresh();
  } catch (e) { alert(e.message); }
});

$('#btn-generate-groups').addEventListener('click', async () => {
  const numGroups = Number($('#num-groups').value);
  if (!numGroups) return;
  if (STATE.groups.length && !confirm('已存在分組，將覆蓋。確定？')) return;
  try {
    if (STATE.groups.length) await api('POST', '/api/reset');
    const r = await api('POST', '/api/groups/generate', { numGroups });
    const banner = $('#leftover-banner');
    if (r.leftovers?.length) {
      banner.classList.remove('hidden');
      banner.textContent = '人數為奇數，以下為候補（無對戰）：' +
        r.leftovers.map(l => `${l.name}@分組${l.groupId.replace('g','')}`).join('、');
    } else {
      banner.classList.add('hidden');
      banner.textContent = '';
    }
    await refresh();
  } catch (err) { alert(err.message); }
});

$('#btn-reset').addEventListener('click', async () => {
  if (!confirm('將清除分組、配對與賽程（選手保留）。確定？')) return;
  try {
    await api('POST', '/api/reset');
    $('#leftover-banner').classList.add('hidden');
    await refresh();
  } catch (e) { alert(e.message); }
});

refresh().catch(e => alert(e.message));
