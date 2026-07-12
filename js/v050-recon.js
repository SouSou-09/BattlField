'use strict';
/* v0.5.0 — 偵察兵Qタグ、双眼鏡、足音可視化 */

const v050 = {
  binoculars: false,
  qDownAt: 0,
  tagged: 0,
  noiseRange: 0,
  footstepPhase: 0
};

const binocularHudV050 = document.createElement('div');
binocularHudV050.id = 'binocular-hud-v050';
binocularHudV050.style.cssText = 'display:none;position:fixed;inset:0;z-index:18;pointer-events:none;background:radial-gradient(ellipse at center,transparent 0 25%,rgba(0,0,0,.83) 27% 100%);border:2px solid rgba(190,225,190,.35);color:#d9f4d0;font:700 12px monospace;text-align:center;padding-top:18px;text-shadow:0 1px 2px #000';
binocularHudV050.textContent = '双眼鏡 8x  •  Q: 敵をマーキング  •  K: 収納';
document.body.appendChild(binocularHudV050);

function toggleBinocularsV050(force) {
  if (!player.alive || curVehicle || drone.active) return;
  v050.binoculars = force === undefined ? !v050.binoculars : !!force;
  binocularHudV050.style.display = v050.binoculars ? 'block' : 'none';
  if (v050.binoculars) {
    firing = false;
    setAds(false);
    addFeed('双眼鏡展開 — Qで遠距離マーキング', 'blue');
  }
}

function reconTagTargetV050() {
  if (!player.alive || curVehicle || drone.active) return false;
  if (v043.classId !== 'recon' && !v050.binoculars) {
    addFeed('Qタグは偵察兵または双眼鏡で使用可能', 'red');
    return false;
  }
  const origin = camera.position.clone();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const maxRange = v050.binoculars ? 360 : 190;
  const maxAngle = v050.binoculars ? 0.035 : 0.065;
  let best = null;
  let bestScore = Infinity;
  for (const s of soldiers) {
    if (!s.alive || s.team !== -1) continue;
    const target = s.obj.position.clone().setY(s.obj.position.y + 1.35);
    const delta = target.clone().sub(origin);
    const distance = delta.length();
    if (distance > maxRange) continue;
    const angle = forward.angleTo(delta.normalize());
    if (angle > maxAngle || !hasLineOfSight(origin, target)) continue;
    const score = angle * 120 + distance / maxRange;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  if (!best) {
    addFeed('Qタグ: 照準内に視認可能な敵なし', 'red');
    return false;
  }
  const duration = v043.classId === 'recon' ? (v050.binoculars ? 18 : 13) : 9;
  best.spotted = Math.max(best.spotted || 0, duration);
  best.squadTaggedV050 = v043.squadId;
  best.taggedByV050 = duration;
  v050.tagged++;
  game.score += 20;
  updateScoreUI();
  addFeed(`分隊共有タグ: ${best.name} (${Math.round(best.obj.position.distanceTo(player.pos))}m)`, 'blue');
  radioMessageV047('偵察', '敵をマーキング。分隊HUDへ共有した');
  return true;
}

function playerNoiseRangeV050() {
  if (!player.alive || curVehicle || drone.active || moveMag() < .08) return 0;
  if (player.stance === 2) return 4;
  if (player.stance === 1) return 10;
  const sprinting = !!keys.ShiftLeft && player.stamina > .02;
  return sprinting ? 52 : 27;
}

function updateV050(dt) {
  if (v050.binoculars && (!player.alive || curVehicle || drone.active)) toggleBinocularsV050(false);
  const targetFov = v050.binoculars ? 18 : camera.fov;
  if (v050.binoculars) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  v050.noiseRange += (playerNoiseRangeV050() - v050.noiseRange) * Math.min(1, dt * 8);
  if (v050.noiseRange > 0) v050.footstepPhase = (v050.footstepPhase + dt * (v050.noiseRange > 35 ? 1.8 : 1.15)) % 1;
  for (const s of soldiers) if (s.taggedByV050 > 0) s.taggedByV050 = Math.max(0, s.taggedByV050 - dt);
}

function drawFootstepRadarV050(g, center, radarRange) {
  if (v050.noiseRange < 1) return;
  const maxRadius = v050.noiseRange / radarRange * center;
  const pulse = .25 + v050.footstepPhase * .75;
  g.save();
  g.strokeStyle = `rgba(255,210,87,${.72 * (1 - v050.footstepPhase)})`;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(center, center, Math.max(2, maxRadius * pulse), 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffd257';
  g.font = '7px monospace';
  g.textAlign = 'left';
  g.fillText(`${Math.round(v050.noiseRange)}m`, 3, 109);
  g.restore();
}

function resetV050() {
  v050.binoculars = false;
  v050.qDownAt = 0;
  v050.tagged = 0;
  v050.noiseRange = 0;
  v050.footstepPhase = 0;
  binocularHudV050.style.display = 'none';
}

window.addEventListener('keydown', e => {
  if (!game.running || e.repeat) return;
  if (e.code === 'KeyK') toggleBinocularsV050();
  if (e.code === 'KeyQ' && !curVehicle) v050.qDownAt = performance.now();
});
window.addEventListener('keyup', e => {
  if (e.code !== 'KeyQ' || curVehicle || !game.running || !v050.qDownAt) return;
  const held = performance.now() - v050.qDownAt;
  v050.qDownAt = 0;
  if (held < 320) reconTagTargetV050();
});
