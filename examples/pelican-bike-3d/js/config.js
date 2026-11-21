/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/config.js —— 全局常量与道路函数（单一来源）
 * 约束：本模块**只放纯数据与纯函数**（不 import three、不碰 DOM），保证 tools/smoke.mjs 能在 Node 里 import 并断言。
 * 坐标系：1 unit = 1 m。骑行者沿 +Z 前进；路面横向位置 x = roadCenterX(z)；海在 −X 侧、悬崖在 +X 侧；海平面 y = SEA_LEVEL = 0。
 * 单位约定：所有距离 m、角度弧度、时间秒；时刻 timeOfDay ∈ [0,1)，0 = 午夜、0.25 = 06:00、0.5 = 正午、0.75 = 18:00。
 */
'use strict';

export const UNIT_PER_M = 1;
export const SEA_LEVEL = 0;

/* ============================ 道路（海岸公路） ============================ */
/** 路面宽（双向两车道）与路肩、可雕刻平段半宽（此范围内地形被压平到路面高程）。 */
export const ROAD = {
  width: 6.5,
  laneW: 3.25,
  shoulder: 1.2,
  carHalf: 3.25,        // 路面半宽
  carveFull: 4.8,       // |d| ≤ 此值：地形 = roadElev(z)（路面与路肩全平）
  carveBlend: 26,       // 4.8 → 26 m 平滑过渡到自然地形
  seaSlope: 0.118,      // 海侧每退 1 m 横向降低的高程（决定海岸线位置）
  shoreOffset: 40,      // 海岸线相对路面中心的标称横向距离（含 wiggle）
  shoreWiggleAmp: 6,
  shoreWiggleLen: 120,
  cliffStart: 55,       // 内侧 |d| 超过此值开始抬升成悬崖
  cliffRise: 0.92,      // 悬崖平均爬升（m/m）
  cliffMax: 68,
  lampSpacing: 42,
  guardSpacing: 4,      // 护栏桩间距
  guardLateral: -4.5,   // 护栏在路肩靠海一侧
  wallLateral: 4.9,     // 内侧低石墙
  dashSpacing: 7,
  dashLen: 3.0,
  postSpacing: 24,      // 里程碑桩
};

/** 道路中心线横向位置 x = f(z)：S 形缓弯（一阶导上限 0.221 → 弧长系数 ≤ 1.024）。 */
export function roadCenterX(z) {
  return 26 * Math.sin(z / 300) + 13 * Math.sin(z / 97);
}
/** 中心线一阶导（用于弧长系数与曲率近似）。 */
export function roadCenterDeriv(z) {
  return (26 / 300) * Math.cos(z / 300) + (13 / 97) * Math.cos(z / 97);
}
/** 路面高程：在 1.6–5.8 m 之间起伏（恒高于海平面 ≥ 1.6 m，路面永不被淹）。 */
export function roadElev(z) {
  return 4.2 + 1.9 * Math.sin(z / 240) + 0.7 * Math.sin(z / 61);
}
/** 路面纵向一阶导（坡度，上限 ≈ 0.0194 → 平均 1% 缓坡）。 */
export function roadElevDeriv(z) {
  return (1.9 / 240) * Math.cos(z / 240) + (0.7 / 61) * Math.cos(z / 61);
}
/** 海岸线摆动项（让岸线不是直线）。 */
export function shoreWiggle(z) {
  return ROAD.shoreWiggleAmp * Math.sin(z / ROAD.shoreWiggleLen);
}
/** 里程 ds → 纵向位移 dz 的系数（曲线弧长 / 纵向投影，∈ [1, 1.024]）。 */
export function arcFactor(z) {
  const d = roadCenterDeriv(z);
  const e = roadElevDeriv(z);
  return Math.sqrt(1 + d * d + e * e);
}
/** 骑行方向（沿 +Z 前进）相对世界 +Z 的偏航：atan(中心线导数)。 */
export function roadHeading(z) {
  return Math.atan(roadCenterDeriv(z));
}

/* ============================ 骑行者 ============================ */
export const RIDE = {
  baseSpeed: 5.6,       // m/s ≈ 20 km/h
  minSpeed: 4.2,
  maxSpeed: 7.4,
  slopeGain: 16,        // 坡度速度增益：下坡快、上坡慢
  wheelR: 0.34,
  crankLen: 0.17,
  crankRatio: 0.72,     // 曲柄相位 / 轮相位（踏频 ≈ 0.72 × 轮频）
  bobAmp: 0.014,
  leanMax: 0.16,        // 弯道侧倾上限（rad）
  flapCooldown: 6.5,    // 展翅（阵风/爬坡）间隔下限 s
  // 传动符号：前进 = 局部 +X，绕 Z 的负向旋转才让轮顶朝前进方向走 = 向前滚。
  // 链条把后轮与牙盘串成同一转向，所以轮、曲柄必须用同一个符号，写一处即可。
  CRANK_SIGN: -1,
  pedalZ: 0.115,        // 脚踏中臂横向偏移（曲柄臂在 ±pedalZ；鹈鹕的脚要落到这两个平面上）
};

/**
 * 曲柄相位 → 该侧脚踏相对中轴的偏移（组件局部平面，前进 = +X，上 = +Y）。
 * 这是**曲柄 ↔ 脚踏 ↔ 鹈鹕腿**唯一的相位解算：bike.js 画曲柄、rider.js 转曲柄、
 * pelican.js 的腿 IK 全部走这里，三方共用一条数学，腿才不会与脚踏脱开（脱开 = 缺链接）。
 * 与 bike.js 的画法严格一致：曲柄臂静止指向 +Y，曲柄组绕 Z 转 CRANK_SIGN × 相位，
 * 另一侧曲柄臂相位差 π。
 * @param {number} side  +1 = 局部 +Z 那侧的曲柄臂（bike.js 的 crankL 在 +pedalZ），-1 = 另一侧
 * @param {number} crankPhase  曲柄相位（rider 的 state.crankPhase）
 * @param {number} len  曲柄长（RIDE.crankLen）
 * @returns {{x:number, y:number, a:number}} 偏移 + 该臂在局部平面的方位角（atan2）
 */
export function pedalOffset(side, crankPhase, len) {
  const L = Number.isFinite(len) ? len : RIDE.crankLen;
  const arm = RIDE.CRANK_SIGN * crankPhase + (side > 0 ? 0 : Math.PI);   // 臂的转角（静止朝 +Y）
  const x = -Math.sin(arm) * L;
  const y = Math.cos(arm) * L;
  return { x: x, y: y, a: Math.atan2(y, x) };
}

/* ============================ 世界分块 ============================ */
export const WORLD = {
  tileLen: 128,
  tilesX: 5,
  tilesZ: 5,
  roadTileLen: 64,
  roadTiles: 16,        // 前后各 8 块 64 m（合计 ≈ 1024 m 可见路面）
  seaPlaneSize: 2600,
  seaPlaneSnap: 80,
  shoreSpan: 2600,      // 海岸线 LUT 覆盖的 z 跨度
  shoreLutSize: 1024,
  headlandSpacing: 760,
  propTileLen: 32,
  propTiles: 22,        // 前后各 11 块 32 m
  gullRadius: 46,
  cloudSpan: 1400,
};

/* ============================ 渲染器 ============================ */
export const RENDER = {
  fovDefault: 42,
  near: 0.12,
  far: 4200,
  fogDensity: 0.0022,
  maxAnisotropy: 8,
  shadowSpan: 92,       // 阴影相机正交盒边长（跟随骑行者）
  shadowBias: -0.00062,
  maxAnisotropyCap: 8,
};

/* ============================ 画质三档 ============================ */
export const QUALITY_ORDER = ['low', 'mid', 'high'];
export const QUALITY = {
  low: {
    name: '流畅', dprMax: 1.0, shadow: false, shadowMapSize: 512, anisotropy: 1,
    tileSeg: 16, seaSeg: 24, waveAmp: 0.55, props: 0.45, grass: 0.35,
    gulls: 4, clouds: 8, particles: 140, foamSprites: 26, stars: 260, lampGlow: true, headlight: false,
  },
  mid: {
    name: '标准', dprMax: 1.5, shadow: true, shadowMapSize: 1024, anisotropy: 4,
    tileSeg: 24, seaSeg: 48, waveAmp: 0.82, props: 0.78, grass: 0.7,
    gulls: 8, clouds: 14, particles: 420, foamSprites: 60, stars: 520, lampGlow: true, headlight: false,
  },
  high: {
    name: '精细', dprMax: 2.0, shadow: true, shadowMapSize: 2048, anisotropy: 8,
    tileSeg: 32, seaSeg: 80, waveAmp: 1.0, props: 1.0, grass: 1.0,
    gulls: 12, clouds: 22, particles: 800, foamSprites: 96, stars: 900, lampGlow: true, headlight: true,
  },
};
export const ADAPT = { fpsDown: 28, fpsUp: 56, sampleFrames: 54, maxDownSteps: 2 };

/* ============================ 机位（7 档） ============================
 * 每个机位由「骑行者坐标架」解算，骑行者永远在画面内：
 *   az    方位角（0 = 正后方，+π/2 = 骑行者右侧＝内崖侧，−π/2 = 靠海侧）
 *   el    俯仰（正值 = 机位高于取景中心）
 *   r     镜头到取景中心的距离 m
 *   tY    取景中心相对骑行者原点的高度
 *   tLat  取景中心横向偏移（+ = 右）
 *   fov   竖直视野
 *   orbit 仅环绕档：az 随时间转完 360° 的周期（s）
 */
export const RIGS = [
  { id: 'follow',   cn: '跟拍', az: 0.00, el: 0.17, r: 3.6,  tY: 1.25, tLat: 0.0, fov: 42, dwell: 8.0 },
  { id: 'side',     cn: '侧拍', az: 1.62, el: 0.08, r: 6.8,  tY: 1.10, tLat: 0.0, fov: 34, dwell: 7.5 },
  { id: 'lowwheel', cn: '特写', az: 0.72, el: 0.02, r: 2.5,  tY: 0.45, tLat: 0.3, fov: 56, dwell: 6.5 },
  { id: 'crane',    cn: '高吊', az: 0.22, el: 0.52, r: 19.0, tY: 0.60, tLat: 0.0, fov: 30, dwell: 8.5 },
  { id: 'orbit',    cn: '环绕', az: 0.00, el: 0.15, r: 11.0, tY: 1.20, tLat: 0.0, fov: 40, dwell: 30.0, orbit: 26.0 },
  { id: 'seaside',  cn: '海边', az: -1.42, el: 0.03, r: 15.0, tY: 1.45, tLat: -1.0, fov: 26, dwell: 9.0 },
  { id: 'cliff',    cn: '崖顶', az: 1.96, el: 0.55, r: 58.0, tY: 1.60, tLat: 0.0, fov: 50, dwell: 9.5 },
];
export const RIG_IDS = RIGS.map(function (r) { return r.id; });
export function rigById(id) {
  for (let i = 0; i < RIGS.length; i++) if (RIGS[i].id === id) return RIGS[i];
  return RIGS[0];
}

/* ============================ 镜头巡游与鼠标接管 ============================ */
export const TOUR = {
  dwellScale: 1.0,
  dwellJitter: 0.16,    // 停留时长抖动 ±16%，避免节奏机械
  blend: 2.4,           // 切机位缓动时长
  idleResume: 3.5,      // 无输入多久后自动巡游接管
  easeBack: 0.9,        // 视角偏移归零的缓动时长
  yawMax: Math.PI, pitchMax: 1.05,
  rMin: 2.2, rMax: 38,
  panMax: 6.0,
  yawDamp: 9.0, pitchDamp: 9.0, rDamp: 7.0, panDamp: 8.0,
  sens: { yaw: 0.0052, pitch: 0.0042, zoom: 0.13, pan: 0.012 },
};

/* ============================ 昼夜 ============================ */
export const TIME = {
  start: 0.445,         // 首屏时刻（≈10:40）
  daySpeed: 0.012,      // 每日推进速度（圈/秒 → 全程约 83 s）
  stepKey: 0.012,       // [ ] 键步进
  presets: [
    { id: 'dawn', t: 0.235, cn: '黎明' },
    { id: 'noon', t: 0.500, cn: '正午' },
    { id: 'dusk', t: 0.790, cn: '黄昏' },
    { id: 'night', t: 0.960, cn: '夜' },
  ],
};

/* ============================ 预算与偏好 ============================ */
export const BUDGET = {
  drawCalls: 120,
  triangles: 450000,
  texMaxSide: 1024,
  texTotalMB: 96,
};
export const PREF_KEY = 'pelican-bike-3d.prefs.v1';
export const PREF_VERSION = 1;
