/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/input.js —— 鼠标/触控/键盘：自由视角接管与快捷键
 * 左键拖 = 绕骑行者旋转（yaw ±180° / pitch −60…+60°）；滚轮 = 推拉镜头（2.2–38 m）；
 * 右键/中键拖 = 平移取景；双指 = 缩放 + 平移；R = 复位；空闲 3.5 s 后自动巡游接管。
 */
'use strict';

import { TOUR, RIGS, TIME } from './config.js';
import { clamp, normAngle } from './utils.js';

export function bindInput(o) {
  const dom = o.dom;
  const camera = o.camera;
  const ui = o.ui;
  const onKey = o.onKey || function () {};
  const canvas = dom.canvas;
  const pointers = new Map();
  let dragMode = null;      // 'orbit' | 'pan'
  let lastPinch = 0;
  let lastTap = 0;
  const state = { active: false, dx: 0, dy: 0 };

  function mark() { camera.markInput(); }

  function rigR() { return RIGS[camera.rigState.index].r; }

  function clampZoom() {
    const r = rigR();
    const lo = TOUR.rMin / r - 1;
    const hi = TOUR.rMax / r - 1;
    camera.offset.rZoom = clamp(camera.offset.rZoom, lo, hi);
  }

  function onPointerDown(e) {
    if (e.button === 2 || e.button === 1) dragMode = 'pan';
    else dragMode = 'orbit';
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('dragging');
    }
    state.active = true;
    mark();
    if (o.onPointerDown) o.onPointerDown(e);
  }

  function onPointerMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    state.dx = dx; state.dy = dy;
    if (pointers.size >= 2) {
      // 双指：算间距 → 缩放
      const ids = Array.from(pointers.keys());
      const a = pointers.get(ids[0]), b = pointers.get(ids[1]);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) camera.offset.rZoom += (lastPinch - dist) * TOUR.sens.zoom * 0.012;
      lastPinch = dist;
      clampZoom();
      mark();
      return;
    }
    if (dragMode === 'pan') {
      camera.offset.panX = clamp(camera.offset.panX - dx * TOUR.sens.pan, -TOUR.panMax, TOUR.panMax);
      camera.offset.panY = clamp(camera.offset.panY + dy * TOUR.sens.pan, -TOUR.panMax, TOUR.panMax);
    } else {
      camera.offset.yaw = clamp(camera.offset.yaw - dx * TOUR.sens.yaw, -TOUR.yawMax, TOUR.yawMax);
      camera.offset.pitch = clamp(camera.offset.pitch + dy * TOUR.sens.pitch, -TOUR.pitchMax, TOUR.pitchMax);
    }
    mark();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      dragMode = null;
      lastPinch = 0;
      canvas.classList.remove('dragging');
      canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId) &&
        canvas.releasePointerCapture(e.pointerId);
    }
    state.active = pointers.size > 0;
  }

  function onWheel(e) {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
    camera.offset.rZoom += d * TOUR.sens.zoom * 0.01;
    clampZoom();
    mark();
  }

  function onContextMenu(e) { e.preventDefault(); }

  function onKeyWindow(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const code = e.code;
    // 数字机位
    if (k >= '1' && k <= '7') {
      const i = parseInt(k, 10) - 1;
      if (i < RIGS.length) { camera.setRig(RIGS[i].id, false); ui.setRigName(RIGS[i]); mark(); e.preventDefault(); }
      return;
    }
    switch (k) {
      case 'Tab':
      case ' ':
        camera.nextRig(0); mark(); e.preventDefault(); onKey('nextRig'); break;
      case 'p': case 'P':
        camera.tour.paused = !camera.tour.paused; ui.toast(camera.tour.paused ? '巡游已暂停 (P 继续)' : '巡游继续'); onKey('pause'); break;
      case 'a': case 'A':
        camera.tour.auto = !camera.tour.auto;
        ui.setTourMode(camera.tour.auto);
        ui.toast(camera.tour.auto ? '自动巡游：开 (A)' : '自动巡游：关 (A)');
        mark(); onKey('auto'); break;
      case 'r': case 'R':
        camera.reset(); ui.toast('视角已复位 (R)'); break;
      case '[':
        onKey('time', -TIME.stepKey); mark(); break;
      case ']':
        onKey('time', TIME.stepKey); mark(); break;
      case 'n': case 'N':
        onKey('cycle'); break;
      case 'h': case 'H':
        onKey('hud'); break;
      case 'm': case 'M':
        onKey('audio'); break;
      case '?': case '/':
        onKey('help'); break;
      case 'Escape':
        onKey('esc'); break;
      default:
        if (code === 'Space') e.preventDefault();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyWindow);
  window.addEventListener('blur', function () { pointers.clear(); state.active = false; });

  return {
    state: state,
    manual: function () { return camera.isManual(); },
    yaw: function () { return normAngle(camera.offset.yaw); },
    destroy: function () {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyWindow);
    },
  };
}
