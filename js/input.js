'use strict';
/* STEEL FRONT — 入力: キーボード / マウス / タッチ / プレイヤー移動 */

// ---------- Input: keyboard / mouse ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  // v0.3.4: 空中でSpace → パラシュート開閉 (押し直しごとにトグル)
  if (e.code === 'Space' && !e.repeat && game.running && player.alive && !curVehicle && !drone.active && !player.onGround) toggleChute();
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyE') toggleVehicle();
  if (e.code === 'KeyF') repairKeyHeld = true;     // v0.3: F長押しで修理
  if (e.code === 'KeyX') switchSeat();             // v0.3: 座席切替
  if (e.code === 'KeyT') toggleDrone();            // v0.3: 偵察ドローン
  if (e.code === 'KeyH') honk();                   // v0.3: クラクション
  if (e.code === 'KeyQ') heliRockets();            // v0.3: ヘリロケット
  if (e.code === 'KeyG') throwGrenade();          // v0.2.2
  if (e.code === 'KeyM') toggleFullmap();          // v0.2.2
  if (e.code === 'Tab') { e.preventDefault(); toggleScoreboard(true); }   // v0.2.3
  if (e.code === 'Escape') { toggleSettings(false); toggleScoreboard(false); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Tab') toggleScoreboard(false);   // v0.2.3: Tab離しで閉じる
  if (e.code === 'KeyF') repairKeyHeld = false;    // v0.3
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('contextmenu', e => e.preventDefault());

if (!isMobile) {
  canvas.addEventListener('click', () => { if (game.running) canvas.requestPointerLock(); });
  window.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    const sens = 0.0022 * settings.sens * (1 - ads.t * 0.5);   // ADS中は感度低下 (v0.2.3: 設定反映)
    if (drone.active) {   // v0.3: ドローン視点
      drone.yaw -= e.movementX * sens;
      drone.pitch = Math.max(-1.45, Math.min(1.0, drone.pitch - e.movementY * sens));
      return;
    }
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
        if (drone.active) {   // v0.3: ドローン視点
          drone.yaw -= (t.clientX - look.lx) * sens;
          drone.pitch = Math.max(-1.45, Math.min(1.0, drone.pitch - (t.clientY - look.ly) * sens));
        } else {
          player.yaw -= (t.clientX - look.lx) * sens;
          player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (t.clientY - look.ly) * sens));
        }
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
  // v0.3.2: FIREボタンを押しながら指をドラッグすると視点も動く (既存FPS風)
  const fireLook = { ids: new Set(), last: new Map() };
  function applyLookDelta(dx, dy) {
    const sens = 0.0045 * settings.sens * (1 - ads.t * 0.5);
    if (drone.active) {
      drone.yaw -= dx * sens;
      drone.pitch = Math.max(-1.45, Math.min(1.0, drone.pitch - dy * sens));
    } else {
      player.yaw -= dx * sens;
      player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sens));
    }
  }
  const bindFireBtn = id => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      firing = true;
      for (const t of e.changedTouches) {
        fireLook.ids.add(t.identifier);
        fireLook.last.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) {
        if (!fireLook.ids.has(t.identifier)) continue;
        const p = fireLook.last.get(t.identifier);
        applyLookDelta(t.clientX - p.x, t.clientY - p.y);
        p.x = t.clientX; p.y = t.clientY;
      }
    }, { passive: false });
    const end = e => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) {
        fireLook.ids.delete(t.identifier);
        fireLook.last.delete(t.identifier);
      }
      if (fireLook.ids.size === 0) { firing = false; fireLatch = false; }
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  };
  bindFireBtn('btn-fire');
  bindFireBtn('btn-fire-alt');
  bindBtn('btn-jump', () => {
    // v0.3.4: 空中ではJUMPボタン = パラシュート開閉
    if (player.alive && !curVehicle && !drone.active && !player.onGround) toggleChute();
    else jumpQueued = true;
  });
  bindBtn('btn-reload', () => reload());
  bindBtn('btn-aim', () => setAds(!ads.active));   // タップで切替
  bindBtn('btn-nade', () => throwGrenade());        // v0.2.2
  bindBtn('btn-weapon', () => cycleWeapon());       // v0.2.2: 次の武器に切替
  bindBtn('btn-vehicle', () => toggleVehicle());
  // v0.3: 新ボタン
  bindBtn('btn-seat', () => switchSeat());
  bindBtn('btn-drone', () => toggleDrone());
  bindBtn('btn-repair', () => repairKeyHeld = true, () => repairKeyHeld = false);
  bindBtn('btn-up', () => heliUpHeld = true, () => heliUpHeld = false);
  bindBtn('btn-down', () => heliDownHeld = true, () => heliDownHeld = false);
  bindBtn('btn-rocket', () => heliRockets());
  bindBtn('btn-horn', () => honk());
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
  // v0.3: 泳ぎ — 水域では低速・ジャンプ不可
  const swimming = terrainH(player.pos.x, player.pos.z) < WATER_Y - 0.2;
  if (swimming) sprint = false;
  const speed = (sprint ? 9.5 : 5.5) * (1 - ads.t * 0.45) * (swimming ? 0.45 : 1);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // カメラ空間(前=-Z)→ワールドへの回転変換 (v0.1.1 修正済み)
  const wx = (ix * cos + iz * sin) * speed;
  const wz = (iz * cos - ix * sin) * speed;

  if (jumpQueued && player.onGround && !swimming) { player.vel.y = 6.5; player.onGround = false; }
  jumpQueued = false;
  // v0.3.4: パラシュートは手動開閉 (自動展開を廃止)
  // ・閉じたまま = 自由落下で徐々に加速 (終端速度あり) → 高所落下はダメージ
  // ・開いている = 降下速度を制限してゆっくり降下
  if (player.chute) {
    player.vel.y -= 4 * dt;
    if (player.vel.y < -3.2) player.vel.y = Math.max(-6.5, player.vel.y + 22 * dt); // ブレーキ
  } else {
    player.vel.y -= 18 * dt;
    if (player.vel.y < -28) player.vel.y = -28;   // v0.3.4: 終端速度 (徐々に加速して頭打ち)
  }
  // 高所を落下中はヒントを表示 (v0.3.4)
  if (!player.onGround && !player.chute && player.vel.y < -8 &&
      (player.pos.y - player.eyeHeight) - terrainH(player.pos.x, player.pos.z) > 12) {
    ui.reloadHint.textContent = (isMobile ? 'JUMPボタン' : 'Space') + ': パラシュート展開';
  } else if (ui.reloadHint.textContent.includes('パラシュート') && !weapon.reloading) {
    ui.reloadHint.textContent = '';
  }

  const footY = player.pos.y - player.eyeHeight;
  const airDrift = player.chute ? 1.15 : 1;   // パラシュート中は空中でも操舵可能
  const nx = player.pos.x + wx * dt * airDrift;
  if (!collidesAt(nx, player.pos.z, player.radius, footY)) player.pos.x = nx;
  const nz = player.pos.z + wz * dt * airDrift;
  if (!collidesAt(player.pos.x, nz, player.radius, footY)) player.pos.z = nz;
  player.pos.y += player.vel.y * dt;
  // 接地 (v0.3: 水域では水面付近に浮く / v0.3.1: 障害物の上にも立てる)
  const th = groundHeightAt(player.pos.x, player.pos.z, player.radius, player.pos.y - player.eyeHeight);
  const groundY = (th < WATER_Y - 0.2 ? Math.max(th, WATER_Y - 1.1) : th) + player.eyeHeight;
  if (player.pos.y <= groundY) {
    // v0.3.4: 落下ダメージ (パラシュートなしの高所落下 — 終端速度なら致死)
    if (player.vel.y < -12 && !swimming) {
      damagePlayer(Math.min(110, Math.round((-player.vel.y - 12) * 7)));
      shake = Math.max(shake, 0.25);
    }
    player.pos.y = groundY; player.vel.y = 0; player.onGround = true;
    releaseChute();
  } else if (player.pos.y < groundY + player.eyeHeight * 0.1 + 2 && player.vel.y < -3 && player.chute) {
    // 接地直前はフレア (減速)
    player.vel.y = Math.max(player.vel.y, -3);
  }
  // パラシュートメッシュを追従
  if (player.chute) {
    chuteMesh.position.set(player.pos.x, player.pos.y - 0.6, player.pos.z);
    chuteMesh.rotation.y = player.yaw;
    chuteMesh.rotation.z = -wx * 0.008;
  }

  camera.position.copy(player.pos);
  const moving = Math.hypot(wx, wz) > 0.5;
  if (moving && player.onGround) {
    bobT += dt * (sprint ? 13 : swimming ? 5 : 9);
    camera.position.y += Math.sin(bobT) * (swimming ? 0.06 : 0.035);
    if (swimming && Math.random() < dt * 6) spawnParticles(player.pos.clone().setY(WATER_Y + 0.1), 0xbfe3ef, 2, 1.5, 0.7);
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
