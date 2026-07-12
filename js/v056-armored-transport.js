'use strict';
/* v0.5.6 — APC / 大人数輸送車 */

const v056 = {
  spawned: 0,
  apcs: 0,
  transports: 0
};

function addWheelSetV056(g, positions, radius, width) {
  const wheels = [];
  const geo = new THREE.CylinderGeometry(radius, radius, width, 12);
  for (const p of positions) {
    const wheel = new THREE.Mesh(geo, matTire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(p[0], radius, p[1]);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .42, radius * .42, width + .03, 8), matHub);
    wheel.add(hub);
    g.add(wheel);
    wheels.push(wheel);
  }
  return wheels;
}

function finalizeVehicleV056(v) {
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
  if (typeof initVehicleLogisticsV055 === 'function') initVehicleLogisticsV055(v);
  vehicles.push(v);
  v056.spawned++;
  return v;
}

function createAPCV056(x, z, rotY = 0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.05, 1.25, 5.4), matTank);
  hull.position.y = 1.2;
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.8, .8, 1.2), matTank2);
  glacis.position.set(0, 1.45, -2.65);
  glacis.rotation.x = .35;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.65, .28, 3.4), matTank2);
  roof.position.set(0, 1.95, .25);
  const rearDoor = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.1, .12), matVDark);
  rearDoor.position.set(0, 1.25, 2.74);
  g.add(hull, glacis, roof, rearDoor);

  const wheels = addWheelSetV056(g, [
    [-1.48, -1.9], [1.48, -1.9], [-1.48, -.65], [1.48, -.65],
    [-1.48, .65], [1.48, .65], [-1.48, 1.9], [1.48, 1.9]
  ], .55, .38);

  const turret = new THREE.Group();
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(.62, .72, .55, 10), matTank);
  cupola.position.y = .28;
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 1.9, 7), matVDark);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, .35, -1.15);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, .35, -2.12);
  turret.add(cupola, gun, muzzle);
  turret.position.set(0, 2.15, -.35);
  g.add(turret);

  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);

  const v = baseVehicleState({
    type: 'apc', name: 'M80 APC', obj: g, turret, muzzle, wheels, glass: null,
    yaw: rotY, hp: 620, maxHp: 620, armorV056: .62,
    radius: 2.5, maxSpeed: 11, accel: 6.2, turnRate: 1.25,
    fireInterval: .16, camDist: 10, camH: 3.35, dmg: 46, gunRange: 285,
    seats: [
      mkSeat('driver', -.55, 1.8, -1.4), mkSeat('gunner', 0, 2.45, -.35),
      mkSeat('passenger', -.7, 1.7, .2), mkSeat('passenger', .7, 1.7, .2),
      mkSeat('passenger', -.7, 1.7, 1.0), mkSeat('passenger', .7, 1.7, 1.0),
      mkSeat('passenger', -.7, 1.7, 1.8), mkSeat('passenger', .7, 1.7, 1.8)
    ]
  });
  v056.apcs++;
  return finalizeVehicleV056(v);
}

function createTransportV056(x, z, rotY = 0) {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 2.2), matVBody);
  cab.position.set(0, 1.45, -2.15);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.25, .75, 1.15), matVBody2);
  hood.position.set(0, 1.05, -3.6);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.65, .45, 4.3), matVDark);
  bed.position.set(0, 1.05, 1.05);
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.65, 4.05), matCanvas);
  canvas.position.set(0, 2.0, 1.05);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.0, .65, .08), matVGlass);
  windshield.position.set(0, 1.85, -3.27);
  g.add(cab, hood, bed, canvas, windshield);
  const wheels = addWheelSetV056(g, [
    [-1.24, -2.45], [1.24, -2.45], [-1.24, .15], [1.24, .15], [-1.24, 2.15], [1.24, 2.15]
  ], .58, .4);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);

  const seats = [mkSeat('driver', -.55, 1.9, -2.25), mkSeat('passenger', .55, 1.9, -2.25)];
  for (let i = 0; i < 8; i++) {
    seats.push(mkSeat('passenger', i % 2 ? .72 : -.72, 1.7, -.25 + Math.floor(i / 2) * .9));
  }
  const v = baseVehicleState({
    type: 'transport', name: 'M35 輸送トラック', obj: g, turret: null, muzzle: null, wheels, glass: windshield,
    yaw: rotY, hp: 380, maxHp: 380, armorV056: .9,
    radius: 2.65, maxSpeed: 14, accel: 7, turnRate: 1.15,
    fireInterval: 0, camDist: 10, camH: 3.2, dmg: 0, gunRange: 0,
    seats
  });
  v056.transports++;
  return finalizeVehicleV056(v);
}

function resetV056() {
  v056.spawned = 0;
  v056.apcs = 0;
  v056.transports = 0;
  createAPCV056(HQ_BLUE.x + 28, HQ_BLUE.z - 18, -Math.PI / 4);
  createTransportV056(HQ_BLUE.x + 30, HQ_BLUE.z - 3, -Math.PI / 4);
  createAPCV056(HQ_RED.x - 28, HQ_RED.z + 18, Math.PI * .75);
  createTransportV056(HQ_RED.x - 30, HQ_RED.z + 3, Math.PI * .75);
  createTransportV056(-218, 132, Math.PI / 2);
}

function updateV056() {
  // 車両制御・AI搭乗・燃料・損傷は既存共通システムが処理する。
}
