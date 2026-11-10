# 3D 故宫游览 · 需求与设计

> 由 `tools/new-page.js` 于 2026-11-08 17:30:51 从 `examples/template/` 生成。这一份记录**设计**（要做什么、为什么这么做）；
> 过程流水记在 [devlog.md](devlog.md)，进度与接续协议记在 [PROGRESS.md](PROGRESS.md)，形制实测值出处见 [research.md](research.md)。

## 1. 需求与目标

- 一句话：全屏 3D 紫禁城：中轴三大殿可入内游览，程序化琉璃瓦与汉白玉材质，移动端摇杆操控。
- 目标用户与场景：桌面浏览器（键鼠漫游）+ 移动端浏览器（虚拟摇杆 + 滑动视角）；展示能力点 = **零二进制素材**的 Three.js 场景工程化（程序化贴图/几何、数据驱动装配、合批预算、Node 侧校验链）。
- 验收标准（可测条目，均落在入库脚本上）：
  1. 中轴 14 组建筑按实测尺度落位（面阔/进深/通高/台基 8.13 m 取自 research.md），三大殿坐落在三层台基**顶面**（smoke §4d 合并体 box 断言 `min.y ≈ 8.13`）；
  2. 漫步首屏即景：站在午门以南看「凹」字全貌（smoke 谓词 + `tools/shot.mjs` 截图 `walk-entry` 图像复核）；
  3. 三档视角（漫步/飞行/俯瞰）切换不跳变，相机断言 20 条（smoke §4e）；
  4. 性能预算：中档 `drawCalls ≤ 260`、材质 ≤ 24、贴图 ≤ 128 MB，由 smoke 与 HUD 哨兵双口径盯守；
  5. 移动端 30 fps（阶段 9 实测）、内廷/御花园补齐（阶段 6–7）。
- 非目标：不加载外部 GLB/扫描贴图（零二进制策略）、不做精确古建彩画/斗栱铺作级模型（通识级近似 + `TODO(verify)`）、不做多人/玩法系统（这是**游览示例**不是游戏关卡）。

## 2. 玩法 / 使用流程

1. 进入 → loading（材质工厂装配进度）→ 首屏 = 漫步模式站在 `CAM_START` 机位（午门以南 115 m，凹字框住画面）；HUD：指南针/分区名/fps/drawCalls/坐标/档位按钮。
2. 漫步：WASD 行走（4.2 m/s，Shift 奔跑 7.0），鼠标拖拽转视角；走进门洞自动开门（`interior.js`，`DOOR_OPEN_DIST 9.5`）；殿内可看宝座/藻井。
3. 飞行（`2`/`V`）：6 自由度，`46 m/s`，`Space/Ctrl` 升降。
4. 俯瞰（`3`）：绕「取景中心」轨道旋转 + 滚轮缩放 + `←/→` 沿中轴跳档（午门→神武门 9 档）；雾距联动远景观（`applyFog`）。
5. 无「结算/重置」概念：纯漫游；存档在阶段 10 接入（`saveProgress` 已 import 未接线）。
6. 状态迁移：`boot → (walk ⇄ flight ⇄ overview)`；`h` 隐藏 HUD、`v` 循环档位、`1/2/3` 直选、`g` 网格等见 §5。

## 3. 数据与算法

- **单一数据源 `js/layout.js`**（纯数据，无 three/无 DOM）：`AXES`（中轴 12 个 z 锚点）、`TERRACE`（三层须弥座 8.13 = 3×2.71，tiers 收分）、`buildings()` 14 条记录（id/中文/cx/cz/面阔间数/屋顶形制/`doors[]`/`interior`/`onTerrace`）、`wumenPlan`（凹字城台/两翼 76 m/五券门）、`innerRiver.bridgePlan`（御路五孔 + 内外桥 pair）。坐标约定：**cz 增大 = 北**，午门 cz −340 → 神武门 cz 415，全轴长 ≈ 755 m，城墙 961×753。
- 装配链：`layout 记录 → buildings.js 按 form 派发（hall/gate/tower/corridorRun/pavilion）→ parts.js 构件工厂 → mergeGroup 合批 → world.js 落组`。`buildAll(THREE, kit, {quality, only}) → {group, entries[]}`；`entries[]` 带 `fp/cz/y` → 碰撞/小地图/热点全部从它派生（D01 单一数据源原则）。
- 相机纯逻辑 `js/camera.js`：`CameraRig`（YXZ，前向 = 局部 −z）+ `CAM_MODES` + `OVERVIEW` + `overviewPose/orbit/zoom/focus`；**入口 pose 必须是模式可自然表达的位姿**（`flatMin 300` 单一来源，禁魔数 clamp，D30）。
- 可复现性：无 seed 概念（全场景由数据表确定）；贴图工厂按 `id` 缓存、可打样复渲染。
- 帧步进：`deltaTime` 上限 0.05 s（切 tab 回来防「传送」）；无固定步长需求（漫游无物理积分）。
- 纯逻辑链 Node 可测：`parts.js/buildings.js/camera.js` 不 import three（THREE 由调用方注入）、不触碰 DOM；`tools/smoke.mjs` 用 `vm` 加载真 `three.min.js`（REVISION 128）+ Canvas2D fake provider 造 `buildTextureKit` 跑装配与断言。

## 4. 渲染与视图

- WebGL（Three.js **r128**，vendor 于 `../../assets/vendor/three/r128/three.min.js`）负责 3D 场景；HUD 是 DOM（`hud.js`），无 Canvas2D  overlay；降级：无 WebGL 时 `loading` 面板给可读提示（阶段 12 前补 2D 简版，非目标内从简）。
- **素材全程序化**：贴图 T01–T18（`textures.js` Canvas2D → CanvasTexture）、几何 G01–G25（`parts.js`）、音效 A01–A06（阶段 10）——页面目录零二进制（登记表见 [assets.md](assets.md)）。r128 颜色口径：`renderer.outputEncoding = THREE.sRGBEncoding`（不是 r15x 的 `outputColorSpace`，smoke 正则钉死，D9）。
- 分辨率：`devicePixelRatio` 上限 2（低端 1.5），`renderer.setSize` 随窗口；画质三档 `low/mid/high`（`QUALITY` 表：像素比/阴影/雾距），FPS 自动降档（<28 掉档）+ `applyFog` 联动。
- 合批与预算：`mergeGroup()` 按材质烘顶点（root-LOCAL 空间，root.position 只应用一次，D16）；大构件 `InstancedMesh`；预算 `BUDGET = {drawCallsMid 260, drawCallsHigh 420, triangles 900k, textureMB 128, materials 24}`，实测台账见 assets.md §7。
- 阴影 2048 shadow map 跟随首屏主要光源（太阳 `sun.js`），far 2600 + 雾 120/900（俯瞰 380/2400）。

## 5. 交互与输入

- 桌面：`WASD` 行走、`Shift` 奔跑、鼠标**拖拽**转视角（pointer 事件，非 PointerLock，页面可刷新）、滚轮 = 漫步 FOV 微调 / 俯瞰缩放、`1/2/3` 档位、`V` 循环、`H` 隐藏 HUD、`G` 网格、`B` 鸟瞰热键、`←/→` 俯瞰跳档、`[`/`]` 取景跳档（shot 探针同款键）。
- 移动端：左半屏虚拟摇杆（`input.js` 单指拖动即摇杆，中心死区）、右半屏滑动 = 视角（`yaw -= dx*0.0032`，pitch clamp [−1.2, 0.65]）、双指捏合 = FOV、`touch` 按钮 = 奔跑；无 PointerLock（iOS 不支持，故全局不用，见取舍）。
- 输入冲突：`canvas` 只 `pointerdown`，`move/up` 挂 window（拖出画布不丢焦点）；`pointercancel` 归零；`passive:false` 仅摇杆区 preventDefault 防页面滚动；多点触控上限 2（摇杆 + 视角）。
- 可访问性：`prefers-reduced-motion` 下 FPS 降档不自动（阶段 9 处理）；HUD 高对比 DOM 文本，键位全可键盘替代。

## 6. 状态与持久化

- 运行时状态在 `state.js`（模式/画质/分区名/fps 哨兵）；无对局概念 → 无「结算」。
- `localStorage`：键 `fcity.save.v1`（位置/已发现成就/画质档）——**阶段 10 接线**（`saveProgress` 已 import，`saveAcc` 累加器已备）；刷新即回 `CAM_START`（现阶段可接受）。
- 恢复策略：进页面读档 → 校验分区合法 → 落在档内最近锚点；清理 = 键版本升级即整档作废（`v1` 只增不兼容旧键）。

## 7. 关键取舍

- **零二进制**：全程序化（贴图/几何/音效），代价是形制只做「通识级」近似（斗栱铺作、彩画、蟠龙藻井按外观近似 + `TODO(verify)`，research.md 置信 medium 项）；换来页面目录自包含、可校验、可打样。
- **r128 锁定**：vendor 版本固定，API 面小、断言可钉死（`outputEncoding` 正则，D9）；不追 r15x（`Box3.setFromObject` 不吃实例矩阵等 r128 特性写进断言口径，D29）。
- **合批优先于细节**：小构件「非实例化 + 合批」（亭/桥/栏），大构件实例化；代价是几何断言要在**未合批输出**上测（D24/D29），换来 drawCalls 1212 → 212–246。
- **不用 PointerLock**：拖拽视角 = 页面刷新友好、移动端可用；代价是视角手感弱于 FPS 游戏（可接受，这是游览）。
- **首屏构图以图像判定**，smoke 只钉几何谓词（不被雾吃/不被挡/朝向正确）；Node 射线探针只当诊断（D27/D31）。
- 俯瞰=固定远观位（绕取景中心轨道）而非自由飞行到顶：保证构图与雾距联动稳定，代价是俯瞰不能任意平移（阶段 12 可议）。

## 8. 边界与已知限制

- 形制精度：斗栱/彩画/蟠龙/角楼十字脊 = 外观近似；台基须弥座束盆、栏板纹饰、螭首吐水未建模（几何预算）。
- 已知：俯瞰下地面贴图跟相机（D21，档位语义是「全局视图」非「第一人称拉远」，**刻意保留**）；正吻高出通高 2.32 m（断言留容差，未修）；`baseAlign` 是 no-op stub（技术债，调用方自摆 y = h/2 正确，勿「修」，D28）。
- 未完成阶段：内廷四进+御花园细化（6–7）、碰撞台阶吸附（8，`entries.y` 已备）、移动端 fps 实测（9）、热点/成就/音效/存档（10）、LOD（11）、registry 转 stable 与全量回归（12）。
- 低端设备：SwiftShader 软件渲染下截图有「屋顶面不亮」伪影，**不以截图判形制**；低端机画质档降档阈值未真机验证（阶段 9）。
- 离线：vendor 资源全部本地相对路径，页面目录自包含；ES module 必须 HTTP 访问（`node server.js` :39977）。
