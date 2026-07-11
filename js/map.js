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

// 建物 (パラペット・屋上設備つき / v0.3.2: 窓枚・入口・屋上設備を追加してリアルに)
function addBuilding(x, z, w, h, d, mat, roofMat = matRoof) {
  const gy = terrainH(x, z);
  addBox(x, z, w, h, d, mat);
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5), roofMat);
  p.position.set(x, gy + h + 0.35, z);
  p.castShadow = false; p.receiveShadow = !isMobile;
  scene.add(p);
  // v0.3.2: 出窓 (前面・背面に凸窓フレーム — テクスチャの窓と重なって立体感)
  const floors = Math.max(1, Math.floor(h / 3.4));
  const cols = Math.max(2, Math.floor(w / 4.5));
  const winGeo = new THREE.BoxGeometry(1.5, 1.7, 0.12);
  const glassGeo = new THREE.BoxGeometry(1.2, 1.4, 0.06);
  for (let f = 0; f < Math.min(floors, 4); f++) {
    const wy = gy + 2.0 + f * (h - 2.6) / Math.max(1, floors - 0.5);
    if (wy > gy + h - 1.2) break;
    for (let c = 0; c < Math.min(cols, 5); c++) {
      const wx = x - w / 2 + (c + 0.5) * w / Math.min(cols, 5);
      for (const dz of [-d / 2 - 0.02, d / 2 + 0.02]) {
        const fr = new THREE.Mesh(winGeo, matWinFrame);
        fr.position.set(wx, wy, z + dz);
        scene.add(fr);
        const gl = new THREE.Mesh(glassGeo, matWinGlass);
        gl.position.set(wx, wy, z + dz * 1.02);
        scene.add(gl);
      }
    }
  }
  // v0.3.2: 入口ドア + 庇 (南側)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 0.14), matDoor);
  door.position.set(x, gy + 1.25, z + d / 2 + 0.05); scene.add(door);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.0), matAwning);
  awn.position.set(x, gy + 2.75, z + d / 2 + 0.45); scene.add(awn);
  // v0.3.2: 階層帯 (レッジ)
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

// 三角屋根の家 (村用 / v0.3.2: 煙突・ドア・窓を追加)
function addHouse(x, z, w, h, d, rotY = 0) {
  const gy = terrainH(x, z);
  addBox(x, z, w, h, d, matBrick, rotY);
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
  // 窓×2 (前面左右)
  for (const sx of [-w * 0.28, w * 0.28]) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.1), matWinFrame);
    fr.position.copy(lp(sx, h * 0.55, d / 2 + 0.04)); fr.rotation.y = rotY;
    scene.add(fr);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.06), matWinGlass);
    gl.position.copy(lp(sx, h * 0.55, d / 2 + 0.09)); gl.rotation.y = rotY;
    scene.add(gl);
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
[[-12, -4, 0], [12, 6, Math.PI / 2]].forEach(c => addBox(c[0], c[1], 12, 3, 3.2, matContainer, c[2]));
// 廃墟壁
[[-6, 20, 10, 3.5, 1, 0], [14, -12, 8, 2.8, 1, Math.PI / 2], [-16, 6, 9, 3, 1, Math.PI / 2]]
 .forEach(w => addBox(w[0], w[1], w[2], w[3], w[4], matWall, w[5]));

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
// 2階建て (1階に入れて外階段で2階/屋上へ)
function addTwoStoryBuilding(x, z, w, h1, h2, d, mat, doorDir = 0) {
  const gy = terrainH(x, z);
  addEnterableBuilding(x, z, w, h1, d, mat, doorDir);
  // 2階 (壁のみ / 窓なしの簡易構造 + パラペット)
  const T = 0.5;
  addBox(x, z + d / 2 - T / 2, w, h2, T, mat, 0, gy + h1 + 0.4);
  addBox(x - w / 2 + T / 2, z, T, h2, d, mat, 0, gy + h1 + 0.4);
  addBox(x + w / 2 - T / 2, z, T, h2, d, mat, 0, gy + h1 + 0.4);
  // 北側は開口 (2階の射撃窓)
  addBox(x, z - d / 2 + T / 2, w, 1.1, T, mat, 0, gy + h1 + 0.4);            // 腰壁
  addBox(x, z - d / 2 + T / 2, w, h2 - 2.4, T, mat, 0, gy + h1 + 0.4 + 2.4); // 上部
  addBox(x, z, w, 0.4, d, matRoof, 0, gy + h1 + h2 + 0.4);                   // 屋根
  // 外階段 (東側から2階フロアへ)
  addStairs(x + w / 2 + 1.2, z + d / 2 - 1.4, 0, -1, 2.2, h1 + 0.4, gy);
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
}
buildTower(-50, 110);   // v0.3.3: 2倍拡張
buildTower(-80, -90);
buildTower(240, 40);
buildTower(40, -240);   // v0.3.3: 新増
buildTower(-240, 60);

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
