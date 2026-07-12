'use strict';
/* STEEL FRONT — コア: デバイス判定 / three.js セットアップ / ライト */

/* =========================================================
   STEEL FRONT — Mobile 3D FPS (single file, Three.js)
   v0.2: コンクエスト(拠点占領)モード 10vs10 /
         高低差のある大型マップ (300m x 300m)
   ---------------------------------------------------------
   - 5つの占領拠点 (A〜E) + 両軍HQ
   - チケット制: 拠点過半数保持で敵チケットが減少 / 戦死で-1
   - 味方AI 9体 + 敵AI 10体 (拠点への移動・交戦・占領を行う)
   - ハイトフィールド地形 (丘・高台・外周の山) と地形追従の道路
   - 市街地 / 村 / 倉庫地区 / 監視塔 / 岩場などの地区
   ========================================================= */

// ---------- Device detection ----------
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
                 (navigator.maxTouchPoints > 1 && 'ontouchstart' in window);

document.getElementById('howto-text').innerHTML = isMobile
  ? 'A〜Eの拠点を占領してチケットで勝利せよ!(制限時間15分)<br>左画面ドラッグ:移動(前いっぱいでダッシュ)<br>右画面ドラッグ:視点 / FIRE:射撃 / AIM:エイム / JUMP:ジャンプ(空中でパラシュート開閉)<br>GRND:グレネード / WPN:武器切替 / MAP:全体マップ / 戦績:スコアボード<br>⚙ボタンで描画品質・感度の設定'
  : 'A〜Eの拠点を占領してチケットで勝利せよ!(制限時間15分)<br>WASD:移動 / マウス:視点 / 左クリック:射撃 / 右クリック:エイム<br>Shift:ダッシュ / Space:ジャンプ(空中でパラシュート開閉) / R:リロード / E:乗り物<br>G:グレネード / M:全体マップ / Tab:スコアボード / 1〜4:武器切替<br>⚙ボタンで描画品質・感度の設定';

// ---------- Core three.js setup ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.25 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFShadowMap;

// --- WebGL context-loss recovery ---
let ctxLost = false;
const ctxLostEl = document.getElementById('ctx-lost');
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  ctxLost = true;
  ctxLostEl.style.display = 'flex';
}, false);
canvas.addEventListener('webglcontextrestored', () => {
  ctxLost = false;
  ctxLostEl.style.display = 'none';
}, false);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc3d2de, 140, 520);   // v0.3.3: マップ2倍化に合わせ視程を延長

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.rotation.order = 'YXZ';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xd8e8f4, 0x50584a, 0.95));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
sun.position.set(90, 130, 45);
if (!isMobile) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 400;
}
scene.add(sun);
