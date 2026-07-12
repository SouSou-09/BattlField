'use strict';
/* v0.4.5 — 排莢、腕モデル、キルカメラ、負傷表現、リザルト演出 */

const v045 = { casings: [], casingCursor: 0, snapshots: [], snapT: 0, killcamT: 0, killerPos: null, heartbeatT: 0 };

function initV045() {
  if (v045.casings.length) return;
  const brass = new THREE.MeshStandardMaterial({ color: 0xc69a43, metalness: .75, roughness: .35 });
  const geo = new THREE.CylinderGeometry(.025, .025, .11, 7); geo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(geo, brass); m.visible = false; scene.add(m);
    v045.casings.push({ m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), ttl: 0 });
  }
  const skin = new THREE.MeshLambertMaterial({ color: 0x9a6548 });
  const sleeve = new THREE.MeshLambertMaterial({ color: 0x394d34 });
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(.11, .12, .38), sleeve); upper.position.z = .12;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(.105, .1, .16), skin); hand.position.z = -.15;
    arm.add(upper, hand); arm.position.set(side * .13, -.12, .15); arm.rotation.x = -.18;
    gunGroup.add(arm);
  }
  const overlay = document.createElement('div'); overlay.id = 'killcam-overlay';
  overlay.innerHTML = '<div class="killcam-label">KILLCAM <span>3.0</span></div><div class="killcam-info">敵の射線を再現中</div>';
  document.body.appendChild(overlay);
}

function ejectCasing() {
  const c = v045.casings[v045.casingCursor++ % v045.casings.length];
  const p = new THREE.Vector3(.22, -.1, -.25); gunGroup.localToWorld(p);
  c.m.position.copy(p); c.m.rotation.set(Math.random() * 6, Math.random() * 6, 0); c.m.visible = true;
  const right = new THREE.Vector3(1, .35, .25).applyQuaternion(camera.quaternion).normalize();
  c.vel.copy(right).multiplyScalar(2.3 + Math.random() * 1.5); c.vel.y += 1.2;
  c.spin.set(Math.random() * 15, Math.random() * 18, Math.random() * 12); c.ttl = 3.5;
}
function updateCasings(dt) {
  for (const c of v045.casings) {
    if (c.ttl <= 0) continue;
    c.ttl -= dt; c.vel.y -= 9.8 * dt; c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
    const floor = terrainH(c.m.position.x, c.m.position.z) + .035;
    if (c.m.position.y < floor) { c.m.position.y = floor; c.vel.y = Math.abs(c.vel.y) * .28; c.vel.x *= .65; c.vel.z *= .65; c.spin.multiplyScalar(.7); }
    if (c.ttl <= 0) c.m.visible = false;
  }
}

function recordCombatSnapshot(dt) {
  v045.snapT -= dt; if (v045.snapT > 0 || !player.alive) return;
  v045.snapT = .12;
  v045.snapshots.push({ t: performance.now(), p: player.pos.clone(), yaw: player.yaw, enemies: soldiers.filter(s => s.team === -1 && s.alive).map(s => ({ p: s.obj.position.clone(), name: s.name })) });
  while (v045.snapshots.length > 28) v045.snapshots.shift();
}
function startKillcam(fromPos) {
  v045.killcamT = 3; v045.killerPos = fromPos ? fromPos.clone() : null;
  const el = document.getElementById('killcam-overlay'); if (el) el.classList.add('show');
}
function updateKillcam(dt) {
  if (v045.killcamT <= 0) return;
  v045.killcamT -= dt;
  const el = document.getElementById('killcam-overlay');
  if (el) {
    const span = el.querySelector('span'); if (span) span.textContent = Math.max(0, v045.killcamT).toFixed(1);
    if (v045.killerPos) {
      const d = v045.killerPos.distanceTo(player.pos).toFixed(0);
      el.querySelector('.killcam-info').textContent = `射撃位置: ${d}m / 方位を追跡`;
    }
    if (v045.killcamT <= 0) el.classList.remove('show');
  }
}
function injurySpeedMultiplier() { return player.hp < 25 ? .62 : player.hp < 45 ? .82 : 1; }
function updateInjury(dt) {
  const hurt = player.alive && player.hp < 35;
  document.body.classList.toggle('critically-injured', hurt);
  if (!hurt) return;
  v045.heartbeatT -= dt;
  if (v045.heartbeatT <= 0) { v045.heartbeatT = .72 + player.hp / 100; playBeep(62, .16, .11, 'sine'); }
  camera.rotation.z += (Math.sin(elapsed * 3.4) * .012 - camera.rotation.z) * Math.min(1, dt * 3);
}
function updateViewmodelV045(dt) {
  const reloadK = weapon.reloading ? Math.sin((weapon.reloadTime - weapon.reloadTimer) / weapon.reloadTime * Math.PI) : 0;
  const runK = player.sprinting ? 1 : 0;
  gunGroup.rotation.z += ((reloadK * .38 + Math.sin(elapsed * 12) * .035 * runK) - gunGroup.rotation.z) * Math.min(1, dt * 10);
  gunGroup.position.y += ((-.26 - reloadK * .16 + Math.abs(Math.sin(elapsed * 12)) * .035 * runK) - gunGroup.position.y) * Math.min(1, dt * 12);
}
function updateV045(dt) { updateCasings(dt); recordCombatSnapshot(dt); updateKillcam(dt); updateInjury(dt); updateViewmodelV045(dt); }
function resetV045() {
  initV045(); v045.snapshots.length = 0; v045.killcamT = 0;
  for (const c of v045.casings) { c.ttl = 0; c.m.visible = false; }
  document.body.classList.remove('critically-injured');
  const el = document.getElementById('killcam-overlay'); if (el) el.classList.remove('show');
}
function enhanceResultV045() {
  const className = CLASSES[v043.classId].name;
  const stats = document.getElementById('final-stats');
  stats.innerHTML += `<div class="result-highlights"><b>MVP HIGHLIGHTS</b><span>最多キル武器: ${weaponDef().name}</span><span>兵科: ${className}</span><span>最高連続キル: ${v043.bestStreak}</span><span>拠点貢献スコア: ${Math.max(0, game.score - game.kills * 100)}</span></div>`;
}
