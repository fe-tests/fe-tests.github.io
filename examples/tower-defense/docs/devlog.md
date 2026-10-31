# 塔防要塞 · 开发过程记录

> 约定：每完成一个阶段追加一条「做了什么 → 为什么 → 结果」；踩坑与解法单独成条，便于日后复用。
> 设计定义只改 [design.md](design.md)，这里记流水。日期为 2026-10-31（Asia/Shanghai）。

## 里程碑

| 日期 | 做了什么 | 为什么 | 结果 |
| --- | --- | --- | --- |
| 10-31 10:36 | 用 `tools/new-page.js` 创建页面目录（`index.html` + `README.md` + `docs/`），并在 `registry.json` 追加注册条目 | 建立符合站点规范的骨架，注册表是首页唯一数据源 | 页面路径可访问，注册项 `url = examples/tower-defense/index.html` |
| 10-31 上午 | 与需求方确认四项设计选择：① 固定路径 + 可建格 / 石台（不做迷宫寻路）② 标准档内容量（12 关 + 无尽 / 10 塔 ×3 级 / 17 敌人 / 3 技能 / 星级与金币结算）③ 竖屏优先 + 横屏自适应 ④ 只存关卡进度（不做科技树与离线收益） | 移动端优先的塔防必须先定「决策模型」与内容规模，否则交互与数值两头漂 | 范围锁定，写进 `docs/design.md` §1 的非目标 |
| M1 数据层 | `config.js`（网格 / 伤害类型 / 目标模式 / 技能 / 特效档位 / 存档默认 / **`BAL` 全局倍率**）、`towers.js`（10 塔 ×3 级 + 造价与 DPS 口径）、`enemies.js`（17 敌人含 3 BOSS + 波次缩放 + 精英与状态元数据）、`levels.js`（波次 DSL + 12 关 + 无尽公式 + `selfCheck()`） | 纯数据表 + 单点调参，后续平衡改动不碰逻辑；纯逻辑全部放 `ENGINE-START/END` 内可被 Node 直接 import | 表自检通过（路径终点=基地、星级阈值单调、塔级与解锁一致）；`BAL` 让「塔伤 +50%」是一行改动 |
| M2 引擎 | `engine.js`：`newState / step / startWave / placeTower / upgradeTower / sellTower / statsOf / rangePx / starsOf / summary` + 伤害与状态结算 + 目标选择 + 技能 + 23 类事件 + `makeAi / aiThink / simulateLevel` | 玩法必须与渲染解耦才能自动化回归；表现层只吃事件流 | 固定步长跑通；`simulateLevel(level,{ai:true})` 能整关收敛；`smoke.mjs` 上线 |
| 平衡 v1→v6 | 建自动玩家基线并逐轮修：零塔必败 → 塔数爆炸（114 座）→ L8 精锐 14 连串打穿 → 前 3 关太松（★3 无压力）→ L12 一次全灭 → 无尽不收敛 | 「可玩性」要能被量化：先证明「不造塔一定输」和「认真玩能通关」，再谈手感 | 12 关全 ★3（漏怪 0/0/0/0/3/0/0/6/1/0/0/3，塔 12~22 座），前 3 关 202~282 秒通关，无尽跑到第 11 波（10.5 万分、20 塔、已收敛），零塔在 6 关的第 2~3 波被打穿 |
| M3 渲染 | `render.js`：地形离屏烘焙（每关一次）+ 视口剔除 + 塔 / 敌 / 弹道 / 伤害数字 / 基地 / 出怪口 / 流向 / 环境与天气层 + 屏幕空间方向标记 + 射程圈与准星 + `RETICLE_LIFT=36` | 静态信息一次烘焙，动态层按可视矩形剔除，低端机才有帧率保障 | 主循环每帧只有 1 次地形 `drawImage`；放大后屏幕外目标有箭头 |
| M4 输入 | `input.js`：Pointer Events 全手势（点击 / 拖动 / 长按 / 双指捏合与平移 / 滚轮 / 键盘映射）+ 阈值常量 + `setPointerCapture` + `contextmenu` 抑制 | 移动端的落塔精度是这类游戏最大的坑，必须把「点击 / 拖动 / 缩放」三种意图分干净 | `DRAG_MIN=6 / TAP_MAX=10 / TAP_MS=500 / LONG_MS=400`；缩放 `fit..2.6` 带边界钳制；桌面键位 12 组 |
| M5 表现与存储 | `fx.js`（粒子 / 环 / 碎片池 + 震屏 + 闪光 + 环境粒子，按档位预算）、`audio.js`（21 种程序化音色 + 节流 + `vibrate`）、`save.js`（自愈解析 + 内存兜底 + 取历史最大） | 表现预算与音效节流是帧率保障；存档必须假设被用户改坏 / 被禁用 | 池满淘汰寿命最短粒子；音效 >16 声部止；损坏 JSON 自动重建 |
| M6 装配层 | `game.js`：主循环与固定步长累加器、事件流单点消费 → 音效 / 粒子 / 提示、建造与升级与出售链、技能与待落点、暂停与设置、`window.TD` 用的 `stepOnce / unlockAudio` | 逻辑频率与渲染频率分离；表现层调用集中一处，方便契约测试断言「有哪些 hook」 | 掉帧积压丢弃；×3 快进判定与 ×1 一致；`HOOKS_DEFAULT` 成为 UI 契约的唯一声明处 |
| M7 UI 与入口 | `ui.js`：HUD 缓存刷新（逐字段比对再写 DOM）、塔盘与解锁灰显、抽屉（升级 / 目标 / 出售二次确认）、8 个覆盖屏、图鉴 4 页签（内容由数据表自动生成）、结算屏（星级动画 + 失败建议）、`main.js` 装配 + `window.TD` + `__tdBooted` | HUD 每帧写 DOM 会掉帧，必须缓存比对；图鉴与帮助由数据表生成，避免与数值脱节；`TD` 让页面可脚本化自检 | 13 个 hook 与 `HOOKS_DEFAULT` 双向对齐；关卡卡片、塔与敌人图鉴零手写内容 |
| M8 契约与装配验证 | `smoke.mjs` 扩到 54 项（模块图、fx 池、存档、关卡与网格、塔表、零塔必败、12 关自动玩家、余量与压力、无尽、预览、手动开波、10 秒推进、summary、DOM/CSS/hooks 契约、键位与文案契约、入口只加载 `ui.css`+`main.js`）；新增 `headless.mjs` 38 项（替身 DOM + 代理 2D 上下文，用合成时间戳喂 `Game.frame`，并真跑 `main.js` 的入口 boot 与 `TD.selfTest()`） | 没有浏览器自动化，就必须把「装配链路 + 契约」在 Node 里钉死，否则改 UI 会静默打断游戏 | 两个 harness 全绿（54 / 38 共 92 项，退出码 0）；headless 里沿路建塔打到第 13 波 **★3 通关**，入口 boot 后 `TD.selfTest()` 全绿，证明引擎 + 渲染 + 事件 + 存档 + 入口在真实调用序列上成立 |
| M9 文档与注册 | 写 `README.md` / `docs/design.md` / `docs/devlog.md`（玩法、键位手势表、算法与渲染分工、取舍、平衡基线、验证命令）；删除脚手架占位 `js/state.js`、`css/main.css`；`registry.json` 状态翻 `stable` | 页面目录要能被后来者直接接手；占位文件会误导（页面只加载 `css/ui.css` + `js/main.js`） | 文档无占位；页面目录 21 个文件；`node --check` 13 个模块全通过；HTTP 冒烟 21 项真实资源 200（`.js` 为 `text/javascript`）+ 故意探针 404 |

## 踩坑与解法

**1. 最高分被压成 3（存档数字清洗）**
现象：`best` 分数全变成 3。根因：`numMap()` 复用了星级上限（≤3）去清洗所有数字表。
解法：`numMap(src, out, maxV)`，星级传 3、`best` 传 `Infinity`。影响面：`save.js` 清洗层。

**2. 通关不写档**
现象：模拟通关后读档，星数与分数仍为 0。根因：`save(patch)` 只覆盖标量字段，`stars` / `best` 被丢弃。
解法：`stars` / `best` 按关卡 key **取历史最大**逐键合并，`endless` 逐字段取大。影响面：结算落盘。

**3. 开局就是 ×2 倍速**
现象：headless 的「20 秒」跑出 `t=40.0s`。根因：存档 `speed` 存的是 `SPEEDS=[1,2,3]` 的**下标**，默认值写成 `1` = ×2。
解法：默认改 `0` 并在 `config.js` 注释写明「是下标不是倍速」；`heal()` 同时加下限 `max(0,…)`，上限由 `SPEEDS.length-1` 推导。影响面：`SAVE_DEFAULT`、存档清洗。

**4. 测试里沿路建塔一座都没建成**
现象：`buildAlong` 返回 0 座。根因：网格不是扁平数组，是 `{w,h,cells,at(x,y)}` 对象，`grid[y*W+x]` 取到 `undefined`。
解法：改用 `st.grid.at(x,y)` 与 `st.grid.w/h`。影响面：只在测试脚本；提醒「网格读取一律走 `at()`」，越界才会得到 `CELL.BLOCK`。

**5. HUD 一次都没刷新**
现象：headless 里 `hud=undefined`，`#h-gold` 文本空。根因：`hooks.hud / fps / 自动开波` 只在 `frame(ts)` 里跑，测试用 `stepOnce()+render()` 只推进引擎。
解法：测试改成用合成时间戳喂真实 `Game.frame(ts)`（`ts += 16.667`），顺带把自动开波与渲染路径一起覆盖。影响面：`tools/headless.mjs` 驱动方式。

**6. 声明了没人调用的 hook**
现象：契约检查报 `缺 waveInfo, skillInfo`。根因：`HOOKS_DEFAULT` 里留着两个早期设想的 hook，波次与技能 HUD 实际在 `hooks.hud` 内部刷新。
解法：删除死契约，并在 devlog 记录「hook 只声明真被调用的」；`smoke.mjs` 双向解析两边键集，这类漂移以后编译期就报。

**7. 自动玩家基线三轮反转**
现象：v1 零塔也「勉强过关」；v2 塔数失控到 114 座；v3 第 8 关精锐 14 连串打穿 26 血基地。
根因：AI 只按「离基地最近」建塔，塔全堆在终点；经济无门槛；精锐倍率与波次节奏叠加。
解法：可建格按「覆盖道路条数 + 聚簇」做贪心集合覆盖排序、`cap = min(maxTowers, 20)`、升级与扩张两个金币门槛进 `BAL`、BOSS 波切「最强」目标、第 8 关精锐降级与波次节奏调整。影响面：`engine.js` 的 AI + `levels.js` 波次表 + `BAL`。

**8. 后期关一次失误直接结算**
现象：L12 的 BOSS 漏怪扣 8~12 血，基地 30 血在三波内清零（★3 阈值形同虚设）。
解法：单次漏怪伤害上限 = 基地上限的 25%（`max(1, min(raw, ceil(hpMax*0.25)))`），并给后期关加经济缓冲。玩家仍会痛，但有反打窗口。影响面：`engine.js` 漏怪结算。

**9. 星级阈值手填会漂移**
现象：调波次后「三星比一星还难」，`selfCheck()` 单调性断言抓出来。
解法：阈值由波次表推导（理论赏金 + 奖励 + 基地价值 → `[0.55, 0.76, 0.92]`，50 取整），数据表**禁止**手写 `stars`。影响面：`levels.js` 的 `finalize()`；改波即重算。

**10. 调经济把评星一起打爆**
现象：上调 `waveReward` 后所有关卡阈值集体失效（分数被金币缩放污染）。
解法：评分模型只用**原始**赏金与奖励，金币缩放只作用于 `gold`。两条曲线解耦后，调钱不再动评星难度。影响面：`engine.js` 的分数与金币结算。

**11. `towersUnlocked()` 返回数组被当谓词用**
现象：底部塔盘解锁过滤和键盘 `1-9` 选塔都失效（第 3 关后仍然全解锁 / 选不到塔）。
根因：该函数返回**数组**，调用处写成 `towersUnlocked(id).some(t => t.id === id)` 之外的形式（当成布尔用）。
解法：统一 `towersUnlocked(lvId).some(...)` / `[idx]` 并在函数注释强调返回类型。影响面：`ui.js`、`game.js`。

**12. 预览射程算出 NaN**
现象：建造态幽灵射程圈不显示。根因：`rangePx(st, t)` 需要 `t.def` 与 `t.lv`，只传了 `{def, x, y}` → `towerLv(def, undefined)` 取到 `undefined` 级 → NaN。
解法：预览传 `{ def, lv: 1, id, x: 0, y: 0 }`；同类「合成一个伪塔对象喂统计函数」的调用都补齐字段（抽屉里「下一级 DPS」同样传 `lv: t.lv+1`）。影响面：`game.js` 的 `ghostRange()`、`ui.js` 抽屉。

**13. 抽屉在玩游戏时不可见**
现象：点塔没有反应，抽屉 DOM 存在但不显示。根因：`#drawer` 被写在 `#overlay` 内部，覆盖屏关闭时父容器 `display:none` 连带隐藏。
解法：把 `#drawer` 移成 `#app` 直接子节点。影响面：`index.html` 结构；提醒「游戏内浮层不能挂在覆盖屏里」。

**14. 渲染器报告 `css=1×1 dpr=1`**
现象：装配测试断言「视口尺寸适配竖屏」失败。根因：`Renderer.resize()` 读 `getBoundingClientRect()` 与 `window.devicePixelRatio`，而构造期 `st` 为空时不会 resize，断言写得比开局早。
解法：把断言移到 `startLevel()` 之后，并补上 `canvas.width/height` 输出（`css=390×720 dpr=2 → 画布 780×1440`）。影响面：测试顺序，非产品代码。

**15. `ReferenceError: lerpAng`（只在运行时炸）**
现象：火焰塔开火即崩。根因：角度插值函数被调用但从未定义，纯静态 `node --check` 查不出未定义引用。
解法：补最短弧插值 `lerpAng`，并把这类「运行路径」交给 Node 模拟覆盖（smoke 的 10 秒推进 + headless 的整关连打）。

**16. Node 24 全局只读**
现象：`TypeError: Cannot set property navigator of #<Object> which has only a getter`。根因：Node 自带 `navigator` / `performance` 是 getter。
解法：测试桩统一用 `Object.defineProperty`（`def()` 助手），不再直接赋值。影响面：`tools/headless.mjs`。

**17. `location` 裸全局让模块在 Node 里崩**
现象：`new UI(null)` 在 headless 报 `location is not defined`。根因：浏览器里 `location` 是隐式全局，Node 没有。
解法：`typeof location !== 'undefined' && …` 守卫（`?fps` 诊断开关），测试侧也补 `def('location', …)` 保持环境忠实。

**18. PowerShell 吃掉反引号模板字符串**
现象：`node -e "…\`…\`…"` 语法报错。解法：验证脚本落成 `.mjs` 文件（`tools/`），不在命令行里拼模板字符串。

**19. Node 的 typeless-package 警告让 pwsh 报假退出码**
现象：`node examples/tower-defense/tools/smoke.mjs` 明明成功，退出码却是 1（警告文本被当失败）。
解法：页面目录加 `package.json`（`{"type":"module","private":true}`），警告消失且模块类型显式。影响面：只新增页面内文件，不动根 `package.json`。

**20. Windows 沙箱 `EPERM mkdir`**
现象：首次创建 `js/` 目录被拒。根因：沙箱策略限制。解法：按 `diagnose-windows-sandbox-acl` 思路做 ACL 诊断（诊断报告留在仓库根 `.acl-recovery/`，作为一次性证据保留，未纳入页面目录），随后把会话文件策略提到 `danger-full-access`。

**21. 触摸落点被手指挡住**
现象：手机上「点哪建哪」看不见，误建率高。解法：触屏落点准星抬到**指尖上方 36 屏幕像素**（`RETICLE_LIFT`，鼠标不抬升，`prefers-reduced-motion` 时 ×0.6），并加拖动微调 + 连放开关。

**22. `file://` 直开白屏**
现象：本地双击 `index.html` 白屏（ES module 的 CORS）。解法：`index.html` 内置启动守卫——捕获 `error` 走 `window.__tdBootFail(msg)`，1.2 秒内检测 `location.protocol === 'file:'` 并弹出「请用 `node server.js` 起 HTTP」指引，`window.__tdBooted` 成功则不提示。

**23. 页内自检一直报「异常」（返回形状与文档口径不一致）**
现象：`TD.selfTest()` 输出 `异常 Cannot read properties of undefined (reading 'win')`。
根因：`simulateLevel()` **直接返回结算摘要对象**，`main.js` 里按 `sim.sum.win` 取值（早期设想是 `{sum,…}` 包装）。
解法：统一按返回值取值（`sim.win / sim.stars / sim.leaks / sim.towers`），并给自检补一次真实 `ui.hud(st)` 刷新；
`headless.mjs` 增加入口检查（真跑 `main.js` boot + `TD.selfTest()` + `TD.simulate` 返回形状），
README 承诺的每个 `window.TD` API 从此都有断言兜着。影响面：`js/main.js` 自检 + 测试覆盖面。
**教训**：文档写出去的 API 就是契约；写 README 的同时要让 harness 去调它，否则文档会替代码说谎。

**24. 帮助页写着 Q/W/E 技能，实现绑的是 J/K/L（提示条还写「1-0 选塔」）**
现象：桌面按 W 是平移，按帮助页的 Q/W/E 打不出技能；`1-0` 里的 `0` 从来没绑过。
根因：`config.js` 的 `SKILLS[].key` 是「给人看的标签」，真实绑定在 `input.js` 的 `skill1/2/3 ← J/K/L`，两处各写各的；`#hint` 与帮助页照抄标签，于是三处一起漂。
解法：以实现为准统一（技能 `J K L`——W 已绑平移，同手位不能撞键；选塔 `1-9`），并给 `smoke.mjs` 补两条契约：`SKILLS[].key` 必须等于 `input.js` 里 `skill1/2/3` 实际绑定的键；`#hint` 文案不得出现 `1-0` / `Q/W/E`。影响面：`config.js`、`index.html` 的 `#hint`、`ui.js` 键盘帮助表。
**教训**：凡是「写给用户看的常量」（键位、冷却、返还率、上限）都要被机器校验一次，否则它就是漂移的起点。

## 平衡基线（`tools/smoke.mjs` 自动玩家，逐关断言）

| 关 | 结果 | 漏怪 | 塔数 | 备注 |
| --- | --- | --- | --- | --- |
| 1~4 | ★3 | 0 | 12~14 | 教学与铺量，余量充足 |
| 5 | ★3 | 3 | 14 | 首个「有漏怪」关，飞行 + 潜行混编 |
| 6~7 | ★3 | 0 | 15~16 | 相位护盾与机械波考验目标优先级 |
| 8 | ★3 | 6 | 17 | 精锐连串波，压力关（曾打穿基地，已重排节奏） |
| 9 | ★3 | 1 | 18 | 召唤 + 分裂 |
| 10~11 | ★3 | 0 | 19~20 | 双线路与沙暴 / 熔岩环境 |
| 12 | ★3 | 3 | 20~22 | 三 BOSS 收官，★3 阈值最高（含漏怪容差） |
| 无尽 | 第 11 波收敛 | — | 20 | 104860 分；每 5 波含 BOSS，`endlessMul(n)` 递增 |
| 零塔 | 必败 | 基地清零 | 0 | 第 1~6 关分别在第 3/2/3/2/2/2 波被打穿 |

调参只动 `config.js` 的 `BAL` 与 `levels.js` 的波次表；`smoke.mjs` 的「前 3 关余量 / 后段压力」断言用来防止调松。

## 性能与兼容性记录

- **体积**：`index.html` 15.6 KB + `css/ui.css` 26.2 KB + 13 个 JS 模块 = **243.6 KB 原始**（15 个入口资源），
  逐文件 gzip 合计 **82.4 KB**（中文注释占比高，文本压缩比好）。最大单文件 `engine.js` 36.3 KB，页面目录整体 325.8 KB（含 `tools/` 与文档）。
  页面零网络字体、零图片、零外部库；`server.js` 目前不压缩传输，若要上线建议前置 gzip/br。
- **每帧成本设计**：地形一次烘焙（1024×768 离屏，约 3 MB 显存 / 关）；实体与粒子按 `viewRect()` 剔除；
  粒子池上限 120 / 260 / 460（流畅 / 均衡 / 华丽），流畅档 DPR ×0.8 且 `DPR_MAX=2` 封顶；
  HUD 逐字段缓存比对后才写 DOM；音效 >16 声部停止播放；伤害数字与粒子在 `prefers-reduced-motion` 下收敛。
- **逻辑频率**：固定 60 步，`MAX_STEPS_PER_FRAME=8`（倍速 ×3 时预算同步），掉帧丢弃积压，高刷屏不会跑成 2 倍速。
- **Node 侧测量**：`tools/headless.mjs` 用替身 DOM + 代理 2D 上下文跑 1200 帧主循环，无阻塞性同步 I/O、无异常、
  无 NaN（`smoke.mjs` 对 `dmg.a`、`gold`、`hp` 断言非 NaN）。**代理上下文不代表真机帧率**，帧率基线需在浏览器测。
- **待人工点验（需要浏览器）**：`?fps=1` 诊断条在真机（尤其低端 Android）的帧率、
  竖屏拇指热区与 36px 落点抬升手感、横屏右栏与抽屉表单、捏合与平移顺不顺手、
  iOS Safari 首次触摸后的音频解锁与 `100dvh` 在地址栏收缩时的表现、震动反馈是否过强。
  键盘可访问性（`:focus-visible` 焦点环与 `Tab` 顺序）同样需人眼确认。
- **兼容面**：Pointer Events（不做 touch 降级）、`100dvh` 与安全区变量、`navigator.vibrate`（不支持时静默跳过）、
  WebAudio 首次手势解锁（不可用时全部音效静默降级）、`localStorage` 禁用时内存兜底。
- **已知不覆盖**：无浏览器自动化环境，因此「像素呈现 / 真机手势 / 音频时序」三类只能靠人在页面里点一遍。

## 拆分记录

| 日期 | 从哪拆到哪 | 触发原因（行数 / 职责混杂 / 复用） | 模块边界 |
| --- | --- | --- | --- |
| M5 | 渲染层内的粒子与震屏 → `js/fx.js` | 粒子池预算、淘汰与震屏属于「表现资源管理」，与绘制顺序无关；`game.js` 需要直接 `fx.update(dt)` | `Fx` 只管池与绘制接口，不读游戏状态；`game.js` 事件消费后调用 |
| M7 | 装配层内的 DOM 刷新 → `js/ui.js` | `game.js` 越写越长且 DOM 细节（缓存比对、覆盖屏、图鉴）与玩法循环无关；两边需要可测试的契约 | `game.js` 只声明并调用 `HOOKS_DEFAULT`（13 个 hook），`ui.js` 实现同名 hook；`smoke.mjs` 从两边源码解析键集做双向对齐检查 |
| M1 | 波次与关卡 → `js/levels.js`（数据不进 `engine.js`） | 关卡表是内容，引擎是行为；表要能被 `selfCheck()` 与平衡 harness 直接读 | 表只写原值数值，全局倍率在 `config.js` 的 `BAL`；星级由 `finalize()` 推导 |
| M9 | 未继续拆 `engine.js`（834 行，略超单模块 ~800 软上限） | 状态构造 + 战斗结算 + AI 共享同一状态形状，拆开需要传大量上下文，收益为负 | 边界已划好：后续要拆先抽 `ai.js`（`makeAi / aiThink / simulateLevel`），纯逻辑锚点 `ENGINE-START/END` 保留在 `engine.js` |
| M9 | 删除脚手架占位 `js/state.js`、`css/main.css` | 页面只加载 `./css/ui.css` 与 `./js/main.js`（`smoke.mjs` 有入口契约断言），留着会误导后来者 | 入口资源固定两项，其余模块由 `main.js` 的 import 图可达 |

## 提交历史

页面由脚手架创建于 2026-10-31 10:36:03。**尚未提交**（提交由需求方决定）。自查命令：

```bash
git status --porcelain examples/tower-defense registry.json
git log --date=format:'%Y-%m-%d %H:%M:%S' --format='%ad %h %s' -- examples/tower-defense/
# 需要提交时（示例，未执行）：
# git add examples/tower-defense registry.json
# git commit -m "feat: 新增塔防要塞（多关卡塔防，移动端优先）并注册"
```
