// The display stand: a cut slab of ground (asphalt / gravel / soil) on a walnut plinth with a brass plate,
// sitting in a seamless photo-studio backdrop.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene, world } from '../core/stage.js';
import { mat, faceUV, box } from '../core/helpers.js';
import { asphaltMat } from '../core/materials.js';
import { strataTex, walnutTex, contactShadowTex } from '../textures/surfaces.js';
import { brassPlateTex } from '../textures/signage.js';
import { PLINTH } from './layout.js';

const W = PLINTH.x1 - PLINTH.x0, D = PLINTH.z1 - PLINTH.z0;
const SLAB = 1.6;          // ground cross-section thickness
const BASE_H = 1.9;        // walnut plinth height
const RIM = 1.3;           // walnut border around the slab
export const FLOOR_Y = -SLAB - BASE_H;

// --- ground slab with strata on its cut faces ---
{
  const geo = new THREE.BoxGeometry(W, SLAB, D);
  faceUV(geo, 2, W / 7, D / 7);
  const sideLong = mat('#ffffff', { map: strataTex.clone(), roughness: 0.95 });
  sideLong.map.repeat.set(W / 14, 1); sideLong.map.needsUpdate = true;
  const sideShort = mat('#ffffff', { map: strataTex.clone(), roughness: 0.95 });
  sideShort.map.repeat.set(D / 14, 1); sideShort.map.needsUpdate = true;
  const under = mat('#5a4535');
  const slab = new THREE.Mesh(geo, [sideShort, sideShort, asphaltMat, under, sideLong, sideLong]);
  slab.position.y = -SLAB / 2;
  slab.receiveShadow = true;
  slab.castShadow = true;
  world.add(slab);
}

// --- walnut plinth ---
const walnut = mat('#ffffff', { map: walnutTex, roughness: 0.45, metalness: 0.0 });
walnutTex.repeat.set(2, 1);
{
  const FOOT = 0.28, topH = BASE_H - FOOT;
  const top = new THREE.Mesh(new RoundedBoxGeometry(W + RIM * 2, topH, D + RIM * 2, 4, 0.32), walnut);
  top.position.y = -SLAB - topH / 2;
  top.castShadow = top.receiveShadow = true;
  world.add(top);
  // a slightly inset dark foot gives the plinth a lifted, cabinet-made silhouette
  box(world, W + RIM * 2 - 0.8, FOOT, D + RIM * 2 - 0.8, mat('#3b281c', { roughness: 0.6 }), 0, FLOOR_Y, 0, { r: 0.1 });

  const plate = new THREE.Mesh(new RoundedBoxGeometry(13, 0.95, 0.08, 2, 0.03),
    [mat('#b48d4c', { metalness: 0.9, roughness: 0.35 }), mat('#b48d4c', { metalness: 0.9, roughness: 0.35 }),
      mat('#b48d4c', { metalness: 0.9, roughness: 0.35 }), mat('#b48d4c', { metalness: 0.9, roughness: 0.35 }),
      mat('#ffffff', { map: brassPlateTex, metalness: 0.75, roughness: 0.32 }), mat('#b48d4c')]);
  plate.position.set(0, -SLAB - topH / 2, PLINTH.z1 + RIM + 0.04);
  plate.castShadow = true;
  world.add(plate);
}

// --- studio: seamless backdrop + shadow-catching floor + soft contact shadow ---
export const backdropMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFloor: { value: new THREE.Color() },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: /* glsl */`
    uniform vec3 uTop, uHorizon, uFloor; varying vec3 vDir;
    void main() {
      float h = vDir.y;
      vec3 wall = mix(uHorizon, uTop, smoothstep(0.0, 0.7, h));
      vec3 col = mix(uFloor, wall, smoothstep(-0.18, 0.08, h));
      // a gentle light pool on the floor, centred under the model
      float pool = smoothstep(-0.05, -0.6, h) * 0.06;
      gl_FragColor = vec4(col * (1.0 + pool), 1.0);
    }`,
});
const backdrop = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), backdropMat);
backdrop.frustumCulled = false;
backdrop.renderOrder = -100;
scene.add(backdrop);

export const floorShadowMat = new THREE.ShadowMaterial({ opacity: 0.2, transparent: true });
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorShadowMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
}
export const contactMat = new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false, opacity: 0.5 });
{
  const c = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.45, D * 1.5), contactMat);
  c.rotation.x = -Math.PI / 2;
  c.position.y = FLOOR_Y + 0.01;
  c.renderOrder = -1;
  scene.add(c);
}
