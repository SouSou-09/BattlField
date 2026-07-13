'use strict';
/* =========================================================
   v0.7.1 — マップ構造リアル化
   ・道路網ディテール: 縁石/街灯/ガードレール/交差点パッチ
   ・建物配置強化: 旗間の空白を街区で埋め、道路沿いに建物を並べる
   ・地形ディテール: 土手/側溝/畑の柵/地被パッチ
   ※既存の ROADS / flags / HQ_* / obstacles / addBox 等のグローバルを
     実行時に利用し、ソースファイル(map-*.js)は改変しない
   ========================================================= */
var v071 = { initialized: false, meshes: [], visT: 0 };

(function () {

  /* ---------- 位置ハッシュで決定的乱数 ---------- */
  function _hashV071(x, z) {
    let h = (x * 374761393 + z * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------- 距離判定ヘルパ ---------- */
  function _nearFlagV071(x, z, dist) {
    for (const f of flags) if (Math.hypot(x - f.x, z - f.z) < dist) return true;
    return false;
  }
  function _nearHqV071(x, z, dist) {
    if (Math.hypot(x - HQ_BLUE.x, z - HQ_BLUE.z) < dist) return true;
    if (Math.hypot(x - HQ_RED.x, z - HQ_RED.z) < dist) return true;
    return false;
  }

  /* =========================================================
     1. 道路縁石 — 各道路セグメントの両脇に縁石メッシュ
     ========================================================= */
  function _addRoadCurbsV071() {
    const matCurb = new THREE.MeshLambertMaterial({ color: 0x9a948a });
    const geoCurb = new THREE.BoxGeometry(0.35, 0.22, 1);
    for (let ri = 0; ri < ROADS.length; ri++) {
      const [x1, z1, x2, z2] = ROADS[ri];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      // 道路に垂直な方向(左右)のオフセット
      const offX = sin, offZ = -cos;   // 道路方向に対し垂直
      const offset = ROAD_W + 0.5;
      const step = 4.5;
      const n = Math.floor(len / step);
      for (let s = 0; s <= n; s++) {
        const t = n > 0 ? s / n : 0;
        const cx = x1 + dx * t, cz = z1 + dz * t;
        // 左右の縁石
        for (let side = -1; side <= 1; side += 2) {
          const px = cx + offX * offset * side;
          const pz = cz + offZ * offset * side;
          const gy = terrainH(px, pz);
          if (isWater(px, pz)) continue;
          const m = new THREE.Mesh(geoCurb, matCurb);
          m.position.set(px, gy + 0.11, pz);
          m.rotation.y = yaw;
          m.castShadow = false;
          m.receiveShadow = !isMobile;
          scene.add(m);
          v071.meshes.push(m);
        }
      }
    }
  }

  /* =========================================================
     2. 街灯 — 主要道路に沿ってポール+ライトヘッド
     ========================================================= */
  var _lampGeosV071 = null;
  function _initLampGeosV071() {
    _lampGeosV071 = {
      pole: new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6),
      arm: new THREE.BoxGeometry(1.6, 0.12, 0.12),
      head: new THREE.BoxGeometry(0.7, 0.22, 0.35)
    };
  }
  var _matLampPoleV071 = null, _matLampHeadV071 = null;
  function _addStreetlightsV071() {
    if (!_lampGeosV071) _initLampGeosV071();
    if (!_matLampPoleV071) {
      _matLampPoleV071 = new THREE.MeshLambertMaterial({ color: 0x3a3d40 });
      _matLampHeadV071 = new THREE.MeshLambertMaterial({
        color: 0xffe9b0, emissive: 0x665530, emissiveIntensity: 0.5
      });
    }
    // 主要道路(長いセグメント)のみに街灯を配置
    const interval = 28;
    for (let ri = 0; ri < ROADS.length; ri++) {
      const [x1, z1, x2, z2] = ROADS[ri];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 50) continue;   // 短いセグメントはスキップ
      const yaw = Math.atan2(dx, dz);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const offX = sin, offZ = -cos;
      const offset = ROAD_W + 1.8;
      const n = Math.floor(len / interval);
      for (let s = 1; s < n; s++) {
        const t = s / n;
        const cx = x1 + dx * t, cz = z1 + dz * t;
        // ハッシュで左右交互に配置
        const side = _hashV071(Math.round(cx), Math.round(cz)) > 0.5 ? 1 : -1;
        const px = cx + offX * offset * side;
        const pz = cz + offZ * offset * side;
        const gy = terrainH(px, pz);
        if (isWater(px, pz)) continue;
        // ポール
        const pole = new THREE.Mesh(_lampGeosV071.pole, _matLampPoleV071);
        pole.position.set(px, gy + 3.25, pz);
        pole.castShadow = !isMobile;
        scene.add(pole);
        v071.meshes.push(pole);
        // アーム(道路側へ伸ばす)
        const arm = new THREE.Mesh(_lampGeosV071.arm, _matLampPoleV071);
        arm.position.set(px - offX * 0.8 * side, gy + 6.4, pz - offZ * 0.8 * side);
        arm.rotation.y = yaw;
        scene.add(arm);
        v071.meshes.push(arm);
        // ライトヘッド
        const head = new THREE.Mesh(_lampGeosV071.head, _matLampHeadV071);
        head.position.set(px - offX * 1.5 * side, gy + 6.3, pz - offZ * 1.5 * side);
        scene.add(head);
        v071.meshes.push(head);
      }
    }
  }

  /* =========================================================
     3. ガードレール — 道路曲が部・崖際に柵
     ========================================================= */
  var _matGuardV071 = null, _geoGuardPostV071 = null, _geoGuardRailV071 = null;
  function _addGuardrailsV071() {
    if (!_matGuardV071) {
      _matGuardV071 = new THREE.MeshLambertMaterial({ color: 0x6a6e72 });
      _geoGuardPostV071 = new THREE.BoxGeometry(0.12, 0.9, 0.12);
      _geoGuardRailV071 = new THREE.BoxGeometry(0.1, 0.25, 1);
    }
    // 各道路について、地形との高低差が大きい箇所にガードレール
    for (let ri = 0; ri < ROADS.length; ri++) {
      const [x1, z1, x2, z2] = ROADS[ri];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const offX = sin, offZ = -cos;
      const offset = ROAD_W + 0.9;
      const step = 6;
      const n = Math.floor(len / step);
      for (let s = 2; s < n - 1; s++) {
        const t = s / n;
        const cx = x1 + dx * t, cz = z1 + dz * t;
        // 道路端と路肩の高低差をチェック
        const roadH = terrainH(cx, cz);
        for (let side = -1; side <= 1; side += 2) {
          const px = cx + offX * offset * side;
          const pz = cz + offZ * offset * side;
          const farX = cx + offX * (offset + 3) * side;
          const farZ = cz + offZ * (offset + 3) * side;
          if (isWater(farX, farZ)) {
            // 水際はガードレール設置
            _placeGuardSegmentV071(px, pz, farX, farZ, roadH, yaw);
          } else {
            const farH = terrainH(farX, farZ);
            if (Math.abs(farH - roadH) > 1.5) {
              _placeGuardSegmentV071(px, pz, farX, farZ, roadH, yaw);
            }
          }
        }
      }
    }
  }
  function _placeGuardSegmentV071(px, pz, fx, fz, baseH, yaw) {
    const gy = terrainH(px, pz);
    // ポスト2本
    for (const [dx2, dz2] of [[0, 0], [0.8, 0.8]]) {
      const post = new THREE.Mesh(_geoGuardPostV071, _matGuardV071);
      const wx = px + Math.cos(yaw) * dz2;
      const wz = pz - Math.sin(yaw) * dz2;
      post.position.set(wx, gy + 0.45, wz);
      scene.add(post);
      v071.meshes.push(post);
    }
    // 柵バー
    const rail = new THREE.Mesh(_geoGuardRailV071, _matGuardV071);
    rail.position.set(px, gy + 0.55, pz);
    rail.rotation.y = yaw;
    rail.scale.z = 1.2;
    scene.add(rail);
    v071.meshes.push(rail);
  }

  /* =========================================================
     4. フィラー建物 — 旗間・道路沿いの空白に建物を並べて街区形成
     ========================================================= */
  function _addFillerBuildingsV071() {
    // 道路に沿って、旗/HQから十分離れた位置に建物を配置
    const mats = [matBuildingA, matBuildingB, matBuildingC];
    const positions = [];
    // 各道路の中間点付近に1-2棟配置(道路沿いの街区)
    for (let ri = 0; ri < ROADS.length; ri++) {
      const [x1, z1, x2, z2] = ROADS[ri];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 80) continue;
      const yaw = Math.atan2(dx, dz);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const offX = sin, offZ = -cos;
      const offset = ROAD_W + 8;
      const nSlots = Math.floor(len / 60);
      for (let s = 1; s < nSlots; s++) {
        const t = s / nSlots + (_hashV071(ri * 100 + s, 0) - 0.5) * 0.1;
        const cx = x1 + dx * t, cz = z1 + dz * t;
        // 左右どちらかの側に建物
        const side = _hashV071(Math.round(cx), Math.round(cz)) > 0.5 ? 1 : -1;
        const px = cx + offX * offset * side;
        const pz = cz + offZ * offset * side;
        if (isWater(px, pz) || onRoad(px, pz)) continue;
        if (_nearFlagV071(px, pz, 20) || _nearHqV071(px, pz, 25)) continue;
        // サイズをハッシュで決定
        const h2 = _hashV071(Math.round(px * 0.1), Math.round(pz * 0.1));
        const w = 7 + h2 * 6;
        const d = 7 + _hashV071(Math.round(px * 0.1) + 7, Math.round(pz * 0.1)) * 6;
        const hgt = 6 + h2 * 8;
        const mat = mats[Math.floor(h2 * 3) % 3];
        positions.push({ x: px, z: pz, w, d, h: hgt, mat });
      }
    }
    // 配置実行(addBuildingはoffRoadPosで微調整される)
    for (const p of positions) {
      try { addBuilding(p.x, p.z, p.w, p.h, p.d, p.mat); } catch (e) { /* 衝突時スキップ */ }
    }
  }

  /* =========================================================
     5. 郊外住宅 — 村(拠点B)周辺に家を追加
     ========================================================= */
  function _addSuburbHousesV071() {
    const cx = flags[1].x, cz = flags[1].z;   // v0.8.0: 拠点B座標参照 (旧:-200,150)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const r = 35 + _hashV071(i, 77) * 20;
      const hx = cx + Math.cos(a) * r;
      const hz = cz + Math.sin(a) * r;
      if (isWater(hx, hz) || onRoad(hx, hz)) continue;
      if (_nearFlagV071(hx, hz, 16)) continue;
      try {
        addHouse(hx, hz, 6 + _hashV071(i, 3) * 3, 5 + _hashV071(i, 5) * 2,
                 6 + _hashV071(i, 9) * 2, a);
      } catch (e) { /* skip */ }
    }
  }

  /* =========================================================
     6. 地形ディテール — 土手/側溝/畑の柵/地被パッチ
     ========================================================= */

  // 6a. 側溝メッシュ — 道路脅に浅い凹み帯(見た目のみ)
  function _addDrainageDitchesV071() {
    const matDitch = new THREE.MeshLambertMaterial({ color: 0x6a6258 });
    for (let ri = 0; ri < ROADS.length; ri++) {
      const [x1, z1, x2, z2] = ROADS[ri];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 60) continue;
      const yaw = Math.atan2(dx, dz);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const offX = sin, offZ = -cos;
      const offset = ROAD_W + 1.0;
      const segs = Math.max(4, Math.ceil(len / 8));
      const geo = new THREE.PlaneGeometry(0.9, len, 1, segs);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), lz = pos.getZ(i);
        const wx = (x1 + x2) / 2 + lx * cos + lz * sin + offX * offset;
        const wz = (z1 + z2) / 2 - lx * sin + lz * cos + offZ * offset;
        pos.setX(i, wx);
        pos.setZ(i, wz);
        pos.setY(i, terrainH(wx, wz) - 0.15);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, matDitch);
      m.receiveShadow = !isMobile;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      scene.add(m);
      v071.meshes.push(m);
    }
  }

  // 6b. 畑の柵 — 開けた地域に木柵で区画
  function _addFieldFencesV071() {
    const matFence = new THREE.MeshLambertMaterial({ color: 0x5c4632 });
    const geoPost = new THREE.BoxGeometry(0.15, 1.0, 0.15);
    const geoRail = new THREE.BoxGeometry(1, 0.08, 0.08);
    const fields = [
      // v0.8.0: 座標を1.3倍へ再配置 (旧値は各行参照)
      { x: -169, z: 104, w: 40, d: 30 },   // 旧:-130,80
      { x: 104, z: -260, w: 50, d: 35 },   // 旧:80,-200
      { x: -390, z: 0, w: 35, d: 40 },     // 旧:-300,0
      { x: 195, z: -65, w: 40, d: 30 },    // 旧:150,-50
      { x: -104, z: 260, w: 45, d: 35 }    // 旧:-80,200
    ];
    for (const f of fields) {
      const corners = [
        [f.x - f.w / 2, f.z - f.d / 2],
        [f.x + f.w / 2, f.z - f.d / 2],
        [f.x + f.w / 2, f.z + f.d / 2],
        [f.x - f.w / 2, f.z + f.d / 2]
      ];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = corners[e];
        const [bx, bz] = corners[(e + 1) % 4];
        const elen = Math.hypot(bx - ax, bz - az);
        const eyaw = Math.atan2(bx - ax, bz - az);
        const cos = Math.cos(eyaw), sin = Math.sin(eyaw);
        const nP = Math.floor(elen / 3);
        for (let p = 0; p <= nP; p++) {
          const t = nP > 0 ? p / nP : 0;
          const px = ax + (bx - ax) * t;
          const pz = az + (bz - az) * t;
          if (isWater(px, pz) || onRoad(px, pz)) continue;
          const gy = terrainH(px, pz);
          const post = new THREE.Mesh(geoPost, matFence);
          post.position.set(px, gy + 0.5, pz);
          post.castShadow = false;
          scene.add(post);
          v071.meshes.push(post);
          // 横木2段
          if (p < nP) {
            for (const ry of [0.35, 0.7]) {
              const rail = new THREE.Mesh(geoRail, matFence);
              rail.position.set(px + (bx - ax) / nP * 0.5, gy + ry, pz + (bz - az) / nP * 0.5);
              rail.rotation.y = eyaw;
              rail.scale.z = elen / nP * 0.95;
              scene.add(rail);
              v071.meshes.push(rail);
            }
          }
        }
      }
    }
  }

  // 6c. 土手/カバー用低マウンド — 開けたエリアに低い土盛り(遮蔽)
  function _addBermsV071() {
    const matBerm = new THREE.MeshLambertMaterial({ color: 0x7a7048 });
    const bermSpots = [
      // v0.8.0: 座標を1.3倍へ再配置 (旧値は各行参照)
      [65, -52, 12, 1.2], [-78, -130, 14, 1.0], [221, 130, 10, 1.1],
      [-208, -156, 13, 1.3], [286, -65, 11, 1.0], [-65, 325, 12, 1.2],
      [130, 260, 10, 0.9], [-286, 195, 14, 1.1]
    ];
    for (const [bx, bz, r, hh] of bermSpots) {
      if (isWater(bx, bz) || onRoad(bx, bz)) continue;
      if (_nearFlagV071(bx, bz, 18)) continue;
      const geo = new THREE.CylinderGeometry(r, r + 1.5, hh, 12);
      geo.rotateX(-Math.PI / 2);
      // 頂点を地形になじませる
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const wx = bx + pos.getX(i);
        const wz = bz + pos.getZ(i);
        const dist = Math.hypot(pos.getX(i), pos.getZ(i));
        const t = Math.max(0, 1 - dist / r);
        pos.setY(i, terrainH(wx, wz) + hh * t * t * 0.7);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, matBerm);
      m.receiveShadow = !isMobile;
      scene.add(m);
      v071.meshes.push(m);
    }
  }

  // 6d. 交差点マーキング — 道路交点に白ペイント風パネル
  function _addIntersectionMarksV071() {
    const matMark = new THREE.MeshBasicMaterial({
      color: 0xd0c8a0, transparent: true, opacity: 0.5, depthWrite: false
    });
    // 道路同士の交差を近似検出: 各セグメントの中点で他セグメントとの最近接点を探す
    const crossPoints = [];
    for (let i = 0; i < ROADS.length; i++) {
      for (let j = i + 1; j < ROADS.length; j++) {
        const cp = _roadCrossV071(ROADS[i], ROADS[j]);
        if (cp) crossPoints.push(cp);
      }
    }
    for (const [cx, cz] of crossPoints) {
      if (isWater(cx, cz)) continue;
      const geo = new THREE.PlaneGeometry(3, 0.35);
      geo.rotateX(-Math.PI / 2);
      // クロスハパターン(2枚)
      for (let r = 0; r < 2; r++) {
        const m = new THREE.Mesh(geo, matMark);
        m.position.set(cx, terrainH(cx, cz) + 0.08, cz);
        m.rotation.y = r * Math.PI / 2;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -3;
        scene.add(m);
        v071.meshes.push(m);
      }
    }
  }
  function _roadCrossV071(a, b) {
    const [ax1, az1, ax2, az2] = a;
    const [bx1, bz1, bx2, bz2] = b;
    const d1x = ax2 - ax1, d1z = az2 - az1;
    const d2x = bx2 - bx1, d2z = bz2 - bz1;
    const denom = d1x * d2z - d1z * d2x;
    if (Math.abs(denom) < 0.001) return null;
    const t = ((bx1 - ax1) * d2z - (bz1 - az1) * d2x) / denom;
    const u = ((bx1 - ax1) * d1z - (bz1 - az1) * d1x) / denom;
    if (t < 0.05 || t > 0.95 || u < 0.05 || u > 0.95) return null;
    return [ax1 + d1x * t, az1 + d1z * t];
  }

  /* =========================================================
     7. 路上オブジェクト — バリケード/標識
     ========================================================= */
  function _addRoadsidePropsV071() {
    const matSign = new THREE.MeshLambertMaterial({ color: 0x4a5a3a });
    const matPost = new THREE.MeshLambertMaterial({ color: 0x555b52 });
    const geoPost = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 5);
    const geoSign = new THREE.BoxGeometry(0.6, 0.5, 0.04);
    // 旗の近くにバリケード/標識を配置
    for (const f of flags) {
      // 旗から道路方向へ2箇所
      for (let s = 0; s < 2; s++) {
        const ang = _hashV071(f.x + s * 10, f.z) * Math.PI * 2;
        const r = 16 + _hashV071(f.x, f.z + s * 10) * 6;
        const px = f.x + Math.cos(ang) * r;
        const pz = f.z + Math.sin(ang) * r;
        if (isWater(px, pz) || onRoad(px, pz)) continue;
        if (_nearFlagV071(px, pz, 14)) continue;
        const gy = terrainH(px, pz);
        const post = new THREE.Mesh(geoPost, matPost);
        post.position.set(px, gy + 1.25, pz);
        post.castShadow = false;
        scene.add(post);
        v071.meshes.push(post);
        const sign = new THREE.Mesh(geoSign, matSign);
        sign.position.set(px, gy + 2.2, pz);
        sign.rotation.y = ang;
        scene.add(sign);
        v071.meshes.push(sign);
      }
    }
  }

  /* =========================================================
     可視性カリング — 遠距離の装飾メッシュを非表示
     ========================================================= */
  function _updateVisibilityV071() {
    const px = player ? player.x : 0;
    const pz = player ? player.z : 0;
    const maxD2 = 220 * 220;
    for (const m of v071.meshes) {
      if (!m || !m.parent) continue;
      const dx = m.position.x - px;
      const dz = m.position.z - pz;
      const d2 = dx * dx + dz * dz;
      m.visible = d2 < maxD2;
    }
  }

  /* ---------- 公開API ---------- */
  v071.reset = function () {   // alias (resetV071から呼ばれる)
    if (v071.initialized) return;
    if (isMobile) return;       // モバイルは負荷軽減でスキップ
    v071.initialized = true;
    _addRoadCurbsV071();
    _addStreetlightsV071();
    _addGuardrailsV071();
    _addDrainageDitchesV071();
    _addIntersectionMarksV071();
    _addFillerBuildingsV071();
    _addSuburbHousesV071();
    _addFieldFencesV071();
    _addBermsV071();
    _addRoadsidePropsV071();
  };
})();

function resetV071() { if (v071.reset) v071.reset(); }
function updateV071(dt) {
  if (!v071.initialized) return;
  v071.visT += dt;
  if (v071.visT < 0.3) return;
  v071.visT = 0;
  if (v071.meshes.length > 0) {
    var px = (typeof player !== 'undefined' && player) ? player.x : 0;
    var pz = (typeof player !== 'undefined' && player) ? player.z : 0;
    var maxD2 = 220 * 220;
    for (var i = 0; i < v071.meshes.length; i++) {
      var m = v071.meshes[i];
      if (!m || !m.parent) continue;
      var dx = m.position.x - px, dz = m.position.z - pz;
      m.visible = dx * dx + dz * dz < maxD2;
    }
  }
}
