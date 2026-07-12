'use strict';
/* STEEL FRONT — グレネード / スモーク / ピックアップ / ダメージ表示 (combat.js から分割) */

/* =========================================================
   v0.2.2: グレネード (物理投擲・プール)
   ========================================================= */
const grenades = { count: 3, max: 3 };
const NADE_MAX = 4;
const nadePool = [];
{
  const nGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const nMat = new THREE.MeshLambertMaterial({ color: 0x3a5a2a });
  for (let i = 0; i < NADE_MAX; i++) {
    const m = new THREE.Mesh(nGeo, nMat);
    m.visible = false;
    scene.add(m);
    nadePool.push({ m, vel: new THREE.Vector3(), fuse: 0, active: false });
  }
}
function throwGrenade() {
  if (!player.alive || curVehicle || grenades.count <= 0) return;
  const g = nadePool.find(n => !n.active);
  if (!g) return;
  grenades.count--;
  sfx.pin();
  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  g.m.position.copy(camera.position).addScaledVector(dir, 0.6);
  g.vel.copy(dir).multiplyScalar(16);
  g.vel.y += 4.5;   // 山なり弾道
  g.fuse = 2.2;
  g.active = true;
  g.m.visible = true;
  updateAmmoUI();
}
function updateGrenades(dt) {
  for (const g of nadePool) {
    if (!g.active) continue;
    g.fuse -= dt;
    g.vel.y -= 16 * dt;
    const p = g.m.position;
    p.addScaledVector(g.vel, dt);
    // 地形バウンド
    const gy = terrainH(p.x, p.z) + 0.13;
    if (p.y < gy) {
      p.y = gy;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.6; g.vel.z *= 0.6;
      if (Math.abs(g.vel.y) < 0.8) g.vel.y = 0;
    }
    // 建物にぶつかったら反射 (簡易)
    if (collidesAt(p.x, p.z, 0.15, p.y - 0.13)) {
      g.vel.x *= -0.4; g.vel.z *= -0.4;
      p.addScaledVector(g.vel, dt * 2);
    }
    if (g.fuse <= 0) {
      g.active = false; g.m.visible = false;
      explodeAt(p.clone().setY(Math.max(p.y, terrainH(p.x, p.z) + 0.4)), 7, 120);
    }
  }
}

/* =========================================================
   v0.4.1: AIのグレネード投擲 + スモーク
   ========================================================= */
const AI_NADE_MAX = 5;
const aiNadePool = [];
{
  const nGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const nMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
  for (let i = 0; i < AI_NADE_MAX; i++) {
    const m = new THREE.Mesh(nGeo, nMat);
    m.visible = false;
    scene.add(m);
    aiNadePool.push({ m, vel: new THREE.Vector3(), fuse: 0, active: false, team: 0 });
  }
}
function aiThrowGrenade(s, tPos) {
  const g = aiNadePool.find(n => !n.active);
  if (!g) return;
  const sp = s.obj.position;
  const from = new THREE.Vector3(sp.x, sp.y + 1.6, sp.z);
  const d = Math.hypot(tPos.x - from.x, tPos.z - from.z);
  const dir = tPos.clone().sub(from).normalize();
  g.m.position.copy(from);
  g.vel.copy(dir).multiplyScalar(Math.min(17, 8 + d * 0.5));
  g.vel.y += 4.5 + d * 0.12;   // 山なり (距離に応じ上向き)
  g.fuse = 2.4;
  g.active = true;
  g.team = s.team;
  g.m.visible = true;
  if (camera.position.distanceTo(from) < 40) addFeed('⚠ グレネード!', 'red');
}
function updateAiGrenades(dt) {
  for (const g of aiNadePool) {
    if (!g.active) continue;
    g.fuse -= dt;
    g.vel.y -= 16 * dt;
    const p = g.m.position;
    p.addScaledVector(g.vel, dt);
    const gy = terrainH(p.x, p.z) + 0.13;
    if (p.y < gy) {
      p.y = gy;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.6; g.vel.z *= 0.6;
    }
    if (collidesAt(p.x, p.z, 0.15, p.y - 0.13)) {
      g.vel.x *= -0.4; g.vel.z *= -0.4;
      p.addScaledVector(g.vel, dt * 2);
    }
    if (g.fuse <= 0) {
      g.active = false; g.m.visible = false;
      explodeAt(p.clone().setY(Math.max(p.y, terrainH(p.x, p.z) + 0.4)), 6.5, 95);
    }
  }
}

/* ---------- v0.4.1: スモーク (視線を遮る煙幕) ---------- */
const SMOKE_MAX = 4;
const smokes = [];
{
  const sGeo = new THREE.SphereGeometry(1, 10, 8);
  const sMat = new THREE.MeshLambertMaterial({ color: 0xcccccc, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < SMOKE_MAX; i++) {
    const grp = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(sGeo, sMat);
      m.position.set((Math.random() - .5) * 3.5, Math.random() * 2.2, (Math.random() - .5) * 3.5);
      m.scale.setScalar(1.4 + Math.random() * 1.2);
      grp.add(m);
    }
    grp.visible = false;
    scene.add(grp);
    smokes.push({ grp, ttl: 0, pos: new THREE.Vector3() });
  }
}
function spawnSmokeAt(pos) {
  const s = smokes.find(x => x.ttl <= 0) || smokes[0];
  s.ttl = 14;
  s.pos.copy(pos);
  s.grp.position.copy(pos);
  s.grp.visible = true;
  s.grp.scale.setScalar(0.2);
}
function updateSmokes(dt) {
  for (const s of smokes) {
    if (s.ttl <= 0) continue;
    s.ttl -= dt;
    const grow = Math.min(1, (14 - s.ttl) * 1.4);
    s.grp.scale.setScalar(0.2 + grow * 0.9);
    s.grp.rotation.y += dt * 0.15;
    if (s.ttl < 2.5) {
      s.grp.traverse(m => { if (m.isMesh) m.material.opacity = 0.55 * (s.ttl / 2.5); });
    }
    if (s.ttl <= 0) {
      s.grp.visible = false;
      s.grp.traverse(m => { if (m.isMesh) m.material.opacity = 0.55; });
    }
  }
}
// 視線がスモークを通るか (簡易: 線分と煙中心の距離)
function smokeBlocks(from, to) {
  for (const s of smokes) {
    if (s.ttl <= 0 || s.ttl > 13.2) continue;   // 展開直後は効果薄
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 0.01) continue;
    let t = ((s.pos.x - from.x) * dx + (s.pos.y - from.y) * dy + (s.pos.z - from.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = from.x + dx * t, cy = from.y + dy * t, cz = from.z + dz * t;
    if (Math.hypot(s.pos.x - cx, s.pos.y + 1.2 - cy, s.pos.z - cz) < 4.2) return true;
  }
  return false;
}

/* =========================================================
   v0.2.2: 弾薬・回復パック (拠点周辺 + マップ各所)
   ========================================================= */
const pickups = [];
{
  const ammoGeo = new THREE.BoxGeometry(0.7, 0.45, 0.5);
  const ammoMat = new THREE.MeshLambertMaterial({ color: 0x3f6d2f });
  const hpGeo = new THREE.BoxGeometry(0.62, 0.45, 0.62);
  const hpMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe03428 });
  function makePickup(type, x, z) {
    const grp = new THREE.Group();
    if (type === 'ammo') {
      grp.add(new THREE.Mesh(ammoGeo, ammoMat));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.52), new THREE.MeshBasicMaterial({ color: 0xd8c26a }));
      grp.add(stripe);
    } else {
      grp.add(new THREE.Mesh(hpGeo, hpMat));
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), crossMat); c1.position.set(0, 0.24, 0);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.36), crossMat); c2.position.set(0, 0.24, 0);
      grp.add(c1, c2);
    }
    const gy = terrainH(x, z);
    grp.position.set(x, gy + 0.35, z);
    scene.add(grp);
    pickups.push({ type, x, z, y: gy, obj: grp, active: true, respawnT: 0, bobT: Math.random() * 6 });
  }
  // 各拠点そば + 中間地点に配置
  for (const f of flags) {
    makePickup('ammo', f.x + 6, f.z + 5);
    makePickup('health', f.x - 6, f.z - 5);
  }
  makePickup('ammo', -55, 120);  makePickup('health', -60, -30);
  makePickup('ammo', 55, -120);  makePickup('health', 60, 25);
  makePickup('ammo', 100, 10);   makePickup('health', -10, 95);
  makePickup('health', HQ_BLUE.x + 8, HQ_BLUE.z + 6);
  makePickup('ammo', HQ_BLUE.x - 8, HQ_BLUE.z + 6);
  makePickup('health', HQ_RED.x - 8, HQ_RED.z - 6);
  makePickup('ammo', HQ_RED.x + 8, HQ_RED.z - 6);
}
const PICKUP_RESPAWN = 25;
function updatePickups(dt) {
  for (const pk of pickups) {
    if (!pk.active) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) { pk.active = true; pk.obj.visible = true; }
      continue;
    }
    // ふわふわ回転で目立たせる
    pk.bobT += dt * 2;
    pk.obj.position.y = pk.y + 0.42 + Math.sin(pk.bobT) * 0.09;
    pk.obj.rotation.y += dt * 1.4;
    if (!player.alive || curVehicle) continue;
    const d = Math.hypot(player.pos.x - pk.x, player.pos.z - pk.z);
    if (d < 1.6) {
      if (pk.type === 'ammo') {
        const w = weaponDef();
        if (weapon.reserve >= w.reserve && grenades.count >= grenades.max) continue; // 満タンなら取らない
        weapon.reserve = Math.min(w.reserve, weapon.reserve + Math.ceil(w.reserve * 0.5));
        grenades.count = Math.min(grenades.max, grenades.count + 1);
        addFeed('弾薬を補給した', 'blue');
      } else {
        if (player.hp >= player.maxHp) continue;
        player.hp = Math.min(player.maxHp, player.hp + 50);
        ui.vignette.style.opacity = 0;
        addFeed('回復パックを使用 +50', 'blue');
        updateHpUI();
      }
      sfx.pickup();
      updateAmmoUI();
      pk.active = false; pk.obj.visible = false; pk.respawnT = PICKUP_RESPAWN;
    }
  }
}

// ---------- ダメージ方向インジケーター (v0.2.1) ----------
const DMG_ARC_MAX = 6;
const dmgArcs = [];
{
  const holder = document.getElementById('dmg-indicators');
  for (let i = 0; i < DMG_ARC_MAX; i++) {
    const d = document.createElement('div');
    d.className = 'dmg-arc';
    holder.appendChild(d);
    dmgArcs.push({ el: d, ttl: 0, worldAngle: 0 });
  }
}
let dmgArcIdx = 0;
// fromPos: 攻撃元のワールド座標
function showDamageDirection(fromPos) {
  if (!fromPos) return;
  const a = dmgArcs[dmgArcIdx++ % DMG_ARC_MAX];
  // プレイヤーから見た攻撃元の方位角 (ワールド)
  a.worldAngle = Math.atan2(fromPos.x - player.pos.x, -(fromPos.z - player.pos.z));
  a.ttl = 1.1;
}
function updateDamageArcs(dt) {
  for (const a of dmgArcs) {
    if (a.ttl <= 0) { a.el.style.opacity = 0; continue; }
    a.ttl -= dt;
    // カメラのyawに応じて画面上の向きを更新 (前方=上)
    const rel = a.worldAngle + player.yaw;
    a.el.style.transform = `rotate(${(-rel * 180 / Math.PI)}deg)`;
    a.el.style.opacity = Math.min(1, a.ttl / 0.35);
  }
}
