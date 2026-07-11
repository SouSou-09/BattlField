'use strict';
/* STEEL FRONT — 地形: ハイトフィールド / テクスチャ / 空 */

/* =========================================================
   Terrain — ハイトフィールド地形 (v0.2)
   丘・高台・外周の山を解析関数で定義し、メッシュと当たり判定
   の両方で同じ terrainHeight() を使用する
   ========================================================= */
const WORLD = 400;                 // v0.3.3: playable half-size 2倍拡張 (800m x 800m)
const WATER_Y = -1.6;              // v0.3: 水面の高さ

// なだらかな丘 (ガウス型) の定義 [x, z, 半径, 高さ]
const HILLS = [
  [-250, -220, 95, 14],  // 北西の大きな丘 (拠点A) v0.3.3: 座標/半径2倍拡張
  [260, 250, 100, 16],   // 南東の高地 (拠点E)
  [250, -270, 75, 10],   // 北東の丘
  [-270, 280, 70, 9],    // 南西の丘
  [0, 0, 45, 5],         // 中央のゆるい盛り上がり (拠点C)
  [-120, 164, 42, 6],    // 南西寄りの小丘
  [144, -136, 38, 5],    // 北東寄りの小丘
  [-40, -280, 55, 8],    // v0.3.3: 北側の新丘
  [-280, -40, 50, 7],    // v0.3.3: 西側の新丘
  [60, 300, 55, 9],      // v0.3.3: 南側の新丘
  [300, 60, 48, 7]       // v0.3.3: 東側の新丘
];
// v0.3: 湖 (くぼ地) と島 [x, z, 半径, 深さ] / 島は湖中央の盛り上がり
const LAKE = { x: 120, z: 120, r: 62, depth: 8 };   // v0.3.3: 2倍拡張
const ISLAND = { x: 120, z: 120, r: 16, h: 9.5 };
// v0.3: 塹壕 [x1,z1,x2,z2,幅,深さ] — 両端はスロープで地上に接続
const TRENCHES = [
  [-90, -30, 30, -16, 3.2, 2.4],     // 中央北の塹壕 (A-C間)
  [64, -60, 92, -60, 2.6, 3.0]      // 地下壕への進入路
];
// v0.3: 地下壕ピット [x, z, 半径, 深さ] — 上に屋根スラブを被せて地下室化
const PITS = [[100, -60, 6.5, 3.0]];   // v0.3.3: 2倍拡張
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
  // 外周の山 (プレイエリア外へ向かって上がる)
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > WORLD - 8) h += (edge - (WORLD - 8)) * 1.4;
  // 細かい起伏 (低周波ノイズ風) — 塹壕/ピット内では抑える
  // v0.3.1: 振幅を低減してガタガタした高低差をなだらかに
  const noiseScale = carve > 0.5 ? 0.15 : 1;
  h += (Math.sin(x * 0.045) * Math.cos(z * 0.05) * 0.75
     + Math.sin(x * 0.11 + 3) * Math.sin(z * 0.09 + 1) * 0.32) * noiseScale;
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
// [x1,z1,x2,z2] — HQ青(-170,170) / HQ赤(170,-170) / 拠点A〜Fを接続
const ROADS = [
  [-340, 340, -200, 150],   // 青HQ → B (v0.3.3: 2倍拡張)
  [-200, 150, 0, 0],        // B → C
  [0, 0, 210, -160],        // C → D
  [210, -160, 340, -340],   // D → 赤HQ
  [-250, -220, 0, 0],       // A → C
  [0, 0, 60, 230],          // C → (湖の南) → E
  [60, 230, 260, 250],
  [-250, -220, -200, 150],  // A → B
  [210, -160, 320, 30],     // D → (湖の東) → E
  [320, 30, 260, 250],
  [40, 120, 100, 120],      // 土手道 → 島F
  [-250, -220, 210, -160]   // v0.3.1: 北側の幹線 (A → D)
];
// 中心線の高さプロファイル (6m間隔でサンプリング → 移動平均で平滑化)
const roadProfiles = ROADS.map(([x1, z1, x2, z2]) => {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(2, Math.ceil(len / 6));
  const hs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 水面下には沈まない (土手道セグメント対策)
    hs.push(Math.max(WATER_Y + 0.6, terrainHeight(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)));
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
function facadeTex(base, winLit) {
  return makeCanvasTexture(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 250; i++) {
      g.fillStyle = 'rgba(0,0,0,.06)';
      g.fillRect(Math.random() * s, Math.random() * s, 3, 3);
    }
    for (let y = 20; y < s - 30; y += 52) {
      for (let x = 16; x < s - 30; x += 46) {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 2, y - 2, 32, 40);
        g.fillStyle = Math.random() < winLit ? 'rgba(255,238,170,.75)' : 'rgba(28,40,52,.9)';
        g.fillRect(x, y, 28, 36);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, 28, 8);
      }
    }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, s - 12, s, 12);
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
