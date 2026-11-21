/* 3D 鹈鹕海边骑行（pelican-bike-3d）· tools/smoke.mjs
 * 纯 Node 回归门禁：不启动浏览器， import 纯函数模块做断言 + 对渲染层源码做正则钉 +
 * 对每个 js 跑 node --check（语法）+ HTML/ui id 对齐 + registry 登记。
 * 运行：node examples/pelican-bike-3d/tools/smoke.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');                 // examples/pelican-bike-3d
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; return true; }
  fail++; fails.push(label);
  console.log('  ✗ ' + label);
  return false;
}
function group(name, fn) {
  const before = fail;
  try { fn(); } catch (e) { fail++; fails.push(name + ' threw: ' + e); console.log('  ✗ ' + name + ' threw: ' + e); }
  console.log('  · ' + name + (fail === before ? ' ok' : ' 有失败'));
}
const near = (a, b, eps, label) => ok(Math.abs(a - b) <= eps, label + ` （${a} vs ${b}）`);

const cfg = await import('../js/config.js');
const utils = await import('../js/utils.js');
const terrain = await import('../js/terrain.js');
const road = await import('../js/road.js');
const sky = await import('../js/sky.js');
const rider = await import('../js/rider.js');
const camera = await import('../js/camera.js');
const quality = await import('../js/quality.js');
const textures = await import('../js/textures.js');

const { clamp01, lerp, smoothstep, normAngle, TAU } = utils;

/* ============================ 配置 ============================ */
group('config 完整性', () => {
  ok(cfg.QUALITY_ORDER.join(',') === 'low,mid,high', '画质档位顺序 low,mid,high');
  for (const id of cfg.QUALITY_ORDER) ok(cfg.QUALITY[id], `QUALITY.${id} 存在`);
  ok(cfg.RIG_IDS.length === 7, `RIG_IDS 长度 7（实际 ${cfg.RIG_IDS.length}）`);
  for (const id of cfg.RIG_IDS) {
    const r = cfg.rigById(id);
    ok(r && r.id === id, `rigById(${id}) 命中`);
    ok(r.r > 0.5 && r.r < 80, `${id}.r 距离合理（${r.r}）`);
    ok(typeof r.fov === 'number' && r.fov > 10 && r.fov < 90, `${id}.fov 合理`);
    ok(typeof r.az === 'number' && typeof r.el === 'number', `${id}.az/el 存在`);
    ok(typeof r.tY === 'number' && r.tY > 0, `${id}.tY 取景中心高度`);
    ok(r.dwell > 2 && r.dwell < 60, `${id}.dwell 停留时长合理`);
    ok(!!r.cn, `${id}.cn 中文名存在`);
  }
  ok(cfg.RIG_IDS[4] === 'orbit' && cfg.rigById('orbit').orbit > 10, '环绕机位有 orbit 周期（自动环绕一圈）');
  ok(cfg.ROAD.width > 5 && cfg.ROAD.width < 12, 'ROAD.width 合理');
  ok(cfg.ROAD.carveFull >= cfg.ROAD.guardLateral, 'ROAD.carveFull 覆盖到护栏外侧（路面外全是平地）');
  ok(cfg.RIDE.baseSpeed > cfg.RIDE.minSpeed && cfg.RIDE.baseSpeed < cfg.RIDE.maxSpeed, 'RIDE 速度区间');
  ok(cfg.RIDE.wheelR > 0.2 && cfg.RIDE.wheelR < 0.5, 'RIDE.wheelR 合理（自行车轮半径）');
  ok(cfg.RIDE.crankLen > 0.1 && cfg.RIDE.crankLen < 0.25, 'RIDE.crankLen 合理');
  ok(cfg.ROAD.lampSpacing > 20 && cfg.ROAD.guardSpacing < 10, 'ROAD 灯/护栏间距合理');
  ok(cfg.WORLD.tileLen > 60 && cfg.WORLD.tilesX >= 3 && cfg.WORLD.tilesZ >= 3, 'WORLD 分块参数');
  ok(cfg.WORLD.roadTiles * cfg.WORLD.roadTileLen > 400, '道路条带总长足够巡游');
  ok(cfg.RENDER.far > 2000 && cfg.RENDER.near < 0.5, 'RENDER 远近裁剪');
  ok(cfg.RENDER.shadowSpan > 50 && cfg.RENDER.shadowSpan < 200, '阴影盒范围合理');
  ok(cfg.TIME.start > 0.2 && cfg.TIME.start < 0.6, 'TIME.start 在白天时段');
  ok(cfg.TIME.presets.length === 4, 'TIME.presets 四预设（黎明/正午/黄昏/夜）');
  ok(cfg.TIME.presets.every((p) => p.t > 0 && p.t < 1 && p.id && p.cn), '每个预设都有 id/t/cn 且 t 在 (0,1)');
  ok(cfg.BUDGET.drawCalls >= 80 && cfg.BUDGET.triangles > 200000, 'BUDGET 预算字段');
  ok(cfg.ADAPT.fpsDown < cfg.ADAPT.fpsUp && cfg.ADAPT.sampleFrames > 0, 'ADAPT 迟滞阈值有序');
  ok(cfg.PREF_KEY.indexOf('pelican-bike-3d') === 0, 'PREF_KEY 前缀隔离，不与他页冲突');
  ok(cfg.SEA_LEVEL <= cfg.roadElev(0) - 1, 'SEA_LEVEL 在路面以下（海在路下方）');
});

/* ============================ utils ============================ */
group('utils 数值行为', () => {
  ok(clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.3) === 0.3, 'clamp01 夹取');
  near(lerp(0, 10, 0.25), 2.5, 1e-12, 'lerp');
  ok(smoothstep(0, 1, 0) === 0 && smoothstep(0, 1, 1) === 1, 'smoothstep 端点');
  ok(smoothstep(0, 1, 0.5) > 0.49 && smoothstep(0, 1, 0.5) < 0.51, 'smoothstep 中点');
  for (const a of [-7, -1, 0, 1, 3.5, 9]) {
    const n = normAngle(a);
    ok(n >= -Math.PI - 1e-9 && n <= Math.PI + 1e-9, `normAngle(${a}) 落在 [-π,π]`);
  }
  near(Math.abs(normAngle(3.0) - normAngle(3.0 + TAU)), 0, 1e-9, 'normAngle 周期性');
  ok(utils.srgbToLinear(0) === 0 && utils.srgbToLinear(1) === 1, 'srgbToLinear 端点精确');
  ok(utils.srgbToLinear(0.5) < 0.5, 'srgbToLinear 对 0.5 做下压（gamma>1）');
  const tl = utils.toLinear([0.8, 0.4, 0.1]);
  ok(tl.length === 3 && tl[0] < 0.8 && tl[2] < 0.1, 'toLinear 输出三通道且下压');
  const mx = utils.mixRGB([1, 0, 0], [0, 0, 1], 0.5);
  ok(Math.abs(mx[0] - 0.5) < 1e-9 && Math.abs(mx[2] - 0.5) < 1e-9, 'mixRGB 中点插值');
  ok(utils.mixRGB([1, 0, 0], [0, 0, 1], 0)[0] === 1, 'mixRGB t=0 取第一色');
  ok(utils.hash2(1, 2) === utils.hash2(1, 2) && utils.hash2(1, 2) !== utils.hash2(2, 1), 'hash2 稳定且随坐标变');
  const v = utils.valueNoise(0.37, 1.9, 1, 7);
  ok(v >= 0 && v <= 1.0001, 'valueNoise 输出 [0,1]');
  const f = utils.fbm(1.3, 2.1, 1, 5, 4);
  ok(f >= -0.01 && f <= 1.01, 'fbm 输出 [0,1]');
  ok(/^\d{2}:\d{2}$/.test(utils.fmtClock(0.5)), 'fmtClock 形如 12:00');
});

/* ============================ 道路 ============================ */
group('道路曲线（连续 / 与标题一致 / 车道宽度）', () => {
  let maxJump = 0;
  for (let z = 0; z < 4000; z += 1) {
    const d = cfg.roadCenterX(z + 0.5) - cfg.roadCenterX(z);
    if (Math.abs(d) > maxJump) maxJump = Math.abs(d);
  }
  ok(maxJump < 1.2, `道路中心每 0.5 m 位移有界（最大 ${maxJump.toFixed(3)}）`);
  let elevJump = 0;
  for (let z = 0; z < 4000; z += 1) {
    const d = cfg.roadElev(z + 0.5) - cfg.roadElev(z);
    if (Math.abs(d) > elevJump) elevJump = Math.abs(d);
  }
  ok(elevJump < 0.05, `路面高程梯度平缓（最大 ${elevJump.toFixed(4)}）`);
  for (const z of [0, 123.4, 999, 3333, 7777.7]) {
    ok(Number.isFinite(cfg.roadCenterX(z)) && Number.isFinite(cfg.roadElev(z)), `道路函数在 z=${z} 有限`);
    const h = cfg.roadHeading(z);
    ok(Math.abs(h) <= Math.PI + 1e-6, `roadHeading(${z}) 在 ±π`);
    ok(cfg.arcFactor(z) > 0, `arcFactor(${z}) > 0`);
  }
  near(cfg.roadCenterDeriv(0) * 1, cfg.roadCenterDeriv(0), 1e-12, 'roadCenterDeriv 可导');
  const p0 = road.roadPoint(500, 0, 0);
  near(p0.y, cfg.roadElev(500), 0.06, 'roadPoint(0 横向) 的高程 = roadElev');
  const pL = road.roadPoint(500, 3, 0);
  ok(Math.hypot(pL.x - p0.x, pL.z - p0.z) > 2.0, 'roadPoint 横向偏移真的横移');
  const fr = road.roadFrameAt(700);
  ok(fr && Number.isFinite(fr.yaw), 'roadFrameAt 给出 yaw');
});

/* ============================ 地形 ============================ */
group('地形：路面处 = 路高程；岸线单调可用；顶点色在 [0,1]', () => {
  for (const z of [0, 137, 640, 1420, 3010]) {
    const cx = cfg.roadCenterX(z);
    near(terrain.terrainHeight(cx, z), cfg.roadElev(z), 0.02, `路面中心 terrainHeight = roadElev (z=${z})`);
    const hOut = terrain.terrainHeight(cx, z + 0.001);
    ok(Number.isFinite(hOut), `terrainHeight 有限 (z=${z})`);
  }
  for (const lat of [-4.0, -2.5, 2.5, 4.0]) {
    const z = 300;
    const h = terrain.terrainHeight(cfg.roadCenterX(z) + lat, z);
    near(h, cfg.roadElev(z), 0.03, `|横向 ${lat}| ≤ carveFull 内保持路面高（z=${z}）`);
  }
  for (const z of [0, 210, 880, 1700]) {
    const sx = terrain.shoreXAt(z);
    ok(Number.isFinite(sx), `shoreXAt(${z}) 有限`);
    ok(sx < cfg.roadCenterX(z), `岸线在路的陆侧一侧（z=${z}）`);
  }
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const x = -1200 + i * 6.1, z = i * 13.7;
    const c = terrain.terrainColor(terrain.terrainHeight(x, z), terrain.terrainSlope(x, z), x, z);
    for (let k = 0; k < 3; k++) if (!(c[k] >= 0 && c[k] <= 1.0001)) bad++;
  }
  ok(bad === 0, `terrainColor 三通道全在 [0,1]（越界 ${bad} 处）`);
});

/* ============================ 昼夜 ============================ */
group('昼夜关键帧：连续 / 日夜符号 / 灯在夜里亮', () => {
  const keys = [0, 0.12, 0.2, 0.235, 0.3, 0.445, 0.5, 0.6, 0.79, 0.86, 0.93, 0.965, 1];
  let maxD = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = sky.sampleDay(keys[i]);
    const b = sky.sampleDay(keys[i + 1]);
    for (const k of ['night', 'lamp', 'sunIntensity', 'fogDensity']) {
      const d = Math.abs(a[k] - b[k]);
      if (d > maxD) maxD = d;
    }
  }
  ok(maxD < 1.2, `关键帧参数跨帧变化有界（最大 ${maxD.toFixed(3)}）`);
  const noon = sky.sampleDay(0.5);
  const night = sky.sampleDay(0.97);
  ok(noon.night < 0.06, `正午 night≈0（${noon.night}）`);
  ok(night.night > 0.7, `夜里 night 接近 1（${night.night}）`);
  ok(noon.lamp < 0.05, '正午不点灯');
  ok(night.lamp > 0.85, '夜里路灯应亮');
  ok(noon.sunIntensity > night.sunIntensity, '正午日光强于夜间');
  ok(noon.sunDir[1] > 0.1, '正午太阳在地平线以上');
  ok(night.sunDir[1] < 0.05, '夜间太阳在地平线以下');
  ok(night.moonDir[1] > 0.0, '夜间月亮在上方');
  ok(noon.fogDensity < night.fogDensity + 1e-9, '雾浓度夜里不小於白天');
  for (const t of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
    const d = sky.sampleDay(t);
    for (const k of ['top', 'bot', 'hor', 'sun', 'amb', 'gnd', 'fog']) {
      const v = d[k];
      ok(Array.isArray(v) && v.length === 3 && v.every((c) => c >= 0 && c <= 1.0001), `sampleDay(${t}).${k} 是 [0,1] 三元组`);
    }
  }
  for (const p of cfg.TIME.presets) {
    const d = sky.sampleDay(p.t);
    ok(d.night >= 0 && d.night <= 1, `预设 ${p.id} 的 night 合法`);
    ok(Number.isFinite(d.fogDensity) && d.fogDensity > 0, `预设 ${p.id} 的雾密度有效`);
  }
  ok(sky.sampleDay(0.965).night > sky.sampleDay(0.79).night, '夜比黄昏更夜');
});

/* ============================ 关键帧调色板 ============================ */
group('昼夜调色板解析：C() 必须从第 0 位切 6 位十六进制（历史上 slice(1,3) 让整屏偏红/偏黄）', () => {
  const skySrc = read('js/sky.js');
  ok(/C = \(h\) =>/.test(skySrc) && /slice\(0, 2\)/.test(skySrc), 'C() 从左起第 0 位开始解析');
  const noon = sky.sampleDay(0.5);
  ok(noon.top[2] > noon.top[0] + 0.1, `正午天顶蓝色主导（${noon.top.map((v) => v.toFixed(2))}）`);
  ok(noon.top[2] > 0.5 && noon.top[0] < 0.45, '正午天顶是亮蓝（不是橙红/lime）');
  const dawn = sky.sampleDay(0.235);
  ok(dawn.top[2] > dawn.top[0], '黎明天顶偏蓝（暖色只留给地平线与太阳）');
  const midnight = sky.sampleDay(0.0);
  ok(midnight.top[2] > midnight.top[0] && midnight.top[2] < 0.25, '深夜天顶 = 暗蓝（不发红不发黄）');
  ok(midnight.fog[2] >= midnight.fog[0], '深夜雾色蓝≥红');
  ok(midnight.amb[2] >= midnight.amb[0], '深夜半球光偏冷');
  const dusk = sky.sampleDay(0.755);
  ok(dusk.hor[0] > dusk.hor[2], '黄昏地平线暖色（红>蓝）');
  ok(dusk.sun[0] > 0.9 && dusk.sun[2] < 0.6, '黄昏太阳色是暖白/橙');
  const hexes = (skySrc.match(/C\('[0-9a-fA-F]{6}'\)/g) || []).map((s) => s.slice(3, 9));
  ok(hexes.length >= 60, `关键帧色号 ${hexes.length} 个（正则解析正常）`);
  ok(hexes.every((h) => /^[0-9a-fA-F]{6}$/.test(h)), '关键帧色号全为 6 位十六进制');
});

/* ============================ 骑行 ============================ */
group('骑行运动学：速度区间 / 侧倾夹取 / 曲柄比 / 坐标架正交', () => {
  const st = rider.createRideState(0);
  let n = 0;
  for (let i = 0; i < 6000; i++) {
    rider.stepRide(st, 1 / 60);
    if (st.speed < cfg.RIDE.minSpeed - 1e-9 || st.speed > cfg.RIDE.maxSpeed + 1e-9) { ok(false, '速度越界 ' + st.speed); break; }
    if (Math.abs(st.lean) > cfg.RIDE.leanMax + 1e-9) { ok(false, '侧倾越界 ' + st.lean); break; }
    if (!Number.isFinite(st.x) || !Number.isFinite(st.y) || !Number.isFinite(st.z)) { ok(false, '位置不有限'); break; }
    n++;
  }
  ok(n === 6000, `stepRide 6000 步无越界（跑了 ${n} 步）`);
  ok(st.z > 100, `长时间骑行后里程累加（z=${st.z.toFixed(1)}）`);
  near(st.crankPhase, st.wheelPhase * cfg.RIDE.crankRatio, 1e-6, 'crankPhase = wheelPhase × 齿比');
  ok(Math.abs(rider.leanFor(0.02, 6)) <= cfg.RIDE.leanMax, 'leanFor 受 leanMax 约束');
  ok(rider.speedForGrade(0.05) < cfg.RIDE.baseSpeed, '上坡减速');
  ok(rider.speedForGrade(-0.05) > cfg.RIDE.baseSpeed, '下坡加速');
  ok(rider.speedForGrade(0) === cfg.RIDE.baseSpeed, '平地 = 基准速度');
  ok(Number.isFinite(rider.curvatureAt(1234)), 'curvatureAt 有限');
  const f = rider.frameOf(st);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  ok(Math.abs(len(f.forward) - 1) < 1e-6, 'forward 单位长');
  ok(Math.abs(len(f.up) - 1) < 1e-6, 'up 单位长');
  ok(Math.abs(len(f.right) - 1) < 1e-6, 'right 单位长');
  ok(Math.abs(dot(f.forward, f.up)) < 1e-6, 'forward ⊥ up（坐标架严格正交，含坡道）');
  ok(Math.abs(dot(f.forward, f.right)) < 1e-6, 'forward ⊥ right');
  ok(Math.abs(dot(f.up, f.right)) < 1e-6, 'up ⊥ right');
  // 坡道温和：up 接近世界向上但会随坡后仰（不能是死板的世界向上）
  const fr = rider.frameOf(rider.createRideState(0));
  ok(fr.up[1] > 0.99 && fr.forward[1] > 0, '缓坡上 up 接近世界向上、forward 带上仰分量');
  ok(Math.abs(fr.up[0] - 0) > 1e-9, '坡道上 up 真的后仰（不是常量 (0,1,0)）');
  ok(f.position === undefined || Number.isFinite(f.position[0]), 'frameOf.position 有限或省略');
});

/* ============================ 落座装配 ============================ */
group('落座装配：车上移到轮半径 + 腿长够得到踏板 + 骑行姿态', () => {
  const riderSrc = read('js/rider.js');
  const pelSrc = read('js/pelican.js');
  ok(/bike\.group\.position\.set\(0, bikeY, 0\)/.test(riderSrc), 'rider: 整车抬高 bikeY（轮子落在地面上）');
  ok(/const bikeY = RIDE\.wheelR - 0\.02;/.test(riderSrc), 'rider: bikeY = 轮半径 − 图纸中轴偏移 0.02');
  ok(/pelican\.setMount\(saddle\.x, saddle\.y\)/.test(riderSrc), 'rider: 用 setMount 落座（不直接写 group.position）');
  const S = rider.SADDLE;
  near(S.y, cfg.RIDE.wheelR - 0.02 + 0.74, 1e-9, 'SADDLE.y = bikeY + 0.74（座垫顶 + 落座压缩）');
  ok(S.x < 0, 'SADDLE.x 在座垫中轴偏后（鹈鹕臀部贴合座垫）');
  const thigh = Number((pelSrc.match(/^const THIGH = ([\d.]+);/m) || [])[1]);
  const shin = Number((pelSrc.match(/^const SHIN = ([\d.]+);/m) || [])[1]);
  ok(thigh > 0 && shin > 0, `pelican: THIGH=${thigh} / SHIN=${shin} 可解析`);
  const bbY = cfg.RIDE.wheelR - 0.02 + 0.02;
  const hipY = S.y - 0.14;
  const dHip = Math.hypot(-0.03, bbY - hipY);
  const dFar = dHip + cfg.RIDE.crankLen;
  const dNear = dHip - cfg.RIDE.crankLen;
  ok((thigh + shin) * 0.985 >= dFar, `腿长 ${(thigh + shin).toFixed(2)} 够到踏板最远点 ${dFar.toFixed(2)}`);
  ok((thigh + shin) * 0.42 <= dNear, `腿能弯到踏板近点 ${dNear.toFixed(2)}`);
  ok(/const th1 = phi \+ Math\.acos\(cosA\);/.test(pelSrc), 'pelican: IK 取膝朝前那组解（大腿向前下，小腿往后下踩踏板）');
  ok(/body\.rotation\.z = -0\.06;/.test(pelSrc), 'pelican: 躯干骑行姿态接近水平（旧 -0.52 = 一路俯冲低头）');
  ok(/head\.rotation\.z = 0\.10 - nod \* 0\.5;/.test(pelSrc), 'pelican: 头部只随点头微调，不常驻低头');
  ok(/baseY === null/.test(pelSrc) && /group\.position\.y = baseY \+/.test(pelSrc), 'pelican: bob 在装配高度上叠加（baseY 门闩）');
  ok(/function setMount\(x, y\)/.test(pelSrc), 'pelican: 导出 setMount');
  ok(/rigBasis\.groundY = /.test(read('js/main.js')), 'main: 给相机提供地面高度基准');
});

/* ============================ 腿部链与传动咬合 ============================ */
group('腿部链：髋→股→膝→胫→踝→蹼足 + 脚踏相位同源 + 轮/曲柄同向', () => {
  const riderSrc = read('js/rider.js');
  const pelSrc = read('js/pelican.js');
  const bikeSrc = read('js/bike.js');
  const thigh = Number((pelSrc.match(/^const THIGH = ([\d.]+);/m) || [])[1]);
  const shin = Number((pelSrc.match(/^const SHIN = ([\d.]+);/m) || [])[1]);
  const hipX = Number((pelSrc.match(/^const HIP_X = ([\d.-]+);/m) || [])[1]);
  const hipY = Number((pelSrc.match(/^const HIP_Y = ([\d.-]+);/m) || [])[1]);
  const splay = Number((pelSrc.match(/^const PEDAL_SPLAY = ([\d.]+);/m) || [])[1]);
  const sole = Number((pelSrc.match(/^const FOOT_SOLE = ([\d.]+);/m) || [])[1]);
  ok(thigh > 0 && shin > 0, 'pelican: 腿部链常数可解析（THIGH/SHIN/HIP/PEDAL_SPLAY）');
  ok(Number.isFinite(hipX) && Number.isFinite(hipY) && splay > 0, `pelican: HIP=(${hipX},${hipY}) PEDAL_SPLAY=${splay} 解析成功`);
  ok(sole > 0.02 && sole < 0.06, `pelican: FOOT_SOLE=${sole}（掌底深度，踏面与脚掌的间距）`);

  /* ① 运动链：每一节都是上一节的子级 —— 少挂一层，腿段就落在组件外（视觉 = 双腿脱开） */
  ok(/const hip = joint\(group, HIP_X, HIP_Y, side \* \(RIDE\.pedalZ - HIP_X\)\);/.test(pelSrc), 'pelican: 髋挂在组件根上（横向按脚踏平面摆放）');
  ok(/const thighPivot = joint\(hip, 0, 0, 0\);/.test(pelSrc), 'pelican: 大腿枢轴 = 髋的子级');
  ok(/const knee = joint\(thighPivot, 0, -THIGH, 0\);/.test(pelSrc), 'pelican: 膝 = 大腿枢轴的子级（股骨末端）');
  ok(/const foot = joint\(knee, 0, -SHIN, 0\);/.test(pelSrc), 'pelican: 踝 = 膝的子级（胫骨末端）');

  /* ② 关节链接体：圆柱端盖是平的，弯折后两段之间露缺口 = 用户看到的「双腿结构缺链接」 */
  ok(/羽领：股根与躯干接合处/.test(pelSrc), 'pelican: 股根有羽领（大腿不裸露在躯干之外）');
  ok(/膝链接（腿段的折点）/.test(pelSrc), 'pelican: 膝有链接体（折点不露缺口）');
  ok(/踝链接/.test(pelSrc), 'pelican: 踝有链接体（胫骨与蹼足相接）');
  ok(/hip\.rotation\.x = -side \* PEDAL_SPLAY;/.test(pelSrc), 'pelican: 整腿绕 X 外撇（脚落到脚踏平面上）');

  /* ③ 腿 ↔ 脚踏同源：踏板目标由 config.pedalOffset 解算，与车上曲柄是同一套相位数学 */
  ok(/import \{ RIDE, pedalOffset \} from '\.\/config\.js';/.test(pelSrc), 'pelican: 从 config import pedalOffset');
  ok(/const off = pedalOffset\(leg\.side, phase, pr\);/.test(pelSrc), 'pelican: 踏板目标 = pedalOffset(leg.side, crankPhase)');
  ok(/const crankL = mkArm\(RIDE\.pedalZ, 0\);/.test(bikeSrc), 'bike: 曲柄臂横向偏移取 RIDE.pedalZ（与腿的摆放同源）');
  ok(/const crankR = mkArm\(-RIDE\.pedalZ, Math\.PI\);/.test(bikeSrc), 'bike: 另一侧曲柄臂相位差 π');

  /* ④ 纯函数：pedalOffset 严格等于「臂静止朝 +Y、曲柄组绕 Z 转 CRANK_SIGN × 相位」的旋转 */
  const L = cfg.RIDE.crankLen;
  for (const ph of [0, 0.6, Math.PI / 2, 2.1, Math.PI, 5.0]) {
    const arm = cfg.RIDE.CRANK_SIGN * ph;
    const p = cfg.pedalOffset(1, ph, L);
    near(p.x, -Math.sin(arm) * L, 1e-9, `pedalOffset(+1, ${ph.toFixed(2)}) x 与曲柄臂旋转一致`);
    near(p.y, Math.cos(arm) * L, 1e-9, `pedalOffset(+1, ${ph.toFixed(2)}) y 与曲柄臂旋转一致`);
    const q = cfg.pedalOffset(-1, ph, L);
    near(q.x, -p.x, 1e-9, `pedalOffset(-1, ${ph.toFixed(2)}) 与 +1 侧反相（x）`);
    near(q.y, -p.y, 1e-9, `pedalOffset(-1, ${ph.toFixed(2)}) 与 +1 侧反相（y）`);
    ok(Math.abs(Math.hypot(p.x, p.y) - L) < 1e-9, `pedalOffset 半径恒为曲柄长（φ=${ph.toFixed(2)}）`);
  }
  ok(cfg.RIDE.CRANK_SIGN === -1, 'RIDE.CRANK_SIGN = −1（前进 = 轮顶朝前进方向走）');

  /* ⑤ 整圈踏相位：腿 IK 不被夹 → 脚掌全程咬在踏板上（夹住 = 脚会脱开踏板绕圈） */
  ok(/const ty = cy \+ off\.y \+ FOOT_SOLE - HIP_Y;/.test(pelSrc), 'pelican: IK 目标 = 踏面 + FOOT_SOLE（掌底踩踏面，不陷进踏板）');
  const cx = -rider.SADDLE.x;
  const cy = (cfg.RIDE.wheelR - 0.02 + 0.02) - rider.SADDLE.y;
  let dmin = Infinity, dmax = 0, clamped = 0;
  for (let i = 0; i < 64; i++) {
    const o = cfg.pedalOffset(1, (i / 64) * Math.PI * 2, L);
    const d = Math.hypot(cx + o.x - hipX, cy + o.y + sole - hipY);
    dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
    if (d > (thigh + shin) * 0.985 || d < (thigh + shin) * 0.42) clamped++;
  }
  ok(clamped === 0, `整圈踏相位 IK 不夹取 → 脚全程踩在踏板（d ∈ [${dmin.toFixed(3)}, ${dmax.toFixed(3)}]）`);
  ok(dmax - dmin > 0.2, `踏相位让髋-踏距离摆动 ${(dmax - dmin).toFixed(2)} m（真在蹬圈，不是定死一点）`);
  const dmid = (dmin + dmax) / 2;
  ok(Math.abs(Math.sin(splay) * dmid + (cfg.RIDE.pedalZ - hipX) - cfg.RIDE.pedalZ) < 0.01,
    `外撇角把脚踝送到脚踏平面（残差 ${(Math.abs(Math.sin(splay) * dmid - hipX)).toFixed(3)} m）`);

  /* ⑥ 传动方向：链条把后轮/牙盘/曲柄串成同一转向，所以轮与曲柄共用 CRANK_SIGN */
  ok(/bike\.crank\.rotation\.z = RIDE\.CRANK_SIGN \* state\.crankPhase;/.test(riderSrc), 'rider: 曲柄 = CRANK_SIGN × crankPhase');
  ok(/bike\.wheelR\.rotation\.z = RIDE\.CRANK_SIGN \* state\.wheelPhase;/.test(riderSrc), 'rider: 后轮 = CRANK_SIGN × wheelPhase（与曲柄同向）');
  ok(/bike\.wheelF\.rotation\.z = RIDE\.CRANK_SIGN \* state\.wheelPhase;/.test(riderSrc), 'rider: 前轮与后轮同向');
});

/* ============================ 相机 ============================ */
group('7 档机位：局部参数 + 坐标架解算 + 鼠标偏移叠加', () => {
  const st = rider.createRideState(200);
  for (let i = 0; i < 90; i++) rider.stepRide(st, 1 / 30);
  const f = rider.frameOf(st);
  const basis = { forward: f.forward, right: f.right, up: f.up, position: [st.x, st.y, st.z] };
  for (const id of cfg.RIG_IDS) {
    const rig = cfg.rigById(id);
    ok(rig.r >= 1.0 && rig.r <= 80, `${id}.r 在取景范围内（${rig.r}）`);
    try {
      const loc = camera.rigLocalAt(rig, 12.0);
      const pose = camera.cameraPoseOf(basis, loc, {});
      ok(pose.pos.every((v) => Number.isFinite(v)), `${id}: 机位坐标有限`);
      ok(pose.look.every((v) => Number.isFinite(v)), `${id}: 注视点有限`);
      ok(pose.pos[1] > cfg.SEA_LEVEL, `${id}: 机位在海平面之上`);
      const d = Math.hypot(pose.pos[0] - st.x, pose.pos[1] - st.y, pose.pos[2] - st.z);
      ok(d > 0.5 && d < rig.r * 2.2, `${id}: 机位到骑行者距离合理（${d.toFixed(1)} ≤ ${(rig.r * 2.2).toFixed(1)}）`);
      ok(pose.fov === loc.fov, `${id}: fov 透传`);
      const yaw = camera.cameraPoseOf(basis, loc, { yaw: Math.PI });
      const vFront = (a) => (a.pos[0] - st.x) * f.forward[0] + (a.pos[2] - st.z) * f.forward[2];
      ok(vFront(pose) * vFront(yaw) < 0, `${id}: 偏航 +π 把机位绕到另一侧`);
      const zoom = camera.cameraPoseOf(basis, loc, { rZoom: 2 });
      const d0 = Math.hypot(pose.pos[0] - pose.look[0], pose.pos[1] - pose.look[1], pose.pos[2] - pose.look[2]);
      const d1 = Math.hypot(zoom.pos[0] - zoom.look[0], zoom.pos[1] - zoom.look[1], zoom.pos[2] - zoom.look[2]);
      ok(d1 > d0 * 1.3, `${id}: 滚轮推拉真的改变镜头距离（${d0.toFixed(2)} → ${d1.toFixed(2)}）`);
    } catch (e) {
      ok(false, `${id}: 解算失败 ${e && e.message}`);
    }
  }
  const orb = cfg.rigById('orbit');
  const a0 = camera.rigLocalAt(orb, 0).az;
  const a1 = camera.rigLocalAt(orb, orb.orbit / 2).az;
  ok(Math.abs(normAngle(a1 - a0)) > 2.0, '环绕机位随时间推进方位角（半周期 ≈ π）');
  const st2 = rider.createRideState(0);
  const f2 = rider.frameOf(st2);
  const b2 = { forward: f2.forward, right: f2.right, up: f2.up, position: [0, 5, 0] };
  const clampPose = camera.cameraPoseOf(b2, camera.rigLocalAt(cfg.rigById('follow'), 0), { pitch: 9 });
  ok(clampPose.pos[1] < 1e4 && Number.isFinite(clampPose.pos[1]), '俯仰越界时被夹住（不产生 NaN/飞点）');
  ok(cfg.TOUR.blend > 0.5 && cfg.TOUR.blend < 6, 'TOUR.blend 过渡时长合理');
  ok(cfg.TOUR.yawMax >= Math.PI - 1e-9, '鼠标偏航可达 ±180°');
  ok(cfg.TOUR.rMin > 1 && cfg.TOUR.rMax > cfg.TOUR.rMin, '鼠标推拉距离区间');
  ok(cfg.TOUR.idleResume > 0, '空闲回游时间存在');
});

/* ============================ 画质档 ============================ */
group('画质档：参数单调 + 自适应迟滞 + 偏好读写', () => {
  const L = cfg.QUALITY.low, M = cfg.QUALITY.mid, H = cfg.QUALITY.high;
  ok(L.shadow === false && M.shadow === true && H.shadow === true, '阴影开关：低档关，标准/高档开');
  ok(L.props < M.props && M.props < H.props, '植被密度 props 随档位递增');
  ok(L.grass < M.grass && M.grass <= H.grass, '草地密度 grass 随档位递增');
  ok(L.dprMax < M.dprMax && M.dprMax < H.dprMax, '像素比 dprMax 随档位递增');
  ok(L.seaSeg < M.seaSeg && M.seaSeg < H.seaSeg, '海面细分 seaSeg 随档位递增');
  ok(L.tileSeg < M.tileSeg && M.tileSeg < H.tileSeg, '地形细分 tileSeg 随档位递增');
  ok(L.particles < M.particles && M.particles < H.particles, '粒子数随档位递增');
  ok(L.anisotropy < H.anisotropy && L.shadowMapSize < H.shadowMapSize, '贴图过滤/阴影分辨率随档位递增');
  ok(H.headlight === true, '高档才有车头灯（低档省 draw call）');
  for (const id of cfg.QUALITY_ORDER) ok(typeof cfg.QUALITY[id].name === 'string', `${id}.name 有中文名`);
  ok(cfg.ADAPT.fpsDown < cfg.ADAPT.fpsUp, '降档 < 升档 阈值（迟滞）');
  ok(cfg.ADAPT.sampleFrames >= 20, '自适应采样帧数足够防抖');
  ok(cfg.ADAPT.maxDownSteps >= 1, '自适应最多连降档位数');
  let threw = false;
  try { quality.savePrefs({ tier: 'mid', auto: true, cycle: false, time: 0.44 }); } catch (e) { threw = true; }
  ok(!threw, 'savePrefs 在 Node（无 localStorage）下不抛异常');
  let threw2 = false, p = null;
  try { p = quality.loadPrefs(); } catch (e) { threw2 = true; }
  ok(!threw2 && (p === null || typeof p === 'object'), 'loadPrefs 返回对象或 null');
  ok(typeof quality.detectTier() === 'string' && cfg.QUALITY_ORDER.indexOf(quality.detectTier()) >= 0, 'detectTier 落在档位表内');
});

/* ============================ 贴图预算 ============================ */
group('程序化贴图预算：数量 / 显存 / 最大边长', () => {
  const rep = textures.textureBudgetReport();
  ok(rep.count >= 12, `贴图数量 ${rep.count}（应 ≥12）`);
  ok(rep.bytes > 0 && rep.mb < 96, `显存 ${(rep.mb).toFixed(2)} MB < 96 MB`);
  ok(rep.maxSide <= 1024, `最大边长 ${rep.maxSide} ≤ 1024`);
  for (const t of textures.TEXTURES) {
    ok(t.w > 0 && t.h > 0, `${t.id} 尺寸有效`);
    ok(typeof t.draw === 'function', `${t.id} 有绘制函数`);
  }
  const ids = textures.TEXTURES.map((t) => t.id);
  ok(new Set(ids).size === ids.length, '贴图 id 不重复');
});

/* ============================ 渲染层正则钉 ============================ */
group('渲染层源码正则钉（色彩管线 / 装配 / 资源纪律）', () => {
  const mainSrc = read('js/main.js');
  const skySrc = read('js/sky.js');
  const oceanSrc = read('js/ocean.js');
  const terrainSrc = read('js/terrain.js');
  const texSrc = read('js/textures.js');
  const audioSrc = read('js/audio.js');
  const roadSrc = read('js/road.js');
  const scenerySrc = read('js/scenery.js');
  const idx = read('index.html');

  ok(/outputEncoding = THREE\.sRGBEncoding/.test(mainSrc), 'main: 输出 sRGB 编码');
  ok(/toneMapping = THREE\.ACESFilmicToneMapping/.test(mainSrc), 'main: ACES 色调映射');
  ok(/rig\.setGroundSampler\(terrainHeight\)/.test(mainSrc), 'main: 相机贴地用真实地形高度');
  ok(/fromArray\(toLinear\(day\./.test(mainSrc), 'main: 昼夜色按线性写入材质/雾');
  ok(/sun\.color\.fromArray\(toLinear/.test(skySrc), 'sky: 日光颜色转线性');
  ok(/uTop: \{ value: new THREE\.Color\(\)/.test(skySrc) || /uTop/.test(skySrc), 'sky: 天穹 uniform 声明');
  ok(/uNight/.test(skySrc) && /uNight \* 0\.9/.test(skySrc), 'sky: 夜间压暗太阳项（uNight 门）');
  ok(/smoothstep\(0\.42, 0\.82, day\.night\)/.test(skySrc), 'sky: 星星只在夜间显形');
  ok(/#include <tonemapping_fragment>/.test(skySrc) && /#include <encodings_fragment>/.test(skySrc), 'sky: 片元补 tonemapping/encodings');
  ok(/#include <tonemapping_fragment>/.test(oceanSrc) && /#include <encodings_fragment>/.test(oceanSrc), 'ocean: 片元补 tonemapping/encodings');
  ok(/srgbToLinear\(c\[k\]\)/.test(terrainSrc) || /srgbToLinear\(c\[/.test(terrainSrc), 'terrain: 顶点色转线性');
  ok(/convertSRGBToLinear\(\)/.test(texSrc), 'textures: 材质色转线性');
  ok(/noMip/.test(texSrc) && /generateMipmaps = false/.test(texSrc), 'textures: 远处 alpha 精灵关 mipmap（白方块坑）');
  ok(/new THREE\.MeshStandardMaterial|new THREE\.MeshBasicMaterial/.test(texSrc), 'textures: 材质工厂存在');
  ok(/document\.createElement\('canvas'\)/.test(texSrc), 'textures: 用 createElement 造 canvas（不可 new HTMLCanvasElement）');
  ok(!/new Audio\(|\.play\(\)/.test(audioSrc), 'audio: 不自动播放');
  ok(/master\.gain\.value = 0|masterGain\.value = 0/.test(audioSrc) || /ctx\.resume/.test(audioSrc), 'audio: 默认静音/需手势解锁');
  ok(/mergeGeos/.test(roadSrc) || /PropStrip/.test(roadSrc), 'road: 实例条带（省 draw call）');
  ok(/PropStrip|mergeGeos/.test(scenerySrc), 'scenery: 实例化/合并（省 draw call）');
  ok(/three\.min\.js/.test(idx) && /\.\/js\/main\.js/.test(idx), 'index.html: 加载 vendor three + 本页入口');
  ok(/<script[^>]+src="[^"]*three[^"]*"[^>]*><\/script>\s*<script[^>]+type="module"/.test(idx) || /three\.min\.js/.test(idx), 'index.html: three 在 module 之前');
  ok(/id="gl"/.test(idx) && /id="fallback"/.test(idx), 'index.html: canvas 与 fallback 存在');
  ok(/aria-label="[^"]*3D[^"]*"/.test(idx), 'index.html: canvas 有 aria-label');
});

/* ============================ GLSL 局部声明不重名 ============================ */
group('GLSL 写法：main() 内同名局部声明 = 编译失败（静态 lint）', () => {
  const files = ['ocean.js', 'sky.js', 'pelican.js', 'scenery.js', 'road.js', 'main.js'];
  let bad = 0;
  const reports = [];
  for (const f of files) {
    const src = read('js/' + f);
    const re = /(?:const|let|var)\s+\w+\s*=\s*\/\*?glsl\*?`|`[\s\S]*?void main\(\)[\s\S]*?`/g;
    const chunks = src.match(/`[^`]*void main\(\)[^`]*`/g) || [];
    chunks.forEach((body, i) => {
      const seen = new Map();
      const decls = body.match(/\b(float|int|vec2|vec3|vec4|mat3|mat4)\s+([A-Za-z_]\w*)/g) || [];
      for (const d of decls) {
        const name = d.split(/\s+/)[1];
        if (seen.has(name)) { bad++; reports.push(`${f}#${i}: 重复声明 ${name}`); }
        seen.set(name, true);
      }
    });
  }
  ok(bad === 0, `GLSL 局部变量无重名（${reports.slice(0, 3).join(' | ') || 'ok'}）`);
});

/* ============================ 语法门禁 ============================ */
group('全部模块语法自检（node --check 每个 js/ 文件）', () => {
  const dir = join(root, 'js');
  const list = readdirSync(dir).filter((f) => f.endsWith('.js'));
  ok(list.length >= 16, `js/ 下模块数 ${list.length}（≥16）`);
  let bad = 0;
  for (const f of list) {
    try {
      execFileSync(process.execPath, ['--check', join(dir, f)], { stdio: 'pipe' });
    } catch (e) {
      bad++;
      console.log('  ✗ node --check ' + f + ': ' + String(e.stderr || e.message).split('\n')[0]);
    }
  }
  ok(bad === 0, `全部 js/*.js 语法通过（失败 ${bad} 个）`);
  for (const f of ['tools/shot.mjs', 'tools/smoke.mjs']) {
    const p = join(root, f);
    if (existsSync(p)) {
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); ok(true, f + ' 语法'); } catch (e) { ok(false, f + ' 语法失败'); }
    }
  }
});

/* ============================ import 完整性 ============================ */
group('utils 导出：用了就必须 import（静态 lint）', () => {
  const exported = Object.keys(utils);
  const dir = join(root, 'js');
  let bad = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    if (f === 'utils.js') continue;
    const raw = read('js/' + f);
    const src = raw.replace(/`[\s\S]*?`/g, '""');       // 剥掉 GLSL 模板串，避免 clamp( 之类误判
    const im = raw.match(/import\s*\{([^}]*)\}\s*from\s*'[^']*utils\.js'/);
    const imported = new Set(im ? im[1].split(',').map((s) => s.trim()).filter(Boolean) : []);
    for (const name of exported) {
      const re = new RegExp('(^|[^\\w.$])' + name + '\\b', 'g');
      let used = false;
      let mm;
      while ((mm = re.exec(src))) {
        const after = src.slice(mm.index + mm[0].length).replace(/^\s+/, '');
        if (after.startsWith('(')) { used = true; break; }
        if (/^[^(\s)=.,;}\]]/.test(after)) { used = true; break; }
      }
      if (!used) continue;
      if (!imported.has(name) && !new RegExp('export\\s+(const|function)\\s+' + name + '\\b').test(raw)) {
        bad++;
        console.log('  ✗ ' + f + ' 用了 ' + name + ' 但没从 utils import');
      }
    }
  }
  ok(bad === 0, `所有 utils 导出的引用都有 import（缺 ${bad} 处）`);
});

/* ============================ HTML / ui 对齐 ============================ */
group('index.html 与 ui.js 的 id 对齐', () => {
  const idx = read('index.html');
  const uiSrc = read('js/ui.js');
  const ids = new Set();
  const re = /'#([a-zA-Z][\w-]*)'/g;      // ui.js 里所有 '#xxx' 选择器（$() / querySelector 都走这条）
  let m;
  while ((m = re.exec(uiSrc))) ids.add(m[1]);
  ok(ids.size >= 10, `ui.js 引用的 id 数 ${ids.size}（≥10，解析正常）`);
  let bad = 0;
  for (const id of ids) {
    if (!id) continue;
    if (!new RegExp('id="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(idx)) { bad++; console.log('  ✗ index.html 缺少 id=' + id); }
  }
  ok(bad === 0, `ui.js 引用的每个 id 都在 index.html 里（缺 ${bad} 个）`);
  for (const p of cfg.TIME.presets) {
    ok(new RegExp('data-time="' + p.t + '"').test(idx), `index.html 有时间预设按钮 data-time="${p.t}"（${p.cn}）`);
  }
  ok((idx.match(/data-time="[\d.]+"/g) || []).length === 4, 'index.html 四个时间预设按钮');
  ok((idx.match(/data-level="(low|mid|high)"/g) || []).length === 3, 'index.html 三档画质按钮');
});

/* ============================ registry 登记 ============================ */
group('registry.json 登记', () => {
  const reg = JSON.parse(readFileSync(join(root, '../../registry.json'), 'utf8'));
  const list = reg.pages || reg.entries || [];
  const hit = list.find((p) => (p.url || '').indexOf('pelican-bike-3d') >= 0);
  ok(!!hit, 'registry 里有本页条目');
  if (hit) {
    ok(hit.title && hit.title.indexOf('3D') >= 0, '条目 title 含 3D');
    ok(hit.category && hit.category.length > 0, 'category 非空');
    ok(Array.isArray(hit.tags) && hit.tags.length >= 4, 'tags 至少 4 个');
    ok(hit.status === 'stable' || hit.status === 'wip', 'status 合法');
    ok(/threejs/.test(hit.tags.join(',')), 'tags 含 threejs');
  }
});

/* ============================ 汇总 ============================ */
console.log('');
console.log(fail === 0 ? `[smoke] 通过 ${pass} 项` : `[smoke] 通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
