// The taxi that circles road A (and stops for red), plus three parked cars.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { world, envRT } from '../core/stage.js';
import { mat, canvasTex, LATIN } from '../core/helpers.js';
import { glow, pickable } from '../core/registry.js';
import { sfx } from '../audio/ambience.js';

// clip the taxi at the plinth edges so it seems to drive in and out of the cut
const clipPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 27.9), new THREE.Plane(new THREE.Vector3(1, 0, 0), 27.9)];

function makeCar({ color, belt = null, len = 4.5, width = 1.72, bodyH = 0.72, cabinLen = 2.4, cabinH = 0.62, cabinX = -0.25,
  roofLamp = false, clip = false, lightKey = 'head' }) {
  const g = new THREE.Group();
  const cm = (c, o = {}) => mat(c, clip ? { clippingPlanes: clipPlanes, ...o } : o);
  const body = cm(color, { roughness: 0.28, metalness: 0.2, envMap: envRT.texture, envMapIntensity: 0.6 });
  const glassC = cm('#26313d', { roughness: 0.08, metalness: 0.6, envMap: envRT.texture });
  const dark = cm('#2c2f34', { roughness: 0.6 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const by = 0.36 + bodyH / 2;
  add(new RoundedBoxGeometry(len, bodyH, width, 3, 0.18), body, 0, by, 0);
  add(new RoundedBoxGeometry(cabinLen, cabinH, width - 0.16, 3, 0.16), glassC, cabinX, 0.36 + bodyH + cabinH / 2 - 0.04, 0);
  add(new RoundedBoxGeometry(cabinLen - 0.15, 0.08, width - 0.22, 2, 0.03), body, cabinX, 0.36 + bodyH + cabinH - 0.04, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, cabinH - 0.06, width - 0.12), body, cabinX + s * (cabinLen / 2 - 0.12), 0.36 + bodyH + cabinH / 2 - 0.05, 0);
  if (belt) add(new THREE.BoxGeometry(len + 0.02, 0.1, width + 0.02), cm(belt, { roughness: 0.4 }), 0, by + 0.1, 0);
  add(new RoundedBoxGeometry(0.2, 0.22, width + 0.02, 2, 0.05), dark, len / 2 - 0.05, 0.48, 0);
  add(new RoundedBoxGeometry(0.2, 0.22, width + 0.02, 2, 0.05), dark, -len / 2 + 0.05, 0.48, 0);
  if (roofLamp) {
    const lt = canvasTex(128, 48, (c, w, h) => { c.fillStyle = '#fff4dc'; c.fillRect(0, 0, w, h); c.fillStyle = '#d7383b'; c.font = `800 30px ${LATIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TAXI', w / 2, h / 2 + 2); });
    add(new THREE.BoxGeometry(0.22, 0.24, 0.55), glow(cm('#ffffff', { map: lt, emissiveMap: lt, emissive: '#ffffff' }), lightKey, 0.6), cabinX - 0.05, 0.36 + bodyH + cabinH + 0.1, 0);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), dark, len / 2 - 0.65, by + 0.42, s * (width / 2 - 0.04));
      add(new THREE.BoxGeometry(0.06, 0.08, 0.1), dark, len / 2 - 0.65, by + 0.52, s * (width / 2 - 0.04));
    }
  }
  const hm = lightKey ? glow(cm('#fffbe8', { emissive: '#fff4d6' }), lightKey, 1) : cm('#f4f2ea', { roughness: 0.2 });
  const tm = lightKey ? glow(cm('#ff3a2a', { emissive: '#ff1a10' }), lightKey, 0.8) : cm('#b1302a', { roughness: 0.3 });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.16, 0.34), hm, len / 2 + 0.01, by + 0.06, s * (width / 2 - 0.26));
    add(new THREE.BoxGeometry(0.06, 0.16, 0.3), tm, -len / 2 - 0.01, by + 0.08, s * (width / 2 - 0.24));
  }
  const wheels = [];
  const tire = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20);
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 14);
  const hubM = cm('#d0d4d9', { metalness: 0.8, roughness: 0.3 });
  const tireM = cm('#202124', { roughness: 0.9 });
  const wx = len / 2 - 0.82;
  for (const x of [-wx, wx]) for (const z of [-(width / 2 - 0.08), width / 2 - 0.08]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(tire, tireM); t.rotation.x = Math.PI / 2; t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(hub, hubM); h.rotation.x = Math.PI / 2; w.add(h);
    w.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), hubM));
    w.position.set(x, 0.34, z);
    g.add(w); wheels.push(w);
  }
  return { g, wheels };
}

const taxiCar = makeCar({ color: '#f2c84b', belt: '#2a7a55', roofLamp: true, clip: true });
export const taxi = taxiCar.g;
export const headLight = new THREE.SpotLight('#fff1d0', 0, 26, 0.5, 0.5, 1.3);
headLight.position.set(2.3, 0.8, 0);
headLight.target.position.set(12, 0, 0);
taxi.add(headLight, headLight.target);
taxi.position.set(-20, 0, 11.8);
world.add(taxi);
pickable(taxi, () => sfx.beep(), '出租车');

let carV = 8;
export function updateTaxi(dt, signal) {
  const STOP_X = 10.6, MAX = 8.5;
  let x = taxi.position.x;
  let desired = MAX;
  if (signal !== 'g' && x < STOP_X + 0.2 && x > STOP_X - 24) {
    const dist = STOP_X - x;
    const committed = signal === 'y' && dist < 4 && carV > 5;
    if (!committed) desired = Math.max(0, Math.min(MAX, dist * 0.9));
  }
  carV += (desired - carV) * Math.min(1, dt * (desired < carV ? 2.2 : 0.9));
  x += carV * dt;
  if (x > 33) x = -33;
  taxi.position.x = x;
  for (const w of taxiCar.wheels) w.rotation.z -= (carV * dt) / 0.34;
}

// parked cars, nose-in toward the store
{
  const kei = makeCar({ color: '#f3f1ea', len: 3.4, width: 1.48, bodyH: 0.68, cabinLen: 2.55, cabinH: 0.86, cabinX: -0.3, lightKey: null });
  kei.g.rotation.y = Math.PI / 2; kei.g.position.set(-0.1, 0.1, 3.55); world.add(kei.g);
  const sedan = makeCar({ color: '#5f7fae', len: 4.5, width: 1.74, bodyH: 0.66, cabinLen: 2.3, cabinH: 0.58, cabinX: -0.3, lightKey: null });
  sedan.g.rotation.y = Math.PI / 2; sedan.g.position.set(7.7, 0.1, 4.0); world.add(sedan.g);
  const van = makeCar({ color: '#e8786a', len: 3.4, width: 1.48, bodyH: 0.7, cabinLen: 2.4, cabinH: 0.8, cabinX: -0.4, lightKey: null });
  van.g.rotation.y = -Math.PI / 2 + 0.04; van.g.position.set(25.6, 0.08, 1.2); world.add(van.g);
}
