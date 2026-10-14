// Cheaper lighting for many small lights. three.js runs the full BRDF for every point and spot light on every
// pixel, even when the light is switched off (street lamps by day, the unused headlight pool) or the pixel is
// outside its cone or range — and with ~14 such lights that was the largest part of drawing the scene at
// retina size. It already works out whether a light reaches the pixel (`directLight.visible`: false exactly
// when its colour there is zero), so skip the BRDF when it doesn't. The result is identical.
import * as THREE from 'three';

const CALL = 'RE_Direct( directLight, geometryPosition';

let patched = false;

/** Patch the shared lighting chunk. Call before anything is compiled. */
export function skipUnlitLights() {
  if (patched) return;
  patched = true;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(CALL)) { console.warn('[konbini] lighting chunk changed; every light is shaded everywhere'); return; }
  THREE.ShaderChunk.lights_fragment_begin = chunk.replaceAll(CALL, `if ( directLight.visible ) ${CALL}`);
}
