/* 触控输入层：单指拖拽瞄准、点按建造、长按速建；视角**默认禁缩放**（双指只作平移，实际被钳死）。
 * 移动端要点：
 *  - 指尖会挡住落点，建造落点固定在「手指上方 reticleLiftTiles 整瓦」，由 game 层用
 *    render.js 的 screenToTile 统一计算——按下预览、点按、拖拽松手、长按四条路径同源；
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
   * @param {object} h 回调：onTap / onDragStart / onDragMove / onDragEnd(tx,ty,tile,point,isTap,reason) /
   *                   onLongPress / onCamera / onKey / onToast / onUnlock
   *                   reason ∈ 'release' | 'long' | 'pinch' | 'cancel'（pinch/cancel 表示放弃瞄准）
   * @param {object} api Renderer（screenToWorld / worldToScreen / panBy / view；zoomAt 已 no-op）
   */
  constructor(canvas, h, api) {
    this.c = canvas;
    this.h = h || {};
    this.api = api || {};
    this.pts = new Map();      // pointerId -> {x,y,sx,sy,t,moved,tile,type}
    this.mode = 'idle';        // idle | press | pan | pinch | drag | long
    this.multiTouch = false;   // 本次手势出现过第二指 → 收尾一律不算点按（防「捏合第一指静默落塔」）
    this.pinchDist = 0;
    this.pinchMid = { x: 0, y: 0 };
    this.enabled = true;
    this.longTimer = 0;
    this.vvWarned = false;   // 「浏览器放大了页面」只提示一次
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
    this.multiTouch = false;
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
    /* iOS Safari 私有手势：画布上的页面级捏合直接拦掉（配合 #game 的 touch-action:none），
       保证「屏幕坐标 == 世界坐标口径」这条不变量不被浏览器缩放污染 */
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      this.on(c, ev, (e) => e.preventDefault(), { passive: false });
    }
    this.on(window, 'blur', () => this.reset());
    this.onKeyBind();
  }

  /** 键盘兜底：桌面端与无障碍操作同样可玩（1-9 选塔、JKL 技能、F 重新铺满）。
   *  平移 / 缩放键保留入口：默认禁缩放后 clampCam 把视角钳成居中，它们天然是 no-op。 */
  onKeyBind() {
    this.on(window, 'keydown', (e) => {
      if (!this.enabled || !this.h.onKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      const k = e.key, pan = 90;
      const H = this.h;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { if (this.api.panBy) this.api.panBy(-pan, 0); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { if (this.api.panBy) this.api.panBy(pan, 0); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { if (this.api.panBy) this.api.panBy(0, -pan); }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { if (this.api.panBy) this.api.panBy(0, pan); }
      /* 缩放快捷键（+/−）随「默认禁缩放」撤掉：视角只剩 F 重新铺满（docs/design.md §4） */
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

  /** 画布局部坐标（CSS px，与渲染变换同口径 → DPR 无关）。
   *  浏览器页面被捏合放大时（iOS Safari 的 visualViewport.scale > 1），clientX 与
   *  getBoundingClientRect 不在同一坐标空间，落点偏移不可知：此时不做任何猜测，
   *  返回 null 让调用方丢弃这次手势并提示一次（见 pageZoomed）。 */
  local(e) {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv && vv.scale > 1.05) return this.pageZoomed();
    this.vvWarned = false;
    const r = this.c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** 页面缩放态下的手势一律丢弃：清掉按压状态（防止半截拖拽落下塔）与准星，并提示一次。
   *  不看 had 条件：上一轮手势遗留的准星（长按 / 连续建造的 keep 模式）也必须一起清掉，
   *  否则放大页面后屏幕上会留一个「点不动也落不下」的幽灵准星。 */
  pageZoomed() {
    this.reset();
    if (this.h.onDragEnd) this.h.onDragEnd(null, null, null, null, false, 'cancel');
    if (!this.vvWarned) {
      this.vvWarned = true;
      if (this.h.onToast) this.h.onToast('浏览器已放大页面：请缩回 100% 后再操作，避免落点偏移');
    }
    return null;
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
    if (!p) return;                       // 页面被浏览器放大：local() 已 reset + 提示
    const t = this.tileOf(p.x, p.y, e.pointerType);
    if (this.pts.size === 0) this.multiTouch = false;      // 新的一次单指手势：清掉「多指」标记
    this.pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: 0, tile: t, type: e.pointerType });
    if (this.c.setPointerCapture) { try { this.c.setPointerCapture(e.pointerId); } catch (err) { /* 部分浏览器不支持，忽略 */ } }
    if (this.pts.size === 2) { this.startPinch(); return; }
    this.mode = 'press';
    /* 长按判定的门槛是「手指在画布里」，不是「手指在地图内」：
       抬升 2 瓦后瞄底行时手指正落在地图下方的 letterbox 死区，用 t.inb 会禁掉那一片的长按速建。
       合法性由 game 层按落瓦判断（onLongPress 内部处理非建造态选塔的 inb 门槛）。 */
    if (this.h.onLongPress) {
      clearTimeout(this.longTimer);
      this.longTimer = setTimeout(() => {
        if (this.mode === 'press' && this.pts.size === 1) {
          this.mode = 'long';
          if (this.h.onDragEnd) this.h.onDragEnd(null, null, null, null, true, 'long');
          this.h.onLongPress(t.tx, t.ty, t, p);
        }
      }, LONG_MS);
    }
    if (this.h.onDragStart) this.h.onDragStart(t.tx, t.ty, t, p);
  }

  startPinch() {
    const a = [...this.pts.values()];
    this.mode = 'pinch';
    this.multiTouch = true;
    this.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
    this.pinchMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    clearTimeout(this.longTimer);
    /* 第二根手指落下＝放弃本次瞄准（不是「提交」）：把 reason 传给 game 清掉准星，
       避免「捏合手势的第一指」在屏幕上留下一座玩家没打算放的塔 */
    if (this.h.onDragEnd) this.h.onDragEnd(null, null, null, null, false, 'pinch');
  }

  move(e) {
    if (!this.enabled) return;
    const rec = this.pts.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    const p = this.local(e);
    if (!p) return;
    const dx = p.x - rec.x, dy = p.y - rec.y;
    rec.moved += Math.hypot(dx, dy);
    rec.x = p.x; rec.y = p.y;

    if (this.mode === 'pinch' && this.pts.size >= 2) {
      const a = [...this.pts.values()];
      const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      /* 默认禁缩放：双指只做平移（Renderer.panBy 会被 clampCam 钳成居中 → 视角不动）。
         这段保留是给「视口 cover 模式」留的口子：将来加局部放大时只改这里，不动瞄准链路。 */
      if (this.api.panBy) this.api.panBy(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      if (this.h.onCamera) this.h.onCamera(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y, 1);
      this.pinchMid = mid;
      this.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
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
    /* 本次手势出现过第二指（捏合 / 多指平移）：收尾一律不算点按。
       第二指抬起时 mode 已被改成 'pan'，只看 mode 判不出来，必须看 multiTouch 标记。 */
    if (this.multiTouch) { this.multiTouch = false; return; }
    if (mode === 'pinch' || mode === 'long') return;
    const p = { x: rec.x, y: rec.y };
    const dt = performance.now() - rec.t;
    const dist = Math.hypot(p.x - rec.sx, p.y - rec.sy);
    const t = this.tileOf(p.x, p.y, rec.type);
    const isTap = dist <= TAP_MAX && dt <= TAP_MS;
    if (mode === 'drag' && this.h.onDragEnd) this.h.onDragEnd(t.tx, t.ty, t, p, isTap, 'release');
    if (isTap && this.h.onTap) this.h.onTap(t.tx, t.ty, t, p, e);
  }

  cancel(e) {
    if (e && this.pts.has(e.pointerId)) this.pts.delete(e.pointerId);
    clearTimeout(this.longTimer);
    if (this.pts.size === 0) {
      /* drag 与 press 都要清准星：press 态手指滑出画布（pointerleave）时，预览不能留在屏幕上 */
      if ((this.mode === 'drag' || this.mode === 'press') && this.h.onDragEnd) this.h.onDragEnd(null, null, null, null, false, 'cancel');
      this.mode = 'idle';
      this.multiTouch = false;
    }
  }

  wheel(e) {
    if (!this.enabled) return;
    /* 默认禁缩放：滚轮只用于**拦掉页面滚动**（桌面触控板的双指手势会变成 wheel 事件，
       不拦就变成「页面跟着滚」，玩家以为画面在漂）。zoomAt 是 no-op，这里不再调用。 */
    e.preventDefault();
  }

  get active() { return this.pts.size > 0; }
  get zoom() { return this.api.view ? this.api.view.zoom : 1; }
}

/** 世界坐标 → 瓦坐标（钳制在地图内，技能落点用） */
export function toTile(wx, wy) {
  return { tx: clamp(Math.floor(wx / TILE), 0, GRID_W - 1), ty: clamp(Math.floor(wy / TILE), 0, GRID_H - 1) };
}
