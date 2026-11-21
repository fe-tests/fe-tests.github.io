/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/camera.js —— 巡游机位系统（7 档 + 自动切机位 + 鼠标接管）
 * 每个机位在「骑行者坐标架」里用 (az, el, r, tY, tLat, fov) 表达 → 骑行者永远在画面内；
 * 鼠标偏移（yaw/pitch/rZoom/pan）叠加在同一坐标架上，空闲 TOUR.idleResume 秒后自动归零并恢复巡游。
 * 纯函数 rigLocalAt / cameraPoseOf 不依赖 three，Node 可 import 断言。
 */
'use strict';

import { RIGS, rigById, TOUR } from './config.js';
import { clamp, damp, lerpAngle, TAU } from './utils.js';

/** 机位局部参数（环绕档的方位角随时间转一圈）。 */
export function rigLocalAt(rig, t) {
  const az = rig.orbit ? rig.az + (t / rig.orbit) * TAU : rig.az;
  const breathe = rig.orbit ? Math.sin(t * 0.55) * 0.07 : Math.sin(t * 0.31) * 0.035;
  return { az: az, el: rig.el + breathe, r: rig.r, tY: rig.tY, tLat: rig.tLat, fov: rig.fov };
}

/**
 * 由坐标架 + 局部参数 + 用户偏移解算镜头位置与注视点（纯数学，输入为数组）。
 * @returns {{pos:number[], look:number[], fov:number}}
 */
export function cameraPoseOf(basis, loc, off) {
  const F = basis.forward, R = basis.right, U = basis.up, P = basis.position;
  const az = loc.az + (off.yaw || 0);
  const el = clamp(loc.el + (off.pitch || 0), -1.42, 1.42);
  const r = Math.max(0.6, loc.r * (1 + (off.rZoom || 0)));
  const ce = Math.cos(el), se = Math.sin(el);
  const sa = Math.sin(az), ca = Math.cos(az);
  // 目标点（骑行者坐标架内的取景中心）
  const panX = off.panX || 0, panY = off.panY || 0;
  const tx = P[0] + R[0] * (loc.tLat + panX) + U[0] * (loc.tY + panY) + F[0] * (off.panZ || 0);
  const ty = P[1] + R[1] * (loc.tLat + panX) + U[1] * (loc.tY + panY) + F[1] * (off.panZ || 0);
  const tz = P[2] + R[2] * (loc.tLat + panX) + U[2] * (loc.tY + panY) + F[2] * (off.panZ || 0);
  // 机位方向：az=0 → 正后方；az>0 → 骑行者右侧
  const dx = R[0] * sa * ce + U[0] * se - F[0] * ca * ce;
  const dy = R[1] * sa * ce + U[1] * se - F[1] * ca * ce;
  const dz = R[2] * sa * ce + U[2] * se - F[2] * ca * ce;
  return {
    pos: [tx + dx * r, ty + dy * r, tz + dz * r],
    look: [tx, ty, tz],
    fov: loc.fov,
  };
}

/* ============================ 装配 ============================ */
export function createCameraRig(THREE, opts) {
  const o = opts || {};
  const camera = new THREE.PerspectiveCamera(o.fov || 42, o.aspect || 1.6, 0.12, 4200);
  // 由 main 注入的地形高度采样（相机贴地钳制用），签名 (x, z) => 地面高度
  let groundAt = null;
  camera.matrixAutoUpdate = true;

  const rigState = {
    index: 0,
    nextIndex: 1,
    t: 0,                       // 当前机位停留时间
    tourT: 0,                   // 全局巡游时间（环绕角用）
    auto: o.auto === undefined ? true : !!o.auto,
    paused: false,
    blending: 0,
    dwell: RIGS[0].dwell,
  };

  // 当前插值中的局部参数
  const cur = rigLocalAt(RIGS[0], 0);
  const target = rigLocalAt(RIGS[0], 0);
  // 用户偏移（input.js 写 target，本模块阻尼）
  const off = { yaw: 0, pitch: 0, rZoom: 0, panX: 0, panY: 0 };
  const curOff = { yaw: 0, pitch: 0, rZoom: 0, panX: 0, panY: 0 };
  const curFov = { v: RIGS[0].fov };
  let idle = 1e9;
  const look = { x: 0, y: 0, z: 0 };
  const pos = { x: 0, y: 2, z: -6 };
  const smoothPos = new THREE.Vector3(0, 2, -6);
  const smoothLook = new THREE.Vector3(0, 0, 0);
  let firstFrame = true;

  function pickDwell(rig) {
    const j = (Math.random() * 2 - 1) * TOUR.dwellJitter;
    return Math.max(3.5, rig.dwell * TOUR.dwellScale * (1 + j));
  }

  function setRig(id, immediate) {
    const rig = rigById(id);
    let idx = 0;
    for (let i = 0; i < RIGS.length; i++) if (RIGS[i].id === rig.id) idx = i;
    rigState.index = idx;
    rigState.nextIndex = (idx + 1) % RIGS.length;
    rigState.t = 0;
    rigState.dwell = pickDwell(rig);
    const l = rigLocalAt(rig, rigState.tourT);
    Object.assign(target, l);
    if (immediate) {
      Object.assign(cur, l);
      curFov.v = rig.fov;
    }
    rigState.blending = 1;
  }

  function nextRig(step) {
    const idx = (rigState.nextIndex + (step === undefined ? 0 : step) + RIGS.length) % RIGS.length;
    setRig(RIGS[idx].id, false);
  }

  /** 用户开始操作：暂停巡游接管计时。 */
  function markInput() { idle = 0; }

  function update(dt, basis, day) {
    rigState.tourT += dt;
    rigState.t += dt;
    idle += dt;

    // 自动巡游：到时就切到下一机位（顺序轮播，环绕档播完再走）
    if (rigState.auto && !rigState.paused && idle > 0.05) {
      if (rigState.t >= rigState.dwell) nextRig(0);
      rigState.nextIndex = (rigState.index + 1) % RIGS.length;
    }

    const rate = 1 / Math.max(0.2, TOUR.blend);
    const active = idle < TOUR.idleResume;
    // 空闲后把用户偏移平滑归零
    if (!active) {
      const eb = Math.max(0.15, TOUR.easeBack);
      off.yaw = damp(off.yaw, 0, 3.2 / eb, dt);
      off.pitch = damp(off.pitch, 0, 3.2 / eb, dt);
      off.rZoom = damp(off.rZoom, 0, 3.2 / eb, dt);
      off.panX = damp(off.panX, 0, 3.2 / eb, dt);
      off.panY = damp(off.panY, 0, 3.2 / eb, dt);
    }
    for (const k of ['yaw', 'pitch', 'rZoom', 'panX', 'panY']) {
      curOff[k] = damp(curOff[k], off[k], TOUR.yawDamp, dt);
    }
    const tgt = rigLocalAt(RIGS[rigState.index], rigState.tourT);
    Object.assign(target, tgt);
    cur.az = lerpAngle(cur.az, target.az, 1 - Math.exp(-rate * 2.2 * dt));
    cur.el = damp(cur.el, target.el, rate * 2.2, dt);
    cur.r = damp(cur.r, target.r, rate * 2.2, dt);
    cur.tY = damp(cur.tY, target.tY, rate * 2.2, dt);
    cur.tLat = damp(cur.tLat, target.tLat, rate * 2.2, dt);
    curFov.v = damp(curFov.v, target.fov, rate * 2.0, dt);
    rigState.blending = Math.max(0, rigState.blending - dt / Math.max(0.2, TOUR.blend));

    const pose = cameraPoseOf(basis, cur, curOff);
    pos.x = pose.pos[0]; pos.y = pose.pos[1]; pos.z = pose.pos[2];
    look.x = pose.look[0]; look.y = pose.look[1]; look.z = pose.look[2];

    // 位置/注视点二次平滑（切机位时收敛更快，避免穿地）
    const k = firstFrame ? 1 : (rigState.blending > 0 ? 1 - Math.exp(-3.4 * dt) : 1 - Math.exp(-9.0 * dt));
    smoothPos.x += (pos.x - smoothPos.x) * k;
    smoothPos.y += (pos.y - smoothPos.y) * k;
    smoothPos.z += (pos.z - smoothPos.z) * k;
    smoothLook.x += (look.x - smoothLook.x) * k;
    smoothLook.y += (look.y - smoothLook.y) * k;
    smoothLook.z += (look.z - smoothLook.z) * k;
    firstFrame = false;

    // 相机不得沉到地面以下：优先用真实地形高度（海边机位要能贴到海面上方，不能卡在高高的路面）
    const gy = (typeof groundAt === 'function') ? groundAt(smoothPos.x, smoothPos.z)
      : (basis.groundY === undefined ? 0 : basis.groundY);
    const minY = (Number.isFinite(gy) ? gy : 0) + 0.35;
    if (smoothPos.y < minY) smoothPos.y = minY;

    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);
    if (Math.abs(camera.fov - curFov.v) > 0.01) {
      camera.fov = curFov.v;
      camera.updateProjectionMatrix();
    }
  }

  function setAspect(a) {
    camera.aspect = a;
    camera.updateProjectionMatrix();
  }

  function reset() {
    off.yaw = off.pitch = off.rZoom = off.panX = off.panY = 0;
    curOff.yaw = curOff.pitch = curOff.rZoom = curOff.panX = curOff.panY = 0;
    idle = 1e9;
  }

  return {
    camera: camera,
    setAspect: setAspect,
    setGroundSampler: function (fn) { groundAt = typeof fn === 'function' ? fn : null; },
    setRig: setRig,
    nextRig: nextRig,
    update: update,
    markInput: markInput,
    reset: reset,
    offset: off,
    rigState: rigState,
    current: function () { return RIGS[rigState.index]; },
    currentId: function () { return RIGS[rigState.index].id; },
    isManual: function () { return idle < TOUR.idleResume; },
    tour: {
      get auto() { return rigState.auto; },
      set auto(v) { rigState.auto = !!v; if (v) { rigState.t = 0; rigState.dwell = pickDwell(RIGS[rigState.index]); } },
      get paused() { return rigState.paused; },
      set paused(v) { rigState.paused = !!v; },
    },
    limits: TOUR,
  };
}
