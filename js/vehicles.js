'use strict';
/* STEEL FRONT — 乗り物 v0.3
   ジープ / 戦車 / 攻撃ヘリ / ボート / 固定砲座(対空砲・機銃) / 偵察ドローン
   座席システム (運転手/砲手/同乗者) / 部位ダメージ / 修理 / 轢き / クラクション */

// ---------- Vehicles ----------
const vehicles = [];
let curVehicle = null;
let curSeat = 0;
const matVBody = new THREE.MeshLambertMaterial({ color: 0x50653e });
const matVBody2 = new THREE.MeshLambertMaterial({ color: 0x43552f });
const matVDark = new THREE.MeshLambertMaterial({ color: 0x22262a });
const matVGlass = new THREE.MeshLambertMaterial({ color: 0x7fa8c0 });
const matTank = new THREE.MeshLambertMaterial({ color: 0x5a6247 });
const matTank2 = new THREE.MeshLambertMaterial({ color: 0x4c5340 });
const matHeli = new THREE.MeshLambertMaterial({ color: 0x3e4a3a });
const matHeli2 = new THREE.MeshLambertMaterial({ color: 0x333d31 });
const matBoat = new THREE.MeshLambertMaterial({ color: 0x5c6668 });
const matWreck = new THREE.MeshLambertMaterial({ color: 0x1d1d1d });

/* 座席: { role:'driver'|'gunner'|'passenger', pos:Vector3(ローカル), occ:null|'player'|soldier } */
function mkSeat(role, x, y, z) { return { role, pos: new THREE.Vector3(x, y, z), occ: null }; }

function baseVehicleState(v) {
  return Object.assign(v, {
    speed: 0, alive: true, cd: 0,
    burning: false, mobility: 1,           // v0.3: 部位ダメージ (mobility 0=走行不能)
    partHint: '', smokeT: 0
  });
}

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
  const v = baseVehicleState({
    type: 'jeep', name: 'M151 ジープ', obj: g, turret, muzzle, wheels,
    yaw: rotY, hp: 300, maxHp: 300,
    radius: 1.9, maxSpeed: 17, accel: 11, turnRate: 1.9,
    fireInterval: 0.09, camDist: 7.5, camH: 2.6, dmg: 34, gunRange: 250,
    seats: [mkSeat('driver', -0.5, 1.5, -0.3), mkSeat('gunner', 0, 2.4, 0.4), mkSeat('passenger', 0.5, 1.5, -0.3)]
  });
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
  const v = baseVehicleState({
    type: 'tank', name: 'T-70 戦車', obj: g, turret, muzzle, wheels: [],
    yaw: rotY, hp: 900, maxHp: 900,
    radius: 2.6, maxSpeed: 8.5, accel: 4.5, turnRate: 1.1,
    fireInterval: 1.8, camDist: 10.5, camH: 3.6,
    seats: [mkSeat('driver', -0.4, 1.9, 0.6), mkSeat('gunner', 0, 2.6, -0.3)]
  });
  vehicles.push(v);
  return v;
}

/* ---------- v0.3: 攻撃ヘリコプター ---------- */
function createHeli(x, z, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 4.6), matHeli); body.position.y = 1.6;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.2), matVGlass); nose.position.set(0, 1.55, -2.6);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 3.4), matHeli2); tail.position.set(0, 1.95, 3.6);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.9), matHeli); tailFin.position.set(0, 2.6, 5.0);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 3.4), matVDark); skidL.position.set(-0.95, 0.35, -0.4);
  const skidR = skidL.clone(); skidR.position.x = 0.95;
  const strutFL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), matVDark); strutFL.position.set(-0.85, 0.7, -1.2);
  const strutFR = strutFL.clone(); strutFR.position.x = 0.85;
  const strutBL = strutFL.clone(); strutBL.position.z = 0.6;
  const strutBR = strutFR.clone(); strutBR.position.z = 0.6;
  // ロケットポッド
  const podL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 8), matVDark);
  podL.rotation.x = Math.PI / 2; podL.position.set(-1.15, 1.2, -0.6);
  const podR = podL.clone(); podR.position.x = 1.15;
  g.add(body, nose, tail, tailFin, skidL, skidR, strutFL, strutFR, strutBL, strutBR, podL, podR);
  // ローター
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(9.4, 0.06, 0.36);
  const b1 = new THREE.Mesh(bladeGeo, matVDark);
  const b2 = new THREE.Mesh(bladeGeo, matVDark); b2.rotation.y = Math.PI / 2;
  rotor.add(b1, b2);
  rotor.position.set(0, 2.6, 0);
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.2), matVDark);
  tailRotor.position.set(0.3, 2.4, 5.1);
  g.add(tailRotor);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 1.0, -3.2);
  g.add(muzzle);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = baseVehicleState({
    type: 'heli', name: 'AH-1 攻撃ヘリ', obj: g, turret: null, muzzle, wheels: [],
    rotor, tailRotor, yaw: rotY, hp: 420, maxHp: 420,
    radius: 2.4, maxSpeed: 26, accel: 9, turnRate: 1.5,
    fireInterval: 0.11, camDist: 13, camH: 4.5, dmg: 30, gunRange: 300,
    alt: 0, vy: 0, rocketCd: 0, rockets: 24,
    seats: [mkSeat('driver', 0, 1.6, -1.6), mkSeat('gunner', -0.8, 1.5, 0.6)]
  });
  vehicles.push(v);
  return v;
}

/* ---------- v0.3: ボート ---------- */
function createBoat(x, z, rotY = 0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 5.0), matBoat); hull.position.y = 0.45;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.0), matBoat); bow.position.set(0, 0.5, -2.8);
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.6), matVDark); console_.position.set(0, 1.1, 0.4);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.06), matVGlass); wind.position.set(0, 1.55, 0.15);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), matVDark); motor.position.set(0, 0.75, 2.6);
  g.add(hull, bow, console_, wind, motor);
  const turret = new THREE.Group();
  const mgBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.6), matVDark); mgBody.position.y = 0.3;
  const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), matVDark);
  mgBarrel.rotation.x = Math.PI / 2; mgBarrel.position.set(0, 0.32, -0.7);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.32, -1.1);
  turret.add(mgBody, mgBarrel, muzzle);
  turret.position.set(0, 0.95, -2.0);
  g.add(turret);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, WATER_Y + 0.15, z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = baseVehicleState({
    type: 'boat', name: 'RB-12 ボート', obj: g, turret, muzzle, wheels: [],
    yaw: rotY, hp: 250, maxHp: 250,
    radius: 1.9, maxSpeed: 15, accel: 7, turnRate: 1.6,
    fireInterval: 0.1, camDist: 8.5, camH: 2.8, dmg: 30, gunRange: 220,
    bobT: Math.random() * 6,
    seats: [mkSeat('driver', 0, 1.4, 0.8), mkSeat('gunner', 0, 1.4, -2.0), mkSeat('passenger', 0, 1.2, 1.9)]
  });
  vehicles.push(v);
  return v;
}

/* ---------- v0.3: 固定砲座 (対空砲 / 機銃) ---------- */
function createEmplacement(kind, x, z, rotY = 0, team = 0) {
  const g = new THREE.Group();
  const isAA = kind === 'aa';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(isAA ? 1.1 : 0.7, isAA ? 1.3 : 0.9, 0.5, 10), matVDark);
  base.position.y = 0.25;
  g.add(base);
  const turret = new THREE.Group();
  if (isAA) {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.0), matTank); mount.position.y = 0.45;
    const gunL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), matVDark);
    gunL.rotation.x = Math.PI / 2 - 0.35; gunL.position.set(-0.25, 0.95, -1.0);
    const gunR = gunL.clone(); gunR.position.x = 0.25;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), matVDark); seat.position.set(0, 0.6, 0.9);
    turret.add(mount, gunL, gunR, seat);
  } else {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.1), matTank2); shield.position.set(0, 0.75, -0.5);
    const mgBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.8), matVDark); mgBody.position.set(0, 0.8, -0.2);
    const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), matVDark);
    mgBarrel.rotation.x = Math.PI / 2; mgBarrel.position.set(0, 0.82, -1.0);
    turret.add(shield, mgBody, mgBarrel);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, isAA ? 1.4 : 0.82, isAA ? -2.0 : -1.5);
  turret.add(muzzle);
  turret.position.y = 0.5;
  g.add(turret);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = baseVehicleState({
    type: kind, name: isAA ? 'ZU-23 対空砲' : 'M2 固定機銃', obj: g, turret, muzzle, wheels: [],
    yaw: rotY, hp: isAA ? 260 : 200, maxHp: isAA ? 260 : 200,
    radius: 1.3, maxSpeed: 0, accel: 0, turnRate: 0,
    fireInterval: isAA ? 0.12 : 0.09, camDist: 6, camH: 2.4,
    dmg: isAA ? 26 : 34, gunRange: isAA ? 320 : 260,
    team, aaCd: 0,
    seats: [mkSeat('gunner', 0, 1.3, 0.6)]
  });
  vehicles.push(v);
  return v;
}

function spawnVehicles() {
  for (const v of vehicles) scene.remove(v.obj);
  vehicles.length = 0;
  // 青HQ
  createJeep(HQ_BLUE.x + 12, HQ_BLUE.z - 14, -Math.PI / 4);
  createTank(HQ_BLUE.x - 4, HQ_BLUE.z - 20, -Math.PI / 4);
  createHeli(HQ_BLUE.x + 20, HQ_BLUE.z + 8, -Math.PI / 2);
  createEmplacement('aa', HQ_BLUE.x - 14, HQ_BLUE.z - 8, -Math.PI / 4, 1);
  // 赤HQ (対空砲は自動迎撃 / 車両は奪取可能)
  createJeep(HQ_RED.x - 12, HQ_RED.z + 14, Math.PI * 0.75);
  createEmplacement('aa', HQ_RED.x + 14, HQ_RED.z + 8, Math.PI * 0.75, -1);
  // 中立 (拠点C付近と道路沿い)
  createJeep(12, 36, Math.PI / 2);
  createJeep(-52, -28, 0);
  // 拠点E ヘリパッド
  createHeli(132, 139, Math.PI);
  // 湖のボート (岸辺)
  createBoat(28, 78, Math.PI / 2);
  createBoat(95, 42, -Math.PI / 2);
  // 固定機銃: 砦A / 島F
  createEmplacement('mg', -119, -104, Math.PI / 4, 0);
  createEmplacement('mg', 57, 52, Math.PI, 0);
}

/* ---------- v0.3: ダメージ / 部位破損 / 炎上 ---------- */
function damageVehicle(v, dmg, cause = '') {
  if (!v.alive) return;
  v.hp -= dmg;
  // 部位ダメージ: 大ダメージで走行系破損
  if (v.maxSpeed > 0 && dmg >= 40 && Math.random() < 0.45) {
    if (v.type === 'tank' && v.mobility > 0) {
      v.mobility = 0;
      v.partHint = '履帯破損!';
      if (curVehicle === v) addFeed('履帯破損! 走行不能 — 修理が必要', 'red');
    } else if (v.mobility > 0.5) {
      v.mobility = 0.5;
      v.partHint = 'タイヤ損傷';
      if (curVehicle === v) addFeed('走行系にダメージ! 速度低下', 'red');
    }
  }
  // 炎上: HP30%未満
  if (!v.burning && v.hp > 0 && v.hp < v.maxHp * 0.3) {
    v.burning = true;
    if (curVehicle === v) addFeed('エンジン炎上! 修理か脱出を!', 'red');
  }
  if (v.hp <= 0) destroyVehicle(v);
  else if (curVehicle === v) updateVehicleUI();
}

function destroyVehicle(v) {
  if (!v.alive) return;
  v.alive = false;
  v.speed = 0;
  v.burning = false;
  sfx.explosion();
  const p = v.obj.position.clone(); p.y += 1;
  spawnParticles(p, 0xff8830, 22, 8, 3);
  spawnParticles(p, 0x333333, 16, 5, 4);
  flashExplosionLight(p);
  shake = 0.6;
  v.obj.traverse(m => { if (m.isMesh) m.material = matWreck; });
  // 同乗AIの降車 + ダメージ
  dismountAllAI(v, 200);
  for (const s of soldiers) {
    if (!s.alive || s.inVehicle) continue;
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

/* ---------- 乗降 / 座席 ---------- */
function nearestVehicle() {
  let best = null, bd = 4.5;
  for (const v of vehicles) {
    if (!v.alive) continue;
    if (v.type === 'heli' && v.alt > 2.5) continue;
    const d = Math.hypot(v.obj.position.x - player.pos.x, v.obj.position.z - player.pos.z);
    if (d < bd + v.radius) { bd = d; best = v; }
  }
  return best;
}
function freeSeatIdx(v, preferRole) {
  let idx = -1;
  for (let i = 0; i < v.seats.length; i++) {
    if (v.seats[i].occ) continue;
    if (v.seats[i].role === preferRole) return i;
    if (idx < 0) idx = i;
  }
  return idx;
}
function seatWorldPos(v, i) {
  return v.seats[i].pos.clone().applyMatrix4(v.obj.matrixWorld);
}
function enterVehicle(v) {
  const prefer = v.maxSpeed > 0 ? 'driver' : 'gunner';
  const si = freeSeatIdx(v, prefer);
  if (si < 0) { addFeed('満席だ', 'red'); return; }
  curVehicle = v;
  curSeat = si;
  v.seats[si].occ = 'player';
  gunGroup.visible = false;
  firing = false;
  setAds(false);
  sfx.enter();
  startEngine(v.type);
  // v0.3: 運転席に乗ったら近くの味方AIが空席に搭乗
  if (v.seats[si].role === 'driver') boardNearbyAllies(v);
  ui.vehicleBox.style.display = 'block';
  updateSeatUI();
  updateVehicleUI();
}
function seatWeaponName(v, role) {
  if (role === 'driver') return v.type === 'heli' ? '機首機銃+ロケット' : '— (運転)';
  if (v.type === 'tank') return '125mm 主砲';
  if (v.type === 'aa') return '23mm 連装機関砲';
  return 'M2 重機関銃';
}
function updateSeatUI() {
  const v = curVehicle;
  if (!v) return;
  const st = v.seats[curSeat];
  ui.vehicleName.textContent = v.name + ' [' + (st.role === 'driver' ? '運転' : st.role === 'gunner' ? '砲手' : '同乗') + ']';
  ui.weaponName.textContent = seatWeaponName(v, st.role);
  ui.ammoMag.textContent = v.type === 'heli' && st.role === 'driver' ? '🚀' + v.rockets : '∞';
  ui.ammoMag.style.color = '#fff';
  ui.ammoReserve.textContent = '';
  ui.reloadHint.textContent = '';
}
function exitVehicle(forced = false) {
  if (!curVehicle) return;
  const v = curVehicle;
  if (!forced && v.type === 'heli' && v.alt > 3) { addFeed('高度が高すぎて降りられない', 'red'); return; }
  v.seats[curSeat].occ = null;
  const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
  for (const s of [1, -1, 1.6, -1.6]) {
    const px = v.obj.position.x + side.x * (v.radius + 0.8) * s;
    const pz = v.obj.position.z + side.z * (v.radius + 0.8) * s;
    if (!collidesAt(px, pz, player.radius, terrainH(px, pz) + 1)) {
      player.pos.set(px, terrainH(px, pz) + player.eyeHeight, pz);
      break;
    }
  }
  // v0.3: プレイヤーが降りたら同乗AIも降車
  dismountAllAI(v, 0);
  curVehicle = null;
  curSeat = 0;
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
// v0.3: 座席切替 (Xキー / 席ボタン)
function switchSeat() {
  const v = curVehicle;
  if (!v || v.seats.length < 2) return;
  for (let k = 1; k < v.seats.length; k++) {
    const ni = (curSeat + k) % v.seats.length;
    if (!v.seats[ni].occ) {
      v.seats[curSeat].occ = null;
      curSeat = ni;
      v.seats[ni].occ = 'player';
      sfx.enter();
      firing = false;
      updateSeatUI();
      return;
    }
  }
  addFeed('空いている席がない', 'red');
}

/* ---------- v0.3: 味方AIの同乗 ---------- */
function boardNearbyAllies(v) {
  const free = [];
  for (let i = 0; i < v.seats.length; i++) if (!v.seats[i].occ) free.push(i);
  if (!free.length) return;
  const cands = soldiers
    .filter(s => s.alive && s.team === 1 && !s.inVehicle &&
      Math.hypot(s.obj.position.x - v.obj.position.x, s.obj.position.z - v.obj.position.z) < 20)
    .sort((a, b) => a.obj.position.distanceTo(v.obj.position) - b.obj.position.distanceTo(v.obj.position));
  for (const s of cands) {
    if (!free.length) break;
    const si = free.shift();
    s.inVehicle = v;
    s.seatIdx = si;
    v.seats[si].occ = s;
    s.gunCd = 0.5;
    addFeed(s.name + ' が同乗した', 'blue');
  }
}
function dismountAllAI(v, dmg = 0) {
  for (let i = 0; i < v.seats.length; i++) {
    const occ = v.seats[i].occ;
    if (occ && occ !== 'player') {
      const s = occ;
      s.inVehicle = null;
      v.seats[i].occ = null;
      const a = Math.random() * Math.PI * 2;
      const px = v.obj.position.x + Math.cos(a) * (v.radius + 1.2);
      const pz = v.obj.position.z + Math.sin(a) * (v.radius + 1.2);
      s.obj.position.set(px, terrainH(px, pz), pz);
      s.obj.rotation.x = 0;
      if (dmg > 0) damageSoldier(s, dmg, s.obj.position.clone().setY(s.obj.position.y + 1.2));
    }
  }
}

/* ---------- v0.3: 修理 (リペアツール) ---------- */
let repairing = false;
let repairKeyHeld = false;
function nearestDamagedFriendly() {
  let best = null, bd = 6;
  for (const v of vehicles) {
    if (!v.alive || v.hp >= v.maxHp) continue;
    const d = Math.hypot(v.obj.position.x - player.pos.x, v.obj.position.z - player.pos.z);
    if (d < bd + v.radius) { bd = d; best = v; }
  }
  return best;
}
function updateRepair(dt) {
  repairing = false;
  if (!player.alive || curVehicle || !repairKeyHeld) return;
  const v = nearestDamagedFriendly();
  if (!v) return;
  repairing = true;
  v.hp = Math.min(v.maxHp, v.hp + 45 * dt);
  if (v.hp > v.maxHp * 0.35 && v.burning) { v.burning = false; addFeed('鎮火した', 'blue'); }
  if (v.hp > v.maxHp * 0.6 && v.mobility < 1) { v.mobility = 1; v.partHint = ''; addFeed('走行系を修理した', 'blue'); }
  if (Math.random() < dt * 9) {
    spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1.2), 0xffd257, 2, 2.5, 0.7);
    sfx.repair();
  }
  if (v.hp >= v.maxHp) { addFeed(v.name + ' を完全修理! +50', 'blue'); game.score += 50; updateScoreUI(); }
}

/* ---------- v0.3: クラクション ---------- */
function honk() {
  if (!curVehicle || curVehicle.maxSpeed <= 0) return;
  sfx.horn();
  const v = curVehicle;
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  for (const s of soldiers) {
    if (!s.alive || s.inVehicle) continue;
    const dx = s.obj.position.x - v.obj.position.x, dz = s.obj.position.z - v.obj.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 16 && (dx * fx + dz * fz) / d > 0.5) {
      // 進行方向の兵士は横へ回避
      const side = (dx * fz - dz * fx) > 0 ? 1 : -1;
      s.avoidDir = side;
      s.avoidT = 0.9;
    }
  }
}

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
    if (d < radius + v.radius) damageVehicle(v, dmg * 0.7 * (1 - d / (radius + v.radius)) + 15, 'explosion');
  }
  // 破壊可能オブジェクトへの範囲ダメージ (樽の誘爆も発生)
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
    if (dd) damageDestructible(dd, dmg);
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

/* =========================================================
   v0.3: 偵察ドローン (Tキー / DRNボタン)
   ========================================================= */
const drone = {
  active: false, hp: 0, battery: 0, cooldown: 0,
  obj: null, yaw: 0, pitch: 0, pos: new THREE.Vector3(), spotT: 0
};
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), matVDark);
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), matVGlass); camBox.position.set(0, -0.1, -0.15);
  g.add(body, camBox);
  [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(o => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.06), matVDark);
    arm.position.set(o[0], 0.05, o[1]);
    arm.rotation.y = Math.atan2(o[1], o[0]);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.05), matVDark);
    prop.position.set(o[0], 0.1, o[1]);
    prop.userData.isProp = true;
    g.add(arm, prop);
  });
  g.visible = false;
  scene.add(g);
  drone.obj = g;
}
function toggleDrone() {
  if (!game.running || !player.alive || curVehicle) return;
  if (drone.active) { endDrone(false); return; }
  if (drone.cooldown > 0) { addFeed('ドローン充電中 (' + Math.ceil(drone.cooldown) + 's)', 'red'); return; }
  drone.active = true;
  drone.hp = 30;
  drone.battery = 22;
  drone.pos.set(player.pos.x, player.pos.y + 4, player.pos.z);
  drone.yaw = player.yaw;
  drone.pitch = -0.35;
  drone.obj.visible = true;
  firing = false;
  setAds(false);
  gunGroup.visible = false;
  sfx.drone();
  ui.droneHud.style.display = 'block';
  addFeed('偵察ドローンを展開', 'blue');
}
function endDrone(destroyed) {
  drone.active = false;
  drone.obj.visible = false;
  drone.cooldown = 30;
  gunGroup.visible = !curVehicle;
  ui.droneHud.style.display = 'none';
  camera.fov = FOV_HIP;
  camera.updateProjectionMatrix();
  if (destroyed) {
    spawnParticles(drone.pos, 0xff8830, 8, 4, 1);
    sfx.explosion();
    addFeed('ドローンが撃墜された', 'red');
  } else {
    addFeed('ドローン帰投', 'blue');
  }
}
function updateDrone(dt) {
  drone.cooldown = Math.max(0, drone.cooldown - dt);
  if (!drone.active) return;
  if (!player.alive) { endDrone(false); return; }
  drone.battery -= dt;
  if (drone.battery <= 0) { endDrone(false); return; }
  // 操作: 移動系入力を流用
  let ix = 0, iz = 0, up = 0;
  if (isMobile) {
    ix = joy.x; iz = joy.y;
    if (heliUpHeld) up += 1;
    if (heliDownHeld) up -= 1;
  } else {
    if (keys['KeyW']) iz -= 1;
    if (keys['KeyS']) iz += 1;
    if (keys['KeyA']) ix -= 1;
    if (keys['KeyD']) ix += 1;
    if (keys['Space']) up += 1;
    if (keys['KeyC']) up -= 1;
  }
  const spd = 14;
  const sin = Math.sin(drone.yaw), cos = Math.cos(drone.yaw);
  const wx = (ix * cos + iz * sin) * spd;
  const wz = (iz * cos - ix * sin) * spd;
  drone.pos.x += wx * dt;
  drone.pos.z += wz * dt;
  drone.pos.y += up * 9 * dt;
  const minY = terrainH(drone.pos.x, drone.pos.z) + 1.2;
  drone.pos.y = Math.max(minY, Math.min(70, drone.pos.y));
  drone.pos.x = Math.max(-WORLD, Math.min(WORLD, drone.pos.x));
  drone.pos.z = Math.max(-WORLD, Math.min(WORLD, drone.pos.z));
  drone.obj.position.copy(drone.pos);
  drone.obj.rotation.y = drone.yaw;
  drone.obj.traverse(m => { if (m.userData.isProp) m.rotation.y += dt * 40; });
  // カメラ = ドローン視点
  camera.position.copy(drone.pos).y -= 0.2;
  camera.rotation.set(drone.pitch, drone.yaw, 0);
  // 敵スポット (55m以内 + LoS)
  drone.spotT -= dt;
  if (drone.spotT <= 0) {
    drone.spotT = 0.5;
    let n = 0;
    for (const s of soldiers) {
      if (!s.alive || s.team !== -1) continue;
      const d = s.obj.position.distanceTo(drone.pos);
      if (d < 55 && hasLineOfSight(drone.pos.clone(), s.obj.position.clone().setY(s.obj.position.y + 1.5))) {
        s.spotted = 5;
        n++;
      }
    }
    if (n > 0) ui.droneSpot.textContent = n + ' 体の敵をスポット中';
    else ui.droneSpot.textContent = '';
    // 敵AIがドローンを撃ち落とす可能性
    for (const s of soldiers) {
      if (!s.alive || s.team !== -1 || s.inVehicle) continue;
      const d = s.obj.position.distanceTo(drone.pos);
      if (d < 45 && Math.random() < 0.10) {
        const eye = s.obj.position.clone().setY(s.obj.position.y + 1.6);
        spawnTracer(eye, drone.pos.clone(), 0xff8866);
        sfx.distShoot(camera.position.distanceTo(eye));
        if (Math.random() < 0.35) {
          drone.hp -= 12;
          spawnParticles(drone.pos, 0xffee88, 3, 2);
          if (drone.hp <= 0) { endDrone(true); return; }
        }
      }
    }
  }
  ui.droneBattery.style.width = (drone.battery / 22 * 100) + '%';
}

/* ---------- 車両運転 (プレイヤー搭乗中) ---------- */
let heliUpHeld = false, heliDownHeld = false;
function updateVehicle(dt) {
  const v = curVehicle;
  const role = v.seats[curSeat].role;
  if (v.type === 'heli') { updateHeli(dt, v, role); return; }

  // --- 地上車両 / ボート / 固定砲座 ---
  let throttle = 0, steer = 0;
  if (role === 'driver' && v.maxSpeed > 0) {
    if (isMobile) { throttle = -joy.y; steer = joy.x; }
    else {
      if (keys['KeyW']) throttle += 1;
      if (keys['KeyS']) throttle -= 1;
      if (keys['KeyA']) steer -= 1;
      if (keys['KeyD']) steer += 1;
    }
  }
  const effMax = v.maxSpeed * v.mobility;
  if (throttle !== 0 && v.mobility > 0) {
    v.speed += throttle * v.accel * dt;
  } else {
    v.speed *= Math.pow(0.4, dt);
    if (Math.abs(v.speed) < 0.15) v.speed = 0;
  }
  if (v.type !== 'boat') {
    // 坂の影響: 上りで減速
    const aheadH = terrainH(v.obj.position.x - Math.sin(v.yaw) * 3, v.obj.position.z - Math.cos(v.yaw) * 3);
    const slope = (aheadH - terrainH(v.obj.position.x, v.obj.position.z)) / 3;
    v.speed -= slope * Math.sign(v.speed) * (v.type === 'tank' ? 2.5 : 5) * dt * Math.abs(v.speed) * 0.4;
  }
  v.speed = Math.max(-effMax * 0.45, Math.min(effMax, v.speed));
  if (Math.abs(v.speed) > 0.3) {
    v.yaw -= steer * v.turnRate * dt * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 4);
  }
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const nx = v.obj.position.x + fx * v.speed * dt;
  const nz = v.obj.position.z + fz * v.speed * dt;
  // v0.3: 水域判定 (ボートは水上のみ / 地上車両は深水禁止)
  let blocked = false;
  if (v.type === 'boat') {
    if (!isWater(nx, nz)) blocked = true;
  } else {
    if (isDeepWater(nx, nz)) blocked = true;
  }
  if (!blocked && !collidesAt(nx, nz, v.radius, terrainH(nx, nz) + 1, v)) {
    v.obj.position.x = nx;
    v.obj.position.z = nz;
  } else {
    if (Math.abs(v.speed) > 6) {
      spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1), 0x999999, 5, 3);
      playBeep(90, 0.15, 0.15, 'sawtooth');
      damageVehicle(v, Math.abs(v.speed) * 1.2, 'crash');
    }
    v.speed *= -0.25;
  }
  // 高さ・姿勢
  const px = v.obj.position.x, pz = v.obj.position.z;
  if (v.type === 'boat') {
    v.bobT += dt * 2;
    v.obj.position.y = WATER_Y + 0.15 + Math.sin(v.bobT) * 0.06;
    v.obj.rotation.order = 'YXZ';
    v.obj.rotation.y = v.yaw;
    v.obj.rotation.x = Math.sin(v.bobT * 0.8) * 0.02 - v.speed * 0.004;
    v.obj.rotation.z = Math.sin(v.bobT * 1.1) * 0.02;
    if (Math.abs(v.speed) > 3 && Math.random() < dt * 8) {
      spawnParticles(v.obj.position.clone().setY(WATER_Y + 0.2).addScaledVector(new THREE.Vector3(fx, 0, fz), -2.5), 0xbfe3ef, 2, 2, 0.8);
    }
  } else {
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
  }
  for (const w of v.wheels) w.rotation.x += v.speed * dt * 2.2;
  // v0.3: 轢き (ロードキル) 強化
  if (Math.abs(v.speed) > 4) {
    for (const s of soldiers) {
      if (!s.alive || s.inVehicle) continue;
      const d = Math.hypot(s.obj.position.x - v.obj.position.x, s.obj.position.z - v.obj.position.z);
      if (d < v.radius + 0.7) {
        const p = s.obj.position.clone().setY(s.obj.position.y + 1);
        spawnParticles(p, 0xbb2222, 10, 5, 1.4);
        sfx.roadkill();
        if (s.team === -1) {
          damageSoldierByPlayer(s, 999, p);
          if (!s.alive) { addFeed('🚗 ROADKILL! +120'); game.score += 20; updateScoreUI(); }
        } else damageSoldier(s, 999, p);
        v.speed *= 0.82;
        shake = Math.max(shake, 0.18);
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

  // 砲塔: プレイヤーが砲手席のときのみカメラに追従
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  if (v.turret && role === 'gunner') {
    const aimYaw = Math.atan2(-camDir.x, -camDir.z);
    v.turret.rotation.y = aimYaw - v.yaw;
  }

  v.cd -= dt;
  if (firing && v.cd <= 0 && role === 'gunner' && v.turret) {
    v.cd = v.fireInterval;
    const muzzleWorld = new THREE.Vector3();
    v.muzzle.getWorldPosition(muzzleWorld);
    const aimPoint = camera.position.clone().addScaledVector(camDir, 160);
    const dir = aimPoint.sub(muzzleWorld).normalize();
    if (v.type === 'tank') {
      sfx.cannon();
      fireShell(muzzleWorld, dir, v);
      spawnParticles(muzzleWorld, 0xffcc66, 6, 4);
      flashExplosionLight(muzzleWorld);
      shake = Math.max(shake, 0.35);
    } else {
      if (v.type === 'aa') sfx.flak(); else sfx.mg();
      fireMG(v, muzzleWorld, dir, v.dmg, v.gunRange);
      if (v.type === 'aa') {
        // 連装: 2発目
        fireMG(v, muzzleWorld.clone().add(new THREE.Vector3(0.2, 0, 0)), dir.clone(), v.dmg, v.gunRange);
      }
    }
  }
  updateVehicleUI();
}

/* ---------- v0.3: ヘリ操縦 ---------- */
function updateHeli(dt, v, role) {
  let throttle = 0, steer = 0, lift = 0;
  if (role === 'driver') {
    if (isMobile) {
      throttle = -joy.y; steer = joy.x;
      if (heliUpHeld) lift += 1;
      if (heliDownHeld) lift -= 1;
    } else {
      if (keys['KeyW']) throttle += 1;
      if (keys['KeyS']) throttle -= 1;
      if (keys['KeyA']) steer -= 1;
      if (keys['KeyD']) steer += 1;
      if (keys['Space']) lift += 1;
      if (keys['KeyC']) lift -= 1;
    }
  }
  if (v.mobility <= 0) lift = Math.min(lift, 0);   // ローター損傷では上昇不可
  // 高度
  v.vy += lift * 14 * dt;
  v.vy *= Math.pow(0.25, dt);
  if (lift === 0 && v.alt > 0) v.vy -= 2.2 * dt;   // ゆっくり降下
  v.alt = Math.max(0, v.alt + v.vy * dt);
  if (v.alt <= 0 && v.vy < -6) {
    damageVehicle(v, Math.abs(v.vy) * 6, 'crash');   // ハードランディング
    spawnParticles(v.obj.position.clone(), 0x999999, 8, 4);
  }
  if (v.alt <= 0) v.vy = Math.max(0, v.vy);
  // 水平移動 (高度がないと進めない)
  const airborne = v.alt > 1.2;
  if (throttle !== 0 && airborne) v.speed += throttle * v.accel * dt;
  else { v.speed *= Math.pow(0.5, dt); if (Math.abs(v.speed) < 0.2) v.speed = 0; }
  v.speed = Math.max(-v.maxSpeed * 0.4, Math.min(v.maxSpeed * v.mobility, v.speed));
  if (airborne) v.yaw -= steer * v.turnRate * dt;
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const nx = v.obj.position.x + fx * v.speed * dt;
  const nz = v.obj.position.z + fz * v.speed * dt;
  if (nx > -WORLD && nx < WORLD && nz > -WORLD && nz < WORLD) {
    v.obj.position.x = nx;
    v.obj.position.z = nz;
  } else v.speed *= 0.5;
  // 地形 + 高度
  const gy = Math.max(terrainH(v.obj.position.x, v.obj.position.z), WATER_Y);
  v.obj.position.y = gy + v.alt;
  // 障害物との衝突 (胴体)
  if (v.alt > 0.5 && heightBlocked(v.obj.position.clone().setY(v.obj.position.y + 1))) {
    damageVehicle(v, 40 + Math.abs(v.speed) * 2, 'crash');
    spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1), 0xff8830, 6, 4);
    v.speed *= -0.3;
    v.vy = 3;
  }
  // 姿勢: 前傾/バンク
  v.obj.rotation.order = 'YXZ';
  v.obj.rotation.y = v.yaw;
  v.obj.rotation.x = THREE.MathUtils.lerp(v.obj.rotation.x, v.speed * 0.016, dt * 4);
  v.obj.rotation.z = THREE.MathUtils.lerp(v.obj.rotation.z, -steer * 0.25, dt * 4);
  // ローター回転
  v.rotor.rotation.y += dt * (10 + Math.min(30, 14 + v.alt * 2));
  v.tailRotor.rotation.x += dt * 40;
  v.rocketCd = Math.max(0, v.rocketCd - dt);
  updateEngine(v.speed + v.alt * 0.4);

  // カメラ
  const cp = Math.max(-0.6, Math.min(1.1, player.pitch));
  const cd = v.camDist;
  const cx = v.obj.position.x + Math.sin(player.yaw) * cd * Math.cos(cp);
  const cz = v.obj.position.z + Math.cos(player.yaw) * cd * Math.cos(cp);
  const cy = v.obj.position.y + v.camH + cd * Math.sin(cp);
  camera.position.set(cx, Math.max(terrainH(cx, cz) + 0.8, cy), cz);
  camera.lookAt(v.obj.position.x, v.obj.position.y + 1.5, v.obj.position.z);
  if (shake > 0.01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
  }
  player.pos.set(v.obj.position.x, v.obj.position.y + player.eyeHeight, v.obj.position.z);

  // 機首機銃 (パイロット)
  v.cd -= dt;
  if (firing && v.cd <= 0 && role === 'driver') {
    v.cd = v.fireInterval;
    sfx.mg();
    const muzzleWorld = new THREE.Vector3();
    v.muzzle.getWorldPosition(muzzleWorld);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const aimPoint = camera.position.clone().addScaledVector(camDir, 200);
    const dir = aimPoint.sub(muzzleWorld).normalize();
    fireMG(v, muzzleWorld, dir, v.dmg, v.gunRange);
  }
  updateVehicleUI();
}

/* =========================================================
   v0.3: 全車両の毎フレーム更新 (炎上 / AI砲手 / 自動対空砲)
   ========================================================= */
function updateVehiclesGlobal(dt) {
  for (const v of vehicles) {
    if (!v.alive) continue;
    // 炎上ダメージ + 煙
    if (v.burning) {
      v.hp -= 4 * dt;
      v.smokeT -= dt;
      if (v.smokeT <= 0) {
        v.smokeT = 0.15;
        const p = v.obj.position.clone(); p.y += 1.6;
        spawnParticles(p, 0x333333, 2, 1.6, 1.8);
        if (Math.random() < 0.4) spawnParticles(p, 0xff7722, 1, 2, 1);
      }
      if (v.hp <= 0) { destroyVehicle(v); continue; }
    }
    // ボートの浮遊 (無人時)
    if (v.type === 'boat' && v !== curVehicle) {
      v.bobT += dt * 2;
      v.obj.position.y = WATER_Y + 0.15 + Math.sin(v.bobT) * 0.06;
    }
    // 味方AI砲手: 搭乗中の砲座から射撃
    for (let i = 0; i < v.seats.length; i++) {
      const occ = v.seats[i].occ;
      if (!occ || occ === 'player' || v.seats[i].role !== 'gunner') continue;
      updateAIGunner(v, occ, dt);
    }
    // 赤軍の自動対空砲: プレイヤーのヘリ / ドローンを迎撃
    if (v.type === 'aa' && v.team === -1 && !v.seats[0].occ) {
      updateAutoAA(v, dt);
    }
  }
}
function updateAIGunner(v, s, dt) {
  s.gunCd = (s.gunCd || 0) - dt;
  if (s.gunCd > 0) return;
  s.gunCd = v.type === 'tank' ? 3.0 : 0.5 + Math.random() * 0.4;
  // 最寄りの敵を探す
  const muzzleWorld = new THREE.Vector3();
  v.muzzle.getWorldPosition(muzzleWorld);
  let best = null, bd = v.type === 'tank' ? 75 : 60;
  for (const o of soldiers) {
    if (!o.alive || o.team !== -1 || o.inVehicle) continue;
    const d = o.obj.position.distanceTo(v.obj.position);
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return;
  const tPos = best.obj.position.clone().setY(best.obj.position.y + 1.2);
  if (!hasLineOfSight(muzzleWorld.clone(), tPos)) return;
  // 砲塔を向ける
  if (v.turret) {
    const aimYaw = Math.atan2(tPos.x - v.obj.position.x, tPos.z - v.obj.position.z) + Math.PI;
    v.turret.rotation.y = aimYaw - v.yaw;
  }
  if (v.type === 'tank') {
    sfx.cannon();
    const dir = tPos.clone().sub(muzzleWorld).normalize();
    fireShell(muzzleWorld, dir, v);
    spawnParticles(muzzleWorld, 0xffcc66, 6, 4);
  } else {
    sfx.distShoot(camera.position.distanceTo(muzzleWorld));
    const hit = Math.random() < Math.max(0.2, 0.6 - bd * 0.006);
    const target = tPos.clone();
    if (!hit) { target.x += (Math.random() - .5) * 3; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 3; }
    spawnTracer(muzzleWorld, target, 0x8ecbff);
    if (hit) damageSoldier(best, 14 + Math.random() * 14, target, true, s);
  }
}
function updateAutoAA(v, dt) {
  v.aaCd -= dt;
  if (v.aaCd > 0) return;
  // ターゲット: プレイヤーのヘリ or ドローン
  let tPos = null, isDrone = false;
  if (curVehicle && curVehicle.type === 'heli' && curVehicle.alt > 3) {
    const d = curVehicle.obj.position.distanceTo(v.obj.position);
    if (d < 150) tPos = curVehicle.obj.position.clone().setY(curVehicle.obj.position.y + 1);
  }
  if (!tPos && drone.active) {
    const d = drone.pos.distanceTo(v.obj.position);
    if (d < 100) { tPos = drone.pos.clone(); isDrone = true; }
  }
  if (!tPos) { v.aaCd = 0.5; return; }
  v.aaCd = 0.22;
  const muzzleWorld = new THREE.Vector3();
  v.muzzle.getWorldPosition(muzzleWorld);
  if (!hasLineOfSight(muzzleWorld.clone(), tPos)) { v.aaCd = 0.6; return; }
  const aimYaw = Math.atan2(tPos.x - v.obj.position.x, tPos.z - v.obj.position.z) + Math.PI;
  v.turret.rotation.y = aimYaw - v.yaw;
  sfx.flakDist(camera.position.distanceTo(muzzleWorld));
  const hit = Math.random() < 0.4;
  const target = tPos.clone();
  if (!hit) { target.x += (Math.random() - .5) * 5; target.y += (Math.random() - .5) * 4; target.z += (Math.random() - .5) * 5; }
  spawnTracer(muzzleWorld, target, 0xffaa44);
  if (hit) {
    spawnParticles(target, 0xffaa44, 4, 3);
    if (isDrone) {
      drone.hp -= 15;
      if (drone.hp <= 0) endDrone(true);
    } else if (curVehicle && curVehicle.type === 'heli') {
      damageVehicle(curVehicle, 16 + Math.random() * 10, 'aa');
      showDamageDirection(v.obj.position);
    }
  }
}

function updateVehicleUI() {
  const v = curVehicle;
  if (!v) return;
  ui.vehicleFill.style.width = (v.hp / v.maxHp * 100) + '%';
  ui.vehicleFill.style.background = v.hp / v.maxHp > 0.35 ? 'linear-gradient(90deg,#3dc9dc,#a7e9f3)' : 'linear-gradient(90deg,#e0483d,#f3a7a0)';
  const spd = v.type === 'heli' ? Math.abs(Math.round(v.speed * 3.6)) + ' km/h  ALT ' + Math.round(v.alt) + 'm'
            : Math.abs(Math.round(v.speed * 3.6)) + ' km/h';
  ui.vehicleSpeed.textContent = spd;
  let st = '';
  if (v.burning) st += '🔥炎上 ';
  if (v.partHint) st += '⚠' + v.partHint;
  ui.vehicleParts.textContent = st;
  if (v.type === 'heli' && v.seats[curSeat].role === 'driver') ui.ammoMag.textContent = '🚀' + v.rockets;
}
