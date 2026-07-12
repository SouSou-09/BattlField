'use strict';
/* v0.5.10 — 銃創部位別エフェクト / 血痕蓄積 / 負傷モーション強化 / 環境音オクルージョン /
   BGM緊張度連動 / リプレイカメラ全体化 / 天候システム / 昼夜サイクル /
   スコアボードフィルタ / キルフィード / ミニマップズーム */

const v0510 = {
  // 2. 血痕蓄積
  blood: { decals: [], cursor: 0, max: 80 },
  // 3. 負傷モーション
  injuryT: 0,
  // 4. 環境音オクルージョン
  audio: { indoor: false, occlusion: 0, checkT: 0 },
  // 5. BGM緊張度連動
  bgm: { nodes: null, tension: 0, target: 0, updateT: 0 },
  // 6. リプレイカメラ
  replay: { active: false, t: 0, duration: 5, yaw: 0, height: 16, radius: 20 },
  // 7. 天候システム
  weather: { type: 'clear', t: 0, nextChange: 45, rainPoints: null, rainCount: 0, rainVel: null, rainSound: null },
  // 8. 昼夜サイクル (0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk)
  dayNight: { time: 0.32, speed: 1 / 480, updateT: 0 },
  // 9. スコアボードフィルタ
  scoreboard: { sortMode: 0, barEl: null },
  // 10. キルフィード
  killFeedEl: null,
  // 11. ミニマップズーム
  minimap: { zoom: 1, target: 1 }
};

// 血痕デカール用共有ジオメトリ
const v0510_bloodGeo = new THREE.CircleGeometry(1, 10);
v0510_bloodGeo.rotateX(-Math.PI / 2);

/* =========================================================
   1. 銃創エフェクト部位別描写
   ========================================================= */
function onSoldierHitV0510(s, point, isHead) {
  if (!s || !s.obj) return;
  const dy = point ? point.y - s.obj.position.y : 1;
  if (isHead) {
    spawnParticles(point, 0x8a1010, 4, 2.5, 0.8);
  } else if (dy < 0.8) {
    spawnParticles(point, 0x991111, 8, 3.5, 1.1);
  } else {
    spawnParticles(point, 0x8a1a1a, 5, 3, 0.9);
  }
  if (typeof addBloodDecalV0510 === 'function')
    addBloodDecalV0510(s.obj.position, s.hp <= 0 ? 0.75 : 0.3);
}

/* =========================================================
   2. 血痕の地面蓄積 — 時間経過でフェードアウト
   ========================================================= */
function addBloodDecalV0510(pos, size) {
  let decal = v0510.blood.decals[v0510.blood.cursor++ % v0510.blood.max];
  if (!decal) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x5a1212, transparent: true, opacity: 0.7,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4
    });
    const mesh = new THREE.Mesh(v0510_bloodGeo, mat);
    scene.add(mesh);
    decal = { mesh, ttl: 0, maxTtl: 1 };
    v0510.blood.decals.push(decal);
  }
  const px = pos.x + (Math.random() - 0.5) * 0.5;
  const pz = pos.z + (Math.random() - 0.5) * 0.5;
  decal.mesh.visible = true;
  decal.mesh.material.opacity = 0.7;
  decal.mesh.material.color.setHex(0x5a1212);
  decal.mesh.position.set(px, terrainH(px, pz) + 0.04, pz);
  decal.mesh.scale.setScalar(size + Math.random() * 0.12);
  decal.mesh.rotation.z = Math.random() * Math.PI;
  decal.ttl = 35 + Math.random() * 15;
  decal.maxTtl = decal.ttl;
}

function updateBloodV0510(dt) {
  for (const d of v0510.blood.decals) {
    if (d.ttl <= 0) continue;
    d.ttl -= dt;
    if (d.ttl <= 0) { d.mesh.visible = false; continue; }
    const fadeStart = d.maxTtl * 0.5;
    if (d.ttl < fadeStart) d.mesh.material.opacity = 0.7 * (d.ttl / fadeStart);
  }
}

/* =========================================================
   3. 負傷モーション強化 — 低HP時のAI/プレイヤー演技
   ========================================================= */
function updateInjuryMotionV0510(s) {
  if (!s.alive || s.hp >= 50) return;
  const k = (50 - s.hp) / 50;
  const stumble = Math.sin(s.walkPhase * 0.7) * k * 0.25;
  s.legL.rotation.x += stumble;
  s.legR.rotation.x -= stumble;
  s.obj.rotation.x = Math.min(s.obj.rotation.x + k * 0.12, 0.18);
}

function updateInjuryMotionPlayerV0510(dt) {
  if (!player.alive || player.hp >= 35 || v0510.replay.active) return;
  v0510.injuryT += dt;
  const k = 1 - player.hp / 35;
  camera.position.x += Math.sin(v0510.injuryT * 2.5) * 0.01 * k;
  camera.position.y += Math.sin(v0510.injuryT * 1.5) * 0.006 * k;
}

/* =========================================================
   4. 環境音オクルージョン — 建物内/壁越しの音の減衰
   ========================================================= */
function updateAudioOcclusionV0510(dt) {
  v0510.audio.checkT -= dt;
  if (v0510.audio.checkT > 0) return;
  v0510.audio.checkT = 0.2;
  const indoors = obstacles.some(o =>
    player.pos.x > o.minX && player.pos.x < o.maxX &&
    player.pos.z > o.minZ && player.pos.z < o.maxZ &&
    player.pos.y < o.h
  );
  v0510.audio.indoor = indoors;
  let target = indoors ? 0.4 : 0;
  if (v0510.weather.type === 'rain') target = Math.min(0.6, target + 0.15);
  if (v0510.weather.type === 'fog') target = Math.min(0.5, target + 0.08);
  v0510.audio.occlusion += (target - v0510.audio.occlusion) * 0.3;
}

function getAudioOcclusionV0510() { return v0510.audio.occlusion; }

/* =========================================================
   5. BGM緊張度連動 — 戦況に応じてBGMが変化
   ========================================================= */
function initBgmV0510() {
  if (!AC || v0510.bgm.nodes) return;
  const o1 = AC.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
  const g1 = AC.createGain(); g1.gain.value = 0.018;
  o1.connect(g1).connect(AC.destination); o1.start();
  const o2 = AC.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 110;
  const f2 = AC.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 300;
  const g2 = AC.createGain(); g2.gain.value = 0;
  o2.connect(f2).connect(g2).connect(AC.destination); o2.start();
  const o3 = AC.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 220;
  const g3 = AC.createGain(); g3.gain.value = 0;
  o3.connect(g3).connect(AC.destination); o3.start();
  v0510.bgm.nodes = { o1, g1, o2, f2, g2, o3, g3 };
}

function updateBgmTensionV0510(dt) {
  if (!v0510.bgm.nodes) return;
  v0510.bgm.updateT -= dt;
  if (v0510.bgm.updateT > 0) return;
  v0510.bgm.updateT = 0.5;
  const ticketDiff = game.ticketsBlue - game.ticketsRed;
  const strategic = Math.max(0, Math.min(1, -ticketDiff / 50));
  const hpTension = Math.max(0, (40 - player.hp) / 40);
  let nearby = 0;
  for (const s of soldiers) {
    if (!s.alive || s.team !== -1) continue;
    if (s.obj.position.distanceTo(player.pos) < 35) nearby++;
  }
  const combat = Math.min(1, nearby * 0.22);
  v0510.bgm.target = Math.min(1, strategic * 0.5 + hpTension * 0.3 + combat * 0.4);
  v0510.bgm.tension += (v0510.bgm.target - v0510.bgm.tension) * 0.3;
  const n = v0510.bgm.nodes, t = v0510.bgm.tension, now = AC.currentTime;
  n.g2.gain.setTargetAtTime(t * 0.022, now, 0.5);
  n.g3.gain.setTargetAtTime(t > 0.6 ? (t - 0.5) * 0.028 : 0, now, 0.5);
  n.f2.frequency.setTargetAtTime(300 + t * 400, now, 0.5);
}

/* =========================================================
   6. リプレイカメラ全体化 — 任意タイミングで全体リプレイ
   ========================================================= */
function isReplayActiveV0510() { return v0510.replay.active; }

function toggleReplayV0510() {
  if (!game.running || !player.alive || curVehicle || drone.active) return;
  const r = v0510.replay;
  if (r.active) { r.active = false; r.t = 0; return; }
  r.active = true;
  r.t = r.duration;
  r.yaw = player.yaw;
  firing = false;
  addFeed('リプレイカメラ (' + r.duration + 's)', 'blue');
}

function updateReplayV0510(dt) {
  const r = v0510.replay;
  if (!r.active) return;
  if (!player.alive) { r.active = false; r.t = 0; return; }
  r.t -= dt;
  r.yaw += dt * 0.35;
  const phase = 1 - r.t / r.duration;
  const hMod = Math.sin(phase * Math.PI) * 0.4 + 0.6;
  camera.position.set(
    player.pos.x + Math.cos(r.yaw) * r.radius,
    player.pos.y + r.height * hMod,
    player.pos.z + Math.sin(r.yaw) * r.radius
  );
  camera.lookAt(player.pos.x, player.pos.y - 0.5, player.pos.z);
  if (r.t <= 0) r.active = false;
}

/* =========================================================
   7. 天候システム — 雨/霧により視界と音が変化
   ========================================================= */
function initWeatherV0510() {
  if (v0510.weather.rainPoints) return;
  const count = isMobile ? 120 : 280;
  v0510.weather.rainCount = count;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 28;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaabbcc, size: 0.14, transparent: true, opacity: 0.55,
    depthWrite: false, fog: false
  });
  v0510.weather.rainPoints = new THREE.Points(geo, mat);
  v0510.weather.rainPoints.visible = false;
  v0510.weather.rainPoints.frustumCulled = false;
  scene.add(v0510.weather.rainPoints);
  v0510.weather.rainVel = new Float32Array(count);
  for (let i = 0; i < count; i++) v0510.weather.rainVel[i] = 25 + Math.random() * 15;
}

function applyWeatherV0510() {
  const w = v0510.weather;
  if (w.rainPoints) w.rainPoints.visible = (w.type === 'rain');
  if (w.type === 'rain') {
    if (AC && !w.rainSound) {
      const src = AC.createBufferSource(); src.buffer = noiseBufLong; src.loop = true;
      const filter = AC.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1800;
      const gain = AC.createGain(); gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(AC.destination); src.start();
      w.rainSound = { src, gain, filter };
    }
    if (w.rainSound) w.rainSound.gain.gain.setTargetAtTime(0.035, AC.currentTime, 0.5);
  } else {
    if (w.rainSound) w.rainSound.gain.gain.setTargetAtTime(0, AC.currentTime, 0.5);
  }
  const label = w.type === 'rain' ? '雨天' : w.type === 'fog' ? '濃霧' : '晴天';
  addFeed('天候変化: ' + label, '');
}

function updateWeatherV0510(dt) {
  const w = v0510.weather;
  w.t += dt;
  if (w.t > w.nextChange) {
    w.t = 0;
    w.nextChange = 55 + Math.random() * 35;
    const r = Math.random();
    w.type = r < 0.45 ? 'clear' : r < 0.78 ? 'rain' : 'fog';
    applyWeatherV0510();
  }
  if (w.type === 'rain' && w.rainPoints) {
    const pos = w.rainPoints.geometry.attributes.position.array;
    for (let i = 0; i < w.rainCount; i++) {
      pos[i * 3 + 1] -= w.rainVel[i] * dt;
      if (pos[i * 3 + 1] < -3) {
        pos[i * 3] = (Math.random() - 0.5) * 70;
        pos[i * 3 + 1] = 25 + Math.random() * 5;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      }
    }
    w.rainPoints.position.set(player.pos.x, player.pos.y, player.pos.z);
    w.rainPoints.geometry.attributes.position.needsUpdate = true;
  }
}

/* =========================================================
   8. 昼夜サイクル — 試合中に明暗が変化
   ========================================================= */
let _v0510_hemi = null;
function updateDayNightV0510(dt) {
  const dn = v0510.dayNight;
  dn.time += dn.speed * dt;
  if (dn.time >= 1) dn.time -= 1;
  dn.updateT -= dt;
  if (dn.updateT > 0) return;
  dn.updateT = 0.1;

  const angle = dn.time * Math.PI * 2 - Math.PI / 2;
  const sunY = Math.sin(angle);
  const sunX = Math.cos(angle);
  sun.position.set(sunX * 90, Math.max(8, sunY * 130), 45);

  const dayF = Math.max(0, Math.min(1, sunY * 0.8 + 0.2));
  const colDay = new THREE.Color(0xfff2d8);
  const colDusk = new THREE.Color(0xff9050);
  const colNight = new THREE.Color(0x3a4a6a);
  let sunCol;
  if (dayF > 0.7) sunCol = colDay.clone();
  else if (dayF > 0.2) sunCol = colDusk.clone().lerp(colDay, (dayF - 0.2) / 0.5);
  else sunCol = colNight.clone().lerp(colDusk, dayF / 0.2);
  sun.color.copy(sunCol);
  sun.intensity = 0.12 + dayF * 0.93;
  if (!isMobile) sun.castShadow = dayF > 0.25;

  if (!_v0510_hemi) {
    for (const c of scene.children) { if (c.isHemisphereLight) { _v0510_hemi = c; break; } }
  }
  if (_v0510_hemi) _v0510_hemi.intensity = 0.25 + dayF * 0.7;

  const fogDay = new THREE.Color(0xc3d2de);
  const fogNight = new THREE.Color(0x1a2230);
  const fogCol = fogNight.clone().lerp(fogDay, dayF);
  if (v0510.weather.type === 'rain') fogCol.multiplyScalar(0.6);
  else if (v0510.weather.type === 'fog') fogCol.multiplyScalar(0.82);
  scene.fog.color.copy(fogCol);
  renderer.setClearColor(fogCol);

  const wfm = v0510.weather.type === 'rain' ? 0.7 : v0510.weather.type === 'fog' ? 0.45 : 1;
  const bNear = settings.fogDist === 'near' ? 80 : settings.fogDist === 'far' ? 200 : 140;
  const bFar = settings.fogDist === 'near' ? 300 : settings.fogDist === 'far' ? 760 : 520;
  scene.fog.near = bNear * wfm;
  scene.fog.far = bFar * wfm;
}

/* =========================================================
   9. スコアボードフィルタ — 兵科別/武器別ソート
   ========================================================= */
const v0510_CLASSES = ['assault', 'medic', 'support', 'recon'];
function assignSoldierClassesV0510() {
  for (const s of soldiers) {
    if (!s.clsV0510) s.clsV0510 = v0510_CLASSES[Math.floor(Math.random() * 4)];
  }
}

function getScoreboardSortV0510() {
  switch (v0510.scoreboard.sortMode) {
    case 1: return (a, b) => b.kills - a.kills || b.score - a.score;
    case 2: return (a, b) => a.deaths - b.deaths || b.score - a.score;
    case 3: return (a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.score - a.score;
    case 4: return (a, b) => (a.clsV0510 || '').localeCompare(b.clsV0510 || '') || b.score - a.score;
    default: return (a, b) => b.score - a.score || b.kills - a.kills;
  }
}

function ensureScoreboardFilterV0510() {
  if (v0510.scoreboard.barEl) { updateFilterButtonsV0510(); return; }
  const bar = document.createElement('div');
  bar.id = 'sb-filter-v0510';
  bar.style.cssText = 'display:flex;gap:4px;justify-content:center;margin:4px 0 2px;flex-wrap:wrap;';
  const labels = ['SCORE', 'KILLS', 'DEATHS', 'ALIVE', 'CLASS'];
  labels.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'padding:2px 8px;font:bold 9px/1.4 sans-serif;border:1px solid rgba(120,180,255,.3);' +
      'border-radius:3px;background:rgba(20,30,42,.6);color:#8ab;cursor:pointer;letter-spacing:.5px;';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      v0510.scoreboard.sortMode = i;
      updateFilterButtonsV0510();
      drawScoreboard();
    });
    bar.appendChild(btn);
  });
  const sb = document.getElementById('scoreboard');
  if (sb) { sb.insertBefore(bar, sb.children[1] || null); v0510.scoreboard.barEl = bar; }
  updateFilterButtonsV0510();
}

function updateFilterButtonsV0510() {
  if (!v0510.scoreboard.barEl) return;
  v0510.scoreboard.barEl.querySelectorAll('button').forEach((b, i) => {
    const sel = i === v0510.scoreboard.sortMode;
    b.style.background = sel ? 'rgba(80,140,220,.5)' : 'rgba(20,30,42,.6)';
    b.style.color = sel ? '#fff' : '#8ab';
    b.style.borderColor = sel ? 'rgba(120,180,255,.7)' : 'rgba(120,180,255,.3)';
  });
}

/* =========================================================
   10. キルフィード — 誰が誰を何で倒したかを表示
   ========================================================= */
function ensureKillFeedElV0510() {
  if (v0510.killFeedEl) return;
  const el = document.createElement('div');
  el.id = 'killfeed-detail-v0510';
  el.style.cssText = 'position:absolute;top:36px;right:8px;width:230px;z-index:5;' +
    'display:flex;flex-direction:column;gap:2px;pointer-events:none;';
  document.body.appendChild(el);
  v0510.killFeedEl = el;
}

function addKillFeedV0510(killerName, victimName, weapon, isHead, killerTeam) {
  ensureKillFeedElV0510();
  const entry = document.createElement('div');
  const kc = killerTeam === 1 ? '#6db4ff' : '#ff6b5e';
  const vc = killerTeam === 1 ? '#ff6b5e' : '#6db4ff';
  entry.style.cssText = 'background:rgba(8,14,20,.78);border-radius:3px;padding:2px 6px;' +
    'font:bold 11px/1.4 sans-serif;display:flex;align-items:center;gap:4px;' +
    'border-left:3px solid ' + kc + ';opacity:0;transform:translateX(20px);transition:all .3s;';
  entry.innerHTML =
    '<span style="color:' + kc + '">' + killerName + '</span>' +
    '<span style="color:#999;font-size:9px;">[' + (weapon || 'RIFLE') + ']' + (isHead ? ' HS' : '') + '</span>' +
    '<span style="color:#555;">\u203a</span>' +
    '<span style="color:' + vc + '">' + victimName + '</span>';
  v0510.killFeedEl.appendChild(entry);
  requestAnimationFrame(() => { entry.style.opacity = '1'; entry.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    entry.style.opacity = '0'; entry.style.transform = 'translateX(20px)';
    setTimeout(() => entry.remove(), 300);
  }, 5000);
  while (v0510.killFeedEl.children.length > 6)
    v0510.killFeedEl.removeChild(v0510.killFeedEl.firstChild);
}

/* =========================================================
   11. ミニマップズーム — 拡大/縮小操作
   ========================================================= */
function radarZoomV0510() { return v0510.minimap.zoom; }
function setRadarZoomV0510(delta) {
  v0510.minimap.target = Math.max(0.5, Math.min(3, v0510.minimap.target + delta));
}

/* =========================================================
   メイン更新 / リセット
   ========================================================= */
function updateV0510(dt) {
  v0510.minimap.zoom += (v0510.minimap.target - v0510.minimap.zoom) * Math.min(1, dt * 5);
  updateBloodV0510(dt);
  updateAudioOcclusionV0510(dt);
  updateBgmTensionV0510(dt);
  updateReplayV0510(dt);
  updateWeatherV0510(dt);
  updateDayNightV0510(dt);
  updateInjuryMotionPlayerV0510(dt);
}

function resetV0510() {
  for (const d of v0510.blood.decals) d.mesh.visible = false;
  v0510.blood.cursor = 0;
  v0510.audio.occlusion = 0; v0510.audio.indoor = false; v0510.audio.checkT = 0;
  initBgmV0510();
  v0510.bgm.tension = 0; v0510.bgm.target = 0; v0510.bgm.updateT = 0;
  v0510.replay.active = false; v0510.replay.t = 0;
  v0510.weather.type = 'clear'; v0510.weather.t = 0;
  v0510.weather.nextChange = 40 + Math.random() * 20;
  if (v0510.weather.rainPoints) v0510.weather.rainPoints.visible = false;
  if (v0510.weather.rainSound) v0510.weather.rainSound.gain.gain.value = 0;
  v0510.dayNight.time = 0.32; v0510.dayNight.updateT = 0;
  v0510.scoreboard.sortMode = 0;
  v0510.minimap.zoom = 1; v0510.minimap.target = 1;
  v0510.injuryT = 0;
  assignSoldierClassesV0510();
  initWeatherV0510();
  ensureKillFeedElV0510();
  ensureScoreboardFilterV0510();
}
