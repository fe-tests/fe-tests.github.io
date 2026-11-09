/* 3D 故宫游览 · js/camera.js —— 相机模式与机位插值（阶段 4 提前落地）
 * 三档视角，一键切换：
 *   walk      人视漫步（默认，1.65 m 眼高；阶段 8 接 collision.js 后才做遮挡收近）
 *   fly       自由飞行（WASD + 空格/Ctrl 升降；用于快速穿越与找机位）
 *   overview  全局俯瞰（镜头**平滑飞越**到整城中轴上空，轨道式环视，可拖拽转方位/调俯角）
 * 约束：本模块只碰 THREE（由 caller 注入），不 import three、不碰 DOM；输入意图仍来自 input.js。
 * 说明：overview 用「飞行时间 + 缓动」而不是瞬移——瞬移会把人甩丢，也让用户看不清中轴序列。
 */
'use strict';

import { AXES, EYED_H } from './config.js';

/** 三档模式的显示名与快捷键顺序（UI 按钮与 V 键循环都用这份表）。 */
export const CAM_MODES = [
  { id: 'walk', cn: '漫步' },
  { id: 'fly', cn: '飞行' },
  { id: 'overview', cn: '俯瞰' },
];

/** overview 的取景参数（radius = 镜头到**地面圆心**的水平距离，不是斜距；拖拽/滚轮会改它）。
 *  fogNear/fogFar：俯瞰时镜头在 950 m 高空、看得最远约 1500 m，画质档的雾距（620–1400）
 *  会把整座紫禁城糊成一片白雾（截图复核发现），故俯瞰档单开一份远雾。 */
export const OVERVIEW = { radius: 1000, flatMin: 340, flatMax: 2200, pitchMin: -1.5, pitchMax: -0.62, fov: 74, groundY: 0, fogNear: 380, fogFar: 2400 };

/** overview 默认机位：整城中轴上空俯视（方位角由拖拽轨道控制）。圆心在地面，故 y = r·|sin(pitch)|。 */
export function overviewPose() {
  const c = axisCenter(), pitch = -1.24;       // ≈71° 俯角：接近正俯视，961 m 长的中轴一眼收尽
  return {
    x: c.x,
    z: c.z + OVERVIEW.radius * Math.cos(pitch),  // 停在圆心以南（+Z），朝南看午门方向
    y: OVERVIEW.radius * Math.abs(Math.sin(pitch)),
    yaw: 0,                                     // yaw=0 → 面向 +Z（南），中轴在画面正中纵向延伸
    pitch: pitch,
    fov: OVERVIEW.fov,
  };
}

/** pose → 轨道参数（圆心在地面 y=0）。flat = 镜头到取景中心的**水平距离**，高度 = flat·|tan(pitch)|。 */
function orbitFromPose(pose, center) {
  const c = center || axisCenter();
  const dx = pose.x - c.x, dz = pose.z - c.z;
  const pitch = clamp(pose.pitch, OVERVIEW.pitchMin, OVERVIEW.pitchMax);
  const flat = Math.max(OVERVIEW.radius * 0.34, Math.hypot(dx, dz));
  return { theta: Math.atan2(dx, dz), flat: flat, pitch: pitch };
}

/** 中轴中点（overview 轨道旋转的圆心）。 */
export function axisCenter() {
  return { x: 0, y: 12, z: (AXES.wumen + AXES.shenwumen) / 2 };
}

export class CameraRig {
  /** @param {{camera:THREE.Camera, pose:{x:number,y:number,z:number,yaw:number,pitch:number}}} opts */
  constructor(opts) {
    this.camera = opts.camera;
    // pose 是「权威机位」：模式切换只改它，apply() 负责把 fov 等附加量写进 camera。
    this.pose = Object.assign({ fov: opts.camera.fov, y: EYED_H }, opts.pose || {});
    this.mode = 'walk';
    this.flySpeed = 46;                        // m/s：飞行速度，中轴全程约 25 s 走完
    this._flight = null;                       // {t, dur, from, to} 模式切换的平滑过渡
    this._orbit = null;                        // overview 的轨道参数（绕取景中心）
    this._center = axisCenter();               // overview 的取景中心（focus() 会挪它）
  }

  /** 当前模式的档位名。 */
  modeName() {
    for (let i = 0; i < CAM_MODES.length; i++) if (CAM_MODES[i].id === this.mode) return CAM_MODES[i].cn;
    return this.mode;
  }

  /** 把 pose 里的水平朝向折算成世界位移（与 main.js 的行走公式同一口径）。 */
  static horizontal(pose, mv, spd) {
    const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw);
    return { x: (-mv.y * sy + mv.x * cy) * spd, z: (-mv.y * cy - mv.x * sy) * spd };
  }

  /**
   * 开始一段机位飞行（平滑过渡到目标 pose）。**只记录目标，不接管控制权**——
   * 是否暂停玩家输入由 main.js 看 isFlying() 决定（见 D20）。
   * @param {object} to @param {number} dur 秒
   */
  flyTo(to, dur) {
    const p = this.pose;
    this._flight = {
      t: 0,
      dur: Math.max(0.001, dur || 1.4),
      from: { x: p.x, y: p.y, z: p.z, yaw: normYaw(p.yaw), pitch: p.pitch, fov: p.fov },
      to: Object.assign({ fov: p.fov }, to),
    };
    this._flight.to.yaw = normYaw(this._flight.to.yaw);
    return this._flight;
  }

  /**
   * 切换视角档位。walk/fly 从当前机位接上，overview **飞越**到俯瞰机位。
   * @param {string} id walk|fly|overview
   * @param {{instant?:boolean}} [opt] instant=true 时瞬切（无 GPU 的软渲染环境用它，见 main.js）
   */
  setMode(id, opt) {
    if (id === this.mode) return this.mode;
    const instant = !!(opt && opt.instant);
    const p = this.pose;
    let dur = 0;
    if (id === 'walk') {
      // 回地面：水平位置留在原处，高度落回眼高；若还在空中则飞一段，避免硬切。
      const target = Object.assign({}, p, { y: EYED_H, pitch: clamp(p.pitch, -0.6, 0.35) });
      dur = instant ? 0 : 1.0; this.flyTo(target, dur);
    } else if (id === 'fly') {
      const target = Object.assign({}, p, { y: Math.max(p.y, EYED_H + 6) });
      dur = instant ? 0 : 0.35; this.flyTo(target, dur);
    } else if (id === 'overview') {
      const pose = overviewPose();
      this._center = axisCenter();             // 每次进俯瞰都回到「看整座城」的取景中心
      this._orbit = orbitFromPose(pose, this._center);
      dur = instant ? 0 : 1.9; this.flyTo(pose, dur);
    } else {
      return this.mode;
    }
    if (dur <= 0) this.snapFlight();            // 瞬切：直接落位，别留半截过渡
    this.mode = id;
    return this.mode;
  }

  /** 立即把过渡的终点落到 pose 上（瞬切 / 测试用）。 */
  snapFlight() {
    const f = this._flight;
    if (!f) return false;
    const p = this.pose;
    p.x = f.to.x; p.y = f.to.y; p.z = f.to.z;
    p.yaw = f.to.yaw; p.pitch = f.to.pitch;
    if (f.to.fov != null) p.fov = f.to.fov;
    this._flight = null;
    if (this.mode === 'overview') this._orbit = orbitFromPose(p, this._center);
    return true;
  }

  toggle(opt) {
    for (let i = 0; i < CAM_MODES.length; i++) {
      if (CAM_MODES[i].id === this.mode) return this.setMode(CAM_MODES[(i + 1) % CAM_MODES.length].id, opt);
    }
    return this.setMode('walk', opt);
  }

  /** overview 轨道旋转：绕取景中心转方位角，同时按 dy 调俯角（保持水平距离不变 → 取景范围稳定）。 */
  orbit(dx, dy) {
    if (this.mode !== 'overview') return null;
    this._flight = null;                       // 用户一拖就让过渡让位，避免两路写入抢 pose
    const o = this._orbit || (this._orbit = orbitFromPose(this.pose, this._center));
    if (dx || dy) {
      o.theta -= dx * 0.0042;
      o.pitch = clamp(o.pitch + dy * 0.0035, OVERVIEW.pitchMin, OVERVIEW.pitchMax);
    }
    const c = this._center || axisCenter();
    const flat = clamp(o.flat, OVERVIEW.flatMin, OVERVIEW.flatMax);   // 水平距离：缩放与俯角都不动它
    this.pose.yaw = normYaw(o.theta);           // 机位绕中心转，朝向始终回到中心（与 yaw=0 朝 +Z 同口径）
    this.pose.pitch = o.pitch;
    this.pose.x = c.x + Math.sin(o.theta) * flat;
    this.pose.z = c.z + Math.cos(o.theta) * flat;
    this.pose.y = OVERVIEW.groundY + Math.tan(-o.pitch) * flat;   // 俯角越大越高，画面中心正对取景中心
    return this.pose;
  }

  /** 是否仍在机位飞行过渡中（只读，供 HUD/日志用；**不要**拿它当输入闸门）。 */
  isFlying() { return !!this._flight; }

  /** overview 轨道拉近/拉远（滚轮或双指捏合）。@param {number} delta >0 表示拉远 */
  zoom(delta) {
    if (this.mode !== 'overview') return null;
    const o = this._orbit || (this._orbit = orbitFromPose(this.pose, this._center));
    o.flat = clamp(o.flat * (1 + clamp(delta, -1.2, 1.2) * 0.16), OVERVIEW.flatMin, OVERVIEW.flatMax);
    return this.orbit(0, 0);                    // 复用 orbit 的换算，把水平距离写回 pose
  }

  /**
   * 俯瞰时把取景中心对准某个中轴地标（如从午门平移到太和殿）。
   * ⚠️ 只挪**取景中心**，机位相对中心的方位/俯角/水平距离都不变——若改成「机位绕目标转」，
   * 目标会与画面中心重合（正中俯视下等于什么都没发生）。见 PROGRESS.md D21。
   * @param {{x?:number,z:number}} t @param {{flat?:number, theta?:number}} [opt]
   */
  focus(t, opt) {
    if (this.mode !== 'overview') return null;
    const o = this._orbit || (this._orbit = orbitFromPose(this.pose, this._center));
    if (t && t.z != null) {
      // 平移取景中心：机位跟着走，才能保住水平距离与高度（只挪中心 = 相机不动、只是换了看的地方）
      const ddx = (t.x || 0) - this._center.x, ddz = t.z - this._center.z;
      this._center.x += ddx; this._center.z += ddz;
      this.pose.x += ddx; this.pose.z += ddz;
    }
    if (opt && opt.theta != null) o.theta = opt.theta;
    if (opt && opt.flat) o.flat = clamp(opt.flat, OVERVIEW.flatMin, OVERVIEW.flatMax);
    // 注意：**不能**在此调 orbit()。平移已经改好 pose，再跑 orbit() 会用旧 o.flat
    // 重算机位（等于把相机拉回中心 + flat），取景中心就白挪了（见 D21）。
    this._flight = null;
    return this.pose;
  }

  /** 取景中心（默认中轴中点）。 */
  center() { return this._center; }

  /**
   * 每帧推进飞行过渡（缓动）。@param {number} dt @returns {boolean} 是否改变了 pose
   * ⚠️ 返回值只表示「pose 被改了」，**不代表玩家该被锁住**：headless / 后台标签里 rAF 步长
   * 会被夹大，过渡会持续很多秒；用它当输入闸门会让摇杆与拖拽长期失效（见 PROGRESS.md D20）。
   */
  update(dt) {
    const f = this._flight;
    if (!f) return false;
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const e = easeInOut(k);
    const p = this.pose;
    p.x = lerp(f.from.x, f.to.x, e);
    p.y = lerp(f.from.y, f.to.y, e);
    p.z = lerp(f.from.z, f.to.z, e);
    p.yaw = lerp(f.from.yaw, f.to.yaw, e);
    p.pitch = lerp(f.from.pitch, f.to.pitch, e);
    if (f.to.fov != null) p.fov = lerp(f.from.fov, f.to.fov, e);
    if (k >= 1) { this._flight = null; if (this.mode === 'overview') this._orbit = orbitFromPose(p, this._center); }
    return true;
  }

  /** 把 pose 写进相机（含 fov）。 */
  apply() {
    const c = this.camera, p = this.pose;
    c.position.set(p.x, p.y, p.z);
    c.rotation.order = 'YXZ';
    c.rotation.y = p.yaw;
    c.rotation.x = p.pitch;
    c.rotation.z = 0;
    if (p.fov != null && Math.abs(c.fov - p.fov) > 0.01) { c.fov = p.fov; c.updateProjectionMatrix(); }
  }

  /** overview 时把场景整体高度/距离信息给 HUD 用（简化：返回当前离地高度）。 */
  height() { return this.pose.y; }
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/** 把 yaw 归一到 (-π, π]，避免过渡时多转一圈。 */
function normYaw(yaw) {
  let a = yaw % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
