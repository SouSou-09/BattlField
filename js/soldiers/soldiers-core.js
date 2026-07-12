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
