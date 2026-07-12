'use strict';
/* STEEL FRONT — 車両運転 / AI砲手 / 対空砲 / UI (vehicles.js から分割) */

/* ---------- 車両運転 (プレイヤー搭乗中) ---------- */
let heliUpHeld = false, heliDownHeld = false;
function updateVehicle(dt) {
  const v = curVehicle;
  const role = v.seats[curSeat].role;
  if (v.type === 'heli') { updateHeli(dt, v, role); return; }

  // --- 地上車両 / ボート / 固定砲座 ---
  let throttle = 0, steer = 0;
  if (role === 'driver' && v.maxSpeed > 0) {
    if (isMobile) { throttle = -joy.y; steer = joy.x; }
    else {
      if (keys['KeyW']) throttle += 1;
      if (keys['KeyS']) throttle -= 1;
      if (keys['KeyA']) steer -= 1;
      if (keys['KeyD']) steer += 1;
    }
  }
  const trackBlockedV054 = typeof tankTranslationBlockedV054 === 'function' && tankTranslationBlockedV054(v);
  const boatPropelsV054 = typeof boatCanPropelV054 !== 'function' || boatCanPropelV054(v);
  const hasFuelV055 = typeof vehicleHasFuelV055 !== 'function' || vehicleHasFuelV055(v);
  const effMax = v.type === 'boat' && !boatPropelsV054
    ? Math.max(Math.abs(v.speed), v.maxSpeed * .12)
    : v.maxSpeed * v.mobility;
  if (trackBlockedV054) {
    v.speed = 0;
    if (role === 'driver' && steer !== 0) v.yaw -= steer * v.turnRate * dt;
  } else if (throttle !== 0 && v.mobility > 0 && boatPropelsV054 && hasFuelV055) {
    v.speed += throttle * v.accel * dt;
  } else {
    v.speed *= Math.pow(v.type === 'boat' && !boatPropelsV054 ? .965 : .4, dt);
    if (Math.abs(v.speed) < (v.type === 'boat' && !boatPropelsV054 ? .03 : .15)) v.speed = 0;
  }
  if (v.type !== 'boat') {
    // v0.4.1: 坂の影響強化 — 上りで減速 + 急斜面では横方向に滑る
    const aheadH = terrainH(v.obj.position.x - Math.sin(v.yaw) * 3, v.obj.position.z - Math.cos(v.yaw) * 3);
    const slope = (aheadH - terrainH(v.obj.position.x, v.obj.position.z)) / 3;
    v.speed -= slope * Math.sign(v.speed) * (v.type === 'tank' ? 2.5 : 5) * dt * Math.abs(v.speed) * 0.4;
    if (v.type !== 'tank') {
      const sx0 = Math.cos(v.yaw), sz0 = -Math.sin(v.yaw);
      const hL2 = terrainH(v.obj.position.x - sx0 * 2, v.obj.position.z - sz0 * 2);
      const hR2 = terrainH(v.obj.position.x + sx0 * 2, v.obj.position.z + sz0 * 2);
      const sideSlope = (hL2 - hR2) / 4;
      if (Math.abs(sideSlope) > 0.3) {
        v.obj.position.x += sx0 * sideSlope * 5 * dt;
        v.obj.position.z += sz0 * sideSlope * 5 * dt;
      }
    }
  }
  v.speed = Math.max(-effMax * 0.45, Math.min(effMax, v.speed));
  if (Math.abs(v.speed) > 0.3 && !trackBlockedV054) {
    const partSteer = v.tireParts && v.tireParts.some(t => t.broken) ? 0.45 + v.mobility * 0.45 : 1;
    const driftSteer = v.type === 'boat' && !boatPropelsV054 ? .18 : 1;
    v.yaw -= steer * v.turnRate * partSteer * driftSteer * dt * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 4);
  }
  // v0.4.1: バイクのリーン (旋回方向へ車体を傾ける)
  if (v.type === 'bike') {
    v.lean = THREE.MathUtils.lerp(v.lean || 0, -steer * 0.35 * Math.min(1, Math.abs(v.speed) / 8), Math.min(1, dt * 6));
  }
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const nx = v.obj.position.x + fx * v.speed * dt;
  const nz = v.obj.position.z + fz * v.speed * dt;
  // v0.3: 水域判定 (ボートは水上のみ / 地上車両は深水禁止)
  let blocked = false;
  if (v.type === 'boat') {
    if (!isWater(nx, nz)) blocked = true;
  } else {
    if (isDeepWater(nx, nz)) blocked = true;
  }
  if (!blocked && !collidesAt(nx, nz, v.radius, terrainH(nx, nz) + 1, v)) {
    v.obj.position.x = nx;
    v.obj.position.z = nz;
  } else {
    if (Math.abs(v.speed) > 6) {
      spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1), 0x999999, 5, 3);
      playBeep(90, 0.15, 0.15, 'sawtooth');
      damageVehicle(v, Math.abs(v.speed) * (v.type === 'bike' ? 2.5 : 1.2), 'crash');
      // v0.4.1: 衝突慣性 — カメラ揺れ + 車体の前のめり / バイクはライダーも負傷
      shake = Math.max(shake, Math.min(0.5, Math.abs(v.speed) * 0.03));
      v.obj.rotation.x -= Math.sign(v.speed) * 0.06;
      if (v.type === 'bike' && Math.abs(v.speed) > 12) damagePlayer(Math.round(Math.abs(v.speed) * 1.2));
    }
    v.speed *= -0.25;
  }
  // 高さ・姿勢
  const px = v.obj.position.x, pz = v.obj.position.z;
  if (v.type === 'boat') {
    v.bobT += dt * 2;
    v.obj.position.y = WATER_Y + 0.15 + Math.sin(v.bobT) * 0.06;
    v.obj.rotation.order = 'YXZ';
    v.obj.rotation.y = v.yaw;
    v.obj.rotation.x = Math.sin(v.bobT * 0.8) * 0.02 - v.speed * 0.004;
    v.obj.rotation.z = Math.sin(v.bobT * 1.1) * 0.02;
    if (Math.abs(v.speed) > 3 && Math.random() < dt * 8) {
      spawnParticles(v.obj.position.clone().setY(WATER_Y + 0.2).addScaledVector(new THREE.Vector3(fx, 0, fz), -2.5), 0xbfe3ef, 2, 2, 0.8);
    }
  } else {
    // v0.4.1: サスペンション表現 — 目標姿勢へバネ補間 + 速度に応じた微振動
    v.obj.position.y = terrainH(px, pz);
    const hF = terrainH(px + fx * 2, pz + fz * 2);
    const hB = terrainH(px - fx * 2, pz - fz * 2);
    const sx = Math.cos(v.yaw), sz = -Math.sin(v.yaw);
    const hL = terrainH(px - sx * 1.5, pz - sz * 1.5);
    const hR = terrainH(px + sx * 1.5, pz + sz * 1.5);
    const targetPitch = Math.atan2(hB - hF, 4) * 0.7 - v.speed * (v.type === 'bike' ? 0.004 : 0.0015);
    const partRoll = typeof vehicleDamageRollV048 === 'function' ? vehicleDamageRollV048(v) : 0;
    const targetRoll = Math.atan2(hL - hR, 3) * 0.7 + (v.type === 'bike' ? v.lean || 0 : 0) + partRoll;
    v.obj.rotation.order = 'YXZ';
    v.obj.rotation.y = v.yaw;
    v.obj.rotation.x = THREE.MathUtils.lerp(v.obj.rotation.x, targetPitch, Math.min(1, dt * 5));
    v.obj.rotation.z = THREE.MathUtils.lerp(v.obj.rotation.z, targetRoll, Math.min(1, dt * 5));
    if (Math.abs(v.speed) > 8) {
      v.obj.position.y += Math.sin(elapsed * 22) * 0.015 * Math.min(1, Math.abs(v.speed) / 15);
    }
  }
  for (const w of v.wheels) w.rotation.x += v.speed * dt * 2.2;
  if (typeof updateVehiclePartsV048 === 'function') updateVehiclePartsV048(v, dt);
  // v0.3: 轢き (ロードキル) 強化
  if (Math.abs(v.speed) > 4) {
    for (const s of soldiers) {
      if (!s.alive || s.inVehicle) continue;
      const d = Math.hypot(s.obj.position.x - v.obj.position.x, s.obj.position.z - v.obj.position.z);
      if (d < v.radius + 0.7) {
        const p = s.obj.position.clone().setY(s.obj.position.y + 1);
        spawnParticles(p, 0xbb2222, 10, 5, 1.4);
        sfx.roadkill();
        if (s.team === -1) {
          damageSoldierByPlayer(s, 999, p);
          if (!s.alive) { addFeed('🚗 ROADKILL! +120'); game.score += 20; updateScoreUI(); }
        } else damageSoldier(s, 999, p);
        v.speed *= 0.82;
        shake = Math.max(shake, 0.18);
      }
    }
  }
  updateEngine(v.speed);

  // 三人称カメラ (v0.3.3: ピッチ反転修正 — 上を向くとカメラが下がり視線が上を向く)
  const cp = Math.max(-1.1, Math.min(1.0, player.pitch));
  const cd = v.camDist;
  const cx = v.obj.position.x + Math.sin(player.yaw) * cd * Math.cos(cp);
  const cz = v.obj.position.z + Math.cos(player.yaw) * cd * Math.cos(cp);
  const cy = v.obj.position.y + v.camH + 1 - cd * Math.sin(cp) * 0.9;
  const groundY = terrainH(cx, cz) + 0.8;
  camera.position.set(cx, Math.max(groundY, cy), cz);
  // 注視点もピッチに応じて上下 (上を向くと高い点を見る)
  camera.lookAt(v.obj.position.x, v.obj.position.y + 1.6 + cd * Math.sin(cp) * 0.9, v.obj.position.z);
  if (shake > 0.01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
  }
  player.pos.set(v.obj.position.x, v.obj.position.y + player.eyeHeight, v.obj.position.z);

  // 砲塔: プレイヤーが砲手席のときのみカメラに追従
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  // v0.3.3: 運転手でも砲塔を操作・射撃可能に
  if (v.turret && (role === 'gunner' || role === 'driver')) {
    const aimYaw = Math.atan2(-camDir.x, -camDir.z);
    v.turret.rotation.y = aimYaw - v.yaw;
  }

  // v0.5.5: 開放座席の同乗者は個人武器で射撃可能
  if (typeof passengerCanFireV055 === 'function' && passengerCanFireV055(v, role)) {
    weapon.cooldown -= dt;
    weapon.burstResetT -= dt;
    if (weapon.burstResetT <= 0 && weapon.burst > 0) weapon.burst = 0;
    if (weapon.switchT > 0) weapon.switchT = Math.max(0, weapon.switchT - dt);
    if (firing) playerShoot();
    muzzleFlash.material.opacity = Math.max(0, muzzleFlash.material.opacity - dt * 18);
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 25);
  }

  v.cd -= dt;
  if (firing && v.cd <= 0 && (role === 'gunner' || role === 'driver') && v.turret) {
    v.cd = v.fireInterval;
    const muzzleWorld = new THREE.Vector3();
    v.muzzle.getWorldPosition(muzzleWorld);
    const aimPoint = camera.position.clone().addScaledVector(camDir, 160);
    const dir = aimPoint.sub(muzzleWorld).normalize();
    if (v.type === 'tank') {
      sfx.cannon();
      fireShell(muzzleWorld, dir, v);
      spawnParticles(muzzleWorld, 0xffcc66, 6, 4);
      flashExplosionLight(muzzleWorld);
      shake = Math.max(shake, 0.35);
    } else {
      if (v.type === 'aa') sfx.flak(); else sfx.mg();
      fireMG(v, muzzleWorld, dir, v.dmg, v.gunRange);
      if (v.type === 'aa') {
        // 連装: 2発目
        fireMG(v, muzzleWorld.clone().add(new THREE.Vector3(0.2, 0, 0)), dir.clone(), v.dmg, v.gunRange);
      }
    }
  }
  updateVehicleUI();
}

/* ---------- v0.3: ヘリ操縦 ---------- */
function updateHeli(dt, v, role) {
  let throttle = 0, steer = 0, lift = 0;
  if (role === 'driver') {
    if (isMobile) {
      throttle = -joy.y; steer = joy.x;
      if (heliUpHeld) lift += 1;
      if (heliDownHeld) lift -= 1;
    } else {
      if (keys['KeyW']) throttle += 1;
      if (keys['KeyS']) throttle -= 1;
      if (keys['KeyA']) steer -= 1;
      if (keys['KeyD']) steer += 1;
      if (keys['Space']) lift += 1;
      if (keys['KeyC']) lift -= 1;
    }
  }
  const autorotationV054 = typeof heliAutorotationAvailableV054 !== 'function' || heliAutorotationAvailableV054(v);
  const hasFuelV055 = typeof vehicleHasFuelV055 !== 'function' || vehicleHasFuelV055(v);
  if (v.mobility <= 0 || !hasFuelV055) lift = Math.min(lift, 0);   // ローター損傷・燃料切れでは上昇不可
  if (!hasFuelV055) throttle = 0;
  // 高度。ローター重大損傷時は揚力を失い、通常の緩降下へ移れない
  v.vy += lift * 14 * dt;
  v.vy *= Math.pow(autorotationV054 ? .25 : .72, dt);
  if (v.alt > 0) v.vy -= (autorotationV054 ? 2.2 : 11.5) * dt;
  v.alt = Math.max(0, v.alt + v.vy * dt);
  if (v.alt <= 0 && v.vy < -6) {
    damageVehicle(v, Math.abs(v.vy) * 6, 'crash');   // ハードランディング
    spawnParticles(v.obj.position.clone(), 0x999999, 8, 4);
  }
  if (v.alt <= 0) v.vy = Math.max(0, v.vy);
  // 水平移動 (高度がないと進めない)
  const airborne = v.alt > 1.2;
  if (throttle !== 0 && airborne) v.speed += throttle * v.accel * dt;
  else { v.speed *= Math.pow(0.5, dt); if (Math.abs(v.speed) < 0.2) v.speed = 0; }
  v.speed = Math.max(-v.maxSpeed * 0.4, Math.min(v.maxSpeed * v.mobility, v.speed));
  if (airborne) v.yaw -= steer * v.turnRate * dt;
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const nx = v.obj.position.x + fx * v.speed * dt;
  const nz = v.obj.position.z + fz * v.speed * dt;
  if (nx > -WORLD && nx < WORLD && nz > -WORLD && nz < WORLD) {
    v.obj.position.x = nx;
    v.obj.position.z = nz;
  } else v.speed *= 0.5;
  // 地形 + 高度
  const gy = Math.max(terrainH(v.obj.position.x, v.obj.position.z), WATER_Y);
  v.obj.position.y = gy + v.alt;
  // 障害物との衝突 (胴体)
  if (v.alt > 0.5 && heightBlocked(v.obj.position.clone().setY(v.obj.position.y + 1))) {
    damageVehicle(v, 40 + Math.abs(v.speed) * 2, 'crash');
    spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1), 0xff8830, 6, 4);
    v.speed *= -0.3;
    v.vy = 3;
  }
  // 姿勢: 前傾/バンク
  v.obj.rotation.order = 'YXZ';
  v.obj.rotation.y = v.yaw;
  v.obj.rotation.x = THREE.MathUtils.lerp(v.obj.rotation.x, v.speed * 0.016, dt * 4);
  v.obj.rotation.z = THREE.MathUtils.lerp(v.obj.rotation.z, -steer * 0.25, dt * 4);
  // ローター回転
  v.rotor.rotation.y += dt * (autorotationV054 ? (10 + Math.min(30, 14 + v.alt * 2)) : 4);
  v.tailRotor.rotation.x += dt * (autorotationV054 ? 40 : 9);
  v.rocketCd = Math.max(0, v.rocketCd - dt);
  updateEngine(v.speed + v.alt * 0.4);

  // カメラ (v0.3.1: 見やすさ改善)
  //  ・ピッチ可動域を広げて地上の目標を見下ろせるように
  //  ・注視点を照準方向の先に置き、機体で中央の視界が隔れないようにする
  // v0.3.3: ピッチ反転修正 — 上を向くとカメラが下がり視線が上を向く
  const cp = Math.max(-1.25, Math.min(1.15, player.pitch));
  const cd = v.camDist;
  const cx = v.obj.position.x + Math.sin(player.yaw) * cd * Math.cos(cp);
  const cz = v.obj.position.z + Math.cos(player.yaw) * cd * Math.cos(cp);
  const cy = v.obj.position.y + 2.4 - cd * Math.sin(cp);
  camera.position.set(cx, Math.max(terrainH(cx, cz) + 0.6, cy), cz);
  {
    // 機体→カメラ方向の延長線上 (機体の14m先) を注視 → 機体は画面下寄りに
    const aimY = v.obj.position.y + 1.2 + cd * Math.sin(cp) * 0.6;
    const ldx = v.obj.position.x - camera.position.x;
    const ldy = aimY - camera.position.y;
    const ldz = v.obj.position.z - camera.position.z;
    const ll = Math.hypot(ldx, ldy, ldz) || 1;
    camera.lookAt(
      v.obj.position.x + ldx / ll * 14,
      aimY + ldy / ll * 14,
      v.obj.position.z + ldz / ll * 14
    );
  }
  if (shake > 0.01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
  }
  player.pos.set(v.obj.position.x, v.obj.position.y + player.eyeHeight, v.obj.position.z);

  // 機首機銃 (パイロット)
  v.cd -= dt;
  if (firing && v.cd <= 0 && role === 'driver') {
    v.cd = v.fireInterval;
    sfx.mg();
    const muzzleWorld = new THREE.Vector3();
    v.muzzle.getWorldPosition(muzzleWorld);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const aimPoint = camera.position.clone().addScaledVector(camDir, 200);
    const dir = aimPoint.sub(muzzleWorld).normalize();
    fireMG(v, muzzleWorld, dir, v.dmg, v.gunRange);
  }
  updateVehicleUI();
}

/* =========================================================
   v0.3: 全車両の毎フレーム更新 (炎上 / AI砲手 / 自動対空砲)
   ========================================================= */
function updateVehiclesGlobal(dt) {
  for (const v of vehicles) {
    if (!v.alive) {
      if (v.falling) updateFallingHeli(v, dt);   // v0.3.1: 撃墤ヘリの墤落
      continue;
    }
    // v0.5.4: エンジン損傷に応じた灰煙→黒煙→発火
    if (typeof updateVehicleDamageV054 === 'function') {
      updateVehicleDamageV054(v, dt);
      if (!v.alive) continue;
    } else if (v.burning) {
      v.hp -= 4 * dt;
      if (v.hp <= 0) { destroyVehicle(v); continue; }
    }
    // ボートの浮遊。エンジン破損後は無人/AI操縦でも慣性で漂流
    if (v.type === 'boat' && v !== curVehicle) {
      if (typeof updateBoatDriftV054 === 'function' && !boatCanPropelV054(v)) updateBoatDriftV054(v, dt);
      v.bobT += dt * 2;
      v.obj.position.y = WATER_Y + 0.15 + Math.sin(v.bobT) * 0.06;
    }
    // 味方AI砲手: 搭乗中の砲座から射撃
    for (let i = 0; i < v.seats.length; i++) {
      const occ = v.seats[i].occ;
      if (!occ || occ === 'player' || v.seats[i].role !== 'gunner') continue;
      updateAIGunner(v, occ, dt);
    }
    // 赤軍の自動対空砲: プレイヤーのヘリ / ドローンを迎撃
    if (v.type === 'aa' && v.team === -1 && !v.seats[0].occ) {
      updateAutoAA(v, dt);
    }
  }
}
/* ---------- v0.3.1: 撃墤されたヘリの墤落演出 ---------- */
function updateFallingHeli(v, dt) {
  v.fallVy -= 16 * dt;
  v.alt = Math.max(0, v.alt + v.fallVy * dt);
  // 慛性で流されながら落ちる
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  v.obj.position.x = Math.max(-WORLD, Math.min(WORLD, v.obj.position.x + fx * v.speed * dt));
  v.obj.position.z = Math.max(-WORLD, Math.min(WORLD, v.obj.position.z + fz * v.speed * dt));
  v.speed *= Math.pow(0.55, dt);
  const gy = Math.max(terrainH(v.obj.position.x, v.obj.position.z), WATER_Y);
  v.obj.position.y = gy + v.alt;
  // きりもみ回転 + 傾斜
  v.obj.rotation.y += v.fallSpin * dt;
  v.yaw = v.obj.rotation.y;
  v.obj.rotation.z = Math.min(0.55, v.obj.rotation.z + dt * 0.6);
  if (v.rotor) v.rotor.rotation.y += dt * 5;
  // 黒煙トレイル
  v.smokeT -= dt;
  if (v.smokeT <= 0) {
    v.smokeT = 0.07;
    const p = v.obj.position.clone(); p.y += 2;
    spawnParticles(p, 0x222222, 2, 1.6, 2.2);
    if (Math.random() < 0.5) spawnParticles(p, 0xff7722, 1, 2, 0.9);
  }
  // 接地 → 大爆発
  if (v.alt <= 0) {
    v.falling = false;
    explodeAt(v.obj.position.clone().setY(gy + 1), 8, 100, v);
    v.obj.rotation.z = 0.35;
    v.obj.rotation.x = 0.12;
  }
}

function updateAIGunner(v, s, dt) {
  s.gunCd = (s.gunCd || 0) - dt;
  if (s.gunCd > 0) return;
  s.gunCd = v.type === 'tank' ? 3.0 : 0.5 + Math.random() * 0.4;
  // v0.5.3: 搭乗AIの陣営に応じて最寄りの敵兵/プレイヤーを探す
  const muzzleWorld = new THREE.Vector3();
  v.muzzle.getWorldPosition(muzzleWorld);
  let best = null, targetPlayer = false, bd = v.type === 'tank' ? 75 : 60;
  if (s.team === -1 && player.alive && !curVehicle) {
    const d = player.pos.distanceTo(v.obj.position);
    if (d < bd) { bd = d; targetPlayer = true; }
  }
  for (const o of soldiers) {
    if (!o.alive || o.team === s.team || o.inVehicle) continue;
    const d = o.obj.position.distanceTo(v.obj.position);
    if (d < bd) { bd = d; best = o; targetPlayer = false; }
  }
  if (!best && !targetPlayer) return;
  const tPos = targetPlayer ? player.pos.clone() : best.obj.position.clone().setY(best.obj.position.y + 1.2);
  if (!hasLineOfSight(muzzleWorld.clone(), tPos)) return;
  // 砲塔を向ける
  if (v.turret) {
    const aimYaw = Math.atan2(tPos.x - v.obj.position.x, tPos.z - v.obj.position.z) + Math.PI;
    v.turret.rotation.y = aimYaw - v.yaw;
  }
  if (v.type === 'tank') {
    sfx.cannon();
    const dir = tPos.clone().sub(muzzleWorld).normalize();
    fireShell(muzzleWorld, dir, v);
    spawnParticles(muzzleWorld, 0xffcc66, 6, 4);
  } else {
    sfx.distShoot(camera.position.distanceTo(muzzleWorld));
    const hit = Math.random() < Math.max(0.2, 0.6 - bd * 0.006);
    const target = tPos.clone();
    if (!hit) { target.x += (Math.random() - .5) * 3; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 3; }
    spawnTracer(muzzleWorld, target, s.team === 1 ? 0x8ecbff : 0xff8866);
    if (hit && targetPlayer) damagePlayer(14 + Math.random() * 14 | 0, muzzleWorld);
    else if (hit) damageSoldier(best, 14 + Math.random() * 14, target, s.team === 1, s);
  }
}
function updateAutoAA(v, dt) {
  v.aaCd -= dt;
  if (v.aaCd > 0) return;
  // ターゲット: プレイヤーのヘリ or ドローン
  let tPos = null, isDrone = false;
  if (curVehicle && curVehicle.type === 'heli' && curVehicle.alt > 3) {
    const d = curVehicle.obj.position.distanceTo(v.obj.position);
    if (d < 150) tPos = curVehicle.obj.position.clone().setY(curVehicle.obj.position.y + 1);
  }
  if (!tPos && drone.active) {
    const d = drone.pos.distanceTo(v.obj.position);
    if (d < 100) { tPos = drone.pos.clone(); isDrone = true; }
  }
  if (!tPos) { v.aaCd = 0.5; return; }
  v.aaCd = 0.22;
  const muzzleWorld = new THREE.Vector3();
  v.muzzle.getWorldPosition(muzzleWorld);
  if (!hasLineOfSight(muzzleWorld.clone(), tPos)) { v.aaCd = 0.6; return; }
  const aimYaw = Math.atan2(tPos.x - v.obj.position.x, tPos.z - v.obj.position.z) + Math.PI;
  v.turret.rotation.y = aimYaw - v.yaw;
  sfx.flakDist(camera.position.distanceTo(muzzleWorld));
  const hit = Math.random() < 0.4;
  const target = tPos.clone();
  if (!hit) { target.x += (Math.random() - .5) * 5; target.y += (Math.random() - .5) * 4; target.z += (Math.random() - .5) * 5; }
  spawnTracer(muzzleWorld, target, 0xffaa44);
  if (hit) {
    spawnParticles(target, 0xffaa44, 4, 3);
    if (isDrone) {
      drone.hp -= 15;
      if (drone.hp <= 0) endDrone(true);
    } else if (curVehicle && curVehicle.type === 'heli') {
      damageVehicle(curVehicle, 16 + Math.random() * 10, 'aa');
      showDamageDirection(v.obj.position);
    }
  }
}

function updateVehicleUI() {
  const v = curVehicle;
  if (!v) return;
  ui.vehicleFill.style.width = (v.hp / v.maxHp * 100) + '%';
  ui.vehicleFill.style.background = v.hp / v.maxHp > 0.35 ? 'linear-gradient(90deg,#3dc9dc,#a7e9f3)' : 'linear-gradient(90deg,#e0483d,#f3a7a0)';
  const spd = v.type === 'heli' ? Math.abs(Math.round(v.speed * 3.6)) + ' km/h  ALT ' + Math.round(v.alt) + 'm'
            : Math.abs(Math.round(v.speed * 3.6)) + ' km/h';
  ui.vehicleSpeed.textContent = spd;
  let st = '';
  if (v.damageStageV054 === 1) st += '軽微な発煙 ';
  else if (v.damageStageV054 === 2) st += '黒煙 ';
  else if (v.burning) st += '炎上 ';
  if (v.partHint) st += '⚠' + v.partHint + ' ';
  if (v.fuelMaxV055 > 0) {
    const fuelPct = Math.round(v.fuelV055 / v.fuelMaxV055 * 100);
    st += v.refuelingV055 ? '給油中 ' + fuelPct + '%' : v.fuelDryV055 ? '燃料切れ' : 'FUEL ' + fuelPct + '%';
  }
  ui.vehicleParts.textContent = st;
  if (v.type === 'heli' && v.seats[curSeat].role === 'driver') ui.ammoMag.textContent = '🚀' + v.rockets;
}
