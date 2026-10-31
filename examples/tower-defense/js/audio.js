/* 音效：全程序化 WebAudio 合成（零素材、零依赖）。
 * 移动端要点：首个 pointerdown 由 input.js 调 unlock() 解锁 AudioContext；
 * 同名音效限流 + 全局复音上限，避免 3 倍速下爆音；不支持的浏览器整体静默。 */

let ctx = null, master = null, comp = null, noiseBuf = null;
let enabled = true, liveVoices = 0;
const gate = new Map();          // 音效名 -> 上次播放时间（限流）
const GAPS = {                   // 同名最小间隔（秒）
  click: 0.05, deny: 0.22, place: 0.08, upgrade: 0.1, sell: 0.15, wave: 0.6,
  early: 0.4, kill: 0.055, big: 0.12, boom: 0.07, leak: 0.12, boss: 1.2, bossdie: 0.6,
  meteor: 0.5, blizzard: 0.6, greed: 0.4, zap: 0.06, shoot: 0.05, win: 2, lose: 2, hurt: 0.09,
};

function supported() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  return AC || null;
}

/** 懒创建音频上下文；返回 null 表示这台设备不支持（上层静默） */
export function init() {
  if (ctx) return ctx;
  const AC = supported();
  if (!AC) return null;
  try {
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.16;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp); comp.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.7);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 0.35;
  } catch (e) { ctx = null; }
  return ctx;
}

export function unlock() {
  const c = init();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setEnabled(v) {
  enabled = !!v;
  if (enabled) unlock();
  if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.5 : 0, ctx.currentTime, 0.02);
}

export const isEnabled = () => enabled;

function envGain(t0, peak, atk, dur, shape = 'exp') {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  if (shape === 'lin') g.gain.linearRampToValueAtTime(peak, t0 + atk);
  else g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  liveVoices++;
  g.gain.setTargetAtTime(0, t0 + dur, 0.05);
  return g;
}

/** 单音：可选频率滑移 + 滤波 */
function tone(t0, { f = 440, f2 = 0, type = 'square', dur = 0.16, atk = 0.006, peak = 0.18, lp = 0, q = 1 }) {
  if (liveVoices > 16) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  const g = envGain(t0, peak, atk, dur);
  if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = q; o.connect(fl); fl.connect(g); }
  else o.connect(g);
  o.connect(g);
  o.start(t0); o.stop(t0 + dur + 0.08);
  o.onended = () => { liveVoices = Math.max(0, liveVoices - 1); };
}

/** 噪声：低/高通扫过，用于爆炸、风雪、马蹄 */
function noise(t0, { dur = 0.3, peak = 0.22, lp = 2000, hp = 0, sweep = 0 }) {
  if (liveVoices > 16 || !noiseBuf) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 1;
  const fl = ctx.createBiquadFilter();
  fl.type = lp && hp ? 'bandpass' : (lp ? 'lowpass' : 'highpass');
  fl.frequency.setValueAtTime(lp || hp, t0);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t0 + dur);
  fl.Q.value = 0.8;
  const g = envGain(t0, peak, 0.008, dur);
  s.connect(fl); fl.connect(g);
  s.start(t0); s.stop(t0 + dur + 0.05);
  s.onended = () => { liveVoices = Math.max(0, liveVoices - 1); };
}

const seq = (t0, notes, step, opt) => notes.forEach((n, i) => tone(t0 + i * step, Object.assign({ f: n, dur: 0.18, peak: 0.15 }, opt)));

/* 音效表：name -> 生成函数（t0 = 起始时间，o = 参数） */
const VOICES = {
  click: (t) => tone(t, { f: 640, f2: 760, type: 'triangle', dur: 0.07, peak: 0.1 }),
  deny: (t) => { tone(t, { f: 220, f2: 120, type: 'sawtooth', dur: 0.16, peak: 0.12, lp: 900 }); },
  place: (t) => { tone(t, { f: 300, f2: 520, type: 'triangle', dur: 0.14, peak: 0.16 }); noise(t, { dur: 0.12, peak: 0.14, lp: 700 }); },
  upgrade: (t) => { seq(t, [420, 560, 700, 840], 0.055, { type: 'triangle', peak: 0.14 }); tone(t, { f: 1200, type: 'sine', dur: 0.3, peak: 0.05 }); },
  sell: (t) => { seq(t, [520, 400, 300], 0.06, { type: 'sine', peak: 0.13 }); },
  wave: (t) => { tone(t, { f: 116, f2: 150, type: 'sawtooth', dur: 0.5, peak: 0.2, lp: 620, q: 4 }); tone(t, { f: 232, type: 'square', dur: 0.4, peak: 0.07, lp: 1200 }); noise(t + 0.05, { dur: 0.5, peak: 0.09, hp: 400, sweep: 1800 }); },
  early: (t) => tone(t, { f: 880, f2: 1320, type: 'triangle', dur: 0.12, peak: 0.12 }),
  kill: (t) => { tone(t, { f: 900, f2: 300, type: 'square', dur: 0.07, peak: 0.07, lp: 2400 }); },
  big: (t) => { noise(t, { dur: 0.34, peak: 0.3, lp: 900, sweep: 120 }); tone(t, { f: 90, f2: 44, type: 'sine', dur: 0.42, peak: 0.28 }); },
  boom: (t) => noise(t, { dur: 0.26, peak: 0.22, lp: 1100, sweep: 160 }),
  hurt: (t) => tone(t, { f: 1500, f2: 900, type: 'square', dur: 0.05, peak: 0.035, lp: 3000 }),
  leak: (t) => { tone(t, { f: 150, f2: 70, type: 'sine', dur: 0.5, peak: 0.3 }); seq(t + 0.06, [330, 262], 0.11, { type: 'triangle', peak: 0.16 }); },
  boss: (t) => { tone(t, { f: 62, f2: 96, type: 'sawtooth', dur: 1.1, peak: 0.3, lp: 380, q: 6 }); noise(t, { dur: 1.0, peak: 0.14, lp: 420, sweep: 90 }); },
  bossdie: (t) => { noise(t, { dur: 0.9, peak: 0.26, lp: 700, sweep: 90 }); seq(t + 0.12, [392, 523, 659, 784], 0.1, { type: 'triangle', peak: 0.16 }); },
  meteor: (t) => { noise(t, { dur: 0.7, peak: 0.24, hp: 500, sweep: 90 }); tone(t + 0.28, { f: 140, f2: 48, type: 'sine', dur: 0.5, peak: 0.3 }); },
  blizzard: (t) => { noise(t, { dur: 0.9, peak: 0.2, hp: 1200, sweep: 4200 }); seq(t, [1560, 1320, 1040], 0.09, { type: 'sine', peak: 0.09 }); },
  greed: (t) => { seq(t, [1050, 1400], 0.08, { type: 'square', peak: 0.11 }); tone(t + 0.16, { f: 1760, type: 'sine', dur: 0.25, peak: 0.07 }); },
  zap: (t) => noise(t, { dur: 0.09, peak: 0.13, hp: 2600, sweep: 5200 }),
  shoot: (t) => tone(t, { f: 1100, f2: 700, type: 'triangle', dur: 0.05, peak: 0.045, lp: 3200 }),
  win: (t) => { seq(t, [523, 659, 784, 1046, 1318], 0.12, { type: 'triangle', peak: 0.17 }); noise(t, { dur: 0.8, peak: 0.08, hp: 900, sweep: 2600 }); },
  lose: (t) => { seq(t, [330, 262, 196, 147], 0.18, { type: 'sawtooth', peak: 0.14, lp: 700 }); },
};

/** 播放音效；未解锁/未启用/超频时静默 */
export function play(name, o = {}) {
  if (!enabled || !ctx) return;
  if (ctx.state === 'suspended') return;
  const v = VOICES[name];
  if (!v) return;
  const now = ctx.currentTime;
  const last = gate.get(name) || -1;
  const gap = GAPS[name] != null ? GAPS[name] : 0.05;
  if (now - last < gap) return;
  gate.set(name, now);
  try { v(now + (o.delay || 0), o); } catch (e) { /* 音频异常绝不影响战斗 */ }
}

/** 触觉反馈：不支持就静默；pattern 走 navigator.vibrate 标准 */
export function vibrate(pattern) {
  if (!enabled) return;
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 忽略 */ }
}

/** 供 UI 列出可试听音效（设置页「试听」） */
export const soundNames = () => Object.keys(VOICES);
