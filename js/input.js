'use strict';
/* STEEL FRONT — 入力: キーボード / マウス / タッチ / プレイヤー移動 */

// ---------- Input: keyboard / mouse ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyE' || e.code === 'KeyF') toggleVehicle();
  if (e.code === 'KeyG') throwGrenade();          // v0.2.2
  if (e.code === 'KeyM') toggleFullmap();          // v0.2.2
  if (e.code === 'Tab') { e.preventDefault(); toggleScoreboard(true); }   // v0.2.3
  if (e.code === 'Escape') { toggleSettings(false); toggleScoreboard(false); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Tab') toggleScoreboard(false);   // v0.2.3: Tab離しで閉じる
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('contextmenu', e => e.preventDefault());

if (!isMobile) {
  canvas.addEventListener('click', () => { if (game.running) canvas.requestPointerLock(); });
  window.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    const sens = 0.0022 * settings.sens * (1 - ads.t * 0.5);   // ADS中は感度低下 (v0.2.3: 設定反映)
    player.yaw -= e.movementX * sens;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * sens));
  });
  window.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) setAds(true);          // 右クリック長押しでADS
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) { firing = false; fireLatch = false; }
    if (e.button === 2) setAds(false);
  });
}

// ---------- Input: touch ----------
const touchLayer = document.getElementById('touch-layer');
const joyBase = document.getElementById('joystick-base');
const joyStick = document.getElementById('joystick-stick');
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = { id: null, lx: 0, ly: 0 };
let jumpQueued = false;

function moveMag() {
  if (isMobile) return Math.hypot(joy.x, joy.y);
  let m = 0;
  if (keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']) m = 1;
  return m;
}

if (isMobile) {
  touchLayer.style.display = 'block';
  const JOY_R = 55;

  touchLayer.addEventListener('touchstart', ev => {
    for (const t of ev.changedTouches) {
      if (t.target.classList && t.target.classList.contains('tbtn')) continue;
      if (t.clientX < window.innerWidth * 0.45 && joy.id === null) {
        joy.id = t.identifier; joy.active = true;
        joy.ox = t.clientX; joy.oy = t.clientY;
        joyBase.style.display = 'block';
        joyBase.style.left = (joy.ox - JOY_R) + 'px';
        joyBase.style.top = (joy.oy - JOY_R) + 'px';
        joyStick.style.transform = 'translate(-50%,-50%)';
      } else if (look.id === null) {
        look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
      }
    }
    ev.preventDefault();
  }, { passive: false });

  touchLayer.addEventListener('touchmove', ev => {
    for (const t of ev.changedTouches) {
      if (t.identifier === joy.id) {
        let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
        joy.x = dx / JOY_R; joy.y = dy / JOY_R;
        joyStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === look.id) {
        const sens = 0.0045 * settings.sens * (1 - ads.t * 0.5);   // ADS中は感度低下 (v0.2.3: 設定反映)
        player.yaw -= (t.clientX - look.lx) * sens;
        player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (t.clientY - look.ly) * sens));
        look.lx = t.clientX; look.ly = t.clientY;
      }
    }
    ev.preventDefault();
  }, { passive: false });

  const endTouch = ev => {
    for (const t of ev.changedTouches) {
      if (t.identifier === joy.id) {
        joy.id = null; joy.active = false; joy.x = joy.y = 0;
        joyBase.style.display = 'none';
      } else if (t.identifier === look.id) look.id = null;
    }
    ev.preventDefault();
  };
  touchLayer.addEventListener('touchend', endTouch, { passive: false });
  touchLayer.addEventListener('touchcancel', endTouch, { passive: false });

  const bindBtn = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); up && up(); }, { passive: false });
  };
  bindBtn('btn-fire', () => firing = true, () => { firing = false; fireLatch = false; });
  bindBtn('btn-fire-alt', () => firing = true, () => { firing = false; fireLatch = false; });
  bindBtn('btn-jump', () => jumpQueued = true);
  bindBtn('btn-reload', () => reload());
  bindBtn('btn-aim', () => setAds(!ads.active));   // タップで切替
  bindBtn('btn-nade', () => throwGrenade());        // v0.2.2
  bindBtn('btn-weapon', () => cycleWeapon());       // v0.2.2: 次の武器に切替
  bindBtn('btn-vehicle', () => toggleVehicle());
  document.getElementById('btn-map').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); toggleFullmap(); }, { passive: false });
  document.getElementById('btn-score').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); toggleScoreboard(); }, { passive: false });
} else {
  document.getElementById('btn-map').style.display = 'none';
  document.getElementById('btn-score').style.display = 'none';
}

// v0.2.2: 武器選択 (スタート画面) & サイクル切替 (1-4キー/WPNボタン)
const WEAPON_ORDER = ['ar', 'smg', 'sr', 'sg'];
function selectWeaponUI(id) {
  document.querySelectorAll('.wsel').forEach(b => b.classList.toggle('sel', b.dataset.w === id));
}
document.querySelectorAll('.wsel').forEach(b => {
  b.addEventListener('click', () => { curWeaponId = b.dataset.w; selectWeaponUI(curWeaponId); });
});
function cycleWeapon() {
  if (!player.alive || curVehicle) return;
  const i = WEAPON_ORDER.indexOf(curWeaponId);
  applyWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
  setAds(false);
  addFeed(weaponDef().name + ' に切替', 'blue');
}
window.addEventListener('keydown', e => {
  if (!game.running || curVehicle || !player.alive) return;
  const map = { Digit1: 'ar', Digit2: 'smg', Digit3: 'sr', Digit4: 'sg' };
  if (map[e.code] && map[e.code] !== curWeaponId) {
    applyWeapon(map[e.code]);
    setAds(false);
    addFeed(weaponDef().name + ' に切替', 'blue');
  }
});

// ---------- Player movement (地形追従) ----------
function updatePlayer(dt) {
  if (!player.alive) return;
  let ix = 0, iz = 0, sprint = false;
  if (isMobile) {
    ix = joy.x; iz = joy.y;
    sprint = joy.y < -0.92;
  } else {
    if (keys['KeyW']) iz -= 1;
    if (keys['KeyS']) iz += 1;
    if (keys['KeyA']) ix -= 1;
    if (keys['KeyD']) ix += 1;
    const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    sprint = !!keys['ShiftLeft'] && iz < 0;
    if (keys['Space']) jumpQueued = true;
  }
  if (ads.t > 0.5) sprint = false;               // ADS中はダッシュ不可
  const speed = (sprint ? 9.5 : 5.5) * (1 - ads.t * 0.45);  // ADS中は移動速度低下
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // カメラ空間(前=-Z)→ワールドへの回転変換 (v0.1.1 修正済み)
  const wx = (ix * cos + iz * sin) * speed;
  const wz = (iz * cos - ix * sin) * speed;

  if (jumpQueued && player.onGround) { player.vel.y = 6.5; player.onGround = false; }
  jumpQueued = false;
  player.vel.y -= 18 * dt;

  const footY = player.pos.y - player.eyeHeight;
  const nx = player.pos.x + wx * dt;
  if (!collidesAt(nx, player.pos.z, player.radius, footY)) player.pos.x = nx;
  const nz = player.pos.z + wz * dt;
  if (!collidesAt(player.pos.x, nz, player.radius, footY)) player.pos.z = nz;
  player.pos.y += player.vel.y * dt;
  // 地形との接地
  const groundY = terrainH(player.pos.x, player.pos.z) + player.eyeHeight;
  if (player.pos.y <= groundY) {
    player.pos.y = groundY; player.vel.y = 0; player.onGround = true;
  }

  camera.position.copy(player.pos);
  const moving = Math.hypot(wx, wz) > 0.5;
  if (moving && player.onGround) {
    bobT += dt * (sprint ? 13 : 9);
    camera.position.y += Math.sin(bobT) * 0.035;
  }
  camera.rotation.set(player.pitch, player.yaw, 0);
  if (shake > 0.01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake;
  }

  weapon.recoil = Math.max(0, weapon.recoil - dt * 8);
  weapon.spreadHeat = Math.max(0, weapon.spreadHeat - dt * 1.2);
  // ADS: 銃を画面中央へ構える (v0.2.1)
  const adsT = ads.t;
  gunGroup.position.x = 0.28 * (1 - adsT);
  gunGroup.position.z = -0.55 + weapon.recoil * 0.06 + adsT * 0.18;
  gunGroup.rotation.x = weapon.recoil * 0.05;
  const bobAmp = (moving ? Math.sin(bobT) * 0.012 : 0) * (1 - adsT * 0.7);
  gunGroup.position.y = (-0.26 + adsT * 0.075) + bobAmp;
  if (weapon.reloading) gunGroup.rotation.x = -0.5 + Math.sin(weapon.reloadTimer * 3) * 0.1;

  weapon.cooldown -= dt;
  if (weapon.reloading) {
    weapon.reloadTimer -= dt;
    if (weapon.reloadTimer <= 0) {
      weapon.reloading = false;
      const need = weapon.magSize - weapon.mag;
      const take = Math.min(need, weapon.reserve);
      weapon.mag += take; weapon.reserve -= take;   // v0.2.2: 予備弾消費
      ui.reloadHint.textContent = '';
      updateAmmoUI();
    }
  }
  if (firing) playerShoot();
  if (weapon.mag === 0 && !weapon.reloading && weapon.reserve > 0) reload();
}
