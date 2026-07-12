'use strict';
/* STEEL FRONT — UI: HUD / スコアボード / 設定 / マップ描画 */

// ---------- UI ----------
const ui = {
  hpFill: document.getElementById('hp-fill'), hpText: document.getElementById('hp-text'),
  ammoMag: document.getElementById('ammo-mag'), reloadHint: document.getElementById('reload-hint'),
  ammoReserve: document.getElementById('ammo-reserve'),
  nadeCount: document.getElementById('nade-count'),
  weaponName: document.getElementById('weapon-name'),
  scoreVal: document.getElementById('score-val'), killsVal: document.getElementById('kills-val'),
  vignette: document.getElementById('damage-vignette'),
  hitmarker: document.getElementById('hitmarker'), killfeed: document.getElementById('killfeed'),
  radar: document.getElementById('radar').getContext('2d'),
  vehicleBox: document.getElementById('vehicle-box'),
  vehicleName: document.getElementById('vehicle-name'),
  vehicleFill: document.getElementById('vehicle-fill'),
  vehicleSpeed: document.getElementById('vehicle-speed'),
  vehicleParts: document.getElementById('vehicle-parts'),           // v0.3
  droneHud: document.getElementById('drone-hud'),                   // v0.3
  droneBattery: document.getElementById('drone-battery-fill'),      // v0.3
  droneSpot: document.getElementById('drone-spot'),                 // v0.3
  interactHint: document.getElementById('interact-hint'),
  btnVehicle: document.getElementById('btn-vehicle'),
  tBlue: document.getElementById('t-blue'), tRed: document.getElementById('t-red'),
  capBox: document.getElementById('cap-box'), capLabel: document.getElementById('cap-label'),
  capFill: document.getElementById('cap-fill'),
  waveBanner: document.getElementById('wave-banner'),
  respawnTimer: document.getElementById('respawn-timer'),
  matchTimer: document.getElementById('match-timer')   // v0.2.3
};
// 拠点アイコンを生成
{
  const strip = document.getElementById('flags-strip');
  for (const f of flags) {
    const d = document.createElement('div');
    d.className = 'flag-ic';
    d.id = 'flag-' + f.id;
    d.textContent = f.id;
    strip.appendChild(d);
  }
}
function updateHpUI() {
  ui.hpFill.style.width = (player.hp / player.maxHp * 100) + '%';
  ui.hpFill.style.background = player.hp > 40 ? 'linear-gradient(90deg,#3ddc84,#a7f3c8)' : 'linear-gradient(90deg,#e0483d,#f3a7a0)';
  ui.hpText.textContent = 'HP ' + Math.ceil(player.hp);
}
function updateAmmoUI() {
  // v0.4.1: バイク後席は自分の武器を使うため表示を更新
  if (curVehicle && !(curVehicle.type === 'bike' && curVehicle.seats[curSeat].role === 'passenger')) return;
  ui.ammoMag.textContent = weapon.mag;
  ui.ammoMag.style.color = weapon.mag <= Math.max(3, weapon.magSize * 0.18) ? '#ff6b5e' : '#fff';
  ui.ammoReserve.textContent = ' / ' + weapon.reserve;
  ui.nadeCount.textContent = grenades.count;
}
function updateScoreUI() {
  ui.scoreVal.textContent = game.score;
  ui.killsVal.textContent = game.kills + ' KILLS';
}
function updateTicketsUI() {
  ui.tBlue.textContent = game.ticketsBlue;
  ui.tRed.textContent = game.ticketsRed;
}
let hitmarkerTO = null;
function showHitmarker(hs = false) {
  ui.hitmarker.style.opacity = 1;
  ui.hitmarker.classList.toggle('hs', hs);
  clearTimeout(hitmarkerTO);
  hitmarkerTO = setTimeout(() => { ui.hitmarker.style.opacity = 0; ui.hitmarker.classList.remove('hs'); }, hs ? 160 : 90);
}
function addFeed(text, cls = '') {
  const d = document.createElement('div');
  d.className = 'feed-item' + (cls ? ' ' + cls : '');
  d.textContent = text;
  ui.killfeed.appendChild(d);
  setTimeout(() => d.remove(), 1450);
}
let interactT = 0;
function setBtn(id, show, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';
  if (label !== undefined) el.textContent = label;
}
function updateInteractHint(dt) {
  interactT += dt;
  if (interactT < 0.2) return;
  interactT = 0;
  if (isMobile) {
    // v0.3: 状態に応じたボタンの出し分け
    const inV = !!curVehicle;
    const isHeliDriver = inV && curVehicle.type === 'heli' && curVehicle.seats[curSeat].role === 'driver';
    const canDrive = inV && curVehicle.maxSpeed > 0;
    setBtn('btn-seat', inV && curVehicle.seats.length > 1);
    setBtn('btn-up', isHeliDriver || drone.active);
    setBtn('btn-down', isHeliDriver || drone.active);
    setBtn('btn-rocket', isHeliDriver);
    setBtn('btn-horn', canDrive && curVehicle.type !== 'heli');
    setBtn('btn-drone', !inV && (drone.active || drone.cooldown <= 0), drone.active ? '帰還' : 'DRN');
    setBtn('btn-repair', !inV && !drone.active && !!nearestDamagedFriendly());
  }
  if (drone.active) { ui.interactHint.style.display = 'none'; if (isMobile) setBtn('btn-vehicle', false); return; }
  if (curVehicle) {
    ui.interactHint.style.display = 'none';
    if (isMobile) { ui.btnVehicle.style.display = 'flex'; ui.btnVehicle.textContent = '降りる'; }
    return;
  }
  const v = nearestVehicle();
  const dmgV = nearestDamagedFriendly();
  if (v) {
    if (isMobile) {
      ui.btnVehicle.style.display = 'flex'; ui.btnVehicle.textContent = '乗る';
      ui.interactHint.style.display = 'none';
    } else {
      ui.interactHint.textContent = 'E: ' + v.name + ' に乗る' + (dmgV ? ' / F長押し: 修理' : '');
      ui.interactHint.style.display = 'block';
    }
  } else if (dmgV && !isMobile) {
    ui.interactHint.textContent = 'F長押し: ' + dmgV.name + ' を修理' + (repairing ? ' 修理中...' : '');
    ui.interactHint.style.display = 'block';
  } else {
    ui.interactHint.style.display = 'none';
    if (isMobile) ui.btnVehicle.style.display = 'none';
  }
}
/* =========================================================
   v0.3.5: ヘルプ画面 (Hキー)
   ========================================================= */
let helpOpen = false;
const helpWrap = document.getElementById('help-wrap');
{
  const PC_HELP = [
    ['移動', [['W A S D', '移動'], ['Shift', 'ダッシュ(スタミナ消費)'], ['Space', 'ジャンプ / 空中でパラシュート開閉'], ['C', 'しゃがみ(ダッシュ中=スライディング)'], ['Z', '伏せ'], ['はしご', 'W/Sで昇降'], ['マウス', '視点']]],
    ['戦闘', [['左クリック', '射撃'], ['右クリック', 'エイム(ADS)'], ['R', 'リロード'], ['G', 'グレネード'], ['N', 'スモークグレネード'], ['V', 'ナイフ(背後は一撃)'], ['1〜4', '武器切替(0.5秒の隙)']]],
    ['乗り物', [['E', '乗る / 降りる'], ['X', '座席切替'], ['W/S', '前進 / 後退'], ['A/D', '旋回'], ['Space/C', 'ヘリ上昇 / 下降'], ['Q', 'ヘリロケット'], ['H', 'クラクション(車内)'], ['F 長押し', '車両修理']]],
    ['その他', [['T', '偵察ドローン'], ['M', '全体マップ'], ['Tab', 'スコアボード'], ['H', 'このヘルプ'], ['Esc', '閉じる']]]
  ];
  const MOBILE_HELP = [
    ['移動', [['左ドラッグ', '移動(前いっぱいでダッシュ)'], ['右ドラッグ', '視点'], ['JUMP', 'ジャンプ / パラシュート開閉'], ['⇩', 'しゃがみ(長押し=伏せ / ダッシュ中=スライディング)']]],
    ['戦闘', [['FIRE', '射撃(ドラッグで視点も動く)'], ['AIM', 'エイム切替'], ['RELOAD', 'リロード'], ['GRND', 'グレネード'], ['SMK', 'スモークグレネード'], ['🔪', 'ナイフ(背後は一撃)'], ['WPN', '武器切替']]],
    ['乗り物', [['乗る/降りる', '乗降'], ['席', '座席切替'], ['▲UP/▼DN', 'ヘリ上昇 / 下降'], ['🚀', 'ヘリロケット'], ['📢', 'クラクション'], ['修理', '車両修理']]],
    ['その他', [['DRN', '偵察ドローン'], ['MAP', '全体マップ'], ['戦績', 'スコアボード'], ['⚙', '設定']]]
  ];
  const data = isMobile ? MOBILE_HELP : PC_HELP;
  document.getElementById('help-cols').innerHTML = data.map(([sec, rows]) =>
    `<div><div class="help-sec">${sec}</div>` +
    rows.map(([k, v]) => `<div class="help-row"><span class="hk">${k}</span><span>${v}</span></div>`).join('') +
    '</div>'
  ).join('');
}
function toggleHelp(force) {
  helpOpen = force !== undefined ? force : !helpOpen;
  helpWrap.style.display = helpOpen ? 'flex' : 'none';
  if (helpOpen && document.pointerLockElement) document.exitPointerLock();
}
helpWrap.addEventListener('click', () => toggleHelp(false));

/* =========================================================
   v0.2.3: スコアボード (Tabキー / 戦績ボタン)
   ========================================================= */
let scoreboardOpen = false;
const sbWrap = document.getElementById('scoreboard-wrap');
function toggleScoreboard(force) {
  if (!game.running) return;
  scoreboardOpen = force !== undefined ? force : !scoreboardOpen;
  sbWrap.style.display = scoreboardOpen ? 'flex' : 'none';
  if (scoreboardOpen) drawScoreboard();
}
sbWrap.addEventListener('click', () => toggleScoreboard(false));
function sbRow(name, score, k, d, alive, me = false) {
  return `<div class="sb-row${me ? ' me' : ''}"><span>${name}</span><span>${score}</span><span>${k}</span><span>${d}</span><span class="${alive ? '' : 'dead'}">${alive ? '出撃中' : '戦死'}</span></div>`;
}
function drawScoreboard() {
  const blue = [], red = [];
  // プレイヤー
  blue.push({ name: 'YOU', score: game.score, kills: game.kills, deaths: player.deaths || 0, alive: player.alive, me: true });
  for (const s of soldiers) {
    (s.team === 1 ? blue : red).push({ name: s.name, score: s.score, kills: s.kills, deaths: s.deaths, alive: s.alive });
  }
  blue.sort((a, b) => b.score - a.score || b.kills - a.kills);
  red.sort((a, b) => b.score - a.score || b.kills - a.kills);
  document.getElementById('sb-blue-tk').textContent = 'チケット ' + game.ticketsBlue;
  document.getElementById('sb-red-tk').textContent = 'チケット ' + game.ticketsRed;
  document.getElementById('sb-blue-rows').innerHTML = blue.map(p => sbRow(p.name, p.score, p.kills, p.deaths, p.alive, p.me)).join('');
  document.getElementById('sb-red-rows').innerHTML = red.map(p => sbRow(p.name, p.score, p.kills, p.deaths, p.alive)).join('');
}

/* =========================================================
   v0.2.3: 設定画面 (描画品質・感度・描画距離)
   ========================================================= */
const settings = { quality: isMobile ? 'mid' : 'high', sens: 1.0, fogDist: 'mid' };
try {
  const saved = JSON.parse(localStorage.getItem('sf_settings') || 'null');
  if (saved) Object.assign(settings, saved);
} catch (e) { /* ignore */ }
function saveSettings() {
  try { localStorage.setItem('sf_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
function applyQuality() {
  const q = settings.quality;
  const pr = q === 'low' ? (isMobile ? 0.75 : 1) : q === 'mid' ? (isMobile ? 1.0 : 1.5) : Math.min(window.devicePixelRatio, isMobile ? 1.25 : 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = q === 'high' && !isMobile;
  sun.castShadow = q === 'high' && !isMobile;
}
function applyFogDist() {
  const f = settings.fogDist;
  // v0.3.3: マップ2倍化に合わせ視程を延長
  if (f === 'near') { scene.fog.near = 80; scene.fog.far = 300; }
  else if (f === 'mid') { scene.fog.near = 140; scene.fog.far = 520; }
  else { scene.fog.near = 200; scene.fog.far = 760; }
}
let settingsOpen = false;
const setWrap = document.getElementById('settings-wrap');
function toggleSettings(force) {
  settingsOpen = force !== undefined ? force : !settingsOpen;
  setWrap.style.display = settingsOpen ? 'flex' : 'none';
  if (settingsOpen && document.pointerLockElement) document.exitPointerLock();
}
function syncSettingsUI() {
  document.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('sel', b.dataset.q === settings.quality));
  document.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('sel', b.dataset.f === settings.fogDist));
  document.getElementById('sens-range').value = settings.sens;
  document.getElementById('sens-val').textContent = settings.sens.toFixed(1);
  document.getElementById('fog-val').textContent = settings.fogDist === 'near' ? '近い' : settings.fogDist === 'far' ? '遠い' : '標準';
}
document.getElementById('btn-settings').addEventListener('click', () => toggleSettings());
document.getElementById('settings-close').addEventListener('click', () => toggleSettings(false));
document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
  settings.quality = b.dataset.q; applyQuality(); syncSettingsUI(); saveSettings();
}));
document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
  settings.fogDist = b.dataset.f; applyFogDist(); syncSettingsUI(); saveSettings();
}));
document.getElementById('sens-range').addEventListener('input', e => {
  settings.sens = parseFloat(e.target.value);
  document.getElementById('sens-val').textContent = settings.sens.toFixed(1);
  saveSettings();
});
applyQuality(); applyFogDist(); syncSettingsUI();

/* =========================================================
   v0.2.2: 全体マップ (Mキー / MAPボタン)
   ========================================================= */
let fullmapOpen = false;
const fmWrap = document.getElementById('fullmap-wrap');
const fmCanvas = document.getElementById('fullmap');
const fmCtx = fmCanvas.getContext('2d');
function toggleFullmap() {
  if (!game.running) return;
  fullmapOpen = !fullmapOpen;
  fmWrap.style.display = fullmapOpen ? 'flex' : 'none';
  if (fullmapOpen) drawFullmap();
}
fmWrap.addEventListener('click', () => toggleFullmap());
function drawFullmap(canvas2 = fmCanvas, ctx2 = fmCtx, deployMode = false) {
  const S = canvas2.width, HALF = WORLD + 10;
  const g = ctx2;
  const toMap = (wx, wz) => [(wx + HALF) / (HALF * 2) * S, (wz + HALF) / (HALF * 2) * S];
  g.clearRect(0, 0, S, S);
  // 背景
  g.fillStyle = '#12222f';
  g.fillRect(0, 0, S, S);
  // v0.3: 湖 + 島
  {
    const [lx, ly] = toMap(LAKE.x, LAKE.z);
    g.fillStyle = 'rgba(46,111,142,.75)';
    g.beginPath(); g.arc(lx, ly, LAKE.r / (HALF * 2) * S, 0, 7); g.fill();
    const [ix2, iy2] = toMap(ISLAND.x, ISLAND.z);
    g.fillStyle = '#2c4638';
    g.beginPath(); g.arc(ix2, iy2, ISLAND.r / (HALF * 2) * S, 0, 7); g.fill();
  }
  // 道路
  g.strokeStyle = 'rgba(160,150,120,.5)';
  g.lineWidth = 4;
  for (const r of ROADS) {
    const [x1, y1] = toMap(r[0], r[1]);
    const [x2, y2] = toMap(r[2], r[3]);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  // HQ
  g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const [bx, by] = toMap(HQ_BLUE.x, HQ_BLUE.z);
  g.fillStyle = '#3d7fe0'; g.fillRect(bx - 8, by - 8, 16, 16);
  g.fillStyle = '#fff'; g.fillText('HQ', bx, by);
  const [rx2, ry2] = toMap(HQ_RED.x, HQ_RED.z);
  g.fillStyle = '#d03428'; g.fillRect(rx2 - 8, ry2 - 8, 16, 16);
  g.fillStyle = '#fff'; g.fillText('HQ', rx2, ry2);
  // 拠点
  for (const f of flags) {
    const [px, py] = toMap(f.x, f.z);
    g.fillStyle = f.own === 1 ? '#6db4ff' : f.own === -1 ? '#ff6b5e' : '#cccccc';
    g.beginPath(); g.arc(px, py, 11, 0, 7); g.fill();
    g.fillStyle = '#06131f'; g.fillText(f.id, px, py + 0.5);
  }
  // ピックアップ
  for (const pk of pickups) {
    if (!pk.active) continue;
    const [px, py] = toMap(pk.x, pk.z);
    g.fillStyle = pk.type === 'ammo' ? '#a0c060' : '#ff8080';
    g.fillRect(px - 2.5, py - 2.5, 5, 5);
  }
  // 兵士 (v0.3: スポットされた敵は発光)
  for (const s of soldiers) {
    if (!s.alive) continue;
    const [px, py] = toMap(s.obj.position.x, s.obj.position.z);
    if (s.team === -1 && s.spotted > 0) {
      g.fillStyle = '#ffd257';
      g.beginPath(); g.arc(px, py, 4.5, 0, 7); g.fill();
    }
    g.fillStyle = s.team === 1 ? '#6db4ff' : '#ff4438';
    g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill();
  }
  // 車両 (v0.3: 種別記号)
  g.font = 'bold 8px sans-serif';
  for (const v of vehicles) {
    if (!v.alive) continue;
    const [px, py] = toMap(v.obj.position.x, v.obj.position.z);
    g.fillStyle = '#5aff9c';
    g.fillRect(px - 3.5, py - 3.5, 7, 7);
    g.fillStyle = '#06131f';
    g.fillText(v.type === 'heli' ? 'H' : v.type === 'boat' ? 'B' : v.type === 'tank' ? 'T' : v.type === 'aa' ? 'A' : v.type === 'mg' ? 'M' : 'J', px - 2.5, py + 3);
  }
  // v0.3: ドローン
  if (drone.active) {
    const [dx2, dy2] = toMap(drone.pos.x, drone.pos.z);
    g.fillStyle = '#ffd257';
    g.fillRect(dx2 - 3, dy2 - 3, 6, 6);
  }
  if (deployMode) return;   // デプロイ画面では自機矢印を描かない
  // プレイヤー (向き付き矢印)
  const [ppx, ppy] = toMap(player.pos.x, player.pos.z);
  g.save();
  g.translate(ppx, ppy);
  g.rotate(-player.yaw + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -8); g.lineTo(-5.5, 6); g.lineTo(5.5, 6); g.closePath(); g.fill();
  g.restore();
}

/* =========================================================
   v0.3: デプロイ画面 — リスポーン時に出撃地点をマップから選択
   ========================================================= */
let deployReady = false;        // タイマー完了後 true → 選択待ち
let deploySelected = null;      // 選択中の出撃地点
const deployWrap = document.getElementById('deploy-wrap');
const dpCanvas = document.getElementById('deploy-map');
const dpCtx = dpCanvas.getContext('2d');
function deployPoints() {
  const pts = [{ id: 'HQ', x: HQ_BLUE.x, z: HQ_BLUE.z }];
  for (const f of flags) if (f.own === 1) pts.push({ id: f.id, x: f.x, z: f.z });
  if (typeof squadDeployPoints === 'function') pts.push(...squadDeployPoints());
  return pts;
}
function openDeployScreen() {
  deployReady = true;
  deploySelected = deploySelected || deployPoints()[0];
  document.getElementById('respawn-screen').style.display = 'none';
  deployWrap.style.display = 'flex';
  drawDeployMap();
}
function drawDeployMap() {
  drawFullmap(dpCanvas, dpCtx, true);
  const S = dpCanvas.width, HALF = WORLD + 10;
  const toMap = (wx, wz) => [(wx + HALF) / (HALF * 2) * S, (wz + HALF) / (HALF * 2) * S];
  const g = dpCtx;
  // 出撃可能地点をハイライト
  for (const p of deployPoints()) {
    const [px, py] = toMap(p.x, p.z);
    const sel = deploySelected && deploySelected.id === p.id;
    g.strokeStyle = sel ? '#ffd257' : 'rgba(140,220,160,.9)';
    g.lineWidth = sel ? 3 : 2;
    g.beginPath(); g.arc(px, py, sel ? 17 : 14, 0, 7); g.stroke();
    if (sel) {
      g.fillStyle = 'rgba(255,210,87,.18)';
      g.beginPath(); g.arc(px, py, 17, 0, 7); g.fill();
    }
  }
}
function pickDeployAt(cx, cy) {
  const rect = dpCanvas.getBoundingClientRect();
  const S = dpCanvas.width, HALF = WORLD + 10;
  const mx = (cx - rect.left) / rect.width * S;
  const my = (cy - rect.top) / rect.height * S;
  let best = null, bd = 30;
  for (const p of deployPoints()) {
    const px = (p.x + HALF) / (HALF * 2) * S;
    const py = (p.z + HALF) / (HALF * 2) * S;
    const d = Math.hypot(mx - px, my - py);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) { deploySelected = best; drawDeployMap(); }
}
dpCanvas.addEventListener('click', e => pickDeployAt(e.clientX, e.clientY));
dpCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  pickDeployAt(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
document.getElementById('deploy-btn').addEventListener('click', () => {
  if (!deployReady) return;
  deployWrap.style.display = 'none';
  deployReady = false;
  // 選択拠点が失陷していたらHQにフォールバック
  const pts = deployPoints();
  const sp = pts.find(p => deploySelected && p.id === deploySelected.id) || pts[0];
  respawnPlayer({ x: sp.x, z: sp.z });
  if (!isMobile) canvas.requestPointerLock();
});

function drawRadar() {
  const g = ui.radar, S = 112, C = S / 2, RANGE = 95;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(120,200,255,.25)';
  g.beginPath(); g.arc(C, C, 37, 0, 7); g.stroke();
  g.beginPath(); g.arc(C, C, 19, 0, 7); g.stroke();
  const toRadar = (wx, wz) => {
    const dx = wx - player.pos.x, dz = wz - player.pos.z;
    const rx = dx * Math.cos(-player.yaw) - dz * Math.sin(-player.yaw);
    const rz = dx * Math.sin(-player.yaw) + dz * Math.cos(-player.yaw);
    return [C + rx / RANGE * C, C + rz / RANGE * C];
  };
  // 拠点 (色つき文字)
  g.font = 'bold 10px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const f of flags) {
    let [px, pz] = toRadar(f.x, f.z);
    const dd = Math.hypot(px - C, pz - C);
    if (dd > C - 8) { // 端にクランプ
      px = C + (px - C) / dd * (C - 8);
      pz = C + (pz - C) / dd * (C - 8);
    }
    g.fillStyle = f.own === 1 ? '#6db4ff' : f.own === -1 ? '#ff6b5e' : '#cccccc';
    g.beginPath(); g.arc(px, pz, 6, 0, 7); g.fill();
    g.fillStyle = '#06131f';
    g.fillText(f.id, px, pz + 0.5);
  }
  // 車両
  for (const v of vehicles) {
    if (!v.alive || v === curVehicle) continue;
    const [px, pz] = toRadar(v.obj.position.x, v.obj.position.z);
    if (Math.hypot(px - C, pz - C) < C - 5) {
      g.fillStyle = '#5aff9c';
      g.fillRect(px - 3, pz - 3, 6, 6);
    }
  }
  // 兵士 (敵=赤 / 味方=青)
  for (const s of soldiers) {
    if (!s.alive) continue;
    const [px, pz] = toRadar(s.obj.position.x, s.obj.position.z);
    if (Math.hypot(px - C, pz - C) < C - 4) {
      g.fillStyle = s.team === 1 ? '#6db4ff' : '#ff4438';
      g.beginPath(); g.arc(px, pz, 2.6, 0, 7); g.fill();
    }
  }
  // v0.5.0: 現在の姿勢・移動速度に応じた足音到達範囲
  if (typeof drawFootstepRadarV050 === 'function') drawFootstepRadarV050(g, C, RANGE);
  // player arrow
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(C, C - 6); g.lineTo(C - 4, C + 4); g.lineTo(C + 4, C + 4); g.closePath(); g.fill();
}
