// Rain inside the model's volume (like a snow globe) and the splashes where it lands. Both run on the GPU.
// Built after all mods load, so drops stop on whatever roofs the mods registered.
import * as THREE from 'three';
import type { Surfaces, Rect } from '../engine/surfaces';
import { R } from '../engine/kit/rng';

const RAIN_N = 10000, RAIN_H = 24;

export class Rain {
  readonly lines: THREE.LineSegments;
  readonly splashes: THREE.Points;
  private rainMat: THREE.ShaderMaterial;
  private splashMat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, surfaces: Surfaces, bounds: Rect, pixelRatio: number) {
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uH: { value: RAIN_H }, uWind: { value: new THREE.Vector2(0.12, 0.06) }, uLen: { value: 0.9 },
        uColor: { value: new THREE.Color('#c9d6ea') }, uOpacity: { value: 0 }, uDensity: { value: 1 },
      },
      vertexShader: /* glsl */`
        uniform float uTime, uH, uLen, uDensity; uniform vec2 uWind;
        attribute float aTip, aSpeed, aFloor, aRand;
        varying float vA;
        void main() {
          float y = mod(position.y - uTime * aSpeed, uH);
          vec3 p = vec3(position.x + uWind.x * y, y, position.z + uWind.y * y);
          p += aTip * uLen * vec3(uWind.x, 1.0, uWind.y);
          vA = (1.0 - aTip * 0.9) * step(aFloor, y) * smoothstep(uH, uH - 6.0, y) * step(aRand, uDensity);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA * uOpacity); }`,
    });
    const pos = new Float32Array(RAIN_N * 6), tip = new Float32Array(RAIN_N * 2), spd = new Float32Array(RAIN_N * 2), flr = new Float32Array(RAIN_N * 2), rnd = new Float32Array(RAIN_N * 2);
    for (let i = 0; i < RAIN_N; i++) {
      const x = R(bounds.x0, bounds.x1), z = R(bounds.z0, bounds.z1), y = R(0, RAIN_H), s = R(17, 23), f = surfaces.topAt(x, z);
      const q = Math.random();
      for (let k = 0; k < 2; k++) { const j = i * 2 + k; pos.set([x, y, z], j * 3); tip[j] = k; spd[j] = s; flr[j] = f; rnd[j] = q; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    g.setAttribute('aFloor', new THREE.BufferAttribute(flr, 1));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this.lines = new THREE.LineSegments(g, this.rainMat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    this.splashMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: pixelRatio }, uColor: { value: new THREE.Color('#e0e9f6') } },
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
    const N = 4000;
    const sp = new Float32Array(N * 3), ph = new Float32Array(N), rt = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = R(bounds.x0, bounds.x1), z = R(bounds.z0, bounds.z1);
      sp.set([x, surfaces.topAt(x, z) + 0.03, z], i * 3); ph[i] = Math.random(); rt[i] = R(1.2, 2.4);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    sg.setAttribute('aRate', new THREE.BufferAttribute(rt, 1));
    this.splashes = new THREE.Points(sg, this.splashMat);
    this.splashes.frustumCulled = false;
    scene.add(this.splashes);
  }

  /** rain 0–1 sets both how many drops fall and how visible they are; wind slants them. */
  update(t: number, rain: number, wind: number) {
    const u = this.rainMat.uniforms;
    u.uTime.value = t;
    u.uDensity.value = Math.min(1, rain * 1.1);
    u.uOpacity.value = rain > 0.02 ? 0.12 + rain * 0.1 : 0;
    u.uWind.value.set(0.06 + wind * 0.32, 0.03 + wind * 0.12);
    u.uLen.value = 0.7 + rain * 0.4;
    this.splashMat.uniforms.uTime.value = t;
    this.splashMat.uniforms.uOpacity.value = rain * 0.5;
    this.lines.visible = this.splashes.visible = rain > 0.02;
  }
  setPixelRatio(pr: number) { this.splashMat.uniforms.uPR.value = pr; }
}
