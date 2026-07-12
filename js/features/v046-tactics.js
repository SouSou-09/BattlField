'use strict';
/* v0.4.6 — リーン、乗り越え、ダウン&蘇生、LMG */

WEAPONS.lmg = { name: 'M249 LMG', magSize: 100, reserve: 300, fireInterval: .075, reloadTime: 4.6,
  dmg: 24, hsDmg: 54, baseSpread: .009, heatSpread: .038, auto: true, adsFov: 52, pellets: 1,
  range: 260, kick: .013, muzzleVel: 230, recoilV: .018, recoilH: .012, recoilFreq: .82, recoilPhase: 1.7 };
if (!WEAPON_ORDER.includes('lmg')) WEAPON_ORDER.push('lmg');
CLASSES.support.weapon = 'lmg';
CLASSES.support.gadget = '弾薬補給 + M249 LMG';

const v046 = { lean: 0, vaultT: 0, downT: 0, reviveProgress: 0, downedOnce: false };

function updateLeanV046(dt) {
  let target = 0;
  if (player.alive && !player.downed && !curVehicle && !drone.active) {
    if (keys['KeyQ']) target = -1;
    else if (keys['KeyE']) target = 1;
  }
  v046.lean += (target - v046.lean) * Math.min(1, dt * 10);
}
function leanAngleV046() { return v046.lean * .18; }
function leanOffsetV046() { return v046.lean * .42; }

function tryVaultV046() {
  if (!player.alive || player.downed || !player.onGround || player.stance !== 0 || curVehicle) return false;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const foot = player.pos.y - player.eyeHeight;
  const tx = player.pos.x + fx * 1.1, tz = player.pos.z + fz * 1.1;
  let obstacle = null;
  for (const o of obstacles) {
    if (tx + .35 > o.minX && tx - .35 < o.maxX && tz + .35 > o.minZ && tz - .35 < o.maxZ) {
      const height = o.h - foot;
      if (height > .35 && height <= 1.65) { obstacle = o; break; }
    }
  }
  if (!obstacle) return false;
  const lx = player.pos.x + fx * 2.15, lz = player.pos.z + fz * 2.15;
  if (collidesAt(lx, lz, .35, obstacle.h + .15)) return false;
  player.pos.set(lx, obstacle.h + player.eyeHeight + .08, lz);
  player.vel.y = 1.5; player.onGround = false; v046.vaultT = .42;
  addFeed('乗り越え', 'blue');
  return true;
}

function enterDownedV046(fromPos) {
  if (player.downed || v046.downedOnce || game.ticketsBlue <= 0) return false;
  player.downed = true; player.hp = 1; player.stance = 2; player.eyeHeight = .55;
  v046.downT = 16; v046.reviveProgress = 0; v046.downedOnce = true;
  firing = false; setAds(false);
  document.getElementById('respawn-screen').style.display = 'flex';
  ui.respawnTimer.textContent = '瀕死 — 味方を待つ / F長押しで応急処置';
  addFeed('ダウン状態 — 16秒以内に蘇生可能', 'red');
  return true;
}
function finishReviveV046(bySquad = false) {
  player.downed = false; player.hp = 45; player.stance = 1; player.eyeHeight = 1.1;
  v046.downT = 0; v046.reviveProgress = 0;
  document.getElementById('respawn-screen').style.display = 'none'; updateHpUI();
  addFeed(bySquad ? '分隊員に蘇生された +45' : '応急処置で復帰 +45', 'blue');
}
function updateDownedV046(dt) {
  if (!player.downed) return;
  v046.downT -= dt;
  let allyNear = false;
  for (const s of playerSquadMembers()) if (s.obj.position.distanceTo(player.pos) < 4.5) { allyNear = true; break; }
  if (allyNear) v046.reviveProgress += dt * .8;
  else if (keys['KeyF']) v046.reviveProgress += dt * .34;
  else v046.reviveProgress = Math.max(0, v046.reviveProgress - dt * .18);
  ui.respawnTimer.textContent = `瀕死 ${Math.ceil(v046.downT)}秒 — 蘇生 ${Math.min(100, v046.reviveProgress * 100).toFixed(0)}%`;
  camera.position.copy(player.pos); camera.position.y = terrainH(player.pos.x, player.pos.z) + .62;
  camera.rotation.set(player.pitch * .4, player.yaw, .12);
  if (v046.reviveProgress >= 1) finishReviveV046(allyNear);
  else if (v046.downT <= 0) {
    player.downed = false; player.hp = 0; document.getElementById('respawn-screen').style.display = 'none'; playerDie();
  }
}
function updateV046(dt) {
  updateLeanV046(dt); v046.vaultT = Math.max(0, v046.vaultT - dt); updateDownedV046(dt);
  if (v046.vaultT > 0) gunGroup.rotation.x = -.7 * Math.sin(v046.vaultT / .42 * Math.PI);
}
function resetV046() {
  player.downed = false; v046.lean = 0; v046.vaultT = 0; v046.downT = 0; v046.reviveProgress = 0; v046.downedOnce = false;
}
function onRespawnV046() { player.downed = false; v046.downedOnce = false; v046.reviveProgress = 0; }
