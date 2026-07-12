'use strict';
/* v0.5.9 — 拠点防衛ボーナス、ダイナミックオブジェクティブ、前線可視化 */

const v059 = {
  // 防衛ボーナス: flagId → { team, time, awarded: [] }
  flagHold: {},
  defenseBonusBlue: 0,
  defenseBonusRed: 0,
  // ダイナミックオブジェクティブ
  objective: null,
  nextObjectiveT: 45,
  objectiveCount: 0,
  objectivesCompleted: 0,
  // 3D markers
  vipMarker: null,
  supplyMesh: null,
  // HUD
  hud: null
};

// 防衛ボーナス閾値 (秒 → チケット)
const DEFENSE_TIERS_V059 = [
  { t: 30, bonus: 3 },
  { t: 60, bonus: 5 },
  { t: 120, bonus: 8 }
];

// 拠点間の隣接関係 (flags配列のインデックス)
// A=0 B=1 C=2 D=3 E=4 F=5
const FLAG_ADJACENCY_V059 = [
  [0, 1], // A-B
  [0, 2], // A-C
  [1, 2], // B-C
  [2, 3], // C-D
  [2, 4], // C-E
  [2, 5], // C-F
  [3, 5], // D-F
  [4, 5]  // E-F
];

/* =========================================================
   VIPマーカーテクスチャ
   ========================================================= */
function makeVipMarkerTextureV059() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd257';
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32, 6); g.lineTo(54, 32); g.lineTo(32, 58); g.lineTo(10, 32);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1a1a1a';
  g.font = 'bold 22px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('V', 32, 33);
  return new THREE.CanvasTexture(c);
}

/* =========================================================
   動的目標HUD (DOM動的生成)
   ========================================================= */
function ensureObjectiveHudV059() {
  if (v059.hud) return;
  const el = document.createElement('div');
  el.id = 'obj-hud-v059';
  el.style.cssText = 'position:absolute;top:56px;left:50%;transform:translateX(-50%);' +
    'background:rgba(10,18,28,.82);border:1px solid rgba(255,210,87,.5);border-radius:5px;' +
    'padding:3px 14px;font:bold 12px/1.6 sans-serif;color:#ffd257;' +
    'display:none;z-index:6;pointer-events:none;white-space:nowrap;letter-spacing:.5px';
  document.body.appendChild(el);
  v059.hud = el;
}

function updateObjectiveHudV059() {
  ensureObjectiveHudV059();
  if (!v059.objective) { v059.hud.style.display = 'none'; return; }
  const obj = v059.objective;
  const remain = Math.max(0, Math.ceil(obj.timeLeft));
  const side = obj.team === 1 ? '味方' : '敵';
  if (obj.type === 'vip') {
    v059.hud.textContent = '\u25C6 VIP護衛 [' + side + '] 残り ' + remain + 's';
  } else {
    v059.hud.textContent = '\u25C6 物資回収 [' + side + '] 残り ' + remain + 's';
  }
  v059.hud.style.display = 'block';
}

/* =========================================================
   拠点防衛ボーナス — 防衛継続時間に応じてチケット付与
   ========================================================= */
function updateDefenseBonusV059(dt) {
  for (const f of flags) {
    if (f.own === 0) {
      v059.flagHold[f.id] = { team: 0, time: 0, awarded: [] };
      continue;
    }
    let rec = v059.flagHold[f.id];
    if (!rec || rec.team !== f.own) {
      rec = v059.flagHold[f.id] = { team: f.own, time: 0, awarded: [] };
    }
    rec.time += dt;
    for (let i = 0; i < DEFENSE_TIERS_V059.length; i++) {
      if (rec.time >= DEFENSE_TIERS_V059[i].t && !rec.awarded.includes(i)) {
        rec.awarded.push(i);
        const bonus = DEFENSE_TIERS_V059[i].bonus;
        if (f.own === 1) {
          game.ticketsBlue = Math.min(200, game.ticketsBlue + bonus);
          v059.defenseBonusBlue += bonus;
          addFeed(f.id + ' 拠点 防衛ボーナス +' + bonus, 'blue');
        } else {
          game.ticketsRed = Math.min(200, game.ticketsRed + bonus);
          v059.defenseBonusRed += bonus;
          addFeed(f.id + ' 拠点 防衛ボーナス +' + bonus, 'red');
        }
        updateTicketsUI();
      }
    }
  }
}

/* =========================================================
   ダイナミックオブジェクティブ — VIP護衛 / 物資回収
   ========================================================= */
function startObjectiveV059() {
  v059.objectiveCount++;
  const isVip = v059.objectiveCount % 2 === 1;

  if (isVip) {
    // VIP護衛: ランダムな陣営の生存兵士をVIPに指定
    const team = Math.random() < 0.5 ? 1 : -1;
    const candidates = soldiers.filter(s => s.alive && s.team === team);
    if (candidates.length === 0) {
      v059.objective = null;
      v059.nextObjectiveT = 15;
      return;
    }
    const vip = candidates[Math.floor(Math.random() * candidates.length)];
    v059.objective = { type: 'vip', team, vip, timeLeft: 45, maxTime: 45 };

    if (!v059.vipMarker) {
      const mat = new THREE.SpriteMaterial({
        map: makeVipMarkerTextureV059(),
        transparent: true, depthTest: false, depthWrite: false
      });
      v059.vipMarker = new THREE.Sprite(mat);
      v059.vipMarker.scale.set(0.8, 0.8, 1);
      v059.vipMarker.renderOrder = 1000;
      scene.add(v059.vipMarker);
    }
    v059.vipMarker.visible = true;
    v059.vipMarker.position.set(vip.obj.position.x, vip.obj.position.y + 2.8, vip.obj.position.z);

    const side = team === 1 ? '味方' : '敵';
    const task = team === 1 ? '防衛' : '排除';
    addFeed('【動的目標】VIP護衛: ' + side + 'の要人を' + task + 'せよ (45s)', team === 1 ? 'blue' : 'red');
  } else {
    // 物資回収: ランダム拠点周辺に物資を出現
    const team = Math.random() < 0.5 ? 1 : -1;
    const f = flags[Math.floor(Math.random() * flags.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 25;
    const x = f.x + Math.cos(angle) * dist;
    const z = f.z + Math.sin(angle) * dist;
    v059.objective = { type: 'supply', team, x, z, timeLeft: 75, maxTime: 75 };

    if (!v059.supplyMesh) {
      const geo = new THREE.BoxGeometry(1.6, 1.3, 1.6);
      const mat = new THREE.MeshLambertMaterial({ color: 0x9a7050 });
      v059.supplyMesh = new THREE.Mesh(geo, mat);
      v059.supplyMesh.castShadow = !isMobile;
      scene.add(v059.supplyMesh);
    }
    v059.supplyMesh.position.set(x, terrainH(x, z) + 0.65, z);
    v059.supplyMesh.visible = true;

    const side = team === 1 ? '味方' : '敵';
    addFeed('【動的目標】物資回収: ' + side + 'が指定地点の物資を確保せよ (75s)', team === 1 ? 'blue' : 'red');
  }
}

function updateObjectiveV059(dt) {
  if (!v059.objective) {
    v059.nextObjectiveT -= dt;
    if (v059.nextObjectiveT <= 0) startObjectiveV059();
    updateObjectiveHudV059();
    return;
  }

  v059.objective.timeLeft -= dt;

  if (v059.objective.type === 'vip') {
    const vip = v059.objective.vip;
    if (v059.vipMarker) {
      if (vip.alive) {
        v059.vipMarker.position.set(vip.obj.position.x, vip.obj.position.y + 2.8, vip.obj.position.z);
      } else {
        v059.vipMarker.visible = false;
      }
    }

    if (!vip.alive) {
      // VIP戦死 → 敵チームにボーナス
      const enemyTeam = -v059.objective.team;
      if (enemyTeam === 1) {
        game.ticketsBlue = Math.min(200, game.ticketsBlue + 5);
        addFeed('任務成功: 敵VIPを排除 +5チケット', 'blue');
        if (player.alive) { game.score += 50; updateScoreUI(); }
      } else {
        game.ticketsRed = Math.min(200, game.ticketsRed + 5);
        addFeed('任務失敗: 味方VIPが戦死', 'red');
      }
      updateTicketsUI();
      v059.objectivesCompleted++;
      v059.objective = null;
      v059.nextObjectiveT = 30 + Math.random() * 15;
    } else if (v059.objective.timeLeft <= 0) {
      // VIP生還 → 味方チームにボーナス
      if (v059.objective.team === 1) {
        game.ticketsBlue = Math.min(200, game.ticketsBlue + 8);
        addFeed('任務成功: VIP護衛完了 +8チケット', 'blue');
        if (player.alive) { game.score += 50; updateScoreUI(); }
      } else {
        game.ticketsRed = Math.min(200, game.ticketsRed + 8);
        addFeed('任務失敗: 敵VIP護衛成功', 'red');
      }
      if (v059.vipMarker) v059.vipMarker.visible = false;
      updateTicketsUI();
      v059.objectivesCompleted++;
      v059.objective = null;
      v059.nextObjectiveT = 30 + Math.random() * 15;
    }
  } else if (v059.objective.type === 'supply') {
    const ox = v059.objective.x, oz = v059.objective.z;
    const team = v059.objective.team;
    let reached = false;

    // プレイヤー判定
    if (team === 1 && player.alive) {
      if (Math.hypot(player.pos.x - ox, player.pos.z - oz) < 12) {
        reached = true;
        game.score += 100;
        updateScoreUI();
        addFeed('物資回収完了! +100 SCORE +6チケット', 'blue');
      }
    }
    // AI兵士判定
    if (!reached) {
      for (const s of soldiers) {
        if (!s.alive || s.team !== team) continue;
        if (Math.hypot(s.obj.position.x - ox, s.obj.position.z - oz) < 12) {
          reached = true;
          addFeed(team === 1 ? '分隊が物資を回収 +6チケット' : '敵が物資を回収', team === 1 ? 'blue' : 'red');
          break;
        }
      }
    }

    if (reached) {
      if (team === 1) game.ticketsBlue = Math.min(200, game.ticketsBlue + 6);
      else game.ticketsRed = Math.min(200, game.ticketsRed + 6);
      updateTicketsUI();
      v059.objectivesCompleted++;
      if (v059.supplyMesh) v059.supplyMesh.visible = false;
      v059.objective = null;
      v059.nextObjectiveT = 30 + Math.random() * 15;
    } else if (v059.objective.timeLeft <= 0) {
      addFeed('物資回収期限切れ', '');
      if (v059.supplyMesh) v059.supplyMesh.visible = false;
      v059.objective = null;
      v059.nextObjectiveT = 30 + Math.random() * 15;
    }
  }

  updateObjectiveHudV059();
}

/* =========================================================
   前線可視化 — 拠点支配状況からラインを描画
   ========================================================= */
function drawFrontLineV059(g, transformFn, lineWidth) {
  for (const [a, b] of FLAG_ADJACENCY_V059) {
    const fa = flags[a], fb = flags[b];
    if (!fa || !fb) continue;
    const [ax, ay] = transformFn(fa.x, fa.z);
    const [bx, by] = transformFn(fb.x, fb.z);

    if (fa.own !== 0 && fa.own === fb.own) {
      // 同一陣営の支配領域
      g.strokeStyle = fa.own === 1 ? 'rgba(109,180,255,.55)' : 'rgba(255,107,94,.55)';
      g.setLineDash([]);
    } else if (fa.own !== 0 && fb.own !== 0 && fa.own !== fb.own) {
      // 活動中の前線 (青 vs 赤)
      g.strokeStyle = 'rgba(255,210,87,.75)';
      g.setLineDash([5, 3]);
    } else {
      // 中立・未確定領域
      g.strokeStyle = 'rgba(160,160,160,.3)';
      g.setLineDash([3, 3]);
    }
    g.lineWidth = lineWidth;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  g.setLineDash([]);
}

function drawFrontLineRadarV059(g, toRadar) {
  drawFrontLineV059(g, toRadar, 1.5);
}

function drawFrontLineMapV059(g, toMap) {
  drawFrontLineV059(g, toMap, 3);
}

/* =========================================================
   動的目標マーカー — ミニマップ/全体マップに表示
   ========================================================= */
function drawObjectiveRadarV059(g, toRadar) {
  if (!v059.objective) return;
  if (v059.objective.type === 'vip' && v059.objective.vip.alive) {
    const [px, pz] = toRadar(v059.objective.vip.obj.position.x, v059.objective.vip.obj.position.z);
    g.fillStyle = '#ffd257';
    g.beginPath();
    g.moveTo(px, pz - 5); g.lineTo(px + 4, pz); g.lineTo(px, pz + 5); g.lineTo(px - 4, pz);
    g.closePath(); g.fill();
  } else if (v059.objective.type === 'supply') {
    const [px, pz] = toRadar(v059.objective.x, v059.objective.z);
    g.fillStyle = '#ffd257';
    g.fillRect(px - 3, pz - 3, 6, 6);
  }
}

function drawObjectiveMapV059(g, toMap) {
  if (!v059.objective) return;
  if (v059.objective.type === 'vip' && v059.objective.vip.alive) {
    const [px, py] = toMap(v059.objective.vip.obj.position.x, v059.objective.vip.obj.position.z);
    g.fillStyle = '#ffd257';
    g.beginPath();
    g.moveTo(px, py - 8); g.lineTo(px + 7, py); g.lineTo(px, py + 8); g.lineTo(px - 7, py);
    g.closePath(); g.fill();
    g.fillStyle = '#1a1a1a';
    g.font = 'bold 9px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('V', px, py);
  } else if (v059.objective.type === 'supply') {
    const [px, py] = toMap(v059.objective.x, v059.objective.z);
    g.fillStyle = '#ffd257';
    g.fillRect(px - 5, py - 5, 10, 10);
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 1.5;
    g.strokeRect(px - 5, py - 5, 10, 10);
    g.fillStyle = '#1a1a1a';
    g.font = 'bold 8px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('S', px, py);
  }
}

/* =========================================================
   メイン更新 / リセット
   ========================================================= */
function updateV059(dt) {
  updateDefenseBonusV059(dt);
  updateObjectiveV059(dt);
}

function resetV059() {
  v059.flagHold = {};
  v059.defenseBonusBlue = 0;
  v059.defenseBonusRed = 0;
  v059.objective = null;
  v059.nextObjectiveT = 40 + Math.random() * 15;
  v059.objectiveCount = 0;
  v059.objectivesCompleted = 0;
  if (v059.vipMarker) v059.vipMarker.visible = false;
  if (v059.supplyMesh) v059.supplyMesh.visible = false;
  ensureObjectiveHudV059();
  if (v059.hud) v059.hud.style.display = 'none';
}
