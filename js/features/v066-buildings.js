'use strict';
/* STEEL FRONT v0.6.6 — 建物種類差別化 / 外観ディテールアップ / 屋上ディテール強化
   ──────────────────────────────────────────────
   1. 建物の種類による差別化:
      建物マテリアル(buildingTexA/B/C, brickTex)とサイズから建物種別を判定し、
      商業(commercial) / 住宅(residential) / 工業(industrial) / 戸建(house) の
      4タイプに分類。タイプ別に外壁アクセントカラー・ファサード装飾・屋上設備を
      差別化し、地区ごとの景観バリエーションを強調。
   2. 外観ディテールアップ:
      タイプ別ファサード装飾 — 商業: 店舗看板帯+下行管 / 住宅: バルコニー+窓AC /
      工業: 配管ダクト+バルブ / 戸建: 花台+TVアンテナ。
      全大型建物に雨樋(ダウンスパウト)を追加し外壁に縦のアクセントを付与。
   3. 屋上ディテール強化:
      ソーラーパネル / 衛星アンテナ(低速回転) / 排気ファン(回転) /
      アンテナ塔+航空障害灯(点滅) / HVACダクト / 屋上換気口。
      カメラ距離220m以遠のディテールは非表示で描画負荷を軽減。

   ※ 既存ソース(map-objects.js / map-districts.js)は変更せず、resetV066()で
      シーン走査による実行時ディテール追加を行う。v065のPBR化後に実行されるため、
      マテリアルはmap参照で建物種別を判定(アップグレード後もmap参照は保持)。 */

// ============================================================
//  State
// ============================================================
var v066 = {
  groups: [],      // {cx, cz, visible, meshes:[]} 建物ごとのディテールグループ
  fans: [],        // {mesh, speed, grp} 回転する排気ファン
  lights: [],      // {mesh, per, off, grp} 点滅する航空障害灯
  dishes: [],      // {mesh, base, range, off, grp} 回転する衛星アンテナ
  initialized: false,
  visT: 0
};

// ============================================================
//  Resources (materials + geometries — 初回のみ生成)
// ============================================================
var _mV066 = null, _gV066 = null;

function _initResV066() {
  if (_mV066) return;
  _mV066 = {
    metal:    new THREE.MeshStandardMaterial({ color: 0x6a6e72, metalness: 0.8, roughness: 0.4 }),
    dark:     new THREE.MeshStandardMaterial({ color: 0x2a2e30, metalness: 0.7, roughness: 0.5 }),
    solar:    new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.5, roughness: 0.22 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x8a8a82, metalness: 0.0, roughness: 0.9 }),
    rust:     new THREE.MeshStandardMaterial({ color: 0x6b4530, metalness: 0.4, roughness: 0.85 }),
    redLight: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    glass:    new THREE.MeshStandardMaterial({ color: 0x4a6a8a, metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.6 }),
    wood:     new THREE.MeshStandardMaterial({ color: 0x6b4e32, metalness: 0.0, roughness: 0.85 }),
    plant:    new THREE.MeshStandardMaterial({ color: 0x3a5a28, metalness: 0.0, roughness: 0.9 }),
    signs: [
      new THREE.MeshStandardMaterial({ color: 0x1a4a7a, metalness: 0.3, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x7a2020, metalness: 0.3, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x1a6a3a, metalness: 0.3, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x6a4a1a, metalness: 0.3, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x4a2a6a, metalness: 0.3, roughness: 0.5 })
    ]
  };
  _gV066 = {
    pipe:        new THREE.CylinderGeometry(0.1, 0.1, 1, 6),
    panel:       new THREE.BoxGeometry(2.0, 0.08, 1.3),
    panelPost:   new THREE.BoxGeometry(0.06, 0.4, 0.06),
    dish:        new THREE.CylinderGeometry(0.7, 0.03, 0.45, 12),
    dishArm:     new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5),
    ventHousing: new THREE.CylinderGeometry(0.4, 0.4, 0.4, 8),
    fanBlade:    new THREE.BoxGeometry(0.3, 0.02, 0.07),
    antMast:     new THREE.CylinderGeometry(0.035, 0.035, 1, 4),
    antArm:      new THREE.BoxGeometry(0.8, 0.03, 0.03),
    balcony:     new THREE.BoxGeometry(1, 0.1, 0.7),
    rail:        new THREE.BoxGeometry(1, 0.04, 0.04),
    railPost:    new THREE.BoxGeometry(0.04, 0.65, 0.04),
    acUnit:      new THREE.BoxGeometry(0.9, 0.55, 0.45),
    duct:        new THREE.BoxGeometry(0.35, 0.35, 1),
    ductElbow:   new THREE.CylinderGeometry(0.18, 0.18, 0.4, 6),
    flower:      new THREE.BoxGeometry(0.55, 0.22, 0.18),
    sign:        new THREE.BoxGeometry(1, 0.85, 0.12),
    accent:      new THREE.BoxGeometry(1, 0.5, 0.06),
    guardPost:   new THREE.BoxGeometry(0.06, 0.65, 0.06),
    tank:        new THREE.CylinderGeometry(0.6, 0.6, 1, 8),
    light:       new THREE.SphereGeometry(0.09, 6, 4),
    ventCowl:    new THREE.ConeGeometry(0.3, 0.4, 6),
    tvAnt:       new THREE.CylinderGeometry(0.02, 0.02, 1.2, 3)
  };
}

// ============================================================
//  Helpers
// ============================================================
function _hashPosV066(x, z) {
  var h = (x * 73856093) ^ (z * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function _addMeshV066(geo, mat, x, y, z, grp, opt) {
  opt = opt || {};
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opt.rx != null) m.rotation.x = opt.rx;
  if (opt.ry != null) m.rotation.y = opt.ry;
  if (opt.rz != null) m.rotation.z = opt.rz;
  if (opt.sx != null || opt.sy != null || opt.sz != null)
    m.scale.set(opt.sx != null ? opt.sx : 1, opt.sy != null ? opt.sy : 1, opt.sz != null ? opt.sz : 1);
  m.castShadow = m.receiveShadow = !isMobile;
  scene.add(m);
  grp.meshes.push(m);
  return m;
}

// ============================================================
//  建物種別判定 — マテリアルのmap参照 + サイズから
// ============================================================
function _buildingTypeV066(mesh) {
  var mat = mesh.material;
  if (!mat || !mesh.geometry || !mesh.geometry.parameters) return null;
  var w = mesh.geometry.parameters.width, h = mesh.geometry.parameters.height, d = mesh.geometry.parameters.depth;
  if (!w || !h || !d) return null;
  // 建物本体: 高さ3以上、幅奥行きともに4以上 (薄壁・小物を除外)
  if (h < 3 || w < 4 || d < 4) return null;
  var map = mat.map;
  if (typeof buildingTexA === 'undefined') return null;
  if (map === buildingTexA) return 'commercial';
  if (map === buildingTexB) return 'residential';
  if (map === buildingTexC) return 'industrial';
  if (map === brickTex) return 'house';
  return null;
}

// ============================================================
//  タイプ別アクセント — 外壁の色帯で建物種別を視覚的に差別化
// ============================================================
function _addTypeAccentV066(grp, x, z, w, d, gy, h, type, hash) {
  var accentMat, stripeY;
  if (type === 'commercial') {
    accentMat = _mV066.signs[0];             // 青: オフィスビル
    stripeY = gy + h * 0.82;
  } else if (type === 'residential') {
    accentMat = _mV066.signs[2];             // 緑: マンション
    stripeY = gy + h * 0.5;
  } else if (type === 'industrial') {
    accentMat = _mV066.signs[3];             // 黄褐: 工場・倉庫
    stripeY = gy + h * 0.18;
  } else {
    return;
  }
  _addMeshV066(_gV066.accent, accentMat, x, stripeY, z + d / 2 + 0.08, grp, { sx: w * 0.88 });
  _addMeshV066(_gV066.accent, accentMat, x, stripeY, z - d / 2 - 0.08, grp, { sx: w * 0.88 });
}

// ============================================================
//  雨樋(ダウンスパウト) — 全大型建物の隅に縦パイプ
// ============================================================
function _addDownspoutsV066(grp, x, z, w, d, gy, h) {
  var corners = [
    [-w / 2 + 0.15, -d / 2 + 0.15], [w / 2 - 0.15, -d / 2 + 0.15],
    [-w / 2 + 0.15, d / 2 - 0.15],  [w / 2 - 0.15, d / 2 - 0.15]
  ];
  var hash = _hashPosV066(x * 1.3, z * 1.7);
  var pickStart = Math.floor(hash * 2);     // 0=前面2隅, 2=背面2隅
  for (var i = 0; i < 2; i++) {
    var c = corners[pickStart + i];
    _addMeshV066(_gV066.pipe, _mV066.metal, x + c[0], gy + h / 2, z + c[1], grp, { sy: h * 0.92 });
  }
}

// ============================================================
//  商業ビル: 店舗看板帯 (1階部分)
// ============================================================
function _addShopSignageV066(grp, x, z, w, d, gy, hash) {
  var signMat = _mV066.signs[Math.floor(hash * _mV066.signs.length) % _mV066.signs.length];
  var sw = w * 0.75;
  // 前面看板
  _addMeshV066(_gV066.sign, signMat, x, gy + 2.6, z + d / 2 + 0.1, grp, { sx: sw });
  _addMeshV066(_gV066.rail, _mV066.dark, x, gy + 3.15, z + d / 2 + 0.12, grp, { sx: sw + 0.1 });
  _addMeshV066(_gV066.rail, _mV066.dark, x, gy + 2.05, z + d / 2 + 0.12, grp, { sx: sw + 0.1 });
  // 背面に小看板 (ハッシュで有無)
  if (hash > 0.4)
    _addMeshV066(_gV066.sign, signMat, x, gy + 2.6, z - d / 2 - 0.1, grp, { sx: w * 0.5 });
}

// ============================================================
//  住宅ビル: バルコニー (中階に突出スラブ+手すり)
// ============================================================
function _addBalconiesV066(grp, x, z, w, d, gy, h, hash) {
  var floors = Math.floor(h / 3.4);
  for (var f = 1; f < Math.min(floors, 4); f++) {
    var by = gy + 2.0 + f * 3.0;
    if (by > gy + h - 1.5) break;
    // ハッシュで階を選択 (全階にバルコニーではない)
    if (_hashPosV066(x + f * 7.3, z + f * 3.7) > 0.45) {
      var bw = Math.min(w * 0.35, 4.0);
      var bx = x + (hash - 0.5) * w * 0.25;
      // スラブ
      _addMeshV066(_gV066.balcony, _mV066.concrete, bx, by, z + d / 2 + 0.35, grp, { sx: bw });
      // 前面手すり
      _addMeshV066(_gV066.rail, _mV066.metal, bx, by + 0.35, z + d / 2 + 0.65, grp, { sx: bw });
      // 側面手すり
      _addMeshV066(_gV066.rail, _mV066.metal, bx - bw / 2, by + 0.35, z + d / 2 + 0.35, grp, { sx: 0.6, ry: Math.PI / 2 });
      _addMeshV066(_gV066.rail, _mV066.metal, bx + bw / 2, by + 0.35, z + d / 2 + 0.35, grp, { sx: 0.6, ry: Math.PI / 2 });
      // 手すり支柱
      for (var p = 0; p < 3; p++) {
        var px = bx - bw / 2 + (p / 2) * bw;
        _addMeshV066(_gV066.railPost, _mV066.metal, px, by + 0.35, z + d / 2 + 0.65, grp);
      }
    }
  }
}

// ============================================================
//  住宅ビル: 窓AC室外機 (外壁面に小ボックス)
// ============================================================
function _addWindowAcV066(grp, x, z, w, d, gy, h, hash) {
  var floors = Math.floor(h / 3.4);
  var nUnits = Math.min(3, Math.floor(w / 4));
  for (var i = 0; i < nUnits; i++) {
    var fh = _hashPosV066(x + i * 11.3, z + i * 5.7);
    var f = 1 + Math.floor(fh * Math.max(1, floors - 1));
    if (f >= Math.min(floors, 4)) f = Math.min(floors, 4) - 1;
    var ay = gy + 2.0 + f * (h - 2.6) / Math.max(1, floors - 0.5) - 1.2;
    if (ay < gy + 1.5) ay = gy + 1.5;
    var ax = x - w / 2 + (i + 0.5) * w / nUnits;
    _addMeshV066(_gV066.acUnit, _mV066.dark, ax, ay, z + d / 2 + 0.25, grp);
    _addMeshV066(_gV066.rail, _mV066.metal, ax, ay - 0.35, z + d / 2 + 0.15, grp, { sx: 0.6 });
  }
}

// ============================================================
//  工業ビル: 配管ダクト + バルブ (外壁に露出配管)
// ============================================================
function _addIndustrialPipesV066(grp, x, z, w, d, gy, h, hash) {
  // 縦型配管 (前面に2本)
  for (var i = 0; i < 2; i++) {
    var px = x - w * 0.3 + i * w * 0.6;
    _addMeshV066(_gV066.pipe, _mV066.rust, px, gy + h * 0.45, z + d / 2 + 0.2, grp, { sy: h * 0.85 });
  }
  // 横型ダクト (中段)
  var ductY = gy + h * 0.5;
  _addMeshV066(_gV066.duct, _mV066.metal, x + w * 0.1, ductY, z + d / 2 + 0.18, grp, { sx: w * 0.5, sz: 0.35 });
  // ダクト端の立ち上げ
  _addMeshV066(_gV066.ductElbow, _mV066.metal, x + w * 0.35, ductY + 0.25, z + d / 2 + 0.18, grp, { rx: Math.PI / 2 });
  // バルブ風の小箱
  _addMeshV066(_gV066.acUnit, _mV066.rust, x - w * 0.2, gy + h * 0.28, z + d / 2 + 0.22, grp, { sx: 0.6, sy: 0.5 });
}

// ============================================================
//  戸建: 花台 + TVアンテナ (回転を考慮したローカル座標)
// ============================================================
function _addHouseDetailsV066(grp, x, z, w, d, gy, h, rotY, hash) {
  var cos = Math.cos(rotY), sin = Math.sin(rotY);
  var lp = function (lx, ly, lz) {
    return [x + lx * cos + lz * sin, gy + ly, z - lx * sin + lz * cos];
  };
  // 花台 (窓下、前面左右)
  var sides = [-w * 0.28, w * 0.28];
  for (var si = 0; si < sides.length; si++) {
    var s = sides[si];
    var p1 = lp(s, h * 0.32, d / 2 + 0.12);
    _addMeshV066(_gV066.flower, _mV066.wood, p1[0], p1[1], p1[2], grp, { ry: rotY });
    var p2 = lp(s, h * 0.42, d / 2 + 0.12);
    _addMeshV066(_gV066.flower, _mV066.plant, p2[0], p2[1], p2[2], grp, { ry: rotY, sy: 0.6, sx: 0.7 });
  }
  // TVアンテナ (屋根上)
  var p3 = lp(-w * 0.15, h + h * 0.35, -d * 0.1);
  _addMeshV066(_gV066.tvAnt, _mV066.dark, p3[0], p3[1], p3[2], grp, { ry: rotY });
  var p4 = lp(-w * 0.15, h + h * 0.42, -d * 0.1);
  _addMeshV066(_gV066.antArm, _mV066.metal, p4[0], p4[1], p4[2], grp, { ry: rotY });
}

// ============================================================
//  屋上ディテール強化 — ソーラー/衛星アンテナ/排気ファン/アンテナ塔/ダクト
// ============================================================
function _addRooftopV066(grp, x, z, w, d, roofY, h, type, hash) {
  // 屋上上面 = 屋根スラブ頂 (body頂+0.7)

  // --- ソーラーパネル (商業/工業優先、住宅はハッシュ条件) ---
  if (type === 'commercial' || type === 'industrial' || (type === 'residential' && hash > 0.4)) {
    var nPanels = 2 + Math.floor(hash * 2.5);
    var pStartX = x - w * 0.25;
    var pZ = z + d * 0.12;
    for (var i = 0; i < nPanels; i++) {
      var pxi = pStartX + i * 2.1;
      if (Math.abs(pxi - x) > w / 2 - 1.3) continue;
      _addMeshV066(_gV066.panelPost, _mV066.metal, pxi - 0.8, roofY + 0.2, pZ, grp);
      _addMeshV066(_gV066.panelPost, _mV066.metal, pxi + 0.8, roofY + 0.2, pZ, grp);
      _addMeshV066(_gV066.panel, _mV066.solar, pxi, roofY + 0.35, pZ, grp, { rx: -Math.PI / 7 });
    }
  }

  // --- 衛星アンテナ (住宅/商業, ハッシュ条件) ---
  if ((type === 'residential' || type === 'commercial') && hash > 0.3) {
    var dx = x - w * 0.2 + (hash - 0.5) * w * 0.25;
    var dz = z - d * 0.2;
    var dishMesh = _addMeshV066(_gV066.dish, _mV066.metal, dx, roofY + 0.7, dz, grp, { rx: Math.PI / 2.5 });
    _addMeshV066(_gV066.dishArm, _mV066.metal, dx, roofY + 0.5, dz, grp);
    v066.dishes.push({ mesh: dishMesh, base: 0, range: 0.6, off: hash * 7, grp: grp });
  }

  // --- 排気ファン (工業/住宅, ハッシュ条件) ---
  if ((type === 'industrial' || type === 'residential') && hash > 0.4) {
    var fx = x + w * 0.15, fz = z + d * 0.25;
    _addMeshV066(_gV066.ventHousing, _mV066.metal, fx, roofY + 0.25, fz, grp);
    var fanGrp = new THREE.Group();
    for (var b = 0; b < 4; b++) {
      var blade = new THREE.Mesh(_gV066.fanBlade, _mV066.dark);
      blade.rotation.y = (b / 4) * Math.PI * 2;
      blade.castShadow = !isMobile;
      fanGrp.add(blade);
    }
    fanGrp.position.set(fx, roofY + 0.4, fz);
    scene.add(fanGrp);
    grp.meshes.push(fanGrp);
    v066.fans.push({ mesh: fanGrp, speed: 1.5 + hash * 2.5, grp: grp });
  }

  // --- アンテナ塔 + 航空障害灯 (商業/工業の高層, h>9) ---
  if ((type === 'commercial' || type === 'industrial') && h > 9) {
    var ax = x - w * 0.3, az = z + d * 0.1;
    var mastH = 3.0 + hash * 2;
    _addMeshV066(_gV066.antMast, _mV066.dark, ax, roofY + mastH / 2, az, grp, { sy: mastH });
    _addMeshV066(_gV066.antArm, _mV066.metal, ax, roofY + mastH * 0.5, az, grp);
    _addMeshV066(_gV066.antArm, _mV066.metal, ax, roofY + mastH * 0.75, az, grp);
    var lightMesh = _addMeshV066(_gV066.light, _mV066.redLight, ax, roofY + mastH + 0.15, az, grp);
    v066.lights.push({ mesh: lightMesh, per: 2.0 + hash * 1.5, off: hash * 3, grp: grp });
  }

  // --- HVACダクト (全タイプ, ハッシュ条件) ---
  if (hash > 0.2) {
    var ductLen = w * 0.35;
    _addMeshV066(_gV066.duct, _mV066.metal, x + w * 0.12, roofY + 0.2, z - d * 0.2, grp, { sx: ductLen, sz: 0.35 });
    _addMeshV066(_gV066.ductElbow, _mV066.metal, x + w * 0.12 + ductLen / 2, roofY + 0.4, z - d * 0.2, grp, { rx: Math.PI / 2 });
  }

  // --- 屋上換気口 (全タイプ, 2個) ---
  for (var v = 0; v < 2; v++) {
    var vx = x + (v === 0 ? -w * 0.12 : w * 0.08);
    var vz = z + (v === 0 ? d * 0.28 : -d * 0.28);
    _addMeshV066(_gV066.ventCowl, _mV066.metal, vx, roofY + 0.25, vz, grp);
  }
}

// ============================================================
//  シーン走査で建物を識別しディテールを追加
// ============================================================
function _enhanceBuildingsV066() {
  scene.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    var type = _buildingTypeV066(o);
    if (!type) return;

    var geo = o.geometry;
    var w = geo.parameters.width, h = geo.parameters.height, d = geo.parameters.depth;
    var x = o.position.x, z = o.position.z;
    var gy = o.position.y - h / 2;
    var roofY = o.position.y + h / 2 + 0.7;  // 屋根スラブ頂
    var hash = _hashPosV066(x, z);

    var grp = { cx: x, cz: z, visible: true, meshes: [] };
    v066.groups.push(grp);

    // タイプ別アクセント帯 (建物種別の視覚的差別化)
    _addTypeAccentV066(grp, x, z, w, d, gy, h, type, hash);

    // タイプ別ファサード装飾
    if (type === 'commercial') {
      _addDownspoutsV066(grp, x, z, w, d, gy, h);
      _addShopSignageV066(grp, x, z, w, d, gy, hash);
    } else if (type === 'residential') {
      _addDownspoutsV066(grp, x, z, w, d, gy, h);
      _addBalconiesV066(grp, x, z, w, d, gy, h, hash);
      _addWindowAcV066(grp, x, z, w, d, gy, h, hash);
    } else if (type === 'industrial') {
      _addDownspoutsV066(grp, x, z, w, d, gy, h);
      _addIndustrialPipesV066(grp, x, z, w, d, gy, h, hash);
    } else if (type === 'house') {
      _addHouseDetailsV066(grp, x, z, w, d, gy, h, o.rotation.y, hash);
    }

    // 屋上ディテール強化 (戸建・薄壁以外)
    if (type !== 'house' && w >= 8 && d >= 8) {
      _addRooftopV066(grp, x, z, w, d, roofY, h, type, hash);
    }
  });
}

// ============================================================
//  reset / update
// ============================================================
function resetV066() {
  if (v066.initialized) return;
  if (isMobile) return;              // モバイルは負荷軽減のためスキップ
  v066.initialized = true;
  _initResV066();
  _enhanceBuildingsV066();
}

function updateV066(dt) {
  if (!v066.initialized) return;

  // 可視性更新 (0.2秒間隔でカメラ距離判定)
  v066.visT += dt;
  if (v066.visT >= 0.2) {
    v066.visT = 0;
    var cx = camera.position.x, cz = camera.position.z;
    for (var i = 0; i < v066.groups.length; i++) {
      var g = v066.groups[i];
      g.visible = Math.hypot(g.cx - cx, g.cz - cz) < 220;
      for (var j = 0; j < g.meshes.length; j++) g.meshes[j].visible = g.visible;
    }
  }

  // アニメーション (可視グループのみ)
  for (var i = 0; i < v066.fans.length; i++) {
    var f = v066.fans[i];
    if (!f.grp.visible) continue;
    f.mesh.rotation.y += f.speed * dt;
  }
  for (var i = 0; i < v066.lights.length; i++) {
    var l = v066.lights[i];
    if (!l.grp.visible) continue;
    l.mesh.visible = ((elapsed + l.off) % l.per) < l.per * 0.35;
  }
  for (var i = 0; i < v066.dishes.length; i++) {
    var d = v066.dishes[i];
    if (!d.grp.visible) continue;
    d.mesh.rotation.y = d.base + Math.sin(elapsed * 0.12 + d.off) * d.range;
  }
}
