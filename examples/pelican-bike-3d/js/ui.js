/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/ui.js —— HUD 装配与事件绑定（视图层，不做渲染）
 * 只负责：机位条生成、时间轴、画质档、音效/帮助/巡游按钮、调试读数、载入面板、回退面板、提示条。
 */
'use strict';

import { RIGS, TIME, QUALITY, QUALITY_ORDER } from './config.js';
import { fmtClock } from './utils.js';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

export function createUI(o) {
  const h = (o && o.handlers) || {};
  const doc = document;
  const hud = $('#hud', doc);
  const rigbar = $('#rigbar', doc);
  const rigName = $('#rig-name', doc);
  const rigMode = $('#rig-mode', doc);
  const dbgFps = $('#dbg-fps', doc);
  const dbgCalls = $('#dbg-calls', doc);
  const dbgTris = $('#dbg-tris', doc);
  const dbgLevel = $('#dbg-level', doc);
  const stDist = $('#st-dist', doc);
  const stSpeed = $('#st-speed', doc);
  const stClock = $('#st-clock', doc);
  const clockLabel = $('#clock-label', doc);
  const slider = $('#time-slider', doc);
  const cycleBtn = $('#btn-cycle', doc);
  const audioBtn = $('#btn-audio', doc);
  const helpBtn = $('#btn-help', doc);
  const keysPanel = $('#keys', doc);
  const toastEl = $('#toast', doc);
  const loading = $('#loading', doc);
  const loadPct = $('#load-pct', doc);
  const loadMsg = $('#load-msg', doc);
  const fallback = $('#fallback', doc);
  const levelsBox = $('#levels', doc);
  const touch = ('ontouchstart' in window);

  if (touch) doc.body.classList.add('touch');

  /* ---------- 机位条 ---------- */
  const rigBtns = [];
  if (rigbar) {
    RIGS.forEach(function (rig, i) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'rigbtn';
      b.dataset.rig = rig.id;
      b.innerHTML = '<b>' + (i + 1) + '</b>' + rig.cn;
      b.addEventListener('click', function () { if (h.pickRig) h.pickRig(rig.id); });
      rigbar.appendChild(b);
      rigBtns.push(b);
    });
  }

  /* ---------- 画质档 ---------- */
  const levelBtns = $$('[data-level]', levelsBox || doc);
  levelBtns.forEach(function (b) {
    b.addEventListener('click', function () { if (h.setTier) h.setTier(b.dataset.level); });
  });

  /* ---------- 时间轴 ---------- */
  if (slider) {
    slider.addEventListener('input', function () {
      const v = parseInt(slider.value, 10) / 1000;
      if (h.setTime) h.setTime(v, false);
    });
  }
  $$('[data-time]', doc).forEach(function (b) {
    b.addEventListener('click', function () {
      const v = parseFloat(b.dataset.time);
      if (h.setTime) h.setTime(v, true);
    });
  });
  if (cycleBtn) cycleBtn.addEventListener('click', function () { if (h.cycle) h.cycle(); });
  if (audioBtn) audioBtn.addEventListener('click', function () { if (h.audio) h.audio(); });
  if (helpBtn) helpBtn.addEventListener('click', function () { toggleHelp(); });
  if (keysPanel) keysPanel.addEventListener('click', function (e) { if (e.target === keysPanel) toggleHelp(false); });
  if (hud) hud.addEventListener('dblclick', function (e) { if (e.target === hud) toggleHelp(); });

  let toastTimer = 0;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2200);
  }

  function toggleHelp(force) {
    if (!keysPanel) return;
    const on = force === undefined ? !keysPanel.classList.contains('show') : !!force;
    keysPanel.classList.toggle('show', on);
  }

  function setRigName(rig) {
    if (rigName) rigName.textContent = rig.cn;
    rigBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.rig === rig.id); });
  }
  function setTourMode(auto, paused) {
    if (rigMode) {
      rigMode.textContent = auto ? (paused ? '巡游暂停' : '自动巡游') : '手动模式';
      rigMode.classList.toggle('off', !auto);
    }
    if (cycleBtn) cycleBtn.classList.toggle('on', !!auto);
  }
  function setStats(dist, speed, timeOfDay) {
    if (stDist) stDist.textContent = (dist / 1000).toFixed(2) + ' km';
    if (stSpeed) stSpeed.textContent = (speed * 3.6).toFixed(1) + ' km/h';
    if (stClock) stClock.textContent = fmtClock(timeOfDay);
  }
  function setTime(t, fromSlider) {
    if (clockLabel) clockLabel.textContent = fmtClock(t);
    if (slider && !fromSlider) slider.value = String(Math.round(t * 1000));
    const night = (t < 0.22 || t > 0.86);
    if (clockLabel) clockLabel.classList.toggle('night', night);
  }
  function setFps(fps, calls, tris, tier) {
    if (dbgFps) dbgFps.textContent = fps.toFixed(0);
    if (dbgCalls) dbgCalls.textContent = String(calls);
    if (dbgTris) dbgTris.textContent = tris > 1000 ? (tris / 1000).toFixed(0) + 'k' : String(tris);
    if (dbgLevel && tier) dbgLevel.textContent = tier;
  }
  function setTier(tier) {
    levelBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.level === tier); });
    if (dbgLevel) dbgLevel.textContent = QUALITY[tier] ? QUALITY[tier].name : tier;
  }
  function setAutoLabel(auto) { setTourMode(auto, false); }
  function setAudioLabel(on) {
    if (!audioBtn) return;
    audioBtn.classList.toggle('on', !!on);
    audioBtn.textContent = on ? '🔊 音效' : '🔈 音效';
  }
  function setProgress(pct, msg) {
    if (loadPct) loadPct.textContent = Math.round(pct * 100) + '%';
    if (loadMsg && msg) loadMsg.textContent = msg;
  }
  function hideLoading() {
    if (loading) { loading.classList.add('done'); setTimeout(function () { loading.remove(); }, 460); }
  }
  function showFallback(lines) {
    if (loading) loading.classList.add('done');
    if (!fallback) return;
    const box = $('.fb-lines', fallback);
    if (box) box.textContent = lines;
    fallback.classList.add('show');
  }
  function showFileNotice() {
    toast('需要通过 http:// 访问（本地服务器 node server.js），file:// 下 ES 模块会被浏览器拦截', 5200);
  }
  function setHudVisible(v) {
    if (hud) hud.classList.toggle('hide', !v);
  }
  function toggleHud() {
    const hide = !hud || !hud.classList.contains('hide');
    setHudVisible(!hide);
    toast(hide ? '界面已隐藏 (H 恢复)' : '界面显示 (H 隐藏)', 1400);
  }

  return {
    touch: touch,
    handlers: h,
    setRigName: setRigName,
    setTourMode: setTourMode,
    setAutoLabel: setAutoLabel,
    setStats: setStats,
    setTime: setTime,
    setFps: setFps,
    setTier: setTier,
    setAudioLabel: setAudioLabel,
    setProgress: setProgress,
    hideLoading: hideLoading,
    showFallback: showFallback,
    showFileNotice: showFileNotice,
    setHudVisible: setHudVisible,
    toggleHud: toggleHud,
    toggleHelp: toggleHelp,
    toast: toast,
    el: { hud: hud, keys: keysPanel, fallback: fallback, levels: levelsBox, qualityNames: QUALITY_ORDER },
  };
}
