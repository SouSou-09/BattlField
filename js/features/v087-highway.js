'use strict';
/* =========================================================
   v0.8.7 — 高架道路 (Elevated highway)
   z=380を東西に横断する高架道路 (ルート検証済み: MILBASE/湖/道路と重複なし)
   ・高架甲板 (橋脚支持 + 柵) — 歩兵が甲板上を歩行可能、甲板下は通行可
   ・ランプ (階段衝突 + 滑らかな表面メッシュ) — 歩兵が昇降可能
   ・地形平坦化なし (FLATS不使用) — 障害物ベースの衝突判定で高架を実現
   ========================================================= */
var v087 = {
  initialized: false,
  meshes: []
};

(function () {

  /* ---------- 高架道路パラメータ ---------- */
  var HW_Z = 380;                 // 高架道路のz座標 (東西横断)
  var HW_DECK_H = 14;             // 甲板高さ (地形最高点11.05m + 余裕2.95m)
  var HW_HALF_W = 6;              // 道路半幅 (12m = 2車線)
  var HW_DECK_T = 0.4;            // 甲板厚
  var HW_RAMP_LEN = 60;           // ランプ長さ (片側) / 勾配≈22%
  var HW_STEP_H = 0.35;           // 階段高 (collidesAt制限: step高<0.4m)
  var HW_DECK_X1 = -160;          // 甲板西端
  var HW_DECK_X2 = 400;           // 甲板東端 (甲板長560m)
  var HW_RAMP_W1 = -220;          // 西ランプ起点 (DECK_X1 - RAMP_LEN)
  var HW_RAMP_E2 = 460;           // 東ランプ終点 (DECK_X2 + RAMP_LEN)
  var HW_PILLAR_SP = 40;          // 橋脚間隔
  var HW_PILLAR_W = 1.5;          // 橋脚幅

  /* ---------- マテリアル (自己完結) ---------- */
  var _matDeck = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });       // コンクリート甲板
  var _matRailing = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });    // 柵
  var _matPillar = new THREE.MeshLambertMaterial({ color: 0x5a5d62 });     // 橋脚
  var _matRamp = new THREE.MeshLambertMaterial({                           // ランプ路面
    color: 0x4a4d52,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  var _matWall = new THREE.MeshLambertMaterial({ color: 0x6a6d72 });       // 側壁
  var _matSign = new THREE.MeshLambertMaterial({ color: 0x2a4a6a });       // 標識
  var _matLamp = new THREE.MeshLambertMaterial({ color: 0x8a8060 });       // 灯柱

  /* =========================================================
     高架甲板 — スラブ + 柵 + 橋脚 + 灯
     ========================================================= */
  function _buildDeck() {
    var deckLen = HW_DECK_X2 - HW_DECK_X1;
    var cx = (HW_DECK_X1 + HW_DECK_X2) / 2;

    /* --- 甲板スラブ --- */
    // solid=falseでaddBoxせず手動生成 → 薄いスラブ障害物で甲板上歩行+甲板下通行を実現
    var deckGeo = new THREE.BoxGeometry(deckLen, HW_DECK_T, HW_HALF_W * 2);
    var deck = new THREE.Mesh(deckGeo, _matDeck);
    deck.position.set(cx, HW_DECK_H - HW_DECK_T / 2, HW_Z);
    deck.castShadow = deck.receiveShadow = !isMobile;
    scene.add(deck);
    v087.meshes.push(deck);
    solidMeshes.push(deck);
    // 障害物: y0=甲板底面, h=甲板上面 → 地上歩兵はy0より下を通行可、甲板上歩兵はhを接地とする
    obstacles.push({
      minX: HW_DECK_X1, maxX: HW_DECK_X2,
      minZ: HW_Z - HW_HALF_W, maxZ: HW_Z + HW_HALF_W,
      y0: HW_DECK_H - HW_DECK_T, h: HW_DECK_H
    });

    /* --- 側柵 (両側 / 全長) --- */
    var railH = 1.2, railT = 0.15;
    for (var side = -1; side <= 1; side += 2) {
      var rz = HW_Z + side * (HW_HALF_W - railT / 2);
      addBox(cx, rz, deckLen, railH, railT, _matRailing, 0, HW_DECK_H, true);

      /* --- 柵柱 (16m間隔 / デスクトップのみ) --- */
      if (!isMobile) {
        for (var px = HW_DECK_X1 + 8; px <= HW_DECK_X2 - 8; px += 16) {
          var postGeo = new THREE.BoxGeometry(0.12, railH, 0.12);
          var post = new THREE.Mesh(postGeo, _matRailing);
          post.position.set(px, HW_DECK_H + railH / 2, rz);
          post.castShadow = !isMobile;
          scene.add(post);
          v087.meshes.push(post);
          solidMeshes.push(post);
        }
      }
    }

    /* --- 中央分離帯 (低い縁石 / デスクトップのみ) --- */
    if (!isMobile) {
      addBox(cx, HW_Z, deckLen, 0.3, 0.3, _matRailing, 0, HW_DECK_H, true);
    }

    /* --- 橋脚 (等間隔 / 地形から甲板底面まで) --- */
    for (var pxx = HW_DECK_X1; pxx <= HW_DECK_X2; pxx += HW_PILLAR_SP) {
      var gy = terrainH(pxx, HW_Z);
      var pH = HW_DECK_H - HW_DECK_T - gy;
      if (pH < 1) continue; // 地形が高い場合は省略
      var pierGeo = new THREE.BoxGeometry(HW_PILLAR_W, pH, HW_PILLAR_W);
      var pier = new THREE.Mesh(pierGeo, _matPillar);
      pier.position.set(pxx, gy + pH / 2, HW_Z);
      pier.castShadow = pier.receiveShadow = !isMobile;
      scene.add(pier);
      v087.meshes.push(pier);
      solidMeshes.push(pier);
      obstacles.push({
        minX: pxx - HW_PILLAR_W / 2, maxX: pxx + HW_PILLAR_W / 2,
        minZ: HW_Z - HW_PILLAR_W / 2, maxZ: HW_Z + HW_PILLAR_W / 2,
        y0: gy, h: gy + pH
      });
    }

    /* --- 高架灯 (40m間隔 / デスクトップのみ) --- */
    if (!isMobile) {
      for (var lpx = HW_DECK_X1 + 20; lpx <= HW_DECK_X2 - 20; lpx += 40) {
        for (var lside = -1; lside <= 1; lside += 2) {
          var lpz = HW_Z + lside * (HW_HALF_W - 0.3);
          var lampPostGeo = new THREE.BoxGeometry(0.1, 2.5, 0.1);
          var lampPost = new THREE.Mesh(lampPostGeo, _matLamp);
          lampPost.position.set(lpx, HW_DECK_H + 1.25, lpz);
          scene.add(lampPost);
          v087.meshes.push(lampPost);
          var lampHeadGeo = new THREE.BoxGeometry(0.3, 0.15, 0.6);
          var lampHead = new THREE.Mesh(lampHeadGeo, _matLamp);
          lampHead.position.set(lpx, HW_DECK_H + 2.5, lpz);
          scene.add(lampHead);
          v087.meshes.push(lampHead);
        }
      }
    }
  }

  /* =========================================================
     ランプ — 階段衝突(step obstacles) + 滑らかな表面メッシュ + 側壁
     goingUp=true: 上り(地面→甲板) / false: 下り(甲板→地面)
     ========================================================= */
  function _buildRamp(rampStartX, rampEndX, y1, y2, goingUp) {
    var groundY = Math.min(y1, y2);
    var rise = Math.max(y1, y2) - groundY;
    var nSteps = Math.ceil(rise / HW_STEP_H);
    var stepHActual = rise / nSteps;        // 0.35以下に収まる実step高
    var stepDepth = HW_RAMP_LEN / nSteps;
    var dir = rampEndX > rampStartX ? 1 : -1;

    /* --- 衝突階段 (addBox → step obstacle) --- */
    // 各stepは地面からstep頂部までのsolid block → groundHeightAtで段々に登れる
    for (var i = 0; i < nSteps; i++) {
      var stepCx = rampStartX + dir * (i + 0.5) * stepDepth;
      var sH = goingUp ? stepHActual * (i + 1) : stepHActual * (nSteps - i);
      if (sH < 0.1) continue;
      addBox(stepCx, HW_Z, stepDepth + 0.02, sH, HW_HALF_W * 2, _matRamp, 0, groundY, true);
    }

    /* --- 滑らかなランプ表面メッシュ (傾斜PlaneGeometry) --- */
    // 回転規約: yaw = atan2(dx, dz) / local Z=進行方向
    // ワールド変換: wx = cx + lx*cos + lz*sin / wz = cz - lx*sin + lz*cos
    var cx = (rampStartX + rampEndX) / 2;
    var dx = rampEndX - rampStartX;
    var rampLen = Math.hypot(dx, 0);
    var yaw = Math.atan2(dx, 0);
    var cos = Math.cos(yaw), sin = Math.sin(yaw);
    var segs = Math.max(6, Math.ceil(rampLen / 3));
    var geo = new THREE.PlaneGeometry(HW_HALF_W * 2, rampLen, 1, segs);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for (var v = 0; v < pos.count; v++) {
      var lx = pos.getX(v), lz = pos.getZ(v);
      var wx = cx + lx * cos + lz * sin;
      var wz = HW_Z - lx * sin + lz * cos;
      pos.setX(v, wx);
      pos.setZ(v, wz);
      var t = (lz + rampLen / 2) / rampLen;  // 0=start, 1=end
      pos.setY(v, y1 + (y2 - y1) * t + 0.08);
    }
    geo.computeVertexNormals();
    var ramp = new THREE.Mesh(geo, _matRamp);
    ramp.receiveShadow = !isMobile;
    scene.add(ramp);
    v087.meshes.push(ramp);
    solidMeshes.push(ramp);

    /* --- 側壁 (両側 / デスクトップのみ) --- */
    // stepに追従する低い壁で転落防止 + 視覚的な側面
    if (!isMobile) {
      var wallH = 0.8;
      for (var wside = -1; wside <= 1; wside += 2) {
        var wallZ = HW_Z + wside * (HW_HALF_W - 0.08);
        for (var wi = 0; wi < nSteps; wi++) {
          var wcx = rampStartX + dir * (wi + 0.5) * stepDepth;
          var wH = goingUp ? stepHActual * (wi + 1) : stepHActual * (nSteps - wi);
          if (wH < 0.1) continue;
          var wallGeo = new THREE.BoxGeometry(stepDepth + 0.02, wallH, 0.12);
          var wall = new THREE.Mesh(wallGeo, _matWall);
          wall.position.set(wcx, groundY + wH + wallH / 2, wallZ);
          wall.castShadow = !isMobile;
          scene.add(wall);
          v087.meshes.push(wall);
          solidMeshes.push(wall);
        }
      }
    }
  }

  function _buildRamps() {
    /* --- 西ランプ (上り: 地面→甲板) --- */
    var westGroundY = terrainH(HW_RAMP_W1, HW_Z);
    _buildRamp(HW_RAMP_W1, HW_DECK_X1, westGroundY, HW_DECK_H, true);

    /* --- 東ランプ (下り: 甲板→地面) --- */
    var eastGroundY = terrainH(HW_RAMP_E2, HW_Z);
    _buildRamp(HW_DECK_X2, HW_RAMP_E2, HW_DECK_H, eastGroundY, false);
  }

  /* =========================================================
     高架道路標識 (ランプ入口 / デスクトップのみ)
     ========================================================= */
  function _buildSigns() {
    if (isMobile) return;
    var signPositions = [
      { x: HW_RAMP_W1 - 4, gy: terrainH(HW_RAMP_W1 - 4, HW_Z) },
      { x: HW_RAMP_E2 + 4, gy: terrainH(HW_RAMP_E2 + 4, HW_Z) }
    ];
    for (var si = 0; si < signPositions.length; si++) {
      var sp = signPositions[si];
      var sz = HW_Z + HW_HALF_W + 3;
      var postGeo = new THREE.BoxGeometry(0.2, 4, 0.2);
      var post = new THREE.Mesh(postGeo, _matPillar);
      post.position.set(sp.x, sp.gy + 2, sz);
      post.castShadow = !isMobile;
      scene.add(post);
      v087.meshes.push(post);
      solidMeshes.push(post);
      var boardGeo = new THREE.BoxGeometry(3, 1.2, 0.1);
      var board = new THREE.Mesh(boardGeo, _matSign);
      board.position.set(sp.x, sp.gy + 3.5, sz);
      board.castShadow = !isMobile;
      scene.add(board);
      v087.meshes.push(board);
      solidMeshes.push(board);
    }
  }

  /* =========================================================
     公開API
     ========================================================= */
  v087.reset = function () {
    if (v087.initialized) return; // 地形構造物 → 一度だけ生成
    _buildDeck();
    _buildRamps();
    _buildSigns();
    v087.initialized = true;
  };

  v087.update = function (dt) {
    // 高架道路は静的 (更新処理なし)
  };

})();

/* ---------- 公開API (main.jsから呼ばれるスタンドアロン関数) ---------- */
function resetV087() { if (v087.reset) v087.reset(); }
function updateV087(dt) { if (v087.update) v087.update(dt); }
