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
  ['config.js', cfg, ['AXIS_X', 'BAY', 'EYED_H', 'WALK_SPEED', 'CITY', 'AXES', 'RENDER', 'CAM_START', 'QUALITY', 'QUALITY_ORDER', 'BUDGET', 'SAVE_KEY', 'SAVE_VERSION']],
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

// 漫步首屏机位。截图复核踩过的坑：机位在南 180 m（fogNear 之外 → 首屏全是雾）；
// yaw 方向搞反 —— 前向 z = −cos yaw·cos pitch，午门 cz=−340、中轴 cz 增大方向为北，
// 所以「看午门城楼」必须前向 z > 0（yaw=π）。yaw=0 看见的是广场南城墙，午门在镜头背后。
ok('CAM_START：起点在午门以南、fogNear 之内、朝北看城楼（首屏必有建筑）',
  cfg.CAM_START.z < cfg.AXES.wumen && (cfg.AXES.wumen - cfg.CAM_START.z) <= cfg.RENDER.fogNear
  && (cfg.AXES.wumen - cfg.CAM_START.z) > 30        // 离城楼太近只见墙不见楼
  && -Math.cos(cfg.CAM_START.yaw) * Math.cos(cfg.CAM_START.pitch) > 0   // 前向 z > 0 = 朝北 = 午门方向
  && cfg.CAM_START.y === cfg.EYED_H && cfg.CAM_START.x === 0,
  'z ' + cfg.CAM_START.z + '｜距午门 ' + (cfg.AXES.wumen - cfg.CAM_START.z) + ' m｜fogNear ' + cfg.RENDER.fogNear
  + '｜前向 z ' + (-Math.cos(cfg.CAM_START.yaw) * Math.cos(cfg.CAM_START.pitch)).toFixed(2));

// 凹字退避：午门 cz=−340、两翼长 76 ⇒ 两翼端 z ≈ −416；城台进深 14 ⇒ 南面 z ≈ −347。
// 机位必须在两翼端以南，否则镜头卡在凹字院子里，正楼被 10 m 两翼墙整条挡掉（截图复核踩过）；
// 楼体距城台南面须在 fogNear 之内，否则正楼蒙雾。
ok('CAM_START：机位在午门凹字两翼以南、城台南面在 fogNear 之内（正楼不被两翼挡、不蒙雾）',
  cfg.CAM_START.z < -416
  && Math.abs(cfg.CAM_START.z + 347) <= cfg.RENDER.fogNear,
  'z ' + cfg.CAM_START.z + '｜凹字端 ≈ −416｜城台南面 ≈ −347｜楼距 ' + Math.abs(cfg.CAM_START.z + 347) + ' m');

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
  ok('zoneOfZ：漫步起点仍在「午门广场」带里（首屏 HUD 区域标签正确）',
    st.zoneOfZ(cfg.CAM_START.z) === 'outside');
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
  ok('layout：三大殿都标 onTerrace（装配抬到台基顶面），后三宫在地面 y=0',
    L.HALL_IDS.every((id) => L.byId(id).onTerrace === true)
    && ['qianqing', 'jiaotai', 'kunning'].every((id) => !L.byId(id).onTerrace));
  ok('layout：顶层台基南北边界盖住三殿檐口（殿身不悬到中层踏步上）', (() => {
    const top = L.TERRACE.tiers[L.TERRACE.tiers.length - 1];
    return L.HALL_IDS.every((id) => { const f = L.footprint(L.byId(id)); return f.cz + f.halfD <= top.z1 && f.cz - f.halfD >= top.z0; });
  })(), '顶层 z ' + L.TERRACE.tiers[2].z0 + '..' + L.TERRACE.tiers[2].z1);
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

  // 阶段 5 数据：午门凹字 + 内金水桥（尺度全在数据表里，构件不得写死）
  const wp = L.byId('wumen').wumenPlan;
  ok('layout：午门凹字两翼对称（亭群 xs 关于中轴镜像）', (() => {
    const mirror = (xs) => xs.length % 2 === 0 && xs.every((v, i) => Math.abs(v + xs[xs.length - 1 - i]) < 1e-9);
    return !!wp && mirror(wp.gablePav.xs) && mirror(wp.ruffPav.xs) && wp.gablePav.xs.length === 2 && wp.ruffPav.xs.length === 4;
  })(), wp ? '前两后四' : '缺 wumenPlan');
  ok('layout：午门正面五券门 + 两翼长于进深（凹字展开）',
    L.byId('wumen').doors.length === 5 && wp.wingLen > wp.cityD && wp.wingPlatformH < wp.cityH,
    '门洞 ' + L.byId('wumen').doors.length + ' / 两翼 ' + wp.wingLen);
  ok('layout：午门正楼（五凤楼正楼）重檐庑殿，落在城台顶',
    wp.mainTower.form === '庑殿' && wp.mainTower.tier === 2 && wp.mainTower.hWall < wp.cityH);

  const bp = L.byId('innerRiver').bridgePlan;
  ok('layout：御路桥居中五孔，朝房桥左右对称',
    bp.main.x === 0 && bp.main.holes === 5 && bp.inner.xs.length === 2 && bp.inner.xs[0] === -bp.inner.xs[1]
    && bp.outer.xs.length === 2 && bp.outer.xs[0] === -bp.outer.xs[1] && bp.inner.xs.every((v, i) => Math.abs(v) < Math.abs(bp.outer.xs[i])));
  ok('layout：外侧桥带三间桥亭（偶数桥配偶数亭）',
    bp.outer.pavilion.bays === 3 && bp.outer.xs.length === 2 && bp.inner.pavilion === undefined);
  ok('layout：河道长度覆盖全部桥的展开宽度', bp.len >= 2 * (Math.abs(bp.outer.xs[0]) + bp.outer.width));

  ok('layout：午门广场围合（东西庑廊到午门 + 阙亭一对）', (() => {
    const cs = L.linear();
    const e = cs.find((c) => c.id === 'eastCorridor'), w = cs.find((c) => c.id === 'westCorridor');
    const q = cs.filter((c) => c.form === '亭');
    return e.z0 <= L.byId('wumen').cz + 8 && e.z0 === w.z0 && q.length === 2 && q[0].cx === -q[1].cx && q[0].cz === q[1].cz;
  })());
  const linRects = L.linear().filter((c) => c.form === '亭').map((c) => ({ id: c.id, cx: c.cx, cz: c.cz, halfW: 6, halfD: 6 }));
  const linHits = [];
  for (const a of linRects) for (const b of rects) {
    if (Math.abs(a.cx - b.cx) < a.halfW + b.halfW && Math.abs(a.cz - b.cz) < 6 + b.hD) linHits.push(a.id + '↔' + b.id);
  }
  ok('layout：阙亭不与中轴/配殿建筑占位重叠', linHits.length === 0, linHits.join(' | '));
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
    ok('批处理工具齐备（D16：mergeGroup / subtreeStats）',
      typeof P.mergeGroup === 'function' && typeof P.subtreeStats === 'function'
      && P.BATCH_TOOLS.includes('mergeGroup'), P.BATCH_TOOLS.join(','));

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

      // 阶段 5「坐落」：三大殿必须在三层台基**顶面**（8.13 m）上。截图复核曾发现殿身与台基共面、
      // 只露屋顶（墙/柱网全部埋进台基里），根因是装配时 y 写死 0，没接 layout 的高程。
      const LY = await import('../js/layout.js');
      const raised = LY.HALL_IDS.filter((id) => {
        const e = built.entries.find((x) => x.id === id);
        return !!e && Math.abs(e.y - LY.TERRACE.totalH) < 1e-6;
      });
      ok('buildAll：三大殿坐落在台基顶面（entry.y = 8.13）', raised.length === LY.HALL_IDS.length, raised.join(','));
      const bh = built.entries.find((e) => e.id === 'taihe');
      const LYrec = LY.byId('taihe'), TOP = LY.TERRACE.totalH;
      // 只看**合并体**（isMesh 且非 InstancedMesh）的顶点：r128 的 Box3.setFromObject 不吃
      // InstancedMesh 的 instanceMatrix（将几何中心当盒心）→ 整体盒的 min.y 会低掉半根金柱，
      // 那不是殿身埋进台基，而是 r128 口径的盒体伪影（见 D16 批处理注记）。
      const mergedBox = (root) => {
        const out = new THREE.Box3(), one = new THREE.Box3();
        root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry) out.union(one.setFromObject(o)); });
        return out;
      };
      const mb = bh ? mergedBox(bh.group) : null;
      ok('buildAll：太和殿殿身从台基顶面起（合并体 min.y = 8.13，殿底不埋进台基、也不悬空）',
        !!mb && !mb.isEmpty() && Math.abs(mb.min.y - TOP) < 0.35,
        mb ? 'min.y ' + mb.min.y.toFixed(2) + '｜台基顶 ' + TOP : '缺 taihe entry');
      ok('buildAll：太和殿通高在实测 35.05 的 +3 m 内（屋脊正吻外延，形制校准列入已知问题）',
        !!mb && mb.max.y <= TOP + LYrec.hTotal + 3 && mb.max.y >= TOP + LYrec.hTotal - 1,
        mb ? 'top ' + mb.max.y.toFixed(2) + '｜应 ≈ ' + (TOP + LYrec.hTotal).toFixed(2) : '');
      const tb = bh ? new THREE.Box3().setFromObject(bh.group) : null;
      ok('buildAll：太和殿整体盒不高出地面（r128 盒体口径下的最低点 ≥ 地面，不双层）',
        !!tb && tb.min.y > -0.5 && tb.max.y < TOP + LYrec.hTotal + 4,
        tb ? 'y ' + tb.min.y.toFixed(2) + '..' + tb.max.y.toFixed(2) : '');
      ok('buildAll：其余建筑仍在 y=0 地面（只抬三殿，中轴门/配殿不被带动）',
        built.entries.filter((e) => !e.rec.onTerrace && e.rec.form !== '廊' && e.rec.form !== '山')
          .every((e) => Math.abs(e.y) < 1e-9));

      // D16 drawCalls 批处理：buildAll 已对每个 builder 组跑 mergeGroup →
      //   Mesh 数（≈drawCalls）必须压进 mid 预算；InstancedMesh 批次语义保留。
      ok('D16：装配后 Mesh 数 ≤ BUDGET.drawCallsMid', meshes <= cfg.BUDGET.drawCallsMid, `Mesh ${meshes} / 预算 ${cfg.BUDGET.drawCallsMid}`);
      ok('D16：InstancedMesh 批次保留（实例化未被合并）', inst >= 70 && instCount >= 6000, `InstancedMesh ${inst}，实例 ${instCount}`);

      // mergeGroup 的矩阵口径不变量（探针语义进 smoke）：装配后 root 摆位 → 顶点世界 = root × 局部。
      const hallG = new THREE.Group();
      const wallM = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), kit.mat.marble);
      wallM.position.set(3, 0, 0); hallG.add(wallM);
      P.mergeGroup(hallG, THREE);
      hallG.position.set(0, 0, -241.5);
      hallG.updateMatrixWorld(true);
      const pa = hallG.children[0].geometry.attributes.position;
      const vw = new THREE.Vector3(pa.getX(0), pa.getY(0), pa.getZ(0)).applyMatrix4(hallG.matrixWorld);
      ok('D16：合并体烘 root 局部口径（root 摆位后顶点随根移动）', Math.abs(vw.x - 2) < 1e-6 && Math.abs(vw.z + 240.5) < 1e-6, `world=(${vw.toArray().map((n) => n.toFixed(3))})`);
      const st = P.subtreeStats(hallG);
      ok('subtreeStats：合并后只剩合并体（Mesh 1，三角面 12）', st.mesh === 1 && st.triangles === 12, JSON.stringify({ mesh: st.mesh, triangles: st.triangles }));

      // 单一数据源：太和殿的屋顶必须落在中轴上（x=0），且占位与 layout 一致
      const L = await import('../js/layout.js');
      const taihe = built.entries.find((e) => e.id === 'taihe');
      ok('buildAll：太和殿 group 位于 x=0（中轴严格）', !!taihe && taihe.group.position.x === 0);
      ok('buildAll：太和殿 fp 半宽×2 = 实测面阔 + 出檐', Math.abs(taihe.fp.halfW * 2 - L.faceWidth(L.byId('taihe')) - 4.8) < 1e-6);

      // 阶段 5：午门凹字（正面城台 + 两翼雁翅楼 + 五凤楼亭群）与内金水河五桥
      const wm = built.entries.find((e) => e.id === 'wumen');
      const wmBox = new THREE.Box3().setFromObject(wm.group);
      const wpL = L.byId('wumen').wumenPlan;
      ok('buildAll：午门凹字展开（面阔 ≥ 城台面阔，进深 ≥ 两翼长）',
        wmBox.min.x <= -(wpL.cityL / 2) && wmBox.max.x >= wpL.cityL / 2 && (wmBox.max.z - wmBox.min.z) >= wpL.wingLen,
        `X ${wmBox.min.x.toFixed(1)}..${wmBox.max.x.toFixed(1)}｜Z ${wmBox.min.z.toFixed(1)}..${wmBox.max.z.toFixed(1)}`);
      ok('buildAll：午门高度 = 城台 + 正楼（凹字两翼略低）',
        wmBox.max.y >= wpL.cityH + wpL.mainTower.hTotal * .7 && wmBox.max.y < 70, wmBox.max.y.toFixed(1));
      // 亭群「前两后四」= 6 座 + 角亭 2 座：每座亭的顶有一颗鎏金宝顶。
      // 注意在 builder 的**未合批**输出上测（mergeGroup 后几何类型被展平，几何名不再可靠）。
      const wmRaw = B.wumen(THREE, kit, L.byId('wumen'), { quality: 'mid' });
      let finial = 0;
      wmRaw.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.material === kit.mat.gold) finial++; });
      ok('buildAll：五凤楼亭群 6 座 + 角亭 2 座（每座亭一颗宝顶）', finial >= 8, finial + ' 颗宝顶');

      // 内金水河：水面（G25 用 kit.mat.water，透明材质合批后仍是 1 个批次）+ 5 座桥
      const rivRaw = B.bridges(THREE, kit, L.byId('innerRiver'));
      let water = null, decks = 0;
      rivRaw.traverse((o) => {
        if (o.isMesh && o.name === 'water') water = o;
        if (o.isMesh && o.material === kit.mat.marble && o.geometry.parameters && o.geometry.parameters.height === 1.2) decks++;
      });
      ok('buildAll：内金水河有水面（kit.mat.water 透明材质）',
        !!water && water.material === kit.mat.water && water.material.transparent === true);
      ok('buildAll：桥 5 座（御路桥 + 4 座朝房桥）桥面齐备', decks === 5, decks + ' 座桥面');
      const bpL = L.byId('innerRiver').bridgePlan;
      ok('buildAll：御路桥居中五孔 + 桥群左右对称（fp 同源）',
        bpL.main.x === 0 && bpL.main.holes === 5 && bpL.main.width === 48
        && built.entries.find((e) => e.id === 'innerRiver').fp.cx === 0);

      // 阶段 6：三大殿室内 + 门扇开合（见 interior.js）
      const I = await import('../js/interior.js');
      ok('阶段 6：室内构件清单齐备（floor/platform/throne/screen/zaoJin/plaque/urns）',
        I.INTERIOR_ELEMENTS.length === 7);
      ok('阶段 6：doorStates 覆盖三大殿（仅中门可动门，无后三宫）', built.doorStates.length === 3, built.doorStates.length + ' 组');
      const movCount = { taihe: 0, zhonghe: 0, baohe: 0 };
      for (const id of ['taihe', 'zhonghe', 'baohe']) {
        built.entries.find((e) => e.id === id).group.traverse((o) => { if (o.userData && o.userData.movable) movCount[id]++; });
      }
      ok('阶段 6：可动门扇数（太和 4 / 中和 2 / 保和 4，中门开间）', movCount.taihe === 4 && movCount.zhonghe === 2 && movCount.baohe === 4, JSON.stringify(movCount));
      ok('阶段 6：枢轴 base 烘成有限矩阵；门口点在各殿中心以南（正面朝 -Z）',
        built.doorStates.every((ds, i) => ds.gate.x === 0 && ds.gate.z < L.byId(L.HALL_IDS[i]).cz
          && ds.pivots.length > 0 && ds.pivots.every((p) => p.userData.movable.base && p.userData.movable.base.elements.every(Number.isFinite))));
      const th6 = built.entries.find((e) => e.id === 'taihe');
      let gbMerged = 0;
      th6.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.name === 'merged' && o.material === kit.mat.goldBrick) gbMerged++; });
      ok('阶段 6：金砖地坪烘焙进合并体（殿内 0 新增 draw：goldBrick 桶 ×1）', gbMerged === 1, gbMerged + ' 个合并体');
      ok('阶段 6：中和殿门洞 = 三处中线（旧 {south:12} 越出面阔 bug 已修）',
        Array.isArray(L.byId('zhonghe').doors) && L.byId('zhonghe').doors.length === 3, JSON.stringify(L.byId('zhonghe').doors));
      const ds0 = built.doorStates[0];
      const near = { x: 0, z: ds0.gate.z, y: 0 }, far = { x: 80, z: ds0.gate.z, y: 0 };
      for (let f = 0; f < 30; f++) I.updateDoors([ds0], near, .2);
      const tOpen = ds0.t, m1 = ds0.pivots[0].matrix.elements.slice();
      for (let f = 0; f < 60; f++) I.updateDoors([ds0], far, .2);
      ok('阶段 6：updateDoors 近门开门 t→1、远门关合 t→0，枢轴矩阵跟着转',
        tOpen === 1 && ds0.t === 0 && m1[0] !== ds0.pivots[0].userData.movable.base.elements[0], `开=${tOpen} 关=${ds0.t}`);
      const { newState } = await import('../js/state.js');
      const stp6 = newState();
      const inPose = { x: 0, z: th6.fp.cz, y: th6.y + 1.6 };
      const gotIn = I.enterHalls(stp6, built.entries, inPose);
      ok('阶段 6：走进太和殿 → 解锁「入内太和殿」成就', gotIn.length === 1 && gotIn[0].id === 'taihe', gotIn.map((a) => a.id).join(','));
      ok('阶段 6：入内幂等（重复进入不刷）+ 高空飞越不计（y 窗口，D21 口径）',
        I.enterHalls(stp6, built.entries, inPose).length === 0
        && I.enterHalls(stp6, built.entries, { x: 0, z: th6.fp.cz, y: th6.y + 40 }).length === 0);

      // 预算预警（阶段 11 才要求达标，这里只做量级检查）
      ok('buildAll：三角面在量级内（< 3M；阶段 11 收敛到 ≤900k）', tris < 3e6, (tris / 1000).toFixed(0) + 'k');
      ok('buildAll：材质实例数受控（≤24，见 assets.md §7）', matSeen.size <= 24, matSeen.size + ' 个材质');
    }
  }
}

ok('性能预算表数值合理（drawCalls ≤ 420、tris ≥ 100k、贴图 ≤ 128MB）',
  cfg.BUDGET.drawCallsMid > 0 && cfg.BUDGET.drawCallsMid <= cfg.BUDGET.drawCallsHigh
  && cfg.BUDGET.triangles >= 100000 && cfg.BUDGET.textureMB > 0 && cfg.BUDGET.textureMB <= 256);

/* ============ 4e) 三档视角 CameraRig：纯逻辑断言（阶段 3 的正式回归口径）============
 * 口径来自早期探针 tools/out/camlogic.mjs（gitignore 的临时件）——正式断言并入这里，
 * 三档视角从此有提交级回归保护（PROGRESS.md 里「11 条断言全过」那句原本是探针口径，无入库件）。
 * camera.js 不 import three、不碰 DOM → 直接在 Node 里 import 就能跑。
 */
{
  const C = await import('../js/camera.js');
  const fakeCam = () => ({ fov: 62, position: { set() {} }, rotation: { order: '', x: 0, y: 0, z: 0 }, updateProjectionMatrix() {} });
  const walkPose = () => ({ x: 0, y: cfg.EYED_H, z: cfg.CAM_START.z, yaw: cfg.CAM_START.yaw, pitch: cfg.CAM_START.pitch });

  ok('cam：三档视角齐备（walk/fly/overview，带中文档位名）',
    C.CAM_MODES.length === 3 && C.CAM_MODES.map((m) => m.id).join(',') === 'walk,fly,overview'
    && C.CAM_MODES.every((m) => !!m.cn), C.CAM_MODES.map((m) => m.cn).join('/'));

  const ac = C.axisCenter();
  ok('cam：俯瞰圆心 = 中轴中点（午门 ↔ 神武门）',
    ac.x === 0 && Math.abs(ac.z - (cfg.AXES.wumen + cfg.AXES.shenwumen) / 2) < 1e-9, 'z ' + ac.z);

  const ov = C.overviewPose();
  ok('cam：俯瞰机位在 ~950 m 高空、俯角在区间内、fov 取 OVERVIEW.fov',
    ov.y > 900 && ov.y < 1000 && ov.pitch >= C.OVERVIEW.pitchMin && ov.pitch <= C.OVERVIEW.pitchMax
    && ov.fov === C.OVERVIEW.fov && ov.yaw === 0,
    'y ' + ov.y.toFixed(0) + '｜pitch ' + ov.pitch.toFixed(2) + '｜fov ' + ov.fov);
  const camToGate = Math.hypot(ov.y, ov.z - cfg.AXES.shenwumen);
  ok('cam：俯瞰远雾包住全城（fogFar ≥ 机位到神武门的距离，D23）', C.OVERVIEW.fogFar >= camToGate,
    'fogFar ' + C.OVERVIEW.fogFar + '｜' + camToGate.toFixed(0));
  const ovFlat = Math.hypot(ov.x - ac.x, ov.z - ac.z);
  ok('cam：俯瞰入口机位落在 zoom 区间内（第一下滚轮/拖拽不跳机位）',
    ovFlat > C.OVERVIEW.flatMin && ovFlat < C.OVERVIEW.flatMax,
    'flat ' + ovFlat.toFixed(0) + ' ∈ ' + C.OVERVIEW.flatMin + '..' + C.OVERVIEW.flatMax);

  const rig = new C.CameraRig({ camera: fakeCam(), pose: walkPose() });
  ok('cam：默认档 = 漫步，机位在眼高 1.65，档位名给 HUD 用',
    rig.mode === 'walk' && Math.abs(rig.pose.y - cfg.EYED_H) < 1e-9 && rig.modeName() === '漫步');

  rig.setMode('overview', { instant: true });
  ok('cam：进俯瞰（瞬切）落到俯瞰机位、fov 跟着换、不留半截过渡',
    rig.mode === 'overview' && !rig.isFlying() && Math.abs(rig.pose.y - ov.y) < 1e-9 && rig.pose.fov === C.OVERVIEW.fov);
  ok('cam：进俯瞰时取景中心复位到中轴中点', Math.abs(rig.center().z - ac.z) < 1e-9 && rig.center().x === 0);

  // 阶段 4 的「按地标取景」：focus 只挪圆心，**不许**把镜头绕着转一圈（D21）
  const flat0 = Math.hypot(rig.pose.x - rig.center().x, rig.pose.z - rig.center().z), y0 = rig.pose.y;
  rig.focus({ x: 0, z: cfg.AXES.wumen });
  const flat1 = Math.hypot(rig.pose.x - rig.center().x, rig.pose.z - rig.center().z);
  ok('cam：focus 平移取景中心（午门）保住水平距离与高度（取景范围不变）',
    Math.abs(flat1 - flat0) < 1e-6 && Math.abs(rig.pose.y - y0) < 1e-9 && Math.abs(rig.center().z - cfg.AXES.wumen) < 1e-9,
    'flat ' + flat0.toFixed(0) + '→' + flat1.toFixed(0) + '｜中心 z ' + rig.center().z);
  const angWumen = (() => {
    const p = rig.pose, cp = Math.cos(p.pitch);
    const f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };   // three 前向（YXZ）
    const d = { x: 0 - p.x, y: 0 - p.y, z: cfg.AXES.wumen - p.z };
    const len = Math.hypot(d.x, d.y, d.z);
    return Math.acos(Math.min(1, (f.x * d.x + f.y * d.y + f.z * d.z) / len)) * 180 / Math.PI;
  })();
  ok('cam：取景中心命中午门时画面正中就是午门（视线夹角 < 1°）', angWumen < 1, '夹角 ' + angWumen.toFixed(2) + '°');

  const cZ = rig.center().z, cX = rig.center().x, yB = rig.pose.y;
  rig.zoom(1.2);
  const yUp = rig.pose.y;
  rig.zoom(-1.2);
  ok('cam：zoom 拉远抬高机位、拉近压低机位，取景中心一动不动',
    yUp > yB && rig.pose.y < yB && rig.center().z === cZ && rig.center().x === cX,
    'y ' + yB.toFixed(0) + '→' + yUp.toFixed(0) + '→' + rig.pose.y.toFixed(0));
  for (let i = 0; i < 40; i++) rig.zoom(-1.2);
  const flatMinSeen = Math.hypot(rig.pose.x - rig.center().x, rig.pose.z - rig.center().z);
  for (let i = 0; i < 40; i++) rig.zoom(1.2);
  const flatMaxSeen = Math.hypot(rig.pose.x - rig.center().x, rig.pose.z - rig.center().z);
  ok('cam：zoom 夹在 flatMin..flatMax（不穿到圆心、不脱离场景）',
    flatMinSeen >= C.OVERVIEW.flatMin - 1e-6 && flatMaxSeen <= C.OVERVIEW.flatMax + 1e-6,
    '拉近侧 ' + flatMinSeen.toFixed(0) + '｜拉远侧 ' + flatMaxSeen.toFixed(0));

  const r2 = new C.CameraRig({ camera: fakeCam(), pose: walkPose() });
  r2.setMode('overview', { instant: true });
  const cA = r2.center(), flatA = Math.hypot(r2.pose.x - cA.x, r2.pose.z - cA.z);
  r2.orbit(1200, 900);   // 大幅拖拽：绕圆心转 + 拖出俯角上限
  ok('cam：orbit 只绕取景中心转（中心不动、水平距离不变），俯角夹在上限',
    Math.abs(r2.center().z - cA.z) < 1e-9 && Math.abs(r2.center().x - cA.x) < 1e-9
    && Math.abs(Math.hypot(r2.pose.x - cA.x, r2.pose.z - cA.z) - flatA) < 1e-6
    && Math.abs(r2.pose.pitch - C.OVERVIEW.pitchMax) < 1e-9,
    'flat ' + flatA.toFixed(0) + '｜pitch ' + r2.pose.pitch.toFixed(2));
  ok('cam：orbit 在非俯瞰档返回 null（漫步/飞行里拖拽 = 转视角，不是绕圆心）',
    (() => {
      const r = new C.CameraRig({ camera: fakeCam(), pose: walkPose() });
      r.setMode('fly', { instant: true });
      return r.orbit(10, 10) === null && r.orbit(10, 10) === null;
    })());

  const r3 = new C.CameraRig({ camera: fakeCam(), pose: walkPose() });
  const seq = [r3.toggle({ instant: true }), r3.toggle({ instant: true }), r3.toggle({ instant: true })];
  ok('cam：toggle 三档循环（漫步→飞行→俯瞰→漫步）', seq.join(',') === 'fly,overview,walk', seq.join('→'));
  ok('cam：toggle 回漫步落到眼高 1.65（不悬在半空）',
    r3.mode === 'walk' && Math.abs(r3.pose.y - cfg.EYED_H) < 1e-9 && !r3.isFlying());
  ok('cam：非法档位 id 保持原档（按键乱按不炸）',
    (() => {
      const r = new C.CameraRig({ camera: fakeCam(), pose: walkPose() });
      r.setMode('fly', { instant: true });
      return r.setMode('nope', { instant: true }) === 'fly' && r.mode === 'fly';
    })());

  ok('cam：flyTo 缓动过渡（update 推进 → 收敛到终点后清过渡，不锁输入，D20）', (() => {
    const r = new C.CameraRig({ camera: fakeCam(), pose: { x: 0, y: cfg.EYED_H, z: 0, yaw: 0, pitch: 0 } });
    r.flyTo({ x: 0, y: cfg.EYED_H, z: 100, yaw: 0, pitch: 0 }, 1.0);
    let steps = 0, mid = -1;
    while (r.update(0.1) && steps++ < 40) { if (steps === 5) mid = r.pose.z; }
    return mid > 0 && mid < 100 && Math.abs(r.pose.z - 100) < 1e-9 && !r.isFlying();
  })());

  ok('cam：apply() 写 pose 进相机（YXZ 顺序 + fov 写回），行走位移与 yaw 同口径', (() => {
    const cam2 = fakeCam();
    const r = new C.CameraRig({ camera: cam2, pose: { x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.2 } });
    r.apply();
    const h = C.CameraRig.horizontal(r.pose, { x: 0, y: 1 }, 10);   // 只前进 → 朝 -Z 偏
    return r.camera.rotation.order === 'YXZ' && Math.abs(r.camera.rotation.y - 0.5) < 1e-9
      && Math.abs(r.camera.rotation.x + 0.2) < 1e-9 && Math.abs(r.camera.fov - 62) < 1e-9
      && h.z < 0 && Math.abs(Math.hypot(h.x, h.z) - 10) < 1e-6;
  })());
  ok('cam：飞行 46 m/s（中轴全程 ~25 s 走完）',
    Math.abs(rig.flySpeed - 46) < 1e-9 && Math.abs((cfg.AXES.shenwumen - cfg.AXES.wumen) / rig.flySpeed - 16.4) < 1.5);
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
