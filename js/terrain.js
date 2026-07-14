'use strict';
/* STEEL FRONT — 地形: ハイトフィールド / テクスチャ / 空 */

/* =========================================================
   Terrain — ハイトフィールド地形 (v0.2)
   丘・高台・外周の山を解析関数で定義し、メッシュと当たり判定
   の両方で同じ terrainHeight() を使用する
   ========================================================= */
const WORLD = 520;
const WATER_Y = -1.6;

/* =========================================================
   v0.9.0 — rebuilt map master plan
   Every large feature reads from this single plan. The previous map mixed
   scaled legacy coordinates with independently hard-coded additions, which
   caused roads, buildings and infrastructure to overlap.
   ========================================================= */
const MAP_LAYOUT = {
  hqs: { blue: { x: -410, z: 430 }, red: { x: 410, z: -430 } },
  flags: [
    { id: 'A', x: -300, z: -260 }, { id: 'B', x: -270, z: 190 },
    { id: 'C', x: 0, z: 0 }, { id: 'D', x: 270, z: -190 },
    { id: 'E', x: 300, z: 260 }, { id: 'F', x: 150, z: 150 }
  ],
  downtown: { x: 0, z: 0, half: 78 },
  lake: { x: 150, z: 150, r: 76, depth: 8 },
  island: { x: 150, z: 150, r: 20, h: 9.5 },
  airbases: {
    blue: { x: -410, z: 300, rotY: 0, w: 90, d: 220 },
    red: { x: 410, z: -300, rotY: Math.PI, w: 90, d: 220 }
  },
  river: {
    halfWidth: 14, depth: 4.5,
    path: [[-520,-120],[-350,-140],[-170,-105],[0,-135],[180,-105],[350,-140],[520,-115]],
    fords: [{ x: -430, z: -131, r: 11, h: -1.8 }, { x: 440, z: -127, r: 11, h: -1.8 }]
  },
  railway: {
    halfWidth: 5,
    path: [[-480,455],[-320,448],[-160,452],[0,455],[160,452],[320,448],[480,455]],
    station: { x: 0, z: 455, rotY: Math.PI / 2, w: 36, d: 60, platformH: 1.2 }
  },
  highway: { z: 350, deckH: 14, halfW: 6, deckX1: -300, deckX2: 380, rampX1: -360, rampX2: 440 },
  subway: {
    z: 300, platformOffset: 4,
    stations: [
      { name: '西駅', x: -330 }, { name: '中央西駅', x: -120 },
      { name: '中央東駅', x: 120 }, { name: '東駅', x: 390 }
    ]
  }
};

const MILBASES = [];
const HILLS = [
  [-300, -260, 112, 13], [300, 260, 108, 14],
  [300, -360, 82, 8], [-330, 350, 75, 7],
  [-155, 225, 56, 5], [185, -235, 54, 5],
  [-70, -390, 66, 7], [75, 395, 62, 7]
];
const LAKE = MAP_LAYOUT.lake;
const ISLAND = MAP_LAYOUT.island;
const TRENCHES = [[-112, -48, -18, -76, 4.2, 2.4], [88, -72, 122, -82, 3.4, 3.0]];
const PITS = [[130, -82, 8.5, 3.0]];
const RIVER_PATH = MAP_LAYOUT.river.path;
const RIVER_HALF_WIDTH = MAP_LAYOUT.river.halfWidth;
const RIVER_DEPTH = MAP_LAYOUT.river.depth;
function _bridgeDeckHeightV090(x, z, rotY) {
  // Sample both banks, outside the carved channel, so each bridge meets its
  // actual approach road instead of an arbitrary common elevation.
  const sx = Math.sin(rotY) * 25, sz = Math.cos(rotY) * 25;
  return Math.max(WATER_Y + 1.2,
    (terrainHeight(x - sx, z - sz) + terrainHeight(x + sx, z + sz)) / 2);
}
const RIVER_BRIDGES = [
  { x: -291.0, z: -128.5, rotY: 0.068, span: 48, width: 11, deckH: _bridgeDeckHeightV090(-291.0, -128.5, 0.068), flatR: 28 },
  { x: -129.4, z: -112.2, rotY: 0.857, span: 48, width: 11, deckH: _bridgeDeckHeightV090(-129.4, -112.2, 0.857), flatR: 28 },
  { x: 155.1, z: -109.1, rotY: 2.184, span: 48, width: 11, deckH: _bridgeDeckHeightV090(155.1, -109.1, 2.184), flatR: 28 },
  { x: 310.4, z: -131.9, rotY: 0.608, span: 48, width: 11, deckH: _bridgeDeckHeightV090(310.4, -131.9, 0.608), flatR: 28 }
];
const RIVER_FORDS = MAP_LAYOUT.river.fords;
const RAILWAY_PATH = MAP_LAYOUT.railway.path;
const RAILWAY_HALF_WIDTH = MAP_LAYOUT.railway.halfWidth;
const RAILWAY_STATION = MAP_LAYOUT.railway.station;
// v0.8.5: 川水路掘削 (線分に沿ってU字型断面で掘り下げ)
function _riverCarveV085(x, z) {
  let maxCarve = 0;
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const x1 = RIVER_PATH[i][0], z1 = RIVER_PATH[i][1];
    const x2 = RIVER_PATH[i + 1][0], z2 = RIVER_PATH[i + 1][1];
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    let t = ((x - x1) * dx + (z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, pz = z1 + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < RIVER_HALF_WIDTH) {
      const cross = 1 - d / RIVER_HALF_WIDTH;
      const carve = RIVER_DEPTH * cross * cross;
      if (carve > maxCarve) maxCarve = carve;
    }
  }
  return maxCarve;
}
function terrainHeight(x, z) {
  let h = 0;
  // 丘 (滑らかに合成)
  for (const [hx, hz, r, hh] of HILLS) {
    const d2 = (x - hx) * (x - hx) + (z - hz) * (z - hz);
    const rr = r * r;
    if (d2 < rr) {
      const t = 1 - d2 / rr;
      h += hh * t * t;               // 滑らかな山型
    }
  }
  // v0.3: 湖のくぼみ + 島
  {
    const d2 = (x - LAKE.x) * (x - LAKE.x) + (z - LAKE.z) * (z - LAKE.z);
    const rr = LAKE.r * LAKE.r;
    if (d2 < rr) { const t = 1 - d2 / rr; h -= LAKE.depth * t * t; }
    const di2 = (x - ISLAND.x) * (x - ISLAND.x) + (z - ISLAND.z) * (z - ISLAND.z);
    const ri = ISLAND.r * ISLAND.r;
    if (di2 < ri) { const t = 1 - di2 / ri; h += ISLAND.h * t * t; }
  }
  // v0.3: 塹壕 (線分に沿って掘り下げ / 両端スロープ)
  let carve = 0;
  for (const [x1, z1, x2, z2, w, dep] of TRENCHES) {
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    let t = ((x - x1) * dx + (z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, pz = z1 + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < w) {
      const cross = 1 - d / w;                     // 断面 (中心で最大)
      const len = Math.sqrt(len2);
      const ramp = Math.min(1, Math.min(t, 1 - t) * len / 5);  // 端はスロープ
      carve = Math.max(carve, dep * Math.min(1, cross * 1.6) * ramp);
    }
  }
  // v0.3: 地下壕ピット
  for (const [px, pz, r, dep] of PITS) {
    const d = Math.hypot(x - px, z - pz);
    if (d < r) {
      const t = 1 - d / r;
      carve = Math.max(carve, dep * Math.min(1, t * 2.2));
    }
  }
  h -= carve;
  // v0.8.0: 軍事基地平地 — 矩形領域を完全平坦化し外周隆起を抑制
  let mbBlend = 0, mbFlat = null;
  for (let mi = 0; mi < MILBASES.length; mi++) {
    const mb = MILBASES[mi];
    const dx = x - mb.x, dz = z - mb.z;
    const cos = Math.cos(mb.rotY), sin = Math.sin(mb.rotY);
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    const hw = mb.w / 2, hd = mb.d / 2;
    if (lx > -hw && lx < hw && lz > -hd && lz < hd) {
      const margin = 10;
      const bx = Math.min(lx + hw, hw - lx) / margin;
      const bz = Math.min(lz + hd, hd - lz) / margin;
      mbBlend = Math.min(1, Math.min(bx, bz));
      mbFlat = mb.flatH;
      break;
    }
  }
  if (mbFlat !== null) {
    h = h * (1 - mbBlend) + mbFlat * mbBlend;
  }
  // 外周の山 (プレイエリア外へ向かって上がる) — v0.8.0: 基地領域では抑制
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > WORLD - 8) h += (edge - (WORLD - 8)) * 1.4 * (1 - mbBlend);
  // 細かい起伏 (低周波ノイズ風) — 塹壕/ピット/基地内では抑える
  // v0.3.1: 振幅を低減してガタガタした高低差をなだらかに
  const noiseScale = carve > 0.5 ? 0.15 : 1;
  h += (Math.sin(x * 0.045) * Math.cos(z * 0.05) * 0.75
     + Math.sin(x * 0.11 + 3) * Math.sin(z * 0.09 + 1) * 0.32) * noiseScale * (1 - mbBlend * 0.8);
  // v0.8.5: 川水路
  h -= _riverCarveV085(x, z);
  return h;
}

/* =========================================================
   v0.3.1: 道路網 — 拠点を結ぶセグメント定義
   ・中心線の高さを事前サンプリング+平滑化し、
     道路周辺の地形をその高さへブレンド (高低差の修正)
   ・実体の道路メッシュは map.js で敷設
   ========================================================= */
const ROAD_W = 4.2;        // 路面の半幅
const ROAD_SHOULDER = 3.5; // 路肩のブレンド幅
// The roads terminate on downtown grid streets instead of cutting through blocks.
const ROADS = [
  [-410,430,-270,190], [-270,190,-78,0], [-78,0,0,0], [0,0,78,0], [78,0,270,-190], [270,-190,410,-430],
  [-300,-260,0,-78], [0,-78,0,0], [0,0,0,78], [0,78,72,235], [72,235,300,260],
  [-300,-260,-270,190], [270,-190,430,35], [430,35,300,260],
  [54,150,130,150], [-300,-260,270,-190]
];
// 中心線の高さプロファイル (6m間隔でサンプリング → 移動平均で平滑化)
const roadProfiles = ROADS.map(([x1, z1, x2, z2]) => {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(2, Math.ceil(len / 6));
  const hs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sx = x1 + (x2 - x1) * t, sz = z1 + (z2 - z1) * t;
    // 水面下には沈まない (土手道セグメント対策)
    let rh = Math.max(WATER_Y + 0.6, terrainHeight(sx, sz));
    // v0.8.5: 橋梁地点は甲板高さを適用 (水面に沈まない)
    for (let bi = 0; bi < RIVER_BRIDGES.length; bi++) {
      if (Math.hypot(sx - RIVER_BRIDGES[bi].x, sz - RIVER_BRIDGES[bi].z) < RIVER_BRIDGES[bi].flatR) {
        rh = RIVER_BRIDGES[bi].deckH;
        break;
      }
    }
    hs.push(rh);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < n; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
  }
  return { n, hs };
});
function onRoad(x, z) {
  for (const [x1, z1, x2, z2] of ROADS) {
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    let t = ((x - x1) * dx + (z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, pz = z1 + dz * t;
    if (Math.hypot(x - px, z - pz) < ROAD_W + 1.3) return true;
  }
  return false;
}
// v0.3: 水域判定
function isWater(x, z) { return terrainH(x, z) < WATER_Y - 0.25; }
function isDeepWater(x, z) { return terrainH(x, z) < WATER_Y - 1.1; }
// 道路・拠点まわりを平らに補正するための「平地パッチ」
// [x, z, 半径, 目標高さ(nullなら中心の高さ)]
const FLATS = [];
function flattenAt(x, z, r) { FLATS.push([x, z, r, terrainHeight(x, z)]); }
// v0.8.5: 橋梁・渡し場の地形平坦化 (terrainHに反映 → 歩兵/車両通行判定 + メッシュ頂点)
// 橋梁: 甲板高さで橋に沿った帯状平坦化(川は両岸に残る) / 渡し場: 浅瀬高さで平坦化(渡河可能)
for (const _rb of RIVER_BRIDGES) {
  const _bc = Math.cos(_rb.rotY), _bs = Math.sin(_rb.rotY);
  for (let _bz = -_rb.span / 2; _bz <= _rb.span / 2; _bz += 5) {
    FLATS.push([_rb.x + _bz * _bs, _rb.z + _bz * _bc, _rb.width / 2 + 2, _rb.deckH]);
  }
}
for (const _rf of RIVER_FORDS) FLATS.push([_rf.x, _rf.z, _rf.r, _rf.h]);
// Railway follows the natural terrain profile; every strip sample keeps its
// own target height, preventing the old kilometre-long 2m shelf.
for (let _ri = 0; _ri < RAILWAY_PATH.length - 1; _ri++) {
  const _rx1 = RAILWAY_PATH[_ri][0], _rz1 = RAILWAY_PATH[_ri][1];
  const _rx2 = RAILWAY_PATH[_ri + 1][0], _rz2 = RAILWAY_PATH[_ri + 1][1];
  const _rdx = _rx2 - _rx1, _rdz = _rz2 - _rz1;
  const _rlen = Math.hypot(_rdx, _rdz);
  const _rc = _rdx / _rlen, _rs = _rdz / _rlen;
  for (let _rt = 0; _rt <= _rlen; _rt += 5) {
    const _x = _rx1 + _rc * _rt, _z = _rz1 + _rs * _rt;
    FLATS.push([_x, _z, RAILWAY_HALF_WIDTH, terrainHeight(_x, _z)]);
  }
}
{
  const _sc = Math.cos(RAILWAY_STATION.rotY), _ss = Math.sin(RAILWAY_STATION.rotY);
  const _stationH = terrainHeight(RAILWAY_STATION.x, RAILWAY_STATION.z);
  RAILWAY_STATION.flatH = _stationH;
  for (let _sx = -RAILWAY_STATION.w / 2; _sx <= RAILWAY_STATION.w / 2; _sx += 6) {
    for (let _sz = -RAILWAY_STATION.d / 2; _sz <= RAILWAY_STATION.d / 2; _sz += 6) {
      FLATS.push([RAILWAY_STATION.x + _sx * _sc + _sz * _ss, RAILWAY_STATION.z - _sx * _ss + _sz * _sc, 4.5, _stationH]);
    }
  }
}
// Each subway station is level locally, but stations no longer force unrelated
// parts of the map to one arbitrary global elevation.
for (const _subS of MAP_LAYOUT.subway.stations) {
  const _stationH = terrainHeight(_subS.x, MAP_LAYOUT.subway.z);
  for (let _sx = -12; _sx <= 12; _sx += 5) {
    for (let _sz = -9; _sz <= 9; _sz += 5) {
      FLATS.push([_subS.x + _sx, MAP_LAYOUT.subway.z + _sz, 5, _stationH]);
    }
  }
}
function terrainH(x, z) {
  let h = terrainHeight(x, z);
  for (const [fx, fz, fr, fh] of FLATS) {
    const d = Math.hypot(x - fx, z - fz);
    if (d < fr) {
      const t = Math.min(1, (fr - d) / (fr * 0.45)); // 端はブレンド
      h = h * (1 - t) + fh * t;
    }
  }
  // v0.3.1: 道路に沿って平滑化された中心線高さへブレンド
  for (let ri = 0; ri < ROADS.length; ri++) {
    const [x1, z1, x2, z2] = ROADS[ri];
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    let t = ((x - x1) * dx + (z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, pz = z1 + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < ROAD_W + ROAD_SHOULDER) {
      const prof = roadProfiles[ri];
      const ft = t * prof.n;
      const i0 = Math.min(prof.n - 1, Math.floor(ft));
      const rh = prof.hs[i0] + (prof.hs[i0 + 1] - prof.hs[i0]) * (ft - i0);
      const blend = d < ROAD_W ? 1 : 1 - (d - ROAD_W) / ROAD_SHOULDER;
      h = h * (1 - blend) + rh * blend;
    }
  }
  return h;
}

function _distanceToPathV090(x, z, path) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const x1 = path[i][0], z1 = path[i][1], x2 = path[i + 1][0], z2 = path[i + 1][1];
    const dx = x2 - x1, dz = z2 - z1;
    let t = ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz);
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)));
  }
  return best;
}

// Shared exclusion test for procedural props. It keeps later decoration from
// being generated on runways, rails, stations, ramps or subway entrances.
function isInfrastructureReserved(x, z, margin = 0) {
  for (const mb of [MAP_LAYOUT.airbases.blue, MAP_LAYOUT.airbases.red]) {
    const dx = x - mb.x, dz = z - mb.z, c = Math.cos(mb.rotY), s = Math.sin(mb.rotY);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    if (Math.abs(lx) < mb.w / 2 + margin && Math.abs(lz) < mb.d / 2 + margin) return true;
  }
  if (_distanceToPathV090(x, z, RAILWAY_PATH) < RAILWAY_HALF_WIDTH + 5 + margin) return true;
  const hw = MAP_LAYOUT.highway;
  if (x > hw.rampX1 - margin && x < hw.rampX2 + margin && Math.abs(z - hw.z) < hw.halfW + 6 + margin) return true;
  for (const st of MAP_LAYOUT.subway.stations) {
    if (Math.abs(x - st.x) < 15 + margin && Math.abs(z - MAP_LAYOUT.subway.z) < 12 + margin) return true;
  }
  return false;
}

// ---------- Procedural textures ----------
function makeCanvasTexture(size, painter, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}
const groundTex = makeCanvasTexture(256, (g, s) => {
  g.fillStyle = '#6f6d54'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${70 + Math.random() * 50 | 0},${78 + Math.random() * 45 | 0},${45 + Math.random() * 35 | 0},.55)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  for (let i = 0; i < 28; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 18;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(84,110,58,.55)'); gr.addColorStop(1, 'rgba(84,110,58,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}, 56, 56);
const roadTex = makeCanvasTexture(256, (g, s) => {
  g.fillStyle = '#3c3e42'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${50 + Math.random() * 40 | 0},${52 + Math.random() * 40 | 0},${55 + Math.random() * 40 | 0},.4)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  g.fillStyle = 'rgba(230,220,180,.85)';
  for (let x = 8; x < s; x += 64) g.fillRect(x, s / 2 - 3, 34, 6);
  g.fillStyle = 'rgba(220,220,220,.5)';
  g.fillRect(0, 8, s, 4); g.fillRect(0, s - 12, s, 4);
}, 1, 1);
// v0.3.4: リアルなファサード — 高解像度化 / 雨だれ汚れ / 階の帯 /
//         窓台・十字桟・空の映り込み / 室外機 / 1F店構え / 基礎帯
function facadeTex(base, winLit) {
  return makeCanvasTexture(512, (g, s) => {
    // ベース + コンクリートのむら
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(0,0,0,${(0.02 + Math.random() * 0.05).toFixed(3)})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 5, 2 + Math.random() * 5);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${(0.02 + Math.random() * 0.04).toFixed(3)})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    // 縦の雨だれ汚れ
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s, w = 2 + Math.random() * 6, h = 40 + Math.random() * 170;
      const y = Math.random() * s * 0.5;
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, 'rgba(28,28,26,.18)'); gr.addColorStop(1, 'rgba(28,28,26,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    // 階の帯 (フロアライン)
    for (let y = 104; y < s - 40; y += 104) {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y - 3, s, 5);
      g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(0, y + 2, s, 2);
    }
    // 窓 (額縁 + グラデガラス + 十字桟 + 窓台 + 点灯ばらつき)
    for (let y = 24; y < s - 66; y += 104) {
      for (let x = 20; x < s - 56; x += 76) {
        g.fillStyle = 'rgba(18,20,22,.85)'; g.fillRect(x - 4, y - 4, 52, 66);
        const lit = Math.random() < winLit;
        const gg = g.createLinearGradient(x, y, x + 44, y + 58);
        if (lit) { gg.addColorStop(0, 'rgba(255,240,180,.95)'); gg.addColorStop(1, 'rgba(222,182,112,.85)'); }
        else {
          gg.addColorStop(0, 'rgba(58,78,98,.95)');
          gg.addColorStop(0.5, 'rgba(128,158,184,.9)');
          gg.addColorStop(1, 'rgba(40,55,70,.95)');
        }
        g.fillStyle = gg; g.fillRect(x, y, 44, 58);
        g.fillStyle = 'rgba(22,25,28,.8)';
        g.fillRect(x + 20, y, 4, 58); g.fillRect(x, y + 27, 44, 4);
        g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x, y, 44, 10);
        // 窓台
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 6, y + 58, 56, 6);
        g.fillStyle = 'rgba(210,210,205,.4)'; g.fillRect(x - 6, y + 56, 56, 3);
        // たまに室外機
        if (Math.random() < 0.15) {
          g.fillStyle = 'rgba(188,193,196,.9)'; g.fillRect(x + 8, y + 40, 26, 16);
          g.fillStyle = 'rgba(88,93,96,.9)'; g.fillRect(x + 10, y + 43, 22, 3);
          g.fillRect(x + 10, y + 49, 22, 3);
        }
      }
    }
    // 1F: 店構え風の暗い帯 + 基礎
    g.fillStyle = 'rgba(18,20,25,.45)'; g.fillRect(0, s - 62, s, 62);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, s - 62, s, 4);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, s - 14, s, 14);
  }, 2, 2);
}
const buildingTexA = facadeTex('#8f8d84', 0.28);
const buildingTexB = facadeTex('#7c8894', 0.2);
const buildingTexC = facadeTex('#9a8f7c', 0.35);
const brickTex = makeCanvasTexture(128, (g, s) => {
  g.fillStyle = '#8a5a44'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(60,35,25,.7)'; g.lineWidth = 2;
  for (let y = 0; y < s; y += 16) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    const off = (y / 16) % 2 ? 16 : 0;
    for (let x = off; x < s; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
  }
}, 3, 2);
const containerTex = makeCanvasTexture(128, (g, s) => {
  g.fillStyle = '#7d3b2c'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3;
  for (let x = 8; x < s; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
}, 2, 1);
const crateTex = makeCanvasTexture(128, (g, s) => {
  g.fillStyle = '#8a6b3f'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(60,40,15,.8)'; g.lineWidth = 6;
  g.strokeRect(4, 4, s - 8, s - 8);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(s - 4, s - 4); g.moveTo(s - 4, 4); g.lineTo(4, s - 4); g.stroke();
});

// ---------- Sky / 遠景 (v0.3.2: リアルな空 — 大気散乱風グラデ + 太陽方向の輝き + 多層雲 + 霞) ----------
{
  // 空: 512pxグラデ + 太陽方向のグロー + 地平線の暖色帯 (大気散乱の近似)
  const skyTexC = document.createElement('canvas');
  skyTexC.width = 256; skyTexC.height = 512;
  const sg = skyTexC.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2a5490');       // 天頂: 深い青
  grad.addColorStop(0.3, '#4a7cb5');
  grad.addColorStop(0.55, '#8db4d4');
  grad.addColorStop(0.75, '#c8dbe8');    // 地平線付近: 明るく白む
  grad.addColorStop(0.87, '#e6ded2');    // 地平線: 暖色の霞
  grad.addColorStop(1, '#d9d5ca');
  sg.fillStyle = grad; sg.fillRect(0, 0, 256, 512);
  // 太陽方向 (テクスチャU≒太陽方位) の輝き
  const sunU = 256 * (0.5 + Math.atan2(150, 290) / (Math.PI * 2));
  const glowG = sg.createRadialGradient(sunU, 160, 0, sunU, 160, 240);
  glowG.addColorStop(0, 'rgba(255,244,214,.5)');
  glowG.addColorStop(0.4, 'rgba(255,236,190,.18)');
  glowG.addColorStop(1, 'rgba(255,236,190,0)');
  sg.fillStyle = glowG; sg.fillRect(0, 0, 256, 512);
  const skyTex = new THREE.CanvasTexture(skyTexC);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 24, 18),   // v0.3.3: マップ2倍化に合わせ拡大
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // 雲テクスチャ: 複数の重なった塊 + 底面に影 (立体感)
  function makeCloudTex(puffs, flat) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < puffs; i++) {
      const x = 30 + Math.random() * 196;
      const y = flat ? 60 + Math.random() * 20 : 34 + Math.random() * 46;
      const r = (flat ? 26 : 14) + Math.random() * (flat ? 36 : 26);
      // 影 (下側にグレー)
      const sh = g.createRadialGradient(x, y + r * 0.35, 0, x, y + r * 0.35, r);
      sh.addColorStop(0, 'rgba(150,160,175,.35)'); sh.addColorStop(1, 'rgba(150,160,175,0)');
      g.fillStyle = sh; g.beginPath(); g.arc(x, y + r * 0.35, r, 0, 7); g.fill();
      // ハイライト (上側に白)
      const rg = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,.95)');
      rg.addColorStop(0.55, 'rgba(250,250,252,.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    return new THREE.CanvasTexture(c);
  }
  const cumulusTex = makeCloudTex(16, false);   // 積雲 (もこもこ)
  const stratusTex = makeCloudTex(10, true);    // 層雲 (横に平たい)

  // 低層の積雲 (大きめ・はっきり)
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cumulusTex, transparent: true,
      opacity: 0.6 + Math.random() * 0.3, fog: false, depthWrite: false
    }));
    const a = Math.random() * Math.PI * 2, r = 350 + Math.random() * 450;
    sp.position.set(Math.cos(a) * r, 160 + Math.random() * 110, Math.sin(a) * r);
    sp.scale.set(200 + Math.random() * 180, 90 + Math.random() * 60, 1);
    scene.add(sp);
  }
  // 高層の巻層雲 (薄く・大きく・高い)
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: stratusTex, transparent: true,
      opacity: 0.18 + Math.random() * 0.16, fog: false, depthWrite: false
    }));
    const a = Math.random() * Math.PI * 2, r = 300 + Math.random() * 500;
    sp.position.set(Math.cos(a) * r, 380 + Math.random() * 180, Math.sin(a) * r);
    sp.scale.set(420 + Math.random() * 300, 140 + Math.random() * 80, 1);
    scene.add(sp);
  }

  // 太陽: コア + 広いハロー (2枚重ね)
  const sunC = document.createElement('canvas');
  sunC.width = sunC.height = 128;
  const sc = sunC.getContext('2d');
  const srg = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
  srg.addColorStop(0, 'rgba(255,253,240,1)');
  srg.addColorStop(0.12, 'rgba(255,248,215,.95)');
  srg.addColorStop(0.3, 'rgba(255,235,170,.5)');
  srg.addColorStop(1, 'rgba(255,220,140,0)');
  sc.fillStyle = srg; sc.fillRect(0, 0, 128, 128);
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunC), transparent: true, fog: false, depthWrite: false }));
  sunSp.position.set(580, 800, 300);   // v0.3.3: 拡大
  sunSp.scale.set(260, 260, 1);
  scene.add(sunSp);
  const haloC = document.createElement('canvas');
  haloC.width = haloC.height = 128;
  const hc = haloC.getContext('2d');
  const hrg = hc.createRadialGradient(64, 64, 0, 64, 64, 64);
  hrg.addColorStop(0, 'rgba(255,240,200,.35)');
  hrg.addColorStop(0.5, 'rgba(255,235,190,.12)');
  hrg.addColorStop(1, 'rgba(255,235,190,0)');
  hc.fillStyle = hrg; hc.fillRect(0, 0, 128, 128);
  const haloSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloC), transparent: true, fog: false, depthWrite: false }));
  haloSp.position.set(580, 800, 300);
  haloSp.scale.set(840, 840, 1);
  scene.add(haloSp);

  // 遠景の山並み: 2層 (奥=霞んだ色 / 手前=濃い色) で空気遠近感
  const mtnFar = new THREE.MeshBasicMaterial({ color: 0x93a6b8, fog: false });
  const mtnMat = new THREE.MeshBasicMaterial({ color: 0x5f7488 });
  const mtnMat2 = new THREE.MeshBasicMaterial({ color: 0x6d8296 });
  for (let i = 0; i < 20; i++) {   // 奥の山脈 (大きく淡い) v0.3.3: マップ外へ拡大
    const a = (i / 20) * Math.PI * 2 + Math.random() * 0.25;
    const r = 850 + Math.random() * 120;
    const h = 160 + Math.random() * 190;
    const m = new THREE.Mesh(new THREE.ConeGeometry(160 + Math.random() * 120, h, 5), mtnFar);
    m.position.set(Math.cos(a) * r, h / 2 - 15, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
  }
  for (let i = 0; i < 26; i++) {   // 手前の山並み (v0.3.3: マップ外へ拡大)
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    const r = 640 + Math.random() * 130;
    const h = 100 + Math.random() * 150;
    const m = new THREE.Mesh(new THREE.ConeGeometry(110 + Math.random() * 100, h, 5), i % 2 ? mtnMat : mtnMat2);
    m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
  }
  // 地平線の霞リング (地面と山の境界を柔らかく)
  const hazeC = document.createElement('canvas');
  hazeC.width = 32; hazeC.height = 64;
  const hzg = hazeC.getContext('2d');
  const hgrad = hzg.createLinearGradient(0, 0, 0, 64);
  hgrad.addColorStop(0, 'rgba(216,222,226,0)');
  hgrad.addColorStop(0.55, 'rgba(216,222,226,.55)');
  hgrad.addColorStop(1, 'rgba(210,214,216,.8)');
  hzg.fillStyle = hgrad; hzg.fillRect(0, 0, 32, 64);
  const hazeTex = new THREE.CanvasTexture(hazeC);
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(620, 620, 150, 32, 1, true),   // v0.3.3: マップ外へ拡大
    new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false })
  );
  haze.position.y = 45;
  scene.add(haze);
}
