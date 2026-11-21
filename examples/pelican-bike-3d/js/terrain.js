/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/terrain.js —— 地形高度函数、道路雕刻、分块回收、沙滩条带
 * 纯函数部分（terrainHeight / shoreXAt / terrainColor）不依赖 three，Node 里可 import 断言。
 * 地形 = 自然 fbm + 道路走廊雕刻（|d| ≤ carveFull 压平到 roadElev，26 m 内平滑过渡）+ 海侧缓坡入水 + 内侧悬崖。
 */
'use strict';

import { ROAD, WORLD, SEA_LEVEL, roadCenterX, roadElev, shoreWiggle } from './config.js';
import { fbm, smoothstep, clamp, lerp, hash2, srgbToLinear } from './utils.js';

/** 海侧剖面（d ≤ 0，返回高程 m）。 */
function seawardProfile(d, e, z, x) {
  let h = e + (d + ROAD.carveFull) * ROAD.seaSlope;
  h += ROAD.seaSlope * shoreWiggle(z) * smoothstep(ROAD.carveFull + 2, 16, -d);
  h += (fbm(x * 0.030, z * 0.030, 5, 3) - 0.5) * 0.9 * smoothstep(ROAD.carveFull, 20, -d);
  const off = Math.max(0, -d - (ROAD.shoreOffset + 4));
  h -= off * 0.055;                       // 远海沙床继续下沉
  return h;
}

/** 内侧剖面（d ≥ 0，返回高程 m）。 */
function inlandProfile(d, e, z, x) {
  let h = e + (d - ROAD.carveFull) * 0.055;
  const ramp = smoothstep(ROAD.carveFull + 2, 46, d);
  h += (fbm(x * 0.012, z * 0.012, 7, 4) - 0.5) * 11 * ramp;
  h += fbm(x * 0.05, z * 0.05, 11, 3) * 2.6 * ramp;
  const cliffT = smoothstep(ROAD.cliffStart, ROAD.cliffStart + 30, d);
  h += cliffT * Math.min(ROAD.cliffRise * (d - ROAD.cliffStart), ROAD.cliffMax);
  h += cliffT * (fbm(x * 0.04, z * 0.04, 17, 3) - 0.5) * 9;
  return h;
}

/** 地形高程（m）。x/z 世界坐标。 */
export function terrainHeight(x, z) {
  const c = roadCenterX(z);
  const d = x - c;
  const e = roadElev(z);
  const ad = Math.abs(d);
  if (ad <= ROAD.carveFull) return e;
  const t = smoothstep(ROAD.carveFull, ROAD.carveBlend, ad);
  const natural = d > 0 ? inlandProfile(d, e, z, x) : seawardProfile(d, e, z, x);
  return lerp(e, natural, t);
}

/** 坡度（0 平 1 陡），用于顶点色与岩石显露。 */
export function terrainSlope(x, z) {
  const e = 2.0;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return clamp(Math.hypot(hx, hz) / (2 * e) * 1.15, 0, 1);
}

/** 海岸线 x（地形穿过海平面的位置）：在路心以西 12–95 m 内二分求根。 */
export function shoreXAt(z) {
  const c = roadCenterX(z);
  let lo = c - 12, hi = c - 95;
  let fLo = terrainHeight(lo, z) - SEA_LEVEL;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    const fMid = terrainHeight(mid, z) - SEA_LEVEL;
    if ((fMid > 0) === (fLo > 0)) { lo = mid; fLo = fMid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

/** 顶点色（0-1 RGB）：湿沙 → 干沙 → 草 → 岩。 */
export function terrainColor(h, slope, x, z) {
  const shore = 0.0;
  const wet = smoothstep(1.15, 0.05, h);              // 近水线压暗
  const dry = smoothstep(0.10, 0.9, h);               // 干沙
  const grass = smoothstep(0.75, 2.4, h) * (1 - smoothstep(20, 34, h));
  const rock = smoothstep(0.42, 0.75, slope) + smoothstep(16, 30, h) * 0.6;
  let r = lerp(0.80, 0.94, dry) * lerp(0.72, 1, wet);
  let g = lerp(0.74, 0.88, dry) * lerp(0.70, 1, wet);
  let b = lerp(0.62, 0.74, dry) * lerp(0.68, 1, wet);
  // 草绿（海岸丘陵：橄榄绿带枯草，不是饱和草坪绿）
  const gr = [0.30, 0.40, 0.21], rr = [0.55, 0.53, 0.48];
  r = lerp(r, gr[0], grass * 0.85); g = lerp(g, gr[1], grass * 0.85); b = lerp(b, gr[2], grass * 0.85);
  const rk = clamp(rock, 0, 1) * 0.9;
  r = lerp(r, rr[0], rk); g = lerp(g, rr[1], rk); b = lerp(b, rr[2], rk);
  // 大色斑：枯草 / 裸土 / 碎石，让山坡不是一整块平色
  const patchA = fbm(x * 0.014, z * 0.014, 1, 7, 4) - 0.5;          // 枯草斑块
  const patchB = fbm(x * 0.030, z * 0.030, 1, 31, 3) - 0.5;         // 裸土斑块
  const dryGrass = clamp(patchA * 1.6, 0, 1) * grass;
  r = lerp(r, 0.62, dryGrass * 0.5); g = lerp(g, 0.55, dryGrass * 0.55); b = lerp(b, 0.34, dryGrass * 0.5);
  const bare = clamp(patchB * 1.8 - 0.25, 0, 1) * (1 - rock);
  r = lerp(r, 0.52, bare * 0.35); g = lerp(g, 0.46, bare * 0.35); b = lerp(b, 0.34, bare * 0.35);
  // 沙面斑驳
  const speck = (hash2(Math.floor(x * 2), Math.floor(z * 2)) - 0.5) * 0.05;
  return [clamp(r + speck, 0, 1), clamp(g + speck, 0, 1), clamp(b + speck, 0, 1)];
}

/* ============================ 分块地形 ============================ */
/** 生成一块地形的几何体（世界坐标中心 (cx, cz)）。 */
export function buildTileGeometry(THREE, tileLen, seg, cx, cz) {
  const g = new THREE.PlaneGeometry(tileLen, tileLen, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const wx = cx + p.getX(i);
    const wz = cz + p.getZ(i);
    const h = terrainHeight(wx, wz);
    p.setY(i, h);
    const c = terrainColor(h, terrainSlope(wx, wz), wx, wz);
    // 顶点色同样是 sRGB 显示值 → 转线性（否则整片地面在 sRGB 输出下会被调亮、饱和）
    colors[i * 3] = srgbToLinear(c[0]); colors[i * 3 + 1] = srgbToLinear(c[1]); colors[i * 3 + 2] = srgbToLinear(c[2]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // UV 以世界米为单位（贴图 metric 决定 repeat）
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (cx + p.getX(i)) / 12, (cz + p.getZ(i)) / 12);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** 沙滩条带（从水下 −12 m 到路肩，横切采样成条带网格，UV 走米制）。 */
export function buildBeachGeometry(THREE, zStart, zLen, segZ, segX, metric) {
  const xFrom = -14, xTo = 5.4;       // 相对海岸线的横向范围
  const cols = segX + 1, rows = segZ + 1;
  const n = cols * rows;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const idx = [];
  const m = metric || 8;
  for (let j = 0; j < rows; j++) {
    const z = zStart + (j / segZ) * zLen;
    const sx = shoreXAt(z);
    for (let i = 0; i < cols; i++) {
      const lat = lerp(xFrom, xTo, i / segX);
      const x = sx + lat;
      const h = terrainHeight(x, z);
      const k = j * cols + i;
      pos[k * 3] = x; pos[k * 3 + 1] = Math.max(h, SEA_LEVEL - 2.2); pos[k * 3 + 2] = z;
      uv[k * 2] = (lat + 60) / m; uv[k * 2 + 1] = z / m;
      const wet = smoothstep(0.9, -0.2, h);
      const c = 1 - wet * 0.34;
      col[k * 3] = c; col[k * 3 + 1] = c * 0.99; col[k * 3 + 2] = c * 0.96;
    }
  }
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * cols + i, b = a + 1, cc = a + cols, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** 回收式地形系统：跟随骑行者，块 key 变化时重建该块几何。 */
export function createTerrain(THREE, kit, opts) {
  const o = opts || {};
  const tileLen = WORLD.tileLen;
  const tilesX = WORLD.tilesX, tilesZ = WORLD.tilesZ;
  const group = new THREE.Group();
  const state = { seg: o.seg || 24, slots: [], keys: new Map(), riderZ: 0, beachKeys: new Map(), beach: null };

  const matGround = kit.mat.ground;
  const matSand = kit.mat.sandVC || kit.mat.sand;

  function baseZ(z) { return Math.floor(z / tileLen) * tileLen; }

  function slotMesh(slot) {
    if (!slot.mesh) {
      slot.mesh = new THREE.Mesh(slot.geo, matGround);
      slot.mesh.receiveShadow = true;
      slot.mesh.castShadow = false;
      slot.mesh.frustumCulled = false;
      group.add(slot.mesh);
    }
    slot.mesh.geometry.dispose();
    slot.mesh.geometry = slot.geo;
  }

  // 初始槽位（居中的 tilesX × tilesZ 窗口）
  for (let ix = 0; ix < tilesX; ix++) {
    for (let iz = 0; iz < tilesZ; iz++) {
      state.slots.push({ ix: ix - ((tilesX - 1) >> 1), iz: iz - ((tilesZ - 1) >> 1), geo: null, mesh: null });
    }
  }

  function rebuild(seg) {
    state.seg = seg;
    state.keys.clear();
    for (const s of state.slots) if (s.mesh) { group.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh = null; }
    state.slots.forEach((s) => { s.geo = null; });
    state.beachKeys.clear();
    update(state.riderZ);
  }

  function update(riderZ) {
    state.riderZ = riderZ;
    const bz = baseZ(riderZ);
    const bx = Math.round(roadCenterX(riderZ) / tileLen) * tileLen;
    for (const s of state.slots) {
      const cz = bz + s.iz * tileLen;
      const cx = bx + s.ix * tileLen;
      const key = Math.round(cx / tileLen) + ',' + Math.round(cz / tileLen);
      if (state.keys.get(s) === key) continue;
      state.keys.set(s, key);
      const old = s.geo;
      s.geo = buildTileGeometry(THREE, tileLen, state.seg, cx, cz);
      slotMesh(s);
      if (old) old.dispose();
    }
    updateBeach(riderZ);
  }

  function updateBeach(riderZ) {
    const len = tileLen * 2;
    const zStart = Math.round((riderZ - tileLen) / len) * len;
    const key = Math.round(zStart / len);
    if (state.beachKeys.get('k') === key) return;
    state.beachKeys.set('k', key);
    const geo = buildBeachGeometry(THREE, zStart, len, 40, 10, 8);
    if (!state.beach) {
      state.beach = new THREE.Mesh(geo, matSand);
      state.beach.receiveShadow = true;
      state.beach.frustumCulled = false;
      group.add(state.beach);
    } else {
      const old = state.beach.geometry;
      state.beach.geometry = geo;
      old.dispose();
    }
  }

  update(0);

  return {
    group: group,
    update: update,
    rebuild: rebuild,
    stats: function () { return { tiles: state.slots.length, seg: state.seg }; },
  };
}
