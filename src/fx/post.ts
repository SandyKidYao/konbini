// Post stack: ambient occlusion → bloom → [mod passes] → tilt-shift (miniature depth of field) → colour grade → output.
// Colours stay premultiplied by alpha all the way through, so the same stack works over a transparent window.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import type { Look } from '../engine/atmosphere';

const FULLSCREEN_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Sharp from 0.44 to 0.66 of the screen height (from the bottom): the orbit target sits at 0.5, and from the overview
// camera the car park, the shop front and the shop's roof (up to 0.66–0.71) stay in focus
const tiltShader = {
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uAmount: { value: 16 }, uFocus: { value: 0.55 }, uBand: { value: 0.11 } },
  vertexShader: FULLSCREEN_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uAmount, uFocus, uBand; varying vec2 vUv;
    void main() {
      float d = smoothstep(0.0, 0.5, max(0.0, abs(vUv.y - uFocus) - uBand));
      vec2 o = uDir * d * uAmount;
      vec4 sum = vec4(0.0); float tw = 0.0;
      for (int i = -6; i <= 6; i++) {
        float x = float(i) / 6.0;
        float w = exp(-x * x * 2.2);
        sum += texture2D(tDiffuse, vUv + o * x) * w; tw += w;
      }
      gl_FragColor = sum / tw;
    }`,
};

const gradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: FULLSCREEN_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat, uContrast; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSat) * uTint;
      // pivot scaled by coverage (premultiplied colour). Opaque pages carry alpha ≥ 1 here (stock bloom adds to it),
      // so clamp: there it stays exactly 0.18
      float a = clamp(c.a, 0.0, 1.0);
      col = max(vec3(0.0), (col - 0.18 * a) * uContrast + 0.18 * a);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  readonly gtao: GTAOPass;
  readonly bloom: UnrealBloomPass;
  private tilt: { pass: ShaderPass; axis: 'h' | 'v' }[] = [];
  private grade: ShaderPass;
  private output = new OutputPass();
  private custom: { pass: Pass; order: number }[] = [];

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, transparent = false) {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, s.x, s.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.4, scale: 1.0, samples: 16, distanceFallOff: 1.0 });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.4, 0.9);
    if (transparent) { carryBloomAlpha(this.bloom); unpremultiplyOutput(this.output); }
    for (let i = 0; i < 2; i++) for (const axis of ['h', 'v'] as const) this.tilt.push({ pass: new ShaderPass(tiltShader), axis });
    this.grade = new ShaderPass(gradeShader);
    this.rebuild();
    this.setTexel();
  }

  /** Insert a mod's pass. order: 0–100 runs between bloom and tilt-shift (default 50). */
  addPass(pass: Pass, order = 50) {
    this.custom.push({ pass, order });
    this.custom.sort((a, b) => a.order - b.order);
    this.rebuild();
  }

  private rebuild() {
    const c = this.composer;
    const keep = c.passes[0];
    c.passes.length = 0;
    c.addPass(keep);
    c.addPass(this.gtao);
    c.addPass(this.bloom);
    for (const p of this.custom) c.addPass(p.pass);
    for (const p of this.tilt) c.addPass(p.pass);
    c.addPass(this.grade);
    c.addPass(this.output);
  }

  private setTexel() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const p of this.tilt) p.pass.uniforms.uDir.value.set(p.axis === 'h' ? 1 / s.x : 0, p.axis === 'v' ? 1 / s.y : 0);
  }

  apply(look: Look) {
    this.gtao.blendIntensity = look.ao;
    this.bloom.strength = look.bloom;
    this.bloom.threshold = look.bloomThr;
    this.bloom.radius = look.bloomRad;
    const px = look.tilt * 9 * this.renderer.getPixelRatio();
    for (const p of this.tilt) p.pass.uniforms.uAmount.value = px;
    this.grade.uniforms.uSat.value = look.sat;
    this.grade.uniforms.uContrast.value = look.contrast;
    this.grade.uniforms.uTint.value.copy(look.grade);
  }

  resize() {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.setTexel();
  }

  render() { this.composer.render(); }
}

/**
 * Stock UnrealBloomPass blurs only rgb and writes alpha 1, which would fog the whole transparent window.
 * Blur alpha with the colour instead, and add the glow premultiplied, so it fades out around lit things.
 */
function carryBloomAlpha(bloom: UnrealBloomPass) {
  for (const m of bloom.separableBlurMaterials) {
    m.fragmentShader = m.fragmentShader
      .replace('vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb', 'vec4 diffuseSum = texture2D( colorTexture, vUv )')
      .replace(/vec3 (sample[12]) = texture2D\( colorTexture, (vUv [+-] uvOffset) \)\.rgb;/g, 'vec4 $1 = texture2D( colorTexture, $2 );')
      .replace('gl_FragColor = vec4(diffuseSum/weightSum, 1.0);', 'gl_FragColor = diffuseSum/weightSum;');
    if (!m.fragmentShader.includes('gl_FragColor = diffuseSum/weightSum;')) console.warn('[konbini] bloom blur shader changed; glow may haze a transparent window');
    m.needsUpdate = true;
  }
  bloom.blendMaterial.premultipliedAlpha = true;   // additive (ONE, ONE) rather than scaling the glow by its alpha
}

/**
 * Tone mapping and the sRGB curve are not linear, so applied to premultiplied colour they brighten every
 * half-covered edge pixel into a white halo. Divide alpha out first, put it back after.
 */
function unpremultiplyOutput(output: OutputPass) {
  const m = output.material;
  const read = 'gl_FragColor = texture2D( tDiffuse, vUv );';
  if (!m.fragmentShader.includes(read)) { console.warn('[konbini] output shader changed; edges may glow on a transparent window'); return; }
  m.fragmentShader = m.fragmentShader
    .replace(read, `${read}
      float pa = clamp( gl_FragColor.a, 0.0, 1.0 );
      gl_FragColor = vec4( pa > 0.0 ? gl_FragColor.rgb / pa : vec3( 0.0 ), 1.0 );`)
    .replace(/}\s*$/, '  gl_FragColor = vec4( gl_FragColor.rgb * pa, pa );\n}');
  m.needsUpdate = true;
}
