/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/sky.js —— 天空穹顶着色器 + 昼夜关键帧光照 + 太阳/月亮/星空 + 雾色
 * 关键帧（时刻 t：0 = 午夜，0.25 = 06:00，0.5 = 正午，0.75 = 18:00）插值出：
 *   天顶/地平/地平线色、太阳方向与颜色与强度、半球光、雾色浓度、night 权重（0 白天 → 1 深夜）、路灯强度。
 * 纯函数 sampleDay(t) 不依赖 three，Node 可 import 断言。
 */
'use strict';

import { RENDER, TIME } from './config.js';
import { clamp, clamp01, lerp, smoothstep, TAU, hash2, mixRGB, toLinear } from './utils.js';

/* ============================ 关键帧 ============================
 * 每帧：[t, 天顶RGB, 地平RGB, 地平线RGB, 太阳色, 太阳高度(-1..1), 太阳强度, 半球上天顶, 半球地, 雾色, 雾浓度, night, lamp]
 */
/** 6 位十六进制（可带可不带 '#'）→ [0..1] 三元组。关键帧写法不带 '#'。 */
const C = (h) => {
  const s = h.charAt(0) === '#' ? h.slice(1) : h;
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};

const KEYS = [
  { t: 0.00, top: C('060c1e'), bot: C('16233c'), hor: C('1d2b45'), sun: C('2c3a58'), el: -0.42, si: 0.05, amb: C('2a3a5c'), gnd: C('0c1118'), fog: C('0e1522'), fd: 0.0026, night: 1.00, lamp: 1.00 },
  { t: 0.18, top: C('1d2a4a'), bot: C('3d3a56'), hor: C('6b4f52'), sun: C('a8664a'), el: -0.05, si: 0.18, amb: C('43405e'), gnd: C('181a20'), fog: C('453c48'), fd: 0.0024, night: 0.72, lamp: 0.85 },
  { t: 0.25, top: C('3d6398'), bot: C('c98a62'), hor: C('f0b078'), sun: C('ffc084'), el: 0.06, si: 0.62, amb: C('8a8898'), gnd: C('3a3028'), fog: C('c09a78'), fd: 0.0022, night: 0.30, lamp: 0.40 },
  { t: 0.31, top: C('4d84bc'), bot: C('bcd2e4'), hor: C('e6dcc8'), sun: C('ffe6c0'), el: 0.22, si: 1.02, amb: C('a8c0d8'), gnd: C('4a4636'), fog: C('c8d2d8'), fd: 0.0021, night: 0.06, lamp: 0.10 },
  { t: 0.44, top: C('3f82cc'), bot: C('c4dcec'), hor: C('dfeaf2'), sun: C('fff6e4'), el: 0.62, si: 1.24, amb: C('b6cee4'), gnd: C('585244'), fog: C('c6d8e6'), fd: 0.0020, night: 0.00, lamp: 0.00 },
  { t: 0.52, top: C('3878c8'), bot: C('cfe4f2'), hor: C('eaf2f8'), sun: C('fffdf4'), el: 0.92, si: 1.32, amb: C('bcd6ea'), gnd: C('5c5648'), fog: C('cfe0ec'), fd: 0.0019, night: 0.00, lamp: 0.00 },
  { t: 0.66, top: C('4080c4'), bot: C('cadcE6'), hor: C('e2e6e0'), sun: C('fff0d8'), el: 0.56, si: 1.16, amb: C('b4cadc'), gnd: C('565040'), fog: C('cad6da'), fd: 0.0020, night: 0.00, lamp: 0.00 },
  { t: 0.755, top: C('35578e'), bot: C('e8a468'), hor: C('f8c070'), sun: C('ff9e52'), el: 0.10, si: 0.72, amb: C('8e8894'), gnd: C('3c3228'), fog: C('d8a87c'), fd: 0.0023, night: 0.26, lamp: 0.42 },
  { t: 0.83, top: C('1a2440'), bot: C('3a3a56'), hor: C('564a5a'), sun: C('6e5a68'), el: -0.10, si: 0.16, amb: C('464560'), gnd: C('1a1c24'), fog: C('2c3040'), fd: 0.0025, night: 0.78, lamp: 0.92 },
  { t: 1.00, top: C('060c1e'), bot: C('16233c'), hor: C('1d2b45'), sun: C('2c3a58'), el: -0.42, si: 0.05, amb: C('2a3a5c'), gnd: C('0c1118'), fog: C('0e1522'), fd: 0.0026, night: 1.00, lamp: 1.00 },
];

/** 关键帧插值（循环）。 */
export function sampleDay(t) {
  const tt = ((t % 1) + 1) % 1;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (tt >= KEYS[i].t && tt <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const f = smoothstep(0, 1, (tt - a.t) / Math.max(1e-6, b.t - a.t));
  const el = lerp(a.el, b.el, f);
  const az = ((tt - 0.25) / 0.53) * Math.PI;
  const horiz = Math.sqrt(Math.max(0.0001, 1 - el * el));
  const dir = [Math.cos(az) * horiz, el, Math.sin(az) * horiz * 0.30 + 0.22];
  const L = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const night = clamp01(lerp(a.night, b.night, f));
  return {
    t: tt,
    top: mixRGB(a.top, b.top, f),
    bot: mixRGB(a.bot, b.bot, f),
    hor: mixRGB(a.hor, b.hor, f),
    sun: mixRGB(a.sun, b.sun, f),
    amb: mixRGB(a.amb, b.amb, f),
    gnd: mixRGB(a.gnd, b.gnd, f),
    fog: mixRGB(a.fog, b.fog, f),
    fogDensity: lerp(a.fd, b.fd, f),
    sunDir: [dir[0] / L, dir[1] / L, dir[2] / L],
    moonDir: [-dir[0] * 0.72, Math.max(0.18, -dir[1] * 0.9), -dir[2] * 0.6],
    sunElev: el,
    sunIntensity: lerp(a.si, b.si, f) * (1 - night * 0.86),
    night: night,
    lamp: clamp01(lerp(a.lamp, b.lamp, f)),
    warm: clamp01(1 - Math.abs(el - 0.12) * 3.2),   // 日出日落金色时段
  };
}

/* ============================ 天空着色器 ============================ */
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uBot;
uniform vec3 uHor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uNight;
uniform float uWarm;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  float up = smoothstep(-0.02, 0.55, h);
  col = mix(uHor, uTop, up);
  col = mix(uBot, col, smoothstep(-0.55, 0.02, h));
  // 地平线霾（贴地平的一圈亮带）
  col += uHor * pow(1.0 - abs(h), 9.0) * 0.55;

  // 太阳盘 + 晕
  float dsun = dot(d, normalize(uSunDir));
  float disc = smoothstep(0.9982, 0.99925, dsun);
  float halo = pow(max(dsun, 0.0), 22.0) * 0.5 + pow(max(dsun, 0.0), 3.0) * 0.10;
  col += uSunColor * (disc * 3.2 + halo) * (1.0 - uNight * 0.9);
  // 日落方向的暖色扩散
  float sunAz = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))));
  col += uSunColor * pow(sunAz, 6.0) * pow(1.0 - abs(h), 3.0) * uWarm * 0.30 * (1.0 - uNight);

  // 月亮
  float dm = dot(d, normalize(uMoonDir));
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9990, 0.99955, dm) * 2.2 + pow(max(dm, 0.0), 40.0) * 0.10) * uNight;

  // 星空（越高越密，闪烁）
  if (uNight > 0.02 && h > 0.01) {
    vec3 gp = floor(d * 220.0);
    float s = hash(gp);
    float star = smoothstep(0.9955, 1.0, s) * 22.0;
    float tw = 0.6 + 0.4 * sin(hash(gp + 3.0) * 40.0);
    col += vec3(0.82, 0.86, 1.0) * star * tw * uNight * smoothstep(0.01, 0.35, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}
`;

/* ============================ 装配 ============================ */
export function createSky(THREE, kit, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  const R = 3000;

  const uniforms = {
    uTop: { value: new THREE.Color(0.24, 0.48, 0.80) },
    uBot: { value: new THREE.Color(0.78, 0.86, 0.94) },
    uHor: { value: new THREE.Color(0.83, 0.88, 0.93) },
    uSunColor: { value: new THREE.Color(1, 0.98, 0.92) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
    uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, -0.4) },
    uNight: { value: 0 },
    uWarm: { value: 0 },
  };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -2;
  dome.matrixAutoUpdate = true;
  group.add(dome);

  // 太阳/半球光
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.castShadow = !!o.shadow;
  const span = RENDER.shadowSpan;
  sun.shadow.mapSize.width = sun.shadow.mapSize.height = o.shadowMapSize || 1024;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -span / 2;
  sun.shadow.camera.right = span / 2;
  sun.shadow.camera.top = span / 2;
  sun.shadow.camera.bottom = -span / 2;
  sun.shadow.bias = RENDER.shadowBias;
  sun.shadow.normalBias = 0.02;
  sun.target.matrixAutoUpdate = true;
  group.add(sun);
  group.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xb6cee4, 0x585244, 0.7);
  group.add(hemi);

  const rim = new THREE.DirectionalLight(0xffb070, 0.0);
  group.add(rim);
  group.add(rim.target);

  // 月亮弱补光（夜里给一点方向性，避免全黑）
  const moonL = new THREE.DirectionalLight(0x9fb4d8, 0.0);
  group.add(moonL);
  group.add(moonL.target);

  const stars = [];
  if (o.stars) {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(o.stars * 3);
    for (let i = 0; i < o.stars; i++) {
      const a = hash2(i, 3) * TAU, e = Math.acos(1 - hash2(i, 7) * 1.1), r = R * 0.9;
      arr[i * 3] = Math.cos(a) * Math.sin(e) * r;
      arr[i * 3 + 1] = Math.abs(Math.cos(e)) * r * 0.9 + 40;
      arr[i * 3 + 2] = Math.sin(a) * Math.sin(e) * r;
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    group.add(pts);
    stars.push({ pts: pts, mat: m });
  }

  const state = { t: TIME.start, night: 0, lamp: 0, sunDir: [0, 1, 0], fog: [0.8, 0.86, 0.92] };

  function update(riderPos, cameraPos, day) {
    state.t = day.t; state.night = day.night; state.lamp = day.lamp;
    state.sunDir = day.sunDir; state.fog = day.fog;
    dome.position.copy(cameraPos);
    // 关键帧里存的是 sRGB 显示色；输出编码会把线性转回 sRGB，所以这里统一转线性
    uniforms.uTop.value.fromArray(toLinear(day.top));
    uniforms.uBot.value.fromArray(toLinear(day.bot));
    uniforms.uHor.value.fromArray(toLinear(day.hor));
    uniforms.uSunColor.value.fromArray(toLinear(day.sun));
    uniforms.uSunDir.value.fromArray(day.sunDir);
    uniforms.uMoonDir.value.fromArray(day.moonDir);
    uniforms.uNight.value = day.night;
    uniforms.uWarm.value = day.warm;

    const sd = day.sunDir;
    sun.position.set(riderPos.x + sd[0] * 120, riderPos.y + Math.max(6, sd[1] * 120), riderPos.z + sd[2] * 120);
    sun.target.position.set(riderPos.x, riderPos.y, riderPos.z);
    sun.color.fromArray(toLinear(day.sun));
    sun.intensity = day.sunIntensity;
    sun.visible = day.sunIntensity > 0.03;

    hemi.color.fromArray(toLinear(day.amb));
    hemi.groundColor.fromArray(toLinear(day.gnd));
    hemi.intensity = 0.34 + (1 - day.night) * 0.52;

    rim.color.fromArray(toLinear(day.sun));
    rim.intensity = day.warm * 0.55 * (1 - day.night);
    rim.position.set(riderPos.x - sd[0] * 40, riderPos.y + 8, riderPos.z - sd[2] * 40);
    rim.target.position.set(riderPos.x, riderPos.y + 1, riderPos.z);

    const md = day.moonDir;
    moonL.position.set(riderPos.x + md[0] * 90, riderPos.y + md[1] * 90 + 30, riderPos.z + md[2] * 90);
    moonL.target.position.set(riderPos.x, riderPos.y, riderPos.z);
    moonL.intensity = day.night * 0.26;

    for (const s of stars) {
      s.pts.position.copy(cameraPos);
      // 星星只在夜里显形：黄昏（night≈0.3）必须看不见，否则白天的天空上会浮出白点
      s.mat.opacity = smoothstep(0.42, 0.82, day.night) * 0.92;
      s.pts.visible = s.mat.opacity > 0.02;
    }
  }

  function setQuality(q) {
    const size = q.shadowMapSize || 1024;
    if (sun.shadow.mapSize.width !== size) {
      sun.shadow.mapSize.width = sun.shadow.mapSize.height = size;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    sun.castShadow = !!q.shadow;
    sun.shadow.camera.updateProjectionMatrix();
  }

  return { group: group, dome: dome, sun: sun, hemi: hemi, rim: rim, moonLight: moonL, uniforms: uniforms, update: update, setQuality: setQuality, state: state };
}
