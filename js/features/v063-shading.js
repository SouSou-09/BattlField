'use strict';
/* STEEL FRONT v0.6.3 — 太陽光陰影精度向上 / 色温度強化 / 疑似AO
   ──────────────────────────────────────────────
   1. ソフトシャドウ: PCFSoftShadowMap + シャドウマップ2048px +
      bias/radius調整で影の縁を滑らかに
   2. 色温度強化: v0510昼夜システムの後に太陽色・半球光へ
      時間帯別の色温度乗算を適用 (昼=寒色寄り白 / 黄金時=暖橙 /
      夕焼け=深暖色 / 夜=寒青) — v0510を上書きせず補強のみ
   3. 疑似アンビエントオクルージョン: 建物・木・塔など大型静物の
      接地面に径に応じた暗いラジアルグラデーション円を敷き、
      シャドウマップでは表現できない接地部の寄り陰を擬似的に再現 */

// ============================================================
//  State
// ============================================================
const v063 = {
  shadowUpgraded: false,
  aoTex: null,
  aoMat: null,
  aoDecals: [],
  aoApplied: false,
  hemiRef: null,
  tempTimer: 0,
  prevDayF: -1
};

// ============================================================
//  1. ソフトシャドウ — レンダラー & 太陽光シャドウの品質向上
//     (スクリプト読み込み時に1回だけ適用)
// ============================================================
(function _upgradeShadowsV063() {
  if (isMobile || v063.shadowUpgraded) return;
  // PCFSoftShadowMap: 影の縁をpercentage-closing filteredで滑らかに
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // シャドウマップ解像度を2048へ引き上げ (高低差の大きい場面でも精度維持)
  sun.shadow.mapSize.set(2048, 2048);
  // bias: シャドウアクネ(表面のセルフシャドウ擬似ノイズ)を抑制
  sun.shadow.bias = -0.0004;
  // radius: PCFSoftのサンプル半径 (大きく=より柔らかい影)
  sun.shadow.radius = 3.0;
  // シャドウカメラのニア/farを再設定してデプス精度を改善
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.updateProjectionMatrix();
  // 既存シャドウマップを破棄して再割当を促す
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  v063.shadowUpgraded = true;
})();

// ============================================================
//  2. 疑似AOテクスチャ — ラジアルグラデーション円 (共有1枚)
// ============================================================
function _createAoTexV063() {
  var S = 128;
  var c = document.createElement('canvas');
  c.width = c.height = S;
  var g = c.getContext('2d');
  var cx = S / 2, cy = S / 2;
  var gr = g.createRadialGradient(cx, cy, 0, cx, cy, S / 2);
  // 中心=濃い暗色 → 外縁=透明 (AOの寄り陰フォールオフ)
  gr.addColorStop(0.0, 'rgba(0,0,0,0.38)');
  gr.addColorStop(0.3, 'rgba(0,0,0,0.26)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.12)');
  gr.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ============================================================
//  3. 疑似AOデカル — 静的大型オブジェクトの接地面に暗円を敷設
//     シーン内の castShadow=true な静的メッシュを走査し、
//     バウンディングサイズに応じた円を接地高さに配置
// ============================================================
function _applyContactAoV063() {
  if (v063.aoApplied) return;
  v063.aoTex = _createAoTexV063();
  // 共有マテリアル (depthWrite=false で地形と重ね描き)
  v063.aoMat = new THREE.MeshBasicMaterial({
    map: v063.aoTex,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  var _v = new THREE.Vector3();
  var _bbox = new THREE.Box3();
  var added = 0;

  scene.traverse(function (obj) {
    if (!obj.isMesh) return;
    if (!obj.castShadow) return;
    // 動的オブジェクト(兵士・車両)は userData で除外
    if (obj.userData.soldier) return;
    if (obj.userData.vehicle) return;
    if (obj.userData.aoDecal) return;
    // 親が Group (木など) の場合はグループ単位で処理
    if (obj.parent && obj.parent.isGroup && obj.parent.userData.aoDone) return;

    _bbox.setFromObject(obj);
    var size = _bbox.getSize(_v);
    var maxSize = Math.max(size.x, size.z);
    // 小さすぎるオブジェクト(小道具・ガラス等)はスキップ
    if (maxSize < 1.8) return;
    // 高すぎる空中オブジェクト(アンテナ上部)はスキップ
    if (size.y > 40) return;

    var cx = (_bbox.min.x + _bbox.max.x) * 0.5;
    var cz = (_bbox.min.z + _bbox.max.z) * 0.5;
    var groundY = terrainH(cx, cz);
    // オブジェクト底が地面から離れすぎている場合は接地高さを使用
    var baseY = Math.max(_bbox.min.y, groundY);
    // デカル径: オブジェクト径の1.1倍 (接地影が広がる感)
    var radius = maxSize * 0.55 + 0.4;
    // 高さに応じてデカル濃度を増す (高い建物ほど接地AOが強い)
    var heightFactor = Math.min(1, size.y / 18);
    var opacity = 0.5 + heightFactor * 0.4;

    // グループ(木)の場合は代表メッシュで1枚だけ作成
    if (obj.parent && obj.parent.isGroup) {
      obj.parent.userData.aoDone = true;
    }

    var geo = new THREE.CircleGeometry(radius, 20);
    geo.rotateX(-Math.PI / 2);
    // インスタンスごとにopacityを変えるためマテリアルクローン
    var mat = v063.aoMat.clone();
    mat.opacity = opacity;
    mat.map = v063.aoTex;
    var decal = new THREE.Mesh(geo, mat);
    decal.position.set(cx, baseY + 0.03, cz);
    decal.renderOrder = 1;
    decal.userData.aoDecal = true;
    decal.receiveShadow = false;
    decal.castShadow = false;
    scene.add(decal);
    v063.aoDecals.push(decal);
    added++;
  });

  v063.aoApplied = true;
}

// ============================================================
//  4. 色温度強化 — v0510昼夜更新の後に太陽色・半球光へ補強
//     dayF (0=夜 ~ 1=真昼) を太陽Y位置から再導出し、
//     4段階の色温度乗算を適用
// ============================================================
var _tempDay  = new THREE.Color(0.99, 1.00, 1.03);  // 真昼: わずかに寒色寄り白
var _tempGold = new THREE.Color(1.10, 1.01, 0.90);  // 黄金時: 暖橙寄り
var _tempDusk = new THREE.Color(1.14, 0.95, 0.82);  // 夕焼け: 深い暖色
var _tempNight= new THREE.Color(0.86, 0.94, 1.18);  // 夜: 寒青寄り

function _applyColorTemperatureV063() {
  // 太陽Y位置から dayF を再導出 (v0510と同じ式)
  var sunY = sun.position.y / 130;
  var dayF = Math.max(0, Math.min(1, sunY * 0.8 + 0.2));

  // 変化が微小な場合はスキップ (0.05以上の変動時のみ更新)
  if (Math.abs(dayF - v063.prevDayF) < 0.03) {
    // 微小変動でも色温度は維持 (初回は適用)
    if (v063.prevDayF >= 0) return;
  }
  v063.prevDayF = dayF;

  // 4段階の色温度を選択して太陽色へ乗算 (v0510の色を上書きせず補強)
  var mul;
  if (dayF > 0.7) {
    // 真昼 → 黄金時への遷移
    var t = (dayF - 0.7) / 0.3;
    mul = _tempGold.clone().lerp(_tempDay, t);
  } else if (dayF > 0.4) {
    // 黄金時帯
    mul = _tempGold.clone();
  } else if (dayF > 0.2) {
    // 夕焼け → 黄金時への遷移
    var t = (dayF - 0.2) / 0.2;
    mul = _tempDusk.clone().lerp(_tempGold, t);
  } else {
    // 夜 → 夕焼けへの遷移
    var t = dayF / 0.2;
    mul = _tempNight.clone().lerp(_tempDusk, t);
  }
  sun.color.multiply(mul);

  // 半球光の色温度も時間帯に合わせて微調整 (v0510は強度のみ変更)
  if (!v063.hemiRef) {
    for (var i = 0; i < scene.children.length; i++) {
      if (scene.children[i].isHemisphereLight) { v063.hemiRef = scene.children[i]; break; }
    }
  }
  if (v063.hemiRef) {
    // 空光色: 昼は青白 / 夜は暗青 — ground色は固定で維持
    var skyMul = new THREE.Color(
      0.85 + dayF * 0.15,
      0.90 + dayF * 0.10,
      1.0 + (1 - dayF) * 0.15
    );
    v063.hemiRef.color.multiply(skyMul);
  }
}

// ============================================================
//  Reset / Update
// ============================================================
function resetV063() {
  // 疑似AOデカルは静的オブジェクトに対するものなので初回のみ生成
  _applyContactAoV063();
  v063.prevDayF = -1;
}

function updateV063(dt) {
  // 色温度は太陽位置が動くたびに補強 (v0510の後に呼ばれる)
  v063.tempTimer += dt;
  if (v063.tempTimer < 0.12) return;
  v063.tempTimer = 0;
  _applyColorTemperatureV063();
}

// ============================================================
//  初期化 — シャドウ品質アップグレードはスクリプト読み込み時に実行済み
// ============================================================
(function _initV063() {
  // モバイルではシャドウ無効のためAOデカルのみ (軽量版は後述)
  if (isMobile) {
    // モバイル: AOデカルは省略し色温度のみ適用
    v063.aoApplied = true;
  }
})();
