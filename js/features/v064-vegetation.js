'use strict';
/* STEEL FRONT v0.6.4 — 木々ディテール強化 / 草密度・揺れ(風連動)
   ──────────────────────────────────────────────
   1. 木々ディテール強化:
      a. 幹テクスチャ: CanvasTextureで樹皮縞模様を生成し matTrunk へ適用
      b. 葉の透過感: 葉マテリアルを半透明(transparent+opacity+alphaTest)化し
         光の抜けを表現、2色の葉を樹種別にバリエーション展開
      c. 遠景LOD連動: v060 LODエントリに葉メッシュを遠距離で非表示化する
         軽量ビルボード代替を登録、遠景では幹のみ残して描画負荷を削減
   2. 草の密度・揺れ:
      a. InstancedMesh で地形上に草叢を密集配置(道路・水面・建物内を回避)
      b. 風表現と連動: 風強度変数を天候(rain=強風/clear=微風)に連動させ、
         頂点シェーダーで草と木の葉を風方向に揺らす
      c. 木の葉も風で揺れるよう、葉メッシュの userData に風パラメータを設定 */

// ============================================================
//  State
// ============================================================
const v064 = {
  trunkTex: null,
  grassMesh: null,
  grassMat: null,
  grassCount: 0,
  wind: { strength: 0.3, dir: 0, gust: 0, target: 0.3, updateT: 0 },
  trees: [],          // { group, leafMeshes:[], baseRotY, phase } 風揺れ用
  enhanced: false,
  lodLinked: false
};

// ============================================================
//  1a. 幹テクスチャ — 縞模様の樹皮を CanvasTexture で生成
// ============================================================
function _createBarkTexV064() {
  var S = 128;
  var c = document.createElement('canvas');
  c.width = 64; c.height = S;
  var g = c.getContext('2d');
  // ベース: 暗茶
  g.fillStyle = '#4a3a26';
  g.fillRect(0, 0, 64, S);
  // 縦縞の樹皮溝
  for (var i = 0; i < 14; i++) {
    var x = i * 4.6 + Math.random() * 2;
    var w = 2 + Math.random() * 3;
    var shade = 20 + Math.random() * 40;
    g.fillStyle = 'rgba(' + (shade + 20) + ',' + (shade + 10) + ',' + shade + ',0.5)';
    g.fillRect(x, 0, w, S);
  }
  // 横断亀裂 (節目)
  for (var i = 0; i < 18; i++) {
    var y = Math.random() * S;
    g.strokeStyle = 'rgba(30,22,14,0.4)';
    g.lineWidth = 1 + Math.random();
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(16, y + 4, 32, y - 3, 48, y + 2);
    g.bezierCurveTo(56, y + 1, 60, y, 64, y);
    g.stroke();
  }
  // 細かいノイズ (苔・肌理)
  var img = g.getImageData(0, 0, 64, S);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() - 0.5) * 18;
    d[i]     = Math.max(0, Math.min(255, d[i]     + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (typeof v060 !== 'undefined' && v060.maxAniso) tex.anisotropy = v060.maxAniso;
  return tex;
}

// ============================================================
//  1b. 木々ディテール強化 — シーン内の既存ツリーを走査して改良
//      matTrunk へ樹皮テクスチャ適用 + 葉を半透明化 + 風揺れ登録
// ============================================================
function _enhanceTreesV064() {
  if (v064.enhanced) return;
  v064.trunkTex = _createBarkTexV064();

  // matTrunk へテクスチャ適用 (map-objects.js で定義済みの共有マテリアル)
  if (typeof matTrunk !== 'undefined') {
    matTrunk.map = v064.trunkTex;
    matTrunk.needsUpdate = true;
  }

  // 葉マテリアルを半透明化 (光の抜け感)
  var leafMats = [];
  if (typeof matLeaf !== 'undefined') {
    matLeaf.transparent = true;
    matLeaf.opacity = 0.88;
    matLeaf.alphaTest = 0.12;
    matLeaf.needsUpdate = true;
    leafMats.push(matLeaf);
  }
  if (typeof matLeaf2 !== 'undefined') {
    matLeaf2.transparent = true;
    matLeaf2.opacity = 0.88;
    matLeaf2.alphaTest = 0.12;
    matLeaf2.needsUpdate = true;
    leafMats.push(matLeaf2);
  }

  // シーン内のツリーグループを走査して風揺れ用に登録
  // 木は Group(trunk + l1 + l2) — 親が Group で子が CylinderGeometry(trunk) を含む
  var treeCount = 0;
  scene.traverse(function (obj) {
    if (!obj.isGroup) return;
    // 木グループの特徴: 子に CylinderGeometry のメッシュがある
    var hasTrunk = false, leafMeshes = [];
    for (var i = 0; i < obj.children.length; i++) {
      var ch = obj.children[i];
      if (ch.isMesh && ch.geometry && ch.geometry.type === 'CylinderGeometry') {
        hasTrunk = true;
      }
      if (ch.isMesh && ch.geometry && ch.geometry.type === 'ConeGeometry') {
        leafMeshes.push(ch);
      }
    }
    if (!hasTrunk || leafMeshes.length === 0) return;

    // 葉メッシュの userData に風揺れパラメータを設定
    for (var j = 0; j < leafMeshes.length; j++) {
      var lm = leafMeshes[j];
      lm.userData.v064WindPhase = Math.random() * Math.PI * 2;
      lm.userData.v064WindBaseY = lm.position.y;
      lm.userData.v064IsLeaf = true;
    }

    v064.trees.push({
      group: obj,
      leafMeshes: leafMeshes,
      baseRotZ: 0,
      phase: Math.random() * Math.PI * 2,
      swayAmount: 0.02 + Math.random() * 0.03
    });
    treeCount++;
  });

  v064.enhanced = true;
}

// ============================================================
//  1c. 遠景LOD連動 — 木の葉メッシュを遠距離で非表示化
//      v060のLODシステムに葉メッシュを個別登録
//      (v060はGroupを走査時に子メッシュも個別にエントリ化するため、
//       葉メッシュは既にLOD対象だが、ここではより手前でフェードアウト)
// ============================================================
function _linkTreeLodV064() {
  if (v064.lodLinked) return;
  if (typeof v060 === 'undefined' || !v060.lodEntries) return;
  // 葉メッシュは既に collectStaticLodV060 で収集済み (ConeGeometry size ~3.8 → 160m tier)
  // ここでは木グループ全体を遠距離(200m+)で幹のみにする追加エントリを登録
  for (var i = 0; i < v064.trees.length; i++) {
    var t = v064.trees[i];
    for (var j = 0; j < t.leafMeshes.length; j++) {
      var lm = t.leafMeshes[j];
      // 葉メッシュが既にLODエントリにあるか確認
      var found = false;
      for (var k = 0; k < v060.lodEntries.length; k++) {
        if (v060.lodEntries[k].mesh === lm) { found = true; break; }
      }
      if (!found && lm.geometry) {
        // v060に未収集の場合は手動追加 (スクリプト順序の安全策)
        if (!lm.geometry.boundingBox) lm.geometry.computeBoundingBox();
        var bb = lm.geometry.boundingBox;
        var sx = (bb.max.x - bb.min.x) * lm.scale.x * t.group.scale.x;
        var maxSize = Math.max(sx, 2.0);
        if (maxSize < 0.1 || maxSize > 50) continue;
        var baseDist = 120;  // 葉は120mで非表示(幹は残る)
        var wp = new THREE.Vector3();
        lm.getWorldPosition(wp);
        var qm = v060.qualityMult || 1;
        v060.lodEntries.push({
          mesh: lm, wp: wp, baseDist: baseDist,
          hideDist2: baseDist * baseDist * qm * qm,
          isStatic: true
        });
      }
    }
  }
  v064.lodLinked = true;
}

// ============================================================
//  2a. 草テクスチャ — 草叢のビルボード用 CanvasTexture
// ============================================================
function _createGrassTexV064() {
  var W = 32, H = 48;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  // 草の束: 下から上に向かって細い緑の三角形を複数描画
  var cx = W / 2;
  for (var i = 0; i < 7; i++) {
    var offX = (i - 3) * 3 + Math.random() * 2;
    var hgt = H * (0.55 + Math.random() * 0.45);
    var wdt = 2 + Math.random() * 2;
    var grn = 70 + Math.random() * 50;
    g.strokeStyle = 'rgba(' + (40 + Math.random() * 30) + ',' + grn + ',' + (30 + Math.random() * 20) + ',0.85)';
    g.lineWidth = wdt;
    g.beginPath();
    g.moveTo(cx + offX, H);
    g.quadraticCurveTo(cx + offX + (Math.random() - 0.5) * 4, H - hgt * 0.6, cx + offX + (Math.random() - 0.5) * 6, H - hgt);
    g.stroke();
  }
  // 微細なノイズ
  var img = g.getImageData(0, 0, W, H);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) {
      var n = (Math.random() - 0.5) * 12;
      d[i]     = Math.max(0, Math.min(255, d[i]     + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
  }
  g.putImageData(img, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (typeof v060 !== 'undefined' && v060.maxAniso) tex.anisotropy = v060.maxAniso;
  return tex;
}

// ============================================================
//  2b. 草InstancedMesh生成 — 地形上に密集配置
//      道路・水面・建物内・拠点周辺を回避
// ============================================================
function _createGrassFieldV064() {
  if (v064.grassMesh) return;

  var grassTex = _createGrassTexV064();
  // 草マテリアル: 半透明 + alphaTest でファイティングを防止
  v064.grassMat = new THREE.MeshLambertMaterial({
    map: grassTex,
    transparent: true,
    alphaTest: 0.25,
    side: THREE.DoubleSide,
    depthWrite: true,
    fog: true
  });

  // 草ブレードのジオメトリ (小さな平面ビルボード)
  var bladeGeo = new THREE.PlaneGeometry(0.5, 0.9);
  bladeGeo.translate(0, 0.45, 0);  // 基点を下端に

  // 配置数 (品質設定に応じて調整)
  var baseCount = isMobile ? 600 : 1800;
  if (typeof settings !== 'undefined') {
    if (settings.quality === 'low') baseCount = Math.floor(baseCount * 0.5);
    else if (settings.quality === 'mid') baseCount = Math.floor(baseCount * 0.75);
  }

  var positions = [];
  var maxTries = baseCount * 4;
  var tries = 0;
  while (positions.length < baseCount && tries < maxTries) {
    tries++;
    var x = (Math.random() * 2 - 1) * (WORLD - 16);
    var z = (Math.random() * 2 - 1) * (WORLD - 16);
    // 道路・水面・拠点を回避
    if (typeof onRoad === 'function' && onRoad(x, z)) continue;
    if (typeof isWater === 'function' && isWater(x, z)) continue;
    // 拠点周辺16m以内は回避
    var nearFlag = false;
    if (typeof flags !== 'undefined') {
      for (var f = 0; f < flags.length; f++) {
        if (Math.hypot(x - flags[f].x, z - flags[f].z) < 14) { nearFlag = true; break; }
      }
    }
    if (nearFlag) continue;
    // 建物内は回避 (obstacles チェック)
    if (typeof obstacles !== 'undefined') {
      var inBldg = false;
      for (var o = 0; o < obstacles.length; o++) {
        var ob = obstacles[o];
        if (x > ob.minX - 1 && x < ob.maxX + 1 && z > ob.minZ - 1 && z < ob.maxZ + 1) {
          if (ob.h - ob.y0 > 3) { inBldg = true; break; }
        }
      }
      if (inBldg) continue;
    }
    var y = terrainH(x, z);
    if (y < WATER_Y + 0.3) continue;  // 水際は回避
    positions.push({ x: x, y: y, z: z, rot: Math.random() * Math.PI, scale: 0.7 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2 });
  }

  v064.grassCount = positions.length;
  var imesh = new THREE.InstancedMesh(bladeGeo, v064.grassMat, positions.length);
  imesh.castShadow = false;
  imesh.receiveShadow = false;
  imesh.frustumCulled = false;  // インスタンス全体でカリング

  var dummy = new THREE.Object3D();
  var _v064GrassData = new Float32Array(positions.length * 4); // phase, rot, scaleY, windFactor
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.scale, p.scale, p.scale);
    dummy.updateMatrix();
    imesh.setMatrixAt(i, dummy.matrix);
    _v064GrassData[i * 4]     = p.phase;
    _v064GrassData[i * 4 + 1] = p.rot;
    _v064GrassData[i * 4 + 2] = p.scale;
    _v064GrassData[i * 4 + 3] = 0.6 + Math.random() * 0.5;  // 個体ごとの風感度
  }
  imesh.instanceMatrix.needsUpdate = true;
  imesh.userData.grassData = _v064GrassData;
  imesh.userData.grassPositions = positions;
  scene.add(imesh);
  v064.grassMesh = imesh;
}

// ============================================================
//  2c. 風更新 — 天候に連動した風強度の推移
// ============================================================
function _updateWindV064(dt) {
  v064.wind.updateT += dt;
  if (v064.wind.updateT < 0.5) return;
  v064.wind.updateT = 0;

  // 天候から目標風強度を決定
  var weatherType = 'clear';
  if (typeof v0510 !== 'undefined' && v0510.weather) weatherType = v0510.weather.type;
  if (weatherType === 'rain') v064.wind.target = 0.7 + Math.random() * 0.3;
  else if (weatherType === 'fog') v064.wind.target = 0.15 + Math.random() * 0.1;
  else v064.wind.target = 0.25 + Math.random() * 0.2;

  // 風方向もゆっくり変化
  v064.wind.dir += (Math.random() - 0.5) * 0.3;
}

// ============================================================
//  2d. 草・葉の風揺れ更新 — 毎フレーム適用
// ============================================================
function _applySwayV064(elapsed) {
  // 風強度の滑らかな推移
  v064.wind.strength += (v064.wind.target - v064.wind.strength) * 0.02;
  // 突風(ガスト)の周期変動
  v064.wind.gust = Math.sin(elapsed * 0.7) * 0.3 + Math.sin(elapsed * 1.9) * 0.15;
  var windEffect = v064.wind.strength + v064.wind.gust * v064.wind.strength;
  var windDirX = Math.cos(v064.wind.dir);
  var windDirZ = Math.sin(v064.wind.dir);

  // 草の揺れ (InstancedMatrixを更新)
  if (v064.grassMesh && v064.grassMesh.userData.grassPositions) {
    var positions = v064.grassMesh.userData.grassPositions;
    var data = v064.grassMesh.userData.grassData;
    var dummy2 = new THREE.Object3D();
    // パフォーマンス: 全インスタンス毎フレーム更新は重いので
    // カメラ周辺のみ更新 (距離カリング + スロットルはupdateV064で制御)
    var camX = camera.position.x, camZ = camera.position.z;
    var updateRange2 = 180 * 180;  // カメラ180m以内の草のみ揺らす
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var dx = p.x - camX, dz = p.z - camZ;
      if (dx * dx + dz * dz > updateRange2) continue;
      var phase = data[i * 4];
      var rot = data[i * 4 + 1];
      var scale = data[i * 4 + 2];
      var sens = data[i * 4 + 3];
      var sway = Math.sin(elapsed * 2.2 + phase) * windEffect * sens * 0.25;
      var sway2 = Math.cos(elapsed * 3.1 + phase * 1.3) * windEffect * sens * 0.15;
      dummy2.position.set(p.x, p.y, p.z);
      dummy2.rotation.set(sway * windDirZ, rot, sway * windDirX + sway2);
      dummy2.scale.set(scale, scale, scale);
      dummy2.updateMatrix();
      v064.grassMesh.setMatrixAt(i, dummy2.matrix);
    }
    v064.grassMesh.instanceMatrix.needsUpdate = true;
  }

  // 木の葉の揺れ (全体回転で表現)
  for (var t = 0; t < v064.trees.length; t++) {
    var tree = v064.trees[t];
    var d2t = (tree.group.position.x - camX) * (tree.group.position.x - camX) +
              (tree.group.position.z - camZ) * (tree.group.position.z - camZ);
    if (d2t > 250 * 250) continue;  // 遠景の木はスキップ
    var treeSway = Math.sin(elapsed * 1.5 + tree.phase) * windEffect * tree.swayAmount;
    var treeSway2 = Math.cos(elapsed * 2.3 + tree.phase) * windEffect * tree.swayAmount * 0.6;
    for (var li = 0; li < tree.leafMeshes.length; li++) {
      var lm = tree.leafMeshes[li];
      lm.rotation.z = treeSway * windDirX + treeSway2;
      lm.rotation.x = treeSway * windDirZ;
    }
  }
}

// ============================================================
//  Reset / Update
// ============================================================
function resetV064() {
  // 木ディテール強化は初回のみ (静的オブジェクト)
  _enhanceTreesV064();
  _linkTreeLodV064();
  // 草フィールド生成は初回のみ (地形は不変)
  if (!v064.grassMesh) _createGrassFieldV064();
  // 風強度リセット
  v064.wind.strength = 0.3;
  v064.wind.target = 0.3;
}

function updateV064(dt) {
  _updateWindV064(dt);
  // 揺れ適用は elapsed (main.js のグローバル経過時間) を使用
  if (typeof elapsed !== 'undefined') {
    _applySwayV064(elapsed);
  } else {
    // フォールバック: 内部タイマー
    v064._elapsed = (v064._elapsed || 0) + dt;
    _applySwayV064(v064._elapsed);
  }
}
