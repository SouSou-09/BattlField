'use strict';
/* =========================================================
   v0.8.3 — 基地車両 + 新APC + 補給トラック + 90秒リスポーン
   ・spawnVehiclesをフックし両MILBASEに車両配置
   ・戦車/テクニカル(ジープ)/偵察車(バイク)/ヘリ
   ・新APC(8輪・HP600・8座席・30mm機関砲)
   ・補給トラック(弾薬・手榴弾・HP補給機能)
   ・破壊後90秒で元位置にリスポーン
   ・MILBASE回転対応 (_l2w ローカル→ワールド変換)
   ========================================================= */
var v083 = {
  initialized: false,
  baseVehicles: [],   // [{type,x,z,rotY,team,vehicle,destroyed,respawnT}]
  resupplyT: 0
};
var _origSpawnVehiclesV083 = null;

(function () {

  /* ---------- ローカル→ワールド座標変換 (v082と同一) ---------- */
  function _l2w(mb, lx, lz) {
    var c = Math.cos(mb.rotY), s = Math.sin(mb.rotY);
    return { x: mb.x + lx * c - lz * s, z: mb.z + lx * s + lz * c };
  }
  function _l2wYaw(mb, lyaw) { return mb.rotY + lyaw; }

  /* ---------- 車輪セットヘルパ (v056パターン) ---------- */
  function _addWheelSetV083(g, positions, radius, width) {
    var wheels = [];
    var geo = new THREE.CylinderGeometry(radius, radius, width, 12);
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var wheel = new THREE.Mesh(geo, matTire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(p[0], radius, p[1]);
      var hub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, width + 0.03, 8),
        matHub
      );
      wheel.add(hub);
      g.add(wheel);
      wheels.push(wheel);
    }
    return wheels;
  }

  /* ---------- 初期化ヘルパ (v056 finalize と同等) ---------- */
  function _finalizeV083(v) {
    if (typeof initVehiclePartsV048 === 'function') initVehiclePartsV048(v);
    if (typeof initVehicleDamageV054 === 'function') initVehicleDamageV054(v);
    if (typeof initVehicleLogisticsV055 === 'function') initVehicleLogisticsV055(v);
    vehicles.push(v);
    return v;
  }

  /* =========================================================
     新APC — M1126 (8輪・HP600・8座席・30mm機関砲)
     v056のAPC(hp620)とは別バリアント
     ========================================================= */
  function createAPCV083(x, z, rotY) {
    var g = new THREE.Group();
    // 車体
    var hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 5.6), matVBody);
    hull.position.y = 1.25;
    // 前部傾斜装甲 (グラシス)
    var glacis = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.7, 1.0), matVBody2);
    glacis.position.set(0, 1.5, -2.8);
    glacis.rotation.x = 0.4;
    // 屋根
    var roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.25, 3.6), matVBody2);
    roof.position.set(0, 2.0, 0.3);
    // 後部ドア
    var rearDoor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 0.12), matVDark);
    rearDoor.position.set(0, 1.3, 2.85);
    g.add(hull, glacis, roof, rearDoor);
    // 側面リアクティブアーマーブロック
    for (var side = -1; side <= 1; side += 2) {
      for (var i = 0; i < 4; i++) {
        var block = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.8), matVDark);
        block.position.set(side * 1.65, 1.4, -1.5 + i * 1.0);
        g.add(block);
      }
    }
    // ヘッドライト
    for (var si = 0; si < 2; si++) {
      var sx = si === 0 ? -1.1 : 1.1;
      var hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), matLight);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(sx, 1.2, -3.1);
      g.add(hl);
    }
    // テールランプ
    for (var ti = 0; ti < 2; ti++) {
      var tx = ti === 0 ? -1.2 : 1.2;
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.04), matTailLight);
      tl.position.set(tx, 1.1, 2.9);
      g.add(tl);
    }
    // 8輪
    var wheels = _addWheelSetV083(g, [
      [-1.55, -2.0], [1.55, -2.0], [-1.55, -0.7], [1.55, -0.7],
      [-1.55, 0.7], [1.55, 0.7], [-1.55, 2.0], [1.55, 2.0]
    ], 0.58, 0.4);
    // 砲塔 (30mm機関砲 + 同軸MG)
    var turret = new THREE.Group();
    var cupola = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2), matVBody);
    cupola.position.y = 0.3;
    var hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8), matVDark);
    hatch.position.set(-0.4, 0.65, 0.4);
    // 30mm機関砲
    var cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 2.2, 8), matVDark);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(0, 0.35, -1.3);
    // 砲口制退器
    var muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8), matVDark);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.35, -2.5);
    // 同軸MG
    var coaxial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), matVDark);
    coaxial.rotation.x = Math.PI / 2;
    coaxial.position.set(0.2, 0.2, -1.0);
    // スモークディスチャージャー
    for (var di = 0; di < 2; di++) {
      var dx = di === 0 ? -0.7 : 0.7;
      var smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 5), matTank2);
      smoke.rotation.x = Math.PI / 2 - 0.5;
      smoke.position.set(dx, 0.55, -0.6);
      turret.add(smoke);
    }
    var muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.35, -2.7);
    turret.add(cupola, hatch, cannon, muzzleBrake, coaxial, muzzle);
    turret.position.set(0, 2.25, -0.3);
    g.add(turret);
    // 影
    g.traverse(function (m) { if (m.isMesh) m.castShadow = !isMobile; });
    g.position.set(x, terrainH(x, z), z);
    g.rotation.y = rotY;
    scene.add(g);
    var v = baseVehicleState({
      type: 'apc', name: 'M1126 APC', obj: g, turret: turret, muzzle: muzzle,
      wheels: wheels, glass: null,
      yaw: rotY, hp: 600, maxHp: 600, armorV056: 0.60,
      radius: 2.6, maxSpeed: 12, accel: 6.5, turnRate: 1.2,
      fireInterval: 0.14, camDist: 10, camH: 3.4, dmg: 40, gunRange: 280,
      seats: [
        mkSeat('driver', -0.55, 1.85, -1.5),
        mkSeat('gunner', 0, 2.5, -0.3),
        mkSeat('passenger', -0.7, 1.75, 0.3),
        mkSeat('passenger', 0.7, 1.75, 0.3),
        mkSeat('passenger', -0.7, 1.75, 1.1),
        mkSeat('passenger', 0.7, 1.75, 1.1),
        mkSeat('passenger', -0.7, 1.75, 1.9),
        mkSeat('passenger', 0.7, 1.75, 1.9)
      ]
    });
    return _finalizeV083(v);
  }

  /* =========================================================
     補給トラック — M35 (6輪・HP350・弾薬補給機能)
     近接でプレイヤーの弾薬/手榴弾/HPを徐々に回復
     ========================================================= */
  function createSupplyTruckV083(x, z, rotY) {
    var g = new THREE.Group();
    var matCrate = new THREE.MeshLambertMaterial({ color: 0x6b5a30 });
    var matMark = new THREE.MeshBasicMaterial({ color: 0xffffff });
    // キャビン
    var cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 2.2), matVBody);
    cab.position.set(0, 1.45, -2.15);
    // ボンネット
    var hood = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.75, 1.15), matVBody2);
    hood.position.set(0, 1.05, -3.6);
    // 荷台
    var bed = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.4, 4.3), matVDark);
    bed.position.set(0, 1.0, 1.05);
    // 荷台側壁
    for (var wi = 0; wi < 2; wi++) {
      var wx = wi === 0 ? -1.35 : 1.35;
      var wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 4.3), matVDark);
      wall.position.set(wx, 1.4, 1.05);
      g.add(wall);
    }
    var bedBack = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.7, 0.12), matVDark);
    bedBack.position.set(0, 1.4, 3.2);
    g.add(bedBack);
    // 弾薬箱 (荷台上に見える)
    for (var ci = 0; ci < 4; ci++) {
      var crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), matCrate);
      crate.position.set(-0.8 + (ci % 2) * 1.6, 1.6, -0.5 + Math.floor(ci / 2) * 1.5);
      g.add(crate);
    }
    // キャンバス (後部半分)
    var canvas = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.3, 2.0), matCanvas);
    canvas.position.set(0, 1.9, 2.0);
    // フロントガラス
    var windshield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 0.08), matVGlass);
    windshield.position.set(0, 1.85, -3.27);
    g.add(cab, hood, bed, canvas, windshield);
    // ヘッドライト
    for (var hi = 0; hi < 2; hi++) {
      var hx = hi === 0 ? -0.9 : 0.9;
      var hl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 8), matLight);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(hx, 1.05, -4.15);
      g.add(hl);
    }
    // テールランプ
    for (var tli = 0; tli < 2; tli++) {
      var tlx = tli === 0 ? -1.2 : 1.2;
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.04), matTailLight);
      tl.position.set(tlx, 1.3, 3.25);
      g.add(tl);
    }
    // 補給マーク (白星風 — ドア両側)
    for (var mi = 0; mi < 2; mi++) {
      var mx = mi === 0 ? -1.28 : 1.28;
      var mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.5), matMark);
      mark.position.set(mx, 1.5, -2.15);
      g.add(mark);
    }
    // 予備タイヤ (荷台側面)
    var spare = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12), matTire);
    spare.rotation.z = Math.PI / 2;
    spare.position.set(1.45, 1.5, -0.3);
    g.add(spare);
    // 6輪
    var wheels = _addWheelSetV083(g, [
      [-1.24, -2.45], [1.24, -2.45],
      [-1.24, 0.15], [1.24, 0.15],
      [-1.24, 2.15], [1.24, 2.15]
    ], 0.58, 0.4);
    g.traverse(function (m) { if (m.isMesh) m.castShadow = !isMobile; });
    g.position.set(x, terrainH(x, z), z);
    g.rotation.y = rotY;
    scene.add(g);
    var v = baseVehicleState({
      type: 'supply', name: 'M35 補給トラック', obj: g, turret: null, muzzle: null,
      wheels: wheels, glass: windshield,
      yaw: rotY, hp: 350, maxHp: 350, armorV056: 1.0,
      radius: 2.65, maxSpeed: 13, accel: 6.5, turnRate: 1.1,
      fireInterval: 0, camDist: 10, camH: 3.2, dmg: 0, gunRange: 0,
      resupplyRadius: 7,
      seats: [
        mkSeat('driver', -0.55, 1.9, -2.25),
        mkSeat('passenger', 0.55, 1.9, -2.25),
        mkSeat('passenger', 0, 1.7, 0.5)
      ]
    });
    return _finalizeV083(v);
  }

  /* =========================================================
     車両生成ファクトリ — 種別→生成関数マッピング
     ========================================================= */
  function _createBaseVehicle(type, x, z, rotY) {
    switch (type) {
      case 'tank':      return createTank(x, z, rotY);
      case 'technical': return createJeep(x, z, rotY);
      case 'scout':     return createBike(x, z, rotY);
      case 'heli':      return createHeli(x, z, rotY);
      case 'apc':       return createAPCV083(x, z, rotY);
      case 'supply':    return createSupplyTruckV083(x, z, rotY);
      default:          return null;
    }
  }

  /* ---------- 撤破車両(残骸)削除 ---------- */
  function _removeWreckV083(v) {
    if (!v) return;
    if (curVehicle === v) { exitVehicle(true); }
    if (typeof unregisterVehiclePartsV048 === 'function') unregisterVehiclePartsV048(v);
    if (typeof unregisterVehicleDamageV054 === 'function') unregisterVehicleDamageV054(v);
    scene.remove(v.obj);
    var idx = vehicles.indexOf(v);
    if (idx >= 0) vehicles.splice(idx, 1);
  }

  /* =========================================================
     基地車両スペック — ローカル座標 (MILBASE内)
     滑走路は lx=0±11, lz=-100〜+100 → |lx|>15で回避
     格納庫は lx≈-35 → lx=-22で中間配置
     ========================================================= */
  var BASE_SPECS = [
    // Armoured and logistics vehicles occupy marked bays in the motor pool.
    { type: 'tank',      lx: -66, lz: 102, lyaw: 0, mobileSkip: false },
    { type: 'technical', lx: -66, lz: 116, lyaw: 0, mobileSkip: true  },
    { type: 'scout',     lx: -50, lz: 116, lyaw: 0, mobileSkip: true  },
    { type: 'heli',      lx:  51, lz: -72, lyaw: 0, mobileSkip: true  },
    { type: 'apc',       lx: -50, lz: 102, lyaw: 0, mobileSkip: false },
    { type: 'supply',    lx: -34, lz: 102, lyaw: 0, mobileSkip: false }
  ];

  /* ---------- 両MILBASEに基地車両スポーン ---------- */
  function _spawnBaseVehicles() {
    v083.baseVehicles.length = 0;
    var bases = [
      { mb: MILBASE_BLUE, team: 1 },
      { mb: MILBASE_RED,  team: -1 }
    ];
    for (var bi = 0; bi < bases.length; bi++) {
      var b = bases[bi];
      for (var si = 0; si < BASE_SPECS.length; si++) {
        var spec = BASE_SPECS[si];
        if (isMobile && spec.mobileSkip) continue;
        var p = _l2w(b.mb, spec.lx, spec.lz);
        var yaw = _l2wYaw(b.mb, spec.lyaw);
        var v = _createBaseVehicle(spec.type, p.x, p.z, yaw);
        if (v) {
          v083.baseVehicles.push({
            type: spec.type, x: p.x, z: p.z, rotY: yaw, team: b.team,
            vehicle: v, destroyed: false, respawnT: 0
          });
        }
      }
    }
  }

  /* =========================================================
     spawnVehicles フック — ロード時に即座にラップ
     ========================================================= */
  if (typeof spawnVehicles === 'function' && !_origSpawnVehiclesV083) {
    _origSpawnVehiclesV083 = spawnVehicles;
    spawnVehicles = function () {
      _origSpawnVehiclesV083.apply(this, arguments);
      _spawnBaseVehicles();
    };
  }

  /* =========================================================
     リスポーン更新 — 破壊後90秒で元位置に再生成
     ========================================================= */
  function _updateRespawnV083(dt) {
    for (var i = 0; i < v083.baseVehicles.length; i++) {
      var bv = v083.baseVehicles[i];
      if (!bv.vehicle) continue;
      if (bv.vehicle.alive) {
        bv.destroyed = false;
        bv.respawnT = 0;
        continue;
      }
      // 破壊済み → カウント開始
      if (!bv.destroyed) {
        bv.destroyed = true;
        bv.respawnT = 0;
      }
      bv.respawnT += dt;
      if (bv.respawnT >= 90) {
        // 残骸除去
        _removeWreckV083(bv.vehicle);
        // 同位置に再スポーン
        var nv = _createBaseVehicle(bv.type, bv.x, bv.z, bv.rotY);
        bv.vehicle = nv;
        bv.destroyed = false;
        bv.respawnT = 0;
        if (typeof addFeed === 'function') {
          var label = { tank: '戦車', technical: 'テクニカル', scout: '偵察車',
                        heli: 'ヘリ', apc: 'APC', supply: '補給トラック' };
          addFeed('基地車両リスポーン: ' + (label[bv.type] || bv.type), 'blue');
        }
      }
    }
  }

  /* =========================================================
     補給トラック機能 — 近接で弾薬・手榴弾・HPを回復
     ========================================================= */
  function _updateSupplyV083(dt) {
    if (typeof player === 'undefined' || !player || !player.alive) return;
    for (var i = 0; i < v083.baseVehicles.length; i++) {
      var bv = v083.baseVehicles[i];
      if (!bv.vehicle || !bv.vehicle.alive) continue;
      if (bv.type !== 'supply') continue;
      var v = bv.vehicle;
      var d = Math.hypot(v.obj.position.x - player.pos.x, v.obj.position.z - player.pos.z);
      var radius = (v.resupplyRadius || 7) + v.radius;
      if (d >= radius) continue;
      // 弾薬補給
      if (typeof weaponDef === 'function') {
        var w = weaponDef();
        if (weapon.reserve < w.reserve) {
          weapon.reserve = Math.min(w.reserve, weapon.reserve + w.magSize * 1.5 * dt);
          if (typeof updateAmmoUI === 'function') updateAmmoUI();
        }
      }
      // 手榴弾補給
      if (typeof grenades !== 'undefined' && grenades.count < grenades.max) {
        grenades.count = Math.min(grenades.max, grenades.count + 0.4 * dt);
      }
      // HP回復
      if (player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 5 * dt);
        if (typeof updateHpUI === 'function') updateHpUI();
      }
      // 一定間隔でフィードバック
      v083.resupplyT += dt;
      if (v083.resupplyT > 5) {
        v083.resupplyT = 0;
        if (typeof addFeed === 'function') addFeed('補給トラックから弾薬補給中', 'blue');
      }
      // パーティクル
      if (Math.random() < dt * 3) {
        spawnParticles(
          v.obj.position.clone().setY(v.obj.position.y + 1.2),
          0xffd257, 1, 1.2, 0.5
        );
      }
    }
  }

  /* =========================================================
     公開API
     ========================================================= */
  v083.reset = function () {
    // spawnVehiclesフックはロード時に実施済み
    // ここでは追跡状態のリセットのみ (spawnVehicles内でbaseVehicles再構築)
    v083.resupplyT = 0;
    // 残存エントリのタイマーリセット
    for (var i = 0; i < v083.baseVehicles.length; i++) {
      v083.baseVehicles[i].destroyed = false;
      v083.baseVehicles[i].respawnT = 0;
    }
  };

  v083.update = function (dt) {
    _updateRespawnV083(dt);
    _updateSupplyV083(dt);
  };

})();

/* ---------- 公開API (main.jsから呼ばれるスタンドアロン関数) ---------- */
function resetV083() { if (v083.reset) v083.reset(); }
function updateV083(dt) { if (v083.update) v083.update(dt); }
