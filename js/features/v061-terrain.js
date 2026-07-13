'use strict';
/* STEEL FRONT v0.6.1 — 地形テクスチャ高解像度化/レイヤー /
   法線マップ風疑似陰影 / 岩・地形凹凸ジオメトリ
   ──────────────────────────────────────────────
   1. 地形テクスチャ: 256px→512px 高解像度化 + 草/土/岩/砂/亀裂レイヤー合成
   2. 法線マップ風疑似陰影: 頂点法線と太陽方向の内積で勾配陰影 +
      斜面に応じた岩色ブレンド + 微細ノイズでバンプマップ風質感
   3. 岩ジオメトリ: Icosahedron/Dodecahedron 複合クラスタ +
      地表小凸起(マイクロバンプ)で平坦部を打破 */

// ============================================================
//  State
// ============================================================
const v061 = {
  groundMesh: null,
  detailTex: null,
  rocksAdded: 0,
  bumpsAdded: 0,
  enhanced: false
};

// ============================================================
//  1. 高解像度レイヤーテクスチャ (512px)
//     草ベース + 土パッチ + 岩パッチ + 草丛 + 微細ノイズ + 亀裂
// ============================================================
function _createLayeredTerrainTexV061() {
  var S = 512;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var g = c.getContext('2d');

  // --- Layer 0: base grass ---
  g.fillStyle = '#6f6d54';
  g.fillRect(0, 0, S, S);

  // --- Layer 1: dirt patches (medium scale) ---
  for (var i = 0; i < 70; i++) {
    var x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 65;
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(122,112,80,.5)');
    gr.addColorStop(1, 'rgba(122,112,80,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  // --- Layer 2: rock patches (gray) ---
  for (var i = 0; i < 35; i++) {
    var x = Math.random() * S, y = Math.random() * S, r = 15 + Math.random() * 45;
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(110,112,105,.42)');
    gr.addColorStop(1, 'rgba(110,112,105,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  // --- Layer 3: grass tufts (fine scale) ---
  for (var i = 0; i < 1200; i++) {
    g.fillStyle = 'rgba(' + (70 + Math.random() * 50 | 0) + ',' +
      (78 + Math.random() * 45 | 0) + ',' + (45 + Math.random() * 35 | 0) + ',.55)';
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }

  // --- Layer 4: dark moss spots ---
  for (var i = 0; i < 40; i++) {
    var x = Math.random() * S, y = Math.random() * S, r = 8 + Math.random() * 20;
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(50,68,38,.45)'); gr.addColorStop(1, 'rgba(50,68,38,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  // --- Layer 5: fine pixel noise (pseudo normal-map micro detail) ---
  var img = g.getImageData(0, 0, S, S);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() - 0.5) * 22;
    d[i]     = Math.max(0, Math.min(255, d[i]     + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);

  // --- Layer 6: surface cracks ---
  g.strokeStyle = 'rgba(40,35,25,.28)';
  g.lineWidth = 1;
  for (var i = 0; i < 24; i++) {
    g.beginPath();
    var x = Math.random() * S, y = Math.random() * S;
    g.moveTo(x, y);
    for (var j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 45;
      y += (Math.random() - 0.5) * 45;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // --- Layer 7: small pebbles ---
  for (var i = 0; i < 60; i++) {
    var x = Math.random() * S, y = Math.random() * S, r = 1.5 + Math.random() * 3;
    g.fillStyle = 'rgba(' + (100 + Math.random() * 30 | 0) + ',' +
      (100 + Math.random() * 30 | 0) + ',' + (95 + Math.random() * 30 | 0) + ',.6)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.beginPath(); g.arc(x + 1, y + 1, r * 0.6, 0, 7); g.fill();
  }

  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(80, 80);   // high repeat for finer tiling
  // v0.6.0 最適化を直接適用 (v060 init より後に生成されるため)
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// ============================================================
//  2. 法線マップ風疑似陰影 — 地形頂点カラーを勾配ベースで強化
//     頂点法線×太陽方向の内積で陰影 + 斜面ほど岩色へブレンド +
//     微細ノイズでバンプマップ風の表面質感を付与
// ============================================================
function _enhanceTerrainColorsV061() {
  var mesh = v061.groundMesh;
  if (!mesh) return;
  var geo = mesh.geometry;
  var pos = geo.attributes.position;
  var normals = geo.attributes.normal;
  var colors = geo.attributes.color;
  if (!pos || !normals || !colors) return;

  // 太陽方向 (core.js の sun.position に一致)
  var sunDir = new THREE.Vector3(90, 130, 45).normalize();

  // ベース色 (map-terrain.js の頂点カラー定義に一致)
  var cGrass  = new THREE.Color(0x6d7a4e);
  var cGrass2 = new THREE.Color(0x5d6f45);
  var cDirt   = new THREE.Color(0x7a7050);
  var cRock   = new THREE.Color(0x777872);
  var cRoad   = new THREE.Color(0x46484c);
  var cSand   = new THREE.Color(0x9a8c66);
  var cBed    = new THREE.Color(0x4a5648);
  var tmp = new THREE.Color();

  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    var nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);

    // --- ベース色 (height zone) ---
    if (y < WATER_Y - 0.3) tmp.copy(cBed);
    else if (y < WATER_Y + 1.0) tmp.copy(cSand);
    else if (onRoad(x, z)) tmp.copy(cRoad);
    else if (y > 13) tmp.copy(cRock);
    else if (y > 7) tmp.copy(cDirt);
    else tmp.copy(((Math.sin(x * 0.2) + Math.cos(z * 0.23)) > 0.4) ? cGrass2 : cGrass);

    // --- 斜面ブレンド: 急勾配ほど岩色へ (法線マップ風の地形質感) ---
    var slope = 1 - ny;   // 0=平坦, 1=垂直
    if (slope > 0.35 && y > WATER_Y + 1.0 && !onRoad(x, z)) {
      var blend = Math.min(1, (slope - 0.35) / 0.35);
      tmp.lerp(cRock, blend * 0.65);
    }

    // --- 疑似法線陰影: 法線と太陽方向の内積で明暗 ---
    var dot = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
    var shade = 0.72 + dot * 0.28;   // 0.44～1.0 の範囲

    // --- 微細バンプノイズ (高周波) ---
    var bump = (Math.sin(x * 1.3) * Math.cos(z * 1.7)
              + Math.sin(x * 2.1 + 5) * Math.cos(z * 1.9)) * 0.06;

    var r = tmp.r * shade + bump;
    var g2 = tmp.g * shade + bump;
    var b = tmp.b * shade + bump;
    colors.setXYZ(i,
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g2)),
      Math.max(0, Math.min(1, b))
    );
  }
  colors.needsUpdate = true;
  v061.enhanced = true;
}

// ============================================================
//  3a. 岩ジオメトリ多様化 — Icosahedron + Dodecahedron 複合クラスタ
// ============================================================
function _addRockVarietyV061() {
  var icoGeo  = new THREE.IcosahedronGeometry(1, 0);
  var dodecaGeo = new THREE.DodecahedronGeometry(1, 0);
  // 既存岩スポットの近傍 + 新規クラスタ位置
  // v0.8.0: 全座標1.3倍拡張 (旧値は git 履歴参照)
  var spots = [
    [-150, -72], [-137, -150], [150, 72], [98, -228], [-72, 241],
    [163, 163], [-306, 59], [59, 306], [306, -59], [-59, -306],
    [189, -59], [-189, -20], [33, 163], [-98, 98], [124, -111],
    [241, 59], [-241, -111], [-150, 254], [319, 137], [137, -293],
    [-403, 208], [403, -143], [208, 403], [-208, -403], [377, 247],
    // 新規クラスター (空白地帯の補強)
    [-78, -65], [104, 39], [-117, 260], [260, -260], [-260, 260],
    [0, -195], [195, 0], [-195, 104], [65, -260], [-65, 325]
  ];

  for (var si = 0; si < spots.length; si++) {
    var cx = spots[si][0], cz = spots[si][1];
    if (onRoad(cx, cz) || isWater(cx, cz)) continue;
    // クラスタ: 1〜3個の岩を散らす
    var n = 1 + Math.floor(Math.random() * 3);
    for (var r = 0; r < n; r++) {
      var x = cx + (Math.random() - 0.5) * 9;
      var z = cz + (Math.random() - 0.5) * 9;
      if (onRoad(x, z) || isWater(x, z)) continue;
      var s = 0.8 + Math.random() * 2.5;
      var geo = Math.random() < 0.5 ? icoGeo : dodecaGeo;
      var m = new THREE.Mesh(geo, matRock);
      var gy = terrainH(x, z);
      m.position.set(x, gy + s * 0.35, z);
      m.scale.set(s, s * (0.5 + Math.random() * 0.6), s);
      m.rotation.set(Math.random(), Math.random() * 3, Math.random());
      m.castShadow = !isMobile;
      m.receiveShadow = !isMobile;
      scene.add(m);
      solidMeshes.push(m);
      obstacles.push({ minX: x - s * 0.7, maxX: x + s * 0.7, minZ: z - s * 0.7, maxZ: z + s * 0.7, y0: gy, h: gy + s });
      v061.rocksAdded++;
    }
  }
}

// ============================================================
//  3b. 地形マイクロバンプ — 地表に埋まる小岩で平坦部を打破
//      (衝突判定なし — 純粋に視覚的な凹凸表現)
// ============================================================
function _addTerrainBumpsV061() {
  var bumpGeo = new THREE.IcosahedronGeometry(1, 0);
  var matBump = new THREE.MeshLambertMaterial({ color: 0x7a7c75 });
  var placed = 0, tries = 0;
  while (placed < 55 && tries < 400) {
    tries++;
    var x = (Math.random() * 2 - 1) * (WORLD - 25);
    var z = (Math.random() * 2 - 1) * (WORLD - 25);
    if (onRoad(x, z) || isWater(x, z)) continue;
    var nearFlag = false;
    for (var fi = 0; fi < flags.length; fi++) {
      if (Math.hypot(x - flags[fi].x, z - flags[fi].z) < 22) { nearFlag = true; break; }
    }
    if (nearFlag) continue;
    if (Math.hypot(x - HQ_BLUE.x, z - HQ_BLUE.z) < 22 || Math.hypot(x - HQ_RED.x, z - HQ_RED.z) < 22) continue;

    var s = 0.4 + Math.random() * 1.0;
    var m = new THREE.Mesh(bumpGeo, matBump);
    var gy = terrainH(x, z);
    m.position.set(x, gy + s * 0.18, z);
    m.scale.set(s, s * 0.45, s);
    m.rotation.set(Math.random(), Math.random() * 3, Math.random());
    m.castShadow = false;
    m.receiveShadow = !isMobile;
    scene.add(m);
    placed++;
    v061.bumpsAdded++;
  }
}

// ============================================================
//  Public API
// ============================================================
function resetV061() {
  // 地形テクスチャ・頂点カラー・岩は初期化時(IIFE)に1度だけ適用。
  // リセット時は品質変化に応じた再最適化のみ行う。
  if (v061.detailTex && v061.groundMesh) {
    v061.detailTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    v061.detailTex.needsUpdate = true;
  }
}

function updateV061(dt) {
  // 地形テクスチャ・陰影は静的 — 毎フレーム更新不要
}

// ============================================================
//  初期化 (スクリプト読み込み時 — map-terrain.js 生成済み)
// ============================================================
(function _initV061() {
  // 地形メッシュを検索 (groundTex を map に持つメッシュ)
  scene.traverse(function (obj) {
    if (obj.isMesh && obj.material && obj.material.map === groundTex) {
      v061.groundMesh = obj;
    }
  });
  if (!v061.groundMesh) return;

  // 1. 高解像度レイヤーテクスチャに差し替え
  v061.detailTex = _createLayeredTerrainTexV061();
  v061.groundMesh.material.map = v061.detailTex;
  v061.groundMesh.material.needsUpdate = true;

  // 2. 法線マップ風疑似陰影 (頂点カラー強化)
  _enhanceTerrainColorsV061();

  // 3. 岩ジオメトリ多様化 + 地形マイクロバンプ
  _addRockVarietyV061();
  _addTerrainBumpsV061();
})();
