'use strict';
/* STEEL FRONT — マップオブジェクト: 障害物 / 建物 / 破壊可能物 / 窓 (map.js から分割) */

// ---------- Map objects ----------
const obstacles = [];             // AABB list {minX,maxX,minZ,maxZ,y0,h} (y0=底面, h=上面の絶対高さ)
const solidMeshes = [];           // for line-of-sight raycasts

/* =========================================================
   v0.4.0: はしご — 壁面/監視塔に設置し、登って屋上・高所へ
   ladders: {x,z,y0,y1,exitX,exitZ} — exitは登り切り方向(単位ベクトル)
   ========================================================= */
const ladders = [];
const matLadder = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
function addLadder(x, z, y0, y1, faceDir) {
  // faceDir: はしごが向いている方向 (プレイヤーが立つ側) 0=+z 1=-z 2=+x 3=-x
  const h = y1 - y0;
  const g = new THREE.Group();
  // サイドレール2本 + 横桟
  const railGeo = new THREE.BoxGeometry(0.07, h, 0.07);
  const r1 = new THREE.Mesh(railGeo, matLadder); r1.position.set(-0.3, h / 2, 0);
  const r2 = new THREE.Mesh(railGeo, matLadder); r2.position.set(0.3, h / 2, 0);
  g.add(r1, r2);
  const rungGeo = new THREE.BoxGeometry(0.62, 0.05, 0.05);
  for (let ry = 0.3; ry < h; ry += 0.38) {
    const rung = new THREE.Mesh(rungGeo, matLadder);
    rung.position.set(0, ry, 0);
    g.add(rung);
  }
  g.position.set(x, y0, z);
  g.rotation.y = faceDir === 0 ? 0 : faceDir === 1 ? Math.PI : faceDir === 2 ? -Math.PI / 2 : Math.PI / 2;
  scene.add(g);
  const exitX = faceDir === 2 ? -1 : faceDir === 3 ? 1 : 0;
  const exitZ = faceDir === 0 ? -1 : faceDir === 1 ? 1 : 0;
  ladders.push({ x, z, y0, y1, exitX, exitZ });
}
// プレイヤーがはしごゾーン内にいるか (input.jsから呼ばれる)
function findLadder() {
  const px = player.pos.x, pz = player.pos.z, footY = player.pos.y - player.eyeHeight;
  for (const l of ladders) {
    if (Math.abs(px - l.x) < 0.85 && Math.abs(pz - l.z) < 0.85 &&
        footY > l.y0 - 0.6 && footY < l.y1 + 0.3) return l;
  }
  return null;
}

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

// v0.3.2: 建物ディテール用マテリアル
const matWinFrame = new THREE.MeshLambertMaterial({ color: 0x2c3236 });
const matWinGlass = new THREE.MeshLambertMaterial({ color: 0x6f93a8 });
const matAC = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
const matDoor = new THREE.MeshLambertMaterial({ color: 0x3a3129 });
const matAwning = new THREE.MeshLambertMaterial({ color: 0x5a4a38 });
const matChimney = new THREE.MeshLambertMaterial({ color: 0x6b5548 });
const matLedge = new THREE.MeshLambertMaterial({ color: 0x84888c });

/* =========================================================
   v0.3.4: 建物システム刷新
   ・道路と重なる建物を自動で退避配置 (offRoadPos)
   ・敷地の最高地点に基礎を敷いて埋まり/浮きを解消 (siteH / addFoundation)
   ・破壊可能な窓ガラス — 撃つと割れる (windows / breakWindow)
   ・進入可能建物: 床スラブ / 射撃窓 / 内部階段 / 屋上ハッチ
   ========================================================= */
const matFloor = new THREE.MeshLambertMaterial({ color: 0x847d6f });
const matStair = new THREE.MeshLambertMaterial({ color: 0x6d7175 });
const matFoundation = new THREE.MeshLambertMaterial({ color: 0x5e5b54 });
const matGlassPane = new THREE.MeshLambertMaterial({ color: 0x9fc2d6, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

// 敷地の最高地点 (建物はこの高さに乗せると埋まらない)
function siteH(x, z, w, d) {
  let m = -Infinity;
  for (let ix = -1; ix <= 1; ix++)
    for (let iz = -1; iz <= 1; iz++)
      m = Math.max(m, terrainH(x + ix * w * 0.45, z + iz * d * 0.45));
  return m;
}
// 道路と重なる場合、道路から離れる方向へ位置を補正
function offRoadPos(x, z, hw, hd) {
  const CLEAR = ROAD_W + 1.8;
  for (let iter = 0; iter < 16; iter++) {
    let minD = Infinity, px = 0, pz = 0;
    for (const [ox, oz] of [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, -hd], [0, hd], [-hw, 0], [hw, 0]]) {
      const sx = x + ox, sz = z + oz;
      for (const [x1, z1, x2, z2] of ROADS) {
        const dx = x2 - x1, dz = z2 - z1;
        let t = ((sx - x1) * dx + (sz - z1) * dz) / (dx * dx + dz * dz);
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + dx * t, cz = z1 + dz * t;
        const dd = Math.hypot(sx - cx, sz - cz);
        if (dd < minD) { minD = dd; px = cx; pz = cz; }
      }
    }
    if (minD >= CLEAR) break;
    let dx = x - px, dz = z - pz;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) { x += 1.5; continue; }   // 道路中心線上: とりあえずずらして再試行
    x += dx / l * (CLEAR - minD + 0.6);
    z += dz / l * (CLEAR - minD + 0.6);
  }
  return [x, z];
}
// 基礎 (斜面との隙間・めり込みをコンクリで埋める)
function addFoundation(x, z, w, d, gy) {
  let lo = Infinity;
  for (let ix = -1; ix <= 1; ix++)
    for (let iz = -1; iz <= 1; iz++)
      lo = Math.min(lo, terrainH(x + ix * w * 0.48, z + iz * d * 0.48));
  const hgt = gy - lo + 0.5;
  if (hgt <= 0.55) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, hgt, d + 0.3), matFoundation);
  m.position.set(x, lo - 0.4 + hgt / 2, z);
  m.receiveShadow = !isMobile;
  scene.add(m);
}

/* ---------- v0.3.4: 破壊可能な窓ガラス ---------- */
const windows = [];
function addWindowPane(x, y, z, w, h, alongX, solid = true) {
  const t = 0.1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? w : t, h, alongX ? t : w), matGlassPane);
  m.position.set(x, y, z);
  scene.add(m);
  solidMeshes.push(m);
  const hw = alongX ? w / 2 : t / 2, hd = alongX ? t / 2 : w / 2;
  const ob = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y0: y - h / 2, h: y + h / 2 };
  if (solid) obstacles.push(ob);
  const wp = { m, ob, solid, broken: false };
  m.userData.windowPane = wp;
  windows.push(wp);
  return wp;
}
function breakWindow(wp) {
  if (wp.broken) return;
  wp.broken = true;
  wp.m.visible = false;
  if (wp.solid) { const oi = obstacles.indexOf(wp.ob); if (oi >= 0) obstacles.splice(oi, 1); }
  const si = solidMeshes.indexOf(wp.m); if (si >= 0) solidMeshes.splice(si, 1);
  spawnParticles(wp.m.position.clone(), 0xcfe4f0, 12, 3.5, 0.8);
  spawnParticles(wp.m.position.clone(), 0x8fb4c8, 6, 2.5, 0.6);
  sfx.glass();
}
function resetWindows() {
  for (const wp of windows) {
    if (!wp.broken) continue;
    wp.broken = false;
    wp.m.visible = true;
    if (wp.solid) obstacles.push(wp.ob);
    solidMeshes.push(wp.m);
  }
}

/* ---------- v0.4.8: ロケットで開口できる壁セグメント ---------- */
const destructibleWalls = [];
function addBreachableWall(x, z, w, h, d, material, rotY = 0, yBase = null) {
  const m = addBox(x, z, w, h, d, material, rotY, yBase, true);
  const ob = obstacles[obstacles.length - 1];
  const wall = { m, ob, hp: 95, hp0: 95, breached: false };
  m.userData.destructibleWall = wall;
  destructibleWalls.push(wall);
  return m;
}
function breachWallV048(wall) {
  if (!wall || wall.breached) return;
  wall.breached = true;
  wall.m.visible = false;
  const oi = obstacles.indexOf(wall.ob); if (oi >= 0) obstacles.splice(oi, 1);
  const si = solidMeshes.indexOf(wall.m); if (si >= 0) solidMeshes.splice(si, 1);
  spawnParticles(wall.m.position.clone(), 0x8b8175, 24, 7, 2.8);
  spawnParticles(wall.m.position.clone(), 0x4a4540, 14, 4, 2.2);
  if (typeof addBattleScar === 'function') addBattleScar(wall.m.position, 'scorch', 2.3);
  addFeed('壁を破壊 — 新たな侵入経路を確保', 'blue');
}
function resetDestructibleWallsV048() {
  for (const wall of destructibleWalls) {
    wall.hp = wall.hp0;
    if (!wall.breached) continue;
    wall.breached = false;
    wall.m.visible = true;
    if (!obstacles.includes(wall.ob)) obstacles.push(wall.ob);
    if (!solidMeshes.includes(wall.m)) solidMeshes.push(wall.m);
  }
}

/* ---------- v0.3.4: 射撃窓つき壁 (窓ガラスは撃つと割れて撃ち抜ける) ---------- */
function buildWindowWall(cx, cz, horiz, len, h, T, gy, mat) {
  const WW = 1.7, SILL = 1.1, TOP = 2.3;
  const offs = len >= 10 ? [-len * 0.25, len * 0.25] : [0];
  // 開口の間の壁セグメント
  const edges = [-len / 2];
  for (const o of offs) edges.push(o - WW / 2, o + WW / 2);
  edges.push(len / 2);
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1];
    if (b - a <= 0.05) continue;
    const c = (a + b) / 2, sl = b - a;
    if (horiz) addBreachableWall(cx + c, cz, sl, h, T, mat, 0, gy);
    else addBreachableWall(cx, cz + c, T, h, sl, mat, 0, gy);
  }
  for (const o of offs) {
    if (horiz) {
      addBreachableWall(cx + o, cz, WW, SILL, T, mat, 0, gy);                 // 腰壁
      addBreachableWall(cx + o, cz, WW, h - TOP, T, mat, 0, gy + TOP);        // まぐさ
      addWindowPane(cx + o, gy + (SILL + TOP) / 2, cz, WW - 0.1, TOP - SILL - 0.06, true);
    } else {
      addBreachableWall(cx, cz + o, T, SILL, WW, mat, 0, gy);
      addBreachableWall(cx, cz + o, T, h - TOP, WW, mat, 0, gy + TOP);
      addWindowPane(cx, gy + (SILL + TOP) / 2, cz + o, WW - 0.1, TOP - SILL - 0.06, false);
    }
  }
}

/* ---------- v0.3.4: 内部階段 (折返し) → 屋上ハッチ開口を返す ---------- */
function addInteriorStairs(x, z, w, d, h, T, base, sideX, dirZ) {
  const stepH = 0.35, stepD = 0.5;
  const topH = h + 0.4;
  const n = Math.ceil(topH / stepH);
  // 1本目: 東西どちらかの壁沿い (頭上が天井につかえない段数まで)
  const maxLen = Math.max(2, Math.floor((d - 2 * T - 1.9) / stepD));
  let n1 = Math.min(maxLen, Math.floor((h - 1.95) / stepH), n - 2);
  n1 = Math.max(1, n1);
  const n2 = n - n1;
  const wx = x + sideX * (w / 2 - T - 0.65);
  const z0 = z - dirZ * (d / 2 - T - 0.45);
  for (let i = 1; i <= n1; i++) {
    addBox(wx, z0 + dirZ * stepD * (i - 1), 1.2, stepH * i, stepD, matStair, 0, base);
  }
  // 踊り場 (1本目の終端に接続)
  const lz = z0 + dirZ * (stepD * n1 + 0.4);
  addBox(wx, lz, 1.3, stepH * n1, 1.3, matStair, 0, base);
  // 2本目: 折返して横方向へ
  for (let j = 1; j <= n2; j++) {
    addBox(wx - sideX * (0.65 + stepD * (j - 0.5)), lz, stepD, stepH * (n1 + j), 1.2, matStair, 0, base);
  }
  const xEnd = wx - sideX * (0.65 + stepD * (n2 - 0.5));
  // ハッチ開口: 折返し通路全体 + 降り立ち先までを開ける (頭上のつかえ防止)
  // 2本目の階段は -sideX 方向へ進む → 開口は wx-sideX*0.4 〜 xEnd-sideX*1.1
  const xStart = wx - sideX * 0.4;
  const xExit = xEnd - sideX * 1.1;
  return {
    minX: Math.max(Math.min(xStart, xExit) - 0.15, x - w / 2 + T),
    maxX: Math.min(Math.max(xStart, xExit) + 0.15, x + w / 2 - T),
    minZ: Math.max(lz - 0.95, z - d / 2 + T),
    maxZ: Math.min(lz + 0.95, z + d / 2 - T)
  };
}

/* ---------- v0.3.4: ハッチ開口つき屋根 + パラペット(屋上の遮蔽) ---------- */
function buildRoofWithHatch(x, z, w, d, yTop, hatch, parapet = true) {
  if (!hatch) {
    addBox(x, z, w, 0.4, d, matRoof, 0, yTop);
  } else {
    const x1 = x - w / 2, x2 = x + w / 2, z1 = z - d / 2, z2 = z + d / 2;
    for (const [a, b, c, e] of [
      [x1, z1, x2, hatch.minZ],
      [x1, hatch.maxZ, x2, z2],
      [x1, hatch.minZ, hatch.minX, hatch.maxZ],
      [hatch.maxX, hatch.minZ, x2, hatch.maxZ]
    ]) {
      const rw = c - a, rd = e - b;
      if (rw < 0.05 || rd < 0.05) continue;
      addBox((a + c) / 2, (b + e) / 2, rw, 0.4, rd, matRoof, 0, yTop);
    }
  }
  if (parapet) {
    addBox(x, z - d / 2 + 0.13, w + 0.5, 0.55, 0.26, matRoof, 0, yTop + 0.4);
    addBox(x, z + d / 2 - 0.13, w + 0.5, 0.55, 0.26, matRoof, 0, yTop + 0.4);
    addBox(x - w / 2 + 0.13, z, 0.26, 0.55, d - 0.5, matRoof, 0, yTop + 0.4);
    addBox(x + w / 2 - 0.13, z, 0.26, 0.55, d - 0.5, matRoof, 0, yTop + 0.4);
  }
}

// 建物 (v0.3.4: 道路退避 / 基礎で埋まり解消 / 割れる窓ガラス / リアルなディテール)
function addBuilding(x, z, w, h, d, mat, roofMat = matRoof) {
  [x, z] = offRoadPos(x, z, w / 2, d / 2);            // v0.3.4: 道路と重ならない位置へ補正
  const gy = siteH(x, z, w, d);                        // v0.3.4: 敷地の最高地点に載せる
  addFoundation(x, z, w, d, gy);
  addBox(x, z, w, h, d, mat, 0, gy);
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5), roofMat);
  p.position.set(x, gy + h + 0.35, z);
  p.castShadow = false; p.receiveShadow = !isMobile;
  scene.add(p);
  // v0.3.4: 窓 — 額縁 + 破壊可能なガラス (前面・背面)
  const floors = Math.max(1, Math.floor(h / 3.4));
  const cols = Math.max(2, Math.floor(w / 4.5));
  const winGeo = new THREE.BoxGeometry(1.6, 1.85, 0.14);
  for (let f = 0; f < Math.min(floors, 4); f++) {
    const wy = gy + 2.0 + f * (h - 2.6) / Math.max(1, floors - 0.5);
    if (wy > gy + h - 1.2) break;
    for (let c = 0; c < Math.min(cols, 5); c++) {
      const wx = x - w / 2 + (c + 0.5) * w / Math.min(cols, 5);
      for (const dz of [-d / 2 - 0.03, d / 2 + 0.03]) {
        const fr = new THREE.Mesh(winGeo, matWinFrame);
        fr.position.set(wx, wy, z + dz);
        scene.add(fr);
        addWindowPane(wx, wy, z + dz + Math.sign(dz) * 0.05, 1.3, 1.55, true, false);
      }
    }
  }
  // 入口ドア + 庇 + ステップ
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 0.14), matDoor);
  door.position.set(x, gy + 1.25, z + d / 2 + 0.05); scene.add(door);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.0), matAwning);
  awn.position.set(x, gy + 2.75, z + d / 2 + 0.45); scene.add(awn);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.9), matLedge);
  step.position.set(x, gy + 0.11, z + d / 2 + 0.45); scene.add(step);
  // 階層帯 (レッジ)
  for (let f = 1; f < Math.min(floors, 4); f++) {
    const ly = gy + f * h / floors;
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.18, d + 0.3), matLedge);
    ledge.position.set(x, ly, z); scene.add(ledge);
  }
  // 屋上設備: AC室外機×2 + アンテナ + 給水タンク
  if (w > 10) {
    const u = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), matRoof);
    u.position.set(x - w * 0.22, gy + h + 1.4, z - d * 0.15);
    scene.add(u);
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), matAC);
    ac.position.set(x + w * 0.24, gy + h + 1.1, z + d * 0.2);
    scene.add(ac);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 4), matWinFrame);
    ant.position.set(x + w * 0.3, gy + h + 2.2, z - d * 0.25);
    scene.add(ant);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 10), matAC);
    tank.position.set(x - w * 0.3, gy + h + 1.5, z + d * 0.25);
    scene.add(tank);
  }
  return [x, z, gy];
}
// v0.2.3: 進入可能な建物 (ドア開口付き、4壁+屋根)
// doorDir: 0=+z(南) 1=-z(北) 2=+x(東) 3=-x(西)
// v0.3.4: 全面刷新 — 道路退避 / 床スラブで埋まり解消 / 射撃窓(割れるガラス) /
//         内部階段で屋上ハッチへ (stairs=false で従来の平屋バンカー)
function addEnterableBuilding(x, z, w, h, d, mat, doorDir = 0, stairs = true) {
  [x, z] = offRoadPos(x, z, w / 2, d / 2);   // v0.3.4: 道路と重ならない位置へ補正
  const gy = siteH(x, z, w, d) + 0.05;       // v0.3.4: 敷地の最高地点に合わせる
  addFoundation(x, z, w, d, gy + 0.15);
  const T = 0.5;          // 壁厚
  const DW = 2.4;         // ドア幅
  const DH = 2.5;         // ドア高
  // v0.3.4: 床スラブ (内部が地面に埋まる/沈むのを防ぐ)
  addBox(x, z, w - 0.2, 0.2, d - 0.2, matFloor, 0, gy - 0.05);
  // ドア前ステップ (段差を滑らかに)
  {
    const sx = doorDir === 2 ? x + w / 2 + 0.55 : doorDir === 3 ? x - w / 2 - 0.55 : x;
    const sz = doorDir === 0 ? z + d / 2 + 0.55 : doorDir === 1 ? z - d / 2 - 0.55 : z;
    const sg = terrainH(sx, sz);
    if (gy + 0.15 - sg > 0.3) addBox(sx, sz, doorDir < 2 ? DW : 1.1, Math.max(0.2, (gy + 0.15 - sg) / 2), doorDir < 2 ? 1.1 : DW, matLedge, 0, sg);
  }
  // 各壁: ドア壁=開口 / それ以外=射撃窓つき (v0.3.4)
  const walls = [
    { side: 0, cx: x, cz: z + d / 2 - T / 2, horiz: true },   // +z
    { side: 1, cx: x, cz: z - d / 2 + T / 2, horiz: true },   // -z
    { side: 2, cx: x + w / 2 - T / 2, cz: z, horiz: false },  // +x
    { side: 3, cx: x - w / 2 + T / 2, cz: z, horiz: false }   // -x
  ];
  for (const wl of walls) {
    const len = wl.horiz ? w : d;
    if (wl.side !== doorDir) {
      if (h >= 3.2 && len >= 5.5) buildWindowWall(wl.cx, wl.cz, wl.horiz, len, h, T, gy, mat);
      else if (wl.horiz) addBreachableWall(wl.cx, wl.cz, len, h, T, mat, 0, gy);
      else addBreachableWall(wl.cx, wl.cz, T, h, len, mat, 0, gy);
      continue;
    }
    // ドア付き壁: 左右セグメント + まぐさ
    const segLen = (len - DW) / 2;
    if (wl.horiz) {
      addBreachableWall(wl.cx - (DW + segLen) / 2, wl.cz, segLen, h, T, mat, 0, gy);
      addBreachableWall(wl.cx + (DW + segLen) / 2, wl.cz, segLen, h, T, mat, 0, gy);
      addBreachableWall(wl.cx, wl.cz, DW, h - DH, T, mat, 0, gy + DH);   // まぐさ
    } else {
      addBreachableWall(wl.cx, wl.cz - (DW + segLen) / 2, T, h, segLen, mat, 0, gy);
      addBreachableWall(wl.cx, wl.cz + (DW + segLen) / 2, T, h, segLen, mat, 0, gy);
      addBreachableWall(wl.cx, wl.cz, T, h - DH, DW, mat, 0, gy + DH);   // まぐさ
    }
  }
  // v0.3.4: 内部階段 → 屋上ハッチ (十分な広さがあるとき)
  let hatch = null;
  if (stairs && w >= 6.5 && d >= 5.5) {
    const sideX = doorDir === 3 ? 1 : -1;   // ドアの反対側の壁沿い
    hatch = addInteriorStairs(x, z, w, d, h, T, gy, sideX, 1);
  }
  buildRoofWithHatch(x, z, w, d, gy + h, hatch, true);
  return [x, z, gy];
}

// 三角屋根の家 (村用 / v0.3.4: 道路退避+基礎+割れる窓)
function addHouse(x, z, w, h, d, rotY = 0) {
  [x, z] = offRoadPos(x, z, Math.max(w, d) / 2, Math.max(w, d) / 2);   // v0.3.4
  const gy = siteH(x, z, w, d);                                        // v0.3.4
  addFoundation(x, z, w, d, gy);
  addBox(x, z, w, h, d, matBrick, rotY, gy);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.55, 4), matRoofRed);
  roof.position.set(x, gy + h + h * 0.27, z);
  roof.rotation.y = rotY + Math.PI / 4;
  roof.castShadow = !isMobile;
  scene.add(roof);
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  const lp = (lx, ly, lz) => new THREE.Vector3(x + lx * cos + lz * sin, gy + ly, z - lx * sin + lz * cos);
  // 煙突
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, h * 0.8, 0.7), matChimney);
  ch.position.copy(lp(w * 0.28, h + h * 0.3, -d * 0.2)); ch.rotation.y = rotY;
  scene.add(ch);
  // ドア (前面 +z)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.12), matDoor);
  door.position.copy(lp(0, 1.05, d / 2 + 0.05)); door.rotation.y = rotY;
  scene.add(door);
  // 窓×2 (前面左右 / v0.3.4: ガラスは撃つと割れる)
  for (const sx of [-w * 0.28, w * 0.28]) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.1), matWinFrame);
    fr.position.copy(lp(sx, h * 0.55, d / 2 + 0.04)); fr.rotation.y = rotY;
    scene.add(fr);
    const gp = lp(sx, h * 0.55, d / 2 + 0.1);
    addWindowPane(gp.x, gp.y, gp.z, 0.78, 0.78, Math.abs(Math.sin(rotY)) < 0.7, false);
  }
}
