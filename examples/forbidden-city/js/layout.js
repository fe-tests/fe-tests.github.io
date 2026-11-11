/* 3D 故宫游览 · js/layout.js —— 建筑数据表（单一数据源）
 * 所有几何、碰撞、小地图、热点都从这里推导；任何模块不得再写死建筑尺度。
 * 数值出处见 ../docs/research.md（§1 总平面 / §2 外朝序列 / §3 三大殿 / §4 内廷）。
 *   · form: '庑殿'(四阿顶) | '歇山'(九脊顶) | '攒尖' | '门' | '廊' | '亭' | '桥' | '墙' | '台'
 *   · tier: 屋顶层数（1 单檐 / 2 重檐）
 *   · bays/depthBays：面阔/进深开间数；bayW = 实测面阔 ÷ 间数（覆盖通用 BAY）
 *   · hWall 殿身墙高、hTotal 通高（含台基与屋顶），两者都在 research.md 有出处时写实测
 * 约束：顶层不碰 DOM / THREE，可在 Node import；自检见 tools/smoke.mjs。
 */
'use strict';

import { AXES, BAY, CITY } from './config.js';

/* ------------------------------ 三层台基（research.md §3）------------------------------ */
// 三重汉白玉须弥座总高 8.13 m，分三层各约 2.71 m；每层周回栏杆。
export const TERRACE = {
  totalH: 8.13,
  layers: 3,
  layerH: 2.71,
  // 自南向北的三层范围（半幅宽 / 南北向边界，单位 m）；上层内收形成「叠涩」感。
  // ⚠️ 顶层北界必须盖住保和殿北檐（cz 60 + 进深 33/2 = 76.5），否则殿身会悬出顶面外圈到中层踏步上。
  //    顶层进深 200 m ≈ 三殿总展开（太和殿前檐 −113.6 → 保和殿北檐 76.5 = 190 m）+ 周回栏板。
  tiers: [
    { halfW: 156, z0: -134, z1: 102 },   // 最下层：包整个外朝院
    { halfW: 138, z0: -126, z1: 90 },    // 中层
    { halfW: 120, z0: -118, z1: 82 },    // 最上层：三殿所在（殿身 baseY = totalH 8.13）
  ],
};

/* ------------------------------ 中轴建筑（cx 恒为 0）------------------------------ */
/** @returns {Array<Object>} 按 z 由南到北排列 */
export function buildings() {
  const list = [
    /* --- 外朝序列（research.md §2）--- */
    {
      id: 'wumen', cn: '午门', cx: 0, cz: AXES.wumen, form: '门', tier: 1,
      // 平面呈「凹」字形：正面五间 + 两侧向前伸出的阙亭（雁翅楼）与角亭。
      bays: 5, depthBays: 2, bayW: 3.4, hWall: 12, hTotal: 28,
      doors: [-12, -6, 0, 6, 12],             // 正面五券门（中三门 + 东西掖门）
      wings: { len: 76, bays: 5, sideH: 9 },   // 雁翅楼：面阔五间、单檐庑殿顶连廊
      towers: 4,                                // 阙亭四座（五凤楼）// TODO(verify) 门洞数与形制见 research.md §8
      // 五凤楼细部（凹字平面，x=0 中轴口径；凹字两翼向午门广场一侧伸出 = -Z，午门 cz=-340）。
      // 角亭在正面城台与两翼的交接处（x=±30），亭群在雁翅楼尽端（「前两后四」六亭）。
      // TODO(verify) 凹字各段长度与亭群间数见 research.md §8，取近似值（视觉比例优先）。
      wumenPlan: {
        cityL: 60, cityH: 12, cityD: 14,            // 正面城台：面阔 60、高 = hWall、进深 14（开五券门）
        wingPlatformH: 7.4,                         // 雁翅楼下的低城台高（凹字两翼，比正面城台略低）
        wingLen: 76, wingH: 9,                      // 雁翅楼长度/楼高（与 wings 同源）
        cornerZ: -10,                               // 角亭中心 z（城台南侧面外，x=±30）
        mainTower: { form: '庑殿', bays: 9, depthBays: 3, bayW: 3.4, hWall: 10, hTotal: 24, tier: 2 }, // 城台上的重檐庑殿正楼
        gablePav: { xs: [-14.5, 14.5], z: -56, w: 6.4 },   // 「前两」：两座攒尖方亭
        ruffPav:  { xs: [-30, -22, 22, 30], z: -68, w: 5 }, // 「后四」：四座盝顶亭，对称排开
      },
      doors: [0, -12, -6, 6, 12],               // 五个门洞的中线 x 位置
      hotspots: ['中轴最南的正门，皇帝下诏、献俘之处'],
    },
    {
      id: 'innerRiver', cn: '内金水河', cx: 0, cz: AXES.innerRiver, form: '河',
      width: 22, bankH: 1.6, bridges: ['fiveHole'], // 五孔桥居中，四座朝房桥对称
      // 桥的摆放（x=0 中轴口径；TODO(verify) 朝房桥位置与形制见 research.md §8）：
      // 御路桥居中五孔（面阔 48）；内侧一对单孔桥 x=±34；外侧一对单孔桥 x=±68，各带三间桥亭（G26）。
      // river.len = 河道沿 x 展开的长度（河身长，跨中轴两侧对称）。
      bridgePlan: {
        len: 460,
        main:  { x: 0, width: 48, holes: 5 },                                   // 御路桥（五孔桥，居中）
        inner: { xs: [-34, 34], width: 14, holes: 1 },                          // 东西内朝房桥（单孔）
        outer: { xs: [-68, 68], width: 12, holes: 1, pavilion: { bays: 3, depth: 8, hWall: 3.6 } }, // 外侧桥 + 三间桥亭
      },
    },
    {
      id: 'taiheGate', cn: '太和门', cx: 0, cz: AXES.taiheGate, form: '门', tier: 1,
      bays: 9, depthBays: 4, bayW: 3.2, hWall: 11, hTotal: 26, // TODO(verify) 屋顶形制（庑殿/歇山）见 research.md §8
      doors: [-7.5, -2.5, 2.5, 7.5],
      hotspots: ['外朝正门，「御门听政」于此'],
    },
    {
      id: 'tirenPavilion', cn: '体仁阁', cx: -100, cz: -168, form: '庑殿', tier: 2,
      bays: 9, depthBays: 3, bayW: 3.0, hWall: 9, hTotal: 20, storey: 2,
    },
    {
      id: 'hongyiPavilion', cn: '弘义阁', cx: 100, cz: -168, form: '庑殿', tier: 2,
      bays: 9, depthBays: 3, bayW: 3.0, hWall: 9, hTotal: 20, storey: 2,
    },

    /* --- 外朝三大殿（research.md §3）：实测尺度，不许改数 --- */
    {
      id: 'taihe', cn: '太和殿', cx: 0, cz: AXES.taihe, form: '庑殿', tier: 2,
      bays: 11, depthBays: 5, bayW: 63.96 / 11,   // 面阔 63.96 m（康熙三十四年重建后）
      depthM: 37.20,                               // 进深 37.20 m
      hWall: 14, hTotal: 35.05, onTerrace: true,   // 通高 35.05 m；坐落三层台基顶面（y = TERRACE.totalH）
      columns: { count: 72, golden: 6 },           // 金柱 6 根居中环列；72 柱布局有争议，只做外观+室内代表层
      interior: {                    // 阶段 6 落地的室内要素（此处只登记，供碰撞/热点复用）
        floorY: TERRACE.totalH, throne: 'crown', plaque: '建极绥猷', zaoJin: true, columns: 'golden',
      },
      doors: [-9, -3, 3, 9],           // 正面辟门（中三间 + 次间）
      hotspots: ['外朝正殿，皇帝大典所在', '匾额「建极绥猷」与藻井蟠龙'],
    },
    {
      id: 'zhonghe', cn: '中和殿', cx: 0, cz: AXES.zhonghe, form: '攒尖', tier: 1,
      bays: 3, depthBays: 3, bayW: 27 / 3,   // 方形面阔/进深约 27 m（取中文口径，见 research.md §3 分歧说明）
      depthM: 27,
      hWall: 9, hTotal: 27, roofTop: true, onTerrace: true,   // 单檐四角攒尖 + 鎏金宝顶；坐落在台基顶面
      doors: [-9, 0, 9],       // 三处门洞中线（27 m 方殿）；旧 {south:12} 按 12 间散布 → 门扇越出面阔 ±44 m（bug 修复）
      interior: { floorY: TERRACE.totalH, throne: 'platform', plaque: '允执厥中', zaoJin: false, columns: 'perimeter' },
      hotspots: ['大典前皇帝暂驻之处，匾额「允执厥中」'],
    },
    {
      id: 'baohe', cn: '保和殿', cx: 0, cz: AXES.baohe, form: '歇山', tier: 2,
      bays: 9, depthBays: 4, bayW: 60 / 9,    // 面阔约 60 m（九间）
      depthM: 33,                              // 进深约 33 m（中后部减柱造，殿试设案处空间更敞）
      hWall: 13, hTotal: 29, onTerrace: true,
      columns: { count: 66, reduced: 6 },     // 减柱造：后檐金柱 6 根减去，室内空间更敞
      interior: { floorY: TERRACE.totalH, throne: 'crown', plaque: '皇建有极', zaoJin: true, columns: 'reduced' },
      doors: [-9, -3, 3, 9],
      hotspots: ['殿试（乾隆五十四年后）与赐宴之处'],
    },

    /* --- 内廷（research.md §4）--- */
    {
      id: 'qianqingGate', cn: '乾清门', cx: 0, cz: AXES.qianqingGate, form: '门', tier: 1,
      bays: 5, depthBays: 3, bayW: 3.2, hWall: 9, hTotal: 16, doors: [-4, 0, 4],
      hotspots: ['内廷正门，「勤政亲贤」燕寝听政于此'],
    },
    {
      id: 'qianqing', cn: '乾清宫', cx: 0, cz: AXES.qianqing, form: '庑殿', tier: 2,
      bays: 9, depthBays: 5, bayW: 3.4, depthM: 25, hWall: 12, hTotal: 24, roofStatuettes: 9,
      interior: { floorY: 0, throne: 'crown', plaque: '正大光明', zaoJin: true, columns: 'perimeter' }, // 匾下储立储密诏
      doors: [-6, 0, 6], hotspots: ['内廷正殿，匾额「正大光明」'],
    },
    {
      id: 'jiaotai', cn: '交泰殿', cx: 0, cz: AXES.jiaotai, form: '攒尖', tier: 1,
      bays: 3, depthBays: 3, bayW: 3.2, depthM: 9.6, hWall: 8, hTotal: 16, roofTop: true,
      interior: { floorY: 0, throne: 'platform', plaque: '天地交泰', zaoJin: true, columns: 'perimeter' },
      hotspots: ['皇后受贺处，藏「二十五宝」'], // TODO(verify) 尺度与形制见 research.md §8
    },
    {
      id: 'kunning', cn: '坤宁宫', cx: 0, cz: AXES.kunning, form: '庑殿', tier: 2,
      bays: 9, depthBays: 4, bayW: 3.2, depthM: 15, hWall: 11, hTotal: 22,
      interior: { floorY: 0, throne: 'hearth', plaque: '日升月恒', zaoJin: true, columns: 'perimeter' }, // 东暖阁萨满祭祀/大婚
      hotspots: ['明代皇后正寝，清雍正后行萨满祀典'],
    },
    { id: 'yuhuayuan', cn: '御花园', cx: 0, cz: AXES.yuhuayuan, form: '园', trees: 46, hill: true, hotspots: ['堆秀山与钦安殿所在'] },
    { id: 'shenwumen', cn: '神武门', cx: 0, cz: AXES.shenwumen, form: '门', tier: 1, bays: 5, depthBays: 2, bayW: 3.2, hWall: 10, hTotal: 22, doors: [-4, 0, 4] },
  ];

  // 中轴建筑必须严格居中（唯一例外：体仁阁/弘义阁是对峙配殿）
  for (const b of list) if (!b.cx && b.cx !== 0) b.cx = 0;
  return list;
}

/* ------------------------------ 轴线上的其它线性要素 ------------------------------ */
export function linear() {
  return [
    // 东西庑房/廊：从午门广场两侧一直到保和殿，两侧对称（廊庑围合 = 凹字两翼的延长）
    { id: 'eastCorridor', cx: 128, z0: -336, z1: 60, form: '廊', hWall: 5, bayW: 3.0, bays: 116 },
    { id: 'westCorridor', cx: -128, z0: -336, z1: 60, form: '廊', hWall: 5, bayW: 3.0, bays: 116 },
    // 阙亭（午门广场内东西两侧，形制 = 盝顶）；TODO(verify) 位置见 research.md §8
    { id: 'queLeft', cx: 120, cz: -330, form: '亭', width: 6, hWall: 5.4, roofForm: '盝顶' },
    { id: 'queRight', cx: -120, cz: -330, form: '亭', width: 6, hWall: 5.4, roofForm: '盝顶' },
    // 四门（东华/西华/午门侧门等）与筒子河
    { id: 'donghuamen', cx: CITY.lenE / 2, cz: -40, form: '门', bays: 3, depthBays: 2, bayW: 3.2, hWall: 9, hTotal: 16 },
    { id: 'xihuamen', cx: -CITY.lenE / 2, cz: -40, form: '门', bays: 3, depthBays: 2, bayW: 3.2, hWall: 9, hTotal: 16 },
    { id: 'jingshan', cx: 0, cz: AXES.shenwumen + 120, form: '山', hTotal: 44, trees: 120 }, // 景山俯瞰视点（近似高度）
  ];
}

/* ------------------------------ 派生工具（碰撞/小地图/热点都复用）------------------------------ */
/** 建筑在水平面上的占位矩形：{cx,cz,halfW,halfD}。用于碰撞、可见性剔除与小地图。 */
export function footprint(b) {
  if (b.form === '园' || b.form === '山') return { cx: b.cx, cz: b.cz, halfW: 80, halfD: 42 };
  // 面阔按实测；进深优先用实测 depthM，否则由「间数 × 通间宽」推得（方形平面时与面阔相等）
  const w = (b.bays || 3) * (b.bayW || BAY);
  const d = b.depthM != null ? b.depthM : (b.depthBays || 3) * (b.bayW || BAY);
  return { cx: b.cx, cz: b.cz, halfW: w / 2 + (b.tier === 2 ? 2.4 : 1.2), halfD: d / 2 + (b.tier === 2 ? 2.4 : 1.2) };
}

/** 面阔（m）：间数 × 单间的实测宽。 */
export function faceWidth(b) { return (b.bays || 0) * (b.bayW || BAY); }

/** 三大殿 id（阶段 6「可进入内部」与成就都靠这份表）。 */
export const HALL_IDS = ['taihe', 'zhonghe', 'baohe'];

/** 按 id 取建筑记录。 */
export function byId(id) { return buildings().find((b) => b.id === id) || null; }
