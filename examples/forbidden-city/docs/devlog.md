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
| 2026-11-08 21:15 | **阶段 3**：layout.js 数据表（14 条中轴建筑 + 廊庑/景山，全部按实测值）+ parts.js G01–G21 构件（台基/栏杆螭首/instanced 柱网/斗栱/庑殿·歇山·四角攒尖三种屋顶/脊兽/鸱吻/菱花扇门/城楼/廊庑/亭/桥/城墙/角楼）+ uildings.js 按 form 派发的组合器 + world.js 接入 | 用户要求「中轴三大殿可以进入内部查看」——先把形制与尺度做对，阶段 6 才有可入内的真结构；构件不 import three 才能整条链路在 Node 里跑通 | smoke 装配段全绿（Mesh 1283 / 实例 6306 / tris 25.6k / 材质 20）；headless draw 1212 / 162k tris；截图复核地面在下、建筑直立 |
| 2026-11-08 22:15 | **三档视角**：新增 `js/camera.js`（纯逻辑 CameraRig + CAM_MODES/OVERVIEW/overviewPose/axisCenter），漫步 / 飞行（46 m/s）/ 俯瞰（绕取景中心轨道旋转 + 滚轮缩放 + ←→ 沿中轴跳档）；HUD 左下角档位按钮 + `V`/`1`/`2`/`3` 键位；input.js 加 `consumeZoom()` / `vertical()` | 用户反馈「只能漫步太慢」，要能一键看全局；相机拆成纯逻辑模块才能不开浏览器就验算机位 | smoke + headless 全绿；`camlogic.mjs` 11 条机位断言全过；截图 v-overview / v-focus / v-walk |

| 2026-11-10 00:40 | **阶段 4（第一批）**：① 合批先行——`parts.js` 新增 `mergeGroup()` 按材质烘顶点、`world.js` 装配后统一跑一次；小体量构件（亭、内/外桥、桥栏）加 `instanced:false` / `railInst:false` 开关走「非实例化 + 合批」；② 午门凹字——`layout.wumenPlan` + 新构件 `cityPlatform`（红墙台体 + 券洞 + 海墁 + 女墙垛口）/`ruffTop`（盝顶），`buildings.wumen()` 从简模换成「城台 + 重檐庑殿五凤楼 + 两翼廊庑 + 四角亭 + 前两攒尖 + 后四盝顶」；③ 内金水河——新构件 `river`（河床 + `name='water'` 水面 + 石堤压顶）/`bridgePavilion`，`bridgePlan` 改「御路桥居中五孔 + 内桥 pair + 外桥 pair 带三间桥亭」并消掉旧版 x 重叠，`linear()` 把东西廊庑 `z0` 推到 -336 围合午门广场 + 补一对 `queLeft/queRight` 阙亭 | 用户要求「检查执行步骤，继续进行」；§4 的三项里合批是**门槛**：不先把 1212 calls 压回 260，后面每加一座建筑都在往超支里加。午门/河按 research.md §2 只做通识级（置信 medium），按「视觉比例优先 + TODO(verify)」落 | drawCalls 216（预算 260）／246（俯瞰视野），tris 51.2k、材质 21、贴图 24.69 MB；smoke 装配段全绿（新增 12 条：凹字对称 + 五券门 + 桥系对称/亭 + 围合廊 + 阙亭）；headless 7/7；俯瞰截图从白濛变成整城可读（顺手修了俯瞰雾距，见踩坑 16） |

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

**8. HUD 卡在 `-- fps / draw --`（rAF 时间戳与 performance.now 混用）**
- 现象：阶段 3 装配后 headless 探针读到 `0 fps`、HUD 文本仍是 `-- fps`，看着像主循环没跑。
- 根因：headless 里 `ui.toast()` / `hideLoading()` 的 `setTimeout` 回调会先于 rAF 执行并推进虚拟时钟；`UI.update` 用「rAF 的 now − 启动时的 performance.now()」算 dt，得到**负数**被夹成 0 → 累加器 `_acc` 永远不到 0.25 s，HUD 一次都没写。
- 解法：`ui.update(now, …)` 直接传 rAF 的 `now`（见 PROGRESS.md D15），不再混用两套时钟。
- 影响面：任何「按时间片刷新」的 UI 计数都只用单一时钟；调试这类问题先 hook `UI.prototype.update` 打印入参，而不是猜主循环没跑。

**9. r128 背面剔除不吃 `scale(-1)`：天穹变成全屏灰幕**
- 现象：整个画面被一层灰盖住，建筑完全看不见。
- 根因：想用一个负缩放反翻三角朝向来代替 `side: BackSide`，但 r128 判定正反靠的是**投影面积的正负**，实测 `matrixWorld` 行列式仍是 +1 → 球内侧照样被剔掉，露出的是清屏色/雾色。
- 解法：相机在球心只能看到内表面，老老实实 `side: THREE.BackSide`（world.js 注释已记因）。
- 影响面：负缩放不能当反翻用；类似「看不见但几何确实在」的问题先查剔除与 side。

**10. 整屏上下颠倒：lookAt 残留欧拉角与 YXZ 叠加成翻滚**
- 现象：截图里地面在上、建筑倒挂，而 `camera.up` 明明是 (0, 1, 0)。
- 根因：`world.js` 里 `camera.lookAt()` 留下的旋转（order 默认 XYZ，z 分量 ≈ π），与 main.js 运行时 `rotation.set(pitch, yaw, 0)`（YXZ）叠加 → 等效翻滚 π。
- 解法：`world.js` **只摆机位不做 lookAt**，朝向全部交给控制器（D18）。截图探针也必须按 YXZ + up=+Y 设机位，才与真机一致。
- 影响面：任何「场景装配函数」都只提供初始位置；相机朝向是控制器的职责。

**11. 自我复读：反复跑同一支探针却以为修复无效**
- 现象：换了文件名跑截图，得到的 png 字节数与 sha256 完全一致，我却当成「改动没生效」继续加码，一次会话里空转十几轮相同命令。
- 根因：读图时上下文里的旧图被重复引用；没有先确认磁盘产物真的被覆盖。
- 解法（已记进 D19）：截图前先 `Remove-Item *.png`；比对**磁盘上的 sha256** 而不是重看老图；同参探针结果不变就停下读源码、换假设。
- 影响面：所有「跑一次看看」的可视化验证都要制造可辨识的新产物（删旧图 / 新文件名 / 打印关键数值）。

**12. 模式缓动当闸门 → 软渲染下输入被锁死几十秒**（PROGRESS.md D20）
- 现象：按「俯瞰」后摇杆、看视角全部无响应，约半分钟才恢复。
- 根因：main.js 把 `rig.update(dt)` 的返回值当输入闸门（过渡跑完才收输入）。SwiftShader 下每帧 dt 被夹到 0.05，1.9 s 的缓动要 ~38 s 才结束。
- 解法：`rig.update(dt)` 只推进过渡，**返回值不参与输入门控**；`isFlying()` 明确标为只读；检测到软渲染（`WEBGL_debug_renderer_info` 报 SwiftShader/Software）时切换走 `{instant:true}` 直接落位。
- 影响面：任何"平滑过渡"都不能顺手变成输入闸门；帧率下限环境要先算一遍 dt×时长是否远超预期。

**13. 俯瞰时整座城跟着镜头跑，天穹缩成背景一块黑**（PROGRESS.md D21）
- 现象：进俯瞰后画面里只剩地面贴图与一条城线，建筑整体消失；背景一大片纯黑。
- 根因：① main.js 的"地面视点跟随"没排除 overview，相机一挪 `ground.position` 跟着挪 → 相对相机静止，等于整座城被搬走；② 天穹半径写死 `RENDER.far × 0.55 = 1430`，而俯瞰机位高 946 m、距轴心 ~1.6 km，球壳把镜头甩在外面。
- 解法：overview **不挪地面**（阶段 4 chunk 化后再恢复跟随）；天穹半径写死 2400 > 最远机位；成就的到访判定也排除 overview（机位上千公尺高，拿它的 z 判"走到过"会误报）。
- 影响面：所有"跟随相机"的逻辑都要显式列出适用模式；场景包围体尺寸要与最远机位一起算。

**14. `focus()` 想对准某座殿却毫无反应**（PROGRESS.md D22）
- 现象：把取景目标设成太和殿，画面纹丝不动。
- 根因：正中俯视下"把目标变成画面中心"只是换视线方向；而且函数末尾又调了一次 `orbit()`，用旧的 `flat` 重算机位，把刚做的平移覆盖回去。
- 解法：focus 改为**平移取景中心 + 相机同步平移**（保住水平距离与高度），末尾不再调 `orbit()`；`camlogic.mjs` 加断言钉住"画面中心命中午门"。
- 影响面：轨道类控制器的 setter 要区分"挪视点"与"挪目标"，别在同一个函数里既平移又重算轨道参数。

**15. 合批后「几何断言」集体失效：合并过的 mesh 查不出 `BoxGeometry` 参数**
- 现象：`world.built.group` 上写的三条装配断言（宝顶颗数 / 水面材质 / 桥面厚度）跑出 `0 颗宝顶`、`无水面`、`0 座桥面`，而截图里明明看得见。
- 根因：`mergeGroup()` 把同材质 Mesh **烘进一份顶点合并**，`geometry.type` 变成非命名几何、`parameters` 与 `name` 全丢；断言找的是命名几何，自然全空。
- 解法：这类「看形制对不对」的断言改在 **builder 的未合批输出**上测：`B.wumen(THREE, kit, L.byId('wumen'))`、`B.bridges(THREE, kit, L.byId('innerRiver'))` 直接调；`built.group` 只用来测包围盒、材质种类与 Mesh 批次。
- 影响面：断言有两套口径——**装配层测合批结果（批次/材质/bbox）**、**builder 层测形制（几何参数）**，混用就会出现「肉眼有、断言无」的假失败。

**16. 俯瞰档把整座紫禁城糊成白雾**（PROGRESS.md D23）
- 现象：`3` 号俯瞰 + 跳档到午门后截图，画面几乎全白，只剩地面与一圈城墙线；同机位漫步档却是清楚的。
- 根因：俯瞰机位在 ~950 m 高空、水平距离可到 2200 m，而雾距按画质档只有 `low 620 / mid 900 / high 1400`（`RENDER.far` 才 2600）——镜头与整座城全在雾的 far 之外，被 fog 颜色盖满。
- 解法：把雾距交给视角档联动——`camera.js` 的 `OVERVIEW` 增 `fogNear 380 / fogFar 2400`，`main.js` 加 `applyFog(mode)`：进俯瞰用远雾，出俯瞰回画质档；`quality.apply()` 会重写 `fog.far`，故 FPS 自动降档后立刻补一次 `applyFog(rig.mode)`。
- 影响面：任何「按相机高度决定可见距离」的档，都要显式带一份雾参数；画质档的雾只对地面档有效，别当全局参数用。

**17. 实例数从 6306 掉到 6076 时，护栏断言险被误伤**
- 现象：内/外单孔桥的栏杆改 `railInst:false`（小体量走合批）后，`instCount >= 6000` 这条护栏从 6306 掉到 6076，离下限只剩 126。
- 根因：断言写的是「实例总数」这种**会随策略漂移的量**，而真正要钉的是「大构件必须实例化」。
- 解法：留阈值继续跑（本轮不改）；阶段 5 加台基/螭首时**优先用实例化**补回余量，若策略再变则把断言改成按构件类别查（`columnGrid` / 走兽 / 斗栱 各自必须是 InstancedMesh）。
- 影响面：阈值贴近实测值时要在注释里写清「为什么留这个数」，否则下次合批优化会一头撞进假失败里。

## 性能与兼容性记录

- **入口体积**（阶段 1）：`index.html` 7.9 KB + `css/main.css` 1.9 KB + `js/*` 合计约 38 KB（config 4.6 / state 7.8 / quality 4.8 / world 3.4 / ui 4.0 / input 6.2 / main 8.0）；运行时依赖只有 three.min.js **603 KB**（已入库，非本页新增）。
- **贴图工厂**（阶段 2）：`js/textures.js` 约 26 KB 源码 → 18 张程序化材质，GPU 显存实测 **24.69 MB**（口径 w×h×4B×1.33；预算 128 MB）。首次生成耗时在 headless SwiftShader 下不明显（页面加载即收起进度条），真机待阶段 9 复测。
- **帧率基线**：headless SwiftShader（无 GPU 软渲染）1280×720、空场景 → **32 fps**。这是纯 CPU 光栅化的下限参考，不代表真机；有 GPU 的桌面/手机需另测（阶段 9 / 11）。
- **三档视角开销**（补丁）：漫步 792 calls / 153k tris，俯瞰 1212 calls / 162k tris —— 差值来自视锥剔除而非模式本身；俯瞰 fov 74、离地 ~946 m 会看到整座城，所以批次更高。移动端默认档在 overview 下需复测（阶段 9）。
- **合批后的开销**（阶段 4 第一批）：`mergeGroup()` 落地后同一场景 **漫步 216 calls / 181k tris，俯瞰 246 calls / 185k tris**（1212 → 216，`BUDGET.drawCallsMid = 260` 达标）。代价是**顶点数换了批次**：smoke 装配统计 Mesh 243 / 实例 6076 / tris 51.2k（页面含地面与视锥内全量，所以 HUD 读数比 smoke 统计高），后续加建筑先看 calls 再看 tris。
- **俯瞰的雾**：俯瞰档 `fogNear 380 / fogFar 2400`（画质档 620–1400 只给地面档用），`main.js` 的 `applyFog(mode)` 负责联动。
- **相机模块体积**：`js/camera.js` 约 8 KB / 240 行，纯逻辑无 DOM 依赖 → 可在 Node 侧直接验算机位（`tools/out/camlogic.mjs` 口径，正式断言待并入 smoke）。
- **测量方法**：`tools/headless.mjs`（CDP 读 `renderer.info`）+ HUD 常驻读数（`H` 键切换）。
- **测试过的环境**：Chrome headless（new）+ SwiftShader，Windows；ES module 经 `node server.js` HTTP 访问正常。真机 iOS Safari / Android Chrome 待阶段 9。

## 拆分记录

| 日期 | 从哪拆到哪 | 触发原因（行数 / 职责混杂 / 复用） | 模块边界 |
| --- | --- | --- | --- |
| 2026-11-08 | 脚手架即按 `--split` 生成；随后把模板的 `render.js` 改名为 `world.js`，并新增 `config/quality/ui/state` | 3D 场景与 2D canvas 的职责不同：需要「数据 → 构件 → 装配 → 碰撞」四层，而非单一渲染层 | **纯逻辑层**（顶层不碰 DOM，可在 Node import）：`config.js`、`state.js`；后续 `layout.js`、`collision.js`。<br>**渲染层**（可碰 THREE，由 main 注入全局）：`world.js`、`quality.js`、后续 `textures/parts/buildings/interior`。<br>**DOM 层**：`ui.js`、`index.html`、`css/`。<br>**输入层**：`input.js`（只产出意图，不碰场景）。 |
| 2026-11-08 | `state.js` 里划出 `/* ENGINE-START */ … /* ENGINE-END */` | 成就判定 / 分区 / 存档迁移是可单测的纯函数，IO 只留在段外 | 段内禁止 `document/window/localStorage/navigator`；smoke.mjs 有对应断言 |
| 2026-11-08 | 阶段 3 拆出 `layout.js`（数据）/ `parts.js`（构件）/ `buildings.js`（组合），`world.js` 只做装配 | 用户要求「整体结构严谨」：尺度必须单一来源、构件不许写死建筑尺寸，且整条链路要能在 Node 里跑通 | **纯逻辑层**新增 `layout.js`（不碰 DOM/THREE）。<br>**渲染层**：`parts.js`、`buildings.js` **不 import three**，由 caller 注入 THREE；`world.js` 只管 kit / rebuild / 光照雾。<br>阶段 6 的 `interior.js` 与阶段 8 的 `collision.js` 都从 `layout.js` 的 entries（含 fp/cz）派生 |

## 提交历史

```bash
git log --date=format:'%Y-%m-%d %H:%M:%S' --format='%ad %h %s' -- examples/forbidden-city/
```
