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
// v0.3.2: 追加装備マテリアル
const matBoots = new THREE.MeshLambertMaterial({ color: 0x2b241c });
const matPouch = new THREE.MeshLambertMaterial({ color: 0x3e4436 });
const matGoggle = new THREE.MeshLambertMaterial({ color: 0x141618 });
const matGoggleLens = new THREE.MeshLambertMaterial({ color: 0x88b0c8 });
const matPackRed = new THREE.MeshLambertMaterial({ color: 0x4a4237 });
const matPackBlue = new THREE.MeshLambertMaterial({ color: 0x38444e });
const SG = {
  torso: new THREE.BoxGeometry(0.62, 0.78, 0.36),
  vest: new THREE.BoxGeometry(0.66, 0.5, 0.4),
  head: new THREE.BoxGeometry(0.32, 0.32, 0.32),
  helmet: new THREE.BoxGeometry(0.38, 0.18, 0.38),
  helmetBrim: new THREE.BoxGeometry(0.4, 0.05, 0.12),
  goggle: new THREE.BoxGeometry(0.3, 0.09, 0.06),
  lens: new THREE.BoxGeometry(0.11, 0.07, 0.02),
  leg: new THREE.BoxGeometry(0.22, 0.5, 0.24),
  boot: new THREE.BoxGeometry(0.24, 0.18, 0.32),
  knee: new THREE.BoxGeometry(0.24, 0.14, 0.1),
  arm: new THREE.BoxGeometry(0.16, 0.6, 0.2),
  shoulder: new THREE.BoxGeometry(0.2, 0.14, 0.24),
  pack: new THREE.BoxGeometry(0.5, 0.55, 0.22),
  packTop: new THREE.BoxGeometry(0.42, 0.16, 0.18),
  pouch: new THREE.BoxGeometry(0.14, 0.18, 0.1),
  belt: new THREE.BoxGeometry(0.64, 0.08, 0.38),
  gun: new THREE.BoxGeometry(0.08, 0.1, 0.8),
  gunMag: new THREE.BoxGeometry(0.06, 0.18, 0.1),
  gunStock: new THREE.BoxGeometry(0.07, 0.12, 0.22),
  gunBarrel: new THREE.BoxGeometry(0.04, 0.04, 0.3)
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
  const matPack = team === 1 ? matPackBlue : matPackRed;
  const torso = new THREE.Mesh(SG.torso, matBody); torso.position.y = 1.05;
  const vest = new THREE.Mesh(SG.vest, matGear); vest.position.y = 1.12;
  const belt = new THREE.Mesh(SG.belt, matBoots); belt.position.y = 0.72;
  const head = new THREE.Mesh(SG.head, matHead); head.position.y = 1.66;
  const helmet = new THREE.Mesh(SG.helmet, matGear); helmet.position.y = 1.85;
  const brim = new THREE.Mesh(SG.helmetBrim, matGear); brim.position.set(0, 1.78, -0.18);
  // v0.3.2: ゴーグル (ヘルメット前面)
  const goggle = new THREE.Mesh(SG.goggle, matGoggle); goggle.position.set(0, 1.7, -0.17);
  const lensL = new THREE.Mesh(SG.lens, matGoggleLens); lensL.position.set(-0.07, 1.7, -0.2);
  const lensR = lensL.clone(); lensR.position.x = 0.07;
  const legL = new THREE.Mesh(SG.leg, matBody); legL.position.set(-0.16, 0.41, 0);
  // v0.3.2: ブーツ・膝当て (脚の子にして歩行アニメに追従)
  const bootL = new THREE.Mesh(SG.boot, matBoots); bootL.position.set(0, -0.32, -0.03);
  const kneeL = new THREE.Mesh(SG.knee, matGear); kneeL.position.set(0, 0.11, -0.14);
  legL.add(bootL, kneeL);
  const legR = legL.clone(); legR.position.x = 0.16;
  const armL = new THREE.Mesh(SG.arm, matBody); armL.position.set(-0.42, 1.1, 0);
  const armR = armL.clone(); armR.position.x = 0.42;
  // v0.3.2: 肩パッド
  const shL = new THREE.Mesh(SG.shoulder, matGear); shL.position.set(-0.42, 1.42, 0);
  const shR = shL.clone(); shR.position.x = 0.42;
  // v0.3.2: バックパック + マガジンポーチ
  const pack = new THREE.Mesh(SG.pack, matPack); pack.position.set(0, 1.1, 0.3);
  const packTop = new THREE.Mesh(SG.packTop, matPack); packTop.position.set(0, 1.46, 0.28);
  const pouch1 = new THREE.Mesh(SG.pouch, matPouch); pouch1.position.set(-0.18, 0.98, -0.23);
  const pouch2 = pouch1.clone(); pouch2.position.x = 0;
  const pouch3 = pouch1.clone(); pouch3.position.x = 0.18;
  // v0.3.2: 銃の詳細 (マガジン・ストック・銃身)
  const gun = new THREE.Mesh(SG.gun, matGun); gun.position.set(0.2, 1.25, -0.4);
  const gunMag = new THREE.Mesh(SG.gunMag, matGun); gunMag.position.set(0.2, 1.12, -0.45);
  const gunStock = new THREE.Mesh(SG.gunStock, matGun); gunStock.position.set(0.2, 1.22, 0.05);
  const gunBarrel = new THREE.Mesh(SG.gunBarrel, matGun); gunBarrel.position.set(0.2, 1.27, -0.9);
  head.userData.isHead = true;
  g.add(torso, vest, belt, head, helmet, brim, goggle, lensL, lensR,
        legL, legR, armL, armR, shL, shR,
        pack, packTop, pouch1, pouch2, pouch3, gun, gunMag, gunStock, gunBarrel);
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
    inVehicle: null, seatIdx: 0, gunCd: 0, spotted: 0,   // v0.3
    vy: 0, onGround: true, jumpCd: 0,                    // v0.3.1: ジャンプ
    squad: null, nadeCd: 6 + Math.random() * 10, smokeCd: 0,   // v0.4.1: 分隊 / グレネード
    // v0.2.3: スコアボード用戦績
    name: (team === 1 ? 'BLU-' : 'RED-') + SOLDIER_NAMES[soldierNameIdx++ % SOLDIER_NAMES.length],
    kills: 0, deaths: 0, score: 0
  };
  g.traverse(m => { if (m.isMesh) { m.userData.soldier = s; m.castShadow = !isMobile; soldierHitMeshes.push(m); } });
  scene.add(g);
  soldiers.push(s);
  return s;
}

/* =========================================================
   v0.4.1: 分隊システム — 4人1組で移動・制圧・旗防衛
   隊長が目標拠点を選び、隊員は隊長に追従する
   ========================================================= */
const allSquads = [];
function assignSquads() {
  allSquads.length = 0;
  for (const team of [1, -1]) {
    const members = soldiers.filter(s => s.team === team);
    for (let i = 0; i < members.length; i += 4) {
      const sq = { members: members.slice(i, i + 4), leader: null };
      for (let k = 0; k < sq.members.length; k++) {
        sq.members[k].squad = sq;
        sq.members[k].squadSlot = k;   // 隊内の位置 (フォーメーションオフセット)
      }
      allSquads.push(sq);
    }
  }
}
function squadLeader(sq) {
  if (!sq) return null;
  if (sq.leader && sq.leader.alive && !sq.leader.inVehicle) return sq.leader;
  sq.leader = sq.members.find(m => m.alive && !m.inVehicle) || null;
  return sq.leader;
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
    const concealV055 = typeof vehicleCamoConcealmentV055 === 'function' ? vehicleCamoConcealmentV055(curVehicle) : 0;
    if (vd < bd + 10 && Math.random() >= concealV055) best = { kind: 'vehicle' };
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
    // v0.3: ドローンによるスポット残時間
    if (s.spotted > 0) s.spotted -= dt;
    // v0.3: 車両に搭乗中のAIは座席位置に追従 (思考・移動スキップ)
    if (s.alive && s.inVehicle) {
      const v = s.inVehicle;
      if (!v.alive) { s.inVehicle = null; }
      else {
        const wp = seatWorldPos(v, s.seatIdx);
        s.obj.position.set(wp.x, wp.y - 1.0, wp.z);
        s.obj.rotation.y = v.yaw + Math.PI;
        s.marker.visible = s.team === 1;
        continue;
      }
    }
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
          s.vy = 0; s.onGround = true; s.jumpCd = 0;   // v0.3.1
          s.targetFlag = null; s.engageTarget = null; s.aimT = 0;
          s.shootCd = 1 + Math.random();
          if (typeof initAiSoldierV052 === 'function') initAiSoldierV052(s);
          if (typeof initAiSoldierV053 === 'function') initAiSoldierV053(s);
          s.marker.visible = s.team === 1;   // 味方マーカー復帰
        } else {
          s.obj.visible = false; // チケット切れは復活しない
        }
      }
      continue;
    }
    const sp = s.obj.position;
    updateSoldierSuppressionV047(s, dt);   // v0.4.7: flinch and recovery
    if (typeof updateAiVehicleClaimsV053 === 'function') updateAiVehicleClaimsV053(s, dt);
    if (typeof updateGrenadeReactionV053 === 'function') updateGrenadeReactionV053(s, dt);

    // ---- チームマーカー更新 (v0.2.1) ----
    // 敵は「プレイヤーから視線が通り70m以内」のときのみ表示 (0.3秒間隔で判定)
    s.markerT -= dt;
    if (s.markerT <= 0) {
      s.markerT = 0.3;
      if (s.team === -1) {
        const pd = Math.hypot(sp.x - player.pos.x, sp.z - player.pos.z);
        s.seenByPlayer = player.alive && pd < 70 &&
          hasLineOfSight(player.pos.clone(), new THREE.Vector3(sp.x, sp.y + 1.5, sp.z));
        s.marker.visible = s.seenByPlayer || s.spotted > 0;   // v0.3: スポット中も表示
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
      } else {
        // v0.4.1: 分隊行動 — 隊員は隊長の目標に追従、隊長は自分で選ぶ
        const ldr = squadLeader(s.squad);
        if (ldr && ldr !== s && ldr.targetFlag) {
          s.targetFlag = ldr.targetFlag;
        } else if (!s.targetFlag || (s.targetFlag.own === s.team && Math.random() < 0.6)) {
          s.targetFlag = pickFlagFor(s);
        }
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
    if (typeof updateSoldierLogisticsV052 === 'function') updateSoldierLogisticsV052(s, dt, tgt, tPos, tDist);

    // ---- 視線チェック (間引き) ----
    s.losT -= dt;
    if (s.losT <= 0) {
      s.losT = 0.25 + Math.random() * 0.15;
      const losRangeV051 = s.aiSniperV051 && s.sniperHoldingV051 ? 115 : 80;
      if (tPos && tDist < losRangeV051) {
        const eye = new THREE.Vector3(sp.x, sp.y + 1.6, sp.z);
        s.hasLos = hasLineOfSight(eye, tPos) && !smokeBlocks(eye, tPos);   // v0.4.1: スモークで視線切り
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
        // v0.4.1: 分隊フォーメーション — 隊長から離れすぎた隊員は隊長のもとへ合流
        const ldr = squadLeader(s.squad);
        if (ldr && ldr !== s && fd > FLAG_R + 8) {
          const ld = Math.hypot(ldr.obj.position.x - sp.x, ldr.obj.position.z - sp.z);
          if (ld > 16) {
            // 隊長の周囲にスロットごとのオフセットで付いていく
            const a = s.squadSlot * 2.1;
            destX = ldr.obj.position.x + Math.cos(a) * 4;
            destZ = ldr.obj.position.z + Math.sin(a) * 4;
            wantDist = 2;
          } else {
            destX = s.targetFlag.x; destZ = s.targetFlag.z; wantDist = FLAG_R * 0.5;
          }
        } else {
          destX = s.targetFlag.x; destZ = s.targetFlag.z; wantDist = FLAG_R * 0.5;
        }
      }
    } else { destX = sp.x; destZ = sp.z; }

    // v0.5.2: 分隊隊列・膠着時フランキング・弾切れ時撤退/近接
    if (typeof tacticalDestinationV052 === 'function') {
      const tactical = tacticalDestinationV052(s, destX, destZ, tgt, tPos, tDist);
      destX = tactical.x; destZ = tactical.z;
    }

    // v0.5.1: 狙撃兵は高所の固定ポジションへ移動し、到着後は伏せて粘る
    if (typeof sniperDestinationV051 === 'function') {
      const nest = sniperDestinationV051(s);
      if (nest) {
        destX = nest.x; destZ = nest.z;
        if (nest.hold && !(tgt && s.hasLos)) { destX = sp.x; destZ = sp.z; }
      }
    }

    // v0.5.3: 空車両への搭乗判断。手榴弾回避は全行動より優先する
    if (typeof vehicleClaimDestinationV053 === 'function') {
      const vehicleDest = vehicleClaimDestinationV053(s);
      if (vehicleDest) { destX = vehicleDest.x; destZ = vehicleDest.z; wantDist = 0; }
    }
    let grenadeEvadeV053 = null;
    if (typeof grenadeEvadeDestinationV053 === 'function') {
      grenadeEvadeV053 = grenadeEvadeDestinationV053(s);
      if (grenadeEvadeV053) { destX = grenadeEvadeV053.x; destZ = grenadeEvadeV053.z; wantDist = 0; }
    }

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
    if (grenadeEvadeV053 && grenadeEvadeV053.prone) { mvx = 0; mvz = 0; }

    // 障害物回避 (v0.3.1: 狭い隙間対応 + ジャンプ)
    s.jumpCd -= dt;
    if (s.avoidT > 0) {
      s.avoidT -= dt;
      const ax = -mvz * s.avoidDir, az = mvx * s.avoidDir;
      // 回避方向も塞がっていたら逆側へ即切替 (壁際での往復を防ぐ)
      if (collidesAt(sp.x + ax * 1.2, sp.z + az * 1.2, 0.35, sp.y)) {
        s.avoidDir *= -1;
        mvx = -ax; mvz = -az;
      } else { mvx = ax; mvz = az; }
    } else if (mvx || mvz) {
      const px = sp.x + mvx * s.speed * dt * 8, pz = sp.z + mvz * s.speed * dt * 8;
      if (collidesAt(px, pz, 0.35, sp.y) || isDeepWater(px, pz)) {
        // v0.3.1: 低い障害物はジャンプで乗り越える
        if (s.onGround && s.jumpCd <= 0 && aiCanJumpOver(s, px, pz)) {
          s.vy = 6.5;
          s.onGround = false;
          s.jumpCd = 1.2;
        } else {
          // 狭い隙間: 左右を先読みして空いている側を選択 (ランダムではなく)
          const lx = sp.x - mvz * 1.5, lz = sp.z + mvx * 1.5;
          const rx = sp.x + mvz * 1.5, rz = sp.z - mvx * 1.5;
          const leftFree = !collidesAt(lx, lz, 0.35, sp.y) && !isDeepWater(lx, lz);
          const rightFree = !collidesAt(rx, rz, 0.35, sp.y) && !isDeepWater(rx, rz);
          if (leftFree && !rightFree) s.avoidDir = 1;
          else if (rightFree && !leftFree) s.avoidDir = -1;
          else s.avoidDir = Math.random() < .5 ? -1 : 1;
          s.avoidT = 0.4 + Math.random() * 0.4;
        }
      }
    }

    // 目的地が遠く非交戦ならダッシュ (広いマップでの移動時間短縮)
    let spd = (!tgt && dist > 30) ? s.speed * 1.7 : s.speed;
    if (grenadeEvadeV053 && !grenadeEvadeV053.prone) spd *= 1.65;
    const inWater = terrainH(sp.x, sp.z) < WATER_Y - 0.2;   // v0.3: 浅瀬は渡れるが減速
    if (inWater) spd *= 0.5;
    // v0.3.1: 当たり半径を 0.4→0.35 に縮小 (狭い隙間・ドアを通れるように)
    const nx = sp.x + mvx * spd * dt, nz = sp.z + mvz * spd * dt;
    if (!collidesAt(nx, sp.z, 0.35, sp.y) && !isDeepWater(nx, sp.z)) sp.x = nx;
    if (!collidesAt(sp.x, nz, 0.35, sp.y) && !isDeepWater(sp.x, nz)) sp.z = nz;
    // v0.3.1: 垂直物理 (ジャンプ / 落下 / 障害物の上に乗る)
    const gBase = groundHeightAt(sp.x, sp.z, 0.35, sp.y);
    const gY = inWater ? Math.max(gBase, WATER_Y - 0.9) : gBase;
    if (!s.onGround) {
      s.vy -= 18 * dt;
      sp.y += s.vy * dt;
      if (sp.y <= gY && s.vy <= 0) { sp.y = gY; s.vy = 0; s.onGround = true; }
    } else if (sp.y > gY + 0.7) {
      s.onGround = false; s.vy = 0;                       // 段差から落下
    } else {
      sp.y = gY;                                          // 地形追従
    }

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

    // ---- v0.4.1: グレネード / スモーク使用 ----
    s.nadeCd -= dt;
    s.smokeCd -= dt;
    if (s.nadeCd <= 0 && tgt && tDist > 7 && tDist < 26) {
      // 籠城相手(視線なしで位置は把握) or 交戦中の相手に山なり投擲
      if (!s.hasLos || Math.random() < 0.4) {
        s.nadeCd = 10 + Math.random() * 10;
        aiThrowGrenade(s, tPos);
      } else {
        s.nadeCd = 3;
      }
    }
    // スモーク: 低HPで撤退中に自分の位置へ展開 (隠れ蔑として離脱)
    if (s.smokeCd <= 0 && retreating) {
      s.smokeCd = 30;
      spawnSmokeAt(new THREE.Vector3(sp.x, sp.y + 0.5, sp.z));
    }

    // ---- 射撃 ----
    s.shootCd -= dt;
    trySuppressionFireV047(s, tgt, tPos, tDist, dt);
    const effectiveRangeV051 = s.aiSniperV051 && s.sniperHoldingV051 ? 115 : 65;
    if (tgt && s.hasLos && tDist < effectiveRangeV051) s.aimT += dt; else s.aimT = 0;
    if (s.shootCd <= 0 && s.aimT > (s.aiSniperV051 ? 0.6 : 0.35) && tgt && tDist < effectiveRangeV051 &&
        (typeof aiCanFireV052 !== 'function' || aiCanFireV052(s))) {
      if (typeof consumeAiRoundV052 === 'function') consumeAiRoundV052(s);
      s.shootCd = 1.0 + Math.random() * 1.5;
      const eye = new THREE.Vector3(sp.x, sp.y + 1.6, sp.z);
      // v0.3.3: 発砲直前に視線を再チェック — 壁越しの命中 (弾の壁貫通) を防ぐ
      if (!hasLineOfSight(eye, tPos)) {
        // v0.4.1: 遮蔽が窓ガラスなら撃ち抜く — 建物籠城への対抗手段
        const dir = tPos.clone().sub(eye);
        const dist2 = dir.length();
        raycaster.set(eye, dir.normalize());
        raycaster.far = dist2;
        const hits = raycaster.intersectObjects(solidMeshes, false);
        const wpHit = hits.length && hits[0].object.userData.windowPane && !hits[0].object.userData.windowPane.broken;
        if (wpHit && tDist < 40) {
          sfx.distShoot(camera.position.distanceTo(eye));
          spawnTracer(eye, hits[0].point, s.team === 1 ? 0x8ecbff : 0xff8866);
          breakWindow(hits[0].object.userData.windowPane);
        }
        s.hasLos = false; s.aimT = 0.3; continue;   // 次フレームで本命を狙う
      }
      sfx.distShoot(camera.position.distanceTo(eye));
      const tracerColor = s.team === 1 ? 0x8ecbff : 0xff8866;
      if (tgt.kind === 'vehicle' && curVehicle) {
        const concealV055 = typeof vehicleCamoConcealmentV055 === 'function' ? vehicleCamoConcealmentV055(curVehicle) : 0;
        const hit = Math.random() < Math.max(0.08, 0.75 - tDist * 0.007 - concealV055);
        const target = tPos.clone();
        if (!hit) { target.x += (Math.random() - .5) * 4; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 4; }
        spawnTracer(eye, target, tracerColor);
        if (hit) {
          const raw = 6 + Math.random() * 8;
          const vdmg = curVehicle.type === 'tank' ? raw * 0.35 : raw * 1.6;
          spawnParticles(target, 0xffee88, 3, 3);
          damageVehicle(curVehicle, vdmg, 'smallarms');   // v0.3
          showDamageDirection(eye);
        }
      } else if (tgt.kind === 'player') {
        const playerMoving = moveMag() > 0.1 ? 0.18 : 0;
        // v0.4.0: しゃがみ/伏せで被弾判定を縮小 (当てられにくい)
        const stancePen = player.stance === 2 ? 0.22 : player.stance === 1 ? 0.12 : 0;
        // v0.4.1: スモーク越しは大幅に当たらない
        const smokePen = smokeBlocks(eye, tPos) ? 0.3 : 0;
        const concealPen = typeof playerConcealment === 'function' ? playerConcealment() : 0;
        const hitChance = Math.max(0.02, 0.5 - tDist * 0.007 - playerMoving - stancePen - smokePen - concealPen - suppressionAimPenaltyV047(s));
        const hit = Math.random() < hitChance;
        const target = player.pos.clone();
        if (!hit) { target.x += (Math.random() - .5) * 3; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 3; }
        spawnTracer(eye, target, tracerColor);
        if (hit) damagePlayer(6 + Math.random() * 8 | 0, eye);
        else if (target.distanceTo(player.pos) < 3.2) suppressPlayerV047(.18, eye);
      } else if (tgt.kind === 'soldier') {
        const sniperBonusV051 = s.aiSniperV051 && s.sniperHoldingV051 ? 0.2 : 0;
        const roleBonusV052 = typeof aiRoleAccuracyV052 === 'function' ? aiRoleAccuracyV052(s) : 0;
        const hit = Math.random() < Math.max(0.08, 0.42 + sniperBonusV051 + roleBonusV052 - tDist * 0.005);
        const target = tPos.clone();
        if (!hit) { target.x += (Math.random() - .5) * 3; target.y += (Math.random() - .5) * 2; target.z += (Math.random() - .5) * 3; }
        spawnTracer(eye, target, tracerColor);
        if (hit) damageSoldier(tgt.s, 12 + Math.random() * 14, target, s.team === 1, s);
      }
    }
  }
}

// v0.3.1: 目の前の障害物がジャンプで乗り越えられる高さか判定
function aiCanJumpOver(s, px, pz) {
  const feetY = s.obj.position.y;
  let jumpable = false;
  for (const o of obstacles) {
    if (px + 0.35 > o.minX && px - 0.35 < o.maxX && pz + 0.35 > o.minZ && pz - 0.35 < o.maxZ) {
      if (o.y0 > feetY + 1.9) continue;                // 頭上はくぐれるので無視
      const top = o.h - feetY;
      if (top <= 0.35) continue;                       // 歩いて乗り越え可
      if (top > 1.35) return false;                    // 高すぎる壁は飛べない
      jumpable = true;
    }
  }
  return jumpable;
}

// v0.3: 死亡時に座席を解放
function vacateSeat(s) {
  if (!s.inVehicle) return;
  const v = s.inVehicle;
  if (v.seats[s.seatIdx] && v.seats[s.seatIdx].occ === s) v.seats[s.seatIdx].occ = null;
  s.inVehicle = null;
}
function damageSoldier(s, dmg, point, byPlayerTeam, killer = null) {
  if (!s.alive) return;
  s.hp -= dmg;
  spawnParticles(point, 0xbb2222, 5, 3);
  if (s.hp <= 0) {
    s.alive = false; s.deathT = 0;
    vacateSeat(s);
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
  vacateSeat(s);
  s.deaths++;                                      // v0.2.3
  game.kills++;
  if (typeof onPlayerKillV043 === 'function') onPlayerKillV043();
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
