/* 塔防要塞 · 全局常量与工具（纯逻辑，无 DOM）
 * 坐标系：瓦坐标 (x,y) 整数，瓦内像素 = 瓦坐标 * TILE；逻辑分辨率 = GRID_W*TILE × GRID_H*TILE。
 * 时间：固定步长 STEP 推进（见 main.js 累加器），引擎内所有速度单位 = 瓦/秒 或 逻辑像素/秒。 */
/* ENGINE-START */

export const TAU = Math.PI * 2;
export const TILE = 64;
export const GRID_W = 16;
export const GRID_H = 12;
export const MAP_W = GRID_W * TILE;   // 1024
export const MAP_H = GRID_H * TILE;   // 768

export const STEP = 1 / 60;           // 引擎固定步长
export const MAX_STEPS_PER_FRAME = 8; // 单帧最多补几步（防切后台后雪崩）
export const DPR_MAX = 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (r, a, b) => a + r() * (b - a);
export const randInt = (r, a, b) => Math.floor(rand(r, a, b + 1));
export const pick = (r, arr) => arr[(r() * arr.length) | 0];
export const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
};
/** 可复现随机源：关卡 id + 波次下标派生种子，便于 Node 冒烟与回放一致 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedOf = (...nums) => {
  let h = 2166136261 >>> 0;
  for (const n of nums) { h ^= Math.imul(n | 0, 0x27d4eb2d); h = Math.imul(h ^ (h >>> 15), 0x9e3779b9); }
  return h >>> 0;
};

/* ---------- 瓦类型（grid Int8Array 取值） ---------- */
export const CELL = { EMPTY: 0, PATH: 1, BLOCK: 2, PAD: 3 };

/* ---------- 伤害类型 ---------- */
export const DMG = {
  physical: { name: '物理', color: '#ffd27f', icon: '🗡', text: '被护甲减免，被破甲穿透' },
  magic: { name: '魔法', color: '#b07cff', icon: '🔮', text: '被魔法抗性按百分比减免' },
  fire: { name: '火焰', color: '#ff8f3c', icon: '🔥', text: '点燃造成持续伤害，无视护甲' },
  poison: { name: '毒素', color: '#7ee787', icon: '☠️', text: '叠加毒层持续掉血，完全无视护甲' },
  true: { name: '真实', color: '#e9eef7', icon: '✨', text: '无视护甲与魔抗' },
};

/* ---------- 索敌优先级 ---------- */
export const TARGET_MODES = [
  { id: 'first', name: '最先', tip: '射程内离基地最近的敌人', icon: '➡️' },
  { id: 'last', name: '最后', tip: '射程内最靠后的敌人（拖后清杂）', icon: '⬅️' },
  { id: 'strong', name: '最强', tip: '射程内血量最高的敌人（集火精英/BOSS）', icon: '💪' },
  { id: 'weak', name: '最弱', tip: '射程内血量最低的敌人（补刀抢击杀）', icon: '🩸' },
  { id: 'near', name: '最近', tip: '离塔直线距离最近的敌人', icon: '🎯' },
];
export const targetLabel = (id) => (TARGET_MODES.find((m) => m.id === id) || TARGET_MODES[0]).name;

/* ---------- 主动技能 ----------
 * key 是给用户看的键位标签，真实绑定在 input.js（skill1/2/3）：W 已被「平移」占用，
 * 所以技能绑 J/K/L；改键位时三处要一起改（此表、input.js 的映射、#hint 与帮助页文案）。 */
export const SKILLS = [
  { id: 'meteor', name: '流星雨', icon: '☄️', key: 'J', cd: 35, needTarget: true,
    radius: 1.9, dmg: 420, dmgType: 'true', desc: '点选落点，对半径内所有敌人造成真实伤害并点燃 2 秒。救急首选。' },
  { id: 'blizzard', name: '冰封新星', icon: '🧊', key: 'K', cd: 50, needTarget: false,
    freeze: 3.5, dmg: 60, dmgType: 'magic', desc: '全场敌人冻结 3.5 秒（BOSS 减半），并结算一次魔法伤害。' },
  { id: 'greed', name: '富矿', icon: '💰', key: 'L', cd: 70, needTarget: false,
    gold: 150, buffDur: 60, buffPct: 0.25, desc: '立刻 +150 金币，并在 60 秒内击杀赏金提高 25%。' },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/* ---------- 特效档位（性能降级） ---------- */
export const FX_LEVELS = [
  { name: '流畅', parts: 120, shake: 0, ambient: 0, dmgNum: false },
  { name: '均衡', parts: 260, shake: 1, ambient: 1, dmgNum: true },
  { name: '华丽', parts: 460, shake: 1, ambient: 2, dmgNum: true },
];

/* ---------- 战斗速度 ---------- */
export const SPEEDS = [1, 2, 3];

/* ---------- 主题（关卡可覆盖） ---------- */
export const THEME_DEFAULT = {
  a: '#16283c', b: '#0e1522', grass: '#1d3a2a', grass2: '#22472f',
  track: '#3a3730', track2: '#4a463c', edge: '#22201c',
  accent: '#5aa9ff', rock: '#2b3444', water: '#1b3a55', base: '#f2c14e',
};

/* ---------- 存档 ---------- */
export const SAVE_KEY = 'tower-defense.save.v1';
export const SAVE_DEFAULT = {
  v: 1, unlocked: 1, stars: {}, best: {},
  endless: { bestWave: 0, bestScore: 0 },
  totalStars: 0,
  sound: true, grid: true, dmgNum: true, keep: true, auto: false,
  fx: 1,            // 特效档位下标：0 流畅 / 1 均衡 / 2 华丽
  speed: 0,         // 倍速下标（SPEEDS=[1,2,3] 的下标）：默认 ×1，别写成 1 否则开局就是 ×2
};

/* ---------- 其它平衡常量 ---------- */
export const SELL_RATE = 0.7;          // 卖塔返还比例
export const EARLY_BONUS_PER_SEC = 1.6; // 提前开波：每省 1 秒奖励金币
export const WAVE_GAP = 9;             // 波间准备时间（秒）
export const FIRST_WAVE_GAP = 14;      // 首波准备时间
export const FREEZE_BOSS_MUL = 0.5;    // BOSS 受冻结时长折减

/** 平衡总系数：所有倍率集中在此，调平衡只改这里，不动数据表
 *  调参依据见 tools/smoke.mjs（基线阵容通关率）与 docs/devlog.md 的平衡记录。 */
export const BAL = {
  towerCost: 1.0,     // 塔价倍率（数据表原价 × 此值，取整到 5）
  towerDmg: 1.5,      // 塔伤害倍率
  towerRate: 1.08,    // 塔射速倍率
  enemyHp: 0.78,      // 敌人血量倍率
  enemySpeed: 0.96,   // 敌人速度倍率
  hpGrowth: 0.10,     // 每波血量成长
  armorGrowth: 0.4,   // 每波护甲成长
  bounty: 1.15,       // 赏金倍率
  bossHp: 0.9,        // BOSS 血量额外倍率
  startGold: 1.15,    // 开局金币倍率
  waveReward: 1.7,    // 过波金币倍率（积分仍按原始奖励计，星级不受影响）
  aiUpgradeGold: 110, // 模拟 AI 滚动升级的金门槛
  aiExpandGold: 300,  // 模拟 AI 在塔满级前攒到多少才继续扩塔（防止无脑堆塔）
};

/* ENGINE-END */
