// Global and practical lights. Their intensities are driven by the mode state.
import * as THREE from 'three';
import { scene } from '../core/stage.js';

export const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
scene.add(hemi);

export const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

export const interiorLights = [[-3.2, 2.45, -6.5], [4.6, 2.45, -6.5], [1, 2.45, -3.2]].map(([x, y, z]) => {
  const l = new THREE.PointLight('#f6f8ff', 10, 0, 2);
  l.position.set(x, y, z);
  scene.add(l);
  return l;
});

export const awningLight = new THREE.PointLight('#fff1dc', 0, 0, 1.8);
awningLight.position.set(1.5, 2.3, 0.4);
scene.add(awningLight);

export const vendLight = new THREE.PointLight('#d6eaff', 0, 8, 2);
vendLight.position.set(-10, 1.2, -0.3);
scene.add(vendLight);
