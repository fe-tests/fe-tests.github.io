/* 3D 故宫游览 · js/ui.js —— HUD / 加载条 / 降级面板 / 调试读数（阶段 1）
 * 职责：只管 DOM。不碰 THREE、不做输入（见 input.js）。
 * 约定：所有节点在 index.html 里预置，本模块只查询与更新，避免运行时插入导致的布局抖动。
 */
'use strict';

const $ = function (id) { return document.getElementById(id); };

export class UI {
  constructor() {
    this.el = {
      loading: $('loading'), loadPct: $('load-pct'), loadMsg: $('load-msg'),
      hud: $('hud'), fps: $('dbg-fps'), calls: $('dbg-calls'), tris: $('dbg-tris'),
      level: $('dbg-level'), zone: $('dbg-zone'), toast: $('toast'), panelFallback: $('fallback'),
    };
    this._mode = 'walk';
    this._acc = 0;
    this._frames = 0;
    this._toastTimer = 0;
    this.visible = true;
  }

  /** 加载进度。@param {number} ratio 0..1 @param {string} msg */
  progress(ratio, msg) {
    if (!this.el.loading) return;
    const pct = Math.max(0, Math.min(1, ratio));
    if (this.el.loadPct) this.el.loadPct.style.width = (pct * 100).toFixed(1) + '%';
    if (this.el.loadMsg && msg) this.el.loadMsg.textContent = msg;
  }

  hideLoading() {
    if (this.el.loading) this.el.loading.classList.add('gone');
  }

  showLoading() {
    if (this.el.loading) this.el.loading.classList.remove('gone');
  }

  /**
   * 依赖/环境缺失时的降级面板（不得白屏）。
   * @param {{title:string, lines:string[], retry?:boolean}} info
   */
  fallback(info) {
    const p = this.el.panelFallback;
    if (!p) return;
    const t = p.querySelector('.fb-title');
    const ul = p.querySelector('.fb-lines');
    const actions = p.querySelector('.fb-actions');
    if (t) t.textContent = info.title;
    if (ul) {
      ul.innerHTML = '';
      (info.lines || []).forEach(function (line) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      });
    }
    if (actions && info.retry && !p.querySelector('.fb-retry')) {
      const b = document.createElement('button');
      b.className = 'fb-retry';
      b.type = 'button';
      b.textContent = '重试加载';
      b.addEventListener('click', function () { window.location.reload(); });
      actions.appendChild(b);
    }
    p.classList.add('on');
    this.hideLoading();
  }

  /** 短提示（成就解锁 / 操作提示）。 */
  toast(text, ms) {
    const el = this.el.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    this._toastTimer = (ms || 2600) / 1000;
  }

  toggleHud() {
    this.visible = !this.visible;
    if (this.el.hud) this.el.hud.classList.toggle('hide', !this.visible);
    return this.visible;
  }

  /** 每帧更新读数与 toast 计时。@param {object} q quality.summary() @param {string} zone */
  update(dt, q, zone, mode) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0 && this.el.toast) this.el.toast.classList.remove('on');
    }
    this._frames++;
    this._acc += dt;
    if (this._acc < 0.25 || !q) return;
    const fps = this._frames / this._acc;
    this._frames = 0;
    this._acc = 0;
    if (this.el.fps) this.el.fps.textContent = Math.round(fps) + ' fps';
    if (this.el.calls) this.el.calls.textContent = 'draw ' + q.calls;
    if (this.el.tris) this.el.tris.textContent = fmtTris(q.tris);
    if (this.el.level) this.el.level.textContent = q.name + ' · dpr' + q.dpr + (mode ? ' · ' + mode : '');
    if (this.el.zone && zone) this.el.zone.textContent = zone;
  }

  /** 高亮当前视角档（漫步/飞行/俯瞰）。@param {string} id */
  setMode(id) {
    this._mode = id;
    const btns = document.querySelectorAll('[data-mode]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-mode') === id);
    }
  }

  /** 绑定视角档按钮。@param {Function} onPick(modeId) */
  bindMode(onPick) {
    const btns = document.querySelectorAll('[data-mode]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { onPick(btns[i].getAttribute('data-mode')); });
    }
    this.setMode(this._mode);
  }

  /** 绑定画质档按钮（低/中/高）。@param {Function} onPick(level) */
  bindQuality(onPick) {
    const btns = document.querySelectorAll('[data-level]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        onPick(btns[i].getAttribute('data-level'));
      });
    }
  }
}

function fmtTris(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M tris';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k tris';
  return n + ' tris';
}
