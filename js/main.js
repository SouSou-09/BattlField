'use strict';
/* STEEL FRONT — ゲームフロー / メインループ */

// ---------- Game flow ----------
function resetGame() {
  // 兵士全削除
  for (const s of soldiers) scene.remove(s.obj);
  soldiers.length = 0; soldierHitMeshes.length = 0;
  clearEffects();
  for (const s of shells) { s.ttl = 0; s.m.visible = false; }
  for (const b of bulletPool) { b.active = false; b.m.visible = false; }   // v0.4.0
  for (const g of aiNadePool) { g.active = false; g.m.visible = false; }   // v0.4.1
  for (const s of smokes) { s.ttl = 0; s.grp.visible = false; }            // v0.4.1
  if (curVehicle) { curVehicle = null; curSeat = 0; gunGroup.visible = true; stopEngine(); }
  ui.vehicleBox.style.display = 'none';
  if (drone.active) endDrone(false);               // v0.3
  drone.cooldown = 0;
  deployReady = false; deploySelected = null;      // v0.3
  deployWrap.style.display = 'none';
  repairKeyHeld = false; heliUpHeld = false; heliDownHeld = false;
  spawnVehicles();
  // 拠点リセット
  for (const f of flags) { f.own = 0; f.cap = 0; updateFlagVisual(f); }
  // プレイヤー
  Object.assign(player, { hp: 100, alive: true, yaw: Math.PI * 0.75, pitch: 0, lastDamageTime: -99, onGround: true, respawnT: 0,
    stance: 0, slideT: 0, stamina: 1, exhausted: false, eyeHeight: 1.7 });   // v0.4.0
  releaseChute();                                  // v0.3.1
  player.pos.set(HQ_BLUE.x, terrainH(HQ_BLUE.x, HQ_BLUE.z) + player.eyeHeight, HQ_BLUE.z);
  player.vel.set(0, 0, 0);
  applyWeapon(curWeaponId);   // v0.2.2: 選択した武器を適用
  grenades.count = grenades.max;
  for (const g of nadePool) { g.active = false; g.m.visible = false; }
  for (const pk of pickups) { pk.active = true; pk.obj.visible = true; pk.respawnT = 0; }
  fullmapOpen = false; fmWrap.style.display = 'none';
  scoreboardOpen = false; sbWrap.style.display = 'none';   // v0.2.3
  resetDestructibles();                                     // v0.2.3
  resetWindows();                                           // v0.3.4: 窓ガラス復元
  initV042();                                               // v0.4.2: 戦略地形・戦闘痕
  game.timeLeft = MATCH_TIME; game.timerT = 0;              // v0.2.3
  ui.matchTimer.textContent = '15:00'; ui.matchTimer.classList.remove('low');
  player.deaths = 0;
  soldierNameIdx = 0;
  game.score = 0; game.kills = 0; firing = false; fireLatch = false;
  game.ticketsBlue = 150; game.ticketsRed = 150; game.bleedT = 0;
  shake = 0;
  ui.vignette.style.opacity = 0; ui.reloadHint.textContent = '';
  document.getElementById('respawn-screen').style.display = 'none';
  // 味方AI 9体 (青HQ周辺)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    createSoldier(1, HQ_BLUE.x + Math.cos(a) * (6 + Math.random() * 8), HQ_BLUE.z + Math.sin(a) * (6 + Math.random() * 8));
  }
  // 敵AI 10体 (赤HQ周辺)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    createSoldier(-1, HQ_RED.x + Math.cos(a) * (6 + Math.random() * 8), HQ_RED.z + Math.sin(a) * (6 + Math.random() * 8));
  }
  assignSquads();   // v0.4.1: 4人1組の分隊を編成
  resetV043();      // v0.4.3: 兵科・プレイヤー分隊・報酬
  resetV045();      // v0.4.5: 排莢・キルカメラ・負傷表現
  resetV046();      // v0.4.6: リーン・蘇生・LMG
  resetV047();      // v0.4.7: スモーク・無線・制圧
  resetV048();      // v0.4.8: 車両部位・破壊可能壁
  resetV050();      // v0.5.0: Qタグ・双眼鏡・足音可視化
  resetV051();      // v0.5.1: RPG・クレイモア・AI狙撃兵
  resetV052();      // v0.5.2: AIフランキング・役割・弾薬判断
  resetV053();      // v0.5.3: AI車両利用・手榴弾回避
  resetV054();      // v0.5.4: 車両損傷段階・機動部位破壊
  resetV055();      // v0.5.5: 車両燃料・給油・カモネット
  resetV056();      // v0.5.6: APC・大人数輸送車
  resetV057();      // v0.5.7: 環境破壊・森林火災
  resetV058();      // v0.5.8: 防御施設・占領バフ
  resetV059();      // v0.5.9: 拠点防衛ボーナス・動的目標・前線可視化
  resetV0510();     // v0.5.10: 没入感・天候・昼夜・キルフィード・ズーム
  resetV060();      // v0.6.0: テクスチャミップマップ・LODシステム
  resetV061();      // v0.6.1: 地形テクスチャ高解像度/法線マップ風陰影/岩ジオメトリ
  resetV062();      // v0.6.2: 水面シェーダー/波紋/大気遠近感
  resetV063();      // v0.6.3: ソフトシャドウ/色温度/疑似AO
  resetV064();      // v0.6.4: 木ディテール/草密度・揺れ
  resetV065();      // v0.6.5: PBRマテリアル/外壁劣化テクスチャ/屋根材バリエーション
  resetV066();      // v0.6.6: 建物種類差別化/外観ディテール/屋上強化
  resetV067();      // v0.6.7: 内装質感/家具配置/階段廊下ディテール
  resetV068();      // v0.6.8: 窓ガラス反射/内部照明/恒久ダメージ
  resetV070();      // v0.7.0: 武器/車両追加バリエーション
  resetV071();      // v0.7.1: マップ構造リアル化(道路/建物/地形ディテール)
  resetV072();      // v0.7.2: プレイヤー移動リアル化(慣性/ボブ/カメラ精度)
  resetV073();      // v0.7.3: AI移動能力拡張(スプリント/しゃがみ/カバー越え)
  resetV074();      // v0.7.4: 大規模バグ修正・品質向上
  resetV081();      // v0.8.1: ダウンタウン高密度市街地
  resetV082();      // v0.8.2: 軍事航空基地
  resetV083();      // v0.8.3: 基地車両+新APC+補給トラック+リスポーン
  resetV084();      // v0.8.4: ジェット戦闘機(APRON_SLOTSにスポーン)
  resetV085();      // v0.8.5: 川と橋と渡し場
  resetV086();      // v0.8.6: 鉄道と貨物駅
  updateHpUI(); updateAmmoUI(); updateScoreUI(); updateTicketsUI();
  ui.waveBanner.textContent = 'CONQUEST — 拠点を占領せよ';
  ui.waveBanner.style.opacity = 1;
  setTimeout(() => ui.waveBanner.style.opacity = 0, 2200);
  game.running = true;
}

document.getElementById('start-btn').addEventListener('click', () => {
  initAudio();
  initAmbientSound();
  document.getElementById('start-screen').style.display = 'none';
  resetGame();
  if (!isMobile) canvas.requestPointerLock();
});
document.getElementById('restart-btn').addEventListener('click', () => {
  initAudio();
  document.getElementById('gameover-screen').style.display = 'none';
  resetGame();
  if (!isMobile) canvas.requestPointerLock();
});

// ---------- Main loop ----------
let lastT = performance.now(), elapsed = 0, bobT = 0, radarT = 0, shake = 0, sbT = 0, deployT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  if (game.running) {
    elapsed += dt;
    shake = Math.max(0, shake - dt * 1.6);
    if (!player.alive) {
      // v0.3: リスポーン待機 → デプロイ画面
      if (!deployReady) {
        player.respawnT -= dt;
        ui.respawnTimer.textContent = '再出撃まで ' + Math.max(1, Math.ceil(player.respawnT));
        if (player.respawnT <= 0 && game.ticketsBlue > 0) openDeployScreen();
      } else if (deployT > 0.4) {
        deployT = 0; drawDeployMap();   // デプロイマップを定期更新
      }
      deployT += dt;
    } else if (drone.active) {
      // v0.3: ドローン操作中 (本体はその場に留まる)
      muzzleFlash.material.opacity = 0;
      muzzleLight.intensity = 0;
    } else if (curVehicle) {
      updateVehicle(dt);
      if (player.hp < player.maxHp && elapsed - player.lastDamageTime > 4) {
        player.hp = Math.min(player.maxHp, player.hp + 12 * dt);
        if (player.hp > 30) ui.vignette.style.opacity = 0;
        updateHpUI();
      }
      muzzleFlash.material.opacity = 0;
      muzzleLight.intensity = 0;
    } else {
      updatePlayer(dt);
      if (player.hp < player.maxHp && elapsed - player.lastDamageTime > 4) {
        player.hp = Math.min(player.maxHp, player.hp + 12 * dt);
        if (player.hp > 30) ui.vignette.style.opacity = 0;
        updateHpUI();
      }
      muzzleFlash.material.opacity = Math.max(0, muzzleFlash.material.opacity - dt * 18);
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 25);
    }
    updateSoldiers(dt);
    updateFlags(dt);
    updateTickets(dt);
    updateShells(dt);
    updateVehiclesGlobal(dt);   // v0.3: 炎上/AI砲手/自動対空砲
    updateDrone(dt);            // v0.3
    updateRepair(dt);           // v0.3
    updateEffects(dt);
    updateInteractHint(dt);
    updateAds(dt);
    updateDamageArcs(dt);
    updateBullets(dt);          // v0.4.0: 発射体式の弾丸
    updateKnife(dt);            // v0.4.0: ナイフ
    updateAiGrenades(dt);       // v0.4.1: AIグレネード
    updateSmokes(dt);           // v0.4.1: スモーク
    updateV042(dt);             // v0.4.2: 地下道・隠密・環境音
    updateV043(dt);             // v0.4.3: 分隊・UAV・兵科ガジェット
    updateV045(dt);             // v0.4.5: 没入感・負傷・キルカメラ
    updateV046(dt);             // v0.4.6: リーン・乗り越え・蘇生
    updateV047(dt);             // v0.4.7: スモーク・無線・制圧
    updateV050(dt);             // v0.5.0: 偵察支援・足音リング
    updateV051(dt);             // v0.5.1: RPG・地雷・狙撃陣地
    updateV053(dt);             // v0.5.3: AI車両運転・手榴弾回避姿勢
    updateV055(dt);             // v0.5.5: 車両燃料・給油・カモネット
    updateV056(dt);             // v0.5.6: APC・大人数輸送車
    updateV057(dt);             // v0.5.7: 環境破壊・森林火災
    updateV058(dt);             // v0.5.8: 防御施設・占領バフ
    updateV059(dt);             // v0.5.9: 拠点防衛ボーナス・動的目標
    updateV0510(dt);            // v0.5.10: 没入感・天候・昼夜・リプレイ
    updateV060(dt);             // v0.6.0: テクスチャミップマップ・LOD
    updateV061(dt);             // v0.6.1: 地形テクスチャ/陰影/岩 (静的)
    updateV062(dt);             // v0.6.2: 水面シェーダー/波紋/大気遠近感
    updateV063(dt);             // v0.6.3: 色温度強化(昼夜補強)
    updateV064(dt);             // v0.6.4: 草・葉の風揺れ
    updateV065(dt);             // v0.6.5: PBR環境マップ反射強度(昼夜連動)
    updateV066(dt);             // v0.6.6: 建物屋上ファン/航空灯/衛星アンテナ回転+可視性更新
    updateV067(dt);             // v0.6.7: 内装メッシュ可視性更新(200mカリング)
    updateV068(dt);             // v0.6.8: 窓ガラス破損同期+内部照明昼夜連動
    updateV070(dt);             // v0.7.0: 武器/車両追加バリエーション(実行時フック)
    updateV071(dt);             // v0.7.1: マップ装飾メッシュ可視性更新(220mカリング)
    updateV072(dt);             // v0.7.2: プレイヤー移動リアル化(実行時フック)
    updateV073(dt);             // v0.7.3: AI移動能力拡張(実行時フック)
    updateV074(dt);             // v0.7.4: 大規模バグ修正・品質向上(実行時フック)
    updateV081(dt);             // v0.8.1: ダウンタウン高密度市街地(220mカリング)
    updateV082(dt);             // v0.8.2: 軍事航空基地(220mカリング)
    updateV083(dt);             // v0.8.3: 基地車両リスポーン・補給(220mカリング)
    updateV084(dt);             // v0.8.4: ジェット戦闘機リスポーン
    updateV085(dt);             // v0.8.5: 川と橋と渡し場
    updateV086(dt);             // v0.8.6: 鉄道と貨物駅
    updateGrenades(dt);
    updatePickups(dt);
    updateMatchTimer(dt);   // v0.2.3
    radarT += dt;
    if (radarT > 0.12) { radarT = 0; drawRadar(); if (fullmapOpen) drawFullmap(); }
    sbT += dt;
    if (scoreboardOpen && sbT > 0.5) { sbT = 0; drawScoreboard(); }   // v0.2.3
  }
  if (!ctxLost) {
    try { renderer.render(scene, camera); } catch (err) { /* ignore */ }
  }
}
updateHpUI(); updateAmmoUI(); updateScoreUI(); updateTicketsUI();
requestAnimationFrame(loop);

// デバッグ用フック (テスト自動化用 / 本体の動作には影響しない)
window.__dbg = { soldiers, flags, game, player, terrainH, vehicles, destructibleWalls, v042, v043, v045, v046, v047, v048, v050, v051, v052, v053, v054, v055, v056, v057, v058, v059, v0510, v060, v061, v062, v063, v064, v065, v066, v067, v068, v070, v071, v072, v073, v074, v081, v082, v083, v084, v085, v086 };
// #autotest でスタートを自動クリック (動作検証用)
if (location.hash === '#autotest') {
  setTimeout(() => document.getElementById('start-btn').click(), 500);
}
