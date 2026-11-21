# 3D 鹈鹕海边骑行 · 设计说明

> 本页的设计契约：**纯 3D 动画 + 视角控制**的海岸骑行展示页。功能变更只改本文件，开发流水记在 [devlog.md](devlog.md)。

## 1. 目标与非目标

**目标**

1. 一只鹈鹕骑着一辆自行车，在一条沿海岸蜿蜒的公路上无限巡航（有坡、有弯、有侧倾）。
2. 环境「尽量逼真」：解析地形（海床 → 沙滩 → 沙丘 → 路肩 → 内侧悬崖）、着色器海面（浪、碎浪、岸线泡沫）、昼夜循环（含夜间点灯）、植被与远景。
3. **动态切换环绕视角**：7 档机位自动巡游，切机位有缓动，构图永远把骑行者留在画面内。
4. **鼠标可自由接管**：拖拽旋转 / 滚轮推拉 / 右键平移；空闲 3.5 s 后自动交还给巡游。
5. 无外部依赖：只用仓库自带的 three.js r128，零二进制素材，零下载。

**非目标**（用户明确选择「纯 3D 动画 + 视角控制」，不做游戏化）

- 不做操控骑行（无 WASD/油门）、不做赛道/碰撞/分数/成就、不做跳跃与道具。
- 不做 VR / 第一人称漫游 / 多页导航。
- 不改 `examples/pelican-bike/`（2D 版是稳定页）。

## 2. 视觉目标与尺度

- 单位：米（`config.UNIT_PER_M = 1`），y 轴朝上，前进方向 `+Z`，海在 `-X` 侧、山在 `+X` 侧。
- 主体：自行车轴距 1.05 m、轮径 0.34 m；鹈鹕体长约 1.5 m、翼展约 2.4 m；骑行速度 4.2–7.4 m/s（上坡慢下坡快）。
- 海岸公路：宽 7 m，双向两车道，中间虚线 + 两侧实线，海侧护栏、山侧石墙，路灯间距 42 m。
- 参考基调：黄昏海岸公路片（暖侧逆光 + 长影 + 雾霭压掉远景），正午是青蓝高光，夜里靠路灯与车灯建立可读性。

## 3. 架构与数据流

```
config.js（唯一数据源：曲线 / 参数 / 档位 / 机位 / 预算）
   ↓ 纯函数
utils.js · terrain.js · road.js · sky.js(sampleDay) · rider.js(stepRide/frameOf) · camera.js(rigLocalAt/cameraPoseOf)
   ↓ 注入 THREE
textures.js → terrain/road/ocean/sky/scenery/bike/pelican/rider（组件工厂，签名 create*(THREE, kit, opts)）
   ↓
main.js：分步构建 → 主循环（rider → terrain/road/scenery.update(z) → camera.update(basis) → sky/ocean.update → render）
   ↕
input.js（指针/键） → camera.offset → quality.js（档位/自适应） → ui.js（HUD） → audio.js（程序声）
```

**分层纪律**：`config.js` / `utils.js` / 纯函数模块（地形高度、道路曲线、昼夜采样、骑行运动学、机位解算）**不 import three、不碰 DOM**，可被 `tools/smoke.mjs` 直接 import 断言；渲染层模块一律由调用方注入 `THREE`，绝不自建全局。

## 4. 关键算法

### 4.1 道路（`config.js` 纯函数）
- `roadCenterX(z) = 26·sin(z/300) + 13·sin(z/97)`：双频蜿蜒，导数可解析（侧倾与朝向都取解析值，不采样网格）。
- `roadElev(z) = 4.2 + 1.9·sin(z/240) + 0.7·sin(z/61)`：起伏坡；坡度驱动骑行速度。
- `arcFactor(z) = √(1 + x'(z)² + y'(z)²)`：里程与 z 的换算（骑行按里程推进：`dz = ds / arcFactor`）。
- 道路坐标架 `roadFrameAt(z)` → `{x, y, yaw, pitch}`；路面几何有路拱（中央高、两侧低）与路肩跌落。

### 4.2 地形（`terrain.js`）
- `terrainHeight(x, z)`：以「到道路中心的带距离 d」为参数分带：
  `|d| ≤ 4.8 m` → **严格等于 `roadElev(z)`**（路面不随横向倾斜，车不会陷地）；
  `4.8 → 26 m` 用 `smoothstep` _blend_ 到内侧地面（含沙丘与悬崖抬升，`d > 55 m` 起升 0.92 系数，最高 68 m）；
  海侧 `d < 0` 以 0.118 坡度下斜 + 岸线摆动（`shoreWiggle`），越过后 seabed 继续下切。
- `shoreXAt(z)`：在 26 步二分内求「高度 = 海平面」的交点 → 岸线，被沙滩条带、泡沫 LUT、植被布局共用，三者岸线严格一致。
- 顶点色由高度与坡度决定（湿沙 → 干沙 → 草 → 岩），无光照贴图。
- 5×5 × 128 m 块以骑行者 z 为中心环形复用（`tilesX=5, tilesZ=5`），块内网格 16/24/32 段按画质档。

### 4.3 海面（`ocean.js`，自定义着色器）
- 顶点：4 道世界空间正弦波（不同方向/频率/速度）叠加，振幅随画质档（0.55 / 0.82 / 1.0）。
- 片元：两层滚动法线贴图采样 → `vec3 n = normalize(vec3(sx, 1.0, sz))`；菲涅尔混合天空色与深浅水色；太阳镜面 + 碎波高光；按 `|x - shoreX(z)|` 的岸线泡沫（采样 1024×1 的 LUT 纹理解码岸线）；雾按 `1 - exp(-d²·density²)` 手写（顶点色传不到片元时的显式雾）。
- 平面网格跟随骑行者并按 80 m 对齐取整（`seaPlaneSnap`），避免网格相对波相位滑动。
- 粒子：水花 `THREE.Points` 在 `[riderZ-120, riderZ+420]` 的 z 窗内循环。

### 4.4 天空与昼夜（`sky.js`）
- `KEYS`：10 个关键帧（t=0 午夜 … 1.0 循环），每帧给 `top/bot/hor/sun/amb/gnd/fog/fd/night/lamp/warm`。
- `sampleDay(t)` 纯函数插值出全部着色参数 + `sunDir/moonDir/sunElev/sunIntensity`；`smoke` 断言它连续（跨帧无突刺）、夜里太阳在地平线下、夜间灯亮。
- 天穹：`ShaderMaterial` 大球（半径 3000，`BackSide`，`fog: false`），含地平 haze、日/月光盘与晕、暖光带、程序闪烁星。
- 光源：`DirectionalLight`（阴影正交盒 92 m 跟随骑行者，`bias -0.00062` / `normalBias 0.02`）+ `HemisphereLight` + 暖侧光 + 夜间月补光；**`light.target` 必须 `group.add()`**，否则方向静默指向世界原点。
- 雾：`FogExp2`，密度与颜色由 `sampleDay` 给（雾色取地平色）。

### 4.5 骑行者（`rider.js`）
- 纯函数 `stepRide(st, dt)`：坡度 → 目标速度 → 阻尼；里程推进；`wheelPhase`；`crankPhase = wheelPhase × 0.72`；曲率 → 侧倾目标（夹在 `±0.16 rad`）；`bob` 由踏频二倍频驱动。
- `frameOf(st, lean)` 给组件坐标架：**局部 X = 前进、Y = 上、Z = 右**（`makeBasis` 烘成四元数）；侧倾让「上方向」朝右向偏移。
- 鹈鹕腿是**一条链**：`hip → thighPivot〔股骨 + 羽领〕→ knee〔膝链接球〕→ 胫骨 →〔踝链接球〕→ foot〔蹼足〕`，每节挂在上一节之下，与两节 IK 的解算一一对应；关节处都放「链接体」——圆柱端盖是平的，绕关节弯折后两段之间会露缺口，那就是「双腿结构缺链接」的观感来源。股骨藏羽领内（羽毛材质），可见的那颗「膝」是鸟类的踝关节（向后折，裸皮材质）。
- **腿 ↔ 脚踏同源**：`config.pedalOffset(side, crankPhase, len)` 是「曲柄 → 脚踏 → 腿 IK 目标」唯一的相位解算。`bike.crank.rotation.z`、`RIDE.pedalZ` 的曲柄臂、鹈鹕踏板目标三处都读它，脚掌与脚踏一起转，不会各转各的（各转各的 = 脚脱开踏板绕圈）。髋横向摆位 = `RIDE.pedalZ − HIP_X`，整腿绕 X 外撇 `PEDAL_SPLAY`，把脚踝送到脚踏所在的横向平面。
- 传动方向：前进 = 局部 +X，绕 Z 的**负向**旋转才让轮顶朝前进方向走；链条把后轮 / 牙盘 / 曲柄串成同一转向，所以 `wheelR`、`wheelF`、`crank` 统一用 `RIDE.CRANK_SIGN` 转（写成正号 = 往前骑、轮子倒转）。
- 颈链 4 节 + 头部反向补偿（骑行时头稳定）；翅膀由阵风触发展翅。

### 4.6 机位系统（`camera.js`）
- 每档机位在**骑行者坐标架**里表达：`(az, el, r, tY, tLat, fov, dwell)`，`az=0` 为正后方，`az>0` 为骑行者右侧（海在左 → 负值看海）。
- 解算 `cameraPoseOf`：`target = pos + right·(tLat+panX) + up·(tY+panY)`；`pos = target + (right·sin az + up·sin el − forward·cos az)·r·cos el + up·r·sin el`。
- 巡游：当前档停留 `dwell·(1±16%)` → 顺序切下一档 → 全部参数（含 fov）用 `1/blend` 阻尼混合，方位角走 `lerpAngle` 近路。
- 用户偏移 `yaw/pitch/rZoom/panX/panY` 叠加在同一坐标架上（因此永远不会把主体甩出画面）；空闲 `TOUR.idleResume = 3.5 s` 后偏移以 ~0.8 s 平滑归零并恢复巡游。
- 相机 y 不得沉到路面以下（`groundY + 0.35` 钳制）；切机位时收敛更快，避免穿地。

### 4.7 远景与实例（`scenery.js` + `meshkit.js`）
- r128 没有 `BufferGeometryUtils` → 自写 `mergeGeos`（图元 `applyMatrix4` 后拼 buffer），一棵棕榈 = 干 + 叶两份几何、两个 `InstancedMesh` → 40 棵树只占 2 个 draw call。
- 所有道具走 `PropStrip`（`road.js`）的里程块环形回收；密度按画质档用**稳定哈希跳过实例**（空间均匀稀疏，不是截尾）。
- 海鸥 = 单面片实例，位置沿圆轨道、朝向沿速度、`scale.y` 摆动模拟扇翅；云带 = 高空水平面片缓慢漂流。

## 5. 画质档与预算

| 档 | DPR | 阴影 | 地形段 | 海面段 | 道具密度 | 粒子 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `low` 流畅 | 1.0 | 关 | 16 | 24 | 0.45 | 140 | 无阴影、无星、无灯晕 |
| `mid` 均衡 | 1.5 | 1024 | 24 | 48 | 0.8 | 420 | 目标 drawCalls ≤ 120、tris ≤ 450 k、≥ 55 fps |
| `high` 精修 | 2.0 | 2048 | 32 | 80 | 1.0 | 800 | 全量 |

- 自适应：连续 54 帧均值 < 28 fps 自动降一档（最多 2 步）；> 56 fps 且未手动锁定则升一档（带冷却）。
- 显存：贴图台账由 `textures.js` 的 `textureBudgetReport()` 给出，预算 96 MB。

## 6. 控制与反馈（键位表）

| 输入 | 行为 |
| --- | --- |
| 左键拖拽 / 单指拖 | 绕骑行者旋转（±180°，俯仰 ±60°） |
| 滚轮 / 双指捏 | 推拉镜头 2.2 – 38 m |
| 右键 / 中键拖拽 | 平移取景 ±6 m |
| `1`–`7` · `Space`/`Tab` | 机位直选 / 下一档 |
| `A` · `P` | 自动巡游开关 · 暂停巡游 |
| `[` `]` · 时间轴 · 预设 · `N` | 时刻微调 · 拖动 · 预设 · 昼夜循环 |
| `R` · `H` · `M` · `?` | 视角复位 · 隐藏 HUD · 环境声 · 键位面板 |

## 7. 启动与回退

1. `typeof THREE === 'undefined'` → 回退面板「加载不到 Three.js」。
2. `hasWebGL()` 失败 → 回退面板「浏览器未提供可用的 WebGL」（远程桌面/无 GPU 场景给具体建议）。
3. `new THREE.WebGLRenderer` 抛异常 → 回退面板带异常信息。
4. `webglcontextlost` → 停循环 + 面板说明（刷新恢复）。
5. `location.protocol === 'file:'` → 提示「需经 HTTP 访问」，不阻断渲染。
6. 构建任一步抛异常 → 面板显示「构建场景时出错：<步骤名>」+ 堆栈，**不白屏**。

## 8. 校验口径

- `tools/smoke.mjs`：纯 Node，454 条断言。覆盖道路/地形/岸线纯函数、昼夜关键帧连续性与日夜符号、**调色板解析门**（正午天顶亮蓝/深夜暗蓝/黄昏地平线暖色/色号格式）、骑行速度与侧倾夹取、坐标架严格正交（含坡道后仰）、**落座装配门**（`bikeY = 轮半径`、`SADDLE.y` 反推、腿长 vs 踏板可达距离不等式、躯干/头部姿态常数、IK 取号）、**腿部链与传动咬合门**（腿链 `hip → thighPivot → knee → foot` 4 层父子、羽领/膝/踝 3 个链接体、`pedalOffset()` 与曲柄臂旋转逐点一致、64 个踏相位 IK 不被夹、外撇角送到脚踏平面、`CRANK_SIGN` 轮/曲柄同向）、7 档机位局部参数与 `cameraPoseOf` 解算（偏航 +π 换边、滚轮推拉、俯仰夹取不产生 NaN）、`ui.js` 引用的每个 id 在 `index.html` 中存在、时间预设与 `TIME.presets` 一致、渲染层关键写法的正则钉（sRGB→线性 色彩管线、GLSL 局部声明不重名、`setMount` 落座、canvas 构造器写法、audio 不自动播放）、对 18 个 `js/*.js` 逐个 `node --check`、utils 导出「用了就必须 import」的静态 lint。
- `tools/shot.mjs`：headless Chrome（swiftshader）截图；因软渲染 ~1 fps、机位缓动是 dt 驱动，探针走 `?shot=1` 的 `window.__pbike.snapRig(id)` **瞬移落位**，不数按键帧。`shot.mjs legs` 用 `__pbike.legCam(true, d, lat)` 冻住相机贴双腿取景（机位偏移 3.5 s 后自动归零，靠鼠标偏移取特写必被拉回远景），并打印 `__pbike.legs()` 的「踝 ↔ 脚踏世界坐标 / 间隙 / 膝角 / 髋角」。

## 9. 风险与取舍

| 风险 | 取舍 |
| --- | --- |
| 无 `Water` / `Sky` 组件 | 自写着色器，接受「解析波 + 法线采样」级别 realism，不做反射/折射 |
| 无 `BufferGeometryUtils` | 自写 `mergeGeos`，构建期一次性合并，运行期零成本 |
| 植被用面片（cross cards） | 远距离与中景够用，近看有面片感；用密度与风摆遮掩 |
| 鹈鹕是拼装卡通形体 | 保住「一眼认出鹈鹕」的形征（大喙 + 喉囊 + S 颈 + 蹼足），不追求羽丝 |
| 软渲染帧率极低 | 自动降档 + 阴影关闭；截图探针用瞬移落位规避 dt 漂移 |
| 海岸线一致性 | 岸线求根是单一来源，沙滩、泡沫、植被共用同一条 LUT |
