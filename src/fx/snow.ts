// Snow: soft flakes drifting down inside the model's volume (GPU-animated), and snow cover that settles on
// every upward-facing surface open to the sky — roofs, roads, hedges, the sakura — but not under awnings.
import * as THREE from 'three';
import type { Surfaces, Rect } from '../engine/surfaces';
import { R } from '../engine/kit/rng';

const FLAKES = 7000, H = 22;

export class Snowfall {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, surfaces: Surfaces, b: Rect, pixelRatio: number) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uH: { value: H }, uWind: { value: 0 }, uAmount: { value: 0 }, uPR: { value: pixelRatio } },
      vertexShader: /* glsl */`
        uniform float uTime, uH, uWind, uAmount, uPR;
        attribute float aSpeed, aPhase, aFloor, aRand, aSize;
        varying float vA;
        void main() {
          float y = mod(position.y - uTime * aSpeed, uH);
          vec3 p = vec3(position.x + sin(uTime * 0.8 + aPhase) * 0.35 + uWind * y * 0.35,
                        y,
                        position.z + cos(uTime * 0.6 + aPhase * 1.3) * 0.3 + uWind * y * 0.12);
          vA = step(aFloor, y) * smoothstep(uH, uH - 4.0, y) * step(aRand, uAmount * 1.1);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * uPR * (70.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uAmount; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.35, d) * vA * min(1.0, 0.35 + uAmount);
          if (a < 0.02) discard;
          gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a * 0.9);
        }`,
    });
    const pos = new Float32Array(FLAKES * 3), spd = new Float32Array(FLAKES), ph = new Float32Array(FLAKES),
      flr = new Float32Array(FLAKES), rnd = new Float32Array(FLAKES), size = new Float32Array(FLAKES);
    for (let i = 0; i < FLAKES; i++) {
      const x = R(b.x0, b.x1), z = R(b.z0, b.z1);
      pos.set([x, R(0, H), z], i * 3);
      spd[i] = R(0.7, 1.4); ph[i] = R(0, 6.28); flr[i] = surfaces.topAt(x, z); rnd[i] = Math.random(); size[i] = R(1.6, 3.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aFloor', new THREE.BufferAttribute(flr, 1));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(t: number, snow: number, wind: number) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uAmount.value = snow;
    u.uWind.value = wind;
    this.points.visible = snow > 0.02;
  }
  setPixelRatio(pr: number) { this.mat.uniforms.uPR.value = pr; }
}

/**
 * Snow cover. Every opaque standard material in the model gets a small shader patch that whitens
 * upward-facing surfaces — but only where nothing is above them, which a top-down height map tells us.
 */
export class SnowCover {
  readonly uniforms = {
    uSnowCover: { value: 0 },
    uSkyMap: { value: null as THREE.Texture | null },
    uSkyVP: { value: new THREE.Matrix4() },
  };
  private patched = new WeakSet<THREE.Material>();
  private target: THREE.WebGLRenderTarget | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private bounds: Rect) {}

  /** Patch every eligible material under `root` (objects flagged userData.noSnow are skipped). */
  patchTree(root: THREE.Object3D) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.noSnow) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) this.patch(m);
    });
  }

  patch(m: THREE.Material) {
    if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent || this.patched.has(m)) return;
    this.patched.add(m);
    const uniforms = this.uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSnowW;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 snowW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            snowW = instanceMatrix * snowW;
          #endif
          vSnowW = (modelMatrix * snowW).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSnowCover; uniform sampler2D uSkyMap; uniform mat4 uSkyVP; varying vec3 vSnowW;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (uSnowCover > 0.001) {
            float up = (vec4(normal, 0.0) * viewMatrix).y;                 // world-space "facing the sky"
            vec4 sp = uSkyVP * vec4(vSnowW, 1.0);
            float sky = texture2D(uSkyMap, sp.xy / sp.w * 0.5 + 0.5).r;   // highest surface above this spot
            float open = step(sky - 0.15, vSnowW.y);
            float n = fract(sin(dot(floor(vSnowW.xz * 5.0), vec2(12.9898, 78.233))) * 43758.5453);
            float amt = smoothstep(0.45, 0.8, up) * open * smoothstep(0.0, 0.3, uSnowCover * 1.35 - n * 0.35);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), amt);
            roughnessFactor = mix(roughnessFactor, 0.85, amt);
            metalnessFactor = mix(metalnessFactor, 0.0, amt);
          }`);
    };
    m.customProgramCacheKey = () => 'snow-cover';
    m.needsUpdate = true;
  }

  /** Render the highest surface at every (x, z) from straight above. Called once the model is built. */
  bake(scene: THREE.Scene, include: THREE.Object3D) {
    const b = this.bounds, W = b.x1 - b.x0, D = b.z1 - b.z0;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(512, Math.round((512 * D) / W), { type: THREE.HalfFloatType });
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 1, 200);
    cam.position.set((b.x0 + b.x1) / 2, 100, (b.z0 + b.z1) / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    cam.updateMatrixWorld();
    const heightMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying float vY;
        void main() {
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 w = modelMatrix * p;
          vY = w.y;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `varying float vY; void main() { gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }`,
    });
    // only the model itself, minus things that move or shouldn't block the sky
    const hidden: THREE.Object3D[] = [];
    for (const c of scene.children) if (c !== include && c.visible) { c.visible = false; hidden.push(c); }
    include.traverse((o) => {
      const ob = o as THREE.Object3D & { isPoints?: boolean; isLine?: boolean };
      if (o.visible && (o.userData.skyIgnore || ob.isPoints || ob.isLine)) { o.visible = false; hidden.push(o); }
    });
    const r = this.renderer, prevTarget = r.getRenderTarget(), prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    scene.overrideMaterial = heightMat;
    r.setRenderTarget(this.target);
    r.setClearColor(new THREE.Color(-1000, 0, 0), 1);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    scene.overrideMaterial = null;
    for (const o of hidden) o.visible = true;
    heightMat.dispose();
    this.uniforms.uSkyMap.value = this.target.texture;
    this.uniforms.uSkyVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }
}
