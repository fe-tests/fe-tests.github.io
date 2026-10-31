/* 触控输入层：单指拖拽瞄准、点按建造、长按速建、双指捏合缩放 + 平移。
 * 移动端要点：
 *  - 指尖会挡住落点，所以建造准星固定在「手指上方 RETICLE_LIFT px」，由 game 层计算；
 *  - 6px 才算拖拽、<10px 且 <500ms 才算点按、400ms 不动算长按，避免拇指抖动误判；
 *  - 全部走 Pointer Events，一套代码同时覆盖触屏 / 鼠标 / 手写笔；
 *  - 首次手势回调 onUnlock，用来解锁 WebAudio（浏览器要求用户手势内 resume）。 */
import { TILE, GRID_W, GRID_H, clamp } from './config.js';

const DRAG_MIN = 6;       // 超过这个像素算拖拽
const TAP_MAX = 10;       // 点按允许的最大位移
const TAP_MS = 500;       // 点按允许的最长按住时间
const LONG_MS = 400;      // 长按判定时长

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} h 回调：onTap / onDragStart / onDragMove / onDragEnd / onLongPress /
   *                   onCamera / onKey / onUnlock
   * @param {object} api Renderer（screenToWorld / zoomAt / panBy / view）
   */
  constructor(canvas, h, api) {
    this.c = canvas;
    this.h = h || {};
    this.api = api || {};
    this.pts = new Map();      // pointerId -> {x,y,sx,sy,t,moved,tile,type}
    this.mode = 'idle';        // idle | press | pan | pinch | drag | long
    this.pinchDist = 0;
    this.pinchMid = { x: 0, y: 0 };
    this.enabled = true;
    this.longTimer = 0;
    this.bound = [];
    this.attach();
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (!v) this.reset();
  }

  reset() {
    this.pts.clear();
    this.mode = 'idle';
    if (this.longTimer) { clearTimeout(this.longTimer); this.longTimer = 0; }
  }

  on(el, ev, fn, opt) {
    el.addEventListener(ev, fn, opt || false);
    this.bound.push([el, ev, fn, opt]);
  }

  attach() {
    const c = this.c;
    this.on(c, 'pointerdown', (e) => this.down(e), { passive: false });
    this.on(c, 'pointermove', (e) => this.move(e), { passive: false });
    this.on(c, 'pointerup', (e) => this.up(e), { passive: false });
    this.on(c, 'pointercancel', (e) => this.cancel(e));
    this.on(c, 'pointerleave', (e) => this.cancel(e));
    this.on(c, 'wheel', (e) => this.wheel(e), { passive: false });
    this.on(c, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'blur', () => this.reset());
    this.onKeyBind();
  }

  /** 键盘兜底：桌面端与无障碍操作同样可玩（方向键平移、1-9 选塔、JKL 技能） */
  onKeyBind() {
    this.on(window, 'keydown', (e) => {
      if (!this.enabled || !this.h.onKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      const k = e.key, pan = 90, cx = this.c.clientWidth / 2, cy = this.c.clientHeight / 2;
      const H = this.h;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { if (this.api.panBy) this.api.panBy(-pan, 0); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { if (this.api.panBy) this.api.panBy(pan, 0); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { if (this.api.panBy) this.api.panBy(0, -pan); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { if (this.api.panBy) this.api.panBy(0, pan); }
      else if (k === '+' || k === '=') { if (this.api.zoomAt) this.api.zoomAt(cx, cy, 1.2); }
      else if (k === '-' || k === '_') { if (this.api.zoomAt) this.api.zoomAt(cx, cy, 1 / 1.2); }
      else if (k === 'f' || k === 'F') { H.onKey('fit'); return; }
      else if (k === ' ' || k === 'Enter') { e.preventDefault(); H.onKey('space'); return; }
      else if (k === 'Escape' || k === 'Backspace') { H.onKey('escape'); return; }
      else if (k === 'j' || k === 'J') { H.onKey('skill1'); return; }
      else if (k === 'k' || k === 'K') { H.onKey('skill2'); return; }
      else if (k === 'l' || k === 'L') { H.onKey('skill3'); return; }
      else if (k === 'x' || k === 'X') { H.onKey('sell'); return; }
      else if (k === 'u' || k === 'U') { H.onKey('upgrade'); return; }
      else if (/^[1-9]$/.test(k)) { H.onKey('num' + k); return; }
      else return;
      e.preventDefault();
    });
  }

  destroy() {
    for (const [el, ev, fn, opt] of this.bound) el.removeEventListener(ev, fn, opt);
    this.bound.length = 0;
    this.reset();
  }

  local(e) {
    const r = this.c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  tileOf(sx, sy, type) {
    const w = this.api.screenToWorld ? this.api.screenToWorld(sx, sy) : { x: sx, y: sy };
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
    return { tx, ty, wx: w.x, wy: w.y, type: type || 'touch', inb: tx >= 0 && ty >= 0 && tx < GRID_W && ty < GRID_H };
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.local(e);
    const t = this.tileOf(p.x, p.y, e.pointerType);
    this.pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: 0, tile: t, type: e.pointerType });
    if (this.c.setPointerCapture) { try { this.c.setPointerCapture(e.pointerId); } catch (err) { /* 部分浏览器不支持，忽略 */ } }
    if (this.pts.size === 2) { this.startPinch(); return; }
    this.mode = 'press';
    if (this.h.onLongPress && t.inb) {
      clearTimeout(this.longTimer);
      this.longTimer = setTimeout(() => {
        if (this.mode === 'press' && this.pts.size === 1) {
          this.mode = 'long';
          if (this.h.onDragEnd) this.h.onDragEnd(null, null, 'long');
          this.h.onLongPress(t.tx, t.ty, t, p);
        }
      }, LONG_MS);
    }
    if (this.h.onDragStart) this.h.onDragStart(t.tx, t.ty, t, p);
  }

  startPinch() {
    const a = [...this.pts.values()];
    this.mode = 'pinch';
    this.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
    this.pinchMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    clearTimeout(this.longTimer);
    if (this.h.onDragEnd) this.h.onDragEnd(null, null, 'pinch');
  }

  move(e) {
    if (!this.enabled) return;
    const rec = this.pts.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    const p = this.local(e);
    const dx = p.x - rec.x, dy = p.y - rec.y;
    rec.moved += Math.hypot(dx, dy);
    rec.x = p.x; rec.y = p.y;

    if (this.mode === 'pinch' && this.pts.size >= 2) {
      const a = [...this.pts.values()];
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      const factor = d / this.pinchDist;
      if (Math.abs(factor - 1) > 0.004 && this.api.zoomAt) this.api.zoomAt(mid.x, mid.y, factor);
      if (this.api.panBy) this.api.panBy(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      if (this.h.onCamera) this.h.onCamera(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y, factor);
      this.pinchDist = d;
      this.pinchMid = mid;
      return;
    }
    if (this.mode === 'long') return;
    if (this.mode === 'press' && rec.moved > DRAG_MIN) {
      clearTimeout(this.longTimer);
      this.mode = rec.type === 'mouse' ? 'pan' : 'drag';
      if (this.mode === 'drag' && this.h.onDragMove) this.h.onDragMove(rec.tile.tx, rec.tile.ty, rec.tile, { x: rec.x, y: rec.y }, dx, dy);
    }
    if (this.mode === 'drag') {
      const t = this.tileOf(p.x, p.y, rec.type);
      if (this.h.onDragMove) this.h.onDragMove(t.tx, t.ty, t, p, dx, dy);
    } else if (this.mode === 'pan') {
      if (this.api.panBy) this.api.panBy(dx, dy);
      if (this.h.onCamera) this.h.onCamera(dx, dy, 1);
    }
  }

  up(e) {
    if (!this.enabled) return;
    const rec = this.pts.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    clearTimeout(this.longTimer);
    this.pts.delete(e.pointerId);
    const mode = this.mode;
    if (this.pts.size >= 1) { this.mode = 'pan'; return; }
    this.mode = 'idle';
    if (mode === 'pinch' || mode === 'long') return;
    const p = { x: rec.x, y: rec.y };
    const dt = performance.now() - rec.t;
    const dist = Math.hypot(p.x - rec.sx, p.y - rec.sy);
    const t = this.tileOf(p.x, p.y, rec.type);
    const isTap = dist <= TAP_MAX && dt <= TAP_MS;
    if (mode === 'drag' && this.h.onDragEnd) this.h.onDragEnd(t.tx, t.ty, t, p, isTap);
    if (isTap && this.h.onTap) this.h.onTap(t.tx, t.ty, t, p, e);
  }

  cancel(e) {
    if (e && this.pts.has(e.pointerId)) this.pts.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.pts.size === 0) {
      if (this.mode === 'drag' && this.h.onDragEnd) this.h.onDragEnd(null, null, 'cancel');
      this.mode = 'idle';
    }
  }

  wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.local(e);
    const factor = Math.pow(1.0015, -e.deltaY);
    if (this.api.zoomAt) this.api.zoomAt(p.x, p.y, factor);
    if (this.h.onCamera) this.h.onCamera(0, 0, factor);
  }

  get active() { return this.pts.size > 0; }
  get zoom() { return this.api.view ? this.api.view.zoom : 1; }
}

/** 世界坐标 → 瓦坐标（钳制在地图内，技能落点用） */
export function toTile(wx, wy) {
  return { tx: clamp(Math.floor(wx / TILE), 0, GRID_W - 1), ty: clamp(Math.floor(wy / TILE), 0, GRID_H - 1) };
}
