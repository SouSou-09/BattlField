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
  // v0.4.7: smoke volumes are first-class LOS blockers for player and AI
  if (typeof smokeBlocks === 'function' && smokeBlocks(from, to)) return false;
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
    suppressAlongBulletV047(_bPrev, b.pos);   // v0.4.7: near-miss suppression
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
      if (typeof onSoldierHitV0510 === 'function') onSoldierHitV0510(h.object.userData.soldier, h.point, isHead);
      showHitmarker(isHead);
      done = true;
      spawnTracer(_bPrev, h.point);
    } else if (wDist < Infinity) {
      const h = hitsW[0];
      const dd = h.object.userData.destructible;
      const wp = h.object.userData.windowPane;
      const bridge = h.object.userData.bridge;
      const vehiclePart = h.object.userData.vehiclePart;
      const vehicleSystem = h.object.userData.vehicleSystemV054;
      const strategicV057 = h.object.userData.strategicV057;
      const defensiveV058 = h.object.userData.defensiveV058;
      if (dd) damageDestructible(dd, b.dmg * 1.5);
      else if (wp) breakWindow(wp);
      else if (bridge) damageBridge(bridge, b.dmg);
      else if (vehicleSystem) damageVehicleSystemDirectV054(vehicleSystem, b.dmg, h.point);
      else if (vehiclePart) damageVehiclePartDirectV048(vehiclePart, b.dmg, h.point);
      else if (strategicV057) damageStrategicV057(strategicV057, b.dmg);
      else if (defensiveV058) damageDefensiveV058(defensiveV058, b.dmg);
      else { spawnParticles(h.point, 0xb0a890, 3, 2); addBulletHole(h.point, _bDir); if (typeof tryWaterRippleV062 === "function") tryWaterRippleV062(h.point); }
      done = true;
      spawnTracer(_bPrev, h.point);
    } else if (b.pos.y < terrainH(b.pos.x, b.pos.z)) {
      spawnParticles(b.pos.clone().setY(terrainH(b.pos.x, b.pos.z) + 0.1), 0x8a7a5a, 3, 2); if (typeof tryWaterRippleV062 === "function") tryWaterRippleV062(b.pos);
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
function playerShoot() {
  if (weapon.reloading || weapon.cooldown > 0 || !player.alive || player.downed) return;
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
  muzzleLight.intensity = 4.8;                       // v0.4.5: 夜間も周囲を照らす発砲光
  if (typeof ejectCasing === 'function') ejectCasing();
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
