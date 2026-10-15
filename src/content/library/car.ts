// Small rounded vehicles: cars (kei wagon, hatchback, sedan, minivan, taxi, patrol car), trucks (a kei truck
// with an open bed, a box delivery truck) and a community bus. All are modelled nose along +x and share the
// same lamps: headlights, tail and brake lights, reversing lights and blinking indicators.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModContext } from '../../engine/mod';
import type { VehicleBody, Lamps } from '../../engine/agents/vehicle';
import { mat, canvasTex, FONT_LATIN, FONT_JP } from '../../engine/kit/build';

export interface Car extends VehicleBody { root: THREE.Group; wheels: THREE.Group[] }

interface Shell {
  g: THREE.Group;
  cm(c: string, p?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh;
}

function shell(clip?: THREE.Plane[]): Shell {
  const g = new THREE.Group();
  return {
    g,
    // clip the shadow too: a car still outside the model must not cast one onto it (or the floor)
    cm: (c, p = {}) => mat(c, clip ? { clippingPlanes: clip, clipShadows: true, ...p } : p),
    add(geo, m, x, y, z) {
      const ob = new THREE.Mesh(geo, m); ob.position.set(x, y, z); ob.castShadow = ob.receiveShadow = true; g.add(ob); return ob;
    },
  };
}

interface LampSpec { len: number; width: number; headY: number; tailY: number; front?: number; rear?: number }

/** Lamps on a body: returns the per-frame switch. */
function fitLamps(s: Shell, o: LampSpec) {
  const lamp = (off: string, on: string) => s.cm(off, { emissive: on, emissiveIntensity: 0, roughness: 0.2 });
  const head = lamp('#f4f2ea', '#fff4d6'), tail = lamp('#b1302a', '#ff1a10'), rev = lamp('#e8e8e4', '#ffffff');
  const ind = [lamp('#e9a54a', '#ff9a1a'), lamp('#e9a54a', '#ff9a1a')];   // [left (−z), right (+z)]
  const fx = o.front ?? o.len / 2, rx = o.rear ?? -o.len / 2, w = o.width / 2;
  for (const sd of [-1, 1]) {
    s.add(new THREE.BoxGeometry(0.06, 0.16, 0.34), head, fx + 0.01, o.headY, sd * (w - 0.26));
    s.add(new THREE.BoxGeometry(0.06, 0.16, 0.26), tail, rx - 0.01, o.tailY, sd * (w - 0.24));
    s.add(new THREE.BoxGeometry(0.06, 0.08, 0.1), rev, rx - 0.01, o.tailY - 0.13, sd * (w - 0.42));
    const m = ind[sd < 0 ? 0 : 1];
    s.add(new THREE.BoxGeometry(0.06, 0.08, 0.1), m, fx + 0.01, o.headY - 0.12, sd * (w - 0.1));
    s.add(new THREE.BoxGeometry(0.06, 0.1, 0.08), m, rx - 0.01, o.tailY, sd * (w - 0.06));
  }
  return (l: Lamps, t: number) => {
    head.emissiveIntensity = l.head + l.flash * 2.2;
    tail.emissiveIntensity = (l.engine ? 0.4 * l.head : 0) + (l.brake ? 1.3 : 0);
    rev.emissiveIntensity = l.reverse ? 1.4 : 0;
    const on = Math.floor(t * 2.8) % 2 === 0;
    ind[0].emissiveIntensity = on && (l.blink === 'left' || l.blink === 'hazard') ? 2 : 0;
    ind[1].emissiveIntensity = on && (l.blink === 'right' || l.blink === 'hazard') ? 2 : 0;
  };
}

function fitWheels(s: Shell, xs: number[], width: number, r = 0.34) {
  const wheels: THREE.Group[] = [];
  const tire = new THREE.CylinderGeometry(r, r, 0.24, 20);
  const hub = new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.25, 14);
  const spoke = new THREE.BoxGeometry(r, 0.06, 0.26);
  const hubM = s.cm('#d0d4d9', { metalness: 0.8, roughness: 0.3 });
  const tireM = s.cm('#202124', { roughness: 0.9 });
  for (const x of xs) for (const z of [-(width / 2 - 0.08), width / 2 - 0.08]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(tire, tireM); t.rotation.x = Math.PI / 2; t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(hub, hubM); h.rotation.x = Math.PI / 2; w.add(h);
    w.add(new THREE.Mesh(spoke, hubM));
    w.position.set(x, r, z);
    s.g.add(w); wheels.push(w);
  }
  return { wheels, spin: (dist: number) => { for (const w of wheels) w.rotation.z -= dist / r; } };
}

function finish(s: Shell, color: string, len: number, width: number, lamps: (l: Lamps, t: number) => void, wheels: ReturnType<typeof fitWheels>, extra?: (l: Lamps, t: number) => void): Car {
  return {
    root: s.g, wheels: wheels.wheels, len, width, color,
    spin: wheels.spin,
    lamps(l, t) { lamps(l, t); extra?.(l, t); },
    dispose() {
      // geometry and materials are this vehicle's own; textures are shared and stay
      s.g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    },
  };
}

// ------------------------------------------------------------------ cars

export interface CarOptions {
  color: string;
  belt?: string;
  len?: number; width?: number; bodyH?: number;
  cabinLen?: number; cabinH?: number; cabinX?: number;
  /** the taxi's lit roof sign */
  roofLamp?: boolean;
  /** a patrol car: white doors and roof over a black body, a red light bar */
  patrol?: boolean;
  /** clip the vehicle at these planes (e.g. the edge of the model) */
  clip?: THREE.Plane[];
}

let taxiTex: THREE.Texture | null = null;

export function car(_ctx: ModContext, o: CarOptions): Car {
  const { color, belt, len = 4.5, width = 1.72, bodyH = 0.72, cabinLen = 2.4, cabinH = 0.62, cabinX = -0.25, roofLamp = false, patrol = false, clip } = o;
  const ctx = _ctx;
  const s = shell(clip), { cm, add } = s;
  const body = cm(color, { roughness: 0.28, metalness: 0.2, envMap: ctx.fx.envMap, envMapIntensity: 0.6 });
  const top = patrol ? cm('#f4f4f2', { roughness: 0.28, metalness: 0.2, envMap: ctx.fx.envMap, envMapIntensity: 0.6 }) : body;
  const glassC = cm('#26313d', { roughness: 0.08, metalness: 0.6, envMap: ctx.fx.envMap });
  const dark = cm('#2c2f34', { roughness: 0.6 });
  const by = 0.36 + bodyH / 2, roofY = 0.36 + bodyH + cabinH - 0.04;
  add(new RoundedBoxGeometry(len, bodyH, width, 3, 0.18), body, 0, by, 0);
  add(new RoundedBoxGeometry(cabinLen, cabinH, width - 0.16, 3, 0.16), glassC, cabinX, 0.36 + bodyH + cabinH / 2 - 0.04, 0);
  add(new RoundedBoxGeometry(cabinLen - 0.15, 0.08, width - 0.22, 2, 0.03), top, cabinX, roofY, 0);
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.1, cabinH - 0.06, width - 0.12), top, cabinX + sd * (cabinLen / 2 - 0.12), 0.36 + bodyH + cabinH / 2 - 0.05, 0);
  if (belt) add(new THREE.BoxGeometry(len + 0.02, 0.1, width + 0.02), cm(belt, { roughness: 0.4 }), 0, by + 0.1, 0);
  if (patrol) add(new THREE.BoxGeometry(cabinLen - 0.1, bodyH * 0.62, width + 0.02), top, cabinX, by + 0.04, 0);
  add(new RoundedBoxGeometry(0.2, 0.22, width + 0.02, 2, 0.05), dark, len / 2 - 0.05, 0.48, 0);
  add(new RoundedBoxGeometry(0.2, 0.22, width + 0.02, 2, 0.05), dark, -len / 2 + 0.05, 0.48, 0);
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.08, 0.1), dark, cabinX + cabinLen / 2 - 0.05, 0.36 + bodyH + 0.04, sd * (width / 2 + 0.03));

  let extra: ((l: Lamps, t: number) => void) | undefined;
  if (roofLamp) {
    taxiTex ??= canvasTex(128, 48, (c, w, h) => { c.fillStyle = '#fff4dc'; c.fillRect(0, 0, w, h); c.fillStyle = '#d7383b'; c.font = `800 30px ${FONT_LATIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TAXI', w / 2, h / 2 + 2); });
    const lm = cm('#ffffff', { map: taxiTex, emissiveMap: taxiTex, emissive: '#ffffff', emissiveIntensity: 0 });
    add(new THREE.BoxGeometry(0.22, 0.24, 0.55), lm, cabinX - 0.05, roofY + 0.14, 0);
    // fender mirrors
    for (const sd of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), dark, len / 2 - 0.65, by + 0.42, sd * (width / 2 - 0.04));
      add(new THREE.BoxGeometry(0.06, 0.08, 0.1), dark, len / 2 - 0.65, by + 0.52, sd * (width / 2 - 0.04));
    }
    extra = (l) => { lm.emissiveIntensity = l.engine ? 0.15 + 0.6 * l.head : 0; };
  }
  if (patrol) {
    const red = [0, 1].map(() => cm('#8a2a26', { emissive: '#ff2418', emissiveIntensity: 0, roughness: 0.3 }));
    add(new THREE.BoxGeometry(0.3, 0.08, width - 0.4), dark, cabinX, roofY + 0.07, 0);
    for (const sd of [-1, 1]) add(new RoundedBoxGeometry(0.26, 0.16, 0.5, 2, 0.05), red[sd < 0 ? 0 : 1], cabinX, roofY + 0.18, sd * 0.33);
    extra = (l, t) => {
      // patrolling with the red lamps turning: they sweep left, right
      const k = l.engine ? 0.6 + 1.6 * l.head : 0, ph = (t * 1.6) % 1;
      red[0].emissiveIntensity = k * Math.max(0, Math.sin(ph * Math.PI * 2)) ** 2;
      red[1].emissiveIntensity = k * Math.max(0, -Math.sin(ph * Math.PI * 2)) ** 2;
    };
  }
  const lamps = fitLamps(s, { len, width, headY: by + 0.06, tailY: by + 0.08 });
  const wx = len / 2 - 0.82;
  return finish(s, patrol ? '#2a2c30' : color, len, width, lamps, fitWheels(s, [-wx, wx], width), extra);
}

/** Body shapes, so content can say 'kei' instead of a list of numbers. */
export const CAR_MODELS = {
  kei: { len: 3.4, width: 1.48, bodyH: 0.68, cabinLen: 2.55, cabinH: 0.86, cabinX: -0.3 },
  hatch: { len: 4.0, width: 1.66, bodyH: 0.68, cabinLen: 2.3, cabinH: 0.62, cabinX: -0.45 },
  sedan: { len: 4.6, width: 1.74, bodyH: 0.66, cabinLen: 2.3, cabinH: 0.58, cabinX: -0.3 },
  minivan: { len: 4.7, width: 1.74, bodyH: 0.72, cabinLen: 3.5, cabinH: 0.82, cabinX: -0.45 },
  taxi: { len: 4.5, width: 1.72, bodyH: 0.72, cabinLen: 2.4, cabinH: 0.62, cabinX: -0.25 },
} as const;
export type CarModel = keyof typeof CAR_MODELS;

/** Everyday car colours: mostly white, silver, black and grey, with the odd bright kei. */
export const CAR_COLORS = ['#f3f1ea', '#f3f1ea', '#eef0f2', '#c3c8cd', '#a9afb5', '#2b2d31', '#4a4f57', '#5f7fae', '#2f3f63', '#8a2f2a', '#c9b48a', '#6e5b4a'];
export const KEI_COLORS = ['#f3f1ea', '#f6e7c8', '#a9d3c4', '#9fc3e6', '#e9b8b0', '#d9cfa8', '#c3c8cd', '#e2b13c'];
/** [body, belt] */
export const TAXI_LIVERIES: [string, string][] = [['#f2c84b', '#2a7a55'], ['#1f2433', '#c9a24a'], ['#2f6b4f', '#f2c84b'], ['#ece8de', '#d7383b'], ['#e7863a', '#f4f2ea']];

// ------------------------------------------------------------------ trucks

export interface TruckOptions {
  /** 'kei': a little open-bed farm truck; 'box': a two-tonne delivery truck */
  type: 'kei' | 'box';
  color?: string;
  /** box colour and its stripe */
  box?: string;
  stripe?: string;
  /** what is on the kei truck's bed */
  load?: 'crates' | 'cabbage' | 'none';
  clip?: THREE.Plane[];
}

let boxSideTex: THREE.Texture | null = null;

export function truck(ctx: ModContext, o: TruckOptions): Car {
  const s = shell(o.clip), { cm, add } = s;
  const color = o.color ?? '#f3f1ea';
  const cab = cm(color, { roughness: 0.3, metalness: 0.15, envMap: ctx.fx.envMap, envMapIntensity: 0.5 });
  const glassC = cm('#26313d', { roughness: 0.08, metalness: 0.6, envMap: ctx.fx.envMap });
  const dark = cm('#2c2f34', { roughness: 0.6 });
  if (o.type === 'kei') {
    const len = 3.4, width = 1.48;
    // cab-over cab at the front, low open bed behind
    add(new RoundedBoxGeometry(1.25, 1.0, width, 3, 0.14), cab, len / 2 - 0.62, 0.36 + 0.5 + 0.12, 0);
    add(new RoundedBoxGeometry(1.0, 0.5, width - 0.12, 2, 0.1), glassC, len / 2 - 0.7, 1.55, 0);
    add(new RoundedBoxGeometry(0.95, 0.07, width - 0.16, 2, 0.03), cab, len / 2 - 0.72, 1.81, 0);
    add(new THREE.BoxGeometry(0.08, 0.46, width - 0.1), cab, len / 2 - 1.18, 1.55, 0);
    const bedL = len - 1.3, bx = -len / 2 + bedL / 2;
    add(new THREE.BoxGeometry(bedL, 0.12, width), dark, bx, 0.62, 0);
    add(new THREE.BoxGeometry(bedL, 0.06, width), cab, bx, 0.71, 0);
    const gate = cm(color, { roughness: 0.4 });
    for (const sd of [-1, 1]) add(new THREE.BoxGeometry(bedL, 0.3, 0.05), gate, bx, 0.89, sd * (width / 2 - 0.02));
    add(new THREE.BoxGeometry(0.05, 0.3, width), gate, -len / 2 + 0.03, 0.89, 0);
    add(new THREE.BoxGeometry(0.05, 0.55, width), gate, len / 2 - 1.3, 1.0, 0);
    if (o.load === 'crates') {
      const cc = ['#e8863a', '#3d78d6', '#e8863a', '#f2c84b'];
      for (let i = 0; i < 4; i++) add(new RoundedBoxGeometry(0.55, 0.32, 0.6, 2, 0.04), cm(cc[i]), bx - 0.5 + (i % 2) * 0.62, 0.92 + Math.floor(i / 2) * 0.33, (i % 2 ? 0.3 : -0.3) * (i > 1 ? -1 : 1));
    } else if (o.load === 'cabbage') {
      const leaf = cm('#8fbf5a', { roughness: 0.8 });
      const ball = new THREE.SphereGeometry(0.17, 10, 8);
      for (let i = 0; i < 14; i++) add(ball, leaf, bx - 0.75 + (i % 5) * 0.38, 0.9 + (i > 9 ? 0.24 : 0), -0.45 + Math.floor((i % 10) / 5) * 0.5 + (i > 9 ? 0.25 : 0));
    }
    add(new RoundedBoxGeometry(0.16, 0.2, width + 0.02, 2, 0.05), dark, len / 2 - 0.02, 0.48, 0);
    const lamps = fitLamps(s, { len, width, headY: 0.82, tailY: 0.6 });
    return finish(s, color, len, width, lamps, fitWheels(s, [len / 2 - 0.62, -len / 2 + 0.75], width, 0.3));
  }
  // box truck
  const len = 5.6, width = 1.92, cabL = 1.55;
  const fx = len / 2;
  add(new RoundedBoxGeometry(cabL, 1.25, width, 3, 0.16), cab, fx - cabL / 2, 0.42 + 0.62 + 0.18, 0);
  add(new RoundedBoxGeometry(cabL - 0.3, 0.62, width - 0.1, 2, 0.12), glassC, fx - cabL / 2 + 0.08, 1.98, 0);
  add(new RoundedBoxGeometry(cabL - 0.25, 0.14, width - 0.08, 2, 0.06), cab, fx - cabL / 2 - 0.02, 2.33, 0);
  add(new THREE.BoxGeometry(0.1, 0.6, width - 0.06), cab, fx - cabL + 0.15, 1.98, 0);
  add(new THREE.BoxGeometry(len - 0.4, 0.22, width - 0.3), dark, -0.1, 0.62, 0);
  const boxL = len - cabL - 0.12, bx = -len / 2 + boxL / 2;
  boxSideTex ??= canvasTex(512, 160, (c, w, h) => {
    c.fillStyle = '#f6f6f2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f6db5'; c.fillRect(0, h * 0.62, w, h * 0.14);
    c.fillStyle = '#e8863a'; c.fillRect(0, h * 0.78, w, h * 0.06);
    c.fillStyle = '#2f6db5'; c.font = `800 52px ${FONT_JP}`; c.textBaseline = 'middle'; c.fillText('さくら便', 34, h * 0.34);
    c.font = `600 22px ${FONT_LATIN}`; c.fillStyle = '#6b7380'; c.fillText('SAKURA EXPRESS', 300, h * 0.36);
  });
  const sideM = cm('#ffffff', { map: boxSideTex, roughness: 0.5 });
  const boxM = cm(o.box ?? '#f6f6f2', { roughness: 0.5 });
  const cargo = add(new RoundedBoxGeometry(boxL, 2.15, width + 0.06, 2, 0.05), boxM, bx, 0.75 + 1.08, 0);
  cargo.material = [boxM, boxM, boxM, boxM, sideM, sideM];
  if (o.stripe) add(new THREE.BoxGeometry(0.04, 2.0, width - 0.1), cm(o.stripe), -len / 2 - 0.01, 1.83, 0);
  add(new THREE.BoxGeometry(0.03, 1.9, 0.03), dark, -len / 2 - 0.03, 1.83, 0);
  add(new RoundedBoxGeometry(0.18, 0.24, width + 0.02, 2, 0.05), dark, fx - 0.03, 0.55, 0);
  add(new THREE.BoxGeometry(0.16, 0.12, width - 0.2), dark, -len / 2 + 0.1, 0.5, 0);
  const lamps = fitLamps(s, { len, width, headY: 0.82, tailY: 0.62, rear: -len / 2 + 0.02 });
  return finish(s, o.box ?? '#f6f6f2', len, width, lamps, fitWheels(s, [fx - 0.85, -len / 2 + 1.25], width, 0.38));
}

// ------------------------------------------------------------------ bus

export interface BusOptions { color?: string; stripe?: string; clip?: THREE.Plane[] }

let busSignTex: THREE.Texture | null = null;

/** A small community bus doing its loop of the neighbourhood. */
export function bus(ctx: ModContext, o: BusOptions): Car {
  const s = shell(o.clip), { cm, add } = s;
  const len = 7.0, width = 2.1, H = 2.75;
  const body = cm(o.color ?? '#f4f2ea', { roughness: 0.3, metalness: 0.15, envMap: ctx.fx.envMap, envMapIntensity: 0.5 });
  const glassC = cm('#26313d', { roughness: 0.08, metalness: 0.6, envMap: ctx.fx.envMap });
  const dark = cm('#2c2f34', { roughness: 0.6 });
  add(new RoundedBoxGeometry(len, H - 0.3, width, 4, 0.28), body, 0, 0.3 + (H - 0.3) / 2, 0);
  add(new RoundedBoxGeometry(len - 0.6, 0.85, width + 0.02, 2, 0.08), glassC, -0.15, 1.85, 0);
  add(new RoundedBoxGeometry(0.1, 1.15, width - 0.25, 2, 0.04), glassC, len / 2 + 0.01, 1.75, 0);
  add(new THREE.BoxGeometry(len + 0.02, 0.16, width + 0.03), cm(o.stripe ?? '#3a9a6a', { roughness: 0.4 }), 0, 1.18, 0);
  add(new THREE.BoxGeometry(len * 0.92, 0.1, width + 0.03), cm('#f2c84b', { roughness: 0.4 }), -0.1, 0.98, 0);
  // the door on the kerb side (left, −z), front
  add(new THREE.BoxGeometry(0.9, 1.75, 0.03), glassC, len / 2 - 1.0, 1.25, -width / 2 - 0.01);
  busSignTex ??= canvasTex(256, 48, (c, w, h) => {
    c.fillStyle = '#121418'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffb347'; c.font = `700 30px ${FONT_JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('循環  桜坂', w / 2, h / 2 + 1);
  });
  const sign = cm('#ffffff', { map: busSignTex, emissiveMap: busSignTex, emissive: '#ffffff', emissiveIntensity: 0 });
  const sm = add(new THREE.PlaneGeometry(1.4, 0.26), sign, len / 2 + 0.02, H - 0.25, 0);
  sm.rotation.y = Math.PI / 2;
  add(new RoundedBoxGeometry(0.2, 0.26, width + 0.02, 2, 0.06), dark, len / 2 - 0.04, 0.5, 0);
  add(new RoundedBoxGeometry(0.2, 0.26, width + 0.02, 2, 0.06), dark, -len / 2 + 0.04, 0.5, 0);
  const lamps = fitLamps(s, { len, width, headY: 0.8, tailY: 0.85 });
  return finish(s, o.color ?? '#f4f2ea', len, width, lamps, fitWheels(s, [len / 2 - 1.35, -len / 2 + 1.45], width, 0.4),
    (l) => { sign.emissiveIntensity = l.engine ? 0.5 + 0.8 * l.head : 0; });
}
