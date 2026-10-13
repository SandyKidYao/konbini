// Every visual and audio parameter that differs between the three scenes, plus the eased cross-fade.
import * as THREE from 'three';
import { easeInOut } from '../core/helpers.js';

export const MODES = {
  day: {
    // studio backdrop
    bgTop: '#b9dcee', bgHorizon: '#e6f2ef', bgFloor: '#d4e6df', floorShadow: 0.22, contact: 0.42,
    fog: '#e6f2ef', fogDensity: 0,
    // light
    hemiSky: '#dcefff', hemiGround: '#a89878', hemi: 0.95,
    sunColor: '#ffe8c6', sun: 4.0, sunPos: [-34, 40, 18], shadow: 0.8, exposure: 1.0,
    sat: 1.1, contrast: 1.05, grade: '#fffaf2',
    // emissive groups and practical lights
    sign: 0.75, interior: 0.75, vending: 0.6, window: 0, lamp: 0, signal: 1.6, head: 0.35,
    interiorLight: 9, awningLight: 0, vendLight: 0, lampLight: 0, headLight: 0,
    // post
    bloom: 0.1, bloomThr: 0.95, bloomRad: 0.3, ao: 0.9, tilt: 1,
    // weather and life
    rain: 0, wet: 0, cloudColor: '#ffffff', cloud: 1, cloudExtra: 0, petals: 1,
    birds: 1, wind: 0.15,
  },
  overcast: {
    bgTop: '#c3c4cf', bgHorizon: '#e2e1e7', bgFloor: '#d3d2da', floorShadow: 0.1, contact: 0.4,
    fog: '#d6d6dd', fogDensity: 0.0035,
    hemiSky: '#dfe3ea', hemiGround: '#7a776f', hemi: 1.15,
    sunColor: '#ece2d6', sun: 0.7, sunPos: [-32, 30, 24], shadow: 0.3, exposure: 0.95,
    sat: 0.72, contrast: 0.96, grade: '#f4f6fb',
    sign: 1.25, interior: 1.1, vending: 1.0, window: 0.12, lamp: 0, signal: 2.0, head: 0.8,
    interiorLight: 13, awningLight: 4, vendLight: 1.5, lampLight: 0, headLight: 4,
    bloom: 0.2, bloomThr: 0.85, bloomRad: 0.4, ao: 1.0, tilt: 1,
    rain: 0, wet: 0.12, cloudColor: '#b9bdc5', cloud: 1, cloudExtra: 1, petals: 0.6,
    birds: 0.3, wind: 1,
  },
  night: {
    bgTop: '#0c1222', bgHorizon: '#1a2340', bgFloor: '#121a2e', floorShadow: 0.35, contact: 0.55,
    fog: '#1a2238', fogDensity: 0.006,
    hemiSky: '#3d5078', hemiGround: '#121216', hemi: 0.45,
    sunColor: '#8ea6d8', sun: 0.3, sunPos: [-20, 40, -15], shadow: 0.5, exposure: 1.1,
    sat: 1.05, contrast: 1.05, grade: '#f0f4ff',
    sign: 0.8, interior: 1.5, vending: 1.2, window: 1.25, lamp: 2.5, signal: 2.6, head: 3,
    interiorLight: 20, awningLight: 12, vendLight: 4, lampLight: 90, headLight: 50,
    bloom: 0.5, bloomThr: 0.8, bloomRad: 0.4, ao: 0.8, tilt: 1,
    rain: 1, wet: 1, cloudColor: '#2a3040', cloud: 0, cloudExtra: 0, petals: 0,
    birds: 0, wind: 0.2,
  },
};

// What the exhibit label shows for each scene
export const MODE_INFO = {
  day: { name: '晴朗的白天', time: '11:20', weather: '晴，微风' },
  overcast: { name: '阴天的下午', time: '15:40', weather: '多云' },
  night: { name: '雨夜', time: '23:10', weather: '小雨' },
};

const toVal = (v) => (typeof v === 'string' ? new THREE.Color(v) : Array.isArray(v) ? new THREE.Vector3(...v) : v);
const cloneVal = (v) => (typeof v === 'number' ? v : v.clone());
const TARGETS = {};
for (const m in MODES) { TARGETS[m] = {}; for (const k in MODES[m]) TARGETS[m][k] = toVal(MODES[m][k]); }

// `state` is the live, interpolated parameter set everyone reads from
export const state = {};
for (const k in TARGETS.day) state[k] = cloneVal(TARGETS.day[k]);

const DURATION = 3.0;
let from = null, to = TARGETS.day, t = 1;
export let currentMode = 'day';

export function setMode(m, instant = false) {
  if (!MODES[m]) return false;
  currentMode = m;
  to = TARGETS[m];
  if (instant) { for (const k in to) state[k] = cloneVal(to[k]); t = 1; }
  else { from = {}; for (const k in state) from[k] = cloneVal(state[k]); t = 0; }
  return true;
}
export const isTransitioning = () => t < 1;

export function stepMode(dt, reducedMotion) {
  if (t >= 1) return;
  t = Math.min(1, t + dt / (reducedMotion ? 0.6 : DURATION));
  const e = easeInOut(t);
  for (const k in state) {
    if (typeof state[k] === 'number') state[k] = from[k] + (to[k] - from[k]) * e;
    else state[k].copy(from[k]).lerp(to[k], e);
  }
}
