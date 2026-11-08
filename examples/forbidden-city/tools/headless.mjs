/* 3D 故宫游览 · headless 冒烟（真浏览器，不依赖 npm 包）
 * 用法（站点根目录）：
 *   node examples/forbidden-city/tools/headless.mjs [--url=http://localhost:39977/examples/forbidden-city/]
 * 前置：另开一个终端 `node server.js`（端口 39977）。
 * 做法：用本机 Chrome/Edge 的 --headless=new + CDP，抓 console 报错、WebGL 状态、渲染统计。
 *      零 npm 依赖：CDP 走原生 WebSocket（Node 22+ 内置 globalThis.WebSocket）。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browser = CANDIDATES.find((p) => existsSync(p));

const URL_TARGET = (process.argv.find((a) => a.startsWith('--url=')) || '').split('=')[1]
  || 'http://localhost:39977/examples/forbidden-city/';
const PORT = 9223 + Math.floor(Math.random() * 40);

if (!browser) {
  console.error('未找到 Chrome / Edge —— 用 CHROME=<路径> 指定，或跳过本脚本（smoke.mjs 已覆盖纯逻辑）');
  process.exit(2);
}
if (typeof WebSocket !== 'function') {
  console.error('需要 Node 22+（内置 WebSocket）；当前 Node ' + process.version);
  process.exit(2);
}

console.log('headless 冒烟：' + browser);
console.log('目标：' + URL_TARGET);

const chrome = spawn(browser, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=swiftshader',                 // 无 GPU 环境也要能出 WebGL
  '--enable-unsafe-swiftshader',
  '--window-size=1280,720',
  '--user-data-dir=' + process.env.TEMP + '\\dsh-fc-chrome-' + PORT,
  URL_TARGET,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /forbidden-city/.test(t.url));
      if (page) return page;
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(300);
  }
  return null;
}

let ws, idSeq = 0;
const pending = new Map();
const logs = [];

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++idSeq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

const target = await waitForTarget(25000);
if (!target) {
  console.error('✗ CDP 目标没起来（页面是否 404？server.js 是否在跑？）');
  chrome.kill();
  process.exit(1);
}

ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const t = msg.params.type;
    if (t === 'error' || t === 'warning') logs.push(t + ': ' + (msg.params.args || []).map(fmt).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push('exception: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
  }
};

function fmt(a) {
  if (!a) return '';
  if (a.type === 'string') return a.value;
  if (a.value !== undefined) return JSON.stringify(a.value);
  return a.description || a.type;
}

await send('Runtime.enable');
await send('Page.enable');
await sleep(6000);   // 等首帧 + 资源加载

const probe = await send('Runtime.evaluate', {
  expression: `(function () {
    var r = { three: (typeof THREE !== 'undefined') ? THREE.REVISION : null, fallback: false, canvas: !!document.getElementById('gl'), calls: null };
    var fb = document.getElementById('fallback');
    r.fallback = !!(fb && fb.classList.contains('on'));
    var loading = document.getElementById('loading');
    r.loadingGone = !!(loading && loading.classList.contains('gone'));
    var dbg = document.getElementById('dbg-fps');
    r.dbgText = dbg ? dbg.textContent : null;
    // 真实渲染统计：drawCalls / tris（renderer.info）——canvas.getContext() 第二次调用会返回 null，故不这样探测 WebGL
    var calls = document.getElementById('dbg-calls'), tris = document.getElementById('dbg-tris');
    r.callsText = calls ? calls.textContent : null;
    r.trisText = tris ? tris.textContent : null;
    return JSON.stringify(r);
  })()`,
  returnByValue: true,
});

let info = {};
try { info = JSON.parse(probe.result.value); } catch (e) {}

chrome.kill();
await sleep(300);

console.log('\n页面探针：', JSON.stringify(info, null, 2));
if (logs.length) { console.log('\n控制台（error/warning）:'); logs.slice(0, 20).forEach((l) => console.log('  · ' + l)); }

let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ✓ ' + name + (extra ? ' — ' + extra : ''));
  else { fail++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};

console.log('');
ok('THREE 已加载（r128）', info.three === '128', 'REVISION=' + info.three);
ok('降级面板未出现（依赖与 WebGL 都到位）', info.fallback === false);
ok('canvas 已挂到 DOM', info.canvas === true);
ok('加载条已收起（首帧渲染完成）', info.loadingGone === true);
ok('HUD 读数在更新（主循环在跑）', /\d+\s+fps/.test(info.dbgText || ''), info.dbgText || '');
ok('真在提交绘制（renderer.info.calls > 0）', /draw [1-9]/.test(info.callsText || ''), info.callsText + ' / ' + info.trisText);
ok('无未捕获异常', logs.filter((l) => /^exception/.test(l)).length === 0, logs.filter((l) => /^exception/.test(l))[0] || '');

console.log(fail ? '\nheadless 失败 ' + fail + ' 项' : '\nheadless 全部通过');
process.exit(fail ? 1 : 0);
