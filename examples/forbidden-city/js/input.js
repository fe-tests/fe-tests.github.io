/* 3D 故宫游览 · js/input.js —— 键鼠 + 触屏输入（阶段 1：移动/视角/FOV；阶段 8 接相机模式）
 * 复用站内手感（examples/3d-shoot-game/index.html）：body.touch 开关、虚拟摇杆、右屏拖拽看视角。
 * 本模块只产生「意图」（move.x/y、look 增量、fovTarget），由 player.js / camera.js 消费。
 */
'use strict';

import { RENDER } from './config.js';

export class Input {
  /** @param {{canvas:HTMLCanvasElement, isTouch:boolean}} opts */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.isTouch = !!opts.isTouch;

    // 摇杆意图：x 右为正、y 前为正（屏幕方向已折算）
    this.move = { x: 0, y: 0, active: false };
    // 视角增量（每帧被 player.js 消费后置零）
    this.look = { dx: 0, dy: 0 };
    this.fovTarget = RENDER.fovDesktop;
    this.run = false;

    this._keys = Object.create(null);
    this._pointers = new Map();      // pointerId → {kind:'stick'|'look', x, y, sx, sy}
    this._pinch = null;              // {dist, fov0}
    this.bind();
  }

  bind() {
    const el = this.canvas;

    /* ------------------------------ 指针（统一 mouse / pen / touch）------------------------------ */
    el.addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));

    /* ------------------------------ 键盘 ------------------------------ */
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this._keys = Object.create(null); this.run = false; });

    /* ------------------------------ 滚轮 / 捏合：调 FOV ------------------------------ */
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.fovTarget = clamp(this.fovTarget + Math.sign(e.deltaY) * 3, RENDER.fovTouchMin, RENDER.fovTouchMax);
    }, { passive: false });

    // iOS Safari 的捏合缩放手势：页面是全屏画布，不允许整页缩放
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  onKey(e, down) {
    const k = String(e.key).toLowerCase();
    this._keys[k] = down;
    if (k === 'shift') this.run = down;
    // WASD / 方向键 / 空格：阻止页面滚动
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
  }

  onDown(e) {
    if (e.pointerType === 'mouse') {
      // 鼠标：拖拽 = 看视角（阶段 8 换成指针锁定）
      this._pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
      return;
    }
    const halfW = window.innerWidth / 2;
    if (e.clientX < halfW) {
      // 触屏左半屏 = 虚拟摇杆（按下点即摇杆原点，拇指不用回位找按钮）
      this._pointers.set(e.pointerId, { kind: 'stick', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      this.move.active = true;
      const stick = document.getElementById('stick');
      if (stick) {
        stick.style.left = e.clientX + 'px';
        stick.style.top = e.clientY + 'px';
        stick.classList.add('on');
      }
    } else {
      this._pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  }

  onMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;

    // 双指：捏合调 FOV（此时丢弃看视角增量，避免视角跟着抖）
    if (this.isTouch && this._pointers.size >= 2) {
      const ids = Array.from(this._pointers.keys());
      const a = this._pointers.get(ids[0]), b = this._pointers.get(ids[1]);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!this._pinch) {
        this._pinch = { dist: dist, fov0: this.fovTarget };
      } else {
        const ratio = this._pinch.dist / Math.max(24, dist);
        this.fovTarget = clamp(this._pinch.fov0 * ratio, RENDER.fovTouchMin, RENDER.fovTouchMax);
      }
      a.x = e.clientX; a.y = e.clientY;
      return;
    }

    if (p.kind === 'stick') {
      const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      const R = 56;                                   // 摇杆行程 px
      const len = Math.hypot(dx, dy);
      const k = Math.min(1, len / R);
      this.move.x = (len > 6) ? (dx / Math.max(len, 1)) * k : 0;
      this.move.y = (len > 6) ? (-dy / Math.max(len, 1)) * k : 0;   // 屏幕上 = 前进
      const knob = document.getElementById('stick-knob');
      if (knob) knob.style.transform = 'translate(' + (dx * k * 0.6) + 'px,' + (dy * k * 0.6) + 'px)';
    } else {
      this.look.dx += (e.clientX - p.x);
      this.look.dy += (e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    }
  }

  onUp(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'stick') {
      this.move.x = 0; this.move.y = 0; this.move.active = false;
      const stick = document.getElementById('stick');
      const knob = document.getElementById('stick-knob');
      if (stick) stick.classList.remove('on');
      if (knob) knob.style.transform = 'translate(0,0)';
    }
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
  }

  /** player.js 每帧取用后调用，清空增量型输入。 */
  consumeLook() {
    const v = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return v;
  }

  keyMove() {
    const k = this._keys;
    let x = 0, y = 0;
    if (k['w'] || k['arrowup']) y += 1;
    if (k['s'] || k['arrowdown']) y -= 1;
    if (k['a'] || k['arrowleft']) x -= 1;
    if (k['d'] || k['arrowright']) x += 1;
    return { x: x, y: y };
  }

  /** 合并摇杆与键盘的移动意图（长度 ≤ 1）。 */
  moveVector() {
    const km = this.keyMove();
    let x = this.move.x + km.x, y = this.move.y + km.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y };
  }
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
