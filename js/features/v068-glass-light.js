'use strict';
/* STEEL FRONT v0.6.8 — 窓ガラス反射/透過強化 / 内部照明(停電・発電) / 建物恒久ダメージ蓄積
   ──────────────────────────────────────────────
   1. 窓ガラスの反射/透過表現強化:
      既存の破壊可能窓システム(windows配列 / matGlassPane 0x9fc2d6)と連動し、
      窓ガラスメッシュをMeshStandardMaterial(envMap反射 + 透過 + 微 tint)へ
      実行時アップグレード。位置ハッシュで反射強度・色味にバリエーション。
      窓が割れると反射メッシュも連動して非表示化。
   2. 内部照明の表現(停電/発電):
      v067で検出された各室内に照明状態(power: on/off, generator)を割当。
      約30%の建物は停電(発電機停止)、残りは稼働中。
      稼働中の室内には暖色ポイントライトを配置し、夜間(dayF<0.3)に窓面が発光。
      停電中の室内は夜間に視認性が低下(暗室効果)。
   3. 建物ごとの破損表現の蓄積(恒久ダメージ):
      弾痕・焼焦・壁損傷を建物単位で蓄積し、リスポーンでリセットされない
      恒久ダメージデカールを外壁に配置。建物位置ハッシュで初期破損度を決定し、
      戦闘地域(拠点近傍)の建物は初期から損傷が多い。
      updateV068で戦闘発生(砲撃/爆発)を検知し、近接建物にダメージを蓄積。

   ※ 既存ソース(map-objects.js / v067)は変更せず、resetV068()で実行時処理。
      v067の後に実行される。 */

// ============================================================
//  State
// ============================================================
var v068 = {
  panes: [],         // {mesh, orig, hash, lit, reflectMat}
  rooms: [],         // {cx, cz, gy, w, d, ceilH, power, light, glowMeshes, baseAmbient, darkRoom}
  damage: [],        // {cx, cz, level, decals[], meshes[]}
  initialized: false,
  visT: 0,
  lightT: 0,
  combatEvents: 0    // 検知された戦闘イベント数(ダメージ蓄積用)
};

// ============================================================
//  Helpers
// ============================================================
function _hashPosV068(x, z) {
  var h = (x * 73856093) ^ (z * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h >>> 0) % 1000) / 1000;
}

function _colEqV068(c, hex) {
  return Math.abs(c.r - ((hex >> 16) & 0xff) / 255) < 0.01 &&
         Math.abs(c.g - ((hex >> 8) & 0xff) / 255) < 0.01 &&
         Math.abs(c.b - (hex & 0xff) / 255) < 0.01;
}

// ============================================================
//  Resources
// ============================================================
var _rV068 = null;

function _initResV068() {
  if (_rV068) return;
  _rV068 = {};

  // 発光窓面テクスチャ(夜間の点灯室内の窓光)
  _rV068.glowTex = makeCanvasTexture(128, function (g, s) {
    g.fillStyle = '#ffd88a'; g.fillRect(0, 0, s, s);
    // 窓枠格子
    g.fillStyle = 'rgba(40,35,25,0.3)';
    g.fillRect(s / 2 - 2, 0, 4, s);
    g.fillRect(0, s / 2 - 2, s, 4);
    // 微揺らぎ
    for (var i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(' + (200 + Math.random() * 55 | 0) + ',' + (160 + Math.random() * 60 | 0) + ',' + (90 + Math.random() * 50 | 0) + ',0.06)';
      g.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 3 + Math.random() * 6);
    }
  }, 1, 1);

  // 損傷デカールテクスチャ(弾痕群+焼焦)
  _rV068.scorchTex = makeCanvasTexture(128, function (g, s) {
    var cx = s / 2, cy = s / 2;
    var gr = g.createRadialGradient(cx, cy, 0, cx, cy, s * 0.48);
    gr.addColorStop(0, 'rgba(15,12,10,0.7)');
    gr.addColorStop(0.4, 'rgba(25,20,16,0.4)');
    gr.addColorStop(1, 'rgba(25,20,16,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    // 弾痕点
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * 7, r = s * 0.08 + Math.random() * s * 0.32;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      g.fillStyle = 'rgba(8,6,5,0.6)';
      g.beginPath(); g.arc(px, py, 1 + Math.random() * 2.5, 0, 7); g.fill();
    }
  }, 1, 1);

  // 亀裂テクスチャ
  _rV068.crackTex = makeCanvasTexture(128, function (g, s) {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = 'rgba(20,18,15,0.55)'; g.lineWidth = 1.5;
    var cx = s / 2, cy = s / 2;
    for (var i = 0; i < 5; i++) {
      var a = Math.random() * 7;
      g.beginPath(); g.moveTo(cx, cy);
      var px = cx, py = cy;
      for (var j = 0; j < 4; j++) {
        px += Math.cos(a + (Math.random() - 0.5) * 1.2) * s * 0.12;
        py += Math.sin(a + (Math.random() - 0.5) * 1.2) * s * 0.12;
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }, 1, 1);

  // マテリアル
  _rV068.matScorch = new THREE.MeshBasicMaterial({
    map: _rV068.scorchTex, transparent: true, opacity: 0.8,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
  });
  _rV068.matCrack = new THREE.MeshBasicMaterial({
    map: _rV068.crackTex, transparent: true, opacity: 0.6,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
  });
  _rV068.matGlow = new THREE.MeshBasicMaterial({
    map: _rV068.glowTex, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide
  });

  // ジオメトリ(デカール用平面)
  _rV068.geoDecal = new THREE.PlaneGeometry(1, 1);
  _rV068.geoGlow = new THREE.PlaneGeometry(1, 1);
}

// ============================================================
//  1. 窓ガラス反射/透過強化
// ============================================================
function _upgradeWindowPanesV068() {
  // windows配列は map-objects.js で定義 (グローバル)
  // 各wp = {m, ob, solid, broken}
  if (typeof windows === 'undefined') return;
  for (var i = 0; i < windows.length; i++) {
    var wp = windows[i];
    if (wp._v068upgraded) continue;
    wp._v068upgraded = true;
    var m = wp.m;
    var mat = m.material;
    // matGlassPane (0x9fc2d6) のみ対象
    if (!_colEqV068(mat.color, 0x9fc2d6)) continue;

    var px = m.position.x, pz = m.position.z;
    var hash = _hashPosV068(px + 3.7, pz - 11.3);
    var envMap = (typeof v065 !== 'undefined' && v065.envTex) ? v065.envTex : null;

    // 反射強度・tintバリエーション
    var reflectIntensity = 0.3 + hash * 0.4;     // 0.3-0.7
    var tintVariants = [0x9fc2d6, 0x8ab4c8, 0xa6c8d8, 0x7a9eb0];
    var tintHex = tintVariants[(hash * 4) | 0];

    var newMat = new THREE.MeshStandardMaterial({
      color: tintHex,
      transparent: true,
      opacity: 0.35 + hash * 0.15,              // 0.35-0.50
      roughness: 0.05 + hash * 0.1,             // 光沢ガラス
      metalness: 0.0,
      envMap: envMap,
      envMapIntensity: reflectIntensity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    m.material = newMat;

    v068.panes.push({
      mesh: m, orig: wp, hash: hash,
      lit: false, reflectMat: newMat
    });
  }
}

// 窓が割れたときの反射メッシュ連動 (breakWindow後に呼ばれる)
function _syncBrokenPanesV068() {
  for (var i = 0; i < v068.panes.length; i++) {
    var p = v068.panes[i];
    if (p.orig.broken && p.mesh.visible) {
      p.mesh.visible = false;
    }
  }
}

// ============================================================
//  2. 内部照明(停電/発電)
// ============================================================
function _setupInteriorLightingV068() {
  // v067のinteriors配列を参照
  if (typeof v067 === 'undefined' || !v067.interiors) return;
  var flagsArr = (typeof flags !== 'undefined') ? flags : [];

  for (var i = 0; i < v067.interiors.length; i++) {
    var intr = v067.interiors[i];
    var hash = _hashPosV068(intr.cx + 5.1, intr.cz + 7.3);

    // 拠点(旗)からの距離 — 拠点近傍は発電機稼働率が高い
    var nearFlag = false;
    for (var f = 0; f < flagsArr.length; f++) {
      var fl = flagsArr[f];
      if (Math.hypot(fl.x - intr.cx, fl.z - intr.cz) < 40) { nearFlag = true; break; }
    }

    // 電力状態: 拠点近傍は80%稼働、孤立建物は50%稼働
    var powerOn = hash < (nearFlag ? 0.8 : 0.5);

    // 発電機オブジェクト(屋外に配置する小型箱) — 稼働中のみ
    var genMesh = null;
    if (powerOn) {
      var genGeo = new THREE.BoxGeometry(1.2, 0.9, 0.7);
      var genMat = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.7, metalness: 0.3 });
      genMesh = new THREE.Mesh(genGeo, genMat);
      var gx = intr.cx + (hash < 0.5 ? intr.w / 2 + 1.2 : -(intr.w / 2 + 1.2));
      var gz = intr.cz + ((hash * 7) % 1 < 0.5 ? intr.d / 2 + 1.0 : -(intr.d / 2 + 1.0));
      genMesh.position.set(gx, terrainH(gx, gz) + 0.45, gz);
      genMesh.castShadow = true;
      scene.add(genMesh);
      // 発電機排気パイプ
      var pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
      var pipeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 });
      var pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(gx, terrainH(gx, gz) + 1.15, gz);
      scene.add(pipe);
    }

    // 室内ライト(稼働中のみ)
    var light = null;
    if (powerOn) {
      light = new THREE.PointLight(0xffd49a, 0, 18, 1.8);
      light.position.set(intr.cx, intr.gy + intr.ceilH - 0.8, intr.cz);
      scene.add(light);
    }

    // 窓発光メッシュ(夜間の点灯室内の窓光) — 稼働中の建物のみ
    var glowMeshes = [];
    if (powerOn) {
      // 建物4面の窓位置に発光パネルを配置
      var glowMat = _rV068.matGlow.clone();
      glowMat.map = _rV068.glowTex;
      var faces = [
        { dx: intr.w / 2 + 0.06, dz: 0, rot: Math.PI / 2, ww: intr.d * 0.7, wh: 1.2 },
        { dx: -(intr.w / 2 + 0.06), dz: 0, rot: -Math.PI / 2, ww: intr.d * 0.7, wh: 1.2 },
        { dx: 0, dz: intr.d / 2 + 0.06, rot: 0, ww: intr.w * 0.7, wh: 1.2 },
        { dx: 0, dz: -(intr.d / 2 + 0.06), rot: Math.PI, ww: intr.w * 0.7, wh: 1.2 }
      ];
      for (var fi = 0; fi < faces.length; fi++) {
        var fa = faces[fi];
        var gg = new THREE.Mesh(_rV068.geoGlow, glowMat);
        gg.scale.set(fa.ww, fa.wh, 1);
        gg.position.set(intr.cx + fa.dx, intr.gy + 1.8, intr.cz + fa.dz);
        gg.rotation.y = fa.rot;
        gg.visible = false;
        scene.add(gg);
        glowMeshes.push(gg);
      }
    }

    v068.rooms.push({
      cx: intr.cx, cz: intr.cz, gy: intr.gy, w: intr.w, d: intr.d, ceilH: intr.ceilH,
      power: powerOn,
      light: light,
      glowMat: powerOn ? glowMat : null,
      glowMeshes: glowMeshes,
      generator: genMesh,
      darkRoom: !powerOn,
      hash: hash
    });
  }
}

// 昼夜連動でライト強度・窓発光を調整
function _updateLightingV068(dayF) {
  var nightF = 1 - dayF;  // 0=昼 1=夜
  for (var i = 0; i < v068.rooms.length; i++) {
    var r = v068.rooms[i];
    if (r.power && r.light) {
      // 夜になるほど室内ライトが目立つ(常時点灯だが昼は相対的に弱い)
      r.light.intensity = 0.3 + nightF * 2.5;
    }
    // 窓発光メッシュ: 夜間のみ表示
    if (r.glowMeshes.length > 0) {
      var targetOpacity = nightF > 0.5 ? 0.45 + Math.sin(elapsed * 3 + r.hash * 7) * 0.04 : 0;
      var show = nightF > 0.4;
      if (r.glowMat) {
        r.glowMat.opacity = targetOpacity;
      }
      for (var g = 0; g < r.glowMeshes.length; g++) {
        r.glowMeshes[g].visible = show;
      }
    }
  }
}

// ============================================================
//  3. 建物恒久ダメージ蓄積
// ============================================================
function _placeDamageDecalV068(building, type, offsetAngle, size, yOffset) {
  var mat = type === 'scorch' ? _rV068.matScorch : _rV068.matCrack;
  var decal = new THREE.Mesh(_rV068.geoDecal, mat);
  decal.scale.set(size, size, 1);
  // 建物外壁面上に配置
  var halfW = building.w / 2 + 0.08;
  var halfD = building.d / 2 + 0.08;
  var px, pz, ry;
  if (offsetAngle < Math.PI / 2) {
    px = building.cx + Math.cos(offsetAngle) * halfW;
    pz = building.cz + Math.sin(offsetAngle) * halfD;
    ry = offsetAngle;
  } else if (offsetAngle < Math.PI) {
    px = building.cx + Math.cos(offsetAngle) * halfW;
    pz = building.cz + Math.sin(offsetAngle) * halfD;
    ry = offsetAngle;
  } else {
    px = building.cx + Math.cos(offsetAngle) * halfW;
    pz = building.cz + Math.sin(offsetAngle) * halfD;
    ry = offsetAngle;
  }
  decal.position.set(px, building.gy + yOffset, pz);
  decal.rotation.y = ry;
  decal.visible = true;
  scene.add(decal);
  building.decals.push(decal);
}

function _applyInitialDamageV068() {
  if (typeof v067 === 'undefined' || !v067.interiors) return;
  var flagsArr = (typeof flags !== 'undefined') ? flags : [];

  for (var i = 0; i < v067.interiors.length; i++) {
    var intr = v067.interiors[i];
    var hash = _hashPosV068(intr.cx - 2.3, intr.cz + 4.1);

    // 拠点(旗)からの距離で初期損傷度を決定
    var minFlagDist = 999;
    for (var f = 0; f < flagsArr.length; f++) {
      var fl = flagsArr[f];
      var d = Math.hypot(fl.x - intr.cx, fl.z - intr.cz);
      if (d < minFlagDist) minFlagDist = d;
    }
    // 拠点近傍(40m以内)は激戦地 → 損傷大、遠い建物は軽微
    var damageLevel;
    if (minFlagDist < 30) damageLevel = 3 + (hash * 2 | 0);   // 3-4
    else if (minFlagDist < 60) damageLevel = 2 + (hash * 2 | 0); // 2-3
    else if (minFlagDist < 100) damageLevel = 1 + (hash * 2 | 0); // 1-2
    else damageLevel = hash < 0.5 ? 0 : 1;

    var bld = {
      cx: intr.cx, cz: intr.cz, gy: intr.gy,
      w: intr.w, d: intr.d, ceilH: intr.ceilH,
      level: damageLevel, decals: [], meshes: [], hash: hash
    };

    // 損傷レベルに応じてデカールを配置
    for (var lv = 0; lv < damageLevel; lv++) {
      var angle = hash * 7 + lv * 1.7;
      var size = 1.5 + (hash * 2 + lv * 0.3) % 1 * 1.5;
      var yOff = 1.0 + ((hash * 5 + lv * 0.7) % 1) * (intr.ceilH - 1.5);
      var type = (lv + hash * 3) % 2 < 1 ? 'scorch' : 'crack';
      _placeDamageDecalV068(bld, type, angle, size, yOff);
    }

    // 窓ガラスの初期破損 — 高損傷建物は一部の窓が既に割れている
    if (damageLevel >= 2 && typeof windows !== 'undefined') {
      var brokenCount = 0;
      for (var wi = 0; wi < windows.length; wi++) {
        var wp = windows[wi];
        if (wp.broken) continue;
        var wd = Math.hypot(wp.m.position.x - intr.cx, wp.m.position.z - intr.cz);
        if (wd < Math.max(intr.w, intr.d) / 2 + 2) {
          if (brokenCount < damageLevel - 1 && _hashPosV068(wp.m.position.x, wp.m.position.z) < 0.5) {
            wp.broken = true;
            wp.m.visible = false;
            if (wp.solid) { var oi = obstacles.indexOf(wp.ob); if (oi >= 0) obstacles.splice(oi, 1); }
            var si = solidMeshes.indexOf(wp.m); if (si >= 0) solidMeshes.splice(si, 1);
            brokenCount++;
          }
        }
      }
    }

    v068.damage.push(bld);
  }
}

// 戦闘イベント検知 — 爆発/砲撃時に近接建物にダメージを蓄積
function _addCombatDamageV068(pos) {
  for (var i = 0; i < v068.damage.length; i++) {
    var b = v068.damage[i];
    var dist = Math.hypot(b.cx - pos.x, b.cz - pos.z);
    if (dist < 15) {
      // デカール追加
      var angle = Math.atan2(pos.z - b.cz, pos.x - b.cx);
      var size = 1.0 + Math.random() * 1.5;
      var yOff = 0.8 + Math.random() * (b.ceilH - 1.0);
      var type = Math.random() < 0.6 ? 'scorch' : 'crack';
      _placeDamageDecalV068(b, type, angle, size, yOff);
      b.level++;
      // 可視性は距離で判定
    }
  }
}

// グローバル爆発フック — spawnParticlesやaddBattleScarの近傍で呼ばれるよう、
// 爆発位置を記録するラッパー
var _origAddBattleScarV068 = null;
function _hookBattleScarV068() {
  if (typeof addBattleScar !== 'function' || _origAddBattleScarV068) return;
  _origAddBattleScarV068 = addBattleScar;
  // グローバル関数をラップして爆発位置を記録
  /* eslint-disable no-global-assign */
  addBattleScar = function (pos, type, size) {
    _origAddBattleScarV068(pos, type, size);
    if (type === 'crater' || type === 'scorch') {
      _addCombatDamageV068(pos);
    }
  };
  /* eslint-enable no-global-assign */
}

// ============================================================
//  reset / update
// ============================================================
function resetV068() {
  if (v068.initialized) return;
  if (isMobile) return;
  v068.initialized = true;
  _initResV068();
  _upgradeWindowPanesV068();     // 窓ガラス反射強化
  _setupInteriorLightingV068();  // 内部照明(停電/発電)
  _applyInitialDamageV068();     // 恒久ダメージ初期配置
  _hookBattleScarV068();         // 爆発フック
}

function updateV068(dt) {
  if (!v068.initialized) return;

  // 窓ガラスの破損同期
  v068.visT += dt;
  if (v068.visT >= 0.3) {
    v068.visT = 0;
    _syncBrokenPanesV068();
  }

  // 内部照明の昼夜連動 (0.1秒間隔)
  v068.lightT += dt;
  if (v068.lightT >= 0.1) {
    v068.lightT = 0;
    // dayF を太陽高さから推定 (v0510と同様の計算)
    var sunY = sun.position.y / 130;
    var dayF = Math.max(0, Math.min(1, sunY * 0.8 + 0.2));
    _updateLightingV068(dayF);
  }
}
