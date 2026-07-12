'use strict';
/* STEEL FRONT v0.6.5 — PBR風マテリアル / 建物外壁経年劣化テクスチャ / 屋根材バリエーション
   ──────────────────────────────────────────────
   1. PBR風マテリアル:
      a. 金属/非金属の質感分離 — 既存のMeshLambertMaterialをMeshStandardMaterialへ
         実行時アップグレード。金属部(車両フレーム・ハブ・武器バレル等)は
         metalness高・roughness低で反射表現、非金属部(車体塗装・タイヤ・建物壁等)は
         metalness0・roughness中高でマット質感。
      b. 反射表現 — 手続き生成の環境マップ(equirectグラデ→PMREM)をscene.environmentへ
         設定し、MeshStandardMaterialのenvMapで金属面に空の映り込みを表現。
   2. 建物外壁の経年劣化テクスチャ バリエーション増加:
      汚れ垂れ流し / 亀裂+錆 / 水垢染み の3種の劣化オーバーレイテクスチャを生成し、
      建物メッシュの位置ハッシュに基づいてランダム割当で外壁にバリエーションを付与。
   3. 屋根材のバリエーション:
      コンクリート屋根 / 波形金属屋根 / 瓦屋根 / シングル屋根 の4種の屋根テクスチャを
      生成し、屋根メッシュの位置ハッシュで材質を振り分け。

   ※ 既存ソース(vehicles-core.js / weapons.js / map-objects.js)は変更せず、
      resetV065() でシーン走査による実行時マテリアル差し替えを行う。
      破壊時の matWreck 差し替え(traverse→material=matWreck)は破壊後メッシュのみ
      影響するためPBR化と競合しない。 */

// ============================================================
//  State
// ============================================================
const v065 = {
  envTex: null,         // PMREM環境マップ (反射用)
  weatherTex: [],       // 経年劣化オーバーレイ [0]=汚れ垂れ [1]=亀裂錆 [2]=水垢
  roofTex: [],          // 屋根テクスチャ [0]=コンクリ [1]=金属波板 [2]=瓦 [3]=シングル
  applied: [],          // {mesh, pbrMat} 適用済みPBRマテリアル (reset時に再適用)
  appliedBuildings: [], // {mesh, origColor, variantIdx}
  appliedRoofs: [],     // {mesh, roofIdx}
  envApplied: false,
  matsApplied: false,
  updateT: 0
};

// ============================================================
//  色比較ヘルパ — mesh.material.color が指定hexと一致するか
// ============================================================
function _colEqV065(c, hex) {
  return c && Math.abs(c.r - ((hex >> 16) & 255) / 255) < 0.01 &&
         Math.abs(c.g - ((hex >> 8) & 255) / 255) < 0.01 &&
         Math.abs(c.b - (hex & 255) / 255) < 0.01;
}

// ============================================================
//  環境マップ生成 — 手続きグラデ equirect → PMREM
// ============================================================
function _createEnvMapV065() {
  // 簡易 equirectangular グラデ (上半分=空、下半分=地面)
  var c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  var g = c.getContext('2d');
  // 上半分: 空 (天頂→地平線)
  var sky = g.createLinearGradient(0, 0, 0, 64);
  sky.addColorStop(0, '#3a6ea5');
  sky.addColorStop(0.6, '#7ba8cc');
  sky.addColorStop(1, '#c8d8e4');
  g.fillStyle = sky; g.fillRect(0, 0, 256, 64);
  // 地平線帯: 暖色
  g.fillStyle = 'rgba(230,210,180,.7)'; g.fillRect(0, 60, 256, 8);
  // 下半分: 地面 (暗い緑灰)
  var grd = g.createLinearGradient(0, 64, 0, 128);
  grd.addColorStop(0, '#6a6a52');
  grd.addColorStop(1, '#2a2a22');
  g.fillStyle = grd; g.fillRect(0, 64, 256, 64);
  // 太陽方向のハイライト
  var rg = g.createRadialGradient(128, 40, 0, 128, 40, 80);
  rg.addColorStop(0, 'rgba(255,245,210,.8)');
  rg.addColorStop(0.4, 'rgba(255,235,180,.3)');
  rg.addColorStop(1, 'rgba(255,235,180,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 128);

  var equi = new THREE.CanvasTexture(c);
  equi.mapping = THREE.EquirectangularReflectionMapping;
  equi.wrapS = THREE.RepeatWrapping;
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envMap = pmrem.fromEquirectangular(equi).texture;
  equi.dispose();
  pmrem.dispose();
  return envMap;
}

// ============================================================
//  経年劣化テクスチャ生成 — 建物外壁に重ねるオーバーレイ
// ============================================================
function _createWeatherTexV065(kind) {
  var S = 256;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var g = c.getContext('2d');
  g.clearRect(0, 0, S, S);   // 透明ベース (オーバーレイ用途)
  if (kind === 0) {
    // 汚れ垂れ流し: 上から下への暗色ストリーク
    for (var i = 0; i < 18; i++) {
      var x = Math.random() * S, w = 2 + Math.random() * 8;
      var h = 60 + Math.random() * 180;
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(20,18,16,.22)');
      gr.addColorStop(0.7, 'rgba(20,18,16,.08)');
      gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, h);
    }
    // 苔の付着 (下部)
    for (var i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(60,80,45,' + (0.15 + Math.random() * 0.2).toFixed(2) + ')';
      g.fillRect(Math.random() * S, S - 30 + Math.random() * 25, 3 + Math.random() * 8, 2 + Math.random() * 5);
    }
  } else if (kind === 1) {
    // 亀裂 + 錆
    g.strokeStyle = 'rgba(30,25,20,.5)'; g.lineWidth = 1 + Math.random();
    for (var i = 0; i < 8; i++) {
      var sx = Math.random() * S, sy = Math.random() * S * 0.6;
      g.beginPath(); g.moveTo(sx, sy);
      for (var j = 0; j < 6; j++) {
        sx += (Math.random() - 0.5) * 40; sy += Math.random() * 30;
        g.lineTo(sx, sy);
      }
      g.stroke();
    }
    // 錆の染み
    for (var i = 0; i < 12; i++) {
      var x = Math.random() * S, y = Math.random() * S, r = 8 + Math.random() * 22;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(120,60,35,.35)');
      gr.addColorStop(0.6, 'rgba(90,45,28,.18)');
      gr.addColorStop(1, 'rgba(90,45,28,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  } else {
    // 水垢染み: 不規則な白っぽい沈殿
    for (var i = 0; i < 16; i++) {
      var x = Math.random() * S, y = 40 + Math.random() * 180, r = 10 + Math.random() * 28;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(200,195,185,.18)');
      gr.addColorStop(1, 'rgba(200,195,185,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // 縦の垂れ跡
    for (var i = 0; i < 10; i++) {
      var x = Math.random() * S, w = 3 + Math.random() * 5, h = 50 + Math.random() * 120;
      var gr2 = g.createLinearGradient(0, 0, 0, h);
      gr2.addColorStop(0, 'rgba(180,175,165,.14)');
      gr2.addColorStop(1, 'rgba(180,175,165,0)');
      g.fillStyle = gr2; g.fillRect(x, 0, w, h);
    }
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ============================================================
//  屋根材テクスチャ生成
// ============================================================
function _createRoofTexV065(kind) {
  var S = 128;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var g = c.getContext('2d');
  if (kind === 0) {
    // コンクリート屋根: 灰色ベース + ノイズ + ひび割れ
    g.fillStyle = '#5a5e63'; g.fillRect(0, 0, S, S);
    for (var i = 0; i < 400; i++) {
      var v = Math.random() * 30 - 15;
      g.fillStyle = 'rgba(' + (90 + v | 0) + ',' + (94 + v | 0) + ',' + (99 + v | 0) + ',.5)';
      g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    g.strokeStyle = 'rgba(30,30,32,.4)'; g.lineWidth = 1;
    for (var i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(Math.random() * S, Math.random() * S);
      g.lineTo(Math.random() * S, Math.random() * S); g.stroke();
    }
  } else if (kind === 1) {
    // 波形金属屋根: 縦縞の波 + 錆
    g.fillStyle = '#4a4e54'; g.fillRect(0, 0, S, S);
    for (var x = 0; x < S; x += 8) {
      var gr = g.createLinearGradient(x, 0, x + 8, 0);
      gr.addColorStop(0, 'rgba(255,255,255,.12)');
      gr.addColorStop(0.5, 'rgba(0,0,0,.18)');
      gr.addColorStop(1, 'rgba(255,255,255,.06)');
      g.fillStyle = gr; g.fillRect(x, 0, 8, S);
    }
    for (var i = 0; i < 6; i++) {
      var rx = Math.random() * S, ry = Math.random() * S, r = 6 + Math.random() * 14;
      var rg = g.createRadialGradient(rx, ry, 0, rx, ry, r);
      rg.addColorStop(0, 'rgba(110,60,38,.4)');
      rg.addColorStop(1, 'rgba(110,60,38,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(rx, ry, r, 0, 7); g.fill();
    }
  } else if (kind === 2) {
    // 瓦屋根: 赤茶の横段瓦
    g.fillStyle = '#7a4438'; g.fillRect(0, 0, S, S);
    for (var y = 0; y < S; y += 12) {
      g.fillStyle = 'rgba(50,25,18,.5)'; g.fillRect(0, y, S, 2);
      g.fillStyle = 'rgba(255,200,170,.12)'; g.fillRect(0, y + 2, S, 3);
      for (var x = (y / 12) % 2 ? 0 : 16; x < S; x += 32) {
        g.strokeStyle = 'rgba(40,20,14,.5)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 12); g.stroke();
      }
    }
  } else {
    // シングル屋根: 灰茶の平瓦パターン
    g.fillStyle = '#6b5e4e'; g.fillRect(0, 0, S, S);
    for (var y = 0; y < S; y += 8) {
      var off = (y / 8) % 2 ? 0 : 8;
      for (var x = off; x < S; x += 16) {
        g.fillStyle = 'rgba(40,32,24,.35)'; g.fillRect(x, y, 15, 7);
        g.fillStyle = 'rgba(180,165,145,.15)'; g.fillRect(x, y, 15, 2);
      }
    }
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ============================================================
//  MeshStandardMaterial ビルダー — 元マテリアルから色/マップを引き継ぎ
// ============================================================
function _makeStdV065(src, opts) {
  var p = {
    color: src.color ? src.color.clone() : 0xffffff,
    metalness: opts.metal != null ? opts.metal : 0.0,
    roughness: opts.rough != null ? opts.rough : 0.8,
    envMap: v065.envTex,
    envMapIntensity: opts.env != null ? opts.env : 0.5
  };
  if (src.map) p.map = src.map;
  if (opts.map) p.map = opts.map;     // テクスチャ上書き (屋根等)
  if (src.transparent) { p.transparent = true; p.opacity = src.opacity; }
  return new THREE.MeshStandardMaterial(p);
}

// 位置ハッシュ — バリエーション割当用の安定した乱数
function _hashPosV065(x, z) {
  var h = (x * 73856093) ^ (z * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ============================================================
//  マテリアルPBR化 — シーン走査で対象メッシュを差し替え
// ============================================================
function _upgradeSceneMaterialsV065() {
  if (v065.matsApplied || isMobile) return;
  v065.matsApplied = true;
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    var mat = o.material;
    if (!mat) return;
    // 既にStandard or その他特殊マテリアルはスキップ
    if (mat.isMeshStandardMaterial || mat.isMeshBasicMaterial || mat.isShaderMaterial) return;
    // 配列マテリアルはスキップ (複雑すぎ)
    if (Array.isArray(mat)) return;

    var pbr = null;

    // --- 車両マテリアル (色ベース判定) ---
    // 金属部: matVDark(0x22262a), matHub(0x555b52)
    if (_colEqV065(mat.color, 0x22262a)) {
      pbr = _makeStdV065(mat, { metal: 0.85, rough: 0.35, env: 1.0 });
    } else if (_colEqV065(mat.color, 0x555b52)) {
      pbr = _makeStdV065(mat, { metal: 0.9, rough: 0.4, env: 1.0 });
    }
    // 車体塗装 (非金属): matVBody(0x50653e), matVBody2(0x43552f), matTank(0x5a6247), matTank2(0x4c5340), matHeli(0x3e4a3a), matHeli2(0x333d31), matBoat(0x5c6668), matCanvas(0x4d5a3c)
    else if (_colEqV065(mat.color, 0x50653e) || _colEqV065(mat.color, 0x43552f) ||
             _colEqV065(mat.color, 0x5a6247) || _colEqV065(mat.color, 0x4c5340) ||
             _colEqV065(mat.color, 0x3e4a3a) || _colEqV065(mat.color, 0x333d31) ||
             _colEqV065(mat.color, 0x5c6668) || _colEqV065(mat.color, 0x4d5a3c)) {
      pbr = _makeStdV065(mat, { metal: 0.1, rough: 0.65, env: 0.5 });
    }
    // ガラス: matVGlass(0x7fa8c0) → 半金属ガラス風
    else if (_colEqV065(mat.color, 0x7fa8c0)) {
      pbr = _makeStdV065(mat, { metal: 0.3, rough: 0.15, env: 1.2 });
      pbr.envMapIntensity = 1.5;
    }
    // 錆: matRust(0x6b5540) → 粗い金属
    else if (_colEqV065(mat.color, 0x6b5540)) {
      pbr = _makeStdV065(mat, { metal: 0.5, rough: 0.85, env: 0.4 });
    }
    // タイヤ: matTire(0x181a1c) → ゴム(非金属・超粗)
    else if (_colEqV065(mat.color, 0x181a1c)) {
      pbr = _makeStdV065(mat, { metal: 0.0, rough: 0.95, env: 0.2 });
    }
    // 残骸: matWreck(0x1d1d1d) → 焼けた金属
    else if (_colEqV065(mat.color, 0x1d1d1d)) {
      pbr = _makeStdV065(mat, { metal: 0.6, rough: 0.9, env: 0.3 });
    }

    // --- 武器マテリアル (色ベース) ---
    // gm(0x2b2f33) ボディ/ストック → 非金属ダークポリマ
    else if (_colEqV065(mat.color, 0x2b2f33)) {
      pbr = _makeStdV065(mat, { metal: 0.0, rough: 0.7, env: 0.4 });
    }
    // gm2(0x17191c) バレル/グリップ/マグ/サイト → 金属
    else if (_colEqV065(mat.color, 0x17191c)) {
      pbr = _makeStdV065(mat, { metal: 0.8, rough: 0.4, env: 1.0 });
    }

    // --- 建物マテリアル (マップ or 色ベース) ---
    // 建物外壁 (map付き) → 非金属、粗い、経年劣化オーバーレイ付与対象
    else if (mat.map && (_colEqV065(mat.color, 0xffffff) || !mat.color)) {
      // buildingTexA/B/C, containerTex, crateTex 等
      // container は金属寄り、それ以外は非金属
      var isContainer = mat.map && mat.map.repeat && mat.map.repeat.x === 2 && mat.map.repeat.y === 1; // containerTex推定
      pbr = _makeStdV065(mat, { metal: isContainer ? 0.4 : 0.0, rough: isContainer ? 0.6 : 0.85, env: 0.4 });
    }
    // 屋根: matRoof(0x5a5e63) → 屋根材バリエーション割当
    else if (_colEqV065(mat.color, 0x5a5e63)) {
      var ri = Math.floor(_hashPosV065(o.position.x, o.position.z) * 4);
      var rTex = v065.roofTex[ri];
      pbr = _makeStdV065(mat, { map: rTex, metal: ri === 1 ? 0.7 : 0.0, rough: ri === 1 ? 0.45 : 0.85, env: ri === 1 ? 0.8 : 0.3 });
      v065.appliedRoofs.push({ mesh: o, roofIdx: ri });
      rTex.repeat.set(2, 2);
    }
    // 赤屋根: matRoofRed(0x7a4438) → 瓦テクスチャ
    else if (_colEqV065(mat.color, 0x7a4438)) {
      pbr = _makeStdV065(mat, { map: v065.roofTex[2], metal: 0.0, rough: 0.8, env: 0.3 });
      v065.roofTex[2].repeat.set(3, 3);
    }
    // レッジ/AC/金属系建物ディテール: matLedge(0x84888c), matAC(0x9aa0a3), matPole(0x4c5257), matWinFrame(0x2c3236)
    else if (_colEqV065(mat.color, 0x84888c) || _colEqV065(mat.color, 0x9aa0a3) ||
             _colEqV065(mat.color, 0x4c5257) || _colEqV065(mat.color, 0x2c3236)) {
      pbr = _makeStdV065(mat, { metal: 0.7, rough: 0.5, env: 0.8 });
    }
    // コンテナ色素材: matContainer2(0x3d6b4f), matContainer3(0x38506b) → 塗装金属
    else if (_colEqV065(mat.color, 0x3d6b4f) || _colEqV065(mat.color, 0x38506b)) {
      pbr = _makeStdV065(mat, { metal: 0.4, rough: 0.55, env: 0.6 });
    }
    // バレル: matBarrel(0x7a2e22), matBarrel2(0x40563e) → 金属バレル
    else if (_colEqV065(mat.color, 0x7a2e22) || _colEqV065(mat.color, 0x40563e)) {
      pbr = _makeStdV065(mat, { metal: 0.6, rough: 0.5, env: 0.7 });
    }

    if (pbr) {
      o.material = pbr;
      v065.applied.push({ mesh: o, pbrMat: pbr });
    }
  });

  // 建物外壁へ経年劣化バリエーション付与 (map付きで非金属の建物メッシュ)
  // 外壁と判定: 比較的大型のBoxジオメトリでmap付き
  scene.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    if (!o.material.isMeshStandardMaterial || !o.material.map) return;
    // 既に屋根割当済みは除外
    if (v065.appliedRoofs.some(function (r) { return r.mesh === o; })) return;
    var geo = o.geometry;
    if (!geo || !geo.parameters) return;
    var w = geo.parameters.width || 0, h = geo.parameters.height || 0, d = geo.parameters.depth || 0;
    // 建物外壁: 高さ3以上の大型ボックス (屋根0.4や小物除外)
    if (h < 3) return;
    var v = Math.floor(_hashPosV065(o.position.x + 13, o.position.z + 7) * 3);
    // 経年劣化テクスチャをマップに合成せず軽量に色味で強調 (マップ重ねはコスト高のため
    //  roughnessを個別に変えて質感バリエーションを表現)
    o.material.roughness = 0.75 + v * 0.06;
    // 色味に経年劣化を加味 (種別ごとに微減衰)
    var tint = [0.96, 0.92, 0.94][v];
    o.material.color.multiplyScalar(tint);
    v065.appliedBuildings.push({ mesh: o, variantIdx: v });
  });
}

// ============================================================
//  reset / update
// ============================================================
function resetV065() {
  // 環境マップ未生成なら生成 (1回のみ)
  if (!v065.envTex && !isMobile) {
    v065.envTex = _createEnvMapV065();
    scene.environment = v065.envTex;
    v065.envApplied = true;
  }
  // 経年劣化/屋根テクスチャ未生成なら生成
  if (v065.weatherTex.length === 0) {
    for (var k = 0; k < 3; k++) v065.weatherTex.push(_createWeatherTexV065(k));
  }
  if (v065.roofTex.length === 0) {
    for (var k = 0; k < 4; k++) v065.roofTex.push(_createRoofTexV065(k));
  }
  // マテリアルPBR化 (resetGame後に建物/車両が生成済みの状態で実行)
  // ※ main.jsのresetGame内でspawnVehicles/buildings後にresetV065を呼ぶ想定
  _upgradeSceneMaterialsV065();
}

function updateV065(dt) {
  // 軽量: 昼夜(dayF)に応じて環境マップ反射強度を調整 (v0510/v063と共存)
  if (!v065.envTex) return;
  v065.updateT += dt;
  if (v065.updateT < 0.5) return;
  v065.updateT = 0;
  var dayF = 1;
  if (typeof v0510 !== 'undefined' && v0510 && v0510.dayNight) {
    // 太陽Yから概算 (v0510の内部値を直接参照せず太陽位置から推定)
    dayF = Math.max(0, Math.min(1, sun.position.y / 130));
  }
  scene.environmentIntensity = 0.4 + dayF * 0.6;
}
