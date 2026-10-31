/* 存档：只存「关卡进度 + 设置 + 无尽最佳」（localStorage）。
 * 解析自愈：任何字段缺失/类型错乱都回落到默认值，损坏 JSON 直接重建，绝不抛错给上层。
 * localStorage 被禁用（隐私模式 / file://）时退化为内存对象，本局内仍然可用。 */
import { SAVE_KEY, SAVE_DEFAULT, FX_LEVELS, SPEEDS } from './config.js';

const NUM_FIELDS = ['unlocked', 'totalStars', 'fx', 'speed'];
const BOOL_FIELDS = ['sound', 'grid', 'dmgNum', 'keep', 'auto'];
const FX_TIERS = FX_LEVELS.length;      // 档位下标上限由 FX_LEVELS 决定
const SPEED_IDX_MAX = SPEEDS.length - 1; // 倍速是 SPEEDS 的下标，不是倍速本身
let mem = null; // localStorage 不可用时的后备

function fresh() { return JSON.parse(JSON.stringify(SAVE_DEFAULT)); }

/** 数字表清洗：星级上限 3，最高分不设上限（传 Infinity） */
function numMap(src, out, maxV) {
  if (!src || typeof src !== 'object') return;
  const cap = Number.isFinite(maxV) ? maxV : Infinity;
  for (const k in src) {
    const v = src[k];
    if (Number.isFinite(v) && k.length <= 8) out[k] = Math.max(0, Math.min(cap, Math.round(v)));
  }
}

/** 把任意来源的对象收敛成合法存档；顺带把 totalStars 与 stars 表对齐 */
export function heal(raw) {
  const s = fresh();
  if (raw && typeof raw === 'object') {
    for (const k of NUM_FIELDS) if (Number.isFinite(raw[k])) s[k] = Math.max(0, Math.round(raw[k]));
    for (const k of BOOL_FIELDS) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    numMap(raw.stars, s.stars, 3);
    numMap(raw.best, s.best, Infinity);
    const e = raw.endless;
    if (e && typeof e === 'object') {
      if (Number.isFinite(e.bestWave)) s.endless.bestWave = Math.max(0, Math.round(e.bestWave));
      if (Number.isFinite(e.bestScore)) s.endless.bestScore = Math.max(0, Math.round(e.bestScore));
    }
  }
  s.fx = Math.max(0, Math.min(FX_TIERS - 1, s.fx));
  s.speed = Math.max(0, Math.min(SPEED_IDX_MAX, s.speed));
  s.unlocked = Math.max(1, s.unlocked);
  let sum = 0;
  for (const k in s.stars) sum += s.stars[k];
  s.totalStars = sum;
  return s;
}

export function load() {
  if (mem) return mem;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { raw = null; }
  mem = heal(raw);
  if (raw === null) persist(); // 首次进入就把默认档写下去，方便「重置」按钮有档可删
  return mem;
}

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(mem)); } catch (e) { /* 隐私模式：静默用内存档 */ }
}

/** 合并写入：标量直接覆盖；stars / best / endless 是嵌套表，按键取「历史最大值」合并 */
export function save(patch) {
  const s = load();
  for (const k in patch) {
    if (k === 'endless' || k === 'stars' || k === 'best') continue;
    s[k] = patch[k];
  }
  if (patch.endless && typeof patch.endless === 'object') Object.assign(s.endless, patch.endless);
  for (const key of ['stars', 'best']) {
    const p = patch[key];
    if (!p || typeof p !== 'object') continue;
    for (const id in p) {
      const v = p[id];
      if (!Number.isFinite(v) || id.length > 8) continue;
      s[key][id] = Math.max(s[key][id] || 0, Math.max(0, Math.round(v)));
    }
  }
  const clean = heal(s);
  mem = clean;
  persist();
  return clean;
}

export function reset() {
  mem = fresh();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  persist();
  return mem;
}

/** 记录一次关卡结算：返回 { stars, newStars, isBest, unlockedNew } 供结算界面播报 */
export function recordLevel(levelId, sum) {
  const s = load();
  const id = String(levelId);
  const prevStars = s.stars[id] || 0;
  const prevBest = s.best[id] || 0;
  const stars = sum.win ? Math.max(prevStars, sum.stars) : prevStars;
  const best = Math.max(prevBest, sum.score);
  s.stars[id] = stars;
  s.best[id] = best;
  let unlockedNew = 0;
  if (sum.win && s.unlocked < levelId + 1) { s.unlocked = levelId + 1; unlockedNew = 1; }
  const out = { stars, newStars: stars - prevStars, isBest: sum.score > prevBest, unlockedNew, prevBest };
  save({ stars: s.stars, best: s.best, unlocked: s.unlocked });
  return out;
}

/** 记录无尽结算，返回 { bestWave, bestScore, isBest } */
export function recordEndless(sum) {
  const s = load();
  const isBest = sum.wave > s.endless.bestWave || sum.score > s.endless.bestScore;
  s.endless.bestWave = Math.max(s.endless.bestWave, sum.wave);
  s.endless.bestScore = Math.max(s.endless.bestScore, sum.score);
  save({ endless: s.endless });
  return { bestWave: s.endless.bestWave, bestScore: s.endless.bestScore, isBest };
}

export const totalStars = () => load().totalStars;
export const starsOfLevel = (id) => load().stars[String(id)] || 0;
export const bestOfLevel = (id) => load().best[String(id)] || 0;
export const isUnlocked = (id) => load().unlocked >= id;
