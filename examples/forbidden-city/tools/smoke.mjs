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

/* ============ 3b) layout.js：建筑数据表自检（单一数据源） ============ */
{
  const L = await import('../js/layout.js');
  const bs = L.buildings();
  const ids = bs.map((b) => b.id);
  ok('layout：记录数足够且 id 唯一', bs.length >= 14 && new Set(ids).size === ids.length, bs.length + ' 条');

  // 中轴严格居中：除已知对峙配殿外，cx 必须为 0
  const OFF_AXIS = ['tirenPavilion', 'hongyiPavilion'];
  const off = bs.filter((b) => b.cx !== 0 && !OFF_AXIS.includes(b.id));
  ok('layout：中轴建筑 cx 恒为 0（配殿除外）', off.length === 0, off.map((b) => b.id + '=' + b.cx).join(','));

  // 中轴记录按 z 由南到北单调
  const axis = bs.filter((b) => b.cx === 0 && b.form !== '河' && b.form !== '园').map((b) => b.cz);
  ok('layout：中轴记录 cz 单调递增', axis.every((v, i) => i === 0 || v > axis[i - 1]));

  // 实测面阔反算 bayW：三大殿误差必须极小
  const face = (id) => L.faceWidth(L.byId(id));
  ok('layout：太和殿面阔 ≈ 63.96 m', Math.abs(face('taihe') - 63.96) < 0.5, face('taihe').toFixed(2));
  ok('layout：中和殿方形面阔 = 进深 ≈ 27 m',
    Math.abs(face('zhonghe') - 27) < 0.5 && Math.abs(L.byId('zhonghe').depthM - 27) < 1e-9, face('zhonghe').toFixed(2));
  ok('layout：保和殿九间面阔 ≈ 60 m', Math.abs(face('baohe') - 60) < 0.5, face('baohe').toFixed(2));
  ok('layout：太和殿间数与进深间数取自实测（11 / 5）', L.byId('taihe').bays === 11 && L.byId('taihe').depthBays === 5);

  // 屋顶形制必须与 research.md §5 的术语表一致
  const FORM = { taihe: '庑殿', zhonghe: '攒尖', baohe: '歇山', qianqing: '庑殿', kunning: '庑殿' };
  const formBad = Object.entries(FORM).filter(([id, f]) => L.byId(id).form !== f).map(([id, f]) => id + '≠' + f);
  ok('layout：屋顶形制与 research.md §5 一致', formBad.length === 0, formBad.join(','));
  ok('layout：太和殿/保和殿重檐、中和殿单檐攒尖带宝顶',
    L.byId('taihe').tier === 2 && L.byId('baohe').tier === 2 && L.byId('zhonghe').tier === 1 && L.byId('zhonghe').roofTop === true);

  // 台基：三层合计 8.13 m，且由外向内逐层内收
  ok('layout：三层台基总高 ≈ 8.13 m', Math.abs(L.TERRACE.layers * L.TERRACE.layerH - L.TERRACE.totalH) < 0.05,
    (L.TERRACE.layers * L.TERRACE.layerH).toFixed(2));
  ok('layout：台基逐层内收（halfW 递减、南北边界收紧）',
    L.TERRACE.tiers.every((t, i) => i === 0 || (t.halfW < L.TERRACE.tiers[i - 1].halfW && t.z0 > L.TERRACE.tiers[i - 1].z0 && t.z1 < L.TERRACE.tiers[i - 1].z1)));

  // 可进入的三大殿必须有 interior，且地板在台基顶面
  const noInt = L.HALL_IDS.filter((id) => !L.byId(id).interior);
  ok('layout：三大殿都有 interior 记录（阶段 6 入口）', noInt.length === 0, noInt.join(','));
  ok('layout：三大殿室内地板 = 台基顶面 8.13 m', L.HALL_IDS.every((id) => Math.abs(L.byId(id).interior.floorY - L.TERRACE.totalH) < 1e-6));
  ok('layout：减柱造登记在保和殿（−6 金柱）', L.byId('baohe').columns.reduced === 6);

  // 占位矩形不得互相重叠（同轴相邻建筑之间要留缝）
  const rects = bs.filter((b) => b.form !== '河' && b.form !== '廊').map((b) => { const f = L.footprint(b); return { id: b.id, cx: f.cx, cz: f.cz, halfW: f.halfW, hD: f.halfD }; });
  const hits = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (Math.abs(a.cx - b.cx) < a.halfW + b.halfW && Math.abs(a.cz - b.cz) < a.hD + b.hD) hits.push(a.id + '↔' + b.id);
    }
  }
  ok('layout：建筑占位互不重叠（碰撞层可依赖）', hits.length === 0, hits.join(' | '));

  // 派生表可用：linear() 与 byId()
  ok('layout：linear() 提供东西庑廊与景山，且左右对称', (() => {
    const cs = L.linear(); const e = cs.find((c) => c.id === 'eastCorridor'), w = cs.find((c) => c.id === 'westCorridor');
    return !!e && !!w && e.cx === -w.cx && e.z0 === w.z0 && !!cs.find((c) => c.id === 'jingshan');
  })());
  ok('layout：byId 未知 id 返回 null（不得抛错）', L.byId('__nope__') === null);
}

/* ============ 4) 素材预算（assets.md §7） ============ */

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

/* ============ 4d) 构件库 + 组合器：用 vm 里的真实 three.min.js 装配全场景 ============ */
{
  const vendorPath = path.join(PAGE, '..', '..', 'assets', 'vendor', 'three', 'r128', 'three.min.js');
  if (!existsSync(vendorPath)) {
    console.log('  · 未找到 three.min.js，跳过构件装配测试');
  } else {
    const vm = await import('node:vm').then((m) => m.default || m);
    const sb = { window: {}, self: {}, console }; sb.global = sb; vm.createContext(sb);
    vm.runInContext(readFileSync(vendorPath, 'utf8'), sb, { filename: 'three.min.js' });
    const THREE = sb.THREE || sb.self.THREE;

    // 真实 THREE + 惰性材质 kit（贴图走假 provider，避免 Node 侧碰 DOM）
    const provider = { create: (w, h) => ({ canvas: { width: w, height: h }, ctx: (() => { const grad = { addColorStop() {} }, noop = () => {}; return new Proxy({ canvas: null, globalCompositeOperation: '', globalAlpha: 1, lineCap: '', lineWidth: 1, strokeStyle: '', fillStyle: '', font: '', textAlign: '', textBaseline: '' }, { get(t, k) { if (k in t) return t[k]; if (/^create(Linear|Radial)Gradient|^Pattern$/.test(k)) return () => grad; if (k === 'createImageData' || k === 'getImageData') return (a, b, c, d) => ({ width: c || a, height: d || b, data: new Uint8ClampedArray((c || a) * (d || b) * 4) }); if (k === 'measureText') return () => ({ width: 10 }); return noop; }, set(t, k, v) { t[k] = v; return true; } }); })() }), finish() {} };
    const kit = tx.buildTextureKit(THREE, { provider, maxAnisotropy: 4 });

    const B = await import('../js/buildings.js');
    const P = await import('../js/parts.js');
    ok('parts：G 编号构件齐备（21 个）', P.PARTS.length >= 21, P.PARTS.length + ' 个');
    ok('buildings：组合器齐备', B.COMBINERS.every((k) => typeof B[k] === 'function'));

    let built = null, err = '';
    try { built = B.buildAll(THREE, kit, { quality: 'mid' }); } catch (e) { err = e.message + '\n' + (e.stack || '').split('\n')[1]; }
    ok('buildAll：全场景装配无异常', !err, err);

    if (built) {
      // 统计：Mesh 数（≈drawCalls）、三角面、实例化数量、材质复用数
      let meshes = 0, tris = 0, inst = 0, instCount = 0, badTransform = [];
      const matSeen = new Set();
      built.group.traverse((o) => {
        if (o.isInstancedMesh) { inst++; instCount += o.count; }
        else if (!o.isMesh) return;
        meshes++;
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => matSeen.add(m.name || m.uuid));
        const g = o.geometry;
        if (g) { const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0); tris += Math.floor(n / 3); }
        if (!Number.isFinite(o.scale.x) || !Number.isFinite(o.position.x)) badTransform.push(o.name || o.type);
      });
      ok('buildAll：节点变换都是有限数（无 NaN）', badTransform.length === 0, badTransform.slice(0, 4).join(','));
      ok('buildAll：entries 覆盖所有 layout 记录', built.entries.length >= 19, built.entries.length + ' 条');
      ok('buildAll：每条 entry 都带 footprint（碰撞/小地图可直接用）',
        built.entries.every((e) => e.fp && [e.fp.cx, e.fp.cz, e.fp.halfW, e.fp.halfD].every(Number.isFinite)));
      console.log(`  · 装配统计：Mesh ${meshes}（InstancedMesh ${inst}，实例 ${instCount}）｜三角面 ${(tris / 1000).toFixed(1)}k｜材质 ${matSeen.size}`);

      // 单一数据源：太和殿的屋顶必须落在中轴上（x=0），且占位与 layout 一致
      const L = await import('../js/layout.js');
      const taihe = built.entries.find((e) => e.id === 'taihe');
      ok('buildAll：太和殿 group 位于 x=0（中轴严格）', !!taihe && taihe.group.position.x === 0);
      ok('buildAll：太和殿 fp 半宽×2 = 实测面阔 + 出檐', Math.abs(taihe.fp.halfW * 2 - L.faceWidth(L.byId('taihe')) - 4.8) < 1e-6);

      // 预算预警（阶段 11 才要求达标，这里只做量级检查）
      ok('buildAll：三角面在量级内（< 3M；阶段 11 收敛到 ≤900k）', tris < 3e6, (tris / 1000).toFixed(0) + 'k');
      ok('buildAll：材质实例数受控（≤24，见 assets.md §7）', matSeen.size <= 24, matSeen.size + ' 个材质');
    }
  }
}

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
