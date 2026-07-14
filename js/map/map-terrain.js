'use strict';
/* STEEL FRONT — マップ: 道路 / 建物 / 破壊可能オブジェクト / 障害物 */

/* =========================================================
   Conquest flags — 拠点定義 (地形パッチより先に確定)
   own: 1=BLUE(プレイヤー側) / -1=RED / 0=中立
   ========================================================= */
const FLAG_R = 14;                 // 占領判定半径
// v0.9.0: gameplay markers are projections of the shared master plan.
const flags = MAP_LAYOUT.flags.map(function (f) {
  return { id: f.id, x: f.x, z: f.z, own: 0, cap: 0 };
});
const HQ_BLUE = { x: MAP_LAYOUT.hqs.blue.x, z: MAP_LAYOUT.hqs.blue.z };
const HQ_RED = { x: MAP_LAYOUT.hqs.red.x, z: MAP_LAYOUT.hqs.red.z };
const MILBASE_BLUE = Object.assign({}, MAP_LAYOUT.airbases.blue);
const MILBASE_RED = Object.assign({}, MAP_LAYOUT.airbases.red);
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
// Island causeway follows the rebuilt lake centre.
for (let bx = 54; bx <= 130; bx += 5) {
  FLATS.push([bx, MAP_LAYOUT.island.z, 5, Math.max(WATER_Y + 0.7, terrainHeight(bx, MAP_LAYOUT.island.z))]);
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
