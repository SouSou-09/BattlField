'use strict';
/* STEEL FRONT — マップ: 道路 / 建物 / 破壊可能オブジェクト / 障害物 */

/* =========================================================
   Conquest flags — 拠点定義 (地形パッチより先に確定)
   own: 1=BLUE(プレイヤー側) / -1=RED / 0=中立
   ========================================================= */
const FLAG_R = 14;                 // 占領判定半径
// v0.8.0: 全座標1.3倍拡張 (旧値は各行コメント参照)
const flags = [
  { id: 'A', x: -325, z: -286, own: 0, cap: 0 }, // 北西の丘の上 旧:-250,-220
  { id: 'B', x: -260, z: 195, own: 0, cap: 0 },  // 南西の村 旧:-200,150
  { id: 'C', x: 0,   z: 0,   own: 0, cap: 0 },   // 中央市街地 (原点)
  { id: 'D', x: 273, z: -208, own: 0, cap: 0 },  // 北東の倉庫地区 旧:210,-160
  { id: 'E', x: 338, z: 325, own: 0, cap: 0 },   // 南東の高地基地 旧:260,250
  { id: 'F', x: 156, z: 156, own: 0, cap: 0 }    // v0.3: 湖の島 旧:120,120
];
const HQ_BLUE = { x: -442, z: 442 };   // 南西端 旧:-340,340
const HQ_RED  = { x: 442,  z: -442 };  // 北東端 旧:340,-340

// v0.8.0: 軍事基地用平地定義 (後続バージョンが参照)
// 滑走路が置ける矩形平地。両HQはマップ角にあるため外周側(WORLD境界側)には
// 220m滑走路を置く余地が無く、HQからマップ中央方向へ約90m寄せた位置に配置する。
// {x,z,rotY,w,d,flatH} — rotYは滑走路方向(長辺=滑走路長=d方向)、w=幅、d=長さ
// rotY=-π/4: 青基地の滑走路は北東(中央方向)へ向く / rotY=3π/4: 赤基地は南西(中央方向)へ向く
const MILBASE_BLUE = { x: HQ_BLUE.x + 92, z: HQ_BLUE.z - 92, rotY: -Math.PI * 0.25, w: 90, d: 220 };
const MILBASE_RED  = { x: HQ_RED.x - 92,  z: HQ_RED.z + 92,  rotY: Math.PI * 0.75, w: 90, d: 220 };
// 平地化目標高さは terrainHeight 計算前に設定するため、遅延で計算
// (MILBASES 配列は terrain.js が参照する — ここでpushする前に高さを確定)
(function _initMilbasesV080() {
  const mbList = [MILBASE_BLUE, MILBASE_RED];
  for (const mb of mbList) {
    // 基地中心の元の地形高さをサンプリングして平地高とする
    const samples = [];
    for (let sxi = -2; sxi <= 2; sxi++) {
      for (let szi = -2; szi <= 2; szi++) {
        const sx = mb.x + sxi * 18;
        const sz = mb.z + szi * 18;
        samples.push(terrainHeight(sx, sz));
      }
    }
    // 外周隆起を除外するため中央4x4の中央値採用
    samples.sort(function (a, b) { return a - b; });
    mb.flatH = samples[Math.floor(samples.length * 0.35)];
    MILBASES.push(mb);
  }
})();

// 拠点・HQ周辺を平地化
for (const f of flags) flattenAt(f.x, f.z, 22);
flattenAt(HQ_BLUE.x, HQ_BLUE.z, 20);
flattenAt(HQ_RED.x, HQ_RED.z, 20);
// v0.3: 島Fへの土手道 (水面より上に盛り土)
// v0.8.0: 1.3倍拡張 旧:bx=40〜104 / z=120
for (let bx = 52; bx <= 135; bx += 5) {
  FLATS.push([bx, 156, 5, Math.max(WATER_Y + 0.7, terrainHeight(bx, 156))]);
}

// ---------- 道路網 ----------
// v0.3.1: ROADS / onRoad の定義と地形の平滑化は terrain.js へ移動。
// ここでは実体の路面メッシュ (センターライン付きアスファルト) を敷設する。

/* ---------- Terrain mesh (ハイトフィールド) ---------- */
{
  const SEG = isMobile ? 190 : 260;   // v0.8.0: WORLD 1.3倍拡張に伴う分割数増加 旧:160/220
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
