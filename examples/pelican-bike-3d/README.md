# 🐦 3D 鹈鹕海边骑行

> 全屏 3D 海岸公路：一只鹈鹕踩着自行车沿海岸巡航，7 档机位自动巡游 + 鼠标自由接管，昼夜循环，全部素材程序化生成。

| 字段 | 值 |
| --- | --- |
| 分类 | 实验（`experiment`） |
| 状态 | `stable` |
| 标签 | `#threejs` `#3d` `#demo` `#鹈鹕` `#海岸` `#动画` `#移动端` `#触控` |
| 入口 | `examples/pelican-bike-3d/index.html` |
| 创建 / 更新 | 2026-11-20 23:01:17 / 2026-11-21 01:30:00 |
| 注册项 | `registry.json` 中 `url = "examples/pelican-bike-3d/index.html"` |

> 本页与 `examples/pelican-bike/`（Canvas 2D 版鹈鹕骑行）互不依赖：2D 版是「插画动画」，本页是「Three.js 3D 场景 + 视角控制」，两者不共用代码。

## 打开方式

```bash
node server.js                                     # 站点根目录，监听 :39977
# 浏览器打开 http://localhost:39977/examples/pelican-bike-3d/
node examples/pelican-bike-3d/tools/smoke.mjs      # 纯 Node 校验（数学 + 接口钉 + HTML 对齐，不开浏览器）
node examples/pelican-bike-3d/tools/shot.mjs       # headless Chrome 截图复核（需先起服务）
```

拆过代码（`type="module"`）的页面**必须**经 HTTP 访问（ES module 在 `file://` 下受 CORS 限制）；
用 `file://` 直接打开时，页面会弹出提示并引导起本地服务器。

## 用法 / 视角操作

- **首屏**：跟拍机位跟随鹈鹕骑行，海面在左、悬崖在右，太阳高度角由时间轴决定。
- **鼠标**（画布内）：
  - 左键拖拽 = 绕骑行者旋转（方位 ±180°，俯仰 −60°…+60°）
  - 滚轮 = 推拉镜头（距骑行者 2.2 m … 38 m）
  - 右键 / 中键拖拽 = 平移取景（±6 m）
  - 松手 3.5 秒后偏移自动归零，交还给自动巡游
- **触控**：单指拖 = 旋转，双指捏 = 推拉，与鼠标同一条代码路径（Pointer Events）。
- **机位**：HUD 底部机位条点选，或数字键 `1`–`7`；`Space` / `Tab` 下一档。
  1 跟拍 · 2 侧面平移 · 3 低机位轮周 · 4 升镜头 · 5 环绕 · 6 海边低机位 · 7 悬崖俯瞰
- **自动巡游**：每档停留 8 s（±16% 抖动）→ 2.4 s 缓动切到下一档；`A` 开关自动，`P` 暂停。
- **时刻**：右侧时间轴拖动、`[` `]` 微调（0.012 圈/次）、四个预设（黎明 / 正午 / 黄昏 / 夜）、`N` 昼夜循环开关。夜里路灯与车头灯自动点亮。
- **其它**：`H` 隐藏 HUD · `M` 环境声（默认关闭，需一次点击解锁）· `?` 键位面板 · `R` 视角复位 · 左下画质档 `流畅 / 均衡 / 精修`（帧率不足会自动降档）。

## 实现概览

| 文件 | 职责 |
| --- | --- |
| `index.html` | 骨架、HUD、载入面板、`#fallback` 面板、classic `<script>` 载 three r128 + `type="module"` 入口 |
| `css/main.css` | HUD 面板、滑杆、触控 `body.touch`、`prefers-reduced-motion` |
| `js/main.js` | 启动顺序（three → WebGL → 分步构建 → 主循环）、昼夜/雾/灯联动、预算读数、`?shot=1` 钩子 |
| `js/config.js` | **唯一数据源**：单位、道路曲线与纯函数、骑行参数、世界块、渲染参数、三档画质、7 档机位、巡游参数、时间轴、预算 |
| `js/utils.js` | 纯数学：阻尼、角度近路、值噪声/FBM、哈希、时钟格式化 |
| `js/textures.js` | 14 张 canvas 程序化贴图（周期化噪声，接缝无缝）+ 材质工厂 + 显存台账 |
| `js/terrain.js` | 高度场：路面齐平 → 沙丘 → 海岸线 → 海床 → 内侧悬崖；顶点色；随里程回收 5×5 块 |
| `js/road.js` | 沥青路面 + `PropStrip` 实例回收条带（标线/护栏/路灯/里程碑/路侧木料） |
| `js/ocean.js` | 自定义着色器海面：4 道世界波、双层滚动法线、菲涅尔、高光、碎浪、岸线泡沫（LUT）、手写雾 |
| `js/sky.js` | 昼夜关键帧表 `sampleDay(t)`（纯函数）+ 天穹着色器（日/月/星/暖光）+ 太阳/半球光/月补光 |
| `js/bike.js` | 自行车：管架、轮组、曲柄脚踏、车把、车篮（两条鱼）、前灯与光锥 |
| `js/pelican.js` | 鹈鹕：喙与喉囊、S 颈链、头部稳定、翅膀展翅、**双腿骨骼链**（髋→股骨+羽领→膝链接→胫骨→踝链接→蹼足）两节 IK 咬住脚踏、眨眼与随机梳理 |
| `js/rider.js` | 骑行运动学（纯函数 `stepRide`/`frameOf`）+ 组装车与人，输出坐标架给相机 |
| `js/camera.js` | 7 档机位在骑行者坐标架内的 `(az, el, r, tY, tLat, fov)` 解算 + 巡游 + 鼠标偏移叠加 |
| `js/scenery.js` | 棕榈/松树/草丛/礁石/海鸥/云带/海岬/远山脊（`mergeGeos` 合并 + `InstancedMesh`） |
| `js/meshkit.js` | r128 无 `BufferGeometryUtils` → 自写 `mergeGeos` 与实例矩阵写入器 |
| `js/input.js` | Pointer Events（鼠标/触控/滚轮）+ 快捷键 |
| `js/quality.js` | 三档画质 + FPS 自适应 + `localStorage` 偏好 |
| `js/ui.js` | HUD 视图层：机位条、时间轴、画质档、调试读数、提示条、回退面板 |
| `js/audio.js` | 程序化环境声：涌浪、风、胎噪、脚踏咔哒、海鸥叫、展翅 |
| `tools/smoke.mjs` | 454 条纯 Node 断言（数学 + 接口钉 + 源码正则钉 + 全部 `js/*.js` 的 `node --check` + HTML/ui 对齐） |
| `tools/shot.mjs` | CDP headless Chrome 截图（`?shot=1` 瞬移落位；`shot.mjs legs` = 贴双腿特写 + 踝↔脚踏间隙读数） |

## 技术要点

- **r128 约定**：`renderer.outputEncoding = THREE.sRGBEncoding`，位图贴图 `encoding = sRGBEncoding`，法线/数据纹理 `LinearEncoding`；`PCFSoftShadowMap`；DPR 按画质档上限。
- **无 `examples/jsm`**：仓库内只有 `three.min.js` 本体，所以相机控制、水面、天空、几何合并全部自写（没有 OrbitControls / Water / Sky / BufferGeometryUtils 可用）。
- **零二进制资产**：所有贴图由 canvas 2D 程序化绘制（周期化 value noise，平铺无缝），`tools/out/preview-textures.png` 可打样复核；不下载、不引 CDN。
- **里程块回收**：地形 5×5（128 m 块）、公路 16 块（64 m）、植被 22 块（32 m）、远景 3 块，都以骑行者 z 为中心环形复用，骑行无限远不回弹；实例条带按 `tileKey` 稳定哈希复现同一布局。
- **海岸线是解析的**：`terrainHeight` 是纯函数（路面在 `|d| ≤ 4.8 m` 内严格齐平 → 路面不倾斜），`shoreXAt(z)` 用二分求海平面交点，海面着色器与沙滩条带共用同一条岸线 LUT。
- **相机不脱离主体**：机位在骑行者自身坐标架（前进/上/右）内解算，所以任意时刻骑行者都在画面内；切机位用角度近路插值 + 双层阻尼，`R` 一键复位。
- **预算**：`mid` 档目标 drawCalls ≤ 120、tris ≤ 450 k、≥ 55 fps；`renderer.info` 实时显示在 HUD 左上，帧率 < 28 自动降档。

## 校验

- `tools/smoke.mjs`（454 条，全部在纯 Node 跑）：道路/地形纯函数、海岸线求根、昼夜关键帧连续性与日夜符号、**昼夜调色板解析门**（正午天顶必须亮蓝、深夜天顶暗蓝、黄昏地平线暖色、关键帧色号 6 位十六进制）、骑行速度/侧倾夹取、坐标架严格正交（含坡道）、**落座装配门**（整车抬高 = 轮半径、`SADDLE.y` 反推、腿长与踏板可达距离不等式、躯干/头部姿态常数、IK 取号）、**腿部链与传动咬合门**（腿链 4 层父子 + 膝/踝/羽领 3 个链接体、`config.pedalOffset()` 与曲柄臂旋转逐点一致、64 个踏相位 IK 全程不被夹、外撇角把脚踝送到脚踏平面、`RIDE.CRANK_SIGN` 让轮与曲柄同向）、7 档机位局部参数与鼠标偏移解算（偏航 +π 换边、滚轮推拉改变距离）、`ui.js` 引用的每个 `id` 都在 `index.html` 里、时间预设与 `TIME.presets` 对齐、渲染层关键写法的正则钉（sRGB 线性化管线、GLSL 局部变量不重名、`setMount` 落座、canvas 构造器写法、远处 alpha 精灵关 mipmap）、对 18 个 `js/*.js` 逐个 `node --check`、utils 导出「用了必须 import」静态 lint。
- `tools/shot.mjs`（headless Chrome + swiftshader）：默认截 跟拍 / 侧面 / 环绕 / 海边低机位 / 低机位轮周 / 夜景 六张 + 首屏 + 拖拽复核，并打印 drawCalls / tris / 控制台告警；`node .../shot.mjs legs` 用 `__pbike.legCam()` 冻住相机取双腿特写，打印每腿「踝 ↔ 脚踏」间隙与膝/髋角。

## 已知限制

- 软渲染（远程桌面 / 无 GPU）下帧率很低，会自动降到「流畅」档；`#fallback` 面板给出可读原因。
- 水面是解析波浪 + 双层法线的着色近似，没有真实反射与折射；太阳高光是各向同性点光近似。
- 鹈鹕为程序化拼装的卡通形体（约 60 个图元），羽毛是贴图 + 顶点色，不是羽丝级建模。
- 棕榈叶与松树冠是十字面片，近距离斜看会出现面片感（画质档 `精修` 也只是提高实例密度）。
- 环境声是 WebAudio 程序合成的涌浪与风，采样自然，但不含定向声像。
