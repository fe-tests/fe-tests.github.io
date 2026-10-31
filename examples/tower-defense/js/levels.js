/* 塔防要塞 · 关卡内容（纯逻辑，无 DOM）
 * 坐标单位 = 瓦（16×12）。waypoint 全部轴对齐，首点在网格外(-1 或 16)表示入场口，末点 = 基地格。
 * 波次 DSL：W(清波奖励金币, ...G(敌人id, 数量, 间隔s, 延迟s, 车道, 精英档))
 * 星级门槛由波次内容自动推算（见 finalize），保证「门槛随内容自洽」，无需手调。 */
/* ENGINE-START */

import { ENEMY_BY_ID, BOSS_IDS } from './enemies.js';
import { TOWERS } from './towers.js';
import { GRID_W, GRID_H } from './config.js';

const G = (e, n, gap = 0.6, delay = 0, lane = 0, elite = 0) => ({ e, n, gap, delay, lane, elite });
const W = (reward, ...groups) => ({ reward, groups });

/** 归一化 + 星级推算（lives/gold/门槛等都由此处兜底，关卡表只写差异） */
function finalize(def) {
  const d = Object.assign(
    { lives: 20, gold: 260, build: 'free', pads: null, maxTowers: 0, env: 'clear',
      weather: 'none', mul: {}, bossWave: 0, tip: '', theme: {}, stars: null },
    def,
  );
  const hp = (d.mul && d.mul.hp) || 1;
  let expect = 0;
  for (const w of d.waves) {
    let b = 0;
    for (const g of w.groups) {
      const e = ENEMY_BY_ID[g.e];
      if (!e) throw new Error(`关卡 ${d.id} 引用了不存在的敌人 id: ${g.e}`);
      const el = 1 + (g.elite || 0) * 1.8;
      b += e.bounty * g.n * el;
      if (e.boss) d.bossWave = Math.max(d.bossWave, d.waves.indexOf(w) + 1);
    }
    expect += b * 10 + w.reward * 10 + 200;
  }
  expect += d.lives * 80;
  d.stars = d.stars || [0.55, 0.76, 0.92].map((k) => Math.round(expect * k * hp / 50) * 50);
  d.waveCount = d.waves.length;
  return d;
}

/* ============================ 12 个手工关卡 ============================ */
export const LEVELS = [
  finalize({
    id: 1, name: '初次接战', desc: '一条缓弯路，学会造塔与升级。',
    tip: '箭塔放在弯道内侧，射程能同时盖住两段直路。',
    theme: { a: '#16283c', b: '#0e1522', grass: '#1d3a2a', grass2: '#22472f', track: '#3a3730' },
    gold: 300, lives: 20,
    path: [[[-1, 6], [3, 6], [3, 3], [8, 3], [8, 9], [12, 9], [12, 6], [15, 6]]],
    base: [15, 6],
    waves: [
      W(20, G('grunt', 6, 0.75)),
      W(22, G('grunt', 8, 0.6)),
      W(24, G('grunt', 6, 0.6), G('runner', 4, 0.9, 3)),
      W(26, G('runner', 8, 0.7), G('grunt', 6, 0.6, 4)),
      W(28, G('shieldman', 5, 1.0), G('grunt', 8, 0.5, 2)),
      W(30, G('grunt', 10, 0.45), G('bat', 4, 1.0, 5)),
      W(32, G('boar', 5, 1.0), G('runner', 6, 0.6, 3)),
      W(34, G('shieldman', 8, 0.8), G('bat', 6, 0.8, 4)),
      W(36, G('grunt', 14, 0.35, 0, 0, 1), G('boar', 4, 1.0, 6)),
      W(48, G('boar', 8, 0.8), G('shieldman', 8, 0.7, 3), G('runner', 8, 0.5, 8)),
    ],
  }),
  finalize({
    id: 2, name: '双路夹击', desc: '两条来路在基地前汇合，火力必须分兵。',
    tip: '汇合点前的那格射程能同时覆盖两条路，性价比最高。',
    theme: { a: '#1a2436', b: '#101a28', grass: '#22352c', grass2: '#2a4433', track: '#42403a', accent: '#7fd4ff' },
    gold: 320, lives: 22,
    path: [
      [[-1, 2], [4, 2], [4, 6], [7, 6], [7, 10], [8, 10], [8, 11]],
      [[16, 3], [11, 3], [11, 7], [9, 7], [9, 10], [8, 10], [8, 11]],
    ],
    base: [8, 11],
    waves: [
      W(22, G('grunt', 6, 0.7, 0, 0), G('grunt', 6, 0.7, 2, 1)),
      W(24, G('runner', 6, 0.7, 0, 1), G('grunt', 8, 0.5, 3, 0)),
      W(26, G('shieldman', 5, 1.0, 0, 0), G('runner', 8, 0.6, 2, 1)),
      W(28, G('bat', 6, 0.9, 0, 0), G('grunt', 8, 0.5, 2, 1)),
      W(30, G('grunt', 10, 0.4, 0, 1, 1), G('shieldman', 6, 0.9, 4, 0)),
      W(32, G('boar', 5, 1.0, 0, 0), G('bat', 6, 0.9, 3, 1)),
      W(34, G('tank', 3, 1.4, 0, 0), G('runner', 10, 0.5, 2, 1)),
      W(36, G('shieldman', 8, 0.8, 0, 1), G('boar', 5, 1.0, 3, 0)),
      W(38, G('bat', 10, 0.6, 0, 0), G('bat', 8, 0.7, 2, 1)),
      W(40, G('splitter', 6, 1.0, 0, 0), G('grunt', 12, 0.35, 2, 1, 1)),
      W(44, G('boar', 7, 0.9, 0, 1, 1), G('shieldman', 8, 0.8, 3, 0), G('bat', 6, 0.9, 8)),
      W(54, G('tank', 5, 1.2, 0, 0), G('splitter', 6, 1.0, 3, 1), G('boar', 6, 0.9, 8, 0, 1)),
    ],
  }),
  finalize({
    id: 3, name: '螺旋回廊', desc: '道路向中心盘旋，越靠内射程越吃香。',
    tip: '中心基地周围放溅射塔，一圈敌人都会被顺路削血。',
    theme: { a: '#182234', b: '#0d1724', grass: '#25382c', grass2: '#2d4635', track: '#3d3a33', accent: '#b07cff' },
    gold: 340, lives: 20,
    path: [[[-1, 1], [13, 1], [13, 9], [3, 9], [3, 5], [10, 5], [10, 7], [6, 7], [6, 6], [8, 6]]],
    base: [8, 6],
    waves: [
      W(24, G('grunt', 8, 0.6)),
      W(26, G('runner', 10, 0.55)),
      W(28, G('shieldman', 6, 0.9), G('grunt', 8, 0.5, 3)),
      W(30, G('splitter', 4, 1.2), G('runner', 8, 0.6, 3)),
      W(32, G('bat', 8, 0.8), G('grunt', 10, 0.4, 3, 0, 1)),
      W(34, G('boar', 6, 1.0), G('shieldman', 8, 0.8, 3)),
      W(36, G('splitter', 6, 1.0), G('hexer', 4, 1.3, 3)),
      W(38, G('tank', 4, 1.3), G('runner', 12, 0.45, 2)),
      W(40, G('hexer', 6, 1.1), G('bat', 8, 0.7, 3)),
      W(42, G('splitter', 8, 0.9), G('boar', 6, 1.0, 3, 0, 1)),
      W(46, G('shieldman', 10, 0.7, 0, 0, 1), G('splitter', 6, 1.0, 4)),
      W(50, G('tank', 5, 1.2), G('hexer', 6, 1.1, 3), G('runner', 10, 0.5, 8)),
      W(62, G('boar', 10, 0.8, 0, 0, 1), G('splitter', 8, 0.9, 4), G('bat', 8, 0.8, 10)),
    ],
  }),
  finalize({
    id: 4, name: '长蛇三折', desc: '三段长直路来回折返，直路极长。',
    tip: '把减速塔放在第一段，让后面所有直路塔都在射程里输出。',
    theme: { a: '#1c2634', b: '#0f1822', grass: '#2a3f2a', grass2: '#33512f', track: '#464238' },
    gold: 340, lives: 20,
    path: [[[-1, 1], [13, 1], [13, 4], [2, 4], [2, 7], [13, 7], [13, 10], [2, 10], [2, 11]]],
    base: [2, 11],
    waves: [
      W(26, G('grunt', 10, 0.5)),
      W(28, G('runner', 12, 0.5)),
      W(30, G('shieldman', 8, 0.8), G('grunt', 8, 0.5, 4)),
      W(32, G('medic', 3, 1.5), G('grunt', 12, 0.45, 2)),
      W(34, G('banner', 3, 1.6), G('runner', 12, 0.5, 2)),
      W(36, G('boar', 8, 0.9), G('medic', 3, 1.4, 4)),
      W(38, G('hexer', 6, 1.1), G('shieldman', 8, 0.8, 3)),
      W(40, G('bat', 12, 0.6), G('banner', 4, 1.4, 4)),
      W(42, G('tank', 5, 1.2), G('medic', 4, 1.3, 4)),
      W(44, G('splitter', 8, 0.9), G('boar', 8, 0.9, 3, 0, 1)),
      W(48, G('runner', 20, 0.3, 0, 0, 1), G('hexer', 6, 1.1, 5)),
      W(50, G('tank', 6, 1.1), G('banner', 5, 1.2, 4), G('medic', 4, 1.3, 8)),
      W(54, G('shieldman', 12, 0.6, 0, 0, 1), G('splitter', 8, 0.9, 5)),
      W(68, G('boar', 12, 0.7, 0, 0, 1), G('tank', 6, 1.1, 4), G('bat', 10, 0.7, 10)),
    ],
  }),
  finalize({
    id: 5, name: '飞行走廊', desc: '只有 16 块石台可建，天上还有一波波翅膀。',
    tip: '飞行单位走直线：标枪塔沿飞行直线排开，别守着地面路发呆。',
    theme: { a: '#1a2333', b: '#0c1420', grass: '#20321f', grass2: '#284027', track: '#3b3934', rock: '#333d4e', accent: '#8fe3ff' },
    gold: 360, lives: 20, build: 'pads',
    pads: [[2, 2], [4, 2], [2, 3], [2, 5], [3, 5], [5, 5], [7, 5], [8, 5], [8, 6], [9, 5],
      [10, 6], [11, 6], [10, 9], [11, 9], [13, 9], [13, 10]],
    mul: { hp: 1.05 },
    path: [[[-1, 4], [6, 4], [6, 8], [12, 8], [12, 11]]],
    base: [12, 11],
    waves: [
      W(28, G('bat', 6, 0.9)),
      W(30, G('runner', 10, 0.5), G('bat', 4, 1.0, 4)),
      W(32, G('bat', 10, 0.7)),
      W(34, G('swarm', 24, 0.25), G('bat', 4, 1.0, 6)),
      W(36, G('bat', 8, 0.8, 0, 0, 1), G('runner', 12, 0.45, 3)),
      W(38, G('swarm', 30, 0.22), G('boar', 5, 1.0, 6)),
      W(40, G('bat', 14, 0.55), G('shieldman', 6, 0.9, 4)),
      W(42, G('hexer', 6, 1.1), G('bat', 10, 0.7, 3)),
      W(44, G('boar', 8, 0.9, 0, 0, 1), G('swarm', 30, 0.22, 4)),
      W(46, G('bat', 16, 0.5, 0, 0, 1)),
      W(48, G('tank', 5, 1.2), G('bat', 12, 0.6, 4)),
      W(52, G('splitter', 8, 0.9), G('bat', 12, 0.6, 3), G('swarm', 24, 0.25, 8)),
      W(56, G('bomber', 8, 0.9), G('bat', 14, 0.55, 3, 0, 1)),
      W(74, G('bat', 20, 0.45, 0, 0, 2), G('boar', 8, 0.9, 6), G('hexer', 6, 1.1, 10)),
    ],
  }),
  finalize({
    id: 6, name: '沼泽小径', desc: '泥沼让敌人变慢，也让全塔射速 -10%。',
    tip: '沼泽里敌人本来就慢，把射速劣势补回来靠溅射与毒的持续伤害。',
    env: 'swamp', weather: 'spore',
    theme: { a: '#16261f', b: '#0d1a15', grass: '#1e3a24', grass2: '#27502f', track: '#3a3d2e', water: '#1c3a2e', accent: '#7ee787' },
    gold: 340, lives: 20, mul: { rate: 0.9, speed: 0.93, hp: 1.06 },
    path: [[[-1, 10], [4, 10], [4, 6], [9, 6], [9, 3], [14, 3], [14, 6], [15, 6]]],
    base: [15, 6],
    waves: [
      W(28, G('grunt', 12, 0.5)),
      W(30, G('boar', 6, 1.0)),
      W(32, G('splitter', 6, 1.0), G('grunt', 10, 0.45, 3)),
      W(34, G('shieldman', 10, 0.7), G('runner', 10, 0.5, 4)),
      W(36, G('medic', 4, 1.3), G('boar', 8, 0.9, 3)),
      W(38, G('icekin', 4, 1.4), G('grunt', 14, 0.4, 3)),
      W(40, G('swarm', 34, 0.22), G('splitter', 6, 1.0, 5)),
      W(42, G('boar', 10, 0.8, 0, 0, 1), G('medic', 4, 1.3, 4)),
      W(44, G('hexer', 8, 1.0), G('bat', 10, 0.7, 4)),
      W(46, G('icekin', 6, 1.2), G('shieldman', 10, 0.7, 3, 0, 1)),
      W(50, G('tank', 6, 1.1), G('swarm', 34, 0.22, 4)),
      W(52, G('banner', 5, 1.2), G('boar', 10, 0.8, 3), G('medic', 5, 1.2, 8)),
      W(56, G('splitter', 10, 0.8, 0, 0, 1), G('icekin', 6, 1.2, 5)),
      W(60, G('tank', 7, 1.1), G('hexer', 8, 1.0, 4), G('bat', 12, 0.6, 8)),
      W(78, G('boar', 14, 0.65, 0, 0, 2), G('icekin', 8, 1.1, 5), G('medic', 6, 1.2, 10)),
    ],
  }),
  finalize({
    id: 7, name: '沙暴矿口', desc: '开局只有 240 金，沙暴会周期性削弱射程。',
    tip: '沙暴期射程 -15%：把关键输出放在路中央，别把宝压在边缘远塔上。',
    env: 'sandstorm', weather: 'sand',
    theme: { a: '#2a2418', b: '#141009', grass: '#3a3320', grass2: '#464026', track: '#4e4634', accent: '#f2c14e', rock: '#4a4230' },
    gold: 240, lives: 20, mul: { gold: 1.18 },
    path: [[[-1, 6], [5, 6], [5, 2], [10, 2], [10, 9], [14, 9], [14, 6], [15, 6]]],
    base: [15, 6],
    waves: [
      W(26, G('grunt', 10, 0.55)),
      W(28, G('runner', 12, 0.5)),
      W(30, G('shieldman', 8, 0.8), G('grunt', 8, 0.5, 3)),
      W(32, G('tank', 3, 1.4), G('runner', 10, 0.5, 3)),
      W(34, G('swarm', 30, 0.24), G('shieldman', 6, 0.9, 5)),
      W(36, G('boar', 8, 0.9)),
      W(38, G('tank', 4, 1.3), G('bat', 10, 0.7, 4)),
      W(40, G('bomber', 6, 1.1), G('shieldman', 10, 0.7, 3)),
      W(42, G('hexer', 8, 1.0), G('boar', 8, 0.9, 4, 0, 1)),
      W(46, G('tank', 6, 1.1), G('swarm', 32, 0.22, 4)),
      W(48, G('banner', 5, 1.2), G('tank', 6, 1.1, 3), G('runner', 14, 0.45, 6)),
      W(52, G('bomber', 10, 0.9, 0, 0, 1), G('hexer', 8, 1.0, 4)),
      W(56, G('boar', 12, 0.7, 0, 0, 1), G('boar', 10, 0.8, 5), G('bat', 12, 0.6, 10)),
      W(60, G('shieldman', 14, 0.6, 0, 0, 2), G('tank', 6, 1.1, 6)),
      W(86, G('tank', 8, 1.0, 0, 0, 2), G('bomber', 12, 0.8, 5), G('hexer', 8, 1.0, 10)),
    ],
  }),
  finalize({
    id: 8, name: '高台窄口', desc: '只有 10 块石台、最多 6 座塔，每一座都要精。',
    tip: '限塔关：工坊塔的经济回报最高，其次把狙击升到 3 级点名重甲。',
    theme: { a: '#1e222e', b: '#0f131c', grass: '#26332a', grass2: '#2e4232', track: '#3f3c36', rock: '#39414f', accent: '#ffe08a' },
    gold: 340, lives: 24, build: 'pads', maxTowers: 6,
    pads: [[5, 5], [7, 5], [7, 7], [5, 7], [7, 3], [10, 3], [10, 8], [12, 8], [12, 7], [14, 5]],
    mul: { hp: 1.08, gold: 1.05 },
    path: [[[-1, 6], [6, 6], [6, 2], [9, 2], [9, 9], [13, 9], [13, 6], [15, 6]]],
    base: [15, 6],
    waves: [
      W(28, G('shieldman', 8, 0.8)),
      W(30, G('tank', 3, 1.4), G('runner', 10, 0.5, 3)),
      W(32, G('icekin', 4, 1.4), G('grunt', 12, 0.45, 3)),
      W(34, G('boar', 10, 0.8, 0, 0, 1)),
      W(36, G('hexer', 8, 1.0), G('shieldman', 10, 0.7, 4)),
      W(38, G('tank', 5, 1.2), G('bat', 12, 0.6, 4)),
      W(40, G('medic', 5, 1.2), G('boar', 10, 0.8, 3, 0, 1)),
      W(42, G('icekin', 6, 1.2), G('hexer', 8, 1.0, 4)),
      W(46, G('tank', 6, 1.1, 0, 0, 1), G('runner', 12, 0.45, 4)),
      W(48, G('shieldman', 9, 0.7, 0, 0, 2), G('medic', 4, 1.2, 5)),
      W(52, G('bomber', 8, 0.9), G('tank', 5, 1.1, 4), G('icekin', 4, 1.3, 8)),
      W(56, G('boar', 8, 0.9, 0, 0, 2), G('hexer', 6, 1.0, 6)),
      W(60, G('banner', 5, 1.1), G('tank', 6, 1.0, 3, 0, 1), G('bat', 10, 0.6, 8)),
      W(64, G('icekin', 8, 1.0, 0, 0, 1), G('bomber', 8, 0.9, 5)),
      W(70, G('tank', 7, 1.1, 0, 0, 1), G('shieldman', 8, 0.8, 5, 0, 2), G('medic', 4, 1.2, 10)),
      W(94, G('boss_ogre', 1, 1), G('grunt', 12, 0.45, 3), G('shieldman', 6, 0.9, 8)),
    ],
  }),
  finalize({
    id: 9, name: '夜战幽灵', desc: '夜雨里幽灵周期性潜行，塔会短暂失去目标。',
    tip: '潜行只影响锁定：溅射/光环/锥形顺带就能打到幽灵，别只堆单体。',
    env: 'night', weather: 'rain',
    theme: { a: '#101623', b: '#070b12', grass: '#1a2a22', grass2: '#1f3628', track: '#33343a', accent: '#9fd0ff', water: '#12233a' },
    gold: 340, lives: 20, mul: { hp: 1.1 },
    path: [[[-1, 2], [4, 2], [4, 9], [9, 9], [9, 4], [13, 4], [13, 9], [15, 9]]],
    base: [15, 9],
    waves: [
      W(30, G('ghost', 4, 1.2)),
      W(32, G('grunt', 12, 0.5), G('ghost', 4, 1.2, 4)),
      W(34, G('hexer', 6, 1.1), G('ghost', 6, 1.1, 3)),
      W(36, G('runner', 14, 0.45), G('ghost', 5, 1.2, 5)),
      W(38, G('boar', 8, 0.9), G('ghost', 6, 1.1, 4, 0, 1)),
      W(40, G('medic', 4, 1.3), G('ghost', 8, 1.0, 3)),
      W(42, G('shieldman', 12, 0.65), G('bat', 12, 0.6, 5)),
      W(44, G('ghost', 12, 0.8, 0, 0, 1)),
      W(46, G('tank', 5, 1.2), G('hexer', 8, 1.0, 4)),
      W(50, G('bomber', 8, 1.0), G('ghost', 10, 0.9, 3, 0, 1)),
      W(52, G('splitter', 10, 0.85), G('boar', 10, 0.8, 4, 0, 1)),
      W(56, G('icekin', 8, 1.1), G('ghost', 10, 0.9, 4), G('medic', 5, 1.2, 8)),
      W(60, G('hexer', 10, 0.9, 0, 0, 1), G('tank', 7, 1.1, 5)),
      W(64, G('bat', 18, 0.5, 0, 0, 1), G('ghost', 12, 0.8, 5)),
      W(70, G('tank', 8, 1.0), G('bomber', 10, 0.9, 4), G('ghost', 12, 0.8, 8, 0, 2)),
      W(96, G('boss_dragon', 1, 1), G('ghost', 12, 0.9, 4), G('hexer', 8, 1.0, 8)),
    ],
  }),
  finalize({
    id: 10, name: '熔岩裂谷', desc: '裂谷每 6 秒灼烧路上的敌人（帮你打，别浪费火）。',
    tip: '环境灼烧已经给了不少伤害：把火力点在精英与 BOSS，杂兵交给减速。',
    env: 'lava', weather: 'ember',
    theme: { a: '#2a1410', b: '#150906', grass: '#33211a', grass2: '#3d281e', track: '#4a3226', accent: '#ff8f3c', rock: '#3a2018', water: '#5a2416' },
    gold: 360, lives: 22, mul: { hp: 1.12, armor: 1.2 },
    path: [[[-1, 6], [3, 6], [3, 2], [8, 2], [8, 10], [12, 10], [12, 5], [15, 5]]],
    base: [15, 5],
    waves: [
      W(32, G('grunt', 12, 0.5)),
      W(34, G('bomber', 6, 1.0), G('runner', 10, 0.5, 3)),
      W(36, G('boar', 8, 0.9), G('shieldman', 8, 0.8, 4)),
      W(38, G('shieldman', 12, 0.65, 0, 0, 1)),
      W(40, G('hexer', 8, 1.0), G('bomber', 8, 0.9, 4)),
      W(42, G('swarm', 40, 0.2), G('boar', 8, 0.9, 5)),
      W(44, G('tank', 6, 1.1), G('medic', 4, 1.3, 4)),
      W(46, G('boar', 12, 0.7, 0, 0, 1), G('bat', 12, 0.6, 5)),
      W(50, G('icekin', 8, 1.1), G('bomber', 10, 0.85, 4)),
      W(52, G('splitter', 12, 0.75, 0, 0, 1), G('hexer', 8, 1.0, 5)),
      W(56, G('tank', 8, 1.0), G('shieldman', 14, 0.6, 4, 0, 1)),
      W(58, G('bomber', 14, 0.7, 0, 0, 2), G('medic', 6, 1.2, 6)),
      W(62, G('boar', 14, 0.65, 0, 0, 2), G('bat', 14, 0.55, 6)),
      W(66, G('icekin', 10, 1.0), G('tank', 8, 1.0, 4, 0, 1)),
      W(70, G('hexer', 12, 0.85, 0, 0, 1), G('splitter', 12, 0.75, 5)),
      W(76, G('tank', 10, 0.95, 0, 0, 1), G('bomber', 14, 0.7, 5), G('bat', 14, 0.55, 10)),
      W(110, G('boss_ogre', 1, 1), G('boar', 12, 0.7, 4, 0, 1), G('bomber', 10, 0.9, 8)),
    ],
  }),
  finalize({
    id: 11, name: '冰原长路', desc: '冻土上敌人更慢更硬，冰塔效果 +15%。',
    tip: '免疫减速的冰甲兵会破坏减速链：用毒与狙击补上这段输出。',
    env: 'snow', weather: 'snow',
    theme: { a: '#1a2734', b: '#0b1118', grass: '#22323a', grass2: '#2a4048', track: '#454b50', accent: '#8fe3ff', rock: '#2c3a46', water: '#1a3040' },
    gold: 380, lives: 22, mul: { hp: 1.16, armor: 1.25, speed: 0.94 },
    path: [[[-1, 1], [14, 1], [14, 5], [2, 5], [2, 9], [14, 9], [14, 11]]],
    base: [14, 11],
    waves: [
      W(34, G('shieldman', 10, 0.7)),
      W(36, G('icekin', 5, 1.3), G('runner', 12, 0.5, 3)),
      W(38, G('boar', 10, 0.8), G('shieldman', 10, 0.7, 4)),
      W(40, G('banner', 4, 1.4), G('shieldman', 12, 0.65, 3)),
      W(42, G('tank', 6, 1.1), G('medic', 4, 1.3, 4)),
      W(44, G('icekin', 7, 1.2, 0, 0, 1), G('bat', 12, 0.6, 4)),
      W(46, G('swarm', 40, 0.2), G('shieldman', 12, 0.65, 5, 0, 1)),
      W(50, G('hexer', 10, 0.9), G('icekin', 6, 1.2, 4)),
      W(52, G('boar', 14, 0.65, 0, 0, 1), G('banner', 5, 1.2, 5)),
      W(56, G('tank', 8, 1.0), G('splitter', 10, 0.85, 4)),
      W(58, G('medic', 6, 1.2), G('icekin', 9, 1.1, 3, 0, 1), G('runner', 16, 0.45, 8)),
      W(62, G('shieldman', 16, 0.55, 0, 0, 2), G('hexer', 10, 0.9, 5)),
      W(66, G('bomber', 12, 0.8), G('tank', 8, 1.0, 4, 0, 1)),
      W(70, G('boar', 16, 0.6, 0, 0, 2), G('bat', 16, 0.5, 6)),
      W(74, G('icekin', 12, 1.0, 0, 0, 1), G('splitter', 12, 0.75, 5)),
      W(78, G('tank', 10, 0.95, 0, 0, 1), G('banner', 6, 1.1, 5), G('medic', 6, 1.2, 8)),
      W(86, G('hexer', 12, 0.85, 0, 0, 2), G('boar', 14, 0.65, 5), G('bomber', 12, 0.8, 10)),
      W(130, G('boss_machine', 1, 1), G('icekin', 10, 1.0, 4), G('shieldman', 14, 0.6, 8)),
    ],
  }),
  finalize({
    id: 12, name: '终局三线', desc: '三条来路合击，最后两波是双 BOSS。',
    tip: '三线关：汇合点前放溅射与火焰，狙击留给 BOSS，技能只在 BOSS 波交。',
    env: 'clear', weather: 'ember',
    theme: { a: '#1a1626', b: '#0a0810', grass: '#26242e', grass2: '#302e3a', track: '#4a4048', accent: '#ff6b6b', rock: '#332c3a' },
    gold: 470, lives: 30, mul: { hp: 1.18, armor: 1.3, gold: 1.1 },
    path: [
      [[-1, 1], [6, 1], [6, 5], [8, 5], [8, 8], [8, 11]],
      [[16, 2], [10, 2], [10, 5], [9, 5], [9, 8], [8, 8], [8, 11]],
      [[-1, 10], [4, 10], [4, 8], [8, 8], [8, 11]],
    ],
    base: [8, 11],
    waves: [
      W(34, G('grunt', 10, 0.5, 0, 0), G('grunt', 10, 0.5, 2, 2)),
      W(36, G('shieldman', 8, 0.8, 0, 1), G('runner', 12, 0.5, 3, 0)),
      W(38, G('bat', 10, 0.7, 0, 2), G('boar', 6, 1.0, 3, 0)),
      W(40, G('hexer', 8, 1.0, 0, 1), G('shieldman', 10, 0.7, 4, 2)),
      W(42, G('tank', 5, 1.2, 0, 0), G('bat', 12, 0.6, 3, 1)),
      W(44, G('boar', 10, 0.8, 0, 2, 1), G('medic', 4, 1.3, 4, 0)),
      W(46, G('icekin', 6, 1.2, 0, 1), G('splitter', 8, 0.9, 3, 2)),
      W(50, G('tank', 7, 1.1, 0, 0, 1), G('ghost', 10, 0.9, 4, 1)),
      W(52, G('bomber', 10, 0.9, 0, 2), G('boar', 10, 0.8, 3, 0, 1)),
      W(56, G('hexer', 10, 0.9, 0, 1, 1), G('bat', 14, 0.55, 4, 2)),
      W(58, G('tank', 8, 1.0, 0, 0), G('icekin', 8, 1.1, 4, 1), G('medic', 6, 1.2, 8, 2)),
      W(64, G('shieldman', 12, 0.6, 0, 2, 1), G('boar', 12, 0.7, 5, 0), G('banner', 5, 1.2, 8, 1)),
      W(120, G('boss_ogre', 1, 1, 0), G('boar', 12, 0.7, 4, 1), G('bomber', 12, 0.8, 6, 2)),
      W(70, G('ghost', 12, 0.85, 0, 1, 1), G('tank', 8, 1.0, 4, 0), G('splitter', 10, 0.85, 8, 2)),
      W(76, G('hexer', 10, 0.9, 0, 2, 1), G('bat', 18, 0.5, 4, 1), G('icekin', 8, 1.1, 8, 0)),
      W(140, G('boss_dragon', 1, 1, 1), G('bat', 16, 0.55, 4, 0), G('hexer', 10, 0.9, 8, 2)),
      W(84, G('tank', 8, 1.0, 0, 0, 1), G('bomber', 14, 0.7, 5, 1), G('banner', 6, 1.1, 8, 2)),
      W(90, G('boar', 12, 0.7, 0, 2, 1), G('icekin', 10, 1.0, 5, 0), G('ghost', 12, 0.8, 8, 1)),
      W(100, G('tank', 8, 1.0, 0, 1, 1), G('splitter', 14, 0.7, 5, 2), G('medic', 8, 1.1, 8, 0)),
      W(180, G('boss_machine', 1, 1, 0), G('boss_ogre', 1, 1, 2), G('icekin', 10, 1.0, 6, 1), G('bomber', 12, 0.8, 10, 2)),
    ],
  }),
];

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const LAST_LEVEL = LEVELS.length;

/* ============================ 无尽模式 ============================ */
/** 无尽用同一张环形图，波次由公式生成（每 5 波一个 BOSS，池随波次扩张） */
export const ENDLESS = finalize({
  id: 0, name: '无尽模式', desc: '同一张环形图，波次无限叠加，每 5 波一个 BOSS。',
  tip: '无尽靠经济滚雪球：前期工坊塔，中期把主力塔升满，BOSS 波只留技能。',
  env: 'clear', weather: 'rain',
  theme: { a: '#141d2a', b: '#0a0f18', grass: '#1e3427', grass2: '#25452e', track: '#413e38', accent: '#3ddc97' },
  gold: 320, lives: 20, endless: true, mul: { hp: 1, armor: 1 },
  path: [[[-1, 6], [4, 6], [4, 2], [11, 2], [11, 9], [6, 9], [6, 6], [15, 6]]],
  base: [15, 6],
  waves: [W(30, G('grunt', 10, 0.5))],
});

/** 无尽第 n 波（n 从 1 起）的波次数据 */
export function endlessWave(n) {
  const earlyPool = ['grunt', 'runner', 'shieldman', 'swarm', 'bat', 'boar', 'hexer', 'splitter', 'medic', 'banner', 'bomber'];
  const latePool = ['tank', 'icekin', 'ghost'];
  const pool = earlyPool.concat(n >= 4 ? latePool : []);
  const elite = n >= 8 ? Math.min(2, Math.floor((n - 4) / 6)) : 0;
  const groups = [];
  const boss = n % 5 === 0;
  const count = Math.min(9, 3 + Math.floor(n / 3));
  for (let i = 0; i < count; i++) {
    const e = pool[(n * 7 + i * 5) % pool.length];
    const def = ENEMY_BY_ID[e];
    const size = def.id === 'swarm' ? 14 + n : Math.max(3, Math.round(5 + n * 0.7 - i * 0.3));
    groups.push(G(e, size, def.id === 'swarm' ? 0.22 : 0.7, i * 2.6, i % 1, elite));
  }
  if (boss) {
    const b = BOSS_IDS[Math.floor((n / 5 - 1) % BOSS_IDS.length)];
    groups.unshift(G(b, 1, 1, 1, 0, n >= 20 ? 1 : 0));
  }
  return { reward: 24 + n * 3, groups };
}
/** 无尽第 n 波的整体倍率（喂给 scaleEnemy 的 mul） */
export function endlessMul(n) {
  return { hp: 1 + 0.20 * (n - 1), armor: 1 + 0.35 * (n - 1), speed: 1 + 0.008 * (n - 1), gold: 1 + 0.02 * (n - 1) };
}

/* ---------- 一致性自检（Node 冒烟与开发期控制台都可用） ---------- */
export function selfCheck() {
  const errs = [];
  for (const lv of LEVELS.concat([ENDLESS])) {
    if (!lv.path || !lv.path.length) errs.push(`L${lv.id}: 缺少 path`);
    for (const lane of lv.path) {
      for (let i = 1; i < lane.length; i++) {
        const a = lane[i - 1], b = lane[i];
        if (a[0] !== b[0] && a[1] !== b[1]) errs.push(`L${lv.id}: 第 ${i} 段 ${a}→${b} 不是轴对齐`);
      }
      for (const p of lane) {
        if (p[0] < -1 || p[0] > GRID_W || p[1] < -1 || p[1] > GRID_H) errs.push(`L${lv.id}: 航点越界 ${p}`);
      }
    }
    const [bx, by] = lv.base;
    if (bx < 0 || bx >= GRID_W || by < 0 || by >= GRID_H) errs.push(`L${lv.id}: 基地越界 ${lv.base}`);
    const last = lv.path[lv.path.length - 1];
    if (last[last.length - 1][0] !== bx || last[last.length - 1][1] !== by) {
      errs.push(`L${lv.id}: 末航点 ${last[last.length - 1]} 与基地 ${lv.base} 不一致`);
    }
    for (const w of lv.waves) for (const g of w.groups) {
      if (!ENEMY_BY_ID[g.e]) errs.push(`L${lv.id}: 未知敌人 ${g.e}`);
      if (g.lane >= lv.path.length) errs.push(`L${lv.id}: 车道越界 lane=${g.lane} / 共 ${lv.path.length} 条`);
    }
    if (lv.pads) for (const p of lv.pads) {
      if (p[0] < 0 || p[0] >= GRID_W || p[1] < 0 || p[1] >= GRID_H) errs.push(`L${lv.id}: 石台越界 ${p}`);
    }
    const s = lv.stars;
    if (!(s[0] < s[1] && s[1] < s[2])) errs.push(`L${lv.id}: 星级门槛非单调 ${s}`);
    for (const t of TOWERS) if ((t.unlockAt || 1) > LAST_LEVEL) errs.push(`塔 ${t.id} 解锁关 ${t.unlockAt} 超出关卡数`);
  }
  return errs;
}

/* ENGINE-END */
