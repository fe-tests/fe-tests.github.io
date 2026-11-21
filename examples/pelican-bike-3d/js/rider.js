/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/rider.js —— 骑行者（自行车 + 鹈鹕）沿海岸公路前进
 * 纯函数（stepRide / speedForGrade / curvatureAt / leanFor / frameOf）不依赖 three，Node 可 import 断言。
 * 组件坐标架：局部 X = 前进，Y = 上，Z = 右（与 bike.js / pelican.js 一致），由 frameOf 烘成 Matrix4。
 */
'use strict';

import { RIDE, roadCenterX, roadElev, roadElevDeriv, roadCenterDeriv, arcFactor } from './config.js';
import { clamp, damp, lerp, TAU } from './utils.js';
import { createBike } from './bike.js';
import { createPelican } from './pelican.js';

/** 组件局部常量：座垫位置（车座顶面）。 */
// 落座点（骑行者局部坐标）：车轴抬到轮半径后，座垫顶 + 落座压缩
export const SADDLE = { x: -0.20, y: RIDE.wheelR - 0.02 + 0.74 };

/** 依坡度取目标速度：上坡慢、下坡快。 */
export function speedForGrade(grade) {
  const target = RIDE.baseSpeed - grade * RIDE.slopeGain;
  return clamp(target, RIDE.minSpeed, RIDE.maxSpeed);
}
/** 道路曲率（d²x/dz²），用于侧倾与压弯。 */
export function curvatureAt(z) {
  const h = 6;
  return (roadCenterDeriv(z + h) - roadCenterDeriv(z - h)) / (2 * h);
}
/** 侧倾角（向内弯倾斜，rad）。 */
export function leanFor(curv, speed) {
  return clamp(-curv * speed * speed * 0.055, -RIDE.leanMax, RIDE.leanMax);
}

/** 创建骑行状态（纯数据）。 */
export function createRideState(z0) {
  return {
    s: 0, z: z0 || 0, x: roadCenterX(z0 || 0), y: roadElev(z0 || 0),
    speed: RIDE.baseSpeed, wheelPhase: 0, crankPhase: 0, lean: 0, leanTarget: 0,
    grade: 0, heading: 0, bob: 0, gust: 0, elapsed: 0, flapTimer: 4,
  };
}

/** 推进一步纯运动学（不触碰任何 THREE 对象）。 */
export function stepRide(st, dt) {
  const g = roadElevDeriv(st.z);
  st.grade = g;
  const target = speedForGrade(g);
  st.speed = damp(st.speed, target, 0.9, dt);
  const dz = (st.speed * dt) / arcFactor(st.z);
  st.z += dz;
  st.s += st.speed * dt;
  st.x = roadCenterX(st.z);
  st.y = roadElev(st.z);
  st.wheelPhase += (st.speed * dt) / RIDE.wheelR;
  st.crankPhase = st.wheelPhase * RIDE.crankRatio;
  st.heading = Math.atan(roadCenterDeriv(st.z));
  st.leanTarget = leanFor(curvatureAt(st.z), st.speed);
  st.lean = damp(st.lean, st.leanTarget, 4.5, dt);
  st.bob = Math.sin(st.crankPhase * 2) * RIDE.bobAmp;
  st.elapsed += dt;
  return st;
}

/** 组件坐标架（局部 X 前进 / Y 上 / Z 右）：返回 [forward, up, right] 单位向量数组。 */
export function frameOf(st, lean) {
  const d = roadCenterDeriv(st.z), e = roadElevDeriv(st.z);
  let fx = d, fy = e, fz = 1;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // 世界右向 = 前进 × 上（先取水平右向）
  let rx = -fz, ry = 0, rz = fx;   // cross(f, (0,1,0))
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // 路面法线：在垂直剖面内真正垂直于前进方向（含坡道），保证坐标架严格正交
  let nx = -fx * fy / rl, ny = (fx * fx + fz * fz) / rl, nz = -fz * fy / rl;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  // 侧倾：法线朝右向偏移；右向再由 f × up 生成 → 三方严格正交（否则模型被剪切，腿/轮看着歪）
  const L = lean === undefined ? st.lean : lean;
  const c = Math.cos(L), s = Math.sin(L);
  let ux = nx * c - rx * s, uy = ny * c - ry * s, uz = nz * c - rz * s;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  rx = fy * uz - fz * uy; ry = fz * ux - fx * uz; rz = fx * uy - fy * ux;
  const rl2 = Math.hypot(rx, ry, rz) || 1;
  rx /= rl2; ry /= rl2; rz /= rl2;
  return {
    forward: [fx, fy, fz],
    up: [ux, uy, uz],
    right: [rx, ry, rz],
  };
}

/* ============================ 装配 ============================ */
export function createRider(THREE, kit, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  const bike = createBike(THREE, kit);
  const pelican = createPelican(THREE, kit);
  // 本地图纸：车轴/曲柄中轴在 y≈0.02-0.03（原点=中轴平面）。整车上移，让轮子正好落在地面上。
  const bikeY = RIDE.wheelR - 0.02;
  bike.group.position.set(0, bikeY, 0);
  group.add(bike.group);
  // 鹈鹕坐在车座上（座垫顶 + 落座压缩）
  const saddle = { x: SADDLE.x, y: bikeY + 0.74 };   // = SADDLE.y
  pelican.setMount(saddle.x, saddle.y);   // 必须走 setMount：pelican 每帧 bob 要在装配高度上叠加
  group.add(pelican.group);

  const state = createRideState(o.z0 || 0);
  const tmpBasis = new THREE.Matrix4();
  const posV = new THREE.Vector3();
  const fwd = new THREE.Vector3(1, 0, 0);
  const upv = new THREE.Vector3(0, 1, 0);
  const rightv = new THREE.Vector3(0, 0, 1);
  const headPos = new THREE.Vector3();
  const events = { flap: 0, call: 0 };
  let gustTimer = 3 + Math.random() * 5;

  function update(dt, day) {
    stepRide(state, dt);
    const f = frameOf(state);
    tmpBasis.makeBasis(
      fwd.set(f.forward[0], f.forward[1], f.forward[2]),
      upv.set(f.up[0], f.up[1], f.up[2]),
      rightv.set(f.right[0], f.right[1], f.right[2])
    );
    group.quaternion.setFromRotationMatrix(tmpBasis);
    posV.set(state.x, state.y + 0.03 + state.bob, state.z);
    group.position.copy(posV);

    // 传动：链条把后轮 → 牙盘 → 曲柄串成**同一个转向**，所以轮与曲柄共用 RIDE.CRANK_SIGN。
    // 前进 = 局部 +X，绕 Z 的负向旋转才让轮顶朝前进方向走（写成正号就是「往前骑、轮子倒转」）。
    bike.wheelR.rotation.z = RIDE.CRANK_SIGN * state.wheelPhase;
    bike.wheelF.rotation.z = RIDE.CRANK_SIGN * state.wheelPhase;
    bike.crank.rotation.z = RIDE.CRANK_SIGN * state.crankPhase;
    bike.steer.rotation.y = Math.sin(state.wheelPhase * 0.31) * 0.05 - state.lean * 0.25;

    // 阵风 → 展翅（顶风/上坡时更频繁）
    gustTimer -= dt;
    if (gustTimer <= 0) {
      gustTimer = 5 + Math.random() * 8;
      const uphill = state.grade > 0.006;
      const strength = uphill ? 0.9 : (0.35 + Math.random() * 0.5);
      pelican.triggerFlap(strength);
      events.flap++;
      state.gust = 1;
    }
    state.gust = damp(state.gust, 0, 1.6, dt);

    // 鹈鹕：crankPhase 同时喂给 bike.crank 与 pelican 的腿 IK（两边都走 config.pedalOffset），
    // 腿链在脚踏上；这里只给「曲柄中轴在鹈鹕局部坐标里的位置」。
    pelican.update(dt, {
      time: state.elapsed,
      crankPhase: state.crankPhase,
      speed: state.speed,
      lean: state.lean,
      bob: 0,
      slope: state.grade,
      pedalCx: -saddle.x,
      pedalCy: (bikeY + 0.02) - saddle.y,   // 曲柄中轴（车上移后）在鹈鹕局部坐标里的高度
      pedalR: RIDE.crankLen,
    });

    // 前灯（夜里点亮；材质与路灯共用 lampGlow，不写透明度避免互相覆盖）
    const lampOn = day ? day.lamp : 0;
    bike.lampFace.visible = lampOn > 0.05;
    bike.beam.visible = lampOn > 0.25;

    pelican.group.getWorldPosition(headPos);
  }

  update(0.016, null);

  return {
    group: group,
    bike: bike,
    pelican: pelican,
    state: state,
    events: events,
    basis: { position: posV, forward: fwd, up: upv, right: rightv, head: headPos },
    update: update,
    setDetail: pelican.setDetail,
  };
}
