'use strict';
/* STEEL FRONT v0.6.0 — テクスチャミップマップ最適化 / LODシステム
   - 全プロシージャルテクスチャにミップマップ生成 + 異方性フィルタリングを適用
     → 遠距離テクスチャのモアレ・ちらつきを抑制し描画品位を向上
   - 距離ベースLOD: 遠距離オブジェクトの詳細メッシュを動的に非表示化
     → ドローコール数を削減し描画負荷を軽減 */

// ============================================================
//  State
// ============================================================
const v060 = {
  maxAniso: 1,              // GPU最大異方性レベル
  texturesOptimized: 0,     // 最適化したテクスチャ数
  lodEntries: [],           // LOD管理対象メッシュリスト
  lodTimer: 0,              // LOD更新タイマー
  lodInterval: 0.15,        // LOD更新間隔(秒) — 6.7回/秒
  qualityMult: 1.0,         // 品質設定による距離倍率
  prevQuality: null,        // 前回の品質設定(変化検知用)
  stats: { hidden: 0, visible: 0, total: 0 }
};

// 内部用: 最適化済みテクスチャの重複防止
const _v060OptTex = new Set();

// ============================================================
//  Texture mipmap / anisotropy optimization
//  makeCanvasTexture()がミップマップ設定を行っていないため、
//  全シーンテクスチャを事後最適化する
// ============================================================
function _optimizeTexV060(tex) {
  if (!tex || !tex.isTexture || _v060OptTex.has(tex)) return false;
  _v060OptTex.add(tex);
  try {
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = v060.maxAniso;
    tex.needsUpdate = true;
    return true;
  } catch (e) { return false; }
}

function optimizeAllTexturesV060() {
  v060.maxAniso = renderer.capabilities.getMaxAnisotropy();
  var count = 0;
  scene.traverse(function (obj) {
    if (obj.isSprite || obj.isPoints || obj.isLine) return;
    if (!obj.isMesh) return;
    var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (var i = 0; i < mats.length; i++) {
      var mat = mats[i];
      if (!mat || mat.fog === false) continue;  // 空・雲・太陽は除外
      var slots = ['map', 'normalMap', 'specularMap', 'emissiveMap', 'bumpMap', 'aoMap', 'roughnessMap', 'metalnessMap'];
      for (var j = 0; j < slots.length; j++) {
        var tex = mat[slots[j]];
        if (tex && _optimizeTexV060(tex)) count++;
      }
    }
  });
  v060.texturesOptimized += count;
}

// ============================================================
//  LOD system — 距離ベース詳細メッシュカリング
//  建物の窓枠・ドア・庇・階層帯・屋上設備、車両ディテール、
//  小岩・柵・旗竿などの「装飾メッシュ」をカメラ距離に応じて非表示化
//  構造メッシュ(壁・屋根・地形)は常に表示 (霧が遠景を処理)
// ============================================================
function _lodQualityMultV060() {
  if (typeof settings === 'undefined') return 1.0;
  if (settings.quality === 'low') return 0.6;
  if (settings.quality === 'mid') return 0.8;
  return 1.0;
}

function _classifyLodV060(maxSize) {
  // バウンディングボックス最大寸法 → 非表示距離(m)
  // 0 を返した場合は常に表示 (LOD管理対象外)
  if (maxSize < 1.5) return 90;    // 小ディテール: 窓枠・アンテナ・配管
  if (maxSize < 3.0) return 160;   // ドア・庇・室外機・小ステップ
  if (maxSize < 8.0) return 280;   // 階層帯・煙突・手すり・中程度の岩
  return 0;                         // 大型: 常に表示 (霧が遠景フェードを処理)
}

function _addLodEntryV060(mesh, isStatic) {
  if (!mesh.geometry) return;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  var bb = mesh.geometry.boundingBox;
  var sx = (bb.max.x - bb.min.x) * mesh.scale.x;
  var sy = (bb.max.y - bb.min.y) * mesh.scale.y;
  var sz = (bb.max.z - bb.min.z) * mesh.scale.z;
  var maxSize = Math.max(sx, sy, sz);
  if (maxSize < 0.1 || maxSize > 50) return;  // 極小・極大は除外
  var baseDist = _classifyLodV060(maxSize);
  if (baseDist === 0) return;
  var wp = new THREE.Vector3();
  mesh.getWorldPosition(wp);
  var qm = v060.qualityMult;
  v060.lodEntries.push({
    mesh: mesh,
    wp: wp,
    baseDist: baseDist,
    hideDist2: baseDist * baseDist * qm * qm,
    isStatic: isStatic
  });
}

function collectStaticLodV060() {
  v060.qualityMult = _lodQualityMultV060();
  // 除外セット: 衝突/破壊システム管理メッシュ (壁・窓ガラス・木箱・ドラム缶)
  var excl = new Set();
  if (typeof solidMeshes !== 'undefined') {
    for (var i = 0; i < solidMeshes.length; i++) excl.add(solidMeshes[i]);
  }
  // シーン走査 (この時点: 建物・木・岩・塔などが存在、兵士/車両は未生成)
  scene.traverse(function (obj) {
    if (!obj.isMesh || !obj.geometry) return;
    if (obj.isSprite) return;
    if (excl.has(obj)) return;
    if (obj.material && obj.material.fog === false) return;  // 空・雲を除外
    _addLodEntryV060(obj, true);
  });
}

function registerVehicleLodV060() {
  if (typeof vehicles === 'undefined') return;
  var excl = new Set();
  if (typeof solidMeshes !== 'undefined') {
    for (var i = 0; i < solidMeshes.length; i++) excl.add(solidMeshes[i]);
  }
  for (var vi = 0; vi < vehicles.length; vi++) {
    var v = vehicles[vi];
    if (!v.grp) continue;
    v.grp.traverse(function (m) {
      if (!m.isMesh || !m.geometry) return;
      if (excl.has(m)) return;
      if (m.material && m.material.fog === false) return;
      _addLodEntryV060(m, false);
    });
  }
}

function recalcLodDistancesV060() {
  var qm = v060.qualityMult;
  for (var i = 0; i < v060.lodEntries.length; i++) {
    var e = v060.lodEntries[i];
    e.hideDist2 = e.baseDist * e.baseDist * qm * qm;
  }
}

// ============================================================
//  Public API — main.js から呼ばれる
// ============================================================
function resetV060() {
  // 古い車両LODエントリを削除 (車両は毎ゲーム再生成される)
  v060.lodEntries = v060.lodEntries.filter(function (e) { return e.isStatic; });
  // 新しい車両ディテールメッシュを登録
  registerVehicleLodV060();
  // 新規テクスチャを最適化 (車両テクスチャなど)
  optimizeAllTexturesV060();
  // 品質設定の変化を反映
  var qm = _lodQualityMultV060();
  if (qm !== v060.qualityMult) {
    v060.qualityMult = qm;
    recalcLodDistancesV060();
  }
  v060.prevQuality = (typeof settings !== 'undefined') ? settings.quality : 'high';
  v060.stats.total = v060.lodEntries.length;
}

function updateV060(dt) {
  // 品質設定の変化を検知
  var curQ = (typeof settings !== 'undefined') ? settings.quality : 'high';
  if (curQ !== v060.prevQuality) {
    v060.prevQuality = curQ;
    var qm = _lodQualityMultV060();
    if (qm !== v060.qualityMult) {
      v060.qualityMult = qm;
      recalcLodDistancesV060();
    }
  }
  // スロットル更新 (0.15秒間隔)
  v060.lodTimer += dt;
  if (v060.lodTimer < v060.lodInterval) return;
  v060.lodTimer = 0;
  var camX = camera.position.x, camY = camera.position.y, camZ = camera.position.z;
  var hidden = 0, visible = 0;
  for (var i = 0; i < v060.lodEntries.length; i++) {
    var e = v060.lodEntries[i];
    // 動的オブジェクト(車両)のワールド座標を更新
    if (!e.isStatic) e.mesh.getWorldPosition(e.wp);
    var dx = e.wp.x - camX, dy = e.wp.y - camY, dz = e.wp.z - camZ;
    var d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > e.hideDist2) {
      e.mesh.visible = false;
      hidden++;
    } else {
      e.mesh.visible = true;
      visible++;
    }
  }
  v060.stats.hidden = hidden;
  v060.stats.visible = visible;
}

// ============================================================
//  初期化 (スクリプト読み込み時 — map scripts後・main.js前)
//  この時点でシーンには建物・木・岩・塔などが存在、
//  兵士・車両は未生成
// ============================================================
(function _initV060() {
  v060.maxAniso = renderer.capabilities.getMaxAnisotropy();
  optimizeAllTexturesV060();
  collectStaticLodV060();
  v060.qualityMult = _lodQualityMultV060();
  recalcLodDistancesV060();
  v060.prevQuality = (typeof settings !== 'undefined') ? settings.quality : 'high';
  v060.stats.total = v060.lodEntries.length;
})();
