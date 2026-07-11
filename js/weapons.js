'use strict';
/* STEEL FRONT — プレイヤー状態 / 武器定義 / ADS / 銃モデル */

// ---------- Player state ----------
const player = {
  pos: new THREE.Vector3(HQ_BLUE.x, 1.7, HQ_BLUE.z),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, maxHp: 100,
  onGround: true,
  lastDamageTime: -99,
  radius: 0.45, eyeHeight: 1.7,
  alive: true, respawnT: 0,
  chute: false                        // v0.3.1: パラシュート展開中
};
const game = {
  score: 0, kills: 0, running: false,
  ticketsBlue: 150, ticketsRed: 150,
  bleedT: 0,
  timeLeft: 15 * 60, timerT: 0   // v0.2.3: 試合時間制限 15分
};
const MATCH_TIME = 15 * 60;

// ---------- Weapons (v0.2.2: 選択制) ----------
const WEAPONS = {
  ar:  { name: 'M4A1 CARBINE', magSize: 30, reserve: 120, fireInterval: 0.095, reloadTime: 2.1,
         dmg: 28, hsDmg: 68, baseSpread: 0.004, heatSpread: 0.02, auto: true,
         adsFov: 48, pellets: 1, range: 300, kick: 0.009 },
  smg: { name: 'MP5 SMG', magSize: 35, reserve: 175, fireInterval: 0.062, reloadTime: 1.7,
         dmg: 19, hsDmg: 46, baseSpread: 0.007, heatSpread: 0.028, auto: true,
         adsFov: 55, pellets: 1, range: 180, kick: 0.006 },
  sr:  { name: 'M24 SNIPER', magSize: 5, reserve: 30, fireInterval: 1.4, reloadTime: 3.0,
         dmg: 95, hsDmg: 200, baseSpread: 0.03, heatSpread: 0, auto: false, hipPenalty: true,
         adsFov: 16, scope: true, pellets: 1, range: 500, kick: 0.03 },
  sg:  { name: 'M870 SHOTGUN', magSize: 6, reserve: 36, fireInterval: 0.85, reloadTime: 2.8,
         dmg: 11, hsDmg: 22, baseSpread: 0.035, heatSpread: 0, auto: false,
         adsFov: 60, pellets: 8, range: 45, kick: 0.022 }
};
let curWeaponId = 'ar';
const weapon = {
  mag: 30, magSize: 30, reserve: 120,
  fireInterval: 0.095, cooldown: 0,
  reloading: false, reloadTime: 2.1, reloadTimer: 0,
  recoil: 0, spreadHeat: 0
};
function weaponDef() { return WEAPONS[curWeaponId]; }
function applyWeapon(id) {
  curWeaponId = id;
  const w = WEAPONS[id];
  Object.assign(weapon, {
    mag: w.magSize, magSize: w.magSize, reserve: w.reserve,
    fireInterval: w.fireInterval, reloadTime: w.reloadTime,
    cooldown: 0, reloading: false, reloadTimer: 0, recoil: 0, spreadHeat: 0
  });
  if (typeof ui !== 'undefined' && ui.weaponName) {
    ui.weaponName.textContent = w.name;
    updateAmmoUI();
  }
}
let firing = false;
let fireLatch = false;   // 単発武器のトリガー制御

// ---------- ADS (スコープ) v0.2.1 ----------
const ads = { active: false, t: 0 };   // t: 0=腰だめ 1=ADS (補間用)
const FOV_HIP = 75;
function setAds(on) {
  if (!player.alive) on = false;   // v0.3.3: 乗り物中もAIM可能 (ズーム)
  if (ads.active === on) return;
  ads.active = on;
  if (isMobile) {
    const b = document.getElementById('btn-aim');
    if (b) b.classList.toggle('aiming', on);
  }
}
function updateAds(dt) {
  const target = ads.active && player.alive ? 1 : 0;   // v0.3.3: 乗り物中も有効
  const prev = ads.t;
  ads.t += (target - ads.t) * Math.min(1, dt * 12);
  const w = weaponDef();
  if (Math.abs(ads.t - prev) > 0.001) {
    // v0.3.3: 乗り物中はFOVズーム (砲手照準)
    const adsFov = curVehicle ? 42 : w.adsFov;
    camera.fov = FOV_HIP + (adsFov - FOV_HIP) * ads.t;
    camera.updateProjectionMatrix();
  }
  // スナイパー: スコープオーバーレイ (v0.2.2)
  const scopeOn = w.scope && ads.t > 0.75 && !curVehicle;
  const sc = document.getElementById('scope-overlay');
  if ((sc.style.display === 'block') !== scopeOn) sc.style.display = scopeOn ? 'block' : 'none';
  gunGroup.visible = !scopeOn && !curVehicle;
  // クロスヘア縮小
  const ch = document.getElementById('crosshair');
  ch.style.opacity = (1 - ads.t * 0.6) * (scopeOn ? 0 : 1);
  ch.style.transform = `translate(-50%,-50%) scale(${1 - ads.t * 0.45})`;
}

// Gun viewmodel
const gunGroup = new THREE.Group();
{
  const gm = new THREE.MeshLambertMaterial({ color: 0x2b2f33 });
  const gm2 = new THREE.MeshLambertMaterial({ color: 0x17191c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), gm); body.position.set(0, 0, -0.1);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), gm2); barrel.position.set(0, 0.03, -0.55);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), gm2); grip.position.set(0, -0.13, 0.05);
  const magM = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.1), gm2); magM.position.set(0, -0.14, -0.15); magM.rotation.x = 0.15;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.25), gm); stock.position.set(0, -0.02, 0.28);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), gm2); sight.position.set(0, 0.1, -0.12);
  gunGroup.add(body, barrel, grip, magM, stock, sight);
}
gunGroup.position.set(0.28, -0.26, -0.55);
camera.add(gunGroup);
scene.add(camera);

// Muzzle flash
const muzzleFlash = new THREE.Mesh(
  new THREE.PlaneGeometry(0.22, 0.22),
  new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
);
muzzleFlash.position.set(0, 0.03, -0.8);
gunGroup.add(muzzleFlash);
const muzzleLight = new THREE.PointLight(0xffaa44, 0, 8);
gunGroup.add(muzzleLight);
