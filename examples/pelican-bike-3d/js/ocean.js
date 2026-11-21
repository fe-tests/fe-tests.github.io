/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/ocean.js —— 海面（Gerst 波 + 双层法线 + 菲涅尔 + 浪花带 + 喷沫粒子）
 * 海面是一块跟随相机的大平面，波相位取**世界坐标**（平面滑动时波不跟着跑）。
 * 浪花带用 1024×1 的海岸线 LUT（R = 粗、G = 细，16 bit 精度）在着色器里查海岸 x。
 * 雾在着色器里手动算（ShaderMaterial 不参与 scene.fog 自动注入），与场景 FogExp2 同口径。
 */
'use strict';

import { WORLD } from './config.js';
import { shoreXAt } from './terrain.js';
import { clamp01, TAU, hash2 } from './utils.js';
import { PropStrip } from './road.js';

/* ============================ 着色器 ============================ */
const VERT = `
uniform float uTime;
uniform vec2  uOrigin;      // 平面原点（世界 xz），用于把波相位定在世界
uniform float uWaveAmp;
varying vec3 vWorldPos;
varying float vCrest;
void main() {
  vec3 p = position;
  vec2 wp = p.xz + uOrigin;
  float h = 0.0;
  h += sin(dot(vec2(1.0, 0.26), wp) * 0.055 + uTime * 0.85) * 0.42;
  h += sin(dot(vec2(-0.42, 1.0), wp) * 0.083 + uTime * 1.15) * 0.26;
  h += sin(dot(vec2(0.72, -0.70), wp) * 0.21 + uTime * 1.9) * 0.10;
  h += sin(dot(vec2(-0.9, 0.35), wp) * 0.52 + uTime * 2.7) * 0.035;
  h *= uWaveAmp;
  p.y += h;
  vCrest = h;
  vec4 wp4 = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp4.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

const FRAG = `
uniform sampler2D uNormalTex;
uniform sampler2D uShoreLUT;
uniform float uTime;
uniform float uShoreZ0;
uniform float uShoreSpan;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform vec3  uDeep;
uniform vec3  uShallow;
uniform vec3  uFoamColor;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform vec3  uCamPos;
uniform float uNight;
uniform float uWaveAmp;
varying vec3 vWorldPos;
varying float vCrest;

float shoreX(float z) {
  float u = clamp((z - uShoreZ0) / uShoreSpan + 0.0005, 0.0, 1.0);
  vec4 t = texture2D(uShoreLUT, vec2(u, 0.5));
  return (t.r * 256.0 + t.g) / 255.0 * 400.0 - 200.0;
}

void main() {
  vec2 n1 = texture2D(uNormalTex, vWorldPos.xz * 0.0140 + vec2(uTime * 0.030, uTime * 0.021)).rg;
  vec2 n2 = texture2D(uNormalTex, vWorldPos.xz * 0.0335 - vec2(uTime * 0.041, uTime * 0.028)).rg;
  float k = 1.15 + uWaveAmp * 0.75;
  float sx = ((n1.x - 0.5) * 1.15 + (n2.x - 0.5) * 0.72) * k;
  float sz = ((n1.y - 0.5) * 1.15 + (n2.y - 0.5) * 0.72) * k;
  vec3 n = normalize(vec3(sx, 1.0, sz));

  vec3 v = normalize(uCamPos - vWorldPos);
  float dist = length(uCamPos - vWorldPos);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.4);

  float sunFace = clamp(dot(n, normalize(uSunDir + v * 0.35)), 0.0, 1.0);
  vec3 base = mix(uShallow, uDeep, clamp(0.25 + fres * 1.1, 0.0, 1.0));
  // 天空反射（菲涅尔）+ 夜间压暗
  vec3 col = mix(base, uSkyColor, clamp(fres * 1.15, 0.0, 1.0));
  col *= mix(1.0, 0.32, uNight);

  // 太阳/月亮高光与碎光
  vec3 r = reflect(-v, n);
  float specPow = mix(240.0, 90.0, uNight);
  float spec = pow(max(dot(r, uSunDir), 0.0), specPow);
  float sparkle = pow(max(dot(r, uSunDir), 0.0), 26.0) * 0.10;
  col += uSunColor * (spec * 1.7 + sparkle) * (0.35 + 0.65 * sunFace);

  // 浪尖白沫
  col = mix(col, uFoamColor, clamp(smoothstep(0.30, 0.85, vCrest) * 0.34, 0.0, 1.0));

  // 岸边浪花带（查海岸 LUT）—— 注意变量名不能与上面的法线斜率 sx 撞名（GLSL 同作用域重定义会编译失败）
  float shore = shoreX(vWorldPos.z);
  float d = vWorldPos.x - shore;
  float ripple = texture2D(uNormalTex, vWorldPos.xz * 0.020 + vec2(uTime * 0.09, uTime * 0.05)).r;
  float band = (1.0 - smoothstep(-1.5, 9.0, d)) * (0.55 + ripple * 0.9);
  band *= smoothstep(-90.0, -6.0, d) * 0.9 + 0.1;
  col = mix(col, uFoamColor, clamp(band, 0.0, 1.0) * 0.72);
  // 湿沙/浅水过渡
  col = mix(col, uShallow * 1.05, smoothstep(6.0, -1.0, d) * 0.28);

  // 手动雾（与 FogExp2 同式：1 - exp(-d^2 * density^2)）
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  // 与内置材质走同一条输出链：色调映射 + sRGB 编码（自定义着色器不会自动加这两步）
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}
`;

/* ============================ 海岸线 LUT ============================ */
/** 生成/更新 1024×1 的海岸线 LUT（R 粗、G 细，编码 shore x ∈ [-200, 200]）。 */
export function makeShoreLUTCanvas(size, z0, span) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = 1;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, 1);
  for (let i = 0; i < size; i++) {
    const z = z0 + ((i + 0.5) / size) * span;
    const sx = shoreXAt(z);
    const v = clamp01((sx + 200) / 400) * 65535;
    const coarse = Math.floor(v / 256);
    const fine = Math.round(v - coarse * 256);
    const k = i * 4;
    img.data[k] = coarse; img.data[k + 1] = fine; img.data[k + 2] = 0; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* ============================ 装配 ============================ */
export function createOcean(THREE, kit, opts) {
  const o = opts || {};
  const size = WORLD.seaPlaneSize;
  let seg = o.seg || 48;
  const group = new THREE.Group();

  const lutCanvas = makeShoreLUTCanvas(WORLD.shoreLutSize, -WORLD.shoreSpan / 2, WORLD.shoreSpan);
  const lutTex = new THREE.CanvasTexture(lutCanvas);
  lutTex.wrapS = THREE.ClampToEdgeWrapping; lutTex.wrapT = THREE.ClampToEdgeWrapping;
  lutTex.magFilter = THREE.LinearFilter; lutTex.minFilter = THREE.LinearFilter;
  lutTex.generateMipmaps = false; lutTex.flipY = false;

  const uniforms = {
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector2(0, 0) },
    uWaveAmp: { value: o.waveAmp === undefined ? 1 : o.waveAmp },
    uNormalTex: { value: kit.tex.waterNormal },
    uShoreLUT: { value: lutTex },
    uShoreZ0: { value: -WORLD.shoreSpan / 2 },
    uShoreSpan: { value: WORLD.shoreSpan },
    uSunDir: { value: new THREE.Vector3(0.2, 0.5, -0.8).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.92, 0.8) },
    uSkyColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
    uDeep: { value: new THREE.Color(0.055, 0.19, 0.24) },
    uShallow: { value: new THREE.Color(0.16, 0.42, 0.44) },
    uFoamColor: { value: new THREE.Color(0.94, 0.97, 0.99) },
    uFogColor: { value: new THREE.Color(0.72, 0.8, 0.88) },
    uFogDensity: { value: 0.0022 },
    uCamPos: { value: new THREE.Vector3() },
    uNight: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: false,
    side: THREE.DoubleSide,
  });

  function makeGeo(s) {
    return new THREE.PlaneGeometry(size, size, s, s).rotateX(-Math.PI / 2);
  }
  const mesh = new THREE.Mesh(makeGeo(seg), mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  group.add(mesh);

  /* --- 岸边浪花 sprite（沿海岸线条带回收） --- */
  const foamTile = 48;
  const foamPer = 2;
  const foam = new PropStrip(THREE, {
    geo: new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2),
    mat: kit.mat.foamSprite,
    tileLen: foamTile, tiles: Math.round(1100 / foamTile), perTile: foamPer, back: 0.3, cast: false,
    place: function (k, zBase, st, rand, i) {
      const z = zBase + (i + 0.5) * (foamTile / foamPer) + (rand() - 0.5) * 10;
      const sx = shoreXAt(z);
      const s = 0.8 + rand() * 0.9;
      st.fill(k, sx + 1.2 + rand() * 3.5, 0.14, z, rand() * 3, 0, 0, s, 1, s);
    },
  });
  group.add(foam.mesh);
  foam.mesh.renderOrder = 2;

  /* --- 喷沫粒子（Points，加法混合） --- */
  const pCount = o.particles || 300;
  const pPos = new Float32Array(pCount * 3);
  const pZ = new Float32Array(pCount);
  const pPhase = new Float32Array(pCount);
  const pLat = new Float32Array(pCount);
  const pSize = new Float32Array(pCount);
  const pGeo = new THREE.BufferGeometry();
  for (let i = 0; i < pCount; i++) {
    pZ[i] = (hash2(i, 11) - 0.5) * 900;
    pLat[i] = hash2(i, 23) * 5.5;
    pPhase[i] = hash2(i, 37) * TAU;
    pSize[i] = 0.6 + hash2(i, 51) * 1.5;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pointsMat = new THREE.PointsMaterial({
    map: kit.tex.glow, size: 2.2, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.55, sizeAttenuation: true, fog: false,
    color: new THREE.Color(0.9, 0.95, 1.0).convertSRGBToLinear(),
  });
  const points = new THREE.Points(pGeo, pointsMat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  group.add(points);

  let lutZ0 = -WORLD.shoreSpan / 2;
  let riderZ = 0, riderX = 0, t = 0;

  function snapStep() { return size / seg; }

  function rebuildLUT(z0) {
    const cv = makeShoreLUTCanvas(WORLD.shoreLutSize, z0, WORLD.shoreSpan);
    lutTex.image = cv;
    lutTex.needsUpdate = true;
    uniforms.uShoreZ0.value = z0;
    lutZ0 = z0;
  }

  function update(riderPos, camera, dt, day) {
    t += dt;
    riderZ = riderPos.z; riderX = riderPos.x;
    const step = snapStep();
    const px = Math.round(riderX / step) * step;
    const pz = Math.round(riderZ / step) * step;
    mesh.position.set(px, 0, pz);
    uniforms.uOrigin.value.set(px, pz);
    uniforms.uTime.value = t;
    uniforms.uCamPos.value.copy(camera.position);

    const lz0 = Math.round((riderZ - WORLD.shoreSpan / 2) / 80) * 80;
    if (Math.abs(lz0 - lutZ0) >= 80) rebuildLUT(lz0);

    // 浪花 sprite 的呼吸（整体材质透明度由昼夜调）
    kit.mat.foamSprite.opacity = 0.55 + 0.35 * Math.sin(t * 1.6) * Math.sin(t * 0.53);
    foam.update(riderZ);

    // 喷沫粒子（绝对 z 在跟随窗口内循环，避免重建缓冲）
    const posAttr = pGeo.attributes.position;
    const zLo = riderZ - 120, zHi = riderZ + 420;
    const wspan = zHi - zLo;
    for (let i = 0; i < pCount; i++) {
      let z = pZ[i];
      if (z < zLo) z += wspan;
      else if (z > zHi) z -= wspan;
      pZ[i] = z;
      const sx = shoreXAt(z);
      const ph = t * 2.2 + pPhase[i];
      const up = Math.max(0, Math.sin(ph));
      posAttr.setXYZ(i, sx + pLat[i] + Math.sin(ph * 0.7) * 0.8, 0.12 + up * (0.9 + pSize[i] * 0.5), z);
    }
    posAttr.needsUpdate = true;
    const night = day && day.night !== undefined ? day.night : 0;
    pointsMat.opacity = (0.24 + 0.3 * (1 - night)) * 0.9;
    pointsMat.size = 1.6 + Math.sin(t * 1.3) * 0.4;
  }

  function setQuality(q) {
    if (q.seg && q.seg !== seg) {
      seg = q.seg;
      const old = mesh.geometry;
      mesh.geometry = makeGeo(seg);
      old.dispose();
    }
    if (q.waveAmp !== undefined) uniforms.uWaveAmp.value = q.waveAmp;
  }

  function setFoamCount(n) {
    // 浪花 sprite 的可见数量（低档少画）
    foam.mesh.count = Math.max(2, Math.min(foam.count, n));
  }

  return {
    group: group,
    mesh: mesh,
    uniforms: uniforms,
    update: update,
    setQuality: setQuality,
    setFoamCount: setFoamCount,
    lutTexture: lutTex,
  };
}
