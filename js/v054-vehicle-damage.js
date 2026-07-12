'use strict';
/* v0.5.4 — 車両損傷段階、履帯/ローター/ボートエンジン破壊 */

const v054 = {
  smokingVehicles: 0,
  trackBreaks: 0,
  rotorBreaks: 0,
  boatEngineBreaks: 0
};

function vehicleSystemMeshesV054(v) {
  const meshes = [];
  for (const mesh of v.trackMeshesV054 || []) meshes.push({ mesh, kind: 'track' });
  for (const mesh of v.rotorBladesV054 || []) meshes.push({ mesh, kind: 'rotor' });
  if (v.boatEngineMeshV054) meshes.push({ mesh: v.boatEngineMeshV054, kind: 'boat-engine' });
  return meshes;
}

function initVehicleDamageV054(v) {
  if (!v) return;
  v.engineHp0V054 = Math.max(70, v.maxHp * .42);
  v.engineHpV054 = v.engineHp0V054;
  v.damageStageV054 = 0;
  v.damageFxT054 = Math.random() * .15;
  v.trackHp0V054 = v.type === 'tank' ? 165 : 0;
  v.trackHpV054 = v.type === 'tank' ? [v.trackHp0V054, v.trackHp0V054] : [];
  v.trackBrokenV054 = false;
  v.rotorHp0V054 = v.type === 'heli' ? 135 : 0;
  v.rotorHpV054 = v.rotorHp0V054;
  v.rotorCriticalV054 = false;
  v.boatEngineHp0V054 = v.type === 'boat' ? 95 : 0;
  v.boatEngineHpV054 = v.boatEngineHp0V054;
  v.boatEngineBrokenV054 = false;
  v.driftYawV054 = v.yaw;
  for (const part of vehicleSystemMeshesV054(v)) {
    part.mesh.userData.vehicleSystemV054 = { vehicle: v, kind: part.kind, mesh: part.mesh };
    if (!solidMeshes.includes(part.mesh)) solidMeshes.push(part.mesh);
  }
}

function unregisterVehicleDamageV054(v) {
  for (const part of vehicleSystemMeshesV054(v)) {
    const i = solidMeshes.indexOf(part.mesh);
    if (i >= 0) solidMeshes.splice(i, 1);
    delete part.mesh.userData.vehicleSystemV054;
  }
}

function localHitV054(v, hitPos) {
  if (!hitPos) return null;
  v.obj.updateMatrixWorld(true);
  return v.obj.worldToLocal(hitPos.clone());
}

function breakTrackV054(v) {
  if (v.trackBrokenV054) return;
  v.trackBrokenV054 = true;
  v.mobility = 0;
  v.speed = 0;
  v.partHint = '履帯破損 / 旋回のみ';
  v054.trackBreaks++;
  if (curVehicle === v) addFeed('履帯破損! 前後移動不能 — その場旋回のみ可能', 'red');
}

function breakRotorV054(v) {
  if (v.rotorCriticalV054) return;
  v.rotorCriticalV054 = true;
  v.mobility = 0;
  v.partHint = 'ローター重大損傷';
  v054.rotorBreaks++;
  if (curVehicle === v) addFeed('ローター重大損傷! オートローテーション不能', 'red');
}

function breakBoatEngineV054(v) {
  if (v.boatEngineBrokenV054) return;
  v.boatEngineBrokenV054 = true;
  v.mobility = 0;
  v.driftYawV054 = v.yaw;
  v.partHint = 'エンジン停止 / 漂流中';
  v054.boatEngineBreaks++;
  if (curVehicle === v) addFeed('ボートエンジン破損! 推進力喪失 — 慣性で漂流', 'red');
}

function damageTrackV054(v, side, amount) {
  if (v.type !== 'tank' || !v.trackHpV054.length) return;
  const index = side < 0 ? 0 : 1;
  v.trackHpV054[index] = Math.max(0, v.trackHpV054[index] - amount);
  if (v.trackHpV054[index] <= 0) breakTrackV054(v);
}

function damageRotorV054(v, amount) {
  if (v.type !== 'heli') return;
  v.rotorHpV054 = Math.max(0, v.rotorHpV054 - amount);
  if (v.rotorHpV054 <= v.rotorHp0V054 * .18) breakRotorV054(v);
  else if (v.rotorHpV054 < v.rotorHp0V054 * .55) v.partHint = 'ローター損傷';
}

function damageBoatEngineV054(v, amount) {
  if (v.type !== 'boat') return;
  v.boatEngineHpV054 = Math.max(0, v.boatEngineHpV054 - amount);
  if (v.boatEngineHpV054 <= 0) breakBoatEngineV054(v);
  else if (v.boatEngineHpV054 < v.boatEngineHp0V054 * .5) v.partHint = 'ボートエンジン損傷';
}

function damageVehicleSystemsV054(v, dmg, cause = '', hitPos = null) {
  if (!v || !v.alive || dmg <= 0) return;
  const local = localHitV054(v, hitPos);
  const explosive = cause === 'explosion' || cause === 'rpg-penetration';
  const direct = cause === 'system-hit';
  const engineBias = local ? local.z > (v.type === 'heli' ? .5 : 1) : Math.random() < .35;
  v.engineHpV054 = Math.max(0, v.engineHpV054 - dmg * (engineBias ? .62 : .2));

  if (v.type === 'tank' && (direct || explosive || (local && Math.abs(local.x) > 1.05))) {
    const side = local ? Math.sign(local.x) || 1 : (Math.random() < .5 ? -1 : 1);
    damageTrackV054(v, side, dmg * (direct ? 1.8 : explosive ? .9 : .55));
  }
  if (v.type === 'heli' && (direct || explosive || (local && local.y > 2))) {
    damageRotorV054(v, dmg * (direct ? 1.75 : explosive ? .78 : .48));
  }
  if (v.type === 'boat' && (direct || explosive || (local && local.z > 1.25))) {
    damageBoatEngineV054(v, dmg * (direct ? 1.8 : explosive ? .9 : .58));
  }
}

function damageVehicleSystemDirectV054(part, amount, point) {
  if (!part || !part.vehicle || !part.vehicle.alive) return;
  const v = part.vehicle;
  if (part.kind === 'track') {
    const local = localHitV054(v, point);
    damageTrackV054(v, local ? Math.sign(local.x) || 1 : 1, amount * 1.8);
  } else if (part.kind === 'rotor') {
    damageRotorV054(v, amount * 1.8);
  } else if (part.kind === 'boat-engine') {
    damageBoatEngineV054(v, amount * 1.9);
  }
  damageVehicle(v, amount * .24, 'system-hit', point || null);
}

function vehicleSmokeStageV054(v) {
  if (!v || !v.alive) return 0;
  const hullRatio = THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1);
  const engineRatio = THREE.MathUtils.clamp(v.engineHpV054 / v.engineHp0V054, 0, 1);
  const ratio = Math.min(hullRatio, engineRatio);
  if (ratio <= .22) return 3;
  if (ratio <= .45) return 2;
  if (ratio <= .72) return 1;
  return 0;
}

function engineWorldPositionV054(v) {
  const local = v.type === 'tank'
    ? new THREE.Vector3(0, 2, 1.65)
    : v.type === 'heli'
      ? new THREE.Vector3(0, 2.45, 1.15)
      : v.type === 'boat'
        ? new THREE.Vector3(0, .9, 2.45)
        : new THREE.Vector3(0, 1.25, 1.25);
  return local.applyMatrix4(v.obj.matrixWorld);
}

function updateVehicleDamageV054(v, dt) {
  if (!v || !v.alive) return;
  const stage = vehicleSmokeStageV054(v);
  if (stage > 0 && v.damageStageV054 === 0) v054.smokingVehicles++;
  v.damageStageV054 = stage;
  v.burning = stage >= 3;
  if (v.burning) {
    v.hp -= 4 * dt;
    if (v.hp <= 0) {
      destroyVehicle(v);
      return;
    }
  }
  if (stage <= 0) return;
  v.damageFxT054 -= dt;
  if (v.damageFxT054 > 0) return;
  v.damageFxT054 = stage === 1 ? .32 : stage === 2 ? .18 : .1;
  const p = engineWorldPositionV054(v);
  const color = stage === 1 ? 0x888888 : stage === 2 ? 0x252525 : 0x151515;
  spawnParticles(p, color, stage, 1.1 + stage * .35, 1.2 + stage * .35);
  if (stage === 3 && Math.random() < .65) spawnParticles(p, 0xff6a18, 1, 2.2, .9);
}

function tankTranslationBlockedV054(v) {
  return !!(v && v.type === 'tank' && v.trackBrokenV054);
}

function heliAutorotationAvailableV054(v) {
  return !(v && v.type === 'heli' && v.rotorCriticalV054);
}

function boatCanPropelV054(v) {
  return !(v && v.type === 'boat' && v.boatEngineBrokenV054);
}

function updateBoatDriftV054(v, dt) {
  if (!v || v.type !== 'boat' || !v.boatEngineBrokenV054 || !v.alive) return;
  v.speed *= Math.pow(.965, dt);
  if (Math.abs(v.speed) < .03) v.speed = 0;
  const fx = -Math.sin(v.yaw);
  const fz = -Math.cos(v.yaw);
  const nx = v.obj.position.x + fx * v.speed * dt;
  const nz = v.obj.position.z + fz * v.speed * dt;
  if (isWater(nx, nz) && !collidesAt(nx, nz, v.radius, WATER_Y + 1, v)) {
    v.obj.position.x = nx;
    v.obj.position.z = nz;
  } else {
    v.speed *= -.15;
  }
}

function repairVehicleDamageV054(v, dt) {
  if (!v) return;
  v.engineHpV054 = Math.min(v.engineHp0V054, v.engineHpV054 + 12 * dt);
  if (v.type === 'tank') {
    for (let i = 0; i < v.trackHpV054.length; i++) {
      v.trackHpV054[i] = Math.min(v.trackHp0V054, v.trackHpV054[i] + 18 * dt);
    }
    if (v.trackBrokenV054 && v.trackHpV054.every(hp => hp > v.trackHp0V054 * .45)) {
      v.trackBrokenV054 = false;
      v.mobility = 1;
      v.partHint = '';
      addFeed('履帯を修復した', 'blue');
    }
  } else if (v.type === 'heli') {
    v.rotorHpV054 = Math.min(v.rotorHp0V054, v.rotorHpV054 + 15 * dt);
    if (v.rotorCriticalV054 && v.rotorHpV054 > v.rotorHp0V054 * .5) {
      v.rotorCriticalV054 = false;
      v.mobility = 1;
      v.partHint = '';
      addFeed('ローターを修復した', 'blue');
    }
  } else if (v.type === 'boat') {
    v.boatEngineHpV054 = Math.min(v.boatEngineHp0V054, v.boatEngineHpV054 + 16 * dt);
    if (v.boatEngineBrokenV054 && v.boatEngineHpV054 > v.boatEngineHp0V054 * .5) {
      v.boatEngineBrokenV054 = false;
      v.mobility = 1;
      v.partHint = '';
      addFeed('ボートエンジンを修復した', 'blue');
    }
  }
}

function resetV054() {
  v054.smokingVehicles = 0;
  v054.trackBreaks = 0;
  v054.rotorBreaks = 0;
  v054.boatEngineBreaks = 0;
  for (const v of vehicles) {
    if (v.engineHpV054 === undefined) initVehicleDamageV054(v);
  }
}
