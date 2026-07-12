'use strict';
/* STEEL FRONT — エフェクト(プール) / オーディオ */

/* ===== Effects — 完全プール化 ===== */
const TRACER_MAX = 40;
const tracerPool = [];
let tracerIdx = 0;
for (let i = 0; i < TRACER_MAX; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracerPool.push({ line, ttl: 0 });
}
function spawnTracer(from, to, color = 0xffe08a) {
  const t = tracerPool[tracerIdx++ % TRACER_MAX];
  const arr = t.line.geometry.attributes.position.array;
  arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
  arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.material.opacity = 0.9;
  t.line.visible = true;
  t.ttl = 0.08;
}
const particleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const pMatCache = {};
function pMat(color) {
  if (!pMatCache[color]) pMatCache[color] = new THREE.MeshBasicMaterial({ color });
  return pMatCache[color];
}
const PARTICLE_MAX = 160;
const particlePool = [];
let particleIdx = 0;
for (let i = 0; i < PARTICLE_MAX; i++) {
  const m = new THREE.Mesh(particleGeo, pMat(0xffffff));
  m.visible = false;
  scene.add(m);
  particlePool.push({ m, ttl: 0, vel: new THREE.Vector3() });
}
function spawnParticles(pos, color, count = 6, speed = 3, size = 1) {
  const mat = pMat(color);
  for (let i = 0; i < count; i++) {
    const p = particlePool[particleIdx++ % PARTICLE_MAX];
    p.m.material = mat;
    p.m.position.copy(pos);
    p.m.scale.setScalar(size * (0.7 + Math.random() * 0.8));
    p.m.visible = true;
    p.ttl = 0.4 + Math.random() * 0.25;
    p.vel.set(Math.random() - .5, Math.random() * .8, Math.random() - .5)
      .normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
  }
}
const expLights = [];
for (let i = 0; i < 3; i++) {
  const l = new THREE.PointLight(0xff9944, 0, 26);
  scene.add(l);
  expLights.push({ l, ttl: 0 });
}
let expLightIdx = 0;
function flashExplosionLight(pos) {
  const e = expLights[expLightIdx++ % expLights.length];
  e.l.position.copy(pos).y += 1;
  e.l.intensity = 5;
  e.ttl = 0.4;
}
function updateEffects(dt) {
  for (const t of tracerPool) {
    if (t.ttl > 0) {
      t.ttl -= dt;
      t.line.material.opacity = Math.max(0, t.ttl / 0.08);
      if (t.ttl <= 0) t.line.visible = false;
    }
  }
  for (const p of particlePool) {
    if (p.ttl > 0) {
      p.ttl -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.vel.y -= 9 * dt;
      if (p.ttl <= 0) p.m.visible = false;
    }
  }
  for (const e of expLights) {
    if (e.ttl > 0) {
      e.ttl -= dt;
      e.l.intensity = Math.max(0, e.ttl / 0.4 * 5);
    }
  }
}
function clearEffects() {
  for (const t of tracerPool) { t.ttl = 0; t.line.visible = false; }
  for (const p of particlePool) { p.ttl = 0; p.m.visible = false; }
  for (const e of expLights) { e.ttl = 0; e.l.intensity = 0; }
}

// ---------- Audio ----------
let AC = null, noiseBuf = null, noiseBufLong = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
  let d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBufLong = AC.createBuffer(1, AC.sampleRate * 0.8, AC.sampleRate);
  d = noiseBufLong.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && AC && AC.state === 'suspended') AC.resume();
});
function playShot(vol = 0.22, freq = 900) {
  if (!AC) return;
  const t = AC.currentTime;
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 4, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.12);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(f).connect(g).connect(AC.destination); src.start(t); src.stop(t + 0.16);
  const o = AC.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  const g2 = AC.createGain(); g2.gain.setValueAtTime(vol * 0.6, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g2).connect(AC.destination); o.start(t); o.stop(t + 0.1);
}
function playBeep(freq, dur, vol, type = 'sine') {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
function playExplosionSfx(vol = 0.5) {
  if (!AC) return;
  const t = AC.currentTime;
  const src = AC.createBufferSource(); src.buffer = noiseBufLong;
  const f = AC.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(60, t + 0.6);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  src.connect(f).connect(g).connect(AC.destination); src.start(t); src.stop(t + 0.8);
  const o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
  const g2 = AC.createGain(); g2.gain.setValueAtTime(vol * 0.9, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(g2).connect(AC.destination); o.start(t); o.stop(t + 0.6);
}
const sfx = {
  shoot: () => playShot(0.2, 1000),
  mg: () => playShot(0.16, 700),
  cannon: () => { playShot(0.4, 300); playExplosionSfx(0.25); },
  distShoot: dist => { if (dist < 90) playShot(Math.max(0.015, 0.14 - dist * 0.0015), 500); },
  hit: () => playBeep(1300, 0.05, 0.12, 'square'),
  kill: () => { playBeep(880, 0.08, 0.12); setTimeout(() => playBeep(1320, 0.12, 0.12), 70); },
  reload: () => { playBeep(400, 0.05, 0.1, 'square'); setTimeout(() => playBeep(600, 0.06, 0.1, 'square'), 250); },
  empty: () => playBeep(240, 0.05, 0.1, 'square'),
  damage: () => playBeep(110, 0.18, 0.22, 'sawtooth'),
  explosion: () => playExplosionSfx(0.5),
  enter: () => { playBeep(500, 0.06, 0.12, 'square'); setTimeout(() => playBeep(700, 0.08, 0.12, 'square'), 90); },
  capture: () => { playBeep(660, 0.1, 0.14); setTimeout(() => playBeep(880, 0.1, 0.14), 120); setTimeout(() => playBeep(1100, 0.16, 0.14), 240); },
  lost: () => { playBeep(440, 0.12, 0.14); setTimeout(() => playBeep(300, 0.18, 0.14), 140); },
  // v0.2.2
  snipe: () => { playShot(0.4, 380); playShot(0.15, 1500); },
  shotgun: () => { playShot(0.35, 500); playShot(0.2, 240); },
  headshot: () => { playBeep(1750, 0.07, 0.16, 'square'); setTimeout(() => playBeep(2300, 0.1, 0.13, 'square'), 55); },
  pin: () => playBeep(900, 0.05, 0.1, 'square'),
  pickup: () => { playBeep(760, 0.07, 0.13); setTimeout(() => playBeep(1150, 0.09, 0.13), 80); },
  // v0.3
  repair: () => playBeep(1500 + Math.random() * 600, 0.04, 0.07, 'square'),
  horn: () => { playBeep(420, 0.28, 0.22, 'sawtooth'); playBeep(530, 0.28, 0.18, 'sawtooth'); },
  rocket: () => { playShot(0.32, 260); playExplosionSfx(0.14); },
  drone: () => { playBeep(600, 0.08, 0.1, 'square'); setTimeout(() => playBeep(900, 0.1, 0.1, 'square'), 100); },
  flak: () => playShot(0.24, 480),
  flakDist: d => { if (d < 160) playShot(Math.max(0.02, 0.2 - d * 0.001), 420); },
  roadkill: () => { playBeep(180, 0.12, 0.2, 'sawtooth'); playBeep(90, 0.18, 0.2, 'square'); },
  // v0.3.1
  chute: () => { playBeep(300, 0.18, 0.12, 'sawtooth'); setTimeout(() => playBeep(200, 0.25, 0.1, 'sawtooth'), 120); },
  // v0.3.4: ガラスが割れる音
  glass: () => {
    playBeep(2400 + Math.random() * 800, 0.06, 0.14, 'square');
    setTimeout(() => playBeep(1700 + Math.random() * 600, 0.08, 0.1, 'triangle'), 40);
    setTimeout(() => playBeep(1200 + Math.random() * 400, 0.1, 0.07, 'triangle'), 100);
  }
};
let engine = null;
function startEngine(type) {
  if (!AC) return;
  stopEngine();
  const o = AC.createOscillator();
  o.type = type === 'heli' ? 'triangle' : 'sawtooth';
  o.frequency.value = type === 'heli' ? 26 : 50;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'heli' ? 500 : 320;
  const g = AC.createGain(); g.gain.value = type === 'heli' ? 0.05 : 0.035;
  o.connect(f).connect(g).connect(AC.destination);
  o.start();
  engine = { o, g, type };
}
function stopEngine() {
  if (engine) { try { engine.o.stop(); } catch (e) {} engine = null; }
}
function updateEngine(speed) {
  if (!engine) return;
  const s = Math.abs(speed);
  if (engine.type === 'heli') {
    engine.o.frequency.value = 24 + s * 1.2;
    engine.g.gain.value = 0.045 + s * 0.0015;
    return;
  }
  engine.o.frequency.value = (engine.type === 'tank' ? 38 : 52) + s * (engine.type === 'tank' ? 5 : 7);
  engine.g.gain.value = 0.03 + s * 0.0035;
}
