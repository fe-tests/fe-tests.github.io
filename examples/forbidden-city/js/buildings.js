/* 3D 故宫游览 · js/buildings.js —— 组合器（把 parts.js 的构件按 layout.js 的数据装配成建筑）
 * 职责：只做「数据 → 构件位置」的装配，不含渲染循环、不含材质定义。
 * 用法：buildAll(THREE, kit, { quality }) → { group, entries:[{id,cn,group,fp,rec}] }
 *      entries 供碰撞层（阶段 8）、小地图与热点（阶段 10）复用 —— 单一数据源的体现。
 */
'use strict';

import { buildings, linear, footprint, TERRACE } from './layout.js';
import { CITY } from './config.js';
import {
  terrace, chiShou, columnGrid, beamFrame, hipRoof, gableHipRoof, squareZuanjian,
  eaveLayer, beastRow, chiwen, latticeDoor, gateTower, corridor, pavilion, bridge,
  wallCity, cornerTower, tree, douGong,
} from './parts.js';

/* ------------------------------ 殿宇（庑殿 / 歇山 / 攒尖）------------------------------ */
/** layout.doors 兼容两种写法：数组（门洞中线 x）或 { south, east, west, north }（每面门扇数）。
 *  这里统一成「门洞中线 x」数组；用间宽推位置，保证与 bays/bayW 同源。 */
export function doorList(b) {
  const d = b.doors;
  if (!d) return [];
  if (Array.isArray(d)) return d.slice();
  const n = d.south || 0, bayW = b.bayW, out = [];
  for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * bayW * .9);
  return out;
}

/** 通用大殿：台基之上的殿身 + 柱网 + 梁架 + 屋顶（可重檐）。返回 Group。
 *  kit 的取值约定见 assets.md §2：贴图走 kit.tex.<name>，材质走 kit.mat.<name>。 */
export function hall(THREE, kit, b, { quality = 'mid', withDoors = true } = {}) {
  const g = new THREE.Group();
  const bayW = b.bayW, w = b.bays * bayW, d = b.depthM != null ? b.depthM : b.depthBays * bayW;
  const hWall = b.hWall, wallT = .5;

  // 殿身墙体（含门窗层）：正面开门，其余三面实墙
  const back = latticeDoor(THREE, kit, { bays: b.bays, bayW, hWall, depth: wallT });
  back.position.z = -d / 2; g.add(back);
  const front = latticeDoor(THREE, kit, { bays: b.bays, bayW, hWall, depth: wallT, doors: withDoors ? doorList(b) : [] });
  front.position.z = d / 2; g.add(front);
  for (const sgn of [1, -1]) {
    const side = latticeDoor(THREE, kit, { bays: b.depthBays, bayW: bayW * .95, hWall, depth: wallT });
    side.rotation.y = Math.PI / 2; side.position.x = sgn * w / 2; g.add(side);
  }

  // 柱网：外墙内退半间是檐柱；减柱造/金柱数据来自 layout
  const grid = columnGrid(THREE, kit, {
    bays: Math.max(2, b.bays - 1), depthBays: Math.max(2, b.depthBays - 1), bayW, h: hWall * .96,
    reduced: (b.columns && b.columns.reduced) || 0, golden: (b.columns && b.columns.golden) || 0,
  });
  g.add(grid.group);
  g.add(beamFrame(THREE, kit, { bays: b.bays, depthBays: b.depthBays, bayW, hWall }));

  // G06 斗拱：沿檐柱头铺作，低档跳过（预算）
  if (quality !== 'low') {
    const step = Math.max(1, Math.round(b.bays / 6));
    for (let i = 0; i <= b.bays - 1; i += step) {
      const x = (i - (b.bays - 2) / 2) * bayW;
      for (const sz of [1, -1]) g.add(douGong(THREE, kit, { tier: quality, x, y: hWall - .35, z: sz * d / 2 }));
    }
  }

  // 屋顶：形制由 layout.form 决定
  const rise = b.hTotal - hWall - (b.tier === 2 ? 1.6 : 0);
  if (b.form === '庑殿') g.add(hipRoof(THREE, kit, { width: w, depth: d, rise, y: hWall }));
  else if (b.form === '歇山') g.add(gableHipRoof(THREE, kit, { width: w, depth: d, rise, y: hWall }));
  else g.add(squareZuanjian(THREE, kit, { width: Math.max(w, d), rise: rise * .9, y: hWall }));

  // 重檐：下檐一圈腰檐 + 平座
  if (b.tier === 2) {
    g.add(eaveLayer(THREE, kit, { width: w, depth: d, overhang: 3.0, y: hWall * .58 }));
    g.add(hipRoof(THREE, kit, { width: w * .74, depth: d * .74, rise: rise * .42, y: hWall + rise * .52 }));
  }

  // G11/G12/G13 脊饰：正脊两端大吻 + 垂脊走兽（等级越高兽越多）
  const ridgeY = hWall + rise;
  for (const sgn of [1, -1]) g.add(chiwen(THREE, kit, { x: sgn * w * .21, y: ridgeY, z: 0, h: Math.min(3, rise * .5) }));
  const beasts = b.roofStatuettes || (b.form === '庑殿' ? 9 : b.form === '歇山' ? 7 : 5);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    g.add(beastRow(THREE, kit, {
      count: Math.min(beasts, quality === 'low' ? 3 : beasts),
      from: [sx * w * .48, hWall + .5, sz * d * .48], to: [sx * w * .22, ridgeY - .2, sz * d * .16],
    }));
  }

  // 匾额（T13）：正面明间檐下
  if (b.interior && b.interior.plaque) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(bayW * 1.7, bayW * .62), kit.plaqueFor(b.interior.plaque));
    p.position.set(0, hWall * .82, d / 2 + wallT + .05); g.add(p);
  }
  return g;
}

/* ------------------------------ 门 / 廊 / 桥 ------------------------------ */
export function gate(THREE, kit, b) { return gateTower(THREE, kit, Object.assign({}, b, { doors: doorList(b) })); }

export function corridorRun(THREE, kit, c) { return corridor(THREE, kit, c); }

/** 午门：台城 + 正面城楼 + 两侧雁翅楼 + 端头阙亭（平面「凹」字）。 */
export function wumen(THREE, kit, b) {
  const g = new THREE.Group();
  g.add(gateTower(THREE, kit, b));
  const wingLen = b.wings.len, sideH = b.wings.sideH;
  for (const sgn of [1, -1]) {
    const cx = sgn * (b.bays * b.bayW / 2 + 3);
    // 雁翅楼：从城台侧边向南（-Z）伸出的一段廊庑（局部坐标，随午门一起平移）
    g.add(corridor(THREE, kit, { cx, z0: -4, z1: -wingLen, hWall: sideH }));
    // 阙亭：廊端各一座（四角亭 = 五凤楼的四个尖）
    const pv = pavilion(THREE, kit, { width: 6.4, hWall: sideH });
    pv.position.set(cx, 0, -wingLen); g.add(pv);
  }
  return g;
}

/** 御路桥：中路的五孔桥 + 对称的四座朝房桥（简化为两座单孔）。 */
export function bridges(THREE, kit, r) {
  const g = new THREE.Group();
  g.add(bridge(THREE, kit, { width: 48, span: r.width, holes: 5 }));
  for (const sgn of [1, -1]) {
    const b2 = bridge(THREE, kit, { width: 12, span: r.width, holes: 1 });
    b2.position.x = sgn * 34; g.add(b2);
  }
  return g;
}

/** 御花园：古柏成对 + 堆秀山土山（低档只放稀疏树）。 */
export function gardenTrees(THREE, kit, b, quality = 'mid') {
  const g = new THREE.Group();
  const n = quality === 'low' ? Math.round(b.trees / 3) : b.trees;
  const per = Math.ceil(n / 2 / 8);
  for (let i = 0; i < n; i++) {
    const t = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const col = k % per, row = Math.floor(k / per);
    g.add(tree(THREE, kit, {
      x: t * (10 + col * 9 + (row % 2) * 4), z: -34 + row * 9, h: 6 + ((i * 7) % 5), lod: quality === 'high' ? 'high' : 'low',
    }));
  }
  if (b.hill) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(14, 9, 12), kit.mat.stoneRamp || kit.mat.marble);
    hill.position.set(0, 4.5, -8); g.add(hill);
  }
  return g;
}

/** 景山：土山 + 古木（俯瞰视点，阶段 7 精修）。 */
export function hill(THREE, kit, c, quality = 'mid') {
  const g = new THREE.Group();
  const h = c.hTotal || 40;
  const m = new THREE.Mesh(new THREE.ConeGeometry(90, h, 14), kit.mat.stoneRamp || kit.mat.marble);
  m.position.set(c.cx, h / 2, c.cz); g.add(m);
  const n = quality === 'low' ? 20 : Math.min(c.trees || 60, 60);
  for (let i = 0; i < n; i++) {
    const a = (i * 137.5) * Math.PI / 180, r = 12 + (i % 7) * 9;
    g.add(tree(THREE, kit, { x: c.cx + Math.cos(a) * r, z: c.cz + Math.sin(a) * r, h: 5 + (i % 4), lod: 'low' }));
  }
  return g;
}

/* ------------------------------ 装配全场景（阶段 4/5 使用）------------------------------ */
const BUILDERS = {
  wumen: wumen, bridges,
  hall: (T, k, b, o) => hall(T, k, b, o),
  gate, corridorRun, gardenTrees, hill,
};

/** 一条 layout 记录 → Group（找不到形制则返回 null）。 */
export function buildOne(THREE, kit, rec, opts = {}) {
  const f = rec.form;
  if (rec.id === 'wumen') return BUILDERS.wumen(THREE, kit, rec);
  if (f === '门') return BUILDERS.gate(THREE, kit, rec);
  if (f === '河') return BUILDERS.bridges(THREE, kit, rec);
  if (f === '庑殿' || f === '歇山' || f === '攒尖') return BUILDERS.hall(THREE, kit, rec, opts);
  if (f === '廊') return BUILDERS.corridorRun(THREE, kit, rec);
  if (f === '园') return BUILDERS.gardenTrees(THREE, kit, rec, opts.quality);
  if (f === '山') return BUILDERS.hill(THREE, kit, rec, opts.quality);
  return null;
}

/** 把 layout 的所有记录装配成一个 Group，并返回可复用的 entries。 */
export function buildAll(THREE, kit, { quality = 'mid', only = null } = {}) {
  const root = new THREE.Group();
  const entries = [];

  // 三层台基（外朝，只此一处）+ G03 螭首
  const terr = terrace(THREE, kit, TERRACE.tiers, TERRACE.layerH);
  const t0 = TERRACE.tiers[2];
  for (const [x, z] of [[t0.halfW, t0.z0], [-t0.halfW, t0.z0], [t0.halfW, t0.z1], [-t0.halfW, t0.z1]]) {
    terr.group.add(chiShou(THREE, kit, x, TERRACE.totalH - .2, z, Math.atan2(-x, -(z - (t0.z0 + t0.z1) / 2))));
  }
  root.add(terr.group);

  const add = (rec, g, fpOverride) => {
    if (!g) return;
    // 廊与山的 builder 内部已按 cx/cz 定位，不再整体平移；其余按记录平移
    if (rec.form !== '廊' && rec.form !== '山') g.position.set(rec.cx, 0, rec.cz);
    root.add(g);
    const cz = rec.z0 != null ? (rec.z0 + rec.z1) / 2 : rec.cz;
    entries.push({
      id: rec.id, cn: rec.cn || rec.id, group: g, fp: fpOverride || footprint(rec),
      cz, rec,
    });
  };

  for (const b of buildings()) { if (!only || only.includes(b.id)) add(b, buildOne(THREE, kit, b, { quality })); }
  for (const c of linear()) {
    if (only && !only.includes(c.id)) continue;
    const fp = c.form === '廊'
      ? { cx: c.cx, cz: (c.z0 + c.z1) / 2, halfW: 4, halfD: Math.abs(c.z1 - c.z0) / 2 }
      : { cx: c.cx, cz: c.cz, halfW: 60, halfD: 60 };
    add(c, buildOne(THREE, kit, c, { quality }), fp);
  }

  // G19/G20 城墙与四角角楼（按记录里的 x/z 定位，不做整体平移）
  const walls = wallCity(THREE, kit, CITY);
  root.add(walls);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const ct = cornerTower(THREE, kit, { x: 0, z: 0 });
    ct.position.set(sx * CITY.lenE / 2, 0, sz * CITY.lenN / 2);
    root.add(ct);
  }
  return { group: root, entries };
}

/** 组合器表（smoke.mjs 核对）。 */
export const COMBINERS = ['hall', 'gate', 'wumen', 'bridges', 'corridorRun', 'gardenTrees', 'hill', 'buildOne', 'buildAll'];
