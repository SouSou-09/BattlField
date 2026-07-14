'use strict';
/* STEEL FRONT v0.6.2 — 水面表現(反射/屈折/波紋) / 霧・大気遠近感
   ──────────────────────────────────────────────
   1. 水面: ShaderMaterial でフレネル反射/屈折 + 動的法線マップ波紋 +
      頂点波打ち + 太陽鏡面反射 + 水底透過感
   2. 大気遠近感: 高さフォグ層(グラデーション円柱) + 遠景大気散乱ドーム +
      距離に応じたコントラスト低下ボリューム

   注意: v0510昼夜システムが scene.fog / sun / clearColor を毎0.1s制御するため、
   本モジュールはそれらを直接操作せず、追加の視覚層で大気感を補強する。 */

// ============================================================
//  State
// ============================================================
const v062 = {
  water: {
    mesh: null,
    mat: null,
    time: 0,
    normalTex: null,
    normalTex2: null
  },
  atmosphere: {
    heightFog: null,      // 高さフォグ円柱
    scatterDome: null,    // 大気散乱ドーム (空とのブレンド)
    hazeRing: null        // 地平線霞リング
  },
  ripples: [],            // 動的波紋 (弾着/着水)
  rippleMax: 20,
  initialized: false
};

// ============================================================
//  1. 水面法線マップテクスチャ (canvas生成)
// ============================================================
function _createWaterNormalTexV062(size, freq, amp) {
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var g = c.getContext('2d');
  var img = g.createImageData(size, size);
  var d = img.data;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var i = (y * size + x) * 4;
      // 多重正弦波で波紋パターン
      var nx = Math.sin(x * freq) * amp + Math.sin(x * freq * 2.3 + 1.5) * amp * 0.5
             + Math.sin(x * freq * 4.1 + 3.2) * amp * 0.25;
      var ny = Math.cos(y * freq + 0.8) * amp + Math.cos(y * freq * 1.9 + 2.1) * amp * 0.5
             + Math.cos(y * freq * 3.7 + 4.5) * amp * 0.25;
      // 法線マップ RGB (128 = neutral)
      d[i]     = 128 + nx * 80;
      d[i + 1] = 128 + ny * 80;
      d[i + 2] = 255;   // Z=up
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// ============================================================
//  2. 水面 ShaderMaterial — フレネル反射/屈折 + 波紋
// ============================================================
function _createWaterMaterialV062() {
  v062.water.normalTex  = _createWaterNormalTexV062(256, 0.08, 1.0);
  v062.water.normalTex2 = _createWaterNormalTexV062(256, 0.12, 0.7);
  v062.water.normalTex2.repeat.set(5, 5);

  var uniforms = {
    uTime:      { value: 0 },
    uNormalMap: { value: v062.water.normalTex },
    uNormalMap2:{ value: v062.water.normalTex2 },
    uSunDir:    { value: new THREE.Vector3(90, 130, 45).normalize() },
    uSunColor:  { value: new THREE.Color(0xfff2d8) },
    uDeepColor: { value: new THREE.Color(0x1a4858) },
    uShallowColor: { value: new THREE.Color(0x3a8098) },
    uSkyColor:  { value: new THREE.Color(0x8db4d4) },
    uOpacity:   { value: 0.82 }
  };

  var mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: [
      'uniform float uTime;',
      'uniform sampler2D uNormalMap;',
      'varying vec3 vWorldPos;',
      'varying vec3 vNormal;',
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  vec3 pos = position;',
      '  // 頂点波打ち (低周波のうねり)',
      '  float wave = sin(pos.x * 0.15 + uTime * 0.8) * cos(pos.z * 0.12 + uTime * 0.6);',
      '  pos.y += wave * 0.12;',
      '  float wave2 = sin(pos.x * 0.3 + uTime * 1.5) * sin(pos.z * 0.25 + uTime * 1.2);',
      '  pos.y += wave2 * 0.05;',
      '  vNormal = normalize(normalMatrix * normal);',
      '  vec4 worldPos = modelMatrix * vec4(pos, 1.0);',
      '  vWorldPos = worldPos.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'uniform sampler2D uNormalMap;',
      'uniform sampler2D uNormalMap2;',
      'uniform vec3 uSunDir;',
      'uniform vec3 uSunColor;',
      'uniform vec3 uDeepColor;',
      'uniform vec3 uShallowColor;',
      'uniform vec3 uSkyColor;',
      'uniform float uOpacity;',
      'varying vec3 vWorldPos;',
      'varying vec3 vNormal;',
      'varying vec2 vUv;',

      'void main() {',
      // スクロールする法線マップ (2層)
      '  vec2 uv1 = vUv * 4.0 + vec2(uTime * 0.03, uTime * 0.02);',
      '  vec2 uv2 = vUv * 6.0 + vec2(-uTime * 0.02, uTime * 0.025);',
      '  vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;',
      '  vec3 n2 = texture2D(uNormalMap2, uv2).rgb * 2.0 - 1.0;',
      '  vec3 wNormal = normalize(vec3(n1.xy + n2.xy, n1.z));',

      // 視線方向
      '  vec3 viewDir = normalize(cameraPosition - vWorldPos);',

      // フレネル係数 (視角依存の反射強度)
      '  float fresnel = pow(1.0 - max(dot(viewDir, wNormal), 0.0), 3.0);',
      '  fresnel = mix(0.15, 0.9, fresnel);',

      // 水色 (深浅ブレンド)
      '  vec3 waterColor = mix(uShallowColor, uDeepColor, 0.5 + wNormal.z * 0.3);',

      // 太陽鏡面反射
      '  vec3 reflectDir = reflect(-uSunDir, wNormal);',
      '  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);',
      '  vec3 specular = uSunColor * spec * 0.8;',

      // 空の反射色
      '  vec3 skyReflect = uSkyColor * fresnel;',

      // 最終色 = 水色 + 空反射 + 太陽鏡面
      '  vec3 color = waterColor * (1.0 - fresnel) + skyReflect + specular;',

      // 動的波紋 (uRipple配列から)
      '  gl_FragColor = vec4(color, uOpacity);',
      '}'
    ].join('\n')
  });

  return mat;
}

// ============================================================
//  3. 動的波紋 — 弾着・着水時に波紋メッシュを生成
// ============================================================
function addWaterRippleV062(x, z, strength) {
  if (!v062.water.mesh) return;
  var r = { x: x, z: z, t: 0, strength: strength || 1, mesh: null };
  var geo = new THREE.RingGeometry(0.5, 0.7, 24);
  geo.rotateX(-Math.PI / 2);
  var mat = new THREE.MeshBasicMaterial({
    color: 0xb0d8e8, transparent: true, opacity: 0.6 * r.strength,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  r.mesh = new THREE.Mesh(geo, mat);
  r.mesh.position.set(x, WATER_Y + 0.02, z);
  scene.add(r.mesh);
  v062.ripples.push(r);
  while (v062.ripples.length > v062.rippleMax) {
    var old = v062.ripples.shift();
    if (old.mesh) { scene.remove(old.mesh); old.mesh.geometry.dispose(); }
  }
}

function _updateRipplesV062(dt) {
  for (var i = v062.ripples.length - 1; i >= 0; i--) {
    var r = v062.ripples[i];
    r.t += dt;
    if (r.t > 2.5) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      v062.ripples.splice(i, 1);
      continue;
    }
    var scale = 1 + r.t * 8;
    r.mesh.scale.set(scale, 1, scale);
    r.mesh.material.opacity = 0.6 * r.strength * (1 - r.t / 2.5);
  }
}

// ============================================================
//  4. 大気遠近感 — 高さフォグ + 散乱ドーム + 霞リング
// ============================================================
function _createAtmosphereV062() {
  // 4a. 高さフォグ層: 地表〜低高度のグラデーション円柱
  // The atmospheric shells follow the camera in X/Z. Keeping them centred at
  // world origin put the expanded HQ only ~90m from the transparent cylinder,
  // which looked like a pass-through wall immediately after spawning.
  var fogC = document.createElement('canvas');
  fogC.width = 2; fogC.height = 128;
  var fg = fogC.getContext('2d');
  var fgr = fg.createLinearGradient(0, 0, 0, 128);
  fgr.addColorStop(0, 'rgba(180,200,215,0)');      // 上部: 透明
  fgr.addColorStop(0.5, 'rgba(180,200,215,0.04)'); // 中部: 微薄
  fgr.addColorStop(0.85, 'rgba(180,200,215,0.12)');// 下部: 薄霧
  fgr.addColorStop(1, 'rgba(180,200,215,0.18)');   // 最下部: やや濃い
  fg.fillStyle = fgr; fg.fillRect(0, 0, 2, 128);
  var fogTex = new THREE.CanvasTexture(fogC);
  var fogGeo = new THREE.CylinderGeometry(680, 680, 120, 32, 1, true);
  var fogMat = new THREE.MeshBasicMaterial({
    map: fogTex, transparent: true, opacity: 0.8,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  v062.atmosphere.heightFog = new THREE.Mesh(fogGeo, fogMat);
  v062.atmosphere.heightFog.position.set(camera.position.x, 50, camera.position.z);
  v062.atmosphere.heightFog.renderOrder = -5;
  scene.add(v062.atmosphere.heightFog);

  // 4b. 大気散乱ドーム: 遠景の青み強化 (空ドームの内側に重ねる)
  var scatC = document.createElement('canvas');
  scatC.width = 4; scatC.height = 256;
  var sg = scatC.getContext('2d');
  var sgr = sg.createLinearGradient(0, 0, 0, 256);
  sgr.addColorStop(0, 'rgba(60,100,140,0)');       // 天頂: 透明
  sgr.addColorStop(0.5, 'rgba(100,140,170,0)');    // 中高度: 透明
  sgr.addColorStop(0.8, 'rgba(150,180,200,0.06)'); // 低高度: 微青
  sgr.addColorStop(1, 'rgba(200,215,225,0.15)');   // 地平線: 霞青
  sg.fillStyle = sgr; sg.fillRect(0, 0, 4, 256);
  var scatTex = new THREE.CanvasTexture(scatC);
  var scatGeo = new THREE.SphereGeometry(1100, 16, 12);
  var scatMat = new THREE.MeshBasicMaterial({
    map: scatTex, transparent: true, opacity: 0.7,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  v062.atmosphere.scatterDome = new THREE.Mesh(scatGeo, scatMat);
  v062.atmosphere.scatterDome.position.set(camera.position.x, 0, camera.position.z);
  v062.atmosphere.scatterDome.renderOrder = -9;
  scene.add(v062.atmosphere.scatterDome);

  // 4c. 地平線霞リング: 遠景の輪郭をぼかす円環
  var ringGeo = new THREE.CylinderGeometry(640, 660, 20, 48, 1, true);
  var ringMat = new THREE.MeshBasicMaterial({
    color: 0xc8d8e4, transparent: true, opacity: 0.15,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  v062.atmosphere.hazeRing = new THREE.Mesh(ringGeo, ringMat);
  v062.atmosphere.hazeRing.position.set(camera.position.x, 6, camera.position.z);
  v062.atmosphere.hazeRing.renderOrder = -4;
  scene.add(v062.atmosphere.hazeRing);
}

// ============================================================
//  5. 大気層の昼夜追従 — v0510のfog色に合わせて層の色を調整
// ============================================================
function _syncAtmosphereColorV062() {
  if (!v062.atmosphere.heightFog) return;
  var fogCol = scene.fog ? scene.fog.color : null;
  if (!fogCol) return;
  // scene.fog.color に合わせて大気層の色を薄く追従
  var hf = v062.atmosphere.heightFog.material;
  if (hf.color) {
    hf.color.copy(fogCol).multiplyScalar(0.9);
  }
  var sd = v062.atmosphere.scatterDome.material;
  if (sd.color) {
    sd.color.copy(fogCol).multiplyScalar(0.7);
  }
  var hr = v062.atmosphere.hazeRing.material;
  if (hr.color) {
    hr.color.copy(fogCol).multiplyScalar(0.85);
  }
}

// ============================================================
//  Public API
// ============================================================
function resetV062() {
  v062.water.time = 0;
  // 波紋クリア
  for (var i = 0; i < v062.ripples.length; i++) {
    if (v062.ripples[i].mesh) {
      scene.remove(v062.ripples[i].mesh);
      v062.ripples[i].mesh.geometry.dispose();
    }
  }
  v062.ripples.length = 0;
  // 太陽方向を再取得 (v0510昼夜で変動)
  if (v062.water.mat && v062.water.mat.uniforms.uSunDir) {
    v062.water.mat.uniforms.uSunDir.value.copy(sun.position).normalize();
    v062.water.mat.uniforms.uSunColor.value.copy(sun.color);
  }
}

function updateV062(dt) {
  // Keep purely visual atmosphere shells centred on the viewer. They are not
  // world boundaries and must never appear as a nearby stationary wall.
  if (v062.atmosphere.heightFog) {
    v062.atmosphere.heightFog.position.x = camera.position.x;
    v062.atmosphere.heightFog.position.z = camera.position.z;
  }
  if (v062.atmosphere.scatterDome) {
    v062.atmosphere.scatterDome.position.x = camera.position.x;
    v062.atmosphere.scatterDome.position.z = camera.position.z;
  }
  if (v062.atmosphere.hazeRing) {
    v062.atmosphere.hazeRing.position.x = camera.position.x;
    v062.atmosphere.hazeRing.position.z = camera.position.z;
  }
  // 水面アニメーション
  v062.water.time += dt;
  if (v062.water.mat) {
    v062.water.mat.uniforms.uTime.value = v062.water.time;
    // 太陽方向を追従 (昼夜で太陽位置が変動)
    v062.water.mat.uniforms.uSunDir.value.copy(sun.position).normalize();
    v062.water.mat.uniforms.uSunColor.value.copy(sun.color);
    // 空色をfog色から推定
    if (scene.fog) {
      v062.water.mat.uniforms.uSkyColor.value.copy(scene.fog.color);
    }
  }
  // 波紋更新
  _updateRipplesV062(dt);
  // 大気層の色追従 (0.5秒間隔)
  v062._syncT = (v062._syncT || 0) + dt;
  if (v062._syncT > 0.5) {
    v062._syncT = 0;
    _syncAtmosphereColorV062();
  }
}

// 弾着・爆発時に水面近ければ波紋を生成 (外部から呼ばれる)
function tryWaterRippleV062(pos) {
  if (!v062.water.mesh) return;
  var dx = pos.x - LAKE.x, dz = pos.z - LAKE.z;
  if (dx * dx + dz * dz < (LAKE.r + 8) * (LAKE.r + 8) && pos.y < WATER_Y + 3) {
    addWaterRippleV062(pos.x, pos.z, 1);
  }
}

// ============================================================
//  初期化 (スクリプト読み込み時 — map-terrain.js 水面生成済み)
// ============================================================
(function _initV062() {
  // 既存水面メッシュを検索 (waterMesh は map-terrain.js の let)
  // グローバル参照で取得できない場合はシーンから検索
  var existing = (typeof waterMesh !== 'undefined') ? waterMesh : null;
  if (!existing) {
    scene.traverse(function (obj) {
      if (obj.isMesh && obj.material && obj.material.transparent && obj.material.opacity === 0.78) {
        existing = obj;
      }
    });
  }
  if (!existing) return;

  // 水面メッシュを高解像度化 + ShaderMaterialに差し替え
  var oldGeo = existing.geometry;
  var newGeo = new THREE.CircleGeometry(LAKE.r + 8, 64);  // 分割数を増やして波打ちを滑らかに
  newGeo.rotateX(-Math.PI / 2);
  existing.geometry = newGeo;
  if (oldGeo) oldGeo.dispose();

  var mat = _createWaterMaterialV062();
  existing.material = mat;
  v062.water.mesh = existing;
  v062.water.mat = mat;

  // 大気遠近感レイヤー
  _createAtmosphereV062();

  v062.initialized = true;
})();
