/* 3D 故宫游览 · js/config.js —— 全局常量与画质档
 * 职责：只放「不可再推导」的常量；所有建筑尺度数据在 ./layout.js（单一数据源）。
 * 约束：本模块顶层不碰 DOM / window，可在 Node 里 import（smoke.mjs 依赖这一点）。
 * 素材台账见 ../docs/assets.md，数值出处见 ../docs/research.md。
 */
'use strict';

/* ------------------------------ 坐标系约定 ------------------------------
 * 1 unit = 1 meter（紫禁城实测尺度直接换算，不再做二次缩放）
 *   +Y 上、+Z 朝南（午门方向）、-Z 朝北（神武门方向）、+X 朝东。
 * 中轴 = x 平面上的 x=0；所有中轴建筑 cx 必须为 0（layout.js 自检断言）。
 */
export const UNIT_PER_M = 1;
export const AXIS_X = 0;

/* ------------------------------ 营造尺度 ------------------------------ */
// 「间」的通用宽度。真实开间随殿宇等级变化，重要殿宇在 layout.js 里按实测反算覆盖。
export const BAY = 3.0;
// 清《工程做法》斗口模数近似（1 斗口 ≈ 0.128 m），用于柱径、出檐、铺作高的比例推导。
export const DOUKOU = 0.128;
export const EYED_H = 1.65;        // 相机眼高（人视点，m）
export const WALK_SPEED = 4.2;     // 行走速度 m/s（约 15 km/h：游览场景里偏快，便于长距离中轴穿行）
export const RUN_SPEED = 7.0;
export const STEP_SNAP_MAX = 0.45; // 单步可吸附的台阶高度（m），超过则视为墙

/* ------------------------------ 紫禁城总平面（research.md §1）------------------------------ */
export const CITY = {
  lenN: 961,      // 南北长 m
  lenE: 753,      // 东西宽 m
  wallH: 10,      // 城墙高 m
  moatW: 59,      // 筒子河宽 m
  crenelH: 1.4,   // 女墙/垛口高（近似，非实测）
};

/* ------------------------------ 中轴 z 布局（近似值）------------------------------
 * ⚠️ 这些是「体验尺度」而非测绘坐标：真实间距按 research.md 的相对关系取整，
 *    目的是让午门→神武门在移动端也能顺畅走通。精确化时只改这里，不动其它模块。
 */
export const AXES = {
  wumen: -340,        // 午门
  innerRiver: -285,   // 内金水河中心
  taiheGate: -215,    // 太和门
  taihe: -95,         // 太和殿（三层台基上的殿身）
  zhonghe: -20,       // 中和殿
  baohe: 60,          // 保和殿
  qianqingGate: 145,  // 乾清门
  qianqing: 200,      // 乾清宫
  jiaotai: 250,       // 交泰殿
  kunning: 295,       // 坤宁宫
  yuhuayuan: 350,     // 御花园
  shenwumen: 415,     // 神武门
};

/* ------------------------------ 渲染与画质档（阶段 1）------------------------------ */
export const RENDER = {
  fovDesktop: 62,       // 桌面视场角
  fovTouchMin: 52,      // 移动端双指收拢的下限
  fovTouchMax: 82,      // 移动端双指展开的上限
  near: 0.15,
  far: 2600,            // 含景山借景 + 城墙外围
  fogNear: 120,         // 与画质档联动（quality.js 覆盖）
  fogFar: 900,
  shadowMapSize: 2048,
  maxAnisotropy: 4,
};

/* ------------------------------ 漫步首屏机位（阶段 5 截图复核口径）------------------------------
 * 中轴 cz 由南向北递增：午门 cz = −340 → 太和门 −215 → 太和殿 −95 → 神武门 +415。
 * 于是「cz 增大方向（+Z）= 朝北」，前向 = (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)：
 *   · yaw = π ⇒ 前向 z = +1 ⇒ **朝北看午门**（城台 z −347…−333、正楼通高 38.3 在镜头正前方 90 m）；
 *   · yaw = 0 ⇒ 前向 z = −1 ⇒ 朝**南**：看见的是 50 m 外的广场南城墙（10 m 红墙 + 垛口），
 *     午门在镜头背后 —— 首屏只有一条红墙带，就是之前截图复核拍到的样子；
 *   · 凹字两翼南端在 z ≈ −416。机位 z=−455 站在两翼以南 39 m、广场南缘（z ≈ −445）以北，
 *     朝北看午门：凹字两翼（10 m 红墙）在两侧框住画面，正楼（通高 38.3 m）从两翼墙顶之上
 *     露出檐 + 正脊 —— 这是午门正面经典的「凹」字构图（probe-wumen 射线复核口径）。
 *   · 凹字进深 76 m，站在院子里（z=−430）贴 10 m 两翼墙看 38.3 m 正楼，檐下仰角约 47°，
 *     62° 视野上沿只有 31°，正楼必然出框 ⇒ 首屏必须落在凹字之外，不能卡在院里。
 *   · 雾距取城台南面（z ≈ −347）算：108 m < RENDER.fogNear(120) ⇒ 正楼不蒙雾。
 *   · pitch = +0.06：正脊仰角 ≈ 17°，落在画面上三分之一。
 * 精确化只改这里，不动 main.js 的摆位逻辑。
 */
export const CAM_START = { x: 0, z: -455, yaw: Math.PI, pitch: 0.06, y: EYED_H };

// 三档画质：低 / 中 / 高。数值含义见 quality.js 的用法注释。
export const QUALITY = {
  low:    { name: '流畅', dprMax: 1.0, shadow: false, shadowSpan: 90,  dougongTier: 0, eaveCurve: true,  waterRefl: false, treeLOD: 0.5, fogFar: 620 },
  mid:    { name: '标准', dprMax: 1.5, shadow: true,  shadowSpan: 130, dougongTier: 1, eaveCurve: true,  waterRefl: false, treeLOD: 0.8, fogFar: 900 },
  high:   { name: '精细', dprMax: 2.0, shadow: true,  shadowSpan: 170, dougongTier: 2, eaveCurve: true,  waterRefl: true,  treeLOD: 1.0, fogFar: 1400 },
};
export const QUALITY_ORDER = ['low', 'mid', 'high'];

// 自适应降档阈值：连续 N 帧低于 fpsDown 就降一档；高于 fpsUp 且已到最低档要求则升档。
export const ADAPT = {
  sampleFrames: 90,
  fpsDown: 26,
  fpsUp: 52,
  maxDownSteps: 2,
};

/* ------------------------------ 性能预算（assets.md §7，smoke.mjs 断言）------------------------------ */
export const BUDGET = {
  drawCallsMid: 320,   // 阶段 7 实测 302（六宫两列 + 钦安殿殿身 + 亭群 共 +32 批次），+18 余量；420 高档不变
  drawCallsHigh: 420,
  triangles: 900000,
  textureMB: 128,
  materials: 24,
};

// 贴图工厂的预算口径（textures.js 的 TEXTURES 表按此自检）：单张最长边、总量上限
export const TEX = { maxAnisotropy: 4 };
export const TEX_BUDGET = { maxSide: 1024, totalMB: 128 };

/* ------------------------------ 玩法与持久化（阶段 10）------------------------------ */
export const SAVE_KEY = 'forbidden-city.v1';
export const SAVE_VERSION = 1;   // 存档结构版本；字段变更时递增并在 state.js migrateSave 里加迁移
export const HOTSPOT_RANGE = 26;    // 热点可交互半径 m
export const DOOR_OPEN_DIST = 9.5;  // 自动开门半径 m
