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
  cityPlatform, bridgePavilion, river, wallCity, cornerTower, tree, douGong, mergeGroup,
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

/** 午门：凹字平面（正面城台 + 两翼雁翅楼）+ 五凤楼（城楼 + 角亭 + 亭群）+ 五券门。
 *  数据全部来自 layout.wumenPlan（尺度不许写死在构件里）。 */
export function wumen(THREE, kit, b, opts = {}) {
  const g = new THREE.Group();
  const p = b.wumenPlan;
  const cityL = p.cityL, cityH = p.cityH, cityD = p.cityD;
  const wingW = 12;                       // 雁翅楼城台（两翼）的宽度
  const wingX = cityL / 2 - wingW / 2;    // 两翼城台中线 x
  // 1) 正面城台：开五券门（layout.doors 同源）
  g.add(cityPlatform(THREE, kit, { len: cityL, depth: cityD, hWall: cityH, doors: doorList(b) }));
  // 2) 正面城楼：重檐庑殿（五凤楼正楼），落在城台顶
  const tower = hall(THREE, kit, p.mainTower, { quality: opts.quality, withDoors: false });
  tower.position.y = cityH; g.add(tower);
  // 3) 凹字两翼：低城台 + 台上的雁翅楼廊庑（局部 -Z 方向伸出，随午门一起平移）
  for (const sgn of [1, -1]) {
    const plat = cityPlatform(THREE, kit, {
      len: wingW, depth: p.wingLen, hWall: p.wingPlatformH, crenelAxis: 'z',
    });
    plat.position.set(sgn * wingX, 0, -p.wingLen / 2); g.add(plat);
    const wing = corridor(THREE, kit, { cx: 0, z0: 0, z1: -p.wingLen, hWall: p.wingH });
    wing.position.set(sgn * wingX, p.wingPlatformH, 0); g.add(wing);
    // 角亭（凹字转角）：两翼各一座盝顶亭
    const pv = pavilion(THREE, kit, { width: 6.4, hWall: p.wingH * .8, form: '盝顶', instanced: false });
    pv.position.set(sgn * wingX, p.wingPlatformH, p.cornerZ); g.add(pv);
  }
  // 4) 亭群「前两后四」：雁翅楼尽端两座攒尖 + 四座盝顶（五凤楼的四尖）
  for (const x of p.gablePav.xs) {
    const pv = pavilion(THREE, kit, { width: p.gablePav.w, hWall: p.wingH, form: '攒尖', instanced: false });
    pv.position.set(x, 0, p.gablePav.z); g.add(pv);
  }
  for (const x of p.ruffPav.xs) {
    const pv = pavilion(THREE, kit, { width: p.ruffPav.w, hWall: p.wingH * .9, form: '盝顶', instanced: false });
    pv.position.set(x, 0, p.ruffPav.z); g.add(pv);
  }
  return g;
}

/** 内金水河 + 内金水桥：河身（G25）+ 御路桥五孔居中 + 四座单孔朝房桥 + 外侧三间桥亭。
 *  数据来自 layout.bridgePlan；河沿 x 展开，桥跨河（z 方向）。 */
export function bridges(THREE, kit, r) {
  const g = new THREE.Group();
  const p = r.bridgePlan;
  g.add(river(THREE, kit, { len: p.len, width: r.width, bankH: r.bankH }));
  const span = r.width + 4;   // 桥跨 = 河宽 + 两堤
  g.add(bridge(THREE, kit, { width: p.main.width, span, holes: p.main.holes, railInst: true }));
  for (const set of [p.inner, p.outer]) {
    for (const x of set.xs) {
      const br = bridge(THREE, kit, { width: set.width, span, holes: set.holes, railInst: false });
      br.position.x = x; g.add(br);
      if (set.pavilion) {
        const pv = bridgePavilion(THREE, kit, {
          width: set.width, bays: set.pavilion.bays, depth: set.pavilion.depth,
          hWall: set.pavilion.hWall, y: 1.2, form: set.pavilion.form || '庑殿',
        });
        pv.position.x = x; g.add(pv);
      }
    }
  }
  return g;
}

/** 小亭（阙亭/井亭一类）：一条 layout 记录一座亭，顶形由 form 决定。 */
export function pav(THREE, kit, b) {
  return pavilion(THREE, kit, {
    width: b.width || 6, hWall: b.hWall || 5, form: b.roofForm || '攒尖',
    tiers: b.tiers || 1, instanced: false,
  });
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
  wumen, bridges, pav,
  hall: (T, k, b, o) => hall(T, k, b, o),
  gate, corridorRun, gardenTrees, hill,
};

/** 一条 layout 记录 → Group（找不到形制则返回 null）。 */
export function buildOne(THREE, kit, rec, opts = {}) {
  const f = rec.form;
  if (rec.id === 'wumen') return BUILDERS.wumen(THREE, kit, rec, opts);
  if (f === '门') return BUILDERS.gate(THREE, kit, rec);
  if (f === '亭') return BUILDERS.pav(THREE, kit, rec);
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
  terr.group.updateMatrixWorld(true);
  mergeGroup(terr.group, THREE);
  root.add(terr.group);

  const add = (rec, g, fpOverride) => {
    if (!g) return;
    // 廊与山的 builder 内部已按 cx/cz 定位，不再整体平移；其余按记录平移
    if (rec.form !== '廊' && rec.form !== '山') g.position.set(rec.cx, 0, rec.cz);
    // D16 drawCalls 批处理：装配完成 → 刷新矩阵 → 按材质合并（InstancedMesh 批次保留）。
    // 合并体烘 root 局部口径，root 的位移/摆位语义不变（见 parts.js mergeGroup 注释与探针）。
    g.updateMatrixWorld(true);
    mergeGroup(g, THREE);
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
  walls.updateMatrixWorld(true);
  mergeGroup(walls, THREE);
  root.add(walls);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const ct = cornerTower(THREE, kit, { x: 0, z: 0 });
    ct.position.set(sx * CITY.lenE / 2, 0, sz * CITY.lenN / 2);
    ct.updateMatrixWorld(true);
    mergeGroup(ct, THREE);
    root.add(ct);
  }
  return { group: root, entries };
}

/** 组合器表（smoke.mjs 核对）。 */
export const COMBINERS = ['hall', 'gate', 'wumen', 'bridges', 'corridorRun', 'gardenTrees', 'hill', 'buildOne', 'buildAll'];
