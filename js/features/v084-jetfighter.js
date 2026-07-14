'use strict';
/* =========================================================
   v0.8.4 — ジェット戦闘機 (最大の山場)
   ・物理挙動: スロットル/速度/高度/ピッチ/ロール/ヨー
   ・武装: 20mm機関砲(fireMG) + 空対地ミサイル(fireShell)
   ・HUD: 速度計/高度計/スロットル/ミサイル残弾/人工水平儀
   ・APRON_SLOTS_BLUE/REDに各2機スポーン
   ・フック方式: updateVehicle/nearestVehicle/seatWeaponName等
   ・破壊後90秒リスポーン
   ・Mobile対応: isMobile で装飾メッシュ削減
   ========================================================= */

var v084 = {
  initialized: false,
  jets: [],          // [{slot, team, vehicle, destroyed, respawnT}]
  horizonCreated: false
};

/* フック保存用 (IIFE外で宣言) */
var _origUpdateVehicleV084    = null;
var _origNearestVehicleV084   = null;
var _origSeatWeaponNameV084   = null;
var _origUpdateSeatUIV084     = null;
var _origEnterVehicleV084     = null;
var _origExitVehicleV084      = null;
var _origDestroyVehicleV084   = null;
var _origUpdateVehicleUIV084  = null;
var _origUpdateAutoAAV084     = null;
var _origHeliRocketsV084      = null;
var _origDamageVehicleV084    = null;

/* 人工水平儀DOM要素 */
var _horizonDiv  = null;
var _horizonRot  = null;
var _horizonTrans = null;

/* モバイル専用の左右分離フライト入力。通常歩兵のjoy/lookとは共有しない。 */
var _jetTouchV084 = { throttle: 0, roll: 0, pitch: 0, afterburner: false, brake: false };

(function () {

  /* =========================================================
     ジェット機体生成 (プリミティブジオメトリのみ)
     ========================================================= */
  function _createJetV084(x, z, rotY) {
    var g = new THREE.Group();

    // ジェット専用マテリアル (灰色の戦闘機)
    var matJet  = new THREE.MeshLambertMaterial({ color: 0x6b6e72 });
    var matJet2 = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });

    // 胴体
    var fus = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 9), matJet);
    fus.position.y = 1.2;
    g.add(fus);

    // 機首 (先細り)
    var nose = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 2.8), matJet2);
    nose.position.set(0, 1.15, -5.6);
    g.add(nose);

    // ピトー管
    var pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), matVDark);
    pitot.rotation.x = Math.PI / 2;
    pitot.position.set(0, 1.25, -7.2);
    g.add(pitot);

    // キャノピー (グラス)
    var canopy = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 1.8), matVGlass);
    canopy.position.set(0, 1.72, -2.8);
    g.add(canopy);

    // キャノピーフレーム
    if (!isMobile) {
      var cFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.9), matJet2);
      cFrame.position.set(0, 1.96, -2.8);
      g.add(cFrame);
    }

    // 主翼 (デルタ翼・後退角)
    var wingGeo = new THREE.BoxGeometry(4.5, 0.15, 3.6);
    var wingL = new THREE.Mesh(wingGeo, matJet);
    wingL.position.set(-2.7, 1.2, 0.6);
    wingL.rotation.y = 0.28;
    g.add(wingL);
    var wingR = new THREE.Mesh(wingGeo, matJet);
    wingR.position.set(2.7, 1.2, 0.6);
    wingR.rotation.y = -0.28;
    g.add(wingR);

    // 翼端ミサイル (非モバイルのみ)
    if (!isMobile) {
      var mslGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
      var mslL = new THREE.Mesh(mslGeo, matVDark);
      mslL.rotation.x = Math.PI / 2;
      mslL.position.set(-4.6, 1.2, 0.8);
      g.add(mslL);
      var mslR = mslL.clone();
      mslR.position.x = 4.6;
      g.add(mslR);
    }

    // パイロン (翼下ハードポイント)
    var pylGeo = new THREE.BoxGeometry(0.15, 0.15, 0.7);
    var pylL = new THREE.Mesh(pylGeo, matVDark);
    pylL.position.set(-2.3, 1.08, 0.6);
    g.add(pylL);
    var pylR = pylL.clone();
    pylR.position.x = 2.3;
    g.add(pylR);

    // 垂直尾翼
    var vTail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 1.1), matJet);
    vTail.position.set(0, 2.1, 3.8);
    g.add(vTail);

    // 水平尾翼
    var hStabGeo = new THREE.BoxGeometry(2.4, 0.12, 1.0);
    var hStabL = new THREE.Mesh(hStabGeo, matJet);
    hStabL.position.set(-1.3, 1.25, 3.8);
    g.add(hStabL);
    var hStabR = hStabL.clone();
    hStabR.position.x = 1.3;
    g.add(hStabR);

    // エンジン排気口
    var exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.7, 10), matVDark);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0, 1.2, 4.8);
    g.add(exhaust);

    // アフターバーナー炎 (非モバイル)
    var abMat = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.75 });
    var afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 3.0, 8), abMat);
    afterburner.rotation.x = -Math.PI / 2;
    afterburner.position.set(0, 1.2, 6.8);
    afterburner.visible = false;
    g.add(afterburner);

    // エアインテーク (非モバイル)
    if (!isMobile) {
      var intakeGeo = new THREE.BoxGeometry(0.35, 0.55, 1.5);
      var intakeL = new THREE.Mesh(intakeGeo, matJet2);
      intakeL.position.set(-0.85, 1.0, -1.5);
      g.add(intakeL);
      var intakeR = intakeL.clone();
      intakeR.position.x = 0.85;
      g.add(intakeR);
    }

    // 警告灯
    var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), matTailLight);
    beacon.position.set(0, 2.65, 4.2);
    g.add(beacon);

    // 尾輪カバー
    var tailCov = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), matJet2);
    tailCov.position.set(0, 0.7, 3.5);
    g.add(tailCov);

    // ランディングギア (車輪3個)
    var wGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 10);
    var wMat = matTire;
    var noseGear = new THREE.Mesh(wGeo, wMat);
    noseGear.rotation.z = Math.PI / 2;
    noseGear.position.set(0, 0.32, -3.2);
    g.add(noseGear);
    var gearL = new THREE.Mesh(wGeo, wMat);
    gearL.rotation.z = Math.PI / 2;
    gearL.position.set(-0.75, 0.32, 1.0);
    g.add(gearL);
    var gearR = new THREE.Mesh(wGeo, wMat);
    gearR.rotation.z = Math.PI / 2;
    gearR.position.set(0.75, 0.32, 1.0);
    g.add(gearR);

    // 機銃マズル
    var muzzle = new THREE.Object3D();
    muzzle.position.set(0.55, 1.15, -3.2);
    g.add(muzzle);

    // 影
    g.traverse(function (m) { if (m.isMesh) m.castShadow = !isMobile; });
    g.position.set(x, terrainH(x, z), z);
    g.rotation.order = 'YXZ';
    g.rotation.y = rotY;
    scene.add(g);

    var v = baseVehicleState({
      type: 'jet',
      name: 'F-4 ジェット戦闘機',
      obj: g,
      turret: null,
      muzzle: muzzle,
      wheels: [noseGear, gearL, gearR],
      glass: canopy,
      afterburnerMesh: afterburner,
      yaw: rotY,
      hp: 280,
      maxHp: 280,
      radius: 3.2,
      maxSpeed: 85,
      accel: 0,
      turnRate: 0.9,
      fireInterval: 0.07,
      camDist: 17,
      camH: 5,
      dmg: 22,
      gunRange: 450,
      alt: 0,
      throttle: 0,
      speed: 0,
      stallSpeed: 18,
      cannonAmmo: 300,
      cannonMaxAmmo: 300,
      missileCd: 0,
      missiles: 8,
      pitchRateV084: 0,
      rollRateV084: 0,
      verticalSpeedV084: 0,
      seats: [
        mkSeat('driver', 0, 1.65, -2.8),
        mkSeat('gunner', 0, 1.35, 0.2)
      ]
    });
    if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
    if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
    if (typeof initVehicleLogisticsV055 === 'function') initVehicleLogisticsV055(v);
    vehicles.push(v);
    return v;
  }

  /* =========================================================
     ジェット操縦物理
     ========================================================= */
  function _updateJetV084(dt, v, role) {
    /* --- 入力 --- */
    var throttleInput = 0, rollInput = 0, afterburner = false, brake = false;
    if (role === 'driver') {
      if (isMobile) {
        /* 専用スロットルは位置保持式。操縦桿は右へ倒すと右旋回。 */
        v.throttle = _jetTouchV084.throttle;
        rollInput = _jetTouchV084.roll;
        afterburner = _jetTouchV084.afterburner;
        brake = _jetTouchV084.brake;
      } else {
        if (keys['KeyW']) throttleInput += 1;
        if (keys['KeyS']) throttleInput -= 1;
        if (keys['KeyA']) rollInput -= 1;
        if (keys['KeyD']) rollInput += 1;
        if (keys['Space']) afterburner = true;
        if (keys['KeyC']) brake = true;
      }
    }

    var hasFuel = typeof vehicleHasFuelV055 !== 'function' || vehicleHasFuelV055(v);
    if (!hasFuel) { throttleInput = 0; afterburner = false; }
    var onGround = v.alt <= 0.2;

    /* --- スロットル & 速度 --- */
    v.throttle = Math.max(0, Math.min(1, v.throttle + throttleInput * 0.45 * dt));
    if (!hasFuel) v.throttle = Math.max(0, v.throttle - 0.2 * dt);
    var targetSpeed = v.throttle * v.maxSpeed;
    if (afterburner && hasFuel && v.throttle > 0.82) targetSpeed = v.maxSpeed * 1.5;
    /* 推力の立ち上がりと空気抵抗を分離し、急激な速度変化を抑える。 */
    var accelRate = targetSpeed > v.speed ? (afterburner ? 10 : 5.5) : 3.2;
    v.speed += Math.max(-accelRate * dt, Math.min(accelRate * dt, targetSpeed - v.speed));
    if (brake) v.speed = Math.max(0, v.speed - (onGround ? 28 : 8) * dt);

    /* --- 姿勢: YXZ --- */
    v.obj.rotation.order = 'YXZ';
    var authority = Math.max(0.18, Math.min(1, v.speed / 38));

    /* --- ロール (A/D) --- */
    if (onGround) {
      // 地上: ロール水平維持
      v.rollRateV084 = THREE.MathUtils.lerp(v.rollRateV084, 0, Math.min(1, dt * 6));
      v.obj.rotation.z = THREE.MathUtils.lerp(v.obj.rotation.z, 0, Math.min(1, dt * 4));
    } else {
      /* A/左入力は負ロール、D/右入力は正ロール。旧実装の左右反転を修正。 */
      var targetRoll = rollInput * 0.98;
      v.rollRateV084 = THREE.MathUtils.lerp(v.rollRateV084, (targetRoll - v.obj.rotation.z) * 2.4 * authority, Math.min(1, dt * 5));
      v.obj.rotation.z += v.rollRateV084 * dt;
      v.obj.rotation.z = Math.max(-1.08, Math.min(1.08, v.obj.rotation.z));
      if (Math.abs(rollInput) < 0.04) v.obj.rotation.z = THREE.MathUtils.lerp(v.obj.rotation.z, 0, Math.min(1, dt * 0.72));
    }

    /* --- ピッチ (マウスY / player.pitch) --- */
    if (role === 'driver') {
      // Three.js YXZではrotation.x負が機首上げ。
      var maxPitch = onGround ? 0.12 : 0.72;
      var targetPitch = isMobile
        ? _jetTouchV084.pitch * maxPitch
        : Math.max(-maxPitch, Math.min(maxPitch, -player.pitch * 0.55));
      var pitchAuthority = onGround ? 0.35 : authority;
      v.pitchRateV084 = THREE.MathUtils.lerp(v.pitchRateV084, (targetPitch - v.obj.rotation.x) * 2.1 * pitchAuthority, Math.min(1, dt * 4));
      v.obj.rotation.x += v.pitchRateV084 * dt;
      v.obj.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, v.obj.rotation.x));
    }

    /* --- ヨー (ロールによる協調旋回) --- */
    if (onGround) {
      // 地上: ラダー操舵
      v.obj.rotation.y -= rollInput * 0.6 * dt * Math.min(1, v.speed / 20);
    } else {
      // 空中: バンク旋回
      var turnFactor = Math.sin(v.obj.rotation.z) * v.turnRate * authority;
      v.obj.rotation.y -= turnFactor * dt;
    }
    v.yaw = v.obj.rotation.y;

    /* --- 失速 --- */
    if (v.speed < v.stallSpeed && v.alt > 0.5) {
      // 機首下げ + 降下
      v.obj.rotation.x = THREE.MathUtils.lerp(v.obj.rotation.x, 0.35, dt * 2);
    }
    if (onGround) {
      // 地上: ピッチ水平
      v.obj.rotation.x = THREE.MathUtils.lerp(v.obj.rotation.x, 0, dt * 3);
    }

    /* --- 移動 (3D前方ベクトル) --- */
    var fwd = new THREE.Vector3(0, 0, -1);
    fwd.applyEuler(v.obj.rotation);
    var nx = v.obj.position.x + fwd.x * v.speed * dt;
    var nz = v.obj.position.z + fwd.z * v.speed * dt;
    var ny = v.obj.position.y + fwd.y * v.speed * dt;

    // ワールド境界
    if (nx > -WORLD && nx < WORLD && nz > -WORLD && nz < WORLD) {
      v.obj.position.x = nx;
      v.obj.position.z = nz;
    } else {
      v.speed *= 0.5;
      v.obj.rotation.y += Math.PI * dt;  // 反転
    }

    // 地面衝突
    var gy = Math.max(terrainH(v.obj.position.x, v.obj.position.z), WATER_Y);
    var minAlt = 1.4;  // ギア高

    /* 揚力不足・バンク角による高度損失。速度があれば操舵に沿って滑らかに上昇する。 */
    var liftRatio = Math.min(1.15, v.speed / Math.max(1, v.stallSpeed));
    var bankLift = Math.max(0.35, Math.cos(v.obj.rotation.z));
    var sinkRate = (1 - Math.min(1, liftRatio * bankLift)) * 13;
    v.verticalSpeedV084 = THREE.MathUtils.lerp(v.verticalSpeedV084, -sinkRate, Math.min(1, dt * 1.6));
    ny += v.verticalSpeedV084 * dt;
    if (v.speed < v.stallSpeed && ny > gy + minAlt + 0.5) {
      ny = Math.min(ny, v.obj.position.y - (v.stallSpeed - v.speed) * 0.46 * dt);
    }

    if (ny < gy + minAlt) {
      ny = gy + minAlt;
      // ハードランディング / クラッシュ
      if (v.speed > 20 && v.obj.rotation.x < -0.15) {
        damageVehicle(v, 25 + v.speed * 2.5, 'crash');
        spawnParticles(v.obj.position.clone(), 0xff8830, 6, 4);
        v.speed *= 0.3;
      }
      // 地上: 摩擦
      if (v.speed > 0 && !afterburner) v.speed *= Math.pow(0.75, dt);
    }
    v.obj.position.y = ny;
    v.alt = Math.max(0, v.obj.position.y - gy);

    // 障害物衝突 (建物等)
    if (v.alt > 0.5 && heightBlocked(v.obj.position.clone().setY(v.obj.position.y + 1))) {
      damageVehicle(v, 50 + v.speed * 3, 'crash');
      spawnParticles(v.obj.position.clone().setY(v.obj.position.y + 1), 0xff8830, 8, 5);
      v.speed *= -0.15;
      v.obj.position.y += 2;
    }

    /* --- アフターバーナー演出 --- */
    if (v.afterburnerMesh) {
      v.afterburnerMesh.visible = afterburner && v.speed > 12 && !isMobile;
      if (v.afterburnerMesh.visible) {
        v.afterburnerMesh.scale.z = 0.8 + Math.random() * 0.5;
        v.afterburnerMesh.scale.x = 0.9 + Math.random() * 0.2;
      }
    }

    /* --- エンジン音 --- */
    updateEngine(v.speed * 0.4 + (afterburner ? 25 : 0));

    /* --- カメラ (チェイスカメラ) --- */
    var cd = v.camDist;
    var cp = Math.max(-0.35, Math.min(0.35, player.pitch));
    var bx = v.obj.position.x + Math.sin(v.yaw) * cd;
    var bz = v.obj.position.z + Math.cos(v.yaw) * cd;
    var by = v.obj.position.y + v.camH - cp * cd * 0.25;
    camera.position.set(bx, Math.max(terrainH(bx, bz) + 1.5, by), bz);
    camera.lookAt(
      v.obj.position.x - Math.sin(v.yaw) * 8,
      v.obj.position.y - cp * 3,
      v.obj.position.z - Math.cos(v.yaw) * 8
    );
    if (shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    player.pos.set(v.obj.position.x, v.obj.position.y + player.eyeHeight, v.obj.position.z);

    /* --- 武器: 20mm機銃 --- */
    v.cd -= dt;
    v.missileCd -= dt;

    if (firing && v.cd <= 0 && role === 'driver' && v.cannonAmmo > 0) {
      v.cd = v.fireInterval;
      v.cannonAmmo--;
      sfx.mg();
      var muzzleWorld = new THREE.Vector3();
      v.muzzle.getWorldPosition(muzzleWorld);
      var camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      var aimPt = camera.position.clone().addScaledVector(camDir, 450);
      var dir = aimPt.sub(muzzleWorld).normalize();
      fireMG(v, muzzleWorld, dir, v.dmg, v.gunRange);
      spawnParticles(muzzleWorld, 0xffcc66, 2, 3, 0.4);
    }

    // 機銃弾薬ゆっくり回復
    if (v.cannonAmmo < v.cannonMaxAmmo) {
      v.cannonAmmo = Math.min(v.cannonMaxAmmo, v.cannonAmmo + dt * 8);
    }

    /* --- 人工水平儀 / フライトHUD更新 --- */
    _updateHorizonDisplayV084(v);
    _updateFlightHudV084(v);

    updateVehicleUI();
  }

  /* =========================================================
     ジェットスポーン (APRON_SLOTS使用)
     ========================================================= */
  function _spawnJetsV084() {
    v084.jets = [];
    if (typeof APRON_SLOTS_BLUE === 'undefined' || typeof APRON_SLOTS_RED === 'undefined') return;

    var i, slot, jet;
    // 青軍ジェット
    for (i = 0; i < APRON_SLOTS_BLUE.length; i++) {
      slot = APRON_SLOTS_BLUE[i];
      jet = _createJetV084(slot.x, slot.z, slot.rotY);
      jet.team = 1;
      v084.jets.push({ slot: slot, team: 1, vehicle: jet, destroyed: false, respawnT: 0 });
    }
    // 赤軍ジェット
    for (i = 0; i < APRON_SLOTS_RED.length; i++) {
      slot = APRON_SLOTS_RED[i];
      jet = _createJetV084(slot.x, slot.z, slot.rotY);
      jet.team = -1;
      v084.jets.push({ slot: slot, team: -1, vehicle: jet, destroyed: false, respawnT: 0 });
    }
  }

  /* =========================================================
     リスポーン — 破壊後90秒で元スロットに再生成
     ========================================================= */
  function _updateRespawnV084(dt) {
    for (var i = 0; i < v084.jets.length; i++) {
      var j = v084.jets[i];
      if (!j.vehicle) continue;
      if (j.vehicle.alive) {
        j.destroyed = false;
        j.respawnT = 0;
        continue;
      }
      // 墜落演出中はカウントしない
      if (j.vehicle.falling) continue;
      if (!j.destroyed) {
        j.destroyed = true;
        j.respawnT = 0;
      }
      j.respawnT += dt;
      if (j.respawnT >= 90) {
        // 残骸除去
        if (typeof unregisterVehiclePartsV048 === 'function') unregisterVehiclePartsV048(j.vehicle);
        if (typeof unregisterVehicleDamageV054 === 'function') unregisterVehicleDamageV054(j.vehicle);
        scene.remove(j.vehicle.obj);
        var idx = vehicles.indexOf(j.vehicle);
        if (idx >= 0) vehicles.splice(idx, 1);
        // 再スポーン
        var nj = _createJetV084(j.slot.x, j.slot.z, j.slot.rotY);
        nj.team = j.team;
        j.vehicle = nj;
        j.destroyed = false;
        j.respawnT = 0;
        if (typeof addFeed === 'function') addFeed('ジェット戦闘機リスポーン', 'blue');
      }
    }
  }

  /* =========================================================
     人工水平儀HUD
     ========================================================= */
  function _createHorizonV084() {
    if (v084.horizonCreated) return;
    _horizonDiv = document.createElement('div');
    _horizonDiv.id = 'jet-horizon';
    _horizonDiv.style.cssText =
      'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
      'width:90px;height:90px;border-radius:50%;' +
      'border:2px solid rgba(180,220,255,0.7);overflow:hidden;' +
      'pointer-events:none;display:none;z-index:40;' +
      'box-shadow:0 0 8px rgba(0,0,0,0.4);';

    // 回転レイヤー (ロール)
    _horizonRot = document.createElement('div');
    _horizonRot.style.cssText =
      'position:absolute;width:100%;height:100%;' +
      'overflow:hidden;border-radius:50%;';

    // 平行移動レイヤー (ピッチ)
    _horizonTrans = document.createElement('div');
    _horizonTrans.style.cssText =
      'position:absolute;width:300%;height:300%;left:-100%;top:-100%;';

    // 空
    var sky = document.createElement('div');
    sky.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:50%;' +
      'background:linear-gradient(180deg,#2a6ab8,#5a9be0);';
    _horizonTrans.appendChild(sky);

    // 地面
    var gnd = document.createElement('div');
    gnd.style.cssText =
      'position:absolute;top:50%;left:0;width:100%;height:50%;' +
      'background:linear-gradient(180deg,#8b6f47,#5a4525);';
    _horizonTrans.appendChild(gnd);

    // 水平線
    var hLine = document.createElement('div');
    hLine.style.cssText =
      'position:absolute;top:50%;left:0;width:100%;height:2px;' +
      'background:rgba(255,255,255,0.9);transform:translateY(-1px);';
    _horizonTrans.appendChild(hLine);

    _horizonRot.appendChild(_horizonTrans);
    _horizonDiv.appendChild(_horizonRot);

    // 固定機体基準 (黄色十字)
    var refH = document.createElement('div');
    refH.style.cssText =
      'position:absolute;top:50%;left:50%;width:28px;height:2px;' +
      'background:#ffdd44;transform:translate(-50%,-50%);' +
      'box-shadow:0 0 4px rgba(0,0,0,0.5);';
    _horizonDiv.appendChild(refH);

    var refV = document.createElement('div');
    refV.style.cssText =
      'position:absolute;top:50%;left:50%;width:2px;height:14px;' +
      'background:#ffdd44;transform:translate(-50%,-50%);' +
      'box-shadow:0 0 4px rgba(0,0,0,0.5);';
    _horizonDiv.appendChild(refV);

    document.body.appendChild(_horizonDiv);
    v084.horizonCreated = true;
  }

  function _showHorizonV084() {
    if (_horizonDiv) _horizonDiv.style.display = 'block';
    document.body.classList.add('jet-active');
    if (isMobile) document.body.classList.add('jet-mobile');
  }
  function _hideHorizonV084() {
    if (_horizonDiv) _horizonDiv.style.display = 'none';
    document.body.classList.remove('jet-active', 'jet-mobile');
    _jetTouchV084.roll = _jetTouchV084.pitch = 0;
    _jetTouchV084.afterburner = _jetTouchV084.brake = false;
  }

  function _updateFlightHudV084(v) {
    var speedEl = document.getElementById('jet-hud-speed');
    var altEl = document.getElementById('jet-hud-alt');
    var warningEl = document.getElementById('jet-hud-warning');
    if (speedEl) speedEl.textContent = String(Math.max(0, Math.round(v.speed * 3.6))).padStart(3, '0');
    if (altEl) altEl.textContent = String(Math.max(0, Math.round(v.alt))).padStart(3, '0');
    if (warningEl) warningEl.textContent = v.speed < v.stallSpeed && v.alt > 2 ? 'STALL' : v.alt < 12 && v.speed > 45 ? 'PULL UP' : '';
    var fill = document.getElementById('jet-throttle-fill');
    var handle = document.getElementById('jet-throttle-handle');
    var value = document.getElementById('jet-throttle-value');
    if (fill) fill.style.height = Math.round(v.throttle * 100) + '%';
    if (handle) handle.style.bottom = Math.round(v.throttle * 100) + '%';
    if (value) value.textContent = Math.round(v.throttle * 100) + '%';
  }

  function _updateHorizonDisplayV084(v) {
    if (!_horizonRot || !_horizonTrans) return;
    var pitch = v.obj.rotation.x;   // 正=機首下, 負=機首上
    var roll  = v.obj.rotation.z;   // 正=左バンク, 負=右バンク
    // ロール: 水平線を逆方向に回転
    var rollDeg = roll * 180 / Math.PI;
    _horizonRot.style.transform = 'rotate(' + rollDeg + 'deg)';
    // ピッチ: 機首上(負) → 水平線下移動(正)
    var pitchPx = -pitch * 90;
    _horizonTrans.style.transform = 'translateY(' + pitchPx + 'px)';
  }

  function _bindJetTouchControlsV084() {
    if (!isMobile) return;
    var throttle = document.getElementById('jet-throttle');
    var stick = document.getElementById('jet-stick');
    var knob = document.getElementById('jet-stick-knob');
    function stop(e) { e.preventDefault(); e.stopPropagation(); }
    function throttleAt(t) {
      var r = throttle.getBoundingClientRect();
      _jetTouchV084.throttle = Math.max(0, Math.min(1, (r.bottom - t.clientY) / r.height));
    }
    throttle.addEventListener('touchstart', function (e) { stop(e); throttleAt(e.changedTouches[0]); }, { passive: false });
    throttle.addEventListener('touchmove', function (e) { stop(e); throttleAt(e.changedTouches[0]); }, { passive: false });
    function stickAt(t) {
      var r = stick.getBoundingClientRect();
      var x = (t.clientX - (r.left + r.width / 2)) / (r.width * 0.36);
      var y = (t.clientY - (r.top + r.height / 2)) / (r.height * 0.36);
      var len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      _jetTouchV084.roll = x;
      _jetTouchV084.pitch = y; // 上へ倒すと負値=機首上げ
      knob.style.transform = 'translate(calc(-50% + ' + (x * 42) + 'px),calc(-50% + ' + (y * 42) + 'px))';
    }
    function releaseStick(e) {
      stop(e); _jetTouchV084.roll = _jetTouchV084.pitch = 0;
      knob.style.transform = 'translate(-50%,-50%)';
    }
    stick.addEventListener('touchstart', function (e) { stop(e); stickAt(e.changedTouches[0]); }, { passive: false });
    stick.addEventListener('touchmove', function (e) { stop(e); stickAt(e.changedTouches[0]); }, { passive: false });
    stick.addEventListener('touchend', releaseStick, { passive: false });
    stick.addEventListener('touchcancel', releaseStick, { passive: false });
    function hold(id, key) {
      var el = document.getElementById(id);
      el.addEventListener('touchstart', function (e) { stop(e); _jetTouchV084[key] = true; el.classList.add('held'); }, { passive: false });
      var up = function (e) { stop(e); _jetTouchV084[key] = false; el.classList.remove('held'); };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    hold('jet-btn-ab', 'afterburner');
    hold('jet-btn-brake', 'brake');
    var gun = document.getElementById('jet-btn-fire');
    gun.addEventListener('touchstart', function (e) { stop(e); firing = true; gun.classList.add('held'); }, { passive: false });
    var gunUp = function (e) { stop(e); firing = false; fireLatch = false; gun.classList.remove('held'); };
    gun.addEventListener('touchend', gunUp, { passive: false }); gun.addEventListener('touchcancel', gunUp, { passive: false });
    document.getElementById('jet-btn-missile').addEventListener('touchstart', function (e) { stop(e); heliRockets(); }, { passive: false });
    document.getElementById('jet-btn-exit').addEventListener('touchstart', function (e) { stop(e); toggleVehicle(); }, { passive: false });
  }

  _bindJetTouchControlsV084();

  /* =========================================================
     フック設定 (ロード時)
     ========================================================= */

  /* --- updateVehicle: 'jet'タイプをディスパッチ --- */
  if (typeof updateVehicle === 'function' && !_origUpdateVehicleV084) {
    _origUpdateVehicleV084 = updateVehicle;
    updateVehicle = function (dt) {
      var v = curVehicle;
      if (v && v.type === 'jet') {
        _updateJetV084(dt, v, v.seats[curSeat].role);
        return;
      }
      _origUpdateVehicleV084.apply(this, arguments);
    };
  }

  /* --- nearestVehicle: 空中のジェットには乗れない --- */
  if (typeof nearestVehicle === 'function' && !_origNearestVehicleV084) {
    _origNearestVehicleV084 = nearestVehicle;
    nearestVehicle = function () {
      var best = null, bd = 4.5;
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        if (!v.alive) continue;
        if (v.type === 'heli' && v.alt > 2.5) continue;
        if (v.type === 'jet' && v.alt > 5) continue;   // v0.8.4
        var d = Math.hypot(v.obj.position.x - player.pos.x, v.obj.position.z - player.pos.z);
        if (d < bd + v.radius) { bd = d; best = v; }
      }
      return best;
    };
  }

  /* --- seatWeaponName: ジェットの武器名 --- */
  if (typeof seatWeaponName === 'function' && !_origSeatWeaponNameV084) {
    _origSeatWeaponNameV084 = seatWeaponName;
    seatWeaponName = function (v, role) {
      if (v.type === 'jet') {
        if (role === 'driver') return '20mm機関砲+空対地ミサイル';
        return '20mm機関砲';
      }
      return _origSeatWeaponNameV084.apply(this, arguments);
    };
  }

  /* --- updateSeatUI: ジェットの座席UI --- */
  if (typeof updateSeatUI === 'function' && !_origUpdateSeatUIV084) {
    _origUpdateSeatUIV084 = updateSeatUI;
    updateSeatUI = function () {
      var v = curVehicle;
      if (v && v.type === 'jet') {
        var st = v.seats[curSeat];
        ui.vehicleName.textContent = v.name + ' [' + (st.role === 'driver' ? '操縦' : st.role === 'gunner' ? '砲手' : '同乗') + ']';
        ui.weaponName.textContent = seatWeaponName(v, st.role);
        if (st.role === 'driver') {
          ui.ammoMag.textContent = Math.round(v.cannonAmmo) + '発  ML' + v.missiles;
          ui.ammoMag.style.color = '#fff';
          ui.ammoReserve.textContent = '';
          ui.reloadHint.textContent = '';
        } else {
          ui.ammoMag.textContent = '\u221E';
          ui.ammoMag.style.color = '#fff';
          ui.ammoReserve.textContent = '';
          ui.reloadHint.textContent = '';
        }
        return;
      }
      _origUpdateSeatUIV084.apply(this, arguments);
    };
  }

  /* --- enterVehicle: ジェット搭乗で人工水平儀表示 --- */
  if (typeof enterVehicle === 'function' && !_origEnterVehicleV084) {
    _origEnterVehicleV084 = enterVehicle;
    enterVehicle = function (v) {
      _origEnterVehicleV084.apply(this, arguments);
      if (v.type === 'jet') _showHorizonV084();
    };
  }

  /* --- exitVehicle: ジェット空中脱出(パラシュート) + 水平儀非表示 --- */
  if (typeof exitVehicle === 'function' && !_origExitVehicleV084) {
    _origExitVehicleV084 = exitVehicle;
    exitVehicle = function (forced) {
      if (curVehicle && curVehicle.type === 'jet' && curVehicle.alt > 5) {
        // v0.8.4: ジェット空中脱出 — パラシュート落下
        var v = curVehicle;
        v.seats[curSeat].occ = null;
        var side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
        player.pos.set(
          v.obj.position.x + side.x * (v.radius + 1.5),
          v.obj.position.y + player.eyeHeight,
          v.obj.position.z + side.z * (v.radius + 1.5)
        );
        player.vel.set(0, 0, 0);
        player.onGround = false;
        if (typeof dismountAllAI === 'function') dismountAllAI(v, 0);
        curVehicle = null;
        curSeat = 0;
        if (typeof gunGroup !== 'undefined') gunGroup.visible = true;
        firing = false;
        if (typeof stopEngine === 'function') stopEngine();
        if (!forced && typeof sfx !== 'undefined') sfx.enter();
        if (typeof ui !== 'undefined') {
          ui.vehicleBox.style.display = 'none';
          ui.weaponName.textContent = typeof weaponDef === 'function' ? weaponDef().name : '';
        }
        if (typeof updateAmmoUI === 'function') updateAmmoUI();
        if (typeof addFeed === 'function') {
          addFeed('\uD83E\uDE82 ' + (isMobile ? 'JUMP\u30DC\u30BF\u30F3' : 'Space') + ' \u3067\u30D1\u30E9\u30B7\u30E5\u30FC\u30C8\u958B\u9589', 'blue');
        }
        _hideHorizonV084();
        return;
      }
      _origExitVehicleV084.apply(this, arguments);
      _hideHorizonV084();
    };
  }

  /* --- destroyVehicle: 空中撃墜で墜落演出 --- */
  if (typeof destroyVehicle === 'function' && !_origDestroyVehicleV084) {
    _origDestroyVehicleV084 = destroyVehicle;
    destroyVehicle = function (v) {
      var wasAirborne = v.type === 'jet' && v.alt > 5;
      var savedSpeed = v.speed;
      _origDestroyVehicleV084.apply(this, arguments);
      if (wasAirborne) {
        v.falling = true;
        v.fallVy = -2;
        v.fallSpin = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.5);
        v.smokeT = 0;
        v.speed = savedSpeed * 0.5;   // 慣性で前進しながら墜落
      }
    };
  }

  /* --- updateVehicleUI: ジェットHUD (速度/高度/スロットル/ミサイル) --- */
  if (typeof updateVehicleUI === 'function' && !_origUpdateVehicleUIV084) {
    _origUpdateVehicleUIV084 = updateVehicleUI;
    updateVehicleUI = function () {
      var v = curVehicle;
      if (v && v.type === 'jet') {
        ui.vehicleFill.style.width = (v.hp / v.maxHp * 100) + '%';
        ui.vehicleFill.style.background = v.hp / v.maxHp > 0.35
          ? 'linear-gradient(90deg,#3dc9dc,#a7e9f3)'
          : 'linear-gradient(90deg,#e0483d,#f3a7a0)';
        var spd = Math.abs(Math.round(v.speed * 3.6)) + ' km/h  ALT ' + Math.round(v.alt) + 'm';
        ui.vehicleSpeed.textContent = spd;
        var st = '';
        if (v.damageStageV054 === 1) st += '\u8efd\u5FAE\u306A\u767A\u7159 ';
        else if (v.damageStageV054 === 2) st += '\u9ED2\u7159 ';
        else if (v.burning) st += '\u708E\u4E0A ';
        if (v.partHint) st += '\u26A0' + v.partHint + ' ';
        st += 'THR ' + Math.round(v.throttle * 100) + '% ';
        if (v.speed < v.stallSpeed && v.alt > 1) st += '\u26A0\u5931\u901F ';
        if (v.fuelMaxV055 > 0) {
          var fp = Math.round(v.fuelV055 / v.fuelMaxV055 * 100);
          st += v.refuelingV055 ? '\u7D66\u6CB9\u4E2D ' + fp + '%' : v.fuelDryV055 ? '\u71C3\u6599\u5207\u308C' : 'FUEL ' + fp + '%';
        }
        ui.vehicleParts.textContent = st;
        if (v.seats[curSeat].role === 'driver') {
          ui.ammoMag.textContent = Math.round(v.cannonAmmo) + '発  ML' + v.missiles;
        }
        return;
      }
      _origUpdateVehicleUIV084.apply(this, arguments);
    };
  }

  /* --- updateAutoAA: ジェットも対空砲の標的 --- */
  if (typeof updateAutoAA === 'function' && !_origUpdateAutoAAV084) {
    _origUpdateAutoAAV084 = updateAutoAA;
    updateAutoAA = function (v, dt) {
      // v0.8.4: ジェット戦闘機も迎撃
      if (curVehicle && curVehicle.type === 'jet' && curVehicle.alt > 5) {
        var d = curVehicle.obj.position.distanceTo(v.obj.position);
        if (d < 180) {
          v.aaCd -= dt;
          if (v.aaCd > 0) return;
          var tPos = curVehicle.obj.position.clone().setY(curVehicle.obj.position.y + 1);
          v.aaCd = 0.22;
          var mw = new THREE.Vector3();
          v.muzzle.getWorldPosition(mw);
          if (typeof hasLineOfSight === 'function' && !hasLineOfSight(mw.clone(), tPos)) { v.aaCd = 0.6; return; }
          sfx.flakDist(camera.position.distanceTo(mw));
          /* 連射対空砲は追尾誤差を大きくし、回避中の即死を防ぐ。 */
          var evasivePenalty = Math.min(0.1, Math.abs(curVehicle.obj.rotation.z) * 0.1);
          var hit = Math.random() < Math.max(0.07, 0.2 - evasivePenalty);
          var tgt = tPos.clone();
          if (!hit) {
            tgt.x += (Math.random() - 0.5) * 11;
            tgt.y += (Math.random() - 0.5) * 8;
            tgt.z += (Math.random() - 0.5) * 11;
          }
          spawnTracer(mw, tgt, 0xffaa44);
          if (hit) {
            spawnParticles(tgt, 0xffaa44, 4, 3);
            damageVehicle(curVehicle, 14 + Math.random() * 10, 'aa');
            if (typeof showDamageDirection === 'function') showDamageDirection(v.obj.position);
          }
          return;
        }
      }
      _origUpdateAutoAAV084.apply(this, arguments);
    };
  }

  /* --- heliRockets: Qキーでジェットミサイル発射 --- */
  if (typeof heliRockets === 'function' && !_origHeliRocketsV084) {
    _origHeliRocketsV084 = heliRockets;
    heliRockets = function () {
      var v = curVehicle;
      if (v && v.type === 'jet' && v.seats[curSeat].role === 'driver') {
        if (v.missileCd > 0 || v.missiles <= 0) return;
        v.missileCd = 1.0;
        v.missiles--;
        sfx.rocket();
        var camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        // 左右パイロン交互発射
        var side = (v.missiles % 2 === 0) ? -2.3 : 2.3;
        var from = new THREE.Vector3(side, 1.08, 0.6).applyMatrix4(v.obj.matrixWorld);
        fireShell(from, camDir.clone().normalize(), v, 120, 7, 180);
        spawnParticles(from, 0xffcc66, 5, 4);
        if (typeof updateSeatUI === 'function') updateSeatUI();
        return;
      }
      _origHeliRocketsV084.apply(this, arguments);
    };
  }

  /* --- damageVehicle: ジェット軽装甲ダメージ補正 --- */
  if (typeof damageVehicle === 'function' && !_origDamageVehicleV084) {
    _origDamageVehicleV084 = damageVehicle;
    damageVehicle = function (v, dmg, cause, hitPos) {
      if (v.type === 'jet') {
        // v0.8.4: ジェットは軽装甲
        if (cause === 'smallarms') dmg *= 0.65;
        else if (cause === 'explosion') dmg *= 0.55;
        else dmg *= 0.8;
      }
      _origDamageVehicleV084.apply(this, arguments);
    };
  }

  /* =========================================================
     公開API
     ========================================================= */
  v084.reset = function () {
    // 人工水平儀DOM生成 (初回のみ)
    _createHorizonV084();
    _hideHorizonV084();
    // APRON_SLOTSはresetV082()で生成済み → ジェット配置
    v084.jets = [];
    _spawnJetsV084();
  };

  v084.update = function (dt) {
    _updateRespawnV084(dt);
  };

})();

/* ---------- 公開API (main.jsから呼ばれるスタンドアロン関数) ---------- */
function resetV084() { if (v084.reset) v084.reset(); }
function updateV084(dt) { if (v084.update) v084.update(dt); }
