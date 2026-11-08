/* 3D 故宫游览 · js/main.js —— 入口装配（阶段 1）
 * 流程：探测依赖 → 建场景 → 画质档 → 输入 → 主循环 → resize / 生命周期。
 * 接续开发请先看 ../docs/PROGRESS.md；素材台账 ../docs/assets.md；数值出处 ../docs/research.md。
 */
'use strict';

import { Quality } from './quality.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { buildWorld } from './world.js';
import { CameraRig } from './camera.js';
import { newState, recordZone, zoneOfZ, saveProgress, loadProgress } from './state.js';
import { RENDER, WALK_SPEED, RUN_SPEED, EYED_H, AXES } from './config.js';

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
  // 机位权威量交给 CameraRig（阶段 4 提前落地）：walk / fly / overview 三档 + 平滑飞越
  const rig = new CameraRig({ camera: world.camera, pose: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch } });
  applyCamera();

  /* ------------------------------ 3. 主循环 ------------------------------ */
  let last = performance.now();
  let saveAcc = 0;

  ui.progress(1, '进入紫禁城');
  setTimeout(function () { ui.hideLoading(); }, 260);
  // SwiftShader / 软渲染判定：UNMASKED_RENDERER_WEBGL 里带「SwiftShader」即无 GPU。
  // 没有真 GPU 时帧间隔是「秒级」，任何按 dt 累加的缓动都会拖成长达几十秒的动画 → 视角切换改瞬切。
  let gpuAccel = true;
  try {
    const gl = renderer.getContext();
    const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbgExt ? String(gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|software|basic render/i.test(name)) gpuAccel = false;
  } catch (e) { gpuAccel = true; }
  ui.toast(isTouch ? '左半屏拖动行走 · 右半屏拖动看视角 · 右下「俯瞰」看全局' : 'WASD 行走 · 拖拽转视角 · Shift 加速 · V 切换俯瞰/飞行 · H 隐藏读数', 5200);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);   // 上限步长：切后台回来不爆
    last = now;

    // 模式切换的机位缓动：只推进过渡，**不锁输入**（返回值不能当闸门，见 camera.js / D20）
    rig.update(dt);

    {
      // 移动：摇杆/键盘意图 → 按相机朝向折算到世界坐标。
      // ⚠️ overview 也要**消费**掉移动意图（只是不位移）：否则摇杆量会攒到切回漫步时一次性释放。
      const mvAll = input.moveVector();
      const mv = rig.mode === 'overview' ? { x: 0, y: 0 } : mvAll;
      if (mv.x || mv.y) {
        // 走/跑要乘 dt；飞行是「每秒速度」，同样要乘 dt（否则按帧率缩放，高刷屏会飞得更快）
        const spd = (rig.mode === 'fly' ? rig.flySpeed : (input.run ? RUN_SPEED : WALK_SPEED)) * dt;
        const step = CameraRig.horizontal(rig.pose, mv, spd);
        rig.pose.x += step.x;
        rig.pose.z += step.z;
        if (rig.mode === 'fly') {
          // 飞行：空格 / E 上升，Ctrl / Q 下降（见 input.vertical）
          rig.pose.y = clamp(rig.pose.y + input.vertical() * rig.flySpeed * dt, 2.2, 760);
        }
      }

      // 视角：overview 用拖拽绕中轴轨道旋转；walk/fly 是自由看视角
      const look = input.consumeLook();
      if (look.dx || look.dy) {
        if (rig.mode === 'overview') {
          rig.orbit(look.dx, look.dy);
        } else {
          rig.pose.yaw -= look.dx * 0.0032;
          rig.pose.pitch = clamp(rig.pose.pitch - look.dy * 0.0028, -1.2, 0.65);
        }
      }

      // 滚轮 / 双指捏合：overview 调轨道半径（拉近拉远）；walk/fly 仍走 FOV 通道。
      // ⚠️ consumeZoom() 必须每帧都取（顺带清零），否则 overview 下会一直累积、切回 walk 时视野瞬间跳变。
      const zoom = input.consumeZoom();
      if (zoom && rig.mode === 'overview') {
        rig.zoom(zoom);
      } else if (rig.mode !== 'overview' && Math.abs(world.camera.fov - input.fovTarget) > 0.01) {
        world.camera.fov += (input.fovTarget - world.camera.fov) * Math.min(1, dt * 8);
        world.camera.updateProjectionMatrix();
      }
    }

    // 相机与地面：overview 时**不跟随视点**——ground 是宫城两倍多大平面，跟着挪等于把整座城挪走（D21）
    if (rig.mode === 'overview') {
      world.ground.mesh.position.x = 0;
      world.ground.mesh.position.z = 0;
    } else {
      // 地面跟着挪（阶段 4 换成 chunk 调度后移除）
      world.ground.mesh.position.x = Math.round(rig.pose.x / 200) * 200;
      world.ground.mesh.position.z = Math.round(rig.pose.z / 200) * 200;
    }

    // 太阳与阴影范围跟随视点；overview 时对准**取景中心**（机位上千公尺高，对着机位算等于白算）
    const sx = rig.mode === 'overview' ? rig.center().x : rig.pose.x;
    const sz = rig.mode === 'overview' ? rig.center().z : rig.pose.z;
    world.sun.position.set(sx - 180, 260, sz - 40);
    world.sun.target.position.set(sx, 0, sz);

    // 成就只认「人在地面上走过」：俯瞰时机位高度上千，不能拿它的 z 去判定到访（D21）
    const zone = rig.mode === 'overview' ? state.lastZone : zoneOfZ(rig.pose.z);
    if (zone !== state.lastZone) {
      const unlocked = recordZone(state, zone);
      for (let i = 0; i < unlocked.length; i++) ui.toast('解锁成就 ' + unlocked[i].icon + ' ' + unlocked[i].name, 3200);
    }

    if (quality.update(dt)) ui.toast('画质自动调整为「' + quality.params.name + '」', 2200);

    applyCamera();
    renderer.render(world.scene, world.camera);
    // now = rAF 时间戳，与定时器解耦（见 PROGRESS.md D15）
    ui.update(now, quality.summary(), zoneName(zone), rig.modeName());

    saveAcc += dt;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function applyCamera() { rig.apply(); }

  /** 切换视角档位（按钮与 V 键共用），并给出可操作提示。 */
  function pickMode(id) {
    const before = rig.mode;
    // 软渲染（SwiftShader）下每帧几秒，1.9 s 的缓动要几十秒才走完 → 直接落位
    const mode = rig.setMode(id, { instant: !gpuAccel });
    if (mode === 'overview') ui.toast('全局俯瞰 · 拖拽转方位、滚轮/捏合拉远近 · ←→ 沿中轴平移取景 · V 回漫步', 3600);
    else if (mode === 'fly' && before !== 'fly') ui.toast('自由飞行 · Shift 加速 · 空格上升 / Ctrl 下降', 3000);
    else if (mode === 'walk') ui.toast('人视漫步 · WASD 或左半屏摇杆', 2200);
    ui.setMode(mode);
    return mode;
  }

  /** 俯瞰取景中心沿中轴跳档（午门 ↔ 神武门），键盘与后续导览点选共用。 */
  const FOCUS_STEPS = [
    { z: AXES.wumen, cn: '午门' },
    { z: AXES.taiheGate, cn: '太和门' },
    { z: AXES.taihe, cn: '太和殿' },
    { z: AXES.zhonghe, cn: '中和殿' },
    { z: AXES.baohe, cn: '保和殿' },
    { z: AXES.qianqing, cn: '乾清宫' },
    { z: AXES.kunning, cn: '坤宁宫' },
    { z: AXES.yuhuayuan, cn: '御花园' },
    { z: AXES.shenwumen, cn: '神武门' },
  ];
  let focusIdx = 4;                              // 默认保和殿（中轴中段）
  function stepFocus(dir) {
    if (rig.mode !== 'overview') return null;
    focusIdx = Math.max(0, Math.min(FOCUS_STEPS.length - 1, focusIdx + dir));
    const f = FOCUS_STEPS[focusIdx];
    rig.focus({ x: 0, z: f.z });
    ui.toast('取景中心 ' + f.cn, 1600);
    return f;
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
    const k = String(e.key).toLowerCase();
    if (k === 'h') ui.toggleHud();
    else if (k === 'v') pickMode(rig.toggle());
    else if (k === '1') pickMode('walk');
    else if (k === '2') pickMode('fly');
    else if (k === '3') pickMode('overview');
    // 俯瞰：←→（或 [ ]）沿中轴跳档取景中心，快速检视各座建筑
    else if (rig.mode === 'overview' && (k === 'arrowright' || k === ']')) { e.preventDefault(); stepFocus(1); }
    else if (rig.mode === 'overview' && (k === 'arrowleft' || k === '[')) { e.preventDefault(); stepFocus(-1); }
  });
  ui.bindQuality(function (level) { quality.setManual(level); });
  ui.bindMode(function (id) { pickMode(id); });
  ui.setMode(rig.mode);

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
