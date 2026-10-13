// Post stack: ambient occlusion (contact shadows in every crevice) → bloom → tilt-shift (miniature
// depth of field) → per-mode colour grade → tone mapping/output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { renderer, scene, camera } from '../core/stage.js';

const dbs = renderer.getDrawingBufferSize(new THREE.Vector2());
export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(dbs.x, dbs.y, { type: THREE.HalfFloatType, samples: 4 }));
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));

export const gtao = new GTAOPass(scene, camera, dbs.x, dbs.y);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.4, scale: 1.0, samples: 16, distanceFallOff: 1.0 });
gtao.blendIntensity = 0.85;
composer.addPass(gtao);

export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.4, 0.9);
composer.addPass(bloom);

// Separable gaussian whose radius grows outside a sharp horizontal band — the classic miniature look.
// Run twice per axis with dense taps so wide blurs stay smooth instead of stepping.
const tiltShader = {
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uAmount: { value: 16 }, uFocus: { value: 0.46 }, uBand: { value: 0.1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
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
const tiltPasses = [];
for (let i = 0; i < 2; i++) for (const axis of ['h', 'v']) {
  const p = new ShaderPass(tiltShader);
  p.userData = { axis };
  tiltPasses.push(p);
  composer.addPass(p);
}
function setTiltTexel() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  for (const p of tiltPasses) p.uniforms.uDir.value.set(p.userData.axis === 'h' ? 1 / s.x : 0, p.userData.axis === 'v' ? 1 / s.y : 0);
}
setTiltTexel();
export function setTilt(amount) {
  // radius in drawing-buffer pixels at the very top/bottom of the frame
  const px = amount * 9 * renderer.getPixelRatio();
  for (const p of tiltPasses) p.uniforms.uAmount.value = px;
}

export const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uContrast; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSat) * uTint;
      col = max(vec3(0.0), (col - 0.18) * uContrast + 0.18);
      gl_FragColor = vec4(col, c.a);
    }`,
});
composer.addPass(gradePass);
composer.addPass(new OutputPass());

export function resizePost() {
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  setTiltTexel();
}
