// Rain inside the model's volume (like a snow globe) and the tiny splashes where it lands. Both run on the GPU.
import * as THREE from 'three';
import { scene, renderer } from '../core/stage.js';
import { rr, rand } from '../core/rng.js';
import { floorAt, PLINTH } from '../world/layout.js';

const RAIN_N = 14000, RAIN_H = 24;

export const rainMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: { value: 0 }, uH: { value: RAIN_H }, uWind: { value: new THREE.Vector2(0.12, 0.06) }, uLen: { value: 0.9 },
    uColor: { value: new THREE.Color('#c9d6ea') }, uOpacity: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform float uTime, uH, uLen; uniform vec2 uWind;
    attribute float aTip, aSpeed, aFloor;
    varying float vA;
    void main() {
      float y = mod(position.y - uTime * aSpeed, uH);
      vec3 p = vec3(position.x + uWind.x * y, y, position.z + uWind.y * y);
      p += aTip * uLen * vec3(uWind.x, 1.0, uWind.y);
      vA = (1.0 - aTip * 0.9) * step(aFloor, y) * smoothstep(uH, uH - 6.0, y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor; uniform float uOpacity; varying float vA;
    void main() { gl_FragColor = vec4(uColor, vA * uOpacity); }`,
});

export const rain = (() => {
  const pos = new Float32Array(RAIN_N * 6), tip = new Float32Array(RAIN_N * 2), spd = new Float32Array(RAIN_N * 2), flr = new Float32Array(RAIN_N * 2);
  for (let i = 0; i < RAIN_N; i++) {
    const x = rr(PLINTH.x0, PLINTH.x1), z = rr(PLINTH.z0, PLINTH.z1), y = rr(0, RAIN_H), s = rr(17, 23), f = floorAt(x, z);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.set([x, y, z], j * 3); tip[j] = k; spd[j] = s; flr[j] = f;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  geo.setAttribute('aFloor', new THREE.BufferAttribute(flr, 1));
  const l = new THREE.LineSegments(geo, rainMat);
  l.frustumCulled = false;
  return l;
})();
scene.add(rain);

export const splashMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color('#e0e9f6') } },
  vertexShader: /* glsl */`
    uniform float uTime, uPR; attribute float aPhase, aRate; varying float vT;
    void main() {
      vT = fract(uTime * aRate + aPhase);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = (0.6 + vT * 2.2) * uPR * (60.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor; uniform float uOpacity; varying float vT;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float ring = smoothstep(0.35, 0.0, abs(d - 0.65)) + smoothstep(0.5, 0.0, d) * 0.6;
      float a = ring * (1.0 - smoothstep(0.0, 0.3, vT)) * uOpacity;
      if (a < 0.01) discard;
      gl_FragColor = vec4(uColor, a);
    }`,
});
export const splashes = (() => {
  const N = 4000;
  const pos = new Float32Array(N * 3), ph = new Float32Array(N), rt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = rr(PLINTH.x0, PLINTH.x1), z = rr(PLINTH.z0, PLINTH.z1);
    pos.set([x, floorAt(x, z) + 0.03, z], i * 3); ph[i] = rand(); rt[i] = rr(1.2, 2.4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aRate', new THREE.BufferAttribute(rt, 1));
  const p = new THREE.Points(geo, splashMat);
  p.frustumCulled = false;
  return p;
})();
scene.add(splashes);
