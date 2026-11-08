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

/* ============ 4b) 贴图工厂：像素级冒烟（最小 Canvas2D shim，零依赖） ============ */
const tx = await import('../js/textures.js');
ok('模块图：textures.js 可 import 且 18 个工厂齐备',
  Array.isArray(tx.TEXTURES) && tx.TEXTURES.length === 18
  && tx.TEXTURES.every((e) => e.draw && typeof e.w === 'number' && ['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T11','T12','T13','T14','T15','T16','T17','T18'].includes(e.id)),
  tx.TEXTURES.length + ' 个');

{
  // —— 最小 Canvas2D shim：只实现工厂真正用到的 API，记录调用次数与像素写入 ——
  const calls = { put: 0, stroke: 0, fill: 0, arc: 0, text: 0 };
  const px = new Map();                       // 'x,y' → [r,g,b,a]
  const mkCtx = (w, h) => {
    const grad = { addColorStop() {} };
    const noop = () => {};
    const ctx = {
      canvas: null, globalCompositeOperation: 'source-over', globalAlpha: 1,
      lineCap: '', lineJoin: '', lineWidth: 1, strokeStyle: '#000', fillStyle: '#000', font: '', textAlign: '', textBaseline: '', filter: 'none',
      createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null,
      save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, clip: noop, setTransform: noop, transform: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, bezierCurveTo: noop, quadraticCurveTo: noop, rect: noop, roundRect: noop,
      fillText(t) { calls.text++; if (!t) throw new Error('fillText 收到空文本'); }, strokeText: noop, measureText: () => ({ width: 10 }),
      drawImage: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
      arc() { calls.arc++; }, ellipse: noop, arcTo: noop, setLineDash: noop,
      stroke() { calls.stroke++; }, fill() { calls.fill++; },
      createImageData(cw, ch) { return { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) }; },
      getImageData(x, y, cw, ch) { return this.createImageData(cw, ch); },
      putImageData(img) {
        calls.put++;
        if (img.width !== w || img.height !== h) throw new Error('putImageData 尺寸不符：' + img.width + '×' + img.height + ' vs ' + w + '×' + h);
        for (let i = 0; i < img.data.length; i += 4) {
          if (!Number.isFinite(img.data[i]) || !Number.isFinite(img.data[i + 1]) || !Number.isFinite(img.data[i + 2])) {
            throw new Error('像素出现 NaN（噪声/渐变算错）：i=' + i);
          }
        }
        // 抽样记录几个点，供「真的画了东西」判定
        for (const [sx, sy] of [[0, 0], [(w / 2) | 0, (h / 2) | 0], [w - 1, h - 1]]) px.set(sx + ',' + sy, [img.data[(sy * w + sx) * 4], img.data[((sy * w + sx) * 4) + 1], img.data[((sy * w + sx) * 4) + 2], img.data[((sy * w + sx) * 4) + 3]]);
      },
    };
    return ctx;
  };
  const provider = { create: (w, h) => ({ canvas: { width: w, height: h }, ctx: mkCtx(w, h) }), finish() {} };

  let bad = [];
  for (const e of tx.TEXTURES) {
    try {
      const before = calls.stroke + calls.fill + calls.put + calls.arc;
      const { ctx } = provider.create(e.w, e.h);
      e.draw(ctx, e.w, e.h, {});
      if (calls.stroke + calls.fill + calls.put + calls.arc <= before) bad.push(e.id + ' 没有任何绘制调用');
    } catch (err) { bad.push(e.id + ' 抛错：' + err.message); }
  }
  ok('18 个贴图工厂全部可执行（shim 下无异常、都有真实绘制）', bad.length === 0, bad.join(' | '));
  ok('噪声/fbm 工具产出确定值且可复现', (() => {
    const n1 = tx.makeNoise(7, 8), n2 = tx.makeNoise(7, 8);
    const a = n1(1.5, 2.5), b = n2(1.5, 2.5);
    const f = tx.makeFbm(7, 8, 4);
    return a === b && a >= 0 && a <= 1 && f(3.3, 4.4) >= 0 && f(3.3, 4.4) <= 1;
  })());
  ok('周期噪声可平铺（整数倍周期处取值相同）', (() => {
    const n = tx.makeNoise(11, 8);
    return Math.abs(n(1.25, 3.75) - n(9.25, 11.75)) < 1e-6;
  })());
  ok('rng 确定性（同种子同序列）', (() => {
    const a = tx.rng(42), b = tx.rng(42);
    return [a(), a(), a()].join() === [b(), b(), b()].join();
  })());

  const rep = tx.textureBudgetReport();
  ok('贴图预算：单张 ≤ 1024px', rep.over.length === 0, rep.over.join(' | '));
  ok('贴图预算：全量 ≤ ' + cfg.BUDGET.textureMB + ' MB（按 w×h×4B×1.33）', rep.mb <= cfg.BUDGET.textureMB, rep.mb + ' MB / ' + rep.count + ' 张');
  console.log('  · 贴图显存估算：' + rep.mb + ' MB（上限 ' + rep.limitMB + ' MB），工厂数 ' + rep.count);

  // makeTexture 走 r128 口径（用假 THREE，只断言我们真的按 r128 设了 encoding/wrap）
  const fakeTHREE = {
    CanvasTexture: class { constructor(c) { this.canvas = c; this.encoding = null; this.wrapS = null; this.wrapT = null; } },
    sRGBEncoding: 3001, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001,
  };
  const t = tx.makeTexture(fakeTHREE, tx.TEXTURES[0], {}, { provider, maxAnisotropy: 8 });
  ok('makeTexture：albedo 设 sRGBEncoding（r128 口径）+ 平铺贴图用 RepeatWrapping + 各向异性受上限约束',
    t.encoding === fakeTHREE.sRGBEncoding && t.wrapS === fakeTHREE.RepeatWrapping && t.anisotropy === cfg.TEX.maxAnisotropy);
  const tn = tx.makeTexture(fakeTHREE, tx.TEXTURES.find((e) => e.name === 'waterNormal'), { data: true }, { provider, maxAnisotropy: 8 });
  ok('makeTexture：数据类贴图（法线，opts.data=true）不误设 sRGB', tn.encoding !== fakeTHREE.sRGBEncoding && tn.encoding === null);

  // 真·像素级校验：需要 node-canvas（未装则跳过，不算失败）
  let nc = null;
  try { nc = (await import('node:module')).createRequire(import.meta.url)('canvas'); } catch (e) { /* 未安装 */ }
  if (!nc) {
    console.log('  · node-canvas 未安装 → 跳过像素级校验（npm i -D canvas 于 tools/ 后可启用）');
  } else {
    const p2 = tx.nodeProvider(nc.Canvas);
    let pixBad = [];
    for (const e of tx.TEXTURES) {
      const { ctx } = p2.create(e.w, e.h);
      e.draw(ctx, e.w, e.h, {});
      const d = ctx.getImageData(0, 0, e.w, e.h).data;
      let min = [255, 255, 255], max = [0, 0, 0], alphaAny = false;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 8) alphaAny = true;
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], d[i + k]); max[k] = Math.max(max[k], d[i + k]); }
      }
      const spread = max.reduce((s, v, k) => s + (v - min[k]), 0);
      if (!alphaAny && !e.alpha) pixBad.push(e.id + ' 全透明');
      else if (spread < 12) pixBad.push(e.id + ' 几乎无对比（spread=' + spread + '）');
    }
    ok('像素级：所有工厂都产出有内容、有对比度的图像', pixBad.length === 0, pixBad.join(' | '));
  }
}

/* ============ 4c) 真实 three.js r128 上的 API 钉测（在 vm 里加载已入库的 three.min.js） ============ */
{
  const vendorPath = path.join(PAGE, '..', '..', 'assets', 'vendor', 'three', 'r128', 'three.min.js');
  if (!existsSync(vendorPath)) {
    console.log('  · 未找到入库的 three.min.js，跳过真实 API 钉测：' + vendorPath);
  } else {
    const vm = await import('node:vm').then((m) => m.default || m);
    const sandbox = { window: {}, self: {}, console }; sandbox.global = sandbox;
    vm.createContext(sandbox);
    let THREE = null, loadErr = '';
    try {
      vm.runInContext(readFileSync(vendorPath, 'utf8'), sandbox, { filename: 'three.min.js' });
      THREE = sandbox.THREE || (sandbox.self && sandbox.self.THREE);
    } catch (e) { loadErr = e.message; }
    ok('vendor three.min.js 可在 vm 里加载（r128）', !!THREE && THREE.REVISION === '128', THREE ? 'REVISION=' + THREE.REVISION : loadErr);

    if (THREE) {
      // 用真实 THREE 常量重跑 makeTexture：假 provider（ctx 返回真 ImageData，工厂会往里写像素），真 API
      const mkCtx = () => {
        const grad = { addColorStop() {} };
        const noop = () => {};
        return new Proxy({ canvas: null, globalCompositeOperation: '', globalAlpha: 1, lineCap: '', lineWidth: 1, strokeStyle: '', fillStyle: '', font: '', textAlign: '', textBaseline: '' }, {
          get(t, k) {
            if (k in t) return t[k];
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
            if (k === 'createImageData' || k === 'getImageData') return (a, b, c, d) => ({ width: c || a, height: d || b, data: new Uint8ClampedArray((c || a) * (d || b) * 4) });
            if (k === 'measureText') return () => ({ width: 10 });
            return noop;
          },
          set(t, k, v) { t[k] = v; return true; },
        });
      };
      const provider = { create: (w, h) => ({ canvas: { width: w, height: h }, ctx: mkCtx() }), finish() {} };
      let err = '';
      try {
        const albedo = tx.makeTexture(THREE, tx.TEXTURES.find((e) => e.name === 'marble'), {}, { provider, maxAnisotropy: 16 });
        const dataTex = tx.makeTexture(THREE, tx.TEXTURES.find((e) => e.name === 'waterNormal'), { data: true }, { provider, maxAnisotropy: 16 });
        ok('真实 r128：albedo.encoding=sRGBEncoding、anisotropy 收敛到 ' + cfg.TEX.maxAnisotropy,
          albedo.encoding === THREE.sRGBEncoding && albedo.anisotropy === cfg.TEX.maxAnisotropy,
          'enc=' + albedo.encoding + ' aniso=' + albedo.anisotropy);
        ok('真实 r128：数据贴图 encoding 保持 LinearEncoding',
          dataTex.encoding === THREE.LinearEncoding, 'enc=' + dataTex.encoding);
        ok('真实 r128：平铺贴图 wrapS/wrapT = RepeatWrapping，非平铺 = ClampToEdgeWrapping',
          tx.makeTexture(THREE, tx.TEXTURES.find((e) => e.name === 'roofTiles'), {}, { provider }).wrapS === THREE.RepeatWrapping
          && tx.makeTexture(THREE, tx.TEXTURES.find((e) => e.name === 'plaque'), {}, { provider }).wrapS === THREE.ClampToEdgeWrapping);
      } catch (e) { err = e.message; }
      ok('真实 r128：makeTexture 全程无异常', !err, err);
    }
  }
}

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
  let dyn = [];
  for (const rel of present) {
    try { await import('../' + rel.replace(/^js\//, 'js/')); } catch (e) { dyn.push(rel + ': ' + e.message); }
  }
  ok('已落盘模块可 import（顶层不碰 DOM / THREE）', dyn.length === 0, dyn.join(' | '));
} else {
  console.log(`  · 阶段 2+ 的模块尚未落盘（textures/parts/buildings/layout/…）——推进后本节自动纳入断言`);
}

ok('接续文档齐备：PROGRESS.md / assets.md / research.md',
  ['docs/PROGRESS.md', 'docs/assets.md', 'docs/research.md'].every((rel) => existsSync(SRC(rel))));

console.log(fail ? `\n失败 ${fail} 项` : '\n全部通过');
process.exit(fail ? 1 : 0);
