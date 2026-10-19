// Wet ground: one planar reflection shared by puddles (sharp, rippling) and a faint streaky sheen over
// every outdoor surface; plus "wetable" materials that darken and turn glossy. Mods add puddles and sheen.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { Rect } from '../engine/surfaces';

interface WetMat { mat: THREE.MeshStandardMaterial; color: THREE.Color; rough: number }

export class Wet {
  readonly group = new THREE.Group();
  readonly reflector: Reflector;
  private puddleMat: THREE.ShaderMaterial;
  private sheenMat: THREE.ShaderMaterial;
  private uniforms = { uTime: { value: 0 }, uRain: { value: 0 } };
  private mats: WetMat[] = [];

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private envMap: THREE.Texture, bounds: Rect, private hide: () => THREE.Object3D[]) {
    const [w, h] = this.reflSize();
    this.reflector = new Reflector(new THREE.PlaneGeometry(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0), { textureWidth: w, textureHeight: h, clipBias: 0.003, multisample: 0 });
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.set((bounds.x0 + bounds.x1) / 2, 0.09, (bounds.z0 + bounds.z1) / 2);
    const rm = this.reflector.material as THREE.ShaderMaterial;
    rm.colorWrite = false;   // it only drives the render-to-texture; puddles do the drawing
    rm.depthWrite = false;
    this.reflector.renderOrder = -10;
    scene.add(this.reflector, this.group);
    this.reflector.updateMatrixWorld();
    const reflInv = this.reflector.matrixWorld.clone().invert();
    // keep the wet layer and the rain out of their own reflection
    const orig = this.reflector.onBeforeRender;
    this.reflector.onBeforeRender = (...args) => {
      const objs = [this.group, ...this.hide()], vis = objs.map((o) => o.visible);
      objs.forEach((o) => (o.visible = false));
      orig.apply(this.reflector, args);
      objs.forEach((o, i) => (o.visible = vis[i]));
    };
    const make = (puddle: boolean) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      // puddles: the reflection added on top of the ground, which they only darken a little (src·1 + dst·(1−a)) —
      // laid over it like paint, a puddle reflecting the night sky was a black hole in the road
      blending: puddle ? THREE.CustomBlending : THREE.AdditiveBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      defines: puddle ? { PUDDLE: 1 } : {},
      uniforms: {
        ...this.uniforms,
        tRefl: { value: this.reflector.getRenderTarget().texture },
        textureMatrix: { value: rm.uniforms.textureMatrix.value },
        uReflInv: { value: reflInv },
        uStrength: { value: 0 },
        uTint: { value: new THREE.Color(puddle ? '#c6cfdb' : '#d8dee8') },
        uRing: { value: new THREE.Color('#e2eaf7') },
      },
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix, uReflInv;
        varying vec4 vUv; varying vec2 vW; varying float vEdge;
        #ifdef PUDDLE
        attribute float aEdge;
        #endif
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xz;
          #ifdef PUDDLE
          vEdge = aEdge;
          #else
          vEdge = 0.0;
          #endif
          vUv = textureMatrix * uReflInv * w;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tRefl; uniform float uTime, uRain, uStrength; uniform vec3 uTint, uRing;
        varying vec4 vUv; varying vec2 vW; varying float vEdge;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float layer(vec2 uv, float t) {
          vec2 id = floor(uv); float acc = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = id + vec2(float(i), float(j));
            float h = h21(c);
            vec2 ctr = c + 0.2 + 0.6 * vec2(h21(c + 3.7), h21(c + 9.1));
            float ph = fract(t * 0.9 + h);
            float d = length(uv - ctr);
            acc += smoothstep(0.035 + ph * 0.02, 0.0, abs(d - ph * 0.75)) * (1.0 - ph) * (1.0 - ph);
          }
          return acc;
        }
        void main() {
          vec2 uv = vW * 1.7;
          float rip = layer(uv, uTime) + 0.8 * layer(uv * 1.43 + 5.1, uTime * 1.17 + 0.5);
          rip = clamp(rip, 0.0, 1.0) * uRain;
          vec4 p = vUv;
          #ifdef PUDDLE
            p.xy += vec2(rip * 0.01, rip * 0.006) * p.w;
            vec3 refl = texture2DProj(tRefl, p).rgb;
            float a = uStrength * smoothstep(1.0, 0.7, vEdge);
            gl_FragColor = vec4((refl * uTint * 0.6 + uRing * rip * 0.16) * a, a * 0.4);
          #else
            // smeared into a vertical streak, as wet asphalt does. A few taps at fixed offsets drew a small bright
            // light as a ladder of separate dots: the taps are jittered per pixel, so they blur into one streak
            vec3 refl = vec3(0.0); float tw = 0.0;
            float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            for (int k = 0; k < 14; k++) {
              float o = ((float(k) + j) / 14.0) * 2.0 - 1.0;
              float wk = 1.0 - abs(o) * 0.85;
              vec4 q = p; q.y += o * 0.056 * p.w; q.x += o * 0.008 * p.w;
              refl += texture2DProj(tRefl, q).rgb * wk; tw += wk;
            }
            refl /= tw;
            gl_FragColor = vec4((refl * uTint + uRing * rip * 0.05) * uStrength, 1.0);
          #endif
        }`,
    });
    this.puddleMat = make(true);
    this.sheenMat = make(false);
  }

  private reflSize(): [number, number] {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return [Math.round(s.x * 0.5), Math.round(s.y * 0.5)];
  }

  /** Darken and gloss a material as the ground gets wet. */
  wetable<M extends THREE.MeshStandardMaterial>(mat: M): M {
    this.mats.push({ mat, color: mat.color.clone(), rough: mat.roughness });
    mat.envMap = this.envMap;
    mat.envMapIntensity = 0;
    return mat;
  }

  /** An irregular puddle centred at (x, z) on a surface of height y. */
  addPuddle(x: number, z: number, y: number, r: number, sx = 1, sz = 1, seed = Math.random() * 1000) {
    const N = 44, pos = [0, 0, 0], edge = [0], idx: number[] = [];
    const p1 = (seed * 1.3) % 6, p2 = (seed * 2.7) % 6, p3 = (seed * 4.1) % 6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const k = r * (1 + 0.22 * Math.sin(3 * a + p1) + 0.12 * Math.sin(5 * a + p2) + 0.06 * Math.sin(9 * a + p3));
      pos.push(Math.cos(a) * k * sx, 0, Math.sin(a) * k * sz);
      edge.push(1);
      idx.push(0, 1 + i, 1 + ((i + 1) % N));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, this.puddleMat);
    m.position.set(x, y + 0.016, z);
    this.group.add(m);
    return m;
  }

  /** A reflective sheen over a flat outdoor surface at height y. */
  addSheen(r: Rect, y: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), this.sheenMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, y + 0.006, (r.z0 + r.z1) / 2);
    this.group.add(m);
    return m;
  }

  update(t: number, rain: number, wet: number) {
    this.uniforms.uTime.value = t;
    this.uniforms.uRain.value = rain;
    const pw = THREE.MathUtils.smoothstep(wet, 0.3, 1);
    this.puddleMat.uniforms.uStrength.value = pw * 0.95;
    this.sheenMat.uniforms.uStrength.value = pw * 0.55;
    this.group.visible = this.reflector.visible = pw > 0.01;
    for (const w of this.mats) {
      w.mat.roughness = THREE.MathUtils.lerp(w.rough, Math.min(w.rough, 0.3), wet);
      w.mat.color.copy(w.color).multiplyScalar(1 - 0.45 * wet);
      w.mat.envMapIntensity = wet * 0.35;
    }
  }

  resize() { this.reflector.getRenderTarget().setSize(...this.reflSize()); }
}
