/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/quality.js —— 画质档 + 帧率自适应 + 本地偏好
 * 档位来源优先级：用户手动选择 > 本地记忆 > 设备启发式（触屏/低核心数 → 流畅）。
 * 自适应：连续 ADAPT.sampleFrames 帧的均值 < fpsDown 自动降一档（最多 ADAPT.maxDownSteps 步）；
 *         连续均值 > fpsUp 且未手动锁定，则升一档（每次只升一步，带 4 s 冷却）。
 */
'use strict';

import { QUALITY, QUALITY_ORDER, ADAPT, PREF_KEY, PREF_VERSION, BUDGET } from './config.js';
import { clamp } from './utils.js';

/** 设备启发式（无 localStorage 记忆时的首屏判断）。 */
export function detectTier() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const mem = nav.deviceMemory || 4;
  const cores = nav.hardwareConcurrency || 4;
  const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 620;
  if (touch && small) return 'low';
  if (touch) return 'mid';
  if (cores <= 4 || mem <= 4) return 'mid';
  return 'high';
}

export function loadPrefs() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(PREF_KEY) : null;
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.v !== PREF_VERSION) return null;
    return o;
  } catch (e) { return null; }
}
export function savePrefs(o) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_KEY, JSON.stringify({ v: PREF_VERSION, tier: o.tier, auto: o.auto, cycle: o.cycle, time: o.time }));
  } catch (e) { /* 隐私模式：忽略 */ }
}

/** 渲染器层面的档位落地（DPR / 阴影）。独立导出，避免与 createQuality 的 TDZ 纠缠。 */
export function applyToRenderer(THREE, renderer, tier) {
  const dpr = clamp(window.devicePixelRatio || 1, 0.75, tier.dprMax);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = !!tier.shadow;
  renderer.shadowMap.autoUpdate = !!tier.shadow;
}

/**
 * @param {object} THREE
 * @param {object} renderer THREE.WebGLRenderer
 * @param {object} hooks { onQuality(tier, name, manual), onAutoChange(bool) }
 */
export function createQuality(THREE, renderer, hooks, opts) {
  const saved = loadPrefs();
  const o = opts || {};
  const h = hooks || {};
  // 档位优先级：URL ?tier= > 用户手动选择 > 本地记忆 > 设备启发式
  const forced = o.tier && QUALITY[o.tier] ? o.tier : null;
  const q = {
    tier: forced || ((saved && QUALITY[saved.tier] && !o.ignorePrefs) ? saved.tier : detectTier()),
    auto: forced ? false : (saved ? !!saved.auto : true),
    manual: forced ? true : !!(saved && saved.tier),
    downSteps: 0,
    frames: 0,
    acc: 0,
    cooldown: 0,
    lastFps: 60,
  };

  function apply(reason) {
    const tier = QUALITY[q.tier];
    if (h.onQuality) h.onQuality(q.tier, tier, reason);
  }

  function setTier(tier, manual) {
    if (!QUALITY[tier]) return;
    q.tier = tier;
    if (manual) { q.manual = true; }
    apply('set');
    savePrefs({ tier: q.tier, auto: q.auto });
  }

  function setAuto(v) {
    q.auto = !!v;
    q.downSteps = 0;
    savePrefs({ tier: q.tier, auto: q.auto });
    if (h.onAutoChange) h.onAutoChange(q.auto);
  }

  /** 每帧调用（返回当前 fps）。 */
  function tick(dt) {
    q.frames++;
    q.acc += dt;
    q.cooldown = Math.max(0, q.cooldown - dt);
    if (q.acc < 0.5) return q.lastFps;
    const fps = q.frames / q.acc;
    q.lastFps = fps;
    q.frames = 0; q.acc = 0;
    if (!q.auto) return fps;
    const idx = QUALITY_ORDER.indexOf(q.tier);
    if (fps < ADAPT.fpsDown && idx > 0 && q.downSteps < ADAPT.maxDownSteps) {
      q.downSteps++;
      q.tier = QUALITY_ORDER[idx - 1];
      q.cooldown = 4;
      apply('down');
      savePrefs({ tier: q.tier, auto: q.auto });
      if (h.onAdapt) h.onAdapt('down', q.tier, fps);
    } else if (fps > ADAPT.fpsUp && idx < QUALITY_ORDER.length - 1 && q.cooldown <= 0 && q.downSteps === 0) {
      q.tier = QUALITY_ORDER[idx + 1];
      q.cooldown = 6;
      apply('up');
      savePrefs({ tier: q.tier, auto: q.auto });
      if (h.onAdapt) h.onAdapt('up', q.tier, fps);
    }
    return fps;
  }

  /** 渲染器层面的档位落地（DPR / 阴影）。 */
  function applyToRenderer(tier) {
    const dpr = clamp(window.devicePixelRatio || 1, 0.75, tier.dprMax);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = !!tier.shadow;
    renderer.shadowMap.autoUpdate = !!tier.shadow;
  }

  apply('init');

  return {
    get tier() { return q.tier; },
    get auto() { return q.auto; },
    get manual() { return q.manual; },
    get fps() { return q.lastFps; },
    setTier: setTier,
    setAuto: setAuto,
    tick: tick,
    applyToRenderer: applyToRenderer,
    current: function () { return QUALITY[q.tier]; },
    budget: BUDGET,
    saved: saved,
  };
}
