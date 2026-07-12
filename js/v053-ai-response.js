'use strict';
/* v0.5.3 — AI車両奪取判断、車両戦闘、手榴弾回避反応 */

const v053 = {
  vehicleClaims: 0,
  vehicleBoards: 0,
  grenadeEvades: 0,
  grenadePrones: 0
};

function initAiSoldierV053(s) {
  s.aiVehicleThinkV053 = Math.random() * 2;
  s.aiVehicleTargetV053 = null;
  s.grenadeEvadeT053 = 0;
  s.grenadeEvadePosV053 = null;
  s.grenadeProneV053 = false;
  s.grenadeThreatV053 = null;
}

function vehicleDriverV053(v) {
  if (!v || !v.seats) return null;
  const seat = v.seats.find(st => st.role === 'driver');
  return seat && seat.occ && seat.occ !== 'player' ? seat.occ : null;
}

function vehicleTeamV053(v) {
  for (const seat of v.seats || []) {
    if (seat.occ === 'player') return 1;
    if (seat.occ && seat.occ.team) return seat.occ.team;
  }
  return 0;
}

function findCapturableVehicleV053(s) {
  if (!s || !s.alive || s.inVehicle || s.aiSniperV051 || s.grenadeEvadeT053 > 0) return null;
  let best = null;
  let bestScore = Infinity;
  for (const v of vehicles) {
    if (!v.alive || v === curVehicle || v.maxSpeed <= 0 || v.type === 'heli') continue;
    const driverIdx = v.seats.findIndex(st => st.role === 'driver');
    if (driverIdx < 0 || v.seats[driverIdx].occ) continue;
    const owner = vehicleTeamV053(v);
    if (owner && owner !== s.team) continue;
    const d = Math.hypot(v.obj.position.x - s.obj.position.x, v.obj.position.z - s.obj.position.z);
    if (d > 42) continue;
    const goal = s.targetFlag;
    const trip = goal ? Math.hypot(goal.x - s.obj.position.x, goal.z - s.obj.position.z) : 0;
    if (trip < 48 && d > 18) continue;
    const score = d - Math.min(18, trip * .08) - (s.squadSlot === 0 ? 5 : 0);
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return best;
}

function boardVehicleV053(s, v) {
  if (!s || !v || !s.alive || s.inVehicle || !v.alive) return false;
  let seatIdx = v.seats.findIndex(st => st.role === 'driver' && !st.occ);
  if (seatIdx < 0) seatIdx = freeSeatIdx(v, 'gunner');
  if (seatIdx < 0) return false;
  const owner = vehicleTeamV053(v);
  if (owner && owner !== s.team) return false;
  s.inVehicle = v;
  s.seatIdx = seatIdx;
  s.gunCd = .45;
  s.aiVehicleTargetV053 = null;
  v.seats[seatIdx].occ = s;
  v.aiTeamV053 = s.team;
  v053.vehicleBoards++;
  if (v.seats[seatIdx].role === 'driver') boardSquadIntoVehicleV053(s, v);
  return true;
}

function boardSquadIntoVehicleV053(driver, v) {
  const candidates = soldiers
    .filter(s => s !== driver && s.alive && !s.inVehicle && s.team === driver.team &&
      (!driver.squad || s.squad === driver.squad) &&
      Math.hypot(s.obj.position.x - v.obj.position.x, s.obj.position.z - v.obj.position.z) < 14)
    .sort((a, b) => a.obj.position.distanceTo(v.obj.position) - b.obj.position.distanceTo(v.obj.position));
  for (const s of candidates) {
    const seatIdx = freeSeatIdx(v, s.aiRoleV052 === 'support' ? 'gunner' : 'passenger');
    if (seatIdx < 0) break;
    s.inVehicle = v;
    s.seatIdx = seatIdx;
    s.gunCd = .4 + Math.random() * .3;
    s.aiVehicleTargetV053 = null;
    v.seats[seatIdx].occ = s;
    v053.vehicleBoards++;
  }
}

function updateAiVehicleClaimsV053(s, dt) {
  if (!s.alive || s.inVehicle) return;
  if (s.aiVehicleThinkV053 === undefined) initAiSoldierV053(s);
  s.aiVehicleThinkV053 -= dt;
  const target = s.aiVehicleTargetV053;
  if (target && (!target.alive || target === curVehicle || vehicleDriverV053(target))) {
    s.aiVehicleTargetV053 = null;
  }
  if (s.aiVehicleThinkV053 <= 0) {
    s.aiVehicleThinkV053 = 2.2 + Math.random() * 2;
    if (!s.aiVehicleTargetV053) {
      s.aiVehicleTargetV053 = findCapturableVehicleV053(s);
      if (s.aiVehicleTargetV053) v053.vehicleClaims++;
    }
  }
  if (s.aiVehicleTargetV053) {
    const v = s.aiVehicleTargetV053;
    const d = Math.hypot(v.obj.position.x - s.obj.position.x, v.obj.position.z - s.obj.position.z);
    if (d < v.radius + 1.7) boardVehicleV053(s, v);
    else if (d > 55) s.aiVehicleTargetV053 = null;
  }
}

function vehicleClaimDestinationV053(s) {
  const v = s && s.aiVehicleTargetV053;
  if (!v || !v.alive || vehicleDriverV053(v)) return null;
  return { x: v.obj.position.x, z: v.obj.position.z };
}

function nearestEnemyPositionV053(team, from, range) {
  let best = null;
  let bestDist = range;
  if (team === -1 && player.alive) {
    const d = Math.hypot(player.pos.x - from.x, player.pos.z - from.z);
    if (d < bestDist) { bestDist = d; best = player.pos; }
  }
  for (const s of soldiers) {
    if (!s.alive || s.team === team) continue;
    const d = Math.hypot(s.obj.position.x - from.x, s.obj.position.z - from.z);
    if (d < bestDist) { bestDist = d; best = s.obj.position; }
  }
  return best ? { pos: best, distance: bestDist } : null;
}

function aiVehicleGoalV053(v, driver) {
  const enemy = nearestEnemyPositionV053(driver.team, v.obj.position, 72);
  if (enemy) return { x: enemy.pos.x, z: enemy.pos.z, stop: v.type === 'tank' ? 24 : 15 };
  const flag = driver.targetFlag || pickFlagFor(driver);
  if (flag) {
    driver.targetFlag = flag;
    return { x: flag.x, z: flag.z, stop: FLAG_R * .55 };
  }
  return null;
}

function normalizeAngleV053(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateAiVehiclePoseV053(v, dt) {
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  if (v.type === 'boat') {
    v.bobT += dt * 2;
    v.obj.position.y = WATER_Y + .15 + Math.sin(v.bobT) * .06;
    v.obj.rotation.set(Math.sin(v.bobT * .8) * .02 - v.speed * .004, v.yaw, Math.sin(v.bobT * 1.1) * .02, 'YXZ');
  } else {
    const px = v.obj.position.x, pz = v.obj.position.z;
    v.obj.position.y = terrainH(px, pz);
    const hF = terrainH(px + fx * 2, pz + fz * 2);
    const hB = terrainH(px - fx * 2, pz - fz * 2);
    const sx = Math.cos(v.yaw), sz = -Math.sin(v.yaw);
    const hL = terrainH(px - sx * 1.5, pz - sz * 1.5);
    const hR = terrainH(px + sx * 1.5, pz + sz * 1.5);
    const damageRoll = typeof vehicleDamageRollV048 === 'function' ? vehicleDamageRollV048(v) : 0;
    v.obj.rotation.order = 'YXZ';
    v.obj.rotation.y = v.yaw;
    v.obj.rotation.x = THREE.MathUtils.lerp(v.obj.rotation.x, Math.atan2(hB - hF, 4) * .7, Math.min(1, dt * 5));
    v.obj.rotation.z = THREE.MathUtils.lerp(v.obj.rotation.z, Math.atan2(hL - hR, 3) * .7 + damageRoll, Math.min(1, dt * 5));
  }
  for (const wheel of v.wheels || []) wheel.rotation.x += v.speed * dt * 2.2;
  if (typeof updateVehiclePartsV048 === 'function') updateVehiclePartsV048(v, dt);
}

function updateAiVehicleDriversV053(dt) {
  for (const v of vehicles) {
    if (!v.alive || v === curVehicle || v.type === 'heli' || v.maxSpeed <= 0) continue;
    const driver = vehicleDriverV053(v);
    if (!driver || !driver.alive) continue;
    const goal = aiVehicleGoalV053(v, driver);
    const trackBlockedV054 = typeof tankTranslationBlockedV054 === 'function' && tankTranslationBlockedV054(v);
    const boatBrokenV054 = v.type === 'boat' && typeof boatCanPropelV054 === 'function' && !boatCanPropelV054(v);
    const fuelDryV055 = typeof vehicleHasFuelV055 === 'function' && !vehicleHasFuelV055(v);
    if (!goal || fuelDryV055 || (v.mobility <= 0 && !trackBlockedV054 && !boatBrokenV054)) {
      v.speed *= Math.pow(.25, dt);
      updateAiVehiclePoseV053(v, dt);
      continue;
    }
    if (boatBrokenV054) {
      updateAiVehiclePoseV053(v, dt);
      continue;
    }
    const dx = goal.x - v.obj.position.x;
    const dz = goal.z - v.obj.position.z;
    const dist = Math.hypot(dx, dz) || .001;
    const desiredYaw = Math.atan2(-dx, -dz);
    const delta = normalizeAngleV053(desiredYaw - v.yaw);
    if (trackBlockedV054) {
      v.speed = 0;
      v.yaw += THREE.MathUtils.clamp(delta, -v.turnRate * dt, v.turnRate * dt);
      updateAiVehiclePoseV053(v, dt);
      continue;
    }
    const turn = THREE.MathUtils.clamp(delta, -v.turnRate * dt, v.turnRate * dt);
    v.yaw += turn;
    const aligned = Math.max(0, 1 - Math.abs(delta) / Math.PI);
    const desiredSpeed = dist > goal.stop ? v.maxSpeed * v.mobility * (.35 + aligned * .5) : 0;
    v.speed += THREE.MathUtils.clamp(desiredSpeed - v.speed, -v.accel * dt, v.accel * dt);
    if (v.aiBlockedT053 > 0) {
      v.aiBlockedT053 -= dt;
      v.yaw += (v.aiTurnDir053 || 1) * v.turnRate * dt * 1.4;
      v.speed = -Math.min(v.maxSpeed * .25, 3.5);
    }
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const nx = v.obj.position.x + fx * v.speed * dt;
    const nz = v.obj.position.z + fz * v.speed * dt;
    const terrainY = terrainH(nx, nz) + 1;
    const waterBlocked = v.type === 'boat' ? !isWater(nx, nz) : isDeepWater(nx, nz);
    if (!waterBlocked && !collidesAt(nx, nz, v.radius, terrainY, v)) {
      v.obj.position.x = nx;
      v.obj.position.z = nz;
    } else if (Math.abs(v.speed) > .5) {
      v.aiBlockedT053 = .8 + Math.random() * .8;
      v.aiTurnDir053 = Math.random() < .5 ? -1 : 1;
      v.speed *= -.25;
    }
    updateAiVehiclePoseV053(v, dt);
  }
}

function grenadeThreatForV053(s) {
  let best = null;
  let bestScore = Infinity;
  const inspect = (g, enemy) => {
    if (!g.active || !enemy || g.fuse <= .08 || g.fuse > 2.05) return;
    const p = g.m.position;
    const d = Math.hypot(p.x - s.obj.position.x, p.z - s.obj.position.z);
    if (d > 8.5 || p.y > s.obj.position.y + 3.2) return;
    const score = d + g.fuse * 1.5;
    if (score < bestScore) { bestScore = score; best = g; }
  };
  for (const g of nadePool) inspect(g, s.team === -1);
  for (const g of aiNadePool) inspect(g, g.team !== s.team);
  return best;
}

function chooseGrenadeEscapeV053(s, grenade) {
  const sp = s.obj.position;
  const gp = grenade.m.position;
  let away = new THREE.Vector2(sp.x - gp.x, sp.z - gp.z);
  if (away.lengthSq() < .05) away.set(Math.random() - .5, Math.random() - .5);
  away.normalize();
  const angles = [0, .55, -.55, 1.05, -1.05, Math.PI];
  for (const angle of angles) {
    const dir = away.clone().rotateAround(new THREE.Vector2(0, 0), angle);
    const x = sp.x + dir.x * 9;
    const z = sp.z + dir.y * 9;
    if (!collidesAt(x, z, .35, terrainH(x, z) + .2) && !isDeepWater(x, z)) return { x, z };
  }
  return null;
}

function updateGrenadeReactionV053(s, dt) {
  if (!s.alive || s.inVehicle) return;
  if (s.grenadeEvadeT053 === undefined) initAiSoldierV053(s);
  s.grenadeEvadeT053 = Math.max(0, s.grenadeEvadeT053 - dt);
  if (s.grenadeEvadeT053 <= 0) {
    s.grenadeEvadePosV053 = null;
    s.grenadeProneV053 = false;
    s.grenadeThreatV053 = null;
  }
  const threat = grenadeThreatForV053(s);
  if (!threat || threat === s.grenadeThreatV053) return;
  s.grenadeThreatV053 = threat;
  s.grenadeEvadeT053 = Math.max(.7, threat.fuse);
  s.grenadeEvadePosV053 = chooseGrenadeEscapeV053(s, threat);
  s.grenadeProneV053 = !s.grenadeEvadePosV053;
  s.aiVehicleTargetV053 = null;
  if (s.grenadeProneV053) v053.grenadePrones++;
  else v053.grenadeEvades++;
}

function grenadeEvadeDestinationV053(s) {
  if (!s || s.grenadeEvadeT053 <= 0) return null;
  if (s.grenadeProneV053) return { x: s.obj.position.x, z: s.obj.position.z, prone: true };
  return s.grenadeEvadePosV053 ? { x: s.grenadeEvadePosV053.x, z: s.grenadeEvadePosV053.z, prone: false } : null;
}

function updateGrenadeProneVisualsV053() {
  for (const s of soldiers) {
    if (!s.alive) continue;
    if (s.grenadeProneV053) {
      s.obj.scale.y += (.48 - s.obj.scale.y) * .2;
      s.marker.position.y = 3.8;
    } else if (!s.sniperHoldingV051) {
      s.obj.scale.y += (1 - s.obj.scale.y) * .12;
      s.marker.position.y = 2.35;
    }
  }
}

function updateV053(dt) {
  updateAiVehicleDriversV053(dt);
  updateGrenadeProneVisualsV053();
}

function resetV053() {
  v053.vehicleClaims = 0;
  v053.vehicleBoards = 0;
  v053.grenadeEvades = 0;
  v053.grenadePrones = 0;
  for (const v of vehicles) {
    v.aiTeamV053 = 0;
    v.aiBlockedT053 = 0;
    v.aiTurnDir053 = 1;
  }
  for (const s of soldiers) initAiSoldierV053(s);
}
