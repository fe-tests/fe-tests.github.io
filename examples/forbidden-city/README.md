# 🏯 3D 故宫游览

> 全屏 3D 紫禁城：中轴三大殿可入内游览，程序化琉璃瓦与汉白玉材质，移动端摇杆操控。

| 字段 | 值 |
| --- | --- |
| 分类 | 游戏（`game`） |
| 状态 | `alpha`（阶段 12 全量回归前不转 `stable`；改状态只改 `registry.json`） |
| 标签 | `#threejs` `#3d` `#mobile` `#故宫` `#触摸` |
| 入口 | `examples/forbidden-city/index.html` |
| 创建 / 更新 | 2026-11-08 17:30:51 / 2026-11-11 04:45:00 |
| 注册项 | `registry.json` 中 `url = "examples/forbidden-city/index.html"` |

> 本文件由 `tools/new-page.js` 从 `examples/template/` 生成，**这是页面目录的规范样例**。
> 页面目录固定为：`index.html` + `README.md` + `docs/design.md` + `docs/devlog.md`，按需再加 `js/`、`css/`、`data/`。
> 模板文档里的双大括号占位符（如 slug、标题、分类、日期）由脚手架替换成实际值；落地后请把「待填写」的小节补全。
> 手工复制模板（不用脚手架）时，请自行替换全部双大括号占位符，并在 `registry.json` 追加注册条目。

## 打开方式

```bash
node server.js                                # 站点根目录执行，监听 0.0.0.0:39977（含局域网地址）
# 浏览器打开 http://localhost:39977/examples/forbidden-city/
node examples/forbidden-city/tools/smoke.mjs  # 纯逻辑校验（装配 + 预算 + 相机断言，不开浏览器）
```

拆分过代码（`type="module"`）的页面**必须**经 HTTP 访问（ES module 在 `file://` 下受 CORS 限制）；
纯单文件页面可 `file://` 直开，但首页要读 `registry.json`，同样得走 HTTP。

## 玩法 / 用法

- **首屏**：站在午门以南看「凹」字午门全貌（城台 + 五凤楼 + 两翼廊庑被自然框在画面两侧）。
- **三档视角**（键 `1/2/3` 直选，`V` 循环；HUD 左下角档位按钮）：
  - **漫步**：`WASD` 行走（`Shift` 奔跑），鼠标**拖拽**转视角，滚轮微调视野；走近门洞自动开门、可进三大殿看宝座与蟠龙藻井。
  - **飞行**：6 自由度（`46 m/s`，`Space` 升 / `Ctrl` 降）。
  - **俯瞰**：绕「取景中心」轨道旋转 + 滚轮缩放，`←/→` 沿中轴跳档（午门→神武门 9 档，含三大殿）。
- 其它键位：`H` 隐藏 HUD、`G` 地面网格、`B` 鸟瞰切换、`?` 键位面板。三大殿**殿门自动开合**：走进门洞 9.5 m 圈内格扇平开（`updateDoors`），走进殿内解锁「入内太和殿」等成就（`enterHalls`）。
- 移动端：左半屏拖动 = 虚拟摇杆，右半屏拖动 = 视角，双指捏合 = 视野 FOV；按钮 = 奔跑。
- HUD：指南针 + 当前分区名 + fps + drawCalls 哨兵 + 坐标。中轴 14 组建筑全部按实测尺度（数据表 `js/layout.js` 单一数据源），讲解热点与成就在阶段 10 接入。

## 实现概览

| 文件 | 职责 |
| --- | --- |
| `index.html` | 骨架、loading 面板、启动流程（import map 无、纯 ES module） |
| `js/main.js` | 入口：装配模块、启动循环、`applyFog`/FPS 降档、`CAM_START` 消费 |
| `js/config.js` | 全局常量：预算、画质三档、`CAM_START` 首屏机位（单一来源）、城/轴尺寸 |
| `js/layout.js` | **单一数据源**：14 条中轴建筑记录 + `TERRACE`/`AXES`/`wumenPlan`/`bridgePlan`（纯数据） |
| `js/textures.js` | 贴图工厂 T01–T18（Canvas2D 程序化，`buildTextureKit`） |
| `js/parts.js` | 构件工厂 G01–G25 + `mergeGroup` 合批 + `instanced` 开关（不 import three） |
| `js/buildings.js` | 组合器：按 `form` 派发 hall/gate/tower/corridor/pavilion，`buildAll` 出 `entries[]`（含 `fp/cz/y`） |
| `js/interior.js` | 殿内示意层（金砖地/须弥座/宝座/围屏/藻井/匾额/铜缸）+ 门扇自动开合 + 「入内」成就判定（阶段 6，纯逻辑不 import three） |
| `js/world.js` / `js/quality.js` / `js/ui.js` | 装配根组与光照雾 / 画质三档与 FPS 哨兵 / HUD 面板（DOM 层） |
| `js/camera.js` | `CameraRig` 三档 + 俯瞰轨道/focus/zoom（纯逻辑，Node 可测） |
| `js/input.js` / `js/state.js` | 输入（pointer + 摇杆 + 捏合，只产出意图）/ 状态与成就·存档纯逻辑（ENGINE 段） |
| `tools/smoke.mjs` | 纯逻辑校验：装配 + 预算 + 台基坐落 + CAM_START + 相机 20 条断言（**校验口径以入库脚本为准**） |
| `tools/headless.mjs` / `tools/shot.mjs` | CDP 无头页校验（7 项）/ 截图复核（首图 = 真·首屏 `walk-entry`） |

- 校验链：`node tools/smoke.mjs`（不开浏览器）→ `node tools/headless.mjs` → `node tools/shot.mjs 午门 太和殿`。
- 合批口径：`mergeGroup` 按材质烘顶点（root-LOCAL）；大构件 `InstancedMesh`；预算台账见 [docs/assets.md](docs/assets.md) §7。

## 依赖

- **Three.js r128**（本地化资源）：`../../assets/vendor/three/r128/three.min.js`，登记见 `assets/vendor/README.md`；r128 颜色口径 `outputEncoding = sRGBEncoding`（smoke 正则钉死）。
- **零二进制素材**：贴图/几何/音效全程序化生成（登记表 [docs/assets.md](docs/assets.md)）；页面目录自包含，无 npm 依赖、无构建。
- 运行时特性：WebGL（无 WebGL 给降级提示）、DOM HUD、pointer 事件 + 多点触控、Web Audio（阶段 10）、localStorage 存档（阶段 10）。

## 已知问题与限制

- 形制为**通识级近似**：斗拱铺作、彩画、蟠龙藻井、角楼十字脊按外观近似（`TODO(verify)`，出处 research.md 置信 medium 项）；台基须弥座束盆/栏板纹饰/螭首吐水未建模。午门城台**券洞朝向**是已知小项（`gate()` 的 +d/2 翻转有意跳过，D36），勿「顺手修」。
- 俯瞰下地面贴图跟相机（D21）：俯瞰是「全局取景」不是第一人称拉远，**刻意保留**。
- `js/parts.js` 的 `baseAlign()` 是 no-op stub（技术债：调用方自摆 `y = h/2` 已正确，**勿当 bug 修**，D28）；太和殿正吻高出通高 2.32 m（断言留容差未修）。
- 内廷四进与御花园细化、碰撞台阶吸附、移动端 30 fps 实测、热点/成就/音效/存档、LOD 属阶段 6–12 未完成。
- 截图复核（SwiftShader 软件渲染）存在「屋顶面不亮」伪影：**不以截图判形制**，只判构图与遮挡。
- 进度与接续协议、决策记录（D1–D36）见 [docs/PROGRESS.md](docs/PROGRESS.md)；坑的完整叙述见 [docs/devlog.md](docs/devlog.md) 踩坑 1–25。

## 开发文档

- [docs/design.md](docs/design.md) —— 需求与设计：玩法/交互设计、数据与算法、渲染与 UI、关键取舍
- [docs/devlog.md](docs/devlog.md) —— 开发过程：里程碑、踩坑与解法、性能与兼容性记录
- [docs/PROGRESS.md](docs/PROGRESS.md) —— 进度台账、接续协议（接续必读）、决策记录 D1–D32
- [docs/research.md](docs/research.md) —— 形制与实测值出处（置信度标注）
- [docs/assets.md](docs/assets.md) —— 素材登记表（T01–T18 / G01–G25 / A / D）+ 预算台账 §7

## 改这份页面时

- 改标题/简介/分类/标签/状态/置顶：只改 `registry.json` 对应条目，首页刷新即生效（`url` 是去重键，勿与其它条目重复）。
- 返回门户写 `href="/"`；引用顶级共享资源写 `../../assets/...`；页面自身文件写 `./js/...`、`./css/...`。
- 页面目录彼此自包含：除顶级 `assets/`（站点样式 + vendor）外，不引用其它页面目录的文件。
- 超过软上限（单文件 ~1200 行 / 单模块 ~800 行）就拆分，并在 `docs/devlog.md` 记一笔拆分原因与模块边界。
