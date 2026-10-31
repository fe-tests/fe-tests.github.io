/* 塔防要塞 · 引擎（纯逻辑，零 DOM：可在 Node 里直接跑关卡模拟）
 * 状态机：newState → startWave/step(固定步长) → over。渲染与输入只读 state + 消费 events。
 * 关卡倍率、环境机制、精英词条、BOSS 技能都在此处；渲染层不参与任何数值判定。 */
/* ENGINE-START */

import {
  TILE, CELL, GRID_W, GRID_H, clamp, dist2, mulberry32, seedOf,
  SELL_RATE, EARLY_BONUS_PER_SEC, WAVE_GAP, FIRST_WAVE_GAP, SKILL_BY_ID, FREEZE_BOSS_MUL, TAU, BAL,
} from './config.js';
import { TOWERS, TOWER_BY_ID, towerLv, upgradeCost, sellValue, MAX_LV, costOf, towersUnlocked } from './towers.js';
import { ENEMY_BY_ID, scaleEnemy, ELITE } from './enemies.js';
import { ENDLESS, endlessWave, endlessMul } from './levels.js';

const AIR_SHOTS = new Set(['javelin', 'orb', 'cannon', 'snipe']);   // 可打空中的射击方式
const AURA_EVERY = 0.2;      // 光环/增益重算间隔
const AURA_TICK = 0.25;      // 光环塔伤害结算间隔
const MAX_EVENTS = 420;

/* ---------------- 网格与路径 ---------------- */
export function buildGrid(level) {
  const w = GRID_W, h = GRID_H, cells = new Int8Array(w * h);
  const g = {
    w, h, cells, level,
    idx: (x, y) => y * w + x,
    at(x, y) { return (x < 0 || y < 0 || x >= w || y >= h) ? CELL.BLOCK : cells[y * w + x]; },
    base: { x: level.base[0], y: level.base[1] },
    spawn: level.path.map((l) => ({ x: l[0][0], y: l[0][1] })),
  };
  for (const lane of level.path) {
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1], b = lane[i];
      const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
      let x = a[0], y = a[1], guard = 0;
      while (guard++ < 400) {
        if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = CELL.PATH;
        if (x === b[0] && y === b[1]) break;
        x += dx; y += dy;
      }
    }
  }
  // 装饰性障碍：随机岩石/水坑，避开道路、基地、石台与道路邻格
  const r = mulberry32(seedOf(level.id * 977 + 13, 7));
  const nearPath = (x, y) => {
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      if (g.at(xx, yy) === CELL.PATH) return true;
    }
    return false;
  };
  const want = level.build === 'pads' ? 12 : 16;
  for (let tries = 0, put = 0; tries < 260 && put < want; tries++) {
    const x = (r() * w) | 0, y = (r() * h) | 0, i = y * w + x;
    if (cells[i] !== CELL.EMPTY || nearPath(x, y)) continue;
    if (Math.abs(x - g.base.x) + Math.abs(y - g.base.y) < 2) continue;
    if (level.pads && level.pads.some((p) => p[0] === x && p[1] === y)) continue;
    cells[i] = CELL.BLOCK; put++;
  }
  if (level.pads) for (const p of level.pads) {
    const i = p[1] * w + p[0];
    if (cells[i] === CELL.EMPTY) cells[i] = CELL.PAD;
  }
  return g;
}

/** 由瓦航点生成折线路径（像素坐标，含长度与前缀和） */
export function makePath(waypoints) {
  const pts = waypoints.map((p) => ({ x: (p[0] + 0.5) * TILE, y: (p[1] + 0.5) * TILE }));
  const segs = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len: l, acc: len, ang: Math.atan2(b.y - a.y, b.x - a.x) });
    len += l;
  }
  return { pts, segs, len };
}
/** 飞行直线：入口 → 基地（飞行敌人不绕路） */
export function makeFlyPath(level) {
  const s = level.path[0][0], b = level.base;
  const far = level.path[0][level.path[0].length - 2] || s;   // 取倒数第二点，让直线更贴近入场方向
  return makePath([[far[0], far[1]], [s[0], s[1]], [b[0], b[1]]]);
}
export function pathPos(path, d) {
  if (d <= 0) { const a = path.segs[0].a; return { x: a.x, y: a.y, ang: path.segs[0].ang }; }
  if (d >= path.len) { const b = path.segs[path.segs.length - 1].b; return { x: b.x, y: b.y, ang: path.segs[path.segs.length - 1].ang }; }
  for (const s of path.segs) {
    if (d <= s.acc + s.len) {
      const t = s.len ? (d - s.acc) / s.len : 0;
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, ang: s.ang };
    }
  }
  const b = path.segs[path.segs.length - 1].b;
  return { x: b.x, y: b.y, ang: 0 };
}

/** 角度插值（取最短弧） */
function lerpAng(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

/* ---------------- 状态 ---------------- */
export function newState(level, opts = {}) {
  const endless = !!level.endless;
  const st = {
    level, grid: buildGrid(level), endless,
    paths: level.path.map((l) => makePath(l)),
    fly: makeFlyPath(level),
    towers: [], enemies: [], shots: [], beams: [], floaters: [],
    events: [], uid: 1, time: 0, waveIdx: 0, wave: 0, waveActive: false,
    interT: FIRST_WAVE_GAP, queue: [], queueT: 0,
    gold: Math.round(level.gold * BAL.startGold), hp: level.lives, hpMax: level.lives,
    score: 0, kills: 0, leaks: 0, spent: 0, built: 0, goldEarned: Math.round(level.gold * BAL.startGold),
    over: null, overT: 0, reason: '',
    mul: Object.assign({ hp: 1, armor: 1, speed: 1, gold: 1, rate: 1 }, level.mul || {}),
    skills: {}, greedT: 0, envT: 0, envPhase: 0, envRangeMul: 1, envBurnT: 0,
    auraT: 0, rng: mulberry32(seedOf(level.id * 1013 + 17, (opts.seed || 0) + 5)),
    speed: 1,
  };
  for (const s of Object.values(SKILL_BY_ID)) st.skills[s.id] = 0;
  return st;
}
export const emit = (st, k, o) => {
  if (st.events.length > MAX_EVENTS) st.events.shift();
  st.events.push(Object.assign({ k, t: st.time }, o));
};
export const drainEvents = (st) => { const e = st.events; st.events = []; return e; };
export const towerAt = (st, x, y) => st.towers.find((t) => t.x === x && t.y === y);

export function canBuild(st, id, x, y) {
  const def = TOWER_BY_ID[id];
  if (!def) return { ok: false, reason: '未知的塔' };
  if ((def.unlockAt || 1) > (st.level.id || 1)) return { ok: false, reason: `第 ${def.unlockAt} 关解锁` };
  if (x < 0 || y < 0 || x >= st.grid.w || y >= st.grid.h) return { ok: false, reason: '超出地图' };
  const c = st.grid.at(x, y);
  if (c === CELL.PATH) return { ok: false, reason: '不能建在道路上' };
  if (c === CELL.BLOCK) return { ok: false, reason: '这里被障碍物占住' };
  if (st.level.build === 'pads' && c !== CELL.PAD) return { ok: false, reason: '只能建在石台上' };
  if (st.level.build !== 'pads' && c === CELL.PAD) return { ok: false, reason: '这里不能建塔' };
  if (towerAt(st, x, y)) return { ok: false, reason: '已有防御塔' };
  if (st.level.maxTowers && st.towers.length >= st.level.maxTowers) return { ok: false, reason: `最多 ${st.level.maxTowers} 座塔` };
  const cost = costOf(def);
  if (st.gold < cost) return { ok: false, reason: `金币不足（需 ${cost}）` };
  return { ok: true, cost };
}
export function placeTower(st, id, x, y) {
  const chk = canBuild(st, id, x, y);
  if (!chk.ok) return chk;
  const def = TOWER_BY_ID[id];
  st.gold -= chk.cost; st.spent += chk.cost; st.built++;
  const t = {
    uid: st.uid++, id, def, x, y, px: (x + 0.5) * TILE, py: (y + 0.5) * TILE,
    lv: 1, cd: 0, tick: 0, aim: 0, target: null, kills: 0, dmgDone: 0,
    targetMode: def.targetDefault || 'first', flash: 0,
  };
  st.towers.push(t);
  emit(st, 'build', { x: t.px, y: t.py, id, cost: chk.cost });
  return { ok: true, tower: t, cost: chk.cost };
}
export function upgradeTower(st, t) {
  const cost = upgradeCost(t.def, t.lv);
  if (t.lv >= MAX_LV) return { ok: false, reason: '已满级' };
  if (st.gold < cost) return { ok: false, reason: `金币不足（需 ${cost}）` };
  st.gold -= cost; st.spent += cost; t.lv++;
  emit(st, 'upgrade', { x: t.px, y: t.py, id: t.id, lv: t.lv, cost });
  return { ok: true };
}
export function sellTower(st, t) {
  const back = sellValue(t.def, t.lv);
  st.gold += back; st.towers = st.towers.filter((o) => o !== t);
  emit(st, 'sell', { x: t.px, y: t.py, id: t.id, gold: back });
  return { ok: true, gold: back, refund: Math.round(back / (t.def.cost * (t.def.lv.length) * SELL_RATE) * 100) };
}
export const statsOf = (st, t) => {
  const raw = towerLv(t.def, t.lv);
  const s = Object.assign({}, raw);
  s.dmg = (raw.dmg || 0) * BAL.towerDmg;
  s.rate = (raw.rate || 0) * BAL.towerRate;
  if (st.level.env === 'snow' && t.id === 'frost') { s.dmg *= 1.15; s.slow = Math.min(0.75, (raw.slow || 0) * 1.15); }
  return s;
};
export const rangePx = (st, t) => {
  const s = statsOf(st, t);
  return (s.range || s.aura || 0) * TILE * st.envRangeMul;
};

/* ---------------- 敌人生成与推进 ---------------- */
function spawnEnemy(st, id, lane, elite, dist0) {
  const def = ENEMY_BY_ID[id];
  if (!def) return null;
  const w = st.wave;
  const m = st.endless ? endlessMul(w) : st.mul;
  const sc = scaleEnemy(def, Math.max(0, w - 1), m);
  const el = ELITE[clamp(elite | 0, 0, ELITE.length - 1)];
  const fly = def.mechanic.includes('flying');
  const hp = Math.round(sc.hp * el.hp);
  const e = {
    uid: st.uid++, id, def, lane, elite: el.mul, eliteName: el.name,
    hp, hpMax: hp, armor: Math.round(sc.armor + (el.armor || 0)), mr: sc.mr,
    bounty: Math.round(sc.bounty * el.bounty), baseSpeed: sc.speed * el.speed,
    size: (def.size || 0.3) * el.size, flying: fly, boss: !!def.boss,
    path: fly ? st.fly : st.paths[Math.min(lane, st.paths.length - 1)],
    dist: dist0 || 0, x: 0, y: 0, ang: 0, t: 0, alive: true,
    slowPct: 0, slowT: 0, freezeT: 0, stunT: 0, burnDps: 0, burnT: 0,
    poisonDps: 0, poisonT: 0, poisonCap: 0, shield: 0, hidden: false,
    haste: 0, healT: 0, chargeT: 0, summonT: 0, phaseT: 0, shieldPhaseT: 0,
  };
  const p = pathPos(e.path, e.dist);
  e.x = p.x; e.y = p.y;
  if (def.mechanic.includes('shieldRegen')) e.shield = def.shieldMax || 0;
  st.enemies.push(e);
  emit(st, 'spawn', { uid: e.uid, id, x: e.x, y: e.y, boss: e.boss, elite: e.elite });
  return e;
}
export function waveAt(st, i) {
  if (!st.endless) return st.level.waves[i] || null;
  return endlessWave(i + 1);
}
export function startWave(st, manual) {
  if (st.waveActive || st.over) return { ok: false };
  const spec = waveAt(st, st.waveIdx);
  if (!spec) return { ok: false };
  let bonus = 0;
  if (manual && st.interT > 0.5) {
    bonus = Math.round(st.interT * EARLY_BONUS_PER_SEC);
    st.gold += bonus; st.goldEarned += bonus;
    emit(st, 'early', { gold: bonus });
  }
  st.interT = 0;
  st.waveActive = true;
  st.wave = st.waveIdx + 1;
  st.queue = [];
  for (const g of spec.groups) {
    for (let i = 0; i < g.n; i++) st.queue.push({ at: g.delay + i * g.gap, e: g.e, lane: g.lane || 0, elite: g.elite || 0 });
  }
  st.queue.sort((a, b) => a.at - b.at);
  st.queueT = 0;
  emit(st, 'wave', { wave: st.wave, boss: spec.groups.some((g) => (ENEMY_BY_ID[g.e] || {}).boss), elite: spec.groups.some((g) => (g.elite || 0) > 0) });
  return { ok: true, bonus };
}
/** 下一波预览（图标聚合，HUD 用） */
export function wavePreview(st) {
  const spec = waveAt(st, st.waveIdx);
  if (!spec) return [];
  const map = new Map();
  for (const g of spec.groups) {
    const d = ENEMY_BY_ID[g.e];
    if (!d) continue;
    const k = d.icon + '|' + (g.elite || 0);
    const it = map.get(k) || { icon: d.icon, name: d.name, n: 0, elite: g.elite || 0, boss: !!d.boss };
    it.n += g.n; map.set(k, it);
  }
  return [...map.values()].sort((a, b) => b.boss - a.boss || b.n - a.n);
}

function netSpeed(st, e) {
  if (e.freezeT > 0 || e.stunT > 0) return 0;
  let sp = e.baseSpeed * (1 + e.haste);
  if (e.slowT > 0) sp *= 1 - e.slowPct;
  return Math.max(0, sp) * TILE;
}
function killEnemy(st, e, byEnv) {
  if (!e.alive) return;
  e.alive = false;
  const buff = st.greedT > 0 ? (SKILL_BY_ID.greed.buffPct) : 0;
  let forgeFlat = 0, forgePct = 0;
  for (const t of st.towers) {
    if (t.id !== 'forge') continue;
    const s = statsOf(st, t);
    forgeFlat += s.killGold || 0; forgePct += s.killGoldPct || 0;
  }
  const gold = Math.max(1, Math.round(e.bounty * (1 + buff + forgePct) + forgeFlat));
  st.gold += gold; st.goldEarned += gold;
  st.kills++; st.score += e.bounty * 10;
  emit(st, 'kill', { uid: e.uid, id: e.id, x: e.x, y: e.y, gold, boss: e.boss, elite: e.elite, size: e.size, color: e.def.color });
  const m = e.def.mechanic;
  if (m.includes('splitOnDeath') && !e.splitGen) {
    for (let i = 0; i < (e.def.splitCount || 2); i++) {
      const c = spawnEnemy(st, e.def.splitInto, e.lane, 0, Math.max(0, e.dist - i * TILE * 0.35));
      if (c) { c.flying = false; c.path = st.paths[Math.min(e.lane, st.paths.length - 1)]; c.splitGen = 1; c.size = (ENEMY_BY_ID[e.def.splitInto].size || .3) * 0.9; }
    }
  }
  if (e.boss) emit(st, 'bossdie', { id: e.id, x: e.x, y: e.y, wave: st.wave });
}
function hurt(st, e, amount, type, o = {}) {
  if (!e.alive || amount <= 0) return 0;
  let a = amount;
  if (type === 'magic') a *= 1 - e.mr / 100;
  else if (type === 'physical') {
    const ar = Math.max(0, e.armor - (o.pierce || 0));
    a = a - ar;
    if (o.shred && e.armor > 0) a *= 1 + o.shred;
  }
  if (e.shield > 0) { const s = Math.min(e.shield, a); e.shield -= s; a -= s; }
  if (e.def.mechanic.includes('shieldPhase') && e.phaseActive) a = 0;
  a = Math.max(a, 1);
  e.hp -= a; e.lastDmgType = type; e.flash = 0.1;
  st.floaters.length < 90 && st.floaters.push({ x: e.x, y: e.y - e.size * TILE, v: a, type, t: 0.7, uid: e.uid });
  emit(st, 'dmg', { uid: e.uid, id: e.id, x: e.x, y: e.y, a, type });
  if (e.hp <= 0) killEnemy(st, e, !!o.env);
  return a;
}
/* 状态施加 */
export function applySlow(st, e, pct, dur) {
  if (e.def.mechanic.includes('immuneSlow')) return;
  e.slowPct = Math.max(e.slowPct, pct); e.slowT = Math.max(e.slowT, dur);
}
export function applyFreeze(st, e, dur) {
  e.freezeT = Math.max(e.freezeT, dur * (e.boss ? FREEZE_BOSS_MUL : 1));
}
function applyBurn(st, e, dps, dur) {
  e.burnDps = Math.max(e.burnDps, dps); e.burnT = Math.max(e.burnT, dur);
}
function applyPoison(st, e, dps, dur, cap) {
  e.poisonCap = Math.max(e.poisonCap, cap * dps);
  e.poisonDps = Math.min(e.poisonCap, e.poisonDps + dps);
  e.poisonT = Math.max(e.poisonT, dur);
}

/* ---------------- 塔的开火 ---------------- */
function pickTarget(st, t, stats, range) {
  const r2 = range * range;
  const airOk = AIR_SHOTS.has(t.def.shot);
  let best = null, bestK = -Infinity;
  for (const e of st.enemies) {
    if (!e.alive || e.hidden) continue;
    if (e.flying && !airOk) continue;
    const d2 = dist2(t.px, t.py, e.x, e.y);
    if (d2 > r2) continue;
    let k;
    switch (t.targetMode) {
      case 'last': k = -e.dist; break;
      case 'strong': k = e.hp + e.shield; break;
      case 'weak': k = -(e.hp + e.shield); break;
      case 'near': k = -d2; break;
      default: k = e.dist; break;      // first：离基地最远（进度最靠前）
    }
    if (e.boss) k += 1e6 * (t.targetMode === 'strong' ? 1 : 0);
    if (k > bestK) { bestK = k; best = e; }
  }
  return best;
}
const SHOOTERS = {
  arrow(st, t, s, e) {
    let tgt = e, hits = 0, from = { x: t.px, y: t.py }, used = new Set([e.uid]);
    for (let i = 0; i <= (s.pen || 0); i++) {
      if (!tgt) break;
      st.shots.push(mkShot(st, t, s, tgt, from));
      hits++;
      from = tgt;
      tgt = nearestUnhit(st, tgt, t, 1.6, used);
    }
    return hits;
  },
  orb(st, t, s, e) { st.shots.push(mkShot(st, t, s, e, { x: t.px, y: t.py })); return 1; },
  cannon(st, t, s, e) { st.shots.push(mkShot(st, t, s, e, { x: t.px, y: t.py })); return 1; },
  javelin(st, t, s, e) { st.shots.push(mkShot(st, t, s, e, { x: t.px, y: t.py })); return 1; },
  venom(st, t, s, e) { st.shots.push(mkShot(st, t, s, e, { x: t.px, y: t.py })); return 1; },
  snipe(st, t, s, e) {
    st.beams.push({ ax: t.px, ay: t.py, bx: e.x, by: e.y, color: t.def.color, w: 2.5, ttl: 0.16, kind: 'snipe' });
    e.stunT = Math.max(e.stunT, 0.12);
    hurt(st, e, s.dmg, 'physical', { pierce: s.armorPierce || 0 });
    t.aim = Math.atan2(e.y - t.py, e.x - t.px);
    return 1;
  },
  chain(st, t, s, e) {
    let cur = e, dmg = s.dmg, used = new Set();
    for (let i = 0; i <= (s.chain || 1); i++) {
      if (!cur) break;
      used.add(cur.uid);
      st.beams.push({ ax: i ? cur.px0 ?? cur.x : t.px, ay: i ? cur.py0 ?? cur.y : t.py, bx: cur.x, by: cur.y, color: '#cfe4ff', w: 2, ttl: 0.14, kind: 'zap', zig: 1 });
      if (i === 0) { st.beams[st.beams.length - 1].ax = t.px; st.beams[st.beams.length - 1].ay = t.py; }
      let d = dmg;
      if (cur.def.mechanic.includes('mech')) d *= s.mechBonus || 1;
      hurt(st, cur, d, 'magic');
      cur.px0 = cur.x; cur.py0 = cur.y;
      dmg *= (s.chainFall || 0.65);
      cur = nearestUnhit(st, cur, t, 1.9, used, true);
    }
    t.aim = Math.atan2(e.y - t.py, e.x - t.px);
    return 1;
  },
  flame(st, t, s, e) {
    const half = ((s.cone || 60) / 2) * Math.PI / 180;
    const r2 = (range2(st, s)) ** 2;
    let n = 0;
    t.aim = lerpAng(t.aim, Math.atan2(e.y - t.py, e.x - t.px), 0.35);
    for (const q of st.enemies) {
      if (!q.alive || q.flying) continue;
      const d2 = dist2(t.px, t.py, q.x, q.y);
      if (d2 > r2) continue;
      let da = Math.atan2(q.y - t.py, q.x - t.px) - t.aim;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      if (Math.abs(da) > half) continue;
      hurt(st, q, s.dmg / (s.rate || 4), 'fire');
      applyBurn(st, q, s.burn || 0, s.burnDur || 2);
      n++;
    }
    if (n) st.beams.push({ ax: t.px, ay: t.py, bx: t.px + Math.cos(t.aim) * Math.sqrt(r2), by: t.py + Math.sin(t.aim) * Math.sqrt(r2), color: '#ff8f3c', w: 10, ttl: 0.1, kind: 'cone', cone: half, x: t.px, y: t.py, len: Math.sqrt(r2) });
    return n;
  },
};
function range2(st, s) { return (s.range || 0) * TILE * st.envRangeMul; }
function mkShot(st, t, s, e, from) {
  return {
    x: from.x, y: from.y, tgt: e, sp: (t.def.bullet || 10) * TILE, dmg: s.dmg, type: t.def.dmgType,
    shot: t.def.shot, splash: (s.splash || 0) * TILE, pen: s.pen || 0, pierce: s.armorPierce || 0,
    shred: s.armorShred || 0, dot: s.dot || 0, dotDur: s.dotDur || 0, dotStack: s.dotStack || 1,
    airBonus: s.airBonus || 1, groundMul: s.groundMul || 1, color: t.def.color, alive: true, tower: t,
    ex: e.x, ey: e.y, trail: [],
  };
}
function nearestUnhit(st, from, t, rTiles, used, airOk) {
  const r2 = (rTiles * TILE) ** 2;
  let best = null, bd = Infinity;
  for (const e of st.enemies) {
    if (!e.alive || used.has(e.uid) || e.hidden) continue;
    if (e.flying && !airOk) continue;
    const d2 = dist2(from.x, from.y, e.x, e.y);
    if (d2 > r2) continue;
    if (dist2(t.px, t.py, e.x, e.y) > rangePx(st, t) ** 2) continue;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

/* ---------------- 主循环步进 ---------------- */
export function step(st, dt) {
  if (st.over) { st.overT += dt; return; }
  st.time += dt;
  st.envT += dt;
  /* 环境机制 */
  st.envRangeMul = 1;
  if (st.level.env === 'sandstorm') {
    const cyc = 16, p = st.envT % cyc;
    st.envPhase = p > cyc - 5 ? 1 : 0;
    if (st.envPhase) st.envRangeMul = 0.85;
  } else st.envPhase = 0;
  if (st.level.env === 'lava') {
    st.envBurnT -= dt;
    if (st.envBurnT <= 0) {
      st.envBurnT = 6;
      for (const e of st.enemies) if (e.alive && !e.flying) hurt(st, e, 24, 'fire', { env: 1 });
      emit(st, 'lava', {});
    }
  }
  /* 技能冷却 */
  for (const k in st.skills) if (st.skills[k] > 0) st.skills[k] = Math.max(0, st.skills[k] - dt);
  if (st.greedT > 0) st.greedT = Math.max(0, st.greedT - dt);

  /* 出怪队列 */
  if (st.waveActive) {
    st.queueT += dt;
    while (st.queue.length && st.queue[0].at <= st.queueT) {
      const q = st.queue.shift();
      spawnEnemy(st, q.e, q.lane, q.elite, 0);
    }
  } else {
    st.interT -= dt;
    if (st.interT <= 0) startWave(st, !!st.autoStart);
  }

  /* 光环/增益（每 0.2s 重算） */
  st.auraT -= dt;
  if (st.auraT <= 0) {
    st.auraT = AURA_EVERY;
    for (const e of st.enemies) { e.haste = 0; }
    for (const a of st.enemies) {
      if (!a.alive) continue;
      const m = a.def.mechanic;
      if (m.includes('speedAura')) {
        const r2 = ((a.def.speedRadius || 1.8) * TILE) ** 2;
        for (const b of st.enemies) {
          if (!b.alive || b === a) continue;
          if (dist2(a.x, a.y, b.x, b.y) <= r2) b.haste = Math.max(b.haste, a.def.speedAura || 0.25);
        }
      }
      if (m.includes('healAura')) {
        const r2 = ((a.def.healRadius || 1.6) * TILE) ** 2;
        for (const b of st.enemies) {
          if (!b.alive || b === a || b.hp >= b.hpMax) continue;
          if (dist2(a.x, a.y, b.x, b.y) <= r2) b.hp = Math.min(b.hpMax, b.hp + (a.def.healAura || 10) * AURA_EVERY);
        }
      }
    }
  }

  /* 敌人：状态计时 → 持续伤害 → 移动 → 入基地 → BOSS 技能 */
  for (const e of st.enemies) {
    if (!e.alive) continue;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowPct = 0; }
    if (e.freezeT > 0) e.freezeT -= dt;
    if (e.stunT > 0) e.stunT -= dt;
    if (e.burnT > 0) { e.burnT -= dt; hurt(st, e, e.burnDps * dt, 'fire', { quiet: 1 }); }
    if (e.poisonT > 0) { e.poisonT -= dt; hurt(st, e, e.poisonDps * dt, 'poison'); }
    if (e.def.mechanic.includes('shieldRegen') && e.shield < (e.def.shieldMax || 0)) e.shield += (e.def.shieldRegen || 0) * dt;
    const m = e.def.mechanic;
    if (m.includes('stealth')) {
      const c = e.def.stealthCycle || 5;
      e.hidden = (e.t % c) < (e.def.stealthDur || 1.4);
    }
    if (m.includes('shieldPhase')) {
      e.phaseT += dt;
      if (e.phaseT >= (e.def.shieldEvery || 8)) { e.phaseT = 0; e.phaseActive = (e.def.shieldDur || 1.6); emit(st, 'phase', { uid: e.uid, x: e.x, y: e.y }); }
      if (e.phaseActive > 0) e.phaseActive -= dt;
    }
    if (m.includes('charge')) {
      e.chargeT += dt;
      if (e.chargeT >= (e.def.chargeEvery || 7)) {
        e.chargeT = 0; e.chargeT2 = e.def.chargeDur || 2; emit(st, 'charge', { uid: e.uid, x: e.x, y: e.y });
      }
      if (e.chargeT2 > 0) { e.chargeT2 -= dt; e.haste = Math.max(e.haste, (e.def.chargeMul || 2.4) - 1); }
    }
    if (m.includes('summon')) {
      e.summonT += dt;
      if (e.summonT >= (e.def.summonEvery || 6)) {
        e.summonT = 0;
        for (let i = 0; i < (e.def.summonCount || 3); i++) {
          const c = spawnEnemy(st, e.def.summonId || 'grunt', e.lane, 0, Math.max(0, e.dist - TILE * (0.4 + i * 0.3)));
          if (c) { c.flying = false; c.path = st.paths[Math.min(e.lane, st.paths.length - 1)]; }
        }
        emit(st, 'summon', { uid: e.uid, x: e.x, y: e.y, n: e.def.summonCount || 3 });
      }
    }
    e.dist += netSpeed(st, e) * dt;
    const p = pathPos(e.path, e.dist);
    e.x = p.x; e.y = p.y; e.ang = p.ang;
    if (e.dist >= e.path.len) {
      e.alive = false;
      const raw = e.def.selfDestruct ? (e.def.selfDmg || 2) : (e.def.leak || 1);
      /* 单次漏怪最多扣 25% 生命上限：BOSS 漏过去不会一撞穿满血基地，给玩家反打的机会 */
      const dmg = Math.max(1, Math.min(raw, Math.ceil(st.hpMax * 0.25)));
      st.hp -= dmg; st.leaks++;
      emit(st, 'leak', { id: e.id, x: e.x, y: e.y, dmg, selfD: !!e.def.selfDestruct, boss: e.boss });
      if (st.hp <= 0) { st.hp = 0; st.over = 'lose'; st.overT = 0; st.reason = e.def.name + '打穿了基地'; emit(st, 'lose', {}); }
    }
  }
  /* 清理尸体 */
  if (st.enemies.length > 0) st.enemies = st.enemies.filter((e) => e.alive);

  /* 塔：光环型 / 射击型 */
  const rateMul = st.mul.rate || 1;
  for (const t of st.towers) {
    const s = statsOf(st, t);
    if (t.flash > 0) t.flash -= dt;
    if (t.def.shot === 'forge') continue;
    if (t.def.shot === 'aura') {
      t.tick -= dt;
      const r = (s.aura || 0) * TILE * st.envRangeMul;
      const r2 = r * r;
      let any = false;
      for (const e of st.enemies) {
        if (!e.alive || e.flying) continue;
        if (dist2(t.px, t.py, e.x, e.y) > r2) continue;
        any = true;
        applySlow(st, e, s.slow || 0, (s.slowDur || 1) + AURA_TICK);
        if (t.tick <= 0) {
          hurt(st, e, (s.dmg || 0) * (s.rate || 1) * AURA_TICK, t.def.dmgType);
          if (s.freezeChance && st.rng() < s.freezeChance) applyFreeze(st, e, 0.6);
        }
      }
      if (t.tick <= 0) {
        t.tick = AURA_TICK;
        if (any) emit(st, 'aura', { x: t.px, y: t.py, r, color: t.def.color });
      }
      continue;
    }
    t.cd -= dt * (rateMul || 1);
    if (t.cd > 0) continue;
    const range = t.def.shot === 'flame' ? range2(st, s) : rangePx(st, t);
    const e = pickTarget(st, t, s, range);
    if (!e) { t.cd = 0; continue; }
    const fn = SHOOTERS[t.def.shot];
    if (fn) {
      const n = fn(st, t, s, e);
      if (n > 0) { t.cd = 1 / Math.max(0.05, s.rate || 1); t.flash = 0.12; }
      else t.cd = 0.2;
    }
  }

  /* 弹丸 */
  for (const q of st.shots) {
    if (!q.alive) continue;
    const tgt = q.tgt && q.tgt.alive ? q.tgt : null;
    if (tgt) { q.ex = tgt.x; q.ey = tgt.y; }
    const dx = q.ex - q.x, dy = q.ey - q.y, d = Math.hypot(dx, dy);
    const stepLen = q.sp * dt;
    q.trail.push(q.x, q.y);
    if (q.trail.length > 10) q.trail.splice(0, 2);
    if (d <= stepLen || d < 4) {
      q.x = q.ex; q.y = q.ey;
      resolveShot(st, q, tgt);
      q.alive = false;
      continue;
    }
    q.x += dx / d * stepLen; q.y += dy / d * stepLen;
  }
  if (st.shots.length) st.shots = st.shots.filter((q) => q.alive);
  for (const b of st.beams) b.ttl -= dt;
  if (st.beams.length) st.beams = st.beams.filter((b) => b.ttl > 0);
  for (const f of st.floaters) f.t -= dt;
  if (st.floaters.length) st.floaters = st.floaters.filter((f) => f.t > 0);

  /* 波次完成判定 */
  if (st.waveActive && !st.queue.length && !st.enemies.length) {
    const spec = waveAt(st, st.waveIdx);
    const reward = (spec && spec.reward) || 0;
    let forgeWave = 0;
    for (const t of st.towers) if (t.id === 'forge') forgeWave += statsOf(st, t).goldWave || 0;
    const pay = Math.round(reward * BAL.waveReward) + forgeWave;
    st.gold += pay; st.goldEarned += pay;
    st.score += reward * 10 + 200;   // 积分按原始奖励计，星级阈值与关卡表推导口径一致
    st.waveIdx++; st.waveActive = false;
    st.interT = WAVE_GAP;
    emit(st, 'clear', { wave: st.wave, reward: pay });
    if (!st.endless && st.waveIdx >= st.level.waves.length) {
      st.over = 'win'; st.overT = 0;
      st.score += Math.round(st.hp * 80);
      emit(st, 'win', {});
    }
  }
}
function resolveShot(st, q, tgt) {
  const air = tgt && tgt.flying;
  let dmg = q.dmg;
  if (q.airBonus > 1) dmg *= air ? q.airBonus : q.groundMul;
  if (tgt) hurt(st, tgt, dmg, q.type, { pierce: q.pierce, shred: q.shred });
  if (q.dot && tgt && !q.dotApplied) {
    applyPoison(st, tgt, q.dot, q.dotDur, q.dotStack);
    q.dotApplied = 1;
  }
  if (q.splash > 0) {
    const r2 = q.splash * q.splash;
    for (const e of st.enemies) {
      if (!e.alive || e === tgt) continue;
      if (dist2(q.x, q.y, e.x, e.y) > r2) continue;
      hurt(st, e, dmg * 0.62, q.type, { pierce: q.pierce, shred: q.shred });
      if (q.dot) applyPoison(st, e, q.dot * 0.6, q.dotDur, q.dotStack);
    }
    emit(st, 'boom', { x: q.x, y: q.y, r: q.splash, color: q.color });
  } else if (q.dot && tgt) emit(st, 'hit', { x: q.x, y: q.y, color: q.color });
}

/* ---------------- 主动技能 ---------------- */
export function useSkill(st, id, x, y) {
  const def = SKILL_BY_ID[id];
  if (!def) return { ok: false, reason: '未知技能' };
  if (st.over) return { ok: false, reason: '战斗已结束' };
  if (st.skills[id] > 0) return { ok: false, reason: `冷却中 ${Math.ceil(st.skills[id])}s` };
  if (def.needTarget && (x == null)) return { ok: true, needTarget: true };
  st.skills[id] = def.cd;
  if (id === 'meteor') {
    const r2 = (def.radius * TILE) ** 2;
    let n = 0;
    for (const e of st.enemies) {
      if (!e.alive) continue;
      if (dist2(x, y, e.x, e.y) > r2) continue;
      hurt(st, e, def.dmg, def.dmgType);
      applyBurn(st, e, 40, 2);
      n++;
    }
    emit(st, 'meteor', { x, y, r: def.radius * TILE, n });
    return { ok: true, n };
  }
  if (id === 'blizzard') {
    let n = 0;
    for (const e of st.enemies) {
      if (!e.alive) continue;
      applyFreeze(st, e, def.freeze);
      hurt(st, e, def.dmg, def.dmgType);
      n++;
    }
    emit(st, 'blizzard', { n });
    return { ok: true, n };
  }
  if (id === 'greed') {
    st.gold += def.gold; st.goldEarned += def.gold; st.greedT = def.buffDur;
    emit(st, 'greed', { gold: def.gold });
    return { ok: true, gold: def.gold };
  }
  return { ok: false, reason: '未实现' };
}

/* ---------------- 结算 ---------------- */
export function starsOf(level, score) {
  let n = 0;
  for (const th of level.stars) if (score >= th) n++;
  return n;
}
export const summary = (st) => ({
  win: st.over === 'win', score: st.score, kills: st.kills, leaks: st.leaks,
  hp: Math.round(st.hp), hpMax: st.hpMax, wave: st.wave, waveCount: st.endless ? st.wave : st.level.waves.length,
  built: st.built, spent: st.spent, gold: st.goldEarned, time: st.time,
  stars: starsOf(st.level, st.score), reason: st.reason,
});

/* ---------------- 关卡模拟（Node 冒烟/平衡自测） ---------------- */
/** 沿道路取样自动布阵：给「一个够聪明的玩家」基线，用来验证关卡可通关与曲线成长 */
export function baselineBuilds(level, count = 12) {
  const g = buildGrid(level);
  const cells = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y) === CELL.PATH) cells.push({ x, y });
  const sp = level.path[0][0];
  cells.sort((a, b) => dist2(a.x, a.y, sp[0], sp[1]) - dist2(b.x, b.y, sp[0], sp[1]));
  const pool = (level.endless || level.id === 0 ? TOWERS : towersUnlocked(level.id)).map((t) => t.id);
  const out = [], used = new Set();
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [1, -1], [-1, 1], [0, -2], [0, 2], [-2, 0], [2, 0], [1, 1], [-1, -1]];
  for (let i = 0; i < count && cells.length; i++) {
    const c = cells[Math.floor(((i + 0.5) * cells.length) / count)];
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy, key = x + ',' + y;
      if (used.has(key)) continue;
      const cc = g.at(x, y);
      if (level.build === 'pads' ? cc !== CELL.PAD : (cc !== CELL.EMPTY && cc !== CELL.PAD)) continue;
      used.add(key);
      out.push({ id: pool[i % pool.length], x, y });
      break;
    }
  }
  return out;
}
/* ---------------- 自动玩家（AI）：平衡自测与关卡验证的「够聪明的玩家」基线 ---------------- */
const AI_GROUND = ['arrow', 'tesla', 'flame', 'venom', 'frost', 'cannon', 'sniper', 'arcane', 'javelin', 'forge'];
const AI_AIR = ['javelin', 'arcane', 'cannon', 'sniper', 'tesla', 'arrow', 'flame', 'frost', 'venom', 'forge'];
const NEI8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
function levelHasFly(level) {
  if (level.endless) return true;
  for (const w of level.waves) for (const g of w.groups) {
    const d = ENEMY_BY_ID[g.e];
    if (d && d.mechanic.includes('flying')) return true;
  }
  return false;
}
/** 塔位计划：贴着道路的空位，按「离基地由近到远」排序（前排优先补位） */
export function makeAi(st) {
  const g = st.grid;
  const taken = new Set(st.towers.map((t) => t.x + ',' + t.y));
  const slots = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = g.at(x, y);
    const okCell = st.level.build === 'pads' ? c === CELL.PAD : (c === CELL.EMPTY || c === CELL.PAD);
    if (!okCell || taken.has(x + ',' + y)) continue;
    if (!NEI8.some(([dx, dy]) => g.at(x + dx, y + dy) === CELL.PATH)) continue;
    slots.push({ x, y, d: dist2(x, y, g.base.x, g.base.y) });
  }
  slots.sort((a, b) => a.d - b.d);
  /* 贪心覆盖排序（等价于「玩家看哪一段路没人管就补哪」）：每轮选新覆盖道路格最多的位置，
     多线汇合点与长直路自然被优先选中；同分取离基地更近的。 */
  const pathCells = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y) === CELL.PATH) pathCells.push({ x, y });
  const R2 = 2.4 * 2.4;
  for (const s of slots) s.cover = pathCells.filter((c) => dist2(s.x, s.y, c.x, c.y) <= R2);
  const seen = new Set(), ordered = [], chosen = [], rest = slots.slice();
  const CL = 2.6 * 2.6;
  while (rest.length) {
    let bi = 0, bs = -Infinity, bd = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const s = rest[i];
      let gain = 0;
      for (const c of s.cover) if (!seen.has(c.x + ',' + c.y)) gain++;
      let near = 0;
      for (const q of chosen) if (dist2(s.x, s.y, q.x, q.y) <= CL) near++;
      /* 覆盖增益 + 抱团权重：真实玩家会把塔堆在隘口形成火力重叠，而不是摊大饼 */
      const sc = gain + 0.9 * Math.min(2, near);
      if (sc > bs || (Math.abs(sc - bs) < 1e-9 && s.d < bd)) { bs = sc; bd = s.d; bi = i; }
    }
    const s = rest.splice(bi, 1)[0];
    chosen.push(s);
    for (const c of s.cover) seen.add(c.x + ',' + c.y);
    ordered.push(s);
  }
  const ids = (st.level.endless ? TOWERS : towersUnlocked(st.level.id)).map((t) => t.id);
  const fly = levelHasFly(st.level);
  const cap = st.level.maxTowers ? Math.min(st.level.maxTowers, 20) : 20;
  return { slots: ordered, pool: (fly ? AI_AIR : AI_GROUND).filter((id) => ids.includes(id)), i: 0, fly, cap };
}
function aiPick(st, ai) {
  const n = ai.pool.length;
  for (let k = 0; k < n; k++) {
    const idx = (ai.i + k) % n;
    const id = ai.pool[idx];
    const def = TOWER_BY_ID[id];
    if (!def || costOf(def) > st.gold) continue;
    if (id === 'forge' && st.wave < 2 && st.towers.length < 3) continue;
    ai.i = (idx + 1) % n;
    return id;
  }
  return null;
}
function densestPoint(st) {
  let best = null, bestN = 0;
  for (const a of st.enemies) {
    let n = 0;
    for (const b of st.enemies) if (dist2(a.x, a.y, b.x, b.y) < (1.4 * TILE) ** 2) n++;
    if (n > bestN) { bestN = n; best = a; }
  }
  return best || { x: (st.grid.base.x + 0.5) * TILE, y: (st.grid.base.y + 0.5) * TILE };
}
export function aiThink(st, ai) {
  if (st.over) return;
  const g = st.grid;
  const bd = (t) => dist2(t.x, t.y, g.base.x, g.base.y);
  /* 1) 先升级：前排放 Lv2 顶住，再逐座补满级（真实玩家的主流打法） */
  if (st.towers.length >= 4 && st.gold > BAL.aiUpgradeGold) {
    const cands = st.towers.filter((t) => t.lv < MAX_LV && upgradeCost(t.def, t.lv) <= st.gold)
      .sort((a, b) => (a.lv - b.lv) || (bd(a) - bd(b)));
    for (const t of cands.slice(0, 2)) upgradeTower(st, t);
  }
  /* 2) 再扩塔：开局铺 4 座建立火力网，之后只有在「全员 ≥Lv2 且金币充裕」时才继续铺，且不超过 ai.cap（真实玩家不会堆 60 座塔） */
  const needExpand = st.towers.length < Math.min(4, ai.cap) ||
    (st.towers.length < ai.cap && st.gold > BAL.aiExpandGold && !st.towers.some((t) => t.lv < 2));
  let guard = 0;
  if (needExpand) {
    while (ai.slots.length && guard++ < 3) {
      const s = ai.slots[0];
      const id = aiPick(st, ai);
      if (!id) break;
      const r = placeTower(st, id, s.x, s.y);
      if (r.ok) { ai.slots.shift(); continue; }
      if (r.reason && (r.reason.startsWith('最多') || r.reason.startsWith('只能建') || r.reason.startsWith('已有'))) { ai.slots.shift(); continue; }
      break;
    }
  }
  /* 3) BOSS 在场时全体切「集火最强」（狙击保持自身默认） */
  const boss = st.enemies.some((e) => e.boss);
  for (const t of st.towers) {
    const want = boss ? 'strong' : 'first';
    if (t.def.targetDefault === 'strong') continue;
    if (t.targetMode !== want) t.targetMode = want;
  }
  /* 4) 技能：怪多砸流星，快顶不住用冰封，第 3 波后点富矿 */
  if (st.enemies.length >= 5 && st.skills.meteor <= 0) { const c = densestPoint(st); useSkill(st, 'meteor', c.x, c.y); }
  if (st.enemies.length >= 9 && st.skills.blizzard <= 0) useSkill(st, 'blizzard');
  if (st.wave >= 3 && st.skills.greed <= 0) useSkill(st, 'greed');
  if (!st.waveActive && !st.enemies.length && st.interT <= 3) startWave(st, true);
}
/** 无头跑一关：ai=true 用自动玩家；builds = [{id,x,y,lv}] 用于固定阵容测试 */
export function simulateLevel(level, opts = {}) {
  const st = newState(level, { seed: opts.seed || 1 });
  st.autoStart = true;
  for (const b of (opts.builds || [])) {
    const r = placeTower(st, b.id, b.x, b.y);
    if (r.ok && b.lv) for (let i = 1; i < b.lv; i++) upgradeTower(st, r.tower);
  }
  const ai = opts.ai ? makeAi(st) : null;
  const maxSteps = opts.maxSteps || 60 * 60 * 90;   // 默认 90 游戏分钟内收敛
  let steps = 0;
  while (!st.over && steps++ < maxSteps) {
    step(st, 1 / 60);
    if (ai && steps % 30 === 0) aiThink(st, ai);
    for (const e of st.events) {
      if (e.k === 'dmg' && Number.isNaN(e.a)) throw new Error('伤害出现 NaN');
    }
    if (Number.isNaN(st.gold) || Number.isNaN(st.hp)) throw new Error('状态出现 NaN');
  }
  return Object.assign(summary(st), { steps, converged: !!st.over, waveIdx: st.waveIdx, towers: st.towers.length });
}

/* ENGINE-END */
