'use strict';
/* v0.5.7 — 森林火災、貯水塔、監視塔、ガソリンスタンド */

const v057 = {
  objects: [],
  fires: [],
  worldReady: false,
  ignitions: 0,
  collapsedTowers: 0,
  chainExplosions: 0
};

function registerStrategicV057(mesh, object) {
  mesh.userData.strategicV057 = object;
  if (!solidMeshes.includes(mesh)) solidMeshes.push(mesh);
  object.hitMeshes.push(mesh);
}

function makeStrategicV057(kind, hp, group) {
  const object = { kind, hp, hp0: hp, group, dead: false, hitMeshes: [], ob: null, fireT: 0 };
  v057.objects.push(object);
  return object;
}

function addForestPatchV057(cx, cz) {
  const trees = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + (i % 2) * .3;
    const r = i === 0 ? 0 : 5 + (i % 3) * 3;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.28, .4, 4.2, 7), matTrunk);
    trunk.position.y = 2.1;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.25, 5.3, 8), i % 2 ? matLeaf : matLeaf2);
    crown.position.y = 5.1;
    g.add(trunk, crown);
    g.position.set(x, terrainH(x, z), z);
    g.traverse(m => { if (m.isMesh) m.castShadow = !isMobile; });
    scene.add(g);
    const tree = makeStrategicV057('tree', 55, g);
    tree.crown = crown;
    tree.radius = 7;
    registerStrategicV057(trunk, tree);
    registerStrategicV057(crown, tree);
    trees.push(tree);
  }
  return trees;
}

function addWaterTowerV057(x, z) {
  const g = new THREE.Group();
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.22, 7, .22), matVDark);
    leg.position.set(sx * 1.1, 3.5, sz * 1.1);
    g.add(leg);
    legs.push(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 3.3, 14), matBoat);
  tank.position.y = 8;
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24), new THREE.MeshBasicMaterial({ color: 0x5aa4c9, transparent: true, opacity: .48, side: THREE.DoubleSide }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = .05;
  puddle.visible = false;
  g.add(tank, puddle, ...legs);
  g.position.set(x, terrainH(x, z), z);
  scene.add(g);
  const object = makeStrategicV057('water-tower', 145, g);
  object.tank = tank;
  object.puddle = puddle;
  registerStrategicV057(tank, object);
}

function addWatchTowerV057(x, z) {
  const g = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.2, .35, 4.2), matWall);
  platform.position.y = 8.2;
  const hut = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 3.4), matCanvas);
  hut.position.y = 9.5;
  g.add(platform, hut);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.25, 8, .25), matVDark);
    leg.position.set(sx * 1.6, 4, sz * 1.6);
    g.add(leg);
  }
  const fallen = new THREE.Mesh(new THREE.BoxGeometry(8.5, .45, 3.8), matWall);
  fallen.position.set(3.8, .28, 0);
  fallen.rotation.z = -.08;
  fallen.visible = false;
  g.add(fallen);
  g.position.set(x, terrainH(x, z), z);
  scene.add(g);
  const object = makeStrategicV057('watchtower', 180, g);
  object.fallen = fallen;
  object.fallenOb = { minX: x - .5, maxX: x + 8.2, minZ: z - 1.9, maxZ: z + 1.9, y0: g.position.y, h: g.position.y + .52 };
  registerStrategicV057(hut, object);
}

function addGasStationV057(x, z) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, .45, 6), matRoofRed);
  canopy.position.y = 4.5;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 5.5, 12), matBarrel);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 1.3, 2.6);
  g.add(canopy, tank);
  for (const px of [-2.3, 2.3]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.8, .75), matVDark);
    pump.position.set(px, .9, 0);
    g.add(pump);
  }
  g.position.set(x, terrainH(x, z), z);
  scene.add(g);
  const object = makeStrategicV057('gas-station', 110, g);
  object.tank = tank;
  registerStrategicV057(tank, object);
  registerStrategicV057(canopy, object);
}

function ensureWorldV057() {
  if (v057.worldReady) return;
  v057.worldReady = true;
  addForestPatchV057(-120, -205);
  addForestPatchV057(155, 205);
  addWaterTowerV057(-172, 112);
  addWatchTowerV057(72, -205);
  addGasStationV057(178, -92);
}

function igniteTreeV057(object) {
  if (!object || object.dead || object.kind !== 'tree' || object.fireT > 0) return;
  object.fireT = 16 + Math.random() * 8;
  v057.fires.push(object);
  v057.ignitions++;
  if (object.crown) object.crown.material = object.crown.material.clone();
}

function destroyStrategicV057(object) {
  if (!object || object.dead) return;
  object.dead = true;
  for (const mesh of object.hitMeshes) {
    const i = solidMeshes.indexOf(mesh);
    if (i >= 0) solidMeshes.splice(i, 1);
  }
  const p = object.group.position.clone();
  if (object.kind === 'tree') {
    object.group.rotation.z = (Math.random() < .5 ? -1 : 1) * 1.15;
    spawnParticles(p.clone().setY(p.y + 3), 0x4a321e, 12, 4, 1.1);
  } else if (object.kind === 'water-tower') {
    object.tank.visible = false;
    object.puddle.visible = true;
    for (const fire of v057.fires) {
      if (fire.group.position.distanceTo(object.group.position) < 25) fire.fireT = 0;
    }
    spawnParticles(p.clone().setY(p.y + 7), 0x7ac8ee, 55, 10, 1.8);
    addFeed('貯水塔破壊 — 周辺火災を鎮火', 'blue');
  } else if (object.kind === 'watchtower') {
    object.group.children.forEach(m => { if (m !== object.fallen) m.visible = false; });
    object.fallen.visible = true;
    if (!obstacles.includes(object.fallenOb)) obstacles.push(object.fallenOb);
    v057.collapsedTowers++;
    spawnParticles(p.clone().setY(p.y + 4), 0x77716a, 28, 8, 1.8);
    addFeed('監視塔倒壊 — 残骸が足場になった', 'blue');
  } else if (object.kind === 'gas-station') {
    object.group.visible = false;
    v057.chainExplosions++;
    addFeed('ガソリンスタンド誘爆!', 'red');
    explodeAt(p.clone().setY(p.y + 1.5), 13, 210);
  }
}

function damageStrategicV057(object, amount) {
  if (!object || object.dead) return;
  if (object.kind === 'tree' && amount >= 18) igniteTreeV057(object);
  object.hp -= amount;
  if (object.hp <= 0) destroyStrategicV057(object);
  else spawnParticles(object.group.position.clone().setY(object.group.position.y + 1), object.kind === 'water-tower' ? 0x86b7c8 : 0x6c5840, 3, 2, .7);
}

function damageStrategicWorld(pos, radius, dmg) {
  ensureWorldV057();
  for (const object of v057.objects) {
    if (object.dead) continue;
    const d = object.group.position.distanceTo(pos);
    if (d < radius + (object.kind === 'tree' ? 3 : 5)) {
      damageStrategicV057(object, dmg * Math.max(.2, 1 - d / (radius + 5)));
    }
  }
}

function updateFiresV057(dt) {
  for (let i = v057.fires.length - 1; i >= 0; i--) {
    const fire = v057.fires[i];
    if (fire.dead || fire.fireT <= 0) {
      fire.fireT = 0;
      v057.fires.splice(i, 1);
      continue;
    }
    fire.fireT -= dt;
    const p = fire.group.position.clone().setY(fire.group.position.y + 4.2);
    if (Math.random() < dt * 12) spawnParticles(p, Math.random() < .5 ? 0xff6a18 : 0x252525, 2, 2.8, 1.3);
    if (fire.crown) fire.crown.material.color.setHex(0x5a3b22);
    if (Math.random() < dt * .42) {
      let best = null;
      let bd = 12;
      for (const other of v057.objects) {
        if (other.kind !== 'tree' || other.dead || other.fireT > 0) continue;
        const d = other.group.position.distanceTo(fire.group.position);
        if (d < bd) { bd = d; best = other; }
      }
      if (best) igniteTreeV057(best);
    }
    if (fire.fireT <= 0) destroyStrategicV057(fire);
  }
}

function updateV057(dt) {
  ensureWorldV057();
  updateFiresV057(dt);
}

function resetV057() {
  ensureWorldV057();
  v057.fires.length = 0;
  v057.ignitions = 0;
  v057.collapsedTowers = 0;
  v057.chainExplosions = 0;
  for (const object of v057.objects) {
    object.hp = object.hp0;
    object.dead = false;
    object.fireT = 0;
    object.group.visible = true;
    object.group.rotation.set(0, 0, 0);
    object.group.children.forEach(m => { m.visible = m !== object.fallen && m !== object.puddle; });
    if (object.fallenOb) {
      const oi = obstacles.indexOf(object.fallenOb);
      if (oi >= 0) obstacles.splice(oi, 1);
    }
    if (object.crown) object.crown.material.color.setHex(0x4a6b35);
    for (const mesh of object.hitMeshes) if (!solidMeshes.includes(mesh)) solidMeshes.push(mesh);
  }
}
