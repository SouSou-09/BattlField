'use strict';
/* v0.5.1 — RPG装甲判定、クレイモア、AI狙撃兵固定運用 */

const v051 = {
  rockets: 2,
  rocketMax: 2,
  claymores: 2,
  claymoreMax: 2,
  rpgShots: 0,
  armorHits: { front: 0, side: 0, rear: 0 },
  sniperNests: []
};

const rpgPoolV051 = [];
const claymoresV051 = [];
{
  const rocketGeo = new THREE.CylinderGeometry(.055, .075, .55, 7);
  const rocketMat = new THREE.MeshLambertMaterial({ color: 0x556044 });
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(rocketGeo, rocketMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    rpgPoolV051.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), ttl: 0, active: false });
  }
}

function vehicleArmorZoneV051(v, impactPoint) {
  const local = impactPoint.clone().sub(v.obj.position);
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), -v.yaw);
  if (local.z < -Math.abs(local.x) * .8) return 'front';
  if (local.z > Math.abs(local.x) * .65) return 'rear';
  return 'side';
}

function damageVehicleArmorV051(v, baseDamage, impactPoint) {
  if (!v || !v.alive) return 0;
  const zone = vehicleArmorZoneV051(v, impactPoint);
  const armored = v.type === 'tank' || v.type === 'apc';
  const mult = armored
    ? (zone === 'front' ? .42 : zone === 'side' ? .82 : 1.38)
    : (zone === 'front' ? .88 : zone === 'side' ? 1.05 : 1.28);
  const dealt = baseDamage * mult;
  v.lastArmorZoneV051 = zone;
  v051.armorHits[zone]++;
  damageVehicle(v, dealt, 'rpg-penetration', impactPoint);
  const label = zone === 'front' ? '正面装甲' : zone === 'side' ? '側面装甲' : '後部装甲';
  addFeed(`${label} ${mult >= 1 ? '貫通' : '減衰'} — ${Math.round(dealt)} damage`, mult >= 1 ? 'blue' : 'red');
  return dealt;
}

function fireRpgV051() {
  if (!game.running || !player.alive || player.downed || curVehicle || drone.active || v051.rockets <= 0) {
    if (v051.rockets <= 0) addFeed('RPG弾薬切れ — 補給物資を探せ', 'red');
    return;
  }
  const rocket = rpgPoolV051.find(r => !r.active);
  if (!rocket) return;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
  rocket.active = true;
  rocket.ttl = 5;
  rocket.pos.copy(camera.position).addScaledVector(dir, .75);
  rocket.vel.copy(dir).multiplyScalar(72);
  rocket.mesh.position.copy(rocket.pos);
  rocket.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  rocket.mesh.visible = true;
  v051.rockets--;
  v051.rpgShots++;
  firing = false;
  sfx.rocket();
  addFeed(`RPG発射 — 残弾 ${v051.rockets}`, 'blue');
}

function detonateRpgV051(rocket, point, vehicle = null) {
  rocket.active = false;
  rocket.mesh.visible = false;
  if (vehicle) damageVehicleArmorV051(vehicle, 190, point);
  explodeAt(point.clone(), 5.2, vehicle ? 72 : 135, vehicle);
}

function updateRpgV051(dt) {
  for (const rocket of rpgPoolV051) {
    if (!rocket.active) continue;
    rocket.ttl -= dt;
    const prev = rocket.pos.clone();
    rocket.vel.y -= 2.2 * dt;
    rocket.pos.addScaledVector(rocket.vel, dt);
    rocket.mesh.position.copy(rocket.pos);
    const segment = rocket.pos.clone().sub(prev);
    const length = segment.length();
    raycaster.set(prev, segment.normalize());
    raycaster.far = length;
    const wallHit = raycaster.intersectObjects(solidMeshes, false)[0];
    let hitVehicle = null;
    for (const v of vehicles) {
      if (v.alive && v.obj.position.distanceTo(rocket.pos) < v.radius + .55) { hitVehicle = v; break; }
    }
    if (hitVehicle) detonateRpgV051(rocket, rocket.pos.clone(), hitVehicle);
    else if (wallHit) detonateRpgV051(rocket, wallHit.point);
    else if (rocket.pos.y <= terrainH(rocket.pos.x, rocket.pos.z) + .12 || rocket.ttl <= 0) detonateRpgV051(rocket, rocket.pos.clone().setY(Math.max(rocket.pos.y, terrainH(rocket.pos.x, rocket.pos.z) + .2)));
    else if (Math.random() < dt * 18) spawnParticles(rocket.pos, 0x777777, 1, .5, .4);
  }
}

function placeClaymoreV051() {
  if (!player.alive || curVehicle || drone.active || v051.claymores <= 0) return;
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const pos = player.pos.clone().addScaledVector(forward, 1.1);
  pos.y = terrainH(pos.x, pos.z) + .22;
  if (collidesAt(pos.x, pos.z, .22, pos.y)) { addFeed('クレイモア設置不可', 'red'); return; }
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.5, .32, .1), new THREE.MeshLambertMaterial({ color: 0x4f633d }));
  const legGeo = new THREE.BoxGeometry(.035, .32, .035);
  const legL = new THREE.Mesh(legGeo, matVDark); legL.position.set(-.16, -.22, 0); legL.rotation.z = -.25;
  const legR = legL.clone(); legR.position.x = .16; legR.rotation.z = .25;
  group.add(body, legL, legR);
  group.position.copy(pos);
  group.rotation.y = player.yaw;
  scene.add(group);
  claymoresV051.push({ group, pos, dir: forward, armedT: 1.2, active: true });
  v051.claymores--;
  addFeed(`クレイモア設置 — 残り ${v051.claymores} / Uで手動起爆`, 'blue');
}

function detonateClaymoreV051(mine) {
  if (!mine || !mine.active) return;
  mine.active = false;
  scene.remove(mine.group);
  sfx.explosion();
  flashExplosionLight(mine.pos);
  spawnParticles(mine.pos, 0xffaa44, 22, 9, 1.5);
  for (const s of soldiers) {
    if (!s.alive || s.team !== -1) continue;
    const delta = s.obj.position.clone().sub(mine.pos);
    const d = delta.length();
    if (d > 9 || mine.dir.dot(delta.normalize()) < -.05 || !hasLineOfSight(mine.pos.clone().setY(mine.pos.y + .3), s.obj.position.clone().setY(s.obj.position.y + 1))) continue;
    damageSoldierByPlayer(s, 175 * (1 - d / 12), s.obj.position.clone().setY(s.obj.position.y + 1));
  }
  for (const v of vehicles) {
    if (!v.alive) continue;
    const delta = v.obj.position.clone().sub(mine.pos);
    if (delta.length() < 7 && mine.dir.dot(delta.normalize()) > -.05) damageVehicleArmorV051(v, 72, mine.pos);
  }
}

function detonateClaymoresV051() {
  let count = 0;
  for (const mine of claymoresV051) if (mine.active) { detonateClaymoreV051(mine); count++; }
  if (count) addFeed(`クレイモア手動起爆 ×${count}`, 'blue');
}

function updateClaymoresV051(dt) {
  for (const mine of claymoresV051) {
    if (!mine.active) continue;
    mine.armedT -= dt;
    if (mine.armedT > 0) continue;
    for (const s of soldiers) {
      if (!s.alive || s.team !== -1) continue;
      const delta = s.obj.position.clone().sub(mine.pos);
      if (delta.length() < 5.5 && mine.dir.dot(delta.normalize()) > .15) { detonateClaymoreV051(mine); break; }
    }
  }
}

function initSniperPositionsV051() {
  v051.sniperNests.length = 0;
  // v0.8.0: 座標1.3倍拡張 (旧: [-238,-210]...)
  const candidates = [
    [-309, -273], [-31, -26], [241, -185], [312, 293],
    [309, -237], [29, 31], [-237, 177], [-325, -306]
  ];
  const perTeam = { 1: 0, '-1': 0 };
  for (const s of soldiers) {
    if (perTeam[s.team] >= 2 || s.squadSlot !== 3) continue;
    const idx = (s.team === 1 ? 0 : 4) + perTeam[s.team];
    const p = candidates[idx];
    s.aiSniperV051 = true;
    s.sniperNestV051 = new THREE.Vector3(p[0], terrainH(p[0], p[1]), p[1]);
    s.sniperHoldingV051 = false;
    s.speed *= .9;
    perTeam[s.team]++;
    v051.sniperNests.push(s.sniperNestV051);
  }
}

function sniperDestinationV051(s) {
  if (!s.aiSniperV051 || !s.sniperNestV051 || !s.alive) return null;
  const d = Math.hypot(s.obj.position.x - s.sniperNestV051.x, s.obj.position.z - s.sniperNestV051.z);
  s.sniperHoldingV051 = d < 2.4;
  return { x: s.sniperNestV051.x, z: s.sniperNestV051.z, hold: s.sniperHoldingV051 };
}

function updateSnipersV051() {
  for (const s of soldiers) {
    if (!s.aiSniperV051) continue;
    const prone = s.alive && s.sniperHoldingV051;
    s.obj.scale.y += ((prone ? .52 : 1) - s.obj.scale.y) * .12;
    if (prone) {
      s.shootCd = Math.min(s.shootCd, .65);
      s.marker.position.y = 3.7;
    } else s.marker.position.y = 2.35;
  }
}

function updateV051(dt) {
  updateRpgV051(dt);
  updateClaymoresV051(dt);
  updateSnipersV051();
}

function resetV051() {
  v051.rockets = v051.rocketMax;
  v051.claymores = v051.claymoreMax;
  v051.rpgShots = 0;
  v051.armorHits.front = v051.armorHits.side = v051.armorHits.rear = 0;
  for (const r of rpgPoolV051) { r.active = false; r.mesh.visible = false; }
  for (const mine of claymoresV051) scene.remove(mine.group);
  claymoresV051.length = 0;
  initSniperPositionsV051();
}

window.addEventListener('keydown', e => {
  if (!game.running || e.repeat) return;
  if (e.code === 'KeyJ') fireRpgV051();
  if (e.code === 'KeyY') placeClaymoreV051();
  if (e.code === 'KeyU') detonateClaymoresV051();
});
