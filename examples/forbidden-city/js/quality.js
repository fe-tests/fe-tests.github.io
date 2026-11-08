/* 3D 故宫游览 · js/quality.js —— 画质档与自适应降档（阶段 1）
 * 职责：
 *   - 依据设备线索（UA / touch / dpr / prefers-reduced-motion / save-data）猜一个初始档
 *   - 把档位应用到 renderer / scene（DPR、阴影贴图、雾距）
 *   - FPS 采样与自动降/升档，并把结论交给 ui.js 显示
 * 约束：不 import three；three 由调用方以参数传入，保证本模块能在 Node 里 import。
 */
'use strict';

import { QUALITY, QUALITY_ORDER, ADAPT } from './config.js';

export class Quality {
  /**
   * @param {object} opts { THREE, renderer, scene, onHint(text) }
   */
  constructor(opts) {
    this.THREE = opts.THREE;
    this.renderer = opts.renderer;
    this.scene = opts.scene;
    this.onHint = opts.onHint || function () {};

    /** @type {'low'|'mid'|'high'} */
    this.level = Quality.detectLevel(opts.navigator || null);
    this.manual = false;         // 用户手动锁档后不再自适应
    this.downSteps = 0;

    this._frames = 0;
    this._acc = 0;
    this.fps = 60;               // 最近一次窗口的平均 FPS
    this.lastLevelChangeAt = 0;

    this.apply(this.level);
  }

  /** 设备线索 → 初始档位。纯启发式，可在 smoke.mjs 里用假 navigator 复算。 */
  static detectLevel(nav) {
    const n = nav || (typeof navigator !== 'undefined' ? navigator : {});
    const touch = !!(n.maxTouchPoints > 0 || ('ontouchstart' in (n || {})));
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = n.connection && n.connection.saveData;
    const cores = n.hardwareConcurrency || 4;
    const mem = n.deviceMemory || 4;

    if (reduced || saveData) return 'low';
    if (!touch) {
      // 桌面：按核数/内存粗判（无 WebGL 基准测试，先给保守值）
      if (cores <= 4 || mem <= 4) return 'mid';
      return 'high';
    }
    // 移动：高 DPR + 多核 + 大内存才给高档；其余一律中/低
    if (dpr >= 2.6 && cores >= 8 && mem >= 6) return 'high';
    if (cores >= 6 && mem >= 4) return 'mid';
    return 'low';
  }

  /** @returns {object} 当前档位参数表 */
  get params() { return QUALITY[this.level]; }

  /** 应用档位到 renderer / scene。@param {'low'|'mid'|'high'} level */
  apply(level) {
    if (QUALITY_ORDER.indexOf(level) < 0) level = 'mid';
    this.level = level;
    const p = QUALITY[level];
    const THREE = this.THREE;

    const dpr = Math.min(window.devicePixelRatio || 1, p.dprMax);
    this.renderer.setPixelRatio(dpr);

    this.renderer.shadowMap.enabled = p.shadow;
    // 阴影开关变化后必须让材质重编译，否则旧 program 仍按开阴影的分支跑
    if (this.renderer.shadowMap.autoUpdate !== undefined) this.renderer.shadowMap.needsUpdate = true;
    if (THREE && THREE.ShadowMaterial) { /* 触发点：world.js 重建材质时读取 p.shadow */ }

    if (this.scene && this.scene.fog) {
      this.scene.fog.far = p.fogFar;
    }
    this.onHint(p.name);
    return p;
  }

  /** 用户手动切换（UI 按钮）。@param {'low'|'mid'|'high'} level */
  setManual(level) {
    this.manual = true;
    this.apply(level);
  }

  /** 回到自动模式。 */
  setAuto() {
    this.manual = false;
    this.downSteps = 0;
  }

  /**
   * 每帧调用：采样 FPS 并在需要时降/升档。
   * @param {number} dt 秒
   * @returns {boolean} 是否发生了档位变化
   */
  update(dt) {
    this._frames++;
    this._acc += dt;
    if (this._acc < ADAPT.sampleFrames / 60) return false;   // 攒够窗口再统计
    this.fps = this._frames / this._acc;
    this._frames = 0;
    this._acc = 0;
    if (this.manual) return false;

    const idx = QUALITY_ORDER.indexOf(this.level);
    let next = -1;
    if (this.fps < ADAPT.fpsDown && idx > 0) {
      // 只降不升太多：累计降档次数上限，避免一路掉到底后用户无从发现
      if (this.downSteps < ADAPT.maxDownSteps) {
        next = idx - 1;
        this.downSteps++;
      }
    } else if (this.fps > ADAPT.fpsUp && idx < QUALITY_ORDER.length - 1 && this.downSteps === 0) {
      next = idx + 1;
    }
    if (next < 0) return false;
    this.apply(QUALITY_ORDER[next]);
    return true;
  }

  /** 供 UI 显示的摘要。 */
  summary() {
    const info = this.renderer.info;
    return {
      level: this.level,
      name: QUALITY[this.level].name,
      fps: Math.round(this.fps),
      dpr: +(this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : (window.devicePixelRatio || 1)).toFixed(2),
      calls: info.render.calls,
      tris: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }
}
