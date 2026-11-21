/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/audio.js —— 程序化环境声（WebAudio，无音频文件）
 * 默认关闭：首次点击（pointerdown）解锁 AudioContext 后再开；M 键切换。
 * 组成：海浪（噪声 + 低通摆动的涌浪）、风（带通噪声）、轮胎滚动嘶声（随速度）、脚踏咔哒（踏频）、海鸥叫（随机）、展翅呼呼。
 */
'use strict';

import { clamp } from './utils.js';

export function createAudio() {
  const st = {
    on: false,
    ctx: null,
    master: null,
    ready: false,
    speed: 5.6,
    night: 0,
    nextGull: 6 + Math.random() * 8,
  };

  function ctxReady() { return !!(st.ctx && st.ctx.state === 'running'); }

  function noiseBuffer(ctx, sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      v = (v + 0.02 * w) / 1.02;
      d[i] = (v * 3.2 + w * 0.25);
    }
    return b;
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const nb = noiseBuffer(ctx, 2.4);

    // 海浪：噪声 → 低通 → 增益（LFO 摆动模拟涌浪）
    const surf = ctx.createBufferSource();
    surf.buffer = nb; surf.loop = true;
    const surfLP = ctx.createBiquadFilter();
    surfLP.type = 'lowpass'; surfLP.frequency.value = 520; surfLP.Q.value = 0.7;
    const surfGain = ctx.createGain(); surfGain.gain.value = 0.5;
    surf.connect(surfLP).connect(surfGain).connect(master);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.12; lfoGain.gain.value = 0.32;
    lfo.connect(lfoGain); lfoGain.connect(surfGain.gain);
    const lfo2 = ctx.createOscillator();
    const lfo2Gain = ctx.createGain();
    lfo2.frequency.value = 0.071; lfo2Gain.gain.value = 190;
    lfo2.connect(lfo2Gain); lfo2Gain.connect(surfLP.frequency);

    // 风：噪声 → 带通
    const wind = ctx.createBufferSource();
    wind.buffer = nb; wind.loop = true;
    const windBP = ctx.createBiquadFilter();
    windBP.type = 'bandpass'; windBP.frequency.value = 620; windBP.Q.value = 0.8;
    const windGain = ctx.createGain(); windGain.gain.value = 0.12;
    wind.connect(windBP).connect(windGain).connect(master);

    // 滚动嘶声：噪声 → 高通（随速度变亮变响）
    const roll = ctx.createBufferSource();
    roll.buffer = nb; roll.loop = true;
    const rollHP = ctx.createBiquadFilter();
    rollHP.type = 'highpass'; rollHP.frequency.value = 1800;
    const rollGain = ctx.createGain(); rollGain.gain.value = 0.06;
    roll.connect(rollHP).connect(rollGain).connect(master);

    surf.start(); wind.start(); roll.start(); lfo.start(); lfo2.start();

    st.ctx = ctx;
    st.master = master;
    st.surf = { src: surf, gain: surfGain, lp: surfLP };
    st.wind = { src: wind, gain: windGain, bp: windBP };
    st.roll = { src: roll, gain: rollGain, hp: rollHP };
    st.lfo = lfo;
    st.ready = true;
    return true;
  }

  function unlock() {
    if (!st.ready && !build()) return false;
    if (st.ctx.state === 'suspended') st.ctx.resume();
    return true;
  }

  /** 脚踏咔哒（每圈两次，力度随踏频）。 */
  function click(strength) {
    if (!st.on || !ctxReady()) return;
    const ctx = st.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBufferShort();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400 + Math.random() * 700; bp.Q.value = 2.2;
    const g = ctx.createGain();
    const amp = 0.035 * clamp(strength === undefined ? 1 : strength, 0, 2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    src.connect(bp).connect(g).connect(st.master);
    src.start(t); src.stop(t + 0.12);
  }
  let shortBuf = null;
  function noiseBufferShort() {
    if (shortBuf) return shortBuf;
    const ctx = st.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    shortBuf = b;
    return b;
  }

  /** 展翅：一记低频呼呼。 */
  function whoop(strength) {
    if (!st.on || !ctxReady()) return;
    const ctx = st.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBufferShort();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.18);
    const g = ctx.createGain();
    const amp = 0.16 * clamp(strength === undefined ? 1 : strength, 0, 1.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(lp).connect(g).connect(st.master);
    src.start(t); src.stop(t + 0.55);
  }

  /** 海鸥叫：两段下滑的哨音。 */
  function gull() {
    if (!st.on || !ctxReady()) return;
    const ctx = st.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 4;
    osc.type = 'sawtooth';
    const f0 = 780 + Math.random() * 260;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 0.34);
    const amp = 0.055;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.05);
    g.gain.setValueAtTime(amp * 0.8, t0 + 0.16);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    osc.connect(bp).connect(g).connect(st.master);
    osc.start(t0);
    osc.stop(t0 + 0.46);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 22; lg.gain.value = 90;
    lfo.connect(lg); lg.connect(osc.frequency);
    lfo.start(t0); lfo.stop(t0 + 0.46);
  }

  function setEnabled(on) {
    if (on && !unlock()) return false;
    st.on = !!on;
    if (st.ready) {
      const t = st.ctx.currentTime;
      st.master.gain.cancelScheduledValues(t);
      st.master.gain.linearRampToValueAtTime(st.on ? 0.9 : 0.0, t + 0.35);
      if (st.on && st.ctx.state === 'suspended') st.ctx.resume();
    }
    return true;
  }

  function update(dt, speed, day) {
    if (!st.on || !ctxReady()) return;
    st.speed = speed;
    st.night = day ? day.night : 0;
    const ctx = st.ctx;
    const t = ctx.currentTime;
    const v = clamp(speed / 7.4, 0, 1);
    st.roll.gain.gain.setTargetAtTime(0.02 + v * 0.075, t, 0.4);
    st.roll.hp.frequency.setTargetAtTime(1200 + v * 2200, t, 0.5);
    st.wind.gain.gain.setTargetAtTime(0.05 + (1 - st.night) * 0.10 + v * 0.05, t, 0.8);
    st.surf.gain.gain.setTargetAtTime(0.34 + (1 - st.night) * 0.22, t, 1.0);
    st.nextGull -= dt;
    if (st.nextGull <= 0) {
      st.nextGull = 7 + Math.random() * 14;
      if (Math.random() < 0.6) gull();
    }
  }

  return {
    state: st,
    get on() { return st.on; },
    setEnabled: setEnabled,
    /** 首次用户手势时静默建好上下文（主增益为 0，不出声），之后开启即时生效。 */
    unlockOnce: function () {
      if (!st.ready && !build()) return false;
      if (st.ctx.state === 'suspended') st.ctx.resume();
      return true;
    },
    update: update,
    click: click,
    whoop: whoop,
    gull: gull,
    destroy: function () { if (st.ctx) st.ctx.close(); },
  };
}
