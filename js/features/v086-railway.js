'use strict';
/* =========================================================
   v0.8.6 — 鉄道と貨物駅
   ・軌道メッシュ (RAILWAY_PATHに沿った2本レール+枕木+砕石路盤)
   ・貨物駅 (中央RAILWAY_STATION位置にプラットホーム+待合所+コンテナ+クレーン)
   ・地形平坦化は terrain.js 側で実施済み (FLATS帯状平坦化)
   ========================================================= */
var v086 = {
  initialized: false,
  meshes: []
};

(function () {

  /* ---------- マテリアル (自己完結) ---------- */
  var _matBallast = new THREE.MeshLambertMaterial({ color: 0x6b665c });  // 砕石路盤
  var _matSleeper = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });  // 枕木(濃茶)
  var _matRail = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });     // レール(鋼鉄色)
  var _matPlatform = new THREE.MeshLambertMaterial({ color: 0x8a8680 }); // プラットホーム
  var _matStationBldg = new THREE.MeshLambertMaterial({ color: 0x9a8f7a }); // 駅舎
  var _matRoof = new THREE.MeshLambertMaterial({ color: 0x6a5040 });     // 駅舎屋根
  var _matContainer = new THREE.MeshLambertMaterial({ color: 0x3d6b4f }); // コンテナ(緑)
  var _matContainer2 = new THREE.MeshLambertMaterial({ color: 0x8a6a3a }); // コンテナ(茶)
  var _matCrane = new THREE.MeshLambertMaterial({ color: 0xe0a030 });    // クレーン(黄)
  var _matCraneDark = new THREE.MeshLambertMaterial({ color: 0x8a6010 }); // クレーン暗部
  var _matSign = new THREE.MeshLambertMaterial({ color: 0x2a4a6a });     // 駅名標

  /* =========================================================
     軌道メッシュ — RAILWAY_PATH各セグメントに沿って配置
     回転規約: yaw = atan2(dx, dz) / local Z = 進行方向
     ワールド変換: wx = x + lx*cos + lz*sin / wz = z - lx*sin + lz*cos
     ========================================================= */
  var GAUGE = 1.435;   // 標準軌間
  var RAIL_H = 0.15;   // レール高さ
  var RAIL_W = 0.08;   // レール幅
  var SLEEPER_W = 2.6; // 枕木長さ
  var SLEEPER_D = 0.3; // 枕木幅
  var SLEEPER_H = 0.2; // 枕木高さ
  var SLEEPER_SP = 0.7;// 枕木間隔
  var BALLAST_W = 6;   // 砕石路盤幅

  function _buildTrack() {
    var railY = 2.05; // FLATS平坦化高さ(2.0) + 砕石厚み0.05

    for (var i = 0; i < RAILWAY_PATH.length - 1; i++) {
      var x1 = RAILWAY_PATH[i][0], z1 = RAILWAY_PATH[i][1];
      var x2 = RAILWAY_PATH[i + 1][0], z2 = RAILWAY_PATH[i + 1][1];
      var dx = x2 - x1, dz = z2 - z1;
      var len = Math.hypot(dx, dz);
      var yaw = Math.atan2(dx, dz);
      var cos = Math.cos(yaw), sin = Math.sin(yaw);
      var segs = Math.max(2, Math.ceil(len / 8));

      /* --- 砕石路盤 (帯状プレーン) --- */
      var ballastGeo = new THREE.PlaneGeometry(BALLAST_W, len, 1, segs);
      ballastGeo.rotateX(-Math.PI / 2);
      // 地形に沿わせる
      var pos = ballastGeo.attributes.position;
      for (var v = 0; v < pos.count; v++) {
        var lx = pos.getX(v), lz = pos.getZ(v);
        var wx = (x1 + x2) / 2 + lx * cos + lz * sin;
        var wz = (z1 + z2) / 2 - lx * sin + lz * cos;
        pos.setY(v, terrainH(wx, wz) + 0.02);
      }
      ballastGeo.computeVertexNormals();
      var ballast = new THREE.Mesh(ballastGeo, _matBallast);
      ballast.rotation.y = yaw;
      ballast.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
      ballast.receiveShadow = !isMobile;
      scene.add(ballast);
      v086.meshes.push(ballast);

      /* --- 枕木 (定間隔) --- */
      for (var s = 0; s < len; s += SLEEPER_SP) {
        var lz = s - len / 2;
        var px = (x1 + x2) / 2 + lz * sin;
        var pz = (z1 + z2) / 2 + lz * cos;
        var slGeo = new THREE.BoxGeometry(SLEEPER_W, SLEEPER_H, SLEEPER_D);
        var sleeper = new THREE.Mesh(slGeo, _matSleeper);
        sleeper.position.set(px, railY - RAIL_H, pz);
        sleeper.rotation.y = yaw;
        sleeper.castShadow = !isMobile;
        sleeper.receiveShadow = !isMobile;
        scene.add(sleeper);
        v086.meshes.push(sleeper);
      }

      /* --- 2本レール (左右) --- */
      for (var side = -1; side <= 1; side += 2) {
        var lx = side * GAUGE / 2;
        var railGeo = new THREE.BoxGeometry(RAIL_W, RAIL_H, len);
        var rail = new THREE.Mesh(railGeo, _matRail);
        rail.position.set(
          (x1 + x2) / 2 + lx * cos,
          railY - RAIL_H / 2,
          (z1 + z2) / 2 - lx * sin
        );
        rail.rotation.y = yaw;
        rail.castShadow = !isMobile;
        scene.add(rail);
        v086.meshes.push(rail);
        solidMeshes.push(rail);
      }
    }
  }

  /* =========================================================
     貨物駅 — プラットホーム + 駅舎 + コンテナ群 + クレーン + 駅名標
     RAILWAY_STATION = { x: 0, z: 480, rotY: 0, w: 36, d: 60, platformH: 1.2 }
     ========================================================= */
  function _buildStation() {
    var st = RAILWAY_STATION;
    var cos = Math.cos(st.rotY), sin = Math.sin(st.rotY);
    // ワールド座標変換ヘルパ
    function l2w(lx, lz) {
      return { x: st.x + lx * cos + lz * sin, z: st.z - lx * sin + lz * cos };
    }
    var gy = terrainH(st.x, st.z); // FLATS平坦化後の高さ(2.0)

    /* --- プラットホーム (軌道両側) --- */
    for (var side = -1; side <= 1; side += 2) {
      var pPos = l2w(side * (GAUGE / 2 + 2.5), 0);
      var platGeo = new THREE.BoxGeometry(3, st.platformH, st.d - 4);
      var platform = new THREE.Mesh(platGeo, _matPlatform);
      platform.position.set(pPos.x, gy + st.platformH / 2, pPos.z);
      platform.rotation.y = st.rotY;
      platform.castShadow = platform.receiveShadow = !isMobile;
      scene.add(platform);
      v086.meshes.push(platform);
      solidMeshes.push(platform);
      // プラットホームに乗れるよう障害物登録(低いので通行可)
      obstacles.push({
        minX: pPos.x - 1.5, maxX: pPos.x + 1.5,
        minZ: pPos.z - (st.d - 4) / 2, maxZ: pPos.z + (st.d - 4) / 2,
        y0: gy, h: gy + st.platformH
      });
    }

    /* --- 駅舎 (プラットホーム南側) --- */
    var bldgLz = st.d / 2 + 8;
    var bldgPos = l2w(0, bldgLz);
    // 駓輌舎
    addBox(bldgPos.x, bldgPos.z, 14, 6, 10, _matStationBldg, st.rotY, gy, true);
    v086.meshes.push(solidMeshes[solidMeshes.length - 1]);
    // 屋根
    var roofGeo = new THREE.BoxGeometry(15, 0.4, 11);
    var roof = new THREE.Mesh(roofGeo, _matRoof);
    roof.position.set(bldgPos.x, gy + 6.2, bldgPos.z);
    roof.rotation.y = st.rotY;
    roof.castShadow = !isMobile;
    scene.add(roof);
    v086.meshes.push(roof);
    solidMeshes.push(roof);
    obstacles.push({
      minX: bldgPos.x - 7.5, maxX: bldgPos.x + 7.5,
      minZ: bldgPos.z - 5.5, maxZ: bldgPos.z + 5.5,
      y0: gy + 6, h: gy + 6.4
    });

    /* --- コンテナ群 (プラットホーム北側 / 3列×4段) --- */
    if (!isMobile) {
      var contLz = -st.d / 2 - 6;
      for (var ci = 0; ci < 3; ci++) {
        for (var cj = 0; cj < 4; cj++) {
          var cPos = l2w((ci - 1) * 5, contLz - cj * 3);
          var contMat = (cj % 2 === 0) ? _matContainer : _matContainer2;
          var contGeo = new THREE.BoxGeometry(4, 2.6, 2.5);
          var container = new THREE.Mesh(contGeo, contMat);
          container.position.set(cPos.x, gy + 1.3, cPos.z);
          container.rotation.y = st.rotY;
          container.castShadow = container.receiveShadow = !isMobile;
          scene.add(container);
          v086.meshes.push(container);
          solidMeshes.push(container);
          obstacles.push({
            minX: cPos.x - 2, maxX: cPos.x + 2,
            minZ: cPos.z - 1.25, maxZ: cPos.z + 1.25,
            y0: gy, h: gy + 2.6
          });
        }
      }
    }

    /* --- ガントリークレーン (軌道上空 / デスクトップのみ) --- */
    if (!isMobile) {
      var craneLz = -st.d / 2 + 5;
      var cranePos = l2w(0, craneLz);
      // 2本脚
      for (var cs = -1; cs <= 1; cs += 2) {
        var legGeo = new THREE.BoxGeometry(0.5, 8, 0.5);
        var leg = new THREE.Mesh(legGeo, _matCraneDark);
        leg.position.set(cranePos.x + cs * 5, gy + 4, cranePos.z);
        leg.castShadow = !isMobile;
        scene.add(leg);
        v086.meshes.push(leg);
        solidMeshes.push(leg);
      }
      // 水平梁
      var beamGeo = new THREE.BoxGeometry(11, 0.6, 0.6);
      var beam = new THREE.Mesh(beamGeo, _matCrane);
      beam.position.set(cranePos.x, gy + 8, cranePos.z);
      beam.castShadow = !isMobile;
      scene.add(beam);
      v086.meshes.push(beam);
      solidMeshes.push(beam);
      obstacles.push({
        minX: cranePos.x - 5.5, maxX: cranePos.x + 5.5,
        minZ: cranePos.z - 0.3, maxZ: cranePos.z + 0.3,
        y0: gy + 7.7, h: gy + 8.3
      });
      // フック
      var hookGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8);
      var hook = new THREE.Mesh(hookGeo, _matCraneDark);
      hook.position.set(cranePos.x, gy + 6.8, cranePos.z);
      scene.add(hook);
      v086.meshes.push(hook);
    }

    /* --- 駅名標 (プラットホーム端) --- */
    for (var ss = -1; ss <= 1; ss += 2) {
      var signPos = l2w(ss * (GAUGE / 2 + 2.5), st.d / 2 - 2);
      var signPostGeo = new THREE.BoxGeometry(0.15, 3, 0.15);
      var signPost = new THREE.Mesh(signPostGeo, _matCraneDark);
      signPost.position.set(signPos.x, gy + 1.5, signPos.z);
      signPost.castShadow = !isMobile;
      scene.add(signPost);
      v086.meshes.push(signPost);
      solidMeshes.push(signPost);
      // 標識板
      var signBoardGeo = new THREE.BoxGeometry(2, 0.6, 0.08);
      var signBoard = new THREE.Mesh(signBoardGeo, _matSign);
      signBoard.position.set(signPos.x, gy + 2.5, signPos.z);
      signBoard.castShadow = !isMobile;
      scene.add(signBoard);
      v086.meshes.push(signBoard);
      solidMeshes.push(signBoard);
    }
  }

  /* =========================================================
     公開API
     ========================================================= */
  v086.reset = function () {
    if (v086.initialized) return; // 地形構造物 → 一度だけ生成
    _buildTrack();
    _buildStation();
    v086.initialized = true;
  };

  v086.update = function (dt) {
    // 鉄道・貨物駅は静的 (更新処理なし)
  };

})();

/* ---------- 公開API (main.jsから呼ばれるスタンドアロン関数) ---------- */
function resetV086() { if (v086.reset) v086.reset(); }
function updateV086(dt) { if (v086.update) v086.update(dt); }
