// Materials shared across several builders. One-off materials stay next to the thing they paint.
import * as THREE from 'three';
import { mat } from './helpers.js';
import { envRT } from './stage.js';
import { glow, wetable } from './registry.js';
import { rr } from './rng.js';
import {
  asphaltTex, tileTex, concreteTex, blockTex, grassTex, storeWallTex, winWarmTex, winCoolTex,
} from '../textures/surfaces.js';

export const MAT = {
  wall: mat('#ffffff', { map: storeWallTex, roughness: 0.6 }),
  white: mat('#f3f3ef', { roughness: 0.55 }),
  frame: mat('#59606a', { roughness: 0.4, metalness: 0.55 }),
  darkMetal: mat('#3a3f46', { roughness: 0.5, metalness: 0.45 }),
  chrome: mat('#d3d7dc', { roughness: 0.25, metalness: 0.9 }),
  rubber: mat('#24262a', { roughness: 0.9 }),
  pole: mat('#b1b0aa', { roughness: 0.8 }),
  wire: mat('#2a2a2c', { roughness: 0.6 }),
  green: mat('#16936a', { roughness: 0.45 }),
  awning: mat('#d6d8d6', { roughness: 0.45, metalness: 0.1 }),
  roof: mat('#b7b8b3', { roughness: 0.9 }),
  coping: mat('#a2a5a8', { roughness: 0.6 }),
  shelf: mat('#eceef0', { roughness: 0.5 }),
  shelfBase: mat('#4b5a68', { roughness: 0.6 }),
  wood: mat('#b8936a', { roughness: 0.65 }),
  houseRoof: mat('#56637a', { roughness: 0.65, flatShading: true }),
  darkGlass: mat('#2a3542', { roughness: 0.12, metalness: 0.55, envMap: envRT.texture, envMapIntensity: 0.5 }),
  roadPaint: wetable(mat('#f2f1ec', { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
};

export const glassMat = new THREE.MeshStandardMaterial({
  color: '#c2d4dd', transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0.3,
  envMap: envRT.texture, envMapIntensity: 0.9, depthWrite: false,
});

export const asphaltMat = wetable(mat('#ffffff', { map: asphaltTex, roughness: 0.92 }));
export const tileMat = wetable(mat('#ffffff', { map: tileTex, roughness: 0.85 }));
export const concreteMat = wetable(mat('#ffffff', { map: concreteTex, roughness: 0.9 }));
export const blockMat = wetable(mat('#ffffff', { map: blockTex, roughness: 0.95 }));
export const curbMat = wetable(mat('#cdcac2', { roughness: 0.85 }));
export const grassMat = wetable(mat('#ffffff', { map: grassTex, roughness: 1 }));
export const wheelStopMat = wetable(mat('#d6d2c8', { roughness: 0.9 }));

export const windowGlowWarm = () => glow(mat('#2b3542', {
  emissive: '#ffffff', emissiveMap: winWarmTex, roughness: 0.15, metalness: 0.4, envMap: envRT.texture, envMapIntensity: 0.5,
}), 'window', rr(0.6, 0.95));
export const windowGlowCool = () => glow(mat('#2b3542', {
  emissive: '#ffffff', emissiveMap: winCoolTex, roughness: 0.15, metalness: 0.4, envMap: envRT.texture, envMapIntensity: 0.5,
}), 'window', rr(0.35, 0.6));
