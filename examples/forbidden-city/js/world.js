/* 3D 故宫游览 · js/world.js —— 场景装配（阶段 1：天空 / 雾 / 地面 / 光照）
 * 职责：创建 scene、camera、灯光、占位地面；后续阶段把 buildings.js 的模型挂进来。
 * 说明：本模块可以碰 THREE（由 main.js 传入已探测过的 THREE 全局），但不碰 document。
 */
'use strict';

import { CITY, RENDER, AXES } from './config.js';

/**
 * @param {object} THREE three.js r128 全局
 * @returns {{scene:object,camera:object,sun:object,hemi:object,ground:object,setFogFar:Function}}
 */
export function buildWorld(THREE) {
  const scene = new THREE.Scene();

  // 雾：远景收拢，掩盖 LOD 边界 + 让城墙/角楼有层次（fogFar 由 quality.js 联动）
  scene.fog = new THREE.Fog(0xdfe7ef, RENDER.fogNear, RENDER.fogFar);
  scene.background = makeSkyTexture(THREE);

  const camera = new THREE.PerspectiveCamera(RENDER.fovDesktop, 1, RENDER.near, RENDER.far);
  camera.position.set(60, RENDER.eyeY || 24, AXES.wumen - 120);
  camera.lookAt(0, 12, AXES.taihe);

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

  const ground = makeGround(THREE);
  scene.add(ground.mesh);

  return {
    scene: scene,
    camera: camera,
    sun: sun,
    hemi: hemi,
    ground: ground,
    setFogFar: function (far) { if (scene.fog) scene.fog.far = far; },
  };
}

/** 天穹：程序化垂直渐变贴图包在球上（替代 Sky.js，见 docs/assets.md T17）。 */
function makeSkyTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#4f7fc4');   // 天顶
  grad.addColorStop(0.42, '#9dc0e4');
  grad.addColorStop(0.62, '#dfe7ef');   // 地平线（与 fog 同色，衔接不露缝）
  grad.addColorStop(1.00, '#cfd8de');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** 占位地面：大平面 + 中轴引导线，阶段 4 起由 world 的地形/铺地替换。 */
function makeGround(THREE) {
  const geo = new THREE.PlaneGeometry(CITY.lenE * 2.2, CITY.lenN * 2.6, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9a98f, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;

  // 中轴石板带（纯视觉引导，不参与碰撞）
  const stripGeo = new THREE.PlaneGeometry(14, CITY.lenN * 1.35, 1, 1);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.02, (AXES.shenwumen + AXES.wumen) / 2);
  mesh.add(strip);

  return { mesh: mesh, strip: strip };
}
