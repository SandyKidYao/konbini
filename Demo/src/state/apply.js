// Pushes the interpolated mode state onto lights, materials, post passes and effects.
import * as THREE from 'three';
import { renderer, scene } from '../core/stage.js';
import { glowMats, wetMats } from '../core/registry.js';
import { hemi, sun, interiorLights, awningLight, vendLight } from '../world/lights.js';
import { lampLights } from '../world/street.js';
import { headLight } from '../world/vehicles.js';
import { cloudMat } from '../world/nature.js';
import { backdropMat, floorShadowMat, contactMat } from '../world/plinth.js';
import { rain, splashes, rainMat, splashMat } from '../fx/weather.js';
import { reflector, wetFX, wetUniforms, puddleMat, sheenMat } from '../fx/wet.js';
import { gtao, bloom, gradePass, setTilt } from '../fx/post.js';

export function applyState(s, dt) {
  backdropMat.uniforms.uTop.value.copy(s.bgTop);
  backdropMat.uniforms.uHorizon.value.copy(s.bgHorizon);
  backdropMat.uniforms.uFloor.value.copy(s.bgFloor);
  floorShadowMat.opacity = s.floorShadow;
  contactMat.opacity = s.contact;
  scene.fog.color.copy(s.fog);
  scene.fog.density = s.fogDensity;

  hemi.color.copy(s.hemiSky); hemi.groundColor.copy(s.hemiGround); hemi.intensity = s.hemi;
  sun.color.copy(s.sunColor); sun.intensity = s.sun;
  sun.position.copy(s.sunPos);
  sun.shadow.intensity = s.shadow;
  renderer.toneMappingExposure = s.exposure;

  for (const g of glowMats) {
    if (g.boost > 0) g.boost = Math.max(0, g.boost - dt * 1.6);
    g.mat.emissiveIntensity = g.base * s[g.key] + g.boost;
  }
  for (const l of interiorLights) l.intensity = s.interiorLight;
  awningLight.intensity = s.awningLight;
  vendLight.intensity = s.vendLight;
  for (const l of lampLights) l.intensity = s.lampLight;
  headLight.intensity = s.headLight;

  gtao.blendIntensity = s.ao;
  bloom.strength = s.bloom; bloom.threshold = s.bloomThr; bloom.radius = s.bloomRad;
  setTilt(s.tilt);
  gradePass.uniforms.uSat.value = s.sat;
  gradePass.uniforms.uContrast.value = s.contrast;
  gradePass.uniforms.uTint.value.copy(s.grade);

  rainMat.uniforms.uOpacity.value = s.rain * 0.26;
  splashMat.uniforms.uOpacity.value = s.rain * 0.5;
  wetUniforms.uRain.value = s.rain;
  rain.visible = splashes.visible = s.rain > 0.01;
  const pw = THREE.MathUtils.smoothstep(s.wet, 0.3, 1);
  puddleMat.uniforms.uStrength.value = pw * 0.95;
  sheenMat.uniforms.uStrength.value = pw * 0.55;
  wetFX.visible = reflector.visible = pw > 0.01;
  for (const w of wetMats) {
    w.mat.roughness = THREE.MathUtils.lerp(w.rough, Math.min(w.rough, 0.3), s.wet);
    w.mat.color.copy(w.color).multiplyScalar(1 - 0.45 * s.wet);
    w.mat.envMapIntensity = s.wet * 0.35;
  }
  cloudMat.color.copy(s.cloudColor);
  cloudMat.opacity = Math.min(1, s.cloud * 1.2);
}
