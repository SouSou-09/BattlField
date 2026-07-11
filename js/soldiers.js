'use strict';
/* STEEL FRONT — AI兵士: 生成 / 思考 / 交戦 / マーカー */

/* =========================================================
   Soldiers — 10 vs 10 (プレイヤー1 + 味方AI9 vs 敵AI10)
   team: 1 = BLUE (味方) / -1 = RED (敵)
   AIは拠点へ移動 → 交戦 → 占領 のループを行う
   ========================================================= */
const soldiers = [];
const soldierHitMeshes = [];
const matBodyRed = new THREE.MeshLambertMaterial({ color: 0x5a5245 });
const matBodyBlue = new THREE.MeshLambertMaterial({ color: 0x46545f });
const matHead = new THREE.MeshLambertMaterial({ color: 0xc9a07a });
const matGearRed = new THREE.MeshLambertMaterial({ color: 0x8a1f1f });
const matGearBlue = new THREE.MeshLambertMaterial({ color: 0x1f4a8a });
const matGun = new THREE.MeshLambertMaterial({ color: 0x1c1e20 });
const SG = {
  torso: new THREE.BoxGeometry(0.62, 0.78, 0.36),
  vest: new THREE.BoxGeometry(0.66, 0.5, 0.4),
  head: new THREE.BoxGeometry(0.32, 0.32, 0.32),
  helmet: new THREE.BoxGeometry(0.38, 0.16, 0.38),
  leg: new THREE.BoxGeometry(0.22, 0.66, 0.24),
  arm: new THREE.BoxGeometry(0.16, 0.6, 0.2),
  gun: new THREE.BoxGeometry(0.08, 0.1, 0.8)
};

// ---------- チームマーカー (v0.2.1) ----------
// 味方: 青▼ 常時表示 (壁越しも見える) / 敵: 赤▼ 視認時のみ
function makeMarkerTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(32, 54); g.lineTo(12, 18); g.lineTo(52, 18);
  g.closePath();
  g.fill(); g.stroke();
  return new THREE.CanvasTexture(c);
}
const markerTexBlue = makeMarkerTexture('#3d8fe8');
const markerTexRed = makeMarkerTexture('#e0392c');
const markerMatBlue = new THREE.SpriteMaterial({ map: markerTexBlue, transparent: true, depthTest: false, depthWrite: false });
const markerMatRed = new THREE.SpriteMaterial({ map: markerTexRed, transparent: true, depthWrite: false });

// v0.2.3: AI兵士名 (スコアボード用)
const SOLDIER_NAMES = ['WOLF', 'HAWK', 'VIPER', 'BEAR', 'FOX', 'RAVEN', 'COBRA', 'LYNX', 'ORCA', 'PUMA', 'IBIS', 'MOOSE', 'GECKO', 'RHINO', 'CRANE', 'BISON', 'EGRET', 'DINGO', 'TAPIR', 'OKAPI'];
let soldierNameIdx = 0;
function createSoldier(team, x, z) {
  const matBody = team === 1 ? matBodyBlue : matBodyRed;
  const matGear = team === 1 ? matGearBlue : matGearRed;
  const g = new THREE.Group();
  const torso = new THREE.Mesh(SG.torso, matBody); torso.position.y = 1.05;
  const vest = new THREE.Mesh(SG.vest, matGear); vest.position.y = 1.12;
  const head = new THREE.Mesh(SG.head, matHead); head.position.y = 1.66;
  const helmet = new THREE.Mesh(SG.helmet, matGear); helmet.position.y = 1.84;
  const legL = new THREE.Mesh(SG.leg, matBody); legL.position.set(-0.16, 0.33, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  const armL = new THREE.Mesh(SG.arm, matBody); armL.position.set(-0.42, 1.1, 0);
  const armR = armL.clone(); armR.position.x = 0.42;
  const gun = new THREE.Mesh(SG.gun, matGun); gun.position.set(0.2, 1.25, -0.4);
  head.userData.isHead = true;
  g.add(torso, vest, head, helmet, legL, legR, armL, armR, gun);
  // チームマーカー (v0.2.1): 味方は depthTest なしで壁越しにも見える
  const marker = new THREE.Sprite(team === 1 ? markerMatBlue.clone() : markerMatRed.clone());
  marker.scale.set(0.55, 0.55, 1);
  marker.position.y = 2.35;
  marker.renderOrder = team === 1 ? 999 : 0;
  if (team === -1) marker.visible = false;  // 敵は視認時のみ
  g.add(marker);
  g.position.set(x, terrainH(x, z), z);
  const s = {
    team, obj: g, head, legL, legR, hp: 100, alive: true,
    shootCd: 1 + Math.random() * 2, strafeT: 0, strafeDir: 1,
    speed: 2.7 + Math.random() * 1.0, deathT: 0, walkPhase: Math.random() * 6,
    avoidT: 0, avoidDir: 1,
    aimT: 0, losT: Math.random() * 0.3, hasLos: false,
    prevX: x, prevZ: z, stuckT: 0,
    targetFlag: null, thinkT: Math.random() * 2,
    engageTarget: null, engageT: 0,
    respawnT: 0, marker, markerT: Math.random() * 0.3, seenByPlayer: false,
    // v0.2.3: スコアボード用戦績
    name: (team === 1 ? 'BLU-' : 'RED-') + SOLDIER_NAMES[soldierNameIdx++ % SOLDIER_NAMES.length],
    kills: 0, deaths: 0, score: 0
  };
  g.traverse(m => { if (m.isMesh) { m.userData.soldier = s; m.castShadow = !isMobile; soldierHitMeshes.push(m); } });
  scene.add(g);
  soldiers.push(s);
  return s;
}

// AI: 目標拠点を選ぶ (v0.2.1: 防衛判断を追加)
// 拠点が「奪われかけているか」(敵が円内にいる自軍拠点か)
function flagUnderThreat(f, team) {
  if (f.own !== team) return false;
  for (const o of soldiers) {
    if (o.alive && o.team !== team &&
        Math.hypot(o.obj.position.x - f.x, o.obj.position.z - f.z) < FLAG_R + 4) return true;
  }
  if (team === -1 && player.alive &&
      Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < FLAG_R + 4) return true;
  return false;
}
function pickFlagFor(s) {
  let best = null, bestScore = -Infinity;
  for (const f of flags) {
    const d = Math.hypot(f.x - s.obj.position.x, f.z - s.obj.position.z);
    let score = -d * 0.02;
    if (f.own !== s.team) score += 4;                // 敵/中立拠点を優先
    if (f.own === 0) score += 1.5;                   // 中立はさらに優先
    // v0.2.1: 防衛 — 自軍拠点が奪われかけていたら近いAIほど強く優先
    if (flagUnderThreat(f, s.team)) score += 7 - d * 0.03;
    // 同じ拠点に味方が集中しすぎないように分散
    let allies = 0;
    for (const o of soldiers) {
      if (o !== s && o.alive && o.team === s.team && o.targetFlag === f) allies++;
    }
    score -= allies * 0.9;
    score += Math.random() * 1.2;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best;
}
// v0.2.1: 拠点円内にいる最寄りの敵を探す (視線が通らなくても位置は分かる=索敵対象)
function findIntruderAt(f, team) {
  let best = null, bd = FLAG_R + 6;
  for (const o of soldiers) {
    if (!o.alive || o.team === team) continue;
    const d = Math.hypot(o.obj.position.x - f.x, o.obj.position.z - f.z);
    if (d < bd) { bd = d; best = { kind: 'soldier', s: o }; }
  }
  if (team === -1 && player.alive && !curVehicle) {
    const d = Math.hypot(player.pos.x - f.x, player.pos.z - f.z);
    if (d < bd) best = { kind: 'player' };
  }
  return best;
}

// AI: 最も近い視認可能な敵ターゲットを探す (プレイヤー含む)
function findEnemyTarget(s) {
  let best = null, bd = 60;
  // プレイヤー (敵チームのAIのみ)
  if (s.team === -1 && player.alive) {
    const pd = Math.hypot(player.pos.x - s.obj.position.x, player.pos.z - s.obj.position.z);
    if (pd < bd) { bd = pd; best = { kind: 'player' }; }
  }
  for (const o of soldiers) {
    if (!o.alive || o.team === s.team) continue;
    const d = Math.hypot(o.obj.position.x - s.obj.position.x, o.obj.position.z - s.obj.position.z);
    if (d < bd) { bd = d; best = { kind: 'soldier', s: o }; }
  }
  // 敵AIは搭乗中の車両も狙う
  if (s.team === -1 && curVehicle) {
    const vd = Math.hypot(curVehicle.obj.position.x - s.obj.position.x, curVehicle.obj.position.z - s.obj.position.z);
    if (vd < bd + 10) best = { kind: 'vehicle' };
  }
  return best;
}
function targetPosOf(t) {
  if (!t) return null;
  if (t.kind === 'player') return player.pos.clone();
  if (t.kind === 'vehicle' && curVehicle) return curVehicle.obj.position.clone().setY(curVehicle.obj.position.y + 1.4);
  if (t.kind === 'soldier') return t.s.obj.position.clone().setY(t.s.obj.position.y + 1.4);
  return null;
}
function targetAlive(t) {
  if (!t) return false;
  if (t.kind === 'player') return player.alive && !curVehicle;
  if (t.kind === 'vehicle') return !!curVehicle;
  if (t.kind === 'soldier') return t.s.alive;
  return false;
}

function updateSoldiers(dt) {
  for (let i = soldiers.length - 1; i >= 0; i--) {
    const s = soldiers[i];
    if (!s.alive) {
      s.marker.visible = false;
      s.deathT += dt;
      s.obj.rotation.x = Math.min(s.deathT * 4, Math.PI / 2);
      if (s.deathT > 2.4) {
        // リスポーン (チケットがあれば HQ から再出撃)
        const tk = s.team === 1 ? game.ticketsBlue : game.ticketsRed;
        if (tk > 0 && game.running) {
          const hq = s.team === 1 ? HQ_BLUE : HQ_RED;
          const rx = hq.x + (Math.random() - .5) * 14, rz = hq.z + (Math.random() - .5) * 14;
          s.obj.position.set(rx, terrainH(rx, rz), rz);
          s.obj.rotation.x = 0;
          s.hp = 100; s.alive = true; s.deathT = 0;
          s.targetFlag = null; s.engageTarget = null; s.aimT = 0;
          s.shootCd = 1 + Math.random();
          s.marker.visible = s.team === 1;   // 味方マーカー復帰
        } else {
          s.obj.visible = false; // チケット切れは復活しない
        }
      }
      continue;
    }
    const sp = s.obj.position;

    // ---- チームマーカー更新 (v0.2.1) ----
    // 敵は「プレイヤーから視線が通り70m以内」のときのみ表示 (0.3秒間隔で判定)
    s.markerT -= dt;
    if (s.markerT <= 0) {
      s.markerT = 0.3;
      if (s.team === -1) {
        const pd = Math.hypot(sp.x - player.pos.x, sp.z - player.pos.z);
        s.seenByPlayer = player.alive && pd < 70 &&
          hasLineOfSight(player.pos.clone(), new THREE.Vector3(sp.x, sp.y + 1.5, sp.z));
        s.marker.visible = s.seenByPlayer;
      } else {
        s.marker.visible = true;
        // 距離に応じて味方マーカーを少し大きく (遠くでも見える)
        const pd = Math.hypot(sp.x - player.pos.x, sp.z - player.pos.z);
        const sc = 0.55 + Math.min(1, pd / 120) * 0.7;
        s.marker.scale.set(sc, sc, 1);
      }
    }

    // ---- 思考: 目標拠点の再選定 (v0.2.1: 防衛を最優先) ----
    s.thinkT -= dt;
    if (s.thinkT <= 0) {
      s.thinkT = 2.5 + Math.random() * 2;
      // 防衛: 自軍拠点が奪われかけていたら30m以内のAIは即座に切替
      let defend = null, dd = 55;
      for (const f of flags) {
        if (!flagUnderThreat(f, s.team)) continue;
        const d = Math.hypot(f.x - sp.x, f.z - sp.z);
        if (d < dd) { dd = d; defend = f; }
      }
      if (defend) {
        s.targetFlag = defend;
        s.thinkT = 1.2;   // 防衛中は判断を高頻度に
      } else if (!s.targetFlag || (s.targetFlag.own === s.team && Math.random() < 0.6)) {
        s.targetFlag = pickFlagFor(s);
      }
    }

    // ---- 交戦相手の探索 ----
    s.engageT -= dt;
    if (s.engageT <= 0) {
      s.engageT = 0.5 + Math.random() * 0.4;
      if (!targetAlive(s.engageTarget)) s.engageTarget = findEnemyTarget(s);
    }
    const tgt = targetAlive(s.engageTarget) ? s.engageTarget : null;
    const tPos = targetPosOf(tgt);
    const tDist = tPos ? Math.hypot(tPos.x - sp.x, tPos.z - sp.z) : Infinity;

    // ---- 視線チェック (間引き) ----
    s.losT -= dt;
    if (s.losT <= 0) {
      s.losT = 0.25 + Math.random() * 0.15;
      if (tPos && tDist < 80) {
        const eye = new THREE.Vector3(sp.x, sp.y + 1.6, sp.z);
        s.hasLos = hasLineOfSight(eye, tPos);
      } else s.hasLos = false;
    }

    // ---- 移動先の決定 ----
    const retreating = s.hp < 35 && tgt && s.hasLos; // v0.2.1: 低HP時は後退応戦
    let destX, destZ, wantDist = 0;
    if (tgt && s.hasLos && tDist < 45) {
      // 交戦: 距離を保ちつつストレイフ (撤退中はより遠く)
      destX = tPos.x; destZ = tPos.z; wantDist = retreating ? 34 : 13;
    } else if (s.targetFlag) {
      const fd = Math.hypot(s.targetFlag.x - sp.x, s.targetFlag.z - sp.z);
      // v0.2.1 索敵: 拠点圈内に視線の通らない敵がいれば位置へ回り込む
      let intruder = null;
      if (fd < FLAG_R + 10 && (!tgt || !s.hasLos)) intruder = findIntruderAt(s.targetFlag, s.team);
      if (intruder) {
        const ip = targetPosOf(intruder);
        destX = ip.x; destZ = ip.z; wantDist = 6;
      } else {
        destX = s.targetFlag.x; destZ = s.targetFlag.z; wantDist = FLAG_R * 0.5;
      }
    } else { destX = sp.x; destZ = sp.z; }

    const dx = destX - sp.x, dz = destZ - sp.z;
    const dist = Math.hypot(dx, dz) || 0.001;

    // 向き: 交戦中はターゲット、それ以外は進行方向
    if (tgt && s.hasLos) s.obj.rotation.y = Math.atan2(tPos.x - sp.x, tPos.z - sp.z);
    else if (dist > 1) s.obj.rotation.y = Math.atan2(dx, dz);

    s.strafeT -= dt;
    if (s.strafeT <= 0) { s.strafeT = 1.5 + Math.random() * 2; s.strafeDir = Math.random() < .5 ? -1 : 1; }
    let mvx = 0, mvz = 0;
    if (retreating && dist < wantDist) {
      // 撤退: 敵に背を向けず後退しながら応戦
      mvx = -dx / dist * .85; mvz = -dz / dist * .85;
    }
    else if (dist > wantDist + 2) { mvx = dx / dist; mvz = dz / dist; }
    else if (tgt && s.hasLos && dist < 7) { mvx = -dx / dist * .6; mvz = -dz / dist * .6; }
    else if (tgt && s.hasLos) { mvx = -dz / dist * s.strafeDir * .7; mvz = dx / dist * s.strafeDir * .7; }
    else if (dist > wantDist * 0.5) { mvx = dx / dist * 0.5; mvz = dz / dist * 0.5; }

    // 障害物回避
    if (s.avoidT > 0) {
      s.avoidT -= dt;
      const ax = -mvz * s.avoidDir, az = mvx * s.avoidDir;
      mvx = ax; mvz = az;
    } else if (mvx || mvz) {
      const px = sp.x + mvx * s.speed * dt * 8, pz = sp.z + mvz * s.speed * dt * 8;
      if (collidesAt(px, pz, 0.4, sp.y)) {
        s.avoidDir = Math.random() < .5 ? -1 : 1;
        if (collidesAt(sp.x - mvz * s.avoidDir * 1.5, sp.z + mvx * s.avoidDir * 1.5, 0.4, sp.y)) s.avoidDir *= -1;
        s.avoidT = 0.5 + Math.random() * 0.5;
      }
    }

    // 目的地が遠く非交戦ならダッシュ (広いマップでの移動時間短縮)
    const spd = (!tgt && dist > 30) ? s.speed * 1.7 : s.speed;
    const nx = sp.x + mvx * spd * dt, nz = sp.z + mvz * spd * dt;
    if (!collidesAt(nx, sp.z, 0.4, sp.y)) sp.x = nx;
    if (!collidesAt(sp.x, nz, 0.4, sp.y)) sp.z = nz;
    sp.y = terrainH(sp.x, sp.z); // 地形追従

    // スタック検知
    s.stuckT += dt;
    if (s.stuckT > 1.2) {
      const moved = Math.hypot(sp.x - s.prevX, sp.z - s.prevZ);
      if (moved < 0.6 && dist > wantDist + 3) {
        s.avoidDir = Math.random() < .5 ? -1 : 1;
        s.avoidT = 0.8 + Math.random() * 0.6;
        s.strafeT = 0;
      }
      s.prevX = sp.x; s.prevZ = sp.z; s.stuckT = 0;
    }

    // 歩行アニメ
    if (Math.abs(mvx) + Math.abs(mvz) > 0.05) {
      s.walkPhase += dt * 9;
      s.legL.rotation.x = Math.sin(s.walkPhase) * 0.7;
      s.legR.rotation.x = -Math.sin(s.walkPhase) * 0.7;
    } else { s.legL.rotation.x = s.legR.rotation.x = 0; }

    // ---- 射撃 ----
    s.shootCd -= dt;
    if (tgt && s.hasLos && tDist < 65) s.aimT += dt; else s.aimT = 0;
    if (s.shootCd <= 0 && s.aimT > 0.35 && tgt && tDist < 65) {
      s.shootCd = 1.0 + Math.random() * 1.5;
      const eye = new THREE.Vector3(sp.x, sp.y + 1.6, sp.z);
      sfx.distShoot(camera.position.distanceTo(eye));
      const tracerColor = s.team === 1 ? 0x8ecbff : 0xff8866;
      if (tgt.kind === 'vehicle' && curVehicle) {
        const hit = Math.random() < Math.max(0.15, 0.75 - tDist * 0.007);
        const target = tPos.clone();
        if (!hit) { target.x += (Math.random() - .5) * 4; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 4; }
        spawnTracer(eye, target, tracerColor);
        if (hit) {
          const raw = 6 + Math.random() * 8;
          const vdmg = curVehicle.type === 'tank' ? raw * 0.35 : raw * 1.6;
          curVehicle.hp -= vdmg;
          spawnParticles(target, 0xffee88, 3, 3);
          if (curVehicle.hp <= 0) destroyVehicle(curVehicle);
          else updateVehicleUI();
        }
      } else if (tgt.kind === 'player') {
        const playerMoving = moveMag() > 0.1 ? 0.18 : 0;
        const hitChance = Math.max(0.05, 0.5 - tDist * 0.007 - playerMoving);
        const hit = Math.random() < hitChance;
        const target = player.pos.clone();
        if (!hit) { target.x += (Math.random() - .5) * 3; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 3; }
        spawnTracer(eye, target, tracerColor);
        if (hit) damagePlayer(6 + Math.random() * 8 | 0, eye);
      } else if (tgt.kind === 'soldier') {
        const hit = Math.random() < Math.max(0.08, 0.42 - tDist * 0.005);
        const target = tPos.clone();
        if (!hit) { target.x += (Math.random() - .5) * 3; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 3; }
        spawnTracer(eye, target, tracerColor);
        if (hit) damageSoldier(tgt.s, 12 + Math.random() * 14, target, s.team === 1, s);
      }
    }
  }
}

function damageSoldier(s, dmg, point, byPlayerTeam, killer = null) {
  if (!s.alive) return;
  s.hp -= dmg;
  spawnParticles(point, 0xbb2222, 5, 3);
  if (s.hp <= 0) {
    s.alive = false; s.deathT = 0;
    s.deaths++;                                    // v0.2.3
    if (killer && killer.alive) { killer.kills++; killer.score += 100; }
    // チケット減少
    if (s.team === 1) game.ticketsBlue = Math.max(0, game.ticketsBlue - 1);
    else game.ticketsRed = Math.max(0, game.ticketsRed - 1);
    updateTicketsUI();
    checkMatchEnd();
  }
}
// プレイヤーの攻撃による撃破
function playerKillSoldier(s, point, isHead = false) {
  if (!s.alive) return;
  s.alive = false; s.deathT = 0;
  s.deaths++;                                      // v0.2.3
  game.kills++;
  game.score += isHead ? 150 : 100;
  game.ticketsRed = Math.max(0, game.ticketsRed - 1);
  sfx.kill();
  if (isHead) {
    // v0.2.2: HEADSHOT バナー + スローヒット風の画面揺れ
    showHeadshotBanner();
    shake = Math.max(shake, 0.12);
    addFeed('💀 HEADSHOT! +150', 'blue');
  } else {
    addFeed('敵兵を倒した +100');
  }
  updateScoreUI(); updateTicketsUI();
  checkMatchEnd();
}
let hsBannerTO = null;
function showHeadshotBanner() {
  const b = document.getElementById('hs-banner');
  b.classList.add('show');
  clearTimeout(hsBannerTO);
  hsBannerTO = setTimeout(() => b.classList.remove('show'), 800);
}
function damageSoldierByPlayer(s, dmg, point, isHead = false) {
  if (!s.alive) return;
  if (s.team === 1) return; // 味方は撃てない (FFなし)
  s.hp -= dmg;
  if (isHead) {
    // v0.2.2: ヘッドショット演出強化
    spawnParticles(point, 0xff2200, 12, 5, 1.6);
    spawnParticles(point, 0xffcc44, 6, 4, 1.2);
    sfx.headshot();
  } else {
    spawnParticles(point, 0xbb2222, 6, 3);
    sfx.hit();
  }
  if (s.hp <= 0) playerKillSoldier(s, point, isHead);
}
