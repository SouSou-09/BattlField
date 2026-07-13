'use strict';
/* STEEL FRONT v0.7.0 — 武器追加バリエーション / 車両追加バリエーション
   ──────────────────────────────────────────────
   1. 武器追加バリエーション:
      v046のLMG追加パターン(WEAPONS拡張 + WEAPON_ORDER追加)に準拠し、
      新武器2種を追加:
      ・DMR (M14 EBR): セミオートマークスマンライフル — ARとSRの中間、
        高精度・中遠距離・単発高威力、リコイル強め
      ・PDW (MP7): パーソナルディフェンスウェポン — SMGより高威力・長射程だが
        連射がやや遅く携行弾数少なめ、機動性重視の近中距離戦向け
      武器選択UIボタンをDOMに動的注入し、兵科割当を拡張(偵察兵=DMR/突撃兵=PDW選択可)。
   2. 車両追加バリエーション:
      既存createJeep/createTank等と同様の構造で新車両2種を追加:
      ・テクニカル (武装ピックアップトラック): ジープベース+重機銃、
        高速・低装甲・火力重視、オープン構造
      ・偵察車 (LAVスカウト): ジープとAPCの中間、6輪・軽装甲・偵察用
      spawnVehiclesをラップして新車両を拠点・道路沿いに追加配置。

   ※ 既存ソース(weapons.js / vehicles-core.js)は変更せず、resetV070()で
      実行時拡張。v068の後に実行される。 */

// ============================================================
//  State
// ============================================================
var v070 = {
  initialized: false,
  vehicles: []      // 追加配置した車両の参照(可視性管理用)
};

// ============================================================
//  1. 武器追加バリエーション
// ============================================================
function _addWeaponsV070() {
  if (WEAPONS.dmr || WEAPONS.pdw) return;  // 重複実行防止

  // DMR (M14 EBR) — セミオートマークスマンライフル
  WEAPONS.dmr = {
    name: 'M14 EBR DMR', magSize: 20, reserve: 80, fireInterval: 0.18, reloadTime: 2.6,
    dmg: 55, hsDmg: 120, baseSpread: 0.008, heatSpread: 0.012, auto: false, hipPenalty: true,
    adsFov: 32, pellets: 1, range: 380, kick: 0.022, muzzleVel: 340,
    recoilV: 0.03, recoilH: 0.006, recoilFreq: 0.45, recoilPhase: 0.3
  };

  // PDW (MP7) — パーソナルディフェンスウェポン
  WEAPONS.pdw = {
    name: 'MP7 PDW', magSize: 40, reserve: 160, fireInterval: 0.07, reloadTime: 1.8,
    dmg: 22, hsDmg: 52, baseSpread: 0.006, heatSpread: 0.022, auto: true,
    adsFov: 50, pellets: 1, range: 210, kick: 0.007, muzzleVel: 200,
    recoilV: 0.009, recoilH: 0.008, recoilFreq: 1.0, recoilPhase: 1.8
  };

  // WEAPON_ORDERに追加
  if (!WEAPON_ORDER.includes('dmr')) WEAPON_ORDER.push('dmr');
  if (!WEAPON_ORDER.includes('pdw')) WEAPON_ORDER.push('pdw');

  // 武器選択UIボタンをDOM注入
  var wselRow = document.getElementById('wsel-row');
  if (wselRow && !wselRow.querySelector('[data-w="dmr"]')) {
    var btnDmr = document.createElement('button');
    btnDmr.className = 'wsel';
    btnDmr.setAttribute('data-w', 'dmr');
    btnDmr.innerHTML = 'M14<span class="wd">DMR</span>';
    btnDmr.addEventListener('click', function () {
      curWeaponId = 'dmr';
      selectWeaponUI('dmr');
    });
    wselRow.appendChild(btnDmr);

    var btnPdw = document.createElement('button');
    btnPdw.className = 'wsel';
    btnPdw.setAttribute('data-w', 'pdw');
    btnPdw.innerHTML = 'MP7<span class="wd">PDW</span>';
    btnPdw.addEventListener('click', function () {
      curWeaponId = 'pdw';
      selectWeaponUI('pdw');
    });
    wselRow.appendChild(btnPdw);
  }

  // キーマップ拡張 (6=DMR, 7=PDW)
  // input.jsのkeydownマップに動的追加は困難なため、別途キーハンドラを登録
  if (!window._v070_keymap) {
    window._v070_keymap = true;
    window.addEventListener('keydown', function (e) {
      if (!player.alive || curVehicle) return;
      if (e.code === 'Digit6') {
        applyWeapon('dmr');
        setAds(false);
        if (typeof addFeed === 'function') addFeed(weaponDef().name + ' に切替', 'blue');
      } else if (e.code === 'Digit7') {
        applyWeapon('pdw');
        setAds(false);
        if (typeof addFeed === 'function') addFeed(weaponDef().name + ' に切替', 'blue');
      }
    });
  }

  // 兵科武器割当拡張 — 偵察兵にDMR選択肢、突撃兵にPDW選択肢
  if (typeof CLASSES !== 'undefined') {
    if (!CLASSES.recon.altWeapon) CLASSES.recon.altWeapon = 'dmr';
    if (!CLASSES.assault.altWeapon) CLASSES.assault.altWeapon = 'pdw';
  }
}

// ============================================================
//  2. 車両追加バリエーション
// ============================================================

// --- テクニカル (武装ピックアップトラック) ---
function createTechnicalV070(x, z, rotY) {
  var g = new THREE.Group();
  // ピックアップトラック本体 — ジープより長い、オープン荷台
  var body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 4.4), matVBody);
  body.position.y = 0.8;
  var hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 1.3), matVBody2);
  hood.position.set(0, 1.05, -1.7);
  var cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 1.4), matVBody2);
  cab.position.set(0, 1.45, -0.3);
  var cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.3), matVDark);
  cabRoof.position.set(0, 1.85, -0.3);
  var windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.06), matVGlass);
  windshield.position.set(0, 1.6, -1.0);
  // 荷台(オープン)
  var bedFloor = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.8), matVDark);
  bedFloor.position.set(0, 1.2, 1.5);
  var bedWallL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 1.8), matVBody2);
  bedWallL.position.set(-0.96, 1.45, 1.5);
  var bedWallR = bedWallL.clone(); bedWallR.position.x = 0.96;
  var bedTail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.08), matVBody2);
  bedTail.position.set(0, 1.45, 2.4);
  g.add(body, hood, cab, cabRoof, windshield, bedFloor, bedWallL, bedWallR, bedTail);

  // バンパー/グリル
  var bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.28, 0.25), matVDark);
  bumper.position.set(0, 0.58, -2.35); g.add(bumper);
  for (var i = 0; i < 5; i++) {
    var slat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.03), matVDark);
    slat.position.set(-0.48 + i * 0.24, 1.02, -2.38); g.add(slat);
  }

  // ヘッドライト/テールランプ
  var hlL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), matLight);
  hlL.rotation.x = Math.PI / 2; hlL.position.set(-0.65, 1.0, -2.4); g.add(hlL);
  var hlR = hlL.clone(); hlR.position.x = 0.65; g.add(hlR);
  var tlL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), matTailLight);
  tlL.position.set(-0.8, 0.95, 2.2); g.add(tlL);
  var tlR = tlL.clone(); tlR.position.x = 0.8; g.add(tlR);

  // 荷台に重機銃マウント (DShK風)
  var turret = new THREE.Group();
  var mgPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), matVDark);
  mgPole.position.y = 0.25;
  var mgBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.85), matVDark);
  mgBody.position.set(0, 0.55, -0.15);
  var mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 8), matVDark);
  mgBarrel.rotation.x = Math.PI / 2; mgBarrel.position.set(0, 0.58, -1.05);
  var mgShield = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), matTank2);
  mgShield.position.set(0, 0.8, -0.5);
  // 弾帯ボックス
  var ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.22), matRust);
  ammoBox.position.set(0.28, 0.55, 0.1);
  var muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.58, -1.7);
  turret.add(mgPole, mgBody, mgBarrel, mgShield, ammoBox, muzzle);
  turret.position.set(0, 1.2, 1.5);
  g.add(turret);

  // ホイール
  var wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12);
  var hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.37, 8);
  var wheels = [];
  var wheelPos = [[-1.0, -1.5], [1.0, -1.5], [-1.0, 1.6], [1.0, 1.6]];
  for (var wi = 0; wi < wheelPos.length; wi++) {
    var w = new THREE.Mesh(wheelGeo, matTire);
    w.rotation.z = Math.PI / 2;
    w.position.set(wheelPos[wi][0], 0.5, wheelPos[wi][1]);
    var hub = new THREE.Mesh(hubGeo, matHub);
    w.add(hub);
    g.add(w); wheels.push(w);
  }

  g.traverse(function (m) { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);

  var v = baseVehicleState({
    type: 'technical', name: 'テクニカル', obj: g, turret: turret, muzzle: muzzle,
    wheels: wheels, glass: windshield,
    yaw: rotY, hp: 260, maxHp: 260,
    radius: 2.1, maxSpeed: 19, accel: 12, turnRate: 1.75,
    fireInterval: 0.07, camDist: 8, camH: 2.8, dmg: 42, gunRange: 280,
    seats: [
      mkSeat('driver', -0.45, 1.5, -0.3),
      mkSeat('gunner', 0, 2.0, 1.5),
      mkSeat('passenger', 0.45, 1.5, -0.3),
      mkSeat('passenger', 0, 1.4, 2.0)
    ]
  });
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
  if (typeof initVehicleLogisticsV055 === 'function') initVehicleLogisticsV055(v);
  vehicles.push(v);
  v070.vehicles.push(v);
  return v;
}

// --- 偵察車 (LAVスカウト) ---
function createScoutV070(x, z, rotY) {
  var g = new THREE.Group();
  // 車体 — ジープとAPCの中間サイズ、6輪
  var hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 4.8), matTank);
  hull.position.y = 1.1;
  var glacis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.0), matTank2);
  glacis.position.set(0, 1.3, -2.3); glacis.rotation.x = 0.4;
  var roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 2.8), matTank2);
  roof.position.set(0, 1.75, 0.1);
  var windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.06), matVGlass);
  windshield.position.set(0, 1.6, -1.4);
  g.add(hull, glacis, roof, windshield);

  // サイドフェンダー
  var fenderL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 4.6), matTank2);
  fenderL.position.set(-1.35, 1.1, 0); g.add(fenderL);
  var fenderR = fenderL.clone(); fenderR.position.x = 1.35; g.add(fenderR);

  // ヘッドライト
  var hlL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 8), matLight);
  hlL.rotation.x = Math.PI / 2; hlL.position.set(-0.8, 1.15, -2.4); g.add(hlL);
  var hlR = hlL.clone(); hlR.position.x = 0.8; g.add(hlR);

  // 排気管
  var exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), matRust);
  exhaust.rotation.x = Math.PI / 2; exhaust.position.set(-1.3, 0.95, 2.0); g.add(exhaust);

  // 6輪 (前2+中2+後2)
  var wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.38, 12);
  var hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.4, 8);
  var wheels = [];
  var wpos = [[-1.3, -1.7], [1.3, -1.7], [-1.3, 0], [1.3, 0], [-1.3, 1.7], [1.3, 1.7]];
  for (var wi = 0; wi < wpos.length; wi++) {
    var w = new THREE.Mesh(wheelGeo, matTire);
    w.rotation.z = Math.PI / 2;
    w.position.set(wpos[wi][0], 0.55, wpos[wi][1]);
    var hub = new THREE.Mesh(hubGeo, matHub);
    w.add(hub);
    g.add(w); wheels.push(w);
  }

  // 小型砲塔(機銃+軽砲)
  var turret = new THREE.Group();
  var cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 10), matTank);
  cupola.position.y = 0.25;
  var gun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 7), matVDark);
  gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.35, -0.95);
  var coaxMg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), matVDark);
  coaxMg.rotation.x = Math.PI / 2; coaxMg.position.set(0.15, 0.25, -0.65);
  var muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.35, -1.8);
  turret.add(cupola, gun, coaxMg, muzzle);
  turret.position.set(0, 1.9, 0.1);
  g.add(turret);

  // アンテナ
  var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), matVDark);
  antenna.position.set(-0.9, 2.5, 1.5); antenna.rotation.z = 0.1; g.add(antenna);

  g.traverse(function (m) { if (m.isMesh) m.castShadow = !isMobile; });
  g.position.set(x, terrainH(x, z), z);
  g.rotation.y = rotY;
  scene.add(g);

  var v = baseVehicleState({
    type: 'scout', name: 'LAV-25 スカウト', obj: g, turret: turret, muzzle: muzzle,
    wheels: wheels, glass: windshield,
    yaw: rotY, hp: 450, maxHp: 450, armorV056: 0.4,
    radius: 2.3, maxSpeed: 14, accel: 8, turnRate: 1.4,
    fireInterval: 0.2, camDist: 9, camH: 3.2, dmg: 50, gunRange: 300,
    seats: [
      mkSeat('driver', -0.5, 1.7, -0.5),
      mkSeat('gunner', 0, 2.25, 0.1),
      mkSeat('passenger', 0.5, 1.7, -0.5),
      mkSeat('passenger', -0.6, 1.6, 1.0),
      mkSeat('passenger', 0.6, 1.6, 1.0)
    ]
  });
  if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
  if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
  if (typeof initVehicleLogisticsV055 === 'function') initVehicleLogisticsV055(v);
  vehicles.push(v);
  v070.vehicles.push(v);
  return v;
}

// spawnVehiclesをラップして新車両を追加配置
var _origSpawnVehiclesV070 = null;
function _hookSpawnVehiclesV070() {
  if (_origSpawnVehiclesV070) return;
  _origSpawnVehiclesV070 = spawnVehicles;
  /* eslint-disable no-global-assign */
  spawnVehicles = function () {
    _origSpawnVehiclesV070();
    // テクニカル: 各HQ周辺 + 中立拠点
    createTechnicalV070(HQ_BLUE.x + 18, HQ_BLUE.z - 10, -Math.PI / 4);
    createTechnicalV070(HQ_RED.x - 18, HQ_RED.z + 10, Math.PI * 0.75);
    createTechnicalV070(-200, 140, 0);              // 拠点B
    createTechnicalV070(250, -160, Math.PI);         // 拠点D
    // 偵察車: 各HQ + 拠点E
    createScoutV070(HQ_BLUE.x - 12, HQ_BLUE.z + 18, Math.PI / 4);
    createScoutV070(HQ_RED.x + 12, HQ_RED.z - 18, -Math.PI * 0.75);
    createScoutV070(255, 245, Math.PI);              // 拠点E
  };
  /* eslint-enable no-global-assign */
}

// ============================================================
//  reset / update
// ============================================================
function resetV070() {
  if (v070.initialized) return;
  v070.initialized = true;
  _addWeaponsV070();        // 武器追加
  _hookSpawnVehiclesV070(); // 車両スポーンフック
}

function updateV070(dt) {
  // 武器・車両は静的追加のためupdate処理なし
  // (車両のアニメーションはupdateVehiclesGlobalで処理される)
}
