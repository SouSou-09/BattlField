'use strict';
/* =========================================================
   v0.9.4 — メガシティ化した中央都市
   河川南岸と貨物鉄道の間を端から端まで使う矩形街区を形成
   ・グリッド状街路 (7m幅 / 約640×260m)
   ・高層ビル 72棟 (38-78m) / モバイル30棟
   ・中層ビル 124棟 (14-32m) / モバイル40棟
   ・進入可能建物 8棟 / モバイル4棟
   ・中央広場と高架道路を維持したまま、建物数を従来の約3倍へ増加
   ・路地プロップ (ゴミ箱/街灯/消火栓)
   ・地下通路 (v042トンネル網に接続)
   ・460m距離カリング / モバイル向け密度削減
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
    const sw = 7;
    const xLines = isMobile
      ? [-300, -210, -120, -30, 30, 120, 210, 300]
      : [-320, -300, -270, -240, -210, -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 320];
    const zLines = isMobile
      ? [-124, -68, -14, 14, 68, 124]
      : [-124, -110, -96, -82, -68, -54, -40, -14, 0, 14, 40, 54, 68, 82, 96, 110, 124];
    const halfX = MAP_LAYOUT.downtown.halfX;
    const minZ = -MAP_LAYOUT.downtown.halfZ, maxZ = MAP_LAYOUT.downtown.halfZ;
    const step = 8;

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

  /* ---------- 建物配置用グリッド ---------- */
  const BUILDING_XS_V081 = [-285, -255, -225, -195, -165, -135, -105, -75, -45, 45, 75, 105, 135, 165, 195, 225, 255, 285];
  const BUILDING_ZS_V081 = [-110, -82, -54, -27, 27, 54, 82, 110];
  const ENTERABLE_KEYS_V081 = {
    '-255,-27': true, '-165,54': true, '-75,-82': true, '-45,54': true,
    '45,-54': true, '75,82': true, '165,-27': true, '255,54': true
  };

  function _buildingScoreV081(x, z) {
    // 中心に寄るほど高層化し、両端にもランドマーク塔を残す。
    const center = 1 - Math.min(1, Math.abs(x) / MAP_LAYOUT.downtown.halfX);
    const boulevard = Math.abs(z) >= 75 ? 0.18 : 0;
    const landmark = Math.abs(x) > 240 && Math.abs(z) > 70 ? 0.2 : 0;
    return center + boulevard + landmark + _hashV081(x, z) * 0.28;
  }

  function _buildingCellsV081() {
    const cells = [];
    for (let zi = 0; zi < BUILDING_ZS_V081.length; zi++) {
      for (let xi = 0; xi < BUILDING_XS_V081.length; xi++) {
        const x = BUILDING_XS_V081[xi], z = BUILDING_ZS_V081[zi];
        if (ENTERABLE_KEYS_V081[x + ',' + z]) continue;
        // 中央広場と高架のランプ視界を確保する。
        if (Math.abs(x) < 30 || (Math.abs(x) < 62 && Math.abs(z) < 42)) continue;
        cells.push({ x: x, z: z, score: _buildingScoreV081(x, z) });
      }
    }
    return cells;
  }

  /* =========================================================
     2. 高層ビル — 72棟 / モバイル30棟
     ========================================================= */
  function _addHighrisesV081() {
    const mats = [matBuildingA, matBuildingB, matBuildingC];
    const cells = _buildingCellsV081().sort(function (a, b) { return b.score - a.score; });
    const count = isMobile ? 30 : 72;
    for (let i = 0; i < count && i < cells.length; i++) {
      const c = cells[i];
      const hash = _hashV081(c.x + 17, c.z - 31);
      const w = isMobile ? 12 : 13 + (i % 2);
      const d = isMobile ? 14 : 17 + ((i + 1) % 2);
      const fullH = 38 + Math.round(c.score * 24 + hash * 16);
      const h = isMobile ? Math.max(24, Math.round(fullH * 0.72)) : Math.min(78, fullH);
      _trackedAddBuilding(c.x, c.z, w, h, d, mats[i % mats.length]);
    }
  }

  /* =========================================================
     3. 中層ビル — 124棟 / モバイル40棟
     ========================================================= */
  function _addMidrisesV081() {
    const mats = [matBuildingA, matBuildingB, matBuildingC];
    const cells = _buildingCellsV081().sort(function (a, b) { return b.score - a.score; });
    const highriseCount = 72;
    const standardMidrises = cells.slice(highriseCount);
    // 高層街区の一部には幅8mの別棟を置き、道路を塞がず街区密度を3倍級にする。
    const infillMidrises = cells.slice(0, 64).map(function (c, i) {
      return { x: c.x + (i % 2 ? -11 : 11), z: c.z, score: c.score * 0.72, infill: true };
    });
    const list = isMobile
      ? cells.slice(30).filter(function (_, i) { return i % 2 === 0; }).slice(0, 40)
      : standardMidrises.concat(infillMidrises).slice(0, 124);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const hash = _hashV081(c.x - 23, c.z + 41);
      const w = isMobile ? 12 : (c.infill ? 8 : 15 + (i % 3));
      const d = isMobile ? 13 : (c.infill ? 15 : 16 + ((i + 2) % 3));
      const fullH = 14 + Math.round(hash * 12 + c.score * 6);
      const h = isMobile ? Math.max(11, Math.round(fullH * 0.78)) : Math.min(32, fullH);
      _trackedAddBuilding(c.x, c.z, w, h, d, mats[(i + 1) % mats.length]);
    }
  }

  /* =========================================================
     4. 進入可能建物 — 8棟 / モバイル4棟
     ========================================================= */
  function _addEnterableV081() {
    // [x, z, w, h, d, doorDir, stairs]
    const desktop = [
      [-255, -27, 15, 16, 17, 0, true], [-165, 54, 15, 18, 17, 2, true],
      [ -75, -82, 15, 20, 17, 1, true], [ -45, 54, 14, 17, 16, 3, true],
      [  45, -54, 14, 17, 16, 0, true], [  75, 82, 15, 20, 17, 2, true],
      [ 165, -27, 15, 18, 17, 1, true], [ 255, 54, 15, 16, 17, 3, true]
    ];
    const mobile = desktop.filter(function (_, i) { return i % 2 === 0; }).map(function (b) {
      return [b[0], b[1], 13, 12, 14, b[5], false];
    });
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
      [-315, -68], [-300, 14], [-270, -14], [-240, 14], [-210, -14],
      [-180, 14], [-150, -14], [-120, 14], [-90, -14], [-30, -54],
      [-30, 54], [30, -54], [30, 54], [90, 14], [120, -14],
      [150, 14], [180, -14], [210, 14], [240, -14], [270, 14],
      [300, -14], [315, 68]
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
      { x: -30, z: -82, to: baseIdx + 1, name: 'ダウンタウン北口' },
      { x:  30, z:  82, to: baseIdx,     name: 'ダウンタウン南口' }
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
  const px = (typeof player !== 'undefined' && player && player.pos) ? player.pos.x : 0;
  const pz = (typeof player !== 'undefined' && player && player.pos) ? player.pos.z : 0;
  const maxD2 = 460 * 460;
  for (let i = 0; i < v081.meshes.length; i++) {
    const m = v081.meshes[i];
    if (!m || !m.parent) continue;
    const dx = m.position.x - px, dz = m.position.z - pz;
    m.visible = dx * dx + dz * dz < maxD2;
  }
}
