/* 在真实 three.js r128 上验证贴图工厂的 API 用法（encoding / wrapS / anisotropy）。 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../../..');
const code = readFileSync(path.join(root, 'assets/vendor/three/r128/three.min.js'), 'utf8');
const sandbox = { window: {}, document: undefined, navigator: undefined, self: {}, console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'three.min.js' });
const THREE = sandbox.THREE || (sandbox.self && sandbox.self.THREE);
console.log('REVISION', THREE.REVISION);
console.log('sRGBEncoding', THREE.sRGBEncoding, 'RepeatWrapping', THREE.RepeatWrapping, 'ClampToEdgeWrapping', THREE.ClampToEdgeWrapping);
const t = new THREE.CanvasTexture({ width: 4, height: 4 });
t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
console.log('CanvasTexture ok → encoding=' + t.encoding + ' wrapS=' + t.wrapS + ' anisotropy=' + t.anisotropy);
