/* 3D 故宫游览 · 贴图打样（contact sheet）
 * 用法：node examples/forbidden-city/tools/preview-textures.mjs     （需先 node server.js）
 *      输出 examples/forbidden-city/tools/out/textures.png —— 肉眼复核材质是否可用，不入库。
 * 做法：浏览器里把 TEXTURES 表逐张画到 canvas，拼成一张带标签的总览图后截图。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = path.join(HERE, 'out');
const OUT = process.argv[2] || path.join(OUTDIR, 'textures.png');
const BROWSERS = [process.env.CHROME, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) { console.error('未找到 Chrome/Edge（用 CHROME=… 指定）'); process.exit(2); }

mkdirSync(OUTDIR, { recursive: true });
writeFileSync(path.join(OUTDIR, 'preview.html'), `<!doctype html><meta charset="utf-8"><title>textures</title>
<style>html,body{margin:0;background:#14161a}canvas#sheet{display:block}</style>
<script type="module">
import { TEXTURES } from '/examples/forbidden-city/js/textures.js';
const COLS = 6, ROWS = 3, CW = 256, CH = 256, LABEL = 30;
const sheet = document.createElement('canvas');
sheet.id = 'sheet'; sheet.width = COLS * CW; sheet.height = ROWS * (CH + LABEL);
document.body.appendChild(sheet);
const sctx = sheet.getContext('2d');
sctx.fillStyle = '#14161a'; sctx.fillRect(0, 0, sheet.width, sheet.height);

await Promise.all(TEXTURES.map(async (e) => {
  const c = document.createElement('canvas'); c.width = e.w; c.height = e.h;
  e.draw(c.getContext('2d'), e.w, e.h, {});
  const i = TEXTURES.indexOf(e), col = i % COLS, row = (i / COLS) | 0;
  const x = col * CW, y = row * (CH + LABEL);
  // 标签条
  sctx.fillStyle = '#1d2025'; sctx.fillRect(x, y, CW, LABEL);
  sctx.fillStyle = '#e8c877'; sctx.font = 'bold 16px system-ui'; sctx.fillText(e.id, x + 8, y + 20);
  sctx.fillStyle = '#cfd8de'; sctx.font = '14px system-ui';
  sctx.fillText(e.name + ' ' + e.w + '×' + e.h + (e.tile ? ' · tile' : ''), x + 52, y + 20);
  // 平铺预览：2×2 重复，能直接看出接缝
  const prev = document.createElement('canvas'); prev.width = CW; prev.height = CH;
  const p = prev.getContext('2d');
  if (e.tile) { for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) p.drawImage(c, ox * CW / 2, oy * CH / 2, CW / 2, CH / 2); }
  else p.drawImage(c, 0, 0, CW, CH);
  sctx.drawImage(prev, x, y + LABEL);
}));
window.__done = true;
</script>`);

const okShot = await new Promise((resolve) => {
  const p = spawn(browser, ['--headless=new', '--screenshot=' + OUT, '--window-size=1560,900',
    '--virtual-time-budget=9000', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
    '--user-data-dir=' + path.join(OUTDIR, 'u'),
    'http://localhost:39977/examples/forbidden-city/tools/out/preview.html'], { stdio: 'inherit' });
  p.on('exit', () => resolve(existsSync(OUT)));
});
console.log(okShot ? '打样图：' + OUT : '截图失败——请确认已 node server.js（端口 39977）');
process.exit(okShot ? 0 : 1);
