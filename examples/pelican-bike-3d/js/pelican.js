/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/pelican.js —— 鹈鹕本体（驼背骑行姿态）
 * 组件局部坐标与自行车一致：前进 = +X，上 = +Y，右 = +Z；group 原点 = 髋部（坐在车座上）。
 * 结构：躯干 + 尾 + 双翼（收拢/展翅）+ S 形颈（5 节链）+ 头（冠羽/眼）+ 长喙（上喙/下喙铰接）+ 喉囊（弹性摆动）
 *      + 双腿链（髋 →〔股骨 + 羽领〕→ 膝链接 →〔胫骨 + 跗骨〕→ 踝链接 → 蹼足）两节 IK 踩踏板；
 *        踏板位置与车上曲柄共用 config.pedalOffset() 的相位解算，腿与脚踏不会各自转。
 */
'use strict';

import { clamp, clamp01, lerp, TAU, damp } from './utils.js';
import { RIDE, pedalOffset } from './config.js';
import { mergeGeos } from './meshkit.js';

function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function addMesh(parent, geo, mat, cast) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast !== false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}
/** 椭球（单位球缩放）。 */
function blob(rx, ry, rz, seg) {
  const g = new THREE.SphereGeometry(1, seg || 14, (seg || 14) - 4);
  g.scale(rx, ry, rz);
  return g;
}
/** 锥体（朝 +X）。 */
function coneX(r, len, seg) {
  return new THREE.ConeGeometry(r, len, seg || 10).rotateZ(-Math.PI / 2);
}
/** 圆柱（朝 +X）。 */
function cylX(r1, r2, len, seg) {
  return new THREE.CylinderGeometry(r1, r2, len, seg || 8).rotateZ(-Math.PI / 2);
}

/* 腿部链的装配常数（smoke 从源码解析这些来解装配方程，改动必须同步 smoke） */
const THIGH = 0.42;
const SHIN = 0.46;
const HIP_X = 0.03;          // 髋在 pelican 局部坐标里的前后位置
const HIP_Y = -0.14;         // 髋在 pelican 局部坐标里的高低（躯干下缘之内）
const PEDAL_SPLAY = 0.05;    // 整腿外撇角：把脚送到脚踏的横向平面（±RIDE.pedalZ）
const FOOT_SOLE = 0.037;     // 踝 → 蹼足掌底面的距离；IK 目标 = 踏面 + 这段，掌底「踩」在踏板上而不陷进去

export function createPelican(THREE, kit) {
  const group = new THREE.Group();
  // 装配基准高度（rider 把鹈鹕放到车座时写入一次，之后每帧只叠加 bob）
  let baseY = null;

  /* ---------- 躯干（驼背，头前伸）---------- */
  const body = joint(group, 0, 0, 0);
  body.rotation.z = -0.06;   // 骑行姿态：躯干接近平卧，头前视（旧 -0.52 等于一路俯冲低头）
  const torso = addMesh(body, blob(0.30, 0.20, 0.19), kit.mat.feather);
  torso.position.set(-0.02, 0.02, 0);
  const chest = addMesh(body, blob(0.16, 0.15, 0.16), kit.mat.feather);
  chest.position.set(0.20, 0.06, 0);
  const rump = addMesh(body, blob(0.15, 0.14, 0.16), kit.mat.feather);
  rump.position.set(-0.22, -0.01, 0);
  // 背/颈背的暗色羽区
  const mantle = addMesh(body, blob(0.24, 0.10, 0.17), kit.mat.featherDark);
  mantle.position.set(-0.05, 0.13, 0);

  /* ---------- 尾羽 ---------- */
  const tail = joint(body, -0.34, -0.01, 0);
  addMesh(tail, coneX(0.085, 0.24, 8).rotateZ(Math.PI), kit.mat.featherDark).position.set(-0.10, 0, 0);
  for (const z of [-0.05, 0.05]) {
    const f = addMesh(tail, blob(0.11, 0.012, 0.05), kit.mat.featherDark);
    f.position.set(-0.14, -0.01, z);
    f.rotation.z = 0.12;
  }

  /* ---------- 双翼（肩关节，收拢贴身；展翅由 triggerFlap 驱动）---------- */
  const wings = [];
  for (const side of [1, -1]) {
    const shoulder = joint(body, 0.04, 0.10, side * 0.13);
    const upper = addMesh(shoulder, blob(0.22, 0.055, 0.13), kit.mat.featherDark);
    upper.position.set(-0.06, -0.01, side * 0.05);
    upper.rotation.z = 0.10;
    const fore = joint(shoulder, -0.10, -0.02, side * 0.09);
    const foreMesh = addMesh(fore, blob(0.20, 0.04, 0.15), kit.mat.featherDark);
    foreMesh.position.set(-0.10, 0, side * 0.04);
    // 飞羽（三片）
    const prim = [];
    for (let i = 0; i < 3; i++) {
      const p = addMesh(fore, blob(0.17, 0.012, 0.055), kit.mat.featherDark);
      p.position.set(-0.22 - i * 0.05, -0.01, side * (0.02 + i * 0.05));
      p.rotation.z = -0.16 - i * 0.05;
      prim.push(p);
    }
    shoulder.rotation.z = -0.10;
    shoulder.rotation.y = side * 0.10;
    shoulder.rotation.x = side * 0.06;
    wings.push({ shoulder: shoulder, fore: fore, prim: prim, side: side });
  }

  /* ---------- S 形颈（4 节链，头部稳定）---------- */
  const neckBase = joint(body, 0.28, 0.13, 0);
  const neck = [];
  const segs = [
    { len: 0.105, rot: -0.38, r: 0.056 },
    { len: 0.095, rot: 0.44, r: 0.050 },
    { len: 0.090, rot: 0.26, r: 0.046 },
    { len: 0.082, rot: -0.20, r: 0.043 },
  ];
  let node = neckBase;
  let prevLen = 0.02;
  for (const s of segs) {
    const j = joint(node, prevLen, 0, 0);
    j.rotation.z = s.rot;
    const m = addMesh(j, cylX(s.r * 0.88, s.r, s.len, 8));
    m.position.set(s.len * 0.45, 0, 0);
    neck.push({ joint: j, base: s.rot, len: s.len });
    node = j;
    prevLen = s.len;
  }

  /* ---------- 头部（冠羽 / 眼 / 喙 / 喉囊）---------- */
  const head = joint(node, 0.08, 0.01, 0);
  const skull = addMesh(head, blob(0.105, 0.09, 0.09), kit.mat.feather);
  skull.position.set(0.01, 0.005, 0);
  const crest = addMesh(head, blob(0.075, 0.05, 0.02), kit.mat.crest);
  crest.position.set(-0.05, 0.075, 0);
  crest.rotation.z = -0.5;
  const eyes = [];
  for (const side of [1, -1]) {
    const e = addMesh(head, new THREE.SphereGeometry(0.021, 10, 8), kit.mat.eye);
    e.position.set(0.055, 0.028, side * 0.062);
    const lid = addMesh(head, blob(0.026, 0.014, 0.026), kit.mat.crest);
    lid.position.set(0.054, 0.045, side * 0.062);
    eyes.push({ eye: e, lid: lid, side: side });
  }

  // 上喙（长而尖，末端带钩）
  const billTop = joint(head, 0.09, 0.005, 0);
  const topMesh = addMesh(billTop, coneX(0.045, 0.34, 9), kit.mat.beak);
  topMesh.position.set(0.17, 0.006, 0);
  const topRidge = addMesh(billTop, blob(0.16, 0.020, 0.036), kit.mat.beak);
  topRidge.position.set(0.12, 0.026, 0);
  const hook = addMesh(billTop, coneX(0.020, 0.045, 6), kit.mat.beak);
  hook.position.set(0.335, -0.014, 0);
  hook.rotation.z = -0.7;

  // 下喙 + 喉囊（铰接于喙根，张嘴时整体下压）
  const billLow = joint(head, 0.085, -0.035, 0);
  const lowMesh = addMesh(billLow, coneX(0.032, 0.30, 8), kit.mat.beak);
  lowMesh.position.set(0.15, -0.004, 0);
  const pouch = addMesh(billLow, blob(0.145, 0.085, 0.075), kit.mat.pouch);
  pouch.position.set(0.10, -0.06, 0);
  const pouchTip = addMesh(billLow, blob(0.075, 0.055, 0.055), kit.mat.pouch);
  pouchTip.position.set(0.20, -0.03, 0);

  /* ---------- 双腿链：髋 →〔股骨 + 羽领〕→ 膝链接 →〔胫骨 + 跗骨〕→ 踝链接 → 蹼足 ----------
   * 每一节之间都塞一个「链接体」：圆柱端盖是平的，绕关节弯折后两段之间会露出缺口 —— 观感上
   * 就是「双腿结构缺链接」。鸟形腿的接法：股骨藏在羽领里（羽毛材质），肉眼可见的那颗「膝」
   * 其实是踝关节（向后折，裸皮），胫段裸皮往下走，末端踝球接蹼足。
   * 场景图层级 = 运动链：hip → thighPivot → knee → foot，与 update() 的两节 IK 一一对应。
   * 同一材质的几块图元用 mergeGeos 烘成一份几何体（一条腿只占 3 个 draw call）。
   */
  const legs = [];
  for (const side of [1, -1]) {
    // 髋在脚踏平面的内侧（ pedalZ − 0.03 ），靠外撇角把脚送到踏板上
    const hip = joint(group, HIP_X, HIP_Y, side * (RIDE.pedalZ - HIP_X));
    hip.rotation.x = -side * PEDAL_SPLAY;      // 绕 X 外撇：−Y 方向朝 ±Z 侧张开
    const thighPivot = joint(hip, 0, 0, 0);
    addMesh(thighPivot, mergeGeos(THREE, [
      { geo: cylX(0.052, 0.044, THIGH, 10), pos: [0, -THIGH / 2, 0] },
      { geo: blob(0.096, 0.112, 0.096, 12), pos: [0, -0.03, 0] },   // 羽领：股根与躯干接合处
    ]), kit.mat.feather);
    const knee = joint(thighPivot, 0, -THIGH, 0);
    addMesh(knee, mergeGeos(THREE, [
      { geo: cylX(0.036, 0.027, SHIN, 9), pos: [0, -SHIN / 2, 0] },
      { geo: blob(0.042, 0.052, 0.042, 10), pos: [0, 0, 0] },       // 膝链接（腿段的折点）
      { geo: blob(0.032, 0.036, 0.032, 9), pos: [0, -SHIN, 0] },    // 踝链接
    ]), kit.mat.leg);
    // 脚 = 踝关节：蹼足（掌 + 三趾 + 后趾）烘成一份几何体
    const foot = joint(knee, 0, -SHIN, 0);
    const sole = [{ geo: blob(0.075, 0.014, 0.055), pos: [0.02, -0.012, 0] }];
    for (let i = 0; i < 3; i++) {
      sole.push({ geo: blob(0.075, 0.011, 0.021), pos: [0.075, -0.014, (i - 1) * 0.028], rot: [0, (i - 1) * 0.28, 0] });
    }
    sole.push({ geo: blob(0.035, 0.011, 0.018), pos: [-0.045, -0.012, 0] });
    addMesh(foot, mergeGeos(THREE, sole), kit.mat.leg);
    // side 决定这一腿对应哪侧曲柄臂（+Z 腿 ↔ +pedalZ 的脚踏），target 每帧写踏板目标点，供复核
    legs.push({ hip: hip, thighPivot: thighPivot, knee: knee, foot: foot, side: side, target: { x: 0, y: 0 } });
  }

  /* ---------- 状态与动画 ---------- */
  const st = {
    t: 0,
    flap: 0,           // 0 收拢 → 1 完全展开
    flapTarget: 0,
    flapT: 0,
    beak: 0,
    beakTarget: 0,
    blink: 0,
    nextBlink: 2 + Math.random() * 3,
    nextCall: 6 + Math.random() * 6,
    pouchJiggle: 0,
    headYaw: 0,
    headYawTarget: 0,
    nextLook: 3,
  };

  function triggerFlap(str) {
    st.flapTarget = clamp01(str === undefined ? 1 : str);
    st.flapT = 0;
  }
  function triggerCall(open) {
    st.beakTarget = open === undefined ? 0.75 : open;
    st.nextCall = 7 + Math.random() * 8;
  }

  /**
   * @param {number} dt
   * @param {object} s { crankPhase, speed, lean, bob, slope, time, gust, pedalZ }
   */
  function update(dt, s) {
    st.t += dt;
    const t = s.time || st.t;
    const spd = s.speed === undefined ? 5.6 : s.speed;
    const cad = spd / RIDE.wheelR;              // 轮角速度
    const phase = s.crankPhase || 0;

    // 驱体起伏（踏频带动）—— 注意：装配位置由 rider 设定（坐在车座上 y=座高），这里只能**叠加**，不能覆写
    const bobY = Math.sin(phase * 2) * 0.012;
    if (baseY === null) baseY = group.position.y;
    group.position.y = baseY + (s.bob === undefined ? 0 : s.bob) + bobY;

    // 颈部：头部稳定（反向补偿躯干俯仰与起伏），同时随速度轻微点头
    const nod = Math.sin(phase * 2 + 0.6) * 0.05 + clamp(s.slope, -0.05, 0.05) * 0.8;
    for (let i = 0; i < neck.length; i++) {
      const n = neck[i];
      const w = 0.35 + i * 0.22;
      n.joint.rotation.z = n.base * (1 - 0.10 * Math.sin(phase * 2 + i * 0.5)) + nod * w * 0.9;
      n.joint.rotation.y = Math.sin(t * 0.7 + i * 0.4) * 0.03 + st.headYaw * (0.15 + i * 0.12);
    }
    head.rotation.z = 0.10 - nod * 0.5;
    head.rotation.y = st.headYaw * 0.5;

    // 尾随侧倾摆动
    tail.rotation.z = 0.10 + (s.lean || 0) * 0.8 + Math.sin(t * 1.6) * 0.03;
    tail.rotation.y = (s.lean || 0) * 0.4;

    // 翅膀：收拢 + 展翅动画（阵风/爬坡触发）
    st.flap = damp(st.flap, st.flapTarget, st.flapTarget > st.flap ? 9 : 4.2, dt);
    if (st.flapTarget > 0.02 && st.t > 0) {
      st.flapT += dt;
      if (st.flapT > 1.1) st.flapTarget = 0;
    }
    const fl = st.flap;
    const beat = Math.sin(t * 13) * fl;
    for (const w of wings) {
      const open = 0.10 + fl * 1.15;
      w.shoulder.rotation.x = w.side * (0.06 + beat * 0.55 + fl * 0.15);
      w.shoulder.rotation.z = -0.10 - fl * 0.25;
      w.shoulder.rotation.y = w.side * (0.10 + fl * (0.55 + Math.abs(beat) * 0.4));
      w.fore.rotation.y = w.side * (0.18 + fl * 0.9 + beat * 0.25);
      w.fore.rotation.z = -fl * 0.30;
      for (let i = 0; i < w.prim.length; i++) {
        w.prim[i].rotation.y = w.side * fl * (0.25 + i * 0.16) + beat * 0.12;
      }
    }

    // 喙与喉囊：张嘴（叫）+ 骑行时的呼吸抖动
    st.beak = damp(st.beak, st.beakTarget, 8, dt);
    st.beakTarget = damp(st.beakTarget, 0, 2.2, dt);
    st.nextCall -= dt;
    if (st.nextCall <= 0) triggerCall(0.55 + Math.random() * 0.35);
    billLow.rotation.z = -st.beak * 0.34;
    const jig = 0.02 + Math.abs(Math.sin(phase * 2)) * 0.03 + st.beak * 0.10;
    pouch.scale.set(1 + jig * 0.6, 1 + jig, 1 + jig * 0.4);
    pouch.position.y = -0.06 - jig * 0.05;

    // 眨眼
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) { st.blink = 1; st.nextBlink = 2.5 + Math.random() * 4; }
    st.blink = Math.max(0, st.blink - dt * 7);
    for (const e of eyes) e.lid.position.y = 0.045 - st.blink * 0.016;

    // 环视（偶尔左右看海）
    st.nextLook -= dt;
    if (st.nextLook <= 0) {
      st.headYawTarget = (Math.random() - 0.5) * 0.7;
      st.nextLook = 3 + Math.random() * 5;
    }
    st.headYaw = damp(st.headYaw, st.headYawTarget, 2.2, dt);

    // 腿：两节 IK 踩踏板。踏板目标由 config.pedalOffset() 解算 —— 与车上曲柄/脚踏是**同一套相位
    // 数学**，于是腿链在曲柄相位上，脚掌与脚踏一起转；腿自己算相位（各转各的）就会脱开踏板。
    const cx = s.pedalCx === undefined ? 0.09 : s.pedalCx;
    const cy = s.pedalCy === undefined ? -0.66 : s.pedalCy;
    const pr = s.pedalR === undefined ? RIDE.crankLen : s.pedalR;
    for (const leg of legs) {
      const off = pedalOffset(leg.side, phase, pr);           // 这条腿对应那颗脚踏相对中轴的偏移
      const tx = cx + off.x - HIP_X;                          // 解算在髋的局部平面内，目标要减去髋位置
      const ty = cy + off.y + FOOT_SOLE - HIP_Y;               // + 掌底深度：踩在踏面上，不陷进踏板
      leg.target.x = tx; leg.target.y = ty;                   // 留给 rider / 调试钩子复核「脚踩在踏板上」
      const d = clamp(Math.hypot(tx, ty), (THIGH + SHIN) * 0.42, (THIGH + SHIN) * 0.985);
      const phi = Math.atan2(tx, -ty);
      const cosA = clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1);
      const th1 = phi + Math.acos(cosA);                     // 膝朝前：大腿向前下、小腿往后下到踏板
      const kx = Math.sin(th1) * THIGH, ky = -Math.cos(th1) * THIGH;
      const psi = Math.atan2(tx - kx, -(ty - ky));
      leg.hip.rotation.z = th1;
      leg.knee.rotation.z = psi - th1;                       // 膝（踝关节）向后折
      leg.foot.rotation.z = -psi + 0.16 + (off.y / pr) * 0.22;   // 踝随踏相位：前冲抬趾、后压蹬平
    }
  }

  /** 细节等级（低档隐藏小构件，省 draw call）。 */
  function setDetail(detail) {
    for (const e of eyes) { e.eye.visible = detail > 0; e.lid.visible = detail > 0; }
    crest.visible = detail > 0;
    hook.visible = detail > 0;
    for (const w of wings) for (let i = 0; i < w.prim.length; i += (detail > 1 ? 1 : 2)) w.prim[i].visible = true;
  }

  update(0.016, { time: 0, crankPhase: 0, speed: 5.6, lean: 0, bob: 0, slope: 0 });
  // 构造时的自检会先跑一遍 update；装配（setMount / rider 落座）之后要重新取基准高度
  baseY = null;

  /** 装配到车座：由 rider 调用；顺带记下基准高度，供每帧 bob 叠加。 */
  function setMount(x, y) {
    group.position.set(x, y, 0);
    baseY = y;
  }

  return {
    group: group,
    update: update,
    setMount: setMount,
    triggerFlap: triggerFlap,
    triggerCall: triggerCall,
    setDetail: setDetail,
    state: st,
    head: head,
    billTop: billTop,
    billLow: billLow,
    wings: wings,
    legs: legs,
    body: body,
  };
}
