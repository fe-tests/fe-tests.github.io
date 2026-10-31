/* 塔防要塞 · 敌人数据表（纯逻辑，无 DOM）
 * 约定：hp/speed/armor/mr/bounty 是「1 级 1 波」基准值，实际按关卡倍率与波次成长缩放（见 engine.js）。
 * 速度单位 = 瓦/秒；size = 半径（瓦）；leak = 漏怪时基地扣血。
 * mechanic 由 engine.js 实现，可组合：flying / stealth / shieldRegen / healAura / speedAura /
 * splitOnDeath / selfDestruct / immuneSlow / mech / boss。 */
/* ENGINE-START */

import { BAL } from './config.js';

export const ENEMIES = [
  {
    id: 'grunt', name: '步兵', icon: '🚶', hp: 60, speed: 1.5, armor: 0, mr: 0, bounty: 6,
    leak: 1, size: 0.30, color: '#cfd8e3', mechanic: [],
    desc: '最基础的杂兵，成群出现。单发伤害不高就会被浪费，交给速射塔补刀。',
  },
  {
    id: 'runner', name: '疾行者', icon: '🏃', hp: 48, speed: 2.9, armor: 0, mr: 0, bounty: 7,
    leak: 1, size: 0.28, color: '#8fd0a0', mechanic: [],
    desc: '跑得飞快，血薄。减速（冰塔）比堆单发伤害更关键。',
  },
  {
    id: 'shieldman', name: '盾兵', icon: '🛡️', hp: 150, speed: 1.2, armor: 6, mr: 10, bounty: 11,
    leak: 1, size: 0.34, color: '#9fb6d4', mechanic: [],
    desc: '护甲减免每次物理伤害。用魔法（奥术/雷电）或毒来破盾。',
  },
  {
    id: 'tank', name: '装甲车', icon: '🚗', hp: 320, speed: 1.35, armor: 18, mr: -25, bounty: 20,
    leak: 2, size: 0.40, color: '#c98f5a', mechanic: ['mech'],
    desc: '高护甲机械目标，魔抗为负：吃魔法伤害 +25%。炮塔对护甲目标也有加成。',
  },
  {
    id: 'bat', name: '夜蝠', icon: '🦇', hp: 70, speed: 2.4, armor: 0, mr: 25, bounty: 9,
    leak: 1, size: 0.28, color: '#a08fd0', mechanic: ['flying'],
    desc: '飞行单位走直线、不绕路。只有对空塔（标枪/溅射）能稳定命中。',
  },
  {
    id: 'swarm', name: '虫群', icon: '🐝', hp: 26, speed: 3.0, armor: 0, mr: 0, bounty: 3,
    leak: 1, size: 0.22, color: '#e0d27f', mechanic: [],
    desc: '单个极弱、一次几十只。溅射与锥形火焰的收益在虫群上最高。',
  },
  {
    id: 'boar', name: '野猪', icon: '🐗', hp: 220, speed: 2.1, armor: 4, mr: 0, bounty: 14,
    leak: 2, size: 0.36, color: '#b98a6a', mechanic: [],
    desc: '血厚且冲得快，是中期漏怪主力。减速 + 高单发组合处理。',
  },
  {
    id: 'hexer', name: '抗法兵', icon: '🧿', hp: 170, speed: 1.5, armor: 2, mr: 60, bounty: 16,
    leak: 1, size: 0.32, color: '#7f9fd4', mechanic: [],
    desc: '魔抗 60%，魔法几乎打不动。改走物理：箭塔穿透、狙击、炮溅射。',
  },
  {
    id: 'medic', name: '治疗兵', icon: '🩹', hp: 140, speed: 1.4, armor: 0, mr: 20, bounty: 18,
    leak: 1, size: 0.30, color: '#8fe3b0', mechanic: ['healAura'],
    healAura: 14, healRadius: 1.6,
    desc: '持续治疗周围同伴，放着不管整波都打不死。优先点杀（狙击「最强」索敌）。',
  },
  {
    id: 'splitter', name: '分裂怪', icon: '👁️', hp: 180, speed: 1.6, armor: 2, mr: 10, bounty: 15,
    leak: 2, size: 0.36, color: '#c07fb0', mechanic: ['splitOnDeath'],
    splitInto: 'grunt', splitCount: 2,
    desc: '死亡后裂成 2 只小兵继续前进。溅射清场才不会被铺满屏幕。',
  },
  {
    id: 'banner', name: '旗兵', icon: '🚩', hp: 200, speed: 1.7, armor: 4, mr: 10, bounty: 17,
    leak: 1, size: 0.32, color: '#e08f8f', mechanic: ['speedAura'],
    speedAura: 0.25, speedRadius: 1.8,
    desc: '为周围敌人提供 25% 移速。冰塔的减速可以压制它的增益。',
  },
  {
    id: 'bomber', name: '自爆兵', icon: '💣', hp: 120, speed: 2.2, armor: 0, mr: 0, bounty: 13,
    leak: 2, size: 0.30, color: '#ff9a6b', mechanic: ['selfDestruct'],
    selfDmg: 2,
    desc: '抵达基地时造成 2 倍漏怪伤害。血薄，优先在远端点掉。',
  },
  {
    id: 'icekin', name: '冰甲兵', icon: '🧊', hp: 260, speed: 1.25, armor: 10, mr: 0, bounty: 19,
    leak: 2, size: 0.36, color: '#a8d8e8', mechanic: ['immuneSlow'],
    desc: '完全免疫减速，冰塔对它无效。用狙击的护甲穿透或毒的无视护甲处理。',
  },
  {
    id: 'ghost', name: '幽灵', icon: '👻', hp: 150, speed: 2.0, armor: 0, mr: 40, bounty: 18,
    leak: 2, size: 0.30, color: '#d5dbe6', mechanic: ['stealth'],
    stealthCycle: 5.0, stealthDur: 1.4,
    desc: '周期性进入潜行（半透明），期间防御塔不会锁定它。带溅射/光环塔可以顺带打到。',
  },
  /* ---------------- BOSS ---------------- */
  {
    id: 'boss_ogre', name: '巨兽古尔', icon: '👹', boss: true, hp: 4200, speed: 1.0, armor: 12, mr: 10,
    bounty: 180, leak: 8, size: 0.62, color: '#e07f7f', mechanic: ['boss', 'charge', 'summon'],
    chargeEvery: 7, chargeDur: 2.0, chargeMul: 2.4, summonEvery: 6, summonId: 'grunt', summonCount: 3,
    desc: '每 7 秒冲锋一次（移速 ×2.4），并定期召唤小兵。冰塔 + 狙击是标准答案。',
  },
  {
    id: 'boss_dragon', name: '魔龙维瑟', icon: '🐉', boss: true, hp: 6800, speed: 1.6, armor: 6, mr: 35,
    bounty: 260, leak: 10, size: 0.66, color: '#b07cff', mechanic: ['boss', 'flying', 'shieldPhase'],
    shieldEvery: 8, shieldDur: 1.6,
    desc: '飞行 BOSS：走直线、魔抗 35%，每 8 秒进入 1.6 秒无敌相位。对空塔 + 物理狙击。',
  },
  {
    id: 'boss_machine', name: '战争机器', icon: '🤖', boss: true, hp: 9500, speed: 0.9, armor: 26, mr: 30,
    bounty: 320, leak: 12, size: 0.70, color: '#c0c8d4', mechanic: ['boss', 'mech', 'shieldRegen', 'immuneSlow'],
    shieldRegen: 120, shieldMax: 1400,
    desc: '终局 BOSS：免疫减速、护甲 26、自带护盾再生。毒（无视护甲）+ 狙击（护甲穿透）双点。',
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
export const BOSS_IDS = ENEMIES.filter((e) => e.boss).map((e) => e.id);

/** 关卡/波次对基准值的成长：hp 随波次线性成长，speed 有上限，护甲缓慢成长（倍率见 config.BAL） */
export function scaleEnemy(def, waveIdx, lvMul) {
  const w = waveIdx;
  const m = lvMul || {};
  const bossMul = def.boss ? BAL.bossHp : 1;
  const hpMul = (1 + BAL.hpGrowth * w) * (m.hp || 1) * BAL.enemyHp * bossMul;
  const spMul = (1 + 0.012 * w) * (m.speed || 1) * BAL.enemySpeed;
  const armorAdd = Math.round(w * BAL.armorGrowth * (m.armor || 1));
  const goldMul = (m.gold || 1) * BAL.bounty;
  return {
    hp: Math.round(def.hp * hpMul),
    hpMax: Math.round(def.hp * hpMul),
    speed: def.speed * Math.min(1.7, spMul),
    armor: def.armor + armorAdd,
    mr: def.mr,
    bounty: Math.max(1, Math.round(def.bounty * goldMul * (1 + 0.02 * w))),
  };
}

/** 精英词条：波次 elite 权重（1 = 精英，2 = 精锐） */
export const ELITE = [
  { mul: 1, name: '', color: null, hp: 1, speed: 1, bounty: 1, size: 1, armor: 0 },
  { mul: 2, name: '精英', color: '#f2c14e', hp: 2.3, speed: 1.12, bounty: 2.2, size: 1.14, armor: 6 },
  { mul: 3, name: '精锐', color: '#ff6b6b', hp: 4.6, speed: 1.2, bounty: 3.6, size: 1.26, armor: 14 },
];

/** 状态图标（HUD/渲染层用） */
export const STATUS_META = {
  slow: { icon: '❄', color: '#8fe3ff', name: '减速' },
  freeze: { icon: '❆', color: '#cfeeff', name: '冻结' },
  stun: { icon: '✳', color: '#ffe08a', name: '眩晕' },
  burn: { icon: '🔥', color: '#ff8f3c', name: '灼烧' },
  poison: { icon: '☠', color: '#7ee787', name: '中毒' },
  shield: { icon: '🛡', color: '#a8d8e8', name: '护盾' },
  heal: { icon: '✚', color: '#8fe3b0', name: '治疗' },
  haste: { icon: '➤', color: '#e08f8f', name: '加速' },
  phase: { icon: '👻', color: '#d5dbe6', name: '潜行' },
  stealth: { icon: '👻', color: '#d5dbe6', name: '潜行' },
};

/* ENGINE-END */
