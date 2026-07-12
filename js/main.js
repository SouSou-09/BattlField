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
  updateHpUI(); updateAmmoUI(); updateScoreUI(); updateTicketsUI();
  ui.waveBanner.textContent = 'CONQUEST — 拠点を占領せよ';
  ui.waveBanner.style.opacity = 1;
  setTimeout(() => ui.waveBanner.style.opacity = 0, 2200);
  game.running = true;
}

document.getElementById('start-btn').addEventListener('click', () => {
  initAudio();
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
window.__dbg = { soldiers, flags, game, player, terrainH };
// #autotest でスタートを自動クリック (動作検証用)
if (location.hash === '#autotest') {
  setTimeout(() => document.getElementById('start-btn').click(), 500);
}
