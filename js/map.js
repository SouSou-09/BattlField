'use strict';
/* STEEL FRONT — マップ: 道路 / 建物 / 破壊可能オブジェクト / 障害物 */

/* =========================================================
   Conquest flags — 拠点定義 (地形パッチより先に確定)
   own: 1=BLUE(プレイヤー側) / -1=RED / 0=中立
   ========================================================= */
const FLAG_R = 14;                 // 占領判定半径
const flags = [
  { id: 'A', x: -250, z: -220, own: 0, cap: 0 }, // 北西の丘の上 (v0.3.3: 2倍拡張)
  { id: 'B', x: -200, z: 150, own: 0, cap: 0 },  // 南西の村
  { id: 'C', x: 0,   z: 0,   own: 0, cap: 0 },   // 中央市街地
  { id: 'D', x: 210, z: -160, own: 0, cap: 0 },  // 北東の倉庫地区
  { id: 'E', x: 260, z: 250, own: 0, cap: 0 },   // 南東の高地基地
  { id: 'F', x: 120, z: 120, own: 0, cap: 0 }    // v0.3: 湖の島
];
const HQ_BLUE = { x: -340, z: 340 };   // 南西端 (v0.3.3: 2倍拡張)
const HQ_RED  = { x: 340,  z: -340 };  // 北東端

// 拠点・HQ周辺を平地化
for (const f of flags) flattenAt(f.x, f.z, 22);
flattenAt(HQ_BLUE.x, HQ_BLUE.z, 20);
flattenAt(HQ_RED.x, HQ_RED.z, 20);
// v0.3: 島Fへの土手道 (水面より上に盛り土) v0.3.3: 2倍拡張
for (let bx = 40; bx <= 104; bx += 4) {
  FLATS.push([bx, 120, 5, Math.max(WATER_Y + 0.7, terrainHeight(bx, 120))]);
}

// ---------- 道路網 ----------
// v0.3.1: ROADS / onRoad の定義と地形の平滑化は terrain.js へ移動。
// ここでは実体の路面メッシュ (センターライン付きアスファルト) を敷設する。

/* ---------- Terrain mesh (ハイトフィールド) ---------- */
{
  const SEG = isMobile ? 160 : 220;   // v0.3.3: マップ2倍化に伴い分割を増やす
  const geo = new THREE.PlaneGeometry(WORLD * 2 + 80, WORLD * 2 + 80, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  // 頂点カラー: 高さ・道路で色分け (草/土/岩/道路/砂浜/水底)
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x6d7a4e), cDirt = new THREE.Color(0x7a7050),
        cRock = new THREE.Color(0x777872), cRoad = new THREE.Color(0x46484c),
        cGrass2 = new THREE.Color(0x5d6f45),
        cSand = new THREE.Color(0x9a8c66), cBed = new THREE.Color(0x4a5648);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    let c;
    if (h < WATER_Y - 0.3) c = cBed;
    else if (h < WATER_Y + 1.0) c = cSand;
    else if (onRoad(x, z)) c = cRoad;   // ベース色 (路面メッシュの下地)
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

/* ---------- v0.3.1: 路面メッシュ (地形に沿ったアスファルト帯) ---------- */
{
  const roadMat = new THREE.MeshLambertMaterial({
    map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  for (const [x1, z1, x2, z2] of ROADS) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const segs = Math.max(4, Math.ceil(len / 5));
    const geo = new THREE.PlaneGeometry(ROAD_W * 2, len, 2, segs);
    geo.rotateX(-Math.PI / 2);
    // ローカル(z軸=道路方向)で生成 → ワールドへ回転・平行移動しながら高さを地形に沿わせる
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const wx = cx + lx * cos + lz * sin;
      const wz = cz - lx * sin + lz * cos;
      pos.setX(i, wx);
      pos.setZ(i, wz);
      pos.setY(i, terrainH(wx, wz) + 0.06);
    }
    geo.computeVertexNormals();
    // テクスチャのUVを道路長に合わせてリピート
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 8);
    const m = new THREE.Mesh(geo, roadMat);
    m.receiveShadow = !isMobile;
    scene.add(m);
  }
}

/* ---------- v0.3: 水面 (湖) ---------- */
let waterMesh = null;
{
  const geo = new THREE.CircleGeometry(LAKE.r + 6, 40);
  geo.rotateX(-Math.PI / 2);
  waterMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: 0x2e6f8e, transparent: true, opacity: 0.78, depthWrite: false
  }));
  waterMesh.position.set(LAKE.x, WATER_Y, LAKE.z);
  scene.add(waterMesh);
}

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
[[-12, -4, 0], [12, 6, Math.PI / 2]].forEach(c => {
  // v0.3.4: コンテナも道路から退避
  const hw = Math.abs(Math.sin(c[2])) > 0.7 ? 1.6 : 6, hd = Math.abs(Math.sin(c[2])) > 0.7 ? 6 : 1.6;
  const [cx, cz] = offRoadPos(c[0], c[1], hw, hd);
  addBox(cx, cz, 12, 3, 3.2, matContainer, c[2]);
});
// 廃墟壁
[[-6, 20, 10, 3.5, 1, 0], [14, -12, 8, 2.8, 1, Math.PI / 2], [-16, 6, 9, 3, 1, Math.PI / 2]]
 .forEach(w => addBreachableWall(w[0], w[1], w[2], w[3], w[4], matWall, w[5]));

// === 拠点A: 北西の丘 (砦・監視塔) ===
{
  const fx = -250, fz = -220;   // v0.3.3: 2倍拡張
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
  const fx = -200, fz = 150;   // v0.3.3: 2倍拡張
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
  const fx = 210, fz = -160;   // v0.3.3: 2倍拡張
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
  const fx = 260, fz = 250;   // v0.3.3: 2倍拡張
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
addTwoStoryBuilding(-12, 12, 10, 3.6, 3.2, 9, matBuildingA, 0);

// v0.3: 地下壕 (ピットの上に屋根スラブ / 塹壕から進入)
{
  const [px, pz, r] = PITS[0];
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
  const fx = 120, fz = 120;   // v0.3.3: 2倍拡張
  // 島の砦壁 (半円状)
  addBox(fx, fz - 8, 14, 2.2, 1.2, matWall);
  addBox(fx - 8, fz + 2, 1.2, 2.2, 12, matWall);
  addBox(fx + 4, fz + 6, 8, 1.1, 1.2, matSandbag);
  addEnterableBuilding(fx + 3, fz - 2, 7, 3.4, 6, matWall, 3);
  addDestructibleBarrel(fx - 4, fz + 5);
  // 桁橋風: 土手道の両脇に柵 (v0.3.3: 2倍拡張)
  for (let i = 0; i < 8; i++) {
    const bx = 44 + i * 7.5;
    addBox(bx, 117.2, 3, 0.9, 0.25, matTrunk);
    addBox(bx, 122.8, 3, 0.9, 0.25, matTrunk);
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
buildTower(-50, 110);   // v0.3.3: 2倍拡張
buildTower(-80, -90);
buildTower(240, 40);
buildTower(40, -240);   // v0.3.3: 新増
buildTower(-240, 60);

// v0.4.0: 建物側面のはしご — 屋上ルートを複数化 (主要拠点の大型建物)
// 建物はoffRoadPosで動くため、直近の障害物(建物)を探して壁面に寄せる
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
addLadderNearBuilding(-18, -16, 2);          // 拠点C 北西ビル
addLadderNearBuilding(0, 30, 0);             // 拠点C 南ビル
addLadderNearBuilding(210 - 12, -160 - 8, 1); // 拠点D 倉庫
addLadderNearBuilding(260 - 8, 250 - 8, 2);   // 拠点E 基地ビル

// === 岩場 (高台の斜面や空白地帯に岩を配置) ===
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockSpots = [[-120, -60], [-100, -110], [110, 50], [70, -170], [-50, 180], [120, 120], [-230, 40], [40, 230], [230, -40], [-40, -230], [140, -40], [-140, -10], [20, 120], [-70, 70], [90, -80], [180, 40], [-180, -80], [-110, 190], [240, 100], [100, -220], [-300, 150], [300, -100], [150, 300], [-150, -300], [280, 180], [-280, -180], [200, 200], [-200, -100]];   // v0.3.3: 2倍拡張+増量
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
  while (placed < 90 && tries < 700) {   // v0.3.3: マップ2倍化に伴い増量
    tries++;
    const x = (Math.random() * 2 - 1) * (WORLD - 12);
    const z = (Math.random() * 2 - 1) * (WORLD - 12);
    if (onRoad(x, z) || isWater(x, z)) continue;
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
  [[-12, -32], [-11, -31], [33, -14], [14, 24], [-32, 19], [24, 8], [-6, 29], [208, -155], [-197, 147], [-247, -215], [258, 247], [118, 123]].forEach(([x, z], i) => {
    addDestructibleBarrel(x, z, i % 2 === 1);
  });
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 320;
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
