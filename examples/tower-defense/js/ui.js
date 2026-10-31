/* UI 层：覆盖屏 / 建造塔盘 / 塔详情抽屉 / HUD / 图鉴。
 * 约定：只读引擎状态并写 DOM，不产生玩法；展示数值一律走 towers.js 的平衡后口径。
 * 移动端：HUD 在画布内、塔盘在底部拇指热区、抽屉自下往上滑出；横屏由 CSS 换到右栏。
 * 性能：每帧的 hud() 全部走「值变化才写 DOM」缓存，塔卡用 Map 缓存引用与定义。 */
import {
  SKILLS, TARGET_MODES, targetLabel, DMG, SPEEDS, FX_LEVELS, EARLY_BONUS_PER_SEC, WAVE_GAP,
  fmt, mmss,
} from './config.js';
import { LEVELS, LAST_LEVEL } from './levels.js';
import {
  TOWERS, costOf, upCostOf, isMaxLevel, sellValue, dpsOf, rangeOf, towerLv, towersUnlocked, investedGold,
} from './towers.js';
import { ENEMIES, ELITE, STATUS_META } from './enemies.js';
import { statsOf } from './engine.js';
import * as Save from './save.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const mk = (cls, html) => { const n = document.createElement('div'); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const starStr = (n) => '★★★'.repeat(Math.max(0, Math.min(3, n))) + '☆☆☆'.repeat(3 - Math.max(0, Math.min(3, n)));
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const ENV_NAME = { night: '夜幕', sandstorm: '沙暴', lava: '熔岩', snow: '风雪', swamp: '瘴沼' };
const WEATHER_NAME = { none: '', rain: '雨', fog: '雾', snow: '雪', sand: '沙尘', ember: '火星', spore: '孢子' };
const MECH_NAME = {
  flying: '飞行', stealth: '潜行', shieldPhase: '相位护盾', shieldRegen: '护盾再生', charge: '冲锋',
  summon: '召唤', splitOnDeath: '死亡分裂', selfDestruct: '自爆', immuneSlow: '免疫减速', mech: '机械',
  healAura: '治疗光环', speedAura: '加速光环', boss: '首领',
};
const IDS = ['h-hp', 'h-gold', 'h-wave', 'h-score', 'wave-rail', 'wave-fill', 'wave-tag',
  'nw-icons', 'btn-speed', 'buildtip', 'bt-name', 'bt-cost', 'bt-cancel', 'banner', 'toast', 'fps',
  'overlay', 'tray-list', 'btn-wave', 'wv-t', 'btn-keep', 'btn-sound', 'btn-fx', 'btn-help', 'btn-pause',
  'drawer', 'dw-em', 'dw-name', 'dw-lv', 'dw-dmg', 'dw-rng', 'dw-rate', 'dw-dps', 'dw-note',
  'dw-up', 'dw-up-cost', 'dw-target', 'dw-sell', 'dw-sell-cost', 'dw-close', 'lvgrid',
  'm-play-no', 'm-stars', 'm-starsmax', 'stars', 'hint'];

export class UI {
  constructor(game) {
    this.g = game;
    this.n = {};
    for (const id of IDS) this.n[id] = $(id);
    this.c = {};                 // HUD 缓存：值不变不写 DOM
    this.cards = new Map();      // 塔卡 id → { card, def, cost, nm, cs }
    this.screen = null;
    this.sellArmed = 0;
    this.resetArmed = 0;
    this.waveTotal = 0;
    this.prevActive = false;
    this.buildTray();
    this.buildCodex();
    this.bind();
    this.n['fps'].classList.toggle('on', typeof location !== 'undefined' && /[?&]fps\b/.test(location.search || ''));
    this.n['m-starsmax'].textContent = String(LAST_LEVEL * 3);
  }

  /* ============ 与 game.js 的接口 ============ */
  get hooks() {
    return {
      hud: (st) => this.hud(st),
      refresh: () => this.refresh(),
      traySel: (id) => this.traySel(id),
      drawer: (t) => this.drawer(t),
      closeDrawer: () => this.closeDrawer(),
      toast: (m, k) => this.toast(m, k),
      banner: (t, s, ms) => this.banner(t, s, ms),
      buildTip: (d, c, ok, txt) => this.buildTip(d, c, ok, txt),
      speedChange: (v) => this.speedChange(v),
      pauseChange: (p, auto) => this.pauseChange(p, auto),
      settings: (s) => this.syncSettings(s),
      fps: (v) => this.fps(v),
      over: (sum, meta) => this.over(sum, meta),
    };
  }

  bind() {
    const on = (id, fn) => { const n = $(id); if (n) n.addEventListener('click', fn); };
    on('btn-sound', () => { const v = !this.g.save.sound; this.g.setSetting('sound', v); });
    on('btn-fx', () => this.g.setSetting('fx', (this.g.save.fx + 1) % FX_LEVELS.length));
    on('btn-help', () => this.showScreen('help'));
    on('btn-pause', () => this.togglePause());
    on('btn-wave', () => this.g.nextWave());
    on('btn-keep', () => this.g.setSetting('keep', !this.g.save.keep));
    on('btn-speed', () => this.g.setSpeed(SPEEDS[(SPEEDS.indexOf(this.g.speed) + 1) % SPEEDS.length]));
    on('bt-cancel', () => this.g.clearBuild());
    on('dw-close', () => this.g.selectTower(null));
    on('dw-up', () => this.g.upgradeSelected());
    on('dw-target', () => this.cycleTarget());
    on('dw-sell', () => this.armSell());
    $$('[data-cam]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.cam;
      if (k === 'fit') this.g.camFit(); else if (k === 'in') this.g.camIn(); else this.g.camOut();
    }));
    $$('#skills .skill').forEach((b) => b.addEventListener('click', () => this.g.fireSkill(b.dataset.skill)));
    on('m-play', () => this.g.startLevel(Math.min(this.g.save.unlocked, LAST_LEVEL)));
    on('m-levels', () => { this.refresh(); this.showScreen('levels'); });
    on('m-endless', () => this.g.startLevel(0));
    on('m-help2', () => this.showScreen('help'));
    on('m-settings', () => this.showScreen('settings'));
    on('l-back', () => this.showScreen('menu'));
    on('l-reset', () => this.armReset());
    on('h-close', () => this.backFromModal());
    on('s-close', () => this.backFromModal());
    on('p-resume', () => { this.hideOverlay(); this.g.setPaused(false); });
    on('p-restart', () => { this.hideOverlay(); this.g.restart(); });
    on('p-settings', () => this.showScreen('settings'));
    on('p-menu', () => { this.refresh(); this.showScreen('levels'); });
    on('w-next', () => this.nextLevelAction());
    on('w-replay', () => { this.hideOverlay(); this.g.restart(); });
    on('w-menu', () => { this.refresh(); this.showScreen('levels'); });
    on('d-retry', () => { this.hideOverlay(); this.g.restart(); });
    on('d-menu', () => { this.refresh(); this.showScreen('levels'); });
    on('e-retry', () => { this.hideOverlay(); this.g.startLevel(0); });
    on('e-menu', () => { this.refresh(); this.showScreen('levels'); });
    $$('.tgl[data-set]').forEach((b) => b.addEventListener('click', () => this.g.setSetting(b.dataset.set, !this.g.save[b.dataset.set])));
    $$('.seg[data-set]').forEach((seg) => $$('.segb', seg).forEach((b) => b.addEventListener('click', () => {
      const v = Number(b.dataset.v);
      if (seg.dataset.set === 'speed') this.g.setSetting('speed', Math.max(0, SPEEDS.indexOf(v)));
      else this.g.setSetting(seg.dataset.set, v);
    })));
    $$('#help-tabs .tab').forEach((b) => b.addEventListener('click', () => {
      $$('#help-tabs .tab').forEach((x) => x.classList.toggle('on', x === b));
      $$('.tabpane').forEach((p) => p.classList.toggle('show', p.dataset.pane === b.dataset.tab));
    }));
    window.addEventListener('keydown', (e) => {
      const k = (e.key || '').toLowerCase();
      if (k === 'p') { this.togglePause(); return; }
      if (k === '?' || k === '/') { this.showScreen('help'); return; }
      if (k === 'escape' && this.screen) { this.backFromModal(); return; }
      if ((k === 'enter' || k === ' ') && this.screen === 'menu') {
        e.preventDefault();
        this.g.startLevel(Math.min(this.g.save.unlocked, LAST_LEVEL));
      }
    });
  }

  /* ============ 覆盖屏 ============ */
  showScreen(name) {
    this.screen = name;
    this.n['overlay'].classList.add('show');
    $$('.screen').forEach((s) => s.classList.toggle('show', s.dataset.screen === name));
    if (name === 'levels') this.buildLevelGrid();
    if (name === 'menu') this.refresh();
    if (name === 'pause') this.g.setPaused(true);
  }

  hideOverlay() {
    this.screen = null;
    this.n['overlay'].classList.remove('show');
    $$('.screen').forEach((s) => s.classList.remove('show'));
  }

  togglePause() {
    if (this.screen === 'pause') { this.hideOverlay(); this.g.setPaused(false); }
    else if (!this.screen && this.g.st && !this.g.st.over) this.showScreen('pause');
  }

  backFromModal() {
    const resumable = this.g.st && !this.g.st.over;
    if (this.screen === 'settings' && this.g.paused) { this.showScreen('pause'); return; }
    this.hideOverlay();
    if (resumable && this.g.paused) this.g.setPaused(false);
  }

  pauseChange(paused, autoHidden) {
    if (paused) {
      if (!this.screen) this.showScreen('pause');
      if (autoHidden) this.toast('切到后台，已自动暂停', 'info');
    } else if (this.screen === 'pause') this.hideOverlay();
  }

  nextLevelAction() {
    if (this.g.levelId >= LAST_LEVEL) { this.refresh(); this.showScreen('levels'); return; }
    this.hideOverlay();
    this.g.startLevel(this.g.levelId + 1);
  }

  /* ============ 建造塔盘 ============ */
  buildTray() {
    const list = this.n['tray-list'];
    list.innerHTML = '';
    this.cards.clear();
    for (const def of TOWERS) {
      const cost = costOf(def);
      const card = document.createElement('button');
      card.className = 'tcard';
      card.dataset.id = def.id;
      card.setAttribute('aria-label', `${def.name}，${def.role}，造价 ${cost} 金币`);
      card.innerHTML = `<i class="em">${def.icon}</i><span class="nm">${def.name}</span><span class="cs">💰${cost}</span>`;
      card.addEventListener('click', () => {
        if (this.g.build && this.g.build.id === def.id) this.g.clearBuild();
        else this.g.selectTray(def.id);
      });
      list.appendChild(card);
      this.cards.set(def.id, { card, def, cost });
    }
  }

  traySel(id) {
    for (const [tid, entry] of this.cards) entry.card.classList.toggle('sel', tid === id);
  }

  refresh() {
    const st = this.g.st, s = this.g.save;
    const lvId = this.g.level ? this.g.level.id : Math.max(1, s.unlocked);
    const open = towersUnlocked(lvId);
    const gold = st ? st.gold : 0;
    for (const [tid, entry] of this.cards) {
      const isOpen = open.some((t) => t.id === tid);
      entry.card.hidden = !isOpen;
      entry.card.classList.toggle('poor', isOpen && gold < entry.cost);
    }
    this.n['m-play-no'].textContent = String(Math.min(s.unlocked, LAST_LEVEL));
    this.n['m-stars'].textContent = String(Save.totalStars());
    this.n['btn-keep'].classList.toggle('on', !!s.keep);
    this.n['btn-sound'].textContent = s.sound ? '🔊' : '🔇';
    this.n['btn-sound'].classList.toggle('off', !s.sound);
    this.syncSettings(s);
    this.speedChange(this.g.speed);
    if (this.g.sel) this.drawer(this.g.sel);
  }

  /* ============ 关卡选择 ============ */
  buildLevelGrid() {
    const grid = this.n['lvgrid'];
    grid.innerHTML = '';
    const s = this.g.save;
    for (const lv of LEVELS) {
      const locked = !Save.isUnlocked(lv.id);
      const stars = Save.starsOfLevel(lv.id);
      const best = Save.bestOfLevel(lv.id);
      const tags = [];
      if (lv.build === 'pads') tags.push('石台');
      if (lv.maxTowers) tags.push(`塔上限 ${lv.maxTowers}`);
      if (lv.env !== 'clear') tags.push(ENV_NAME[lv.env] || lv.env);
      if (lv.weather !== 'none') tags.push(WEATHER_NAME[lv.weather] || lv.weather);
      const card = document.createElement('button');
      card.className = 'card' + (locked ? ' locked' : '');
      card.innerHTML = `<div class="no">第 ${String(lv.id).padStart(2, '0')} 关 · ${lv.waves.length} 波`
        + `<span class="tagline">${lv.bossWave ? 'BOSS' : (lv.maxTowers ? '限量' : '')}</span></div>`
        + `<div class="nm">${lv.name}</div>`
        + `<div class="ds">${lv.desc}</div>`
        + `<div class="st">${locked ? '🔒 先通上一关' : starStr(stars)}</div>`
        + `<div class="bs">${best ? `最高分 ${fmt(best)}` : '未通关'}${tags.length ? ' · ' + tags.slice(0, 2).join(' · ') : ''}</div>`;
      if (!locked) card.addEventListener('click', () => { this.hideOverlay(); this.g.startLevel(lv.id); });
      else card.addEventListener('click', () => this.toast(`第 ${lv.id - 1} 关拿到 1 星后解锁`, 'warn'));
      grid.appendChild(card);
    }
    const e = document.createElement('button');
    e.className = 'card end';
    e.innerHTML = `<div class="no">无尽模式</div><span class="tagline">∞</span>`
      + `<div class="nm">波次永不停</div>`
      + `<div class="ds">每 5 波一个 BOSS，血量与护甲逐波成长，只冲自己的纪录。</div>`
      + `<div class="st">${s.endless.bestWave ? `最佳 第 ${s.endless.bestWave} 波` : '尚未挑战'}</div>`
      + `<div class="bs">${s.endless.bestScore ? `最高分 ${fmt(s.endless.bestScore)}` : '死亡即结算'}</div>`;
    e.addEventListener('click', () => { this.hideOverlay(); this.g.startLevel(0); });
    grid.appendChild(e);
  }

  armReset() {
    const btn = $('l-reset');
    if (this.resetArmed && performance.now() - this.resetArmed < 4000) {
      Save.reset();
      this.g.s = Save.load();
      this.g.applySettings();
      this.resetArmed = 0;
      btn.textContent = '清空存档';
      this.buildLevelGrid();
      this.refresh();
      this.showScreen('menu');
      this.toast('存档已清空，进度回到第 1 关', 'warn');
      return;
    }
    this.resetArmed = performance.now();
    btn.textContent = '再点一次确认清空';
    btn.classList.add('shake');
    setTimeout(() => { btn.textContent = '清空存档'; btn.classList.remove('shake'); this.resetArmed = 0; }, 4000);
  }

  /* ============ 图鉴（静态生成一次） ============ */
  buildCodex() {
    const pane = (name) => document.querySelector(`.tabpane[data-pane="${name}"]`);
    const tPane = pane('towers'), ePane = pane('enemies'), sPane = pane('sys'), oPane = pane('ops');
    if (!tPane || !ePane || !sPane || !oPane || tPane.dataset.built) return;
    tPane.dataset.built = '1';
    oPane.innerHTML = `<div class="helpgrid">${[
      helpBox('🎯 三步开局', [
        '<b>点底部塔卡</b>选中要建的塔，射程圈会先显示',
        '<b>点格子</b>放下；也可以<b>按住拖到</b>满意位置再松手',
        '底部 <b>🔁 连放</b>开着时放完不退出，可以一路点着建',
      ]),
      helpBox('👆 手指不挡视线', [
        '触屏落点自动<b>抬到指尖上方 36px</b>，看得见再松手',
        '<b>长按</b>约 0.4 秒 = 直接在点中的格子快速建',
        '塔盘可<b>左右滑动</b>；横屏自动变成右侧竖栏',
      ]),
      helpBox('🗺 看地图', [
        '<b>双指捏合</b>缩放，<b>双指拖动</b>平移，单指拖动也平移',
        '左下 <b>🧭</b> 一键看全图，<b>＋／－</b> 手动缩放',
        '放大后屏幕外的<b>出怪口与基地</b>会显示方向箭头',
      ]),
      helpBox('🗼 管理防御塔', [
        '<b>点一座塔</b>弹出抽屉：升级 / 目标优先级 / 出售',
        '出售返还<b>已投入金币的 70%</b>，点「卖」后再点一次确认',
        '目标优先级 <b>最先 / 最后 / 最强 / 最弱 / 最近</b>，BOSS 波切「最强」',
      ]),
      helpBox('⚡ 主动技能', SKILLS.map((s) =>
        `<b>${s.icon} ${s.name}</b>（冷却 ${s.cd}s，键 ${s.key}）：${s.desc}`)),
      helpBox('🌊 波次与金币', [
        '底部 <b>🌊 开波</b>提前放怪，奖励 = 剩余等待秒 × ' + EARLY_BONUS_PER_SEC,
        '每波清空有<b>过关奖励</b>；击杀掉金币',
        '通关按表现评 <b>1~3 星</b>，拿到 1 星即解锁下一关',
      ]),
      helpBox('⌨️ 键盘（桌面）', [
        '<b>1-9</b> 选塔 · <b>点击</b>放置 · <b>U</b> 升级 · <b>X</b> 出售',
        '<b>空格</b> 开波 · <b>P</b> 暂停 · <b>Esc</b> 取消 / 返回 · <b>?</b> 帮助',
        SKILLS.map((s, i) => `<b>${s.key}</b> ${s.name}`).join(' · ') + '（W 已用于平移，故技能绑 J/K/L）',
        '<b>方向键 / WASD</b> 平移 · <b>F</b> 看全图 · <b>+ / −</b> 缩放',
      ]),
      helpBox('🌦 关卡机制', [
        '<b>石台</b>只能建在刻好的石台上；<b>限量</b>关有塔数上限',
        '<b>沙暴</b>间歇 -15% 射程；<b>熔岩</b>每 6 秒灼烧地面敌人；<b>夜幕</b>视野变暗',
        '<b>飞行</b>走直线；<b>潜行</b>会隐身；<b>护盾</b>会再生；<b>精英 / 精锐</b>血量翻倍',
      ]),
    ].join('')}</div>`;

    tPane.innerHTML = `<div class="codex">` + TOWERS.map((t) => {
      const s1 = towerLv(t, 1), s3 = towerLv(t, 3);
      const d = DMG[t.dmgType] || DMG.physical;
      return `<div class="cdx">
        <div class="hd"><span class="swatch" style="background:${t.color}"></span><span class="em">${t.icon}</span>
          <div><div class="nm">${t.name}</div>
          <div class="role">${t.role} · ${d.icon}${d.name} · 第 ${t.unlockAt} 关解锁</div></div></div>
        <div class="st"><span>造价 <b>${costOf(t)}</b></span>
          <span>DPS <b>${fmt(dpsOf(t, s1))}</b>→<b>${fmt(dpsOf(t, s3))}</b></span>
          <span>射程 <b>${(rangeOf(s1) || 0).toFixed(1)}</b>→<b>${(rangeOf(s3) || 0).toFixed(1)}</b></span>
          <span>射速 <b>${s1.rate}/s</b></span></div>
        <div class="de">${(t.tags || []).map((x) => `#${x}`).join(' ')}<br>${(t.notes || [])[0] || ''}</div>
      </div>`;
    }).join('') + `</div>
      <p class="lead sm">升级费用逐阶上涨，能升时按钮会变绿；出售返还投入的 ${Math.round(0.7 * 100)}%。
      展示 DPS 为纸面折算（含溅射 / 链式 / 持续伤害的粗略权重），受敌人护甲与魔抗影响。</p>`;

    ePane.innerHTML = `<div class="codex">` + ENEMIES.map((e) => {
      const mk2 = (e.mechanic || []).filter((m) => m !== 'boss').map((m) => MECH_NAME[m] || m);
      return `<div class="cdx">
        <div class="hd"><span class="swatch" style="background:${e.color}"></span><span class="em">${e.icon}</span>
          <div><div class="nm">${e.name}${e.boss ? ' · BOSS' : ''}</div>
          <div class="role">HP ${fmt(e.hp)} · 速度 ${e.speed} · 护甲 ${e.armor} · 魔抗 ${e.mr}%</div></div></div>
        <div class="st"><span>赏金 <b>${e.bounty}</b></span><span>漏怪 <b>-${e.leak}</b></span>
          ${mk2.length ? `<span>词条 <b>${mk2.join(' / ')}</b></span>` : ''}</div>
        <div class="de">${e.desc}</div>
      </div>`;
    }).join('') + `</div>
      <p class="lead sm">数值为基准值；波次越靠后血量越高、护甲缓慢成长。
      ${ELITE[1].name}（×${ELITE[1].hp} 血、+${ELITE[1].armor} 甲）与 ${ELITE[2].name}（×${ELITE[2].hp}、+${ELITE[2].armor} 甲）是压力来源。</p>`;

    sPane.innerHTML = `<div class="helpgrid">
      <div class="helpbox"><h3>🩸 伤害类型</h3><ul>${Object.keys(DMG)
        .map((k) => `<li><span>${DMG[k].icon}</span><b>${DMG[k].name}</b>${DMG[k].text}</li>`).join('')}</ul></div>
      <div class="helpbox"><h3>🧿 敌方状态</h3><ul>${Object.keys(STATUS_META)
        .filter((k) => k !== 'stealth')
        .map((k) => `<li><span>${STATUS_META[k].icon}</span><b>${STATUS_META[k].name}</b></li>`).join('')}</ul></div>
      <div class="helpbox"><h3>🎯 目标优先级</h3><ul>${TARGET_MODES
        .map((m) => `<li><span>${m.icon}</span><b>${m.name}</b>${m.tip}</li>`).join('')}</ul></div>
      ${helpBox('💾 存档', [
        '进度存在<b>本机浏览器 localStorage</b>，换浏览器需重打',
        '只存<b>关卡星数 / 解锁 / 无尽最佳 / 设置</b>，不存局内阵容',
        '隐私模式禁用存储时自动退化为<b>本局内存档</b>，不报错',
      ])}
      ${helpBox('⚙ 性能与适配', [
        `特效档位粒子上限：<b>流畅 ${FX_LEVELS[0].parts} / 均衡 ${FX_LEVELS[1].parts} / 华丽 ${FX_LEVELS[2].parts}</b>，低配选流畅`,
        '<b>×1 / ×2 / ×3</b> 倍速走固定步长逻辑，快进不会让弹道与判定失真',
        '竖屏优先；<b>横屏</b>自动切换右侧塔栏与右抽屉，适配安全区与刘海屏',
        '零依赖零网络：图形与音效全部代码生成，URL 加 <b>?fps=1</b> 显示帧率',
      ])}
      ${helpBox('🧮 结算与星级', [
        '得分 = 击杀赏金 + 波次奖励 + 剩余基地；<b>提前开波</b>与<b>富矿</b>抬高金币与分数',
        '星级阈值由关卡表自动推导：约 55% / 76% / 92% 的理论血量总量',
        '无尽模式不计星，只记<b>最高波次与分数</b>',
      ])}
    </div>`;
  }

  /* ============ 塔详情抽屉 ============ */
  drawer(t) {
    const n = this.n, g = this.g;
    if (!t || !g.st) { this.closeDrawer(); return; }
    const def = t.def, stats = statsOf(g.st, t);
    const maxed = isMaxLevel(def, t.lv);
    const sell = sellValue(def, t.lv);
    n['dw-em'].textContent = def.icon;
    n['dw-name'].textContent = def.name;
    n['dw-lv'].textContent = `Lv.${t.lv}${maxed ? ' · 满级' : ''} · ${def.role}`;
    n['dw-dmg'].textContent = fmt(Math.round(stats.dmg || 0));
    n['dw-rng'].textContent = (rangeOf(stats) || 0).toFixed(1);
    n['dw-rate'].textContent = (stats.rate || 0).toFixed(2);
    n['dw-dps'].textContent = fmt(dpsOf(def, stats));
    const notes = def.notes || [];
    const nextTxt = maxed ? ''
      : ` <span style="color:#3ddc97">→ 升级后 DPS ${fmt(dpsOf(def, statsOf(g.st, { def, lv: t.lv + 1, id: def.id, x: 0, y: 0 })))}</span>`;
    n['dw-note'].innerHTML = `${notes[Math.min(t.lv, notes.length) - 1] || def.desc || ''}<br>`
      + `<span style="color:#93a0b8">目标 ${targetLabel(t.targetMode)} · 击杀 ${t.kills || 0} · 累计伤害 ${fmt(Math.round(t.dmgDone || 0))}`
      + ` · 投入 ${fmt(investedGold(def, t.lv))} · 卖 ${fmt(sell)}${nextTxt}</span>`;
    const cost = upCostOf(def, t.lv);
    n['dw-up'].disabled = maxed;
    n['dw-up'].firstChild.textContent = maxed ? '⬆ 已满级 ' : '⬆ 升级 ';
    n['dw-up-cost'].textContent = maxed ? '' : `💰${cost}`;
    n['dw-up'].classList.toggle('up-max', !maxed && g.st.gold >= cost);
    n['dw-target'].textContent = `🎯 ${targetLabel(t.targetMode)}`;
    n['dw-sell-cost'].textContent = String(sell);
    this.sellArmed = 0;
    n['drawer'].classList.add('show');
  }

  closeDrawer() {
    this.n['drawer'].classList.remove('show');
    this.sellArmed = 0;
  }

  cycleTarget() {
    const t = this.g.sel;
    if (!t) return;
    const i = TARGET_MODES.findIndex((m) => m.id === t.targetMode);
    const m = TARGET_MODES[(i + 1) % TARGET_MODES.length];
    this.g.setTargetMode(m.id);
    this.toast(`${m.icon} 目标：${m.name} — ${m.tip}`, 'info');
  }

  armSell() {
    const n = this.n;
    if (this.sellArmed && performance.now() - this.sellArmed < 3000) {
      this.sellArmed = 0;
      this.g.sellSelected();
      return;
    }
    this.sellArmed = performance.now();
    n['dw-sell'].classList.add('shake');
    n['dw-sell-cost'].textContent = '确认?';
    setTimeout(() => {
      n['dw-sell'].classList.remove('shake');
      if (this.sellArmed && this.g.sel) this.drawer(this.g.sel);
      this.sellArmed = 0;
    }, 3000);
  }

  /* ============ HUD：每帧调用，只写有变化的值 ============ */
  hud(st) {
    const n = this.n, c = this.c;
    if (!st) return;
    const alive = countAlive(st);
    const hpTxt = `${Math.max(0, Math.ceil(st.hp))}/${st.hpMax}`;
    if (c.hp !== hpTxt) {
      c.hp = hpTxt;
      n['h-hp'].textContent = hpTxt;
      const low = st.hp <= st.hpMax * 0.3;
      n['h-hp'].classList.toggle('low', low);
      n['wave-rail'].classList.toggle('danger', low);
    }
    if (c.gold !== st.gold) {
      const up = c.gold != null && st.gold > c.gold;
      c.gold = st.gold;
      n['h-gold'].textContent = fmt(st.gold);
      if (up) bump(n['h-gold']);
      for (const entry of this.cards.values()) {
        if (!entry.card.hidden) entry.card.classList.toggle('poor', st.gold < entry.cost);
      }
      if (this.g.sel) {
        const cost = upCostOf(this.g.sel.def, this.g.sel.lv);
        n['dw-up'].classList.toggle('up-max', !isMaxLevel(this.g.sel.def, this.g.sel.lv) && st.gold >= cost);
      }
    }
    const wvTxt = st.endless ? `${st.wave} / ∞` : `${st.wave} / ${st.level.waves.length}`;
    if (c.wv !== wvTxt) { c.wv = wvTxt; n['h-wave'].textContent = wvTxt; }
    if (c.score !== st.score) { c.score = st.score; n['h-score'].textContent = fmt(st.score); }
    this.waveRail(st, alive);
    this.skillsHud(st);
    this.waveBtn(st, alive);
  }

  waveRail(st, alive) {
    const n = this.n, c = this.c;
    if (st.waveActive && !this.prevActive) this.waveTotal = st.queue.length;   // 开波瞬间记录总量
    this.prevActive = st.waveActive;
    let pct, tag;
    if (st.waveActive) {
      const left = alive + st.queue.length;
      pct = clamp01((this.waveTotal - left) / Math.max(1, this.waveTotal));
      tag = `第 ${st.wave} 波 · 剩 ${left}`;
    } else if (st.waveIdx >= st.level.waves.length && !st.endless) {
      pct = 1; tag = '全部波次完成';
    } else {
      const gap = st.waveIdx === 0 ? 14 : WAVE_GAP;
      pct = clamp01(1 - st.interT / gap);
      tag = `第 ${st.waveIdx + 1} 波 · ${Math.ceil(Math.max(0, st.interT))}s 后来`;
    }
    const p = Math.round(pct * 100);
    if (c.pct !== p) { c.pct = p; n['wave-fill'].style.width = p + '%'; }
    if (c.tag !== tag) { c.tag = tag; n['wave-tag'].textContent = tag; }
  }

  skillsHud(st) {
    $$('#skills .skill').forEach((b) => {
      const id = b.dataset.skill;
      const def = SKILLS.find((s) => s.id === id);
      if (!def) return;
      const cd = st ? (st.skills[id] || 0) : def.cd;
      const v = cd > 0 ? cd / def.cd : 0;
      if (b._v !== v) { b._v = v; b.style.setProperty('--cd', String(v)); }
      const cold = cd > 0;
      if (b._cold !== cold) { b._cold = cold; b.classList.toggle('cold', cold); }
      const armed = this.g.armed === id;
      if (b._armed !== armed) { b._armed = armed; b.classList.toggle('armed', armed); }
    });
  }

  waveBtn(st, alive) {
    const n = this.n, c = this.c, b = $('btn-wave');
    const active = st.waveActive;
    const left = alive + st.queue.length;
    const cls = active ? 'wait' : 'ready';
    if (c.wbc !== cls) {
      c.wbc = cls;
      b.classList.toggle('ready', !active);
      b.classList.toggle('wait', active);
    }
    const bonus = Math.round(Math.max(0, st.interT) * EARLY_BONUS_PER_SEC);
    const done = !st.endless && st.waveIdx >= st.level.waves.length;
    const txt = active ? `剩 ${left}` : done ? '完成' : `开波 +${bonus}`;
    if (c.wbt !== txt) { c.wbt = txt; n['wv-t'].textContent = txt; }
    const key = `${st.waveIdx}:${active}:${Math.ceil(Math.max(0, st.interT))}`;
    if (c.pvKey !== key) {
      c.pvKey = key;
      const pv = st.over ? [] : this.g.preview;
      n['nw-icons'].innerHTML = pv.slice(0, 8).map((p) =>
        `<span class="nwi" title="${p.name}${p.elite ? ' · ' + (ELITE[p.elite] || ELITE[1]).name : ''}${p.boss ? ' · BOSS' : ''}">`
        + `${p.icon}${p.n > 1 ? `<b>${p.n}</b>` : ''}</span>`).join('');
    }
  }

  speedChange(v) {
    const b = $('btn-speed');
    b.textContent = `×${v}`;
    b.classList.toggle('on', v > 1);
    b.dataset.sp = String(v);
  }

  syncSettings(s) {
    $$('.tgl[data-set]').forEach((b) => {
      const on = !!s[b.dataset.set];
      b.classList.toggle('off', !on);
      b.textContent = on ? '开' : '关';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('.seg[data-set]').forEach((seg) => {
      const k = seg.dataset.set;
      const cur = k === 'speed' ? SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, s.speed))] : s[k];
      $$('.segb', seg).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === cur));
    });
  }

  fps(v) {
    const n = this.n['fps'];
    if (!n.classList.contains('on')) return;
    const t = `${v.toFixed(0)} fps · ${this.g.fx.parts.length}p · ${(this.g.st ? this.g.st.enemies.length : 0)}e · ×${this.g.speed}`;
    if (this.c.fps !== t) { this.c.fps = t; n.textContent = t; }
  }

  /* ============ 提示：建造条 / 横幅 / 吐司 ============ */
  buildTip(def, cost, ok, txt) {
    const n = this.n;
    if (!def) {
      n['buildtip'].classList.remove('show');
      n['buildtip'].style.color = '';
      return;
    }
    n['bt-name'].textContent = def.name || def.id;
    n['bt-cost'].textContent = cost ? `💰${cost}` : '';
    n['buildtip'].classList.add('show');
    n['buildtip'].style.color = ok === false ? 'var(--danger)' : '';
    if (txt) this.toast(txt, ok ? 'info' : 'warn');
  }

  banner(title, sub, ms) {
    const n = this.n['banner'];
    n.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    n.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => n.classList.remove('show'), ms || 1200);
  }

  toast(msg, kind) {
    const n = this.n['toast'];
    n.textContent = msg;
    n.style.color = (kind === 'danger' || kind === 'warn') ? 'var(--danger)'
      : kind === 'gold' ? 'var(--gold)' : kind === 'info' ? '#cfe4ff' : '';
    n.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => n.classList.remove('show'), 1400);
  }

  /* ============ 结算 ============ */
  over(sum, meta) {
    const set = (id, v) => { const x = $(id); if (x) x.textContent = v; };
    $$('#stars span').forEach((s) => s.classList.remove('on'));
    if (meta.endless) {
      set('e-wave', `第 ${sum.wave} 波`);
      set('e-score', fmt(sum.score));
      set('e-kills', fmt(sum.kills));
      set('e-best', `${meta.bestWave ? `第 ${meta.bestWave} 波 / ${fmt(meta.bestScore)} 分` : '—'}${meta.isBest ? ' · 新纪录' : ''}`);
      this.showScreen('endless');
      this.buildLevelGrid();
      this.refresh();
      return;
    }
    if (sum.win) {
      set('w-score', fmt(sum.score));
      set('w-kills', fmt(sum.kills));
      set('w-leak', String(sum.leaks));
      set('w-hp', `${sum.hp}/${sum.hpMax}`);
      set('w-towers', String(sum.built));
      set('w-time', mmss(sum.time));
      $$('#stars span').forEach((s, i) => setTimeout(() => { if (i < sum.stars) s.classList.add('on'); }, 220 + i * 260));
      const nx = $('w-next');
      if (nx) nx.textContent = this.g.levelId >= LAST_LEVEL ? '🗺 关卡选择' : `下一关 第 ${this.g.levelId + 1} 关 →`;
      this.banner(meta.newStars > 0 ? `新获得 ${meta.newStars} 星` : `本关 ${sum.stars} 星`,
        this.g.level ? this.g.level.name : '', 1700);
      this.showScreen('win');
    } else {
      set('d-wave', `${sum.wave} / ${sum.waveCount}`);
      set('d-score', fmt(sum.score));
      set('d-kills', fmt(sum.kills));
      set('d-leak', String(sum.leaks));
      const why = $('d-why');
      if (why) why.innerHTML = loseTip(this.g.level, sum);
      this.showScreen('lose');
    }
    this.buildLevelGrid();
    this.refresh();
  }

  destroy() {
    clearTimeout(this._bt);
    clearTimeout(this._tt);
  }
}

/* ---------------- 小工具 ---------------- */
function countAlive(st) {
  let a = 0;
  for (const e of st.enemies) if (e.alive) a++;
  return a;
}
function bump(node) {
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}
function helpBox(title, items) {
  return `<div class="helpbox"><h3>${title}</h3><ul>${items.map((x) => `<li><span>·</span><div>${x}</div></li>`).join('')}</ul></div>`;
}
function loseTip(level, sum) {
  if (!level) return '把<b>减速</b>放在长直路、<b>高爆发</b>放在弯道交叉口，通常更稳。';
  if (sum.wave <= 2) return `第 ${sum.wave} 波就被打穿：开局金币应<b>先铺 2~3 座主力塔</b>，只造一座贵的输出会不够。`;
  if (level.build === 'pads') return '本关<b>只能建在石台</b>：优先占住弯道与基地前的石台，别浪费在出怪口。';
  if (level.maxTowers) return `本关塔数上限 ${level.maxTowers}：<b>把少数塔升到满级</b>比铺满更多塔更强。`;
  if (level.env === 'sandstorm') return '沙暴窗口射程 -15%：让塔的射程<b>互相覆盖</b>，别在沙暴期出现火力空窗。';
  if (level.env === 'lava') return '熔岩每 6 秒灼烧地面敌人：<b>减速 + 毒</b>在这关收益翻倍，省下的输出交给 BOSS。';
  if (level.env === 'snow') return '风雪关敌人更抗减速：把<b>冰冻概率</b>与<b>溅射</b>放在长直路收尾。';
  if (sum.leaks >= 8) return `漏怪 ${sum.leaks} 次：基地前<b>缺少最后一道火力网</b>，把高 DPS 塔放在终段弯道。`;
  return `${level.desc}<br>把<b>减速塔</b>放在长直路、<b>高伤塔</b>放在弯道交叉口，并在 BOSS 波把目标切到「最强」。`;
}
