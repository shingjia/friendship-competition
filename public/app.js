const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let STATE = { players: [], groups: [], pairs: [], matches: [], standings: {} };

/* =====================================================
   認證與設定模組（Auth & Settings）
   所有資料存於 localStorage，無需後端
   ===================================================== */

const AUTH_KEY         = 'bm_auth';         // legacy 旗標（沿用）
const CURRENT_USER_KEY = 'bm_current_user'; // 目前登入者帳號
const ADMIN_PW_KEY     = 'bm_admin_pw';     // admin 密碼（admin 登入後存，供 admin API 使用）
const SETTINGS_KEY     = 'bm_settings';     // 視覺/暱稱等設定（仍為本機）
const ADMIN_USER       = 'admin';

// 預設設定值
const DEFAULT_SETTINGS = {
  nickname:         '管理員',
  password:         'admin',
  teamTitle:        '泰豪鋼泰 VS 強心臟羽球隊',
  heroSub:          '雙打分組循環賽 · 強心臟主辦',
  heroColor:        '#c8102e',
  iconDataUrl:      null,   // 頂部/頁尾 logo，null = 使用 olddriver.png
  loginIconDataUrl: null,   // 登入頁 logo，null = 使用 olddriver.png
};

const DEFAULT_TOP_ICON   = 'olddriver.png';
const DEFAULT_LOGIN_ICON = 'olddriver.png';

// 讀取設定（合併預設值確保新欄位不遺漏）
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
  } catch { return Object.assign({}, DEFAULT_SETTINGS); }
}

function saveSettings(cfg) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
}

/* ---- 帳號管理（後端 API） ---- */
function currentUser() {
  return localStorage.getItem(CURRENT_USER_KEY);
}

function isAdmin() {
  return currentUser() === ADMIN_USER;
}

function isLoggedIn() {
  return localStorage.getItem(AUTH_KEY) === '1' && !!currentUser();
}

function setLoggedIn(v, user) {
  if (v) {
    localStorage.setItem(AUTH_KEY, '1');
    if (user) localStorage.setItem(CURRENT_USER_KEY, user);
  } else {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(ADMIN_PW_KEY);
  }
}

// 帶上 admin 密碼的 fetch（admin 專用操作）
async function adminFetch(method, url, body) {
  const pw = localStorage.getItem(ADMIN_PW_KEY) || '';
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// 將 hex 顏色變暗（ratio: 0~1，越小越暗）
function hexDarken(hex, ratio) {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * ratio);
  const g = Math.round(parseInt(c.substring(2, 4), 16) * ratio);
  const b = Math.round(parseInt(c.substring(4, 6), 16) * ratio);
  return `rgb(${r},${g},${b})`;
}

/* ---- 套用設定到頁面 ---- */
function applySettings() {
  const cfg = loadSettings();

  // Hero 背景色（使用 CSS 自訂屬性動態覆蓋，相容所有瀏覽器）
  const heroBg = $('#hero-bg');
  if (heroBg) {
    // 計算深色版本：把 hex 轉 rgb 後各乘以 0.6
    const dark = hexDarken(cfg.heroColor, 0.6);
    heroBg.style.background = [
      `radial-gradient(ellipse at 80% 20%, rgba(251,191,36,.25), transparent 55%)`,
      `linear-gradient(135deg, ${cfg.heroColor} 0%, ${dark} 100%)`
    ].join(', ');
  }

  // Hero / login logo（footer 固定為 olddriver.png，不受設定影響）
  const topSrc   = cfg.iconDataUrl      || DEFAULT_TOP_ICON;
  const loginSrc = cfg.loginIconDataUrl || DEFAULT_LOGIN_ICON;
  const heroLogo = $('#hero-logo');
  if (heroLogo) heroLogo.src = topSrc;
  const loginLogo = $('#login-logo');
  if (loginLogo) loginLogo.src = loginSrc;

  // 隊伍名稱（保留 VS badge）
  const heroTitle = $('#hero-title');
  if (heroTitle) {
    // 用分隔符 ' VS ' 切分，找 VS 兩邊的文字
    const raw = cfg.teamTitle || DEFAULT_SETTINGS.teamTitle;
    const vsPat = /\s*\bVS\b\s*/i;
    if (vsPat.test(raw)) {
      const parts = raw.split(vsPat);
      heroTitle.innerHTML = `${escapeHtml(parts[0].trim())} <span class="vs-badge">VS</span> ${escapeHtml(parts.slice(1).join(' VS ').trim())}`;
    } else {
      heroTitle.textContent = raw;
    }
  }

  // 頁面 title
  document.title = (cfg.teamTitle || DEFAULT_SETTINGS.teamTitle) + ' 友誼賽';

  // Hero 副標
  const heroSubEl = $('#hero-sub');
  if (heroSubEl) heroSubEl.textContent = cfg.heroSub || DEFAULT_SETTINGS.heroSub;

  // 使用者 widget：admin 顯示暱稱，guest 顯示帳號
  const cur = currentUser();
  const adminMode = cur === ADMIN_USER;
  const displayName = adminMode
    ? (cfg.nickname || DEFAULT_SETTINGS.nickname)
    : (cur || 'guest');

  const dispName = $('#user-display-name');
  if (dispName) dispName.textContent = displayName;
  const avatar = $('#user-avatar');
  if (avatar) avatar.textContent = [...displayName.trim()][0] || 'A';

  // 齒輪按鈕：只有 admin 看得到
  const gear = $('#btn-open-settings');
  if (gear) gear.classList.toggle('hidden', !adminMode);
}

/* ---- 登入流程 ---- */
function showLogin() {
  $('#login-overlay').classList.remove('hidden');
  $('#app').classList.add('hidden');
  applySettings(); // 套用 logo 等視覺到登入頁
}

function showApp() {
  $('#login-overlay').classList.add('hidden');
  $('#app').classList.remove('hidden');
  applySettings();
}

/* ---- 設定面板 ---- */
async function renderAccountList() {
  const wrap = $('#account-list');
  if (!wrap) return;
  wrap.innerHTML = '<p class="muted small-note">載入中…</p>';
  let accs = [];
  try {
    const res = await fetch('/api/accounts');
    accs = await res.json();
  } catch {
    wrap.innerHTML = '<p class="muted small-note">無法載入帳號清單</p>';
    return;
  }
  const others = accs.map(a => a.username).filter(u => u !== ADMIN_USER).sort();
  if (others.length === 0) {
    wrap.innerHTML = '<p class="muted small-note">尚無其他帳號。</p>';
    return;
  }
  wrap.innerHTML = others.map(u =>
    `<div class="account-row">
       <span class="account-user">${escapeHtml(u)}</span>
       <span class="account-role">guest</span>
       <button class="btn-secondary account-del" data-user="${escapeHtml(u)}">刪除</button>
     </div>`
  ).join('');
  wrap.querySelectorAll('.account-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const u = btn.getAttribute('data-user');
      if (!confirm(`確定刪除帳號 "${u}"？`)) return;
      try {
        await adminFetch('DELETE', `/api/accounts/${encodeURIComponent(u)}`);
        renderAccountList();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openSettings() {
  if (!isAdmin()) return;   // 安全防護：非 admin 一律不開
  const cfg = loadSettings();

  $('#set-nickname').value    = cfg.nickname;
  $('#set-password').value    = '';
  $('#set-password2').value   = '';
  $('#set-team-title').value  = cfg.teamTitle;
  $('#set-hero-sub').value    = cfg.heroSub;
  $('#set-hero-color').value  = cfg.heroColor;
  $('#set-hero-color-val').textContent = cfg.heroColor;
  $('#set-icon-preview').src        = cfg.iconDataUrl      || DEFAULT_TOP_ICON;
  $('#set-login-icon-preview').src  = cfg.loginIconDataUrl || DEFAULT_LOGIN_ICON;

  const msgEl = $('#settings-msg');
  msgEl.className = 'settings-msg hidden';
  msgEl.textContent = '';

  // 清空帳號管理區
  $('#new-account-user').value = '';
  $('#new-account-pass').value = '';
  const accMsg = $('#account-msg');
  if (accMsg) { accMsg.className = 'settings-msg hidden'; accMsg.textContent = ''; }
  renderAccountList();

  $('#settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  $('#settings-overlay').classList.add('hidden');
}

/* ---- 初始化事件綁定（Auth & Settings） ---- */
function initAuth() {
  // 登入表單
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('#login-username').value.trim();
    const pass = $('#login-password').value;
    const errEl = $('#login-error');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '登入失敗');
      setLoggedIn(true, data.username);
      if (data.isAdmin) localStorage.setItem(ADMIN_PW_KEY, pass);
      else              localStorage.removeItem(ADMIN_PW_KEY);
      errEl.classList.add('hidden');
      showApp();
      refresh().catch(err => alert(err.message));
    } catch (err) {
      errEl.textContent = err.message || '帳號或密碼錯誤';
      errEl.classList.remove('hidden');
      $('#login-password').value = '';
      $('#login-password').focus();
    }
  });

  // 開啟設定
  $('#btn-open-settings').addEventListener('click', openSettings);

  // 關閉設定
  $('#btn-settings-close').addEventListener('click', closeSettings);

  // 點擊遮罩關閉設定
  $('#settings-overlay').addEventListener('click', (e) => {
    if (e.target === $('#settings-overlay')) closeSettings();
  });

  // 顏色選擇器即時更新顯示值
  $('#set-hero-color').addEventListener('input', (e) => {
    $('#set-hero-color-val').textContent = e.target.value;
  });

  // 頂部圖示上傳
  $('#set-icon-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      $('#set-icon-preview').src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // 還原頂部預設 icon
  $('#btn-reset-icon').addEventListener('click', () => {
    $('#set-icon-preview').src = DEFAULT_TOP_ICON;
    $('#set-icon-upload').value = '';
  });

  // 登入頁圖示上傳
  $('#set-login-icon-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      $('#set-login-icon-preview').src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // 還原登入頁預設 icon
  $('#btn-reset-login-icon').addEventListener('click', () => {
    $('#set-login-icon-preview').src = DEFAULT_LOGIN_ICON;
    $('#set-login-icon-upload').value = '';
  });

  // 新增 guest 帳號
  $('#btn-add-account').addEventListener('click', async () => {
    const u = $('#new-account-user').value.trim();
    const p = $('#new-account-pass').value;
    const msg = $('#account-msg');
    const show = (txt, type) => {
      msg.textContent = txt;
      msg.className = `settings-msg ${type}`;
      clearTimeout(msg._timer);
      msg._timer = setTimeout(() => { msg.className = 'settings-msg hidden'; }, 3000);
    };
    if (!u || !p) return show('請輸入帳號與密碼', 'error');
    try {
      await adminFetch('POST', '/api/accounts', { username: u, password: p });
      $('#new-account-user').value = '';
      $('#new-account-pass').value = '';
      renderAccountList();
      show(`已新增帳號 "${u}"`, 'success');
    } catch (err) {
      show(err.message, 'error');
    }
  });

  // 還原預設顏色
  $('#btn-reset-color').addEventListener('click', () => {
    $('#set-hero-color').value = DEFAULT_SETTINGS.heroColor;
    $('#set-hero-color-val').textContent = DEFAULT_SETTINGS.heroColor;
  });

  // 儲存設定
  $('#btn-settings-save').addEventListener('click', async () => {
    const cfg = loadSettings();
    const msgEl = $('#settings-msg');

    // 驗證並修改 admin 密碼（呼叫後端 API）
    const p1 = $('#set-password').value;
    const p2 = $('#set-password2').value;
    if (p1 || p2) {
      if (p1.length < 4) {
        showSettingsMsg('密碼至少需 4 個字元', 'error');
        return;
      }
      if (p1 !== p2) {
        showSettingsMsg('兩次密碼不一致', 'error');
        return;
      }
      try {
        await adminFetch('POST', '/api/admin/password', { newPassword: p1 });
        // 同步更新本機儲存的 admin 密碼（用於後續 admin API 呼叫）
        localStorage.setItem(ADMIN_PW_KEY, p1);
      } catch (err) {
        showSettingsMsg(err.message || '密碼修改失敗', 'error');
        return;
      }
      delete cfg.password;
    }

    cfg.nickname   = $('#set-nickname').value.trim() || DEFAULT_SETTINGS.nickname;
    cfg.teamTitle  = $('#set-team-title').value.trim() || DEFAULT_SETTINGS.teamTitle;
    cfg.heroSub    = $('#set-hero-sub').value.trim() || DEFAULT_SETTINGS.heroSub;
    cfg.heroColor  = $('#set-hero-color').value;

    // 圖示：若預覽是 data url 就儲存，否則視為使用預設
    const topPreview = $('#set-icon-preview').src;
    cfg.iconDataUrl = topPreview && topPreview.startsWith('data:') ? topPreview : null;

    const loginPreview = $('#set-login-icon-preview').src;
    cfg.loginIconDataUrl = loginPreview && loginPreview.startsWith('data:') ? loginPreview : null;

    saveSettings(cfg);
    applySettings();
    showSettingsMsg('設定已儲存', 'success');
  });

  // 登出（admin 用：設定面板內）
  $('#btn-logout').addEventListener('click', () => {
    if (!confirm('確定登出？')) return;
    setLoggedIn(false);
    closeSettings();
    showLogin();
  });

  // 登出（所有人共用：右上角 icon）
  $('#btn-header-logout').addEventListener('click', () => {
    if (!confirm('確定登出？')) return;
    setLoggedIn(false);
    closeSettings();
    showLogin();
  });
}

function showSettingsMsg(text, type) {
  const el = $('#settings-msg');
  el.textContent = text;
  el.className = `settings-msg ${type}`;
  // 3 秒後自動淡出
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'settings-msg hidden'; }, 3000);
}

/* =====================================================
   應用程式啟動
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initAuth();       // 掛登入、設定面板的事件
  initAppEvents();  // 掛 tab 切換、選手管理等原有事件
  if (isLoggedIn()) {
    showApp();
    refresh().catch(err => alert(err.message));
  } else {
    showLogin();
  }
});
/* =====================================================
   以下為原有功能（保持不變）
   ===================================================== */

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

    const total = groupMatches.length;
    const done = groupMatches.filter(m => m.score1 !== null && m.score2 !== null).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const groupNum = g.groupId.replace('g', '');

    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-header">
        <h3>分組 ${groupNum}</h3>
        <span class="progress-label">${done}/${total} 完賽 (${pct}%)</span>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="match-list"></div>`;
    const list = card.querySelector('.match-list');

    groupMatches.forEach((m, idx) => {
      const isDone = m.score1 !== null && m.score2 !== null;
      const tie = isDone && m.score1 === m.score2;
      const winner1 = isDone && m.score1 > m.score2;
      const winner2 = isDone && m.score2 > m.score1;
      const cardClass = isDone ? (tie ? 'tie' : 'done') : '';
      const statusClass = isDone ? (tie ? 'badge-tie' : 'badge-done') : 'badge-pending';
      const statusText = isDone ? (tie ? '平手' : '已完賽') : '未進行';

      const mc = document.createElement('div');
      mc.className = `match-card ${cardClass}`.trim();
      mc.innerHTML = `
        <div class="match-header">
          <span class="match-num">#${idx + 1}</span>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="match-body">
          <div class="team team-a ${winner1 ? 'winner' : ''}">
            <span class="team-name">${escapeHtml(pairLabel(m.pair1Id))}</span>
            ${winner1 ? '<span class="winner-mark">★ 勝</span>' : ''}
          </div>
          <div class="score-block">
            <input type="number" min="0" inputmode="numeric" data-mid="${m.matchId}" data-side="1" value="${m.score1 ?? ''}" placeholder="-" />
            <span class="score-sep">:</span>
            <input type="number" min="0" inputmode="numeric" data-mid="${m.matchId}" data-side="2" value="${m.score2 ?? ''}" placeholder="-" />
          </div>
          <div class="team team-b ${winner2 ? 'winner' : ''}">
            <span class="team-name">${escapeHtml(pairLabel(m.pair2Id))}</span>
            ${winner2 ? '<span class="winner-mark">★ 勝</span>' : ''}
          </div>
        </div>`;
      list.appendChild(mc);
    });
    view.appendChild(card);
  }

  view.querySelectorAll('input[data-mid]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const mid = inp.dataset.mid;
      const scope = inp.closest('.match-card');
      const s1 = scope.querySelector('input[data-side="1"]').value;
      const s2 = scope.querySelector('input[data-side="2"]').value;
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

function initAppEvents() {
  // Tab 切換
  $$('nav .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('nav .tab').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // 新增選手
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

  // CSV 批次匯入
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

  // 清空選手
  $('#btn-clear-players').addEventListener('click', async () => {
    if (!confirm('確定清空所有選手？')) return;
    try {
      await api('DELETE', '/api/players');
      await refresh();
    } catch (e) { alert(e.message); }
  });

  // 執行分組
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

  // 重設賽事
  $('#btn-reset').addEventListener('click', async () => {
    if (!confirm('將清除分組、配對與賽程（選手保留）。確定？')) return;
    try {
      await api('POST', '/api/reset');
      $('#leftover-banner').classList.add('hidden');
      await refresh();
    } catch (e) { alert(e.message); }
  });
}

