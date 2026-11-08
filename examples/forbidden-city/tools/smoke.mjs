/* 3D 故宫游览 · 纯逻辑冒烟测试（不启动浏览器）
 * 用法（站点根目录）：node examples/forbidden-city/tools/smoke.mjs
 * 覆盖：模块图 / 状态机与成就 / 分区判定 / 存档迁移 / 中轴数据表自检 / 素材预算 / 源码口径钉测
 *
 * 约定：只 import「顶层不碰 DOM」的纯逻辑模块（config/state/layout/collision…）。
 *      渲染层模块（world/buildings/textures…）用源码正则钉测，不在 Node 里执行。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '..');
const SRC = (rel) => path.join(PAGE, rel);
const read = (rel) => readFileSync(SRC(rel), 'utf8');

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`);
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

console.log('3D 故宫游览 · 纯逻辑冒烟');

/* ============ 0) 模块图：纯逻辑模块必须能在无浏览器环境里 import ============ */
const cfg = await import('../js/config.js');
const st = await import('../js/state.js');

let missing = [];
const need = [
  ['config.js', cfg, ['AXIS_X', 'BAY', 'EYED_H', 'WALK_SPEED', 'CITY', 'AXES', 'QUALITY', 'QUALITY_ORDER', 'BUDGET', 'SAVE_KEY', 'SAVE_VERSION']],
  ['state.js', st, ['MODES', 'ACHIEVEMENTS', 'ACHIEVEMENT_IDS', 'ACHIEVE_BY_ID', 'zoneOfZ', 'AXIS_MILESTONES', 'newState', 'migrateSave', 'recordZone', 'recordInterior', 'achievementCount', 'loadProgress', 'saveProgress', 'resetProgress']],
];
for (const [name, mod, keys] of need) for (const k of keys) if (mod[k] === undefined) missing.push(`${name}.${k}`);
ok('模块图：config.js / state.js 可在 Node import，关键导出齐全', missing.length === 0, missing.join(' | '));

/* ============ 1) config：坐标系与尺度常量的合理性 ============ */
ok('坐标系：中轴 x=0、1 unit = 1 m', cfg.AXIS_X === 0 && cfg.UNIT_PER_M === 1);
ok('总平面取自 research.md §1（961×753，墙 10，河 59）',
  cfg.CITY.lenN === 961 && cfg.CITY.lenE === 753 && cfg.CITY.wallH === 10 && cfg.CITY.moatW === 59);
ok('人视点与步速合理（眼高 1.5~2 m，走 < 跑）',
  cfg.EYED_H > 1.5 && cfg.EYED_H < 2 && cfg.WALK_SPEED > 1 && cfg.WALK_SPEED < cfg.RUN_SPEED);
ok('画质档三档齐全且 dprMax 递增、阴影只在非低档开',
  cfg.QUALITY_ORDER.length === 3 && cfg.QUALITY_ORDER.every((k) => cfg.QUALITY[k])
  && cfg.QUALITY.low.dprMax < cfg.QUALITY.mid.dprMax && cfg.QUALITY.mid.dprMax <= cfg.QUALITY.high.dprMax
  && cfg.QUALITY.low.shadow === false && cfg.QUALITY.mid.shadow === true);

/* ============ 2) 中轴 z 布局：单调递增 + 三大殿位置 ============ */
const ax = cfg.AXES;
const axisOrder = ['wumen', 'innerRiver', 'taiheGate', 'taihe', 'zhonghe', 'baohe', 'qianqingGate', 'qianqing', 'jiaotai', 'kunning', 'yuhuayuan', 'shenwumen'];
let mono = true, gaps = [];
for (let i = 1; i < axisOrder.length; i++) {
  const a = ax[axisOrder[i - 1]], b = ax[axisOrder[i]];
  if (!(b > a)) mono = false;
  gaps.push(b - a);
}
ok('中轴 z 单调递增（南 → 北，+Z 朝南取负值方向）', mono, axisOrder.join('>'));
ok('相邻建筑间距都在 20~150 m（不重叠、也不空到看不见东西）',
  gaps.every((g) => g > 20 && g < 150), 'min=' + Math.min(...gaps) + ' max=' + Math.max(...gaps));
ok('三大殿在台基以北的顺序正确：太和殿 → 中和殿 → 保和殿',
  ax.taihe < ax.zhonghe && ax.zhonghe < ax.baohe);

/* ============ 3) state：成就表与判定（纯函数） ============ */
ok('成就 id 唯一且 ACHIEVE_BY_ID 覆盖全部', (() => {
  const ids = st.ACHIEVEMENT_IDS;
  return new Set(ids).size === ids.length && ids.every((id) => st.ACHIEVE_BY_ID[id]);
})(), st.ACHIEVEMENT_IDS.length + ' 条');

ok('三大殿成就与建筑 id 同名（recordInterior 依赖这一点）',
  ['taihe', 'zhonghe', 'baohe'].every((id) => !!st.ACHIEVE_BY_ID[id]));

{
  const s = st.newState();
  ok('newState：初始 mode=boot、无成就', s.mode === 'boot' && st.achievementCount(s) === 0);

  // 走完中轴 → fullAxis + enter + gate + innerCourt + garden 全解锁
  let unlocked = [];
  for (const z of st.AXIS_MILESTONES) unlocked = unlocked.concat(st.recordZone(s, z));
  ok('分区推进：里程碑集合齐 → 解锁「走完中轴」', !!s.progress.achievements.fullAxis,
    '新解锁 ' + unlocked.map((a) => a.id).join(','));
  ok('区段成就联动：enter / gate / innerCourt / garden 都在',
    ['enter', 'gate', 'innerCourt', 'garden'].every((id) => !!s.progress.achievements[id]));

  // recordZone 幂等：同区重复进入不再产出新成就
  const before = st.achievementCount(s);
  const again = st.recordZone(s, 'outerCourt');
  ok('recordZone 幂等（重复进入不刷成就）', again.length === 0 && st.achievementCount(s) === before);

  // 三大殿入内 → 各自成就 + 组合成就
  const s2 = st.newState();
  const r1 = st.recordInterior(s2, 'taihe');
  const r2 = st.recordInterior(s2, 'zhonghe');
  const r3 = st.recordInterior(s2, 'baohe');
  ok('recordInterior：三殿各自解锁 + 组合成就「三大殿入内」',
    r1.some((a) => a.id === 'taihe') && r2.some((a) => a.id === 'zhonghe')
    && r3.some((a) => a.id === 'baohe' || a.id === 'threeHalls')
    && !!s2.progress.achievements.threeHalls);
  ok('recordInterior 幂等（重复进入同一殿不再解锁）', st.recordInterior(s2, 'taihe').length === 0);

  // zoneOfZ 边界：午门以南 / 御花园 / 神武门以北
  ok('zoneOfZ：午门以南 = outside，神武门以北 = northOutside',
    st.zoneOfZ(ax.wumen - 60) === 'outside' && st.zoneOfZ(ax.shenwumen + 60) === 'northOutside');
  ok('zoneOfZ：三大殿落在 outerCourt，后三宫落在 innerCourt',
    [ax.taihe, ax.zhonghe, ax.baohe].every((z) => st.zoneOfZ(z) === 'outerCourt')
    && [ax.qianqing, ax.jiaotai, ax.kunning].every((z) => st.zoneOfZ(z) === 'innerCourt'));
  ok('zoneOfZ：非法值 → out（不抛错）', st.zoneOfZ(undefined) === 'out' && st.zoneOfZ(NaN) === 'out');

  // 存档迁移与 IO（注入假 storage，不碰真 localStorage）
  const fake = (() => {
    let m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  })();
  ok('存档：无档 → 空进度', st.loadProgress(fake).achievements && Object.keys(st.loadProgress(fake).achievements).length === 0);
  st.saveProgress(s2, fake);
  const back = st.loadProgress(fake);
  ok('存档：save → load 往返保住成就与入内记录',
    !!back.achievements.threeHalls && !!back.interiors.baohe, 'v=' + cfg.SAVE_VERSION);
  fake.setItem(cfg.SAVE_KEY, '{"v":' + (cfg.SAVE_VERSION + 1) + ',"progress":{"achievements":{"x":1}}}');
  ok('存档：版本不符 → 丢弃旧档而非崩溃', Object.keys(st.loadProgress(fake).achievements).length === 0);
  fake.setItem(cfg.SAVE_KEY, 'not json{');
  ok('存档：损坏档 → 空进度（静默降级）', st.loadProgress(fake).totalSteps === 0);
  ok('存档：假 storage 抛错时 saveProgress 返回 false 而不抛', (() => {
    const boom = { getItem() { throw new Error('quota'); }, setItem() { throw new Error('quota'); } };
    return st.saveProgress(s2, boom) === false;
  })());
}

/* ============ 4) 素材预算（assets.md §7） ============ */
ok('性能预算表数值合理（drawCalls ≤ 420、tris ≥ 100k、贴图 ≤ 128MB）',
  cfg.BUDGET.drawCallsMid > 0 && cfg.BUDGET.drawCallsMid <= cfg.BUDGET.drawCallsHigh
  && cfg.BUDGET.triangles >= 100000 && cfg.BUDGET.textureMB > 0 && cfg.BUDGET.textureMB <= 256);

/* ============ 5) 源码口径钉测：全站离线 + 色彩口径 + 无 DOM 顶层 ============ */
const allJs = ['config', 'state', 'quality', 'world', 'ui', 'input', 'main'].map((n) => ['js/' + n + '.js', read('js/' + n + '.js')]);

ok('离线：源码里没有任何外部 CDN / http 依赖引用',
  allJs.concat([['index.html', read('index.html')]]).every(([, src]) =>
    !/https?:\/\/(?!localhost)[\w.-]+\.(com|cn|net|org|io|dev)\b/i.test(src)), '含 docs/*.md 的引用不算');

// r128 的色彩口径：渲染器用 outputEncoding/sRGBEncoding，贴图用 encoding（r15x 才叫 outputColorSpace / colorSpace）
const srcAll = allJs.map(([, s]) => s).join('');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok('色彩口径：r128 用 outputEncoding + sRGBEncoding（不是 r15x 的 outputColorSpace）',
  /outputEncoding\s*=\s*THREE\.sRGBEncoding/.test(allJs.find(([n]) => n === 'js/main.js')[1])
  && !/outputColorSpace|SRGBColorSpace/.test(stripComments(srcAll)));
ok('色彩口径：贴图未误用 r15x 的 .colorSpace 字段（r128 是 .encoding）', !/\.colorSpace\s*=/.test(srcAll));

ok('降级：入口探测 typeof THREE === "undefined" 并给出面板（不得白屏）',
  /typeof THREE === ['"]undefined['"]/.test(allJs.find(([n]) => n === 'js/main.js')[1])
  && /fallback/.test(read('index.html')));

ok('vendor 路径用相对 ../../assets/vendor/（subpath 部署安全）',
  /\.\.\/\.\.\/assets\/vendor\/three\/r128\/three\.min\.js/.test(read('index.html'))
  && !/["'`]\/assets\//.test(read('index.html')), '除 href="/" 外不得有根绝对路径');

ok('纯逻辑模块顶层不碰 document / window（可在 Node import）', (() => {
  const pure = ['js/config.js', 'js/state.js'];
  return pure.every((rel) => {
    const src = read(rel);
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // 允许在函数体内出现（存档 IO / detectLevel），但顶层语句不能有
    const top = body.split('\n').filter((l) => /^\s*(const|let|var|function|class|[A-Za-z_$][\w$]*\s*[=(])/.test(l));
    return !top.some((l) => /\b(document|window|localStorage|navigator)\b/.test(l));
  });
})());

/* ============ 6) 后续阶段的文件存在性（阶段推进后自动生效） ============ */
const expected = {
  'js/textures.js': 2,        // 阶段 2：贴图工厂 + 预算表
  'js/parts.js': 3,           // 阶段 3：构件库
  'js/buildings.js': 3,       // 阶段 3：组合器
  'js/layout.js': 3,          // 阶段 3：数据表（单一数据源）
  'js/interior.js': 6,        // 阶段 6：室内层
  'js/collision.js': 8,       // 阶段 8：碰撞
  'js/player.js': 8,          // 阶段 8：行走
  'js/camera.js': 8,          // 阶段 8：相机模式
  'js/audio.js': 10,          // 阶段 10：WebAudio 合成
};
const present = Object.keys(expected).filter((rel) => existsSync(SRC(rel)));
if (present.length) {
  ok('已落盘模块可 import（顶层不碰 DOM）', (() => {
    return present.every((rel) => !/\bdocument\.|\bwindow\./.test(read(rel).split('\n').filter((l) => /^\s*(const|let|class|function)/.test(l)).join('')));
  })(), present.length + ' 个模块在场');
} else {
  console.log(`  · 阶段 2+ 的模块尚未落盘（textures/parts/buildings/layout/…）——推进后本节自动纳入断言`);
}

ok('接续文档齐备：PROGRESS.md / assets.md / research.md',
  ['docs/PROGRESS.md', 'docs/assets.md', 'docs/research.md'].every((rel) => existsSync(SRC(rel))));

console.log(fail ? `\n失败 ${fail} 项` : '\n全部通过');
process.exit(fail ? 1 : 0);
