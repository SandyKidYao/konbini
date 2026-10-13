// Small rounded cars: a kei wagon, a sedan, a taxi with its roof lamp and fender mirrors.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModContext } from '../../engine/mod';
import { mat, canvasTex, FONT_LATIN } from '../../engine/kit/build';

export interface CarOptions {
  color: string;
  belt?: string;
  len?: number; width?: number; bodyH?: number;
  cabinLen?: number; cabinH?: number; cabinX?: number;
  roofLamp?: boolean;
  /** emissive lights follow the 'head' channel (driving cars); parked cars leave them off */
  lit?: boolean;
  /** clip the car at these planes (e.g. the edge of the model) */
  clip?: THREE.Plane[];
}
export interface Car { root: THREE.Group; wheels: THREE.Group[]; spin(distance: number): void }

export function car(ctx: ModContext, o: CarOptions): Car {
  const { color, belt, len = 4.5, width = 1.72, bodyH = 0.72, cabinLen = 2.4, cabinH = 0.62, cabinX = -0.25, roofLamp = false, lit = false, clip } = o;
  const g = new THREE.Group();
  const cm = (c: string, p: THREE.MeshStandardMaterialParameters = {}) => mat(c, clip ? { clippingPlanes: clip, ...p } : p);
  const body = cm(color, { roughness: 0.28, metalness: 0.2, envMap: ctx.fx.envMap, envMapIntensity: 0.6 });
  const glassC = cm('#26313d', { roughness: 0.08, metalness: 0.6, envMap: ctx.fx.envMap });
  const dark = cm('#2c2f34', { roughness: 0.6 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const ob = new THREE.Mesh(geo, m); ob.position.set(x, y, z); ob.castShadow = ob.receiveShadow = true; g.add(ob); return ob;
  };
  const by = 0.36 + bodyH / 2;
  add(new RoundedBoxGeometry(len, bodyH, width, 3, 0.18), body, 0, by, 0);
  add(new RoundedBoxGeometry(cabinLen, cabinH, width - 0.16, 3, 0.16), glassC, cabinX, 0.36 + bodyH + cabinH / 2 - 0.04, 0);
  add(new RoundedBoxGeometry(cabinLen - 0.15, 0.08, width - 0.22, 2, 0.03), body, cabinX, 0.36 + bodyH + cabinH - 0.04, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, cabinH - 0.06, width - 0.12), body, cabinX + s * (cabinLen / 2 - 0.12), 0.36 + bodyH + cabinH / 2 - 0.05, 0);
  if (belt) add(new THREE.BoxGeometry(len + 0.02, 0.1, width + 0.02), cm(belt, { roughness: 0.4 }), 0, by + 0.1, 0);
  add(new RoundedBoxGeometry(0.2, 0.22, width + 0.02, 2, 0.05), dark, len / 2 - 0.05, 0.48, 0);
  add(new RoundedBoxGeometry(0.2, 0.22, width + 0.02, 2, 0.05), dark, -len / 2 + 0.05, 0.48, 0);
  if (roofLamp) {
    const lt = canvasTex(128, 48, (c, w, h) => { c.fillStyle = '#fff4dc'; c.fillRect(0, 0, w, h); c.fillStyle = '#d7383b'; c.font = `800 30px ${FONT_LATIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TAXI', w / 2, h / 2 + 2); });
    add(new THREE.BoxGeometry(0.22, 0.24, 0.55), ctx.glow.add(cm('#ffffff', { map: lt, emissiveMap: lt, emissive: '#ffffff' }), 'head', 0.6), cabinX - 0.05, 0.36 + bodyH + cabinH + 0.1, 0);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), dark, len / 2 - 0.65, by + 0.42, s * (width / 2 - 0.04));
      add(new THREE.BoxGeometry(0.06, 0.08, 0.1), dark, len / 2 - 0.65, by + 0.52, s * (width / 2 - 0.04));
    }
  }
  const hm = lit ? ctx.glow.add(cm('#fffbe8', { emissive: '#fff4d6' }), 'head', 1) : cm('#f4f2ea', { roughness: 0.2 });
  const tm = lit ? ctx.glow.add(cm('#ff3a2a', { emissive: '#ff1a10' }), 'head', 0.8) : cm('#b1302a', { roughness: 0.3 });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.16, 0.34), hm, len / 2 + 0.01, by + 0.06, s * (width / 2 - 0.26));
    add(new THREE.BoxGeometry(0.06, 0.16, 0.3), tm, -len / 2 - 0.01, by + 0.08, s * (width / 2 - 0.24));
  }
  const wheels: THREE.Group[] = [];
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
  return { root: g, wheels, spin(dist) { for (const w of wheels) w.rotation.z -= dist / 0.34; } };
}
