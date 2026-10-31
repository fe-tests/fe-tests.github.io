/* 塔防要塞（tower-defense）· 入口模块
 * 装配顺序：UI（DOM 构建与图鉴）→ Game（引擎 + 渲染 + 输入）→ 互相接线 → 启动。
 * 约定：本文件只做装配与全局暴露（window.__tdBooted / window.TD），不写玩法逻辑。
 * Node 侧（tools/smoke.mjs 模块图检查）导入本文件时因无 #game 画布而直接跳过启动。
 * ES module 需经 node server.js 以 HTTP 访问，file:// 会被 index.html 的引导守卫提示。 */
import { Game, LEVELS, TOWERS, SKILLS, SPEEDS } from './game.js';
import { UI } from './ui.js';
import { simulateLevel } from './engine.js';
import * as Save from './save.js';
import { Fx } from './fx.js';

export const VERSION = '1.0.0';

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('缺少 #game 画布');

  const ui = new UI(null);            // 先建 DOM（构造里会生成塔盘与图鉴）
  const game = new Game(canvas, ui.hooks);
  ui.g = game;                        // UI 与 Game 双向接线：hooks 走 game，UI 引用给 game 之外的事件
  game.ui = ui;

  /* 首次触摸解锁 WebAudio（浏览器策略）；同时给按钮一次触感反馈 */
  const unlockAudio = () => game.unlockAudio();
  window.addEventListener('pointerdown', unlockAudio, { passive: true, once: false });

  /* 开局界面：有进度就直接进菜单，无进度也进菜单（菜单上有开始按钮） */
  ui.refresh();
  ui.showScreen('menu');
  game.setPaused(true);

  /* 自动化 / 调试入口：外部脚本可驱动游戏，也便于在控制台做平衡验证 */
  window.TD = {
    version: VERSION,
    game,
    ui,
    LEVELS,
    TOWERS,
    SKILLS,
    SPEEDS,
    save: () => Save.load(),
    startLevel: (id) => { ui.hideOverlay(); return game.startLevel(id); },
    startEndless: () => boot_endless(),
    simulate: (id, opts) => simulateLevel(LEVELS.find((l) => l.id === id) || LEVELS[0], opts),
    selfTest: () => selfTest(),
  };

  function boot_endless() { ui.hideOverlay(); return game.startLevel(0); }

  /* 自检：不开画布也能验证「引擎 → UI 文本」这条链路是否接好 */
  function selfTest() {
    const out = { ok: true, steps: [] };
    const push = (name, v) => out.steps.push(`${name}: ${v}`);
    try {
      push('关卡', LEVELS.length);
      push('塔', TOWERS.length);
      push('技能', SKILLS.length);
      push('倍速', SPEEDS.join('/'));
      push('星数', Save.totalStars());
      game.startLevel(1);
      for (let i = 0; i < 240; i++) game.stepOnce(1 / 60);
      push('第1关 240帧后', `hp ${game.st.hp} 金币 ${game.st.gold} 波 ${game.st.wave}`);
      ui.hud(game.st);                              // 走一次真实 HUD 刷新，顺带验证文本节点写得进
      const sim = simulateLevel(LEVELS[0], { ai: true });   // simulateLevel 直接返回结算摘要对象
      push('自动玩家第1关', `胜 ${sim.win} 星 ${sim.stars} 漏 ${sim.leaks} 塔 ${sim.towers}`);
      push('HUD', `${document.getElementById('h-hp').textContent} / ${document.getElementById('h-gold').textContent}`);
      if (!document.getElementById('tray-list').children.length) { out.ok = false; push('塔盘', '空'); }
      if (!(game.fx instanceof Fx)) { out.ok = false; push('Fx', '缺失'); }
    } catch (e) {
      out.ok = false;
      out.steps.push(`异常 ${e && e.message ? e.message : e}`);
    }
    /* eslint-disable no-console */
    console.info('[TD selfTest]', out.ok ? 'OK' : 'FAIL', '\n' + out.steps.join('\n'));
    return out;
  }

  window.__tdBooted = true;
  /* eslint-disable no-console */
  console.info(`[塔防要塞] v${VERSION} 就绪 · ${LEVELS.length} 关 · ${TOWERS.length} 塔 · window.TD 可编程`);
}

if (typeof document !== 'undefined' && document.getElementById('game')) {
  try {
    boot();
  } catch (err) {
    window.__tdBooted = true;                       // 已尝试启动，避免引导守卫重复报「加载失败」
    if (typeof window.__tdBootFail === 'function') window.__tdBootFail(err && err.message ? err.message : String(err));
    throw err;
  }
}
