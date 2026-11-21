/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/scenery.js —— 植被与远景（棕榈/松树/草丛/礁石/海鸥/云带/远山脊/海岬）
 * 每种道具 = 烘一份几何体 + 一个 InstancedMesh（合并几何见 meshkit.js），随里程块回收。
 * 密度由画质档控制：低档按位跳过实例（空间均匀稀疏，不是截尾）。
 */
'use strict';

import { WORLD, roadCenterX } from './config.js';
import { terrainHeight, shoreXAt } from './terrain.js';
import { PropStrip } from './road.js';
import { mergeGeos, matrixWriter } from './meshkit.js';
import { hash2, lerp, TAU } from './utils.js';

/* ============================ 模板几何 ============================ */
function palmGeos(THREE) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(t * t * 0.9, t * 6.2, Math.sin(t * 1.4) * 0.25));
  }
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.16, 6, false);
  const leafParts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const p = new THREE.PlaneGeometry(1.05, 1.95, 1, 1).translate(0, 0.95, 0);
    leafParts.push({
      geo: p,
      pos: [0.9 + Math.cos(a) * 0.35, 6.2 + Math.sin(i * 1.7) * 0.12, Math.sin(a) * 0.35],
      rot: [Math.cos(a) * 1.15 + 0.55, a, -0.55 - (i % 3) * 0.12],
    });
  }
  for (const off of [[0.85, 6.05, 0.1], [0.95, 6.0, -0.08]]) {
    leafParts.push({ geo: new THREE.SphereGeometry(0.10, 6, 5), pos: off });
  }
  return { trunk: trunk, leaves: mergeGeos(THREE, leafParts) };
}

function pineGeos(THREE) {
  const trunk = new THREE.CylinderGeometry(0.10, 0.16, 1.9, 6).translate(0, 0.95, 0);
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    parts.push({
      geo: new THREE.PlaneGeometry(2.3, 2.6, 1, 1).translate(0, 1.3, 0),
      pos: [0, 0.9, 0], rot: [0, a, 0],
    });
  }
  parts.push({ geo: new THREE.ConeGeometry(1.15, 2.4, 7).translate(0, 2.4, 0) });
  return { trunk: trunk, canopy: mergeGeos(THREE, parts) };
}

function grassGeos(THREE) {
  const parts = [
    { geo: new THREE.PlaneGeometry(0.62, 0.55, 1, 1).translate(0, 0.27, 0), rot: [0, 0, 0] },
    { geo: new THREE.PlaneGeometry(0.62, 0.55, 1, 1).translate(0, 0.27, 0), rot: [0, Math.PI / 2, 0] },
  ];
  return mergeGeos(THREE, parts);
}

function rockGeos(THREE) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = 0.72 + hash2(i, 7) * 0.5;
    p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.7, p.getZ(i) * n);
  }
  g.computeVertexNormals();
  return g;
}

function gullGeos(THREE) {
  const parts = [
    { geo: new THREE.PlaneGeometry(1, 1), rot: [0, 0, 0] },
  ];
  return mergeGeos(THREE, parts);
}

/* ============================ 装配 ============================ */
export function createScenery(THREE, kit, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  let density = o.density === undefined ? 1 : o.density;
  const write = matrixWriter(THREE);
  const tileLen = WORLD.propTileLen;
  const tiles = WORLD.propTiles;
  const strips = [];
  const gullCount = o.gulls || 8;
  const cloudCount = o.clouds || 14;

  /** 密度抽样：按 (块, 序号) 稳定哈希决定该实例是否画（空间均匀稀疏）。 */
  function keep(tileKey, i, salt) {
    if (density >= 0.999) return true;
    return hash2(tileKey * 31 + salt, i * 7 + salt * 3) < density;
  }

  function addStrip(cfg) {
    const st = new PropStrip(THREE, cfg);
    group.add(st.mesh);
    strips.push(st);
    return st;
  }

  /* ---------- 棕榈（路边与沙丘之间）---------- */
  const palm = palmGeos(THREE);
  function placePalm(k, zBase, st, rand, i, tileKey, trunkMesh, leafMesh) {
    if (!keep(tileKey, i, 11)) { st.hide(k); if (leafMesh) write(leafMesh, k, 0, -9999, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001); return; }
    const z = zBase + (i + 0.5) * (tileLen / 3) + (rand() - 0.5) * 9;
    const side = rand() < 0.78 ? 1 : -1;
    const d = side > 0 ? lerp(9, 48, rand()) : -(11 + rand() * 16);
    const x = roadCenterX(z) + d;
    const y = terrainHeight(x, z);
    if (y < 0.9) { st.hide(k); if (leafMesh) write(leafMesh, k, 0, -9999, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001); return; }
    const s = 1.0 + rand() * 0.7;
    const yaw = rand() * TAU, pitch = (rand() - 0.5) * 0.10, roll = (rand() - 0.5) * 0.12;
    write(trunkMesh, k, x, y - 0.15, z, yaw, pitch, roll, s, s, s);
    if (leafMesh) write(leafMesh, k, x, y - 0.15, z, yaw, pitch, roll, s, s, s);
  }
  let palmTrunkStrip, palmLeafStrip;
  palmTrunkStrip = addStrip({
    geo: palm.trunk, mat: kit.mat.bark, tileLen: tileLen, tiles: tiles, perTile: 3, back: 0.3, cast: true,
    place: function (k, zB, st, r, i, tk) {
      placePalm(k, zB, st, r, i, tk, palmTrunkStrip.mesh, palmLeafStrip ? palmLeafStrip.mesh : null);
    },
  });
  palmLeafStrip = addStrip({
    geo: palm.leaves, mat: kit.mat.palmLeaf, tileLen: tileLen, tiles: tiles, perTile: 3, back: 0.3, cast: true,
    place: function (k, zB, st, r, i, tk) {
      placePalm(k, zB, st, r, i, tk, palmTrunkStrip.mesh, palmLeafStrip.mesh);
    },
  });

  /* ---------- 松树/灌木（更内侧）---------- */
  const pine = pineGeos(THREE);
  let pineTrunkStrip, pineCanopyStrip;
  function placePineAll(k, zBase, st, rand, i, tileKey) {
    if (!keep(tileKey, i, 23)) { st.hide(k); write(pineCanopyStrip.mesh, k, 0, -9999, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001); return; }
    const z = zBase + (i + 0.5) * (tileLen / 4) + (rand() - 0.5) * 7;
    const d = lerp(20, 95, rand() * rand() + 0.05);
    const x = roadCenterX(z) + d;
    const y = terrainHeight(x, z);
    const s = 0.8 + rand() * 1.5;
    const yaw = rand() * TAU;
    write(pineTrunkStrip.mesh, k, x, y, z, yaw, 0, 0, s, s, s);
    write(pineCanopyStrip.mesh, k, x, y, z, yaw, 0, 0, s, s, s);
  }
  pineTrunkStrip = addStrip({
    geo: pine.trunk, mat: kit.mat.bark, tileLen: tileLen, tiles: tiles, perTile: 4, back: 0.3, cast: true,
    place: function (k, zB, st, r, i, tk) { placePineAll(k, zB, st, r, i, tk); },
  });
  pineCanopyStrip = addStrip({
    geo: pine.canopy, mat: kit.mat.foliage, tileLen: tileLen, tiles: tiles, perTile: 4, back: 0.3, cast: true,
    place: function (k, zB, st, r, i, tk) { placePineAll(k, zB, st, r, i, tk); },
  });

  /* ---------- 草丛（路肩与沙丘）---------- */
  const grassGeo = grassGeos(THREE);
  addStrip({
    geo: grassGeo, mat: kit.mat.grassCard, tileLen: 12, tiles: Math.round(tiles * tileLen / 12), perTile: 6, back: 0.3,
    place: function (k, zBase, st, rand, i, tileKey) {
      if (!keep(tileKey, i, 37)) { st.hide(k); return; }
      const z = zBase + (i + 0.5) * 2 + (rand() - 0.5) * 1.6;
      const side = rand() < 0.55 ? 1 : -1;
      const d = side > 0 ? lerp(5.6, 40, rand()) : lerp(5.4, 12, rand());
      const x = roadCenterX(z) + d;
      const y = terrainHeight(x, z);
      if (y < 0.85) { st.hide(k); return; }
      const s = 0.7 + rand() * 1.1;
      st.fill(k, x, y - 0.04, z, rand() * TAU, 0, 0, s, s * (1 + rand()), s);
    },
  });

  /* ---------- 礁石与卵石（沙滩 + 路肩）---------- */
  const rockGeo = rockGeos(THREE);
  addStrip({
    geo: rockGeo, mat: kit.mat.stone, tileLen: 64, tiles: Math.round(tiles * tileLen / 64), perTile: 5, back: 0.3, cast: true, receive: true,
    place: function (k, zBase, st, rand, i, tileKey) {
      if (!keep(tileKey, i, 53)) { st.hide(k); return; }
      const z = zBase + (i + 0.5) * 12.8 + (rand() - 0.5) * 9;
      const shore = shoreXAt(z);
      const x = shore + lerp(-9, 7, rand());
      const s = 0.3 + rand() * rand() * 2.4;
      st.fill(k, x, terrainHeight(x, z) - s * 0.35, z, rand() * TAU, 0, (rand() - 0.5) * 0.5, s, s * 0.8, s);
    },
  });

  /* ---------- 海岬（远景点状岩岛，回收周期 760 m）---------- */
  const headGeo = mergeGeos(THREE, [
    { geo: new THREE.ConeGeometry(1, 1.5, 7, 2).translate(0, 0.75, 0), pos: [0, 0, 0], scale: [1, 1, 1] },
    { geo: new THREE.ConeGeometry(0.7, 1.0, 6, 1).translate(0, 0.5, 0), pos: [1.3, 0, 0.4] },
  ]);
  const headlands = addStrip({
    geo: headGeo, mat: kit.mat.headland, tileLen: WORLD.headlandSpacing, tiles: 3, perTile: 2, back: 0.5,
    place: function (k, zBase, st, rand, i) {
      const z = zBase + (i + 0.5) * (WORLD.headlandSpacing / 2) + (rand() - 0.5) * 200;
      const shore = shoreXAt(z);
      const s = 26 + rand() * 44;
      st.fill(k, shore - (90 + rand() * 190), -3, z, rand() * TAU, 0, 0, s, s, s);
    },
  });

  /* ---------- 远山脊（地形块之外的悬崖轮廓，雾里压暗）---------- */
  const ridgeGeo = mergeGeos(THREE, (function () {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      parts.push({
        geo: new THREE.ConeGeometry(1, 1.6, 6, 1).translate(0, 0.8, 0),
        pos: [(i - 3) * 2.6, 0, Math.sin(i * 1.3) * 1.2],
        rot: [0, i * 0.7, 0],
        scale: [2.2 + hash2(i, 5) * 1.6, 1.4 + hash2(i, 11) * 1.4, 2.0],
      });
    }
    return parts;
  })());
  const ridge = addStrip({
    geo: ridgeGeo, mat: kit.mat.headland, tileLen: 520, tiles: 3, perTile: 1, back: 0.5,
    place: function (k, zBase, st, rand) {
      const z = zBase + 260 + (rand() - 0.5) * 200;
      const s = 90;
      st.fill(k, roadCenterX(z) + 520 + rand() * 160, -6, z, rand() * 0.6, 0, 0, s, s * 0.8, s * 1.4);
    },
  });

  /* ---------- 海鸥（轨道滑翔，实例矩阵每帧写）---------- */
  const gullGeo = gullGeos(THREE);
  const gullMesh = new THREE.InstancedMesh(gullGeo, kit.mat.gull, gullCount);
  gullMesh.frustumCulled = false;
  gullMesh.renderOrder = 1;
  group.add(gullMesh);
  const gulls = [];
  for (let i = 0; i < gullCount; i++) {
    gulls.push({
      a: hash2(i, 3) * TAU, r: 22 + hash2(i, 7) * 34, y: 14 + hash2(i, 11) * 26,
      sp: 0.10 + hash2(i, 13) * 0.16, sc: 1.0 + hash2(i, 17) * 1.3, ph: hash2(i, 19) * TAU,
    });
  }

  /* ---------- 云带（水平大 plane，缓慢漂流）---------- */
  const cloudGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const cloudMesh = new THREE.InstancedMesh(cloudGeo, kit.mat.cloud, cloudCount);
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = -1;
  group.add(cloudMesh);
  const clouds = [];
  for (let i = 0; i < cloudCount; i++) {
    clouds.push({
      x: (hash2(i, 41) - 0.5) * WORLD.cloudSpan, y: 210 + hash2(i, 43) * 220,
      zOff: (hash2(i, 47) - 0.5) * WORLD.cloudSpan, s: 90 + hash2(i, 53) * 190,
      sp: 1.5 + hash2(i, 59) * 4.5, rot: hash2(i, 61) * TAU,
    });
  }

  /* ---------- 更新 ---------- */
  let t = 0, lastZ = 0;
  function update(riderZ, dt, day, wind) {
    t += dt;
    lastZ = riderZ;
    for (const st of strips) st.update(riderZ);

    // 海鸥：围绕骑行者巡航的圆轨道
    for (let i = 0; i < gulls.length; i++) {
      const g = gulls[i];
      g.a += g.sp * dt;
      const cx = roadCenterX(riderZ) - 26;
      const x = cx + Math.cos(g.a) * g.r;
      const z = riderZ + 24 + Math.sin(g.a) * g.r * 1.4;
      const y = terrainHeight(x, z) + g.y + Math.sin(t * 0.6 + g.ph) * 2.2;
      const flapY = 1 + Math.sin(t * 5.2 + g.ph) * 0.22;
      const yaw = Math.atan2(Math.cos(g.a), -Math.sin(g.a) * 1.4);
      // 面向相机的准 billboard：让 plane 朝向镜头偏航
      write(gullMesh, i, x, y, z, yaw, 0, Math.sin(t * 2.4 + g.ph) * 0.25, g.sc * 2.0, g.sc * flapY * 2.0, 1);
    }
    gullMesh.instanceMatrix.needsUpdate = true;

    // 云：向海侧缓慢漂流，按相机位置回收
    const span = WORLD.cloudSpan;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.x += (wind === undefined ? 3.2 : wind) * dt * c.sp * 0.35;
      if (c.x > span * 0.5) c.x -= span;
      const z = riderZ + c.zOff;
      write(cloudMesh, i, c.x, c.y, z, c.rot, 0, 0, c.s, c.s, c.s);
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  }

  function setDensity(d) {
    density = d;
    for (const st of strips) {
      for (let i = 0; i < st._keys.length; i++) st._keys[i] = null;   // 全部块重排
      st.update(lastZ);
    }
  }

  function setCounts(q) {
    gullMesh.count = Math.min(gullCount, q.gulls || gullCount);
    cloudMesh.count = Math.min(cloudCount, q.clouds || cloudCount);
  }

  update(0, 0.016, null, 3.2);

  return {
    group: group,
    update: update,
    setDensity: setDensity,
    setCounts: setCounts,
    strips: strips,
    gullMesh: gullMesh,
    cloudMesh: cloudMesh,
  };
}
