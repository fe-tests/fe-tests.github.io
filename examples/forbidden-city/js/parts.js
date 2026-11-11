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

/* ------------------------------ 合批（压 drawCalls 的核心，见 PROGRESS.md D16）------------------------------
 * 场景里有 ~1200 个小 Mesh（屋脊、梁枋、门洞、檐层…），每个一次 drawCall，瓶颈在批次不在面数。
 * mergeGroup() 把「同一 Group 子树里的普通 Mesh」按材质合并成少数几个 BufferGeometry：
 *   · 只处理 isMesh（非实例化）；InstancedMesh 本来就是一次一材质一批，保持原样挂回
 *   · 逐材质一个合并几何 → 一个 Mesh；变换全部烘进顶点（世界矩阵），根节点保留原有位置/旋转
 *   · 阴影标记取并集：任一源 castShadow → 合并体 castShadow（receive 同理）
 * 约束：parts.js 不 import three，由 caller 注入 THREE，故本函数在 Node 冒烟里也能跑（vm 真实 three.min.js）。
 */
export function mergeGroup(root, THREE) {
  if (!root || !root.traverse) return root;

  // 1) 收集：合并体烘「root 局部空间」坐标 —— 收集链 = 祖先链相乘，**不含 root.matrix**。
  //    walk(root) 只遍历它的孩子（不乘 root.matrix），故链从单位阵起步于 root 的直接子级。
  //    建筑组带位移 (cx,0,cz)，合并后顶点随根移动，与未合并时语义完全一致
  //    （探针里 root 有位移 + 嵌套的断言钉住这一点）。
  //    InstancedMesh 不烘焙（批次语义不变），挂回时对祖先链差值取逆补偿。
  const items = [];
  const movs = [];   // 可开合门扇枢轴（userData.movable）：不烘焙，挂回时保留枢轴链（阶段 6，interior.js）
  function walk(node, chainMat) {
    // chainMat = 「node 的全部祖先（不含 root）矩阵链」；node 自身 matrix 在收集时右乘进去。
    if (node.userData && node.userData.movable) { movs.push({ node: node, chain: chainMat }); return; }
    if (node.isInstancedMesh) node.__fcParentChain = chainMat;   // 挂回时剥离祖先链用（见第 4 步）
    const mat = node.matrix ? chainMat.clone().multiply(node.matrix) : chainMat;
    if (node.isMesh && !node.isInstancedMesh && node.geometry && node.material && !Array.isArray(node.material)) {
      items.push({ mesh: node, world: mat });
    }
    for (const child of node.children || []) walk(child, mat);
  }
  // 从 root 的直接子级起步（root.matrix 不进链）→ 收集链是「root 局部口径」
  for (const child of root.children || []) walk(child, new THREE.Matrix4());

  // 1b) 合并体挂在 root 下：顶点局部 = 收集链（已是 root 局部口径），无需再乘 inv(root.matrix)。
  //     root 带位移（建筑摆位 (cx,0,cz)）时，合并体随根移动，与未合并语义一致。

  // 1c) 装配完成态口径：调用方约定「组摆上中轴 → updateMatrixWorld(true) → 合并」。
  //     收集读的是 node.matrix（当前值），bakeRoot 前置用 root.matrix（root.matrixWorld 的
  //     祖先链部分）。两者同源于装配瞬间，故无需在函数内强制刷新矩阵。

  // 2) 按材质分桶（Map 保序，输出稳定 → smoke 的统计可复现）
  const buckets = new Map();
  for (const it of items) {
    const key = it.mesh.material;
    let b = buckets.get(key);
    if (!b) { b = { material: key, cast: false, recv: false, geos: [] }; buckets.set(key, b); }
    b.cast = b.cast || !!it.mesh.castShadow;
    b.recv = b.recv || !!it.mesh.receiveShadow;
    // 索引几何：顶点变换 + 法线（逆转置）+ UV 拷贝；非索引几何先展平成独立三角形序列再参与合并。
    // it.world 已是 root 局部口径（收集链不含 root.matrix），直接烘进顶点即可。
    const worldLocal = it.world;
    const inv = new THREE.Matrix4().copy(worldLocal).invert();
    const nm = new THREE.Matrix3().getNormalMatrix(inv);
    let g = it.mesh.geometry;
    if (!g.index) {
      const gp = g.attributes.position, gn0 = g.attributes.normal, gu0 = g.attributes.uv;
      const n = gp.count, pf = new Float32Array(n * 9), nf = new Float32Array(n * 9), uf = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        pf[i * 3] = gp.getX(i); pf[i * 3 + 1] = gp.getY(i); pf[i * 3 + 2] = gp.getZ(i);
        if (gn0) { nf[i * 3] = gn0.getX(i); nf[i * 3 + 1] = gn0.getY(i); nf[i * 3 + 2] = gn0.getZ(i); }
        if (gu0) { uf[i * 2] = gu0.getX(i); uf[i * 2 + 1] = gu0.getY(i); }
      }
      const flat = new THREE.BufferGeometry();
      flat.setAttribute('position', new THREE.Float32BufferAttribute(pf, 3));
      if (gn0) flat.setAttribute('normal', new THREE.Float32BufferAttribute(nf, 3));
      if (gu0) flat.setAttribute('uv', new THREE.Float32BufferAttribute(uf, 2));
      g = flat;
    } else {
      g = g.clone();
    }
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const p3 = new THREE.Vector3(), n3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p3.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(worldLocal);
      pos.setXYZ(i, p3.x, p3.y, p3.z);
      if (nor) {
        n3.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(nm).normalize();
        nor.setXYZ(i, n3.x, n3.y, n3.z);
      }
    }
    b.geos.push(g);
  }

  // 3) 拼接：逐材质一个合并体。全部几何都是索引化的（three 内置 Box/Cylinder/…都带 index），
  //    直接 setIndex 单组 → 1 drawCall；若出现非索引几何，退路是展平为「每三角形 3 顶点」的独立序列。
  const merged = [];
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    let totalPos = 0, hasAnyIndex = true;
    for (const g of b.geos) {
      totalPos += g.attributes.position.count;
      if (!g.index) hasAnyIndex = false;
    }
    const posA = new Float32Array(totalPos * 3);
    const norA = new Float32Array(totalPos * 3);
    const uvA = new Float32Array(totalPos * 2);
    let pOff = 0;
    for (const g of b.geos) {
      const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
      for (let i = 0; i < gp.count; i++) {
        posA[(pOff + i) * 3] = gp.getX(i); posA[(pOff + i) * 3 + 1] = gp.getY(i); posA[(pOff + i) * 3 + 2] = gp.getZ(i);
        if (gn) { norA[(pOff + i) * 3] = gn.getX(i); norA[(pOff + i) * 3 + 1] = gn.getY(i); norA[(pOff + i) * 3 + 2] = gn.getZ(i); }
        if (gu) { uvA[(pOff + i) * 2] = gu.getX(i); uvA[(pOff + i) * 2 + 1] = gu.getY(i); }
      }
      pOff += gp.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    if (b.geos.some((g) => g.attributes.normal)) geo.setAttribute('normal', new THREE.Float32BufferAttribute(norA, 3));
    if (b.geos.some((g) => g.attributes.uv)) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));

    if (hasAnyIndex) {
      // 索引拼接（单组）：合并体内不可能混入非索引几何（walk 已统一展平），故逐桶判定即可
      let totalIdx = 0;
      for (const g of b.geos) totalIdx += g.index.count;
      const idxA = totalPos > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
      let iOff = 0, po = 0;
      for (const g of b.geos) {
        const gi = g.index;
        for (let i = 0; i < gi.count; i++) idxA[iOff + i] = po + gi.getX(i);
        iOff += gi.count; po += g.attributes.position.count;
      }
      geo.setIndex(new THREE.BufferAttribute(idxA, 1));
    }
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    mesh.name = 'merged';
    merged.push(mesh);
  }

  // 4) 清空根节点，保留变换/阴影标记语义：合并体 + 原实例化挂回根。
  //    InstancedMesh 批次语义不变，从原父级摘出挂回根；收集链不含 root.matrix（root 局部口径），
  //    挂回根后要求世界位置零漂移：newLocal = chain × oldLocal。
  //    applyMatrix4 是 M×S（左乘）：喂 chain → S' = chain × oldLocal —— 挂回根后世界零漂移
  //    （root.matrixWorld × S' = root.matrix × T_sub × oldLocal，与合并前逐字相等）。
  const insts = [];
  root.traverse((o) => { if (o.isInstancedMesh) insts.push(o); });
  for (const o of insts) if (o.parent) o.parent.remove(o);
  while (root.children.length) root.remove(root.children[0]);
  for (const o of insts) {
    const chain = o.__fcParentChain || new THREE.Matrix4();
    o.applyMatrix4(chain);        // S' = chain × oldLocal —— 挂回根后世界零漂移（见上注释）
    o.matrixAutoUpdate = false;   // 局部矩阵已烘好：渲染循环 updateMatrixWorld 只沿 matrixWorld 传播，不再 compose 覆盖
    delete o.__fcParentChain;
    root.add(o);
  }
  // 可开合门扇枢轴：与 InstancedMesh 同款挂回（S' = chain × oldLocal，世界零漂移），
  // 之后由 interior.updateDoors() 以「base × RotY(开角)」直接写 matrix 驱动开合，不参与烘焙。
  for (const o of movs) {
    o.node.applyMatrix4(o.chain);
    o.node.matrixAutoUpdate = false;      // 动画直接改 matrix，不再 compose
    o.node.userData.movable.base = o.node.matrix.clone();
    root.add(o.node);
  }
  for (const m of merged) { m.matrixAutoUpdate = false; root.add(m); }
  return root;
}

/** 子树统计（smoke / 调试用）：{mesh, instancedMesh, instances, triangles, materials:Set}。
 *  tris = 每 Mesh 的 index.count/3（无索引则 position.count/3），实例化按 count 倍增。 */
export function subtreeStats(root) {
  const s = { mesh: 0, instancedMesh: 0, instances: 0, triangles: 0, materials: new Set() };
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh) { s.instancedMesh++; s.instances += o.count; }
    else s.mesh++;
    const g = o.geometry;
    if (!g) return;
    let tris = 0;
    if (g.index) tris = Math.floor(g.index.count / 3);
    else if (g.attributes && g.attributes.position) tris = Math.floor(g.attributes.position.count / 3);
    s.triangles += tris * (o.isInstancedMesh ? o.count : 1);
    if (Array.isArray(o.material)) { for (const m of o.material) s.materials.add(m); }
    else if (o.material) s.materials.add(o.material);
  });
  return s;
}

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

/** G02 栏杆：矩形四周的望柱与栏板。
 *  instanced=true → 望柱/柱帽用 InstancedMesh（台基四周上百根，1 drawCall）；
 *  instanced=false → 普通 Mesh（桥栏一类小体量，交给 caller 合批更省 drawCall）。 */
export function railing(THREE, kit, halfW, halfD, y, spacing = 1.6, { instanced = true } = {}) {
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
  const m4 = new THREE.Matrix4();
  if (instanced) {
    const inst = new THREE.InstancedMesh(post, kit.mat.marble, pts.length);
    const capInst = new THREE.InstancedMesh(capGeo, kit.mat.marble, pts.length);
    pts.forEach(([x, z], i) => {
      m4.makeTranslation(x, y + .52, z); inst.setMatrixAt(i, m4);
      m4.makeTranslation(x, y + 1.08, z); capInst.setMatrixAt(i, m4);
    });
    inst.castShadow = capInst.castShadow = true;
    g.add(inst, capInst);
  } else {
    for (const [x, z] of pts) {
      const p = new THREE.Mesh(post, kit.mat.marble);
      p.position.set(x, y + .52, z); p.castShadow = true; g.add(p);
      const c = new THREE.Mesh(capGeo, kit.mat.marble);
      c.position.set(x, y + 1.08, z); c.castShadow = true; g.add(c);
    }
  }

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
/** G04 柱网：按面阔/进深间数排檐柱（可选减柱造），返回 {group, columns[]}。
 *  instanced=false 时改出普通 Mesh（小体量柱网走合批更省 drawCall）。 */
export function columnGrid(THREE, kit, { bays, depthBays, bayW, h, reduced = 0, golden = 0, instanced = true }) {
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
  const m4 = new THREE.Matrix4();
  if (instanced) {
    const inst = new THREE.InstancedMesh(geo, kit.mat.woodColumn, ring.length);
    ring.forEach(([x, z], i) => { m4.makeTranslation(x, h / 2, z); inst.setMatrixAt(i, m4); cols.push([x, z]); });
    inst.castShadow = true; g.add(inst);
  } else {
    ring.forEach(([x, z]) => {
      const m = new THREE.Mesh(geo, kit.mat.woodColumn);
      m.position.set(x, h / 2, z); m.castShadow = true; g.add(m); cols.push([x, z]);
    });
  }

  // 柱础（白石，实例化）
  const baseGeo = new THREE.CylinderGeometry(DOUKOU * 11, DOUKOU * 12, .3, 12);
  if (instanced) {
    const bi = new THREE.InstancedMesh(baseGeo, kit.mat.marble, ring.length);
    ring.forEach(([x, z], i) => { m4.makeTranslation(x, .15, z); bi.setMatrixAt(i, m4); });
    g.add(bi);
  } else {
    ring.forEach(([x, z]) => {
      const m = new THREE.Mesh(baseGeo, kit.mat.marble);
      m.position.set(x, .15, z); g.add(m);
    });
  }

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
/** G14 隔扇/门：按间数排门扇（含门钉），doors 给出开门的中线 x。
 *  movable 里的 dx 用「枢轴门扇」代替静态开门：枢轴挂 userData.movable，
 *  mergeGroup 保留枢轴链（阶段 6 开合动画由 interior.updateDoors 驱动）。 */
export function latticeDoor(THREE, kit, { bays, bayW, hWall, depth = .35, doors = [], open = 0, movable = [] }) {
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
      pivot.add(leaf);
      if (movable.indexOf(dx) >= 0) {
        // 可开合：静态闭扇不做（开合由动画接管），枢轴打标记交给 mergeGroup 保留
        pivot.userData.movable = { sgn: sgn, t: 0, base: null };
      } else {
        pivot.rotation.y = -sgn * open;
      }
      g.add(pivot);
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

/** G17 亭（阙亭/井亭/角亭）：方形平面，攒尖顶（默认）或盝顶。午门四角亭与桥亭用盝顶。
 *  tiers>1 时加一圈腰檐（重檐）。 */
export function pavilion(THREE, kit, { x = 0, y = 0, z = 0, width = 6, hWall = 4.2, gilded = true, form = '攒尖', tiers = 1, instanced = true }) {
  const g = new THREE.Group();
  const grid = columnGrid(THREE, kit, { bays: 2, depthBays: 2, bayW: width / 2, h: hWall, instanced });
  g.add(grid.group);
  g.add(eaveLayer(THREE, kit, { width, depth: width, overhang: 1.4, y: hWall }));
  if (form === '盝顶') g.add(ruffTop(THREE, kit, { width, overhang: 1.4, y: hWall + .35, gilded }));
  else g.add(squareZuanjian(THREE, kit, { width, rise: width * .5, overhang: 1.4, y: hWall + .3, gilded }));
  if (tiers > 1) g.add(eaveLayer(THREE, kit, { width: width * 1.6, depth: width * 1.6, overhang: 1.1, y: hWall * .55 }));
  return g;   // 由调用方平移（buildAll 统一处理）
}

/** G17b 盝顶：庑殿截顶 —— 四坡收到一段平顶，平顶四周起四脊（午门角亭/桥亭的顶形）。 */
export function ruffTop(THREE, kit, { width, overhang = 1.4, y = 0, gilded = true, capRatio = .58 }) {
  const g = new THREE.Group();
  const wHalf = width / 2 + overhang, rise = width * .34;
  const capHalf = width * capRatio / 2;
  // 四坡：每边一块梯形坡面（檐口 → 平顶口）
  for (let side = 0; side < 4; side++) {
    const geo = new THREE.BufferGeometry();
    const pos = [
      -wHalf, 0, wHalf, wHalf, 0, wHalf,
      capHalf, rise, capHalf, -capHalf, rise, capHalf,
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, kit.mat.roofTiles);
    m.rotation.y = side * Math.PI / 2; m.position.y = y; m.castShadow = true; g.add(m);
  }
  const cap = box(THREE, capHalf * 2, .34, capHalf * 2, kit.mat.roofTiles);
  cap.position.y = y + rise + .17; g.add(cap);
  for (const [px, pz, axis] of [[0, -capHalf, 'x'], [0, capHalf, 'x'], [-capHalf, 0, 'z'], [capHalf, 0, 'z']]) {
    g.add(ridge(THREE, kit, { len: capHalf * 2, x: px, y: y + rise + .3, z: pz, axis }));
  }
  const capMat = gilded ? (kit.mat.gold || kit.mat.caihua) : kit.mat.marble;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.34, 10, 8), capMat);
  ball.position.y = y + rise + .62; g.add(ball);
  return g;
}

/** G18 桥（五孔券洞）：石台 + 券洞 + 栏杆。railInst=false 时栏杆出普通 Mesh（小体量桥走合批）。 */
export function bridge(THREE, kit, { width = 40, span = 26, holes = 5, y = 0, railInst = true }) {
  const g = new THREE.Group();
  const deck = box(THREE, width, 1.2, span + 4, kit.mat.marble); deck.position.y = y + .6; g.add(deck);
  for (let i = 0; i < holes; i++) {
    const x = (i - (holes - 1) / 2) * (width / holes) * .82;
    const arch = cyl(THREE, 1.9, 1.9, span + 5, 12, kit.mat.stonePaving);
    arch.rotation.x = Math.PI / 2; arch.position.set(x, y - .4, 0); g.add(arch);
  }
  for (const sgn of [1, -1]) {
    const rail = railing(THREE, kit, width / 2 - .6, span / 2 + 1.4, y + 1.2, 1.9, { instanced: railInst });
    // 桥栏杆只保留沿河两侧（z 方向）的长栏，去掉横向端头以免与桥台重复
    rail.scale.z = .02; rail.position.z = sgn * (span / 2 + 1.6) * .98; g.add(rail);
  }
  return g;
}

/** G23 城台（凹字城台/城楼下的台城）：红墙 + 海墁 + 女墙 + 券洞。
 *  len 沿 x、depth 沿 z；doors 给券洞中线 x（不传则不开洞）；crenelAxis 指垛口排布的长边。 */
export function cityPlatform(THREE, kit, { len, depth, hWall, doors = [], openingW = 3.4, crenelH = 1.4, crenelAxis = 'x' }) {
  const g = new THREE.Group();
  const body = box(THREE, len, hWall, depth, kit.mat.redWall);
  body.position.set(0, hWall / 2, 0); body.castShadow = true; body.receiveShadow = true; g.add(body);
  for (const dx of doors) {
    const hole = box(THREE, openingW, hWall * .78, depth + .6, kit.mat.stonePaving);
    hole.position.set(dx, hWall * .39, 0); g.add(hole);
  }
  // 顶面海墁 + 女墙四圈
  const deck = box(THREE, len + .8, .3, depth + .8, kit.mat.stonePaving);
  deck.position.y = hWall + .15; g.add(deck);
  for (const [w, d, x, z] of [[len + .8, .9, 0, -depth / 2 - .05], [len + .8, .9, 0, depth / 2 + .05], [.9, depth + .8, -len / 2 - .05, 0], [.9, depth + .8, len / 2 + .05, 0]]) {
    const wall = box(THREE, w, crenelH * .55, d, kit.mat.redWall);
    wall.position.set(x, hWall + crenelH * .42, z); g.add(wall);
  }
  // 垛口：沿长边两侧，实例化（每 3.2 m 一齿）
  const along = crenelAxis === 'x' ? len : depth;
  const n = Math.max(6, Math.round(along / 3.2));
  const geo = new THREE.BoxGeometry(1.1, crenelH, 1.1); baseAlign(geo);
  const m4 = new THREE.Matrix4();
  for (const edge of [-1, 1]) {
    const inst = new THREE.InstancedMesh(geo, kit.mat.stonePaving, n);
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n * along - along / 2;
      if (crenelAxis === 'x') m4.makeTranslation(t, hWall + crenelH * .55, edge * (depth / 2 + .45));
      else m4.makeTranslation(edge * (len / 2 + .45), hWall + crenelH * .55, t);
      inst.setMatrixAt(i, m4);
    }
    inst.castShadow = true; g.add(inst);
  }
  return g;
}

/** G24 桥亭（内金水桥侧桥上的三间桥亭）：桥面顶上的柱网 + 梁架 + 顶。
 *  y 是桥面顶标高（builder 传），bays 间数沿 x，depth 沿 z（桥的跨度方向）。 */
export function bridgePavilion(THREE, kit, { width = 12, bays = 3, depth = 8, hWall = 3.4, y = 0, form = '庑殿' }) {
  const g = new THREE.Group();
  const bayW = width / bays;
  const grid = columnGrid(THREE, kit, { bays, depthBays: 2, bayW, h: hWall, instanced: false });
  g.add(grid.group);
  g.add(beamFrame(THREE, kit, { bays, depthBays: 2, bayW, hWall }));
  if (form === '庑殿') g.add(hipRoof(THREE, kit, { width: bays * bayW, depth, rise: hWall * .62, y: hWall }));
  else g.add(ruffTop(THREE, kit, { width: bays * bayW, overhang: 1.1, y: hWall + .3 }));
  g.position.y = y;
  return g;
}

/** G25 河（内金水河一段）：河床 + 水面 + 石砌河堤。len 沿 x，width 沿 z。 */
export function river(THREE, kit, { len = 460, width = 22, bankH = 1.6, y = 0 }) {
  const g = new THREE.Group();
  const bed = box(THREE, len, bankH + .6, width + 4, kit.mat.stonePaving);
  bed.position.y = y - (bankH + .6) / 2 + .05; g.add(bed);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(len, width), kit.mat.water);
  water.rotation.x = -Math.PI / 2; water.position.set(0, y + .05, 0); water.name = 'water'; g.add(water);
  for (const sgn of [1, -1]) {
    const banq = box(THREE, len, bankH, 3, kit.mat.stonePaving);
    banq.position.set(0, y + bankH / 2 - .1, sgn * (width / 2 + 1.5));
    banq.receiveShadow = true; g.add(banq);
    const top = box(THREE, len + .6, .22, 3.6, kit.mat.marble);
    top.position.set(0, y + bankH - .02, sgn * (width / 2 + 1.5)); g.add(top);
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
  'corridor', 'pavilion', 'ruffTop', 'bridge', 'cityPlatform', 'bridgePavilion', 'river',
  'wallCity', 'cornerTower', 'tree',
];

/** 合批工具表（smoke.mjs 核对：mergeGroup 必须可 import 且是函数）。 */
export const BATCH_TOOLS = ['mergeGroup'];
