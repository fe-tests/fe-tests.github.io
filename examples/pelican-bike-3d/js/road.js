/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/road.js —— 海岸公路：路面条带 / 标线 / 护栏 / 石墙 / 路灯 / 里程碑 / 漂流木
 * 世界无限推进：所有元素按「里程块」回收，块 key 变化时只重建该块（几何共享、InstancedMesh 写矩阵）。
 * 本模块还提供 roadFrameAt（道路坐标架）与 PropStrip（道具条带基座），scenery.js / ocean.js 复用。
 */
'use strict';

import { ROAD, WORLD, roadCenterX, roadElev, roadCenterDeriv, roadElevDeriv } from './config.js';
import { terrainHeight } from './terrain.js';
import { rng, hash2 } from './utils.js';

/** 道路坐标架：位置 + 偏航 + 俯仰（沿 +Z 前进）。 */
export function roadFrameAt(z) {
  const d = roadCenterDeriv(z), e = roadElevDeriv(z);
  return {
    x: roadCenterX(z), y: roadElev(z), z: z,
    yaw: Math.atan2(d, 1),
    pitch: Math.atan2(e, Math.sqrt(1 + d * d)),
  };
}
/** 路面（含 3 cm 抬升）上的一点。 */
export function roadPoint(z, lat, yOff) {
  const f = roadFrameAt(z);
  return { x: f.x + lat, y: f.y + 0.03 + (yOff || 0), z: z, yaw: f.yaw, pitch: f.pitch };
}

/* ============================ 道具条带（InstancedMesh 回收） ============================ */
export class PropStrip {
  /**
   * @param {object} THREE
   * @param {object} o { geo, mat, tileLen, tiles, perTile, back(0-1), cast, receive,
   *                     place(k, zBase, strip, rand, i, tileKey) }
   */
  constructor(THREE, o) {
    this.o = o;
    this.tiles = o.tiles;
    this.tileLen = o.tileLen;
    this.perTile = o.perTile;
    this.back = o.back === undefined ? 0.3 : o.back;
    this.count = this.tiles * this.perTile;
    this.mesh = new THREE.InstancedMesh(o.geo, o.mat, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = !!o.cast;
    this.mesh.receiveShadow = !!o.receive;
    this.mesh.frustumCulled = false;
    this.mesh.userData.strip = this;
    this._keys = new Array(this.tiles).fill(null);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  /** 写一个实例：位置 + 欧拉（YXZ 顺序）+ 缩放。 */
  fill(k, x, y, z, yaw, pitch, roll, sx, sy, sz) {
    this._e.set(pitch || 0, yaw || 0, roll || 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this._v.set(x, y, z);
    this._s.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    this._m.compose(this._v, this._q, this._s);
    this.mesh.setMatrixAt(k, this._m);
  }
  /** 收到地下（占位不用）。 */
  hide(k) { this.fill(k, 0, -9999, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001); }

  /** 回收更新：窗口 [riderZ - back*len, …]；块 key 变化才写矩阵。 */
  update(riderZ) {
    const lead = Math.round(this.tiles * this.back);
    const base = Math.floor(riderZ / this.tileLen);
    let touched = false;
    for (let s = 0; s < this.tiles; s++) {
      const tileKey = base - lead + s;
      if (this._keys[s] === tileKey) continue;
      this._keys[s] = tileKey;
      const zBase = tileKey * this.tileLen;
      const rand = rng((tileKey * 7919 + 104729) | 0);
      for (let i = 0; i < this.perTile; i++) {
        this.o.place(s * this.perTile + i, zBase, this, rand, i, tileKey);
      }
      touched = true;
    }
    if (touched) this.mesh.instanceMatrix.needsUpdate = true;
  }
  get windowLen() { return this.tiles * this.tileLen; }
}

/* ============================ 路面条带几何 ============================ */
function buildRoadGeometry(THREE, zStart, len, metric) {
  const segs = Math.max(8, Math.round(len / 3.5));
  const cols = [
    -(ROAD.carHalf + ROAD.shoulder), -ROAD.carHalf, 0, ROAD.carHalf, ROAD.carHalf + ROAD.shoulder,
  ];
  const rows = segs + 1;
  const n = rows * cols.length;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = [];
  const m = metric || 6.5;
  for (let j = 0; j < rows; j++) {
    const z = zStart + (j / segs) * len;
    const cx = roadCenterX(z), e = roadElev(z);
    for (let i = 0; i < cols.length; i++) {
      const lat = cols[i];
      const crown = 0.06 * (1 - Math.min(1, Math.abs(lat) / ROAD.carHalf));
      const drop = Math.abs(lat) > ROAD.carHalf ? -0.14 * (Math.abs(lat) - ROAD.carHalf) : 0;
      const k = j * cols.length + i;
      pos[k * 3] = cx + lat;
      pos[k * 3 + 1] = e + 0.02 + crown + drop;
      pos[k * 3 + 2] = z;
      uv[k * 2] = lat / m; uv[k * 2 + 1] = z / m;
    }
  }
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < cols.length - 1; i++) {
      const a = j * cols.length + i, b = a + 1, c = a + cols.length, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ============================ 装配公路 ============================ */
export function createRoad(THREE, kit) {
  const group = new THREE.Group();
  const tileLen = WORLD.roadTileLen, tiles = WORLD.roadTiles;
  const span = tileLen * tiles;
  const stripTiles = (len) => Math.max(2, Math.round(span / len));
  const slots = [];
  for (let i = 0; i < tiles; i++) slots.push({ key: null, mesh: null, geo: null });

  function updateTiles(riderZ) {
    const base = Math.floor(riderZ / tileLen);
    for (let s = 0; s < tiles; s++) {
      const key = base - (tiles >> 1) + s;
      if (slots[s].key === key) continue;
      slots[s].key = key;
      const geo = buildRoadGeometry(THREE, key * tileLen, tileLen, 6.5);
      if (!slots[s].mesh) {
        slots[s].mesh = new THREE.Mesh(geo, kit.mat.asphalt);
        slots[s].mesh.receiveShadow = true;
        slots[s].mesh.frustumCulled = false;
        group.add(slots[s].mesh);
      } else {
        const old = slots[s].geo;
        slots[s].mesh.geometry = geo;
        if (old) old.dispose();
      }
      slots[s].geo = geo;
    }
  }

  const strips = [];
  function addStrip(cfg) {
    const st = new PropStrip(THREE, cfg);
    group.add(st.mesh);
    strips.push(st);
    return st;
  }

  /* 中线虚线 */
  addStrip({
    geo: new THREE.BoxGeometry(0.13, 0.05, ROAD.dashLen), mat: kit.mat.paintYellow,
    tileLen: ROAD.dashSpacing, tiles: stripTiles(ROAD.dashSpacing), perTile: 1, back: 0.34,
    place: function (k, zBase, st) {
      const z = zBase + ROAD.dashSpacing * 0.5, p = roadPoint(z, 0);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, 0);
    },
  });

  /* 边线（8 m 连续段） */
  const lineSeg = 8;
  const edge = (lat) => addStrip({
    geo: new THREE.BoxGeometry(0.13, 0.045, lineSeg - 0.25), mat: kit.mat.paintWhite,
    tileLen: lineSeg, tiles: stripTiles(lineSeg), perTile: 1, back: 0.34,
    place: function (k, zBase, st) {
      const z = zBase + lineSeg * 0.5, p = roadPoint(z, lat);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, 0);
    },
  });
  edge(-ROAD.carHalf + 0.22);
  edge(ROAD.carHalf - 0.22);

  /* 护栏（靠海侧）：桩 + 两道横梁 */
  const gS = ROAD.guardSpacing, gTiles = stripTiles(gS);
  addStrip({
    geo: new THREE.BoxGeometry(0.11, 0.92, 0.11), mat: kit.mat.metal,
    tileLen: gS, tiles: gTiles, perTile: 1, back: 0.34, cast: true,
    place: function (k, zBase, st) {
      const z = zBase + gS * 0.5, p = roadPoint(z, ROAD.guardLateral, -0.38);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, 0);
    },
  });
  const railGeo = new THREE.BoxGeometry(0.055, 0.14, gS - 0.05);
  const rail = (h) => addStrip({
    geo: railGeo, mat: kit.mat.metal, tileLen: gS, tiles: gTiles, perTile: 1, back: 0.34, cast: true,
    place: function (k, zBase, st) {
      const z = zBase + gS * 0.5, p = roadPoint(z, ROAD.guardLateral, h);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, 0);
    },
  });
  rail(0.62); rail(0.30);

  /* 内侧低石墙 */
  const wallSeg = 3.0;
  addStrip({
    geo: new THREE.BoxGeometry(0.72, 0.9, wallSeg - 0.08), mat: kit.mat.stone,
    tileLen: wallSeg, tiles: stripTiles(wallSeg), perTile: 1, back: 0.34, cast: true, receive: true,
    place: function (k, zBase, st) {
      const z = zBase + wallSeg * 0.5, p = roadPoint(z, ROAD.wallLateral, 0.28);
      const j = hash2(Math.floor(z * 3), 977);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, (j - 0.5) * 0.03, 1, 0.82 + j * 0.36, 1);
    },
  });

  /* 路灯（间距 42 m，交替侧）：杆 + 灯头 + 地面光斑 */
  const lS = ROAD.lampSpacing, lTiles = stripTiles(lS);
  const lampSide = (tileKey) => (tileKey % 2 === 0 ? 1 : -1);
  addStrip({
    geo: new THREE.CylinderGeometry(0.10, 0.15, 7.6, 7).translate(0, 3.8, 0), mat: kit.mat.steel,
    tileLen: lS, tiles: lTiles, perTile: 1, back: 0.34, cast: true,
    place: function (k, zBase, st, r, i, tileKey) {
      const z = zBase + lS * 0.5, p = roadPoint(z, lampSide(tileKey) * 5.9, -0.02);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, lampSide(tileKey) * 0.30);
    },
  });
  addStrip({
    geo: new THREE.BoxGeometry(0.9, 0.16, 0.36), mat: kit.mat.lampGlow,
    tileLen: lS, tiles: lTiles, perTile: 1, back: 0.34,
    place: function (k, zBase, st, r, i, tileKey) {
      const z = zBase + lS * 0.5, p = roadPoint(z, lampSide(tileKey) * 5.0, 7.55);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, 0);
    },
  });
  addStrip({
    geo: new THREE.CircleGeometry(4.8, 20).rotateX(-Math.PI / 2), mat: kit.mat.lampGlow,
    tileLen: lS, tiles: lTiles, perTile: 1, back: 0.34,
    place: function (k, zBase, st, r, i, tileKey) {
      const z = zBase + lS * 0.5, p = roadPoint(z, lampSide(tileKey) * 4.2, 0.08);
      st.fill(k, p.x, p.y, p.z, 0, 0, 0);
    },
  });

  /* 里程碑桩 */
  const pS = ROAD.postSpacing;
  addStrip({
    geo: new THREE.BoxGeometry(0.16, 0.9, 0.16), mat: kit.mat.paintWhite,
    tileLen: pS, tiles: stripTiles(pS), perTile: 1, back: 0.34, cast: true,
    place: function (k, zBase, st) {
      const z = zBase + pS * 0.5, p = roadPoint(z, ROAD.carHalf + ROAD.shoulder - 0.3, 0.4);
      st.fill(k, p.x, p.y, p.z, p.yaw, p.pitch, 0);
    },
  });

  /* 漂流木（沙滩上随机散布） */
  const dS = 96, dPer = 3;
  addStrip({
    geo: new THREE.CylinderGeometry(0.16, 0.22, 3.2, 6).rotateZ(Math.PI / 2), mat: kit.mat.wood,
    tileLen: dS, tiles: stripTiles(dS), perTile: dPer, back: 0.34, cast: true,
    place: function (k, zBase, st, rand, i) {
      const z = zBase + (i + 0.5) * (dS / dPer) + (rand() - 0.5) * 10;
      const lat = -(11 + rand() * 24);
      const x = roadCenterX(z) + lat;
      const f = roadFrameAt(z);
      st.fill(k, x, terrainHeight(x, z) + 0.14, z, f.yaw + (rand() - 0.5) * 1.7, f.pitch,
        (rand() - 0.5) * 0.3, 0.7 + rand() * 0.9, 0.7 + rand() * 0.6, 0.7 + rand() * 0.9);
    },
  });

  function update(riderZ) {
    updateTiles(riderZ);
    for (const st of strips) st.update(riderZ);
  }
  update(0);

  return {
    group: group,
    update: update,
    setLampOpacity: function (v) { kit.mat.lampGlow.opacity = v; },
    strips: strips,
  };
}
