# 3D 鹈鹕海边骑行 · 开发过程记录

> 约定（与 `examples/forbidden-city/docs/devlog.md` 同口径）：每完成一段追加一条「做了什么 → 为什么 → 结果」；踩坑与解法单独成条。
> 设计变更只改 [design.md](design.md)，这里记流水。

## 里程碑

| 日期 | 做了什么 | 为什么 | 结果 |
| --- | --- | --- | --- |
| 2026-11-20 23:01 | 立项：确认落为**新页** `examples/pelican-bike-3d/`（不碰 2D 版 `examples/pelican-bike/`），范围锁定「纯 3D 动画 + 视角控制」；`registry.json` 追加条目（`experiment` / `stable` / 标签含 `移动端`、`触控`） | 2D 版是稳定页，同 slug 双版本会互相牵连；用户明确只要动画与视角，不做玩法 | 门户出现卡片；页面目录骨架就位 |
| 2026-11-20 23:20 | `index.html` 骨架（canvas、HUD 面板、机位条、时间轴、画质档、键位面板、`#fallback`、classic 载 three r128 + module 入口）+ `css/main.css` | 先把「能跑、能降级、能测」的壳立住，后续只往里填 | 页面可加载；HUD 结构与 `ui.js` 一一对应 |
| 2026-11-21 00:05 | `config.js`（道路双频曲线与全部纯函数、骑行参数、世界块、渲染参数、三档画质、7 档机位、巡游参数、时间轴、预算）+ `utils.js`（阻尼、角度近路、值噪声/FBM、哈希、时钟） | 数值全部集中在单一数据源，渲染层不写死数字，才可能在 Node 里断言 | 两模块零 three、零 DOM，可被 smoke 直接 import |
| 2026-11-21 00:20 | `textures.js`：14 张 canvas 程序化贴图（沥青/沙/岩/土/皮/棕榈叶/叶/草/云/泡沫/海鸥/羽毛/水面法线/光晕）+ 材质工厂 + 显存台账 | 用户要求零二进制素材；材质要能一眼判断对不对 | `buildTextureKit(THREE, opts)` 出 `tex/mat/meta/metricOf/uvScale`；`textureBudgetReport()` 可查 |
| 2026-11-21 00:35 | `terrain.js`（分带高度场 + 顶点色 + 5×5 块回收 + 沙滩条带）、`road.js`（路面几何 + `PropStrip` 实例回收条带：标线/护栏/路灯/里程碑/木料） | 路面必须严格齐平（车不陷地），岸线必须解析（泡沫/沙滩/植被共用一条线） | `terrainHeight` 在 `\|d\|≤4.8` 内 = `roadElev`；`shoreXAt` 二分求根 |
| 2026-11-21 00:50 | `ocean.js`（4 道世界波 + 双层滚动法线 + 菲涅尔 + 太阳高光 + 碎浪 + 岸线泡沫 LUT + 手写雾 + 水花粒子）、`sky.js`（10 关键帧 `sampleDay` + 天穹着色器 + 日光/半球/暖侧/月补光 + 星） | r128 无 `Water`/`Sky`；昼夜要一次性驱动雾、色温、灯光、海面 | 纯函数 `sampleDay(t)` 全参数可断言；夜里 `lamp > 0.9` 点灯 |
| 2026-11-21 01:00 | `bike.js`（管架/轮组/曲柄/车把/车篮两条鱼/前灯光锥）、`pelican.js`（喙与喉囊、S 颈链 + 头部稳定、翅膀展翅、两节腿 IK 踩踏板、眨眼与梳理） | 「一眼认出鹈鹕」靠形征：大喙 + 喉囊 + S 颈 + 蹼足；腿要真踩在踏板上 | 腿 IK 收敛：局部平面两节解，膝朝前、脚掌随相角贴踏板 |
| 2026-11-21 01:10 | `meshkit.js`（`mergeGeos` + 实例矩阵写入器）、`scenery.js`（棕榈/松树/草丛/礁石/海鸥/云带/海岬/远山脊，全部实例化 + 块回收 + 稳定哈希控密度） | r128 无 `BufferGeometryUtils`；一棵树多图元会打爆 draw call | 棕榈 = 2 个 draw call；低档密度 0.45 均匀稀疏 |
| 2026-11-21 01:15 | `rider.js`（纯函数 `stepRide`/`frameOf` + 组装）、`camera.js`（7 档机位坐标架解算 + 巡游 + 鼠标偏移叠加 + 空闲回游） | 相机在骑行者坐标架内解算 → 任意机位主体都在画面内；纯函数才能断言构图 | 7 档距离/方位断言全过；`R` 复位、`A` 开关、`P` 暂停 |
| 2026-11-21 01:20 | `input.js`（Pointer Events 鼠标/触控/滚轮 + 快捷键）、`quality.js`（三档 + FPS 自适应 + 偏好）、`ui.js`（HUD 视图层）、`audio.js`（涌浪/风/胎噪/脚踏/海鸥/展翅，默认关闭） | 鼠标与触控同一条代码路径；音频默认关闭，首次点击解锁，不自动播放 | 键位表齐；HUD 读数 `renderer.info` 直连 |
| 2026-11-21 01:25 | `main.js`：启动顺序 + 分步构建（带载入进度）+ 主循环（骑行 → 世界回收 → 相机 → 天空/海面 → 渲染）+ 昼夜/雾/灯联动 + `?shot=1` 调试钩子 | 任一步失败都要落 `#fallback`，不能白屏；软渲染下探针要瞬移落位 | 循环跑通；`window.__pbike.info()` 给出 calls/tris/档位/机位/时刻 |
| 2026-11-21 01:28 | `tools/smoke.mjs`（217 条纯 Node 断言）+ `tools/package.json` + `tools/.gitignore` | 纯靠肉眼验 WebGL 页面必反复回退，必须有回归钉 | **217 项全绿**（含 HTML/ui id 对齐、时间预设对齐、GLSL 合法写法、audio 不自动播放） |
| 2026-11-21 01:32 | `tools/shot.mjs`（CDP headless Chrome + swiftshader，`?shot=1` 钩子瞬移：`snapRig` / `setTime` / `jump` / `setTier`），默认截 跟拍/侧面/环绕/海边低机位/低机位轮周/夜景 + 首屏 + 拖拽复核，并打印 drawCalls/tris 与控制台告警 | 构图对不对要看图；软渲染 ~1 fps 下按键必漂移（forbidden-city D34 口径） | 截图与统计见文末「截图复核」 |
| 2026-11-21 02:00–03:00 | **真机截图复核轮**：`ctxOf`/`put` 修 canvas 贴图、CDP 关缓存、GLSL 重名、sRGB→线性 全链路 + ACES、鹈鹕 `setMount` 落座、星星夜间门、相机贴地用真实地形、远山夜间配色、`noMip` 关远处 alpha 精灵 mipmap；smoke 扩到 334 条 | 浏览器里才会暴露的问题（着色器编译、色彩管线、DOM 构造器、缓存）Node 测不到；截图是唯一真相 | 8 张样片全部出片、控制台 0 error/0 warning；`node --check` 语法门上线 |
| 2026-11-21 07:50–08:40 | **落座几何 + 调色板根因轮**：整车抬到轮半径（`bikeY`）、腿长重算（THIGH/SHIN + IK 取膝朝前解）、躯干俯仰改骑行姿态（不再低头）、`frameOf` 坐标架严格正交；**找到整屏偏色的总根因：`sky.js` 的 `C()` 从 `slice(1,3)` 起切 6 位十六进制**（关键帧色号不带 `#`，全部通道被错位解析）；smoke 重写为 401 条（新增调色板解析门、落座装配门、相机解算门） | 用户只看真机截图：车轮陷进地面、鹈鹕双腿悬空、永远低头，三个都在截图里才看得见；颜色发木从一开始就归因到管线/曝光，其实第一行代码就错了 | 截图重出：轮子贴地、腿踩踏板、头前视；夜里远山拾取色从 `#671405` 变 `#020306`（二·27 收敛）；控制台 0 error/0 warning |
| 2026-11-21 17:10–18:00 | **鹈鹕双腿「缺少链接」轮**：腿重建为真骨骼链 `髋 →〔股骨 + 羽领〕→ 膝 →〔胫骨 + 关节球〕→ 踝 → 蹼足`（关节处加链接体，同材质图元 `mergeGeos`）；踏板目标与车上曲柄收敛到唯一纯函数 `config.pedalOffset()`；轮与曲柄共用 `RIDE.CRANK_SIGN`；新增 `__pbike.legs()` / `__pbike.legCam()` 复核钩子；smoke 扩到 454 条 | 用户看图指出「鹈鹕的双腿结构缺少链接」：腿段之间没有关节体、脚掌与脚踏各转各的、轮子在倒转 —— 三处都在截图里，Node 一条断言都没有 | 腿链特写出片；踝↔脚踏间隙 0.043 / 0.051 m（掌底踩在踏面上）；整圈踏相位 IK 不被夹；低档 drawCalls 161 → 153；控制台 0 error/0 warning（二·31） |

## 截图复核

跑法：

```bash
node server.js
node examples/pelican-bike-3d/tools/shot.mjs          # 默认 6 机位 + 首屏 + 拖拽
node examples/pelican-bike-3d/tools/shot.mjs follow orbit seaside   # 只截指定机位
```

产物在 `tools/out/shots/`（`.gitignore` 已盖，不入库）。

| 图 | 门（看什么） |
| --- | --- |
| `00-entry` | 首屏构图：骑行者在画面内、路面齐平、海在左 |
| `follow` `side` `orbit` `seaside` `lowwheel` | 7 档机位各自的构图与主体尺度 |
| `night`（`follow` + t=0.965） | 夜间：路灯与车头灯必须亮、天穹有星、雾不把场景吞掉、远山夜里是暗蓝（拾取色 `#020306`，见二·27/28）。夜样片走跟拍机位（海边机位夜间为已知观感限制，见二·26） |
| `drag-yaw90` | 鼠标接管后机位绕到骑行者右侧，距离变化合理（打印镜头距离） |
| `legs-closeup` `legs-mid`（`__pbike.legCam()` 冻住相机贴双腿） | 双腿链的每一节：髋羽领 → 膝链接球 → 胫骨 → 踝链接球 → 蹼足踩在踏面上；同时打印每腿「踝世界坐标 / 脚踏世界坐标 / 间隙 / 膝角 / 髋角」（见二·31） |
| 控制台 | `error` / `warning` 条数（应为 0）；`renderer.info` 的 calls/tris 与档位 |

**本轮实测（腿部链复核轮，`tier=low`，2026-11-21 17:55）**

- `node examples/pelican-bike-3d/tools/shot.mjs legs` → `00-entry` + `legs-closeup` + `legs-mid` + `drag-yaw90` 出片，控制台 `error`/`warning` 各 0 条。
- `__pbike.legs()`：`side=+1` 踝 `(20.26, 6.06, 324.03)` ↔ 脚踏 `(20.25, 6.00, 324.03)`；`side=-1` 踝/脚踏同样贴在一起。多轮读数间隙 **0.043–0.060 m**（随踏相位摆动，量级 = `FOOT_SOLE` 0.037 + 踝球半径）→ 蹼足掌底踩在踏面上，不陷进踏板也不悬空；两腿间隙同量级 = 两脚一起随曲柄转，没有镜像/脱相。
- draw calls：腿部合并后**低档 161 → 153**（腿部特写机位 114，视锥外剔除）；三角面 80.0k–80.3k，与上一轮持平。
- 射线拾取确认「这团颜色是谁画的」：`Mesh#219` 命中色 `#ebe8e0`（羽毛材质 `0xf6f5f1` 线性化后的值）= 股骨 + 羽领；`Mesh#101/#103` `#a00807` = 车架管；`Mesh#160` `#ffb059` `MeshBasicMaterial` 加法混合 = 车头灯光锥（`op:0` 透明，故拾取会先命中它）。
- smoke：`node examples/pelican-bike-3d/tools/smoke.mjs` → **454 项全绿**（新增第 18 组「腿部链与传动咬合」53 条：4 层父子链、3 个链接体、`pedalOffset` 与曲柄臂旋转逐点一致、64 个踏相位 IK 不被夹、`CRANK_SIGN` 三处符号、外撇角把脚踝送到脚踏平面）。
- **注意（沙箱口径）**：smoke 的 `node --check` 语法门要 spawn 子进程，在受限沙箱里会 `EPERM` 全红；必须在放开权限的 shell 里跑（本轮改为直接 `node --check` 逐个文件复核：20 个文件 0 问题）。

**本轮实测（`tier=low`，headless + swiftshader，软渲染 ~1 fps 下属正常；2026-11-21 08:35 重跑）**

- 8 张样片全部出片；控制台 `error` 0 条、`warning` 0 条。
- `renderer.info`：draw calls **161–164**，三角面 **80.1k–80.3k**（预算：mid 档 calls ≤ 120、tris ≤ 450k）。低档 calls 超预算的记录在「后续可做的」里：`PropStrip` 的木料/标线条带可再合并。
- 装配断言：`riderY` / `pelicanY` / `saddleY` 三个世界高度随 `info()` 打印（`saddleY - riderY = 0.71`，正好是座垫高度，`pelicanY - saddleY = 0.36` = 落座后躯干中心），夜间样片 `sky.night = 0.98`、`lamp = 0.99`（灯应亮的时刻），拖拽复核的镜头距离 4.2 m（在 2.2–38 m 区间内，鼠标接管生效）。
- 夜样片天空射线拾取：`Mesh#91` 命中色 `#020306`（夜里远山该有的暗蓝），白天同层 `#54697e` —— **二·27 的暗红块消失**，根因见二·28。
- smoke：`node examples/pelican-bike-3d/tools/smoke.mjs` → **401 项全绿**（17 组：配置/数值/道路/地形/昼夜/调色板解析/骑行/落座装配/相机/画质/贴图/正则钉/GLSL/语法/import/HTML id/registry）。

## 踩坑与解法

**1. `place` 回调引用未初始化的 `const`（TDZ）**
- 现象：`scenery.js` 里 `addStrip({ place: placeTree(palmTrunk, …) })` 在 `const palmTrunk = addStrip(…)` 的初始化式里引用自己 → `ReferenceError: Cannot access 'palmTrunk' before initialization`。
- 解法：`place` 内**延迟取用**：`place(k, …) { placePalm(…, palmTrunkStrip.mesh) }`，`let` 声明 + 赋值分开，实排在装配后进行（`place` 只在 `update()` 里被调）。

**2. 在 `createQuality` 的回调里调用 `quality.xxx`（同样是 TDZ）**
- 现象：`createQuality(…)` 构造末尾会 `apply('init')` → 回调 `applyQuality` 里用 `quality.applyToRenderer(tier)` → 此时 `const quality` 还没赋值完。
- 解法：把渲染器落地逻辑抽成**独立导出** `applyToRenderer(THREE, renderer, tier)`，`main.js` 直接调它，实例方法只留壳。

**3. `ui.handlers` 换对象 = 机位按钮点了没反应**
- 现象：`createUI({ handlers: {} })` 在构造时捕获 `h`；main 里 `ui.handlers = ui.handlers || {}` 造了个新对象，机位按钮的 `h.pickRig` 永远是 undefined。
- 解法：`createUI` 把**同一个对象**返回（`handlers: h`），main 只往它身上挂属性，不换引用。

**4. `<canvas id="gl">` 漏写 → 页面全黑**
- 现象：`document.getElementById('gl')` 返回 null，`new THREE.WebGLRenderer({ canvas: null })` 静默自建一个不在 DOM 里的 canvas，渲染成功但什么都看不到。
- 解法：补 `<canvas id="gl">`；smoke 加「`ui.js` 引用的每个 id 必须在 `index.html` 中存在」的断言（顺带把 `#gl`/`three.min.js`/`main.js` 钉住）。

**5. `light.target` 没进场景图 → 方向静默指向世界原点**
- 现象：`rim`（暖侧光）与月光的位置随骑行者移动，但光照方向不变（target 的 `matrixWorld` 从未更新）。
- 解法：`group.add(rim.target)`、`group.add(moonL.target)`；`sun.target` 本来就有，补齐另两盏。

**6. 共享材质写透明度会互相覆盖**
- 现象：车头灯与路灯共用 `kit.mat.lampGlow`，`rider` 每帧写 `beam.material.opacity` → 路灯跟着忽明忽暗。
- 解法：**单点写入**：每帧由昼夜统一给 `lampGlow.opacity = day.lamp * 0.9`，组件只切 `visible`。

**7. GLSL `normalize(vec2, float)` 编译不过**
- 现象：海面片元写法在 r128 的 `ShaderMaterial` 下编译失败（黑屏，控制台一条 shader 错误）。
- 解法：把「斜率 + 振幅」显式组成 `vec3 n = normalize(vec3(sx, 1.0, sz))`；smoke 正则钉住「不出现 `normalize(vec2(`」。

**8. 粒子 z 环绕把相对偏移当绝对坐标**
- 现象：水花粒子跑飞（z 落在骑行者之后很远）。
- 解法：`pZ` 存**绝对 z**，只在 `[riderZ-120, riderZ+420]` 窗外时环绕，别把相对/绝对混在一个变量里。

**9. 实例密度用 `mesh.count` 截尾 = 稀疏不匀**
- 现象：低档时远处植被整段消失，近处全满。
- 解法：`count` 只用于海鸥/云这类动画实例；静态道具按 `(tileKey, i)` 稳定哈希跳过实例（空间均匀稀疏），换档时清 `_keys` 重排。

**10. CSS 类名与 input 写的类名不一致**
- 现象：拖拽时指针没变 `grabbing`（CSS 选择器是 `#gl.dragging`，JS 写的是 `drag`）。
- 解法：统一为 `dragging`（CSS 是页面内真相）；键位与样式改动同步跑 smoke。

**11. Windows 控制台中文回显是乱码**
- 现象：`pwsh` 里 `echo`/`Get-Content` 中文全是 `??` 与乱码，容易据此判断「文件坏了」。
- 解法：**判断文件内容只用 `read` 工具**；控制台只做 ASCII 输出。写中文一律走 `write`/`edit` 工具，不经 PowerShell 参数。

**12. 脚手架 CLI 传中文参数被 PowerShell 编码吞掉**
- 现象：`tools/new-page.js` 生成的 `registry.json` 标签里中文变成 `3`、标题乱码。
- 解法：注册项改用 `edit` 工具直接改 `registry.json`（不经过命令行参数）。

## 二、真机截图复核轮（2026-11-21 02:00–02:30）

首屏在浏览器里跑起来后暴露的第一批「Node 测不到」的问题。`tools/shot.mjs`（CDP 探针）是唯一能看见画面的手段。

**13. `new document.createElement('canvas').constructor(w,h)` → `Illegal constructor`**
- 现象：启动第 1 步「生成程序化贴图」就抛 `TypeError: Illegal constructor`，页面进回退面板。
- 原因：`ctxOf` 里取 `canvas.constructor`（= `HTMLCanvasElement`）再 `new`。DOM 元素构造器**不能直接 new**（规范如此）。
- 解法：浏览器分支用 `document.createElement('canvas')` 然后 `cv.width/height`；只有 Node 侧注入的构造器（nodeCanvas 风格 `new Ctor(w,h)`）才走 `new`。smoke 钉住「不得出现 `document.createElement('canvas').constructor`」。

**14. `put(px, …)` 里写 `px.data[i]`，而调用方传的就是 `img.data`**
- 现象：`TypeError: Cannot set properties of undefined (setting '0')`，仍是贴图那一步。
- 解法：`paint()` 已取 `const px = img.data`，`put` 直接 `px[i] = …`。smoke 钉住 `!/px\.data\[/`。

**15. 探针吃 5 分钟缓存：改了代码，页面还跑旧代码**
- 现象：修完 `ctxOf` 重跑探针，报错行号还是旧文件的行号。dev 服务器 `Cache-Control: public, max-age=300`，ES module 子模块全被缓存。
- 解法：探针连上后 `Network.enable` + `Network.setCacheDisabled{cacheDisabled:true}` + `Page.reload{ignoreCache:true}` 再等就绪。**任何自动化截图复核都必须先关缓存**，否则「修了没生效」。

**16. GLSL 同一作用域 `float sx` 声明两次 → 海面 shader 编译失败**
- 现象：控制台一条 `Fragment shader is not compiled … 'sx' : redefinition`，海面整块不见。
- 解法：把岸边 LUT 那个改名 `shore`。smoke 加 `glslDeclLint()`：按段扫自定义着色器里的局部 `float/vecN` 声明，重名即失败（`uniform/varying/attribute` 每段各一份，属正常，跳过）。

**17. sRGB 显示值当线性用：地面荧光绿、黄昏整片发白**
- 现象：截图里草地是亮黄绿，黄昏海面与天空是扁平橙色；车道线亮黄发光的程度夸张。
- 根因：`renderer.outputEncoding = sRGBEncoding` 下，材质色、顶点色、关键帧颜色都按**线性**参与光照与输出编码，而我写的全是设计时的 sRGB 显示值 —— 等于被调亮一遍。
- 解法：① `utils.toLinear()`（`srgbToLinear`）；② `buildTextureKit` 末尾统一 `color.convertSRGBToLinear()`；③ 地形顶点色、天空关键帧 uniform、光照色、海面 uniform 全部 `toLinear()`；④ 自定义着色器（天空穹顶 / 海面）在 `gl_FragColor` 后补 `#include <tonemapping_fragment>` + `#include <encodings_fragment>`，与内置材质同一条输出链；⑤ 开 `ACESFilmicToneMapping`，曝光 0.98。

**18. 鹈鹕 bob 覆写了装配位置 → 鹈鹕躺在地上**
- 现象：截图里鹈鹕平躺在路面，不在车座上。
- 根因：`pelican.update()` 里 `group.position.y = bob + bobY` 把 rider 装配时写的座高（0.705）覆盖成 0。
- 解法：首帧记 `baseY = group.position.y`，之后只**叠加**：`group.position.y = baseY + bob + bobY`。smoke 钉住 `baseY === null` 与 `= baseY +`。

**19. 星星在黄昏天上浮出白点**
- 现象：黄昏截图天空一片白色方块。
- 根因：`opacity = night * 0.9`，黄昏 `night≈0.3` 就是 0.27，加性混合下很显眼。
- 解法：`smoothstep(0.42, 0.82, night)`，只在夜里显形。

**20. 相机贴地钳制用了「路面高度」，海边机位被顶成一堵墙**
- 现象：海边低机位截图整屏是石壁纹理。
- 根因：`minY = basis.groundY + 0.35`（路面高度 - 0.6），把想压到海面上的相机顶到路面高度。
- 解法：`rig.setGroundSampler(terrainHeight)`，钳制改采样**相机所在位置的真实地形**（海面处地形是负值，相机可以贴到水面上方）。

**21. 探针的 `ws.onmessage` 被第二次赋值顶掉**
- 现象：探针跑满超时、一行输出都没有（PowerShell 还会缓冲 stdout）。
- 根因：Node 的 `ws.onmessage` 是赋值语义，后写的「控制台捕获」把前一个「CDP 响应分发器」顶掉 → 所有 `send()` 永不 resolve。
- 解法：只保留**一个** `onmessage`（内部按 `id` 分发 + 顺带采集 console）；`send()` 带超时；进度 `fs.appendFileSync('run.log')`。smoke 钉住「`ws.onmessage =` 只出现一次」。

**22. `toLinear` 用了没 import → 每帧 ReferenceError（画面冻住）**
- 现象：探针报 `EX: … sky.js:210`，帧循环从第一次 `update` 就断，截图是冻结画面。
- 解法：补 import。smoke 加「utils 导出：用了就必须 import」静态 lint（先剥掉模板字面量，避免 GLSL 里的 `clamp(` 误报）。

**23. 构造函数末尾的自检 `update()` 把 `baseY` 锁死成 0 → 鹈鹕还是躺在地上**
- 现象：第 18 条修完（`group.position.y = baseY + …`），截图里鹈鹕仍在脚踏旁；探针 `info()` 打印 `pelicanY = 5.255`，正好等于 `riderY`（偏 0.009），说明装配高度 0.78 被吃掉了。
- 根因：`createPelican()` 结尾会 `update(0.016, …)` 自检一遍，此时 rider 还没落座，`baseY` 在首帧被记成 **0**，之后每帧都在 0 上叠 bob。
- 解法：装配走显式 `pelican.setMount(x, y)`，由它写 `baseY = y`；自检后把 `baseY = null` 复位。经验：**「懒初始化时读一次外部状态」的写法，在构造流程里会被自检调用抢先**。smoke 钉 `setMount` + `baseY = y;`，并钉 rider 只走 `setMount`。

**24. 探针的 readiness 只看 `#fallback.show`，SyntaxError 会干等 75 秒**
- 现象：`terrain.js` 里 `const dry` 重复声明 → 模块解析失败，页面连 `<script>` 都没跑起来，探针空转到超时。
- 解法：① smoke 增加「对 18 个 `js/*.js` 逐个 `node --check`」的语法门（比浏览器快 100 倍）；② 探针就绪循环顺带看 `consoleErrors` 里的 `SyntaxError` 并立即 bail。

**25. 远处 alpha 精灵变成一排白色方块（海鸥、云）**
- 现象：黄昏/夜间截图里天上飘着 20 多个硬边白色小方块。
- 根因：`CanvasTexture` 默认开 mipmap。稀疏 alpha（鸟剪影、云朵）在 mip 链里被**平均**成接近不透明，缩小后整块 quad 变实心。
- 解法：给这类「远距离 alpha 精灵」贴图关掉 mipmap（`generateMipmaps = false; minFilter = LinearFilter`），在 `makeTexture` 里按 `entry.noMip` 分流（`cloudOpts` / `gullOpts` 打上 `noMip: true`）。近处用 `alphaTest` 的草叶、棕榈保留 mipmap（各向异性过滤更划算）。

**26. 夜间海边低机位：路灯光晕糊满天空**
- 现象：`6 海边` 机位在 `t≈0.96` 的样片里，天空是一片暖黄。
- 根因：海边机位贴地（相机 y ≈ 0.5 m）低于路面，正对 42 m 一盏的路灯灯头（`lampGlow` 加法混合）与地面光斑，加法混合在近处被拉成大面。
- 解法（当前取舍）：夜间样片固定用 `follow` 机位；海边机位夜间作为「已知观感限制」记录。后续可把灯头光晕换成 sprite + 距离衰减，或让海边机位在夜间抬到路面上方。

**27. 夜间远山变成暖棕大块、天空泛暖（已收敛，根因见 28）**
- 现象：`t=0.965` 的跟拍样片里，左侧远山是一整块暗红棕，天空上半部泛暖黄；地面、路面、护栏的夜间明暗是正常。
- 排查手段（值得留）：`__pbike.pick(nx, ny)` 从屏幕像素发射射线，打印沿途物体的 `type#id` / 命中距离 / 命中点 / `material.color.getHexString()` / `material.type` / 是否加法混合。一次射线就把「这团颜色是谁画的」钉到 `Mesh#91`（一对 139 m 与 201 m 的入/出射 = 一个闭合锥体）。
- 当时确认：夜空着色的 `uNight` 门（太阳/暖色扩散/星/月）与雾色都对，天穹本身夜里是暗的；异常来自远山/地面这层的材质色。
- **已收敛**：根因是 28 的 `C()` 十六进制解析错位 —— 拾取到的 `#671405` 就是被错位解析出来的关键帧色。修 `C()` 之后同一条射线的夜里命中色变成 `#020306`、白天 `#54697e`；`toneMappingExposure` 与远山夜间收拢保留为兜底。教训：**「这层材质没被昼夜压暗」这类推断，要一直追到颜色数值的来源函数**，别在中间层停下。

**28. 整屏偏红偏黄总根因：`C()` 从 `slice(1,3)` 切 6 位十六进制（不带 `#` 的写法）**
- 现象（贯穿始终）：黎明/正午截图整屏发木的橙红、lime 黄；夜里天空平涂暖黄 + 暗红大块。前一轮把 sRGB→线性、ACES、曝光、`tonemapping_fragment`、雾色、材质色全查过一遍，方向对但不彻底。
- 根因：`sky.js` 关键帧写成 `C('060c1e')`（**不带 `#`**），而 `C` 的实现是 `parseInt(h.slice(1, 3))` —— 它假定字符串带 `#`。于是每个颜色都往后错位两位：`060c1e` 被读成 `(0x60, 0x0c, 0x1e)` = 饱和橙红，`3d6398`（天顶蓝）被读成 `(0xd6, 0x39, 0x98)`。天空/半球光/雾色/地面色全部来自这张表，所以「怎么调曝光都不对」。
- 定位方式：绕开渲染层，直接在 Node 里 `sampleDay(0.5).top` 打印数值 —— 正午天顶是 `(0.84, 0.29, 0.05)`，一眼看出是橙。渲染层怎么绕，纯函数一眼看穿。
- 解法：`C()` 先剥 `#` 再从 0 位切三段；smoke 增加「正午天顶必须蓝 > 红且是亮蓝、深夜天顶 = 暗蓝、黄昏地平线暖色」等断言 + 「关键帧色号全为 6 位十六进制」的解析门。
- 经验：**颜色异常先查「取颜色的那个函数」的输入输出，不要从光照/曝光开始猜**。一条 `console.log` 关键帧数值省掉一轮着色器排查。

**29. 自行车整辆陷进地面、鹈鹕双腿悬空、永远低头（三个几何问题一次改）**
- 现象：用户看真机截图指出：① 车轮在路面以下约 0.34 m；② 鹈鹕腿够不到踏板（吊在空中）；③ 鹈鹕一路俯冲低头。
- 根因①：`bike.js` 的局部原点 = 中轴/轮轴平面（轮心 `y=0.03`），`rider.js` 装配时把 `bike.group` 直接放在 `y=0` —— 于是轮底在地面以下一个轮半径。解法：`const bikeY = RIDE.wheelR - 0.02; bike.group.position.set(0, bikeY, 0);`，座垫高度 `SADDLE.y` 由 `bikeY + 0.74` 反推，`pedalCy` 也跟着换算，不再写死数字。
- 根因②：`THIGH = 0.30` / `SHIN = 0.32`，合计 0.62 m，而髋 → 踏板最远点需要 0.75 m，IK 被夹到极限 → 腿悬空。解法：0.42 + 0.46，并把 IK 的 `th1 = phi - acos(cosA)` 改成 `+ acos(cosA)`（取「膝朝前」那组解：大腿向前下、小腿往后下踩踏板）。
- 根因③：`body.rotation.z = -0.52`（-30°）叠加颈链 -0.12 与头部 -0.16 = 全程俯冲。解法：躯干 `-0.06`、首节颈 `-0.38`、头部 `0.10 - nod·0.5`（只随点头微调）。
- smoke 钉：`bike.group.position.set(0, bikeY, 0)`、`SADDLE.y` 与 `bikeY + 0.74` 精确相等、从 `pelican.js` 源码解析出 `THIGH`/`SHIN` 后算 `髋→踏板最远/最近距离` 并断言落在 `(THIGH+SHIN)·[0.42, 0.985]` 区间内、躯干/头部姿态常数、IK 取号。**腿长这类装配约束，用源码里的常数解出方程来断言，比截图更早发现。**

**30. 坐标架不严格正交 → 模型被剪切（`frameOf` 的 up 是常量世界向上）**
- 现象：坡度段上骑行者形变，像被斜切；截图里腿与轮「对不齐」。
- 根因：`frameOf` 里 `up` 只按侧倾角从世界向上偏移，没随坡道法线抬后仰；`forward` 带坡度上仰分量后，`forward · up = 0.011`（≠ 0），`THREE.Matrix4.makeBasis` 不做正交化 → 基向量不正交 = 剪切。
- 解法：先由 `forward` 求路面法线（垂直剖面内正交），`up = n·cos lean − right·sin lean`，再 `right = forward × up` 反生一次，三方严格正交；smoke 断言三个点积 `< 1e-6`，并断言「坡道上 `up` 真的后仰、不是常量 `(0,1,0)`」。
- 经验：**自己拼基向量就要自己负责正交**；`makeBasis` 不会帮你修。

**31. 鹈鹕双腿「缺少链接」：三处各说各话（腿段 ↔ 腿 ↔ 脚踏 ↔ 轮）**
- 现象（用户看图指出）：双腿在膝处看着是断开的；脚掌不踩踏板，自己绕圈；往前骑时车轮在倒转。
- 根因①（腿段之间）：腿只有 `hip → knee → foot` 三根圆柱，**段间没有关节体**。圆柱端盖是平的，膝一弯两段之间就露出缺口 → 观感 = 「缺链接」；股骨还整根裸露在躯干之外（鸟类的股骨本该藏在羽领里，可见的那颗关节是踝）。
- 根因②（腿 ↔ 脚踏）：车上脚踏画在 `(L·sin p, L·cos p)`（臂静止朝 +Y，曲柄组绕 Z 转），腿 IK 的目标写成 `(cx + L·cos φ, cy + L·sin φ)`，`φ = crankPhase + π`。**cos/sin 互换 → 目标比脚踏超前 90°；相位符号反 → 脚与脚踏一个顺转一个逆转**，每圈最大张开 2L = 0.34 m，画出来就是「脚脱开踏板空转」。左腿再叠的那个 `π` 直接把两腿镜像。
- 根因③（轮 ↔ 曲柄）：`wheelR/wheelF.rotation.z = +wheelPhase`（倒车），`crank.rotation.z = -crankPhase`（正转）。链条把后轮、牙盘、曲柄串成**同一转向**，两处符号必须一致，于是画面里「人在往前骑、轮子在倒转」。
- 解法：
  1. 腿按骨骼链装配：`hip → thighPivot〔股骨 + 羽领〕→ knee〔膝链接球 + 踝链接球〕→ foot〔蹼足：掌 + 三趾 + 后趾〕`，每一节挂在上一节之下（场景图层级 = 运动链），关节处放链接体；同材质图元 `mergeGeos` 烘成一份几何体（一腿 3 个 draw call，低档 161 → 153）。
  2. `config.pedalOffset(side, crankPhase, len)` 成**唯一**的相位解算：`bike.crank.rotation.z`、曲柄臂的横向偏移（`RIDE.pedalZ`）、腿 IK 的踏板目标三处同读它 —— 腿链在曲柄相位上，脚与脚踏一起转。
  3. `RIDE.CRANK_SIGN = -1`：前进 = 局部 +X，绕 Z 负向旋转才让轮顶朝前进走；轮与曲柄统一用它转。
  4. `FOOT_SOLE = 0.037`：IK 目标 = 踏面 + 掌底深度 → 掌底踩在踏面上（`__pbike.legs()` 间隙读数 0.043–0.060 m，随踏相位摆动），不是陷进踏板。
  5. 髋摆在脚踏平面内侧（`side·(RIDE.pedalZ − HIP_X)`）+ 整腿绕 X 外撇 `PEDAL_SPLAY`：把脚踝送到 ±0.115 的脚踏平面上（残差 < 0.01 m）。
- 新增复核口径：`__pbike.legs()` 打印每腿踝/脚踏世界坐标、间隙、膝角、髋角；`__pbike.legCam(true, d, lat)` 冻住相机贴腿取景（软渲染下一张图要几十秒，而机位偏移 3.5 s 后自动归零 → 靠鼠标偏移取特写必被拉回远景）；smoke 用 64 个踏相位断言 IK 全程不被夹、`pedalOffset` 与曲柄臂旋转逐点一致、腿链 4 层父子 + 3 个链接体、`CRANK_SIGN` 三处符号。
- 经验：**「缺链接」缺的不是模型，是约束。**腿、脚踏、轮各自算自己的相位时，Node 里没有任何一条断言知道它们该一致；把相位收敛成**一个纯函数**才有可断言的接口。装配类问题（腿长够不够、脚踩得到吗、掌底陷不陷）用源码里的常数在 Node 里解方程，比截图更早更准；截图只负责确认「这确实是一双腿」。
