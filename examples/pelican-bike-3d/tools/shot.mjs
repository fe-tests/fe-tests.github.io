// 视觉复核探针：CDP 起 headless Chrome（swiftshader）→ 用 ?shot=1 的 window.__pbike 钩子瞬移机位 → 截图到 tools/out/shots/
// 用法：
//   node server.js                                  # 先起服务（端口 39977）
//   node examples/pelican-bike-3d/tools/shot.mjs    # 默认三张：跟拍 / 环绕 / 海边低机位（+ 夜景）
//   node examples/pelican-bike-3d/tools/shot.mjs follow orbit seaside   # 只截指定机位（RIGS.id）
// 说明：软渲染 ~1 fps，机位缓动是 dt 驱动 → 全部走 __pbike.snapRig(id) 瞬移落位（forbidden-city D34 口径）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PB_SHOT_PORT || 39981);
// ?tier=low 让 swiftshader 首屏就轻（DPR1 / 无阴影 / 低细分），?cycle=0 冻结昼夜便于复现
const URL_TARGET = process.env.PB_SHOT_URL || 'http://localhost:39977/examples/pelican-bike-3d/?shot=1&tier=' + (process.env.PB_QUALITY || 'low') + '&cycle=0&time=0.44';
const OUTDIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'shots');
const CHROME = process.env.PB_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const QUALITY = process.env.PB_QUALITY || 'low';

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--user-data-dir=' + path.join(os.tmpdir(), 'dsh-pb-chrome-' + PORT), URL_TARGET,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForTarget(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.find((x) => x.type === 'page' && /pelican-bike-3d/.test(x.url));
      if (p) return p;
    } catch (e) { /* 浏览器还没起 */ }
    await sleep(300);
  }
  return null;
}

let ws, idSeq = 0;
const pending = new Map();
function send(method, params, timeoutMs) {
  return new Promise((res, rej) => {
    const id = ++idSeq;
    const t = setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); rej(new Error('CDP 超时（' + method + '，' + (timeoutMs || 30000) + ' ms）')); }
    }, timeoutMs || 30000);
    pending.set(id, {
      res: (v) => { clearTimeout(t); res(v); },
      rej: (e) => { clearTimeout(t); rej(e); },
    });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
const ev = (expression) => send('Runtime.evaluate', { expression, returnByValue: true });
const evalVal = async (expression) => (await ev(expression)).result.value;

const args = process.argv.slice(2).filter(Boolean);
const RIGS = args.length ? args : ['follow', 'side', 'orbit', 'seaside', 'lowwheel', 'night'];

fs.mkdirSync(OUTDIR, { recursive: true });
for (const f of fs.readdirSync(OUTDIR)) if (/\.png$/i.test(f)) fs.rmSync(path.join(OUTDIR, f));   // 清旧图，免误判

const target = await waitForTarget(30000);
if (!target) {
  console.error('✗ CDP 目标没起来（Chrome 路径？服务起了吗？CHROME=' + CHROME + '）');
  chrome.kill();
  process.exit(1);
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
// 单一消息分发器：响应 + 控制台捕获都在这一个 onmessage 里。
// 注意：Node 的 WebSocket 用「属性赋值」挂 onmessage 是**替换**语义，第二次赋值会顶掉第一次的分发器，
// 之后所有 send() 的 Promise 永不 settle（探针表现为卡住无输出）。见 devlog「踩坑」条目。
const consoleErrors = [];
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id);
    pending.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    return;
  }
  if (x.method === 'Runtime.exceptionThrown') consoleErrors.push('EX: ' + JSON.stringify(x.params.exceptionDetails).slice(0, 400));
  if (x.method === 'Runtime.consoleAPICalled' && (x.params.type === 'error' || x.params.type === 'warning')) {
    consoleErrors.push(x.params.type + ': ' + (x.params.args || []).map((a) => a.value || a.description).join(' ').slice(0, 300));
  }
};
ws.onerror = (e) => console.error('· WS 错误 ' + (e && e.message));

await send('Runtime.enable');
await send('Page.enable');

/* 进度写文件（Out-File 会缓冲，边跑边看 run.log 更可靠） */
fs.mkdirSync(OUTDIR, { recursive: true });
const LOGF = path.join(OUTDIR, '..', 'run.log');
fs.writeFileSync(LOGF, '');
const say = (s) => { fs.appendFileSync(LOGF, s + '\n'); console.log(s); };
const evSafe = async (expr, ms) => {
  try { return await send('Runtime.evaluate', { expression: expr, returnByValue: true }, ms || 20000); }
  catch (e) { say('· eval 失败：' + e.message); return null; }
};
const valSafe = async (expr) => { const r = await evSafe(expr); return r && r.result ? r.result.value : null; };

// 关缓存并重载：探针必吃**最新**代码，否则 Chrome 会复用上一轮的 ES module 缓存（表现为「修了没生效」）
try {
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.reload', { ignoreCache: true });
  say('· 已关缓存并重载页面');
} catch (e) {
  say('· 关缓存失败（继续用缓存）：' + e.message);
}

// 等首屏就绪：__pbike 挂上 + 已渲染出统计
let ready = false, bailed = null;
for (let i = 0; i < 75 && !ready && !bailed; i++) {
  await sleep(1000);
  try {
    ready = await evalVal('(() => { const f = document.getElementById("fallback"); if (f && f.classList.contains("show")) return "FALLBACK::" + f.textContent.slice(0,700); return !!(window.__pbike && document.getElementById("dbg-fps")); })()');
    if (typeof ready === 'string' && ready.startsWith('FALLBACK::')) { bailed = ready.slice(10); break; }
  } catch (e) {
    say('· 探测轮次 ' + (i + 1) + 's：' + e.message);
  }
  if (i % 10 === 0) say('… 等待就绪 ' + (i + 1) + 's（ready=' + ready + '）');
  // 模块解析失败（SyntaxError）时页面根本不会跑起来：直接 bail，别空转 75 秒
  const se = consoleErrors.find((e) => /SyntaxError|ReferenceError|is not defined/.test(e));
  if (se) { bailed = '控制台异常：' + String(se).slice(0, 400); break; }
}
if (bailed) {
  say('✗ 页面落进回退面板：\n' + bailed);
  consoleErrors.slice(0, 10).forEach((e) => say('  ' + e));
  chrome.kill();
  process.exit(1);
}
if (!ready) {
  say('✗ 页面没起来（75 s 内 __pbike 未就绪）');
  try {
    const txt = await evalVal('(() => { const f = document.getElementById("fallback"); return f && f.classList.contains("show") ? f.textContent.slice(0,600) : "(no fallback)"; })()');
    say('  fallback: ' + txt);
  } catch (e) { say('  读 fallback 也超时：' + e.message); }
  consoleErrors.slice(0, 10).forEach((e) => say('  ' + e));
  chrome.kill();
  process.exit(1);
}
await evSafe('__pbike.rig.tour.auto = false; __pbike.jump(240);');
await sleep(4000);
say('· 就绪 ' + JSON.stringify(await valSafe('JSON.stringify(__pbike.info())')));

// 快速体检模式：只看统计与骨骼装配，不截图（PB_INFO_ONLY=1）
if (process.env.PB_INFO_ONLY === '1') {
  say('· 体检 ' + JSON.stringify(await valSafe('JSON.stringify(__pbike.info())')));
  const xys = (process.env.PB_PICKS || '0.22,0.22;0.55,0.12;0.8,0.3')
    .split(';').map((s) => s.split(',').map((v) => Number(v.trim()))).filter((a) => a.length === 2 && a.every(Number.isFinite));
  for (const xy of xys) {
    say('· 拾取 ' + xy + ' ' + JSON.stringify(await valSafe('JSON.stringify(__pbike.pick(' + xy[0] + ',' + xy[1] + '))')));
  }
  chrome.kill();
  process.exit(0);
}

async function shot(name) {
  const t0 = Date.now();
  const s = await send('Page.captureScreenshot', { format: 'png' }, 90000);
  const file = path.join(OUTDIR, name.replace(/\s+/g, '') + '.png');
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  let info = '(info 超时)';
  try { info = await valSafe('JSON.stringify(__pbike.info())'); } catch (e) { /* 软渲染慢，忽略 */ }
  say('✓ ' + file + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's  ' + info);
}
async function key(ch, code) {
  const base = { key: ch, code, windowsVirtualKeyCode: code.charCodeAt(0), nativeVirtualKeyCode: code.charCodeAt(0) };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function drag(dx, dy) {
  const start = { x: 640, y: 360 }, steps = 10;
  const me = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, buttons, button: 'left', clickCount: 0, deltaX: 0, deltaY: 0 });
  await me('mousePressed', start.x, start.y, 1);
  for (let i = 1; i <= steps; i++) {
    await me('mouseMoved', start.x + Math.round(dx * i / steps), start.y + Math.round(dy * i / steps), 1);
    await sleep(120);
  }
  await me('mouseReleased', start.x + dx, start.y + dy, 0);
}

/* ---------- 第一帧：进页面的默认样子（自动巡游起步 = 跟拍） ---------- */
await evSafe('__pbike.setTime(0.44, false);');
await sleep(3000);
await shot('00-entry');

/* ---------- 各机位 ---------- */
const TIME_BY_RIG = { follow: 0.30, side: 0.46, orbit: 0.42, seaside: 0.79, lowwheel: 0.52, cliff: 0.36, crane: 0.28, night: 0.965 };
for (const rig of RIGS) {
  const t = TIME_BY_RIG[rig] === undefined ? 0.44 : TIME_BY_RIG[rig];
  if (rig === 'night') {
    // 夜间样片走跟拍机位：海边低机位在夜里会贴到路面灯罩下方，路灯光晕会糊满天空（见 devlog）
    await evSafe('__pbike.setTime(0.965, false); __pbike.snapRig("follow");');
    say('· 天空拾取 ' + JSON.stringify(await valSafe('JSON.stringify(__pbike.pick(0.22, 0.22))')));
    say('· 天空拾取2 ' + JSON.stringify(await valSafe('JSON.stringify(__pbike.pick(0.55, 0.12))')));
  } else {
    await evSafe('__pbike.setTime(' + t + ', false); __pbike.snapRig("' + rig + '");');
  }
  await sleep(6000);                       // 软渲染下等地形/道具块回收 + 灯亮
  await shot(rig + '-t' + String(t).replace('.', ''));
}

/* ---------- 鼠标操作复核：拖 90° 方位 + 滚轮拉近 ---------- */
await evSafe('__pbike.setTime(0.46, false); __pbike.snapRig("follow");');
await sleep(4000);
await drag(320, -60);
await sleep(4000);
await shot('drag-yaw90');
say('· 拖拽后镜头距离 ' + await valSafe('(() => { const c = __pbike.rig.camera; return Math.round(__pbike.rider.group.position.distanceTo(c.position) * 10) / 10; })()') + ' m');

/* ---------- 预算与告警 ---------- */
say('· 统计 ' + await valSafe('(() => { const i = __pbike.renderer.info.render; return JSON.stringify({ calls: i.calls, tris: i.triangles, tier: __pbike.quality.tier, rig: __pbike.rig.currentId() }); })()'));
if (consoleErrors.length) {
  say('· 控制台告警/异常 ' + consoleErrors.length + ' 条：');
  consoleErrors.slice(0, 10).forEach((e) => say('   ' + e));
} else {
  say('· 控制台无 error/warning');
}
say('· 完成');
fs.appendFileSync(LOGF, '· DONE\n');
chrome.kill();
process.exit(0);
