'use strict';
/* =========================================================
   v0.9.2 — 南北対称の陸空統合大規模基地
   MILBASE_BLUE / MILBASE_RED 平地に滑走路・管制塔・格納庫・
   エプロン・対空砲・柵を配置
   ・滑走路 最大240×24m (d方向=長辺に沿う)
   ・管制塔 18m / 格納庫 各基地2棟
   ・陸軍区画 (司令部・兵舎・車両整備庫・補給所・ヘリパッド)
   ・エプロンスロット APRON_SLOTS_BLUE / APRON_SLOTS_RED (v0.8.4参照)
   ・対空砲 各基地2基 (createEmplacement)
   ・柵 + 探照灯
   ・220m距離カリング / モバイル詳細減
   ※MILBASEは rotY で回転 → ローカル→ワールド変換で配置
   ========================================================= */
var v082 = { initialized: false, meshes: [], visT: 0 };

// v0.8.4 ジェットがスポーンする駐機スロット (グローバル)
var APRON_SLOTS_BLUE = [];
var APRON_SLOTS_RED  = [];

(function () {

  /* ---------- ローカル→ワールド座標変換 ---------- */
  function _l2w(mb, lx, lz) {
    const c = Math.cos(mb.rotY), s = Math.sin(mb.rotY);
    return { x: mb.x + lx * c - lz * s, z: mb.z + lx * s + lz * c };
  }
  function _l2wYaw(mb, lyaw) { return mb.rotY + lyaw; }

  /* ---------- 決定的乱数 ---------- */
  function _hashV082(x, z) {
    let h = (x * 374761393 + z * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------- メッシュ登録ヘルパ ---------- */
  function _pushMesh(m) {
    if (m && m.isMesh) v082.meshes.push(m);
    else if (m && m.isGroup) {
      m.traverse(function (c) { if (c.isMesh) v082.meshes.push(c); });
    }
  }

  /* =========================================================
     滑走路 — 最大240×24m アスファルト + 中央線
     ========================================================= */
  function _addRunway(mb) {
    const matAsphalt = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });
    const matLine    = new THREE.MeshLambertMaterial({ color: 0xd0d0d0 });
    const rwLen = Math.min(240, mb.d - 40), rwW = 24;
    // 滑走路表面 (薄いBoxで法線を正しく)
    const rwGeo = new THREE.BoxGeometry(rwW, 0.3, rwLen);
    const rw = new THREE.Mesh(rwGeo, matAsphalt);
    const c0 = _l2w(mb, 0, 0);
    rw.position.set(c0.x, mb.flatH + 0.15, c0.z);
    rw.rotation.y = mb.rotY;
    rw.receiveShadow = !isMobile;
    scene.add(rw);
    _pushMesh(rw);
    // 中央破線
    const dashGeo = new THREE.BoxGeometry(0.6, 0.32, 4);
    for (let lz = -rwLen / 2 + 18; lz <= rwLen / 2 - 18; lz += 20) {
      const p = _l2w(mb, 0, lz);
      const dash = new THREE.Mesh(dashGeo, matLine);
      dash.position.set(p.x, mb.flatH + 0.32, p.z);
      dash.rotation.y = mb.rotY;
      scene.add(dash);
      _pushMesh(dash);
    }
    // 滑走路端マーク (閾値)
    for (const lz of [-rwLen / 2 + 5, rwLen / 2 - 5]) {
      for (let k = -3; k <= 3; k++) {
        const p = _l2w(mb, k * 3, lz);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.32, 3), matLine);
        bar.position.set(p.x, mb.flatH + 0.32, p.z);
        bar.rotation.y = mb.rotY;
        scene.add(bar);
        _pushMesh(bar);
      }
    }
  }

  /* =========================================================
     誘導路 — 滑走路と格納庫・エプロンを結ぶ明確な航空区画
     ========================================================= */
  function _addTaxiways(mb) {
    const matTaxi = new THREE.MeshLambertMaterial({ color: 0x34363a });
    const matTaxiLine = new THREE.MeshBasicMaterial({ color: 0xd4b942 });
    const taxiX = -32, taxiLen = Math.min(236, mb.d - 44);
    const p = _l2w(mb, taxiX, 0);
    const taxi = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, taxiLen), matTaxi);
    taxi.position.set(p.x, mb.flatH + 0.09, p.z);
    taxi.rotation.y = mb.rotY;
    taxi.receiveShadow = !isMobile;
    scene.add(taxi); _pushMesh(taxi);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, taxiLen - 8), matTaxiLine);
    line.position.set(p.x, mb.flatH + 0.19, p.z);
    line.rotation.y = mb.rotY;
    scene.add(line); _pushMesh(line);
    for (const lz of [-82, 0, 82]) {
      const cp = _l2w(mb, -16, lz);
      const connector = new THREE.Mesh(new THREE.BoxGeometry(32, 0.15, 8), matTaxi);
      connector.position.set(cp.x, mb.flatH + 0.08, cp.z);
      connector.rotation.y = mb.rotY;
      scene.add(connector); _pushMesh(connector);
    }
  }

  /* =========================================================
     管制塔 — 18m 高さ
     ========================================================= */
  function _addControlTower(mb, side) {
    // side: -1 or +1 (滑走路のどちら側)
    const matConcrete = new THREE.MeshLambertMaterial({ color: 0x6a6e72 });
    const matGlass    = new THREE.MeshLambertMaterial({ color: 0x4a6a8a, transparent: true, opacity: 0.7 });
    const matDark     = new THREE.MeshLambertMaterial({ color: 0x3a3e42 });
    const lx = side * (mb.w / 2 - 12);
    const lz = -mb.d / 2 + 40;   // 滑走路の端寄り
    const p = _l2w(mb, lx, lz);
    const gy = mb.flatH;
    // 塔体 (4段)
    const baseBox = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), matConcrete);
    baseBox.position.set(p.x, gy + 2, p.z);
    baseBox.rotation.y = mb.rotY;
    baseBox.castShadow = !isMobile;
    scene.add(baseBox);
    _pushMesh(baseBox);
    // シャフト
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), matConcrete);
    shaft.position.set(p.x, gy + 9, p.z);
    shaft.rotation.y = mb.rotY;
    shaft.castShadow = !isMobile;
    scene.add(shaft);
    _pushMesh(shaft);
    // 制御室 (ガラス張り)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), matGlass);
    cab.position.set(p.x, gy + 15.5, p.z);
    cab.rotation.y = mb.rotY;
    cab.castShadow = !isMobile;
    scene.add(cab);
    _pushMesh(cab);
    // 屋根
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.5, 6.5), matDark);
    roof.position.set(p.x, gy + 17.2, p.z);
    roof.rotation.y = mb.rotY;
    scene.add(roof);
    _pushMesh(roof);
    // アンテナ
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 4), matDark);
    ant.position.set(p.x, gy + 19, p.z);
    scene.add(ant);
    _pushMesh(ant);
    // 航空灯 (赤点滅)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    beacon.position.set(p.x, gy + 20.5, p.z);
    scene.add(beacon);
    _pushMesh(beacon);
  }

  /* =========================================================
     格納庫 — アーチ屋根
     ========================================================= */
  function _addHangar(mb, side, lz) {
    const matWall = new THREE.MeshLambertMaterial({ color: 0x5a5e62 });
    const matRoof = new THREE.MeshLambertMaterial({ color: 0x4a4e52 });
    const matDoor = new THREE.MeshLambertMaterial({ color: 0x3a3e42 });
    const hw = 14, hh = 8, hd = 18;
    const lx = side * (mb.w / 2 - 10);
    const p = _l2w(mb, lx, lz);
    const gy = mb.flatH;
    const yaw = mb.rotY;
    // 側壁2枚 (w方向の両端)
    for (const sx of [-hw / 2, hw / 2]) {
      const wp = _l2w(mb, lx + sx, lz);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, hh, hd), matWall);
      wall.position.set(wp.x, gy + hh / 2, wp.z);
      wall.rotation.y = yaw;
      wall.castShadow = !isMobile;
      scene.add(wall);
      _pushMesh(wall);
    }
    // 背後壁
    const bp = _l2w(mb, lx, lz + hd / 2);
    const back = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, 0.5), matWall);
    back.position.set(bp.x, gy + hh / 2, bp.z);
    back.rotation.y = yaw;
    back.castShadow = !isMobile;
    scene.add(back);
    _pushMesh(back);
    // アーチ屋根 (半円シリンダー)
    const roofGeo = new THREE.CylinderGeometry(hw / 2 + 0.3, hw / 2 + 0.3, hd, 12, 1, false, 0, Math.PI);
    roofGeo.rotateZ(Math.PI / 2);   // X方向に軸を向ける
    roofGeo.rotateY(Math.PI / 2);   // d方向に長く
    const roof = new THREE.Mesh(roofGeo, matRoof);
    roof.position.set(p.x, gy + hh, p.z);
    roof.rotation.y = yaw;
    roof.castShadow = !isMobile;
    scene.add(roof);
    _pushMesh(roof);
    // 開口ドア (格子)
    const dp = _l2w(mb, lx, lz - hd / 2);
    const door = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, 0.3), matDoor);
    door.position.set(dp.x, gy + hh / 2, dp.z);
    door.rotation.y = yaw;
    scene.add(door);
    _pushMesh(door);
  }

  /* =========================================================
     エプロン + 駐機スロット
     ========================================================= */
  function _addApron(mb, slotsArr) {
    const matApron = new THREE.MeshLambertMaterial({ color: 0x4a4a4e });
    const matMark  = new THREE.MeshLambertMaterial({ color: 0xc8c8c0 });
    const apW = 54, apD = 64;
    // エプロンは滑走路端 (dの+端) の脇
    const lx = mb.w / 2 - 31;
    const lz = mb.d / 2 - 38;
    const p = _l2w(mb, lx, lz);
    const apGeo = new THREE.BoxGeometry(apW, 0.3, apD);
    const ap = new THREE.Mesh(apGeo, matApron);
    ap.position.set(p.x, mb.flatH + 0.15, p.z);
    ap.rotation.y = mb.rotY;
    ap.receiveShadow = !isMobile;
    scene.add(ap);
    _pushMesh(ap);
    // 駐機スロット (3個 → 大型エプロン)
    for (let si = 0; si < 3; si++) {
      const slx = lx - 16 + si * 16;
      const slz = lz;
      const sp = _l2w(mb, slx, slz);
      const syaw = _l2wYaw(mb, 0);   // 滑走路に平行
      slotsArr.push({ x: sp.x, z: sp.z, rotY: syaw });
      // マーク (T字)
      const mp = _l2w(mb, slx, slz);
      const m1 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.32, 1), matMark);
      m1.position.set(mp.x, mb.flatH + 0.32, mp.z);
      m1.rotation.y = mb.rotY;
      scene.add(m1);
      _pushMesh(m1);
      const m2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.32, 6), matMark);
      m2.position.set(mp.x, mb.flatH + 0.32, mp.z - 3);
      m2.rotation.y = mb.rotY;
      scene.add(m2);
      _pushMesh(m2);
    }
  }

  /* =========================================================
     陸軍区画 — 司令部・兵舎・整備庫・補給所・ヘリパッド
     ========================================================= */
  function _localBox(mb, lx, lz, w, h, d, material, lyaw) {
    const p = _l2w(mb, lx, lz);
    const m = addBox(p.x, p.z, w, h, d, material, _l2wYaw(mb, lyaw || 0), mb.flatH);
    _pushMesh(m);
    return m;
  }

  function _addArmyCompound(mb) {
    const matArmy = new THREE.MeshLambertMaterial({ color: 0x596451 });
    const matArmyDark = new THREE.MeshLambertMaterial({ color: 0x343b35 });
    const matConcrete = new THREE.MeshLambertMaterial({ color: 0x777973 });
    const matPad = new THREE.MeshLambertMaterial({ color: 0x505257 });
    const matMark = new THREE.MeshBasicMaterial({ color: 0xd8d6c2 });

    // The command/barracks row occupies the gate side, while logistics and
    // maintenance face a dedicated motor pool on the opposite side.
    _localBox(mb,  66,  0, 24, 8, 18, matArmy, 0);
    _localBox(mb,  66, 32, 22, 5.5, 14, matArmy, 0);
    _localBox(mb,  66, 60, 22, 5.5, 14, matArmy, 0);
    _localBox(mb, -56, 30, 18, 5, 14, matArmyDark, 0);
    _localBox(mb, -56, 55, 26, 7, 18, matArmyDark, 0);
    _localBox(mb, -56, 79, 20, 6, 14, matArmy, 0);

    // Motor-pool hardstand and marked parking bays (surface only).
    const poolP = _l2w(mb, -50, 108);
    const pool = new THREE.Mesh(new THREE.BoxGeometry(54, 0.18, 36), matConcrete);
    pool.position.set(poolP.x, mb.flatH + 0.09, poolP.z);
    pool.rotation.y = mb.rotY;
    pool.receiveShadow = !isMobile;
    scene.add(pool); _pushMesh(pool);
    for (let i = -2; i <= 2; i++) {
      const p = _l2w(mb, -50 + i * 9, 108);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 26), matMark);
      line.position.set(p.x, mb.flatH + 0.2, p.z);
      line.rotation.y = mb.rotY;
      scene.add(line); _pushMesh(line);
    }

    // Two helicopter pads establish the rotary-wing side of the joint base.
    for (const lz of [-72, -38]) {
      const p = _l2w(mb, 51, lz);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.22, 24), matPad);
      pad.position.set(p.x, mb.flatH + 0.11, p.z);
      scene.add(pad); _pushMesh(pad);
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.24, 0.7), matMark);
      const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 8), matMark);
      h1.position.set(p.x, mb.flatH + 0.24, p.z);
      h2.position.copy(h1.position);
      h1.rotation.y = h2.rotation.y = mb.rotY;
      scene.add(h1, h2); _pushMesh(h1); _pushMesh(h2);
    }
  }

  /* =========================================================
     対空砲 — 基地周辺に2基
     ========================================================= */
  function _addAA(mb, team) {
    // 滑走路の両端付近、外側
    const positions = [
      { lx: -(mb.w / 2 - 5), lz: -mb.d / 2 + 20 },
      { lx:  (mb.w / 2 - 5), lz:  mb.d / 2 - 20 }
    ];
    for (let i = 0; i < positions.length; i++) {
      const pp = positions[i];
      const p = _l2w(mb, pp.lx, pp.lz);
      createEmplacement('aa', p.x, p.z, _l2wYaw(mb, i === 0 ? 0 : Math.PI), team);
    }
  }

  /* =========================================================
     柵 + 探照灯 — 基地境界
     ========================================================= */
  function _addFence(mb) {
    if (isMobile) return;   // モバイルは柵スキップ
    const matFence = new THREE.MeshLambertMaterial({ color: 0x4c5257 });
    const matLight = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
    const matPole  = new THREE.MeshLambertMaterial({ color: 0x3a3e42 });
    const postGeo = new THREE.BoxGeometry(0.15, 2.0, 0.15);
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 1);
    const lampGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 6, 6);
    // 基地境界 (矩形 w × d)
    const hw = mb.w / 2, hd = mb.d / 2;
    const edges = [
      { ax: -hw, az: -hd, bx:  hw, bz: -hd },
      { ax:  hw, az: -hd, bx:  hw, bz:  hd },
      { ax:  hw, az:  hd, bx: -hw, bz:  hd },
      { ax: -hw, az:  hd, bx: -hw, bz: -hd }
    ];
    const step = 5;
    const hq = mb === MILBASE_BLUE ? HQ_BLUE : HQ_RED;
    const hdx = hq.x - mb.x, hdz = hq.z - mb.z;
    const hc = Math.cos(mb.rotY), hs = Math.sin(mb.rotY);
    const hqLx = hdx * hc + hdz * hs, hqLz = -hdx * hs + hdz * hc;
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      const elen = Math.hypot(e.bx - e.ax, e.bz - e.az);
      const n = Math.floor(elen / step);
      for (let s = 0; s <= n; s++) {
        const t = n > 0 ? s / n : 0;
        const lx = e.ax + (e.bx - e.ax) * t;
        const lz = e.az + (e.bz - e.az) * t;
        const p = _l2w(mb, lx, lz);
        const gy = mb.flatH;
        // Leave a broad, visible gate where the HQ/spawn road meets the
        // perimeter. This makes the army HQ and flight line one installation.
        if (Math.hypot(lx - hqLx, lz - hqLz) < 16) continue;
        const post = new THREE.Mesh(postGeo, matFence);
        post.position.set(p.x, gy + 1, p.z);
        post.rotation.y = mb.rotY;
        scene.add(post);
        _pushMesh(post);
        // 横バー
        if (s < n) {
          const eyaw = mb.rotY + Math.atan2(e.bx - e.ax, e.bz - e.az);
          for (const ry of [0.6, 1.2]) {
            const rail = new THREE.Mesh(railGeo, matFence);
            const mid = _l2w(mb, lx + (e.bx - e.ax) / n * 0.5, lz + (e.bz - e.az) / n * 0.5);
            rail.position.set(mid.x, gy + ry, mid.z);
            rail.rotation.y = eyaw;
            rail.scale.z = elen / n * 0.95;
            scene.add(rail);
            _pushMesh(rail);
          }
        }
      }
    }
    // 探照灯 (4隅)
    for (const corner of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const p = _l2w(mb, corner[0], corner[1]);
      const gy = mb.flatH;
      const pole = new THREE.Mesh(poleGeo, matPole);
      pole.position.set(p.x, gy + 3, p.z);
      scene.add(pole);
      _pushMesh(pole);
      const lamp = new THREE.Mesh(lampGeo, matLight);
      lamp.position.set(p.x, gy + 6, p.z);
      scene.add(lamp);
      _pushMesh(lamp);
    }
  }

  /* =========================================================
     基地全体構築
     ========================================================= */
  function _buildAirbase(mb, slotsArr, team) {
    _addRunway(mb);
    _addTaxiways(mb);
    _addControlTower(mb, -1);
    _addHangar(mb, -1, -55);
    _addHangar(mb, -1, 0);
    if (!isMobile) _addHangar(mb, -1, 55);
    _addApron(mb, slotsArr);
    _addArmyCompound(mb);
    _addAA(mb, team);
    _addFence(mb);
  }

  /* ---------- 公開API ---------- */
  v082.reset = function () {
    if (v082.initialized) return;
    // スロットクリア (リスタート時)
    APRON_SLOTS_BLUE.length = 0;
    APRON_SLOTS_RED.length = 0;
    _buildAirbase(MILBASE_BLUE, APRON_SLOTS_BLUE, 1);   // 青=プレイヤー側
    _buildAirbase(MILBASE_RED,  APRON_SLOTS_RED, -1);   // 赤
    v082.initialized = true;
  };
})();

function resetV082() { if (v082.reset) v082.reset(); }
function updateV082(dt) {
  if (!v082.initialized) return;
  v082.visT += dt;
  if (v082.visT < 0.3) return;
  v082.visT = 0;
  if (v082.meshes.length === 0) return;
  const px = (typeof player !== 'undefined' && player && player.pos) ? player.pos.x : 0;
  const pz = (typeof player !== 'undefined' && player && player.pos) ? player.pos.z : 0;
  const maxD2 = 360 * 360;
  for (let i = 0; i < v082.meshes.length; i++) {
    const m = v082.meshes[i];
    if (!m || !m.parent) continue;
    const dx = m.position.x - px, dz = m.position.z - pz;
    m.visible = dx * dx + dz * dz < maxD2;
  }
}
