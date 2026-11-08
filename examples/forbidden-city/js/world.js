/* 3D 故宫游览 · js/world.js —— 场景装配（天空 / 雾 / 地面 / 光照 + 挂入 buildings）
 * 职责：创建 scene、camera、灯光、地面，并把 layout+parts+buildings 装配出的模型挂进场景。
 * 说明：本模块可以碰 THREE（由 main.js 传入已探测过的 THREE 全局），但 document 只在浏览器路径里用。
 */
'use strict';

import { CITY, RENDER, AXES } from './config.js';
import { buildTextureKit } from './textures.js';
import { buildAll } from './buildings.js';

/**
 * @param {object} THREE three.js r128 全局
 * @param {{quality?:string}} opts quality 档位决定构件密度（低档少斗拱/走兽）
 * @returns {{scene,camera,sun,hemi,ground,setFogFar,kit,entries,rebuild}}
 */
export function buildWorld(THREE, opts = {}) {
  const scene = new THREE.Scene();

  // 雾：远景收拢，掩盖 LOD 边界 + 让城墙/角楼有层次（fogFar 由 quality.js 联动）
  scene.fog = new THREE.Fog(0xdfe7ef, RENDER.fogNear, RENDER.fogFar);

  const camera = new THREE.PerspectiveCamera(RENDER.fovDesktop, 1, RENDER.near, RENDER.far);
  // 机位：午门以南 120 m（AXES.wumen = -340，向南为 z 增大 → -220），高度 24 m。
  // 只摆位置、不做 lookAt：main.js / 玩家控制器用 YXZ 欧拉角驱动机位，若在此留 lookAt
  // 的残留旋转（order 默认 XYZ，z 分量 ≈ π），会与运行时的 rotation.set() 叠加成翻滚。
  camera.position.set(60, RENDER.eyeY || 24, AXES.wumen + 120);

  // 太阳：坐北朝南的暖光（下午偏西），只有一盏投影灯，阴影范围由 quality.js 给
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.05);
  sun.position.set(-180, 260, -40);
  sun.castShadow = false;                 // quality.apply() 里按档开启
  sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 900;
  scene.add(sun);
  scene.add(sun.target);

  // 半球光：天光 + 地面反弹，保证阴影面不死黑
  const hemi = new THREE.HemisphereLight(0xbcd6f2, 0x8a7a63, 0.55);
  scene.add(hemi);

  // 贴图/材质 kit：maxAnisotropy 由 main.js 按 renderer.capabilities 传入（≤ TEX.maxAnisotropy）
  const kit = buildTextureKit(THREE, { maxAnisotropy: opts.maxAnisotropy || 1 });

  // 天穹球：T17 的垂直渐变包在大球内侧（scene.background 用贴图会拉伸，故用几何体贴图）。
  // 相机在球心附近，只能看到三角面的内表面 → side 必须 BackSide；r128 的 FrontFace 判定是
  // 「投影面积 > 0」而非叉积符号，所以不能靠 scale(-1) 反翻（实测行列式仍为 +1）。
  // 半径写死 2400：俯瞰机位离地 ~1.1 km，天穹球必须包住最远的机位，否则它会缩成画面里的一块黑。
  const domeGeo = new THREE.SphereGeometry(2400, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({ map: kit.tex.skyGradient, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'dome';
  scene.add(dome);

  const ground = makeGround(THREE, kit);
  scene.add(ground.mesh);

  // 建筑总装（阶段 4 起按档位重建）
  let built = null;
  function rebuild(quality) {
    if (built && built.group.parent) built.group.parent.remove(built.group);
    built = buildAll(THREE, kit, { quality: quality || opts.quality || 'mid' });
    setShadows(built.group, true);
    scene.add(built.group);
    return built;
  }
  rebuild(opts.quality || 'mid');

  return {
    scene: scene,
    camera: camera,
    sun: sun,
    hemi: hemi,
    ground: ground,
    kit: kit,
    get built() { return built; },
    get entries() { return built.entries; },
    rebuild: rebuild,
    dome: dome,
    setFogFar: function (far) { if (scene.fog) scene.fog.far = far; },
  };
}

/** 投影标记：屋顶/地面只接收阴影，其余可投影；低档由 quality.js 关 shadowMap 即整体免影。 */
function setShadows(root, on) {
  if (!root || !root.traverse) return;
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const onlyReceive = /ground|strip/i.test(o.name || '');
    o.castShadow = on && !onlyReceive;
    o.receiveShadow = on;
  });
}

/** 地面：大平面 + 中轴石板带；贴图按 T05/T06 铺，repeat 由世界尺度换算。 */
function makeGround(THREE, kit) {
  const geo = new THREE.PlaneGeometry(CITY.lenE * 2.2, CITY.lenN * 2.6, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9a98f, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground';
  // PlaneGeometry 默认法线 +Z；绕 X 转 -90°（θ = -π/2）后：几何体 (0,1,0) → 世界 (0,0,+1)，
  // 即局部 +Y 轴落在世界 +Z（南），且正面朝上（+Y）。贴图 U/V 因此对应世界 X/+Z。
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;

  // ⚠️ 地面**永远不挪**：main.js 的「视点跟随」只作用于 chunk 化之后的地形（阶段 4）。
  // 这块平面是宫城的两倍多，一旦跟视点平移，整座城就会跟着镜头跑（见 PROGRESS.md D21）。

  // 中轴石板带（纯视觉引导，不参与碰撞）
  const stripGeo = new THREE.PlaneGeometry(14, CITY.lenN * 1.35, 1, 1);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.name = 'strip';
  // 与地面同一口径：绕 X 转 -90° 后局部 +Y 落在世界 +Z（南）；平面中心对称，故中点直接取
  // (wumen + shenwumen)/2 = -37.5，石板带正好横跨午门→神武门。
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.02, (AXES.wumen + AXES.shenwumen) / 2);
  mesh.add(strip);

  // 贴图按需点亮：地面砖（goldBrick）铺满整个广场，repeat 与米制换算一致
  const t = kit.tex.goldBrick;
  if (t) {
    t.repeat.set(160, 200);
    mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
  }

  return { mesh: mesh, strip: strip };
}
