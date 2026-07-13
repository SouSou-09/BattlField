// v072-locomotion.js — v0.7.2: プレイヤー移動のリアル化
// 移動慣性(加減速平滑化) / 拡張ヘッドボブ(水平揺れ) / カメラ精度向上
// (旋回リーン/加減速ボディリーン/着地衝撃ディップ) / スプリントFOVキック / 武器揺れ強化
(function () {
  'use strict';

  var v072 = {
    initialized: false,
    // 慣性スムージング
    smoothDX: 0, smoothDZ: 0,     // 平滑化済みの1フレーム移動量
    prevX: 0, prevZ: 0,           // updatePlayer前の位置
    // 着地衝撃
    landDip: 0, wasGround: true, prevVelY: 0,
    // 旋回リーン
    prevYaw: 0, turnLean: 0,
    // 加減速ボディリーン
    speedPrev: 0, accelLean: 0,
    // ヘッドボブ水平揺れ
    swayPhase: 0,
    // スプリントFOVキック
    fovKick: 0,
  };

  var _origUpdatePlayer = null;

  // ---------------------------------------------------------------
  // resetV072 — updatePlayer をフックして移動リアル化を適用
  // ---------------------------------------------------------------
  function resetV072() {
    if (v072.initialized) return;
    v072.initialized = true;
    if (isMobile) return;                          // モバイル版は軽量化のためスキップ
    if (typeof updatePlayer !== 'function') return;

    _origUpdatePlayer = updatePlayer;
    updatePlayer = _v072HookedUpdatePlayer;
  }

  // ---------------------------------------------------------------
  // フック本体 — Pre保存 → Original実行 → Post拡張
  // ---------------------------------------------------------------
  function _v072HookedUpdatePlayer(dt) {
    // Pre-hook: 元の状態を保存
    v072.prevX      = player.pos.x;
    v072.prevZ      = player.pos.z;
    v072.prevYaw    = player.yaw;
    v072.prevVelY   = player.vel.y;
    v072.wasGround  = player.onGround;

    // Original: 入力→速度→位置→物理→カメラ (変更なし)
    _origUpdatePlayer(dt);

    // Post-hook: リアル化拡張 (死亡時/ダウン時はスキップ)
    if (!player.alive || player.downed) return;
    _v072PostHook(dt);
  }

  // ---------------------------------------------------------------
  // Post-hook — 慣性/ボブ/カメラ/FOV/武器揺れ を再適用
  // ---------------------------------------------------------------
  function _v072PostHook(dt) {
    // ===== 1. 移動慣性 (加減速平滑化) =====
    // 原本が直接 player.pos に加算した移動量を取得
    var dx = player.pos.x - v072.prevX;
    var dz = player.pos.z - v072.prevZ;
    var rawSpeed = Math.hypot(dx, dz) / dt;
    var hasInput = rawSpeed > 0.3;

    // 加速は速く、減速は遅く (慣性感)
    var rate = hasInput ? 14 : (player.slideT > 0 ? 3 : player.chute ? 4 : 8);
    var k = Math.min(1, dt * rate);
    v072.smoothDX += (dx - v072.smoothDX) * k;
    v072.smoothDZ += (dz - v072.smoothDZ) * k;

    // 原本の位置移動を巻き戻し、平滑化済み移動量で再適用 (衝突判定あり)
    player.pos.x = v072.prevX;
    player.pos.z = v072.prevZ;
    var footY = player.pos.y - player.eyeHeight;
    var nx = v072.prevX + v072.smoothDX;
    if (typeof collidesAt !== 'function' || !collidesAt(nx, player.pos.z, player.radius, footY)) {
      player.pos.x = nx;
    } else { v072.smoothDX *= 0.2; }                // 衝突時は慣性を抑制
    var nz = v072.prevZ + v072.smoothDZ;
    if (typeof collidesAt !== 'function' || !collidesAt(player.pos.x, nz, player.radius, footY)) {
      player.pos.z = nz;
    } else { v072.smoothDZ *= 0.2; }

    var smoothSpeed = Math.hypot(v072.smoothDX, v072.smoothDZ) / dt;
    var swimming = typeof terrainH === 'function' && terrainH(player.pos.x, player.pos.z) < WATER_Y - 0.2;

    // ===== 2. 着地衝撃ディップ =====
    if (player.onGround && !v072.wasGround && v072.prevVelY < -6) {
      v072.landDip = Math.min(0.14, Math.abs(v072.prevVelY) * 0.007);
    }
    v072.landDip = Math.max(0, v072.landDip - dt * 0.18);   // ~0.8秒で減衰

    // ===== 3. カメラ位置 (player.pos から再構築) =====
    camera.position.copy(player.pos);

    // Lean offset (v046)
    if (typeof leanOffsetV046 === 'function') {
      var side = leanOffsetV046();
      camera.position.x += Math.cos(player.yaw) * side;
      camera.position.z -= Math.sin(player.yaw) * side;
    }

    // ===== 4. 拡張ヘッドボブ (垂直 + 水平揺れ) =====
    var bobActive = smoothSpeed > 0.3 && player.onGround && player.slideT <= 0;
    if (bobActive) {
      // 垂直ボブ (原本の bobT を流用)
      var vAmp = swimming ? 0.06 : player.stance === 2 ? 0.018 : 0.035;
      camera.position.y += Math.sin(bobT) * vAmp;

      // 水平揺れ (新規: 左右の体重移動, 垂直の半分の周波数)
      v072.swayPhase += dt * (player.sprinting ? 7 : player.stance === 2 ? 3.5 : 5);
      var hAmp = (player.sprinting ? 0.045 : 0.025) * (player.stance === 2 ? 0.4 : 1);
      var sway = Math.cos(v072.swayPhase) * hAmp;
      var perpAng = player.yaw + Math.PI / 2;
      camera.position.x += sway * Math.cos(perpAng);
      camera.position.z -= sway * Math.sin(perpAng);
    } else if (player.slideT > 0) {
      camera.position.y += Math.sin(bobT) * 0.015;   // スライド中は微細
    }

    // 着地ディップ
    camera.position.y -= v072.landDip;

    // ===== 5. カメラ回転 (旋回リーン + 加減速リーン + 着地ピッチ) =====
    // 旋回リーン — 急旋回時にカメラが少しロールする
    var yawDelta = player.yaw - v072.prevYaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    var targetTurn = Math.max(-0.08, Math.min(0.08, yawDelta * 1.5));
    v072.turnLean += (targetTurn - v072.turnLean) * Math.min(1, dt * 6);

    // 加減速ボディリーン — 加速時に前傾, 減速時に後傾
    var speedDelta = smoothSpeed - v072.speedPrev;
    v072.speedPrev = smoothSpeed;
    var targetAccel = Math.max(-0.035, Math.min(0.035, speedDelta * 0.004));
    v072.accelLean += (targetAccel - v072.accelLean) * Math.min(1, dt * 5);

    var leanRoll = typeof leanAngleV046 === 'function' ? leanAngleV046() : 0;
    var slideRoll = player.slideT > 0 ? Math.sin(player.slideT * 8) * 0.03 + 0.05 : 0;
    camera.rotation.set(
      player.pitch + v072.accelLean - v072.landDip * 0.6,   // pitch: 加速リーン + 着地ディップ
      player.yaw,
      slideRoll - leanRoll - v072.turnLean                   // roll: スライド + リーン + 旋回
    );

    // ===== 6. スプリントFOVキック =====
    var targetKick = (player.sprinting && ads.t < 0.1) ? 5 : 0;
    v072.fovKick += (targetKick - v072.fovKick) * Math.min(1, dt * 4);
    if (ads.t < 0.01 && !curVehicle) {
      camera.fov = FOV_HIP + v072.fovKick;
      camera.updateProjectionMatrix();
    }

    // ===== 7. シェイク再適用 (カメラ位置を再構築したため) =====
    if (shake > 0.01) {
      camera.position.x += (Math.random() - .5) * shake;
      camera.position.y += (Math.random() - .5) * shake;
    }

    // ===== 8. 武器揺れ強化 (水平スウェイ + ロール) =====
    if (typeof gunGroup !== 'undefined' && gunGroup) {
      if (bobActive) {
        var gunSway = Math.cos(v072.swayPhase) * 0.008 * (1 - ads.t * 0.7);
        gunGroup.position.x += gunSway;
        gunGroup.rotation.z = gunSway * 0.5;
      } else {
        gunGroup.rotation.z = 0;             // 静止時はリセット
      }
    }

    // ===== 9. パラシュートメッシュ追従 (player.pos が変化したため) =====
    if (player.chute && typeof chuteMesh !== 'undefined') {
      chuteMesh.position.set(player.pos.x, player.pos.y - 0.6, player.pos.z);
      chuteMesh.rotation.y = player.yaw;
      chuteMesh.rotation.z = -v072.smoothDX * 0.08;
    }
  }

  // ---------------------------------------------------------------
  // updateV072 — loop統合用 (拡張処理は全てフック内で完結)
  // ---------------------------------------------------------------
  function updateV072(dt) {
    // 全ての処理は updatePlayer フック内で実行される。
    // 将来の拡張用に残置 (足音判定やモーション状態管理など)。
  }

  // Export
  window.resetV072 = resetV072;
  window.updateV072 = updateV072;
  window.v072 = v072;
})();
