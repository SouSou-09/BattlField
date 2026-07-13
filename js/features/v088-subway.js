'use strict';
/* =========================================================
   v0.8.8 — 地下鉄/トンネルネットワーク (Subway/tunnel network)
   z=300を東西に横断する地下鉄環状線 (4駅8プラットフォーム)
   ・各駅に2プラットフォーム (西行きz=297 / 東行きz=303)
   ・v042.tunnels[]に8入口追加 → 既存KeyEテレポートシステムで乗車
   ・環状線: S1東→S2東→S3東→S4東→S1東 / S1西→S4西→S3西→S2西→S1西
   ・駅構造物 (シェルター屋根+柱 / 駅名標識 / 通风塔 / 階段壁 / プラットフォーム灯)
   ※既存 v042.tunnels / terrainH / addBox / obstacles / solidMeshes を利用
   ========================================================= */
var v088 = { initialized: false, meshes: [] };

(function () {

  /* ---------- 地下鉄パラメータ ---------- */
  var SUBWAY_LINE_Z = 300;            // 路線のz座標 (東西横断)
  var SUBWAY_PLATFORM_OFFSET = 3;     // プラットフォームzオフセット (西行-3/東行+3)
  var SUBWAY_STATIONS = [
    { name: '西駅',     x: -300 },
    { name: '中央西駅', x: -100 },
    { name: '中央東駅', x:  100 },
    { name: '東駅',     x:  300 }
  ];

  /* ---------- マテリアル (自己完結) ---------- */
  var _matConcrete = new THREE.MeshLambertMaterial({ color: 0x555b58 });  // ポータル枠
  var _matDark     = new THREE.MeshBasicMaterial({ color: 0x080a09 });    // 暗い穴
  var _matShelter  = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });  // シェルター屋根
  var _matPost     = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });  // 柱
  var _matSign     = new THREE.MeshLambertMaterial({ color: 0x1a3a5a });  // 標識板
  var _matSignPost = new THREE.MeshLambertMaterial({ color: 0x5a5d62 });  // 標識柱
  var _matVent     = new THREE.MeshLambertMaterial({ color: 0x6a6d72 });  // 通风塔
  var _matLamp     = new THREE.MeshLambertMaterial({ color: 0x8a8060 });  // 灯柱
  var _matLampHead = new THREE.MeshLambertMaterial({ color: 0xffe8a0, emissive: 0x442a00 }); // 灯具
  var _matWall     = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });  // 階段壁

  /* =========================================================
     ポータル — v042トンネルと同形式 (TorusGeometry半環 + 暗い円)
     ========================================================= */
  function _buildPortal(x, z) {
    var gy = terrainH(x, z);
    var g = new THREE.Group();
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.26, 8, 16, Math.PI), _matConcrete);
    ring.rotation.z = Math.PI;
    ring.position.y = 1.35;
    var dark = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), _matDark);
    dark.position.set(0, 1.3, 0.08);
    g.add(dark, ring);
    g.position.set(x, gy, z);
    scene.add(g);
    v088.meshes.push(g);
    return { group: g, gy: gy };
  }

  /* =========================================================
     シェルター — 4本柱 + 屋根 (全デバイス)
     屋根はsolidMeshesのみ(弾丸命中) / 柱はobstacles+solidMeshes(通行阻害)
     ========================================================= */
  function _buildShelter(x, z, gy) {
    var pp = [-2.8, 2.8];
    for (var pi = 0; pi < pp.length; pi++) {
      for (var pj = 0; pj < pp.length; pj++) {
        addBox(x + pp[pi], z + pp[pj], 0.2, 3.0, 0.2, _matPost, 0, gy, true);
      }
    }
    var roofGeo = new THREE.BoxGeometry(6.2, 0.25, 6.2);
    var roof = new THREE.Mesh(roofGeo, _matShelter);
    roof.position.set(x, gy + 3.1, z);
    roof.castShadow = !isMobile;
    scene.add(roof);
    v088.meshes.push(roof);
    solidMeshes.push(roof);  // 弾丸命中のみ / 歩行者通行は阻害しない
  }

  /* =========================================================
     駅名標識 — 柱 + 板 (デスクトップのみ)
     ========================================================= */
  function _buildSign(x, z, gy, label) {
    if (isMobile) return;
    var sx = x + 4, sz = z + 4;
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 0.2), _matSignPost);
    post.position.set(sx, gy + 1.75, sz);
    post.castShadow = !isMobile;
    scene.add(post);
    v088.meshes.push(post);
    solidMeshes.push(post);
    var board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.1), _matSign);
    board.position.set(sx, gy + 3.0, sz);
    board.castShadow = !isMobile;
    scene.add(board);
    v088.meshes.push(board);
    solidMeshes.push(board);
  }

  /* =========================================================
     通风塔 — シリンダー + キャップ (デスクトップのみ / 各駅1基)
     ========================================================= */
  function _buildVentShaft(x, z, gy) {
    if (isMobile) return;
    var vx = x - 4, vz = z + 4;
    var vent = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 3.5, 12), _matVent);
    vent.position.set(vx, gy + 1.75, vz);
    vent.castShadow = !isMobile;
    scene.add(vent);
    v088.meshes.push(vent);
    solidMeshes.push(vent);
    obstacles.push({ minX: vx - 1, maxX: vx + 1, minZ: vz - 1, maxZ: vz + 1, y0: gy, h: gy + 3.5 });
    var cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.2), _matVent);
    cap.position.set(vx, gy + 3.65, vz);
    scene.add(cap);
    v088.meshes.push(cap);
    solidMeshes.push(cap);
  }

  /* =========================================================
     階段壁 — ポータル両側の低壁 (全デバイス)
     低壁(0.8m)はcollidesAtでstep-over対象(yRef>h-0.4) → 通行阻害なし/視覚的区画
     ========================================================= */
  function _buildStairwellWalls(x, z, gy) {
    var wallH = 0.8, wallT = 0.15, wallLen = 4.0;
    for (var side = -1; side <= 1; side += 2) {
      addBox(x, z + side * 2.0, wallLen, wallH, wallT, _matWall, 0, gy, true);
    }
    if (!isMobile) {
      for (var end = -1; end <= 1; end += 2) {
        addBox(x + end * 2.0, z, wallT, wallH, 4.0, _matWall, 0, gy, true);
      }
    }
  }

  /* =========================================================
     プラットフォーム灯 — 柱 + 灯具 (デスクトップのみ)
     ========================================================= */
  function _buildLamp(x, z, gy) {
    if (isMobile) return;
    var lx = x - 3, lz = z - 3;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.0, 6), _matLamp);
    post.position.set(lx, gy + 2.0, lz);
    scene.add(post);
    v088.meshes.push(post);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.3), _matLampHead);
    head.position.set(lx, gy + 4.0, lz);
    scene.add(head);
    v088.meshes.push(head);
  }

  /* =========================================================
     全駅構築 — 4駅×2プラットフォーム = 8入口 → v042.tunnelsに追加
     環状線: 東行き(S1→S2→S3→S4→S1) / 西行き(S1→S4→S3→S2→S1)
     ========================================================= */
  function _buildStations() {
    var baseIdx = v042.tunnels.length;
    var platforms = [];
    for (var si = 0; si < SUBWAY_STATIONS.length; si++) {
      var st = SUBWAY_STATIONS[si];
      platforms.push({ x: st.x, z: SUBWAY_LINE_Z - SUBWAY_PLATFORM_OFFSET, dir: -1, name: st.name });
      platforms.push({ x: st.x, z: SUBWAY_LINE_Z + SUBWAY_PLATFORM_OFFSET, dir: 1, name: st.name });
    }
    // 接続先計算 (環状線 / 絶対インデックス)
    // pi=0:S1西→S4西(6) / pi=1:S1東→S2東(3) / pi=2:S2西→S1西(0) / pi=3:S2東→S3東(5)
    // pi=4:S3西→S2西(2) / pi=5:S3東→S4東(7) / pi=6:S4西→S3西(4) / pi=7:S4東→S1東(1)
    for (var pi = 0; pi < platforms.length; pi++) {
      var p = platforms[pi];
      var toRel;
      if (p.dir > 0) {
        toRel = (pi + 2) % platforms.length;                          // 東行き: 次の駅の東行き
      } else {
        toRel = (pi - 2 + platforms.length) % platforms.length;       // 西行き: 前の駅の西行き
      }
      p.to = baseIdx + toRel;  // 絶対インデックス
    }
    // 構築
    for (var bi = 0; bi < platforms.length; bi++) {
      var pf = platforms[bi];
      var portal = _buildPortal(pf.x, pf.z);
      var gy = portal.gy;
      _buildShelter(pf.x, pf.z, gy);
      var dirLabel = pf.dir > 0 ? '東行' : '西行';
      _buildSign(pf.x, pf.z, gy, pf.name + dirLabel);
      if (bi % 2 === 0) _buildVentShaft(pf.x, pf.z, gy);  // 各駅1基 (西行きプラットフォームに配置)
      _buildStairwellWalls(pf.x, pf.z, gy);
      _buildLamp(pf.x, pf.z, gy);
      v042.tunnels.push({
        x: pf.x, z: pf.z, to: pf.to,
        name: pf.name + dirLabel,
        group: portal.group
      });
    }
  }

  /* ---------- 公開API ---------- */
  v088.reset = function () {
    if (v088.initialized) return;  // 地下鉄駅 → 一度だけ生成
    _buildStations();
    v088.initialized = true;
  };

  v088.update = function (dt) {
    // 地下鉄駅は静的 (更新処理なし — テレポートはv042.updateV042が処理)
  };

})();

/* ---------- 公開API (main.jsから呼ばれるスタンドアロン関数) ---------- */
function resetV088() { if (v088.reset) v088.reset(); }
function updateV088(dt) { if (v088.update) v088.update(dt); }
