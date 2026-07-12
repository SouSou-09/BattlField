'use strict';
/* STEEL FRONT — 偵察ドローン (vehicles.js から分割) */

/* =========================================================
   v0.3: 偵察ドローン (Tキー / DRNボタン)
   ========================================================= */
const drone = {
  active: false, hp: 0, battery: 0, cooldown: 0,
  obj: null, yaw: 0, pitch: 0, pos: new THREE.Vector3(), spotT: 0
};
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), matVDark);
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), matVGlass); camBox.position.set(0, -0.1, -0.15);
  g.add(body, camBox);
  [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(o => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.06), matVDark);
    arm.position.set(o[0], 0.05, o[1]);
    arm.rotation.y = Math.atan2(o[1], o[0]);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.05), matVDark);
    prop.position.set(o[0], 0.1, o[1]);
    prop.userData.isProp = true;
    g.add(arm, prop);
  });
  g.visible = false;
  scene.add(g);
  drone.obj = g;
}
function toggleDrone() {
  if (!game.running || !player.alive || curVehicle) return;
  if (drone.active) { endDrone(false); return; }
  if (drone.cooldown > 0) { addFeed('ドローン充電中 (' + Math.ceil(drone.cooldown) + 's)', 'red'); return; }
  drone.active = true;
  drone.hp = 30;
  drone.battery = 22;
  drone.pos.set(player.pos.x, player.pos.y + 4, player.pos.z);
  drone.yaw = player.yaw;
  drone.pitch = -0.35;
  drone.obj.visible = true;
  firing = false;
  setAds(false);
  gunGroup.visible = false;
  sfx.drone();
  ui.droneHud.style.display = 'block';
  addFeed('偵察ドローンを展開', 'blue');
}
function endDrone(destroyed) {
  drone.active = false;
  drone.obj.visible = false;
  drone.cooldown = 30;
  gunGroup.visible = !curVehicle;
  ui.droneHud.style.display = 'none';
  camera.fov = FOV_HIP;
  camera.updateProjectionMatrix();
  if (destroyed) {
    spawnParticles(drone.pos, 0xff8830, 8, 4, 1);
    sfx.explosion();
    addFeed('ドローンが撃墜された', 'red');
  } else {
    addFeed('ドローン帰投', 'blue');
  }
}
function updateDrone(dt) {
  drone.cooldown = Math.max(0, drone.cooldown - dt);
  if (!drone.active) return;
  if (!player.alive) { endDrone(false); return; }
  drone.battery -= dt;
  if (drone.battery <= 0) { endDrone(false); return; }
  // 操作: 移動系入力を流用
  let ix = 0, iz = 0, up = 0;
  if (isMobile) {
    ix = joy.x; iz = joy.y;
    if (heliUpHeld) up += 1;
    if (heliDownHeld) up -= 1;
  } else {
    if (keys['KeyW']) iz -= 1;
    if (keys['KeyS']) iz += 1;
    if (keys['KeyA']) ix -= 1;
    if (keys['KeyD']) ix += 1;
    if (keys['Space']) up += 1;
    if (keys['KeyC']) up -= 1;
  }
  const spd = 14;
  const sin = Math.sin(drone.yaw), cos = Math.cos(drone.yaw);
  const wx = (ix * cos + iz * sin) * spd;
  const wz = (iz * cos - ix * sin) * spd;
  drone.pos.x += wx * dt;
  drone.pos.z += wz * dt;
  drone.pos.y += up * 9 * dt;
  const minY = terrainH(drone.pos.x, drone.pos.z) + 1.2;
  drone.pos.y = Math.max(minY, Math.min(70, drone.pos.y));
  drone.pos.x = Math.max(-WORLD, Math.min(WORLD, drone.pos.x));
  drone.pos.z = Math.max(-WORLD, Math.min(WORLD, drone.pos.z));
  drone.obj.position.copy(drone.pos);
  drone.obj.rotation.y = drone.yaw;
  drone.obj.traverse(m => { if (m.userData.isProp) m.rotation.y += dt * 40; });
  // カメラ = ドローン視点
  camera.position.copy(drone.pos).y -= 0.2;
  camera.rotation.set(drone.pitch, drone.yaw, 0);
  // 敵スポット (55m以内 + LoS)
  drone.spotT -= dt;
  if (drone.spotT <= 0) {
    drone.spotT = 0.5;
    let n = 0;
    for (const s of soldiers) {
      if (!s.alive || s.team !== -1) continue;
      const d = s.obj.position.distanceTo(drone.pos);
      if (d < 55 && hasLineOfSight(drone.pos.clone(), s.obj.position.clone().setY(s.obj.position.y + 1.5))) {
        s.spotted = 5;
        n++;
      }
    }
    if (n > 0) ui.droneSpot.textContent = n + ' 体の敵をスポット中';
    else ui.droneSpot.textContent = '';
    // 敵AIがドローンを撃ち落とす可能性
    for (const s of soldiers) {
      if (!s.alive || s.team !== -1 || s.inVehicle) continue;
      const d = s.obj.position.distanceTo(drone.pos);
      if (d < 45 && Math.random() < 0.10) {
        const eye = s.obj.position.clone().setY(s.obj.position.y + 1.6);
        spawnTracer(eye, drone.pos.clone(), 0xff8866);
        sfx.distShoot(camera.position.distanceTo(eye));
        if (Math.random() < 0.35) {
          drone.hp -= 12;
          spawnParticles(drone.pos, 0xffee88, 3, 2);
          if (drone.hp <= 0) { endDrone(true); return; }
        }
      }
    }
  }
  ui.droneBattery.style.width = (drone.battery / 22 * 100) + '%';
}
