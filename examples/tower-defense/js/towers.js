/* 塔防要塞 · 防御塔数据表与派生计算（纯逻辑，无 DOM）
 * 约定：cost = 建造费（Lv.1）；lv[i].up = 从 Lv.i 升到 Lv.i+1 的费用；lv[i] 为完整属性，不做合并。
 * 射程/半径单位为「瓦」，rate 为「次/秒」，bullet 为「瓦/秒」。 */
/* ENGINE-START */

import { SELL_RATE, BAL } from './config.js';

/** shot 决定弹道与命中结算方式，由 engine.js 的 SHOOTERS 表实现 */
export const TOWERS = [
  {
    id: 'arrow', name: '箭塔', icon: '🏹', color: '#7fd4ff', role: '速射单体', shot: 'arrow',
    dmgType: 'physical', cost: 40, unlockAt: 1, bullet: 14, targetDefault: 'first',
    tags: ['单体', '穿透'],
    notes: ['最低成本的主力，性价比之王', 'Lv.2 起每箭额外穿透 1 个目标', '对重甲目标乏力，交给炮塔/狙击'],
    lv: [
      { dmg: 12, rate: 1.15, range: 2.6, pen: 0 },
      { dmg: 20, rate: 1.35, range: 2.9, pen: 1, up: 55 },
      { dmg: 32, rate: 1.60, range: 3.2, pen: 2, up: 95 },
    ],
  },
  {
    id: 'arcane', name: '奥术塔', icon: '🔮', color: '#b07cff', role: '范围魔法', shot: 'orb',
    dmgType: 'magic', cost: 70, unlockAt: 1, bullet: 10, targetDefault: 'first',
    tags: ['溅射', '魔法'],
    notes: ['落点溅射，专治成群步兵', '魔法伤害看魔抗而不是护甲，克重甲', '单发伤害不高，别单独守长线'],
    lv: [
      { dmg: 18, rate: 0.80, range: 2.4, splash: 0.75 },
      { dmg: 30, rate: 0.90, range: 2.6, splash: 0.90, up: 85 },
      { dmg: 50, rate: 1.00, range: 2.8, splash: 1.05, up: 150 },
    ],
  },
  {
    id: 'frost', name: '冰塔', icon: '❄️', color: '#8fe3ff', role: '减速光环', shot: 'aura',
    dmgType: 'magic', cost: 60, unlockAt: 1, targetDefault: 'first',
    tags: ['减速', '光环'],
    notes: ['光环持续掉血 + 减速，是其它塔的乘数', 'Lv.3 有 18% 概率冻结 0.6 秒', '自身 DPS 很低，别指望它杀敌'],
    lv: [
      { dmg: 4, rate: 1.0, range: 0, aura: 1.8, slow: 0.35, slowDur: 1.2 },
      { dmg: 7, rate: 1.1, range: 0, aura: 2.1, slow: 0.45, slowDur: 1.4, up: 70 },
      { dmg: 10, rate: 1.2, range: 0, aura: 2.4, slow: 0.55, slowDur: 1.6, up: 130 },
    ],
  },
  {
    id: 'forge', name: '工坊塔', icon: '⚒️', color: '#f2c14e', role: '经济支援', shot: 'forge',
    dmgType: 'true', cost: 90, unlockAt: 2, targetDefault: 'first',
    tags: ['经济', '光环'],
    notes: ['每波结算给金，击杀额外加赏金', 'Lv.3 提升全场击杀赏金 12%', '越早越划算：一次投资吃完整局'],
    lv: [
      { dmg: 0, rate: 0, range: 0, aura: 1.6, goldWave: 12, killGold: 1 },
      { dmg: 0, rate: 0, range: 0, aura: 1.8, goldWave: 22, killGold: 2, up: 110 },
      { dmg: 0, rate: 0, range: 0, aura: 2.0, goldWave: 36, killGold: 3, killGoldPct: 0.12, up: 200 },
    ],
  },
  {
    id: 'venom', name: '毒塔', icon: '☠️', color: '#7ee787', role: '叠毒持续', shot: 'venom',
    dmgType: 'poison', cost: 85, unlockAt: 3, bullet: 11, targetDefault: 'weak',
    tags: ['持续伤害', '无视护甲'],
    notes: ['毒层可叠加，完全无视护甲，重甲亲妈', '需要时间生效：配减速塔放在长路入口', '对高速敌人收益偏低'],
    lv: [
      { dmg: 6, rate: 0.70, range: 2.5, dot: 10, dotDur: 3.0, dotStack: 3 },
      { dmg: 9, rate: 0.80, range: 2.7, dot: 18, dotDur: 3.5, dotStack: 4, up: 100 },
      { dmg: 13, rate: 0.90, range: 2.9, dot: 30, dotDur: 4.0, dotStack: 5, up: 175 },
    ],
  },
  {
    id: 'javelin', name: '标枪塔', icon: '🛡️', color: '#ffd9a0', role: '对空特化', shot: 'javelin',
    dmgType: 'physical', cost: 95, unlockAt: 3, bullet: 18, targetDefault: 'last',
    tags: ['对空', '高速'],
    notes: ['对飞行敌人 2.0~2.4 倍伤害，飞行关必备', '对地面目标有轻微惩罚，别当主力', '弹速极快，几乎无 miss'],
    lv: [
      { dmg: 24, rate: 1.40, range: 3.0, airBonus: 2.0, groundMul: 0.85 },
      { dmg: 42, rate: 1.60, range: 3.3, airBonus: 2.2, groundMul: 0.90, up: 110 },
      { dmg: 72, rate: 1.80, range: 3.6, airBonus: 2.4, groundMul: 1.00, up: 190 },
    ],
  },
  {
    id: 'tesla', name: '雷电塔', icon: '⚡', color: '#9fd0ff', role: '链式闪电', shot: 'chain',
    dmgType: 'magic', cost: 120, unlockAt: 4, targetDefault: 'first',
    tags: ['链式', '魔法'],
    notes: ['闪电链弹射 2~4 个目标，越挤越赚', '对机械敌人 1.3 倍伤害', '瞬发无弹道，适合弯道交叉口'],
    lv: [
      { dmg: 26, rate: 0.75, range: 2.3, chain: 2, chainFall: 0.62, mechBonus: 1.3 },
      { dmg: 44, rate: 0.85, range: 2.5, chain: 3, chainFall: 0.66, mechBonus: 1.3, up: 150 },
      { dmg: 72, rate: 0.95, range: 2.8, chain: 4, chainFall: 0.70, mechBonus: 1.3, up: 250 },
    ],
  },
  {
    id: 'flame', name: '喷火塔', icon: '🔥', color: '#ff8f3c', role: '近程锥形', shot: 'flame',
    dmgType: 'fire', cost: 130, unlockAt: 5, targetDefault: 'first',
    tags: ['锥形', '灼烧'],
    notes: ['扇形持续灼烧，清虫群/自爆群最快', '射程很短，必须放在弯道内侧', '灼烧是无视护甲的火焰伤害'],
    lv: [
      { dmg: 16, rate: 4, range: 1.7, cone: 55, burn: 4, burnDur: 2.0, tickDmg: true },
      { dmg: 27, rate: 4, range: 1.9, cone: 60, burn: 7, burnDur: 2.0, tickDmg: true, up: 140 },
      { dmg: 44, rate: 4, range: 2.2, cone: 66, burn: 11, burnDur: 2.5, tickDmg: true, up: 240 },
    ],
  },
  {
    id: 'cannon', name: '炮塔', icon: '💣', color: '#ffb37f', role: '重炮溅射', shot: 'cannon',
    dmgType: 'physical', cost: 110, unlockAt: 2, bullet: 8, targetDefault: 'strong',
    tags: ['溅射', '破甲'],
    notes: ['单发高伤 + 大溅射，专打扎堆的重甲', '对护甲目标有 35% 加成', '射速慢，配减速塔才吃得满'],
    lv: [
      { dmg: 60, rate: 0.45, range: 2.8, splash: 0.95, armorShred: 0.35 },
      { dmg: 110, rate: 0.50, range: 3.0, splash: 1.10, armorShred: 0.35, up: 130 },
      { dmg: 190, rate: 0.55, range: 3.3, splash: 1.25, armorShred: 0.35, up: 220 },
    ],
  },
  {
    id: 'sniper', name: '狙击塔', icon: '🎯', color: '#ffe08a', role: '超远狙击', shot: 'snipe',
    dmgType: 'physical', cost: 150, unlockAt: 5, targetDefault: 'strong',
    tags: ['远程', '单体爆发'],
    notes: ['射程 5.5~7 瓦，覆盖整条长路', '自带护甲穿透，专门点名精英与 BOSS', '默认「最强」索敌，别调成「最先」'],
    lv: [
      { dmg: 110, rate: 0.35, range: 5.5, armorPierce: 8 },
      { dmg: 200, rate: 0.40, range: 6.2, armorPierce: 16, up: 170 },
      { dmg: 360, rate: 0.45, range: 7.0, armorPierce: 26, up: 300 },
    ],
  },
];

export const TOWER_BY_ID = Object.fromEntries(TOWERS.map((t) => [t.id, t]));

/** 平衡后的实际金币价（数据表 × BAL.towerCost，取整到 5） */
const g5 = (v) => Math.max(5, Math.round((v * BAL.towerCost) / 5) * 5);
export function costOf(tower) { return g5(tower.cost); }
export function upCostOf(tower, level) { const next = tower.lv[level]; return next ? g5(next.up) : Infinity; }

/** 取某级完整属性（原始数据，未乘 BAL 倍率；引擎在 statsOf 里乘） */
export function towerLv(tower, level) {
  return tower.lv[Math.max(0, Math.min(tower.lv.length - 1, level - 1))];
}
/** 升到下一级费用；满级返回 Infinity */
export function upgradeCost(tower, level) { return upCostOf(tower, level); }
/** 已投入金币（含建造与全部升级，平衡后口径） */
export function investedGold(tower, level) {
  let g = costOf(tower);
  for (let i = 1; i < level; i++) g += g5(tower.lv[i].up || 0);
  return g;
}
export function sellValue(tower, level) {
  return Math.round(investedGold(tower, level) * SELL_RATE);
}
export const MAX_LV = 3;
export const isMaxLevel = (tower, level) => level >= tower.lv.length;

/** 纸面 DPS（图鉴/抽屉用，含溅射与链式的粗略折算） */
export function dpsOf(tower, stats) {
  const d = stats.dmg || 0, r = stats.rate || 0;
  if (!d) return 0;
  let v = d * r;
  if (stats.splash) v *= 1 + Math.min(1.4, stats.splash * 1.1);
  if (stats.chain) v *= 1 + (stats.chain - 1) * (stats.chainFall || 0.6) * 0.8;
  if (stats.dot) v += stats.dot * Math.min(2, stats.dotStack || 1) * 0.35;
  if (stats.burn) v += stats.burn * Math.min(2, stats.burnDur || 2) * 0.3;
  if (stats.pen) v *= 1 + stats.pen * 0.42;
  if (stats.airBonus) v *= 1 + (stats.airBonus - 1) * 0.35;
  return Math.round(v);
}
/** 有效射程（瓦）：光环塔用 aura */
export function rangeOf(stats) {
  return stats.range || stats.aura || 0;
}
/** 本关可用塔（按关卡进度解锁） */
export function towersUnlocked(levelId) {
  return TOWERS.filter((t) => (t.unlockAt || 1) <= levelId);
}

/* ENGINE-END */
