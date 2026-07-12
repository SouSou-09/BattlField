'use strict';
/* v0.4.3 — 兵科、プレイヤー分隊、スコア報酬 */

const CLASSES = {
  assault: { name: '突撃兵', weapon: 'ar', gadget: '擲弾 + 追加グレネード' },
  medic:   { name: '衛生兵', weapon: 'smg', gadget: '自己回復 + 回復箱' },
  support: { name: '援護兵', weapon: 'sg', gadget: '弾薬補給 + 制圧耐性' },
  recon:   { name: '偵察兵', weapon: 'sr', gadget: 'UAV持続時間増加' }
};
const v043 = { classId: 'assault', squadId: 0, streak: 0, bestStreak: 0, rewards: new Set(), uavT: 0, supplyCd: 0 };

function selectClass(id, applyNow = false) {
  if (!CLASSES[id]) return;
  v043.classId = id;
  document.querySelectorAll('.class-select').forEach(b => b.classList.toggle('sel', b.dataset.class === id));
  if (applyNow && player.alive) applyClassLoadout();
}
function applyClassLoadout() {
  const c = CLASSES[v043.classId];
  applyWeapon(c.weapon);
  grenades.max = v043.classId === 'assault' ? 4 : 3;
  grenades.count = grenades.max;
  player.maxHp = v043.classId === 'support' ? 110 : 100;
  player.hp = Math.min(player.maxHp, Math.max(player.hp, player.maxHp));
  addFeed(`${c.name}: ${c.gadget}`, 'blue');
}

function assignPlayerSquad() {
  const allies = soldiers.filter(s => s.team === 1 && s.alive);
  const groups = new Map();
  for (const s of allies) {
    const id = s.squad || 0;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(s);
  }
  let best = null;
  for (const [id, members] of groups) if (!best || members.length < best.members.length) best = { id, members };
  v043.squadId = best ? best.id : 0;
}
function playerSquadMembers() {
  return soldiers.filter(s => s.team === 1 && s.alive && !s.inVehicle && s.squad === v043.squadId);
}
function squadDeployPoints() {
  return playerSquadMembers().filter(s => {
    for (const e of soldiers) if (e.team === -1 && e.alive && e.obj.position.distanceTo(s.obj.position) < 14) return false;
    return true;
  }).map((s, i) => ({ id: `SQ${i + 1}`, x: s.obj.position.x, z: s.obj.position.z, squad: true }));
}

function onPlayerKillV043() {
  v043.streak++;
  v043.bestStreak = Math.max(v043.bestStreak, v043.streak);
  if (v043.streak === 3) activateUAV(22);
  if (v043.streak === 5) mortarStrike();
  if (v043.streak === 7) dropSupply();
}
function activateUAV(seconds = 18) {
  v043.uavT = Math.max(v043.uavT, seconds + (v043.classId === 'recon' ? 10 : 0));
  for (const s of soldiers) if (s.team === -1 && s.alive) s.spotted = Math.max(s.spotted || 0, v043.uavT);
  addFeed('UAVオンライン — 敵位置をスキャン', 'blue');
}
function mortarStrike() {
  let center = null, best = Infinity;
  for (const s of soldiers) if (s.team === -1 && s.alive) {
    const d = s.obj.position.distanceTo(player.pos);
    if (d < best && d < 180) { best = d; center = s.obj.position.clone(); }
  }
  if (!center) { addFeed('迫撃砲: 射程内に目標なし', 'red'); return; }
  addFeed('迫撃砲支援要請 — 着弾!', 'blue');
  for (let i = 0; i < 4; i++) setTimeout(() => {
    const p = center.clone(); p.x += (Math.random() - .5) * 14; p.z += (Math.random() - .5) * 14; p.y = terrainH(p.x, p.z) + .4;
    explodeAt(p, 5.5, 95);
  }, 450 + i * 420);
}
function dropSupply() {
  const p = player.pos.clone();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, .8, 1), new THREE.MeshLambertMaterial({ color: 0x526b3e }));
  crate.position.set(p.x, p.y + 18, p.z); scene.add(crate);
  const fall = setInterval(() => {
    crate.position.y -= .7;
    const floor = terrainH(crate.position.x, crate.position.z) + .45;
    if (crate.position.y <= floor) {
      clearInterval(fall); crate.position.y = floor;
      weapon.reserve = weaponDef().reserve; grenades.count = grenades.max; player.hp = player.maxHp;
      updateAmmoUI(); updateHpUI(); addFeed('補給物資を回収 — 装備全回復', 'blue');
      setTimeout(() => scene.remove(crate), 12000);
    }
  }, 30);
}
function useClassGadget() {
  if (!player.alive || curVehicle) return;
  if (v043.classId === 'medic') {
    if (v043.supplyCd > 0) return;
    player.hp = Math.min(player.maxHp, player.hp + 55); v043.supplyCd = 18; updateHpUI(); addFeed('衛生キット +55', 'blue');
  } else if (v043.classId === 'support') {
    if (v043.supplyCd > 0) return;
    weapon.reserve = Math.min(weaponDef().reserve, weapon.reserve + weapon.magSize * 3); v043.supplyCd = 15; updateAmmoUI(); addFeed('弾薬パック補給', 'blue');
  } else if (v043.classId === 'recon') activateUAV(10);
  else mortarStrike();
}
function updateV043(dt) {
  v043.uavT = Math.max(0, v043.uavT - dt);
  v043.supplyCd = Math.max(0, v043.supplyCd - dt);
  if (v043.uavT > 0) for (const s of soldiers) if (s.team === -1 && s.alive) s.spotted = Math.max(s.spotted || 0, .5);
}
function resetV043() {
  v043.streak = 0; v043.bestStreak = 0; v043.uavT = 0; v043.supplyCd = 0;
  applyClassLoadout(); assignPlayerSquad();
}

window.addEventListener('keydown', e => {
  if (e.code === 'KeyB' && !e.repeat && game.running) useClassGadget();
});
document.querySelectorAll('.class-select').forEach(b => b.addEventListener('click', () => selectClass(b.dataset.class)));
