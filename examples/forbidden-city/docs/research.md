# 3D 故宫游览 · 联网素材与实测数据调研

> 本文件是**数据资产档案**：所有建模用的尺度、形制、陈设结论都必须在此有出处。
> 每次追加新的检索结果请写「来源 URL + 摘录 + confidence」，代码里的数值要能反查到本节某一行。
> confidence 分级：`high`（多源一致或权威）/ `medium`（单源但常见）/ `low`（单源、二手、或表述含糊）。
> **本页面素材全部程序化生成**，不下载任何外部模型 / 贴图 / 音频；外部资源只作为「形制参考」记录在此。

---

## 0. 许可红线（先读，别踩）

| 来源 | 可用性 | 说明 |
| --- | --- | --- |
| [故宫名画记](https://www.dpm.org.cn/collection/paint.html) | ❌ 不可入库 | 《清明上河图》等已开放 8000× 高清影像，但网站声明禁止商业使用与二次传播；**任何 dpm.org.cn 的图像/模型都不进仓库** |
| [故宫数字多宝阁](https://www.dpm.org.cn/trosrs/326149) | ❌ 不可入库 | 3D 文物展示，站内授权，不可再分发 |
| SketchFab / Turbesite / ClayML 上的「故宫」免费 GLB | ❌ 本计划不采用 | 许可多为 CC-BY-NC 或不可再分发；且体积远超站内「单页未压缩依赖 ≤1MB」建议 |
| [Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) / [Poly Haven](https://polyhaven.com/textures)（CC0） | ⚪ 备用接入位 | 许可明确、可再分发；若后续要真实贴图，从这里走 `assets/vendor/` 入库流程并登记 SHA-256 |
| Wikipedia（zh/en） | ✅ 仅作数据参考 | 文字事实可引用；其共享图像的许可证需逐张核对，本页**不下载任何图片** |

站内规范依据：[assets/vendor/README.md](../../../assets/vendor/README.md) ——「能程序化生成的素材一律代码生成，不下载文件」。
本页面据此**零二进制资产**：贴图 = `THREE.CanvasTexture`，音效 = WebAudio 合成。

---

## 1. 全局尺度（紫禁城总平面）

| 数据 | 值 | confidence | 来源 |
| --- | --- | --- | --- |
| 南北长 | 961 m | high | [zh.wikipedia.org/故宫](https://zh.wikipedia.org/wiki/%E6%95%85%E5%AE%AB) |
| 东西宽 | 753 m | high | 同上 |
| 城墙高 | 10 m | high | 同上 |
| 护城河（筒子河）宽 | 59 m | high | 同上 |
| 占地面积 | 72 公顷（约 72 万 m²） | high | 同上；[en.wikipedia.org/Forbidden_City](https://en.wikipedia.org/wiki/Forbidden_City) 记 72 ha |
| 建筑面积 | 约 15 万 m² | medium | zh.wiki |
| 房间数 | 传说 9999 间，实测约 8886 间 | medium | en.wiki（"claims 9,999 … experts have shown 8,886"） |
| 建成年 | 明永乐十八年（1420） | high | 两侧 wiki 一致 |
| 四门 | 南午门 / 北神武门 / 东东华门 / 西西华门 | high | zh.wiki |
| 城墙四角 | 角楼各一座，「九梁十八柱七十二条脊」 | medium | zh.wiki（形容结构复杂，非实测绘） |
| 分区 | 外朝（三大殿 + 文华殿 / 武英殿翼）· 内廷（后三宫 + 御花园 + 东西六宫） | high | zh.wiki |

**代码落点**：`js/config.js` 的 `CITY`；`1 unit = 1 m`，`+Z` 朝南，中轴 `x = 0`。
城墙与护城河按矩形近似（真实平面略呈梯形，误差对本体验不可见，见 design.md「取舍」）。

---

## 2. 外朝中轴（南 → 北）

| 序 | 建筑 | 关键形制 | confidence | 来源 |
| --- | --- | --- | --- | --- |
| 1 | 午门 | 平面凹字形、重檐庑殿顶、俗称五凤楼；建成 1420，1647 重修 | medium（凹字 + 五凤楼为通识） | [zh.wiki/午門 (北京)](https://zh.wikipedia.org/wiki/%E5%8D%88%E9%96%80_(%E5%8C%97%E4%BA%AC)) |
| 2 | 内金水桥 / 金水河 | 午门后（北）横跨中轴，五孔拱桥跨河 | medium | 午门条目「午门后有太和门」+「北 = 太和门／内金水桥」方位表 |
| 3 | 左右阙亭 | 午门广场东西各一座方亭（阙左门 / 阙右门侧） | low | 午门条目方位表提到「西南 阙右门／社左门、东南 阙左门」 |
| 4 | 太和门 | 明称奉天门 / 皇极门，清改太和门；重檐歇山顶（待复核） | medium | zh.wiki/太和殿（历史节）、午门条目 |
| 5 | 体仁阁 / 弘义阁 | 太和殿广场东南 / 西南各一座楼阁（庑房的一部分） | medium | zh.wiki/太和殿（「太和殿东庑、西庑」+ 方位表：左翼门・弘义阁 / 右翼门・体仁阁） |
| 6 | 中左门 / 中右门、左翼门 / 右翼门 | 三大殿院落的门 | low（仅名称与方位） | zh.wiki/太和殿 方位表 |

> ⚠️ **待复核**：午门门洞数量（常见说法「中开三门 + 东西各一掖门」= 五门）、太和门屋顶形制（重檐歇山 vs 庑殿）。
> 当前代码按 `medium` 取值并在 `layout.js` 注释标 `// TODO(verify)`；复核到更权威来源后改数据表即可，不动架构。

---

## 3. 三大殿（核心：可入内的三座）

### 3.1 三层汉白玉台基（三殿共基）

| 数据 | 值 | confidence | 来源 |
| --- | --- | --- | --- |
| 台基总高 | **8.13 m**，三层 | high | [zh.wiki/太和殿](https://zh.wikipedia.org/wiki/%E5%A4%AA%E5%92%8C%E6%AE%BF)：「三大殿所在的高三层汉白玉台基」；[zh.wiki/中和殿](https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%92%8C%E6%AE%BF) 同段 |
| 围栏 | 四周环以汉白玉栏杆 | high | 同上 |
| 排水 | 每层栏板下雕龙首（螭首）出水，「千龙吐水」 | high | 太和殿 / 中和殿条目均记 |

**代码落点**：`parts.js` → `terrace()`；三层等分 ≈ 2.71 m/层，踏道三段分台。

### 3.2 太和殿（外朝第一殿，重檐庑殿）

| 数据 | 值 | confidence | 来源 |
| --- | --- | --- | --- |
| 面阔 | **11 间 / 63.96 m** | high | zh.wiki/太和殿 |
| 进深 | **5 间 / 37.20 m** | high | 同上 |
| 通高 | **35.05 m**（自地面） | high | 同上 |
| 建成 / 现存形制 | 1420 建（奉天殿）；现存为康熙三十四至三十六年（1695–1697）重建后形制 | high | 同上 |
| 明初原体量 | 面阔 95 m、进深 48 m、面积约 4522 m²（「广三十丈，深十五丈」） | medium | 同上引《明世宗实录》 |
| 屋顶形制 | 重檐庑殿顶（现存古建筑中最高等级） | high | zh.wiki 分类「重檐庑殿顶建筑」；en.wiki |
| 室内柱网 | **72 根**（含檐柱与金柱） | medium | zh.wiki/太和殿（"殿内共有 72 根大柱"表述，具体分列有争议 → 代码只做外观 + 室内示意层） |
| 室内中心 | 宝座 + 藻井蟠龙 + 「皇建有极」匾（乾隆题）方向 | medium | zh.wiki/太和殿陈设节；[en.wiki/Hall_of_Supreme_Harmony](https://en.wikipedia.org/wiki/Hall_of_Supreme_Harmony) |
| 两侧 | 中左门 / 中右门，东西庑房（弘义阁、体仁阁） | medium | zh.wiki 方位表 |

**代码落点**：`layout.js` → `id: 'taihe'`；`bayW = 63.96/11 ≈ 5.81 m`，`bayD = 37.20/5 = 7.44 m`。

### 3.3 中和殿（方形，单檐四角攒尖）

| 数据 | 值 | confidence | 来源 |
| --- | --- | --- | --- |
| 平面 | **正方形**，面阔三间 = 进深三间 | high | [zh.wiki/中和殿](https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%92%8C%E6%AE%BF)；[en.wiki/Hall_of_Central_Harmony](https://en.wikipedia.org/wiki/Hall_of_Central_Harmony)「square in shape」 |
| 通高 | **27 m**（zh）/ 29 m（en，条目正文） | **low** ⚠️ 两源不一致 → 代码取 27 m 并注释标分歧 | 同上 |
| 屋顶 | 单檐四角攒尖顶，中置铜鎏金宝顶；屋面铺黄琉璃瓦 | high | zh.wiki/中和殿 |
| 建筑面积 | 580 m²（三殿中最小） | medium | zh.wiki |
| 门窗 | **四面开门**：南面「三交六椀菱扇」12 樘，东、北、西各 4 樘 | high | zh.wiki |
| 门前踏道 | 南北各三出、东西各一出，中间为御路（浮雕云龙纹） | medium | zh.wiki |
| 室内陈设 | 正中宝座 + 地屏，两侧肩舆 2 顶；内檐悬乾隆「允执厥中」匾，柱挂对联 | high | zh.wiki |
| 彩画 | 内外檐饰金龙和玺彩画，天花为沥粉贴金正龙 | medium | zh.wiki |

**代码落点**：`layout.js` → `id: 'zhonghe'`；方形 footprint，四向开门 → 「四面可入」是碰撞门洞最多的建筑。

### 3.4 保和殿（重檐歇山，减柱造）

| 数据 | 值 | confidence | 来源 |
| --- | --- | --- | --- |
| 屋顶 | 重檐歇山顶；现存主体梁架仍为明代原构 | high | [zh.wiki/保和殿](https://zh.wikipedia.org/wiki/%E4%BF%9D%E5%92%8C%E6%AE%BF) |
| 面阔 | **九间** | high | 同上 |
| 结构特点 | **「减柱造」**：减去殿内前檐金柱 6 根，空间开敞 | high | 同上 |
| 用途演变 | 明：大典前更衣；清：赐宴外藩、年终填黄册；乾隆五十四年（1789）起固定为**殿试**场所 | high | 同上 |
| 初名 / 改名 | 1420「谨身殿」→ 1562「建极殿」→ 1645「保和殿」 | high | 同上 |

**代码落点**：`layout.js` → `id: 'baohe'`；室内柱网刻意**前排少 6 根金柱**（减柱造的可视化就是这一条，务必保留）。

---

## 4. 内廷中轴（北段）

| 建筑 | 关键形制 | confidence | 来源 |
| --- | --- | --- | --- |
| 乾清门 | 后三宫之门，单檐歇山；清代「御门听政」于此 | medium | [zh.wiki/故宫](https://zh.wikipedia.org/wiki/%E6%95%85%E5%AE%AB) 分区段 + 通识 |
| 乾清宫 | **重檐庑殿**顶，单层汉白玉台基；与太和门以 raised walkway（廊）相连；屋顶走兽 9 尊（太和殿为 10 尊）；室内藻井蟠龙，宝座上悬「正大光明」匾 | high | [en.wiki/Palace_of_Heavenly_Purity](https://en.wikipedia.org/wiki/Palace_of_Heavenly_Purity) |
| 乾清宫历史 | 1420 建，明为皇帝寝宫（内分九室、27 床）；雍正后移居养心殿，此殿改为**听政/接见/宴会**之所 | high | 同上 |
| 交泰殿 | 后三宫居中，方形平面、攒尖顶（待复核具体间数） | low | zh.wiki 仅列名 + en.wiki 提及其为「Hall of Union」 |
| 坤宁宫 | 后三宫最北；明为皇后正寝，清改萨满祭祀堂子形制 | medium | [zh.wiki/故宫](https://zh.wikipedia.org/wiki/%E6%95%85%E5%AE%AB) + 通识（⚠️ 待复核） |
| 御花园 | 后三宫之北，中轴对称，含堆秀山、钦安殿 | medium | zh.wiki「其后为御花园」；钦安殿细节 ⚠️ 待复核 |
| 东 / 西六宫 | 后三宫两侧各六院，长巷街分隔 | high（布局）/ low（单体尺度） | zh.wiki |
| 神武门 | 北门；今悬「故宫博物院」匾 | medium | [zh.wiki/午門 (北京)](https://zh.wikipedia.org/wiki/%E5%8D%88%E9%96%80_(%E5%8C%97%E4%BA%AC))（"牌匾挂在北门神武门"） |
| 景山 | 城北借景，可南俯瞰故宫全景 | high | zh.wiki/故宫 条目首图说明「于景山向南俯瞰故宫」 |

---

## 5. 建筑形制术语 → 构件映射（程序化建模的对照表）

| 术语 | 建模含义 | 代码构件（`js/parts.js`） |
| --- | --- | --- |
| 间（开间） | 面阔方向两柱之间的跨；单位 `bay`，本页面 `BAY = 3.0 m` 为通用值，重要殿宇按实测反算 | `bayGrid()` |
| 台基 / 须弥座 | 石砌高台，含圭角、束腰、覆莲、栏板 | `terrace()` + `railing()` |
| 檐柱 / 金柱 / 雷公柱 | 外圈柱 / 内圈柱 / 攒尖顶中心柱 | `columnGrid()` / `leiGongZhu()` |
| 斗拱（铺作） | 柱头与檐枋间的出挑构件；外观近似用「实例化 + 烘焙彩画贴图」 | `douGong()`（`InstancedMesh`） |
| 举折 / 起翘 | 屋面的纵向凹曲 + 角部升起；用顶点位移实现 | `roofSurface(curve, eaveRise)` |
| 庑殿（四阿） | 一条正脊 + 四坡，最高等级 | `hipRoof()` |
| 歇山（九脊） | 上半悬山 + 下半四坡，共九条脊 | `gableHipRoof()` |
| 攒尖 | 多坡汇聚一点，顶置宝顶 | `pyramidRoof()` / `squareZuanjian()` |
| 正脊 / 垂脊 / 戗脊 | 屋脊线；端部吻兽，脊上走兽序列 | `ridge()` + `beastRow()` |
| 隔扇 / 槛窗 / 三交六椀菱花 | 可开启的格子门与菱花窗 | `latticeDoor()` / `latticeWindow()` |
| 和玺彩画 / 旋子彩画 | 梁枋青绿 + 金龙图案 | `caihuaTexture()`（Canvas 生成） |
| 金砖墁地 | 细料方砖地面，深灰带光泽 | `goldBrickTexture()` |
| 御路 | 中轴上的浮雕石道（云龙纹） | `yuLuTexture()` |

---

## 6. Three.js r128 生态可用性（决定要不要动 vendor）

| 事实 | confidence | 来源 / 校验方式 |
| --- | --- | --- |
| r128 npm 包**保留** `examples/js/**` 非模块 UMD 扩展，可直接 `<script>` 挂全局 | high | [data.jsdelivr.com/v1/package/npm/three@0.128.0/flat](https://data.jsdelivr.com/v1/package/npm/three@0.128.0/flat) 文件清单；已确认存在 `/examples/js/loaders/GLTFLoader.js`(96,550 B)、`/examples/js/controls/OrbitControls.js`(26,375 B)、`/examples/js/objects/Sky.js`(6,894 B)、`Water.js`(11,630 B)、`Reflector.js`(6,849 B)、`postprocessing/*`、`shaders/CopyShader.js`(606 B) 等 |
| **cdnjs 已无 r128 legacy 版本**（只有 `three.js@0.187.0`） | high | [api.cdnjs.com/libraries/three.js](https://api.cdnjs.com/libraries/three.js?fields=name,version,license) → `{"version":"0.187.0"}`；`/libraries/three.js/0.128.0` 返回 404 |
| 站内已入库 r128 UMD 本体，SHA-256 `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2` | high | [assets/vendor/README.md](../../../assets/vendor/README.md) 登记表 |
| r128 `THREE.REVISION === "128"`，UMD 全局可用 | high | vendor README 校验记录 + 站内 4 个 3D 页已在用 |

**结论**：核心 MVP **只用已入库的 three.min.js**，不新增任何扩展文件。
若后续要 `Sky` / `Water` / `OrbitControls` / `GLTFLoader`，按 vendor 流程从 jsDelivr + unpkg 双镜像下载并登记（cdnjs 不可用）。

---

## 7. 参考实现骨架（站内既有资产，优先复用手感）

| 页面 | 复用什么 |
| --- | --- |
| [examples/3d-shoot-game/index.html](../../3d-shoot-game/index.html) | `body.touch` 开关、虚拟摇杆 + 看视角的触摸绑定、`setPixelRatio(min(dpr,2))`、`screen.orientation.lock('landscape')`、射线拾取（`THREE.Raycaster`） |
| [examples/solar-system-3d/index.html](../../solar-system-3d/index.html) | canvas + 值噪声程序化贴图的做法（本页面 `textures.js` 同源思路） |
| [examples/tower-defense/](../../tower-defense/) | `tools/smoke.mjs` + 页内 `package.json {"type":"module"}` 的 Node 冒烟测试形态；纯逻辑模块顶层不碰 DOM 的边界约定 |
| [examples/mahjong-3d/](../../mahjong-3d/) · [rubik-3d/](../../rubik-3d/) | 3D 页的非 WebGL 降级视图先例（本页面降级为俯视导览图 + 讲解卡） |

---

## 8. 待复核清单（下一轮调研补）

- [ ] 午门五门洞的具体尺寸与凹字平面各段长度
- [ ] 太和门屋顶形制（重檐歇山 or 庑殿）与面阔间数
- [ ] 中和殿通高（27 vs 29 m 分歧）
- [ ] 交泰殿 / 坤宁宫的面阔进深与屋顶形制
- [ ] 御花园钦安殿、堆秀山、摛藻堂布局
- [ ] 角楼「九梁十八柱七十二条脊」的可简化建模表达
- [ ] 太庙 / 社稷坛是否作为午门广场外的借景（当前不做）
