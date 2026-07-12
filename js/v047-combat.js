'use strict';
/* v0.4.7 — player smoke grenades, AI radio, suppression and flinch */

const v047 = { smokeCount: 2, smokeMax: 2, radioT: 2, suppression: 0, voiceT: 0 };
const playerSmokePool = [];
{
  const geo = new THREE.SphereGeometry(.14, 8, 6);
  const mat = new THREE.MeshLambertMaterial({ color: 0xb9c0b6 });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m);
    playerSmokePool.push({ m, vel: new THREE.Vector3(), active: false, fuse: 0 });
  }
}
function throwSmokeGrenadeV047() {
  if (!player.alive || player.downed || curVehicle || v047.smokeCount <= 0) return;
  const g = playerSmokePool.find(x => !x.active); if (!g) return;
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  g.m.position.copy(camera.position).addScaledVector(dir, .65);
  g.vel.copy(dir).multiplyScalar(15); g.vel.y += 4.2;
  g.fuse = 1.45; g.active = true; g.m.visible = true;
  v047.smokeCount--; sfx.pin(); updateSmokeHudV047();
  addFeed('スモーク投擲 — 視線を遮断', 'blue');
}
function updateSmokeGrenadesV047(dt) {
  for (const g of playerSmokePool) {
    if (!g.active) continue;
    g.fuse -= dt; g.vel.y -= 16 * dt; g.m.position.addScaledVector(g.vel, dt);
    const floor = terrainH(g.m.position.x, g.m.position.z) + .14;
    if (g.m.position.y < floor) {
      g.m.position.y = floor; g.vel.y = Math.abs(g.vel.y) * .3; g.vel.x *= .58; g.vel.z *= .58;
    }
    if (collidesAt(g.m.position.x, g.m.position.z, .14, g.m.position.y - .14)) {
      g.vel.x *= -.35; g.vel.z *= -.35;
    }
    if (g.fuse <= 0) {
      g.active = false; g.m.visible = false;
      spawnSmokeAt(g.m.position.clone().setY(floor + .35));
    }
  }
}
function updateSmokeHudV047() {
  const el = document.getElementById('smoke-count-v047');
  if (el) el.textContent = v047.smokeCount;
}

function radioMessageV047(text, urgent = false) {
  if (v047.voiceT > 0) return;
  v047.voiceT = urgent ? 3.5 : 5.5;
  addFeed(`無線: ${text}`, urgent ? 'red' : 'blue');
  if (!AC) return;
  playBeep(urgent ? 920 : 680, .055, .06, 'square');
  setTimeout(() => playBeep(urgent ? 710 : 820, .08, .045, 'square'), 85);
}
function updateRadioV047(dt) {
  v047.voiceT = Math.max(0, v047.voiceT - dt);
  v047.radioT -= dt;
  if (v047.radioT > 0 || !game.running) return;
  v047.radioT = 7 + Math.random() * 8;
  let threatened = null;
  for (const f of flags) if (f.own === 1 && flagUnderThreat(f, 1)) { threatened = f; break; }
  if (threatened) { radioMessageV047(`${threatened.id}拠点を奪還しろ!`, true); return; }
  const visible = soldiers.find(s => s.team === -1 && s.alive && s.seenByPlayer);
  if (visible) { radioMessageV047('敵発見! 方位を確認しろ!', true); return; }
  const choices = ['分隊、前進!', '周囲を警戒しろ', '援護する、移動しろ', '弾薬を確認'];
  radioMessageV047(choices[Math.floor(Math.random() * choices.length)]);
}

function suppressPlayerV047(amount, source) {
  if (!player.alive || curVehicle || v043.classId === 'support') amount *= .6;
  v047.suppression = Math.min(1, v047.suppression + amount);
  if (source && amount > .2) showDamageDirection(source);
}
function suppressSoldierV047(s, amount) {
  if (!s || !s.alive) return;
  s.suppressionV047 = Math.min(1, (s.suppressionV047 || 0) + amount);
  s.flinchV047 = .22;
  s.aimT = Math.max(0, s.aimT - amount * .8);
}
function suppressAlongBulletV047(from, to) {
  const seg = to.clone().sub(from), len2 = seg.lengthSq(); if (len2 < .001) return;
  for (const s of soldiers) {
    if (!s.alive || s.team !== -1) continue;
    const p = s.obj.position.clone().setY(s.obj.position.y + 1.2);
    const t = THREE.MathUtils.clamp(p.clone().sub(from).dot(seg) / len2, 0, 1);
    const closest = from.clone().addScaledVector(seg, t);
    const d = closest.distanceTo(p);
    if (d < 2.6) suppressSoldierV047(s, (2.7 - d) * .18);
  }
}
function updateSoldierSuppressionV047(s, dt) {
  s.suppressionV047 = Math.max(0, (s.suppressionV047 || 0) - dt * .22);
  s.flinchV047 = Math.max(0, (s.flinchV047 || 0) - dt);
  if (s.flinchV047 > 0) s.obj.rotation.z = Math.sin(s.flinchV047 * 35) * .08;
  else s.obj.rotation.z *= Math.max(0, 1 - dt * 12);
}
function suppressionAimPenaltyV047(s) { return (s.suppressionV047 || 0) * .28; }
function trySuppressionFireV047(s, tgt, tPos, tDist, dt) {
  if (!tgt || !tPos || s.hasLos || tDist > 55 || s.shootCd > 0 || Math.random() > dt * .55) return;
  const eye = new THREE.Vector3(s.obj.position.x, s.obj.position.y + 1.6, s.obj.position.z);
  const dir = tPos.clone().sub(eye).normalize();
  raycaster.set(eye, dir); raycaster.far = tDist;
  const hit = raycaster.intersectObjects(solidMeshes, false)[0];
  const end = hit ? hit.point : tPos.clone();
  spawnTracer(eye, end, s.team === 1 ? 0x8ecbff : 0xff8866);
  spawnParticles(end, 0xb0a890, 2, 1.5);
  s.shootCd = .45 + Math.random() * .5;
  if (tgt.kind === 'player' && end.distanceTo(player.pos) < 3) suppressPlayerV047(.14, eye);
}
function updateSuppressionV047(dt) {
  v047.suppression = Math.max(0, v047.suppression - dt * .24);
  if (v047.suppression > .05 && player.alive) {
    const kick = v047.suppression * v047.suppression;
    player.pitch += (Math.random() - .5) * kick * dt * .18;
    player.yaw += (Math.random() - .5) * kick * dt * .13;
    const cross = document.getElementById('crosshair');
    if (cross) cross.style.filter = `blur(${(kick * 1.4).toFixed(2)}px)`;
  } else {
    const cross = document.getElementById('crosshair'); if (cross) cross.style.filter = '';
  }
}
function updateV047(dt) {
  updateSmokeGrenadesV047(dt); updateRadioV047(dt); updateSuppressionV047(dt);
}
function resetV047() {
  v047.smokeCount = v047.smokeMax; v047.suppression = 0; v047.radioT = 2; v047.voiceT = 0;
  for (const g of playerSmokePool) { g.active = false; g.m.visible = false; }
  for (const s of soldiers) { s.suppressionV047 = 0; s.flinchV047 = 0; }
  updateSmokeHudV047();
}
function onRespawnV047() { v047.smokeCount = v047.smokeMax; v047.suppression = 0; updateSmokeHudV047(); }

window.addEventListener('keydown', e => {
  if (e.code === 'KeyN' && !e.repeat && game.running) throwSmokeGrenadeV047();
});
