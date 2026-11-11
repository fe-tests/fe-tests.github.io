# 3D 故宫游览 · 接续协议（PROGRESS）

> **这是续做的唯一入口。** 新会话只按顺序读三份文件即可接手：
> `README.md` → 本文件 → [docs/devlog.md](devlog.md)（细节），需要数值出处时查 [docs/research.md](docs/research.md)，加素材前查 [docs/assets.md](docs/assets.md)。
> 每完成一个阶段：**先更新本文件的四节，再提交**。不要只写 devlog——本文件是压缩后的真状态。

---

## 1. 当前阶段

**阶段 7 全部完成（内廷与后苑：乾清门 + 东西六宫 + 御花园钦安殿 + 景山万春亭，随本条提交落地）→ 下一步做阶段 8（`collision.js` AABB + 台阶吸附 + `player.js`，替换 main.js 临时行走；`entries[]` 的 `fp/y/cz` 已备，六宫 fp 走窄巷制）。**

- slug：`forbidden-city` · 入口：[index.html](../index.html) · 注册项：`registry.json` 最后一条（`status: alpha`）
- 依赖：**Three.js r128**（已入库，未新增 vendor 文件）→ `../../assets/vendor/three/r128/three.min.js`
- 分支 / 提交约定：站内直接提交到主干；提交信息前缀 `feat(forbidden-city):` / `docs(forbidden-city):`

## 2. 已完成

| 阶段 | 内容 | 落盘物 |
| --- | --- | --- |
| 0 | `tools/new-page.js forbidden-city --split` 生成目录；registry 追加一条（title「3D 故宫游览」，tags threejs/3d/mobile/故宫/触摸，status alpha） | `examples/forbidden-city/{index.html,README.md,css/main.css,js/{main,state,render,input}.js}` |
| 0 | 联网调研沉淀：全局尺度、外朝中轴序列、三大殿实测数据（面阔 63.96 m / 进深 37.20 m / 通高 35.05 m / 台基 8.13 m）、形制术语→构件对照、r128 生态可用性 | [docs/research.md](research.md) |
| 0 | 素材台账：零二进制决策 + 18 个贴图工厂槽位 + 22 个几何构件槽位 + 6 个音频槽位 + 预算表 | [docs/assets.md](assets.md) |
| 0 | 设计计划（阶段 0–12）与许可红线记录 | [docs/design.md](design.md) §1–§4、[docs/research.md](research.md) §0 |
| 1 | 渲染骨架：`index.html` 全屏 canvas + HUD + 加载条 + 降级面板；`main.js` 启动流程（探测 THREE / WebGL → 失败面板，不白屏）、r128 色彩口径、主循环、resize/visibilitychange、横屏锁定 | `index.html`、`css/main.css`、`js/{main,world,ui,input}.js` |
| 1 | 画质档：三档（流畅/标准/精细）+ FPS 自适应降档 + 手动锁档；DPR 上限、阴影开关、雾距联动 | `js/quality.js` |
| 1 | 纯状态机：9 条成就表、分区判定 `zoneOfZ`、中轴里程碑、存档迁移与容错（损坏档/配额满/版本不符都不炸） | `js/state.js`（`ENGINE-START/END` 段） |
| 1 | 输入层：`body.touch` 开关、左半屏浮动摇杆 + 右半屏看视角、双指捏合调 FOV、WASD/Shift/H 键位 | `js/input.js` |
| 1 | **校验网**：30 条纯逻辑断言（数据表 / 成就幂等 / 存档往返 / 离线钉测 / r128 色彩口径）+ headless Chrome CDP 探针（THREE 版本、无异常、真实 drawCalls>0）+ 截图 | `tools/{package.json,smoke.mjs,headless.mjs}` |
| 2 | **素材工厂**：`textures.js` T01–T18 全部实现（琉璃瓦 / 汉白玉 / 金砖 / 红墙 / 菱花窗 / 门钉 / 彩画 / 蟠龙藻井 / 匾额 / 青铜 / 水面法线 / 天穹…）。工厂是纯 Canvas2D 函数，`makeTexture()` 才碰 three.js → 可在 Node 里注入 provider 测试 | `js/textures.js`、config 增 `TEX`/`TEX_BUDGET` |
| 2 | **贴图校验三层**：① shim 下 18 工厂全部可执行且确定性噪声可平铺；② 在 vm 里加载**真实 three.min.js** 钉测 `encoding/wrapS/anisotropy` 用法；③ headless 打样总览图供肉眼复核 | `tools/smoke.mjs`、`tools/preview-textures.mjs` |

| 3 | **数据表**：`layout.js` 纯数据（不碰 DOM/THREE）——14 条中轴建筑记录 + 廊庑/景山，全部按 research.md 实测值写死；`TERRACE` 三层须弥座（8.13 m = 3×2.71）；`footprint()/faceWidth()/byId()` 派生 API | `js/layout.js` |
| 3 | **构件库**：`parts.js` G01–G21（台基/栏杆/螭首/柱网 instanced/梁架/斗栱/庑殿/歇山/四角攒尖/檐层/正脊+走兽/鸱吻/菱花扇门/城楼/廊庑/亭/桥/城墙/角楼/树）。**不 import three**，由 caller 注入 THREE；举折起翘用 `roofProfile()` 的 `pow(t,1.62)` 曲线 | `js/parts.js` |
| 3 | **组合器**：`buildings.js` 按 `form` 派发到 `hall/gate/wumen/bridges/corridorRun/gardenTrees/hill`；`doorList()` 兼容数组与 `{south,east,west,north}` 两种门形制；`buildAll() → {group, entries[]}`，entries 带 `fp/cz/rec` 供阶段 8 碰撞直接复用 | `js/buildings.js`、`js/world.js` 接入 |
| 3 | **装配级校验**：smoke 4d 段用 vm 真实 three.min.js + Proxy ctx provider 跑通全场景（Mesh 1283 / InstancedMesh 79 / 实例 6306 / tris 25.6k / 材质 20），断言无 NaN 变换、太和殿 `x=0`、fp 半宽×2 = 实测面阔+出檐 | `tools/smoke.mjs` |

**验证记录（阶段 1）**：`node examples/forbidden-city/tools/smoke.mjs` → 全部通过；
`node examples/forbidden-city/tools/headless.mjs`（需先 `node server.js`）→ 7 条全过，REVISION=128、`draw 3 / 6 tris`、无异常。

**验证记录（阶段 2）**：smoke 新增 12 条断言后仍全部通过；贴图显存实测 **24.69 MB / 18 张**（上限 128 MB）；
打样图 `tools/out/textures.png`（不入库）肉眼复核一轮，已修 T04 浮雕对比度、T05 金砖太暗、T16 水面法线幅度过大。

**验证记录（阶段 3）**：smoke 全部通过（新增装配段共 40+ 条）；headless CDP 探针 7/7 过，`REVISION=128`、
`draw 1212 / 162k tris`、无异常。**注意：1212 drawCalls 已超 `BUDGET.drawCallsMid = 260`（见 §5 D16），阶段 4 起必须先合批再往里加建筑。**
截图复核（临时探针，跑完即删）确认地面在下、天穹在上、建筑直立：见 §5 D17/D18。
截图复核走 `tools/shot.mjs`（CDP 驱动按键摆位 + `Page.captureScreenshot`，图落 `tools/out/shots/` 不入库）。

| 4a | **合批先行**：`parts.js` 新增 `mergeGroup(root, THREE)`（按材质把普通 Mesh 烘成顶点合并；InstancedMesh 保留批次语义），`world.js` 装配后统一「组摆位 → `updateMatrixWorld(true)` → `mergeGroup`」；亭 / 内外单孔桥 / 桥栏改走「非实例化 + 合批」（开关 `pavilion({instanced})`、`railing({instanced})`、`bridge({railInst})`、`columnGrid({instanced})`） | `js/parts.js`、`js/world.js`；smoke 断言 `Mesh 数 ≤ BUDGET.drawCallsMid` |
| 4b | **午门凹字 + 五凤楼**：`layout.wumenPlan`（城台 60×12×14、两翼 `wingLen 76` 向 -Z 伸出、正面 `doors:[-12,-6,0,6,12]` 五券门、主楼重檐庑殿 9 间、前两攒尖亭 + 后四盝顶亭）；新构件 **G23 `cityPlatform`**（红墙台体 + 券洞 + 海墁 + 四圈女墙 + 每 3.2 m 一齿垛口 instanced）、**G25 `ruffTop`** 盝顶（四坡梯形 + 平顶盘 + 四脊 + 鎏金宝球）；`buildings.wumen()` 从简模改为凹字全套 | `js/layout.js`、`js/parts.js`、`js/buildings.js` |
| 4c | **内金水河 + 五孔桥 + 阙亭 + 廊庑围合**：`innerRiver.bridgePlan` 改「御路桥居中五孔（宽 48）+ 内桥 pair `x=±34` + 外桥 pair `x=±68` 带三间桥亭」（消掉旧版 inner/outer 的 x 重叠）；新构件 **G24 `bridgePavilion`**、**G25 `river`**（河床 + `name='water'` 水面用 `kit.mat.water` + 两岸石堤白石压顶）；`linear()` 把东西廊庑 `z0` 推到 -336 围住午门广场 + 补 `queLeft/queRight` 一对盝顶阙亭 | `js/layout.js`、`js/parts.js`、`js/buildings.js` |
| 4d | **俯瞰雾距联动**：`camera.js` 的 `OVERVIEW` 增 `fogNear 380 / fogFar 2400`；`main.js` 加 `applyFog(mode)`（进俯瞰远雾 / 出俯瞰回画质档，FPS 自动降档后立刻补一次）；`world.setFogFar(far, near)` 加 near 参数 | `js/camera.js`、`js/main.js`、`js/world.js` |

| 5a | **三大殿坐落三层台基顶面**：`layout` 三殿记录加 `onTerrace: true`，`buildings.buildAll()` 统一 `baseY = rec.onTerrace ? TERRACE.totalH : 0`（`hall()` 不自建台基，避免双份），`entries[]` 带 `y`（阶段 8 碰撞/台阶吸附直接消费）；顶层台基 z1 北界挪到 102 盖住保和殿北檐 76.5（三层 156/138/120 宽不变） | `js/layout.js`、`js/buildings.js`；smoke 4d 段在**合并体 box**（剔除 InstancedMesh）上断言太和殿 `min.y ≈ 8.13`、通高 +3 容差（见 D29） |
| 5b | **首屏机位与相机断言入库**：`config.CAM_START` 单一来源（`x 0 / z −455 / yaw π / pitch +0.06 / y EYED_H`），`main.js` 只消费不摆位；轴线约定写死注释（cz 增大 = 北 ⇒ yaw π = 朝北看午门）；gitignored 探针 `camlogic.mjs` 的 11 条断言移植进 smoke §4e 扩成 **20 条正式断言**；`camera.js` 修两处入口机位跳变（`OVERVIEW.flatMin 340→300`、`orbitFromPose` 地板与 `orbit()` 同口径，见 D30）；`tools/shot.mjs` 首图 = 未按键的真·首屏 `walk-entry` | `js/config.js`、`js/main.js`、`js/camera.js`、`tools/smoke.mjs`、`tools/shot.mjs` |
| 6 | **三大殿内部可入内**：新 `js/interior.js`（纯逻辑，顶层不 require THREE/DOM）——`hallInterior()` 拼室内层（金砖墁地 / 须弥座 + 踏道 / 宝座 · 围屏 / 藻井蟠龙顶片 + 宝珠 / 匾额 / 鎏金铜缸，材质全部复用 `kit.mat.*`，藻井顶片用 `MeshBasicMaterial` 直挂 `cloudDragon` 贴图不受光照）；`buildings.hall()` 按 `b.interior && HALL_IDS` 插室内层，`buildAll()` 给三殿传 `interior` + 共享 `capMat`；**门扇自动开合**：`parts.latticeDoor` 加 `movable` 参数（`mergeGroup.walk()` 顶部门保护卫 `userData.movable` 不烘批、留 10 扇可动门扇），`interior.makeDoorState()` 记录枢轴 + `applyDoor()` 纯 JS 4×4 右乘驱动转角；触发点 = 殿门中点 `(0, cz − halfD + 1.2)`，中心距 `DOOR_OPEN_DIST 9.5`；`enterHalls()` = `fp` 水平足迹 + `y` 视平高度带 → `recordInterior` 解锁「入内太和殿」+「三殿全入内」；顺带修 `layout.zhonghe` `doors:[-9,0,9]`（旧 `{south:12}` 在 27 m 方面上标出 ±44.5 m 的超界值） | `js/interior.js`（新）；`js/{parts,buildings,layout,main,config}.js`；smoke 阶段 6 段（10 条断言） |
| 7 | **内廷与后苑（示意层）**：新组合器 `palaceRow()`——东西六宫各三进小宫院临长街（红墙殿身 + 单檐庑殿顶，每侧合并后 3 批次；**fp 窄巷制 halfW 12**，碰撞层不吃大方块）；后苑三笔：钦安殿（单檐庑殿，御花园中御道）+ 御景亭（堆秀山顶）+ 景山万春亭（景山顶），`buildAll()` 新增通用 `rec.yBase` 坐落高程（山亭坐山体顶 9 / 38 m）；后三宫室内层（「正大光明」匾 / 坤宁宫东暖阁灶位）阶段 6 已成形、本阶段断言点名 | `js/{layout,buildings,config}.js`；smoke 阶段 7 段（7 条断言）+ `shot.mjs` 两图 |


**验证记录（阶段 7）**：smoke 全部通过；装配统计 **Mesh 302（InstancedMesh 85，实例 6208）｜三角面 59.5k｜材质 23｜贴图 24.69 MB（18 张）**；
**drawCalls 首屏 271 / 俯瞰 263 ≤ 预算 320**（六宫两列 + 钦安殿殿身 + 山亭群合计 +32 批次，`drawCallsMid` 280→320、实例台账上界 6200→6300，见 D37）。headless 7/7 全过（`draw 271 / 192k tris`、无异常）。
图像门：`phase7-内廷六宫与乾清门`（乾清门以南 25 m 北望，六宫两列四角入画 + 「乾清门」分区 label）与 `phase7-御花园与景山万春亭`（坤宁宫北望，钦安殿 / 御景亭 / 神武门 / 万春亭中轴同框）——
景山白色锥体（marble 未打光）与浮动金匾 = SwiftShader 伪影，**不以截图判形制**（D27 口径，机位照旧走 `?shot=1` 瞬移 D34）。
新增断言要点：六宫两列对称各三进；后苑三笔（钦安殿 cx=0 / 御景亭 `yBase 9` 且 cz 在钦安殿以南 / 万春亭 `yBase 38` 且 cz > 415）；宫列 fp `halfW ≤ 12` 与乾清宫占位留白 >20 m；坤宁宫金砖合并体当且仅当 1 桶；钦安殿 fp.cx = 0。
三条旧断言口径放宽：`form === '亭'` 数「阙亭一对」的旧谓词被后苑新亭打破 → 改按 id `que*` 过滤；「其余建筑 y=0」加 `yBase` / 廊 / 山豁免（断言语义收窄写进断言文本）。


**验证记录（阶段 4 第一批）**：smoke 全部通过；装配统计 **Mesh 243（InstancedMesh 79，实例 6076）｜三角面 51.2k｜材质 21**；
`D16` 哨兵达标：**drawCalls 漫步 216 / 俯瞰 246 ≤ 预算 260**（阶段 3 是 1212）。headless 7/7 全过（`draw 216 / 181k tris`、无异常）。
新增断言要点：凹字两翼 xs 镜像 + `wingLen > cityD`、五券门、主楼庑殿 tier2 且 `hWall < cityH`、午门 bbox `X ≥ ±cityL/2` 且 Z 跨度 `≥ wingLen`（实测 -416.5…-304.6、高 38.3）、宝顶 8 颗、桥面 5 座 + 水面材质、御路桥居中五孔 + 内外桥对称且内短外长 + 外桥带三间亭内桥无亭、围合廊 `z0 ≤ 午门 cz+8`、阙亭一对对称。
截图复核（CDP 探针 + `Page.captureScreenshot`，临时目录不入库）：俯瞰跳档到「午门」已能看清凹字平面、内金水河横带与五孔桥（修雾距前是整片白雾，见 D23）。
> 口径提醒：**「形制对不对」的几何断言要在 builder 的未合批输出上测**（直接调 `B.wumen(...)` / `B.bridges(...)`），`built.group` 只测 bbox / 材质种类 / 批次数（见 D24）。

**验证记录（阶段 5）**：smoke 全部通过；装配统计 **Mesh 243（InstancedMesh 79，实例 6180）｜三角面 51.2k｜材质 21｜贴图 24.69 MB（18 张）**；
**drawCalls 首屏 212 / 俯瞰 221 / 漫步 152 ≤ 260**。headless 7/7 全过（`draw 212 / 183k tris`、无异常）。新增断言要点：
太和殿合并体 `min.y ≈ 8.13 ±0.35`（= 三层台基顶面）+ 通高上界容差；`CAM_START` 两条首屏几何谓词（起点在午门以南、
距午门 115 m ≤ fogNear 120、前向 z = +1.00 朝北；机位在凹字两翼南端 −416 以南且城台南面 −347 在 fogNear 内）；
§4e 20 条相机断言（进俯瞰不跳变、zoom 单调、orbit 不动取景中心、focus 命中画面中心、三档循环）。
截图复核（`tools/shot.mjs 午门 太和殿`，不入库）：首屏 `walk-entry` = 凹字两翼框住午门城台与屋顶（此前 z=−430 只看到两翼廊亭，见 D27）；
`overview-浅俯角-太和殿` 肉眼确认三殿坐落在三层白台顶面（阶段 5 验收点）。
> 探针口径：**首屏构图以图像为准判定**，Node 射线/视锥探针（`tools/out/probe-wumen2.mjs`）只回答「有无遮挡、是否在视锥内」；
> 且探针必须在 `buildAll` 后手动 `group.updateMatrixWorld(true)` 再射线/视锥——`buildings.add()` 是先 update 再 mergeGroup，
> 合并体在 Node 里矩阵是恒等值，直接测会把午门合并体当成在原点（D31）。

**补丁（用户反馈「只能漫步太慢」）· 三档视角切换**：新增 `js/camera.js`（纯逻辑，Node 可 import）——
`漫步 / 飞行 / 俯瞰` 三档 + HUD 档位按钮（左下角，H 隐藏 HUD 时仍保留）+ 键位 `V` 循环、`1/2/3` 直选。

| 档位 | 交互 | 关键参数 |
| --- | --- | --- |
| 漫步 | 摇杆 / WASD，地面贴地 | `WALK_SPEED 4.2`、`RUN_SPEED 7.0` m/s，眼高 1.65 m |
| 飞行 | 同上 + `空格/E` 升、`Ctrl/Q` 降 | `flySpeed 46 m/s`（中轴全程约 25 s），高度夹 2.2–760 m |
| 俯瞰 | 拖拽绕**取景中心**转方位、滚轮/捏合缩放、`←→`（或 `[ ]`）沿中轴跳档 | `OVERVIEW{radius 1000, flatMin 300, flatMax 2200, pitch -1.5…-0.62, fov 74}`，默认俯角 −1.24 rad（≈71°）；入口机位水平距 ≈ 326 m，故 `flatMin` 必须 **< 326** 才不跳变（阶段 5 从 340 降到 300，见 D30） |

**验证记录（补丁）**：smoke 全部通过；headless 7/7 过（`draw 1212 / 162k tris`、无异常）；
当年由 gitignored 临时探针 `camlogic.mjs` 跑的 11 条机位断言（进俯瞰高度、focus 平移保住水平距离与高度、画面中心命中午门、zoom 升降、orbit 不改取景中心、回漫步落回眼高、toggle 三档循环）**已于阶段 5 移植进 smoke §4e，扩成 20 条正式断言并入库**——临时探针跑完即删，不进校验口径（D26）；
截图 `v-overview.png`（整城俯视）／`v-focus.png`（跳档到中和殿）／`v-walk.png`（回地面）。

**验证记录（阶段 6）**：smoke 全部通过；装配统计 **Mesh 270（InstancedMesh 79，实例 6180）｜三角面 55.1k｜材质 23｜贴图 24.69 MB（18 张）**；
**drawCalls 首屏 239 / 俯瞰 273 ≤ 预算 280**（可动门扇逐扇留批 + 每殿室内新材质桶合计 +27，`BUDGET.drawCallsMid` 260→280，见 D33）。
新增断言要点：`doorStates` 三殿门扇枢轴（太和 4 / 中和 2 / 保和 4，共 10 扇）`base` 有限值 + `gate.z < 殿 cz`；金砖合并体（`material === kit.mat.goldBrick`）太和殿里**当且仅当 1 桶**；
`updateDoors` 近门 30 帧 → `t = 1` 全开、远门 60 帧 → `t = 0` 全关且枢轴矩阵真的变；`enterHalls` 站太和殿中心 → 解锁 `taihe` + `threeHalls` 合成成就、幂等二刷 = 0、飞越（y +40）= 0。
图像门（`tools/shot.mjs 太和殿`）：`phase6-太和殿门开`（门前 9.2 m：四扇格扇平开后见灰调殿门洞 + 「太和殿」分区 toast，HUD 137 calls）与 `phase6-入内太和殿`（金砖墁地 + 鎏金柱础 + 须弥座白台顶面入画，HUD 144 calls）——宝座髹金 / 围屏彩画 / 匾额在 SwiftShader 下呈「未打光暗带」伪影（已知渲染伪影，**不以截图判形制**：殿内各件世界包围盒由 smoke 断言 + Node 材质桶探针点名：金砖地 8.13..9.77 / 须弥座 marble 8.13..9.27 / 藻井顶片 20.86 / 前后匾同在 basic 桶）。机位走 `?shot=1` 钩子瞬移落位（见 D34）。

## 3. 未完成（按阶段，含验收要点）

- [x] **2 素材工厂**：`textures.js` 实现 T01–T18，`smoke.mjs` 断言预算表 ✅ 阶段 2
- [x] **3 构件库**：`parts.js` G01–G22 + `buildings.js` 组合器 + `layout.js` 数据表自检（中轴 `cx=0`、间数×BAY≈实测面阔）✅ 阶段 3
- [x] **4 外朝中轴**：午门凹字城台与五凤楼、内金水河与五孔桥、左右阙亭、廊庑围合、太和门 → `drawCalls ≤ 260` ✅ 阶段 4 第一批（实测 216，见 §2 表 4a–4d）
- [x] **5 三层台基 + 三大殿**：8.13 m 三层须弥座 + 栏杆螭首；三殿形制（庑殿 / 四角攒尖 / 歇山）与实测尺度 ✅ 阶段 5（三殿坐落台基顶面，`onTerrace` 驱动；浅俯角截图复核 + smoke 合并体 box 断言，见 §2 表 5a/5b）
- [x] **6 三大殿内部可入内**：宝座、藻井蟠龙、金柱（保和殿**减柱造**少 6 根）、匾额；门扇自动开合 ✅ 阶段 6（10 扇可动门扇 + 「入内」成就链；「室内碰撞层 → 不穿模」留给阶段 8 的 `collision.js`，飞行穿模是有意设计）
- [x] **7 内廷与后苑**：乾清门、后三宫（乾清宫重檐庑殿 + 「正大光明」匾）、东西六宫示意、御花园、景山借景 ✅ 阶段 7（六宫示意 = 每侧三进临街正殿，院门/配殿不做；景山只压顶万春亭，四配亭 = 观感层示意后补——D3 口径；`yBase` 山亭坐顶，见 §2 表 7）
- [ ] **8 碰撞与相机**：`collision.js` AABB + 门洞 + 台阶吸附；`player.js`；`camera.js` 三模式（跟随 / orbit / 电影）
      —— 注：**「全局俯瞰」已提前落地**（见 §2 补丁），此处只剩 `player.js` 与热点 `rig.focus()` 联动。
- [ ] **9 移动端打磨**：摇杆 + 看视角 + 双指 FOV + 小地图 + 全屏 API + DPR 自适应 → 真机 30fps
- [ ] **10 导览玩法**：热点讲解卡（D03）、成就展示面板、WebAudio 音效 A01–A06、进度存 localStorage
- [ ] **11 性能与兼容**：LOD / 合批复测 / 低端档 / `prefers-reduced-motion` → tris ≤ 900k、贴图 ≤ 128MB
- [ ] **12 收尾**：README 实现概览与已知问题、devlog 全量、registry `status` 改 stable + `updatedAt`

## 4. 下一步（≤3 条，可直接执行）

1. **碰撞与台阶（阶段 8）**：`collision.js` AABB + 门洞 + `STEP_SNAP_MAX 0.45` 台阶吸附 + `player.js`（替换 `main.js` 的临时行走段）。几何从 `entries[]` 派生：`fp` / `y`（= 8.13，山亭类 `yBase` 已在 entry.y）/ `cz` 都是现成的；阶段 6 的 `doorStates` 就是门洞开合集，碰撞穿门时**直接复用** `updateDoors`，别再写一份。六宫 fp 已按窄巷制（halfW 12）给出，`wallCity` 城墙在 `CITY` 记录里，穿外城门（东华/西华/神武门）的门洞从 `linear()` 门的 fp 挖。
2. **导览玩法（阶段 10）**：热点讲解卡（D03）、成就展示面板（`unlock()` 表已 22 条 + 入内 3 条）、WebAudio 音效 A01–A06、进度存 localStorage（`saveAcc` 桩今天接真存档，注意键名以 `state.js` 的 `forbidden-city.v1` 为准）。
3. **上限预警，动手前先查账**（`assets.md` §7 台账，阶段 7 后实测）：`Mesh 302 / 320`（**18 余量**）、`材质 23 / 24`、实例 `6208 / 6300`（台账上界 6200→6300，见 D37）、drawCalls 首屏 271 / 320。新构件优先复用 `kit.mat.*`（鎏金铜缸 / 金柱都并入 `gold` 桶、六宫只吃 redWall/roofTiles/ridgeTile 三桶就是先例）；要加新材质先到 `assets.md` §7 登记再动手。

> 备注：`tools/export-layout.mjs`（导出 `data/buildings.json` 供小地图用）仍未做，属可选，别误当阻塞项。

## 5. 已知坑与决策

| # | 坑 / 决策 | 处置 |
| --- | --- | --- |
| D1 | **cdnjs 已无 three.js r128 legacy**（只有 0.187.0）；r128 的 `examples/js/**` UMD 扩展只在 npm 包里存在 | 核心只用已入库 three.min.js；需 Sky/Water/GLTFLoader 时走 jsDelivr+unpkg 双镜像入库（research.md §6） |
| D2 | 中和殿通高 **27 m（zh）vs 29 m（en）** 两源不一致 | 代码取 27 m 并在 `layout.js` 注释标分歧；research.md §3.3 留复核项 |
| D3 | 太和殿室内「72 根柱」的具体分列学界有争议 | 只做外观 + 室内示意层，不做结构级复原；写进 README 已知限制 |
| D4 | **ES module 拆分页面在 `file://` 下打不开** | README 明示必须 HTTP；降级面板文案也写这条 |
| D5 | 匾额汉字依赖系统字体（无字体文件） | iOS/Android/Windows 均有中文字体；若缺字回退为「殿名 + 拼音」文本而非方块字 |
| D6 | `server.js` 对非 html 资源走 `max-age=300` + ETag | 改贴图工厂参数后如未见变化，先硬刷新；新增二进制扩展名需补 MIME（当前无） |
| D7 | 仓库有**他人未提交的在途改动**：`examples/tower-defense/js/{config,towers}.js`（给塔加 `air` 字段） | **提交时只 add 本页面目录 + registry.json**，绝不裹进 tower-defense 的改动 |
| D8 | 渲染与碰撞共用一份数据表 | `layout.js` 是单一数据源；碰撞体、小地图、热点都从它派生（assets.md §5） |
| D9 | **r128 没有 `THREE.SRGBColorSpace`**（那是 r15x）；色彩口径只有 `outputEncoding` / `.encoding` | `main.js` 用 `renderer.outputEncoding = THREE.sRGBEncoding`；`smoke.mjs` 有正则钉测禁止误用 |
| D10 | headless 截图里 HUD 读数是 `-- fps`，容易误判成「主循环没跑」 | 实为 `virtual-time-budget` 冻结了 rAF；改用 CDP 探针取 `renderer.info`（drawCalls）判定真实渲染 |
| D11 | 冒烟断言用正则扫源码时，**注释里的字符串也会命中**（曾误报 outputColorSpace） | 断言前先 `stripComments()`；跨文件常量放单一来源（如 `SAVE_VERSION` 在 config.js） |
| D12 | **模板残留的 `js/render.js` 与本特性分层不符**（3D 需要「数据 → 构件 → 装配 → 碰撞」四层，不是单一渲染层） | 阶段 1 已删除该文件；世界装配改名 `world.js`，模块边界记在 devlog「拆分记录」 |
| D13 | **贴图工厂若在顶层碰 `document`/THREE，Node 侧就无法测试** | 工厂签名统一为纯函数 `draw(ctx,w,h,opts)`；`makeTexture(THREE, entry, opts, {provider})` 才接触 three.js。测法：shim / vm 真实 three.min.js / headless 打样三种口径 |
| D14 | **Canvas2D 的 `drawImage(canvas)` 合成在 Node 侧不可用**（做旧叠加曾这样写） | 改用 `getImageData`/`putImageData` 直接读写像素，浏览器与 Node 两侧行为一致 |
| D15 | **HUD 卡在 `-- fps / draw --`**：headless 里 `setTimeout` 回调先于 rAF 跑，`performance.now()` 起点比 rAF 时间戳新 → `dt` 被夹成 0、累加器永不达标 | `ui.update(now, …)` 直接传 **rAF 的 `now`**（与定时器解耦），别再混用 `performance.now()` |
| D16 | **装配后 drawCalls = 1212，远超 `BUDGET.drawCallsMid = 260`**（tris 才 162k，瓶颈在批次不在面数） | 阶段 4 起「先合批再增量」：按材质合并 + 整组构件实例化；smoke/headless 每次都打印 `draw N` 当回归哨兵 |
| D17 | **r128 的背面剔除不吃 `scale(-1)`**：天穹球用 `side: FrontSide` + `scale.set(-1,1,1)` 想反翻三角朝向，实测 `matrixWorld` 行列式仍是 **+1**（r128 靠投影面积正负判向），球内侧照样被剔掉 → 全屏灰幕 | 相机在球心只能看到内表面，**必须 `side: THREE.BackSide`**；不要试图用负缩放反翻 |
| D18 | **整屏上下颠倒**（地面在上、建筑倒立）：`world.js` 里 `camera.lookAt()` 留下的残留欧拉角（order 默认 XYZ，z ≈ π），与 main.js 运行时 `rotation.set(pitch, yaw, 0)`（YXZ）叠加成翻滚 | `world.js` **只摆机位不做 lookAt**，朝向一律交给控制器；探针自建 world + YXZ 机位截图才与真机一致 |
| D19 | **自我复读陷阱**：反复用相同参数跑同一支探针（文件名换了、图却一模一样），误判成「修复无效」继续加代码 → 一次会话里空转十几轮 | 截图前先 `Remove-Item *.png`；比对**磁盘上的 sha256**而不是重看已进过上下文的老图；同参探针结果不变就停下改读源码/换假设，别再加码 |
| D20 | **模式切换的缓动把输入锁死**：main.js 用 `if (!rig.update(dt))` 当闸门，SwiftShader 下 dt 被夹到 0.05，1.9 s 的过渡要跑几十秒 → 摇杆/看视角全程无响应 | `rig.update(dt)` **只推进过渡、返回值不当闸门**；`isFlying()` 明确标为只读（给 HUD/日志用）。软渲染下另走 `{instant:true}` 直接落位 |
| D21 | **俯瞰时整座城跟着镜头跑**：地面平面的「视点跟随」没排除 overview，相机一挪 `ground.position` 就跟着挪 → 画面里城没了；同时天穹半径（`far×0.55`）小于机位高度（~946 m），球壳缩成背景一块黑 | overview **不挪地面**（阶段 4 chunk 化后再恢复跟随）、天穹半径写死 2400 > 最远机位；成就判定也排除 overview（机位上千公尺高，用它的 z 判到访会误报） |
| D22 | **`focus()` 想「对准某座殿」却什么都没发生**：正中俯视下把目标设成画面中心 = 只挪视线；且末尾又调 `orbit()` 用旧 `flat` 重算机位，把平移结果覆盖掉 | focus 改成**平移取景中心 + 相机同步平移**（保住水平距离与高度），末尾不再调 `orbit()`；「画面中心命中午门」断言已入 smoke §4e（D26） |
| D23 | **俯瞰把整座城糊成白雾**：俯瞰机位在 ~950 m 高空、水平距离到 2200 m，而雾距按画质档只有 620–1400（`RENDER.far` 才 2600）→ 镜头与全城都在雾的 far 之外，截图整片白 | 雾距交给**视角档**联动：`camera.js` 的 `OVERVIEW` 带 `fogNear 380 / fogFar 2400`，`main.js` 的 `applyFog(mode)` 进俯瞰用远雾、出俯瞰回画质档；`quality.apply()` 会重写 `fog.far`，故 FPS 自动降档后要立刻补一次 |
| D24 | **合批后几何断言集体失效**：`mergeGroup()` 把同材质 Mesh 烘成顶点合并，`geometry.type` / `parameters` / `name` 全丢 → 在 `built.group` 上查「宝顶 / 水面材质 / 桥面厚度」得 `0 颗 / 无水面 / 0 座`，而肉眼明明看得见 | 断言分两套口径：**装配层**（`built.group`）只测 bbox、材质种类、Mesh 批次数；**形制层**在 builder 的**未合批输出**上测（直接调 `B.wumen(...)`、`B.bridges(...)`）。「肉眼有、断言无」= 口径用错，不是模型没建 |
| D25 | **实例数护栏被合批策略漂移误伤**：桥栏改 `railInst:false` 后实例总数 6306 → 6076，离 `instCount ≥ 6000` 下限只剩 126 | 本轮留阈值继续跑；阶段 5 加台基/螭首时用实例化补回余量，并把断言改成**按构件类别查**（`columnGrid` / 走兽 / 斗栱 各自必须是 InstancedMesh），不再钉「实例总数」 |
| D26 | **文档引用了不存在于仓库的校验脚本**：`camlogic.mjs`（gitignored 临时探针，跑完即删）被写成「11 条断言全过」挂进验证记录，smoke 里从来没有一条相机断言——「全部通过」里掺着未入库项 | 断言照搬进 smoke §4e（20 条，`camera.js` 纯逻辑 Node 直接 import），文档口径改成：**只有已入库脚本的通过才算数**；临时探针只当诊断工具（D19 口径的落地） |
| D27 | **漫步首屏是「一条红墙带」**：旧 `main.js` 机位 z −520 在雾里（> fogNear 120 的 180 m）、yaw 轴约定写反（本仓库轴 = cz 增大为北，yaw 0 = 朝南），镜头对着广场南墙，午门在身后；改 z −430 yaw π 后 Node 射线/视锥全绿，图像却只有两翼廊亭 | `CAM_START` 收进 `config.js` 单一来源（`x 0 / z −455 / yaw π / pitch +0.06 / y EYED_H`），`main.js` 只消费不摆位。凹字两翼南端 z ≈ −416，机位必须在**两翼以南**（凹字进深 76 m，站在院里看 38.3 m 正楼檐下仰角 ≈ 47°，62° FOV 上沿 ≈ 31° ⇒ 正楼必出框；z −455 处城台南面 108 m < fogNear 120，正楼从两翼墙顶之上露出檐与正脊）。**首屏构图以图像判定**，smoke 只钉几何谓词（起点在午门以南、距午门 ≤ fogNear、前向 z = +1） |
| D28 | **三大殿悬空在广场上**：`TERRACE` 数值躺在 `layout.js` 里没人消费，`hall()` 不自建台基，台基与殿身是脱节的两块——肉眼看「台基少一层」，殿是 P 上去的。`parts.baseAlign()` 是 no-op 桩（只算 bbox），**不是元凶**：全部调用方都按 `y = h/2` 摆位，别去「修」它（已记技术债） | `layout` 记录 `onTerrace: true` 驱动 `buildAll()` 的 `baseY = TERRACE.totalH`，`entries[]` 带 `y`（阶段 8 碰撞台阶吸附直接消费）。smoke 断言太和殿**合并体 box** `min.y ≈ 8.13`（容差 0.35）——不是「太和殿 bbox 下界 = 0 的地板」，是「殿身坐在三层台基顶面」 |
| D29 | **r128 `Box3.setFromObject` / boundingSphere 不吃 `instanceMatrix`**（只读 geometry bbox × matrixWorld）：实例化柱 / 垛口的世界框报 `sph r 1.0 c 0,0,-340`，一根 16.8 m 柱的 bbox y 下界 −0.27 被当成「几何沉进地里」——纯 bbox 假象，不是几何 bug | 装配层高度断言用剔除 InstancedMesh 的合并体 box（`isMesh && !isInstancedMesh` 过滤）；实例化构件的高度口径交给 builder 未合批输出、射线探针、图像——都不交给 `setFromObject` |
| D30 | **俯瞰入口机位跳变**：首屏按 `3` 进俯瞰 y 946→990 瞬跳 44 m；往回 zoom 时 1127→911 又跳：`orbitFromPose` 与 `orbit()` 各写各的 clamp 地板（一个魔法数 `radius*0.34` = 340，一个 `OVERVIEW.flatMin` 300），入口 pose 的 flat ≈ 325.7 被前者夹住不动、被后者抬走 | `orbitFromPose` 地板与 `orbit()` 共用 `OVERVIEW.flatMin`，并把 `flatMin` 从 340 降到 300（< 入口 flat 325.7，入口 pose 成为「orbit 可表达的自然态」）；smoke §4e 钉「进俯瞰不跳变」断言 |
| D31 | **Node 探针里合并体全在恒等矩阵**：`buildings.add()` 是先 `g.updateMatrixWorld(true)` 再 `mergeGroup(g)` 再 `root.add(g)`，合并后的子物体 `matrixWorld` 是恒等值——探针直接测射线 / 视锥时，午门合并体被当成在世界原点（boundingSphere 中心 z ≈ −34 是**根局部坐标**，与实例化的 z −340 混排，一眼假） | 探针脚本在 `buildAll` 之后必须手动 `built.group.updateMatrixWorld(true)` + `cam.updateMatrixWorld(true)` 再射线/视锥；判据：合并体中心与实例化中心在同一坐标系里（午门实例化 z −340 ⇒ 合并体也该 ≈ −340）。页面不受影响（渲染器每帧调 `scene.updateMatrixWorld`），**只有 Node 侧探针需要手动补这一刀** |
| D32 | **顶层台基盖不住保和殿北檐**：顶层 z1 原 62，保和殿北檐 76.5，殿身从台基北侧悬出 14 m，肉眼看「殿掉出台基」 | 三层 z1 北挪到 102 / 90 / 82（收分与居中不变），smoke 断言保和殿 `fp` 北界 ≤ 顶层 z1 |
| D33 | **室内层一上来 drawCalls 顶穿预算**：三殿室内 = 每殿 1 个新材质桶（金砖地）+ 10 扇可动门扇逐扇留批，Mesh 243 → 270 顶爆 `drawCallsMid 260` | 先穷举复用（踏道并 `marble`、金柱冠并 `gold`、铜缸并 `gold`，材质 24→23），再把 `drawCallsMid` 260→280（+10 余量），smoke 预算表只测 `drawCalls ≤ 420` 不受影响；门扇批次是动画的**必要代价**，别再图快把它们烘进合并体 |
| D34 | **headless 帧量子化：按键盘数位移 = 不可复现**：SwiftShader ~0.5–1 fps，`main.js` dt 夹 0.05 → 飞行每帧只走 46×0.05 ≈ 2.3 m；CDP 每记一键 ≈1.9 s ≈1.05 帧，帧边界落在按键窗口内外随机 → 146 次 W 实测只走了 ≈223 m（不是算术的 335 m），两次截图**字节级一模一样**的空白平原 | 机位不该用「按住 W 数帧」逼近：给页面加 **`?shot=1` 显式钩子** → `window.__fcity = {rig, ui, state}`（正常游玩零暴露），`shot.mjs` 用 CDP `Runtime.evaluate` **瞬移落位**——z / y 是确定值，门触发圈、成就 `y` 带一次对正；模式切换的 0.35 s 缓动在软渲染要 ≈7 s 才停，瞬移必须排在缓动之后 |
| D35 | **可动枢轴要活过 mergeGroup**：门扇叶子烘进合并体就死在顶点里，转不动；`mergeGroup` 的第 4 步还会把拆剩的子物体 `root.add` 回去（自动合并的 `world.js` 也躲不开） | `walk()` 顶部卫兵 `node.userData.movable → push {node, chain}` 并 `return`（子树整支不烘批）；第 4 步 `applyMatrix4(chain)` 烘好世界基阵 + `matrixAutoUpdate = false` + 存 `base = matrix.clone()`（**必须 clone**，直接存引用会让 `applyDoor` 每帧累积转角）；`applyDoor()` 每帧纯 JS 4×4 右乘 + `matrixWorldNeedsUpdate = true`（r128 在 `matrixAutoUpdate=false` 下照吃这条） |
| D36 | **殿门朝向轴**：本仓库 cz 增大 = 北，殿的「正面」在 **−z** 侧（午门方向）；`hall()` 门脸 / 匾额 / 室内藻井都按 −z 写，`interior` 匾额挂北墙 `rotation.y = Math.PI` 朝南 | `gate()` / `gateTower()` 的 +d/2 翻转**有意跳过**（午门主楼走 `withDoors:false` 自动翻正）：券洞朝向是已知小项，README 已知限制里记一行，别去「顺手修」它 |
| D37 | **阶段 7 预算顶穿 + 断言旧口径被新记录打破**：六宫两列 + 钦安殿 + 山亭群 = +32 批次（Mesh 270→302）顶爆 `drawCallsMid 280`；实例 6180→6208 越过自设台账上界 6200；三条旧断言按「`form === '亭'` 数阙亭一对」「其余建筑 y=0」数数，后苑新增 3 亭 + `yBase` 记录全被误伤 | `drawCallsMid` 280→320（+18 余量）、实例台账上界 6200→6300（smoke 只有 ≥6000 下限，无硬上界）；断言口径改**按语义点名**：阙亭按 id `que*` 过滤、y=0 断言豁免廊 / 山 / `yBase`——**断言谓词别拿「形制类别」当「语义个体」数数**，新增同类记录必打破，收窄语义写进断言文本 |

## 6. 校验怎么跑

```bash
node server.js                                          # 起服务，浏览器开 http://localhost:39977/examples/forbidden-city/
node examples/forbidden-city/tools/smoke.mjs            # 纯逻辑冒烟（数据表 / 成就 / 存档 / 预算 / 源码钉测）
node examples/forbidden-city/tools/headless.mjs         # headless Chrome CDP 探针（先起 server.js）
```

截图复核用（临时目录，不入库）：`chrome --headless=new --screenshot=... --virtual-time-budget=9000 --use-gl=swiftshader <url>`。
**要看特定机位**（凹字平面、桥与河、取景档）用 `node examples/forbidden-city/tools/shot.mjs 午门 太和殿`：CDP 起 headless Chrome，
**首图 `walk-entry` 在任何按键之前截 = 真·首屏（`CAM_START` 机位，首屏构图只能靠这种图判）**，再按 `3` 进俯瞰 + `[`/`]` 沿中轴跳档（绝对档位表 午门→神武门），
拖拽（pointer 事件，CDP `Input.dispatchMouseEvent` 合成）产生浅俯角 `overview-浅俯角-*`；图落 `tools/out/shots/`（已 gitignore），跑前清旧图（D19）。
阶段 6 机位（门前 9.2 m / 殿内走带）用页面钩子 `?shot=1` → `window.__fcity = {rig, ui, state}`（正常游玩零暴露），`shot.mjs` 用 CDP `Runtime.evaluate` 瞬移 `rig.pose` 到门触发圈 / 入内带——**软渲染 1 fps 下按住 W 数帧 = 不可复现**（D34）；模式切换 0.35 s 缓动 ≈7 s 才停，瞬移须排缓动之后。阶段 7 两图（`phase7-内廷六宫与乾清门` z 120 / `phase7-御花园与景山万春亭` z 295，均为飞行档瞬移 + `yaw π` 北望）同走这套钩子，teleport 后 sleep 4.2 s 让 pose 落位即可拍。
**首屏判定以图像为准**，Node 射线/视锥探针只当诊断（D27/D31）。
阶段 2 之前 `tools/export-layout.mjs` 还不存在，跑到会报找不到文件——属预期。

## 7. git 提交策略（重要）

**站点规范是「直接提交到主干」**（见根 README），且仓库里存在**他人未提交的在途改动**
（`examples/tower-defense/js/{config,towers}.js` 给塔加 `air` 字段、`.dsh-acl-reports/`、`.dsh-im/`）。

因此：**只 add 本页面目录 + registry.json**，绝不裹进别人的改动：

```bash
git add examples/forbidden-city registry.json
git commit -m "feat: 新增 3D 故宫游览（阶段 0–1）并注册"
```
