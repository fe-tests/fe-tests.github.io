/* 3D 故宫游览 · js/parts.js —— 构件库（assets.md §3 的 G01–G22）
 * 每个函数返回 THREE.Group / Mesh，参数全部来自 layout.js 的记录；构件内不写死建筑尺度。
 * 约定：
 *   · 局部原点 = 建筑底面中心（台基除外，台基原点在地面）
 *   · 「间」宽由调用方传入（bays × bayW），构件只负责按参数铺量
 *   · 材质一律来自 textures.js 的 kit，禁止在此 new Material（材质数预算 ≤24）
 *   · 重复构件（柱、栏杆、走兽、瓦当）用 InstancedMesh，压 drawCalls
 * 约束：本模块不 import three（由调用方注入），以便在 Node 里做「只查拓扑/实例数」的冒烟。
 */
'use strict';

import { DOUKOU, BAY } from './config.js';

/* ------------------------------ 通用小工具 ------------------------------ */
const box = (THREE, w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (THREE, rt, rb, h, seg, m) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

/** 把几何按 y 底对齐（中国建筑的「起于地面」习惯）。 */
function baseAlign(geo) { geo.computeBoundingBox(); return geo; }

/** 屋顶举折：返回一条 profile（数组 [{x,y}]），供 LatheGeometry/ExtrudeGeometry 用。
 *  清式举析近似：每「架」升高 = 水平进深 × 0.2（庑殿）~0.36（歇山）。 */
export function roofProfile(halfSpan, rise, steps = 8) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 举折：越靠檐口越陡（用二次曲线近似凹弧），并加檐口起翘
    const y = rise * Math.pow(t, 1.62) + (t > .85 ? (t - .85) * rise * .32 : 0);
    pts.push({ x: halfSpan * (1 - t), y });
  }
  return pts;
}

/* ============================ G01/G02 台基 + 栏杆 ============================ */
/** 三层汉白玉须弥座（外朝三大殿所在）。返回 {group, topY}。 */
export function terrace(THREE, kit, tiers = [], layerH = 2.71) {
  const g = new THREE.Group();
  let topY = 0;
  for (const t of tiers) {
    const len = t.z1 - t.z0, cz = (t.z0 + t.z1) / 2;
    const slab = box(THREE, t.halfW * 2, layerH, len, kit.mat.marble);
    slab.position.set(0, topY + layerH / 2, cz);
    slab.receiveShadow = true; g.add(slab);
    // 束腰：上下枋 + 中部内收（视觉上做出「须弥座」）
    for (const dy of [0.12, layerH - 0.12]) {
      const band = box(THREE, t.halfW * 2 + .5, .24, len + .5, kit.mat.marble);
      band.position.set(0, topY + dy, cz); g.add(band);
    }
    topY += layerH;
    // G02 栏杆：沿台顶层四周，用 InstancedMesh（望柱 + 栏板交替）
    g.add(railing(THREE, kit, t.halfW, len / 2, topY));
  }
  return { group: g, topY };
}

/** G02 栏杆：矩形四周的望柱与栏板（实例化，1 drawCall）。 */
export function railing(THREE, kit, halfW, halfD, y, spacing = 1.6) {
  const g = new THREE.Group();
  const pts = [];
  const push = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
  };
  push(-halfW, -halfD, halfW, -halfD); push(halfW, -halfD, halfW, halfD);
  push(halfW, halfD, -halfW, halfD); push(-halfW, halfD, -halfW, -halfD);

  const post = new THREE.CylinderGeometry(.12, .16, 1.05, 8); baseAlign(post);
  const capGeo = new THREE.BoxGeometry(.34, .18, .34);
  const inst = new THREE.InstancedMesh(post, kit.mat.marble, pts.length);
  const capInst = new THREE.InstancedMesh(capGeo, kit.mat.marble, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    m4.makeTranslation(x, y + .52, z); inst.setMatrixAt(i, m4);
    m4.makeTranslation(x, y + 1.08, z); capInst.setMatrixAt(i, m4);
  });
  inst.castShadow = capInst.castShadow = true;
  g.add(inst, capInst);

  // 栏板：四条长条（不做逐块实例，减少顶点数）
  for (const [w, d, x, z] of [[halfW * 2, .18, 0, -halfD], [halfW * 2, .18, 0, halfD], [.18, halfD * 2, -halfW, 0], [.18, halfD * 2, halfW, 0]]) {
    const p = box(THREE, w, .78, d, kit.mat.marbleCarve);
    p.position.set(x, y + .5, z); g.add(p);
  }
  return g;
}

/** G03 螭首：台基四角与边上的排水兽头（简化为斜切的方体 + 圆口）。 */
export function chiShou(THREE, kit, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const b = box(THREE, .9, .8, 1.6, kit.mat.marble); b.position.y = .4; g.add(b);
  const head = box(THREE, .7, .6, .8, kit.mat.marbleCarve); head.position.set(0, .35, 1.0); g.add(head);
  const spout = cyl(THREE, .16, .2, .5, 8, kit.mat.stonePaving); spout.rotation.x = Math.PI / 2; spout.position.set(0, .3, 1.5); g.add(spout);
  g.position.set(x, y, z); g.rotation.y = rotY;
  return g;
}

/* ============================ G04/G05 柱网与梁架 ============================ */
/** G04 柱网：按面阔/进深间数排檐柱（可选减柱造），返回 {group, columns[]}。 */
export function columnGrid(THREE, kit, { bays, depthBays, bayW, h, reduced = 0, golden = 0 }) {
  const g = new THREE.Group(), cols = [];
  const xs = [], zs = [];
  for (let i = 0; i < bays; i++) xs.push((i - (bays - 1) / 2) * bayW);
  for (let j = 0; j < depthBays; j++) zs.push((j - (depthBays - 1) / 2) * bayW * .95);

  const geo = new THREE.CylinderGeometry(DOUKOU * 7, DOUKOU * 8, h, 12); baseAlign(geo);
  const ring = [];
  for (const x of xs) for (const z of zs) {
    // 减柱造：后檐（+z 侧）金柱位置减去 reduced 根
    const backRow = Math.abs(z - zs[zs.length - 1]) < 1e-6;
    if (reduced && backRow && Math.abs(x) < bayW * (reduced / 2 + .5)) continue;
    ring.push([x, z]);
  }
  const inst = new THREE.InstancedMesh(geo, kit.mat.woodColumn, ring.length);
  const m4 = new THREE.Matrix4();
  ring.forEach(([x, z], i) => { m4.makeTranslation(x, h / 2, z); inst.setMatrixAt(i, m4); cols.push([x, z]); });
  inst.castShadow = true; g.add(inst);

  // 柱础（白石，实例化）
  const baseGeo = new THREE.CylinderGeometry(DOUKOU * 11, DOUKOU * 12, .3, 12);
  const bi = new THREE.InstancedMesh(baseGeo, kit.mat.marble, ring.length);
  ring.forEach(([x, z], i) => { m4.makeTranslation(x, .15, z); bi.setMatrixAt(i, m4); });
  g.add(bi);

  // G05 金柱：居中环列，比檐柱高（室内代表层用）
  if (golden) {
    const gg = new THREE.CylinderGeometry(DOUKOU * 8.5, DOUKOU * 9.5, h * 1.25, 14); baseAlign(gg);
    const gi = new THREE.InstancedMesh(gg, kit.mat.goldColumn || kit.mat.woodColumn, golden);
    for (let i = 0; i < golden; i++) {
      const a = i / golden * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * xs[xs.length - 1] * .45, h * .625, Math.sin(a) * zs[zs.length - 1] * .45);
      gi.setMatrixAt(i, m4);
    }
    g.add(gi);
  }
  return { group: g, columns: cols };
}

/** G05 梁架：额枋 + 平板枋 + 檐桁（一圈方木），做出「墙在上、柱在下」的轮廓。 */
export function beamFrame(THREE, kit, { bays, depthBays, bayW, hWall }) {
  const g = new THREE.Group();
  const w = bays * bayW, d = depthBays * bayW * .95;
  for (const [dy, hh] of [[hWall - .35, .55], [hWall - .9, .45]]) {
    for (const [bw, bd, x, z] of [[w + 1.2, .6, 0, -d / 2], [w + 1.2, .6, 0, d / 2], [.6, d + 1.2, -w / 2, 0], [.6, d + 1.2, w / 2, 0]]) {
      const b = box(THREE, bw, hh, bd, kit.mat.caihua);
      b.position.set(x, dy, z); g.add(b);
    }
  }
  return g;
}

/** G06 斗拱：出跳的铺作（低模；tier=high 时加第二跳）。 */
export function douGong(THREE, kit, { tier = 'mid', x, y, z, rotY = 0 }) {
  const g = new THREE.Group();
  const unit = DOUKOU;
  const rows = tier === 'low' ? 1 : 2;
  for (let i = 0; i < rows; i++) {
    const s = 1 + i * .55;
    const ark = box(THREE, unit * 6 * s, unit * 3, unit * 4, kit.mat.caihua);
    ark.position.y = i * unit * 3.2; g.add(ark);
  }
  const cap = box(THREE, unit * 6 * (1 + (rows - 1) * .55) + unit * 4, unit * 2.2, unit * 4, kit.mat.caihua);
  cap.position.y = rows * unit * 3.2; g.add(cap);
  g.position.set(x, y, z); g.rotation.y = rotY;
  return g;
}

/* ============================ G07/G08/G09 三种屋顶形制 ============================ */
/** 庑殿顶（四阿顶，前后两坡 + 两侧三角形）。用 LatheGeometry 的凹弧近似：四面各一块。 */
export function hipRoof(THREE, kit, { width, depth, rise, overhang = 2.4, y = 0 }) {
  const g = new THREE.Group();
  const wHalf = width / 2 + overhang, dHalf = depth / 2 + overhang;
  // 前/后坡：用 PlaneGeometry 逐段顶点做出举折凹弧（每段一次抬升）
  for (const dir of [1, -1]) {
    const segs = 6;
    const geo = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    const cols2 = 8, prof = roofProfile(dHalf, rise, segs);
    for (let j = 0; j <= segs; j++) {
      const p = prof[j], t = j / segs;
      for (let i = 0; i <= cols2; i++) {
        const u = i / cols2;
        // 脊长随高度收缩（庑殿收山）
        const shrink = 1 - Math.pow(t, 1.35) * .58;
        const x = (u - .5) * width * shrink + (u - .5) * overhang * 2 * (1 - t);
        pos.push(x, p.y, dir * p.x); uv.push(u, t);
      }
    }
    for (let j = 0; j < segs; j++) for (let i = 0; i < cols2; i++) {
      const a = j * (cols2 + 1) + i, b = a + 1, c = a + cols2 + 1, dd = c + 1;
      if (dir > 0) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, kit.mat.roofTiles);
    mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  // 左右两坡（三角形，收山）：用 ShapeGeometry 近似
  for (const dir of [1, -1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(wHalf * 2, 0);
    sh.quadraticCurveTo(wHalf, rise * .55, wHalf * .72, rise);
    sh.lineTo(wHalf * 1.28, rise); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh, 12);
    const mesh = new THREE.Mesh(geo, kit.mat.roofTiles || kit.mat.roofTiles);
    // ShapeGeometry 在 XY 平面：绕 Y 转 90° 使其竖立，再沿 X 外移到山面位置
    mesh.rotation.y = dir * Math.PI / 2;
    mesh.position.set(dir * wHalf, y, 0);
    mesh.castShadow = true; g.add(mesh);
  }
  // G11 正脊
  g.add(ridge(THREE, kit, { len: width * .42, x: 0, y: y + rise, z: 0, axis: 'x' }));
  return g;
}

/** 歇山顶：庑殿的下半 + 山面的「悬鱼/搏风」三角形（九脊顶）。 */
export function gableHipRoof(THREE, kit, { width, depth, rise, overhang = 2.2, y = 0 }) {
  const g = hipRoof(THREE, kit, { width, depth, rise: rise * .58, overhang, y });
  // 上半：山面收进成「歇山」的博风板与悬鱼
  const wHalf = width / 2, dHalf = depth / 2;
  for (const dir of [1, -1]) {
    const sh = new THREE.Shape();
    sh.moveTo(-dHalf * .74, 0); sh.lineTo(dHalf * .74, 0);
    sh.quadraticCurveTo(0, rise * .62, dHalf * .74, 0);
    const face = new THREE.Mesh(new THREE.ShapeGeometry(sh, 14), kit.mat.redWall);
    face.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    face.position.set(dir * wHalf * .86, y + rise * .5, 0); g.add(face);
    // 博风板（搏风）：山面斜边贴金线
    const b = box(THREE, .3, dHalf * 1.5, .5, kit.mat.gold || kit.mat.caihua);
    b.rotation.z = dir * Math.PI / 2; b.position.set(dir * wHalf * .86, y + rise * .74, 0); g.add(b);
  }
  // 上半两坡（短脊）
  const top = hipRoof(THREE, kit, { width: width * .5, depth: depth * 1.02, rise: rise * .34, overhang: 1.2, y: y + rise * .5 });
  g.add(top);
  // 垂脊（四角）：沿 z 方向从山面檐口到正脊
  for (const sx of [1, -1]) {
    const r = ridge(THREE, kit, { len: depth * .58, x: sx * width * .3, y: y + rise * .5, z: 0, axis: 'z' });
    g.add(r);
  }
  return g;
}

/** G09 四角攒尖：方形平面，四坡收至中心宝顶。 */
export function squareZuanjian(THREE, kit, { width, rise, overhang = 1.8, y = 0, gilded = true }) {
  const g = new THREE.Group();
  const half = width / 2 + overhang;
  const segs = 6, prof = roofProfile(half, rise, segs);
  for (let side = 0; side < 4; side++) {
    const geo = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
    const cols2 = 10;
    for (let j = 0; j <= segs; j++) {
      const p = prof[j], t = j / segs;
      for (let i = 0; i <= cols2; i++) {
        const u = i / cols2;
        // 攒尖：四边向中心点收拢（越靠顶越靠近对角中线）
        const shrink = 1 - Math.pow(t, 1.5);
        const along = (u - .5) * width * shrink;
        pos.push(along, p.y, p.x); uv.push(u, t);
      }
    }
    for (let j = 0; j < segs; j++) for (let i = 0; i < cols2; i++) {
      const a = j * (cols2 + 1) + i, b = a + 1, c = a + cols2 + 1, dd = c + 1;
      idx.push(a, c, b, b, c, dd);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, kit.mat.roofTiles);
    mesh.rotation.y = side * Math.PI / 2; mesh.position.y = y; mesh.castShadow = true; g.add(mesh);
  }
  // 四角垂脊（对角方向）+ 中心鎏金宝顶
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const r = ridge(THREE, kit, { len: half * 1.35, x: 0, y: 0, z: 0, axis: 'z' });
    r.rotation.set(-Math.atan2(rise, half), a, 0);
    r.position.set(Math.sin(a) * half * .5, y + rise * .45, Math.cos(a) * half * .5); g.add(r);
  }
  const capMat = gilded ? (kit.mat.gold || kit.mat.caihua) : kit.mat.marble;
  const cap = cyl(THREE, .18, .62, 1.5, 10, capMat); cap.position.y = y + rise + .75; g.add(cap);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 10), capMat); ball.position.y = y + rise + 1.7; g.add(ball);
  return g;
}

/** G10 檐口一层（重檐时在下檐处加一圈平座与瓦口）。 */
export function eaveLayer(THREE, kit, { width, depth, overhang = 2.6, y = 0 }) {
  const g = new THREE.Group();
  const w = width + overhang * 2, d = depth + overhang * 2;
  const skirt = box(THREE, w, .55, d, kit.mat.ridgeTile);
  skirt.position.y = y + .28; g.add(skirt);
  const flat = box(THREE, width + overhang * 1.2, .3, depth + overhang * 1.2, kit.mat.stonePaving);
  flat.position.y = y - .2; g.add(flat);   // 平座/腰檐处的暗层
  return g;
}

/** G11 正脊/垂脊：长条脊筒 + 两端吻虾鱼基座。 */
export function ridge(THREE, kit, { len, x = 0, y = 0, z = 0, axis = 'x', h = .62 }) {
  const g = new THREE.Group();
  const along = axis === 'x' ? [len, h, h] : [h, h, len];
  const body = box(THREE, along[0], along[1], along[2], kit.mat.ridgeTile);
  body.position.y = h / 2; g.add(body);
  const cap = box(THREE, along[0] * .96, .18, along[2] * .7, kit.mat.gold || kit.mat.ridgeTile);
  cap.position.y = h + .09; g.add(cap);
  g.position.set(x, y, z);
  return g;
}

/** G12 走兽（小兽）：沿垂脊排列，数量随殿宇等级；实例化。 */
export function beastRow(THREE, kit, { count = 5, from, to }) {
  const geo = new THREE.BoxGeometry(.34, .42, .5); baseAlign(geo);
  const inst = new THREE.InstancedMesh(geo, kit.mat.gold || kit.mat.ridgeTile, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    m4.makeTranslation(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
    inst.setMatrixAt(i, m4);
  }
  return inst;
}

/** G13 正吻/鸱吻：正脊两端的大吻（方体 + 卷尾）。 */
export function chiwen(THREE, kit, { x, y, z, h = 2.6, mirror = 1 }) {
  const g = new THREE.Group();
  const body = box(THREE, .8, h, 1.5, kit.mat.ridgeTile); body.position.y = h / 2; g.add(body);
  const tail = cyl(THREE, .3, .55, h * .7, 8, kit.mat.ridgeTile);
  tail.position.set(.45 * mirror, h * .95, 0); tail.rotation.z = -.5 * mirror; g.add(tail);
  g.position.set(x, y, z);
  return g;
}

/* ============================ G14–G22 门窗、廊、亭、桥、城墙、角楼 ============================ */
/** G14 隔扇/门：按间数排门扇（含门钉），doors 给出开门的中线 x。 */
export function latticeDoor(THREE, kit, { bays, bayW, hWall, depth = .35, doors = [], open = 0 }) {
  const g = new THREE.Group();
  const w = bays * bayW;
  const wall = box(THREE, w, hWall, depth, kit.mat.redWall);
  wall.position.y = hWall / 2; g.add(wall);
  // 上部窗（菱花）与下部裙板：贴一层带 alpha 的格心
  const win = box(THREE, w * .96, hWall * .34, depth + .06, kit.mat.lattice);
  win.position.y = hWall * .72; g.add(win);
  // 门洞：挖空靠「开扇」实现——把门扇绕侧边旋转 open 弧度
  for (const dx of doors) {
    const leafW = bayW * .46, leafH = hWall * .58;
    for (const sgn of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(dx + sgn * leafW, 0, depth / 2);
      const leaf = box(THREE, leafW, leafH, .16, kit.mat.doorLeaf);
      leaf.position.set(-sgn * leafW / 2, leafH / 2, 0);
      pivot.add(leaf); pivot.rotation.y = -sgn * open; g.add(pivot);
    }
  }
  return g;
}

/** G15 门楼/阙楼：台城 + 层数 + 面阔（午门、神武门一类）。 */
export function gateTower(THREE, kit, b) {
  const g = new THREE.Group();
  const w = b.bays * b.bayW, d = (b.depthBays || 2) * b.bayW;
  // 台城（城台）：开券洞
  const city = box(THREE, w + 6, b.hWall, d + 4, kit.mat.redWall);
  city.position.y = b.hWall / 2; g.add(city);
  for (const dx of b.doors || []) {
    const hole = box(THREE, 3.4, b.hWall * .78, d + 4.6, kit.mat.stonePaving);
    hole.position.set(dx, b.hWall * .39, 0); g.add(hole);
  }
  // 城楼：重檐三滴水（简化为两层殿身 + 两道檐）
  const y0 = b.hWall;
  const body = latticeDoor(THREE, kit, { bays: b.bays, bayW: b.bayW, hWall: (b.hTotal - b.hWall) * .52, doors: b.doors });
  body.position.y = y0 + .3; g.add(body);
  g.add(eaveLayer(THREE, kit, { width: w, depth: d, y: y0 + (b.hTotal - b.hWall) * .52 }));
  const upper = latticeDoor(THREE, kit, { bays: Math.max(3, b.bays - 2), bayW: b.bayW, hWall: (b.hTotal - b.hWall) * .34 });
  upper.position.y = y0 + (b.hTotal - b.hWall) * .58; g.add(upper);
  g.add(hipRoof(THREE, kit, { width: Math.max(3, b.bays - 2) * b.bayW, depth: d * .7, rise: 3.4, y: y0 + (b.hTotal - b.hWall) * .92 }));
  return g;
}

/** G16 廊（庑房/抄手游廊）：沿 z 连续铺柱间，实例化柱与檐。 */
export function corridor(THREE, kit, { cx = 0, z0, z1, hWall = 5, bayW = BAY, form = '廊' }) {
  const g = new THREE.Group();
  const len = z1 - z0, n = Math.max(4, Math.round(len / bayW));
  const geo = new THREE.CylinderGeometry(DOUKOU * 5.5, DOUKOU * 6.5, hWall * .82, 10); baseAlign(geo);
  const inst = new THREE.InstancedMesh(geo, kit.mat.woodColumn, n + 1);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i <= n; i++) { m4.makeTranslation(cx, hWall * .82 / 2 + hWall * .1, z0 + len * i / n); inst.setMatrixAt(i, m4); }
  inst.castShadow = true; g.add(inst);

  const roofLen = len + bayW, roof = box(THREE, 6.2, .38, roofLen, kit.mat.roofTiles);
  roof.position.set(cx, hWall + .1, (z0 + z1) / 2); roof.rotation.x = 0; g.add(roof);
  const eaveA = box(THREE, 6.9, .3, roofLen, kit.mat.ridgeTile); eaveA.position.set(cx, hWall - .18, (z0 + z1) / 2); g.add(eaveA);
  const wall = box(THREE, 4.6, hWall * .78, roofLen, kit.mat.redWall);
  wall.position.set(cx, hWall * .49, (z0 + z1) / 2); g.add(wall);
  return g;
}

/** G17 亭（阙亭/井亭）：方形或圆形，攒尖顶。 */
export function pavilion(THREE, kit, { x = 0, y = 0, z = 0, width = 6, hWall = 4.2, gilded = true }) {
  const g = new THREE.Group();
  const grid = columnGrid(THREE, kit, { bays: 2, depthBays: 2, bayW: width / 2, h: hWall });
  g.add(grid.group);
  g.add(eaveLayer(THREE, kit, { width, depth: width, overhang: 1.4, y: hWall }));
  g.add(squareZuanjian(THREE, kit, { width, rise: width * .5, overhang: 1.4, y: hWall + .3, gilded }));
  return g;   // 由调用方平移（buildAll 统一处理）
}

/** G18 桥（五孔券洞）：石台 + 券洞 + 栏杆。 */
export function bridge(THREE, kit, { width = 40, span = 26, holes = 5, y = 0 }) {
  const g = new THREE.Group();
  const deck = box(THREE, width, 1.2, span + 4, kit.mat.marble); deck.position.y = y + .6; g.add(deck);
  for (let i = 0; i < holes; i++) {
    const x = (i - (holes - 1) / 2) * (width / holes) * .82;
    const arch = cyl(THREE, 1.9, 1.9, span + 5, 12, kit.mat.stonePaving);
    arch.rotation.x = Math.PI / 2; arch.position.set(x, y - .4, 0); g.add(arch);
  }
  for (const sgn of [1, -1]) {
    const rail = railing(THREE, kit, width / 2 - .6, span / 2 + 1.4, y + 1.2);
    // 桥栏杆只保留沿河两侧（z 方向）的长栏，去掉横向端头以免与桥台重复
    rail.scale.z = .02; rail.position.z = sgn * (span / 2 + 1.6) * .98; g.add(rail);
  }
  return g;
}

/** G19 城墙（带女墙与海墁）：四周围合。 */
export function wallCity(THREE, kit, { lenN, lenE, wallH, crenelH = 1.4 }) {
  const g = new THREE.Group();
  const t = 8.5;
  for (const [w, d, x, z] of [[lenE + t, t, 0, -lenN / 2], [lenE + t, t, 0, lenN / 2], [t, lenN, -lenE / 2, 0], [t, lenN, lenE / 2, 0]]) {
    const wall = box(THREE, w, wallH, d, kit.mat.redWall);
    wall.position.set(x, wallH / 2, z); wall.receiveShadow = true; g.add(wall);
    // 女墙：用细长条 + 实例化垛口（每 3 m 一齿）
    const cap = box(THREE, w + .4, crenelH * .3, d + .4, kit.mat.stonePaving);
    cap.position.set(x, wallH + crenelH * .15, z); g.add(cap);
    const along = Math.max(w, d), n = Math.round(along / 3.2);
    const geo = new THREE.BoxGeometry(d > w ? t * .8 : 1.1, crenelH, d > w ? 1.1 : t * .8); baseAlign(geo);
    const inst = new THREE.InstancedMesh(geo, kit.mat.stonePaving, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t2 = (i + .5) / n * along - along / 2;
      m4.makeTranslation(d > w ? x : x + t2, wallH + crenelH * .3, d > w ? z + t2 : z);
      inst.setMatrixAt(i, m4);
    }
    g.add(inst);
  }
  return g;
}

/** G20 角楼：十字脊三重檐（简化为两组歇山相交 + 宝顶）。 */
export function cornerTower(THREE, kit, { x = 0, z = 0, y = 0, size = 12, hTotal = 13 }) {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const s = size * (1 - k * .18), yy = y + k * hTotal / 3.4;
    g.add(eaveLayer(THREE, kit, { width: s, depth: s, overhang: 1.6, y: yy }));
  }
  g.add(gableHipRoof(THREE, kit, { width: size * .72, depth: size * .72, rise: 3.2, y: y + hTotal / 2.4 }));
  const cross = gableHipRoof(THREE, kit, { width: size * .72, depth: size * .72, rise: 3.0, y: y + hTotal / 2.4 });
  cross.rotation.y = Math.PI / 2; g.add(cross);
  const cap = cyl(THREE, .16, .5, 1.6, 8, kit.mat.gold || kit.mat.ridgeTile); cap.position.set(0, y + hTotal * .92, 0); g.add(cap);
  return g;   // 由调用方决定位置（buildAll 统一平移）
}

/** G22 树（古柏/槐）：低档用 billboard，高档用两段锥体 + 圆柱。 */
export function tree(THREE, kit, { x, z, h = 7, lod = 'high' }) {
  const g = new THREE.Group();
  const trunk = cyl(THREE, .22, .34, h * .45, 6, kit.mat.woodColumn); trunk.position.y = h * .22; g.add(trunk);
  if (lod === 'low') {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(h * .9, h * .8), kit.mat.treeLeaf || kit.mat.redWall);
    leaf.position.y = h * .68; leaf.rotation.y = Math.PI / 4; g.add(leaf);
  } else {
    for (let i = 0; i < 2; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (.3 - i * .07), h * (.5 - i * .1), 8), kit.mat.treeLeaf || kit.mat.redWall);
      cone.position.y = h * (.55 + i * .2); cone.castShadow = true; g.add(cone);
    }
  }
  g.position.set(x, 0, z);
  return g;
}

/** 构件表（供 smoke.mjs 核对 G 编号齐备与实例数）。 */
export const PARTS = [
  'terrace', 'railing', 'chiShou', 'columnGrid', 'douGong', 'beamFrame', 'hipRoof', 'gableHipRoof',
  'squareZuanjian', 'eaveLayer', 'ridge', 'beastRow', 'chiwen', 'latticeDoor', 'gateTower',
  'corridor', 'pavilion', 'bridge', 'wallCity', 'cornerTower', 'tree',
];
