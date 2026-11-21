/* 3D 鹈鹕海边骑行（pelican-bike-3d）· js/bike.js —— 通勤自行车（车架/轮组/曲柄/车把/车座/挡泥板/前筐/前灯）
 * 组件局部坐标：前进 = +X，上 = +Y，右 = +Z（骑行者组的坐标架与之一致）。
 * 暴露枢轴：wheelR / wheelF（滚动相位绕 Z）、crank（曲柄相位绕 Z）、pedalL / pedalR、handlebar（转向）。
 * 轮半径 0.34 m、曲柄 0.17 m（与 config.RIDE 一致）。
 */
'use strict';

import { RIDE } from './config.js';
import { TAU } from './utils.js';

/** 沿点列生成一根管件（TubeGeometry）。 */
function tube(THREE, pts, r, seg, radial) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0)));
  return new THREE.TubeGeometry(curve, seg || 14, r, radial || 8, false);
}
/** 轮辐集合：一根辐条 + 16 个实例（几何在局部 XY 平面）。 */
function spokeGeo(THREE) {
  return new THREE.CylinderGeometry(0.0035, 0.0035, RIDE.wheelR - 0.03, 4);
}
function makeWheel(THREE, kit, side) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(RIDE.wheelR, 0.022, 8, 26), kit.mat.rubber);
  tire.castShadow = true;
  g.add(tire);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIDE.wheelR - 0.032, 0.014, 6, 26), kit.mat.chrome);
  g.add(rim);
  const spokes = new THREE.InstancedMesh(spokeGeo(THREE), kit.mat.chrome, 18);
  const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    e.set(0, 0, a);
    q.setFromEuler(e);
    v.set(0, 0, side * 0.032);
    m.compose(v, q, s);
    spokes.setMatrixAt(i, m);
  }
  spokes.instanceMatrix.needsUpdate = true;
  g.add(spokes);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.085, 10).rotateX(Math.PI / 2), kit.mat.steel);
  g.add(hub);
  // 气门嘴（转动的参考点，让轮子看得出在转）
  const valve = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), kit.mat.plastic);
  valve.position.set(0, RIDE.wheelR - 0.055, side * 0.03);
  g.add(valve);
  return g;
}

export function createBike(THREE, kit) {
  const group = new THREE.Group();
  const R = RIDE.wheelR;
  const wheelBase = 1.05;
  const axX = wheelBase / 2;

  /* --- 车架（红色钢管）--- */
  const frame = new THREE.Group();
  const addTube = (pts, r) => {
    const mesh = new THREE.Mesh(tube(THREE, pts, r, 16, 7), kit.mat.frame);
    mesh.castShadow = true;
    frame.add(mesh);
    return mesh;
  };
  // 后叉（chain stay + seat stay）
  addTube([[-axX, 0.03, 0.03], [-0.16, 0.06, 0.02], [0, 0.02, 0.03]], 0.017);
  addTube([[-axX, 0.03, -0.03], [-0.16, 0.06, -0.02], [0, 0.02, -0.03]], 0.017);
  addTube([[-axX, 0.03, 0.02], [-0.30, 0.28, 0.015], [-0.17, 0.50, 0.01]], 0.014);
  addTube([[-axX, 0.03, -0.02], [-0.30, 0.28, -0.015], [-0.17, 0.50, -0.01]], 0.014);
  // 立管 + 上管 + 下管 + 头管
  addTube([[-0.02, 0.02, 0], [-0.13, 0.30, 0], [-0.19, 0.56, 0]], 0.021);
  addTube([[-0.18, 0.54, 0], [0.10, 0.585, 0], [0.36, 0.62, 0]], 0.018);
  addTube([[0.0, 0.03, 0], [0.20, 0.30, 0], [0.39, 0.575, 0]], 0.020);
  addTube([[0.375, 0.55, 0], [0.415, 0.70, 0]], 0.022);
  // 后货架
  addTube([[-0.52, 0.30, 0.06], [-0.30, 0.325, 0.075], [-0.19, 0.44, 0.05]], 0.010);
  addTube([[-0.52, 0.30, -0.06], [-0.30, 0.325, -0.075], [-0.19, 0.44, -0.05]], 0.010);
  const rackTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.17), kit.mat.steel);
  rackTop.position.set(-0.40, 0.335, 0);
  rackTop.castShadow = true;
  frame.add(rackTop);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.15), kit.mat.plastic);
  bag.position.set(-0.42, 0.255, 0);
  bag.castShadow = true;
  frame.add(bag);
  group.add(frame);

  /* --- 曲柄组（中轴 = 原点）--- */
  const crank = new THREE.Group();
  const chainring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.008, 6, 22).rotateY(Math.PI / 2), kit.mat.chrome);
  chainring.position.set(0, 0, 0.055);
  crank.add(chainring);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.010, 5, 20).rotateY(Math.PI / 2), kit.mat.steel);
  chain.position.set(0, 0, 0.055);
  chain.scale.set(1, 1, 1);
  crank.add(chain);
  const mkArm = (side, phase) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.030, RIDE.crankLen, 0.016), kit.mat.chrome);
    arm.geometry.translate(0, RIDE.crankLen / 2, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, side);
    pivot.rotation.z = phase;
    pivot.add(arm);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.022, 0.055), kit.mat.plastic);
    pedal.position.set(0.005, RIDE.crankLen, 0);
    pedal.castShadow = true;
    pivot.add(pedal);
    crank.add(pivot);
    return { pivot: pivot, pedal: pedal };
  };
  // 曲柄臂静止时朝 +Y，曲柄组绕 Z 转 RIDE.CRANK_SIGN × 相位；
  // 脚踏相对中轴的偏移 = config.pedalOffset(side, crankPhase)（鹈鹕腿 IK 用的就是它）。
  const crankL = mkArm(RIDE.pedalZ, 0);        // +Z 侧脚踏（鹈鹕 side=+1 的那条腿踩它）
  const crankR = mkArm(-RIDE.pedalZ, Math.PI);  // −Z 侧脚踏（相位差 π）
  const cog = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.007, 5, 16).rotateY(Math.PI / 2), kit.mat.steel);
  cog.position.set(-axX, 0.03, -0.05);
  crank.add(cog);
  group.add(crank);

  /* --- 轮组 --- */
  const wheelR = new THREE.Group();
  wheelR.position.set(-axX, 0.03, 0);
  wheelR.add(makeWheel(THREE, kit, -1));
  const fenderR = new THREE.Mesh(new THREE.TorusGeometry(R + 0.045, 0.014, 5, 18, 2.3).rotateZ(1.1), kit.mat.metal);
  fenderR.position.set(0, 0, -0.045);
  wheelR.add(fenderR);
  group.add(wheelR);

  /* --- 前叉 + 前轮 + 车把（绕 Y 转向）--- */
  const steer = new THREE.Group();
  steer.position.set(0.40, 0.66, 0);
  const fork = new THREE.Group();
  const mkForkLeg = (side) => {
    const leg = new THREE.Mesh(tube(THREE, [[0.0, 0.0, side * 0.055], [0.055, -0.20, side * 0.06], [0.115, -0.42, side * 0.055]], 0.014), kit.mat.frame);
    leg.castShadow = true;
    fork.add(leg);
  };
  mkForkLeg(1); mkForkLeg(-1);
  steer.add(fork);
  const wheelF = new THREE.Group();
  wheelF.position.set(0.115, -0.63, 0);
  wheelF.add(makeWheel(THREE, kit, 1));
  const fenderF = new THREE.Mesh(new THREE.TorusGeometry(R + 0.045, 0.014, 5, 18, 2.1).rotateZ(1.35), kit.mat.metal);
  fenderF.position.set(0, 0, 0.045);
  wheelF.add(fenderF);
  steer.add(wheelF);
  const stem = new THREE.Mesh(tube(THREE, [[0, 0, 0], [0.045, 0.03, 0], [0.085, 0.015, 0]], 0.016), kit.mat.chrome);
  steer.add(stem);
  const handlebar = new THREE.Group();
  handlebar.position.set(0.09, 0.02, 0);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.60, 8).rotateX(Math.PI / 2), kit.mat.chrome);
  bar.castShadow = true;
  handlebar.add(bar);
  const gripL = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.11, 8).rotateX(Math.PI / 2), kit.mat.plastic);
  gripL.position.set(0.005, 0, 0.27);
  handlebar.add(gripL);
  const gripR = gripL.clone();
  gripR.position.z = -0.27;
  handlebar.add(gripR);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 10).rotateX(Math.PI / 2), kit.mat.chrome);
  bell.position.set(0.01, 0.02, 0.12);
  handlebar.add(bell);
  steer.add(handlebar);
  group.add(steer);

  /* --- 车座 --- */
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 8), kit.mat.chrome);
  seatPost.position.set(-0.195, 0.60, 0);
  group.add(seatPost);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.15), kit.mat.plastic);
  saddle.geometry.translate(0.02, 0, 0);
  saddle.position.set(-0.20, 0.685, 0);
  saddle.castShadow = true;
  group.add(saddle);
  const saddleNose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), kit.mat.plastic);
  saddleNose.scale.set(1.5, 0.5, 1.0);
  saddleNose.position.set(-0.06, 0.682, 0);
  group.add(saddleNose);

  /* --- 前车筐（含两条鱼，尾巴塞在筐边）--- */
  const basket = new THREE.Group();
  basket.position.set(0.50, 0.40, 0);
  const wall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kit.mat.basket);
    m.position.set(x, y, z);
    m.castShadow = true;
    basket.add(m);
  };
  wall(0.02, 0.22, 0.34, -0.16, 0, 0);
  wall(0.02, 0.22, 0.34, 0.16, 0, 0);
  wall(0.34, 0.22, 0.02, 0, 0, -0.17);
  wall(0.34, 0.22, 0.02, 0, 0, 0.17);
  wall(0.34, 0.02, 0.34, 0, -0.11, 0);
  const fish = (x, z, rot) => {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 8).rotateZ(-Math.PI / 2), kit.mat.fish);
    body.position.set(x, 0.12, z);
    body.rotation.y = rot;
    body.castShadow = true;
    basket.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.10, 5), kit.mat.fishBelly);
    tail.position.set(x - 0.15, 0.13, z);
    tail.rotation.z = Math.PI / 2;
    tail.scale.set(1, 1, 0.45);
    basket.add(tail);
  };
  fish(-0.02, 0.08, 0.12);
  fish(-0.02, -0.08, -0.10);
  group.add(basket);

  /* --- 前灯（夜里点亮）--- */
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.07, 12).rotateX(Math.PI / 2), kit.mat.steel);
  lamp.position.set(0.56, 0.30, 0);
  group.add(lamp);
  const lampFace = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12).translate(0, 0, 0.036), kit.mat.lampGlow);
  lampFace.position.set(0.56, 0.30, 0);
  lampFace.rotation.y = 0;
  group.add(lampFace);
  const beam = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), kit.mat.lampGlow);
  beam.position.set(1.5, 0.16, 0);
  beam.scale.set(1.6, 0.5, 0.9);
  group.add(beam);

  /* --- 后反光片 --- */
  const ref = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.08), kit.mat.frame);
  ref.position.set(-0.58, 0.28, 0);
  group.add(ref);

  group.traverse(function (o) {
    if (o.isMesh && !o.castShadow && o.castShadow === false) o.castShadow = true;
  });

  return {
    group: group,
    wheelR: wheelR,
    wheelF: wheelF,
    steer: steer,
    crank: crank,
    pedalL: crankL.pedal,
    pedalLParent: crankL.pivot,
    pedalR: crankR.pedal,
    pedalRParent: crankR.pivot,
    handlebar: handlebar,
    basket: basket,
    lampFace: lampFace,
    beam: beam,
    wheelBase: wheelBase,
    setLamp: function (v) { kit.mat.lampGlow.opacity = Math.max(kit.mat.lampGlow.opacity, v); },
  };
}
