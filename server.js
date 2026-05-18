const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const FILES = {
  players:  path.join(DATA_DIR, 'players.txt'),
  groups:   path.join(DATA_DIR, 'groups.txt'),
  pairs:    path.join(DATA_DIR, 'pairs.txt'),
  matches:  path.join(DATA_DIR, 'matches.txt'),
  accounts: path.join(DATA_DIR, 'accounts.txt'),
};

const ADMIN_USER = 'admin';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const f of Object.values(FILES)) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '');
  }
  // 確保 admin 帳號存在（首次啟動或檔案空白時建立 admin/admin）
  const accs = loadAccountsRaw();
  if (!accs.find(a => a.username === ADMIN_USER)) {
    accs.push({ username: ADMIN_USER, password: 'admin' });
    saveAccountsRaw(accs);
  }
}

function loadAccountsRaw() {
  if (!fs.existsSync(FILES.accounts)) return [];
  return readLines(FILES.accounts).map(line => {
    const [username, password] = line.split('|');
    return { username, password };
  });
}

function saveAccountsRaw(accounts) {
  writeLines(FILES.accounts, accounts.map(a => `${a.username}|${a.password}`));
}

function getAdminPassword() {
  const admin = loadAccountsRaw().find(a => a.username === ADMIN_USER);
  return admin ? admin.password : null;
}

function verifyAdmin(req) {
  const pw = (req.body && req.body.adminPassword) || req.headers['x-admin-password'];
  return pw && pw === getAdminPassword();
}

function readLines(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

function writeLines(file, lines) {
  fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
}

function loadPlayers() {
  return readLines(FILES.players).map(line => {
    const [id, name, level] = line.split('|');
    return { id, name, level: Number(level) };
  });
}

function savePlayers(players) {
  writeLines(FILES.players, players.map(p => `${p.id}|${p.name}|${p.level}`));
}

function loadGroups() {
  return readLines(FILES.groups).map(line => {
    const [groupId, ids] = line.split('|');
    return { groupId, playerIds: ids ? ids.split(',') : [] };
  });
}

function saveGroups(groups) {
  writeLines(FILES.groups, groups.map(g => `${g.groupId}|${g.playerIds.join(',')}`));
}

function loadPairs() {
  return readLines(FILES.pairs).map(line => {
    const [pairId, groupId, ids] = line.split('|');
    return { pairId, groupId, playerIds: ids ? ids.split(',') : [] };
  });
}

function savePairs(pairs) {
  writeLines(FILES.pairs, pairs.map(p => `${p.pairId}|${p.groupId}|${p.playerIds.join(',')}`));
}

function loadMatches() {
  return readLines(FILES.matches).map(line => {
    const [matchId, groupId, pair1Id, pair2Id, s1, s2] = line.split('|');
    return {
      matchId,
      groupId,
      pair1Id,
      pair2Id,
      score1: s1 === '' || s1 === undefined ? null : Number(s1),
      score2: s2 === '' || s2 === undefined ? null : Number(s2),
    };
  });
}

function saveMatches(matches) {
  writeLines(FILES.matches, matches.map(m =>
    `${m.matchId}|${m.groupId}|${m.pair1Id}|${m.pair2Id}|${m.score1 ?? ''}|${m.score2 ?? ''}`
  ));
}

function nextPlayerId(players) {
  const max = players.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  return String(max + 1);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distributeToGroups(playersSortedDesc, numGroups) {
  const groups = Array.from({ length: numGroups }, () => []);
  const total = playersSortedDesc.length;
  const base = Math.floor(total / numGroups);
  const extra = total % numGroups;
  let idx = 0;
  for (let g = 0; g < numGroups; g++) {
    const size = base + (g < extra ? 1 : 0);
    for (let k = 0; k < size; k++) {
      groups[g].push(playersSortedDesc[idx++]);
    }
  }
  return groups;
}

function buildPairsForGroup(playersInGroup, groupId) {
  const shuffled = shuffle(playersInGroup);
  const pairs = [];
  let leftover = null;
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push({
      pairId: `${groupId}-p${pairs.length + 1}`,
      groupId,
      playerIds: [shuffled[i].id, shuffled[i + 1].id],
    });
  }
  if (shuffled.length % 2 === 1) leftover = shuffled[shuffled.length - 1];
  return { pairs, leftover };
}

function buildRoundRobinMatches(pairs, groupId) {
  const matches = [];
  let n = 1;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      matches.push({
        matchId: `${groupId}-m${n++}`,
        groupId,
        pair1Id: pairs[i].pairId,
        pair2Id: pairs[j].pairId,
        score1: null,
        score2: null,
      });
    }
  }
  return matches;
}

function computeStandings(state) {
  const { players, groups, pairs, matches } = state;
  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const pairById = Object.fromEntries(pairs.map(p => [p.pairId, p]));
  const standings = {};

  for (const group of groups) {
    const groupPairs = pairs.filter(p => p.groupId === group.groupId);
    const rows = groupPairs.map(pair => ({
      pairId: pair.pairId,
      playerNames: pair.playerIds.map(id => playerById[id]?.name || id),
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
    }));
    const rowByPair = Object.fromEntries(rows.map(r => [r.pairId, r]));

    const groupMatches = matches.filter(m => m.groupId === group.groupId);
    for (const m of groupMatches) {
      if (m.score1 === null || m.score2 === null) continue;
      const r1 = rowByPair[m.pair1Id];
      const r2 = rowByPair[m.pair2Id];
      if (!r1 || !r2) continue;
      r1.played++; r2.played++;
      r1.pointsFor += m.score1; r1.pointsAgainst += m.score2;
      r2.pointsFor += m.score2; r2.pointsAgainst += m.score1;
      if (m.score1 > m.score2) { r1.wins++; r2.losses++; }
      else if (m.score2 > m.score1) { r2.wins++; r1.losses++; }
    }
    for (const r of rows) r.diff = r.pointsFor - r.pointsAgainst;

    rows.sort((a, b) => {
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      if (a.pointsAgainst !== b.pointsAgainst) return a.pointsAgainst - b.pointsAgainst;
      return b.diff - a.diff;
    });
    rows.forEach((r, i) => { r.rank = i + 1; });
    standings[group.groupId] = rows;
  }
  return standings;
}

function getState() {
  return {
    players: loadPlayers(),
    groups: loadGroups(),
    pairs: loadPairs(),
    matches: loadMatches(),
  };
}

ensureDataDir();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0,
}));

app.get('/api/state', (req, res) => {
  const state = getState();
  res.json({ ...state, standings: computeStandings(state) });
});

/* ===== 帳號 API ===== */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '帳號密碼必填' });
  const user = loadAccountsRaw().find(a => a.username === username && a.password === password);
  if (!user) return res.status(401).json({ error: '帳號或密碼錯誤' });
  res.json({ ok: true, username: user.username, isAdmin: user.username === ADMIN_USER });
});

// 列出帳號（不回傳密碼）
app.get('/api/accounts', (req, res) => {
  const accs = loadAccountsRaw().map(a => ({ username: a.username }));
  res.json(accs);
});

// 新增 guest 帳號（需 admin 權限）
app.post('/api/accounts', (req, res) => {
  if (!verifyAdmin(req)) return res.status(403).json({ error: '需要 admin 權限' });
  const { username, password } = req.body || {};
  if (!username || typeof username !== 'string') return res.status(400).json({ error: '帳號必填' });
  if (!/^[a-zA-Z0-9_\-.]{2,32}$/.test(username)) return res.status(400).json({ error: '帳號需 2-32 字（英數/_-./）' });
  if (username.toLowerCase() === ADMIN_USER) return res.status(400).json({ error: 'admin 為保留帳號' });
  if (!password || password.length < 4) return res.status(400).json({ error: '密碼至少需 4 個字元' });
  const accs = loadAccountsRaw();
  if (accs.some(a => a.username === username)) return res.status(409).json({ error: '帳號已存在' });
  accs.push({ username, password });
  saveAccountsRaw(accs);
  res.json({ ok: true });
});

// 刪除帳號（需 admin 權限，不可刪 admin）
app.delete('/api/accounts/:username', (req, res) => {
  if (!verifyAdmin(req)) return res.status(403).json({ error: '需要 admin 權限' });
  const target = req.params.username;
  if (target === ADMIN_USER) return res.status(400).json({ error: '不可刪除 admin' });
  const accs = loadAccountsRaw().filter(a => a.username !== target);
  saveAccountsRaw(accs);
  res.json({ ok: true });
});

// 修改 admin 密碼
app.post('/api/admin/password', (req, res) => {
  if (!verifyAdmin(req)) return res.status(403).json({ error: '需要 admin 權限' });
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新密碼至少需 4 個字元' });
  const accs = loadAccountsRaw();
  const admin = accs.find(a => a.username === ADMIN_USER);
  if (admin) admin.password = newPassword;
  saveAccountsRaw(accs);
  res.json({ ok: true });
});

app.post('/api/players', (req, res) => {
  const { name, level } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  const lvl = Number(level);
  if (!Number.isFinite(lvl)) return res.status(400).json({ error: 'level must be number' });
  if (loadGroups().length) return res.status(409).json({ error: '已分組，請先重設賽事' });
  const players = loadPlayers();
  const id = nextPlayerId(players);
  players.push({ id, name: name.trim(), level: lvl });
  savePlayers(players);
  res.json({ id });
});

app.post('/api/players/bulk', (req, res) => {
  const { csv } = req.body || {};
  if (typeof csv !== 'string') return res.status(400).json({ error: 'csv required' });
  if (loadGroups().length) return res.status(409).json({ error: '已分組，請先重設賽事' });
  const players = loadPlayers();
  const added = [];
  const errors = [];
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/[,\t]/).map(s => s.trim());
    if (parts.length < 2) { errors.push(`格式錯誤: ${line}`); continue; }
    const name = parts[0];
    const lvl = Number(parts[1]);
    if (!name || !Number.isFinite(lvl)) { errors.push(`資料錯誤: ${line}`); continue; }
    const id = nextPlayerId(players);
    const p = { id, name, level: lvl };
    players.push(p);
    added.push(p);
  }
  savePlayers(players);
  res.json({ added: added.length, errors });
});

app.delete('/api/players/:id', (req, res) => {
  if (loadGroups().length) return res.status(409).json({ error: '已分組，請先重設賽事' });
  const players = loadPlayers().filter(p => p.id !== req.params.id);
  savePlayers(players);
  res.json({ ok: true });
});

app.delete('/api/players', (req, res) => {
  if (loadGroups().length) return res.status(409).json({ error: '已分組，請先重設賽事' });
  savePlayers([]);
  res.json({ ok: true });
});

app.post('/api/groups/generate', (req, res) => {
  const numGroups = Number(req.body?.numGroups);
  if (!Number.isInteger(numGroups) || numGroups < 1) {
    return res.status(400).json({ error: 'numGroups must be positive integer' });
  }
  const players = loadPlayers();
  if (players.length < numGroups * 2) {
    return res.status(400).json({ error: `人數不足，每組至少需 2 人（共需 ${numGroups * 2} 人）` });
  }
  const sorted = players.slice().sort((a, b) => b.level - a.level);
  const grouped = distributeToGroups(sorted, numGroups);

  const groups = [];
  const pairs = [];
  const matches = [];
  const leftovers = [];
  for (let i = 0; i < grouped.length; i++) {
    const gid = `g${i + 1}`;
    groups.push({ groupId: gid, playerIds: grouped[i].map(p => p.id) });
    const { pairs: gPairs, leftover } = buildPairsForGroup(grouped[i], gid);
    pairs.push(...gPairs);
    if (leftover) leftovers.push({ groupId: gid, playerId: leftover.id, name: leftover.name });
    matches.push(...buildRoundRobinMatches(gPairs, gid));
  }
  saveGroups(groups);
  savePairs(pairs);
  saveMatches(matches);
  res.json({ ok: true, leftovers });
});

app.post('/api/matches/:id/score', (req, res) => {
  const { score1, score2 } = req.body || {};
  const s1 = score1 === '' || score1 === null || score1 === undefined ? null : Number(score1);
  const s2 = score2 === '' || score2 === null || score2 === undefined ? null : Number(score2);
  if (s1 !== null && !Number.isFinite(s1)) return res.status(400).json({ error: 'score1 invalid' });
  if (s2 !== null && !Number.isFinite(s2)) return res.status(400).json({ error: 'score2 invalid' });
  const matches = loadMatches();
  const m = matches.find(x => x.matchId === req.params.id);
  if (!m) return res.status(404).json({ error: 'match not found' });
  m.score1 = s1;
  m.score2 = s2;
  saveMatches(matches);
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  saveGroups([]);
  savePairs([]);
  saveMatches([]);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`friendship-competition listening on http://localhost:${PORT}`);
  console.log(`data dir: ${DATA_DIR}`);
});
