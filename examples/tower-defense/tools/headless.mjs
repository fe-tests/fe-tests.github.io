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
    addEventListener: noop, removeEventListener: noop,
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
  addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
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
  addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
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
g.renderer.resize(g.st); g.renderer.fitView(g.st, false); g.camIn(); g.camOut(); g.camFit();
ok('相机：缩放 / 看全图后视口有限且不低于铺满比例',
  Number.isFinite(g.renderer.view.zoom) && g.renderer.view.zoom >= g.renderer.view.fit - 1e-6,
  `zoom=${g.renderer.view.zoom.toFixed(2)} fit=${g.renderer.view.fit.toFixed(2)}`);
g.destroy();
ok('destroy：停止 rAF 调度并可安全卸载', g.raf === 0);

/* UI 在无头 DOM 下可实例化：塔盘按塔表生成，选择器为空不抛异常 */
let uiOk = false, uiExtra = '';
try {
  const u = new uiM.UI(null);
  uiOk = u.cards.size === gameM.TOWERS.length;
  uiExtra = `塔卡 ${u.cards.size} 张 / 节点缓存 ${Object.keys(u.n).length} 个`;
} catch (e) { uiExtra = e && e.message ? e.message : String(e); }
ok('UI 构造：无头 DOM 下生成塔盘与节点缓存，不抛异常', uiOk, uiExtra);

/* 入口模块：真实 boot 路径（index.html 的 #game 画布 → UI + Game 接线 → window.TD） */
let mainErr = '';
try { await import('../js/main.js'); } catch (e) { mainErr = e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : String(e); }
ok('入口 main.js：boot 无异常，__tdBooted 置位且版本号合法',
  !mainErr && window.__tdBooted === true && !!window.TD && /^\d+\.\d+\.\d+$/.test(window.TD.version),
  mainErr || `v${window.TD && window.TD.version}`);
const pageTest = window.TD ? window.TD.selfTest() : { ok: false, steps: ['TD 缺失'] };
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

console.log(fail ? `\n失败 ${fail} 项` : '\n全部通过 ✅');
process.exit(fail ? 1 : 0);
