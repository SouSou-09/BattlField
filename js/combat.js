'use strict';
/* STEEL FRONT — 戦闘: 衝突 / 射撃 / グレネード / ピックアップ / 被弾 */

// ---------- Collision helpers (地形の高さ考慮) ----------
// yRef: 判定する足元の高さ。obstacle の上面より十分高ければ通れる(=段の上に乗れる)
function collidesAt(x, z, r, yRef, skipVehicle = null) {
  if (x < -WORLD || x > WORLD || z < -WORLD || z > WORLD) return true;
  for (const o of obstacles) {
    if (x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ) {
      // 足元がオブジェクト上面近く以上なら乗り越え可能
      if (yRef !== undefined && yRef > o.h - 0.4) continue;
      // v0.2.3: オブジェクトの下をくぐれる (ドアのまぐさなど、底面が高い障害物)
      if (yRef !== undefined && yRef + 1.9 < o.y0) continue;
      return true;
    }
  }
  for (const v of vehicles) {
    if (v === skipVehicle) continue;
    const dx = x - v.obj.position.x, dz = z - v.obj.position.z;
    if (dx * dx + dz * dz < (r + v.radius) * (r + v.radius)) return true;
  }
  return false;
}
// v0.3.1: 足元の接地高さ — 地形に加えて、乗れる高さの障害物上面も地面として扱う
// (ジャンプで乗り越えた障害物の上に立てる / 階段・屋上の接地も正確に)
function groundHeightAt(x, z, r, yRef) {
  let g = terrainH(x, z);
  for (const o of obstacles) {
    if (x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ) {
      if (o.h <= yRef + 0.55 && o.h > g) g = o.h;
    }
  }
  return g;
}
const raycaster = new THREE.Raycaster();
function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  raycaster.set(from, dir.normalize());
  raycaster.far = dist - 0.5;
  if (raycaster.intersectObjects(solidMeshes, false).length > 0) return false;
  // 地形による遮蔽 (数点サンプリング)
  const steps = Math.min(10, Math.max(3, dist / 8 | 0));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    if (terrainH(x, z) > y + 0.2) return false;
  }
  return true;
}

// ---------- Shooting ----------
const shootRay = new THREE.Raycaster();
function playerShoot() {
  if (weapon.reloading || weapon.cooldown > 0 || !player.alive) return;
  const w = weaponDef();
  if (!w.auto && fireLatch) return;   // 単発武器はトリガーを引き直す必要あり
  if (weapon.mag <= 0) { sfx.empty(); weapon.cooldown = 0.25; fireLatch = true; return; }
  fireLatch = true;
  weapon.mag--; weapon.cooldown = weapon.fireInterval;
  weapon.recoil = 1; weapon.spreadHeat = Math.min(weapon.spreadHeat + 0.15, 1);
  if (curWeaponId === 'sr') sfx.snipe();
  else if (curWeaponId === 'sg') sfx.shotgun();
  else sfx.shoot();
  muzzleFlash.material.opacity = 1;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  muzzleLight.intensity = 2.5;
  player.pitch = Math.min(player.pitch + w.kick, Math.PI / 2);

  // 拡散: 武器定義 + ヒート + 移動ペナルティ / ADSで大幅減少
  let spread = w.baseSpread + weapon.spreadHeat * w.heatSpread + (moveMag() > 0.1 ? 0.012 : 0);
  if (w.hipPenalty && ads.t < 0.6) spread += 0.05;   // スナイパー腰だめは大きく散る
  spread *= (1 - ads.t * 0.85);

  const muzzleWorld = new THREE.Vector3();
  muzzleFlash.getWorldPosition(muzzleWorld);
  let anyHit = false, anyHead = false;

  for (let p = 0; p < w.pellets; p++) {
    const dir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(player.pitch + (Math.random() - .5) * spread, player.yaw + (Math.random() - .5) * spread, 0, 'YXZ'));
    shootRay.set(camera.position.clone(), dir);
    shootRay.far = w.range;

    const hitsE = shootRay.intersectObjects(soldierHitMeshes, false).filter(h => h.object.userData.soldier && h.object.userData.soldier.alive && h.object.userData.soldier.team === -1);
    const hitsW = shootRay.intersectObjects(solidMeshes, false);
    let end = camera.position.clone().addScaledVector(dir, w.range);
    const eDist = hitsE.length ? hitsE[0].distance : Infinity;
    const wDist = hitsW.length ? hitsW[0].distance : Infinity;

    if (eDist < wDist) {
      const h = hitsE[0];
      end = h.point;
      const isHead = !!h.object.userData.isHead;
      damageSoldierByPlayer(h.object.userData.soldier, isHead ? w.hsDmg : w.dmg, h.point, isHead);
      anyHit = true; if (isHead) anyHead = true;
    } else if (wDist < Infinity) {
      end = hitsW[0].point;
      const dd = hitsW[0].object.userData.destructible;
      if (dd) damageDestructible(dd, w.dmg * (curWeaponId === 'sg' ? 1 : 1.5));   // v0.2.3
      else spawnParticles(end, 0xb0a890, 3, 2);
    }
    spawnTracer(muzzleWorld, end);
  }
  if (anyHit) showHitmarker(anyHead);
  updateAmmoUI();
}

function reload() {
  if (curVehicle || weapon.reloading || weapon.mag === weapon.magSize || !player.alive) return;
  if (weapon.reserve <= 0) { ui.reloadHint.textContent = '弾薬切れ! 弾薬箱を探せ'; return; }
  weapon.reloading = true; weapon.reloadTimer = weapon.reloadTime;
  sfx.reload();
  ui.reloadHint.textContent = 'リロード中...';
}

/* =========================================================
   v0.2.2: グレネード (物理投擲・プール)
   ========================================================= */
const grenades = { count: 3, max: 3 };
const NADE_MAX = 4;
const nadePool = [];
{
  const nGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const nMat = new THREE.MeshLambertMaterial({ color: 0x3a5a2a });
  for (let i = 0; i < NADE_MAX; i++) {
    const m = new THREE.Mesh(nGeo, nMat);
    m.visible = false;
    scene.add(m);
    nadePool.push({ m, vel: new THREE.Vector3(), fuse: 0, active: false });
  }
}
function throwGrenade() {
  if (!player.alive || curVehicle || grenades.count <= 0) return;
  const g = nadePool.find(n => !n.active);
  if (!g) return;
  grenades.count--;
  sfx.pin();
  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  g.m.position.copy(camera.position).addScaledVector(dir, 0.6);
  g.vel.copy(dir).multiplyScalar(16);
  g.vel.y += 4.5;   // 山なり弾道
  g.fuse = 2.2;
  g.active = true;
  g.m.visible = true;
  updateAmmoUI();
}
function updateGrenades(dt) {
  for (const g of nadePool) {
    if (!g.active) continue;
    g.fuse -= dt;
    g.vel.y -= 16 * dt;
    const p = g.m.position;
    p.addScaledVector(g.vel, dt);
    // 地形バウンド
    const gy = terrainH(p.x, p.z) + 0.13;
    if (p.y < gy) {
      p.y = gy;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.6; g.vel.z *= 0.6;
      if (Math.abs(g.vel.y) < 0.8) g.vel.y = 0;
    }
    // 建物にぶつかったら反射 (簡易)
    if (collidesAt(p.x, p.z, 0.15, p.y - 0.13)) {
      g.vel.x *= -0.4; g.vel.z *= -0.4;
      p.addScaledVector(g.vel, dt * 2);
    }
    if (g.fuse <= 0) {
      g.active = false; g.m.visible = false;
      explodeAt(p.clone().setY(Math.max(p.y, terrainH(p.x, p.z) + 0.4)), 7, 120);
    }
  }
}

/* =========================================================
   v0.2.2: 弾薬・回復パック (拠点周辺 + マップ各所)
   ========================================================= */
const pickups = [];
{
  const ammoGeo = new THREE.BoxGeometry(0.7, 0.45, 0.5);
  const ammoMat = new THREE.MeshLambertMaterial({ color: 0x3f6d2f });
  const hpGeo = new THREE.BoxGeometry(0.62, 0.45, 0.62);
  const hpMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe03428 });
  function makePickup(type, x, z) {
    const grp = new THREE.Group();
    if (type === 'ammo') {
      grp.add(new THREE.Mesh(ammoGeo, ammoMat));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.52), new THREE.MeshBasicMaterial({ color: 0xd8c26a }));
      grp.add(stripe);
    } else {
      grp.add(new THREE.Mesh(hpGeo, hpMat));
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), crossMat); c1.position.set(0, 0.24, 0);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.36), crossMat); c2.position.set(0, 0.24, 0);
      grp.add(c1, c2);
    }
    const gy = terrainH(x, z);
    grp.position.set(x, gy + 0.35, z);
    scene.add(grp);
    pickups.push({ type, x, z, y: gy, obj: grp, active: true, respawnT: 0, bobT: Math.random() * 6 });
  }
  // 各拠点そば + 中間地点に配置
  for (const f of flags) {
    makePickup('ammo', f.x + 6, f.z + 5);
    makePickup('health', f.x - 6, f.z - 5);
  }
  makePickup('ammo', -55, 120);  makePickup('health', -60, -30);
  makePickup('ammo', 55, -120);  makePickup('health', 60, 25);
  makePickup('ammo', 100, 10);   makePickup('health', -10, 95);
  makePickup('health', HQ_BLUE.x + 8, HQ_BLUE.z + 6);
  makePickup('ammo', HQ_BLUE.x - 8, HQ_BLUE.z + 6);
  makePickup('health', HQ_RED.x - 8, HQ_RED.z - 6);
  makePickup('ammo', HQ_RED.x + 8, HQ_RED.z - 6);
}
const PICKUP_RESPAWN = 25;
function updatePickups(dt) {
  for (const pk of pickups) {
    if (!pk.active) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) { pk.active = true; pk.obj.visible = true; }
      continue;
    }
    // ふわふわ回転で目立たせる
    pk.bobT += dt * 2;
    pk.obj.position.y = pk.y + 0.42 + Math.sin(pk.bobT) * 0.09;
    pk.obj.rotation.y += dt * 1.4;
    if (!player.alive || curVehicle) continue;
    const d = Math.hypot(player.pos.x - pk.x, player.pos.z - pk.z);
    if (d < 1.6) {
      if (pk.type === 'ammo') {
        const w = weaponDef();
        if (weapon.reserve >= w.reserve && grenades.count >= grenades.max) continue; // 満タンなら取らない
        weapon.reserve = Math.min(w.reserve, weapon.reserve + Math.ceil(w.reserve * 0.5));
        grenades.count = Math.min(grenades.max, grenades.count + 1);
        addFeed('弾薬を補給した', 'blue');
      } else {
        if (player.hp >= player.maxHp) continue;
        player.hp = Math.min(player.maxHp, player.hp + 50);
        ui.vignette.style.opacity = 0;
        addFeed('回復パックを使用 +50', 'blue');
        updateHpUI();
      }
      sfx.pickup();
      updateAmmoUI();
      pk.active = false; pk.obj.visible = false; pk.respawnT = PICKUP_RESPAWN;
    }
  }
}

// ---------- ダメージ方向インジケーター (v0.2.1) ----------
const DMG_ARC_MAX = 6;
const dmgArcs = [];
{
  const holder = document.getElementById('dmg-indicators');
  for (let i = 0; i < DMG_ARC_MAX; i++) {
    const d = document.createElement('div');
    d.className = 'dmg-arc';
    holder.appendChild(d);
    dmgArcs.push({ el: d, ttl: 0, worldAngle: 0 });
  }
}
let dmgArcIdx = 0;
// fromPos: 攻撃元のワールド座標
function showDamageDirection(fromPos) {
  if (!fromPos) return;
  const a = dmgArcs[dmgArcIdx++ % DMG_ARC_MAX];
  // プレイヤーから見た攻撃元の方位角 (ワールド)
  a.worldAngle = Math.atan2(fromPos.x - player.pos.x, -(fromPos.z - player.pos.z));
  a.ttl = 1.1;
}
function updateDamageArcs(dt) {
  for (const a of dmgArcs) {
    if (a.ttl <= 0) { a.el.style.opacity = 0; continue; }
    a.ttl -= dt;
    // カメラのyawに応じて画面上の向きを更新 (前方=上)
    const rel = a.worldAngle + player.yaw;
    a.el.style.transform = `rotate(${(-rel * 180 / Math.PI)}deg)`;
    a.el.style.opacity = Math.min(1, a.ttl / 0.35);
  }
}

/* =========================================================
   v0.3.1: パラシュート — 高高度からの降下を可能に
   ・一定以上の高さを落下中に自動展開 / ヘリ空中脱出時は即展開
   ・展開中は降下速度が制限され、空中での水平移動が可能
   ・パラシュートなしの高所落下は落下ダメージ
   ========================================================= */
let chuteMesh = null;
{
  const g = new THREE.Group();
  // キャノピー (半球)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshLambertMaterial({ color: 0x5a7a4a, side: THREE.DoubleSide })
  );
  canopy.position.y = 3.4;
  g.add(canopy);
  // ライン (4本)
  const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([ox, oz]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(ox, 3.6, oz)
    ]);
    g.add(new THREE.Line(geo, lineMat));
  });
  g.visible = false;
  scene.add(g);
  chuteMesh = g;
}
function deployChute() {
  if (player.chute || !player.alive) return;
  player.chute = true;
  chuteMesh.visible = true;
  sfx.chute();
  addFeed('🪂 パラシュート展開', 'blue');
}
function releaseChute() {
  if (!player.chute) return;
  player.chute = false;
  chuteMesh.visible = false;
}

// ---------- Player damage / respawn ----------
function damagePlayer(dmg, fromPos = null) {
  if (!player.alive) return;
  player.hp -= dmg;
  player.lastDamageTime = elapsed;
  sfx.damage();
  if (fromPos) showDamageDirection(fromPos);
  ui.vignette.style.opacity = Math.min(1, 0.4 + (1 - player.hp / player.maxHp) * 0.6);
  setTimeout(() => { if (player.hp > 30) ui.vignette.style.opacity = 0; }, 220);
  if (player.hp <= 0) { player.hp = 0; playerDie(); }
  updateHpUI();
}
function playerDie() {
  player.alive = false;
  player.respawnT = 5;
  player.deaths = (player.deaths || 0) + 1;        // v0.2.3
  firing = false;
  setAds(false);
  releaseChute();                                  // v0.3.1
  if (drone.active) endDrone(false);               // v0.3
  game.ticketsBlue = Math.max(0, game.ticketsBlue - 1);
  updateTicketsUI();
  if (curVehicle) exitVehicle(true);
  document.getElementById('respawn-screen').style.display = 'flex';
  deployReady = false;                             // v0.3
  checkMatchEnd();
}
// v0.3: デプロイ画面で選んだ地点から出撃
function respawnPlayer(sp = null) {
  if (!sp) {
    sp = HQ_BLUE;
    const owned = flags.filter(f => f.own === 1);
    if (owned.length) sp = owned[Math.floor(Math.random() * owned.length)];
  }
  const rx = sp.x + (Math.random() - .5) * 10, rz = sp.z + (Math.random() - .5) * 10;
  player.pos.set(rx, terrainH(rx, rz) + player.eyeHeight, rz);
  player.vel.set(0, 0, 0);
  player.hp = player.maxHp; player.alive = true;
  player.lastDamageTime = -99;
  player.onGround = true;
  releaseChute();                                  // v0.3.1
  // v0.2.2: リスポーン時はフル装備で復帰
  applyWeapon(curWeaponId);
  grenades.count = grenades.max;
  fireLatch = false;
  ui.vignette.style.opacity = 0;
  ui.reloadHint.textContent = '';
  updateHpUI(); updateAmmoUI();
  document.getElementById('respawn-screen').style.display = 'none';
}
