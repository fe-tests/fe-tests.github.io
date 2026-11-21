/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/utils.js —— 纯工具（数学 / 插值 / 值噪声）
 * 约束：不 import three、不碰 DOM；Node 可直接 import（smoke.mjs 用）。 */
'use strict';

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, v) { return (v - a) / (b - a || 1); }
export function smoothstep(a, b, v) {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}
export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
export function easeOutCubic(t) { return 1 - Math.pow(1 - clamp01(t), 3); }

/** 指数趋近（帧率无关）：从 from 走向 to，rate 越大越紧。 */
export function damp(from, to, rate, dt) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return from + (to - from) * k;
}

/** 角度归一到 (-π, π]，插值时取最近方向（避免多转一圈）。 */
export function normAngle(a) {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}
export function lerpAngle(a, b, t) { return a + normAngle(b - a) * t; }

/** 周期性插值（时刻 [0,1) 用）。 */
export function lerpWrap(a, b, t) {
  const d = ((b - a + 1.5) % 1) - 0.5;
  return (a + d * t + 1) % 1;
}

/* --------------------------- 确定性随机与噪声 --------------------------- */
/** 32 位整数式伪随机 → [0,1)。seed 任意数。 */
export function rng(seed) {
  let s = (seed | 0) || 1;
  return function next() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s < 0 ? -s : s) % 100000) / 100000;
  };
}
/** 稳定 hash：整数对 → [0,1)。 */
export function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  const v = (h ^ (h >>> 16)) >>> 0;
  return v / 4294967295;
}
/** 稳定 hash：单整数 → [0,1)。 */
export function hash1(x) {
  let h = (x | 0) * 2246822519;
  h = (h ^ (h >>> 15)) * 3266489917;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

/** 双线性值噪声（格子插值 smoothstep）。 */
export function valueNoise(x, y, seed) {
  const s = (seed | 0) || 7;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi * 5 + s, yi * 5 + s);
  const b = hash2(xi * 5 + s + 1, yi * 5 + s);
  const c = hash2(xi * 5 + s, yi * 5 + s + 1);
  const d = hash2(xi * 5 + s + 1, yi * 5 + s + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 分形噪声（4 倍频，归一化到 [0,1)）。 */
export function fbm(x, y, seed, octaves) {
  const n = octaves || 4;
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < n; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

/** 把 [0,1) 映射到 [-1,1)。 */
export function signed(v) { return v * 2 - 1; }

/** 两 RGB 数组插值。 */
export function mixRGB(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** sRGB 显示值 → 线性。renderer.outputEncoding = sRGBEncoding 时，
 *  内置材质与自定义着色器的输出都按「线性 → sRGB」编码，所以关键帧里的显示色要先转到线性，
 *  否则等于把设计好的颜色调亮/洗白一遍（黄昏会整片发白）。 */
export function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
export function toLinear(rgb) {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/** 环形索引（分块回收用）。 */
export function wrapIndex(i, n) { return ((i % n) + n) % n; }

/** 时刻 [0,1) → "hh:mm"。 */
export function fmtClock(timeOfDay) {
  const total = (((timeOfDay % 1) + 1) % 1) * 24;
  const h = Math.floor(total);
  const m = Math.floor((total - h) * 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
