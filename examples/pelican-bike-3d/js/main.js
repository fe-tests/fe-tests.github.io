/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/main.js —— 启动、装配、主循环
 * 启动顺序：three 存在性 → WebGL 能力 → 贴图 → 地形/公路/海面/天空/植被 → 鹈鹕+自行车 → 渲染循环。
 * 任何一步失败都走 #fallback 面板（给出可读原因，不白屏）；file:// 直接给服务器提示。
 */
'use strict';

import { RENDER, QUALITY, TIME, RIGS } from './config.js';
import { mixRGB, clamp, toLinear } from './utils.js';
import { buildTextureKit } from './textures.js';
import { createTerrain, terrainHeight } from './terrain.js';
import { createRoad } from './road.js';
import { createOcean } from './ocean.js';
import { createSky, sampleDay } from './sky.js';
import { createScenery } from './scenery.js';
import { createRider } from './rider.js';
import { createCameraRig } from './camera.js';
import { createUI } from './ui.js';
import { bindInput } from './input.js';
import { createQuality, applyToRenderer, loadPrefs } from './quality.js';
import { createAudio } from './audio.js';

const dom = {
  canvas: document.getElementById('gl'),
  fallback: document.getElementById('fallback'),
};

/* ============================ 环境能力检测 ============================ */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const ok = window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    if (ok && ok.getExtension) ok.getExtension('webgl');
    return !!ok;
  } catch (e) { return false; }
}

function fatal(title, lines) {
  const box = dom.fallback;
  if (box) {
    const t = box.querySelector('.fb-title');
    const l = box.querySelector('.fb-lines');
    if (t) t.textContent = title;
    if (l) l.textContent = lines;
    box.classList.add('show');
  }
  const load = document.getElementById('loading');
  if (load) load.classList.add('done');
}

function twoFrames() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () { requestAnimationFrame(resolve); });
  });
}

/* ============================ 入口 ============================ */
async function boot() {
  const ui = createUI({ handlers: {} });
  const H = ui.handlers;
  if (location.protocol === 'file:') ui.showFileNotice();
  if (typeof THREE === 'undefined') {
    fatal('这个页面加载不到 Three.js', '需要 assets/vendor/three/r128/three.min.js（仓库内自带，不联网）。用 node server.js 打开站点根目录后访问本页。');
    return;
  }
  if (!hasWebGL()) {
    fatal('浏览器未提供可用的 WebGL', '请在 Chrome / Edge / Firefox 中打开，并开启「使用硬件加速模式」；无显卡环境（远程桌面、虚拟机）通常无法渲染 3D。');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    fatal('WebGL 上下文创建失败', String((e && e.message) || e));
    return;
  }
  renderer.setClearColor(0x0a0f16, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    running = false;
    fatal('WebGL 上下文丢失', '显卡驱动回收了上下文（切换显卡 / 休眠后常见）。刷新页面即可恢复。');
  });

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc6d8e6, RENDER.fogDensity);
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

  /* ---------- 分步构建（带载入进度） ---------- */
  const kit = { ref: null };
  const world = { terrain: null, road: null, ocean: null, sky: null, scenery: null, rider: null };
  const rigRef = { ref: null };
  const audio = createAudio();
  const prefs = loadPrefs();
  const qp = new URLSearchParams(location.search);
  const tierArg = QUALITY[qp.get('tier')] ? qp.get('tier') : null;
  const timeArg = qp.has('time') ? clamp(parseFloat(qp.get('time')), 0, 0.999) : NaN;
  let timeOfDay = !Number.isNaN(timeArg) ? timeArg
    : (prefs && typeof prefs.time === 'number' ? prefs.time : TIME.start);
  let cycling = qp.has('cycle') ? qp.get('cycle') === '1' : (prefs ? !!prefs.cycle : true);
  let quality = null;

  const bootTier = QUALITY[tierArg || 'mid'];
  const steps = [
    ['生成程序化贴图', function () {
      kit.ref = buildTextureKit(THREE, { anisotropy: Math.min(RENDER.maxAnisotropy, maxAniso) });
    }],
    ['生成地形与沙滩', function () {
      world.terrain = createTerrain(THREE, kit.ref, { seg: bootTier.tileSeg });
      scene.add(world.terrain.group);
    }],
    ['铺设海岸公路', function () {
      world.road = createRoad(THREE, kit.ref);
      scene.add(world.road.group);
    }],
    ['海面与天空', function () {
      world.ocean = createOcean(THREE, kit.ref, { seg: bootTier.seaSeg, waveAmp: bootTier.waveAmp, particles: bootTier.particles });
      scene.add(world.ocean.group);
      world.sky = createSky(THREE, kit.ref, {
        shadow: bootTier.shadow, shadowMapSize: bootTier.shadowMapSize, stars: bootTier.stars,
      });
      scene.add(world.sky.group);
    }],
    ['植被与远景', function () {
      world.scenery = createScenery(THREE, kit.ref, { density: bootTier.props, gulls: bootTier.gulls, clouds: bootTier.clouds });
      scene.add(world.scenery.group);
    }],
    ['鹈鹕与自行车', function () {
      world.rider = createRider(THREE, kit.ref, { z0: 0 });
      scene.add(world.rider.group);
    }],
    ['相机与操作', function () {
      const rig = createCameraRig(THREE, { fov: RENDER.fovDefault, aspect: window.innerWidth / window.innerHeight });
      rig.setGroundSampler(terrainHeight);   // 相机贴地：用真实地形，海边机位才能贴到海面上方
      rigRef.ref = rig;
      rig.setRig(RIGS[0].id, true);
    }],
  ];

  let si = 0;
  for (const step of steps) {
    ui.setProgress(si / steps.length, step[0]);
    await twoFrames();
    try {
      step[1]();
    } catch (e) {
      fatal('构建场景时出错：' + step[0], String((e && e.stack) || e));
      return;
    }
    si++;
  }
  ui.setProgress(1, '就绪');

  /* ---------- 画质档 ---------- */
  function applyQuality(tierId, tier) {
    applyToRenderer(THREE, renderer, tier);
    if (world.terrain) world.terrain.rebuild(tier.tileSeg);
    if (world.ocean) {
      world.ocean.setQuality({ seg: tier.seaSeg, waveAmp: tier.waveAmp });
      world.ocean.setFoamCount(tier.foamSprites);
    }
    if (world.scenery) {
      world.scenery.setDensity(tier.props);
      world.scenery.setCounts(tier);
    }
    if (world.sky) world.sky.setQuality(tier);
    if (world.rider) world.rider.setDetail(tierId === 'high' ? 2 : (tierId === 'mid' ? 1 : 0));
  }

  quality = createQuality(THREE, renderer, {
    onQuality: function (tierId, tier, reason) {
      applyQuality(tierId, tier);
      ui.setTier(tierId);
      if (reason === 'down') ui.toast('帧率不足，已切到「' + tier.name + '」档（A 关闭自动降档）');
      if (reason === 'up') ui.toast('帧率富余，已切到「' + tier.name + '」档');
    },
    onAutoChange: function (auto) { ui.setAutoLabel(auto); },
  }, { tier: tierArg, ignorePrefs: !!tierArg });

  /* ---------- 输入（鼠标 / 触控 / 键盘） ---------- */
  function toggleAudio() {
    const next = !audio.on;
    const ok = audio.setEnabled(next);
    ui.setAudioLabel(ok ? audio.on : false);
    if (!ok) ui.toast('这个浏览器不支持 WebAudio，无法播放环境声');
    else ui.toast(next ? '环境声：开 (M)' : '环境声：关 (M)');
  }

  bindInput({
    dom: dom,
    camera: rigRef.ref,
    ui: ui,
    onPointerDown: function () { audio.unlockOnce(); },
    onKey: function (ev, arg) {
      if (ev === 'time') { timeOfDay = (timeOfDay + arg + 1) % 1; cycling = false; }
      else if (ev === 'cycle') { cycling = !cycling; ui.toast(cycling ? '昼夜循环：开 (N)' : '昼夜循环：关 (N)'); }
      else if (ev === 'hud') ui.toggleHud();
      else if (ev === 'audio') toggleAudio();
      else if (ev === 'help') ui.toggleHelp();
      else if (ev === 'esc') ui.toggleHelp(false);
      else if (ev === 'auto') ui.setAutoLabel(rigRef.ref.tour.auto);
      else if (ev === 'nextRig') ui.setRigName(rigRef.ref.current());
      else if (ev === 'pause') ui.toast(rigRef.ref.tour.paused ? '巡游已暂停' : '巡游继续');
    },
  });

  /* ---------- UI 交互 ---------- */
  H.pickRig = function (id) {
    rigRef.ref.setRig(id, false);
    ui.setRigName(rigRef.ref.current());
    ui.toast('机位：' + rigRef.ref.current().cn);
  };
  H.setTier = function (t) { quality.setTier(t, true); ui.toast('画质档：' + QUALITY[t].name); };
  H.setTime = function (v, fromSlider) { timeOfDay = ((v % 1) + 1) % 1; cycling = false; ui.setTime(timeOfDay, fromSlider); };
  H.cycle = function () { cycling = !cycling; ui.toast(cycling ? '昼夜循环：开 (N)' : '昼夜循环：关 (N)'); };
  H.audio = toggleAudio;

  ui.setRigName(rigRef.ref.current());
  ui.setTourMode(rigRef.ref.tour.auto, false);
  ui.setTier(quality.tier);
  ui.setAudioLabel(false);
  ui.setTime(timeOfDay, false);
  ui.setAutoLabel(rigRef.ref.tour.auto);

  /* ---------- 尺寸 ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    rigRef.ref.setAspect(w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- 主循环 ---------- */
  let running = true;
  let last = performance.now();
  let hudTimer = 0;
  let lastCrankStep = -1;
  const rigBasis = {
    position: [0, 0, 0], forward: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0], groundY: 0,
  };

  function readBasis() {
    const b = world.rider.basis;
    rigBasis.position[0] = b.position.x; rigBasis.position[1] = b.position.y; rigBasis.position[2] = b.position.z;
    rigBasis.forward[0] = b.forward.x; rigBasis.forward[1] = b.forward.y; rigBasis.forward[2] = b.forward.z;
    rigBasis.right[0] = b.right.x; rigBasis.right[1] = b.right.y; rigBasis.right[2] = b.right.z;
    rigBasis.up[0] = b.up.x; rigBasis.up[1] = b.up.y; rigBasis.up[2] = b.up.z;
    rigBasis.groundY = world.rider.state.y - 0.6;
    return rigBasis;
  }

  function updateDay(dt) {
    if (cycling) timeOfDay = (timeOfDay + dt * TIME.daySpeed) % 1;
    const day = sampleDay(timeOfDay);
    // 关键帧是 sRGB 显示色；渲染器 outputEncoding = sRGBEncoding ⇒ 送进 uniform 的一律转线性
    scene.fog.color.fromArray(toLinear(day.fog));
    scene.fog.density = day.fogDensity;
    renderer.setClearColor(scene.fog.color, 1);
    const u = world.ocean.uniforms;
    u.uFogColor.value.fromArray(toLinear(day.fog));
    u.uFogDensity.value = day.fogDensity;
    u.uSkyColor.value.fromArray(toLinear(mixRGB(day.top, day.hor, 0.45)));
    u.uDeep.value.fromArray(toLinear(mixRGB(day.fog, [0.021, 0.086, 0.112], 0.66)));
    u.uShallow.value.fromArray(toLinear(mixRGB(day.hor, [0.086, 0.30, 0.32], 0.52)));
    u.uSunDir.value.fromArray(day.sunDir);
    u.uSunColor.value.fromArray(toLinear(day.sun));
    u.uNight.value = day.night;
    kit.ref.mat.cloud.color.fromArray(toLinear(mixRGB(day.hor, [1, 1, 1], 0.55 * (1 - day.night))));
    kit.ref.mat.cloud.opacity = 0.52 + (1 - day.night) * 0.34;
    kit.ref.mat.lampGlow.opacity = day.lamp * 0.9;
    world.road.setLampOpacity(day.lamp * 0.9);
    // 夜间整体压一档曝光（夜里灯/自发光在 ACES 下会糊成一片暖黄）
    renderer.toneMappingExposure = 0.98 - day.night * 0.34;
    // 远山/海岬：白天朝雾色收拢，夜里压到接近夜雾，避免灯下变成暖棕色大块
    kit.ref.mat.headland.color.fromArray(toLinear(mixRGB(day.fog, [0.30, 0.36, 0.42], 0.35 * (1 - day.night * 0.8))));
    return day;
  }

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (document.hidden) return;

    const day = updateDay(dt);
    world.rider.update(dt, day);
    const z = world.rider.state.z;
    world.terrain.update(z);
    world.road.update(z);
    world.scenery.update(z, dt, day, 3.2);

    const rig = rigRef.ref;
    rig.update(dt, readBasis(), day);
    world.sky.update(world.rider.group.position, rig.camera.position, day);
    world.ocean.update(world.rider.group.position, rig.camera, dt, day);

    // 声音：踏频咔哒（每半圈一次）+ 展翅呼呼
    audio.update(dt, world.rider.state.speed, day);
    const rs = world.rider.state;
    const crankStep = Math.floor(rs.crankPhase / Math.PI);
    if (crankStep !== lastCrankStep) {
      if (lastCrankStep >= 0 && rs.speed > 4.2) audio.click(1);
      lastCrankStep = crankStep;
    }
    if (world.rider.pelican.state.flapT > 0 && world.rider.pelican.state.flapT < 0.05) audio.whoop(0.8);

    renderer.render(scene, rig.camera);

    const fps = quality.tick(dt);
    hudTimer += dt;
    if (hudTimer > 0.35) {
      hudTimer = 0;
      const info = renderer.info.render;
      ui.setFps(fps, info.calls, info.triangles, QUALITY[quality.tier].name);
      ui.setStats(rs.s, rs.speed, timeOfDay);
    }
  }

  requestAnimationFrame(frame);
  ui.hideLoading();
  ui.toast('左键拖拽转视角 · 滚轮推拉 · 空闲 3.5 秒回自动巡游 · 1-7 切机位 · H 隐藏界面', 4600);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) last = performance.now();
  });

  /* ---------- 截图 / 调试钩子（?shot=1 才暴露，与 tools/shot.mjs 对接） ----------
   * 软渲染（swiftshader）约 1 fps，机位过渡是 dt 驱动的 → 探针必须瞬移落位，不能数按键帧。
   */
  if (/[?&]shot=1/.test(location.search)) {
    window.__pbike = {
      scene: scene, renderer: renderer, rig: rigRef.ref, rider: world.rider,
      world: world, quality: quality, ui: ui, kit: kit.ref,
      snapRig: function (id) { rigRef.ref.setRig(id, true); },
      /**
       * 调试机位：把 rig.update 换成「贴在双腿/曲柄上」的固定取景（软渲染下截图要等几十秒，
       * 而机位偏移会在 3.5 s 后自动归零 → 用鼠标偏移取特写必被拉回远景，所以这里直接冻住相机）。
       * @param {boolean} on  true 启用 / false 还原巡游机位
       * @param {number} k   镜头到取景中心的距离 m
       * @param {number} side  横向偏移（+ = 骑行者右侧）
       */
      legCam: function (on, k, side) {
        const rig = rigRef.ref;
        if (!on) { if (rig.__tourUpdate) { rig.update = rig.__tourUpdate; rig.__tourUpdate = null; } return 'off'; }
        if (!rig.__tourUpdate) rig.__tourUpdate = rig.update;
        const d = Number.isFinite(k) ? k : 1.0;
        const lat = Number.isFinite(side) ? side : 0.62;
        rig.update = function (dt, basis) {
          const F = basis.forward, R = basis.right, U = basis.up, P = basis.position;
          const look = [P[0] + U[0] * 0.40 + F[0] * 0.06, P[1] + U[1] * 0.40 + F[1] * 0.06, P[2] + U[2] * 0.40 + F[2] * 0.06];
          const cx = look[0] + R[0] * d * lat - F[0] * d * 0.72 + U[0] * d * 0.20;
          const cy = look[1] + R[1] * d * lat - F[1] * d * 0.72 + U[1] * d * 0.20;
          const cz = look[2] + R[2] * d * lat - F[2] * d * 0.72 + U[2] * d * 0.20;
          rig.camera.position.set(cx, Math.max(cy, basis.groundY + 0.25), cz);
          rig.camera.lookAt(look[0], look[1], look[2]);
          if (Math.abs(rig.camera.fov - 36) > 0.01) { rig.camera.fov = 36; rig.camera.updateProjectionMatrix(); }
        };
        return 'legs-cam d=' + d + ' lat=' + lat;
      },
      setTime: function (v, cyc) { timeOfDay = ((v % 1) + 1) % 1; cycling = !!cyc; },
      setTier: function (t) { quality.setTier(t, false); },
      jump: function (z) { world.rider.state.z = z; world.rider.state.s = z * 0.9; },
      pick: function (nx, ny) {
        // 调试辅助：从屏幕 (nx, ny)∈[0,1] 发射射线，返回沿途命中的物体（判断“这团颜色是谁画的”）
        try {
          const rc = new THREE.Raycaster();
          rc.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), rigRef.ref.camera);
          return rc.intersectObjects(scene.children, true).slice(0, 5).map(function (h) {
            const o = h.object, m = o.material;
            return {
              n: o.name || (o.type + '#' + o.id), d: +h.distance.toFixed(1),
              p: [Math.round(h.point.x), Math.round(h.point.y), Math.round(h.point.z)],
              sc: Math.round((o.parent && o.parent.name === '') ? 0 : 0),
              c: (m && m.color) ? ('#' + m.color.getHexString()) : null,
              mt: m ? m.type : null,
              add: !!(m && m.blending === THREE.AdditiveBlending),
              op: m && m.opacity !== undefined ? +m.opacity.toFixed(2) : null,
            };
          });
        } catch (e) { return 'pick-fail:' + e.message; }
      },
      legs: function () {
        // 腿部链复核：每只踝关节的世界位置 vs 它该踩的那颗脚踏（间隙稳定在 ~4 cm = 蹼足厚度）
        const out = [];
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        const pel = world.rider.pelican, bk = world.rider.bike;
        for (const leg of pel.legs) {
          leg.foot.getWorldPosition(a);
          const ped = leg.side > 0 ? bk.pedalL : bk.pedalR;
          ped.getWorldPosition(b);
          out.push({
            side: leg.side,
            ankle: [+a.x.toFixed(3), +a.y.toFixed(3), +a.z.toFixed(3)],
            pedal: [+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)],
            gap: +a.distanceTo(b).toFixed(3),
            knee: +leg.knee.rotation.z.toFixed(2),
            hip: +leg.hip.rotation.z.toFixed(2),
          });
        }
        return out;
      },
      info: function () {
        const i = renderer.info.render;
        const V = function (o) { const p = o.getWorldPosition(new THREE.Vector3()); return +p.y.toFixed(3); };
        return {
          calls: i.calls, tris: i.triangles, tier: quality.tier, rig: rigRef.ref.currentId(),
          z: world.rider.state.z, t: timeOfDay,
          riderY: V(world.rider.group), pelicanY: V(world.rider.pelican.group),
          saddleY: +(world.rider.group.position.y + 0.71).toFixed(3),
          sky: (function () {
            try { return { night: +world.sky.state.night.toFixed(2), lamp: +world.sky.state.lamp.toFixed(2) }; }
            catch (e) { return 'sky-info-fail:' + e.message; }
          })(),
        };
      },
    };
  }
}

boot().catch(function (e) {
  fatal('页面启动失败', String((e && e.stack) || e));
});
