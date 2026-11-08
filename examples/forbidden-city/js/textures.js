/* 3D 故宫游览 · js/textures.js —— 程序化材质工厂（T01–T18，零二进制）
 *
 * 设计要点：
 * 1) 「绘制逻辑」与「three.js / DOM 装配」分离：每个工厂是纯函数 `draw(ctx, w, h, opts)`，
 *    只依赖 Canvas2D API。因此可在 Node 里注入 node-canvas 做像素级冒烟测试（tools/smoke.mjs），
 *    浏览器里则由 makeTexture() 包成 THREE.CanvasTexture。
 * 2) r128 色彩口径：albedo 用 `encoding = THREE.sRGBEncoding`；bump/roughness/normal 保持 LinearEncoding。
 *    （r15x 才叫 colorSpace —— 见 PROGRESS.md D9）
 * 3) 平铺贴图必须自身可无缝平铺：噪声走「周期值噪声」，绘制时不做屏幕空间偏移。
 * 4) 预算口径（assets.md §2）：显存 ≈ w × h × 4B × 1.33；单张 ≤ 1024px；总量 ≤ 128MB。
 */

import { TEX, TEX_BUDGET } from './config.js';

/* ============================ 可测试性：2D 上下文注入 ============================ */

/** Node 侧冒烟测试用的 provider（浏览器不传时走 DOM 分支）。 */
export function nodeProvider(CanvasCtor) {
  return {
    create(w, h) { const c = new CanvasCtor(w, h); return { canvas: c, ctx: c.getContext('2d') }; },
    finish() { /* node-canvas 无需释放 */ },
  };
}

/* ============================ three.js 装配（只在浏览器调用） ============================ */

/** 默认 provider：document.createElement('canvas')。函数内取 document → 顶层不碰 DOM，Node 可 import。 */
function domProvider() {
  const el = document.createElement('canvas');
  return { create: (w, h) => { el.width = w; el.height = h; return { canvas: el, ctx: el.getContext('2d') }; }, finish: () => {} };
}

/* ============================ 噪声与绘图工具（确定性，可复现） ============================ */

/** mulberry32：固定种子伪随机，保证每次刷新贴图完全一致。 */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 周期值噪声（可无缝平铺）：格点随机 + 三次平滑插值。 */
export function makeNoise(seed, period = 8) {
  const r = rng(seed);
  const p = Math.max(2, period | 0);
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const smooth = (t) => t * t * (3 - 2 * t);
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = g[((yi % p) + p * 2) % p * p + ((xi % p) + p * 2) % p];
    const b = g[((yi % p) + p * 2) % p * p + (((xi + 1) % p) + p * 2) % p];
    const c = g[(((yi + 1) % p) + p * 2) % p * p + ((xi % p) + p * 2) % p];
    const d = g[(((yi + 1) % p) + p * 2) % p * p + (((xi + 1) % p) + p * 2) % p];
    const u = smooth(xf), v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

/** fbm：多倍频叠加，用于石纹、斑驳、氧化这类自然分布。 */
export function makeFbm(seed, period = 8, octaves = 4) {
  const n = makeNoise(seed, period);
  return function fbm(x, y) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * freq, y * freq) * amp; norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

/** 用噪声现场生成一张灰度/彩色像素图并画到 ctx（平铺友好）。 */
function paintNoise(ctx, w, h, fn, colorA, colorB, scale = 8) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.max(0, Math.min(1, fn(x / w * scale, y / h * scale)));
      const i = (y * w + x) * 4;
      d[i] = colorA[0] + (colorB[0] - colorA[0]) * t;
      d[i + 1] = colorA[1] + (colorB[1] - colorA[1]) * t;
      d[i + 2] = colorA[2] + (colorB[2] - colorA[2]) * t;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** 平铺友好地画一条线：把线在 3×3 邻域各画一次，保证跨边界不断。 */
function wrapLines(ctx, w, h, draw) {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      ctx.save(); ctx.translate(ox * w, oy * h); draw(ctx); ctx.restore();
    }
  }
}

const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';

/** 把噪声按 alpha 叠画到当前画面上（彩画做旧这类「再压一层灰度」的场合）。
 *  走 ImageData 读写，不用 drawImage → 浏览器与 Node 两侧都不依赖 document.createElement。 */
function overlayNoise(ctx, w, h, fn, scale = 12, alpha = .2, lighten = [255, 255, 255]) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = fn(x / w * scale, y / h * scale);
      const a = Math.max(0, Math.min(1, (t - .35) * 2)) * alpha;
      const i = (y * w + x) * 4;
      d[i] += (lighten[0] - d[i]) * a; d[i + 1] += (lighten[1] - d[i + 1]) * a; d[i + 2] += (lighten[2] - d[i + 2]) * a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ============================ T01 琉璃筒瓦（可平铺） ============================ */
export const roofTilesOpts = { id: 'T01', w: 512, h: 512, tile: true, seed: 101 };
export function drawRoofTiles(ctx, w, h, o = {}) {
  const rows = o.rows || 8;          // 一行瓦当的高度数（越多个 = 单张里更多行）
  const cols = o.cols || 6;          // 一张里的筒瓦列数
  const base = o.base || [176, 132, 22];   // 黄琉璃（配殿用绿：[58,120,64]）
  const dark = o.dark || [120, 84, 12];
  const light = o.light || [226, 190, 96];
  ctx.clearRect(0, 0, w, h);
  paintNoise(ctx, w, h, makeFbm(o.seed || 101, 8, 4), base, light, 6);

  const cw = w / cols, rh = h / rows;
  // 筒瓦：每列一条高光 + 右侧阴影，形成圆拱筒瓦的立体感
  for (let c = 0; c < cols; c++) {
    const x = c * cw;
    const g = ctx.createLinearGradient(x, 0, x + cw, 0);
    g.addColorStop(0, rgba(dark, .55)); g.addColorStop(.42, rgba(light, .30));
    g.addColorStop(.62, rgba(base, .05)); g.addColorStop(1, rgba([0, 0, 0], .38));
    ctx.fillStyle = g; ctx.fillRect(x, 0, cw, h);
    ctx.strokeStyle = rgba(dark, .5); ctx.lineWidth = Math.max(1, w / 256);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  // 瓦垄横向接缝：每行一道压痕 + 檐口方向的瓦当（半圆）
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    ctx.fillStyle = rgba([0, 0, 0], .22); ctx.fillRect(0, y, w, Math.max(1, h / 512) * 2);
    ctx.fillStyle = rgba(light, .35); ctx.fillRect(0, y + 2, w, Math.max(1, h / 512));
    for (let c = 0; c < cols; c++) {                       // 瓦当（圆头）
      ctx.beginPath();
      ctx.arc(c * cw + cw / 2, y + rh * 0.16, cw * 0.30, 0, Math.PI * 2);
      ctx.fillStyle = rgba(light, .5); ctx.fill();
      ctx.strokeStyle = rgba(dark, .55); ctx.lineWidth = Math.max(1, w / 300); ctx.stroke();
    }
  }
  return ctx;
}

/* ============================ T02 脊筒与走兽底 ============================ */
export const ridgeTileOpts = { id: 'T02', w: 256, h: 256, tile: true, seed: 102 };
export function drawRidgeTile(ctx, w, h, o = {}) {
  const base = o.base || [150, 112, 18], light = o.light || [214, 178, 76];
  paintNoise(ctx, w, h, makeFbm(o.seed || 102, 6, 3), base, light, 5);
  // 脊筒：横向两道圆拱 + 竖向节缝
  const seg = w / 4;
  for (let i = 0; i < 4; i++) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(light, .35)); g.addColorStop(.5, rgba([0, 0, 0], .12)); g.addColorStop(1, rgba([0, 0, 0], .30));
    ctx.fillStyle = g; ctx.fillRect(i * seg + 1, 0, seg - 2, h);
    ctx.strokeStyle = rgba([40, 28, 6], .55); ctx.lineWidth = Math.max(1, w / 128);
    ctx.beginPath(); ctx.moveTo(i * seg, 0); ctx.lineTo(i * seg, h); ctx.stroke();
  }
  ctx.strokeStyle = rgba([30, 22, 4], .35); ctx.lineWidth = Math.max(1, h / 96);
  ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke();
  return ctx;
}

/* ============================ T03 汉白玉（含冰裂纹） ============================ */
export const marbleOpts = { id: 'T03', w: 1024, h: 1024, tile: true, seed: 103 };
export function drawMarble(ctx, w, h, o = {}) {
  const white = o.white || [236, 233, 224], grey = o.grey || [186, 182, 172];
  paintNoise(ctx, w, h, makeFbm(o.seed || 103, 4, 5), white, grey, 4);
  // 脉络：贝塞尔曲线 + 细高光，跨边界用 wrapLines 保证平铺无缝
  const r = rng((o.seed || 103) + 7);
  const veins = o.veins || 26;
  wrapLines(ctx, w, h, (c) => {
    for (let i = 0; i < veins; i++) {
      const x0 = r() * w, y0 = r() * h;
      c.beginPath(); c.moveTo(x0, y0);
      c.bezierCurveTo(x0 + (r() - .5) * w * .5, y0 + (r() - .5) * h * .5,
        x0 + (r() - .5) * w * .8, y0 + (r() - .5) * h * .8,
        x0 + (r() - .5) * w, y0 + (r() - .5) * h);
      c.strokeStyle = rgba([150, 148, 140], .10 + r() * .16);
      c.lineWidth = Math.max(1, w / 512) * (0.5 + r() * 2.2);
      c.stroke();
    }
  });
  return ctx;
}

/* ============================ T04 栏板浮雕（云纹，主要当 bump） ============================ */
export const marbleCarveOpts = { id: 'T04', w: 512, h: 512, tile: true, seed: 104 };
export function drawMarbleCarve(ctx, w, h, o = {}) {
  ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, w, h);      // bump 中性灰底（提亮以免在材质上偏暗）
  const r = rng(o.seed || 104);
  const line = (light, dark, lw) => {
    ctx.strokeStyle = rgba([255, 255, 255], light); ctx.lineWidth = lw; ctx.stroke();
    ctx.strokeStyle = rgba([30, 30, 30], dark); ctx.lineWidth = Math.max(1, lw * .45); ctx.stroke();
  };
  // 云纹：一串圆弧 + 内卷；亮面在上、暗面在下 → 浮雕感
  for (let i = 0; i < 6; i++) {
    const cxp = (i + .5) * w / 6, cyp = h * (0.34 + r() * .3), rad = w * 0.10;
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + r();
      ctx.beginPath();
      ctx.arc(cxp + Math.cos(a) * rad * .55, cyp + Math.sin(a) * rad * .4, rad * (0.85 - k * .16), 0, Math.PI * 1.7);
      line(.34 - k * .05, .22 - k * .03, w / 42);
    }
  }
  // 边框：内外两道起线（浮雕边）
  ctx.beginPath(); ctx.rect(w * .04, h * .04, w * .92, h * .92); line(.5, .3, w / 70);
  ctx.beginPath(); ctx.rect(w * .08, h * .08, w * .84, h * .84); line(.3, .22, w / 130);
  return ctx;
}

/* ============================ T05 金砖墁地（细料方砖） ============================ */
export const goldBrickOpts = { id: 'T05', w: 1024, h: 1024, tile: true, seed: 105 };
export function drawGoldBrick(ctx, w, h, o = {}) {
  const cells = o.cells || 4;                 // 一张里 4×4 块砖（金砖约 0.6~0.7 m 见方）
  const body = o.body || [122, 116, 108], hi = o.hi || [168, 160, 148];
  paintNoise(ctx, w, h, makeFbm(o.seed || 105, 8, 5), body, hi, 7);
  const cs = w / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // 每块砖：斜向高光 + 边缘压暗，模拟「磨砖对缝」后反光不均
      const g = ctx.createLinearGradient(x * cs, y * cs, (x + 1) * cs, (y + 1) * cs);
      g.addColorStop(0, rgba(hi, .18)); g.addColorStop(.6, rgba([0, 0, 0], .05)); g.addColorStop(1, rgba([0, 0, 0], .22));
      ctx.fillStyle = g; ctx.fillRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2);
    }
  }
  ctx.strokeStyle = rgba([30, 28, 26], .55); ctx.lineWidth = Math.max(1, w / 400);
  for (let i = 0; i <= cells; i++) {          // 拼缝（对缝，故只画直线）
    ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(w, i * cs); ctx.stroke();
  }
  return ctx;
}

/* ============================ T06 院落石板 / 台基顶面 ============================ */
export const stonePavingOpts = { id: 'T06', w: 512, h: 512, tile: true, seed: 106 };
export function drawStonePaving(ctx, w, h, o = {}) {
  paintNoise(ctx, w, h, makeFbm(o.seed || 106, 6, 4), [158, 155, 148], [200, 197, 190], 6);
  const r = rng((o.seed || 106) + 3), cols = 4, rows = 4, cw = w / cols, rh = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = rgba([120, 118, 112], .06 + r() * .12);
      ctx.fillRect(x * cw + 1, y * rh + 1, cw - 2, rh - 2);   // 每块石板轻微色差
    }
  }
  ctx.strokeStyle = rgba([70, 68, 64], .5); ctx.lineWidth = Math.max(1, w / 220);
  for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke(); }
  for (let i = 0; i <= rows; i++) { ctx.beginPath(); ctx.moveTo(0, i * rh); ctx.lineTo(w, i * rh); ctx.stroke(); }
  return ctx;
}

/* ============================ T07 红墙（灰抹 + 斑驳） ============================ */
export const redWallOpts = { id: 'T07', w: 512, h: 512, tile: true, seed: 107 };
export function drawRedWall(ctx, w, h, o = {}) {
  const red = o.red || [138, 40, 30], dark = o.dark || [92, 24, 18];
  paintNoise(ctx, w, h, makeFbm(o.seed || 107, 5, 5), red, dark, 5);
  // 竖向抹痕 + 墙根返潮泛白
  const r = rng((o.seed || 107) + 11);
  for (let i = 0; i < 60; i++) {
    const x = r() * w;
    ctx.strokeStyle = rgba([255, 230, 210], .02 + r() * .05);
    ctx.lineWidth = 1 + r() * 6;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (r() - .5) * 12, h); ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, h, 0, h * 0.72);
  g.addColorStop(0, rgba([210, 196, 178], .18)); g.addColorStop(1, rgba([210, 196, 178], 0));
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.72, w, h * 0.28);
  return ctx;
}

/* ============================ T08 菱花窗（三交六椀 / 斜方格，带 alpha） ============================ */
export const latticeWindowOpts = { id: 'T08', w: 512, h: 512, tile: true, alpha: true, seed: 108 };
export function drawLatticeWindow(ctx, w, h, o = {}) {
  ctx.clearRect(0, 0, w, h);                       // 透明底：靠棂条本身的像素遮挡
  const cell = (o.cell || 4), lw = Math.max(2, w / (cell * 14));
  const wood = o.wood || [126, 36, 26], gold = o.gold || [196, 158, 66];
  ctx.lineCap = 'round';
  const step = w / cell;
  // 三交六椀：每格内画 3 组对角菱花（菱形 + 中心十字），近似棂条花纹
  for (let iy = 0; iy < cell; iy++) {
    for (let ix = 0; ix < cell; ix++) {
      const cxp = ix * step + step / 2, cyp = iy * step + step / 2, s = step * 0.46;
      ctx.strokeStyle = rgba(wood, 1); ctx.lineWidth = lw;
      ctx.beginPath();                                        // 菱形
      ctx.moveTo(cxp, cyp - s); ctx.lineTo(cxp + s, cyp); ctx.lineTo(cxp, cyp + s); ctx.lineTo(cxp - s, cyp); ctx.closePath();
      ctx.moveTo(cxp - s, cyp); ctx.lineTo(cxp + s, cyp);
      ctx.moveTo(cxp, cyp - s); ctx.lineTo(cxp, cyp + s);
      ctx.stroke();
      if (o.kind === 'diamond') {                             // 斜方格窗：只留对角棂
        ctx.beginPath();
        ctx.moveTo(ix * step, iy * step); ctx.lineTo((ix + 1) * step, (iy + 1) * step);
        ctx.moveTo((ix + 1) * step, iy * step); ctx.lineTo(ix * step, (iy + 1) * step);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(gold, .5); ctx.lineWidth = lw * .5;   // 菱花心贴金近似
      ctx.beginPath(); ctx.arc(cxp, cyp, s * .22, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.strokeStyle = rgba(wood, 1); ctx.lineWidth = lw * 2.4;   // 边框（边梃）
  ctx.strokeRect(lw, lw, w - lw * 2, h - lw * 2);
  return ctx;
}

/* ============================ T09 隔扇/门扇（门钉 + 铺首） ============================ */
export const doorLeafOpts = { id: 'T09', w: 512, h: 512, tile: false, seed: 109 };
export function drawDoorLeaf(ctx, w, h, o = {}) {
  const studs = o.studs || 9;                 // 纵横门钉路数（阳面横九纵九）
  const red = o.red || [146, 42, 30], dark = o.dark || [86, 22, 16];
  const gold = o.gold || [206, 168, 72];
  paintNoise(ctx, w, h, makeFbm(o.seed || 109, 5, 4), red, dark, 4);
  // 抹头（横向分格）：三到四道
  const rows = o.rows || 3;
  ctx.strokeStyle = rgba(dark, .8); ctx.lineWidth = Math.max(2, w / 90);
  for (let i = 1; i < rows; i++) { const y = i * h / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  // 边梃
  ctx.lineWidth = Math.max(3, w / 46);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  // 门钉：每格内 studs×studs 排列，带高光
  const padX = w * .10, padY = h * .06;
  const gw = (w - padX * 2) / rows, gh = (h - padY * 2) / rows;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < rows; gx++) {
      const x0 = padX + gx * gw, y0 = padY + gy * gh;
      for (let sy = 0; sy < studs; sy++) {
        for (let sx = 0; sx < studs; sx++) {
          const cxp = x0 + (sx + .5) * gw / studs, cyp = y0 + (sy + .5) * gh / studs;
          const rr = Math.min(gw, gh) / studs * .30;
          const g = ctx.createRadialGradient(cxp - rr * .3, cyp - rr * .3, rr * .1, cxp, cyp, rr);
          g.addColorStop(0, rgba([255, 240, 190], .95)); g.addColorStop(.6, rgba(gold, .95)); g.addColorStop(1, rgba([120, 88, 24], .95));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, rr, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  // 铺首（衔环）：中下位置一对
  for (const side of [0.32, 0.68]) {
    const cxp = w * side, cyp = h * .58, rr = w * .055;
    ctx.fillStyle = rgba([70, 66, 60], .9); ctx.beginPath(); ctx.arc(cxp, cyp, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba([190, 176, 150], .8); ctx.lineWidth = rr * .28;
    ctx.beginPath(); ctx.arc(cxp, cyp + rr * .55, rr * .62, Math.PI * .15, Math.PI * .85); ctx.stroke();
  }
  return ctx;
}

/* ============================ T10 梁枋彩画（和玺 / 旋子，长条） ============================ */
export const caihuaOpts = { id: 'T10', w: 1024, h: 128, tile: true, seed: 110 };
export function drawCaihua(ctx, w, h, o = {}) {
  const kind = o.kind || 'hexi';
  const blue = [26, 58, 104], green = [30, 96, 78], red = [140, 40, 30], gold = [206, 168, 72];
  ctx.fillStyle = rgba(blue, 1); ctx.fillRect(0, 0, w, h);
  // 上下边：檐口方向的「圭线」带
  const bands = [[0.00, 0.14, red], [0.14, 0.22, gold], [0.78, 0.86, gold], [0.86, 1.00, red]];
  for (const [a, b, c] of bands) { ctx.fillStyle = rgba(c, 1); ctx.fillRect(0, h * a, w, h * (b - a)); }
  const segs = o.segs || 8, sw = w / segs;
  const r = rng(o.seed || 110);
  for (let i = 0; i < segs; i++) {
    const x0 = i * sw, cy = h * 0.5;
    if (kind === 'xuanzi') {                  // 旋子彩画：同心圆「旋眼」成组
      for (let k = 3; k >= 1; k--) {
        ctx.beginPath(); ctx.arc(x0 + sw / 2, cy, sw * .16 * k, 0, Math.PI * 2);
        ctx.fillStyle = rgba(k % 2 ? green : blue, .95); ctx.fill();
        ctx.strokeStyle = rgba(gold, .8); ctx.lineWidth = h * .03; ctx.stroke();
      }
    } else {                                  // 和玺彩画：方心 + 找头，龙纹近似为金线云拱
      ctx.fillStyle = rgba(i % 2 ? green : blue, .95); ctx.fillRect(x0 + sw * .06, h * .24, sw * .88, h * .52);
      ctx.strokeStyle = rgba(gold, .9); ctx.lineWidth = h * .035;
      ctx.strokeRect(x0 + sw * .06, h * .24, sw * .88, h * .52);
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const cxp = x0 + sw * (.28 + k * .22), rad = sw * .10;
        ctx.moveTo(cxp + rad, cy); ctx.arc(cxp, cy, rad, 0, Math.PI * 1.4);
        ctx.moveTo(cxp - rad, cy); ctx.arc(cxp, cy, rad, Math.PI, Math.PI * 2.4);
      }
      ctx.strokeStyle = rgba(gold, .75); ctx.lineWidth = h * .028; ctx.stroke();
    }
    // 分隔「枋心」的立粉线
    ctx.fillStyle = rgba(gold, .9); ctx.fillRect(x0 - 1, h * .22, 3, h * .56);
  }
  // 做旧：叠一层细噪声（走 getImageData/putImageData，不依赖 drawImage）
  overlayNoise(ctx, w, h, makeFbm(o.seed || 110, 10, 3), 14, .18);
  return ctx;
}

/* ============================ T11 檐柱/金柱红漆（竖向纹理 + 金剁） ============================ */
export const woodColumnOpts = { id: 'T11', w: 256, h: 512, tile: true, seed: 111 };
export function drawWoodColumn(ctx, w, h, o = {}) {
  const red = o.red || [132, 38, 28], dark = o.dark || [78, 20, 14];
  paintNoise(ctx, w, h, makeFbm(o.seed || 111, 6, 4), red, dark, 3);
  // 竖向木纹：柱面是卷杀圆柱，横向做明暗近似受光
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, rgba([0, 0, 0], .42)); g.addColorStop(.34, rgba([255, 220, 190], .16));
  g.addColorStop(.62, rgba([0, 0, 0], .04)); g.addColorStop(1, rgba([0, 0, 0], .5));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const r = rng((o.seed || 111) + 5);
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    ctx.strokeStyle = rgba([60, 16, 10], .08 + r() * .1); ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (r() - .5) * 8, h); ctx.stroke();
  }
  // 柱头/柱础处的金剁与青灰带（对应额枋交接）
  for (const [y0, y1, c] of [[0.00, 0.06, [200, 168, 76]], [0.06, 0.10, [56, 92, 112]], [0.90, 0.94, [120, 118, 112]], [0.94, 1.00, [96, 94, 88]]]) {
    ctx.fillStyle = rgba(c, .9); ctx.fillRect(0, h * y0, w, h * (y1 - y0));
  }
  return ctx;
}

/* ============================ T12 藻井蟠龙（室内天花中心） ============================ */
export const cloudDragonOpts = { id: 'T12', w: 512, h: 512, tile: false, seed: 112 };
export function drawCloudDragon(ctx, w, h, o = {}) {
  const bg = [34, 74, 66], gold = [206, 168, 72], red = [140, 40, 30];
  paintNoise(ctx, w, h, makeFbm(o.seed || 112, 5, 4), bg, [18, 44, 40], 4);
  // 同心方井：层层内收，层间贴金线
  for (let k = 0; k < 5; k++) {
    const inset = w * (.03 + k * .075);
    ctx.strokeStyle = rgba(gold, .8 - k * .1); ctx.lineWidth = Math.max(2, w / 90);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.strokeStyle = rgba(k % 2 ? red : [26, 58, 104], .55); ctx.lineWidth = Math.max(1, w / 200);
    ctx.strokeRect(inset + w * .02, inset + w * .02, w - (inset + w * .02) * 2, h - (inset + w * .02) * 2);
  }
  // 蟠龙：中心一团盘旋的龙身（近似为渐粗的螺旋 + 云爪）
  const cx = w / 2, cy = h / 2;
  ctx.lineCap = 'round';
  for (let turn = 0; turn < 3; turn++) {
    ctx.beginPath();
    for (let t = 0; t <= 6.4; t += .12) {
      const rad = w * (.05 + turn * .045) * (1 + .28 * Math.sin(t * 3));
      const x = cx + Math.cos(t + turn) * rad, y = cy + Math.sin(t + turn) * rad;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(gold, .95 - turn * .18); ctx.lineWidth = w * (.032 - turn * .007); ctx.stroke();
  }
  // 龙首（近似球体 + 张口）与四爪云
  const g = ctx.createRadialGradient(cx + w * .1, cy - h * .1, w * .01, cx + w * .1, cy - h * .1, w * .1);
  g.addColorStop(0, rgba([255, 240, 200], .98)); g.addColorStop(.6, rgba(gold, .96)); g.addColorStop(1, rgba([110, 78, 20], .96));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + w * .1, cy - h * .1, w * .085, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * w * .3, cy + Math.sin(a) * h * .3, w * .05, 0, Math.PI * 1.6);
    ctx.strokeStyle = rgba(gold, .5); ctx.lineWidth = w * .014; ctx.stroke();
  }
  return ctx;
}

/* ============================ T13 匾额（系统字体，无字体文件） ============================ */
export const plaqueOpts = { id: 'T13', w: 512, h: 160, tile: false, dynamic: true, seed: 113 };
export function drawPlaque(ctx, w, h, o = {}) {
  const text = o.text || '太和殿';
  const bg = o.bg || [40, 28, 20], gold = o.gold || [226, 190, 96];
  paintNoise(ctx, w, h, makeFbm(o.seed || 113, 5, 4), bg, [18, 12, 8], 4);
  // 边框贴金 + 内圈细线
  ctx.strokeStyle = rgba(gold, .95); ctx.lineWidth = Math.max(3, w / 60);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.strokeStyle = rgba(gold, .45); ctx.lineWidth = Math.max(1, w / 240);
  ctx.strokeRect(w * .045, h * .10, w * .91, h * .8);
  // 汉字：系统字体（iOS/Android/Windows 均有中文字体）；缺字回退由调用方兜底
  const n = Math.max(1, [...text].length);
  ctx.font = '700 ' + Math.floor(h * (n <= 2 ? .58 : .42)) + 'px "Songti SC","STSong","SimSun","Noto Serif CJK SC",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const chars = [...text];
  if (o.vertical) {                                  // 竖匾（内廷若干殿）
    const step = h * .84 / n;
    chars.forEach((ch, i) => {
      ctx.fillStyle = rgba([0, 0, 0], .5); ctx.fillText(ch, w / 2 + 3, h * .16 + step * (i + .5) + 3);
      ctx.fillStyle = rgba(gold, 1); ctx.fillText(ch, w / 2, h * .16 + step * (i + .5));
    });
  } else {
    const step = w * .84 / n;
    chars.forEach((ch, i) => {
      const x = w * .08 + step * (i + .5);
      ctx.fillStyle = rgba([0, 0, 0], .5); ctx.fillText(ch, x + 3, h / 2 + 3);
      ctx.fillStyle = rgba(gold, 1); ctx.fillText(ch, x, h / 2);
    });
  }
  return ctx;
}

/* ============================ T14 青铜氧化（铜鹤/鼎/日晷） ============================ */
export const bronzeVesselOpts = { id: 'T14', w: 256, h: 256, tile: true, seed: 114 };
export function drawBronzeVessel(ctx, w, h, o = {}) {
  paintNoise(ctx, w, h, makeFbm(o.seed || 114, 6, 5), [78, 96, 88], [36, 52, 48], 7);
  const r = rng((o.seed || 114) + 9);
  for (let i = 0; i < 40; i++) {          // 铜绿斑点
    const x = r() * w, y = r() * h, rr = w * (.01 + r() * .05);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rgba([96, 172, 148], .55)); g.addColorStop(1, rgba([96, 172, 148], 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
  }
  return ctx;
}

/* ============================ T15 院内散水（卵石/碎石） ============================ */
export const gravelOpts = { id: 'T15', w: 256, h: 256, tile: true, seed: 115 };
export function drawGravel(ctx, w, h, o = {}) {
  paintNoise(ctx, w, h, makeFbm(o.seed || 115, 8, 4), [170, 162, 146], [126, 120, 108], 9);
  const r = rng((o.seed || 115) + 13);
  for (let i = 0; i < 260; i++) {         // 卵石：小椭圆 + 上亮下暗
    const x = r() * w, y = r() * h, rx = w * (.008 + r() * .02), ry = rx * (.6 + r() * .5);
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * Math.PI);
    ctx.fillStyle = rgba([210, 204, 190], .35 + r() * .3);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba([70, 66, 60], .28); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  return ctx;
}

/* ============================ T16 水面法线（金水河/筒子河） ============================ */
export const waterNormalOpts = { id: 'T16', w: 256, h: 256, tile: true, seed: 116 };
export function drawWaterNormal(ctx, w, h, o = {}) {
  // 由高度场求法线：sin + fbm 叠加，平铺周期取整保证无缝。
  // 幅度刻意压低（0.35）：金水河是静水，波纹只作细微高光扰动；strength 大则水面看图像塑料。
  const size = w;
  const fbm = makeFbm(o.seed || 116, 8, 4);
  const freq = o.ripple || 3;
  const height = (x, y) => {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    return Math.sin(u * freq + fbm(x / size * 6, y / size * 6) * 3.2) * .5
      + Math.sin(v * (freq + 1) + fbm(x / size * 9 + 4, y / size * 9) * 3.0) * .35
      + fbm(x / size * 12, y / size * 12) * .3;
  };
  const img = ctx.createImageData(size, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = height(x + 1, y) - height(x - 1, y), dy = height(x, y + 1) - height(x, y - 1);
      let nx = -dx * 0.35, ny = -dy * 0.35, nz = 1;
      const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
      const i = (y * size + x) * 4;
      d[i] = (nx * .5 + .5) * 255; d[i + 1] = (ny * .5 + .5) * 255; d[i + 2] = (nz * .5 + .5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

/* ============================ T17 天穹渐变（替代 Sky.js） ============================ */
export const skyGradientOpts = { id: 'T17', w: 512, h: 512, tile: false, seed: 117 };
export function drawSkyGradient(ctx, w, h, o = {}) {
  const top = o.top || [96, 140, 190], horizon = o.horizon || [214, 208, 190], bottom = o.bottom || [176, 170, 156];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top, 1)); g.addColorStop(.52, rgba(horizon, 1)); g.addColorStop(1, rgba(bottom, 1));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const fbm = makeFbm(o.seed || 117, 6, 4);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const band = Math.max(0, 1 - Math.abs(y / h - .46) * 9);       // 地平线附近的薄云带
      const n = fbm(x / w * 8, y / h * 3);
      const a = band * (n - .35) * .5;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      d[i] += (250 - d[i]) * a; d[i + 1] += (248 - d[i + 1]) * a; d[i + 2] += (244 - d[i + 2]) * a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

/* ============================ T18 踏道石 / 土山 ============================ */
export const stoneRampOpts = { id: 'T18', w: 256, h: 256, tile: true, seed: 118 };
export function drawStoneRamp(ctx, w, h, o = {}) {
  if (o.kind === 'dirt') {                 // 景山/堆秀山的土与苔
    paintNoise(ctx, w, h, makeFbm(o.seed || 118, 6, 5), [96, 104, 62], [58, 66, 40], 6);
    const r = rng((o.seed || 118) + 3);
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = rgba([150, 156, 96], .1 + r() * .2); ctx.lineWidth = 1 + r() * 2;
      const x = r() * w, y = r() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - .5) * 10, y - 4 - r() * 8); ctx.stroke();
    }
    return ctx;
  }
  paintNoise(ctx, w, h, makeFbm(o.seed || 118, 6, 4), [176, 172, 164], [130, 126, 118], 5);
  const rows = o.rows || 6, rh = h / rows;   // 踏道：横向条石，逐条微色差
  const r = rng((o.seed || 118) + 7);
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = rgba([110, 106, 100], .05 + r() * .12); ctx.fillRect(0, i * rh, w, rh - 1);
    ctx.strokeStyle = rgba([70, 68, 64], .5); ctx.lineWidth = Math.max(1, h / 200);
    ctx.beginPath(); ctx.moveTo(0, i * rh); ctx.lineTo(w, i * rh); ctx.stroke();
    const joints = 3 + (i % 2);              // 错缝
    for (let j = 1; j < joints; j++) {
      const x = (j + (i % 2 ? .5 : 0)) * w / joints;
      ctx.beginPath(); ctx.moveTo(x, i * rh); ctx.lineTo(x, (i + 1) * rh); ctx.stroke();
    }
  }
  return ctx;
}

/* ============================ 工厂表（预算与冒烟测试的单一来源） ============================ */
export const TEXTURES = [
  { ...roofTilesOpts, name: 'roofTiles', draw: drawRoofTiles },
  { ...ridgeTileOpts, name: 'ridgeTile', draw: drawRidgeTile },
  { ...marbleOpts, name: 'marble', draw: drawMarble },
  { ...marbleCarveOpts, name: 'marbleCarve', draw: drawMarbleCarve },
  { ...goldBrickOpts, name: 'goldBrick', draw: drawGoldBrick },
  { ...stonePavingOpts, name: 'stonePaving', draw: drawStonePaving },
  { ...redWallOpts, name: 'redWall', draw: drawRedWall },
  { ...latticeWindowOpts, name: 'latticeWindow', draw: drawLatticeWindow },
  { ...doorLeafOpts, name: 'doorLeaf', draw: drawDoorLeaf },
  { ...caihuaOpts, name: 'caihua', draw: drawCaihua },
  { ...woodColumnOpts, name: 'woodColumn', draw: drawWoodColumn },
  { ...cloudDragonOpts, name: 'cloudDragon', draw: drawCloudDragon },
  { ...plaqueOpts, name: 'plaque', draw: drawPlaque },
  { ...bronzeVesselOpts, name: 'bronzeVessel', draw: drawBronzeVessel },
  { ...gravelOpts, name: 'gravel', draw: drawGravel },
  { ...waterNormalOpts, name: 'waterNormal', draw: drawWaterNormal },
  { ...skyGradientOpts, name: 'skyGradient', draw: drawSkyGradient },
  { ...stoneRampOpts, name: 'stoneRamp', draw: drawStoneRamp },
];

/** 显存估算（字节）：w×h×4B，含 mipmap 约 ×1.33；平铺贴图只算一份。 */
export function estimateTextureBytes(entry) {
  return Math.round(entry.w * entry.h * 4 * 1.33);
}

/** 预算自检：返回 {total, entries, over:[超单张上限的 id]}，供冒烟测试断言。 */
export function textureBudgetReport() {
  let total = 0; const over = [];
  for (const e of TEXTURES) {
    const b = estimateTextureBytes(e);
    total += b;
    if (Math.max(e.w, e.h) > TEX_BUDGET.maxSide) over.push(e.id + ' ' + e.w + '×' + e.h);
  }
  return { total, mb: +(total / 1048576).toFixed(2), count: TEXTURES.length, over, limitMB: TEX_BUDGET.totalMB };
}

/* ============================ three.js 装配（只在浏览器调用） ============================ */

/** 把工厂输出包成 THREE.CanvasTexture，并按 r128 口径设色彩/各向异性/平铺。 */
export function makeTexture(THREE, entry, opts = {}, o = {}) {
  const provider = o.provider || domProvider();
  const { canvas, ctx } = provider.create(entry.w, entry.h);
  entry.draw(ctx, entry.w, entry.h, opts);
  const tex = new THREE.CanvasTexture(canvas);
  // r128：albedo 走 sRGB；bump/roughness/normal 这类数据图保持默认 LinearEncoding（靠 opts.data=true 区分）
  if (opts.data !== true && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = tex.wrapT = entry.tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (entry.alpha) tex.transparent = true;
  const aniso = Math.min(TEX.maxAnisotropy, o.maxAnisotropy || 1);
  tex.anisotropy = aniso;                       // r128 CanvasTexture 继承 Texture，必有该字段；不写 in 探测（假 THREE 也要能测）
  tex.needsUpdate = true;
  provider.finish(canvas);
  return tex;
}

/** 一次性生成全部常用材质贴图（阶段 3 起按需在 buildings.js 里取用）。 */
export function buildTextureKit(THREE, o = {}) {
  const kit = {};
  for (const e of TEXTURES) kit[e.name] = () => makeTexture(THREE, e, {}, o);
  kit.plaqueFor = (text, vertical) => makeTexture(THREE, TEXTURES.find((t) => t.name === 'plaque'), { text, vertical }, o);
  kit.report = textureBudgetReport();
  return kit;
}
