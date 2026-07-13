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
// v0.3.2: ディテール用マテリアル
const matLight = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
const matTailLight = new THREE.MeshBasicMaterial({ color: 0xb02020 });
const matRust = new THREE.MeshLambertMaterial({ color: 0x6b5540 });
const matTire = new THREE.MeshLambertMaterial({ color: 0x181a1c });
const matHub = new THREE.MeshLambertMaterial({ color: 0x555b52 });
const matCanvas = new THREE.MeshLambertMaterial({ color: 0x4d5a3c });

/* 座席: { role:'driver'|'gunner'|'passenger', pos:Vector3(ローカル), occ:null|'player'|soldier } */
function mkSeat(role, x, y, z) { return { role, pos: new THREE.Vector3(x, y, z), occ: null }; }

function baseVehicleState(v) {
  return Object.assign(v, {
    speed: 0, alive: true, cd: 0,
    burning: false, mobility: 1,           // v0.3: 部位ダメージ (mobility 0=走行不能)
    partHint: '', smokeT: 0,
    glass: v.glass || null, glassHp: 0, glassHp0: 0, glassBroken: false,
    tireParts: [], damageRoll: 0,
    falling: false, fallVy: 0, fallSpin: 0 // v0.3.1: 空中での撃墤 → 墤落
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
  // v0.3.2: ディテール — ヘッドライト/テールランプ/グリル/ジェリ缶/スペアタイヤ/アンテナ/ミラー
  const hlL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 8), matLight);
  hlL.rotation.x = Math.PI / 2; hlL.position.set(-0.6, 1.0, -2.08); g.add(hlL);
  const hlR = hlL.clone(); hlR.position.x = 0.6; g.add(hlR);
  const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), matTailLight); tlL.position.set(-0.75, 0.95, 1.82); g.add(tlL);
  const tlR = tlL.clone(); tlR.position.x = 0.75; g.add(tlR);
  for (let i = 0; i < 5; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.03), matVDark);
    slat.position.set(-0.44 + i * 0.22, 1.02, -2.06); g.add(slat);
  }
  const jerry = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.18), matRust); jerry.position.set(-0.85, 1.45, 1.72); g.add(jerry);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), matTire);
  spare.rotation.x = Math.PI / 2; spare.position.set(0.3, 1.5, 1.82); g.add(spare);
  const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8), matHub);
  spareHub.rotation.x = Math.PI / 2; spareHub.position.copy(spare.position); g.add(spareHub);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), matVDark);
  antenna.position.set(-0.9, 2.0, 1.5); antenna.rotation.z = 0.12; g.add(antenna);
  const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.12), matVDark); mirrorL.position.set(-1.05, 1.55, -0.9); g.add(mirrorL);
  const mirrorR = mirrorL.clone(); mirrorR.position.x = 1.05; g.add(mirrorR);
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 12);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8);
  const wheels = [];
  [[-0.95, -1.2], [0.95, -1.2], [-0.95, 1.2], [0.95, 1.2]].forEach(o => {
    const w = new THREE.Mesh(wheelGeo, matTire);
    w.rotation.z = Math.PI / 2;
    w.position.set(o[0], 0.45, o[1]);
    const hub = new THREE.Mesh(hubGeo, matHub);
    w.add(hub);
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
    type: 'jeep', name: 'M151 ジープ', obj: g, turret, muzzle, wheels, glass: windshield,
    yaw: rotY, hp: 300, maxHp: 300,
    radius: 1.9, maxSpeed: 17, accel: 11, turnRate: 1.9,
    fireInterval: 0.09, camDist: 7.5, camH: 2.6, dmg: 34, gunRange: 250,
    seats: [mkSeat('driver', -0.5, 1.5, -0.3), mkSeat('gunner', 0, 2.4, 0.4), mkSeat('passenger', 0.5, 1.5, -0.3)]
  });
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
  vehicles.push(v);
  return v;
}

/* ---------- v0.4.1: バイク — 高速・無防備・2人乗り(後席射撃可) ---------- */
function createBike(x, z, rotY = 0) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 1.7), matVDark); frame.position.y = 0.75;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.6), matVBody); tank.position.set(0, 0.95, -0.25);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.9), matVDark); seat.position.set(0, 0.98, 0.45);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.06), matVDark); bars.position.set(0, 1.18, -0.72);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), matHub); fork.position.set(0, 0.72, -0.82); fork.rotation.x = 0.3;
  const exhaustB = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.9, 6), matRust);
  exhaustB.rotation.x = Math.PI / 2; exhaustB.position.set(0.2, 0.55, 0.5);
  const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), matLight);
  hl.rotation.x = Math.PI / 2; hl.position.set(0, 1.05, -0.95);
  g.add(frame, tank, seat, bars, fork, exhaustB, hl);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.12, 12);
  const wheels = [];
  [[0, -0.85], [0, 0.85]].forEach(o => {
    const w = new THREE.Mesh(wheelGeo, matTire);
    w.rotation.z = Math.PI / 2;
    w.position.set(o[0], 0.36, o[1]);
    g.add(w); wheels.push(w);
  });
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = baseVehicleState({
    type: 'bike', name: 'KLR バイク', obj: g, turret: null, muzzle: null, wheels, glass: null,
    yaw: rotY, hp: 120, maxHp: 120,
    radius: 1.0, maxSpeed: 26, accel: 15, turnRate: 2.6,
    fireInterval: 0, camDist: 6.5, camH: 2.2, dmg: 0, gunRange: 0,
    lean: 0,
    seats: [mkSeat('driver', 0, 1.5, -0.1), mkSeat('passenger', 0, 1.5, 0.7)]
  });
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
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
  // v0.3.2: ディテール — 転輪/エンジンデッキ/排気管/前傾斜装甲/フェンダー
  const rwGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 10);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 5; i++) {
      const rw = new THREE.Mesh(rwGeo, matHub);
      rw.rotation.z = Math.PI / 2;
      rw.position.set(side * 1.45, 0.45, -1.8 + i * 0.9);
      g.add(rw);
    }
  }
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.55, 1.0), matTank);
  glacis.position.set(0, 1.15, -2.5); glacis.rotation.x = 0.55; g.add(glacis);
  const engineDeck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.5), matTank2); engineDeck.position.set(0, 1.9, 1.6); g.add(engineDeck);
  for (let i = 0; i < 3; i++) {
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.03, 0.16), matVDark);
    grill.position.set(0, 1.99, 1.2 + i * 0.4); g.add(grill);
  }
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), matRust);
  exhaust.rotation.x = Math.PI / 2; exhaust.position.set(-1.15, 1.75, 2.4); g.add(exhaust);
  const fenderL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 1.0), matTank2); fenderL.position.set(-1.45, 1.32, -2.4); g.add(fenderL);
  const fenderR = fenderL.clone(); fenderR.position.x = 1.45; g.add(fenderR);
  const towCable = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.2), matVDark); towCable.position.set(1.2, 1.52, 0.2); g.add(towCable);
  const turret = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 2.3), matTank); dome.position.y = 0.35;
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 8), matTank2); hatch.position.set(-0.4, 0.78, 0.4);
  const gunMantlet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4), matTank2); gunMantlet.position.set(0, 0.35, -1.2);
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.0, 8), matVDark);
  cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 0.35, -2.7);
  // v0.3.2: 砲口制退器 / スモークディスチャージャー / アンテナ / 予備燃料缶
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 8), matVDark);
  muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.35, -4.0);
  const smokeL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), matTank2);
  smokeL.rotation.x = Math.PI / 2 - 0.5; smokeL.position.set(-0.75, 0.5, -1.0);
  const smokeR = smokeL.clone(); smokeR.position.x = 0.75;
  const tAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), matVDark);
  tAntenna.position.set(0.8, 1.4, 0.9); tAntenna.rotation.z = -0.1;
  const drumL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8), matRust);
  drumL.rotation.x = Math.PI / 2; drumL.position.set(-0.6, 0.4, 1.3);
  const drumR = drumL.clone(); drumR.position.x = 0.6;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.35, -4.2);
  turret.add(dome, hatch, gunMantlet, cannon, muzzleBrake, smokeL, smokeR, tAntenna, drumL, drumR, muzzle);
  turret.position.set(0, 1.85, -0.3);
  g.add(turret);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);
  const v = baseVehicleState({
    type: 'tank', name: 'T-70 戦車', obj: g, turret, muzzle, wheels: [], trackMeshesV054: [trackL, trackR],
    yaw: rotY, hp: 900, maxHp: 900,
    radius: 2.6, maxSpeed: 8.5, accel: 4.5, turnRate: 1.1,
    fireInterval: 1.8, camDist: 10.5, camH: 3.6,
    seats: [mkSeat('driver', -0.4, 1.9, 0.6), mkSeat('gunner', 0, 2.6, -0.3)]
  });
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
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
  // v0.3.2: ディテール — エンジンナセル/排気口/スタブウィング/機首ガン/尾翼/警告灯
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.8), matHeli2); nacelle.position.set(0, 2.45, 0.3); g.add(nacelle);
  const intakeL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.4, 8), matVDark);
  intakeL.rotation.x = Math.PI / 2; intakeL.position.set(-0.55, 2.45, -0.7); g.add(intakeL);
  const intakeR = intakeL.clone(); intakeR.position.x = 0.55; g.add(intakeR);
  const exhaustH = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), matRust);
  exhaustH.rotation.x = Math.PI / 2; exhaustH.position.set(0, 2.4, 1.4); g.add(exhaustH);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.55), matHeli); wingL.position.set(-1.0, 1.55, -0.5); g.add(wingL);
  const wingR = wingL.clone(); wingR.position.x = 1.0; g.add(wingR);
  const chinGun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), matVDark);
  chinGun.rotation.x = Math.PI / 2; chinGun.position.set(0, 0.95, -2.9); g.add(chinGun);
  const chinMount = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.5), matVDark); chinMount.position.set(0, 1.0, -2.4); g.add(chinMount);
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.5), matHeli); hStab.position.set(0, 2.1, 4.4); g.add(hStab);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), matTailLight); beacon.position.set(0, 2.35, 5.55); g.add(beacon);
  const canopyFrame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 1.24), matHeli2); canopyFrame.position.set(0, 2.12, -2.6); g.add(canopyFrame);
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
    type: 'heli', name: 'AH-1 攻撃ヘリ', obj: g, turret: null, muzzle, wheels: [], glass: nose,
    rotor, tailRotor, rotorBladesV054: [b1, b2], yaw: rotY, hp: 420, maxHp: 420,
    radius: 2.4, maxSpeed: 26, accel: 9, turnRate: 1.5,
    fireInterval: 0.11, camDist: 13, camH: 4.5, dmg: 30, gunRange: 300,
    alt: 0, vy: 0, rocketCd: 0, rockets: 24,
    seats: [mkSeat('driver', 0, 1.6, -1.6), mkSeat('gunner', -0.8, 1.5, 0.6)]
  });
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
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
  // v0.3.2: ディテール — ガンネル(舵縁)/座席/フェンダー/航海灯/アンテナ
  const gwL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 4.6), matBoat); gwL.position.set(-1.05, 0.95, -0.1); g.add(gwL);
  const gwR = gwL.clone(); gwR.position.x = 1.05; g.add(gwR);
  const seat1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), matVDark); seat1.position.set(0, 0.9, 1.0); g.add(seat1);
  const seat2 = seat1.clone(); seat2.position.z = 1.9; g.add(seat2);
  const fenderGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6);
  [[-1.14, -0.8], [-1.14, 0.8], [1.14, -0.8], [1.14, 0.8]].forEach(o => {
    const f = new THREE.Mesh(fenderGeo, matRust); f.position.set(o[0], 0.75, o[1]); g.add(f);
  });
  const navG = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), matLight); navG.position.set(0.6, 1.0, -2.9); g.add(navG);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), matTailLight); navR.position.set(-0.6, 1.0, -2.9); g.add(navR);
  const bAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4), matVDark); bAntenna.position.set(0.5, 2.0, 0.5); g.add(bAntenna);
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
    type: 'boat', name: 'RB-12 ボート', obj: g, turret, muzzle, wheels: [], glass: wind, boatEngineMeshV054: motor,
    yaw: rotY, hp: 250, maxHp: 250,
    radius: 1.9, maxSpeed: 15, accel: 7, turnRate: 1.6,
    fireInterval: 0.1, camDist: 8.5, camH: 2.8, dmg: 30, gunRange: 220,
    bobT: Math.random() * 6,
    seats: [mkSeat('driver', 0, 1.4, 0.8), mkSeat('gunner', 0, 1.4, -2.0), mkSeat('passenger', 0, 1.2, 1.9)]
  });
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
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
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
  vehicles.push(v);
  return v;
}

function spawnVehicles() {
  for (const v of vehicles) {
    if (typeof unregisterVehiclePartsV048 === 'function') unregisterVehiclePartsV048(v);
    if (typeof unregisterVehicleDamageV054 === 'function') unregisterVehicleDamageV054(v);
    scene.remove(v.obj);
  }
  vehicles.length = 0;
  // 青HQ
  createJeep(HQ_BLUE.x + 12, HQ_BLUE.z - 14, -Math.PI / 4);
  createTank(HQ_BLUE.x - 4, HQ_BLUE.z - 20, -Math.PI / 4);
  createHeli(HQ_BLUE.x + 20, HQ_BLUE.z + 8, -Math.PI / 2);
  createEmplacement('aa', HQ_BLUE.x - 14, HQ_BLUE.z - 8, -Math.PI / 4, 1);
  // 赤HQ (対空砲は自動迎撃 / 車両は奪取可能)
  createJeep(HQ_RED.x - 12, HQ_RED.z + 14, Math.PI * 0.75);
  createEmplacement('aa', HQ_RED.x + 14, HQ_RED.z + 8, Math.PI * 0.75, -1);
  // 中立 (拠点C付近と道路沿い / v0.8.0: 旗位置参照へ修正)
  createJeep(flags[2].x + 12, flags[2].z + 36, Math.PI / 2);
  createJeep(-135, -73, 0);              // v0.8.0: 道路沿い (旧-104,-56)
  createJeep(flags[1].x, flags[1].z - 12, Math.PI / 2);   // 拠点B
  createTank(flags[3].x, flags[3].z - 12, Math.PI);       // 拠点D
  // v0.4.1: バイク — 旗の裏取り用に各拠点へ分散配置
  createBike(HQ_BLUE.x + 6, HQ_BLUE.z - 20, -Math.PI / 4);
  createBike(HQ_RED.x - 6, HQ_RED.z + 20, Math.PI * 0.75);
  createBike(flags[2].x - 6, flags[2].z + 26, Math.PI / 2);       // 拠点C
  createBike(flags[1].x + 8, flags[1].z + 10, 0);              // 拠点B
  // 拠点E ヘリパッド
  createHeli(flags[4].x + 2, flags[4].z + 14, Math.PI);
  // 湖のボート (岸辺) v0.8.0: LAKE基準
  createBoat(LAKE.x - 100, LAKE.z, Math.PI / 2);
  createBoat(LAKE.x + 34, LAKE.z - 72, -Math.PI / 2);
  // 固定機銃: 砦A / 島F
  createEmplacement('mg', flags[0].x + 6, flags[0].z + 6, Math.PI / 4, 0);
  createEmplacement('mg', flags[5].x - 3, flags[5].z - 8, Math.PI, 0);
}

/* ---------- v0.3: ダメージ / 部位破損 / 炎上 ---------- */
function damageVehicle(v, dmg, cause = '', hitPos = null) {
  if (!v.alive) return;
  if (v.type === 'apc') dmg *= cause === 'smallarms' ? .25 : cause === 'explosion' ? .72 : .88;
  v.hp -= dmg;
  if (typeof damageVehiclePartsV048 === 'function') damageVehiclePartsV048(v, dmg, cause, hitPos);
  if (typeof damageVehicleSystemsV054 === 'function') {
    damageVehicleSystemsV054(v, dmg, cause, hitPos);
  } else {
    // v0.5.4未読込時の後方互換
    if (v.maxSpeed > 0 && dmg >= 40 && Math.random() < .45) v.mobility = Math.min(v.mobility, .5);
    if (!v.burning && v.hp > 0 && v.hp < v.maxHp * .3) v.burning = true;
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
  // v0.3.1: 飛行中のヘリは浮いたままにせず、回転しながら墤落させる
  if (v.type === 'heli' && v.alt > 0.5) {
    v.falling = true;
    v.fallVy = Math.min(-1, v.vy || 0);
    v.fallSpin = (Math.random() < .5 ? -1 : 1) * (1.8 + Math.random() * 1.5);
  }
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
  if (typeof passengerCanFireV055 === 'function' && passengerCanFireV055(v, role)) return weaponDef().name;
  if (v.type === 'tank') return '125mm 主砲';
  if (v.type === 'apc') return '30mm 機関砲';
  if (v.type === 'aa') return '23mm 連装機関砲';
  return 'M2 重機関銃';
}
function updateSeatUI() {
  const v = curVehicle;
  if (!v) return;
  const st = v.seats[curSeat];
  ui.vehicleName.textContent = v.name + ' [' + (st.role === 'driver' ? '運転' : st.role === 'gunner' ? '砲手' : '同乗') + ']';
  ui.weaponName.textContent = seatWeaponName(v, st.role);
  // v0.5.5: 開放座席の同乗者は個人武器を使用
  if (typeof passengerCanFireV055 === 'function' && passengerCanFireV055(v, st.role)) { updateAmmoUI(); return; }
  ui.ammoMag.textContent = v.type === 'heli' && st.role === 'driver' ? '🚀' + v.rockets : '∞';
  ui.ammoMag.style.color = '#fff';
  ui.ammoReserve.textContent = '';
  ui.reloadHint.textContent = '';
}
function exitVehicle(forced = false) {
  if (!curVehicle) return;
  const v = curVehicle;
  v.seats[curSeat].occ = null;
  const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
  if (v.type === 'heli' && v.alt > 3) {
    // v0.3.4: 空中脱出 — 即パラシュートではなく初速ゼロの自由落下から徐々に加速
    // (Space / JUMPボタンでパラシュート開閉。開かず落ちると落下ダメージ)
    player.pos.set(
      v.obj.position.x + side.x * (v.radius + 1.5),
      v.obj.position.y + player.eyeHeight,
      v.obj.position.z + side.z * (v.radius + 1.5)
    );
    player.vel.set(0, 0, 0);          // 初速ゼロ → 重力で徐々に落下
    player.onGround = false;
    addFeed('🪂 ' + (isMobile ? 'JUMPボタン' : 'Space') + ' でパラシュート開閉', 'blue');
  } else {
    for (const s of [1, -1, 1.6, -1.6]) {
      const px = v.obj.position.x + side.x * (v.radius + 0.8) * s;
      const pz = v.obj.position.z + side.z * (v.radius + 0.8) * s;
      if (!collidesAt(px, pz, player.radius, terrainH(px, pz) + 1)) {
        player.pos.set(px, terrainH(px, pz) + player.eyeHeight, pz);
        break;
      }
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
  if (typeof repairVehiclePartsV048 === 'function') repairVehiclePartsV048(v, dt);
  if (v.hp > v.maxHp * 0.35 && v.burning) { v.burning = false; addFeed('鎮火した', 'blue'); }
  if (v.hp > v.maxHp * 0.6 && v.mobility < 1 && (!v.tireParts || !v.tireParts.some(t => t.broken)) &&
      !(typeof tankTranslationBlockedV054 === 'function' && tankTranslationBlockedV054(v)) &&
      !(v.type === 'heli' && typeof heliAutorotationAvailableV054 === 'function' && !heliAutorotationAvailableV054(v)) &&
      !(v.type === 'boat' && typeof boatCanPropelV054 === 'function' && !boatCanPropelV054(v))) {
    v.mobility = 1; v.partHint = ''; addFeed('走行系を修理した', 'blue');
  }
  if (typeof repairVehicleDamageV054 === 'function') repairVehicleDamageV054(v, dt);
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
