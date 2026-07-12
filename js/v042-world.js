'use strict';
/* v0.4.2 — 戦略地形、隠密、環境音、蓄積する戦闘痕 */

const v042 = {
  bridges: [], tunnels: [], bushes: [], scars: [], scarCursor: 0,
  tunnelCooldown: 0, ambientT: 0, birdT: 6, wind: null
};

function makeBridge(x, z, length, yaw) {
  const group = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x675643 });
  const steelMat = new THREE.MeshLambertMaterial({ color: 0x3d4548 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 0.55, length), deckMat);
  deck.position.y = 0.25;
  group.add(deck);
  for (const sx of [-3.1, 3.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, length), steelMat);
    rail.position.set(sx, 0.95, 0); group.add(rail);
  }
  for (let z0 = -length / 2 + 2; z0 < length / 2; z0 += 4) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 0.18), steelMat);
    beam.position.set(0, 0.65, z0); group.add(beam);
  }
  group.position.set(x, WATER_Y + 1.25, z);
  group.rotation.y = yaw;
  scene.add(group);
  const alongX = Math.abs(Math.sin(yaw)) > 0.7;
  const ob = {
    minX: x - (alongX ? length : 7) / 2, maxX: x + (alongX ? length : 7) / 2,
    minZ: z - (alongX ? 7 : length) / 2, maxZ: z + (alongX ? 7 : length) / 2,
    y0: WATER_Y - 4, h: WATER_Y + 0.4
  };
  const bridge = { group, deck, ob, hp: 360, hp0: 360, destroyed: false, x, z };
  deck.userData.bridge = bridge;
  solidMeshes.push(deck);
  v042.bridges.push(bridge);
  return bridge;
}

function damageBridge(bridge, amount) {
  if (!bridge || bridge.destroyed) return;
  bridge.hp -= amount;
  spawnParticles(bridge.group.position.clone(), 0x8c785e, 5, 4, 2);
  if (bridge.hp > 0) return;
  bridge.destroyed = true;
  bridge.group.rotation.z = 0.22;
  bridge.group.position.y -= 2.2;
  const si = solidMeshes.indexOf(bridge.deck); if (si >= 0) solidMeshes.splice(si, 1);
  addFeed('橋が破壊された — ボートか迂回路を確保せよ', 'red');
  addBattleScar(bridge.group.position, 'scorch', 5);
}

function createTunnelNetwork() {
  const points = [
    { x: -205, z: 142, to: 1, name: 'B地下入口' },
    { x: -12, z: 12, to: 0, name: 'C地下入口' },
    { x: 108, z: -55, to: 3, name: '地下壕' },
    { x: 204, z: -151, to: 2, name: 'D地下入口' }
  ];
  const concrete = new THREE.MeshLambertMaterial({ color: 0x555b58 });
  for (const p of points) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.26, 8, 16, Math.PI), concrete);
    ring.rotation.z = Math.PI; ring.position.y = 1.35;
    const dark = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0x080a09 }));
    dark.position.set(0, 1.3, 0.08);
    g.add(dark, ring); g.position.set(p.x, terrainH(p.x, p.z), p.z); scene.add(g);
    v042.tunnels.push({ ...p, group: g });
  }
}

function createBushes() {
  const leaf = new THREE.MeshLambertMaterial({ color: 0x345b2d, transparent: true, opacity: 0.92 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const centers = [[-242,-205],[-216,128],[-35,24],[22,-16],[185,-140],[244,228],[82,92],[154,153],[-115,170]];
  for (const [cx, cz] of centers) {
    for (let i = 0; i < 5; i++) {
      const x = cx + (Math.random() - .5) * 12, z = cz + (Math.random() - .5) * 12;
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(geo, leaf);
        m.position.set((k - 1) * 0.8, 0.7 + Math.random() * 0.5, (Math.random() - .5) * 1.2);
        m.scale.set(1.3, 1.0, 1.3); g.add(m);
      }
      g.position.set(x, terrainH(x, z), z); scene.add(g);
      v042.bushes.push({ x, z, r: 2.5, group: g });
    }
  }
}

function playerConcealment() {
  if (player.stance !== 2) return 0;
  for (const b of v042.bushes) if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < b.r) return 0.65;
  return 0;
}

const scarGeo = new THREE.CircleGeometry(1, 12);
scarGeo.rotateX(-Math.PI / 2);
function addBattleScar(pos, type = 'bullet', size = 0.18) {
  let scar = v042.scars[v042.scarCursor++ % 140];
  if (!scar) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x211b17, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const mesh = new THREE.Mesh(scarGeo, mat); scene.add(mesh);
    scar = { mesh }; v042.scars.push(scar);
  }
  scar.mesh.visible = true;
  scar.mesh.material.color.setHex(type === 'crater' ? 0x2b251f : type === 'scorch' ? 0x171513 : 0x24211e);
  scar.mesh.position.set(pos.x, terrainH(pos.x, pos.z) + 0.035, pos.z);
  scar.mesh.scale.setScalar(size);
  scar.mesh.rotation.z = Math.random() * Math.PI;
}

function addBulletHole(point) { addBattleScar(point, 'bullet', 0.12 + Math.random() * 0.08); }

function initV042() {
  if (!v042.bridges.length) {
    makeBridge(120, 61, 24, 0);
    makeBridge(174, 120, 22, Math.PI / 2);
    createTunnelNetwork(); createBushes();
  }
  resetV042();
}
function resetV042() {
  for (const b of v042.bridges) {
    if (b.destroyed && !solidMeshes.includes(b.deck)) solidMeshes.push(b.deck);
    b.destroyed = false; b.hp = b.hp0; b.group.rotation.z = 0; b.group.position.y = WATER_Y + 1.25;
  }
  for (const s of v042.scars) s.mesh.visible = false;
  v042.scarCursor = 0; v042.tunnelCooldown = 0;
}

function initAmbientSound() {
  if (!AC || v042.wind) return;
  const src = AC.createBufferSource(); src.buffer = noiseBufLong; src.loop = true;
  const filter = AC.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 480;
  const gain = AC.createGain(); gain.gain.value = 0.018;
  src.connect(filter).connect(gain).connect(AC.destination); src.start();
  v042.wind = { src, gain, filter };
}
function playBird() {
  if (!AC) return;
  const t = AC.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(1650 + i * 180, t + i * .11);
    o.frequency.exponentialRampToValueAtTime(2250 + i * 120, t + i * .11 + .08);
    g.gain.setValueAtTime(.0001, t + i * .11); g.gain.linearRampToValueAtTime(.025, t + i * .11 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + i * .11 + .1);
    o.connect(g).connect(AC.destination); o.start(t + i * .11); o.stop(t + i * .11 + .12);
  }
}
function updateV042(dt) {
  v042.tunnelCooldown = Math.max(0, v042.tunnelCooldown - dt);
  if (player.alive && !curVehicle && v042.tunnelCooldown <= 0 && keys['KeyE']) {
    for (let i = 0; i < v042.tunnels.length; i++) {
      const a = v042.tunnels[i];
      if (Math.hypot(player.pos.x - a.x, player.pos.z - a.z) < 2.2) {
        const b = v042.tunnels[a.to];
        player.pos.set(b.x, terrainH(b.x, b.z) + player.eyeHeight, b.z);
        v042.tunnelCooldown = 1.2; addFeed(`${a.name} → ${b.name} (地下ルート)`, 'blue'); break;
      }
    }
  }
  if (playerConcealment() > 0) ui.stanceInd.textContent = '伏せ / 茂みに隠密中';
  v042.birdT -= dt;
  if (v042.birdT <= 0) { v042.birdT = 12 + Math.random() * 15; playBird(); }
  if (v042.wind && player.alive) {
    const indoor = obstacles.some(o => player.pos.x > o.minX && player.pos.x < o.maxX && player.pos.z > o.minZ && player.pos.z < o.maxZ && player.pos.y < o.h);
    v042.wind.gain.gain.value += ((indoor ? .006 : .018) - v042.wind.gain.gain.value) * Math.min(1, dt * 2);
  }
}

function damageStrategicWorld(pos, radius, dmg) {
  addBattleScar(pos, 'crater', Math.min(6, Math.max(1.8, radius * .55)));
  for (const b of v042.bridges) if (!b.destroyed && b.group.position.distanceTo(pos) < radius + 5) damageBridge(b, dmg);
}
