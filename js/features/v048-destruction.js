'use strict';
/* v0.4.8 — 車両の窓/タイヤ部位破壊、爆破で開口できる壁 */

const v048 = {
  breached: 0,
  shatteredGlass: 0,
  blownTires: 0
};

const matCrackedGlassV048 = new THREE.LineBasicMaterial({
  color: 0xd8eff8,
  transparent: true,
  opacity: 0.9,
  depthWrite: false
});

function makeGlassCracksV048(glass) {
  if (!glass) return null;
  const points = [];
  const arms = [
    [-0.78, 0.34], [-0.45, 0.12], [0, 0], [0.55, 0.28], [0.84, 0.1],
    [0, 0], [-0.2, -0.42], [0.16, -0.76],
    [0, 0], [0.3, -0.25], [0.72, -0.42],
    [-0.45, 0.12], [-0.62, -0.22], [-0.2, -0.42],
    [0.3, -0.25], [0.55, 0.28]
  ];
  const params = glass.geometry && glass.geometry.parameters;
  const halfW = ((params && params.width) || 1.8) * 0.48;
  const halfH = ((params && params.height) || 0.6) * 0.48;
  const frontZ = -(((params && params.depth) || 0.08) / 2 + 0.01);
  for (let i = 0; i < arms.length - 1; i++) {
    points.push(new THREE.Vector3(arms[i][0] * halfW, arms[i][1] * halfH, frontZ));
    points.push(new THREE.Vector3(arms[i + 1][0] * halfW, arms[i + 1][1] * halfH, frontZ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const cracks = new THREE.LineSegments(geo, matCrackedGlassV048);
  cracks.visible = false;
  glass.add(cracks);
  return cracks;
}

function initVehiclePartsV048(v) {
  v.tireParts = [];
  v.damageRoll = 0;
  if (v.glass) {
    v.glass.material = v.glass.material.clone();
    v.glassHp0 = v.type === 'heli' ? 70 : 45;
    v.glassHp = v.glassHp0;
    v.glassBroken = false;
    v.glassCracks = makeGlassCracksV048(v.glass);
    v.glass.userData.vehiclePart = { vehicle: v, kind: 'glass' };
    if (!solidMeshes.includes(v.glass)) solidMeshes.push(v.glass);
  }
  for (let i = 0; i < v.wheels.length; i++) {
    const mesh = v.wheels[i];
    const side = mesh.position.x < -0.1 ? -1 : mesh.position.x > 0.1 ? 1 : (i % 2 ? 1 : -1);
    const tire = {
      vehicle: v,
      mesh,
      index: i,
      side,
      hp0: v.type === 'bike' ? 24 : 36,
      hp: v.type === 'bike' ? 24 : 36,
      broken: false,
      baseY: mesh.position.y,
      baseScale: mesh.scale.clone()
    };
    mesh.userData.vehiclePart = { vehicle: v, kind: 'tire', tire };
    if (!solidMeshes.includes(mesh)) solidMeshes.push(mesh);
    v.tireParts.push(tire);
  }
}

function unregisterVehiclePartsV048(v) {
  const parts = [];
  if (v.glass) parts.push(v.glass);
  for (const tire of v.tireParts || []) parts.push(tire.mesh);
  for (const mesh of parts) {
    const i = solidMeshes.indexOf(mesh);
    if (i >= 0) solidMeshes.splice(i, 1);
  }
}

function crackVehicleGlassV048(v, amount) {
  if (!v.glass || v.glassBroken) return;
  v.glassHp -= amount;
  if (v.glassHp < v.glassHp0 * 0.72 && v.glassCracks) v.glassCracks.visible = true;
  v.glass.material.color.setHex(v.glassHp < v.glassHp0 * 0.35 ? 0xb6d4df : 0x86a9b9);
  if (v.glassHp > 0) return;
  v.glassBroken = true;
  v048.shatteredGlass++;
  v.glass.material.transparent = true;
  v.glass.material.opacity = 0.12;
  v.glass.material.color.setHex(0x3c515b);
  if (v.glassCracks) v.glassCracks.visible = false;
  const p = new THREE.Vector3();
  v.glass.getWorldPosition(p);
  spawnParticles(p, 0xcfe4f0, 18, 4, 1.1);
  sfx.glass();
  if (curVehicle === v) addFeed('フロントガラス破損! 視界に注意', 'red');
}

function breakTireV048(tire) {
  if (!tire || tire.broken) return;
  tire.broken = true;
  v048.blownTires++;
  tire.mesh.scale.copy(tire.baseScale);
  tire.mesh.scale.x *= 0.5;
  tire.mesh.scale.z *= 0.62;
  tire.mesh.position.y = tire.baseY - 0.16;
  const p = new THREE.Vector3();
  tire.mesh.getWorldPosition(p);
  spawnParticles(p, 0x272727, 11, 3.5, 1.1);
  playBeep(75, 0.18, 0.12, 'sawtooth');
  updateVehicleMobilityV048(tire.vehicle);
  if (curVehicle === tire.vehicle) addFeed('タイヤ破損! 片輪走行 — 操縦性低下', 'red');
}

function damageTireV048(tire, amount) {
  if (!tire || tire.broken) return;
  tire.hp -= amount;
  if (tire.hp <= 0) breakTireV048(tire);
  else {
    const p = new THREE.Vector3();
    tire.mesh.getWorldPosition(p);
    spawnParticles(p, 0x333333, 3, 2, 0.6);
  }
}

function nearestTireV048(v, hitPos) {
  if (!v.tireParts || !v.tireParts.length) return null;
  if (!hitPos) return v.tireParts[Math.floor(Math.random() * v.tireParts.length)];
  let best = null, bestD = Infinity;
  const p = new THREE.Vector3();
  for (const tire of v.tireParts) {
    tire.mesh.getWorldPosition(p);
    const d = p.distanceToSquared(hitPos);
    if (d < bestD) { bestD = d; best = tire; }
  }
  return best;
}

function damageVehiclePartDirectV048(part, amount, point) {
  if (!part || !part.vehicle || !part.vehicle.alive) return;
  if (part.kind === 'glass') crackVehicleGlassV048(part.vehicle, amount * 1.35);
  else if (part.kind === 'tire') damageTireV048(part.tire, amount * 1.7);
  damageVehicle(part.vehicle, amount * 0.28, 'part-hit', point || null);
}

function damageVehiclePartsV048(v, dmg, cause, hitPos) {
  if (!v || cause === 'part-hit') return;
  if (cause === 'smallarms') {
    if (v.glass && !v.glassBroken && Math.random() < 0.48) crackVehicleGlassV048(v, dmg * 0.85);
    else if (v.tireParts.length && Math.random() < 0.55) damageTireV048(nearestTireV048(v, hitPos), dmg);
    return;
  }
  if (cause === 'explosion') {
    if (v.glass && !v.glassBroken) crackVehicleGlassV048(v, dmg * 0.75);
    const tire = nearestTireV048(v, hitPos);
    if (tire) damageTireV048(tire, dmg * 0.8);
  }
}

function updateVehicleMobilityV048(v) {
  const broken = (v.tireParts || []).filter(t => t.broken);
  if (!broken.length) {
    v.mobility = 1;
    v.damageRoll = 0;
    if (!v.burning) v.partHint = v.glassBroken ? 'フロントガラス破損' : '';
    return;
  }
  if (v.type === 'bike') v.mobility = broken.length >= 2 ? 0.12 : 0.42;
  else v.mobility = broken.length >= 3 ? 0.18 : broken.length === 2 ? 0.38 : 0.62;
  const sideSum = broken.reduce((sum, tire) => sum + tire.side, 0);
  v.damageRoll = THREE.MathUtils.clamp(sideSum * 0.075, -0.16, 0.16);
  v.partHint = `タイヤ${broken.length}本破損 / 片輪走行`;
}

function vehicleDamageRollV048(v) {
  return v && v.damageRoll ? v.damageRoll : 0;
}

function updateVehiclePartsV048(v) {
  if (!v || !v.tireParts) return;
  for (const tire of v.tireParts) {
    if (tire.broken) tire.mesh.rotation.x += (Math.random() - 0.5) * 0.025;
  }
}

function repairVehiclePartsV048(v, dt) {
  if (!v) return;
  if (v.glass && v.glassHp < v.glassHp0) {
    v.glassHp = Math.min(v.glassHp0, v.glassHp + 16 * dt);
    if (v.glassHp >= v.glassHp0) {
      v.glassBroken = false;
      v.glass.material.transparent = false;
      v.glass.material.opacity = 1;
      v.glass.material.color.setHex(0x7fa8c0);
      if (v.glassCracks) v.glassCracks.visible = false;
    }
  }
  for (const tire of v.tireParts || []) {
    if (tire.hp >= tire.hp0) continue;
    tire.hp = Math.min(tire.hp0, tire.hp + 14 * dt);
    if (tire.hp >= tire.hp0 && tire.broken) {
      tire.broken = false;
      tire.mesh.scale.copy(tire.baseScale);
      tire.mesh.position.y = tire.baseY;
    }
  }
  updateVehicleMobilityV048(v);
}

function aabbDistanceToPointV048(ob, p) {
  const x = Math.max(ob.minX, Math.min(ob.maxX, p.x));
  const y = Math.max(ob.y0, Math.min(ob.h, p.y));
  const z = Math.max(ob.minZ, Math.min(ob.maxZ, p.z));
  return Math.hypot(p.x - x, p.y - y, p.z - z);
}

function damageDestructibleWallsV048(pos, radius, dmg) {
  if (!destructibleWalls || radius < 4.5 || dmg < 70) return;
  for (const wall of destructibleWalls) {
    if (wall.breached) continue;
    const dist = aabbDistanceToPointV048(wall.ob, pos);
    if (dist > radius + 1.2) continue;
    const falloff = Math.max(0.3, 1 - dist / (radius + 1.2));
    wall.hp -= dmg * falloff;
    spawnParticles(wall.m.position.clone(), 0x8b8175, 7, 4, 1.4);
    if (wall.hp <= 0) {
      v048.breached++;
      breachWallV048(wall);
    }
  }
}

function resetV048() {
  v048.breached = 0;
  v048.shatteredGlass = 0;
  v048.blownTires = 0;
  resetDestructibleWallsV048();
}
