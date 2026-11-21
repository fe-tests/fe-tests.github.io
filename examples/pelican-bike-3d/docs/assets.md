# 3D 鹈鹕海边骑行 · 素材台账（全程序化，零二进制）

> 本页**没有任何图片 / 模型 / 音频文件**。所有位图在运行时由 canvas 2D 绘制（`js/textures.js`），
> 所有几何由 three.js 图元拼装（`js/bike.js`、`js/pelican.js`、`js/scenery.js` + `js/meshkit.js` 合并），
> 所有声音由 WebAudio 合成（`js/audio.js`）。不引 CDN、不下载、`tools/out/` 不入库。

## 1. 位图台账（14 张，总计 5.94 MB，最大边 512）

下列数字由 `js/textures.js` 的 `textureBudgetReport()` 产出（预算：`config.BUDGET.texTotalMB = 96`、`texMaxSide = 1024`）：

| 编号 | 名称 | 尺寸 | 显存（含 mip ×1.33） | 平铺 | 色彩空间 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | `asphalt` | 512² | 1.33 MB | ✅（6.5 m/张） | sRGB | 路面、路肩、护栏基座 |
| T02 | `sand` | 512² | 1.33 MB | ✅（8 m/张） | sRGB | 沙滩 / 沙丘（配顶点色） |
| T03 | `rock` | 512² | 1.33 MB | ✅（22 m/张） | sRGB | 悬崖、礁石、石墙、远山脊 |
| T04 | `dirt` | 256² | 0.33 MB | ✅（10 m/张） | sRGB | 路侧土带、护坡 |
| T05 | `bark` | 128×256 | 0.17 MB | ✅（3 m/张） | sRGB | 棕榈干、松干、路侧木料 |
| T06 | `palmLeaf` | 128×256 | 0.17 MB | 透明片 | sRGB | 棕榈叶（扇形十字面片） |
| T07 | `foliage` | 128² | 0.08 MB | 透明片 | sRGB | 松树冠 / 灌木 |
| T08 | `grass` | 64² | 0.02 MB | 透明片 | sRGB | 草丛十字面片 |
| T09 | `cloud` | 256² | 0.33 MB | 透明片 | sRGB | 高空云带（随昼夜染色） |
| T10 | `foam` | 128² | 0.08 MB | ✅ | sRGB | 岸线泡沫片、碎浪花片 |
| T11 | `gull` | 64² | 0.02 MB | 透明片 | sRGB | 海鸥片（远景点缀） |
| T12 | `feather` | 256² | 0.33 MB | ✅（0.6 m/张） | sRGB | 鹈鹕体羽、翼面 |
| T13 | `waterNormal` | 256² | 0.33 MB | ✅（9 m/张） | **Linear** | 海面双层滚动法线（片元里双层采样） |
| T14 | `glow` | 128² | 0.08 MB | 透明片 | sRGB | 路灯光晕、车头灯、光锥 |

- 平铺贴图都用**周期化噪声**（`pnoise` / `pfbm`，见 `js/textures.js`）绘制，接缝无缝；`tile` 项在 `makeTexture` 里设 `wrapS/T = RepeatWrapping`，`metric` 是「米/张」，用于按世界尺寸算 UV（`kit.uvScale`）。
- 色彩空间纪律：albedo 位图 `encoding = THREE.sRGBEncoding`；法线 / 数据类用 `LinearEncoding`（T13）。渲染器 `outputEncoding = sRGBEncoding`。
- 各向异性上限 `RENDER.maxAnisotropy = 8`（与渲染器能力取 min）。
- 生成器打样复核：控制台里 `import('./js/textures.js')` → `renderTextureCanvas(entry, CanvasCtor)` 出 canvas，逐张存图检查接缝。

## 2. 运行时数据纹理（着色器用）

| 纹理 | 尺寸 | 出处 | 用途 |
| --- | --- | --- | --- |
| 岸线 LUT | 1024×1（R 粗 + G 细，解码 `(r*256+g)/255*400−200`） | `ocean.js` 的 `makeShoreLUTCanvas()` | 岸线泡沫沿 z 的定位；与沙滩条带、`shoreXAt()` 严格一致 |

## 3. 几何台账（拼装 + 合并）

| 组件 | 组成 | 合并 / 实例化 | draw call 贡献 |
| --- | --- | --- | --- |
| 自行车 | 管架（多个 CylinderGeometry）、轮组（Torus + 18 根轮辐实例）、脚踏、车把、车篮、鱼 ×2、前灯 + 光锥 | 单一 `Group`，约 30 图元 | 1 组（约 30） |
| 鹈鹕 | 体（变形的球）、喙 + 喉囊、S 颈 4 节、翼 2×2 骨、**双腿骨骼链**（髋→〔股骨 + 羽领〕→ 膝链接球→〔胫骨 + 踝链接球〕→ 蹼足：掌 + 三趾 + 后趾；同材质图元 `mergeGeos` 烘成一份，一腿 3 个 draw call）、眼 + 睑、冠羽 | 单一 `Group`，约 52 图元；`setDetail()` 按画质档摘小构件 | 1 组（约 52，低档 ~34；腿合并后低档全场景 drawCalls 161 → 153） |
| 地形块 | `PlaneGeometry` × 25（128 m 块，段数按档）+ 沙滩条带 | 顶点色，不依赖 UV 贴图精度 | ~25 |
| 路面 | 5 个横向列 + 路拱 + 路肩跌落 | 16 块回收 | ~16 |
| 道路道具 | 虚线 / 边线 / 护栏柱 + 双横杆 / 石墙 / 灯柱 + 灯头 + 地面光池 / 里程碑 / 木料 | `PropStrip` 的 `InstancedMesh` | ~10 |
| 植被与远景 | 棕榈（干 + 叶）/ 松（干 + 冠）/ 草十字 / 礁石 / 海岬 / 远山脊 | `mergeGeos` 合并 + `InstancedMesh` | ~10 |
| 海面 | 单块网格（跟随骑行者、80 m 对齐） | 1 个 `ShaderMaterial` | 1（+ 泡沫实例 + 水花 `Points`） |
| 天空 | 天穹球 + 星点 `Points` | 1 | 2 |

`mid` 档目标：drawCalls ≤ 120、tris ≤ 450 k；HUD 左上实时显示 `renderer.info.render` 的 calls / tris，超预算一眼可见。

## 4. 声音台账（全合成）

| 元素 | 实现 | 参数来源 |
| --- | --- | --- |
| 涌浪 | 噪声源 → 低通 → 增益，LFO 摆幅度与截止频率 | 昼夜（夜间更弱）+ 速度 |
| 风 | 噪声 → 带通 | 昼夜 + 速度 |
| 胎噪 | 噪声 → 高通（1.2–3.4 kHz 随速） | 骑行速度 |
| 脚踏咔哒 | 短噪声带通，每半踏频一次 | `crankPhase` |
| 海鸥叫 | 锯齿波 + 带通 + 频率下滑 + 颤音 | 随机 7–21 s |
| 展翅 | 低频扫频噪声 | `pelican.state.flapT` 触发 |

默认关闭；`M` 或 HUD 按钮开启（首次指针手势解锁 `AudioContext`），主增益初值为 0 —— **绝不自动播放**。

## 5. 依赖登记

| 依赖 | 位置 | 版本 | 使用页面 |
| --- | --- | --- | --- |
| Three.js（UMD 全局 `THREE`） | `assets/vendor/three/r128/three.min.js` | r128 | `forbidden-city`、`pelican-bike-3d` |

- 仓库里只有 `three.min.js` 本体，**没有 `examples/jsm`** → 无 OrbitControls / Water / Sky / BufferGeometryUtils 可用，相机控制、海面、天空、几何合并全部本页自写。
- `assets/vendor/README.md` 的 Three.js 行「使用页面」已加 `pelican-bike-3d`。
- 本页不 import 其它页面目录的任何文件（页面目录自包含）。
