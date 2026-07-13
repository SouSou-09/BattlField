// v073-ailocomotion.js — v0.7.3: AI移動能力拡張 + 状況判断移動
// AIスプリント拡張 / AIしゃがみ(新規) / しゃがみ検知率低下 / カバー越え強化
// v0.7.2プレイヤー移動ロジックを参照し、AIに同等の移動オプションを付与
(function () {
  'use strict';

  var v073 = {
    initialized: false,
    crouchingCount: 0,
    sprintingCount: 0,
  };

  var _origUpdateSoldiers = null;
  var _origFindEnemyTarget = null;
  // v0.7.4: 処理対象兵士リスト — Post-hookで選択的に復元するためPre-hookで記録
  var _processedSoldiers = [];

  // ---------------------------------------------------------------
  // resetV073 — updateSoldiers と findEnemyTarget をフック
  // ---------------------------------------------------------------
  function resetV073() {
    if (v073.initialized) return;
    v073.initialized = true;
    if (isMobile) return;                          // モバイル版は軽量化のためスキップ
    if (typeof updateSoldiers !== 'function') return;

    _origUpdateSoldiers = updateSoldiers;
    updateSoldiers = _v073HookedUpdateSoldiers;

    if (typeof findEnemyTarget === 'function') {
      _origFindEnemyTarget = findEnemyTarget;
      findEnemyTarget = _v073FindEnemyTarget;
    }
  }

  // ---------------------------------------------------------------
  // フック本体 — Pre(姿勢/速度判定) → Original → Post(視覚/検知)
  // ---------------------------------------------------------------
  function _v073HookedUpdateSoldiers(dt) {
    _v073PreHook(dt);
    _origUpdateSoldiers(dt);
    _v073PostHook(dt);
  }

  // ---------------------------------------------------------------
  // Pre-hook — AIの姿勢(stand/crouch)とスプリントを決定し、
  // s.speed を一時的に変更して原本の速度計算に反映させる
  // ---------------------------------------------------------------
  function _v073PreHook(dt) {
    v073.crouchingCount = 0;
    v073.sprintingCount = 0;
    _processedSoldiers = [];                        // v0.7.4: 毎フレーム初期化

    for (var i = 0; i < soldiers.length; i++) {
      var s = soldiers[i];
      if (!s.alive || s.inVehicle) continue;

      // v0.7.4: 速度を毎フレーム保存 (他システムがspeed変更しても追従)
      // 元は初回のみ_origSpeedV073を保存 → staleになるバグを修正
      s._savedSpeedV073 = s.speed;
      if (s.stanceV073 === undefined) {
        s.stanceV073 = 0;          // 0=立位, 1=しゃがみ
        s.sprintV073 = false;
      }
      _processedSoldiers.push(s);                   // Post-hook用に記録

      var sp = s.obj.position;
      var tgt = (typeof targetAlive === 'function' && targetAlive(s.engageTarget)) ? s.engageTarget : null;
      var tPos = tgt ? targetPosOf(tgt) : null;
      var tDist = tPos ? Math.hypot(tPos.x - sp.x, tPos.z - sp.z) : Infinity;

      // ===== 姿勢判定 — いつしゃがむか =====
      var shouldCrouch = false;

      // 1. 狙撃兵が固定位置に籠もる → しゃがみ (安定性)
      if (s.aiSniperV051 && s.sniperHoldingV051) shouldCrouch = true;

      // 2. 長距離交戦(35-80m) → しゃがみ (精度向上・被弾率低下)
      if (tgt && s.hasLos && tDist > 35 && tDist < 80) shouldCrouch = true;

      // 3. 拠点防衛(旗圈内・敵未視認) → しゃがみ (待ち伏せ)
      if (s.targetFlag) {
        var fd = Math.hypot(s.targetFlag.x - sp.x, s.targetFlag.z - sp.z);
        if (fd < (typeof FLAG_R !== 'undefined' ? FLAG_R : 18) * 0.7 && (!tgt || !s.hasLos)) {
          shouldCrouch = true;
        }
      }

      // 4. 低HP・隠蔽中 → しゃがみ (隠れながら離脱)
      if (s.hp < 40 && (!tgt || !s.hasLos)) shouldCrouch = true;

      // 5. 乗り物近接待機 → しゃがみ (待ち伏せ)
      // (車両搭乗判定は上で除外済み)

      // ===== スプリント判定 — いつ走るか =====
      var shouldSprint = false;

      // しゃがみ中はスプリント不可 (プレイヤーと同様)
      if (!shouldCrouch) {
        // a. 脅威下の拠点へ急行 (防衛 urgency)
        if (s.targetFlag && typeof flagUnderThreat === 'function' &&
            flagUnderThreat(s.targetFlag, s.team)) {
          var fd2 = Math.hypot(s.targetFlag.x - sp.x, s.targetFlag.z - sp.z);
          if (fd2 > 25 && (!tgt || !s.hasLos || tDist > 50)) shouldSprint = true;
        }

        // b. 目的地が遠い・非交戦 → スプリント (原本の*1.7に加え+45%)
        if (s.targetFlag) {
          var fd3 = Math.hypot(s.targetFlag.x - sp.x, s.targetFlag.z - sp.z);
          if (fd3 > 45 && (!tgt || !s.hasLos)) shouldSprint = true;
        }

        // c. 分隊長から離脱しすぎ → スプリントで合流
        var ldr = typeof squadLeader === 'function' ? squadLeader(s.squad) : null;
        if (ldr && ldr !== s) {
          var ld = Math.hypot(ldr.obj.position.x - sp.x, ldr.obj.position.z - sp.z);
          if (ld > 22) shouldSprint = true;
        }
      }

      // ===== 適用 =====
      s.stanceV073 = shouldCrouch ? 1 : 0;
      s.sprintV073 = shouldSprint;

      // s.speed を一時変更 (原本の速度計算に自然反映)
      var mult = 1;
      if (shouldCrouch) mult *= 0.55;         // プレイヤー crouch と同等
      if (shouldSprint) mult *= 1.45;         // 戦闘スプリント (非戦闘時は原本が更に*1.7)
      s.speed = s._savedSpeedV073 * mult;      // v0.7.4: 保存した値を使用

      // スプリント中はジャンプCD短縮 (カバー越えを積極的に)
      if (shouldSprint && s.jumpCd > 0.3) s.jumpCd = 0.3;

      if (shouldCrouch) v073.crouchingCount++;
      if (shouldSprint) v073.sprintingCount++;
    }
  }

  // ---------------------------------------------------------------
  // Post-hook — 視覚的しゃがみ表現 + 検知率低下 + アニメ調整
  // ---------------------------------------------------------------
  function _v073PostHook(dt) {
    // v0.7.4: Pre-hookで処理した兵士のみ復元 (死亡/搭乗中の兵士は上書きしない)
    for (var pi = 0; pi < _processedSoldiers.length; pi++) {
      var s = _processedSoldiers[pi];

      // s.speed を復元 (Pre-hookで保存した値を使用)
      if (s._savedSpeedV073 !== undefined) {
        s.speed = s._savedSpeedV073;
        s._savedSpeedV073 = undefined;          // 次フレーム用にクリア
      }

      // 死亡した場合 (Pre-hook後updateSoldiers内で死亡) — スケールを1に戻す
      if (!s.alive || s.inVehicle) {
        if (s.obj && s.obj.scale.y < 0.99) {
          s.obj.scale.y += (1 - s.obj.scale.y) * Math.min(1, dt * 8);
        }
        continue;
      }

      // ===== 視覚的しゃがみ — モデルをY軸縮小 =====
      var targetSY = s.stanceV073 === 1 ? 0.72 : 1.0;
      s.obj.scale.y += (targetSY - s.obj.scale.y) * Math.min(1, dt * 8);

      // ===== しゃがみ歩行アニメ — 歩幅短縮 =====
      if (s.stanceV073 === 1 && s.legL && s.legR) {
        // 原本が設定した脚の回転を30%に縮小 (歩幅短く)
        if (Math.abs(s.legL.rotation.x) > 0.01) {
          s.legL.rotation.x *= 0.3;
          s.legR.rotation.x *= 0.3;
        }
      }

      // ===== しゃがみ検知率低下 — 敵AIがプレイヤーに見つかりにくく =====
      if (s.team === -1 && s.stanceV073 === 1 && s.marker) {
        // しゃがみ敵AIは40%の確率でプレイヤーの視認を回避
        if (s.seenByPlayer && Math.random() < 0.4) {
          s.marker.visible = false;
          s.seenByPlayer = false;
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // フック findEnemyTarget — しゃがみ対象の検知範囲を縮小
  // プレイヤーの crouch/prone も検知範囲に反映 (プレイヤーとAIの対称性)
  // ---------------------------------------------------------------
  function _v073FindEnemyTarget(s) {
    // v0.7.4: 原本を呼び出して結果をフィルタする方式に変更
    // (元は全ロジックを再実装しており保守性リスクがあった)
    var result = _origFindEnemyTarget(s);
    if (!result) return null;

    // crouch/prone対象の検知範囲縮小フィルタ
    if (result.kind === 'player') {
      var pd = Math.hypot(player.pos.x - s.obj.position.x, player.pos.z - s.obj.position.z);
      var pRange = 60;
      if (player.stance === 1) pRange = 33;       // crouch: 45%減
      else if (player.stance === 2) pRange = 21;   // prone: 65%減
      if (pd > pRange) return null;               // 範囲外なら見失う
    } else if (result.kind === 'soldier' && result.s) {
      var o = result.s;
      var d = Math.hypot(o.obj.position.x - s.obj.position.x, o.obj.position.z - s.obj.position.z);
      var detRange = (o.stanceV073 === 1) ? 36 : 60;   // crouch: 40%減
      if (d > detRange) return null;              // 範囲外なら見失う
    }
    // vehicle は原本通り (フィルタ不要)

    return result;
  }

  // ---------------------------------------------------------------
  // updateV073 — loop統合用 (処理は全てフック内で完結)
  // ---------------------------------------------------------------
  function updateV073(dt) {
    // 全ての処理は updateSoldiers フック内で実行される。
    // 将来の拡張用に残置 (AI移動状態の可視化デバッグなど)。
  }

  // Export
  window.resetV073 = resetV073;
  window.updateV073 = updateV073;
  window.v073 = v073;
})();
