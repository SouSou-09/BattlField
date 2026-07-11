'use strict';
/* STEEL FRONT — 地形: ハイトフィールド / テクスチャ / 空 */

/* =========================================================
   Terrain — ハイトフィールド地形 (v0.2)
   丘・高台・外周の山を解析関数で定義し、メッシュと当たり判定
   の両方で同じ terrainHeight() を使用する
   ========================================================= */
const WORLD = 150;                 // playable half-size (300m x 300m)

// なだらかな丘 (ガウス型) の定義 [x, z, 半径, 高さ]
const HILLS = [
  [-95, -85, 55, 14],    // 北西の大きな丘 (拠点A)
  [100, 95, 60, 16],     // 南東の高地 (拠点E)
  [95, -100, 45, 10],    // 北東の丘
  [-100, 105, 42, 9],    // 南西の丘
  [0, 0, 30, 5],         // 中央のゆるい盛り上がり (拠点C)
  [-45, 60, 25, 6],      // 南西寄りの小丘
  [55, -50, 22, 5]       // 北東寄りの小丘
];
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
  // 外周の山 (プレイエリア外へ向かって上がる)
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > WORLD - 8) h += (edge - (WORLD - 8)) * 1.4;
  // 細かい起伏 (低周波ノイズ風)
  h += Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.1
     + Math.sin(x * 0.11 + 3) * Math.sin(z * 0.09 + 1) * 0.5;
  return h;
}
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

// ---------- Sky / 遠景 ----------
{
  const skyTexC = document.createElement('canvas');
  skyTexC.width = 32; skyTexC.height = 256;
  const sg = skyTexC.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3e6da0');
  grad.addColorStop(0.45, '#7fa8c9');
  grad.addColorStop(0.72, '#c3d2de');
  grad.addColorStop(1, '#d9e2e6');
  sg.fillStyle = grad; sg.fillRect(0, 0, 32, 256);
  const skyTex = new THREE.CanvasTexture(skyTexC);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 20, 14),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const cloudC = document.createElement('canvas');
  cloudC.width = 128; cloudC.height = 64;
  const cg = cloudC.getContext('2d');
  for (let i = 0; i < 10; i++) {
    const x = 20 + Math.random() * 88, y = 22 + Math.random() * 22, r = 10 + Math.random() * 16;
    const rg = cg.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = rg; cg.beginPath(); cg.arc(x, y, r, 0, 7); cg.fill();
  }
  const cloudTex = new THREE.CanvasTexture(cloudC);
  for (let i = 0; i < 11; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55 + Math.random() * 0.3, fog: false, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, r = 230 + Math.random() * 260;
    sp.position.set(Math.cos(a) * r, 130 + Math.random() * 90, Math.sin(a) * r);
    sp.scale.set(110 + Math.random() * 100, 50 + Math.random() * 36, 1);
    scene.add(sp);
  }

  const sunC = document.createElement('canvas');
  sunC.width = sunC.height = 64;
  const sc = sunC.getContext('2d');
  const srg = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
  srg.addColorStop(0, 'rgba(255,250,220,1)'); srg.addColorStop(0.3, 'rgba(255,235,170,.8)'); srg.addColorStop(1, 'rgba(255,220,140,0)');
  sc.fillStyle = srg; sc.fillRect(0, 0, 64, 64);
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunC), transparent: true, fog: false, depthWrite: false }));
  sunSp.position.set(290, 400, 150);
  sunSp.scale.set(150, 150, 1);
  scene.add(sunSp);

  // 遠景の山並み
  const mtnMat = new THREE.MeshBasicMaterial({ color: 0x5f7488 });
  const mtnMat2 = new THREE.MeshBasicMaterial({ color: 0x6d8296 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    const r = 340 + Math.random() * 70;
    const h = 55 + Math.random() * 85;
    const m = new THREE.Mesh(new THREE.ConeGeometry(60 + Math.random() * 55, h, 5), i % 2 ? mtnMat : mtnMat2);
    m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
  }
}
