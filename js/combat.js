'use strict';
/* STEEL FRONT — 戦闘: 衝突 / 射撃 / グレネード / ピックアップ / 被弾 */

// ---------- Collision helpers (地形の高さ考慮) ----------
// yRef: 判定する足元の高さ。obstacle の上面より十分高ければ通れる(=段の上に乗れる)
function collidesAt(x, z, r, yRef, skipVehicle = null) {
  if (x < -WORLD || x > WORLD || z < -WORLD || z > WORLD) return true;
  for (const o of obstacles) {
    if (x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ) {
      // 足元がオブジェクト上面近く以上なら乗り越え可能
      if (yRef !== undefined && yRef > o.h - 0.4) continue;
      // v0.2.3: オブジェクトの下をくぐれる (ドアのまぐさなど、底面が高い障害物)
      if (yRef !== undefined && yRef + 1.9 < o.y0) continue;
      return true;
    }
  }
  for (const v of vehicles) {
    if (v === skipVehicle) continue;
    const dx = x - v.obj.position.x, dz = z - v.obj.position.z;
    if (dx * dx + dz * dz < (r + v.radius) * (r + v.radius)) return true;
  }
  return false;
}
// v0.3.1: 足元の接地高さ — 地形に加えて、乗れる高さの障害物上面も地面として扱う
// (ジャンプで乗り越えた障害物の上に立てる / 階段・屋上の接地も正確に)
function groundHeightAt(x, z, r, yRef) {
  let g = terrainH(x, z);
  for (const o of obstacles) {
    if (x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ) {
      if (o.h <= yRef + 0.55 && o.h > g) g = o.h;
    }
  }
  return g;
}
const raycaster = new THREE.Raycaster();
function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  raycaster.set(from, dir.normalize());
  raycaster.far = dist - 0.5;
  if (raycaster.intersectObjects(solidMeshes, false).length > 0) return false;
  // 地形による遮蔽 (数点サンプリング)
  const steps = Math.min(10, Math.max(3, dist / 8 | 0));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    if (terrainH(x, z) > y + 0.2) return false;
  }
  return true;
}

// ---------- Shooting ----------
const shootRay = new THREE.Raycaster();

/* =========================================================
   v0.4.0: 発射体式の弾丸 — 弾速 + 弾道落下 (レイキャスト即着弾を廃止)
   スナイパーは遠距離で偏差撮ち・山なり補正が必要に
   ========================================================= */
const BULLET_MAX = 48;
const bulletPool = [];
{
  const bGeo = new THREE.SphereGeometry(0.05, 4, 3);
  const bMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
  for (let i = 0; i < BULLET_MAX; i++) {
    const m = new THREE.Mesh(bGeo, bMat);
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    bulletPool.push({ m, pos: new THREE.Vector3(), vel: new THREE.Vector3(), ttl: 0, active: false, dmg: 0, hsDmg: 0, travel: 0, maxRange: 100, pellet: false });
  }
}
let bulletIdx = 0;
function fireBullet(from, dir, w) {
  const b = bulletPool.find(x => !x.active) || bulletPool[bulletIdx++ % BULLET_MAX];
  b.active = true;
  b.pos.copy(from);
  b.vel.copy(dir).multiplyScalar(w.muzzleVel);
  b.ttl = w.range / w.muzzleVel + 0.6;
  b.dmg = w.dmg; b.hsDmg = w.hsDmg;
  b.travel = 0; b.maxRange = w.range;
  b.m.visible = true;
  b.m.position.copy(from);
}
const bulletRay = new THREE.Raycaster();
const _bPrev = new THREE.Vector3(), _bDir = new THREE.Vector3();
function updateBullets(dt) {
  for (const b of bulletPool) {
    if (!b.active) continue;
    b.ttl -= dt;
    _bPrev.copy(b.pos);
    b.vel.y -= 9.8 * dt;                       // 弾道落下
    b.pos.addScaledVector(b.vel, dt);
    const segLen = _bPrev.distanceTo(b.pos);
    b.travel += segLen;
    _bDir.copy(b.pos).sub(_bPrev).normalize();
    bulletRay.set(_bPrev, _bDir);
    bulletRay.far = segLen;
    const hitsE = bulletRay.intersectObjects(soldierHitMeshes, false)
      .filter(h => h.object.userData.soldier && h.object.userData.soldier.alive && h.object.userData.soldier.team === -1);
    const hitsW = bulletRay.intersectObjects(solidMeshes, false);
    const eDist = hitsE.length ? hitsE[0].distance : Infinity;
    const wDist = hitsW.length ? hitsW[0].distance : Infinity;
    let done = false;
    if (eDist < wDist) {
      const h = hitsE[0];
      const isHead = !!h.object.userData.isHead;
      damageSoldierByPlayer(h.object.userData.soldier, isHead ? b.hsDmg : b.dmg, h.point, isHead);
      showHitmarker(isHead);
      done = true;
      spawnTracer(_bPrev, h.point);
    } else if (wDist < Infinity) {
      const h = hitsW[0];
      const dd = h.object.userData.destructible;
      const wp = h.object.userData.windowPane;
      if (dd) damageDestructible(dd, b.dmg * 1.5);
      else if (wp) breakWindow(wp);
      else { spawnParticles(h.point, 0xb0a890, 3, 2); addBulletHole(h.point, _bDir); }   // v0.4.2予定の弾痕フック
      done = true;
      spawnTracer(_bPrev, h.point);
    } else if (b.pos.y < terrainH(b.pos.x, b.pos.z)) {
      spawnParticles(b.pos.clone().setY(terrainH(b.pos.x, b.pos.z) + 0.1), 0x8a7a5a, 3, 2);
      done = true;
    } else {
      spawnTracer(_bPrev, b.pos);
    }
    if (done || b.ttl <= 0 || b.travel > b.maxRange) {
      b.active = false;
      b.m.visible = false;
    } else {
      b.m.position.copy(b.pos);
    }
  }
}
// v0.4.2で実装予定の弾痕 (現状はノーオペ)
function addBulletHole(point, dir) { /* v0.4.2 */ }

function playerShoot() {
  if (weapon.reloading || weapon.cooldown > 0 || !player.alive) return;
  if (weapon.switchT > 0 || knife.t > 0) return;   // v0.4.0: 切替/ナイフ中は射撃不可
  const w = weaponDef();
  if (!w.auto && fireLatch) return;   // 単発武器はトリガーを引き直す必要あり
  if (weapon.mag <= 0) { sfx.empty(); weapon.cooldown = 0.25; fireLatch = true; return; }
  fireLatch = true;
  weapon.mag--; weapon.cooldown = weapon.fireInterval;
  weapon.recoil = 1; weapon.spreadHeat = Math.min(weapon.spreadHeat + 0.15, 1);
  weapon.burst++; weapon.burstResetT = 0.28;   // v0.3.5: 連射カウント
  if (curWeaponId === 'sr') sfx.snipe();
  else if (curWeaponId === 'sg') sfx.shotgun();
  else sfx.shoot();
  muzzleFlash.material.opacity = 1;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  muzzleLight.intensity = 2.5;
  // v0.3.5: 武器固有のリコイルパターン
  //  ・縦: 連射するほど銃口が上がる (序盤は強く、後半はやや落ち着く)
  //  ・横: 武器ごとの周期パターン (sin波) + 小さなランダム成分
  //  ・ADSで軽減 / 射撃をやめると一部が戻る (updatePlayer側)
  {
    const b = weapon.burst;
    const adsMul = 1 - ads.t * 0.3;
    const climb = b <= 4 ? 1.25 : Math.max(0.65, 1.25 - (b - 4) * 0.06);
    const vKick = w.recoilV * climb * adsMul;
    const hKick = (Math.sin(b * w.recoilFreq + w.recoilPhase) * 0.85 + (Math.random() - .5) * 0.3) * w.recoilH * adsMul;
    player.pitch = Math.min(player.pitch + vKick, Math.PI / 2);
    player.yaw += hKick;
    weapon.recoilPitch = Math.min(weapon.recoilPitch + vKick, 0.35);   // リカバリ用に蓄積
  }

  // 拡散: 武器定義 + ヒート + 移動ペナルティ / ADSで大幅減少
  let spread = w.baseSpread + weapon.spreadHeat * w.heatSpread + (moveMag() > 0.1 ? 0.012 : 0);
  if (w.hipPenalty && ads.t < 0.6) spread += 0.05;   // スナイパー腰だめは大きく散る
  // v0.4.0: 姿勢で命中精度アップ (しゃがみ×0.7 / 伏せ×0.5) + スタミナ切れで低下
  if (player.stance === 1) spread *= 0.7;
  else if (player.stance === 2) spread *= 0.5;
  if (player.stamina < 0.2) spread += 0.012;   // 息切れ
  spread *= (1 - ads.t * 0.85);

  // v0.4.0: 発射体方式 — 弾速と重力落下のある弾丸を射出
  for (let p = 0; p < w.pellets; p++) {
    const dir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(player.pitch + (Math.random() - .5) * spread, player.yaw + (Math.random() - .5) * spread, 0, 'YXZ'));
    fireBullet(camera.position.clone(), dir, w);
  }
  updateAmmoUI();
}

/* =========================================================
   v0.4.0: 近接攻撃 (ナイフ) — Vキー / KNFボタン
   背後からは一撃 (バックスタブ) +150
   ========================================================= */
const knife = { t: 0, cd: 0 };
function knifeAttack() {
  if (!player.alive || curVehicle || drone.active || knife.cd > 0 || weapon.switchT > 0) return;
  knife.cd = 0.65;
  knife.t = 0.32;
  sfx.knife();
  // 前方で2.4m以内の敵を探す
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best = null, bd = 2.4;
  for (const s of soldiers) {
    if (!s.alive || s.team !== -1 || s.inVehicle) continue;
    const dx = s.obj.position.x - player.pos.x, dz = s.obj.position.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bd) continue;
    if ((dx * fx + dz * fz) / (d || 0.01) < 0.35) continue;   // 前方コーン内のみ
    bd = d; best = s;
  }
  if (!best) return;
  const hitP = best.obj.position.clone().setY(best.obj.position.y + 1.2);
  // 背後判定: 敵の向きと攻撃方向が同じ → バックスタブ (即死)
  const efx = Math.sin(best.obj.rotation.y), efz = Math.cos(best.obj.rotation.y);
  const backstab = (efx * fx + efz * fz) > 0.45;
  if (backstab) {
    spawnParticles(hitP, 0xbb2222, 10, 4, 1.4);
    damageSoldierByPlayer(best, 999, hitP);
    addFeed('🔪 バックスタブ! +150', 'blue');
    game.score += 50; updateScoreUI();
  } else {
    damageSoldierByPlayer(best, 55, hitP);
  }
}
function updateKnife(dt) {
  knife.cd = Math.max(0, knife.cd - dt);
  if (knife.t > 0) {
    knife.t -= dt;
    // ナイフ振りモーション (銃を振る演出)
    const k = Math.sin((0.32 - knife.t) / 0.32 * Math.PI);
    gunGroup.rotation.z = -k * 0.9;
    gunGroup.rotation.x = -k * 0.5;
    if (knife.t <= 0) { gunGroup.rotation.z = 0; gunGroup.rotation.x = 0; }
  }
}

function reload() {
  if (curVehicle || weapon.reloading || weapon.mag === weapon.magSize || !player.alive) return;
  if (weapon.reserve <= 0) { ui.reloadHint.textContent = '弾薬切れ! 弾薬箱を探せ'; return; }
  weapon.reloading = true; weapon.reloadTimer = weapon.reloadTime;
  sfx.reload();
  ui.reloadHint.textContent = 'リロード中...';
}

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

/* =========================================================
   v0.3.1: パラシュート — 高高度からの降下を可能に
   ・一定以上の高さを落下中に自動展開 / ヘリ空中脱出時は即展開
   ・展開中は降下速度が制限され、空中での水平移動が可能
   ・パラシュートなしの高所落下は落下ダメージ
   ========================================================= */
let chuteMesh = null;
{
  const g = new THREE.Group();
  // キャノピー (半球)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshLambertMaterial({ color: 0x5a7a4a, side: THREE.DoubleSide })
  );
  canopy.position.y = 3.4;
  g.add(canopy);
  // ライン (4本)
  const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([ox, oz]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(ox, 3.6, oz)
    ]);
    g.add(new THREE.Line(geo, lineMat));
  });
  g.visible = false;
  scene.add(g);
  chuteMesh = g;
}
function deployChute() {
  if (player.chute || !player.alive) return;
  player.chute = true;
  chuteMesh.visible = true;
  sfx.chute();
  addFeed('🪂 パラシュート展開', 'blue');
}
function releaseChute() {
  if (!player.chute) return;
  player.chute = false;
  chuteMesh.visible = false;
}
// v0.3.4: 空中でパラシュートを手動で開閉 (閉じたまま落下すると落下ダメージ)
function toggleChute() {
  if (!player.alive || player.onGround) return;
  if (player.chute) {
    releaseChute();
    addFeed('パラシュートを閉じた — 落下注意!', 'red');
  } else {
    const fallH = (player.pos.y - player.eyeHeight) - terrainH(player.pos.x, player.pos.z);
    if (fallH > 3 && player.vel.y < 1) deployChute();
  }
}

// ---------- Player damage / respawn ----------
function damagePlayer(dmg, fromPos = null) {
  if (!player.alive) return;
  player.hp -= dmg;
  player.lastDamageTime = elapsed;
  sfx.damage();
  if (fromPos) showDamageDirection(fromPos);
  ui.vignette.style.opacity = Math.min(1, 0.4 + (1 - player.hp / player.maxHp) * 0.6);
  setTimeout(() => { if (player.hp > 30) ui.vignette.style.opacity = 0; }, 220);
  if (player.hp <= 0) { player.hp = 0; playerDie(); }
  updateHpUI();
}
function playerDie() {
  player.alive = false;
  player.respawnT = 5;
  player.deaths = (player.deaths || 0) + 1;        // v0.2.3
  firing = false;
  setAds(false);
  releaseChute();                                  // v0.3.1
  if (drone.active) endDrone(false);               // v0.3
  game.ticketsBlue = Math.max(0, game.ticketsBlue - 1);
  updateTicketsUI();
  if (curVehicle) exitVehicle(true);
  document.getElementById('respawn-screen').style.display = 'flex';
  deployReady = false;                             // v0.3
  checkMatchEnd();
}
// v0.3: デプロイ画面で選んだ地点から出撃
function respawnPlayer(sp = null) {
  if (!sp) {
    sp = HQ_BLUE;
    const owned = flags.filter(f => f.own === 1);
    if (owned.length) sp = owned[Math.floor(Math.random() * owned.length)];
  }
  const rx = sp.x + (Math.random() - .5) * 10, rz = sp.z + (Math.random() - .5) * 10;
  player.stance = 0; player.slideT = 0; player.stamina = 1; player.exhausted = false;   // v0.4.0
  player.eyeHeight = 1.7;
  player.pos.set(rx, terrainH(rx, rz) + player.eyeHeight, rz);
  player.vel.set(0, 0, 0);
  player.hp = player.maxHp; player.alive = true;
  player.lastDamageTime = -99;
  player.onGround = true;
  releaseChute();                                  // v0.3.1
  // v0.2.2: リスポーン時はフル装備で復帰
  applyWeapon(curWeaponId);
  grenades.count = grenades.max;
  fireLatch = false;
  ui.vignette.style.opacity = 0;
  ui.reloadHint.textContent = '';
  updateHpUI(); updateAmmoUI();
  document.getElementById('respawn-screen').style.display = 'none';
}
