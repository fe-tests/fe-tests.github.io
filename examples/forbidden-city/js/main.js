/* 3D 故宫游览 · js/main.js —— 入口装配（阶段 1）
 * 流程：探测依赖 → 建场景 → 画质档 → 输入 → 主循环 → resize / 生命周期。
 * 接续开发请先看 ../docs/PROGRESS.md；素材台账 ../docs/assets.md；数值出处 ../docs/research.md。
 */
'use strict';

import { Quality } from './quality.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { buildWorld } from './world.js';
import { newState, recordZone, zoneOfZ, saveProgress, loadProgress } from './state.js';
import { RENDER, WALK_SPEED, RUN_SPEED, EYED_H } from './config.js';

const VENDOR_THREE = '../../assets/vendor/three/r128/three.min.js';
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (isTouch) document.body.classList.add('touch');

const ui = new UI();
const state = newState();
state.progress = loadProgress();

/* ------------------------------ 1. 依赖与环境探测（不得白屏）------------------------------ */

function fail(info) {
  state.mode = 'fallback';
  ui.fallback(info);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

if (!window.isSecureContext) {
  // 仅提示：非安全上下文里全屏 / 振动接口不可用，不影响渲染
  console.warn('[forbidden-city] 非安全上下文：全屏与振动接口不可用');
}

if (typeof THREE === 'undefined') {
  fail({
    title: '缺少 Three.js r128（本地依赖未加载）',
    lines: [
      '本页面的运行时依赖已随仓库提供，路径：' + VENDOR_THREE,
      '请确认该文件存在；若是 git 拉取后缺失，执行 git checkout -- assets/vendor/three/。',
      '不要改用外部 CDN —— 本页面按站内规范离线加载本地 vendor 资源。',
    ],
    retry: true,
  });
} else if (!hasWebGL()) {
  fail({
    title: '这台设备上的浏览器拿不到 WebGL',
    lines: [
      '可尝试：更新浏览器 / 开启「硬件加速」/ 关闭省电模式后重试。',
      '手机用户建议 Chrome / Edge / Safari 最新版，或换一台支持 WebGL 的设备。',
      '本页面不提供 2D 简版（3D 游览是核心玩法），抱歉带来不便。',
    ],
    retry: true,
  });
} else {
  boot();
}

/* ------------------------------ 2. 启动 ------------------------------ */

function boot() {
  ui.progress(0.1, '创建渲染器…');
  state.mode = 'play';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    fail({ title: 'WebGL 上下文创建失败', lines: ['错误：' + (e && e.message ? e.message : e), '关闭其它占用 GPU 的页面后重试。'], retry: true });
    return;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;      // r128 的色彩口径（r15x 才改名 outputColorSpace）
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'gl';
  document.body.appendChild(renderer.domElement);

  ui.progress(0.4, '装配场景…');
  let aniso = 1;
  try { aniso = Math.min(RENDER.maxAnisotropy, renderer.capabilities.getMaxAnisotropy()); } catch (e) { aniso = 1; }
  const world = buildWorld(THREE, { quality: Quality.detectLevel(navigator), maxAnisotropy: aniso });

  const quality = new Quality({ THREE: THREE, renderer: renderer, scene: world.scene });
  // 阴影相机跟随玩家，避免整城范围导致纹素过粗
  world.sun.shadow.camera.left = -quality.params.shadowSpan;
  world.sun.shadow.camera.right = quality.params.shadowSpan;
  world.sun.shadow.camera.top = quality.params.shadowSpan;
  world.sun.shadow.camera.bottom = -quality.params.shadowSpan;

  ui.progress(0.7, '绑定输入…');
  const input = new Input({ canvas: renderer.domElement, isTouch: isTouch });

  // 相机姿态（阶段 8 交给 player.js + collision.js，这里先给可跑的临时行走）
  const cam = { x: 0, z: -520, yaw: Math.PI, pitch: -0.10, y: EYED_H };
  applyCamera();

  /* ------------------------------ 3. 主循环 ------------------------------ */
  let last = performance.now();
  let saveAcc = 0;

  ui.progress(1, '进入紫禁城');
  setTimeout(function () { ui.hideLoading(); }, 260);
  ui.toast(isTouch ? '左半屏拖动行走 · 右半屏拖动看视角' : 'WASD 行走 · 拖拽转视角 · Shift 加速 · H 隐藏读数', 4600);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);   // 上限步长：切后台回来不爆
    last = now;

    // 移动：摇杆/键盘意图 → 按相机朝向折算到世界坐标
    const mv = input.moveVector();
    if (mv.x || mv.y) {
      const spd = (input.run ? RUN_SPEED : WALK_SPEED) * dt;
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      cam.x += (-mv.y * sy + mv.x * cy) * spd;
      cam.z += (-mv.y * cy - mv.x * sy) * spd;
    }

    // 视角：拖拽增量 → yaw / pitch
    const look = input.consumeLook();
    if (look.dx || look.dy) {
      cam.yaw -= look.dx * 0.0032;
      cam.pitch = clamp(cam.pitch - look.dy * 0.0028, -1.2, 0.65);
    }

    // FOV：滚轮 / 双指捏合的平滑过渡
    if (Math.abs(world.camera.fov - input.fovTarget) > 0.01) {
      world.camera.fov += (input.fovTarget - world.camera.fov) * Math.min(1, dt * 8);
      world.camera.updateProjectionMatrix();
    }

    applyCamera();

    // 太阳与阴影范围跟随玩家（阶段 5 起台基/殿宇才需要精细阴影）
    world.sun.position.set(cam.x - 180, 260, cam.z - 40);
    world.sun.target.position.set(cam.x, 0, cam.z);

    // 分区 → 成就
    const zone = zoneOfZ(cam.z);
    if (zone !== state.lastZone) {
      const unlocked = recordZone(state, zone);
      for (let i = 0; i < unlocked.length; i++) ui.toast('解锁成就 ' + unlocked[i].icon + ' ' + unlocked[i].name, 3200);
    }

    // 地面跟着挪（阶段 4 换成 chunk 调度后移除）
    world.ground.mesh.position.x = Math.round(cam.x / 200) * 200;
    world.ground.mesh.position.z = Math.round(cam.z / 200) * 200;

    if (quality.update(dt)) ui.toast('画质自动调整为「' + quality.params.name + '」', 2200);

    renderer.render(world.scene, world.camera);
    // now = rAF 时间戳，与定时器解耦（见 PROGRESS.md D15）
    ui.update(now, quality.summary(), zoneName(zone));

    saveAcc += dt;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function applyCamera() {
    world.camera.position.set(cam.x, cam.y, cam.z);
    world.camera.rotation.order = 'YXZ';
    world.camera.rotation.y = cam.yaw;
    world.camera.rotation.x = cam.pitch;
  }

  /* ------------------------------ 4. 窗口与生命周期 ------------------------------ */
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    world.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    world.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 260); });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) last = performance.now();
  });

  window.addEventListener('keydown', function (e) {
    if (String(e.key).toLowerCase() === 'h') ui.toggleHud();
  });
  ui.bindQuality(function (level) { quality.setManual(level); });

  // 移动端尝试锁横屏（不支持的浏览器静默失败）
  try {
    if (isTouch && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
  } catch (e) {}
}

function zoneName(zone) {
  return ({
    outside: '午门广场', wumenYuan: '午门 · 内金水河', outerCourt: '外朝三大殿',
    qianqingGate: '乾清门前', innerCourt: '内廷后三宫', yuhuayuan: '御花园',
    northOutside: '神武门 · 景山', out: '',
  })[zone] || '';
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
