# 3D 故宫游览 · 接续协议（PROGRESS）

> **这是续做的唯一入口。** 新会话只按顺序读三份文件即可接手：
> `README.md` → 本文件 → [docs/devlog.md](devlog.md)（细节），需要数值出处时查 [docs/research.md](docs/research.md)，加素材前查 [docs/assets.md](docs/assets.md)。
> 每完成一个阶段：**先更新本文件的四节，再提交**。不要只写 devlog——本文件是压缩后的真状态。

---

## 1. 当前阶段

**阶段 4 第一批（合批 + 午门凹字 + 内金水河五孔桥）已完成 → 下一步做阶段 5（三层台基 + 三大殿，drawCalls 已达标 216）。**

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

| 4a | **合批先行**：`parts.js` 新增 `mergeGroup(root, THREE)`（按材质把普通 Mesh 烘成顶点合并；InstancedMesh 保留批次语义），`world.js` 装配后统一「组摆位 → `updateMatrixWorld(true)` → `mergeGroup`」；亭 / 内外单孔桥 / 桥栏改走「非实例化 + 合批」（开关 `pavilion({instanced})`、`railing({instanced})`、`bridge({railInst})`、`columnGrid({instanced})`） | `js/parts.js`、`js/world.js`；smoke 断言 `Mesh 数 ≤ BUDGET.drawCallsMid` |
| 4b | **午门凹字 + 五凤楼**：`layout.wumenPlan`（城台 60×12×14、两翼 `wingLen 76` 向 -Z 伸出、正面 `doors:[-12,-6,0,6,12]` 五券门、主楼重檐庑殿 9 间、前两攒尖亭 + 后四盝顶亭）；新构件 **G23 `cityPlatform`**（红墙台体 + 券洞 + 海墁 + 四圈女墙 + 每 3.2 m 一齿垛口 instanced）、**G25 `ruffTop`** 盝顶（四坡梯形 + 平顶盘 + 四脊 + 鎏金宝球）；`buildings.wumen()` 从简模改为凹字全套 | `js/layout.js`、`js/parts.js`、`js/buildings.js` |
| 4c | **内金水河 + 五孔桥 + 阙亭 + 廊庑围合**：`innerRiver.bridgePlan` 改「御路桥居中五孔（宽 48）+ 内桥 pair `x=±34` + 外桥 pair `x=±68` 带三间桥亭」（消掉旧版 inner/outer 的 x 重叠）；新构件 **G24 `bridgePavilion`**、**G25 `river`**（河床 + `name='water'` 水面用 `kit.mat.water` + 两岸石堤白石压顶）；`linear()` 把东西廊庑 `z0` 推到 -336 围住午门广场 + 补 `queLeft/queRight` 一对盝顶阙亭 | `js/layout.js`、`js/parts.js`、`js/buildings.js` |
| 4d | **俯瞰雾距联动**：`camera.js` 的 `OVERVIEW` 增 `fogNear 380 / fogFar 2400`；`main.js` 加 `applyFog(mode)`（进俯瞰远雾 / 出俯瞰回画质档，FPS 自动降档后立刻补一次）；`world.setFogFar(far, near)` 加 near 参数 | `js/camera.js`、`js/main.js`、`js/world.js` |

**验证记录（阶段 4 第一批）**：smoke 全部通过；装配统计 **Mesh 243（InstancedMesh 79，实例 6076）｜三角面 51.2k｜材质 21**；
`D16` 哨兵达标：**drawCalls 漫步 216 / 俯瞰 246 ≤ 预算 260**（阶段 3 是 1212）。headless 7/7 全过（`draw 216 / 181k tris`、无异常）。
新增断言要点：凹字两翼 xs 镜像 + `wingLen > cityD`、五券门、主楼庑殿 tier2 且 `hWall < cityH`、午门 bbox `X ≥ ±cityL/2` 且 Z 跨度 `≥ wingLen`（实测 -416.5…-304.6、高 38.3）、宝顶 8 颗、桥面 5 座 + 水面材质、御路桥居中五孔 + 内外桥对称且内短外长 + 外桥带三间亭内桥无亭、围合廊 `z0 ≤ 午门 cz+8`、阙亭一对对称。
截图复核（CDP 探针 + `Page.captureScreenshot`，临时目录不入库）：俯瞰跳档到「午门」已能看清凹字平面、内金水河横带与五孔桥（修雾距前是整片白雾，见 D23）。
> 口径提醒：**「形制对不对」的几何断言要在 builder 的未合批输出上测**（直接调 `B.wumen(...)` / `B.bridges(...)`），`built.group` 只测 bbox / 材质种类 / 批次数（见 D24）。

**补丁（用户反馈「只能漫步太慢」）· 三档视角切换**：新增 `js/camera.js`（纯逻辑，Node 可 import）——
`漫步 / 飞行 / 俯瞰` 三档 + HUD 档位按钮（左下角，H 隐藏 HUD 时仍保留）+ 键位 `V` 循环、`1/2/3` 直选。

| 档位 | 交互 | 关键参数 |
| --- | --- | --- |
| 漫步 | 摇杆 / WASD，地面贴地 | `WALK_SPEED 4.2`、`RUN_SPEED 7.0` m/s，眼高 1.65 m |
| 飞行 | 同上 + `空格/E` 升、`Ctrl/Q` 降 | `flySpeed 46 m/s`（中轴全程约 25 s），高度夹 2.2–760 m |
| 俯瞰 | 拖拽绕**取景中心**转方位、滚轮/捏合缩放、`←→`（或 `[ ]`）沿中轴跳档 | `OVERVIEW{radius 1000, flatMin 340, flatMax 2200, pitch -1.5…-0.62, fov 74}`，默认俯角 −1.24 rad（≈71°） |

**验证记录（补丁）**：smoke 全部通过；headless 7/7 过（`draw 1212 / 162k tris`、无异常）；
`camlogic.mjs` 11 条纯逻辑断言全过（进俯瞰高度、focus 平移保住水平距离与高度、画面中心命中午门、zoom 升降、orbit 不改取景中心、回漫步落回眼高、toggle 三档循环）；
截图 `v-overview.png`（整城俯视）／`v-focus.png`（跳档到中和殿）／`v-walk.png`（回地面）。

## 3. 未完成（按阶段，含验收要点）

- [x] **2 素材工厂**：`textures.js` 实现 T01–T18，`smoke.mjs` 断言预算表 ✅ 阶段 2
- [x] **3 构件库**：`parts.js` G01–G22 + `buildings.js` 组合器 + `layout.js` 数据表自检（中轴 `cx=0`、间数×BAY≈实测面阔）✅ 阶段 3
- [x] **4 外朝中轴**：午门凹字城台与五凤楼、内金水河与五孔桥、左右阙亭、廊庑围合、太和门 → `drawCalls ≤ 260` ✅ 阶段 4 第一批（实测 216，见 §2 表 4a–4d）
- [ ] **5 三层台基 + 三大殿**：8.13 m 三层须弥座 + 栏杆螭首；三殿形制（庑殿 / 四角攒尖 / 歇山）与实测尺度
- [ ] **6 三大殿内部可入内**：宝座、藻井蟠龙、金柱（保和殿**减柱造**少 6 根）、匾额；门洞自动开合 + 室内碰撞层 → 不穿模
- [ ] **7 内廷与后苑**：乾清门、后三宫（乾清宫重檐庑殿 + 「正大光明」匾）、东西六宫示意、御花园、景山借景
- [ ] **8 碰撞与相机**：`collision.js` AABB + 门洞 + 台阶吸附；`player.js`；`camera.js` 三模式（跟随 / orbit / 电影）
      —— 注：**「全局俯瞰」已提前落地**（见 §2 补丁），此处只剩 `player.js` 与热点 `rig.focus()` 联动。
- [ ] **9 移动端打磨**：摇杆 + 看视角 + 双指 FOV + 小地图 + 全屏 API + DPR 自适应 → 真机 30fps
- [ ] **10 导览玩法**：热点讲解卡（D03）、成就展示面板、WebAudio 音效 A01–A06、进度存 localStorage
- [ ] **11 性能与兼容**：LOD / 合批复测 / 低端档 / `prefers-reduced-motion` → tris ≤ 900k、贴图 ≤ 128MB
- [ ] **12 收尾**：README 实现概览与已知问题、devlog 全量、registry `status` 改 stable + `updatedAt`

## 4. 下一步（≤3 条，可直接执行）

1. **三层须弥座 + 三大殿（阶段 5）**：`layout.TERRACE` 数值已备（8.13 m = 3×2.71），把它接进 `buildings.hall()` 的台基层——三层逐层收分 + 每层栏杆螭首，三殿形制（庑殿 / 四角攒尖 / 歇山）按实测面阔复测 `fp`。**只剩 17 个 Mesh 余量**：台基的栏杆/望柱/螭首一律走 `instanced`，别新增材质（现 21 / 上限 24）。
2. **门洞自动开合 + 室内示意层（阶段 6 前置）**：`hall(..., {withDoors})` 已有门形制，接 `interior.js`（宝座、蟠龙藻井、金柱；保和殿**减柱造**少 6 根）+ 门券开合，验收点「相机在殿内不穿模」。
3. **上限预警，动手前先登记**：`Mesh 243 / 260`、`材质 21 / 24`、实例护栏 `instCount ≥ 6000` 只剩 126 余量（见 devlog 踩坑 17）。新细节优先复用 `kit.mat.*` + 小体量走「非实例化 + 合批」；要加新材质先到 `assets.md` 预算表登记。

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
| D22 | **`focus()` 想「对准某座殿」却什么都没发生**：正中俯视下把目标设成画面中心 = 只挪视线；且末尾又调 `orbit()` 用旧 `flat` 重算机位，把平移结果覆盖掉 | focus 改成**平移取景中心 + 相机同步平移**（保住水平距离与高度），末尾不再调 `orbit()`；`camlogic.mjs` 有断言钉住「画面中心命中午门」 |
| D23 | **俯瞰把整座城糊成白雾**：俯瞰机位在 ~950 m 高空、水平距离到 2200 m，而雾距按画质档只有 620–1400（`RENDER.far` 才 2600）→ 镜头与全城都在雾的 far 之外，截图整片白 | 雾距交给**视角档**联动：`camera.js` 的 `OVERVIEW` 带 `fogNear 380 / fogFar 2400`，`main.js` 的 `applyFog(mode)` 进俯瞰用远雾、出俯瞰回画质档；`quality.apply()` 会重写 `fog.far`，故 FPS 自动降档后要立刻补一次 |
| D24 | **合批后几何断言集体失效**：`mergeGroup()` 把同材质 Mesh 烘成顶点合并，`geometry.type` / `parameters` / `name` 全丢 → 在 `built.group` 上查「宝顶 / 水面材质 / 桥面厚度」得 `0 颗 / 无水面 / 0 座`，而肉眼明明看得见 | 断言分两套口径：**装配层**（`built.group`）只测 bbox、材质种类、Mesh 批次数；**形制层**在 builder 的**未合批输出**上测（直接调 `B.wumen(...)`、`B.bridges(...)`）。「肉眼有、断言无」= 口径用错，不是模型没建 |
| D25 | **实例数护栏被合批策略漂移误伤**：桥栏改 `railInst:false` 后实例总数 6306 → 6076，离 `instCount ≥ 6000` 下限只剩 126 | 本轮留阈值继续跑；阶段 5 加台基/螭首时用实例化补回余量，并把断言改成**按构件类别查**（`columnGrid` / 走兽 / 斗栱 各自必须是 InstancedMesh），不再钉「实例总数」 |

## 6. 校验怎么跑

```bash
node server.js                                          # 起服务，浏览器开 http://localhost:39977/examples/forbidden-city/
node examples/forbidden-city/tools/smoke.mjs            # 纯逻辑冒烟（数据表 / 成就 / 存档 / 预算 / 源码钉测）
node examples/forbidden-city/tools/headless.mjs         # headless Chrome CDP 探针（先起 server.js）
```

截图复核用（临时目录，不入库）：`chrome --headless=new --screenshot=... --virtual-time-budget=9000 --use-gl=swiftshader <url>`。
**要看特定机位**（如凹字平面、桥与河）得走 CDP：页面无 `location.search` 钩子，自写探针发键（`Input.dispatchKeyEvent` 按 `3` 进俯瞰 + `]` 跳档取景）再 `Page.captureScreenshot`，图落 `%TEMP%`，探针跑完即删（本轮俯瞰截图用的就是这种口径）。
阶段 2 之前 `tools/export-layout.mjs` 还不存在，跑到会报找不到文件——属预期。

## 7. git 提交策略（重要）

**站点规范是「直接提交到主干」**（见根 README），且仓库里存在**他人未提交的在途改动**
（`examples/tower-defense/js/{config,towers}.js` 给塔加 `air` 字段、`.dsh-acl-reports/`、`.dsh-im/`）。

因此：**只 add 本页面目录 + registry.json**，绝不裹进别人的改动：

```bash
git add examples/forbidden-city registry.json
git commit -m "feat: 新增 3D 故宫游览（阶段 0–1）并注册"
```
