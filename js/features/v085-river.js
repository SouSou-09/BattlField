'use strict';
/* =========================================================
   v0.8.5 — 川と橋と渡し場
   ・川水面メッシュ (RIVER_PATHに沿った帯状プレーン)
   ・橋梁構造 (4橋: 甲板+柵+橋脚 / 道路-川交点に配置)
   ・渡し場マーカー (2箇所: 浅瀬水面+警告杭+標識)
   ・地形の掘削/平坦化は terrain.js 側で実施済み
   ========================================================= */
var v085 = {
  initialized: false,
  meshes: []      // 全メッシュ参照 (デバッグ用)
};

(function () {

  /* ---------- マテリアル (自己完結) ---------- */
  var _matRiver = new THREE.MeshLambertMaterial({
    color: 0x2e6f8e, transparent: true, opacity: 0.78,
    depthWrite: false, side: THREE.DoubleSide
  });
  var _matFord = new THREE.MeshLambertMaterial({
    color: 0x7ab8c8, transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide
  });
  var _matDeck = new THREE.MeshLambertMaterial({ color: 0x6b6e72 });
  var _matRail = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
  var _matRailPost = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  var _matPier = new THREE.MeshLambertMaterial({ color: 0x5a5d62 });
  var _matPost = new THREE.MeshLambertMaterial({ color: 0x8a7a4a });
  var _matSign = new THREE.MeshLambertMaterial({ color: 0xc84030 });

  /* =========================================================
     川水面メッシュ — RIVER_PATH 各セグメントをプレーンで覆う
     ========================================================= */
  function _buildRiverWater() {
    var halfW = RIVER_HALF_WIDTH + 3; // 両岸に3m張り出し (地形下に隠れる)
    for (var i = 0; i < RIVER_PATH.length - 1; i++) {
      var x1 = RIVER_PATH[i][0], z1 = RIVER_PATH[i][1];
      var x2 = RIVER_PATH[i + 1][0], z2 = RIVER_PATH[i + 1][1];
      var dx = x2 - x1, dz = z2 - z1;
      var len = Math.hypot(dx, dz);
      var yaw = Math.atan2(dx, dz); // 道路と同じ規約: local Z = 進行方向
      var cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      var segs = Math.max(2, Math.ceil(len / 10));
      var geo = new THREE.PlaneGeometry(halfW * 2, len + 2, 1, segs);
      geo.rotateX(-Math.PI / 2);
      var m = new THREE.Mesh(geo, _matRiver);
      m.position.set(cx, WATER_Y, cz);
      m.rotation.y = yaw;
      scene.add(m);
      v085.meshes.push(m);
    }
  }

  /* =========================================================
     橋梁構造 — 甲板 + 両側柵 + 柵柱 + 橋脚
     回転規約: rotY = atan2(dx,dz) / local Z=橋長方向 / local X=橋幅方向
     ワールド変換: wx = x + lx*cos + lz*sin / wz = z - lx*sin + lz*cos
     ========================================================= */
  function _buildBridges() {
    for (var i = 0; i < RIVER_BRIDGES.length; i++) {
      var b = RIVER_BRIDGES[i];
      var cos = Math.cos(b.rotY), sin = Math.sin(b.rotY);
      var deckT = 0.5; // 甲板厚

      /* --- 甲板スラブ --- */
      // solid=false (通行ブロックなし / FLATSが甲板高さを提供)
      // solidMeshesに手動追加 → 弾丸が甲板に命中する
      var deck = addBox(b.x, b.z, b.width, deckT, b.span, _matDeck, b.rotY, b.deckH - deckT, false);
      if (deck) v085.meshes.push(deck);
      if (deck) solidMeshes.push(deck);

      /* --- 側柵 (両側) --- */
      var railH = 1.0, railT = 0.15;
      for (var side = -1; side <= 1; side += 2) {
        var lx = side * (b.width / 2 - railT / 2);
        var rx = b.x + lx * cos;
        var rz = b.z - lx * sin;
        // 柵本体 (通行ブロックあり)
        var rail = addBox(rx, rz, railT, railH, b.span, _matRail, b.rotY, b.deckH, true);
        if (rail) v085.meshes.push(rail);

        // 柵柱 (4m間隔 / デスクトップのみ)
        if (!isMobile) {
          for (var pp = -b.span / 2 + 2; pp <= b.span / 2 - 2; pp += 4) {
            var px = b.x + lx * cos + pp * sin;
            var pz = b.z - lx * sin + pp * cos;
            var postGeo = new THREE.BoxGeometry(0.1, railH, 0.1);
            var post = new THREE.Mesh(postGeo, _matRailPost);
            post.position.set(px, b.deckH + railH / 2, pz);
            post.rotation.y = b.rotY;
            post.castShadow = !isMobile;
            scene.add(post);
            v085.meshes.push(post);
            solidMeshes.push(post);
          }
        }
      }

      /* --- 橋脚 (川底から甲板まで / デスクトップのみ) --- */
      if (!isMobile) {
        var pierOffsets = [-RIVER_HALF_WIDTH * 0.6, 0, RIVER_HALF_WIDTH * 0.6];
        for (var pi = 0; pi < pierOffsets.length; pi++) {
          var plz = pierOffsets[pi];
          var px = b.x + plz * sin;
          var pz = b.z + plz * cos;
          var bedY = terrainHeight(px, pz); // 掘削込みの川底高さ
          if (bedY > b.deckH - 1.5) continue; // 橋脚が短すぎる(岸上) → 省略
          var pierH = b.deckH - bedY + 0.4;
          var pierGeo = new THREE.BoxGeometry(1.0, pierH, 1.0);
          var pier = new THREE.Mesh(pierGeo, _matPier);
          pier.position.set(px, b.deckH - pierH / 2, pz);
          pier.castShadow = pier.receiveShadow = !isMobile;
          scene.add(pier);
          v085.meshes.push(pier);
          solidMeshes.push(pier);
          obstacles.push({
            minX: px - 0.5, maxX: px + 0.5,
            minZ: pz - 0.5, maxZ: pz + 0.5,
            y0: bedY - 0.4, h: b.deckH
          });
        }
      }
    }
  }

  /* =========================================================
     渡し場マーカー — 浅瀬水面 + 警告杭 + 標識
     ========================================================= */
  function _buildFords() {
    for (var i = 0; i < RIVER_FORDS.length; i++) {
      var f = RIVER_FORDS[i];

      /* --- 浅瀬水面 (明るい水色) --- */
      var geo = new THREE.CircleGeometry(f.r + 2, 20);
      geo.rotateX(-Math.PI / 2);
      var m = new THREE.Mesh(geo, _matFord);
      m.position.set(f.x, WATER_Y + 0.03, f.z);
      scene.add(m);
      v085.meshes.push(m);

      /* --- 警告杭 (両岸に2本ずつ) --- */
      for (var side = -1; side <= 1; side += 2) {
        for (var p = 0; p < 2; p++) {
          var off = (p === 0 ? -1 : 1) * 2;
          var px = f.x + side * (f.r + 1.5);
          var pz = f.z + off;
          var gy = terrainH(px, pz);
          if (gy < WATER_Y) gy = WATER_Y + 0.3; // 水中なら水面近くに固定
          var postGeo = new THREE.BoxGeometry(0.18, 2.0, 0.18);
          var post = new THREE.Mesh(postGeo, _matPost);
          post.position.set(px, gy + 1.0, pz);
          post.castShadow = !isMobile;
          scene.add(post);
          v085.meshes.push(post);
          solidMeshes.push(post);

          /* --- 警告標識 (上部に赤板 / デスクトップのみ) --- */
          if (!isMobile) {
            var signGeo = new THREE.BoxGeometry(0.6, 0.3, 0.05);
            var sign = new THREE.Mesh(signGeo, _matSign);
            sign.position.set(px, gy + 1.7, pz);
            sign.castShadow = !isMobile;
            scene.add(sign);
            v085.meshes.push(sign);
            solidMeshes.push(sign);
          }
        }
      }
    }
  }

  /* =========================================================
     公開API
     ========================================================= */
  v085.reset = function () {
    if (v085.initialized) return; // 地形構造物 → 一度だけ生成
    _buildRiverWater();
    _buildBridges();
    _buildFords();
    v085.initialized = true;
  };

  v085.update = function (dt) {
    // 川・橋・渡し場は静的 (更新処理なし)
  };

})();

/* ---------- 公開API (main.jsから呼ばれるスタンドアロン関数) ---------- */
function resetV085() { if (v085.reset) v085.reset(); }
function updateV085(dt) { if (v085.update) v085.update(dt); }
