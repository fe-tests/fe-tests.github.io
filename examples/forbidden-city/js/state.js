/* 3D 故宫游览 · js/state.js —— 纯状态机（ENGINE-START … ENGINE-END）
 * 职责：与渲染无关的游戏状态——模式、所在分区、进度、成就、存档。
 * 约束：**顶层不碰 DOM / window / THREE**，可在 Node 里 import（smoke.mjs 直接依赖）。
 * 成就表在本文件 ACHIEVEMENTS；本模块只做「状态 + 判定」，不做 UI、不做 IO（存档 IO 在 ENGINE-END 之后）。
 */
/* ENGINE-START */
'use strict';

import { SAVE_KEY, SAVE_VERSION } from './config.js';

/** @typedef {'boot'|'menu'|'play'|'paused'|'fallback'} Mode */
export const MODES = ['boot', 'menu', 'play', 'paused', 'fallback'];

/** 成就定义（D04，assets.md §5）。id 一旦发布不要改名——它是存档里的键。 */
export const ACHIEVEMENTS = [
  { id: 'enter', name: '午门以内', desc: '进入午门以内的第一重庭院', icon: '🚪' },
  { id: 'gate', name: '承天之门', desc: '从午门走到太和门前', icon: '🏮' },
  { id: 'taihe', name: '中华第一殿', desc: '进入太和殿内部', icon: '👑' },
  { id: 'zhonghe', name: '允执厥中', desc: '进入中和殿内部', icon: '⛩️' },
  { id: 'baohe', name: '殿试之地', desc: '进入保和殿内部', icon: '📜' },
  { id: 'threeHalls', name: '三大殿入内', desc: '三大殿全部进过一次', icon: '🏛️' },
  { id: 'innerCourt', name: '内廷禁地', desc: '跨过乾清门进入内廷', icon: '🕌' },
  { id: 'garden', name: '御花园', desc: '抵达御花园', icon: '🌳' },
  { id: 'fullAxis', name: '走完中轴', desc: '从午门以南一路走到神武门以北', icon: '🧭' },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(function (a) { return a.id; });

/** 成就 id → 定义，供 UI 反查。 */
export const ACHIEVE_BY_ID = ACHIEVEMENTS.reduce(function (m, a) { m[a.id] = a; return m; }, {});

/** 分区判定：按 z 深度给出所在区域（与 config.AXES 的口径一致）。 */
export function zoneOfZ(z) {
  if (z === null || z === undefined || !isFinite(z)) return 'out';
  if (z < -340) return 'outside';      // 午门以南（含广场）
  if (z < -215) return 'wumenYuan';    // 午门—太和门 庭院（内金水河在此段）
  if (z < 100) return 'outerCourt';    // 外朝三大殿院落
  if (z < 145) return 'qianqingGate';  // 保和殿后 → 乾清门
  if (z < 320) return 'innerCourt';    // 内廷后三宫
  if (z < 415) return 'yuhuayuan';     // 御花园
  return 'northOutside';               // 神武门以北（景山方向）
}

/** 成就「走完中轴」的里程碑：按 zoneOfZ 顺序推进，不要求连续。 */
export const AXIS_MILESTONES = ['outside', 'wumenYuan', 'outerCourt', 'innerCourt', 'yuhuayuan', 'northOutside'];

function freshProgress() {
  return {
    achievements: {},        // id → true
    visitedZones: {},        // zone → true
    axisFlags: {},           // milestone → true（「走完中轴」的中间状态）
    interiors: {},           // 建筑 id → true（进入过内部）
    hotspotsSeen: {},        // 热点 id → true
    totalSteps: 0,
    playSeconds: 0,
  };
}

/** 存档结构版本化：字段变更时按 v 做迁移。真实值在 config.js 的 SAVE_VERSION（单一来源）。 */
export { SAVE_VERSION };

export function newState() {
  return {
    /** @type {Mode} */
    mode: 'boot',
    quality: { level: 'mid', manual: false },
    audioOn: true,
    hud: true,
    progress: freshProgress(),
    lastZone: 'out',
    message: null,           // { text, until } 由 ui.js 消费
  };
}

/** 纯迁移：把任意旧档补成当前版本形状。 */
export function migrateSave(raw) {
  const p = freshProgress();
  if (!raw || typeof raw !== 'object') return p;
  const src = (raw.progress && typeof raw.progress === 'object') ? raw.progress : {};
  const pick = function (k) {
    return (src[k] && typeof src[k] === 'object') ? src[k] : {};
  };
  p.achievements = Object.assign({}, pick('achievements'));
  p.visitedZones = Object.assign({}, pick('visitedZones'));
  p.axisFlags = Object.assign({}, pick('axisFlags'));
  p.interiors = Object.assign({}, pick('interiors'));
  p.hotspotsSeen = Object.assign({}, pick('hotspotsSeen'));
  p.totalSteps = Number(src.totalSteps) || 0;
  p.playSeconds = Number(src.playSeconds) || 0;
  return p;
}

/** 解锁一个成就，返回新解锁的成就定义或 null。 */
function give(p, id) {
  if (!ACHIEVE_BY_ID[id] || p.achievements[id]) return null;
  p.achievements[id] = true;
  return ACHIEVE_BY_ID[id];
}

const HALLS = ['taihe', 'zhonghe', 'baohe'];

/**
 * 记录一次分区进入，返回本次新解锁的成就列表（供 UI 弹提示）。
 * 纯函数：只改 state.progress，不做任何 IO。
 */
export function recordZone(state, zone) {
  const unlocked = [];
  const p = state.progress;
  if (!zone || zone === 'out') return unlocked;

  p.visitedZones[zone] = true;
  state.lastZone = zone;

  const push = function (a) { if (a) unlocked.push(a); };

  // 分区 → 成就（顺序推进型成就在此集中判定）
  if (zone === 'wumenYuan' || zone === 'outerCourt' || zone === 'innerCourt') push(give(p, 'enter'));
  if ((zone === 'outerCourt' || zone === 'innerCourt') && p.visitedZones.wumenYuan) push(give(p, 'gate'));
  if (zone === 'innerCourt') push(give(p, 'innerCourt'));
  if (zone === 'yuhuayuan') push(give(p, 'garden'));

  // 「走完中轴」：里程碑集合齐即解锁
  if (AXIS_MILESTONES.indexOf(zone) >= 0) p.axisFlags[zone] = true;
  if (AXIS_MILESTONES.every(function (m) { return p.axisFlags[m]; })) push(give(p, 'fullAxis'));

  // 三大殿全部入内 → 组合成就
  if (HALLS.every(function (id) { return p.interiors[id]; })) push(give(p, 'threeHalls'));

  return unlocked;
}

/** 记录进入某建筑内部（三大殿各对应一个成就）。 */
export function recordInterior(state, buildingId) {
  const unlocked = [];
  const p = state.progress;
  p.interiors[buildingId] = true;

  const push = function (a) { if (a) unlocked.push(a); };
  push(give(p, buildingId));                       // 'taihe' / 'zhonghe' / 'baohe' 与成就 id 同名
  if (HALLS.every(function (id) { return p.interiors[id]; })) push(give(p, 'threeHalls'));
  return unlocked;
}

export function achievementCount(state) {
  return ACHIEVEMENT_IDS.filter(function (id) { return !!state.progress.achievements[id]; }).length;
}

/* ENGINE-END */

/* ------------------------------ 存档 IO（本文件唯一碰 localStorage 的地方）------------------------------ */

function store(storage) {
  if (storage) return storage;
  try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
}

/** 读档。@param {Storage} [storage] 可注入以便 Node 测试。 */
export function loadProgress(storage) {
  const s = store(storage);
  if (!s) return freshProgress();
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return freshProgress();
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== SAVE_VERSION) return freshProgress();
    return migrateSave(obj);
  } catch (e) {
    return freshProgress();   // 档损坏：当作无档，不炸页面
  }
}

/** 存档（调用方节流：main.js 约每 5 秒一次）。@returns {boolean} */
export function saveProgress(state, storage) {
  const s = store(storage);
  if (!s) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, progress: state.progress }));
    return true;
  } catch (e) {
    return false;   // 隐私模式 / 配额满：静默失败，不打断游览
  }
}

/** 清档。 */
export function resetProgress(storage) {
  const s = store(storage);
  if (!s) return;
  try { s.removeItem(SAVE_KEY); } catch (e) {}
}
