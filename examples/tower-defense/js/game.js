/* 游戏编排层：定步长主循环 + 输入/渲染/特效/音频/存档的接线。
 * 设计约束：
 *  - 逻辑只走 engine.step(固定 1/60)，帧率与速度解耦；倍速靠每帧多跑几步实现；
 *  - 引擎事件（drainEvents）单向映射成 音效 / 粒子 / 震动 / 提示，渲染层不产生玩法；
 *  - UI 通过 hooks 注入，游戏层不直接碰 DOM，方便无 DOM 环境跑同一套逻辑。 */
import {
  STEP, MAX_STEPS_PER_FRAME, SPEEDS, TILE, GRID_W, GRID_H, SKILLS, SKILL_BY_ID, clamp,
} from './config.js';
import { LEVELS, LEVEL_BY_ID, ENDLESS, LAST_LEVEL } from './levels.js';
import { TOWER_BY_ID, TOWERS, towersUnlocked, costOf } from './towers.js';
import {
  newState, step, drainEvents, towerAt, canBuild, placeTower, upgradeTower, sellTower,
  startWave, wavePreview, useSkill, summary, rangePx,
} from './engine.js';
import { Renderer, RETICLE_LIFT } from './render.js';
import { Fx } from './fx.js';
import { Input } from './input.js';
import * as Save from './save.js';
import * as Sfx from './audio.js';

const NOOP = () => {};
const HOOKS_DEFAULT = {
  /* 每帧一次：hud(st)；其余为事件型。UI 侧的波次条 / 技能冷却环都在 hud() 内按缓存刷新。 */
  hud: NOOP, over: NOOP, refresh: NOOP, drawer: NOOP, closeDrawer: NOOP,
  toast: NOOP, banner: NOOP, buildTip: NOOP,
  speedChange: NOOP, pauseChange: NOOP, fps: NOOP, traySel: NOOP, settings: NOOP,
};

export class Game {
  constructor(canvas, hooks = {}) {
    this.hooks = Object.assign({}, HOOKS_DEFAULT, hooks);
    this.canvas = canvas;
    this.s = Save.load();
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx = new Fx(this.s.fx);
    this.renderer = new Renderer(canvas, this.fx);
    this.renderer.setTier(this.s.fx);
    this.st = null;
    this.level = null;
    this.levelId = 0;
    this.paused = true;
    this.finished = false;
    this.speed = SPEEDS[clamp(this.s.speed, 0, SPEEDS.length - 1)] || 1;
    this.acc = 0;
    this.last = 0;
    this.raf = 0;
    this.fpsEma = 60;
    this.build = null;          // {id,def,cost}
    this.armed = null;          // 技能 id（需要落点时）
    this.sel = null;            // 选中的塔
    this.reticle = null;        // {tx,ty,wx,wy}
    this.prevShots = 0;
    this.prevBeams = 0;
    this.input = new Input(canvas, {
      onTap: (tx, ty, t, p, e) => this.onTap(tx, ty, t, p, e),
      onDragStart: (tx, ty, t, p) => this.onDragStart(t, p),
      onDragMove: (tx, ty, t, p, dx, dy) => this.onDragMove(t, p, dx, dy),
      onDragEnd: (tx, ty, t, p, isTap) => this.onDragEnd(t, p, isTap),
      onLongPress: (tx, ty, t, p) => this.onLongPress(t, p),
      onCamera: () => this.updateReticleScreen(),
      onKey: (k) => this.onKey(k),
      onUnlock: () => { Sfx.unlock(); },
    }, this.renderer);
    this.bindWindow();
    this.applySettings();
  }

  /* ---------------- 生命周期 ---------------- */
  bindWindow() {
    const onResize = () => {
      this.renderer.resize(this.st);
      this.renderer.fitView(this.st, true);
      this.updateReticleScreen();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 180));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused && this.st && !this.st.over) this.setPaused(true, true);
    });
  }

  /** 进入关卡：levelId 1..LAST_LEVEL，0 = 无尽 */
  startLevel(levelId, opts = {}) {
    const level = levelId === 0 ? ENDLESS : LEVEL_BY_ID[levelId];
    if (!level) return null;
    this.level = level;
    this.levelId = levelId;
    this.st = newState(level, { seed: opts.seed != null ? opts.seed : (levelId === 0 ? Date.now() % 100000 : levelId * 7) });
    this.st.speed = this.speed;
    this.finished = false;
    this.acc = 0;
    this.last = 0;
    this.sel = null;
    this.armed = null;
    this.reticle = null;
    this.build = null;
    this.prevShots = 0;
    this.prevBeams = 0;
    this.fx.clear();
    this.renderer.setLevel(this.st);
    this.renderer.resize(this.st);
    this.renderer.fitView(this.st, false);
    this.setPaused(false);
    this.hooks.banner(level.endless ? '无尽模式' : `第 ${level.id} 关 · ${level.name}`,
      level.endless ? '守住尽可能多的波次' : level.desc, 1500);
    this.hooks.refresh();
    this.hooks.traySel(null);
    this.hooks.closeDrawer();
    if (!this.raf) {
      this.raf = requestAnimationFrame((ts) => this.frame(ts));
    }
    return this.st;
  }

  restart() { this.startLevel(this.levelId); }

  setPaused(v, autoHidden) {
    this.paused = !!v;
    if (!this.paused) this.last = 0;
    this.input.setEnabled(!this.paused);
    this.hooks.pauseChange(this.paused, !!autoHidden);
  }

  setSpeed(v) {
    const idx = SPEEDS.indexOf(v);
    this.speed = SPEEDS[idx >= 0 ? idx : 0];
    this.s.speed = idx >= 0 ? idx : 0;
    Save.save({ speed: this.s.speed });
    if (this.st) this.st.speed = this.speed;
    this.hooks.speedChange(this.speed);
  }

  applySettings() {
    const s = this.s;
    Sfx.setEnabled(!!s.sound);
    this.fx.setTier(s.fx);
    this.renderer.setTier(s.fx);
    this.renderer.showGrid = !!s.grid;
    this.speed = SPEEDS[clamp(s.speed, 0, SPEEDS.length - 1)] || 1;
    if (this.st) this.st.speed = this.speed;
    this.hooks.speedChange(this.speed);
    this.hooks.settings(s);
  }

  setSetting(key, val) {
    this.s[key] = val;
    Save.save({ [key]: val });
    this.applySettings();
    this.hooks.refresh();
  }

  /* ---------------- 主循环 ---------------- */
  frame(ts) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const now = ts / 1000;
    if (!this.last) this.last = now;
    let dt = clamp(now - this.last, 0, 0.25);
    this.last = now;
    if (dt > 0) this.fpsEma = this.fpsEma * 0.9 + (1 / dt) * 0.1;
    const st = this.st;
    if (st && !this.paused) {
      const budget = MAX_STEPS_PER_FRAME * clamp(this.speed, 1, SPEEDS.length);
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= STEP && n < budget) { step(st, STEP); this.acc -= STEP; n++; }
      if (this.acc > STEP * budget) this.acc = 0;   // 掉帧过多时丢弃积压，避免追帧雪崩
      this.handleEvents();
      if (st.over && !this.finished) this.finish();
      if (this.s.auto && !st.over) this.tryAutoWave();
    }
    this.fx.update(dt * (this.paused ? 0.4 : 1));
    if (st) this.render(dt);
    this.hooks.hud(st);
    this.hooks.fps(this.fpsEma);
  }

  render(dt) {
    const ui = {
      selected: this.sel,
      buildId: this.build ? this.build.id : (this.armed ? 'skill' : null),
      buildDef: this.build ? this.build.def : null,
      buildRange: this.ghostRange(),
      reticle: this.reticle,
      reticleOk: this.reticleOk,
      dmgNum: !!this.s.dmgNum,
    };
    this.renderer.draw(this.st, ui, dt);
  }

  ghostRange() {
    /* 预览射程：造一个不落盘的塔描述，走同一条 statsOf/rangePx 口径（含雪景 Frost 加成） */
    if (this.build) return rangePx(this.st, { def: this.build.def, lv: 1, id: this.build.id, x: 0, y: 0 });
    if (this.armed) {
      const def = SKILL_BY_ID[this.armed];
      return def && def.radius ? def.radius * TILE : 0;
    }
    return 0;
  }

  /* ---------------- 事件 → 表现 ---------------- */
  handleEvents() {
    const st = this.st, fx = this.fx, H = this.hooks;
    const evs = drainEvents(st);
    let shotsAdded = st.shots.length - this.prevShots;
    this.prevShots = st.shots.length;
    let beamsAdded = st.beams.length - this.prevBeams;
    this.prevBeams = st.beams.length;
    if (shotsAdded > 0) Sfx.play('shoot', { n: shotsAdded });
    if (beamsAdded > 0) Sfx.play('zap', { n: beamsAdded });
    let kills = 0, bigBoom = 0;
    for (const ev of evs) {
      switch (ev.k) {
        case 'wave':
          Sfx.play('wave');
          Sfx.vibrate(ev.boss ? [40, 30, 40] : 12);
          H.banner(ev.boss ? `第 ${ev.wave} 波 · BOSS 来袭` : `第 ${ev.wave} 波`, ev.boss ? '集中火力打头目' : '', ev.boss ? 1600 : 1000);
          if (ev.boss) { Sfx.play('boss'); this.flash('#ff6b6b', 0.28); }
          this.spawnRings(ev);
          break;
        case 'early':
          Sfx.play('early');
          H.toast(`提前开波 +${ev.gold} 金币`, 'gold');
          break;
        case 'clear':
          H.toast(`第 ${ev.wave} 波清空 +${ev.reward} 金币`, 'gold');
          break;
        case 'kill':
          kills++;
          if (ev.elite > 1 || ev.size > 0.8) bigBoom++;
          break;
        case 'bossdie':
          Sfx.play('bossdie');
          Sfx.vibrate([60, 40, 90]);
          fx.shake(14, 0.6);
          fx.burst(ev.x, ev.y, { n: 46, color: '#ffd27f', spd: 300, life: 0.9, size: 4 });
          fx.shards(ev.x, ev.y, { n: 20, color: '#ff9d4a' });
          fx.ring(ev.x, ev.y, { r: 190, color: '#ffd27f', life: 0.8, w: 6, fill: true });
          this.flash('#ffd27f', 0.5);
          H.banner(`${(ev.id || '').startsWith('boss') ? 'BOSS 击破' : '头目击破'}`, '战场干净了', 1300);
          break;
        case 'leak':
          Sfx.play('leak');
          Sfx.vibrate(ev.boss ? [80, 40, 80] : 30);
          fx.shake(ev.boss ? 12 : 7, 0.34);
          fx.ring(ev.x, ev.y, { r: 70, color: '#ff6b6b', life: 0.5, w: 4 });
          this.flash('#ff5a5a', ev.boss ? 0.42 : 0.22);
          H.toast(`${ev.boss ? '首领' : '敌人'}突破防线 -${ev.dmg}`, 'danger');
          break;
        case 'boom':
          Sfx.play('boom');
          fx.burst(ev.x, ev.y, { n: 16, color: ev.color || '#ff8f3c', spd: 220, life: 0.5, size: 3.4 });
          fx.ring(ev.x, ev.y, { r: (ev.r || 60), color: ev.color || '#ff8f3c', life: 0.42, w: 3, fill: true });
          break;
        case 'hit':
          fx.burst(ev.x, ev.y, { n: 4, color: ev.color || '#ffd27f', spd: 90, life: 0.24, size: 2.2 });
          break;
        case 'build':
          Sfx.play('place');
          Sfx.vibrate(8);
          fx.puff(ev.x, ev.y, { n: 9, color: '#8b97a8' });
          fx.ring(ev.x, ev.y, { r: 46, color: '#5aa9ff', life: 0.34, w: 3 });
          break;
        case 'upgrade':
          Sfx.play('upgrade');
          Sfx.vibrate(14);
          fx.puff(ev.x, ev.y, { n: 6, color: '#f2c14e' });
          fx.ring(ev.x, ev.y, { r: 58, color: '#f2c14e', life: 0.5, w: 4, fill: true });
          break;
        case 'sell':
          Sfx.play('sell');
          fx.puff(ev.x, ev.y, { n: 8, color: '#9fb6d4' });
          H.toast(`出售返还 ${ev.gold} 金币`, 'info');
          break;
        case 'meteor':
          Sfx.play('meteor');
          Sfx.vibrate([30, 20, 60]);
          fx.shake(13, 0.55);
          fx.burst(ev.x, ev.y, { n: 40, color: '#ff8f3c', spd: 320, life: 0.8, size: 4, grav: 220 });
          fx.ring(ev.x, ev.y, { r: ev.r, color: '#ff8f3c', life: 0.7, w: 6, fill: true });
          this.flash('#ff8f3c', 0.45);
          H.toast(`流星雨命中 ${ev.n} 个目标`, 'gold');
          break;
        case 'blizzard':
          Sfx.play('blizzard');
          Sfx.vibrate(18);
          fx.ring(this.baseWorld().x, this.baseWorld().y, { r: 620, color: '#7fd8ff', life: 0.9, w: 6, fill: true });
          this.flash('#7fd8ff', 0.34);
          H.toast(`冰封 ${ev.n} 个目标`, 'info');
          break;
        case 'greed':
          Sfx.play('greed');
          this.flash('#f2c14e', 0.24);
          H.toast(`金库 +${ev.gold} 金币，60 秒内收益提升`, 'gold');
          break;
        case 'phase':
          fx.ring(ev.x, ev.y, { r: 60, color: '#b07cff', life: 0.5, w: 3 });
          H.toast('首领进入相位，物理攻击无效', 'info');
          break;
        case 'charge':
          fx.ring(ev.x, ev.y, { r: 44, color: '#ff9d4a', life: 0.4, w: 3 });
          Sfx.vibrate(10);
          break;
        case 'summon':
          fx.ring(ev.x, ev.y, { r: 52, color: '#7ee787', life: 0.5, w: 3, fill: true });
          H.toast(`召出 ${ev.n} 只小怪`, 'info');
          break;
        case 'lava':
          if (!this.reduced) fx.shake(6, 0.22);
          this.flash('#ff6030', 0.2);
          break;
        case 'win':
        case 'lose':
          break;
        default:
          break;
      }
    }
    if (kills > 0) Sfx.play('kill', { n: kills });
    if (bigBoom > 0) { Sfx.play('big', { n: bigBoom }); if (!this.reduced) fx.shake(3, 0.12); }
  }

  baseWorld() {
    const b = this.st.grid.base;
    return { x: (b.x + 0.5) * TILE, y: (b.y + 0.5) * TILE };
  }

  spawnRings(ev) {
    const pts = this.level.spawnPts || this.level.path.map((l) => l[0]);
    for (const sp of pts) {
      const arr = Array.isArray(sp) ? sp : [sp.x, sp.y];
      this.fx.ring((arr[0] + 0.5) * TILE, (arr[1] + 0.5) * TILE, { r: 90, color: ev.boss ? '#ff6b6b' : '#9fb6d4', life: 0.7, w: 4, fill: true });
    }
    void ev;
  }

  flash(color, strength) {
    if (this.reduced) strength *= 0.35;
    this.fx.flashScreen(color, strength);
  }

  /* ---------------- 结算与存档 ---------------- */
  finish() {
    this.finished = true;
    const st = this.st;
    const sum = summary(st);
    const H = this.hooks;
    let meta;
    if (st.endless) {
      meta = Save.recordEndless(sum);
      meta.endless = true;
      Sfx.play(sum.win ? 'win' : 'lose');
      Sfx.vibrate(sum.win ? [20, 40, 20, 40, 80] : [140]);
      this.flash(sum.win ? '#3ddc97' : '#ff5a5a', 0.4);
    } else {
      meta = Save.recordLevel(this.levelId, sum);
      Sfx.play(sum.win ? 'win' : 'lose');
      Sfx.vibrate(sum.win ? [20, 40, 20, 40, 80] : [140]);
      this.flash(sum.win ? '#3ddc97' : '#ff5a5a', 0.4);
      if (sum.win && meta.unlockedNew && this.levelId < LAST_LEVEL) {
        H.banner(`解锁第 ${this.levelId + 1} 关`, LEVEL_BY_ID[this.levelId + 1].name, 1600);
      }
    }
    H.over(sum, meta);
    H.refresh();
  }

  /* ---------------- 建造 / 选择 / 升级 / 出售 ---------------- */
  selectTray(id) {
    const def = TOWER_BY_ID[id];
    if (!def) { this.build = null; this.hooks.traySel(null); this.hooks.buildTip(null); return; }
    const lvId = this.levelId || 1;
    if (!towersUnlocked(lvId).some((t) => t.id === id)) {
      this.hooks.toast(`${def.name} 第 ${def.unlockAt} 关解锁`, 'warn');
      Sfx.play('deny');
      return;
    }
    this.armed = null;
    this.build = { id, def, cost: costOf(def) };
    this.reticle = null;
    this.hooks.traySel(id);
    this.hooks.drawer(null);
    this.sel = null;
  }

  clearBuild() {
    this.build = null;
    this.armed = null;
    this.reticle = null;
    this.hooks.traySel(null);
    this.hooks.buildTip(null);
  }

  costOfBuild() { return this.build ? this.build.cost : 0; }

  /** 解锁 WebAudio（浏览器要求首次手势内调用）；main.js 在 pointerdown 里驱动 */
  unlockAudio() { Sfx.unlock(); }

  /** 手动推进若干秒（无 rAF 时可用：自检 / 自动化脚本 / 逐帧调试） */
  stepOnce(seconds) {
    const st = this.st;
    if (!st) return false;
    const budget = MAX_STEPS_PER_FRAME * clamp(this.speed, 1, SPEEDS[SPEEDS.length - 1]);
    let acc = Math.max(0, seconds), n = 0;
    while (acc >= STEP && n < budget) { step(st, STEP); acc -= STEP; n++; }
    this.handleEvents();
    if (st.over && !this.finished) this.finish();
    return true;
  }

  placeAt(tx, ty) {
    const st = this.st;
    if (!st || st.over || !this.build) return false;
    const chk = canBuild(st, this.build.id, tx, ty);
    if (!chk.ok) {
      this.hooks.toast(chk.reason, 'warn');
      Sfx.play('deny');
      Sfx.vibrate(40);
      return false;
    }
    const r = placeTower(st, this.build.id, tx, ty);
    if (!r.ok) { this.hooks.toast(r.reason || '建造失败', 'warn'); Sfx.play('deny'); return false; }
    this.sel = r.tower;
    if (!this.s.keep) { this.build = null; this.reticle = null; this.hooks.traySel(null); }
    this.hooks.buildTip(this.build ? this.build.def : null, this.costOfBuild(), true);
    this.hooks.refresh();
    return true;
  }

  selectTower(t) {
    this.sel = t || null;
    this.hooks.drawer(t || null);
    if (!t) this.sel = null;
  }

  upgradeSelected() {
    const t = this.sel;
    if (!t) { this.hooks.toast('先点一座塔再升级', 'warn'); return; }
    const r = upgradeTower(this.st, t);
    if (!r.ok) { this.hooks.toast(r.reason, 'warn'); Sfx.play('deny'); Sfx.vibrate(40); return; }
    this.hooks.refresh();
    this.hooks.drawer(t);
  }

  sellSelected() {
    const t = this.sel;
    if (!t) return;
    const r = sellTower(this.st, t);
    if (!r.ok) { this.hooks.toast('出售失败', 'warn'); return; }
    this.sel = null;
    this.hooks.closeDrawer();
    this.hooks.refresh();
  }

  setTargetMode(mode) {
    const t = this.sel;
    if (!t) return;
    t.targetMode = mode;
    Sfx.play('click');
    this.hooks.drawer(t);
  }

  /* ---------------- 技能 ---------------- */
  fireSkill(id, tx, ty) {
    const st = this.st;
    if (!st || st.over) return;
    const def = SKILL_BY_ID[id];
    if (!def) return;
    const wx = tx == null ? null : (tx + 0.5) * TILE;
    const wy = ty == null ? null : (ty + 0.5) * TILE;
    const r = useSkill(st, id, wx, wy);
    if (!r.ok) {
      this.hooks.toast(r.reason || '技能未就绪', 'warn');
      Sfx.play('deny');
      Sfx.vibrate(40);
      return;
    }
    if (r.needTarget) {
      this.armed = id;
      this.build = null;
      this.hooks.traySel(null);
      this.hooks.buildTip(def, 0, true, `点地图选择「${def.name}」落点`);
      Sfx.play('click');
      return;
    }
    this.armed = null;
    this.hooks.refresh();
  }

  cancelArmed() {
    if (this.armed) { this.armed = null; this.hooks.buildTip(null); return true; }
    if (this.build) { this.clearBuild(); return true; }
    if (this.sel) { this.selectTower(null); return true; }
    return false;
  }

  /** 手动开波（提前开波给奖励）；返回引擎结果，便于自动化与 UI 判断 */
  nextWave() {
    const st = this.st;
    if (!st || st.over) return { ok: false, reason: '当前不可开波' };
    const r = startWave(st, true);
    if (!r.ok) Sfx.play('deny');
    this.hooks.refresh();
    return r;
  }

  tryAutoWave() {
    const st = this.st;
    if (st.waveActive || st.interT > 2.2) return;
    if (st.enemies.length > 0) return;
    startWave(st, true);
  }

  /* ---------------- 输入回调 ---------------- */
  onTap(tx, ty, t, p) {
    if (!this.st || this.st.over) return;
    if (!t.inb) return;
    if (this.armed) {
      this.fireSkill(this.armed, tx, ty);
      this.hooks.buildTip(null);
      return;
    }
    if (this.build) {
      this.placeAt(tx, ty);
      return;
    }
    const t2 = towerAt(this.st, tx, ty);
    if (t2) { this.selectTower(t2); Sfx.play('click'); }
    else this.selectTower(null);
  }

  onDragStart(t, p) {
    if (!this.st || this.st.over) return;
    if (!this.build && !this.armed) { this.reticle = null; return; }
    this.setReticleFromScreen(p, t.type);
    this.showTip();
  }

  onDragMove(t, p, dx, dy) {
    if (!this.st || this.st.over) return;
    if (!this.build && !this.armed) return;
    this.setReticleFromScreen(p, t.type);
    this.showTip();
    void dx; void dy;
  }

  onDragEnd(t, p, isTap) {
    if (!this.st || this.st.over) return;
    if (isTap) return;                      // 点按交给 onTap，避免重复建造
    if (!this.reticle) return;
    if (this.armed) { this.fireSkill(this.armed, this.reticle.tx, this.reticle.ty); this.hooks.buildTip(null); return; }
    if (this.build) this.placeAt(this.reticle.tx, this.reticle.ty);
  }

  onLongPress(t, p) {
    if (!this.st || this.st.over || !t.inb) return;
    if (this.build) {
      this.setReticleFromScreen(p, t.type);
      const r = this.reticle || { tx: t.tx, ty: t.ty };
      this.placeAt(r.tx, r.ty);
      Sfx.vibrate(18);
      return;
    }
    const tw = towerAt(this.st, t.tx, t.ty);
    if (tw) { this.selectTower(tw); Sfx.play('click'); Sfx.vibrate(14); }
  }

  /** 建造准星：触屏把落点抬到指尖上方，手指不再挡住格子；鼠标则所见即所得 */
  setReticleFromScreen(p, type) {
    const lift = type === 'mouse' ? 0 : (this.reduced ? RETICLE_LIFT * 0.6 : RETICLE_LIFT);
    const w = this.renderer.screenToWorld(p.x, p.y - lift);
    const tx = clamp(Math.floor(w.x / TILE), 0, GRID_W - 1);
    const ty = clamp(Math.floor(w.y / TILE), 0, GRID_H - 1);
    this.reticle = { tx, ty, wx: (tx + 0.5) * TILE, wy: (ty + 0.5) * TILE };
    this.checkReticle();
  }

  updateReticleScreen() {
    if (!this.reticle) return;
    this.reticle.wx = (this.reticle.tx + 0.5) * TILE;
    this.reticle.wy = (this.reticle.ty + 0.5) * TILE;
    this.checkReticle();
  }

  checkReticle() {
    const r = this.reticle;
    if (!r || !this.st) { this.reticleOk = false; return; }
    if (this.armed) { this.reticleOk = true; return; }
    if (!this.build) { this.reticleOk = false; return; }
    const chk = canBuild(this.st, this.build.id, r.tx, r.ty);
    this.reticleOk = !!chk.ok;
    this.reticleReason = chk.ok ? '' : chk.reason;
  }

  showTip() {
    const def = this.build ? this.build.def : SKILL_BY_ID[this.armed];
    if (!def) return;
    const ok = this.reticleOk;
    this.hooks.buildTip(def, this.costOfBuild(), ok, ok ? '' : (this.reticleReason || ''));
  }

  onKey(k) {
    if (!this.st) return;
    if (k === 'space') { this.nextWave(); return; }
    if (k === 'escape') { if (!this.cancelArmed()) this.setPaused(true); return; }
    if (k === 'fit') { this.renderer.fitView(this.st, false); return; }
    if (k === 'sell') { this.sellSelected(); return; }
    if (k === 'upgrade') { this.upgradeSelected(); return; }
    if (k === 'skill1') { this.fireSkill(SKILLS[0].id); return; }
    if (k === 'skill2') { this.fireSkill(SKILLS[1].id); return; }
    if (k === 'skill3') { this.fireSkill(SKILLS[2].id); return; }
    if (/^num[1-9]$/.test(k)) {
      const idx = Number(k.slice(3)) - 1;
      const list = towersUnlocked(this.levelId || 1);
      const def = list[idx];
      if (def) this.selectTray(def.id);
      return;
    }
  }

  /* ---------------- 相机按钮 ---------------- */
  camFit() { this.renderer.fitView(this.st, false); }
  camIn() { this.renderer.zoomAt(this.renderer.cssW / 2, this.renderer.cssH / 2, 1.25); }
  camOut() { this.renderer.zoomAt(this.renderer.cssW / 2, this.renderer.cssH / 2, 1 / 1.25); }

  /* ---------------- 给 UI 层的只读数据 ---------------- */
  get preview() { return this.st ? wavePreview(this.st) : []; }
  get state() { return this.st; }
  get save() { return this.s; }
  summary() { return this.st ? summary(this.st) : null; }
  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.input.destroy();
  }
}

export { LEVELS, TOWERS, SKILLS, SPEEDS };
