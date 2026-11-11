// 视觉复核探针：CDP 起 headless Chrome → 进指定视角档 → 截图到 tools/out/shots/（不入库）
// 用法：
//   node server.js                       # 先起服务（端口 39977）
//   node examples/forbidden-city/tools/shot.mjs                # 默认：俯瞰「午门」+ 俯瞰「太和殿」+ 漫步起点
//   node examples/forbidden-city/tools/shot.mjs 午门 太和殿     # 只截指定取景档
// 说明：机位主要靠**按键驱动**（3 = 俯瞰、1 = 漫步，俯瞰下 `[` / `]` 沿中轴跳档取景，见 main.js 的 FOCUS_STEPS）；
//   阶段 6 的飞行入殿走 `?shot=1` 的 window.__fcity 钩子**瞬移落位**（软渲染 ~1 fps，数按键必漂移，见 D34）。
//   图落 tools/out/shots/（已在 .gitignore），每次跑前清旧图以免误判「修复无效」（D19）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.FC_SHOT_PORT || 39979);
const URL_TARGET = process.env.FC_SHOT_URL || 'http://localhost:39977/examples/forbidden-city/?shot=1';
const OUTDIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'shots');
const CHROME = process.env.FC_CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 俯瞰档默认取景在「保和殿」（FOCUS_STEPS 中段），按 `]` 往午门方向逐级退
const FOCUS_STEPS = ['午门', '太和门', '太和殿', '中和殿', '保和殿', '乾清宫', '坤宁宫', '御花园', '神武门'];
const FOCUS_DEFAULT = 4;

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--user-data-dir=' + path.join(os.tmpdir(), 'dsh-fc-chrome-' + PORT), URL_TARGET,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForTarget(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = list.find((x) => x.type === 'page' && /forbidden-city/.test(x.url));
      if (p) return p;
    } catch (e) { /* 浏览器还没起 */ }
    await sleep(300);
  }
  return null;
}

let ws, idSeq = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res, rej) => {
    const id = ++idSeq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

const args = process.argv.slice(2).filter(Boolean);
const views = args.length ? args : ['午门', '太和殿'];

fs.mkdirSync(OUTDIR, { recursive: true });
for (const f of fs.readdirSync(OUTDIR)) if (/\.png$/i.test(f)) fs.rmSync(path.join(OUTDIR, f));   // 见 D19

const target = await waitForTarget(25000);
if (!target) {
  console.error('✗ CDP 目标没起来（Chrome 路径？服务起了吗？CHROME=' + CHROME + '）');
  chrome.kill();
  process.exit(1);
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  }
};

const hud = async () => (await send('Runtime.evaluate', {
  expression: `(() => { const g = (id) => { const e = document.getElementById(id); return e ? e.textContent : null; };
    return JSON.stringify({ calls: g('dbg-calls'), tris: g('dbg-tris'), fps: g('dbg-fps') }); })()`,
  returnByValue: true, })).result.value;

async function key(ch, code) {
  const base = { key: ch, code, windowsVirtualKeyCode: code.charCodeAt(0), nativeVirtualKeyCode: code.charCodeAt(0) };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUTDIR, name.replace(/\s+/g, '') + '.png');
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  console.log('✓ ' + file + '  ' + await hud());
}
/** 拖拽 = 俯瞰 orbit（input.js 吃 mousedown/mousemove/…）：dx 转方位角，dy 调俯角。 */
async function drag(dx, dy) {
  const start = { x: 640, y: 330 }, steps = 12;
  const ev = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, buttons, button: 'left', clickCount: type === 'mouseReleased' ? 1 : 0, deltaX: 0, deltaY: 0 });
  await ev('mousePressed', start.x, start.y, 1);
  for (let i = 1; i <= steps; i++) {
    await ev('mouseMoved', start.x + Math.round(dx * i / steps), start.y + Math.round(dy * i / steps), 1);
    await sleep(40);
  }
  await ev('mouseReleased', start.x + dx, start.y + dy, 0);
}

await send('Runtime.enable');
await sleep(7000);                       // 首帧 + 材质工厂生成
console.log('就绪 ' + await hud());

// 首屏：默认档 = 漫步，机位 = config.CAM_START（午门以南 ~90 m 朝北）→ 午门城台应在画面里。
// 截图必须在任何按键之前拍，才算「进页面第一帧看到的东西」。
await shot('walk-entry');

await key('3', 'Digit3');                // 进俯瞰（雾距随档位联动，见 D23）
await sleep(800);
for (const name of views) {
  const idx = FOCUS_STEPS.indexOf(name);
  if (idx < 0) { console.log('· 跳过未知取景档「' + name + '」（可选：' + FOCUS_STEPS.join(' / ') + '）'); continue; }
  const steps = FOCUS_DEFAULT - idx;
  for (let i = 0; i < Math.abs(steps); i++) { await key(steps > 0 ? '[' : ']', steps > 0 ? 'BracketLeft' : 'BracketRight'); await sleep(420); }
  await sleep(2400);                     // 让缓动/剔除稳定
  await shot('overview-' + name);
}

// 浅俯角复核：俯瞰默认俯角 -1.24（≈71°）只看得到屋顶。往下拖 600 px → 俯角夹到 pitchMax -0.62
// （≈35°），这时候**必须**看见殿身的红墙/柱网/台基立面——只看得到屋顶 = 形制没建模（缺陷）。
for (const name of views) {
  const idx = FOCUS_STEPS.indexOf(name);
  if (idx < 0 || !['太和殿', '午门'].includes(name)) continue;
  const steps = FOCUS_DEFAULT - idx;
  for (let i = 0; i < Math.abs(steps); i++) { await key(steps > 0 ? '[' : ']', steps > 0 ? 'BracketLeft' : 'BracketRight'); await sleep(420); }
  await sleep(1600);
  await drag(0, 600);
  await sleep(1200);
  await shot('overview-浅俯角-' + name);
}

await key('1', 'Digit1');                // 回漫步（起点在午门以南）
await sleep(2600);
await shot('walk-start');

// ── 阶段 6：飞行入殿（门开 + 入内 + 成就 toast 的图像门，碰撞要等阶段 8，飞行穿模是有意的）──
// 机位走 `?shot=1` → window.__fcity 钩子**瞬移落位**：软渲染 ~1 fps 下「按住 W 数按键帧」必漂移（D34）。
const ev = (expression) => send('Runtime.evaluate', { expression });
await key('2', 'Digit2');                 // 飞行档（pose.y 不会被 walk 的地面钳制拉回 1.65）
await sleep(10000);                       // ⚠️ 模式切换自带 0.35 s 缓动 = dt 帧驱动：@1 fps 约 7 s 才结束，
                                          // 过渡期间 rig.update 每帧写 pose，瞬移必须等它落位（D34）
await ev('__fcity.rig.pose.z = -124; __fcity.rig.pose.y = 10.3;');
// ↑ z = -124：太和殿门点（z -114.8）正前方 9.2 m（< 9.5 触发圈）；y = 10.3 比台基顶面高 2 m 平视门脸
await sleep(38000);                       // 门扇 lerp ≈30 帧（@1 fps）开到位
await shot('phase6-太和殿门开');
await ev('__fcity.rig.pose.z = -100; __fcity.rig.pose.y = 10.2;');   // 瞬移进殿：fp 内 + 视平高度带 → 解锁「入内太和殿」
await sleep(2400);                        // 成就 toast 窗口 3.2 s，截图趁热
await shot('phase6-入内太和殿');

// ── 阶段 7：内廷与后苑（乾清门 + 六宫 + 御花园 + 景山借景），同样走瞬移（D34 口径）──
await ev('__fcity.rig.pose.yaw = Math.PI; __fcity.rig.pose.pitch = -0.12; __fcity.rig.pose.x = 0; __fcity.rig.pose.z = 120; __fcity.rig.pose.y = 26;');
// ↑ 乾清门（145）以南 25 m 平视北望：门 + 后三宫 + 东西六宫（z 175..320，±62）两翼
await sleep(4200);
await shot('phase7-内廷六宫与乾清门');
await ev('__fcity.rig.pose.z = 295; __fcity.rig.pose.y = 34; __fcity.rig.pose.pitch = -0.18;');
// ↑ 坤宁宫（295）北望：御花园树海 + 钦安殿（350）+ 御景亭（堆秀山 y9）+ 神武门（415）+ 景山万春亭（535，y 38）
await sleep(4200);
await shot('phase7-御花园与景山万春亭');

chrome.kill();
process.exit(0);
