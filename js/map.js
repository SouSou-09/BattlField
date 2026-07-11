'use strict';
/* STEEL FRONT — マップ: 道路 / 建物 / 破壊可能オブジェクト / 障害物 */

/* =========================================================
   Conquest flags — 拠点定義 (地形パッチより先に確定)
   own: 1=BLUE(プレイヤー側) / -1=RED / 0=中立
   ========================================================= */
const FLAG_R = 14;                 // 占領判定半径
const flags = [
  { id: 'A', x: -95, z: -85, own: 0, cap: 0 },   // 北西の丘の上
  { id: 'B', x: -75, z: 55,  own: 0, cap: 0 },   // 南西の村
  { id: 'C', x: 0,   z: 0,   own: 0, cap: 0 },   // 中央市街地
  { id: 'D', x: 80,  z: -60, own: 0, cap: 0 },   // 北東の倉庫地区
  { id: 'E', x: 100, z: 95,  own: 0, cap: 0 }    // 南東の高地基地
];
const HQ_BLUE = { x: -130, z: 130 };   // 南西端
const HQ_RED  = { x: 130,  z: -130 };  // 北東端

// 拠点・HQ周辺を平地化
for (const f of flags) flattenAt(f.x, f.z, 22);
flattenAt(HQ_BLUE.x, HQ_BLUE.z, 20);
flattenAt(HQ_RED.x, HQ_RED.z, 20);

// ---------- 道路網 (拠点を結ぶ / 地形追従) ----------
// 道路セグメント定義 [x1,z1,x2,z2] — レンダリングと「道路上か」判定に使用
const ROADS = [
  [HQ_BLUE.x, HQ_BLUE.z, -75, 55],    // 青HQ → B
  [-75, 55, 0, 0],                     // B → C
  [0, 0, 80, -60],                     // C → D
  [80, -60, HQ_RED.x, HQ_RED.z],      // D → 赤HQ
  [-95, -85, 0, 0],                    // A → C
  [0, 0, 100, 95],                     // C → E
  [-95, -85, -75, 55],                 // A → B
  [80, -60, 100, 95]                   // D → E
];
function onRoad(x, z) {
  for (const [x1, z1, x2, z2] of ROADS) {
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    let t = ((x - x1) * dx + (z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, pz = z1 + dz * t;
    if (Math.hypot(x - px, z - pz) < 5.5) return true;
  }
  return false;
}

/* ---------- Terrain mesh (ハイトフィールド) ---------- */
{
  const SEG = 100;
  const geo = new THREE.PlaneGeometry(WORLD * 2 + 80, WORLD * 2 + 80, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  // 頂点カラー: 高さ・道路で色分け (草/土/岩/道路)
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x6d7a4e), cDirt = new THREE.Color(0x7a7050),
        cRock = new THREE.Color(0x777872), cRoad = new THREE.Color(0x46484c),
        cGrass2 = new THREE.Color(0x5d6f45);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    let c;
    if (onRoad(x, z)) c = cRoad;
    else if (h > 13) c = cRock;
    else if (h > 7) c = cDirt;
    else c = ((Math.sin(x * 0.2) + Math.cos(z * 0.23)) > 0.4) ? cGrass2 : cGrass;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }));
  ground.receiveShadow = !isMobile;
  scene.add(ground);
}

// ---------- Map objects ----------
const obstacles = [];             // AABB list {minX,maxX,minZ,maxZ,y0,h} (y0=底面, h=上面の絶対高さ)
const solidMeshes = [];           // for line-of-sight raycasts

function addBox(x, z, w, h, d, material, rotY = 0, yBase = null, solid = true) {
  const gy = yBase === null ? terrainH(x, z) : yBase;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, gy + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = !isMobile;
  scene.add(m);
  if (solid) {
    const rw = Math.abs(Math.sin(rotY)) > 0.7 ? d : w, rd = Math.abs(Math.sin(rotY)) > 0.7 ? w : d;
    obstacles.push({ minX: x - rw / 2, maxX: x + rw / 2, minZ: z - rd / 2, maxZ: z + rd / 2, y0: gy, h: gy + h });
    solidMeshes.push(m);
  }
  return m;
}
const matBuildingA = new THREE.MeshLambertMaterial({ map: buildingTexA });
const matBuildingB = new THREE.MeshLambertMaterial({ map: buildingTexB });
const matBuildingC = new THREE.MeshLambertMaterial({ map: buildingTexC });
const matBrick = new THREE.MeshLambertMaterial({ map: brickTex });
const matRoof = new THREE.MeshLambertMaterial({ color: 0x5a5e63 });
const matRoofRed = new THREE.MeshLambertMaterial({ color: 0x7a4438 });
const matContainer = new THREE.MeshLambertMaterial({ map: containerTex });
const matContainer2 = new THREE.MeshLambertMaterial({ color: 0x3d6b4f });
const matContainer3 = new THREE.MeshLambertMaterial({ color: 0x38506b });
const matCrate = new THREE.MeshLambertMaterial({ map: crateTex });
const matSandbag = new THREE.MeshLambertMaterial({ color: 0x9a8f6a });
const matWall = new THREE.MeshLambertMaterial({ color: 0x777d80 });
const matTrunk = new THREE.MeshLambertMaterial({ color: 0x5c4632 });
const matLeaf = new THREE.MeshLambertMaterial({ color: 0x4a6b35 });
const matLeaf2 = new THREE.MeshLambertMaterial({ color: 0x5d7c3f });
const matPole = new THREE.MeshLambertMaterial({ color: 0x4c5257 });
const matBarrel = new THREE.MeshLambertMaterial({ color: 0x7a2e22 });
const matBarrel2 = new THREE.MeshLambertMaterial({ color: 0x40563e });
const matRock = new THREE.MeshLambertMaterial({ color: 0x6e6f68 });

/* ---------- v0.2.3: 破壊可能オブジェクト ---------- */
const destructibles = [];
const crateGeo16 = new THREE.BoxGeometry(1.6, 1.6, 1.6);
const barrelGeoD = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10);
function addDestructibleCrate(x, z, rotY = 0) {
  const gy = terrainH(x, z);
  const m = new THREE.Mesh(crateGeo16, matCrate);
  m.position.set(x, gy + 0.8, z);
  m.rotation.y = rotY;
  m.castShadow = !isMobile;
  scene.add(m);
  solidMeshes.push(m);
  const ob = { minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8, y0: gy, h: gy + 1.6 };
  obstacles.push(ob);
  const d = { hp: 40, hp0: 40, type: 'crate', m, ob, dead: false };
  m.userData.destructible = d;
  destructibles.push(d);
}
function addDestructibleBarrel(x, z, alt = false) {
  const gy = terrainH(x, z);
  const m = new THREE.Mesh(barrelGeoD, alt ? matBarrel2 : matBarrel);
  m.position.set(x, gy + 0.6, z);
  m.castShadow = !isMobile;
  scene.add(m);
  solidMeshes.push(m);
  const ob = { minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, y0: gy, h: gy + 1.2 };
  obstacles.push(ob);
  const d = { hp: 20, hp0: 20, type: 'barrel', m, ob, dead: false };
  m.userData.destructible = d;
  destructibles.push(d);
}
function damageDestructible(d, dmg) {
  if (d.dead) return;
  d.hp -= dmg;
  if (d.hp > 0) {
    spawnParticles(d.m.position.clone().setY(d.m.position.y + 0.5), d.type === 'barrel' ? 0x883322 : 0x8a6a42, 3, 2.5);
    return;
  }
  d.dead = true;
  d.m.visible = false;
  const oi = obstacles.indexOf(d.ob); if (oi >= 0) obstacles.splice(oi, 1);
  const si = solidMeshes.indexOf(d.m); if (si >= 0) solidMeshes.splice(si, 1);
  const p = d.m.position.clone();
  if (d.type === 'barrel') {
    // 爆発樽: 範囲ダメージ + 誘爆
    explodeAt(p.clone().setY(p.y + 0.3), 5.5, 80);
  } else {
    spawnParticles(p, 0x8a6a42, 16, 5, 1.6);
    spawnParticles(p, 0x6a4a2a, 8, 3.5, 1.2);
    sfx.hit();
  }
}
function resetDestructibles() {
  for (const d of destructibles) {
    if (!d.dead) { d.hp = d.hp0; continue; }
    d.dead = false; d.hp = d.hp0;
    d.m.visible = true;
    obstacles.push(d.ob);
    solidMeshes.push(d.m);
  }
}

// 建物 (パラペット・屋上設備つき)
function addBuilding(x, z, w, h, d, mat, roofMat = matRoof) {
  const gy = terrainH(x, z);
  addBox(x, z, w, h, d, mat);
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5), roofMat);
  p.position.set(x, gy + h + 0.35, z);
  p.castShadow = false; p.receiveShadow = !isMobile;
  scene.add(p);
  if (w > 13) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), matRoof);
    u.position.set(x + (Math.random() - .5) * (w * 0.4), gy + h + 1.4, z + (Math.random() - .5) * (d * 0.4));
    scene.add(u);
  }
}
// v0.2.3: 進入可能な建物 (ドア開口付き、4壁+屋根)
// doorDir: 0=+z(南) 1=-z(北) 2=+x(東) 3=-x(西)
function addEnterableBuilding(x, z, w, h, d, mat, doorDir = 0) {
  const gy = terrainH(x, z);
  const T = 0.5;          // 壁厚
  const DW = 2.4;         // ドア幅
  const DH = 2.5;         // ドア高
  // 各壁: ドアのある壁は左右に分割 + 上部にまぐさ (lintel)
  const walls = [
    { side: 0, cx: x, cz: z + d / 2 - T / 2, ww: w, wd: T, horiz: true },   // +z
    { side: 1, cx: x, cz: z - d / 2 + T / 2, ww: w, wd: T, horiz: true },   // -z
    { side: 2, cx: x + w / 2 - T / 2, cz: z, ww: T, wd: d, horiz: false },  // +x
    { side: 3, cx: x - w / 2 + T / 2, cz: z, ww: T, wd: d, horiz: false }   // -x
  ];
  for (const wl of walls) {
    if (wl.side !== doorDir) {
      addBox(wl.cx, wl.cz, wl.ww, h, wl.wd, mat, 0, gy);
      continue;
    }
    // ドア付き壁: 左右セグメント
    const len = wl.horiz ? wl.ww : wl.wd;
    const segLen = (len - DW) / 2;
    if (wl.horiz) {
      addBox(wl.cx - (DW + segLen) / 2, wl.cz, segLen, h, T, mat, 0, gy);
      addBox(wl.cx + (DW + segLen) / 2, wl.cz, segLen, h, T, mat, 0, gy);
      addBox(wl.cx, wl.cz, DW, h - DH, T, mat, 0, gy + DH);   // まぐさ
    } else {
      addBox(wl.cx, wl.cz - (DW + segLen) / 2, T, h, segLen, mat, 0, gy);
      addBox(wl.cx, wl.cz + (DW + segLen) / 2, T, h, segLen, mat, 0, gy);
      addBox(wl.cx, wl.cz, T, h - DH, DW, mat, 0, gy + DH);   // まぐさ
    }
  }
  // 屋根 (屋上に上がれるパラペット風)
  addBox(x, z, w, 0.4, d, matRoof, 0, gy + h);
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), matRoof);
  p.position.set(x, gy + h + 0.6, z);
  p.castShadow = false;
  scene.add(p);
}

// 三角屋根の家 (村用)
function addHouse(x, z, w, h, d, rotY = 0) {
  const gy = terrainH(x, z);
  addBox(x, z, w, h, d, matBrick, rotY);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.55, 4), matRoofRed);
  roof.position.set(x, gy + h + h * 0.27, z);
  roof.rotation.y = rotY + Math.PI / 4;
  roof.castShadow = !isMobile;
  scene.add(roof);
}

/* ---------- 地区の構築 ---------- */
// === 拠点C: 中央市街地 ===
[[-18, -16, 16, 15, 18, matBuildingA], [20, -18, 18, 11, 14, matBuildingB],
 [22, 16, 14, 18, 14, matBuildingA], [-22, 18, 18, 12, 16, matBuildingC],
 [-2, -30, 22, 9, 12, matBuildingB], [0, 30, 20, 13, 12, matBuildingC]]
 .forEach(b => addBuilding(b[0], b[1], b[2], b[3], b[4], b[5]));
// 市街地の遮蔽物
[[-8, 8, 8, 1.1, 1.2, 0], [10, -6, 8, 1.1, 1.2, Math.PI / 2], [6, 8, 6, 1.1, 1.2, 0]]
 .forEach(s => addBox(s[0], s[1], s[2], s[3], s[4], matSandbag, s[5]));
// v0.2.3: 中央市街地に進入可能な建物 (拠点Cの激戦区)
addEnterableBuilding(-9, -8, 9, 4.5, 8, matBuildingB, 0);   // ドア南
addEnterableBuilding(11, 10, 8, 4, 9, matBuildingC, 3);     // ドア西
[[-12, -4, 0], [12, 6, Math.PI / 2]].forEach(c => addBox(c[0], c[1], 12, 3, 3.2, matContainer, c[2]));
// 廃墟壁
[[-6, 20, 10, 3.5, 1, 0], [14, -12, 8, 2.8, 1, Math.PI / 2], [-16, 6, 9, 3, 1, Math.PI / 2]]
 .forEach(w => addBox(w[0], w[1], w[2], w[3], w[4], matWall, w[5]));

// === 拠点A: 北西の丘 (砦・監視塔) ===
{
  const fx = -95, fz = -85;
  // 丘上の砦壁 (コの字)
  addBox(fx, fz - 12, 22, 3, 1.4, matWall);
  addBox(fx - 11, fz, 1.4, 3, 22, matWall);
  addBox(fx + 11, fz, 1.4, 3, 22, matWall);
  addBox(fx - 5, fz + 4, 8, 1.1, 1.2, matSandbag);
  addBox(fx + 5, fz - 4, 8, 1.1, 1.2, matSandbag, Math.PI / 2);
  addBuilding(fx + 3, fz + 8, 10, 6, 8, matBuildingC);
  addDestructibleCrate(fx - 6, fz - 6);
  addDestructibleCrate(fx - 4.5, fz - 6.5, 0.4);
  // v0.2.3: 砦の中の進入可能バンカー
  addEnterableBuilding(fx - 3, fz + 1, 7, 3.2, 6, matWall, 0);
}

// === 拠点B: 南西の村 ===
{
  const fx = -75, fz = 55;
  addHouse(fx - 10, fz - 8, 8, 5, 7);
  addHouse(fx + 9, fz - 10, 7, 4.5, 8, Math.PI / 2);
  addHouse(fx + 11, fz + 8, 9, 5.5, 7);
  addHouse(fx - 12, fz + 10, 7, 4.5, 7, Math.PI / 2);
  addHouse(fx - 1, fz + 16, 8, 5, 8);
  // 井戸
  const gy = terrainH(fx, fz + 2);
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1.1, 10), matBrick);
  well.position.set(fx, gy + 0.55, fz + 2);
  scene.add(well); solidMeshes.push(well);
  obstacles.push({ minX: fx - 1.3, maxX: fx + 1.3, minZ: fz + 0.7, maxZ: fz + 3.3, y0: gy, h: gy + 1.1 });
  // 畑の柵
  addBox(fx + 2, fz - 18, 14, 1.0, 0.3, matTrunk);
  addBox(fx + 2, fz - 24, 14, 1.0, 0.3, matTrunk);
}

// === 拠点D: 北東の倉庫地区 ===
{
  const fx = 80, fz = -60;
  addBuilding(fx - 12, fz - 8, 18, 8, 14, matBuildingB);
  addBuilding(fx + 13, fz + 6, 16, 7, 12, matBuildingB);
  // コンテナヤード (2段積みあり)
  [[fx - 2, fz + 10, 0, matContainer], [fx + 4, fz - 12, Math.PI / 2, matContainer3],
   [fx + 12, fz - 10, 0, matContainer2], [fx - 8, fz + 4, Math.PI / 2, matContainer]]
   .forEach((c, i) => {
     addBox(c[0], c[1], 12, 3, 3.2, c[3], c[2]);
     if (i % 2 === 0) addBox(c[0] + 0.4, c[1], 12, 3, 3.2, i % 2 ? c[3] : matContainer2, c[2], terrainH(c[0], c[1]) + 3, false);
   });
  for (let i = 0; i < 6; i++) {
    addDestructibleCrate(fx - 10 + Math.random() * 20, fz - 4 + Math.random() * 8, Math.random());
  }
  // v0.2.3: 倉庫地区に進入可能な倉庫
  addEnterableBuilding(fx + 2, fz - 22, 12, 5, 9, matBuildingB, 1);
}

// === 拠点E: 南東の高地基地 ===
{
  const fx = 100, fz = 95;
  addBuilding(fx - 8, fz - 8, 14, 9, 12, matBuildingA);
  addBuilding(fx + 10, fz + 6, 12, 6, 10, matBuildingC);
  // ヘリパッド風の台座
  const gy = terrainH(fx + 2, fz + 14);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 16), matRoof);
  pad.position.set(fx + 2, gy + 0.2, fz + 14);
  pad.receiveShadow = !isMobile;
  scene.add(pad);
  addBox(fx - 12, fz + 8, 8, 1.1, 1.2, matSandbag);
  addBox(fx + 2, fz - 14, 8, 1.1, 1.2, matSandbag, Math.PI / 2);
  // v0.2.3: 高地基地に進入可能な兵舎
  addEnterableBuilding(fx - 14, fz + 14, 8, 3.5, 7, matBuildingC, 2);
  // アンテナ塔
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 14, 6), matPole);
  ant.position.set(fx - 14, terrainH(fx - 14, fz - 12) + 7, fz - 12);
  scene.add(ant);
  obstacles.push({ minX: fx - 14.4, maxX: fx - 13.6, minZ: fz - 12.4, maxZ: fz - 11.6, y0: 0, h: terrainH(fx - 14, fz - 12) + 14 });
}

// === HQ (両軍ベース) ===
function buildHQ(hq, mat) {
  addBuilding(hq.x, hq.z - 8, 14, 7, 10, mat);
  addBox(hq.x - 9, hq.z + 2, 8, 1.1, 1.2, matSandbag, Math.PI / 2);
  addBox(hq.x + 9, hq.z + 2, 8, 1.1, 1.2, matSandbag, Math.PI / 2);
  addBox(hq.x, hq.z + 10, 10, 1.1, 1.2, matSandbag);
}
buildHQ(HQ_BLUE, matBuildingB);
buildHQ(HQ_RED, matBuildingC);

// === 監視塔 (2箇所) ===
function buildTower(tx, tz) {
  const gy = terrainH(tx, tz);
  const legGeo = new THREE.BoxGeometry(0.5, 8, 0.5);
  [[-2, -2], [2, -2], [-2, 2], [2, 2]].forEach(o => {
    const leg = new THREE.Mesh(legGeo, matTrunk);
    leg.position.set(tx + o[0], gy + 4, tz + o[1]);
    leg.castShadow = !isMobile;
    scene.add(leg);
  });
  addBox(tx, tz, 5.6, 0.5, 5.6, matRoof, 0, gy + 8, false);
  addBox(tx, tz, 5.6, 2.2, 5.6, matWall, 0, gy + 8.5, false);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2, 4), matRoof);
  roof.position.set(tx, gy + 11.8, tz); roof.rotation.y = Math.PI / 4;
  scene.add(roof);
  obstacles.push({ minX: tx - 2.6, maxX: tx + 2.6, minZ: tz - 2.6, maxZ: tz + 2.6, y0: gy, h: gy + 12 });
}
buildTower(40, 50);
buildTower(-40, -45);

// === 岩場 (高台の斜面や空白地帯に岩を配置) ===
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockSpots = [[-60, -30], [-50, -55], [55, 25], [35, -85], [-25, 90], [60, 60], [-115, 20], [20, 115], [115, -20], [-20, -115], [70, -20], [-70, -5], [10, 60], [-35, 35], [45, -40], [90, 20], [-90, -40], [-55, 95], [120, 50], [50, -110]];
  for (const [x, z] of rockSpots) {
    if (onRoad(x, z)) continue;
    const s = 1 + Math.random() * 2.2;
    const r = new THREE.Mesh(rockGeo, matRock);
    const gy = terrainH(x, z);
    r.position.set(x, gy + s * 0.4, z);
    r.scale.set(s, s * (0.6 + Math.random() * 0.5), s);
    r.rotation.set(Math.random(), Math.random() * 3, Math.random());
    r.castShadow = !isMobile;
    scene.add(r);
    solidMeshes.push(r);
    obstacles.push({ minX: x - s * 0.8, maxX: x + s * 0.8, minZ: z - s * 0.8, maxZ: z + s * 0.8, y0: gy, h: gy + s });
  }
}

// === 木 (道路・拠点を避けてランダム + 固定) ===
{
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6);
  const leafGeo1 = new THREE.ConeGeometry(1.9, 2.6, 7);
  const leafGeo2 = new THREE.ConeGeometry(1.4, 2.2, 7);
  let placed = 0, tries = 0;
  while (placed < 42 && tries < 300) {
    tries++;
    const x = (Math.random() * 2 - 1) * (WORLD - 12);
    const z = (Math.random() * 2 - 1) * (WORLD - 12);
    if (onRoad(x, z)) continue;
    let nearFlag = false;
    for (const f of flags) if (Math.hypot(x - f.x, z - f.z) < 16) { nearFlag = true; break; }
    if (nearFlag || Math.hypot(x - HQ_BLUE.x, z - HQ_BLUE.z) < 18 || Math.hypot(x - HQ_RED.x, z - HQ_RED.z) < 18) continue;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, matTrunk); trunk.position.y = 1.2;
    const l1 = new THREE.Mesh(leafGeo1, Math.random() < .5 ? matLeaf : matLeaf2); l1.position.y = 3.3;
    const l2 = new THREE.Mesh(leafGeo2, matLeaf2); l2.position.y = 4.6;
    trunk.castShadow = l1.castShadow = !isMobile;
    g.add(trunk, l1, l2);
    const s = 0.8 + Math.random() * 0.8;
    g.scale.setScalar(s);
    const gy = terrainH(x, z);
    g.position.set(x, gy, z);
    scene.add(g);
    obstacles.push({ minX: x - 0.4 * s, maxX: x + 0.4 * s, minZ: z - 0.4 * s, maxZ: z + 0.4 * s, y0: gy, h: gy + 2.4 * s });
    placed++;
  }
}

// === ドラム缶・木箱の散布 (v0.2.3: 破壊可能) ===
{
  [[-12, -32], [-11, -31], [33, -14], [14, 24], [-32, 19], [52, 45], [24, 8], [-6, 29], [78, -55], [-72, 52], [-92, -80], [98, 92]].forEach(([x, z], i) => {
    addDestructibleBarrel(x, z, i % 2 === 1);
  });
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 110;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (onRoad(x, z)) continue;
    addDestructibleCrate(x, z, Math.random() < .5 ? 0 : Math.PI / 2);
  }
}

// === 外周フェンス ===
addBox(0, -WORLD - 2, WORLD * 2 + 8, 5, 2, matWall, 0, 0);
addBox(0, WORLD + 2, WORLD * 2 + 8, 5, 2, matWall, 0, 0);
addBox(-WORLD - 2, 0, 2, 5, WORLD * 2 + 8, matWall, 0, 0);
addBox(WORLD + 2, 0, 2, 5, WORLD * 2 + 8, matWall, 0, 0);

// === 拠点の旗ポール & 旗メッシュ ===
const flagMeshes = [];
{
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 9, 6);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.5);
  const ringGeo = new THREE.RingGeometry(FLAG_R - 0.6, FLAG_R, 36);
  for (const f of flags) {
    const gy = terrainH(f.x, f.z);
    const pole = new THREE.Mesh(poleGeo, matPole);
    pole.position.set(f.x, gy + 4.5, f.z);
    scene.add(pole);
    const fm = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: 0xbbbbbb, side: THREE.DoubleSide }));
    fm.position.set(f.x + 1.25, gy + 8, f.z);
    scene.add(fm);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.x, gy + 0.25, f.z);
    scene.add(ring);
    f.gy = gy;
    flagMeshes.push({ f, fm, ring });
  }
}
function flagColorHex(own) { return own === 1 ? 0x3d7fe0 : own === -1 ? 0xd03428 : 0xbbbbbb; }
function updateFlagVisual(f) {
  const rec = flagMeshes.find(r => r.f === f);
  if (!rec) return;
  rec.fm.material.color.setHex(flagColorHex(f.own));
  rec.ring.material.color.setHex(flagColorHex(f.own));
}
