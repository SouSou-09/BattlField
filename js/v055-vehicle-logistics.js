'use strict';
/* v0.5.5 — 車両燃料、HQ給油所、停車カモネット、同乗者射撃 */

const v055 = {
  refuelPoints: [],
  worldReady: false,
  refuels: 0,
  camoDeploys: 0,
  dryVehicles: 0
};

function fuelCapacityV055(v) {
  if (!v || v.maxSpeed <= 0) return 0;
  if (v.type === 'heli') return 150;
  if (v.type === 'tank' || v.type === 'apc') return 125;
  if (v.type === 'transport') return 110;
  if (v.type === 'boat') return 90;
  return 75;
}

function createRefuelPointV055(x, z, team) {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshLambertMaterial({ color: team === 1 ? 0x315e8c : 0x843a32 });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x777b70 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x252a2b });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, .18, 20), baseMat);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.4, 12), tankMat);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 1.2, 0);
  const pump = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.5, .65), darkMat);
  pump.position.set(2.1, .85, 0);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, .65, .12), baseMat);
  sign.position.set(0, 2.6, 0);
  g.add(pad, tank, pump, sign);
  g.position.set(x, terrainH(x, z) + .08, z);
  g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
  scene.add(g);
  v055.refuelPoints.push({ x, z, team, radius: 8, obj: g });
}

function ensureWorldV055() {
  if (v055.worldReady) return;
  v055.worldReady = true;
  createRefuelPointV055(HQ_BLUE.x + 22, HQ_BLUE.z - 4, 1);
  createRefuelPointV055(HQ_RED.x - 22, HQ_RED.z + 4, -1);
}

function buildCamoNetV055(v) {
  if (!v || v.maxSpeed <= 0 || v.type === 'bike' || v.type === 'heli') return null;
  const mat = new THREE.MeshLambertMaterial({ color: 0x526742, transparent: true, opacity: .72, side: THREE.DoubleSide });
  const w = Math.max(2.8, v.radius * 2.15);
  const d = Math.max(4, v.radius * 2.5);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 5, 6), mat);
  net.rotation.x = -Math.PI / 2;
  net.position.set(0, v.type === 'tank' || v.type === 'apc' ? 2.8 : 2.25, 0);
  net.visible = false;
  v.obj.add(net);
  return net;
}

function initVehicleLogisticsV055(v) {
  if (!v) return;
  const cap = fuelCapacityV055(v);
  v.fuelMaxV055 = cap;
  v.fuelV055 = cap;
  v.refuelingV055 = false;
  v.fuelDryV055 = false;
  v.stationaryTV055 = 0;
  v.camoActiveV055 = false;
  if (!v.camoNetV055) v.camoNetV055 = buildCamoNetV055(v);
  if (v.camoNetV055) v.camoNetV055.visible = false;
}

function passengerCanFireV055(v, role) {
  return !!v && role === 'passenger' && ['bike', 'jeep', 'boat', 'transport', 'apc'].includes(v.type);
}

function vehicleHasFuelV055(v) {
  return !v || v.maxSpeed <= 0 || (v.fuelV055 || 0) > .02;
}

function vehicleCamoConcealmentV055(v) {
  return v && v.camoActiveV055 ? .3 : 0;
}

function nearestRefuelPointV055(v) {
  let best = null;
  let bd = Infinity;
  for (const p of v055.refuelPoints) {
    const d = Math.hypot(v.obj.position.x - p.x, v.obj.position.z - p.z);
    if (d < p.radius && d < bd) { best = p; bd = d; }
  }
  return best;
}

function updateCamoNetV055(v, dt) {
  if (!v.camoNetV055 || !v.alive) return;
  const stopped = Math.abs(v.speed || 0) < .12 && v !== curVehicle;
  if (stopped) v.stationaryTV055 += dt;
  else v.stationaryTV055 = 0;
  const active = v.stationaryTV055 >= 7;
  if (active && !v.camoActiveV055) v055.camoDeploys++;
  v.camoActiveV055 = active;
  v.camoNetV055.visible = active;
}

function updateVehicleFuelV055(v, dt) {
  if (!v.alive || v.fuelMaxV055 <= 0) return;
  const occupied = (v.seats || []).some(st => !!st.occ);
  const moving = Math.abs(v.speed || 0) > .2;
  const flying = v.type === 'heli' && v.alt > .2;
  if (occupied || moving || flying) {
    let burn = v.type === 'heli' ? .48 : v.type === 'tank' || v.type === 'apc' ? .24 : .14;
    burn *= .35 + Math.min(1.8, Math.abs(v.speed || 0) / Math.max(1, v.maxSpeed));
    if (!moving && !flying) burn *= .24;
    v.fuelV055 = Math.max(0, v.fuelV055 - burn * dt);
  }
  const point = nearestRefuelPointV055(v);
  const canRefuel = point && Math.abs(v.speed || 0) < .35 && (v.type !== 'heli' || v.alt < .4);
  v.refuelingV055 = !!canRefuel && v.fuelV055 < v.fuelMaxV055;
  if (v.refuelingV055) {
    v.fuelV055 = Math.min(v.fuelMaxV055, v.fuelV055 + 18 * dt);
    if (Math.random() < dt * 2.5) spawnParticles(v.obj.position.clone().setY(v.obj.position.y + .5), 0x76c7ff, 1, .5, .65);
    if (v.fuelV055 >= v.fuelMaxV055 && v.fuelDryV055) addFeed(v.name + ' 給油完了', 'blue');
  }
  const dry = v.fuelV055 <= .02;
  if (dry && !v.fuelDryV055) {
    v055.dryVehicles++;
    v.speed *= .7;
    if (curVehicle === v) { addFeed('燃料切れ — HQ給油所へ移動不能', 'red'); stopEngine(); }
  }
  if (!dry && v.fuelDryV055 && curVehicle === v) startEngine(v.type);
  v.fuelDryV055 = dry;
}

function updateV055(dt) {
  ensureWorldV055();
  for (const v of vehicles) {
    if (v.fuelV055 === undefined) initVehicleLogisticsV055(v);
    updateVehicleFuelV055(v, dt);
    updateCamoNetV055(v, dt);
  }
}

function resetV055() {
  ensureWorldV055();
  v055.refuels = 0;
  v055.camoDeploys = 0;
  v055.dryVehicles = 0;
  for (const v of vehicles) initVehicleLogisticsV055(v);
}
