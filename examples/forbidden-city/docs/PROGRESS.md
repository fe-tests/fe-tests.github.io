# 3D 故宫游览 · 接续协议（PROGRESS）

> **这是续做的唯一入口。** 新会话只按顺序读三份文件即可接手：
> `README.md` → 本文件 → [docs/devlog.md](devlog.md)（细节），需要数值出处时查 [docs/research.md](docs/research.md)，加素材前查 [docs/assets.md](docs/assets.md)。
> 每完成一个阶段：**先更新本文件的四节，再提交**。不要只写 devlog——本文件是压缩后的真状态。

---

## 1. 当前阶段

**阶段 2（素材工厂）已完成 → 下一步做阶段 3（构件库 + 数据表）。**

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

**验证记录（阶段 1）**：`node examples/forbidden-city/tools/smoke.mjs` → 全部通过；
`node examples/forbidden-city/tools/headless.mjs`（需先 `node server.js`）→ 7 条全过，REVISION=128、`draw 3 / 6 tris`、无异常。

**验证记录（阶段 2）**：smoke 新增 12 条断言后仍全部通过；贴图显存实测 **24.69 MB / 18 张**（上限 128 MB）；
打样图 `tools/out/textures.png`（不入库）肉眼复核一轮，已修 T04 浮雕对比度、T05 金砖太暗、T16 水面法线幅度过大。

## 3. 未完成（按阶段，含验收要点）

- [x] **2 素材工厂**：`textures.js` 实现 T01–T18，`smoke.mjs` 断言预算表 ✅ 阶段 2
- [ ] **3 构件库**：`parts.js` G01–G22 + `buildings.js` 组合器 + `layout.js` 数据表自检（中轴 `cx=0`、间数×BAY≈实测面阔）
- [ ] **4 外朝中轴**：午门凹字城台与五凤楼、内金水河与五孔桥、左右阙亭、廊庑围合、太和门 → `drawCalls ≤ 260`
- [ ] **5 三层台基 + 三大殿**：8.13 m 三层须弥座 + 栏杆螭首；三殿形制（庑殿 / 四角攒尖 / 歇山）与实测尺度
- [ ] **6 三大殿内部可入内**：宝座、藻井蟠龙、金柱（保和殿**减柱造**少 6 根）、匾额；门洞自动开合 + 室内碰撞层 → 不穿模
- [ ] **7 内廷与后苑**：乾清门、后三宫（乾清宫重檐庑殿 + 「正大光明」匾）、东西六宫示意、御花园、景山借景
- [ ] **8 碰撞与相机**：`collision.js` AABB + 门洞 + 台阶吸附；`player.js`；`camera.js` 三模式（跟随 / orbit / 电影）
- [ ] **9 移动端打磨**：摇杆 + 看视角 + 双指 FOV + 小地图 + 全屏 API + DPR 自适应 → 真机 30fps
- [ ] **10 导览玩法**：热点讲解卡（D03）、成就展示面板、WebAudio 音效 A01–A06、进度存 localStorage
- [ ] **11 性能与兼容**：LOD / 合批复测 / 低端档 / `prefers-reduced-motion` → tris ≤ 900k、贴图 ≤ 128MB
- [ ] **12 收尾**：README 实现概览与已知问题、devlog 全量、registry `status` 改 stable + `updatedAt`

## 4. 下一步（≤3 条，可直接执行）

1. **`js/layout.js`（先做数据表，它是单一数据源）**：把 research.md §1–§4 的实测值全部落成字段——
   每座建筑一条记录：`{id, cn, cx:0, cz, bays, depthBays, bayW, hRoof, form:'庑殿|歇山|攒尖', tier, doors:[...], interior:{...}}`；
   三大殿按 `面阔 = bays × BAY ≈ 63.96 m`、台基三层各高约 2.71 m（合计 8.13 m）写死并注释出处。
2. **`js/parts.js`**：G01–G03（台基/栏杆/螭首）+ G04 柱网 + G07/G08/G09 三种屋顶形制 + G11/G12 脊与走兽；
   每个构件返回 `THREE.Group`，尺寸参数全部来自 layout 记录，不许在构件里写死建筑尺度。
3. **`js/buildings.js`**：`hall()/gate()/tower()/corridorRun()/pavilion()` 组合器 + `smoke.mjs` 加数据表自检
   （中轴 `cx===0`、`bays×BAY` 与实测面阔误差 <5%、屋顶形制与 research.md §5 一致、相邻建筑不重叠）。

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

## 6. 校验怎么跑

```bash
node server.js                                          # 起服务，浏览器开 http://localhost:39977/examples/forbidden-city/
node examples/forbidden-city/tools/smoke.mjs            # 纯逻辑冒烟（数据表 / 成就 / 存档 / 预算 / 源码钉测）
node examples/forbidden-city/tools/headless.mjs         # headless Chrome CDP 探针（先起 server.js）
```

截图复核用（临时目录，不入库）：`chrome --headless=new --screenshot=... --virtual-time-budget=9000 --use-gl=swiftshader <url>`。
阶段 2 之前 `tools/export-layout.mjs` 还不存在，跑到会报找不到文件——属预期。

## 7. git 提交策略（重要）

**站点规范是「直接提交到主干」**（见根 README），且仓库里存在**他人未提交的在途改动**
（`examples/tower-defense/js/{config,towers}.js` 给塔加 `air` 字段、`.dsh-acl-reports/`、`.dsh-im/`）。

因此：**只 add 本页面目录 + registry.json**，绝不裹进别人的改动：

```bash
git add examples/forbidden-city registry.json
git commit -m "feat: 新增 3D 故宫游览（阶段 0–1）并注册"
```
