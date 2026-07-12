'use strict';
/* STEEL FRONT — 車両武器: 砲弾 / 爆発 / 機銃 / ヘリロケット (vehicles.js から分割) */

// 戦車砲弾 (プール)
const shells = [];
const shellGeo = new THREE.SphereGeometry(0.16, 6, 5);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(shellGeo, shellMat);
  m.visible = false;
  scene.add(m);
  shells.push({ m, vel: new THREE.Vector3(), ttl: 0, owner: null, radius: 6.5, dmg: 140 });
}
function fireShell(from, dir, owner = null, speed = 70, radius = 6.5, dmg = 140) {
  let s = shells.find(s => s.ttl <= 0) || shells[0];
  s.m.position.copy(from);
  s.vel.copy(dir).multiplyScalar(speed);
  s.ttl = 4;
  s.owner = owner;
  s.radius = radius;
  s.dmg = dmg;
  s.m.visible = true;
}
function explodeAt(pos, radius = 6.5, dmg = 140, skipVehicle = null) {
  if (typeof damageStrategicWorld === 'function') damageStrategicWorld(pos, radius, dmg);
  if (typeof damageDefensiveWorldV058 === 'function') damageDefensiveWorldV058(pos, radius, dmg);
  sfx.explosion();
  spawnParticles(pos, 0xff8830, 18, 8, 3);
  spawnParticles(pos, 0x554433, 12, 5, 2.5);
  spawnParticles(pos, 0x333333, 10, 3.5, 3.5);
  flashExplosionLight(pos);
  for (const s of soldiers) {
    if (!s.alive) continue;
    const d = s.obj.position.distanceTo(pos);
    if (d < radius) {
      const dd = dmg * (1 - d / radius) + 25;
      if (s.team === -1) damageSoldierByPlayer(s, dd, s.obj.position.clone().setY(s.obj.position.y + 1.2));
      else damageSoldier(s, dd, s.obj.position.clone().setY(s.obj.position.y + 1.2));
    }
  }
  const pd = player.pos.distanceTo(pos);
  if (!curVehicle && pd < radius * 0.8) damagePlayer(Math.round(35 * (1 - pd / (radius * 0.8))), pos);
  // v0.3: 車両への範囲ダメージ
  for (const v of vehicles) {
    if (!v.alive || v === skipVehicle) continue;
    const d = v.obj.position.distanceTo(pos);
    if (d < radius + v.radius) damageVehicle(v, dmg * 0.7 * (1 - d / (radius + v.radius)) + 15, 'explosion', pos);
  }
  // 破壊可能オブジェクトへの範囲ダメージ (樽の誘爆も発生)
  for (const dd of destructibles) {
    if (dd.dead) continue;
    if (dd.m.position.distanceTo(pos) < radius) damageDestructible(dd, 100);
  }
  // v0.4.8: 爆風で壁に侵入口を作る
  if (typeof damageDestructibleWallsV048 === 'function') damageDestructibleWallsV048(pos, radius, dmg);
  // v0.3.4: 爆風で近くの窓ガラスが割れる
  for (const wp of windows) {
    if (wp.broken) continue;
    if (wp.m.position.distanceTo(pos) < radius + 2) breakWindow(wp);
  }
  const camD = camera.position.distanceTo(pos);
  if (camD < 25) shake = Math.max(shake, 0.5 * (1 - camD / 25));
}
function updateShells(dt) {
  for (const s of shells) {
    if (s.ttl <= 0) continue;
    s.ttl -= dt;
    s.vel.y -= 6 * dt;
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      s.m.position.addScaledVector(s.vel, dt / steps);
      const p = s.m.position;
      let boom = p.y <= terrainH(p.x, p.z) + 0.1 || heightBlocked(p);
      if (!boom) {
        for (const sl of soldiers) {
          if (sl.alive && !sl.inVehicle && sl.obj.position.distanceTo(p) < 1.4) { boom = true; break; }
        }
      }
      if (!boom) {
        for (const v of vehicles) {
          if (v.alive && v !== s.owner && v.obj.position.distanceTo(p) < v.radius + 0.8) { boom = true; break; }
        }
      }
      if (boom || s.ttl <= 0) {
        s.ttl = 0; s.m.visible = false;
        explodeAt(p.clone().setY(Math.max(p.y, terrainH(p.x, p.z) + 0.4)), s.radius, s.dmg, s.owner);
        break;
      }
    }
  }
}
function heightBlocked(p) {
  for (const o of obstacles) {
    if (p.x > o.minX - 0.2 && p.x < o.maxX + 0.2 && p.z > o.minZ - 0.2 && p.z < o.maxZ + 0.2 && p.y > o.y0 - 0.5 && p.y < o.h) return true;
  }
  return false;
}

/* ---------- 砲塔射撃の共通処理 (MG系) ---------- */
function fireMG(v, muzzleWorld, dir, dmg, range) {
  const spread = 0.015;
  dir.x += (Math.random() - .5) * spread;
  dir.y += (Math.random() - .5) * spread;
  dir.z += (Math.random() - .5) * spread;
  dir.normalize();
  shootRay.set(muzzleWorld, dir);
  shootRay.far = range;
  const hitsE = shootRay.intersectObjects(soldierHitMeshes, false).filter(h => h.object.userData.soldier && h.object.userData.soldier.alive && h.object.userData.soldier.team === -1);
  const hitsW = shootRay.intersectObjects(solidMeshes, false);
  let end = muzzleWorld.clone().addScaledVector(dir, range);
  const eDist = hitsE.length ? hitsE[0].distance : Infinity;
  const wDist = hitsW.length ? hitsW[0].distance : Infinity;
  if (eDist < wDist) {
    end = hitsE[0].point;
    damageSoldierByPlayer(hitsE[0].object.userData.soldier, dmg, hitsE[0].point);
    showHitmarker();
  } else if (wDist < Infinity) {
    end = hitsW[0].point;
    const dd = hitsW[0].object.userData.destructible;
    const wp = hitsW[0].object.userData.windowPane;   // v0.3.4: 窓ガラス
    const vehiclePart = hitsW[0].object.userData.vehiclePart;   // v0.4.8
    const vehicleSystem = hitsW[0].object.userData.vehicleSystemV054;
    const strategicV057 = hitsW[0].object.userData.strategicV057;
    const defensiveV058 = hitsW[0].object.userData.defensiveV058;
    if (dd) damageDestructible(dd, dmg);
    else if (wp) breakWindow(wp);
    else if (vehicleSystem) damageVehicleSystemDirectV054(vehicleSystem, dmg, end);
    else if (vehiclePart) damageVehiclePartDirectV048(vehiclePart, dmg, end);
    else if (strategicV057) damageStrategicV057(strategicV057, dmg);
    else if (defensiveV058) damageDefensiveV058(defensiveV058, dmg);
    else spawnParticles(end, 0xb0a890, 3, 2);
  }
  spawnTracer(muzzleWorld, end, 0xffe9a0);
}

/* ---------- v0.3: ヘリロケット ---------- */
function heliRockets() {
  const v = curVehicle;
  if (!v || v.type !== 'heli' || v.seats[curSeat].role !== 'driver') return;
  if (v.rocketCd > 0 || v.rockets <= 0) return;
  v.rocketCd = 1.6;
  v.rockets = Math.max(0, v.rockets - 2);
  sfx.rocket();
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  for (const off of [-1.15, 1.15]) {
    const from = new THREE.Vector3(off, 1.2, -1.2).applyMatrix4(v.obj.matrixWorld);
    const dir = camDir.clone();
    dir.x += (Math.random() - .5) * 0.02; dir.y += (Math.random() - .5) * 0.02;
    fireShell(from, dir.normalize(), v, 90, 5.5, 110);
    spawnParticles(from, 0xffcc66, 4, 3);
  }
  updateSeatUI();
}
