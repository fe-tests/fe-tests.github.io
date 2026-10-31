/* 塔防要塞 · 无头装配测试（mini-DOM + Proxy 2D 上下文）
 * 用法（站点根目录）：node examples/tower-defense/tools/headless.mjs
 * 目的：没有浏览器自动化的环境下，验证「装配 → 引擎 → 渲染 → 事件 → 表现 → 存档」这条真实链路
 *      跑通：Game 构造、startLevel、建造/升级/出售、技能、开波、倍速、渲染管线、结算、卸载。
 * 关键做法：直接调用 Game.frame(ts) 驱动真实主循环（rAF 的替身），因此 hud / 自动开波 / 渲染
 *      都被覆盖；只保证「不调用不存在的方法、不抛异常、状态按预期推进」，不校验像素。 */
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`);
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

/* ---------------- 桩环境：先装好全局，再 import 依赖 DOM 的模块 ---------------- */
const memStore = new Map();
const storage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
};
const noop = () => {};
/* mini-DOM 只**记录**监听器，不自己派发：测试用 fire() 按真实序列手工派发指针 / 键盘事件，
   这样 input.js 的手势状态机（press / drag / pinch / long）能在 Node 里跑起来。 */
const mkLs = () => {
  const ls = {};
  return {
    _ls: ls,
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    removeEventListener(ev, fn) { const a = ls[ev] || [], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
  };
};
/** 手工派发一个事件：补齐 preventDefault / stopPropagation，返回事件对象供断言查看标志 */
function fire(el, ev, e) {
  const fns = (el && el._ls && el._ls[ev]) || [];
  const ev2 = Object.assign({ type: ev, target: el, currentTarget: el, cancelable: true, bubbles: true, preventDefault: noop, stopPropagation: noop }, e);
  for (const fn of fns.slice()) fn(ev2);
  return ev2;
}
function makeCtx(canvas) {
  const target = { canvas, font: '', fillStyle: '', globalAlpha: 1 };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'canvas') return canvas;
      if (k === 'measureText') return () => ({ width: 12, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 3 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
    has: () => true,
  });
}
function makeEl(tag, id) {
  const set = new Set();
  const el = {
    tagName: String(tag).toUpperCase(), id: id || '', className: '', dataset: {}, children: [],
    textContent: '', innerHTML: '', title: '', disabled: false, hidden: false, firstChild: null,
    style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' },
    classList: {
      set,
      toggle(c, force) { const on = force === undefined ? !set.has(c) : !!force; if (on) set.add(c); else set.delete(c); return on; },
      add(c) { set.add(c); }, remove(c) { set.delete(c); }, contains(c) { return set.has(c); }, replace(a, b) { set.delete(a); set.add(b); },
    },
    ...mkLs(),
    appendChild(c) { this.children.push(c); this.firstChild = this.firstChild || c; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 390, bottom: 720, x: 0, y: 0, width: 390, height: 720 }),
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    offsetWidth: 390, offsetHeight: 720, clientWidth: 390, clientHeight: 720, parentNode: null,
  };
  if (String(tag).toLowerCase() === 'canvas') {
    el.width = 1024; el.height = 768;
    el.getContext = () => makeCtx(el);
    el.setPointerCapture = noop; el.releasePointerCapture = noop;
    el.toDataURL = () => 'data:,';
  }
  return el;
}
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
/* index.html 里的 <canvas id> 必须建成画布替身（要 getContext / width / height） */
const canvasIds = new Set();
for (const m of html.matchAll(/<canvas[^>]*id="([^"]+)"/g)) canvasIds.add(m[1]);
const elCache = new Map();
const elFor = (id) => {
  if (!elCache.has(id)) elCache.set(id, makeEl(canvasIds.has(id) ? 'canvas' : 'div', id));
  return elCache.get(id);
};
for (const m of html.matchAll(/id="([^"]+)"/g)) elFor(m[1]);

/* Node 24 自带只读的 navigator / performance 等全局，需用 defineProperty 覆盖 */
const def = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
const mm = () => ({ matches: false, media: '', addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null });
const doc = {
  hidden: false, visibilityState: 'visible',
  createElement: (t) => makeEl(t),
  createElementNS: (ns, t) => makeEl(t),
  documentElement: makeEl('html'), body: makeEl('body'), head: makeEl('head'),
  getElementById: elFor, getElementsByName: () => [],
  ...mkLs(), dispatchEvent: noop,
  querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, fonts: { ready: Promise.resolve() },
};
def('localStorage', storage);
def('navigator', { userAgent: 'node-headless', vibrate: noop, maxTouchPoints: 1, language: 'zh-CN' });
def('performance', { now: () => Date.now(), timeOrigin: Date.now(), mark: noop, measure: noop });
def('requestAnimationFrame', () => 1);
def('cancelAnimationFrame', noop);
def('matchMedia', mm);
def('document', doc);
def('location', { search: '?fps=1', protocol: 'http:', href: 'http://localhost/examples/tower-defense/index.html', host: 'localhost' });
def('innerWidth', 390); def('innerHeight', 720); def('devicePixelRatio', 2);
def('getComputedStyle', () => ({ getPropertyValue: () => '' }));
def('window', {
  document: doc, localStorage: storage, navigator: globalThis.navigator, location: globalThis.location,
  devicePixelRatio: 2, innerWidth: 390, innerHeight: 720, outerWidth: 390, outerHeight: 720,
  ...mkLs(), dispatchEvent: noop,
  matchMedia: mm, visualViewport: { width: 390, height: 640, scale: 1, addEventListener: noop },
  performance: globalThis.performance, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
  getComputedStyle: globalThis.getComputedStyle, __tdBootFail: noop,
});

/* ---------------- 装配 ---------------- */
const seen = {};
const hooks = {};
for (const k of ['hud', 'over', 'refresh', 'drawer', 'closeDrawer', 'toast', 'banner', 'buildTip',
  'speedChange', 'pauseChange', 'settings', 'fps', 'traySel']) {
  hooks[k] = (...a) => {
    seen[k] = (seen[k] || 0) + 1;
    if (k === 'toast') seen.lastToast = a[0];
    if (k === 'over') { seen.lastSum = a[0]; seen.lastMeta = a[1]; }
  };
}

const gameM = await import('../js/game.js');
const saveM = await import('../js/save.js');
const uiM = await import('../js/ui.js');
const engineM = await import('../js/engine.js');
const renderM = await import('../js/render.js');
const cfg = await import('../js/config.js');

console.log('塔防要塞 · 无头装配测试（mini-DOM · 真实 Game.frame 驱动）');

const canvas = makeEl('canvas', 'game');
let g = null, bootErr = '';
try { g = new gameM.Game(canvas, hooks); }
catch (e) { bootErr = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : String(e); }
ok('Game 构造：装配引擎 / 渲染器 / 输入 / 特效 / 设置，无异常', !bootErr, bootErr);
if (!g) { console.error('\n装配失败，后续检查跳过'); process.exit(1); }
ok('Game 字段：fx / renderer / input / save 就位', !!g.fx && !!g.renderer && !!g.input && !!g.save);

/* 主循环替身：用合成时间戳喂 Game.frame，覆盖 hud / 自动开波 / 渲染 */
let ts = 0;
const run = (frames) => { for (let i = 0; i < frames; i++) { ts += 16.667; g.frame(ts); } };
ok('开局倍速 = ×1（存档存的是 SPEEDS 下标）', g.speed === 1 && g.save.speed === 0, `speed=${g.speed} 存档下标=${g.save.speed}`);

g.startLevel(1);
ok('startLevel(1)：状态与关卡名就位', !!g.st && g.level.id === 1 && g.st.hpMax > 0,
  `${g.level.name} · 基地 ${g.st.hpMax} · 金币 ${g.st.gold} · ${g.st.level.waves.length} 波`);
ok('渲染器：竖屏视口尺寸与 dpr 生效', g.renderer.cssW === 390 && g.renderer.cssH === 720 && g.renderer.dpr === 2,
  `css=${g.renderer.cssW}×${g.renderer.cssH} dpr=${g.renderer.dpr} 画布=${canvas.width}×${canvas.height}`);

/** 沿路建塔：把可建格按到道路的距离排序后依次落位，保证塔真的打得到人；只用本关已解锁的塔 */
function buildAlong(g, prefer, count) {
  const st = g.st;
  const lvId = g.level ? (g.level.id || 1) : 1;
  const pool = gameM.TOWERS.filter((t) => (t.unlockAt || 1) <= lvId).map((t) => t.id);
  const ids = prefer.filter((p) => pool.includes(p));
  if (!ids.length) ids.push(...pool);
  const G = st.grid, W = G.w, H = G.h, at = (x, y) => G.at(x, y);
  const path = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 1) path.push([x, y]);
  const cand = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c !== 0 && c !== 3) continue;                       // 0 可建空地 / 3 石台
    let d = 99;
    for (const [px, py] of path) d = Math.min(d, Math.abs(px - x) + Math.abs(py - y));
    if (d <= 3) cand.push({ x, y, d });
  }
  cand.sort((a, b) => a.d - b.d || (a.x * 7 + a.y * 13) - (b.x * 7 + b.y * 13));
  let built = 0, ti = 0;
  for (const c of cand) {
    if (built >= count) break;
    g.selectTray(ids[ti % ids.length]);
    const before = g.st.towers.length;
    g.placeAt(c.x, c.y);
    if (g.st.towers.length > before) { built++; ti++; }
  }
  g.clearBuild();
  return built;
}

g.st.gold = 1400;
const built0 = buildAlong(g, ['arrow', 'arrow', 'frost', 'cannon'], 6);
g.setPaused(false);
run(1200);                                    // 20 秒（首波 14s 到点）
ok('主循环 20 秒：引擎推进 + 渲染管线（地形 / 敌人 / 弹道）无异常',
  g.st.time > 19 && g.st.wave >= 1 && g.st.kills > 0,
  `t=${g.st.time.toFixed(1)}s 波 ${g.st.wave} 在场 ${g.st.enemies.length} 击杀 ${g.st.kills} 塔 ${g.st.towers.length}`);
ok('渲染：地形缓存已烘焙（每关一次）', !!g.renderer.terrain, `key=${String(g.renderer.terrainKey).slice(0, 28)}…`);
ok('HUD hook 每帧驱动', (seen.hud || 0) >= 1100 && (seen.fps || 0) >= 1100, `hud=${seen.hud} fps=${seen.fps}`);

/* 建造：塔卡 → 网格扫描建造 → 抽屉 → 升级 → 目标 → 出售 */
g.st.gold = 1400;
g.selectTray('arrow');
ok('selectTray：进入建造态并同步塔卡高亮', !!g.build && g.build.id === 'arrow' && (seen.traySel || 0) > 0,
  `造价 ${g.build ? g.build.cost : '-'} traySel=${seen.traySel}`);
const cells = [];
for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) cells.push([x, y]);
let built = built0;
for (const [x, y] of cells) {
  if (built >= built0 + 6) break;
  const before = g.st.towers.length;
  g.placeAt(x, y);
  if (g.st.towers.length > before) built++;
}
ok('placeAt：继续建成 6 座塔（非法格被引擎拒绝）', built >= built0 + 5, `扫描 ${cells.length} 格 → 累计 ${built} 座`);
const t0 = g.st.towers[0];
if (t0) {
  g.selectTower(t0);
  ok('selectTower：抽屉打开且带塔信息', (seen.drawer || 0) > 0 && g.sel === t0);
  g.st.gold = 900;
  g.upgradeSelected();
  ok('upgradeSelected：升到 2 级', t0.lv === 2, `lv=${t0.lv}`);
  g.setTargetMode('strong');
  ok('setTargetMode：目标优先级写入塔', t0.targetMode === 'strong');
  const nBefore = g.st.towers.length, goldBefore = g.st.gold;
  g.sellSelected();
  ok('sellSelected：塔消失且返还金币', g.st.towers.length === nBefore - 1 && g.st.gold > goldBefore,
    `+${Math.round(g.st.gold - goldBefore)} 金币`);
}

/* 技能：冰封全场 / 流星需落点 / 富矿进账 */
g.fireSkill('blizzard');
ok('技能：冰封全场立即进入冷却', (g.st.skills.blizzard || 0) > 0, `cd=${(g.st.skills.blizzard || 0).toFixed(1)}s`);
g.fireSkill('meteor');
ok('技能：流星雨进入待落点态', g.armed === 'meteor', `armed=${g.armed}`);
const gB = g.st.gold;
g.fireSkill('greed');
ok('技能：富矿直接进账并进入冷却', g.st.gold > gB && (g.st.skills.greed || 0) > 0,
  `+${Math.round(g.st.gold - gB)} cd=${(g.st.skills.greed || 0).toFixed(0)}s`);
g.fireSkill('meteor', 8, 6);
ok('技能：流星雨按落点释放并解除待落点', g.armed === null && (g.st.skills.meteor || 0) > 0);

/* 开波 / 倍速：第 3 关沿路建 8 座塔后 ×3 快进 30 秒 */
g.startLevel(3);
g.setPaused(false);
g.st.gold = 1600;
const built3 = buildAlong(g, ['arrow', 'arrow', 'cannon', 'frost'], 8);
const rw = g.nextWave();
ok('nextWave：手动开波成功并给提前奖励', rw && rw.ok, rw && rw.ok ? `+${rw.bonus} 金币` : `reason=${rw && rw.reason}`);
g.setSpeed(3);
ok('setSpeed(3)：倍速生效并写入存档下标', g.speed === 3 && g.save.speed === 2, `speed=${g.speed} 存档=${g.save.speed}`);
run(600);                                     // ×3 下 600 帧 ≈ 30 秒游戏时间
ok('×3 快进：波次推进、击杀累计、无卡死', g.st.wave >= 2 && g.st.kills > 0 && Number.isFinite(g.st.score),
  `波 ${g.st.wave} 塔 ${g.st.towers.length}/${built3} 分 ${Math.round(g.st.score)} 击杀 ${g.st.kills} 漏 ${g.st.leaks}`);
ok('表现链路：toast / banner 事件有送达 UI', (seen.toast || 0) + (seen.banner || 0) > 0,
  `toast=${seen.toast || 0} banner=${seen.banner || 0} 最近「${seen.lastToast || ''}」`);

/* 打到结算：自动开波 + 补塔升级，验证 over 判定与存档写入 */
g.setSetting('auto', true);
let guard = 0, lastWave = 0, wavePeak = g.st.wave, upgrades = 0;
while (!g.st.over && guard < 2700) {
  run(30);
  wavePeak = Math.max(wavePeak, g.st.wave);
  if (g.st.waveIdx > lastWave) {
    lastWave = g.st.waveIdx;
    g.st.gold += 260;                                  // 模拟玩家攒钱节奏，保证有后续投入
    buildAlong(g, ['arrow', 'cannon', 'frost', 'tesla'], g.st.level.maxTowers ? g.st.level.maxTowers : 14);
    for (const t of g.st.towers) { g.selectTower(t); g.upgradeSelected(); upgrades++; }
  }
  guard++;
}
const sum = seen.lastSum || {};
ok('跑到结算：over 判定 + over hook 携带 summary 与 meta',
  !!g.st.over && (seen.over || 0) > 0 && typeof sum.win === 'boolean' && typeof sum.stars === 'number',
  `over=${g.st.over} 胜=${sum.win} ★${sum.stars} 波 ${sum.wave}/${sum.waveCount} 峰 ${wavePeak} 漏 ${sum.leaks} 升级 ${upgrades} 次`);
ok('结算能推进到中途波次（沿路建塔 + 持续升级的玩法路径成立）', wavePeak >= 4, `最高波次 ${wavePeak}`);
const sAfter = saveM.load();
ok('结算写入存档：结构合法（v / unlocked≥1 / stars 与 best 为对象）',
  sAfter.v === 1 && sAfter.unlocked >= 1 && typeof sAfter.stars === 'object' && typeof sAfter.best === 'object',
  `unlocked=${sAfter.unlocked} 累计星 ${saveM.totalStars()} meta=${JSON.stringify(seen.lastMeta || {})}`);

/* 无尽模式 */
g.startLevel(0);
g.setPaused(false);
ok('startLevel(0)：无尽模式环形图 + 波次公式生效', g.st.endless === true && g.st.level.id === 0);
run(1200);
ok('无尽 20 秒：持续出怪且渲染无异常', g.st.enemies.length > 0 && g.st.wave >= 1, `在场 ${g.st.enemies.length} / 波 ${g.st.wave}`);

/* 设置 / 暂停 / 相机 / 卸载 */
for (const [k, v] of [['fx', 0], ['grid', false], ['dmgNum', false], ['keep', true], ['sound', false], ['auto', false]]) g.setSetting(k, v);
ok('setSetting：6 项设置写入并读回',
  g.save.fx === 0 && g.save.grid === false && g.save.dmgNum === false && g.save.keep === true
  && g.save.sound === false && g.save.auto === false);
g.applySettings();
ok('applySettings：流畅档特效预算同步', g.fx.cap <= 120 && g.renderer.tier === 0, `cap=${g.fx.cap} tier=${g.renderer.tier}`);
g.setPaused(true, true);
ok('切后台自动暂停：pauseChange 通知且主循环不再推进引擎', g.paused === true && (seen.pauseChange || 0) > 0);
const hpBefore = g.st.hp, tBefore = g.st.time;
run(120);
ok('暂停期间引擎冻结（血量与时间不推进）', g.st.hp === hpBefore && g.st.time === tBefore, `hp ${g.st.hp} t ${g.st.time.toFixed(1)}`);
g.setPaused(false);
/* 相机：默认禁缩放 → 只剩「重新铺满」，任何手势 / 快捷键都改不动 zoom */
g.renderer.resize(g.st); g.renderer.fitView(g.st, false); g.camFit();
const cv = g.renderer.view;
ok('相机：视口锁全图（zoom ≡ fit），🧭 重新铺满幂等、画布尺寸变化不涨缩放',
  Number.isFinite(cv.zoom) && Math.abs(cv.zoom - cv.fit) < 1e-9 && cv.fit > 0,
  `zoom=${cv.zoom.toFixed(3)} fit=${cv.fit.toFixed(3)} 画布 CSS ${g.renderer.cssW}×${g.renderer.cssH}`);
g.renderer.zoomAt(g.renderer.cssW / 2, g.renderer.cssH / 2, 1.7);
g.renderer.zoomAt(g.renderer.cssW / 2, g.renderer.cssH / 2, 0.5);
let fitHits = 0;
const camFit0 = g.camFit.bind(g);
g.camFit = () => { fitHits++; camFit0(); };
for (const k of ['+', '-', '=', '_']) fire(window, 'keydown', { key: k, target: { tagName: 'BODY' } });
ok('相机：zoomAt 空实现 + 键盘 +/−/=/ 都不改 zoom（缩放入口已全部撤掉）',
  Math.abs(g.renderer.view.zoom - g.renderer.view.fit) < 1e-9, `zoom=${g.renderer.view.zoom.toFixed(3)}`);
fire(window, 'keydown', { key: 'f', target: { tagName: 'BODY' } });
fire(window, 'keydown', { key: 'F', target: { tagName: 'BODY' } });
ok('键盘：F 走 onKey("fit") → camFit()（与 🧭 按钮同一条路径：fitView + 准星按手指重算）', fitHits === 2, `camFit 命中 ${fitHits} 次`);

/* ---------------- 触屏落塔链路：真指针事件序列（#25 的回归钉：预览瓦 == 落塔瓦） ----------------
 * mini-DOM 记录监听器 → 手工派发 pointerdown/move/up，跑真实的 input.js 状态机 + game.js 落塔链。
 * 引擎不推进（不调 g.frame），只看「手指 → 预览 → 落塔」是否同源；落瓦用当前 view 独立复算，
 * 不借 screenToTile，避免「用实现验实现」。 */
g.startLevel(1);
g.setPaused(false);
g.st.gold = 1400;
g.clearBuild(); g.selectTower(null); g.clearAim();
const T = cfg.TILE, GW = cfg.GRID_W, GH = cfg.GRID_H;
const lift = renderM.reticleLiftTiles(g.renderer.view.zoom, 'touch');
/** 用**当前**视口独立复算落瓦：liftTiles 按整瓦抬升（屏幕抬升 = tiles·TILE·zoom） */
const tileAt = (sx, sy, liftTiles = 0) => {
  const v = g.renderer.view, z = v.zoom;
  const tx = Math.floor((v.x + sx / z) / T), ty = Math.floor((v.y + (sy - liftTiles * T * z) / z) / T);
  return { tx: Math.min(Math.max(tx, 0), GW - 1), ty: Math.min(Math.max(ty, 0), GH - 1) };
};
/** 扫画布采样点，找第一个「预览格合法可建、且落瓦没被上下边界钳制」的手指屏幕点
 *  （指尖行至少 liftTiles+1，保证抬升后的落瓦真在地图内 → 断言测的是抬升数学，不是钳制） */
function pickBuildPoint(id, liftTiles = 2, maxTy = GH - 3) {
  for (let sy = 250; sy <= 470; sy += 6) {
    for (let sx = 30; sx <= 360; sx += 6) {
      const f = tileAt(sx, sy, 0);
      if (f.ty < liftTiles + 1) continue;
      const t = tileAt(sx, sy, liftTiles);
      if (t.ty > maxTy || t.ty < 1) continue;
      if (engineM.canBuild(g.st, id, t.tx, t.ty).ok) return { sx, sy, t };
    }
  }
  throw new Error(`pickBuildPoint(${id}, lift=${liftTiles}) 找不到可建预览格（金币 / 塔数上限 / 采样范围）`);
}
const pdn = (sx, sy, o = {}) => fire(canvas, 'pointerdown', { pointerId: o.id || 1, clientX: sx, clientY: sy, pointerType: o.type || 'touch', button: 0, isPrimary: true });
const pmv = (sx, sy, o = {}) => fire(canvas, 'pointermove', { pointerId: o.id || 1, clientX: sx, clientY: sy, pointerType: o.type || 'touch' });
const pup = (o = {}) => fire(canvas, 'pointerup', { pointerId: o.id || 1, pointerType: o.type || 'touch', button: 0 });
const lastTower = () => g.st.towers[g.st.towers.length - 1] || null;
const snap = (r) => (r ? `(${r.tx},${r.ty})` : 'null');

/* 1) 按下即出预览：落瓦 = 指尖瓦上方整 2 瓦，且预览对象带落瓦中心坐标 */
g.selectTray('arrow');
const A = pickBuildPoint('arrow', lift);
const Afinger = tileAt(A.sx, A.sy, 0);
pdn(A.sx, A.sy);
const rA = g.reticle ? { ...g.reticle } : null;
ok('触屏按下即出预览：落瓦 = 指尖瓦上方整 2 瓦（禁缩放后抬升恒为 2 瓦，与 zoom 无关、不抖格）',
  !!rA && rA.ty === Afinger.ty - lift && rA.tx === Afinger.tx,
  `指尖瓦${snap(Afinger)} → 预览瓦${snap(rA)}，lift=${lift} 瓦，zoom=${g.renderer.view.zoom.toFixed(3)}`);
ok('预览带落瓦中心 (tx+.5)·TILE：历史上写的是 wx/wy，渲染读 x/y → translate(undefined) → 准星钉死在世界 (0,0)',
  !!rA && Math.abs(rA.x - (rA.tx + 0.5) * T) < 1e-9 && Math.abs(rA.y - (rA.ty + 0.5) * T) < 1e-9 && rA.inb === true,
  rA ? `预览中心=(${rA.x},${rA.y})` : 'null');
ok('抬升 2 瓦在竖屏 fit 下 ≥ 44px 触摸标准（手指不压住落点格）',
  lift * T * g.renderer.view.zoom >= 44,
  `抬升 ${(lift * T * g.renderer.view.zoom).toFixed(1)} CSS px，瓦片 ${(T * g.renderer.view.zoom).toFixed(1)} CSS px`);

/* 2) 点按落塔 == 预览瓦（核心回归钉） */
const n0 = g.st.towers.length;
pup();
const twA = lastTower();
ok('点按落塔 == 预览瓦（预览与提交同源；历史上点按走指尖瓦 → 差 2 格，就是报来的「摆放定位错位」）',
  g.st.towers.length === n0 + 1 && !!twA && twA.x === rA.tx && twA.y === rA.ty,
  twA ? `塔${snap({ tx: twA.x, ty: twA.y })} 预览${snap(rA)} 指尖瓦${snap(Afinger)}` : `未落塔（预览${snap(rA)}）`);
ok('塔不落在指尖瓦：塔在手指上方 2 格 = 「手指不挡视线」的设计意图',
  !!twA && !(twA.x === Afinger.tx && twA.y === Afinger.ty), `塔${snap({ tx: twA && twA.x, ty: twA && twA.y })} 指尖瓦${snap(Afinger)}`);

/* 3) 拖拽微调后松手：落塔 == 松手瞬间的预览瓦 */
g.clearBuild(); g.selectTray('arrow');
const B = pickBuildPoint('arrow', lift);
pdn(B.sx, B.sy);
let moved = null;
for (let dy = -22; dy <= 22 && !moved; dy += 4) {
  for (let dx = -22; dx <= 22 && !moved; dx += 4) {
    if (Math.hypot(dx, dy) < 8) continue;              // 位移 > DRAG_MIN(6) 才进 drag 态
    pmv(B.sx + dx, B.sy + dy);
    if (g.reticleOk) moved = { dx, dy, r: { ...g.reticle } };
  }
}
const pvB = moved && moved.r;
pup();
const twB = lastTower();
ok('拖拽微调后松手：落塔 == 松手瞬间的预览瓦（drag 与 tap 同一个 aimFromScreen）',
  !!moved && !!twB && twB.x === pvB.tx && twB.y === pvB.ty,
  moved ? `位移(${moved.dx},${moved.dy}) 预览${snap(pvB)} 塔${snap({ tx: twB && twB.x, ty: twB && twB.y })}` : '没找到可建的拖拽目标');

/* 4) 视口变化（旋转屏幕 / 地址栏收缩）后准星按手指重算，不留在旧瓦 */
const C = pickBuildPoint('arrow', lift, GH - 4);
pdn(C.sx, C.sy);
const rC0 = { ...g.reticle };
g.renderer.view.y += T;                                 // 模拟 fitView 之后视口原点移动（整 1 瓦）
g.updateReticleScreen();
const rC1 = g.reticle ? { ...g.reticle } : null;
const cWant = tileAt(C.sx, C.sy, lift);
pup();
ok('视口变化后准星按手指重算：落瓦跟随手指下移 1 瓦（不留在旧瓦上）',
  !!rC1 && rC1.ty === rC0.ty + 1 && rC1.tx === cWant.tx && rC1.ty === cWant.ty,
  `变化前${snap(rC0)} → 变化后${snap(rC1)}，按手指期望${snap(cWant)}`);
g.renderer.fitView(g.st, false);

/* 5) 第二根手指落下 = 放弃瞄准，不是落塔 */
let aimClears = 0;
const clearAim0 = g.clearAim.bind(g);
g.clearAim = () => { aimClears++; clearAim0(); };
const E = pickBuildPoint('arrow', lift, GH - 4);
const n1 = g.st.towers.length;
pdn(E.sx, E.sy, { id: 1 });
const rE0 = !!g.reticle;
const clears0 = aimClears;
pdn(E.sx + 34, E.sy + 22, { id: 2 });
ok('第二指落下即放弃瞄准：准星清空、塔数不变（旧代码把 pinch 当 tap → 捏合第一指静默造塔）',
  rE0 && g.reticle === null && aimClears > clears0 && g.st.towers.length === n1,
  `单指有预览=${rE0}，双指后预览=${g.reticle ? '有' : 'null'}，clearAim ${aimClears - clears0} 次，塔数 ${g.st.towers.length}/${n1}`);
pmv(E.sx + 44, E.sy + 30, { id: 2 });
pup({ id: 2 }); pup({ id: 1 });
ok('双指平移 + 抬起全程不落塔、不改 zoom（panBy 被 clampCam 钳成居中）',
  g.st.towers.length === n1 && Math.abs(g.renderer.view.zoom - g.renderer.view.fit) < 1e-9,
  `塔数 ${g.st.towers.length}/${n1} zoom=${g.renderer.view.zoom.toFixed(3)}`);

/* 6) 手指落在地图下方 letterbox 死区：建造合法（落瓦钳到底行）；选塔不成立（指尖瓦在图外） */
let F = null;
for (let sx = 30; sx <= 360 && !F; sx += 6) {
  const t = tileAt(sx, 662, lift);
  if (t.ty === GH - 1 && engineM.canBuild(g.st, 'arrow', t.tx, t.ty).ok) F = { sx, t };
}
g.clearBuild(); g.selectTray('arrow');
const n2 = g.st.towers.length;
pdn(F.sx, 662);
const rF = g.reticle ? { ...g.reticle } : null;
pup();
const twF = lastTower();
ok('手指在画布底部 letterbox（地图下方死区）也能建：落瓦钳到最后一行，inb 只描述指尖瓦（不作建造门槛）',
  !!rF && rF.inb === false && rF.ty === GH - 1 && g.st.towers.length === n2 + 1 && !!twF && twF.y === GH - 1,
  `预览${snap(rF)} inb=${rF && rF.inb} 塔${snap({ tx: twF && twF.x, ty: twF && twF.y })} 底行=${GH - 1}`);
g.clearBuild();
g.selectTower(g.st.towers[0] || null);
const selBefore = !!g.sel;
pdn(F.sx, 662); pup();
ok('死区里的非建造点按 = 取消选中（指尖瓦在图外时不做吸附选塔）',
  g.sel === null && selBefore, `点前 sel=${selBefore ? '有塔' : '空'} 点后 sel=${g.sel ? '有塔' : '空'}`);

/* 7) 点塔按屏幕距离吸附（TAP_SNAP_PX = 26 CSS px）：邻瓦点得中，隔两瓦点空。
      先清空棋盘、只用一次真点按落一座塔 → 场上唯一目标，吸附结果不受邻塔干扰。 */
g.clearBuild(); g.selectTower(null);
g.st.towers.length = 0;
const S = pickBuildPoint('arrow', lift, GH - 4);
g.selectTray('arrow');
pdn(S.sx, S.sy); pup();
const tS = lastTower();
const sc = g.renderer.worldToScreen((tS.x + 0.5) * T, (tS.y + 0.5) * T);
const tilePx = T * g.renderer.view.zoom;
g.clearBuild(); g.selectTower(null);
pdn(sc.x + tilePx * 0.9, sc.y); pup();
const near = g.sel;
const pickNear = g.pickTowerAt({ x: sc.x + tilePx * 0.9, y: sc.y });
pdn(sc.x + tilePx * 2.1, sc.y); pup();
const far = g.sel;
ok('点塔按屏幕距离吸附：隔壁瓦（22 CSS px ≤ 26）点得中，隔两瓦（51 CSS px > 26）不吸附（竖屏瓦片仅 24 CSS px，按瓦选塔必点空）',
  !!tS && near === tS && pickNear === tS && far === null,
  `瓦片 ${tilePx.toFixed(1)} CSS px：+0.9 瓦 → ${near === tS ? '吸附到目标塔' : (near ? '选到别处' : '未选中')}，+2.1 瓦 → ${far === null ? '取消选中' : '仍选中'}`);

/* 8) 鼠标：0 抬升，预览瓦 == 落塔瓦 == 指尖瓦（所见即所得） */
g.clearBuild(); g.selectTray('arrow');
const Hm = pickBuildPoint('arrow', 0, GH - 2);
const Hf = tileAt(Hm.sx, Hm.sy, 0);
pdn(Hm.sx, Hm.sy, { type: 'mouse' });
const rH = g.reticle ? { ...g.reticle } : null;
pup({ type: 'mouse' });
const twH = lastTower();
ok('鼠标 0 抬升：预览瓦 == 落塔瓦 == 指尖瓦（桌面所见即所得，不抬升）',
  renderM.reticleLiftTiles(g.renderer.view.zoom, 'mouse') === 0 && !!rH && rH.tx === Hf.tx && rH.ty === Hf.ty
  && !!twH && twH.x === rH.tx && twH.y === rH.ty,
  `指尖瓦${snap(Hf)} 预览${snap(rH)} 塔${snap({ tx: twH && twH.x, ty: twH && twH.y })}`);

/* 9) 长按速建：落塔 == 长按瞬间的预览瓦 */
const K = pickBuildPoint('arrow', lift, GH - 4);
const n3 = g.st.towers.length;
pdn(K.sx, K.sy);
await new Promise((r) => setTimeout(r, 430));           // LONG_MS = 400
const rK = g.reticle ? { ...g.reticle } : null;
pup();
const twK = lastTower();
ok('长按速建：落塔 == 长按瞬间的预览瓦（长按门槛是「手指在画布内」，不是「在地图内」）',
  g.st.towers.length === n3 + 1 && !!twK && !!rK && twK.x === rK.tx && twK.y === rK.ty,
  `预览${snap(rK)} 塔${snap({ tx: twK && twK.x, ty: twK && twK.y })} 塔数 ${g.st.towers.length}/${n3 + 1}`);

/* 10) 浏览器把页面放大（visualViewport.scale > 1.05）→ 坐标口径不可信：整次手势丢弃 + 只提示一次 */
window.visualViewport.scale = 2.2;
g.input.vvWarned = false;
const J = pickBuildPoint('arrow', lift, GH - 4);
const n4 = g.st.towers.length, toastBefore = seen.toast || 0;
pdn(J.sx, J.sy);
const rJ = g.reticle;
pup();
ok('页面被浏览器放大时丢弃手势：不出预览、不落塔、提示一次「请缩回 100%」',
  rJ === null && g.st.towers.length === n4 && (seen.toast || 0) > toastBefore && /100%/.test(String(seen.lastToast || '')),
  `预览=${rJ === null ? 'null' : '有'} 塔数=${g.st.towers.length}/${n4} toast=「${seen.lastToast || ''}」`);
window.visualViewport.scale = 1;
g.input.reset();
g.clearAim();
const n5 = g.st.towers.length, P = pickBuildPoint('arrow', lift, GH - 4);
g.selectTray('arrow');
pdn(P.sx, P.sy);
const rP = !!g.reticle;
pup();
ok('scale 复位后手势重新可用（同一点位可正常落塔，提示不刷屏）',
  rP && g.st.towers.length > n5 && Math.abs(g.renderer.view.zoom - g.renderer.view.fit) < 1e-9,
  `塔数 ${g.st.towers.length}/${n5} zoom=${g.renderer.view.zoom.toFixed(3)}`);
ok('触屏链路全程 zoom 恒等于 fit：没有任何手势 / 快捷键改得动缩放',
  Math.abs(g.renderer.view.zoom - g.renderer.view.fit) < 1e-9,
  `zoom=${g.renderer.view.zoom.toFixed(3)} fit=${g.renderer.view.fit.toFixed(3)} 塔数 ${g.st.towers.length}`);
g.destroy();
ok('destroy：停止 rAF 调度并可安全卸载', g.raf === 0);

/* 入口模块：真实 boot 路径（index.html 的 #game 画布 → UI + Game 接线 → window.TD） */
let mainErr = '';
try { await import('../js/main.js'); } catch (e) { mainErr = e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : String(e); }
ok('入口 main.js：boot 无异常，__tdBooted 置位且版本号合法',
  !mainErr && window.__tdBooted === true && !!window.TD && /^\d+\.\d+\.\d+$/.test(window.TD.version),
  mainErr || `v${window.TD && window.TD.version}`);
const pageTest = window.TD ? window.TD.selfTest() : { ok: false, steps: ['TD 缺失'] };
/* 回归：菜单点「开始第 N 关」必须自己收起 #overlay。覆盖屏是 inset:0 + z-index:10 的整屏层，
   不收起就一直盖在画布上（还带 blur 背景），战场在弹层后面跑，玩家点不到地图。 */
{
  const u = window.TD && window.TD.ui;
  const ov = document.getElementById('overlay');
  const mp = document.getElementById('m-play');
  let pass = false, extra = 'TD / DOM 缺失';
  if (u && ov && mp) {
    u.showScreen('menu');                                   // 回到开局菜单：#overlay.show
    const before = ov.classList.contains('show');
    const want = Number(document.getElementById('m-play-no').textContent);
    fire(mp, 'click');
    pass = before && !ov.classList.contains('show') && u.screen === null
      && u.g.levelId === want && u.g.paused === false && u.n.overlay === ov;
    extra = `点前 overlay=${before ? 'show' : '无'} 点后=${ov.classList.contains('show') ? 'show（仍挡画布）' : '已收起'} · 进第 ${u.g.levelId} 关（按钮写第 ${want} 关）· paused=${u.g.paused}`;
  }
  ok('菜单「开始第 N 关」点一下就收起弹层并直接开局（不留下盖住画布的 #overlay）', pass, extra);
}
ok('页内自检 TD.selfTest()：引擎推进 → HUD 文本 → 塔盘 → Fx 全链路成立',
  pageTest.ok === true, pageTest.steps.filter((s) => /胜|HUD|第1关/.test(s)).join(' · ') || pageTest.steps.join(' · '));
const tSim = window.TD ? window.TD.simulate(2, { ai: true }) : null;
ok('TD.simulate 直接返回结算摘要（无 .sum 包装，README 口径一致）',
  !!tSim && typeof tSim.win === 'boolean' && typeof tSim.stars === 'number',
  tSim ? `第 2 关 胜=${tSim.win} ★${tSim.stars} 漏 ${tSim.leaks} 塔 ${tSim.towers}` : 'TD 缺失');

/* 引擎自动玩家与 Game 装配一致性：同一关纯引擎模拟应能通关（玩法与 UI 层解耦） */
const engineSim = engineM.simulateLevel((await import('../js/levels.js')).LEVELS[0], { ai: true });
ok('引擎层独立可模拟（UI 未参与玩法）', !!engineSim && engineSim.win === true,
  engineSim ? `第 1 关 ★${engineSim.stars} 漏 ${engineSim.leaks} 塔 ${engineSim.towers}` : 'simulateLevel 缺失');

/* UI 构造（放在最后）：mini-DOM 的元素缓存是全测试共用的，多建一个 UI 就会在 #m-play 等
   节点上**追加**一份 click 监听器（g 为 null 的孤儿实例）。所以按钮点击类测试必须跑在它前面。 */
let uiOk = false, uiExtra = '';
try {
  const u = new uiM.UI(null);
  uiOk = u.cards.size === gameM.TOWERS.length;
  uiExtra = `塔卡 ${u.cards.size} 张 / 节点缓存 ${Object.keys(u.n).length} 个`;
} catch (e) { uiExtra = e && e.message ? e.message : String(e); }
ok('UI 构造：无头 DOM 下生成塔盘与节点缓存，不抛异常', uiOk, uiExtra);

console.log(fail ? `\n失败 ${fail} 项` : '\n全部通过 ✅');
process.exit(fail ? 1 : 0);
