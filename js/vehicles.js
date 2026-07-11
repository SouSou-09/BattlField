'use strict';
/* STEEL FRONT — 乗り物: ジープ / 戦車 / 砲弾 */

// ---------- Vehicles ----------
const vehicles = [];
let curVehicle = null;
const matVBody = new THREE.MeshLambertMaterial({ color: 0x50653e });
const matVBody2 = new THREE.MeshLambertMaterial({ color: 0x43552f });
const matVDark = new THREE.MeshLambertMaterial({ color: 0x22262a });
const matVGlass = new THREE.MeshLambertMaterial({ color: 0x7fa8c0 });
const matTank = new THREE.MeshLambertMaterial({ color: 0x5a6247 });
const matTank2 = new THREE.MeshLambertMaterial({ color: 0x4c5340 });
const matWreck = new THREE.MeshLambertMaterial({ color: 0x1d1d1d });

function createJeep(x, z, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 3.6), matVBody); body.position.y = 0.85;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 1.1), matVBody2); hood.position.set(0, 1.05, -1.55);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 0.25), matVDark); seatBack.position.set(0, 1.45, 0.5);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.08), matVGlass); windshield.position.set(0, 1.6, -0.95);
  const rollbar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), matVDark); rollbar.position.set(0, 2.0, 0.4);
  const barL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), matVDark); barL.position.set(-0.85, 1.62, 0.4);
  const barR = barL.clone(); barR.position.x = 0.85;
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 0.25), matVDark); bumper.position.set(0, 0.62, -1.85);
  g.add(body, hood, seatBack, windshield, rollbar, barL, barR, bumper);
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 10);
  const wheels = [];
  [[-0.95, -1.2], [0.95, -1.2], [-0.95, 1.2], [0.95, 1.2]].forEach(o => {
    const w = new THREE.Mesh(wheelGeo, matVDark);
    w.rotation.z = Math.PI / 2;
    w.position.set(o[0], 0.45, o[1]);
    g.add(w); wheels.push(w);
  });
  const turret = new THREE.Group();
  const mgBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.4, 8), matVDark); mgBase.position.y = 0.1;
  const mgBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.7), matVDark); mgBody.position.set(0, 0.36, -0.15);
  const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 6), matVDark);
  mgBarrel.rotation.x = Math.PI / 2; mgBarrel.position.set(0, 0.38, -0.85);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.38, -1.3);
  turret.add(mgBase, mgBody, mgBarrel, muzzle);
  turret.position.set(0, 2.0, 0.4);
  g.add(turret);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = {
    type: 'jeep', name: 'M151 ジープ', obj: g, turret, muzzle, wheels,
    yaw: rotY, speed: 0, hp: 300, maxHp: 300, alive: true,
    radius: 1.9, maxSpeed: 16, accel: 11, turnRate: 1.9,
    fireInterval: 0.09, cd: 0, camDist: 7.5, camH: 2.6, dmg: 34
  };
  vehicles.push(v);
  return v;
}

function createTank(x, z, rotY = 0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.9, 5.2), matTank); hull.position.y = 1.05;
  const hullTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 4.2), matTank2); hullTop.position.y = 1.65;
  const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 5.4), matVDark); trackL.position.set(-1.45, 0.55, 0);
  const trackR = trackL.clone(); trackR.position.x = 1.45;
  const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 5.0), matTank2); skirtL.position.set(-1.45, 1.1, 0);
  const skirtR = skirtL.clone(); skirtR.position.x = 1.45;
  g.add(hull, hullTop, trackL, trackR, skirtL, skirtR);
  const turret = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 2.3), matTank); dome.position.y = 0.35;
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8), matTank2); hatch.position.set(-0.4, 0.78, 0.4);
  const gunMantlet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4), matTank2); gunMantlet.position.set(0, 0.35, -1.2);
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.0, 8), matVDark);
  cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 0.35, -2.7);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.35, -4.2);
  turret.add(dome, hatch, gunMantlet, cannon, muzzle);
  turret.position.set(0, 1.85, -0.3);
  g.add(turret);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = {
    type: 'tank', name: 'T-70 戦車', obj: g, turret, muzzle, wheels: [],
    yaw: rotY, speed: 0, hp: 900, maxHp: 900, alive: true,
    radius: 2.6, maxSpeed: 8.5, accel: 4.5, turnRate: 1.1,
    fireInterval: 1.6, cd: 0, camDist: 10.5, camH: 3.6
  };
  vehicles.push(v);
  return v;
}

function spawnVehicles() {
  for (const v of vehicles) scene.remove(v.obj);
  vehicles.length = 0;
  // 青HQ付近
  createJeep(HQ_BLUE.x + 12, HQ_BLUE.z - 14, -Math.PI / 4);
  createTank(HQ_BLUE.x - 4, HQ_BLUE.z - 20, -Math.PI / 4);
  // 中立 (拠点C付近と道路沿い)
  createJeep(12, 36, Math.PI / 2);
  createJeep(-40, -20, 0);
}

function destroyVehicle(v) {
  if (!v.alive) return;
  v.alive = false;
  v.speed = 0;
  sfx.explosion();
  const p = v.obj.position.clone(); p.y += 1;
  spawnParticles(p, 0xff8830, 22, 8, 3);
  spawnParticles(p, 0x333333, 16, 5, 4);
  flashExplosionLight(p);
  shake = 0.6;
  v.obj.traverse(m => { if (m.isMesh) m.material = matWreck; });
  for (const s of soldiers) {
    if (!s.alive) continue;
    const d = s.obj.position.distanceTo(v.obj.position);
    if (d < 7) {
      if (s.team === -1) damageSoldierByPlayer(s, 200, s.obj.position.clone().setY(s.obj.position.y + 1.2));
      else damageSoldier(s, 200, s.obj.position.clone().setY(s.obj.position.y + 1.2));
    }
  }
  if (curVehicle === v) {
    exitVehicle(true);
    damagePlayer(25);
  }
}

function nearestVehicle() {
  let best = null, bd = 4.5;
  for (const v of vehicles) {
    if (!v.alive) continue;
    const d = Math.hypot(v.obj.position.x - player.pos.x, v.obj.position.z - player.pos.z);
    if (d < bd + v.radius) { bd = d; best = v; }
  }
  return best;
}
function enterVehicle(v) {
  curVehicle = v;
  gunGroup.visible = false;
  firing = false;
  setAds(false);
  sfx.enter();
  startEngine(v.type);
  ui.vehicleBox.style.display = 'block';
  ui.vehicleName.textContent = v.name;
  ui.weaponName.textContent = v.type === 'tank' ? '125mm 主砲' : 'M2 重機関銃';
  ui.ammoMag.textContent = '∞';
  ui.ammoMag.style.color = '#fff';
  ui.ammoReserve.textContent = '';
  ui.reloadHint.textContent = '';
  updateVehicleUI();
}
function exitVehicle(forced = false) {
  if (!curVehicle) return;
  const v = curVehicle;
  const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
  for (const s of [1, -1, 1.6, -1.6]) {
    const px = v.obj.position.x + side.x * (v.radius + 0.8) * s;
    const pz = v.obj.position.z + side.z * (v.radius + 0.8) * s;
    if (!collidesAt(px, pz, player.radius, terrainH(px, pz) + 1)) {
      player.pos.set(px, terrainH(px, pz) + player.eyeHeight, pz);
      break;
    }
  }
  curVehicle = null;
  gunGroup.visible = true;
  firing = false;
  stopEngine();
  if (!forced) sfx.enter();
  ui.vehicleBox.style.display = 'none';
  ui.weaponName.textContent = weaponDef().name;
  updateAmmoUI();
}
function toggleVehicle() {
  if (!game.running || !player.alive) return;
  if (curVehicle) { exitVehicle(); return; }
  const v = nearestVehicle();
  if (v) enterVehicle(v);
}

// 戦車砲弾 (プール)
const shells = [];
const shellGeo = new THREE.SphereGeometry(0.16, 6, 5);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(shellGeo, shellMat);
  m.visible = false;
  scene.add(m);
  shells.push({ m, vel: new THREE.Vector3(), ttl: 0 });
}
function fireShell(from, dir) {
  let s = shells.find(s => s.ttl <= 0) || shells[0];
  s.m.position.copy(from);
  s.vel.copy(dir).multiplyScalar(70);
  s.ttl = 4;
  s.m.visible = true;
}
function explodeAt(pos, radius = 6.5, dmg = 140) {
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
  // v0.2.3: 破壊可能オブジェクトへの範囲ダメージ (樽の誘爆も発生)
  for (const dd of destructibles) {
    if (dd.dead) continue;
    if (dd.m.position.distanceTo(pos) < radius) damageDestructible(dd, 100);
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
          if (sl.alive && sl.obj.position.distanceTo(p) < 1.4) { boom = true; break; }
        }
      }
      if (boom || s.ttl <= 0) {
        s.ttl = 0; s.m.visible = false;
        explodeAt(p.clone().setY(Math.max(p.y, terrainH(p.x, p.z) + 0.4)));
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

// 車両運転 (地形の高さ・傾斜に追従)
function updateVehicle(dt) {
  const v = curVehicle;
  let throttle = 0, steer = 0;
  if (isMobile) {
    throttle = -joy.y;
    steer = joy.x;
  } else {
    if (keys['KeyW']) throttle += 1;
    if (keys['KeyS']) throttle -= 1;
    if (keys['KeyA']) steer -= 1;
    if (keys['KeyD']) steer += 1;
  }
  if (throttle !== 0) {
    v.speed += throttle * v.accel * dt;
  } else {
    v.speed *= Math.pow(0.4, dt);
    if (Math.abs(v.speed) < 0.15) v.speed = 0;
  }
  // 坂の影響: 上りで減速
  const aheadH = terrainH(v.obj.position.x - Math.sin(v.yaw) * 3, v.obj.position.z - Math.cos(v.yaw) * 3);
  const slope = (aheadH - terrainH(v.obj.position.x, v.obj.position.z)) / 3;
  v.speed -= slope * Math.sign(v.speed) * (v.type === 'tank' ? 2.5 : 5) * dt * Math.abs(v.speed) * 0.4;
  v.speed = Math.max(-v.maxSpeed * 0.45, Math.min(v.maxSpeed, v.speed));
  if (Math.abs(v.speed) > 0.3) {
    v.yaw -= steer * v.turnRate * dt * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 4);
  }
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const nx = v.obj.position.x + fx * v.speed * dt;
  const nz = v.obj.position.z + fz * v.speed * dt;
  if (!collidesAt(nx, nz, v.radius, terrainH(nx, nz) + 1, v)) {
    v.obj.position.x = nx;
    v.obj.position.z = nz;
  } else {
    if (Math.abs(v.speed) > 6) {
      spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1), 0x999999, 5, 3);
      playBeep(90, 0.15, 0.15, 'sawtooth');
    }
    v.speed *= -0.25;
  }
  // 地形追従 (高さ + ピッチ/ロール)
  const px = v.obj.position.x, pz = v.obj.position.z;
  v.obj.position.y = terrainH(px, pz);
  const hF = terrainH(px + fx * 2, pz + fz * 2);
  const hB = terrainH(px - fx * 2, pz - fz * 2);
  const sx = Math.cos(v.yaw), sz = -Math.sin(v.yaw);
  const hL = terrainH(px - sx * 1.5, pz - sz * 1.5);
  const hR = terrainH(px + sx * 1.5, pz + sz * 1.5);
  v.obj.rotation.order = 'YXZ';
  v.obj.rotation.y = v.yaw;
  v.obj.rotation.x = Math.atan2(hB - hF, 4) * 0.7;
  v.obj.rotation.z = Math.atan2(hL - hR, 3) * 0.7;
  for (const w of v.wheels) w.rotation.x += v.speed * dt * 2.2;
  // 轢殺
  if (Math.abs(v.speed) > 4) {
    for (const s of soldiers) {
      if (!s.alive) continue;
      const d = Math.hypot(s.obj.position.x - v.obj.position.x, s.obj.position.z - v.obj.position.z);
      if (d < v.radius + 0.6) {
        if (s.team === -1) { damageSoldierByPlayer(s, 999, s.obj.position.clone().setY(s.obj.position.y + 1)); if (!s.alive) addFeed('轢殺!! +100'); }
        else damageSoldier(s, 999, s.obj.position.clone().setY(s.obj.position.y + 1));
        v.speed *= 0.85;
      }
    }
  }
  updateEngine(v.speed);

  // 三人称カメラ
  const cp = Math.max(-0.5, Math.min(1.1, player.pitch));
  const cd = v.camDist;
  const cx = v.obj.position.x + Math.sin(player.yaw) * cd * Math.cos(cp);
  const cz = v.obj.position.z + Math.cos(player.yaw) * cd * Math.cos(cp);
  const cy = v.obj.position.y + v.camH + cd * Math.sin(cp) * 0.9 + 1;
  const groundY = terrainH(cx, cz) + 0.8;
  camera.position.set(cx, Math.max(groundY, cy), cz);
  camera.lookAt(v.obj.position.x, v.obj.position.y + 1.6, v.obj.position.z);
  if (shake > 0.01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
  }
  player.pos.set(v.obj.position.x, v.obj.position.y + player.eyeHeight, v.obj.position.z);

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const aimYaw = Math.atan2(-camDir.x, -camDir.z);
  v.turret.rotation.y = aimYaw - v.yaw;

  v.cd -= dt;
  if (firing && v.cd <= 0) {
    v.cd = v.fireInterval;
    const muzzleWorld = new THREE.Vector3();
    v.muzzle.getWorldPosition(muzzleWorld);
    const aimPoint = camera.position.clone().addScaledVector(camDir, 160);
    const dir = aimPoint.sub(muzzleWorld).normalize();
    if (v.type === 'tank') {
      sfx.cannon();
      fireShell(muzzleWorld, dir);
      spawnParticles(muzzleWorld, 0xffcc66, 6, 4);
      flashExplosionLight(muzzleWorld);
      shake = Math.max(shake, 0.35);
      v.speed *= 0.9;
    } else {
      sfx.mg();
      const spread = 0.015;
      dir.x += (Math.random() - .5) * spread;
      dir.y += (Math.random() - .5) * spread;
      dir.z += (Math.random() - .5) * spread;
      dir.normalize();
      shootRay.set(muzzleWorld, dir);
      shootRay.far = 250;
      const hitsE = shootRay.intersectObjects(soldierHitMeshes, false).filter(h => h.object.userData.soldier && h.object.userData.soldier.alive && h.object.userData.soldier.team === -1);
      const hitsW = shootRay.intersectObjects(solidMeshes, false);
      let end = muzzleWorld.clone().addScaledVector(dir, 250);
      const eDist = hitsE.length ? hitsE[0].distance : Infinity;
      const wDist = hitsW.length ? hitsW[0].distance : Infinity;
      if (eDist < wDist) {
        end = hitsE[0].point;
        damageSoldierByPlayer(hitsE[0].object.userData.soldier, v.dmg, hitsE[0].point);
        showHitmarker();
      } else if (wDist < Infinity) {
        end = hitsW[0].point;
        spawnParticles(end, 0xb0a890, 3, 2);
      }
      spawnTracer(muzzleWorld, end, 0xffe9a0);
    }
  }
  updateVehicleUI();
}
function updateVehicleUI() {
  const v = curVehicle;
  if (!v) return;
  ui.vehicleFill.style.width = (v.hp / v.maxHp * 100) + '%';
  ui.vehicleFill.style.background = v.hp / v.maxHp > 0.35 ? 'linear-gradient(90deg,#3dc9dc,#a7e9f3)' : 'linear-gradient(90deg,#e0483d,#f3a7a0)';
  ui.vehicleSpeed.textContent = Math.abs(Math.round(v.speed * 3.6)) + ' km/h';
}
