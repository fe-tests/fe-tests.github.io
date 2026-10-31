/* 塔防要塞 · 纯逻辑冒烟测试（不启动浏览器）
 * 用法（站点根目录）：node examples/tower-defense/tools/smoke.mjs
 * 覆盖：关卡表自检 / 路径与网格 / 零塔必败 / 基线阵容过第一关 / 无 NaN / 波次能收敛 */
import { LEVELS, ENDLESS, selfCheck, endlessWave } from '../js/levels.js';
import { TOWERS, upgradeCost, investedGold, sellValue, dpsOf, towerLv } from '../js/towers.js';
import { ENEMIES } from '../js/enemies.js';
import { simulateLevel, newState, buildGrid, startWave, step, wavePreview, summary } from '../js/engine.js';
import { CELL, GRID_W, GRID_H, TILE, SKILLS } from '../js/config.js';
import { readFileSync } from 'node:fs';

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`);
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

console.log('塔防要塞 · 纯逻辑冒烟');
console.log(`数据：${LEVELS.length} 关 + 无尽，${TOWERS.length} 塔，${ENEMIES.length} 敌人`);

/* 0) 模块图：DOM 层模块也必须能在无浏览器环境里 import（顶层不碰 document/window） */
try {
  const [saveM, sfxM, fxM, renderM, inputM, gameM] = await Promise.all([
    import('../js/save.js'), import('../js/audio.js'), import('../js/fx.js'),
    import('../js/render.js'), import('../js/input.js'), import('../js/game.js'),
  ]);
  const need = [
    ['save.js', saveM, ['load', 'save', 'reset', 'recordLevel', 'recordEndless', 'totalStars', 'isUnlocked']],
    ['audio.js', sfxM, ['init', 'unlock', 'setEnabled', 'isEnabled', 'play', 'vibrate', 'soundNames']],
    ['fx.js', fxM, ['Fx', 'FX_KINDS']],
    ['render.js', renderM, ['Renderer', 'buildTerrain', 'drawTower', 'drawEnemy', 'RETICLE_LIFT']],
    ['input.js', inputM, ['Input', 'toTile']],
    ['game.js', gameM, ['Game', 'LEVELS', 'TOWERS', 'SKILLS', 'SPEEDS']],
  ];
  let missing = [];
  for (const [name, mod, keys] of need) for (const k of keys) if (!mod[k]) missing.push(`${name}.${k}`);
  ok('模块图：6 个 DOM 层模块可在 Node 里 import，关键导出齐全', missing.length === 0, missing.join(' | '));
  ok('触控建造准星抬升量 = 36px', renderM.RETICLE_LIFT === 36);

  /* DOM 契约（无浏览器）：ui.js / main.js 引用的每个 id、选择器、类名都必须在 index.html + ui.css 里存在 */
  const uiM = await import('../js/ui.js');
  ok('模块图：ui.js 可在 Node 里 import 且导出 UI', typeof uiM.UI === 'function');
  ok('模块图：main.js 可在 Node 里 import（无 #game 时静默跳过启动）',
    /^1\.\d+\.\d+$/.test(String((await import('../js/main.js')).VERSION)));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/ui.css', import.meta.url), 'utf8');
  const uiSrc = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const idLit = (src) => new Set([...src.matchAll(/['"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"]/g)].map((m) => m[1]));
  const wantIds = new Set([...uiSrc.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1])
    .concat([...uiSrc.matchAll(/getElementById\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))
    .concat([...mainSrc.matchAll(/getElementById\('([a-z0-9-]+)'\)/g)].map((m) => m[1])));
  const idsBlock = (uiSrc.match(/const IDS = \[([\s\S]*?)\];/) || [, ''])[1];
  for (const m of idsBlock.matchAll(/'([a-z0-9-]+)'/g)) wantIds.add(m[1]);
  const missIds = [...wantIds].filter((x) => !ids.has(x));
  ok('DOM 契约：UI 引用的 id 全部存在于 index.html', missIds.length === 0, `缺 ${missIds.slice(0, 8).join(', ')}`);
  const panes = ['ops', 'towers', 'enemies', 'sys'];
  ok('DOM 契约：4 个图鉴页签与面板成对存在',
    panes.every((p) => html.includes(`data-tab="${p}"`) && html.includes(`data-pane="${p}"`)));
  const setKeys = ['sound', 'grid', 'dmgNum', 'keep', 'auto'];
  ok('DOM 契约：5 个设置开关 + 特效/倍速分段控件齐备',
    setKeys.every((k) => html.includes(`data-set="${k}"`)) && html.includes('data-set="fx"') && html.includes('data-set="speed"'),
    `segb=${(html.match(/segb/g) || []).length}`);
  ok('DOM 契约：3 个技能按钮 id 与 SKILLS 对齐',
    SKILLS.every((s) => html.includes(`data-skill="${s.id}"`)), SKILLS.map((s) => s.id).join('/'));
  ok('DOM 契约：相机按钮 fit/in/out 与星级 3 个 span 就位',
    ['fit', 'in', 'out'].every((k) => html.includes(`data-cam="${k}"`)) && /id="stars"[^>]*>(\s*<span>★<\/span>){3}/.test(html.replace(/\s+/g, ' ')));
  /* 键位契约：帮助页与提示条写出去的按键，必须就是 input.js 真绑的键（文档替代码说谎是一类隐蔽回归） */
  const inputSrc = readFileSync(new URL('../js/input.js', import.meta.url), 'utf8');
  const keyBind = SKILLS.map((s, i) => {
    const m = inputSrc.match(new RegExp("k === '(\\w)' \\|\\| k === '\\w+'\\)\\s*\\{\\s*H\\.onKey\\('skill" + (i + 1) + "'"));
    return m ? m[1].toUpperCase() : '';
  });
  ok('键位契约：SKILLS[].key 标签与 input.js 的 skill1/2/3 绑定一致',
    SKILLS.every((s, i) => s.key === keyBind[i]), SKILLS.map((s, i) => `${s.key}=${keyBind[i]}`).join(' '));
  ok('文案契约：#hint 的键位写 1-9 与 J/K/L（无 1-0、无 Q/W/E 漂移）',
    /<b>1-9<\/b>/.test(html) && /<b>J\/K\/L<\/b>/.test(html) && !/1-0/.test(html) && !/Q\/W\/E/.test(html),
    (html.match(/id="hint"[^>]*>([\s\S]*?)<\/div>/) || [, ''])[1].replace(/\s+/g, ' ').trim().slice(0, 46) + '…');
  ok('DOM 契约：结算屏关键节点齐备',
    ['stars', 'w-next', 'd-why', 'e-best', 'lvgrid', 'tray-list', 'drawer', 'buildtip', 'nw-icons'].every((i) => ids.has(i)));
  const cssNeed = ['tcard', 'poor', 'sel', 'tabpane', 'helpbox', 'codex', 'cdx', 'swatch', 'tagline', 'nwi',
    'locked', 'end', 'cold', 'armed', 'ready', 'wait', 'bump', 'low', 'danger', 'shake', 'up-max', 'show', 'on', 'off'];
  const missCls = cssNeed.filter((c) => !css.includes('.' + c));
  ok('CSS 契约：UI 会切换的类名在 ui.css 里都有样式', missCls.length === 0, `缺 ${missCls.join(', ')}`);
  ok('入口契约：index.html 只加载 ui.css 与 main.js（无遗留脚手架引用）',
    html.includes('href="./css/ui.css"') && html.includes('src="./js/main.js"')
    && !html.includes('css/main.css') && !html.includes('js/state.js'),
    `link=${(html.match(/\.\/(css|js)\/[\w.-]+/g) || []).join(',')}`);
  const hooksGame = new Set([...(gameM.HOOKS || (readFileSync(new URL('../js/game.js', import.meta.url), 'utf8').match(/const HOOKS_DEFAULT = \{([\s\S]*?)\};/) || [, ''])[1]).matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
  const hooksUi = new Set([...uiSrc.match(/get hooks\(\)\s*\{[\s\S]*?\n  \}/)[0].matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]));
  const missHook = [...hooksGame].filter((k) => !hooksUi.has(k));
  ok('接线契约：game.js 声明的每个 hook 在 ui.js 都有实现', missHook.length === 0, `缺 ${missHook.join(', ')}`);
  ok('接线契约：ui.js 只实现 game.js 已知的 hook（无孤儿）',
    [...hooksUi].every((k) => hooksGame.has(k)), [...hooksUi].join(','));

  /* 特效池：档位预算内、更新收敛、震屏衰减 */
  const fx = new fxM.Fx(1);
  fx.burst(10, 10, { n: 30, color: '#fff' });
  fx.shards(10, 10, { n: 10 });
  fx.ring(10, 10, { r: 40 });
  fx.setAmbient('snow');
  for (let i = 0; i < 120; i++) fx.update(1 / 60);
  const capOk = fx.parts.length <= fx.cap && fx.rings.length <= 24;
  const decay = fx.shakeOffset;
  ok('特效池：粒子数受档位预算约束且随时间排空', capOk, `parts=${fx.parts.length}/${fx.cap} rings=${fx.rings.length}`);
  ok('震屏强度衰减为 0 且偏移有限', decay.x === 0 && decay.y === 0);
  fx.setTier(0);
  fx.burst(0, 0, { n: 60 });
  ok('低档位降级：粒子数不超过流畅档预算', fx.parts.length <= fx.cap, `${fx.parts.length}/${fx.cap}`);

  /* 存档：无 localStorage 时走内存兜底，脏数据自愈 */
  const s0 = saveM.load();
  ok('存档：解析出默认结构（unlocked≥1 / fx≤2 / speed≤2）', s0.v === 1 && s0.unlocked >= 1 && s0.fx <= 2 && s0.speed <= 2,
    `unlocked=${s0.unlocked} fx=${s0.fx} speed=${s0.speed}`);
  saveM.save({ sound: false, stars: { 1: 3 }, unlocked: 2, endless: { bestWave: 9, bestScore: 1234 } });
  const s1 = saveM.load();
  ok('存档：写入后读回（星级 / 解锁 / 无尽最佳）', s1.sound === false && s1.stars[1] === 3 && s1.unlocked === 2 && s1.endless.bestWave === 9,
    `stars=${JSON.stringify(s1.stars)} endless=${JSON.stringify(s1.endless)}`);
  ok('存档：totalStars 由星级重算', s1.totalStars === 3, `${s1.totalStars}`);
  saveM.reset();
  ok('存档：reset() 回到初始进度', saveM.load().unlocked === 1 && saveM.totalStars() === 0);

  /* 结算落档：星级 / 最高分（分数不能被截断成 3）/ 解锁 / 无尽最佳 */
  const rec1 = saveM.recordLevel(1, { win: true, stars: 3, score: 51234, wave: 12, kills: 40, leaks: 0, hp: 12, hpMax: 20 });
  const s2 = saveM.load();
  ok('存档：recordLevel 落档（★3 / 最高分 51234 / 解锁第 2 关）',
    s2.stars[1] === 3 && s2.best[1] === 51234 && s2.unlocked === 2 && rec1.unlockedNew === 1,
    `stars=${s2.stars[1]} best=${s2.best[1]} unlocked=${s2.unlocked}`);
  saveM.recordLevel(1, { win: true, stars: 1, score: 300, wave: 12, kills: 9, leaks: 6, hp: 3, hpMax: 20 });
  const s3 = saveM.load();
  ok('存档：重复通关不降级（星数与分数取历史最大）', s3.stars[1] === 3 && s3.best[1] === 51234, `★${s3.stars[1]} best=${s3.best[1]}`);
  const recE = saveM.recordEndless({ win: false, stars: 0, score: 99999, wave: 21, kills: 800, leaks: 3, hp: 0, hpMax: 20 });
  const s4 = saveM.load();
  ok('存档：recordEndless 记录最佳波次与分数', s4.endless.bestWave === 21 && s4.endless.bestScore === 99999 && recE.isBest,
    `wave=${s4.endless.bestWave} score=${s4.endless.bestScore}`);
  ok('存档：关卡列表解锁判定', saveM.isUnlocked(2) && !saveM.isUnlocked(3) && saveM.starsOfLevel(1) === 3);
  saveM.reset();

  /* 音频：无 WebAudio 环境里静默降级，不抛异常 */
  let sfxErr = '';
  try { sfxM.setEnabled(true); sfxM.play('shoot'); sfxM.play('kill', { n: 3 }); sfxM.vibrate(10); } catch (e) { sfxErr = String(e && e.message); }
  ok('音频：无 WebAudio 时静默降级（不抛异常）', !sfxErr, sfxErr);
} catch (e) {
  ok('模块图：6 个 DOM 层模块可在 Node 里 import', false, String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e));
}

/* 1) 数据一致性 */
const errs = selfCheck();
ok('关卡表自检（航点轴对齐 / 末点=基地 / 敌人 id / 星级单调）', errs.length === 0, errs.slice(0, 6).join(' | '));

/* 2) 网格与路径 */
let gridOk = true, pathInfo = [];
for (const lv of LEVELS.concat([ENDLESS])) {
  const g = buildGrid(lv);
  const base = g.at(lv.base[0], lv.base[1]);
  if (base !== CELL.PATH) { gridOk = false; pathInfo.push(`L${lv.id} 基地格不是道路(${base})`); }
  let pathCells = 0, pads = 0, blocks = 0;
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] === CELL.PATH) pathCells++;
    else if (g.cells[i] === CELL.PAD) pads++;
    else if (g.cells[i] === CELL.BLOCK) blocks++;
  }
  const buildable = g.cells.length - pathCells - blocks - pads;
  if (buildable < 40) { gridOk = false; pathInfo.push(`L${lv.id} 可建格过少(${buildable})`); }
  if (lv.pads && pads !== lv.pads.length) { gridOk = false; pathInfo.push(`L${lv.id} 石台数 ${pads}≠${lv.pads.length}`); }
}
ok('网格：基地在道路上 / 可建格充足 / 石台数一致', gridOk, pathInfo.slice(0, 4).join(' | '));
ok('网格尺寸 16×12 且逻辑分辨率 1024×768', GRID_W === 16 && GRID_H === 12 && GRID_W * TILE === 1024 && GRID_H * TILE === 768);

/* 3) 塔表 */
let towerOk = true;
for (const t of TOWERS) {
  if (t.lv.length !== 3) towerOk = false;
  for (let i = 1; i < 3; i++) {
    const a = towerLv(t, i), b = towerLv(t, i + 1);
    if (!(b.dmg >= a.dmg)) { towerOk = false; console.error(`  塔 ${t.id} Lv${i + 1} 伤害未提升`); }
    if (!(upgradeCost(t, i) > 0 && Number.isFinite(upgradeCost(t, i)))) towerOk = false;
    if (!(dpsOf(t, b) >= dpsOf(t, a))) { towerOk = false; console.error(`  塔 ${t.id} Lv${i + 1} 纸面 DPS 未提升`); }
  }
  if (sellValue(t, 3) >= investedGold(t, 3)) towerOk = false;
}
ok('塔表：3 级 / 属性递增 / 卖价 < 投入', towerOk, `最便宜 ${TOWERS[0].cost} 起`);

/* 4) 零塔必败（每关都应打穿基地，说明漏怪惩罚有效） */
let zeroOk = true;
const zeroNotes = [];
for (const lv of LEVELS.slice(0, 6)) {
  const r = simulateLevel(lv, { builds: [], maxSteps: 60 * 60 * 60 });
  if (!r.win && r.hp <= 0 && r.converged) zeroNotes.push(`L${lv.id} 第 ${r.wave} 波被打穿`);
  else { zeroOk = false; zeroNotes.push(`L${lv.id} 异常 win=${r.win} hp=${r.hp} conv=${r.converged}`); }
}
ok('零塔必败（前 6 关基地被攻破）', zeroOk, zeroNotes.join(' | '));

/* 5) 自动玩家（先升级后扩塔 + 技能）应打通全部 12 关，且不靠无脑堆塔 */
let winOk = true;
const rows = [];
for (const lv of LEVELS) {
  const r = simulateLevel(lv, { ai: true, maxSteps: 60 * 60 * 300 });
  if (!r.converged) { winOk = false; rows.push(`L${lv.id}未收敛`); continue; }
  if (!r.win || r.towers > 40) winOk = false;
  rows.push(`L${lv.id}${r.win ? '✓' : '✗'}/★${r.stars}/漏${r.leaks}/塔${r.towers}`);
}
ok('12 关由自动玩家打通（且单关塔数 ≤ 40）', winOk, rows.join(' '));

/* 6) 前期关卡要留胜余（≥2 星、漏怪 < 35%），证明新手能过 */
let earlyOk = true;
const early = [];
for (const lv of LEVELS.slice(0, 3)) {
  const r = simulateLevel(lv, { ai: true, maxSteps: 60 * 60 * 300 });
  if (!(r.win && r.stars >= 2 && r.leaks < lv.lives * 0.35)) earlyOk = false;
  early.push(`L${lv.id} 漏${r.leaks}/${lv.lives} ★${r.stars} ${(r.steps / 60) | 0}s`);
}
ok('第 1~3 关留有胜余（≥2 星 / 漏怪 <35%）', earlyOk, early.join(' | '));

/* 6b) 后期关卡要保持压力：至少一关自动玩家要漏怪（说明玩家需要按 tip 思考布阵） */
let lateOk = true, lateLeak = 0;
const late = [];
for (const lv of LEVELS.slice(-3)) {
  const r = simulateLevel(lv, { ai: true, maxSteps: 60 * 60 * 300 });
  if (!r.win) lateOk = false;
  lateLeak += r.leaks;
  late.push(`L${lv.id} 漏${r.leaks}/${lv.lives} ★${r.stars}`);
}
ok('第 10~12 关保持压力（通关且至少一关有漏怪）', lateOk && lateLeak > 0, late.join(' | '));

/* 7) 无尽：波次生成器与缩放到 40 波 */
const st = newState(ENDLESS, { seed: 3 });
st.autoStart = true;
let endlessOk = true, ew = [];
for (let n = 1; n <= 40; n++) {
  const w = endlessWave(n);
  if (!w.groups.length) endlessOk = false;
  const n0 = w.groups.reduce((s, g) => s + g.n, 0);
  if (n % 5 === 0 && !w.groups.some((g) => g.e.startsWith('boss'))) endlessOk = false;
  if (n === 1 || n === 20 || n === 40) ew.push(`第 ${n} 波 ${n0} 只 / 奖励 ${w.reward}`);
}
ok('无尽波次：生成非空 / 每 5 波含 BOSS', endlessOk, ew.join(' | '));
const er = simulateLevel(ENDLESS, { ai: true, maxSteps: 60 * 60 * 420 });
ok('无尽模式自动玩家 ≥ 8 波', er.wave >= 8, `第 ${er.wave} 波 / 分 ${er.score} / 塔 ${er.towers} / ${er.converged ? '已收敛' : '跑满上限'}`);

/* 8) 预览与开波 */
const s2 = newState(LEVELS[1], { seed: 5 });
const pv = wavePreview(s2);
ok('下一波预览可用', pv.length > 0, pv.map((p) => p.icon + '×' + p.n).join(' '));
const sw = startWave(s2, true);
ok('手动开波给提前奖励', sw.ok && sw.bonus > 0, `+${sw.bonus} 金币`);
for (let i = 0; i < 600; i++) step(s2, 1 / 60);
ok('推进 10 秒后已出怪', s2.enemies.length + s2.kills > 0, `在场 ${s2.enemies.length} / 击杀 ${s2.kills}`);
const sm = summary(s2);
ok('summary 字段完整', ['score', 'kills', 'leaks', 'hp', 'wave', 'stars'].every((k) => k in sm), JSON.stringify({ wave: sm.wave, score: sm.score }));

console.log(fail ? `\n失败 ${fail} 项` : '\n全部通过 ✅');
process.exit(fail ? 1 : 0);
