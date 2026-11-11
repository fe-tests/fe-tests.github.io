/* 3D 故宫游览 · js/interior.js —— 阶段 6：三大殿室内层 + 门扇开合（见 PROGRESS.md §4 阶段 6）
 * 约定：
 *  - 室内构件在 mergeGroup **之前**加进 hall() 的组：顶点烘焙进合并体，0 新增 Mesh（省 draw 预算）。
 *  - 材质全部复用 kit.mat.*（goldBrick/marble/gold/caihua/plaque + 藻井 cap basic），
 *    殿内每个材质桶都并入该殿已有的 merge 桶（省 draw 预算；assets.md §7：材质 21 → 23 = 新增金砖地 `goldBrick` + 藻井顶片 basic 两块，蟠龙 `cloudDragon` 直挂不受光照）。
 *  - 本模块不 import three（THREE 由调用方注入参数）、顶层不碰 DOM/THREE —— Node 冒烟可直跑纯逻辑。
 * 坐标口径：与 hall() 完全一致 —— 组原点＝殿身底部中心（台顶），**正面（门/匾）朝 -Z（南，来路一侧）**。
 */
'use strict';

import { DOOR_OPEN_DIST } from './config.js';
import { HALL_IDS } from './layout.js';
import { recordInterior } from './state.js';

/** 室内构件清单（D01 命名惯例；assets.md §4 台账引用）。 */
export const INTERIOR_ELEMENTS = ['floor', 'platform', 'throne', 'screen', 'zaoJin', 'plaque', 'urns'];

const MAX_OPEN = 1.12;                 // 门扇开足角（rad ≈ 64°，与 latticeDoor open 口径一致）

const box = (THREE, w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (THREE, rt, rb, h, seg, m) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

/** G26（新增）殿内空间：地板＋台座＋宝座＋屏风＋藻井＋匾额＋铜缸。
 *  返回值直接进建筑组（调用方在 mergeGroup 前 add 进去）。
 *  @param {object} b     layout 建筑记录（需 b.interior）
 *  @param {object} opts  { plaqueMat: 与前檐匾额共用同一 T13 材质实例（不新增材质）, wallT }
 */
export function hallInterior(THREE, kit, b, opts = {}) {
  const g = new THREE.Group();
  const it = b.interior;
  if (!it) return g;

  const bayW = b.bayW, w = b.bays * bayW;
  const d = b.depthM != null ? b.depthM : b.depthBays * bayW;
  const hWall = b.hWall, wallT = opts.wallT != null ? opts.wallT : .5;

  function addBox(wd, ht, dp, mat, x, y, z) {
    const m = box(THREE, wd, ht, dp, mat);
    m.position.set(x, y, z);
    g.add(sh(m));
    return m;
  }

  // 1) 金砖地坪（T05「金砖」）：墙线以内，宝顶 0.12
  const floor = addBox(w - .6, .12, d - .6, kit.mat.goldBrick, 0, .06, 0);
  floor.castShadow = false;

  // 2) 三台（须弥座式小台基）＋正面三级踏道：宝座前区居中、略偏后（朝 -Z 上步）
  const pw = w * .52, pd = d * .30, cy = d * .06, topY = .12 + 1.02;
  addBox(pw, .34, pd, kit.mat.marble, 0, .12 + .17, cy);
  addBox(pw * .82, .34, pd * .82, kit.mat.marble, 0, .12 + .51, cy);
  addBox(pw * .64, .34, pd * .64, kit.mat.marble, 0, .12 + .85, cy);
  for (let s = 0; s < 3; s++)
    addBox(3.4, .38 * (s + 1), 1.0, kit.mat.marble, 0, .19 * (s + 1), cy - pd / 2 - 1.5 + s * 1.0);

  // 3) 宝座：crown 龙椅（带金柱围屏）／platform 方几座／hearth 坤宁宫暖炕与灶
  if (it.throne === 'hearth') {
    addBox(7.0, .70, Math.min(9.0, d * .45), kit.mat.goldBrick, 0, topY + .35, d * .12);   // 通炕
    addBox(2.6, .80, 3.0, kit.mat.marble, 0, topY + .40, d * .12 - 2.4);                   // 灶台
  } else {
    addBox(5.4, .50, 3.2, kit.mat.goldBrick, 0, topY + .25, cy);                            // 椅座台
    addBox(3.4, .90, 2.2, kit.mat.gold, 0, topY + .95, cy);                                 // 髹金椅盘
    addBox(3.6, 2.30, .18, kit.mat.gold, 0, topY + 2.05, cy + 1.0);                         // 围屏背屏
    addBox(.18, 2.10, 2.2, kit.mat.gold, -1.85, topY + 1.55, cy + .1);                      // 侧屏
    addBox(.18, 2.10, 2.2, kit.mat.gold, 1.85, topY + 1.55, cy + .1);
    if (it.throne === 'crown') {                                                           // 六柱金漆柱（扇面）
      for (const sx of [-1.7, 1.7]) {
        const p = cyl(THREE, .10, .12, 3.6, 12, kit.mat.gold);
        p.position.set(sx, topY + 1.8, cy - 1.35);
        g.add(sh(p));
      }
    }
  }

  // 4) 七扇金漆雕龙围屏（caihua 彩画材质代用）：宝座后弧形排开
  if (it.throne !== 'hearth') {
    for (let i = 0; i < 5; i++) {
      const p = addBox(w * .14, 3.4, .16, kit.mat.caihua, (i - 2) * w * .135, topY + 1.7, cy + pd / 2 + 1.6);
      p.rotation.y = (i - 2) * .16;
    }
  }

  // 5) 藻井：八金柱内天花，蟠龙贴（T12）朝下俯视——basic 材质自发光，暗殿里可见（assets.md §7 登记）
  if (it.zaoJin) {
    const r = Math.min(w, d) * .16, oy = hWall * .92;
    const ring = cyl(THREE, r * 1.35, r * 1.5, .55, 8, kit.mat.gold); ring.position.set(0, oy, 0); g.add(sh(ring));
    const ring2 = cyl(THREE, r * .95, r * 1.12, .5, 8, kit.mat.gold); ring2.position.set(0, oy - .55, 0); g.add(sh(ring2));
    const capMat = opts.capMat || kit.mat.cloudDragon;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * .95, 24), capMat);
    cap.rotation.x = Math.PI / 2;                 // 法线 +Z → -Y：蟠龙朝下
    cap.position.set(0, oy - .15, 0);
    g.add(cap);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(r * .26, 12, 10), kit.mat.gold);
    orb.scale.y = .6; orb.position.set(0, oy - .95, 0);
    g.add(sh(orb));                               // 轩辕水镜下「噙宝轩辕」垂兽
  }

  // 6) 内檐匾额：背墙（+Z）内面，正面朝 -Z —— 共用前檐匾额材质实例，不新增 T13 烧制
  if (it.plaque) {
    const pm = opts.plaqueMat || kit.plaqueFor(it.plaque);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(bayW * 1.5, bayW * .5), pm);
    q.position.set(0, hWall * .70, d / 2 - wallT - .06);
    q.rotation.y = Math.PI;                       // 法线 +Z → -Z：照壁朝殿内
    g.add(q);
  }

  // 7) 鎏金铜缸（太平缸）：台座四角。内壁鎏金 → 复用 gold 材质（不新增 merge 桶），与殿外陈设铜缸同型
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const u = cyl(THREE, .42, .34, .8, 12, kit.mat.gold);
    u.position.set(sx * (pw / 2 - .9), topY + .4, cy - pd / 2 + .9);
    g.add(sh(u));
  }

  return g;
}

/* ------------------------------ 门扇开合状态机（纯数学，r128 Matrix4 列主序直写） ------------------------------ */

/** 从 entries 收集门态（buildAll 之后调用）：枢轴来自 mergeGroup 保留的 movable 子树。 */
export function makeDoorState(entry) {
  if (!entry || !entry.group || !entry.fp || !entry.rec || !entry.rec.interior) return null;
  const pivots = [];
  entry.group.traverse((o) => { if (o.userData && o.userData.movable) pivots.push(o); });
  if (!pivots.length) return null;
  const e = entry.fp;
  // 门口点：檐外 1.2 m（足迹边缘朝外），人从南面走近时按此距判定（fp.halfD 含出檐 2.4）
  return { gate: { x: e.cx, z: e.cz - e.halfD + 1.2 }, pivots: pivots, t: 0 };
}

/** 门扇开合驱动（纯逻辑，不需 THREE）：近门 dist<DOOR_OPEN_DIST → 平滑开门；离开 → 关门。
 *  pivot.matrix = base × RotY(-sgn·t·MAX_OPEN)：base 为 mergeGroup 烘焙的枢轴基矩阵（clone）。 */
function applyDoor(p, ang) {
  const base = p.userData.movable.base;
  if (!base || !base.elements) return;
  const b = base.elements, e = p.matrix.elements;
  const c = Math.cos(ang), s = Math.sin(ang);
  const c0 = b[0], c1 = b[1], c2 = b[2], c3 = b[3], c8 = b[8], c9 = b[9], c10 = b[10], c11 = b[11];
  e[0] = c0 * c + c8 * s;  e[1] = c1 * c + c9 * s;  e[2] = c2 * c + c10 * s; e[3] = c3 * c + c11 * s;
  e[8] = c8 * c - c0 * s;  e[9] = c9 * c - c1 * s;  e[10] = c10 * c - c2 * s; e[11] = c11 * c - c3 * s;
  p.matrixAutoUpdate = false;
  p.matrixWorldNeedsUpdate = true;
}

export function updateDoors(doors, pose, dt, opts = {}) {
  const dist = opts.dist != null ? opts.dist : DOOR_OPEN_DIST;
  for (const st of doors) {
    const want = pose ? (Math.hypot(pose.x - st.gate.x, pose.z - st.gate.z) < dist ? 1 : 0) : 0;
    const k = Math.min(1, Math.max(0, dt * 1.9));
    st.t += (want - st.t) * k;
    if (Math.abs(st.t - want) < .004) st.t = want;
    for (const p of st.pivots)
      applyDoor(p, -p.userData.movable.sgn * st.t * MAX_OPEN);
  }
  return doors;
}

/* ------------------------------ 入内触发（成就＋弹卡；口径与 recordZone 一致，只认人在地面） ------------------------------ */

/** 走进三大殿内部 → recordInterior；返回新解锁成就数组（供 main 弹提示）。纯函数：只改 state.progress。 */
export function enterHalls(state, entries, pose) {
  const unlocked = [];
  if (!pose || !entries) return unlocked;
  for (const e of entries) {
    if (!e.rec || !e.rec.interior || HALL_IDS.indexOf(e.id) < 0) continue;
    if (pose.y < e.y - .5 || pose.y > e.y + 3.5) continue;                 // 只认地坪视平（高空飞越/俯瞰不计，D21 同款口径）
    const dx = Math.abs(pose.x - e.fp.cx), dz = Math.abs(pose.z - e.fp.cz);
    if (dx > e.fp.halfW - 3.4 || dz > e.fp.halfD - 3.4) continue;          // 半宽含出檐 2.4＋墙厚，进到墙线内才算
    const got = recordInterior(state, e.id);
    for (let i = 0; i < got.length; i++) unlocked.push(got[i]);
  }
  return unlocked;
}
