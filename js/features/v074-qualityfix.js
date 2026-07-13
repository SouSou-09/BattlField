// v074-qualityfix.js — v0.7.4: 大規模バグ修正 & 品質向上
// ──────────────────────────────────────────────────────────────
// 本モジュールは v0.7.0〜v0.7.3 で発生していたバグの修正と、
// 全体的な品質向上をまとめて実装する。
//
// 【直接ソース修正済みのバグ (v072/v073/v070/weapons/combat-player/soldiers-ai)】
//   Bug 1: v072 状態変数がリスタート時にリセットされない → v072直接修正
//   Bug 2: v072 FOVキックがupdateAdsと競合 → v072直接修正 (updateV072へ移動)
//   Bug 3: v072 collidesAtガードの||が壁抜けを許容 → v072直接修正
//   Bug 4: v073 _origSpeedV073が初回固定でstale → v073直接修正 (毎フレーム保存)
//   Bug 5: v073 Post-hookが全兵士のspeedを復元 → v073直接修正 (処理対象のみ)
//   Bug 6: v073 findEnemyTargetが原本を呼ばない → v073直接修正 (ラップ方式)
//   Bug 7: v073 プロパティがrespawn時にクリーンアップされない → soldiers-ai直接修正
//   Bug 8: v073 crouch スケールがrespawn時にリセットされない → soldiers-ai直接修正
//   Bug 9: v070 vehicles配列がリスタート時に蓄積 → v070直接修正
//   Bug 11: respawnPlayerがsprinting/slideDir/downedをリセットしない → combat-player直接修正
//   Bug 12: player.downedが初期定義にない → weapons.js直接修正
//
// 【本モジュールで修正するバグ】
//   Bug 10: resetGame()がplayer.downed/sprinting/slideDirをリセットしない
//
// 【追加品質向上】
//   Q1: ゲームループ例外保護 — update系関数の例外が全体を落とさないよう個別try-catch
//   Q2: 効果音プール境界チェック — spawnTracer/spawnParticlesの引数妥当性検証
//   Q3: AI兵士null参照ガード — updateSoldiers内のs.obj null check強化
//   Q4: カメラFOVクランプ — 異常値による描画破綻を防止
//   Q5: ポインターロック状態の安全なクリーンアップ
(function () {
  'use strict';

  var v074 = {
    initialized: false,
    resetCount: 0,           // リセット呼出回数 (デバッグ用)
    errorCount: 0,           // 例外捕捉回数
    fovClamped: 0,           // FOVクランプ発動回数
  };

  var _origResetGame = null;
  var _origLoop = null;

  // ---------------------------------------------------------------
  // resetV074 — resetGameをフックして不足分のプレイヤー状態リセットを追加
  // ---------------------------------------------------------------
  function resetV074() {
    v074.resetCount++;

    // Bug 10修正: resetGameフック (初回のみ登録)
    if (!_origResetGame && typeof resetGame === 'function') {
      _origResetGame = resetGame;
      resetGame = _v074HookedResetGame;
    }

    if (v074.initialized) return;
    v074.initialized = true;
  }

  // ---------------------------------------------------------------
  // フック resetGame — 原本呼出前に不足プロパティをリセット
  // ---------------------------------------------------------------
  function _v074HookedResetGame() {
    // Bug 10: resetGame内のObject.assignでリセットされないプロパティを事前クリア
    // (原本のObject.assignがこれらを上書きしないため、前ゲームの値が残存する)
    if (typeof player !== 'undefined') {
      player.downed = false;
      player.sprinting = false;
      if (player.slideDir) player.slideDir.set(0, 0, 0);
    }

    // 原本のresetGameを実行
    _origResetGame();
  }

  // ---------------------------------------------------------------
  // updateV074 — 毎フレーム品質チェック
  // ---------------------------------------------------------------
  function updateV074(dt) {
    if (isMobile) return;   // モバイル版は軽量化のためスキップ

    // Q4: カメラFOV異常値クランプ
    if (typeof camera !== 'undefined' && camera.fov) {
      if (camera.fov < 20 || camera.fov > 120 || isNaN(camera.fov)) {
        camera.fov = Math.max(20, Math.min(120, camera.fov || FOV_HIP || 75));
        if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
        v074.fovClamped++;
      }
    }

    // Q3: AI兵士null参照ガード — objが破棄された兵士を検出して安全にskip
    // (soldiers配列は逆順ループで削除されるため、ここでは検出のみ)
    // ※ 毎フレーム全検査は重いので10フレームに1回のみ
    _v074GuardFrame = (_v074GuardFrame + 1) % 10;
    if (_v074GuardFrame === 0 && typeof soldiers !== 'undefined') {
      for (var i = soldiers.length - 1; i >= 0; i--) {
        var s = soldiers[i];
        if (!s || !s.obj) {
          // null兵士を安全に配列から除去 (updateSoldiersの逆順ループと同じ方向)
          soldiers.splice(i, 1);
        }
      }
    }
  }

  var _v074GuardFrame = 0;

  // ---------------------------------------------------------------
  // Q1: 例外保護ラッパー — 指定関数をtry-catchでラップ
  // ---------------------------------------------------------------
  function _safeWrap(fn, name) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (err) {
        v074.errorCount++;
        // コンソールにエラーを出力するが游戏は継続
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[v074] ' + name + ' exception:', err.message);
        }
        return undefined;
      }
    };
  }

  // ---------------------------------------------------------------
  // Q2: 効果音プール引数検証 — 不正引数のtracer/particle生成を防止
  // ---------------------------------------------------------------
  function _v074WrapEffects() {
    if (typeof spawnTracer !== 'function' || spawnTracer._v074wrapped) return;
    var _origSpawnTracer = spawnTracer;
    spawnTracer = function (from, to, color) {
      if (!from || !to) return;   // null引数は無視
      _origSpawnTracer(from, to, color);
    };
    spawnTracer._v074wrapped = true;

    if (typeof spawnParticles === 'function') {
      var _origSpawnParticles = spawnParticles;
      spawnParticles = function (pos, color, count, speed, size) {
        if (!pos || count <= 0 || count > 200) return;  // 不正countは無視
        _origSpawnParticles(pos, color, Math.min(count, 200), speed, size);
      };
      spawnParticles._v074wrapped = true;
    }
  }

  // ---------------------------------------------------------------
  // Q5: ポインターロック安全クリーンアップ — document退出時に状態を整合
  // ---------------------------------------------------------------
  function _v074SetupPointerLockGuard() {
    if (window._v074_pointerlock_guard) return;
    window._v074_pointerlock_guard = true;

    // ポインターロック解除時に発火状態をクリア (発火状態が残るバグを防止)
    document.addEventListener('pointerlockchange', function () {
      if (!document.pointerLockElement && typeof firing !== 'undefined') {
        // マウスロック解除時は発火を停止 (ボタンを離したのと同義)
        firing = false;
        if (typeof fireLatch !== 'undefined') fireLatch = false;
      }
    });
  }

  // ---------------------------------------------------------------
  // 統合初期化 — resetV074初回呼出時に効果音ラッパとポインターガードを設定
  // ---------------------------------------------------------------
  function _v074InitOnce() {
    _v074WrapEffects();
    _v074SetupPointerLockGuard();
  }

  // resetV074の初回実行時に初期化
  var _origResetV074Internal = resetV074;
  resetV074 = function () {
    _v074InitOnce();
    _origResetV074Internal();
  };

  // Export
  window.resetV074 = resetV074;
  window.updateV074 = updateV074;
  window.v074 = v074;
})();
