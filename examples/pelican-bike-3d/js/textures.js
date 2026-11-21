/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/textures.js —— 程序化 canvas 贴图工厂（T01–T14）
 * 零二进制素材：所有贴图由 Canvas2D 生成（台账见 docs/assets.md）。
 * 约束：本模块不 import three；three 由调用方注入（buildTextureKit(THREE)），故 Node 里也能 import 画函数。
 * 色彩口径：albedo 用 THREE.sRGBEncoding；法线/数据贴图保持 Linear（r128 口径）。
 */
'use strict';

import { hash2, clamp, clamp01, lerp } from './utils.js';

/* ============================ 周期噪声（保证贴图无缝平铺） ============================ */
/** 周期值噪声：格子在周期 P 内取模 → 与平铺边界无缝。 */
export function pnoise(x, y, P, seed) {
  const s = (seed | 0) || 11;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const id = (a, b) => ((a % P) + P) % P * 1 + (((b % P) + P) % P) * 4096 + s;
  const a = hash2(id(xi, yi), s), b = hash2(id(xi + 1, yi), s);
  const c = hash2(id(xi, yi + 1), s), d = hash2(id(xi + 1, yi + 1), s);
  return (lerp(a, b, u) * (1 - v)) + lerp(c, d, u) * v;
}
/** 周期分形噪声。 */
export function pfbm(x, y, P, seed, octaves) {
  const n = octaves || 4;
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < n; i++) {
    sum += amp * pnoise(x * f, y * f, P * f, seed + i * 97);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

/* ============================ 小工具 ============================ */
function ctxOf(w, h, CanvasCtor) {
  // 浏览器：document.createElement('canvas')（HTMLCanvasElement 不能 new —— 会抛 Illegal constructor）
  // Node（tools 打样）：由 nodeProvider(CanvasCtor) 注入构造器，走 new Ctor(w, h)
  let cv;
  if (CanvasCtor) cv = new CanvasCtor(w, h);
  else if (typeof document !== 'undefined' && document.createElement) {
    cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
  } else {
    return { canvas: { width: w, height: h }, ctx: null };
  }
  return { canvas: cv, ctx: cv.getContext('2d') };
}
/** Node 侧注入 Canvas 构造器（tools/preview-textures 用）。 */
export function nodeProvider(CanvasCtor) {
  return { CanvasCtor: CanvasCtor };
}
function fillBase(ctx, w, h, rgb) {
  ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  ctx.fillRect(0, 0, w, h);
}
/** 写一个像素到 ImageData 的 data 数组（paint 传的就是 img.data 本身，不是 ImageData）。 */
function put(px, i, r, g, b, a) {
  px[i] = r | 0; px[i + 1] = g | 0; px[i + 2] = b | 0; px[i + 3] = a === undefined ? 255 : a | 0;
}
/** 用 ImageData 逐像素画（比 4 万次 fillRect 快得多）。 */
function paint(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const c = fn(x, y, i);
      if (c) put(px, i, c[0], c[1], c[2], c[3]);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function mixc(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/* ============================ T01 沥青路面 ============================ */
export const asphaltOpts = { id: 'T01', name: 'asphalt', w: 512, h: 512, tile: true, seed: 901, metric: 6.5 };
export function drawAsphalt(ctx, w, h, o, CanvasCtor) {
  const S = (o && o.seed) || asphaltOpts.seed;
  fillBase(ctx, w, h, [58, 60, 66]);
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 8, v = y / h * 8;
    const mottle = pfbm(u, v, 8, S, 4);
    const grit = pnoise(u * 42, v * 42, 336, S + 5);
    const track = Math.exp(-Math.pow((y / h - 0.34) * 7, 2)) + Math.exp(-Math.pow((y / h - 0.68) * 7, 2));
    let c = mixc([44, 46, 52], [86, 88, 94], mottle);
    c = mixc(c, [110, 112, 118], (grit - 0.55) * 0.9 * (grit > 0.55 ? 1 : 0));
    c = mixc(c, [30, 31, 36], clamp01(track * 0.22));
    return c;
  });
  // 裂缝与补丁（周期接缝：坐标取模画两遍）
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(24,25,28,1)';
  for (let k = 0; k < 7; k++) {
    const seed = S + k * 31;
    let x = hash2(seed, 3) * w, y = hash2(seed, 7) * h;
    ctx.lineWidth = 0.8 + hash2(seed, 11) * 1.6;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (hash2(seed + s, 13) - 0.5) * 90; y += (hash2(seed + s, 17) - 0.5) * 90;
      ctx.lineTo(((x % w) + w) % w, ((y % h) + h) % h);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#7b7f88';
  for (let k = 0; k < 5; k++) {
    const seed = S + k * 71;
    ctx.beginPath();
    ctx.ellipse(hash2(seed, 5) * w, hash2(seed, 9) * h, 26 + hash2(seed, 13) * 40, 16 + hash2(seed, 15) * 26, hash2(seed, 3) * 3, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

/* ============================ T02 沙（沙滩） ============================ */
export const sandOpts = { id: 'T02', name: 'sand', w: 512, h: 512, tile: true, seed: 902, metric: 8 };
export function drawSand(ctx, w, h, o) {
  const S = (o && o.seed) || sandOpts.seed;
  fillBase(ctx, w, h, [214, 199, 168]);
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 6, v = y / h * 6;
    const base = pfbm(u, v, 6, S, 4);
    const ripple = Math.sin((u * 6.2 + pfbm(u * 2, v * 2, 12, S + 3, 2) * 3)) * 0.5 + 0.5;
    const grit = pnoise(u * 60, v * 60, 360, S + 9);
    let c = mixc([188, 172, 140], [232, 219, 190], base * 0.8 + ripple * 0.2);
    c = mixc(c, [246, 238, 216], (grit - 0.6) * 0.7 * (grit > 0.6 ? 1 : 0));
    return c;
  });
}

/* ============================ T03 岩壁（悬崖层理） ============================ */
export const rockOpts = { id: 'T03', name: 'rock', w: 512, h: 512, tile: true, seed: 903, metric: 22 };
export function drawRock(ctx, w, h, o) {
  const S = (o && o.seed) || rockOpts.seed;
  fillBase(ctx, w, h, [122, 116, 106]);
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 5, v = y / h * 5;
    const warp = pfbm(u * 1.6, v * 3.0, 8, S, 4);
    const strata = Math.sin(v * 26 + warp * 7.5) * 0.5 + 0.5;
    const grit = pnoise(u * 48, v * 48, 240, S + 7);
    let c = mixc([96, 92, 86], [156, 148, 132], strata * 0.7 + warp * 0.3);
    c = mixc(c, [70, 66, 62], (1 - strata) * 0.25);
    c = mixc(c, [176, 168, 150], (grit - 0.55) * 0.6 * (grit > 0.55 ? 1 : 0));
    const moss = pfbm(u * 3, v * 3, 6, S + 21, 3);
    if (moss > 0.66) c = mixc(c, [86, 104, 72], (moss - 0.66) * 1.6);
    return c;
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(48,46,44,0.5)';
  for (let k = 0; k < 16; k++) {
    const seed = S + k * 13, x = hash2(seed, 21) * w;
    ctx.lineWidth = 0.6 + hash2(seed, 5) * 1.8;
    ctx.beginPath(); ctx.moveTo(x, 0);
    for (let s = 1; s <= 8; s++) ctx.lineTo(x + (hash2(seed + s, 9) - 0.5) * 26, (h / 8) * s);
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================ T04 土/草坡 ============================ */
export const dirtOpts = { id: 'T04', name: 'dirt', w: 256, h: 256, tile: true, seed: 904, metric: 10 };
export function drawDirt(ctx, w, h, o) {
  const S = (o && o.seed) || dirtOpts.seed;
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 5, v = y / h * 5;
    const n = pfbm(u, v, 5, S, 4);
    const patch = pfbm(u * 0.6, v * 0.6, 3, S + 11, 3);
    let c = mixc([96, 104, 66], [134, 122, 92], patch * 0.7 + n * 0.3);
    const sp = pnoise(u * 70, v * 70, 350, S + 3);
    c = mixc(c, [150, 160, 104], (sp - 0.6) * 0.6 * (sp > 0.6 ? 1 : 0));
    return c;
  });
}

/* ============================ T05 棕榈树皮 ============================ */
export const barkOpts = { id: 'T05', name: 'bark', w: 128, h: 256, tile: true, seed: 905, metric: 3 };
export function drawBark(ctx, w, h, o) {
  const S = (o && o.seed) || barkOpts.seed;
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 10, v = y / h * 22;
    const fiber = pfbm(u * 2, v, 20, S, 3);
    const ring = Math.sin(v * 3.1 + fiber * 4) * 0.5 + 0.5;
    return mixc([88, 74, 56], [142, 124, 96], fiber * 0.6 + ring * 0.4);
  });
}

/* ============================ T06 棕榈叶（alpha） ============================ */
export const palmLeafOpts = { id: 'T06', name: 'palmLeaf', w: 128, h: 256, tile: false, alpha: true, seed: 906 };
export function drawPalmLeaf(ctx, w, h, o) {
  const S = (o && o.seed) || palmLeafOpts.seed;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#3f7a35';
  ctx.strokeStyle = '#2f5f28';
  // 中脉
  ctx.beginPath(); ctx.moveTo(w * 0.5, h); ctx.quadraticCurveTo(w * 0.56, h * 0.5, w * 0.5, 4); ctx.lineTo(w * 0.5 - 3, 4);
  ctx.quadraticCurveTo(w * 0.5 - 3, h * 0.5, w * 0.5 - 3, h); ctx.closePath(); ctx.fill();
  // 小叶
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const y = h - t * (h - 12);
    const len = (1 - Math.abs(t - 0.45) * 1.15) * w * 0.46 * (0.6 + pnoise(i, 0, 32, S) * 0.5);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, y);
      ctx.quadraticCurveTo(w * 0.5 + sgn * len * 0.6, y - len * 0.22, w * 0.5 + sgn * len, y - len * 0.5);
      ctx.quadraticCurveTo(w * 0.5 + sgn * len * 0.55, y + 3, w * 0.5, y + 3);
      ctx.closePath();
      ctx.fillStyle = i % 3 === 0 ? '#4a8c3c' : '#3f7a35';
      ctx.fill();
    }
  }
}

/* ============================ T07 树冠（针叶/阔叶丛，alpha） ============================ */
export const foliageOpts = { id: 'T07', name: 'foliage', w: 128, h: 128, tile: false, alpha: true, seed: 907 };
export function drawFoliage(ctx, w, h, o) {
  const S = (o && o.seed) || foliageOpts.seed;
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    const a = hash2(i, S) * 6.2832, r = hash2(i, S + 3) * w * 0.42;
    const x = w * 0.5 + Math.cos(a) * r, y = h * 0.5 + Math.sin(a) * r * 0.9;
    ctx.fillStyle = 'rgba(58,110,52,' + (0.35 + hash2(i, S + 7) * 0.5).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(x, y, 5 + hash2(i, S + 11) * 9, 3 + hash2(i, S + 13) * 5, hash2(i, S) * 3, 0, 6.2832); ctx.fill();
  }
}

/* ============================ T08 草叶十字板（alpha） ============================ */
export const grassOpts = { id: 'T08', name: 'grass', w: 64, h: 64, tile: false, alpha: true, seed: 908 };
export function drawGrass(ctx, w, h, o) {
  const S = (o && o.seed) || grassOpts.seed;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = 6 + hash2(i, S) * (w - 12);
    const hgt = h * (0.45 + hash2(i, S + 5) * 0.5);
    ctx.strokeStyle = 'rgba(' + (72 + hash2(i, S + 9) * 40 | 0) + ',' + (116 + hash2(i, S + 11) * 46 | 0) + ',62,0.95)';
    ctx.lineWidth = 1.6 + hash2(i, S + 3) * 1.2;
    ctx.beginPath(); ctx.moveTo(x, h);
    ctx.quadraticCurveTo(x + (hash2(i, S + 7) - 0.5) * 10, h - hgt * 0.6, x + (hash2(i, S + 7) - 0.5) * 16, h - hgt);
    ctx.stroke();
  }
}

/* ============================ T09 云（alpha） ============================ */
export const cloudOpts = { id: 'T09', name: 'cloud', w: 256, h: 256, tile: false, alpha: true, noMip: true, seed: 909 };
export function drawCloud(ctx, w, h, o) {
  const S = (o && o.seed) || cloudOpts.seed;
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 4, v = y / h * 4;
    const n = pfbm(u, v, 4, S, 5);
    const edge = 1 - clamp01(Math.hypot((x - w / 2) / (w * 0.5), (y - h / 2) / (h * 0.42)));
    const a = clamp01((n - 0.34) * 2.2) * clamp01(edge * 1.7);
    return [252, 253, 255, a * 235];
  });
}

/* ============================ T10 浪花泡沫（alpha） ============================ */
export const foamOpts = { id: 'T10', name: 'foam', w: 128, h: 128, tile: true, alpha: true, seed: 910 };
export function drawFoam(ctx, w, h, o) {
  const S = (o && o.seed) || foamOpts.seed;
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 7, v = y / h * 7;
    const n = pfbm(u, v, 7, S, 4);
    const bubble = pnoise(u * 14, v * 14, 98, S + 4);
    const a = clamp01((n - 0.42) * 2.6) * (0.55 + bubble * 0.6);
    return [255, 255, 255, clamp01(a) * 255];
  });
}

/* ============================ T11 海鸥（alpha） ============================ */
export const gullOpts = { id: 'T11', name: 'gull', w: 64, h: 64, tile: false, alpha: true, noMip: true, seed: 911 };
export function drawGull(ctx, w, h, o) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(246,248,252,0.95)';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.52);
  ctx.quadraticCurveTo(w * 0.22, h * 0.30, w * 0.04, h * 0.42);
  ctx.quadraticCurveTo(w * 0.26, h * 0.52, w * 0.40, h * 0.60);
  ctx.quadraticCurveTo(w * 0.26, h * 0.62, w * 0.06, h * 0.66);
  ctx.quadraticCurveTo(w * 0.30, h * 0.76, w * 0.5, h * 0.70);
  ctx.quadraticCurveTo(w * 0.70, h * 0.76, w * 0.94, h * 0.66);
  ctx.quadraticCurveTo(w * 0.74, h * 0.62, w * 0.60, h * 0.60);
  ctx.quadraticCurveTo(w * 0.74, h * 0.52, w * 0.96, h * 0.42);
  ctx.quadraticCurveTo(w * 0.78, h * 0.30, w * 0.5, h * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(150,158,170,0.55)';
  ctx.fillRect(w * 0.47, h * 0.5, 3, h * 0.2);
}

/* ============================ T12 羽毛纹理（鹈鹕体羽，albedo） ============================ */
export const featherOpts = { id: 'T12', name: 'feather', w: 256, h: 256, tile: true, seed: 912, metric: 0.6 };
export function drawFeather(ctx, w, h, o) {
  const S = (o && o.seed) || featherOpts.seed;
  paint(ctx, w, h, function (x, y) {
    const u = x / w * 12, v = y / h * 12;
    const bar = Math.sin((v * 10 + pfbm(u, v * 0.5, 12, S, 3) * 3.2) * 6.2832) * 0.5 + 0.5;
    const n = pfbm(u * 2, v * 2, 24, S + 5, 3);
    const c = mixc([236, 236, 232], [255, 255, 252], bar * 0.5 + n * 0.5);
    const dark = pfbm(u * 0.6, v * 0.6, 4, S + 31, 3);
    return mixc(c, [196, 198, 196], clamp01((dark - 0.62) * 1.6) * 0.7);
  });
}

/* ============================ T13 海面法线（Linear） ============================ */
export const waterNormalOpts = { id: 'T13', name: 'waterNormal', w: 256, h: 256, tile: true, seed: 913, metric: 9, linear: true };
export function drawWaterNormal(ctx, w, h, o) {
  const S = (o && o.seed) || waterNormalOpts.seed;
  const N = 4.2;
  const height = (x, y) => pfbm(x / w * 8, y / h * 8, 8, S, 4) * 0.72 + pnoise(x / w * 40, y / h * 40, 40, S + 3) * 0.28;
  paint(ctx, w, h, function (x, y) {
    const dx = (height(x + 1, y) - height(x - 1, y)) * N;
    const dy = (height(x, y + 1) - height(x, y - 1)) * N;
    const len = Math.hypot(-dx, -dy, 1);
    return [(1 + (-dx) / len) * 127, (1 + (-dy) / len) * 127, (1 / len) * 255, 255];
  });
}

/* ============================ T14 光晕（加法混合 sprite） ============================ */
export const glowOpts = { id: 'T14', name: 'glow', w: 128, h: 128, tile: false, alpha: true, seed: 914 };
export function drawGlow(ctx, w, h, o) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,246,220,0.55)');
  g.addColorStop(0.62, 'rgba(255,228,170,0.16)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ============================ 台账与预算 ============================ */
export const TEXTURES = [
  { ...asphaltOpts, draw: drawAsphalt },
  { ...sandOpts, draw: drawSand },
  { ...rockOpts, draw: drawRock },
  { ...dirtOpts, draw: drawDirt },
  { ...barkOpts, draw: drawBark },
  { ...palmLeafOpts, draw: drawPalmLeaf },
  { ...foliageOpts, draw: drawFoliage },
  { ...grassOpts, draw: drawGrass },
  { ...cloudOpts, draw: drawCloud },
  { ...foamOpts, draw: drawFoam },
  { ...gullOpts, draw: drawGull },
  { ...featherOpts, draw: drawFeather },
  { ...waterNormalOpts, draw: drawWaterNormal },
  { ...glowOpts, draw: drawGlow },
];

/** 单张贴图的显存估算（含 mip 1.33）。 */
export function estimateTextureBytes(entry) {
  return Math.round(entry.w * entry.h * 4 * 1.33);
}
export function textureBudgetReport() {
  const bytes = TEXTURES.reduce((s, e) => s + estimateTextureBytes(e), 0);
  return { count: TEXTURES.length, bytes: bytes, mb: +(bytes / 1048576).toFixed(2),
    maxSide: TEXTURES.reduce((m, e) => Math.max(m, e.w, e.h), 0) };
}

/** 画一张贴图 → {canvas, ctx}（Node 侧注入 CanvasCtor 可导出 PNG 复核）。 */
export function renderTextureCanvas(entry, CanvasCtor) {
  const o = ctxOf(entry.w, entry.h, CanvasCtor);
  if (o.ctx) entry.draw(o.ctx, entry.w, entry.h, entry, CanvasCtor);
  return o.canvas;
}

/** 生成 THREE 贴图（口径与 assets/vendor 登记一致：albedo = sRGB，法线/数据 = Linear）。 */
export function makeTexture(THREE, entry, o) {
  const opt = o || {};
  const canvas = renderTextureCanvas(entry, opt.CanvasCtor);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = entry.tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  if (entry.noMip) {
    // 远距离 alpha 精灵（海鸥、云）关 mipmap：mip 链会把稀疏 alpha 平均成不透明，远处就变成一堆白色方块
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
  } else {
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.generateMipmaps = true;
  }
  if (entry.anisotropy) tex.anisotropy = entry.anisotropy;
  if (!entry.linear && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  if (entry.repeat) tex.repeat.set(entry.repeat[0], entry.repeat[1]);
  return tex;
}

/** 组装贴图与共用材质（调用方注入 THREE）。 */
export function buildTextureKit(THREE, o) {
  const opt = o || {};
  const aniso = opt.anisotropy || 1;
  const tex = {};
  const byName = {};
  for (const e of TEXTURES) {
    const t = makeTexture(THREE, { ...e, anisotropy: aniso }, opt);
    tex[e.name] = t;
    byName[e.name] = e;
  }
  const std = (color, map, rough, metal, extra) => {
    const p = { color: color, roughness: rough === undefined ? 0.9 : rough, metalness: metal || 0 };
    if (map) p.map = map;
    const m = new THREE.MeshStandardMaterial(p);
    if (extra) Object.assign(m, extra);
    return m;
  };
  const uvScale = (t, s) => { t.repeat.set(s[0], s[1]); t.needsUpdate = true; return t; };

  // 世界单位换算：贴图 tile 尺寸（米）→ repeat 由几何体 UV 决定（几何体写 uv = 米 / metric）
  const metricOf = (name) => (byName[name] && byName[name].metric) || 4;

  const mat = {
    asphalt: std(0xffffff, tex.asphalt, 0.94, 0.0),
    paintWhite: std(0xf2f3f0, null, 0.6, 0.0, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    paintYellow: std(0xf6d36a, null, 0.6, 0.0, { polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5 }),
    sand: std(0xffffff, tex.sand, 0.98, 0.0),
    sandVC: std(0xffffff, tex.sand, 0.95, 0.02, { vertexColors: true }),   // 沙滩条带（顶点色压湿沙）
    wetSand: std(0xa89b82, tex.sand, 0.55, 0.02),
    rock: std(0xffffff, tex.rock, 0.96, 0.0),
    ground: std(0xffffff, tex.dirt, 0.95, 0.0, { vertexColors: true }),
    grassCard: new THREE.MeshStandardMaterial({ map: tex.grass, transparent: true, alphaTest: 0.35, roughness: 0.9, side: THREE.DoubleSide }),
    palmLeaf: new THREE.MeshStandardMaterial({ map: tex.palmLeaf, transparent: true, alphaTest: 0.4, roughness: 0.8, side: THREE.DoubleSide }),
    foliage: new THREE.MeshStandardMaterial({ map: tex.foliage, transparent: true, alphaTest: 0.4, roughness: 0.85, side: THREE.DoubleSide, color: 0xffffff }),
    bark: std(0xffffff, tex.bark, 0.9, 0.0),
    feather: std(0xf6f5f1, tex.feather, 0.78, 0.0),
    featherDark: std(0x9aa0a8, tex.feather, 0.8, 0.0),
    beak: std(0xffa63c, null, 0.55, 0.05),
    pouch: std(0xffb95c, null, 0.62, 0.0),
    leg: std(0xf07a3c, null, 0.62, 0.0),
    eye: std(0x14161c, null, 0.25, 0.2),
    crest: std(0xf2efe6, null, 0.8, 0.0),
    rubber: std(0x232428, null, 0.85, 0.02),
    frame: std(0xd0342f, null, 0.36, 0.35),
    chrome: std(0xd7dade, null, 0.24, 0.85),
    steel: std(0x9aa0a6, null, 0.42, 0.7),
    plastic: std(0x2b2e34, null, 0.6, 0.05),
    basket: std(0xb9c2c8, null, 0.5, 0.4),
    fish: std(0x9fc4dd, null, 0.35, 0.25),
    fishBelly: std(0xeef3f6, null, 0.4, 0.2),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }),
    glowSprite: new THREE.SpriteMaterial({ map: tex.glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.5 }),
    foamSprite: new THREE.MeshBasicMaterial({ map: tex.foam, transparent: true, depthWrite: false, opacity: 0.85, color: 0xffffff }),
    gull: new THREE.MeshBasicMaterial({ map: tex.gull, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95 }),
    stone: std(0x9a978f, tex.rock, 0.94, 0.0),
    metal: std(0xc6cad0, null, 0.34, 0.72),
    wood: std(0x8b6a44, tex.bark, 0.86, 0.0),
    cloud: new THREE.MeshBasicMaterial({ map: tex.cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.9, color: 0xffffff }),
    headland: std(0x4c5f6e, null, 1.0, 0.0, { fog: true }),
  };
  uvScale(mat.asphalt.map, [1, 1]);
  // 上面所有颜色都是「设计时的 sRGB 显示值」。渲染器开了 sRGB 输出 + 色调映射，
  // 材质色要按线性参与光照，这里统一转一次，避免整场景被调亮、饱和度发飞。
  for (const key of Object.keys(mat)) {
    const m = mat[key];
    if (!m || !m.color || !m.color.isColor) continue;
    m.color.convertSRGBToLinear();
    if (m.emissive && m.emissive.isColor) m.emissive.convertSRGBToLinear();
  }
  return { tex: tex, mat: mat, meta: byName, metricOf: metricOf, uvScale: uvScale };
}
