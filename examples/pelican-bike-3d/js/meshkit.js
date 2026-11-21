/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/meshkit.js —— 几何体合并小工具（r128 自带包无 BufferGeometryUtils）
 * 用途：把多块图元烘成一份几何体，交给 InstancedMesh 复用（一棵棕榈只占 2 个 draw call）。
 */
'use strict';

/**
 * 合并若干几何体（非索引展开后拼接，保留 position/normal/uv）。
 * @param {object} THREE
 * @param {Array<object>} parts 每项 { geo, pos?, rot?, scale?, matrix? }
 * @returns {object} 合并后的 BufferGeometry
 */
export function mergeGeos(THREE, parts) {
  const geos = [];
  let vTotal = 0;
  for (const p of parts) {
    const base = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const c = base.clone();
    let m = p.matrix;
    if (!m) {
      const pos = p.pos || [0, 0, 0];
      const rot = p.rot || [0, 0, 0];
      const sc = Array.isArray(p.scale) ? p.scale : [p.scale || 1, p.scale || 1, p.scale || 1];
      m = new THREE.Matrix4().compose(
        new THREE.Vector3(pos[0], pos[1], pos[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')),
        new THREE.Vector3(sc[0], sc[1], sc[2])
      );
    }
    c.applyMatrix4(m);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) {
      const uv = new Float32Array(c.attributes.position.count * 2);
      c.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    geos.push(c);
    vTotal += c.attributes.position.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const idx = vTotal > 65535 ? new Uint32Array(vTotal) : new Uint16Array(vTotal);
  let vOff = 0;
  for (const c of geos) {
    const p = c.attributes.position, n = c.attributes.normal, u = c.attributes.uv;
    const cnt = p.count;
    for (let i = 0; i < cnt; i++) {
      pos[(vOff + i) * 3] = p.getX(i);
      pos[(vOff + i) * 3 + 1] = p.getY(i);
      pos[(vOff + i) * 3 + 2] = p.getZ(i);
      nor[(vOff + i) * 3] = n.getX(i);
      nor[(vOff + i) * 3 + 1] = n.getY(i);
      nor[(vOff + i) * 3 + 2] = n.getZ(i);
      if (u) { uv[(vOff + i) * 2] = u.getX(i); uv[(vOff + i) * 2 + 1] = u.getY(i); }
    }
    for (let i = 0; i < cnt; i++) idx[vOff + i] = vOff + i;
    vOff += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** 实例矩阵写入器：write(mesh, k, x, y, z, yaw, pitch, roll, sx, sy, sz)。 */
export function matrixWriter(THREE) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  return function write(mesh, k, x, y, z, yaw, pitch, roll, sx, sy, sz) {
    e.set(pitch || 0, yaw || 0, roll || 0, 'YXZ');
    q.setFromEuler(e);
    v.set(x, y, z);
    s.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    mesh.setMatrixAt(k, m.compose(v, q, s));
  };
}
