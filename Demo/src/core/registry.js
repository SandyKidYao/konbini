// Cross-module registries. World builders register things here; the mode system and the loop read them.
import { envRT } from './stage.js';

// Emissive materials whose intensity follows a mode key ('sign', 'interior', 'window', ...)
export const glowMats = [];
export function glow(m, key, base = 1) {
  const entry = { mat: m, key, base, boost: 0 };   // boost: a transient extra glow (click feedback)
  glowMats.push(entry);
  m.userData.glow = entry;
  return m;
}

// Outdoor surfaces that darken and turn glossy when it rains
export const wetMats = [];
export function wetable(m) {
  wetMats.push({ mat: m, color: m.color.clone(), rough: m.roughness });
  m.envMap = envRT.texture;
  m.envMapIntensity = 0;
  return m;
}

// Per-frame callbacks: fn(dt, elapsed, state)
export const frameHooks = [];
export const onFrame = (fn) => frameHooks.push(fn);

// Clickable things: { object, onClick, label }
export const pickables = [];
export function pickable(object, onClick, label) {
  pickables.push({ object, onClick, label });
  object.traverse((o) => { o.userData.pickRoot = object; });
}
export function unpickable(object) {
  const i = pickables.findIndex((p) => p.object === object);
  if (i >= 0) pickables.splice(i, 1);
}
