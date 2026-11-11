# 3D 故宫游览 · 素材清单与程序化生成台账

> 本页面的**素材唯一登记表**。规矩：
> 1. **零二进制**——贴图由 Canvas 生成、音效由 WebAudio 合成，仓库里不出现任何图片/模型/音频文件。
> 2. 新增一个程序化素材 = 在「贴图工厂」表加一行（含尺寸、预算、调用点）；新增音效 = 在「音频工厂」表加一行。
> 3. 若未来真要引入外部素材，先读 [docs/research.md](research.md) 的许可红线，再走 [assets/vendor/README.md](../../../assets/vendor/README.md) 流程登记 SHA-256，并回到本文件补「外部素材」表。

---

## 1. 为什么不下载模型 / 贴图

| 理由 | 依据 |
| --- | --- |
| 站内规范：能程序化生成的素材一律代码生成，不下载文件 | [assets/vendor/README.md](../../../assets/vendor/README.md)「新增依赖的流程」第 1 条 |
| 运行时不连外部 CDN；单页未压缩依赖建议 ≤1MB、依赖数 ≤3 | 同上 |
| 故宫官方影像与 3D 展示禁止二次传播，不可入库 | [docs/research.md](research.md) §0 |
| 免费「故宫」GLB 许可多为 CC-BY-NC，且体积过大 | 同上 |

**代价与补偿**：程序化屋顶/斗拱不可能达到扫描级精度 → 用「形制正确 + 尺度实测 + UV 曲线屋面 + 彩画贴图」保证观感与严谨性；细节靠走兽序列、螭首、隔扇菱花这类**可辨识特征**补足。

---

## 2. 贴图工厂（`js/textures.js`）

约定：所有工厂是纯 Canvas2D 函数 `draw(ctx, w, h, opts)`，`makeTexture(THREE, entry, opts, o)` 才接触 three.js（可在 Node 侧注入 provider 测试）。
统一设 `.encoding = THREE.sRGBEncoding`（albedo；数据贴图如水面法线保持 Linear）、`anisotropy = min(4, maxAnisotropy)`、`generateMipmaps = true`。
**r128 没有 `SRGBColorSpace`/`.colorSpace`，那是 r15x 的字段**（见 PROGRESS.md D9）。
**预算口径**：显存 ≈ 宽 × 高 × 4 B × 1.33（mipmap）。目标总量 ≤ **128 MB**。

| id | 函数 | 尺寸(px) | 用途 / 调用点 | 依赖噪声 | 状态 |
| --- | --- | --- | --- | --- | --- |
| T01 | `roofTiles({rows,cols,hue})` | 512×512（可平铺） | 琉璃筒瓦屋面；黄=殿宇、绿=配殿/门 | 值噪声 | ✅ |
| T02 | `ridgeTile()` | 256×256 | 正脊 / 垂脊 / 戗脊的脊筒与走兽底 | 值噪声 | ✅ |
| T03 | `marble({veins})` | 1024×1024 | 汉白玉台基、栏杆、御路 | fbm + 冰裂 | ✅ |
| T04 | `marbleCarve()` | 512×512 | 栏板浮雕（云纹/龙纹）近似 bump | 曲线绘制 | ✅ |
| T05 | `goldBrick({cells})` | 1024×1024 | 殿内金砖墁地、广场铺地 | 值噪声 + 拼缝 | ✅ |
| T06 | `stonePaving()` | 512×512 | 台基顶面 / 院落石板 | 值噪声 | ✅ |
| T07 | `redWall({plaster})` | 512×512 | 红墙、门庑墙面（含灰抹与斑驳） | fbm | ✅ |
| T08 | `latticeWindow({cell,kind})` | 512×512 + alpha | 三交六椀菱花窗 / 斜方格窗 | 矢量绘制 | ✅ |
| T09 | `doorLeaf({studs})` | 512×512 | 隔扇、门钉、金饰铺首 | 矢量绘制 | ✅ |
| T10 | `caihua({kind})` | 1024×128（长条） | 梁枋彩画：和玺 / 旋子 | 矢量 + 噪声 | ✅ |
| T11 | `woodColumn()` | 256×512 | 檐柱/金柱红漆金剁、门槛 | 值噪声 | ✅ |
| T12 | `cloudDragon()` | 512×512 | 藻井蟠龙（室内天花） | 矢量 + fbm | ✅ |
| T13 | `plaque({text,w,h})` | 动态 | 匾额汉字（**系统字体**，无字体文件） | — | ✅ |
| T14 | `bronzeVessel()` | 256×256 | 铜鹤 / 铜龟 / 鼎 / 日晷的青铜氧化 | fbm | ✅ |
| T15 | `gravel()` | 256×256 | 院内散水、甬路两侧 | 值噪声 | ✅ |
| T16 | `waterNormal({size})` | 256×256（可平铺） | 金水河 / 筒子河法线 | fbm + sin | ✅ |
| T17 | `skyGradient()` | 512×512 | 天穹渐变 + 地平线雾（替代 Sky.js） | — | ✅ |
| T18 | `stoneRamp()` / `dirt()` | 256×256 | 踏道、土山（景山/堆秀山） | fbm | ✅ |

**实现要点（阶段 2 落地时确定）**：`js/textures.js` 的每个工厂是纯函数 `draw(ctx, w, h, opts)`，
只依赖 Canvas2D；`makeTexture(THREE, entry, opts, {provider})` 才碰 three.js。因此工厂可在 Node 里
用注入的 provider 做冒烟测试（浏览器 / headless / vm 三种口径都在 `smoke.mjs` 里跑）。
预算实测：**24.69 MB / 18 张**（上限 128 MB，单张 ≤ 1024px）。打样复核：`tools/preview-textures.mjs`。

**图集化策略**：T03/T05/T07 这类大面积贴图保持独立可平铺（平铺省显存）；
T10–T14 这类小图烘进一张 2048×2048 图集，供 `InstancedMesh` + UV 偏移复用。

---

## 3. 几何工厂（`js/parts.js` → `js/buildings.js`）

| id | 构件 | 形制来源 | 实例化 | 状态 |
| --- | --- | --- | --- | --- |
| G01 | `terrace({layers})` | 三层汉白玉须弥座（8.13 m，research.md §3.1） | ✅ | ✅（阶段 5 三大殿坐落顶面） |
| G02 | `railing({len,posts})` | 望柱 + 寻杖栏板 | ✅ | ✅ |
| G03 | `chiShou()` | 台基排水螭首（千龙吐水） | ✅ | ✅（台基顶层四角） |
| G04 | `columnGrid({bays,depth,radius})` | 面阔 × 进深柱网；侧脚 / 生起可选 | ✅ | ✅ |
| G05 | `douGong({tier})` | 柱头铺作外观近似 + 彩画贴图 | ✅ | ✅（非实例化 + 合批） |
| G06 | `beamFrame()` | 额枋 / 平板枋 / 梁架示意层 | ❌（合批） | ✅ |
| G07 | `hipRoof()` 庑殿 | research.md §5 | ❌ | ✅（太和/保和/门楼） |
| G08 | `gableHipRoof()` 歇山 | 同上（九脊） | ❌ | ✅（保和殿 + 配楼） |
| G09 | `squareZuanjian()` 四角攒尖 | 中和殿（铜鎏金宝顶） | ❌ | ✅ |
| G10 | `eaveLayer()` 上下檐 | 重檐建筑的檐口分离，便于起翘 | ✅ | ✅ |
| G11 | `ridge({len,type})` + `beastRow(n)` | 正脊/垂脊/戗脊 + 走兽序列（太和殿 10、乾清宫 9） | ✅ | ✅ |
| G12 | `chiwen()` 吻兽 | 正脊两端 | ✅ | ✅（太和殿 2/9 留 TODO(verify)，D8） |
| G13 | `latticeDoor({count})` / `latticeWindow()` | 隔扇 + 菱花窗（可开合） | ✅ | ✅ |
| G14 | `gateTower({plan})` | 城台 + 垛口 + 重檐门楼（午门凹字平面） | ❌ | ✅ |
| G15 | `corridor({len})` | 庑房廊道（一段一实例，可长距重复） | ✅ | ✅（东西庑 + 两翼廊庑） |
| G16 | `pavilion({sides})` | 重檐亭 / 井亭（角楼、御花园） | ❌ | ✅（阙亭 / 桥亭 / 井亭；御花园留阶段 7） |
| G17 | `bridge({arches})` | 内金水桥五孔拱桥 + 栏板 | ❌ | ✅（五桥系，阶段 4c） |
| G18 | `wallCity({len,h})` | 城墙（10 m）+ 女墙 + 城台 | ✅ | ✅（4 段 + 平台基座 G23） |
| G19 | `cornerTower()` | 角楼（简化十字脊近似，见 research.md §8） | ❌ | ✅ |
| G20 | `interiorSet({kind})` | 宝座 / 地屏 / 屏风 / 象辇 / 灯座 / 香筒 | ✅ | ✅（阶段 5c） |
| G21 | `zaoJin()` 藻井 | 室内天花中心蟠龙藻井 | ❌ | ✅（阶段 5c，蟠龙 = 简化近似 D10） |
| G22 | `tree({kind})` | 柏树 / 槐树（御花园、宫廷植树） | ✅ | ✅（景山 21 株；御花园留阶段 7） |
| G23 | `cityPlatform({plan})` | 午门城台本体：红墙台体 + 五券门 + 海墁 + 四圈女墙 + 每 3.2 m 一齿垛口 | ✅ | ✅（午门凹字城台，阶段 4 第二批） |
| G24 | `bridgePavilion({bays})` | 桥顶亭：三间桥亭（内外桥）+ 五间桥亭（御路桥） | ❌（合批） | ✅（桥系五桥，阶段 4 第二批） |
| G25 | `ruffTop()` + `river()` | 盝顶（四坡梯形 + 平顶盘 + 四脊 + 鎏金宝球）/ 河床 + 水面 + 两岸石堤白石压顶 | ❌ | ✅（午门后四盝顶 + 内金水河，阶段 4 第二批） |

**组合器**（`buildings.js`，数据驱动）：`hall()` / `gate()` / `tower()` / `corridorRun()` / `pavilion()`。
一座建筑 = 一份 `layout.js` 记录 + 一个组合调用；新增建筑只改数据表。

---

## 4. 音频工厂（`js/audio.js`，WebAudio 合成，零文件）

| id | 音源 | 合成方式 | 触发点 | 状态 |
| --- | --- | --- | --- | --- |
| A01 | `footstep(kind)` | 短噪声 burst + 带通（石/砖两种色） | 行走，随步频节流 | ⬜ |
| A02 | `gong()` / `bell()` | 多正弦泛音 + 指数衰减包络 | 进入殿宇、菜单确认 | ⬜ |
| A03 | `drum()` | 低频正弦 sweep + 噪声 | 中轴门洞开启、成就 | ⬜ |
| A04 | `wind()` | 噪声 → bandpass，LFO 调制 | 环境循环（音量随高度） | ⬜ |
| A05 | `water()` | 双噪声层 + 慢 LFO | 金水河 / 筒子河近场 | ⬜ |
| A06 | `ui(kind)` | 极短 FM blip | UI 点击、热点选中 | ⬜ |

**约束**：所有节点在用户首次手势后创建（`AudioContext` resume）；页面不可见 / `prefers-reduced-motion` 时静音；总增益 ≤ 0.5。

---

## 5. 数据类素材（非图像）

| id | 文件 / 位置 | 内容 | 状态 |
| --- | --- | --- | --- |
| D01 | `js/layout.js`（**单一数据源**） | 建筑表：id、中文名、`(cx,cz)`、面阔/进深间数、屋顶形制、台基层数、`interior`、`doors[]`、讲解热点 id | ✅（14 条中轴记录 + `TERRACE` + `onTerrace` + `wumenPlan`/`bridgePlan`；`buildAll` 出 `entries[]` 带 `fp/cz/y` 供碰撞/小地图派生） |
| D02 | `data/buildings.json`（由 D01 导出） | 同上的 JSON 快照，供 Node 校验与后续外部工具消费 | ⬜ |
| D03 | `js/hotspots.js` 或 `data/hotspots.json` | 讲解卡文案（标题、正文、出处链接），数据驱动 | ⬜ |
| D04 | `js/achievements.js` | 成就表（走完中轴 / 三殿入内 / 御花园 / 全部门开启） | ⬜ |

> **单一数据源原则**：碰撞体、小地图、导览热点全部从 D01 派生。改建筑只改一处，杜绝「视觉能过、碰撞不能过」。
> D02 用 `node examples/forbidden-city/tools/export-layout.mjs` 生成，勿手改。

---

## 6. 外部素材接入位（当前为空）

| 槽位 | 计划路径 | 启用条件 |
| --- | --- | --- |
| 真实贴图（CC0） | `examples/forbidden-city/data/tex/` | 需要砖石/瓦面扫描质感时，从 Poly Haven 选 CC0，登记 SHA-256 后入库 |
| GLB 模型（陈设级） | `examples/forbidden-city/data/models/` + `THREE.GLTFLoader` | 需先把 r128 的 `examples/js/loaders/GLTFLoader.js`(96,550 B) 按 vendor 流程入库（见 research.md §6） |
| 天空 / 水面扩展 | `examples/forbidden-city/data/` 不动，vendor 新增 `Sky.js` / `Water.js` | 仅当程序化天空（T17）明显不够时；注意单页依赖 ≤3 个的软约束 |

**当前状态：三项都未启用。本页面运行时只依赖已入库的 Three.js r128。**

---

## 7. 素材预算自检（`tools/smoke.mjs` 会断言）

阶段 6 后实测（2026-11-11，smoke 装配统计 + `shot.mjs` 页面 HUD 读数）：

| 指标 | 上限 | 实测 | 说明 |
| --- | --- | --- | --- |
| 贴图总显存 | ≤ 128 MB | **24.69 MB / 18 张** | 按 §2 表逐行累加，smoke 用「尺寸 × 4B × 1.33」估算 |
| 单张贴图尺寸 | ≤ 1024 px | 1024（T01–T09）/ 512（T10–T18） | 低端机纹理内存与采样带宽 |
| 材质数（`THREE.Material`） | ≤ 24 | **23**（余 1） | 合批前提：同材质才能合并；**加新材质先来本节登记**。阶段 6 新增两块：`goldBrick`（殿内金砖墁地，T05 首次成材质）＋藻井顶片 `MeshBasicMaterial`（T12 `cloudDragon` 直挂、`toneMapped:false` 不受光照）。踏道并 `marble`、金柱冠/铜缸并 `gold` 是复用先例 |
| `Mesh` 批次数（装配统计） | ≤ 280 | **270**（余 10） | smoke 断言 `Mesh 数 ≤ BUDGET.drawCallsMid`；阶段 6 +27 = 每殿室内 1 新材质桶 ×3 + 10 扇**可动门扇**逐扇留批（动画必要代价，D35） |
| `drawCalls`（中档画质） | ≤ 280 | **首屏 239 / 俯瞰 273 / 门开 137 / 入内 144** | 高画质档放宽到 ≤ 420（未实测，阶段 9 复核）；`BUDGET.drawCallsMid` 260→280 见 D33 |
| 三角面 | ≤ 900k | smoke 55.1k；页面首屏 183k | 含远景 LOD（阶段 11 前不会到预算） |
| 实例总数（护栏） | ≥ 6000（自写上界 6200） | **6180**（上界余 20） | 大构件必须实例化；见 devlog 踩坑 17/21 |
| 音效节点常驻 | ≤ 12 | 0（阶段 10 未做） | 超出即回收 |
