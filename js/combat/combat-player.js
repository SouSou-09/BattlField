'use strict';
/* STEEL FRONT — パラシュート / プレイヤー被弾 / 死亡 / リスポーン (combat.js から分割) */

/* =========================================================
   v0.3.1: パラシュート — 高高度からの降下を可能に
   ・一定以上の高さを落下中に自動展開 / ヘリ空中脱出時は即展開
   ・展開中は降下速度が制限され、空中での水平移動が可能
   ・パラシュートなしの高所落下は落下ダメージ
   ========================================================= */
let chuteMesh = null;
{
  const g = new THREE.Group();
  // キャノピー (半球)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshLambertMaterial({ color: 0x5a7a4a, side: THREE.DoubleSide })
  );
  canopy.position.y = 3.4;
  g.add(canopy);
  // ライン (4本)
  const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([ox, oz]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(ox, 3.6, oz)
    ]);
    g.add(new THREE.Line(geo, lineMat));
  });
  g.visible = false;
  scene.add(g);
  chuteMesh = g;
}
function deployChute() {
  if (player.chute || !player.alive) return;
  player.chute = true;
  chuteMesh.visible = true;
  sfx.chute();
  addFeed('🪂 パラシュート展開', 'blue');
}
function releaseChute() {
  if (!player.chute) return;
  player.chute = false;
  chuteMesh.visible = false;
}
// v0.3.4: 空中でパラシュートを手動で開閉 (閉じたまま落下すると落下ダメージ)
function toggleChute() {
  if (!player.alive || player.onGround) return;
  if (player.chute) {
    releaseChute();
    addFeed('パラシュートを閉じた — 落下注意!', 'red');
  } else {
    const fallH = (player.pos.y - player.eyeHeight) - terrainH(player.pos.x, player.pos.z);
    if (fallH > 3 && player.vel.y < 1) deployChute();
  }
}

// ---------- Player damage / respawn ----------
function damagePlayer(dmg, fromPos = null) {
  if (!player.alive) return;
  player.hp -= dmg;
  player.lastDamageTime = elapsed;
  sfx.damage();
  if (fromPos) showDamageDirection(fromPos);
  ui.vignette.style.opacity = Math.min(1, 0.4 + (1 - player.hp / player.maxHp) * 0.6);
  setTimeout(() => { if (player.hp > 30) ui.vignette.style.opacity = 0; }, 220);
  if (player.hp <= 0) {
    if (typeof enterDownedV046 === 'function' && enterDownedV046(fromPos)) { updateHpUI(); return; }
    player.hp = 0;
    if (typeof startKillcam === 'function') startKillcam(fromPos);
    playerDie();
  }
  updateHpUI();
}
function playerDie() {
  player.alive = false;
  if (typeof v043 !== 'undefined') v043.streak = 0;
  player.respawnT = 5;
  player.deaths = (player.deaths || 0) + 1;        // v0.2.3
  firing = false;
  setAds(false);
  releaseChute();                                  // v0.3.1
  if (drone.active) endDrone(false);               // v0.3
  game.ticketsBlue = Math.max(0, game.ticketsBlue - 1);
  updateTicketsUI();
  if (curVehicle) exitVehicle(true);
  document.getElementById('respawn-screen').style.display = 'flex';
  deployReady = false;                             // v0.3
  checkMatchEnd();
}
// v0.3: デプロイ画面で選んだ地点から出撃
function respawnPlayer(sp = null) {
  if (!sp) {
    sp = HQ_BLUE;
    const owned = flags.filter(f => f.own === 1);
    if (owned.length) sp = owned[Math.floor(Math.random() * owned.length)];
  }
  const rx = sp.x + (Math.random() - .5) * 10, rz = sp.z + (Math.random() - .5) * 10;
  player.stance = 0; player.slideT = 0; player.stamina = 1; player.exhausted = false;   // v0.4.0
  player.eyeHeight = 1.7;
  player.pos.set(rx, terrainH(rx, rz) + player.eyeHeight, rz);
  player.vel.set(0, 0, 0);
  player.hp = player.maxHp; player.alive = true;
  player.lastDamageTime = -99;
  player.onGround = true;
  onRespawnV047();
  releaseChute();                                  // v0.3.1
  // v0.2.2: リスポーン時はフル装備で復帰
  if (typeof applyClassLoadout === 'function') applyClassLoadout();
  else applyWeapon(curWeaponId);
  grenades.count = grenades.max;
  fireLatch = false;
  ui.vignette.style.opacity = 0;
  ui.reloadHint.textContent = '';
  updateHpUI(); updateAmmoUI();
  document.getElementById('respawn-screen').style.display = 'none';
  if (typeof onRespawnV046 === 'function') onRespawnV046();
}
