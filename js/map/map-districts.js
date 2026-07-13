'use strict';
/* STEEL FRONT — 地区構築: 各拠点の建物・塔・梯子・岩・木・旗杆 (map.js から分割) */

/* ---------- 地区の構築 ---------- */
/* =========================================================
   v0.8.0: 座標は全て flags[] / HQ_* を参照するように改修
   (旗位置が1.3倍拡張されても追従する)
   ========================================================= */
// === 拠点C: 中央市街地 ===
// v0.8.0: 拠点C周辺の街区は旗位置(原点)周辺のオフセットで定義
[[-18, -16, 16, 15, 18, matBuildingA], [20, -18, 18, 11, 14, matBuildingB],
 [22, 16, 14, 18, 14, matBuildingA], [-22, 18, 18, 12, 16, matBuildingC],
 [-2, -30, 22, 9, 12, matBuildingB], [0, 30, 20, 13, 12, matBuildingC]]
 .forEach(b => addBuilding(flags[2].x + b[0], flags[2].z + b[1], b[2], b[3], b[4], b[5]));
// v0.8.0: 中央市街地の位置は flags[2] を基準
[[-8, 8, 8, 1.1, 1.2, 0], [10, -6, 8, 1.1, 1.2, Math.PI / 2], [6, 8, 6, 1.1, 1.2, 0]]
 .forEach(s => addBox(flags[2].x + s[0], flags[2].z + s[1], s[2], s[3], s[4], matSandbag, s[5]));
// v0.2.3: 中央市街地に進入可能な建物 (拠点Cの激戦区)
addEnterableBuilding(flags[2].x - 9, flags[2].z - 8, 9, 4.5, 8, matBuildingB, 0);   // ドア南
addEnterableBuilding(flags[2].x + 11, flags[2].z + 10, 8, 4, 9, matBuildingC, 3);     // ドア西
[[-12, -4, 0], [12, 6, Math.PI / 2]].forEach(c => {
  // v0.3.4: コンテナも道路から退避
  const hw = Math.abs(Math.sin(c[2])) > 0.7 ? 1.6 : 6, hd = Math.abs(Math.sin(c[2])) > 0.7 ? 6 : 1.6;
  const [cx, cz] = offRoadPos(flags[2].x + c[0], flags[2].z + c[1], hw, hd);
  addBox(cx, cz, 12, 3, 3.2, matContainer, c[2]);
});
// 廃墟壁
[[-6, 20, 10, 3.5, 1, 0], [14, -12, 8, 2.8, 1, Math.PI / 2], [-16, 6, 9, 3, 1, Math.PI / 2]]
 .forEach(w => addBreachableWall(flags[2].x + w[0], flags[2].z + w[1], w[2], w[3], w[4], matWall, w[5]));

// === 拠点A: 北西の丘 (砦・監視塔) ===
{
  const fx = flags[0].x, fz = flags[0].z;   // v0.8.0: flags[0]参照 (旧:-250,-220)
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
  const fx = flags[1].x, fz = flags[1].z;   // v0.8.0: flags[1]参照 (旧:-200,150)
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
  const fx = flags[3].x, fz = flags[3].z;   // v0.8.0: flags[3]参照 (旧:210,-160)
  addBuilding(fx - 12, fz - 8, 18, 8, 14, matBuildingB);
  addBuilding(fx + 13, fz + 6, 16, 7, 12, matBuildingB);
  // コンテナヤード (2段積みあり / v0.3.4: 道路から退避)
  [[fx - 2, fz + 10, 0, matContainer], [fx + 4, fz - 12, Math.PI / 2, matContainer3],
   [fx + 12, fz - 10, 0, matContainer2], [fx - 8, fz + 4, Math.PI / 2, matContainer]]
   .forEach((c, i) => {
     const hw = Math.abs(Math.sin(c[2])) > 0.7 ? 1.6 : 6, hd = Math.abs(Math.sin(c[2])) > 0.7 ? 6 : 1.6;
     const [cx, cz] = offRoadPos(c[0], c[1], hw, hd);
     addBox(cx, cz, 12, 3, 3.2, c[3], c[2]);
     if (i % 2 === 0) addBox(cx + 0.4, cz, 12, 3, 3.2, i % 2 ? c[3] : matContainer2, c[2], terrainH(cx, cz) + 3, false);
   });
  for (let i = 0; i < 6; i++) {
    addDestructibleCrate(fx - 10 + Math.random() * 20, fz - 4 + Math.random() * 8, Math.random());
  }
  // v0.2.3: 倉庫地区に進入可能な倉庫
  addEnterableBuilding(fx + 2, fz - 22, 12, 5, 9, matBuildingB, 1);
}

// === 拠点E: 南東の高地基地 ===
{
  const fx = flags[4].x, fz = flags[4].z;   // v0.8.0: flags[4]参照 (旧:260,250)
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

/* =========================================================
   v0.3: 立体構造 — 階段 / 2階建て / 地下壕 / 島の砦
   ========================================================= */
// 階段: 段差0.35mのステップを並べる (collidesAtの乗り越え判定で登れる)
function addStairs(x, z, dirX, dirZ, width, topH, yBase = null) {
  const gy = yBase === null ? terrainH(x, z) : yBase;
  const stepH = 0.35, stepD = 0.62;
  const n = Math.ceil(topH / stepH);
  for (let i = 0; i < n; i++) {
    const sx = x + dirX * stepD * i, sz = z + dirZ * stepD * i;
    const h = stepH * (i + 1);
    const w = Math.abs(dirX) > 0.5 ? stepD : width;
    const d = Math.abs(dirX) > 0.5 ? width : stepD;
    addBox(sx, sz, w, h, d, matRoof, 0, gy);
  }
}
// 2階建て (v0.3.4: 全面刷新 — 内部階段で 1F→2F→屋上、各階に射撃窓)
function addTwoStoryBuilding(x, z, w, h1, h2, d, mat, doorDir = 0) {
  [x, z] = offRoadPos(x, z, w / 2, d / 2);
  const gy = siteH(x, z, w, d) + 0.05;
  addFoundation(x, z, w, d, gy + 0.15);
  const T = 0.5, DW = 2.4, DH = 2.5;
  // 1F 床スラブ
  addBox(x, z, w - 0.2, 0.2, d - 0.2, matFloor, 0, gy - 0.05);
  // --- 1F 壁 (ドア + 射撃窓) ---
  const walls = [
    { side: 0, cx: x, cz: z + d / 2 - T / 2, horiz: true },
    { side: 1, cx: x, cz: z - d / 2 + T / 2, horiz: true },
    { side: 2, cx: x + w / 2 - T / 2, cz: z, horiz: false },
    { side: 3, cx: x - w / 2 + T / 2, cz: z, horiz: false }
  ];
  for (const wl of walls) {
    const len = wl.horiz ? w : d;
    if (wl.side !== doorDir) {
      if (len >= 5.5) buildWindowWall(wl.cx, wl.cz, wl.horiz, len, h1, T, gy, mat);
      else if (wl.horiz) addBreachableWall(wl.cx, wl.cz, len, h1, T, mat, 0, gy);
      else addBreachableWall(wl.cx, wl.cz, T, h1, len, mat, 0, gy);
      continue;
    }
    const segLen = (len - DW) / 2;
    if (wl.horiz) {
      addBreachableWall(wl.cx - (DW + segLen) / 2, wl.cz, segLen, h1, T, mat, 0, gy);
      addBreachableWall(wl.cx + (DW + segLen) / 2, wl.cz, segLen, h1, T, mat, 0, gy);
      addBreachableWall(wl.cx, wl.cz, DW, h1 - DH, T, mat, 0, gy + DH);
    } else {
      addBreachableWall(wl.cx, wl.cz - (DW + segLen) / 2, T, h1, segLen, mat, 0, gy);
      addBreachableWall(wl.cx, wl.cz + (DW + segLen) / 2, T, h1, segLen, mat, 0, gy);
      addBreachableWall(wl.cx, wl.cz, T, h1 - DH, DW, mat, 0, gy + DH);
    }
  }
  // 内部階段 1F→2F (西壁沿い) + 2F床 (階段上に開口)
  const hatch1 = addInteriorStairs(x, z, w, d, h1, T, gy, -1, 1);
  buildRoofWithHatch(x, z, w, d, gy + h1, hatch1, false);   // 2F床=1F天井
  const f2 = gy + h1 + 0.4;
  // --- 2F 壁 (全面に射撃窓) ---
  for (const wl of walls) {
    const len = wl.horiz ? w : d;
    if (len >= 5.5) buildWindowWall(wl.cx, wl.cz, wl.horiz, len, h2, T, f2, mat);
    else if (wl.horiz) addBreachableWall(wl.cx, wl.cz, len, h2, T, mat, 0, f2);
    else addBreachableWall(wl.cx, wl.cz, T, h2, len, mat, 0, f2);
  }
  // 内部階段 2F→屋上 (東壁沿い / 1Fと反対側で干渉回避) + 屋根ハッチ
  const hatch2 = addInteriorStairs(x, z, w, d, h2, T, f2, 1, -1);
  buildRoofWithHatch(x, z, w, d, f2 + h2, hatch2, true);
}
// v0.3: 中央市街地に2階建て (拠点Cの縦の拠点)
// v0.8.0: flags[2]基準
addTwoStoryBuilding(flags[2].x - 12, flags[2].z + 12, 10, 3.6, 3.2, 9, matBuildingA, 0);

// v0.3: 地下壕 (ピットの上に屋根スラブ / 塹壕から進入)
{
  const [px, pz, r] = PITS[0];   // v0.8.0: PITS[0]=[130,-78,8.5]
  const gy = terrainHeight(px + r + 6, pz);   // 周囲の地表高さ目安
  const slabY = terrainH(px + r + 2, pz) + 0.1;
  // 屋根スラブ (塹壕側に開口を残す)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(r * 2 - 2, 0.5, r * 2 - 2), matRoof);
  slab.position.set(px + 1.5, slabY + 0.25, pz);
  slab.castShadow = slab.receiveShadow = !isMobile;
  scene.add(slab);
  solidMeshes.push(slab);
  obstacles.push({ minX: px + 1.5 - (r - 1), maxX: px + 1.5 + (r - 1), minZ: pz - (r - 1), maxZ: pz + (r - 1), y0: slabY, h: slabY + 0.5 });
  // 支柱
  [[px - 2, pz - 3], [px + 4, pz + 3], [px + 4, pz - 3], [px - 2, pz + 3]].forEach(([cx, cz]) => {
    const gy2 = terrainH(cx, cz);
    addBox(cx, cz, 0.6, slabY - gy2 + 0.1, 0.6, matWall, 0, gy2);
  });
  // 内部の弾薬箱
  addDestructibleCrate(px + 2, pz + 1.5);
}

// === v0.3 拠点F: 湖の島 (土手道で接続 / 砦 + 固定機銃) ===
{
  const fx = flags[5].x, fz = flags[5].z;   // v0.8.0: flags[5]参照 (旧:120,120)
  // 島の砦壁 (半円状)
  addBox(fx, fz - 8, 14, 2.2, 1.2, matWall);
  addBox(fx - 8, fz + 2, 1.2, 2.2, 12, matWall);
  addBox(fx + 4, fz + 6, 8, 1.1, 1.2, matSandbag);
  addEnterableBuilding(fx + 3, fz - 2, 7, 3.4, 6, matWall, 3);
  addDestructibleBarrel(fx - 4, fz + 5);
  // 桁橋風: 土手道の両脇に柵 (v0.8.0: 旗位置基準に再計算)
  for (let i = 0; i < 8; i++) {
    const bx = flags[5].x - 112 + i * 7.5;
    addBox(bx, flags[5].z - 2.8, 3, 0.9, 0.25, matTrunk);
    addBox(bx, flags[5].z + 2.8, 3, 0.9, 0.25, matTrunk);
  }
}

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
  // v0.4.0: 監視塔の南面にはしご — デッキに登れる
  addLadder(tx, tz + 3.0, gy, gy + 8.5, 0);
}
// v0.8.0: 監視塔位置はWORLD拡張に合わせ再配置 (旧値は参考)
buildTower(-65, 143);   // v0.8.0: 旧-50,110
buildTower(-104, -117); // v0.8.0: 旧-80,-90
buildTower(312, 52);    // v0.8.0: 旧240,40
buildTower(52, -312);   // v0.8.0: 旧40,-240
buildTower(-312, 78);   // v0.8.0: 旧-240,60

// v0.4.0: 建物側面のはしご — 屋上ルートを複数化 (主要拠点の大型建物)
// 建物はoffRoadPosで動くため、直近の障害物(建物)を探して壁面に寄せる
// v0.8.0: 旗位置基準に修正
function addLadderNearBuilding(bx, bz, faceDir) {
  // faceDir側の壁を探す: その位置で最も高い障害物を探す
  let best = null;
  for (const o of obstacles) {
    if (bx > o.minX - 3 && bx < o.maxX + 3 && bz > o.minZ - 3 && bz < o.maxZ + 3) {
      if (o.h - o.y0 > 5 && (!best || o.h > best.h)) best = o;
    }
  }
  if (!best) return;
  let lx, lz;
  if (faceDir === 0) { lx = (best.minX + best.maxX) / 2; lz = best.maxZ + 0.45; }
  else if (faceDir === 1) { lx = (best.minX + best.maxX) / 2; lz = best.minZ - 0.45; }
  else if (faceDir === 2) { lx = best.maxX + 0.45; lz = (best.minZ + best.maxZ) / 2; }
  else { lx = best.minX - 0.45; lz = (best.minZ + best.maxZ) / 2; }
  addLadder(lx, lz, terrainH(lx, lz), best.h + 0.3, faceDir);
}
addLadderNearBuilding(flags[2].x - 18, flags[2].z - 16, 2);          // 拠点C 北西ビル
addLadderNearBuilding(flags[2].x, flags[2].z + 30, 0);             // 拠点C 南ビル
addLadderNearBuilding(flags[3].x - 12, flags[3].z - 8, 1); // 拠点D 倉庫
addLadderNearBuilding(flags[4].x - 8, flags[4].z - 8, 2);   // 拠点E 基地ビル

// === 岩場 (高台の斜面や空白地帯に岩を配置) ===
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  // v0.8.0: 座標を1.3倍相当へ再配置 (旧: -120,-60 等)
  const rockSpots = [[-156,-78],[-130,-143],[143,65],[91,-221],[-65,234],[156,156],[-299,52],[52,299],[299,-52],[-52,-299],[182,-52],[-182,-13],[26,156],[-91,91],[117,-104],[234,52],[-234,-104],[-143,247],[312,130],[130,-286],[-390,195],[390,-130],[195,390],[-195,-390],[364,234],[-364,-234],[260,260],[-260,-130]];
  for (const [x, z] of rockSpots) {
    if (onRoad(x, z) || isWater(x, z)) continue;
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
  while (placed < 130 && tries < 1000) {   // v0.8.0: マップ拡張に伴い増量 (旧90/700)
    tries++;
    const x = (Math.random() * 2 - 1) * (WORLD - 12);
    const z = (Math.random() * 2 - 1) * (WORLD - 12);
    if (onRoad(x, z) || isWater(x, z)) continue;
    let nearFlag = false;
    for (const f of flags) if (Math.hypot(x - f.x, z - f.z) < 16) { nearFlag = true; break; }
    if (nearFlag || Math.hypot(x - HQ_BLUE.x, z - HQ_BLUE.z) < 18 || Math.hypot(x - HQ_RED.x, z - HQ_RED.z) < 18) continue;
    // v0.8.0: 軍事基地領域内は木を置かない
    let inBase = false;
    for (const mb of MILBASES) {
      const dx = x - mb.x, dz = z - mb.z;
      const cos = Math.cos(mb.rotY), sin = Math.sin(mb.rotY);
      const lx = dx * cos + dz * sin, lz = -dx * sin + dz * cos;
      if (lx > -mb.w / 2 - 8 && lx < mb.w / 2 + 8 && lz > -mb.d / 2 - 8 && lz < mb.d / 2 + 8) { inBase = true; break; }
    }
    if (inBase) continue;
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
  // v0.8.0: 旗位置基準
  [[-12, -32], [-11, -31], [33, -14], [14, 24], [-32, 19], [24, 8], [-6, 29],
   [flags[3].x - 2, flags[3].z + 5], [flags[1].x + 3, flags[1].z - 3],
   [flags[0].x + 3, flags[0].z + 5], [flags[4].x - 2, flags[4].z - 3],
   [flags[5].x - 2, flags[5].z + 3]].forEach(([x, z], i) => {
    addDestructibleBarrel(x, z, i % 2 === 1);
  });
  for (let i = 0; i < 38; i++) {  // v0.8.0: 増量 (旧28)
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 420;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (onRoad(x, z) || isWater(x, z)) continue;
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
