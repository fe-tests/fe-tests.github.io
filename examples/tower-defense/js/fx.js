/* 特效层：粒子池 + 冲击波 + 震屏。全部程序化绘制，按 FX_LEVELS 档位降级。
 * 池子上限 = 档位 parts；超限时优先淘汰剩余寿命短的，保证低配机不掉帧。 */
import { FX_LEVELS, TAU, clamp, rand } from './config.js';

const KIND_DOT = 0, KIND_STREAK = 1, KIND_RING = 2, KIND_SMOKE = 3, KIND_SHARD = 4, KIND_EMBER = 5;

export class Fx {
  constructor(tier = 1, rng = Math.random) {
    this.tier = clamp(tier | 0, 0, FX_LEVELS.length - 1);
    this.parts = [];
    this.rings = [];
    this.rng = rng;
    this.shakeT = 0; this.shakePow = 0; this.shakeDur = 1;
    this.flash = 0; this.flashColor = '#ffffff';
    this.ambientKind = '';
    this.acc = 0;
  }

  setTier(t) {
    this.tier = clamp(t | 0, 0, FX_LEVELS.length - 1);
    const cap = FX_LEVELS[this.tier].parts;
    if (this.parts.length > cap) this.parts.length = cap;
  }

  get cap() { return FX_LEVELS[this.tier].parts; }
  get shakeEnabled() { return FX_LEVELS[this.tier].shake > 0; }

  clear() { this.parts.length = 0; this.rings.length = 0; this.shakeT = 0; this.flash = 0; }

  /** 震屏：power 像素，dur 秒；档位关闭时忽略 */
  shake(power, dur = 0.28) {
    if (!this.shakeEnabled) return;
    if (power <= this.shakePow * this.shakeT / Math.max(0.001, this.shakeDur)) { /* 弱震不覆盖强震 */ }
    this.shakePow = Math.min(18, Math.max(this.shakePow * (this.shakeT > 0 ? 0.6 : 0), power));
    this.shakeDur = Math.max(0.08, dur);
    this.shakeT = this.shakeDur;
  }

  flashScreen(color, strength = 0.5) {
    if (this.tier === 0) strength *= 0.5;
    this.flash = Math.min(0.85, Math.max(this.flash, strength));
    this.flashColor = color;
  }

  get shakeOffset() {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const k = this.shakeT / this.shakeDur, r = this.rng;
    const p = this.shakePow * k * k;
    return { x: (r() * 2 - 1) * p, y: (r() * 2 - 1) * p };
  }

  _add(p) {
    const cap = this.cap;
    if (this.parts.length >= cap) {
      // 淘汰剩余寿命最短的粒子
      let bi = 0, bl = Infinity;
      for (let i = 0; i < this.parts.length; i++) {
        const l = this.parts[i].life - this.parts[i].t;
        if (l < bl) { bl = l; bi = i; }
      }
      this.parts[bi] = p;
    } else this.parts.push(p);
  }

  /** 通用爆开：n 个小粒子向四周飞散 */
  burst(x, y, o = {}) {
    const tier = this.tier;
    if (tier === 0 && (o.n || 10) > 14) o = Object.assign({}, o, { n: 8 });
    const n = Math.max(1, Math.round((o.n || 10) * (tier === 0 ? 0.5 : tier === 1 ? 0.8 : 1)));
    const color = o.color || '#ffd27f';
    const spd = o.spd || 150, life = o.life || 0.5, size = o.size || 3;
    for (let i = 0; i < n; i++) {
      const a = o.ang != null ? o.ang + rand(this.rng, -(o.spread || 0.6), o.spread || 0.6) : rand(this.rng, 0, TAU);
      const v = spd * rand(this.rng, 0.35, 1.15);
      this._add({
        k: o.kind != null ? o.kind : KIND_DOT, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * rand(this.rng, 0.7, 1.3), t: 0, size: size * rand(this.rng, 0.6, 1.4),
        color, grav: o.grav != null ? o.grav : 40, drag: o.drag != null ? o.drag : 2.2, rot: a,
      });
    }
  }

  /** 拖尾（子弹/流星） */
  trail(x, y, o = {}) {
    if (this.tier === 0) return;
    this._add({
      k: o.kind != null ? o.kind : KIND_DOT, x, y, vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 0.22, t: 0, size: o.size || 2.4, color: o.color || '#ffe9a8',
      grav: 0, drag: 3.4, rot: 0,
    });
  }

  /** 冲击波环：命中、落地、冻结、开波都用它 */
  ring(x, y, o = {}) {
    const max = this.tier === 0 ? 6 : this.tier === 1 ? 14 : 24;
    if (this.rings.length >= max) this.rings.shift();
    this.rings.push({
      x, y, r: o.r0 != null ? o.r0 : 6, to: o.r != null ? o.r : 60, t: 0,
      life: o.life || 0.45, color: o.color || '#5aa9ff', w: o.w || 3, fill: !!o.fill,
    });
  }

  /** 碎片（击杀重甲/机械时飞溅） */
  shards(x, y, o = {}) {
    const n = Math.round((o.n || 8) * (this.tier === 0 ? 0.4 : 1));
    for (let i = 0; i < n; i++) {
      const a = rand(this.rng, 0, TAU), v = rand(this.rng, 60, 260);
      this._add({
        k: KIND_SHARD, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        life: rand(this.rng, 0.35, 0.7), t: 0, size: rand(this.rng, 2, 5),
        color: o.color || '#cfd8e3', grav: 260, drag: 1.1, rot: rand(this.rng, 0, TAU),
      });
    }
  }

  /** 烟尘（塔建造/升级落地） */
  puff(x, y, o = {}) {
    const n = Math.round((o.n || 7) * (this.tier === 0 ? 0.4 : 1));
    for (let i = 0; i < n; i++) {
      const a = rand(this.rng, 0, TAU), v = rand(this.rng, 10, 60);
      this._add({
        k: KIND_SMOKE, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20,
        life: rand(this.rng, 0.4, 0.9), t: 0, size: rand(this.rng, 6, 14),
        color: o.color || '#8b97a8', grav: -12, drag: 1.6, rot: 0,
      });
    }
  }

  /** 火星/雪粒环境层由 render 调 ambient 提供 */
  setAmbient(kind) { this.ambientKind = kind || ''; this.acc = 0; }

  ambient(dt, w, h) {
    if (FX_LEVELS[this.tier].ambient < 1 || !this.ambientKind) return;
    const rate = this.ambientKind === 'snow' ? 26 : this.ambientKind === 'ember' ? 16 : this.ambientKind === 'sand' ? 22 : this.ambientKind === 'spore' ? 14 : 12;
    this.acc += dt * rate * (FX_LEVELS[this.tier].ambient >= 2 ? 1.7 : 1);
    while (this.acc >= 1) {
      this.acc -= 1;
      const k = this.ambientKind;
      const y = k === 'ember' || k === 'spore' ? h * rand(this.rng, 0.6, 1) : rand(this.rng, 0, h);
      this._add({
        k: k === 'ember' ? KIND_EMBER : KIND_DOT, x: rand(this.rng, 0, w), y,
        vx: k === 'sand' ? rand(this.rng, 140, 260) : rand(this.rng, -12, 12),
        vy: k === 'snow' ? rand(this.rng, 24, 52) : (k === 'ember' || k === 'spore') ? rand(this.rng, -34, -10) : rand(this.rng, -6, 6),
        life: rand(this.rng, 1.6, 3.4), t: 0, size: rand(this.rng, 1.2, 2.6),
        color: k === 'snow' ? '#dff0ff' : k === 'ember' ? '#ff9a4a' : k === 'sand' ? '#d8c48c' : k === 'spore' ? '#7ee787' : '#9fb6d4',
        grav: 0, drag: 0.05, rot: 0,
      });
    }
  }

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === KIND_SHARD) p.rot += dt * 6;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) { this.rings.splice(i, 1); continue; }
      const k = r.t / r.life;
      r.cur = r.r + (r.to - r.r) * (1 - (1 - k) * (1 - k));
    }
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = clamp(k, 0, 1) * (p.k === KIND_SMOKE ? 0.28 : 0.9);
      ctx.fillStyle = p.color;
      if (p.k === KIND_STREAK) {
        const len = Math.hypot(p.vx, p.vy) * 0.03;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-len, -p.size * 0.4, len * 2, p.size * 0.8);
        ctx.restore();
      } else if (p.k === KIND_SHARD) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
        ctx.restore();
      } else {
        const s = p.k === KIND_SMOKE ? p.size * (1 + p.t / p.life * 1.4) : p.size * (0.4 + k * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, s), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const r of this.rings) {
      const k = 1 - r.t / r.life;
      ctx.globalAlpha = clamp(k * 0.85, 0, 1);
      ctx.strokeStyle = r.color;
      if (r.fill) { ctx.fillStyle = r.color; ctx.globalAlpha = clamp(k * 0.16, 0, 1); ctx.beginPath(); ctx.arc(r.x, r.y, r.cur, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = clamp(k * 0.85, 0, 1);
      ctx.lineWidth = Math.max(0.6, r.w * k);
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.cur), 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawFlash(ctx, w, h) {
    if (this.flash <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = this.flash * 0.5;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

export const FX_KINDS = { DOT: KIND_DOT, STREAK: KIND_STREAK, RING: KIND_RING, SMOKE: KIND_SMOKE, SHARD: KIND_SHARD, EMBER: KIND_EMBER };
