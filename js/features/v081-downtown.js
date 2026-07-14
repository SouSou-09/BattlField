'use strict';
/* =========================================================
   v0.9.1 — 大規模中央都市
   拠点C周辺に11×10街路 + 高層/中層ビル群を形成
   ・グリッド状街路 (7m幅 / 約240m級)
   ・高層ビル 16棟 (32-62m) / モバイル6棟
   ・中層ビル 20棟 (12-26m) / モバイル8棟
   ・進入可能建物 4棟 / モバイル2棟
   ・路地プロップ (ゴミ箱/街灯/消火栓)
   ・地下通路 (v042トンネル網に接続)
   ・220m距離カリング / モバイル60%減
   ※既存 addBuilding / addEnterableBuilding / v042.tunnels を利用
   ========================================================= */
var v081 = { initialized: false, meshes: [], visT: 0 };

(function () {

  /* ---------- 決定的乱数 ---------- */
  function _hashV081(x, z) {
    let h = (x * 374761393 + z * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------- addBuildingのメッシュ追跡(カリング用) ----------
     addBuilding は scene.add() で直接メッシュを追加するため、
     追加前後の scene.children の差分を v081.meshes に記録する */
  function _trackedAddBuilding(x, z, w, h, d, mat, roofMat) {
    const before = scene.children.length;
    let result;
    try { result = addBuilding(x, z, w, h, d, mat, roofMat); }
    catch (e) { return null; }
    for (let i = before; i < scene.children.length; i++) {
      const c = scene.children[i];
      if (c && c.isMesh) v081.meshes.push(c);
    }
    return result;
  }
  function _trackedAddEnterable(x, z, w, h, d, mat, doorDir, stairs) {
    const before = scene.children.length;
    let result;
    try { result = addEnterableBuilding(x, z, w, h, d, mat, doorDir, stairs); }
    catch (e) { return null; }
    for (let i = before; i < scene.children.length; i++) {
      const c = scene.children[i];
      if (c && c.isMesh) v081.meshes.push(c);
    }
    return result;
  }

  /* =========================================================
     1. グリッド街路 — 拠点C周辺に碁盤目状道路
     ========================================================= */
  function _addGridStreetsV081() {
    const matStreet = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    const matCross  = new THREE.MeshLambertMaterial({ color: 0x333338 });
    const matPlaza  = new THREE.MeshLambertMaterial({ color: 0x5a5a5e });
    const sw    = 7;                         // 道路幅
    const xLines = isMobile ? [-96, -48, 0, 48, 96] : [-112, -84, -56, -28, 0, 28, 56, 84, 112];
    const zLines = isMobile ? [-70, -28, 14, 56, 98] : [-70, -42, -14, 14, 42, 70, 98, 126];
    const halfX = isMobile ? 96 : 120;
    const minZ = isMobile ? -70 : -78, maxZ = isMobile ? 98 : 134;
    const step  = 8;                         // セグメント間隔

    // x方向の通り (z軸に沿って走る)
    for (let ix = 0; ix < xLines.length; ix++) {
      const gx = xLines[ix];
      const lengthZ = maxZ - minZ;
      const segs = Math.max(4, Math.ceil(lengthZ / step));
      const geo = new THREE.PlaneGeometry(sw, lengthZ, 1, segs);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), lz = pos.getZ(i);
        pos.setZ(i, lz + (minZ + maxZ) / 2);
        pos.setY(i, terrainH(gx + lx, lz + (minZ + maxZ) / 2) + 0.02);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, matStreet);
      m.position.set(gx, 0, 0);
      m.receiveShadow = !isMobile;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      scene.add(m);
      v081.meshes.push(m);
    }
    // z方向の通り (x軸に沿って走る)
    for (let iz = 0; iz < zLines.length; iz++) {
      const gz = zLines[iz];
      const segs = Math.max(4, Math.ceil((halfX * 2) / step));
      const geo = new THREE.PlaneGeometry(halfX * 2, sw, segs, 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), lz = pos.getZ(i);
        pos.setY(i, terrainH(lx, gz + lz) + 0.02);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, matStreet);
      m.position.set(0, 0, gz);
      m.receiveShadow = !isMobile;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      scene.add(m);
      v081.meshes.push(m);
    }
    // 交差点マーク
    for (let cx = 0; cx < xLines.length; cx++) {
      for (let cz = 0; cz < zLines.length; cz++) {
        const cg = new THREE.PlaneGeometry(sw, sw);
        cg.rotateX(-Math.PI / 2);
        const cm = new THREE.Mesh(cg, matCross);
        cm.position.set(xLines[cx], terrainH(xLines[cx], zLines[cz]) + 0.03, zLines[cz]);
        cm.receiveShadow = !isMobile;
        cm.polygonOffset = true;
        cm.polygonOffsetFactor = -2;
        scene.add(cm);
        v081.meshes.push(cm);
      }
    }
    // 中央広場マーカー (拠点C周辺のプレイヤー可動域)
    const plazaR = isMobile ? 16 : 22;
    const plazaGeo = new THREE.CircleGeometry(plazaR, 24);
    plazaGeo.rotateX(-Math.PI / 2);
    const plaza = new THREE.Mesh(plazaGeo, matPlaza);
    plaza.position.set(0, terrainH(0, 0) + 0.04, 0);
    plaza.receiveShadow = !isMobile;
    plaza.polygonOffset = true;
    plaza.polygonOffsetFactor = -2;
    scene.add(plaza);
    v081.meshes.push(plaza);
  }

  /* =========================================================
     2. 高層ビル — 都市リングに16棟 (26-62m) / モバイル6棟
     ========================================================= */
  function _addHighrisesV081() {
    const mats = [matBuildingA, matBuildingB, matBuildingC];
    // [x, z, w, h, d, matIdx]
    const desktop = [
      [-60, -60, 14, 42, 14, 0],   // NW角
      [ 60, -60, 14, 38, 14, 1],   // NE角
      [-60,  60, 14, 35, 14, 2],   // SW角
      [ 60,  60, 14, 45, 14, 0],   // SE角 (最高層)
      [-36, -60, 11, 28, 11, 1],   // 北辺
      [ 36, -60, 11, 30, 11, 2],
      [-36,  60, 11, 26, 11, 0],   // 南辺
      [ 36,  60, 11, 32, 11, 1],
      [-98, -56, 16, 52, 16, 2],
      [ 98, -56, 16, 58, 16, 0],
      [-98,   0, 15, 47, 15, 1],
      [ 98,   0, 15, 54, 15, 2],
      [-98,  56, 16, 44, 16, 0],
      [ 98,  56, 16, 62, 16, 1],
      [-98, 112, 17, 38, 17, 2],
      [ 98, 112, 17, 50, 17, 0]
    ];
    // モバイル: 6棟・高さ低減
    const mobile = [
      [-60, -60, 14, 22, 14, 0],
      [ 60, -60, 14, 20, 14, 1],
      [ 60,  60, 14, 25, 14, 0],
      [-98, -56, 14, 27, 14, 2],
      [ 98,   0, 14, 29, 14, 1],
      [ 98,  98, 14, 25, 14, 0]
    ];
    const list = isMobile ? mobile : desktop;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      _trackedAddBuilding(b[0], b[1], b[2], b[3], b[4], mats[b[5]]);
    }
  }

  /* =========================================================
     3. 中層ビル — 中間リングに20棟 (11-26m) / モバイル8棟
     ========================================================= */
  function _addMidrisesV081() {
    const mats = [matBuildingA, matBuildingB, matBuildingC];
    // [x, z, w, h, d, matIdx]
    const desktop = [
      [-60, -36, 10, 16, 10, 1],
      [ 60, -36, 10, 18, 10, 2],
      [-60, -12, 10, 14, 10, 0],
      [ 60, -12, 10, 15, 10, 1],
      [-60,  12, 10, 13, 10, 2],
      [ 60,  12, 10, 16, 10, 0],
      [-60,  36, 10, 17, 10, 1],
      [ 60,  36, 10, 14, 10, 2],
      [-36, -36,  9, 12,  9, 0],
      [ 36, -36,  9, 13,  9, 1],
      [-36,  36,  9, 11,  9, 2],
      [ 36,  36,  9, 15,  9, 0],
      [-70, -56, 13, 22, 14, 0], [70, -56, 13, 19, 14, 1],
      [-70, -28, 13, 18, 14, 2], [70, -28, 13, 24, 14, 0],
      [-70,  56, 13, 20, 14, 1], [70,  56, 13, 26, 14, 2],
      [-70,  84, 13, 17, 14, 0], [70,  84, 13, 21, 14, 1]
    ];
    // モバイル: 8棟・高さ低減
    const mobile = [
      [-60, -36, 10, 10, 10, 1],
      [ 60, -36, 10, 12, 10, 2],
      [-60,  36, 10, 10, 10, 1],
      [ 60,  36, 10, 11, 10, 2],
      [-36, -36,  9,  8,  9, 0],
      [-70, -28, 11, 13, 12, 2],
      [ 70,  28, 11, 15, 12, 0],
      [-70,  84, 11, 12, 12, 1]
    ];
    const list = isMobile ? mobile : desktop;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      _trackedAddBuilding(b[0], b[1], b[2], b[3], b[4], mats[b[5]]);
    }
  }

  /* =========================================================
     4. 進入可能建物 — 4棟 / モバイル2棟
     ========================================================= */
  function _addEnterableV081() {
    // [x, z, w, h, d, doorDir, stairs]
    const desktop = [
      [-36, -12,  8, 12, 10, 0, true],   // ドア:+z  階段あり
      [ 36,  12,  8, 12, 10, 2, true],   // ドア:+x  階段あり
      [-42,  84, 12, 14, 14, 0, true],
      [ 42, 112, 12, 16, 14, 1, true]
    ];
    const mobile = [
      [-36, -12,  8,  8,  8, 0, false],  // モバイル: 階段なし
      [ 42,  84, 10, 10, 10, 1, false]
    ];
    const list = isMobile ? mobile : desktop;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      _trackedAddEnterable(b[0], b[1], b[2], b[3], b[4], matBuildingB, b[5], b[6]);
    }
  }

  /* =========================================================
     5. 路地プロップ — 空きブロックにゴミ箱/街灯/消火栓
     ========================================================= */
  function _addAlleyPropsV081() {
    if (isMobile) return;   // モバイルはスキップ
    const matDumpster = new THREE.MeshLambertMaterial({ color: 0x2d5a3d });
    const matHydrant  = new THREE.MeshLambertMaterial({ color: 0xa03020 });
    const matPole     = new THREE.MeshLambertMaterial({ color: 0x4c5257 });
    const matLamp     = new THREE.MeshLambertMaterial({ color: 0xffe8a0, emissive: 0x442a00 });
    const geoDump = new THREE.BoxGeometry(2.0, 1.4, 1.2);
    const geoHyd  = new THREE.CylinderGeometry(0.25, 0.3, 0.9, 8);
    const geoPole = new THREE.CylinderGeometry(0.12, 0.15, 5.5, 6);
    const geoLamp = new THREE.BoxGeometry(0.5, 0.2, 0.3);
    // 建物がないブロックの中心座標
    const spots = [
      [-12, -60], [12, -60], [-12, 60], [12, 60],
      [-12, -36], [12, -36], [-12, 36], [12, 36],
      [36, -12], [-36, 12],
      [-84, -28], [84, 28], [-56, 84], [56, 112], [0, 112]
    ];
    for (let i = 0; i < spots.length; i++) {
      const sx = spots[i][0], sz = spots[i][1];
      const r  = _hashV081(sx, sz);
      const gy = terrainH(sx, sz);
      // ゴミ箱 (移動阻害あり)
      if (r > 0.3) {
        const d1 = new THREE.Mesh(geoDump, matDumpster);
        d1.position.set(sx - 2, gy + 0.7, sz + 1);
        d1.castShadow = false;
        scene.add(d1);
        v081.meshes.push(d1);
        solidMeshes.push(d1);
        obstacles.push({ minX: sx - 3, maxX: sx - 1, minZ: sz + 0.4, maxZ: sz + 1.6, y0: gy, h: gy + 1.4 });
      }
      if (r > 0.65) {
        const d2 = new THREE.Mesh(geoDump, matDumpster);
        d2.position.set(sx + 2, gy + 0.7, sz + 1);
        d2.castShadow = false;
        scene.add(d2);
        v081.meshes.push(d2);
        solidMeshes.push(d2);
        obstacles.push({ minX: sx + 1, maxX: sx + 3, minZ: sz + 0.4, maxZ: sz + 1.6, y0: gy, h: gy + 1.4 });
      }
      // 消火栓
      if (r > 0.45 && r < 0.8) {
        const hyd = new THREE.Mesh(geoHyd, matHydrant);
        hyd.position.set(sx + 3, gy + 0.45, sz - 2);
        hyd.castShadow = false;
        scene.add(hyd);
        v081.meshes.push(hyd);
      }
      // 街灯 (ポール+ランプ)
      if (r > 0.2) {
        const pole = new THREE.Mesh(geoPole, matPole);
        pole.position.set(sx - 4, gy + 2.75, sz - 3);
        pole.castShadow = false;
        scene.add(pole);
        v081.meshes.push(pole);
        const lamp = new THREE.Mesh(geoLamp, matLamp);
        lamp.position.set(sx - 4, gy + 5.5, sz - 3);
        scene.add(lamp);
        v081.meshes.push(lamp);
      }
    }
  }

  /* =========================================================
     6. 地下通路 — v042トンネル網に2入口追加
     既存のトンネル(index 0-3)の後に追加 → index 4, 5
     ========================================================= */
  function _addUndergroundPassageV081() {
    const baseIdx = v042.tunnels.length;
    const entries = [
      { x: -36, z: -72, to: baseIdx + 1, name: 'ダウンタウン北' },
      { x:  36, z:  72, to: baseIdx,     name: 'ダウンタウン南' }
    ];
    const concrete = new THREE.MeshLambertMaterial({ color: 0x555b58 });
    for (let i = 0; i < entries.length; i++) {
      const p = entries[i];
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.26, 8, 16, Math.PI), concrete);
      ring.rotation.z = Math.PI;
      ring.position.y = 1.35;
      const dark = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0x080a09 }));
      dark.position.set(0, 1.3, 0.08);
      g.add(dark, ring);
      g.position.set(p.x, terrainH(p.x, p.z), p.z);
      scene.add(g);
      v042.tunnels.push({ x: p.x, z: p.z, to: p.to, name: p.name, group: g });
    }
  }

  /* ---------- 公開API ---------- */
  v081.reset = function () {
    if (v081.initialized) return;
    _addGridStreetsV081();
    _addHighrisesV081();
    _addMidrisesV081();
    _addEnterableV081();
    _addAlleyPropsV081();            // 内部でisMobile判定
    _addUndergroundPassageV081();
    v081.initialized = true;
  };
})();

function resetV081() { if (v081.reset) v081.reset(); }
function updateV081(dt) {
  if (!v081.initialized) return;
  v081.visT += dt;
  if (v081.visT < 0.3) return;
  v081.visT = 0;
  if (v081.meshes.length === 0) return;
  const px = (typeof player !== 'undefined' && player) ? player.x : 0;
  const pz = (typeof player !== 'undefined' && player) ? player.z : 0;
  const maxD2 = 360 * 360;
  for (let i = 0; i < v081.meshes.length; i++) {
    const m = v081.meshes[i];
    if (!m || !m.parent) continue;
    const dx = m.position.x - px, dz = m.position.z - pz;
    m.visible = dx * dx + dz * dz < maxD2;
  }
}
