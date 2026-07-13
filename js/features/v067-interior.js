'use strict';
/* STEEL FRONT v0.6.7 — 内装の質感強化 / 家具・什器の配置 / 階段・廊下ディテール強化
   ──────────────────────────────────────────────
   1. 内装の質感強化:
      進入可能建物の床スラブ(matFloor)をシーン走査で検出し、CanvasTexture生成の
      タイル床テクスチャを適用したMeshStandardMaterialへ差し替え。
      天井パネル(天井タイルテクスチャ)を屋根スラブ直下に配置し、梁・照明器具を追加。
      壁紙テクスチャ(2種: 暖色縞模様 / 冷色ダマスク)を上部壁面にオーバーレイ配置。
   2. 家具・什器の配置:
      床面積に基づき建物種別を推定し(大: 倉庫 / 中: 事務所・兵舎 / 小: バンカー)、
      テーブル+椅子 / 本棚 / ロッカー / 机 / キャビネット / 木箱 / ドラム缶 / ベッド
      を配置。位置ハッシュでバリエーションを付与。
   3. 階段・廊下の構造ディテール強化:
      内部階段(matStair)メッシュを検出し、フライトごとに手すり(支柱+ top rail)を追加。
      天井梁と照明器具で廊下空間のディテールを強化。

   ※ 既存ソース(map-objects.js / map-districts.js)は変更せず、resetV067()で
      シーン走査による実行時ディテール追加を行う。v066の後に実行される。 */

// ============================================================
//  State
// ============================================================
var v067 = {
  interiors: [],    // {cx, cz, gy, w, d, ceilH, stairs, meshes, visible, hash, floorMesh}
  initialized: false,
  visT: 0
};

// ============================================================
//  Resources (materials + geometries + textures — 初回のみ生成)
// ============================================================
var _mV067 = null, _gV067 = null;

function _initResV067() {
  if (_mV067) return;

  // --- プロシージャルテクスチャ ---
  // 床タイルテクスチャ (コンクリートタイル + 目地 + 汚れ)
  var floorTex = makeCanvasTexture(256, function (g, s) {
    g.fillStyle = '#807a6c'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(36,34,30,0.7)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.strokeRect(1, 1, s - 2, s - 2);
    var shades = [[1.0, 0.94], [0.92, 1.0], [0.96, 0.88], [0.88, 0.95]];
    for (var tx = 0; tx < 2; tx++) for (var ty = 0; ty < 2; ty++) {
      var sh = shades[tx * 2 + ty];
      g.fillStyle = 'rgba(' + (130 * sh[0] | 0) + ',' + (122 * sh[0] | 0) + ',' + (108 * sh[1] | 0) + ',0.12)';
      g.fillRect(tx * s / 2, ty * s / 2, s / 2, s / 2);
    }
    for (var i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? 20 : 240) + ',' + (Math.random() < 0.5 ? 18 : 235) + ',' + (Math.random() < 0.5 ? 16 : 220) + ',' + (0.02 + Math.random() * 0.04).toFixed(3) + ')';
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    for (var i = 0; i < 6; i++) {
      var x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 25;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(45,40,33,0.18)'); gr.addColorStop(1, 'rgba(45,40,33,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, 4, 4);

  // 壁紙A (暖色縞模様)
  var wpTexA = makeCanvasTexture(256, function (g, s) {
    g.fillStyle = '#c4b49a'; g.fillRect(0, 0, s, s);
    for (var x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(180,165,135,' + (0.25 + Math.random() * 0.2).toFixed(3) + ')';
      g.fillRect(x, 0, 8, s);
    }
    for (var i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? 80 : 220) + ',' + (Math.random() < 0.5 ? 74 : 210) + ',' + (Math.random() < 0.5 ? 64 : 195) + ',' + (0.02 + Math.random() * 0.03).toFixed(3) + ')';
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    g.fillStyle = 'rgba(120,100,75,0.3)'; g.fillRect(0, s - 12, s, 3);
  }, 2, 1);

  // 壁紙B (冷色ダマスク)
  var wpTexB = makeCanvasTexture(256, function (g, s) {
    g.fillStyle = '#8a9498'; g.fillRect(0, 0, s, s);
    for (var mx = 0; mx < s; mx += 64) for (var my = 0; my < s; my += 64) {
      var cx = mx + 32, cy = my + 32;
      g.strokeStyle = 'rgba(110,120,125,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, 18, 0, 7); g.stroke();
      g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.stroke();
      g.fillStyle = 'rgba(100,110,115,0.12)'; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill();
    }
    for (var i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? 60 : 180) + ',' + (Math.random() < 0.5 ? 66 : 170) + ',' + (Math.random() < 0.5 ? 70 : 165) + ',' + (0.02 + Math.random() * 0.03).toFixed(3) + ')';
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  }, 2, 1);

  // 天井テクスチャ (吸音タイル)
  var ceilTex = makeCanvasTexture(256, function (g, s) {
    g.fillStyle = '#d4cfc6'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(160,155,145,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    for (var i = 0; i < 600; i++) {
      g.fillStyle = 'rgba(' + (190 + Math.random() * 30 | 0) + ',' + (185 + Math.random() * 30 | 0) + ',' + (175 + Math.random() * 30 | 0) + ',' + (0.15 + Math.random() * 0.2).toFixed(3) + ')';
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
    for (var i = 0; i < 4; i++) {
      var x = Math.random() * s, y = Math.random() * s, r = 10 + Math.random() * 20;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(130,125,115,0.12)'); gr.addColorStop(1, 'rgba(130,125,115,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, 3, 3);

  _mV067 = {
    floor:     new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.0 }),
    wallpaper: [
      new THREE.MeshStandardMaterial({ map: wpTexA, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ map: wpTexB, roughness: 0.9, metalness: 0.0 })
    ],
    ceiling:   new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    wood:      new THREE.MeshStandardMaterial({ color: 0x6b4e32, roughness: 0.8, metalness: 0.0 }),
    woodDark:  new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85, metalness: 0.0 }),
    metal:     new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.5, metalness: 0.6 }),
    fabric: [
      new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.9, metalness: 0.0 })
    ],
    rail:      new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.5, metalness: 0.5 }),
    lightFix:  new THREE.MeshStandardMaterial({ color: 0xddddee, emissive: 0x333344, emissiveIntensity: 0.4, roughness: 0.3 }),
    beam:      new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.85, metalness: 0.0 })
  };

  _gV067 = {
    tableTop:     new THREE.BoxGeometry(1.4, 0.08, 0.8),
    tableLeg:     new THREE.BoxGeometry(0.08, 0.72, 0.08),
    chairSeat:    new THREE.BoxGeometry(0.45, 0.06, 0.45),
    chairBack:    new THREE.BoxGeometry(0.45, 0.5, 0.06),
    chairLeg:     new THREE.BoxGeometry(0.05, 0.45, 0.05),
    shelf:        new THREE.BoxGeometry(1.5, 1.8, 0.4),
    shelfBoard:   new THREE.BoxGeometry(1.4, 0.04, 0.35),
    locker:       new THREE.BoxGeometry(0.6, 1.8, 0.5),
    desk:         new THREE.BoxGeometry(1.6, 0.08, 0.8),
    deskLeg:      new THREE.BoxGeometry(0.08, 0.72, 0.08),
    fileCabinet:  new THREE.BoxGeometry(0.7, 1.3, 0.5),
    crate:        new THREE.BoxGeometry(0.8, 0.8, 0.8),
    barrel:       new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8),
    bed:          new THREE.BoxGeometry(1.0, 0.35, 2.0),
    mattress:     new THREE.BoxGeometry(0.9, 0.15, 1.9),
    ceilingPanel: new THREE.BoxGeometry(1, 0.05, 1),
    ceilingBeam:  new THREE.BoxGeometry(1, 0.15, 0.2),
    wallpaper:    new THREE.BoxGeometry(1, 1, 0.04),
    lightShade:   new THREE.CylinderGeometry(0.3, 0.35, 0.1, 8),
    lightStem:    new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4),
    rail:         new THREE.BoxGeometry(1, 0.04, 0.04),
    railPost:     new THREE.BoxGeometry(0.04, 0.9, 0.04)
  };
}

// ============================================================
//  Helpers
// ============================================================
function _colEqV067(c, hex) {
  if (!c) return false;
  return Math.abs(c.r - ((hex >> 16) & 255) / 255) < 0.01 &&
         Math.abs(c.g - ((hex >> 8) & 255) / 255) < 0.01 &&
         Math.abs(c.b - (hex & 255) / 255) < 0.01;
}

function _hashPosV067(x, z) {
  var h = (x * 73856093) ^ (z * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function _addMeshV067(geo, mat, x, y, z, intr, opt) {
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
  intr.meshes.push(m);
  return m;
}

// ============================================================
//  進入可能建物の検出 — 床スラブ(matFloor 0x847d6f)から室内を特定
// ============================================================
function _findInteriorsV067() {
  var stairMeshes = [];
  // 第1パス: 階段メッシュを収集
  scene.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    if (o.material.isMeshStandardMaterial) return;
    if (!o.geometry || !o.geometry.parameters) return;
    var w = o.geometry.parameters.width, h = o.geometry.parameters.height, d = o.geometry.parameters.depth;
    if (!w || !h || !d) return;
    if (_colEqV067(o.material.color, 0x6d7175) && h < 5 && w < 2 && d < 2) {
      stairMeshes.push(o);
    }
  });

  // 第2パス: 床スラブを検出して室内情報を構築
  scene.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    if (o.material.isMeshStandardMaterial) return;
    if (!o.geometry || !o.geometry.parameters) return;
    var w = o.geometry.parameters.width, h = o.geometry.parameters.height, d = o.geometry.parameters.depth;
    if (!w || !h || !d) return;
    // 床スラブ: 薄い(h≈0.2) + 広い(w>5,d>5) + matFloor色
    if (h > 0.15 && h < 0.3 && w > 5 && d > 5 && _colEqV067(o.material.color, 0x847d6f)) {
      var cx = o.position.x, cz = o.position.z;
      var gy = o.position.y - 0.05;  // 床スラブ底面 = gy

      // 天井高を障害物から推定 (壁の高さ)
      var maxH = gy + 3.0;
      for (var i = 0; i < obstacles.length; i++) {
        var ob = obstacles[i];
        if (ob.h - ob.y0 > 1.0 && ob.h - ob.y0 < 7.0 &&
            cx > ob.minX - 0.5 && cx < ob.maxX + 0.5 &&
            cz > ob.minZ - 0.5 && cz < ob.maxZ + 0.5) {
          if (ob.h > maxH) maxH = ob.h;
        }
      }
      var ceilH = Math.min(Math.max(maxH - gy, 2.8), 4.0);

      // この建物の階段メッシュを収集
      var intStairs = [];
      for (var j = 0; j < stairMeshes.length; j++) {
        var st = stairMeshes[j];
        if (Math.abs(st.position.x - cx) < w / 2 + 0.5 && Math.abs(st.position.z - cz) < d / 2 + 0.5) {
          intStairs.push(st);
        }
      }

      v067.interiors.push({
        cx: cx, cz: cz, gy: gy, w: w, d: d, ceilH: ceilH,
        stairs: intStairs, meshes: [], visible: true,
        hash: _hashPosV067(cx, cz), floorMesh: o
      });
    }
  });
}

// ============================================================
//  床材テクスチャ差し替え — matFloor → タイルテクスチャ付きPBR
// ============================================================
function _upgradeFloorV067(intr) {
  if (!intr.floorMesh || intr.floorMesh.material.isMeshStandardMaterial) return;
  var tex = _mV067.floor.map.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(2, Math.round(intr.w / 2.5)), Math.max(2, Math.round(intr.d / 2.5)));
  tex.needsUpdate = true;
  intr.floorMesh.material = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.85, metalness: 0.0
  });
}

// ============================================================
//  天井パネル + 梁 + 照明器具
// ============================================================
function _addCeilingV067(intr) {
  var cx = intr.cx, cz = intr.cz, gy = intr.gy;
  var w = intr.w, d = intr.d, ceilH = intr.ceilH;
  var ceilY = gy + ceilH - 0.45;

  // 天井パネル (中央60% — 階段領域を避ける)
  var pw = w * 0.55, pd = d * 0.55;
  var ceilTex = _mV067.ceiling.map.clone();
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(Math.max(2, Math.round(pw / 2.5)), Math.max(2, Math.round(pd / 2.5)));
  ceilTex.needsUpdate = true;
  var ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  _addMeshV067(_gV067.ceilingPanel, ceilMat, cx, ceilY, cz, intr, { sx: pw, sz: pd });

  // 天井梁 (パネル端に沿って1〜2本)
  _addMeshV067(_gV067.ceilingBeam, _mV067.beam, cx, ceilY - 0.08, cz - pd * 0.45, intr, { sx: pw * 0.9, sy: 1, sz: 1 });
  if (d > 7) _addMeshV067(_gV067.ceilingBeam, _mV067.beam, cx, ceilY - 0.08, cz + pd * 0.45, intr, { sx: pw * 0.9, sy: 1, sz: 1 });

  // 天井照明器具 (中央 + 大型建物は追加1灯)
  var lightY = ceilY - 0.2;
  _addMeshV067(_gV067.lightStem, _mV067.metal, cx, ceilY - 0.05, cz, intr);
  _addMeshV067(_gV067.lightShade, _mV067.lightFix, cx, lightY, cz, intr);
  if (w * d > 70) {
    _addMeshV067(_gV067.lightStem, _mV067.metal, cx - w * 0.2, ceilY - 0.05, cz, intr);
    _addMeshV067(_gV067.lightShade, _mV067.lightFix, cx - w * 0.2, lightY, cz, intr);
  }
}

// ============================================================
//  壁紙オーバーレイ — 上部帯(ドア頭上〜天井)に壁紙パネルを配置
// ============================================================
function _addWallpaperV067(intr) {
  var cx = intr.cx, cz = intr.cz, gy = intr.gy;
  var w = intr.w + 0.2, d = intr.d + 0.2;  // 建物外寸
  var ceilH = intr.ceilH;
  var bandY0 = 2.6, bandY1 = ceilH - 0.1;
  if (bandY1 <= bandY0) return;
  var bandH = bandY1 - bandY0;
  var bandMid = (bandY0 + bandY1) / 2;

  var variant = intr.hash > 0.5 ? 0 : 1;
  var wpTex = _mV067.wallpaper[variant].map.clone();
  wpTex.wrapS = wpTex.wrapT = THREE.RepeatWrapping;
  wpTex.repeat.set(Math.max(1, Math.round(w / 3)), 1);
  wpTex.needsUpdate = true;
  var wpMat = new THREE.MeshStandardMaterial({ map: wpTex, roughness: 0.9, metalness: 0.0 });

  // 4壁の内側面に壁紙パネル (薄いボックス)
  var inset = 0.35;  // 壁厚T=0.5 の内側
  // ±z 壁
  _addMeshV067(_gV067.wallpaper, wpMat, cx, gy + bandMid, cz + d / 2 - inset, intr, { sx: w - 0.8, sy: bandH, sz: 1 });
  _addMeshV067(_gV067.wallpaper, wpMat, cx, gy + bandMid, cz - d / 2 + inset, intr, { sx: w - 0.8, sy: bandH, sz: 1 });
  // ±x 壁 (90度回転)
  _addMeshV067(_gV067.wallpaper, wpMat, cx + w / 2 - inset, gy + bandMid, cz, intr, { sx: d - 0.8, sy: bandH, sz: 1, ry: Math.PI / 2 });
  _addMeshV067(_gV067.wallpaper, wpMat, cx - w / 2 + inset, gy + bandMid, cz, intr, { sx: d - 0.8, sy: bandH, sz: 1, ry: Math.PI / 2 });
}

// ============================================================
//  家具のコンポナント生成ヘルパー
// ============================================================
function _addTableV067(x, y, z, intr, opt) {
  opt = opt || {};
  var mat = opt.mat || _mV067.wood;
  var w = opt.w || 1.4, d = opt.d || 0.8, h = opt.h || 0.75;
  _addMeshV067(_gV067.tableTop, mat, x, y + h, z, intr, { sx: w, sz: d });
  var legH = h - 0.04;
  var off = [[-w * 0.4, -d * 0.35], [w * 0.4, -d * 0.35], [-w * 0.4, d * 0.35], [w * 0.4, d * 0.35]];
  for (var i = 0; i < off.length; i++)
    _addMeshV067(_gV067.tableLeg, _mV067.woodDark, x + off[i][0], y + legH / 2, z + off[i][1], intr, { sy: legH });
}

function _addChairV067(x, y, z, intr, opt) {
  opt = opt || {};
  var mat = opt.mat || _mV067.fabric[0];
  var ry = opt.ry || 0;
  var h = 0.45;
  _addMeshV067(_gV067.chairSeat, mat, x, y + h, z, intr, { ry: ry });
  _addMeshV067(_gV067.chairBack, mat, x, y + h + 0.25, z - 0.2, intr, { ry: ry });
  var off = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
  for (var i = 0; i < off.length; i++)
    _addMeshV067(_gV067.chairLeg, _mV067.woodDark, x + off[i][0], y + h / 2, z + off[i][1], intr);
}

function _addShelfV067(x, y, z, intr, opt) {
  opt = opt || {};
  _addMeshV067(_gV067.shelf, _mV067.wood, x, y + 0.9, z, intr, opt);
  for (var i = 0; i < 3; i++)
    _addMeshV067(_gV067.shelfBoard, _mV067.woodDark, x, y + 0.3 + i * 0.5, z, intr, opt);
}

function _addLockerV067(x, y, z, intr, opt) {
  opt = opt || {};
  _addMeshV067(_gV067.locker, _mV067.metal, x, y + 0.9, z, intr, opt);
}

function _addDeskV067(x, y, z, intr, opt) {
  opt = opt || {};
  var w = opt.w || 1.6, d = opt.d || 0.8, h = 0.75;
  _addMeshV067(_gV067.desk, _mV067.wood, x, y + h, z, intr, { sx: w, sz: d });
  var legH = h - 0.04;
  var off = [[-w * 0.4, -d * 0.35], [w * 0.4, -d * 0.35], [-w * 0.4, d * 0.35], [w * 0.4, d * 0.35]];
  for (var i = 0; i < off.length; i++)
    _addMeshV067(_gV067.deskLeg, _mV067.woodDark, x + off[i][0], y + legH / 2, z + off[i][1], intr, { sy: legH });
}

function _addFileCabinetV067(x, y, z, intr) {
  _addMeshV067(_gV067.fileCabinet, _mV067.metal, x, y + 0.65, z, intr);
}

function _addCrateFurV067(x, y, z, intr, opt) {
  opt = opt || {};
  _addMeshV067(_gV067.crate, _mV067.wood, x, y + 0.4, z, intr, opt);
}

function _addBarrelFurV067(x, y, z, intr) {
  _addMeshV067(_gV067.barrel, _mV067.metal, x, y + 0.45, z, intr);
}

function _addBedV067(x, y, z, intr, opt) {
  opt = opt || {};
  var mat = opt.mat || _mV067.fabric[1];
  _addMeshV067(_gV067.bed, _mV067.woodDark, x, y + 0.18, z, intr, opt);
  _addMeshV067(_gV067.mattress, mat, x, y + 0.3, z, intr, opt);
}

// ============================================================
//  家具配置 — 床面積で建物種別を推定しタイプ別に配置
// ============================================================
function _addFurnitureV067(intr) {
  var cx = intr.cx, cz = intr.cz, gy = intr.gy;
  var w = intr.w, d = intr.d, hash = intr.hash;
  var area = w * d;
  var fabricMat = _mV067.fabric[Math.floor(hash * 3) % 3];

  // 階段位置を推定 (階段メッシュの重心)
  var stairMidX = cx, stairMidZ = cz;
  if (intr.stairs.length > 0) {
    var sx = 0, sz = 0;
    for (var i = 0; i < intr.stairs.length; i++) { sx += intr.stairs[i].position.x; sz += intr.stairs[i].position.z; }
    stairMidX = sx / intr.stairs.length;
    stairMidZ = sz / intr.stairs.length;
  }
  // 家具は階段の反対側に寄せる
  var awayX = cx > stairMidX ? 1 : -1;
  var awayZ = cz > stairMidZ ? 1 : -1;
  var hw = w * 0.22, hd = d * 0.22;

  if (area > 80) {
    // 倉庫: 木箱+ドラム缶+大型棚+作業台
    _addCrateFurV067(cx + awayX * hw, gy, cz - hd, intr);
    _addCrateFurV067(cx + awayX * hw + 0.9, gy, cz - hd, intr);
    _addBarrelFurV067(cx + awayX * hw, gy, cz + hd, intr);
    _addShelfV067(cx - awayX * hw, gy, cz + hd, intr, { sx: 1.2 });
    _addTableV067(cx, gy, cz, intr, { mat: _mV067.wood, w: 1.8, d: 1.0 });
    _addChairV067(cx - 0.6, gy, cz - 0.7, intr, { mat: fabricMat, ry: Math.PI });
    _addChairV067(cx + 0.6, gy, cz - 0.7, intr, { mat: fabricMat, ry: Math.PI });
  } else if (area > 40) {
    // 事務所・兵舎: 机+椅子+キャビネット+ロッカー+棚(+ベッド)
    _addDeskV067(cx + awayX * hw, gy, cz - hd, intr, { w: 1.6, d: 0.8 });
    _addChairV067(cx + awayX * hw, gy, cz - hd + 0.6, intr, { mat: fabricMat });
    _addFileCabinetV067(cx + awayX * hw, gy, cz + hd, intr);
    _addLockerV067(cx - awayX * hw, gy, cz + hd, intr, { sx: 0.6 });
    _addShelfV067(cx - awayX * hw, gy, cz - hd, intr);
    if (hash > 0.5) _addBedV067(cx, gy, cz, intr, { mat: fabricMat });
  } else {
    // バンカー: ロッカー+木箱+小棚
    _addLockerV067(cx + awayX * hw, gy, cz, intr, { sx: 0.5 });
    _addCrateFurV067(cx - awayX * hw * 0.5, gy, cz + hd, intr);
    _addShelfV067(cx, gy, cz - hd, intr, { sx: 0.8 });
  }
}

// ============================================================
//  階段手すり — フライトごとに支柱+トップレールを追加
// ============================================================
function _enhanceStairsV067(intr) {
  if (intr.stairs.length < 2) return;
  var cx = intr.cx, cz = intr.cz, gy = intr.gy;

  // 高さでソート
  var sorted = intr.stairs.slice().sort(function (a, b) {
    return a.position.y - a.position.y;
  });

  // X座標の近さでフライトに分割
  var flights = [];
  var curFlight = [sorted[0]];
  var refX = sorted[0].position.x;
  for (var i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].position.x - refX) < 0.5) {
      curFlight.push(sorted[i]);
    } else {
      flights.push(curFlight);
      curFlight = [sorted[i]];
      refX = sorted[i].position.x;
    }
  }
  flights.push(curFlight);

  // 各フライトに手すり (最大2フライトまで)
  for (var f = 0; f < Math.min(flights.length, 2); f++) {
    var flight = flights[f];
    if (flight.length < 2) continue;
    var flightX = flight[0].position.x;
    var zVaries = Math.abs(flight[flight.length - 1].position.z - flight[0].position.z) > 0.3;
    var xVaries = Math.abs(flight[flight.length - 1].position.x - flight[0].position.x) > 0.3;

    if (zVaries) {
      // Z方向フライト: 手すりはX方向の開放側
      var openSide = flightX > cx ? -1 : 1;
      var railX = flightX + openSide * 0.65;
      flight.sort(function (a, b) { return a.position.z - b.position.z; });
      for (var s = 0; s < flight.length; s++) {
        var step = flight[s];
        var stepTop = step.position.y + step.geometry.parameters.height / 2;
        _addMeshV067(_gV067.railPost, _mV067.rail, railX, stepTop + 0.45, step.position.z, intr, { sy: 0.9 });
      }
      var yStart = flight[0].position.y + flight[0].geometry.parameters.height / 2 + 0.9;
      var yEnd = flight[flight.length - 1].position.y + flight[flight.length - 1].geometry.parameters.height / 2 + 0.9;
      _addMeshV067(_gV067.rail, _mV067.rail, railX, (yStart + yEnd) / 2,
        (flight[0].position.z + flight[flight.length - 1].position.z) / 2, intr,
        { sx: 0.04, sz: Math.abs(flight[flight.length - 1].position.z - flight[0].position.z) + 0.3, ry: Math.PI / 2 });
    } else if (xVaries) {
      // X方向フライト: 手すりはZ方向の開放側
      var flightZ = flight[0].position.z;
      var openSideZ = flightZ > cz ? -1 : 1;
      var railZ = flightZ + openSideZ * 0.65;
      flight.sort(function (a, b) { return a.position.x - b.position.x; });
      for (var s = 0; s < flight.length; s++) {
        var step2 = flight[s];
        var stepTop2 = step2.position.y + step2.geometry.parameters.height / 2;
        _addMeshV067(_gV067.railPost, _mV067.rail, step2.position.x, stepTop2 + 0.45, railZ, intr, { sy: 0.9 });
      }
      _addMeshV067(_gV067.rail, _mV067.rail,
        (flight[0].position.x + flight[flight.length - 1].position.x) / 2,
        (flight[0].position.y + flight[flight.length - 1].position.y) / 2 + 0.9,
        railZ, intr,
        { sx: Math.abs(flight[flight.length - 1].position.x - flight[0].position.x) + 0.3, sz: 0.04 });
    }
  }
}

// ============================================================
//  全室内のディテール強化
// ============================================================
function _enhanceInteriorsV067() {
  _findInteriorsV067();
  for (var i = 0; i < v067.interiors.length; i++) {
    var intr = v067.interiors[i];
    _upgradeFloorV067(intr);     // 床材テクスチャ差し替え
    _addCeilingV067(intr);       // 天井パネル+梁+照明
    _addWallpaperV067(intr);     // 壁紙オーバーレイ
    _addFurnitureV067(intr);     // 家具・什器
    _enhanceStairsV067(intr);    // 階段手すり
  }
}

// ============================================================
//  reset / update
// ============================================================
function resetV067() {
  if (v067.initialized) return;
  if (isMobile) return;              // モバイルは負荷軽減のためスキップ
  v067.initialized = true;
  _initResV067();
  _enhanceInteriorsV067();
}

function updateV067(dt) {
  if (!v067.initialized) return;

  // 可視性更新 (0.2秒間隔でカメラ距離判定)
  v067.visT += dt;
  if (v067.visT >= 0.2) {
    v067.visT = 0;
    var cx = camera.position.x, cz = camera.position.z;
    for (var i = 0; i < v067.interiors.length; i++) {
      var intr = v067.interiors[i];
      intr.visible = Math.hypot(intr.cx - cx, intr.cz - cz) < 200;
      for (var j = 0; j < intr.meshes.length; j++) intr.meshes[j].visible = intr.visible;
    }
  }
}
