'use strict';
/* v0.5.2 — AIフランキング、分隊役割、弾薬判断 */

const v052 = {
  flankOrders: 0,
  reloads: 0,
  meleeSwitches: 0
};

function initAiSoldierV052(s) {
  const slot = s.squadSlot || 0;
  s.aiRoleV052 = slot === 1 ? 'recon' : slot === 2 ? 'support' : slot === 3 ? 'marksman' : 'assault';
  s.aiMagV052 = s.aiRoleV052 === 'support' ? 60 : s.aiRoleV052 === 'marksman' ? 8 : 30;
  s.aiMagMaxV052 = s.aiMagV052;
  s.aiReserveV052 = s.aiRoleV052 === 'support' ? 180 : s.aiRoleV052 === 'marksman' ? 32 : 90;
  s.aiReloadV052 = 0;
  s.aiCombatT052 = 0;
  s.aiFlankT052 = 0;
  s.aiFlankSideV052 = s.squadSlot % 2 ? 1 : -1;
  s.aiOutOfAmmoV052 = false;
  s.aiMeleeCdV052 = 0;
}

function initAiSquadRolesV052() {
  for (const s of soldiers) initAiSoldierV052(s);
}

function updateSoldierLogisticsV052(s, dt, tgt, tPos, tDist) {
  if (s.aiMagV052 === undefined) initAiSoldierV052(s);
  s.aiMeleeCdV052 = Math.max(0, s.aiMeleeCdV052 - dt);
  if (s.aiReloadV052 > 0) {
    s.aiReloadV052 -= dt;
    if (s.aiReloadV052 <= 0) {
      const need = s.aiMagMaxV052 - s.aiMagV052;
      const load = Math.min(need, s.aiReserveV052);
      s.aiMagV052 += load;
      s.aiReserveV052 -= load;
    }
  }
  if (s.aiMagV052 <= 0 && s.aiReserveV052 > 0 && s.aiReloadV052 <= 0) {
    s.aiReloadV052 = s.aiRoleV052 === 'support' ? 3.6 : 2.2;
    v052.reloads++;
  }
  s.aiOutOfAmmoV052 = s.aiMagV052 <= 0 && s.aiReserveV052 <= 0;
  if (tgt && s.hasLos) s.aiCombatT052 += dt;
  else s.aiCombatT052 = Math.max(0, s.aiCombatT052 - dt * .6);
  s.aiFlankT052 = Math.max(0, s.aiFlankT052 - dt);
  if (s.aiOutOfAmmoV052 && tgt && tPos && tDist < 2.5 && s.aiMeleeCdV052 <= 0) {
    s.aiMeleeCdV052 = 1.1;
    v052.meleeSwitches++;
    const point = tPos.clone();
    spawnParticles(point, 0xffcc88, 3, 2, .5);
    if (tgt.kind === 'player') damagePlayer(22, s.obj.position);
    else if (tgt.kind === 'soldier') damageSoldier(tgt.s, 26, point, s.team === 1, s);
  }
}

function consumeAiRoundV052(s) {
  if (!s || s.aiReloadV052 > 0 || s.aiOutOfAmmoV052 || s.aiMagV052 <= 0) return false;
  s.aiMagV052--;
  return true;
}

function aiCanFireV052(s) {
  return !!s && s.aiReloadV052 <= 0 && !s.aiOutOfAmmoV052 && s.aiMagV052 > 0;
}

function roleFormationDestinationV052(s, destX, destZ, tgt) {
  if (!s.squad || tgt) return { x: destX, z: destZ };
  const leader = squadLeader(s.squad);
  if (!leader || leader === s) return { x: destX, z: destZ };
  const lp = leader.obj.position;
  const toGoal = new THREE.Vector2(destX - lp.x, destZ - lp.z);
  if (toGoal.lengthSq() < .1) return { x: destX, z: destZ };
  toGoal.normalize();
  const side = new THREE.Vector2(-toGoal.y, toGoal.x);
  if (s.aiRoleV052 === 'recon') {
    return { x: lp.x + toGoal.x * 11 + side.x * 2.5, z: lp.z + toGoal.y * 11 + side.y * 2.5 };
  }
  if (s.aiRoleV052 === 'support') {
    return { x: lp.x - toGoal.x * 8 + side.x * s.aiFlankSideV052 * 3, z: lp.z - toGoal.y * 8 + side.y * s.aiFlankSideV052 * 3 };
  }
  return { x: destX, z: destZ };
}

function tacticalDestinationV052(s, destX, destZ, tgt, tPos, tDist) {
  const formed = roleFormationDestinationV052(s, destX, destZ, tgt);
  destX = formed.x; destZ = formed.z;
  if (!tgt || !tPos) return { x: destX, z: destZ };
  const sp = s.obj.position;
  const dx = tPos.x - sp.x, dz = tPos.z - sp.z;
  const len = Math.hypot(dx, dz) || 1;
  if (s.aiOutOfAmmoV052) {
    if (tDist < 4) return { x: tPos.x, z: tPos.z };
    return { x: sp.x - dx / len * 18, z: sp.z - dz / len * 18 };
  }
  const shouldFlank = s.aiCombatT052 > 4.2 && s.aiRoleV052 !== 'support' && tDist > 10 && tDist < 58;
  if (shouldFlank && s.aiFlankT052 <= 0) {
    s.aiFlankT052 = 5 + Math.random() * 3;
    s.aiFlankSideV052 *= -1;
    v052.flankOrders++;
  }
  if (s.aiFlankT052 > 0) {
    const sideX = -dz / len * s.aiFlankSideV052;
    const sideZ = dx / len * s.aiFlankSideV052;
    const depth = Math.min(18, tDist * .55);
    return { x: sp.x + sideX * depth + dx / len * 5, z: sp.z + sideZ * depth + dz / len * 5 };
  }
  if (s.aiRoleV052 === 'support' && tDist < 28) return { x: sp.x - dx / len * 8, z: sp.z - dz / len * 8 };
  return { x: destX, z: destZ };
}

function aiRoleAccuracyV052(s) {
  if (!s) return 0;
  if (s.aiRoleV052 === 'marksman') return .12;
  if (s.aiRoleV052 === 'support') return .04;
  if (s.aiRoleV052 === 'recon') return .07;
  return 0;
}

function resetV052() {
  v052.flankOrders = 0;
  v052.reloads = 0;
  v052.meleeSwitches = 0;
  initAiSquadRolesV052();
}
