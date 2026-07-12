'use strict';
/* v0.5.8 — 破壊可能フェンス、防御施設、多人数占領バフ */

const v058 = {
  structures: [],
  worldReady: false,
  breachedFences: 0,
  destroyedDefenses: 0,
  captureBoostPeak: 1
};

function registerStructureV058(kind, mesh, hp, flagId = null, obstacle = true) {
  const p = mesh.position;
  const params = mesh.geometry.parameters || {};
  const w = params.width || 2;
  const d = params.depth || .5;
  const h = params.height || 1.2;
  const ob = obstacle ? {
    minX: p.x - w / 2, maxX: p.x + w / 2,
    minZ: p.z - d / 2, maxZ: p.z + d / 2,
    y0: p.y - h / 2, h: p.y + h / 2
  } : null;
  const structure = { kind, mesh, hp, hp0: hp, flagId, ob, dead: false };
  mesh.userData.defensiveV058 = structure;
  solidMeshes.push(mesh);
  if (ob) obstacles.push(ob);
  v058.structures.push(structure);
  return structure;
}

function createFenceV058(x, z, rotY = 0) {
  const geo = new THREE.BoxGeometry(7.5, 1.55, .16);
  const mat = new THREE.MeshLambertMaterial({ color: 0x758078, wireframe: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, terrainH(x, z) + .78, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = !isMobile;
  scene.add(mesh);
  const structure = registerStructureV058('fence', mesh, 48);
  if (Math.abs(Math.sin(rotY)) > .7 && structure.ob) {
    const ob = structure.ob;
    const halfX = (ob.maxX - ob.minX) / 2;
    const halfZ = (ob.maxZ - ob.minZ) / 2;
    const cx = (ob.maxX + ob.minX) / 2;
    const cz = (ob.maxZ + ob.minZ) / 2;
    ob.minX = cx - halfZ; ob.maxX = cx + halfZ;
    ob.minZ = cz - halfX; ob.maxZ = cz + halfX;
  }
}

function createSandbagsV058(x, z, rotY, flagId) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.15, 1.0), matSandbag);
  mesh.position.set(x, terrainH(x, z) + .58, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = !isMobile;
  scene.add(mesh);
  registerStructureV058('sandbag', mesh, 145, flagId);
}

function createBarricadeV058(x, z, rotY, flagId) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.45, .7), matRust);
  mesh.position.set(x, terrainH(x, z) + .72, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = !isMobile;
  scene.add(mesh);
  registerStructureV058('barricade', mesh, 105, flagId);
}

function ensureWorldV058() {
  if (v058.worldReady) return;
  v058.worldReady = true;
  createFenceV058(-224, 145, 0);
  createFenceV058(-198, 128, Math.PI / 2);
  createFenceV058(15, -18, 0);
  createFenceV058(198, -154, Math.PI / 2);
  createFenceV058(242, 232, 0);
  for (const f of flags) {
    const a = f.id.charCodeAt(0) % 2 ? 0 : Math.PI / 2;
    createSandbagsV058(f.x - 7, f.z + 5, a, f.id);
    createBarricadeV058(f.x + 7, f.z - 5, a, f.id);
  }
}

function removeStructureCollisionV058(structure) {
  const si = solidMeshes.indexOf(structure.mesh);
  if (si >= 0) solidMeshes.splice(si, 1);
  if (structure.ob) {
    const oi = obstacles.indexOf(structure.ob);
    if (oi >= 0) obstacles.splice(oi, 1);
  }
}

function damageDefensiveV058(structure, amount, vehicleHit = false) {
  if (!structure || structure.dead) return;
  structure.hp -= amount;
  if (structure.hp > 0) {
    spawnParticles(structure.mesh.position, structure.kind === 'sandbag' ? 0xa79870 : 0x8a7258, 3, 2.5, .7);
    return;
  }
  structure.dead = true;
  structure.mesh.visible = false;
  removeStructureCollisionV058(structure);
  if (structure.kind === 'fence') {
    v058.breachedFences++;
    if (vehicleHit) addFeed('車両でフェンスを突破', 'blue');
  } else {
    v058.destroyedDefenses++;
  }
  spawnParticles(structure.mesh.position, structure.kind === 'sandbag' ? 0xb0a27e : 0x68594a, 16, 5, 1.1);
}

function damageDefensiveWorldV058(pos, radius, dmg) {
  ensureWorldV058();
  for (const structure of v058.structures) {
    if (structure.dead) continue;
    const d = structure.mesh.position.distanceTo(pos);
    if (d < radius + 3) damageDefensiveV058(structure, dmg * Math.max(.2, 1 - d / (radius + 3)));
  }
}

function updateVehicleFenceBreakV058() {
  for (const v of vehicles) {
    if (!v.alive || Math.abs(v.speed || 0) < 4) continue;
    for (const structure of v058.structures) {
      if (structure.dead || structure.kind !== 'fence') continue;
      const d = Math.hypot(v.obj.position.x - structure.mesh.position.x, v.obj.position.z - structure.mesh.position.z);
      if (d < v.radius + 4) {
        damageDefensiveV058(structure, Math.abs(v.speed) * (v.type === 'tank' || v.type === 'apc' ? 12 : 7), true);
        v.speed *= .82;
      }
    }
  }
}

function activeDefenseCountV058(flagId) {
  let count = 0;
  for (const structure of v058.structures) {
    if (!structure.dead && structure.flagId === flagId) count++;
  }
  return count;
}

function captureRateV058(flag, blue, red, attackingTeam) {
  const count = attackingTeam === 1 ? blue : red;
  const opposition = attackingTeam === 1 ? red : blue;
  const net = Math.max(0, count - opposition);
  if (!net) return 0;
  const squadBoost = Math.min(2.5, 1 + Math.max(0, count - 1) * .28);
  const defended = flag.own === -attackingTeam && activeDefenseCountV058(flag.id) > 0;
  const defensePenalty = defended ? .75 : 1;
  v058.captureBoostPeak = Math.max(v058.captureBoostPeak, squadBoost);
  return Math.min(net, 5) * squadBoost * defensePenalty;
}

function updateV058() {
  ensureWorldV058();
  updateVehicleFenceBreakV058();
}

function resetV058() {
  ensureWorldV058();
  v058.breachedFences = 0;
  v058.destroyedDefenses = 0;
  v058.captureBoostPeak = 1;
  for (const structure of v058.structures) {
    structure.hp = structure.hp0;
    structure.dead = false;
    structure.mesh.visible = true;
    if (!solidMeshes.includes(structure.mesh)) solidMeshes.push(structure.mesh);
    if (structure.ob && !obstacles.includes(structure.ob)) obstacles.push(structure.ob);
  }
}
