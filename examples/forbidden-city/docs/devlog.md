# 3D 故宫游览 · 开发过程记录

> 约定：每完成一个阶段追加一条「做了什么 → 为什么 → 结果」；踩坑与解法单独成条，便于日后复用。
> 设计变更只改 [design.md](design.md)，这里记流水；**当前状态看 [PROGRESS.md](PROGRESS.md)**。

## 里程碑

| 日期 | 做了什么 | 为什么 | 结果 |
| --- | --- | --- | --- |
| 2026-11-08 17:30 | 用 `tools/new-page.js --split` 创建页面目录并注册 registry | 建立符合规范的骨架 | 首页出现卡片，registry 25 条 |
| 2026-11-08 17:40 | 联网调研沉淀三份文档：research.md（实测数据 + 出处 + confidence）、assets.md（零二进制素材台账）、PROGRESS.md（接续协议） | 用户明确要求「每完成一部分落盘记录，避免上下文不足导致接续失败」；同时把建模数值与许可红线固化成可反查的档案 | 三份文档齐备；smoke 断言其存在 |
| 2026-11-08 17:52 | **阶段 1**：渲染骨架（index.html 全屏 canvas + HUD + 加载条 + 降级面板、main.js 启动流程与主循环、world.js 天空/雾/光/地面、quality.js 三档画质 + FPS 自适应、ui.js、input.js 摇杆与看视角） | 先把「能跑、能降级、能测」的骨架立住，后续阶段只往里填建筑 | headless Chrome 探针：THREE r128 已加载、无异常、`draw 3 / 6 tris`、主循环在跑 |
| 2026-11-08 17:55 | **校验网**：`tools/smoke.mjs`（30 条纯逻辑断言）+ `tools/headless.mjs`（Chrome CDP 探针，零 npm 依赖）+ 截图复核 | 用户要求「整体结构严谨」；纯靠肉眼看 WebGL 页面会反复回退，必须有回归钉 | smoke 全部通过；headless 7 条全过 |
| 2026-11-08 18:20 | **阶段 2**：`js/textures.js` 实现 T01–T18 全部程序化材质（琉璃瓦、汉白玉、金砖、红墙、菱花窗、门钉铺首、梁枋彩画、蟠龙藻井、匾额、青铜氧化、散水、水面法线、天穹渐变、踏道/土山） | 用户要求「全部程序化生成」且不下载二进制素材；同时材质必须能一眼判断对不对，不能只做数值断言 | 显存实测 24.69 MB / 18 张（预算 128 MB）；smoke 新增 12 条断言仍全绿 |
| 2026-11-08 18:25 | **贴图打样**：`tools/preview-textures.mjs` 生成带标签总览图（平铺的按 2×2 重复以暴露接缝）；据此修 T04 浮雕对比、T05 金砖太暗、T16 水面法线幅度过大 | 材质是"看着对不对"的东西，纯断言查不出审美与尺度问题 | 打样图两轮复核通过；`tools/out/` 已加 `.gitignore` 不入库 |

## 踩坑与解法

**1. r128 没有 `SRGBColorSpace` / `outputColorSpace`（那是 r15x）**
- 现象：按现代 three.js 写法设 `renderer.outputColorSpace = THREE.SRGBColorSpace` 会静默无效。
- 根因：站内 vendor 是 **r128**，色彩管理只有 `renderer.outputEncoding` + `.encoding`，且没有 `LinearSRGBColorSpace` 一类常量。
- 解法：`main.js` 用 `renderer.outputEncoding = THREE.sRGBEncoding`；贴图用 `.encoding`。
- 影响面：`smoke.mjs` 加了正则钉测——源码出现 `outputColorSpace` / `SRGBColorSpace` 即判失败（见 D9）。

**2. 冒烟断言扫源码时，注释里的字符串也命中**
- 现象：一条「禁止使用 r15x API」的断言误报，实际代码是对的。
- 根因：断言直接对全文正则匹配，`main.js` 注释里那句"不是 r15x 的 outputColorSpace"把关键词带了出来。
- 解法：断言前先 `stripComments()`；同时把跨文件常量收敛到单一来源（`SAVE_VERSION` 从 state.js 移到 config.js，state.js 只 re-export）。
- 影响面：所有源码钉测类断言都走同一个 `stripComments()`。

**3. headless 截图里 HUD 显示 `-- fps`，误判成主循环没跑**
- 现象：截图上 FPS / draw / tris 全是 `--`，但页面确实渲染了。
- 根因：`--virtual-time-budget` 会冻结 rAF，UI 的 0.25s 采样窗口永远等不到；另外用 `canvas.getContext('webgl')` 二次探测必然返回 null（上下文已被 three.js 占用）。
- 解法：改用 CDP `Runtime.evaluate` 读 `renderer.info.render.calls`（HUD 上的 draw/tris 文本）判定真实提交绘制。
- 影响面：`headless.mjs` 的断言口径；不要再加"二次 getContext 探测"这类假探针（见 D10）。

**4. `web_search` 工具在本会话不可用（API key 401）**
- 现象：所有检索请求返回 `HTTP 401 Authentication Fails`。
- 解法：改用 `web_fetch` 直取 Wikipedia API / jsDelivr / cdnjs API，并把结论写进 research.md 的出处表；后续要复核数据仍按此路径。

**5. PowerShell 读 `registry.json` 出现编码乱码**
- 现象：`ConvertFrom-Json` 报「传入的对象无效」，控制台中文变 mojibake。
- 解法：改用 `node -e "require('./registry.json')"` 解析与打印；脚本里一律走 node 而不是 pwsh 的 JSON 命令。

**6. 贴图工厂在 Node 侧「跑不起来 / 画不出东西」**
- 现象：想在 CI 里断言材质，但 `textures.js` 一 import 就因顶层 `document.createElement` 失败；shim 里 `fillText`、`drawImage` 又都是空的。
- 根因：把「绘制」与「three.js 装配 + DOM」写在一起；且用了 Node 侧不存在的 Canvas2D 能力。
- 解法：工厂改成纯函数 `draw(ctx, w, h, opts)`，`makeTexture(THREE, entry, opts, {provider})` 才碰 three.js；
  做旧叠加从 `drawImage + globalCompositeOperation='multiply'` 改为 `getImageData/putImageData` 直接读写像素。
- 影响面：现在有三层测试口径——shim（查异常与绘制调用）、vm 加载**真实 three.min.js**（查 `encoding/wrapS/anisotropy` 真用法）、headless 打样图（查观感）。见 D13/D14。

**7. 编辑时把函数体复制重了，导致括号失配**
- 现象：`SyntaxError: Unexpected token '}'`，但报错行号在没有意义的地方。
- 根因：一次 edit 的新旧文本重叠，留下重复的函数体片段。
- 解法：写了个一次性小工具（忽略注释与字符串后统计括号深度、指出第一个失配行）定位到重复片段；用完即删。
- 影响面：若后续再遇到同类问题，优先用「剥注释/字符串 + 括号深度」的方式定位，而不是逐行看。

## 性能与兼容性记录

- **入口体积**（阶段 1）：`index.html` 7.9 KB + `css/main.css` 1.9 KB + `js/*` 合计约 38 KB（config 4.6 / state 7.8 / quality 4.8 / world 3.4 / ui 4.0 / input 6.2 / main 8.0）；运行时依赖只有 three.min.js **603 KB**（已入库，非本页新增）。
- **贴图工厂**（阶段 2）：`js/textures.js` 约 26 KB 源码 → 18 张程序化材质，GPU 显存实测 **24.69 MB**（口径 w×h×4B×1.33；预算 128 MB）。首次生成耗时在 headless SwiftShader 下不明显（页面加载即收起进度条），真机待阶段 9 复测。
- **帧率基线**：headless SwiftShader（无 GPU 软渲染）1280×720、空场景 → **32 fps**。这是纯 CPU 光栅化的下限参考，不代表真机；有 GPU 的桌面/手机需另测（阶段 9 / 11）。
- **测量方法**：`tools/headless.mjs`（CDP 读 `renderer.info`）+ HUD 常驻读数（`H` 键切换）。
- **测试过的环境**：Chrome headless（new）+ SwiftShader，Windows；ES module 经 `node server.js` HTTP 访问正常。真机 iOS Safari / Android Chrome 待阶段 9。

## 拆分记录

| 日期 | 从哪拆到哪 | 触发原因（行数 / 职责混杂 / 复用） | 模块边界 |
| --- | --- | --- | --- |
| 2026-11-08 | 脚手架即按 `--split` 生成；随后把模板的 `render.js` 改名为 `world.js`，并新增 `config/quality/ui/state` | 3D 场景与 2D canvas 的职责不同：需要「数据 → 构件 → 装配 → 碰撞」四层，而非单一渲染层 | **纯逻辑层**（顶层不碰 DOM，可在 Node import）：`config.js`、`state.js`；后续 `layout.js`、`collision.js`。<br>**渲染层**（可碰 THREE，由 main 注入全局）：`world.js`、`quality.js`、后续 `textures/parts/buildings/interior`。<br>**DOM 层**：`ui.js`、`index.html`、`css/`。<br>**输入层**：`input.js`（只产出意图，不碰场景）。 |
| 2026-11-08 | `state.js` 里划出 `/* ENGINE-START */ … /* ENGINE-END */` | 成就判定 / 分区 / 存档迁移是可单测的纯函数，IO 只留在段外 | 段内禁止 `document/window/localStorage/navigator`；smoke.mjs 有对应断言 |

## 提交历史

```bash
git log --date=format:'%Y-%m-%d %H:%M:%S' --format='%ad %h %s' -- examples/forbidden-city/
```
