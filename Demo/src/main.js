// Entry point: builds the model, then runs the loop. Each import below adds its part of the diorama.
import * as THREE from 'three';
import './style.css';
import { renderer, camera, controls, cubeCam, scene } from './core/stage.js';
import { frameHooks } from './core/registry.js';

import './world/plinth.js';
import './world/ground.js';
import './world/store.js';
import './world/props.js';
import './world/backyard.js';
import './world/neighborhood.js';
import { updateSignals } from './world/street.js';
import './world/nature.js';
import { updateTaxi } from './world/vehicles.js';
import './world/lights.js';
import './life/events.js';

import { rain, splashes, rainMat, splashMat } from './fx/weather.js';
import { reflector, wetFX, wetUniforms, reflSize } from './fx/wet.js';
import { composer, resizePost } from './fx/post.js';

import { state, stepMode, isTransitioning, MODES } from './state/modes.js';
import { applyState } from './state/apply.js';
import { updateAmbience } from './audio/ambience.js';
import { initHud, selectMode, revealStage, reducedMotion } from './ui/hud.js';
import { initPicking } from './ui/picking.js';

document.getElementById('stage').appendChild(renderer.domElement);
initHud();
initPicking();

const initial = location.hash.slice(1);
selectMode(MODES[initial] ? initial : 'day', true);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  resizePost();
  reflector.getRenderTarget().setSize(...reflSize());
  splashMat.uniforms.uPR.value = renderer.getPixelRatio();
});

// Refresh the reflection cube now and then (often while the scene is changing)
let envDirty = 40;
function captureEnv() {
  const hidden = [rain, splashes, wetFX, reflector];
  const vis = hidden.map((o) => o.visible);
  hidden.forEach((o) => (o.visible = false));
  renderer.shadowMap.autoUpdate = false;
  cubeCam.update(renderer, scene);
  renderer.shadowMap.autoUpdate = true;
  hidden.forEach((o, i) => (o.visible = vis[i]));
}

// Adaptive resolution: if the GPU can't keep up, step the pixel ratio down instead of stuttering
let slowTime = 0, sampleTime = 0, sampleFrames = 0;
function adaptQuality(dt) {
  sampleTime += dt; sampleFrames++;
  if (sampleTime < 2) return;
  const avg = sampleTime / sampleFrames;
  sampleTime = 0; sampleFrames = 0;
  slowTime = avg > 1 / 40 ? slowTime + 1 : 0;
  const pr = renderer.getPixelRatio();
  if (slowTime >= 2 && pr > 1) {
    renderer.setPixelRatio(Math.max(1, pr - 0.25));
    dispatchEvent(new Event('resize'));
    slowTime = 0;
  }
}

const clock = new THREE.Clock();
let elapsed = 0, frame = 0;

// advance everything that moves (no rendering)
function simulate(dt) {
  elapsed += dt;
  stepMode(dt, reducedMotion);
  applyState(state, dt);
  rainMat.uniforms.uTime.value = elapsed;
  splashMat.uniforms.uTime.value = elapsed;
  wetUniforms.uTime.value = elapsed;
  updateTaxi(dt, updateSignals(elapsed, state.signal));
  for (const f of frameHooks) f(dt, elapsed, state);
}

// ?warp=60 fast-forwards a minute of street life before the first frame
{
  const warp = Number(new URLSearchParams(location.search).get('warp')) || 0;
  for (let t = 0; t < Math.min(warp, 600); t += 0.05) simulate(0.05);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  simulate(dt);
  updateAmbience(state, elapsed);
  controls.update(dt);

  if (isTransitioning()) envDirty = Math.max(envDirty, 6);
  if (envDirty > 0 ? frame % 6 === 0 : frame % 45 === 0) captureEnv();
  if (envDirty > 0) envDirty--;

  composer.render();
  if (frame > 60) adaptQuality(dt);
  frame++;
  if (frame === 3) revealStage();
  requestAnimationFrame(tick);
}
tick();

// handy for tinkering from the console
window.konbini = { selectMode, state };
