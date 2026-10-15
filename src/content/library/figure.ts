// Little painted figures, like the people on a model railway layout — jointed at hips, knees, shoulders
// and waist. They walk, sit, bow, wave and strike a few poses, and can hold small props.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModContext } from '../../engine/mod';
import type { Walker } from '../../engine/agents/actor';
import type { Drivers } from '../../engine/atmosphere';
import { mat, canvasTex, fader, type Fader } from '../../engine/kit/build';
import { pickR } from '../../engine/kit/rng';
import { BRAND } from '../common/palette';
import type { Nobori, NoboriDesign } from './props';

const SKIN = ['#f3d2b8', '#ebc4a3', '#d9a883', '#f7dfca', '#c98f6a'];
const HAIR = ['#2b2522', '#3d2f27', '#5a4030', '#1f1f22', '#8a6a4a', '#c9c2b8', '#6b3f2a'];
const SHIRTS = ['#e8786a', '#5f8fc9', '#f2c14e', '#7cc47f', '#f3f1ea', '#a684cf', '#5aa7a0', '#e9a0b8', '#4a5468', '#f08a4b', '#9fc3e6'];
const PANTS = ['#3a4558', '#2f3540', '#6b5a4a', '#cfc6b2', '#5a6e8a', '#2b2b2e', '#7d8b6a'];
const SHOES = ['#2a2a2c', '#f2f2ee', '#6b4a35', '#8a2f2a', '#3c4a66'];
const SKIRTS = ['#c46b5a', '#5a6e8a', '#d9b46a', '#7d6a9a', '#3f4a5c'];
const UMBRELLAS: [string, number][] = [['#eaf2f6', 0.55], ['#eaf2f6', 0.55], ['#2c3d66', 1], ['#c4474e', 1], ['#e9b949', 1], ['#3a7a5a', 1]];

export type FigureKind = 'normal' | 'staff' | 'tourist';
export interface FigureOptions {
  kind?: FigureKind;
  skin?: string; hair?: string; shirt?: string; pants?: string; shoes?: string;
  /** colour of a skirt, or null for trousers; omitted = random */
  skirt?: string | null;
  longHair?: boolean;
  shortSleeve?: boolean;
  umbrella?: boolean;
  /** a scarf for cold days */
  scarf?: boolean;
  /** a winter coat in this colour (over the shirt, down to the thighs) */
  coat?: string;
  /** a yukata in this colour, for summer festival evenings (short steps, geta) */
  yukata?: string;
  hat?: FigureHat;
}
export type FigureHat = 'straw' | 'knit' | 'santa' | 'cap';
export const COATS = ['#3a4558', '#6b5a4a', '#2b2b2e', '#8a3a36', '#c9b48a', '#4a6a5a', '#e8e2d6'];
export const YUKATA = ['#2c3d66', '#f3eee2', '#e9a0b8', '#3a7a5a', '#a684cf', '#1f2a3a'];
export type HeldProp = 'bag' | 'can' | 'camera' | 'crate' | `flag:${NoboriDesign}` | null;

const geo = {
  thigh: new THREE.CylinderGeometry(0.08, 0.07, 0.42, 10).translate(0, -0.21, 0),
  shin: new THREE.CylinderGeometry(0.068, 0.058, 0.42, 10).translate(0, -0.21, 0),
  shoe: new RoundedBoxGeometry(0.12, 0.07, 0.22, 2, 0.03),
  arm: new THREE.CylinderGeometry(0.056, 0.048, 0.6, 10).translate(0, -0.3, 0),
  hand: new THREE.SphereGeometry(0.052, 10, 8),
  torso: new RoundedBoxGeometry(0.44, 0.62, 0.26, 3, 0.1),
  head: new THREE.SphereGeometry(0.125, 18, 14),
  hair: new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
  longHair: new RoundedBoxGeometry(0.25, 0.32, 0.1, 2, 0.04),
  skirt: new THREE.CylinderGeometry(0.2, 0.3, 0.46, 16),
  robe: new THREE.CylinderGeometry(0.2, 0.24, 0.8, 16),
  coat: new RoundedBoxGeometry(0.48, 0.9, 0.31, 3, 0.1),
};
const cache = new Map<string, THREE.MeshStandardMaterial>();
const M = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => {
  const k = c + JSON.stringify(o);
  if (!cache.has(k)) cache.set(k, mat(c, { roughness: 0.75, ...o }));
  return cache.get(k)!;
};
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
};

// yukata cloth: a plain ground with small flowers scattered over it
const yukataCache = new Map<string, THREE.MeshStandardMaterial>();
function yukataMat(color: string) {
  if (!yukataCache.has(color)) {
    const light = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
    const tex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      const ink = light ? ['#2c3d66', '#c4474e'] : ['#f3eee2', '#f2b8c8'];
      for (const [x, y, r, i] of [[12, 14, 6, 0], [44, 30, 7, 1], [22, 50, 5, 0], [54, 58, 4, 1], [36, 6, 4, 1]]) {
        g.fillStyle = ink[i];
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, 0, 7); g.fill(); }
      }
    }, true);
    tex.repeat.set(2, 2);
    yukataCache.set(color, mat('#ffffff', { map: tex, roughness: 0.8 }));
  }
  return yukataCache.get(color)!;
}

function makeHat(kind: FigureHat) {
  const g = new THREE.Group();
  if (kind === 'straw') {
    const straw = M('#e6cf8e');
    mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.015, 20), straw, g, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.1, 18), straw, g, 0, 0.05, 0);
    mesh(new THREE.CylinderGeometry(0.137, 0.137, 0.025, 18), M('#3a4558'), g, 0, 0.02, 0);
  } else if (kind === 'cap') {
    const c = M(pickR(['#2c3d66', '#c4474e', '#f3f1ea', '#3a7a5a']));
    mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, g, 0, -0.02, 0);
    const bill = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), c, g, 0, -0.01, 0.1);
    bill.scale.z = 0.9;
  } else if (kind === 'knit') {
    const c = M(pickR(['#c4474e', '#e9b949', '#3a7a5a', '#e8e2d6', '#5a6e8a']));
    mesh(new THREE.SphereGeometry(0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, g, 0, -0.03, 0);
    mesh(new THREE.TorusGeometry(0.135, 0.025, 6, 18), c, g, 0, -0.02, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.045, 10, 8), M('#f6f3ec'), g, 0, 0.13, 0);
  } else {
    // santa
    const red = M('#c4282e'), white = M('#f6f3ec');
    mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), white, g, 0, -0.01, 0).rotation.x = Math.PI / 2;
    const cone = mesh(new THREE.ConeGeometry(0.13, 0.3, 14), red, g, 0.03, 0.13, -0.02);
    cone.rotation.z = -0.35;
    mesh(new THREE.SphereGeometry(0.04, 10, 8), white, g, 0.12, 0.26, -0.02);
  }
  return g;
}

function makeBag() {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(0.3, 0.32, 0.12, 2, 0.04), M('#f4f6f8', { transparent: true, opacity: 0.88, roughness: 0.3 }), g, 0, -0.2, 0);
  mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), M('#f4f6f8'), g, 0, -0.04, 0);
  mesh(new THREE.BoxGeometry(0.06, 0.08, 0.13), M(BRAND.green), g, -0.07, -0.2, 0);
  return g;
}
function makeCan() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), M(pickR(['#c8553d', '#2f6db5', '#e2b13c', '#3a7a5a']), { metalness: 0.4, roughness: 0.3 }), g, 0, -0.02, 0.03);
  return g;
}
/** a stack of folding delivery crates, carried in front with both hands */
function makeCrates() {
  const g = new THREE.Group();
  ['#3d78d6', '#e8863a'].forEach((c, i) => mesh(new RoundedBoxGeometry(0.46, 0.2, 0.34, 2, 0.03), M(c, { roughness: 0.5 }), g, 0, i * 0.21, 0));
  mesh(new THREE.BoxGeometry(0.4, 0.06, 0.28), M('#f6efe0'), g, 0, 0.33, 0);
  return g;
}
function makeCamera() {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(0.16, 0.1, 0.07, 2, 0.02), M('#26282c', { roughness: 0.4 }), g, 0, -0.02, 0.04);
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), M('#4a4d52', { metalness: 0.6, roughness: 0.3 }), g, 0, -0.02, 0.1).rotation.x = Math.PI / 2;
  return g;
}

interface Limb { hip: THREE.Group; knee: THREE.Group }
interface Arm { sh: THREE.Group; hold: THREE.Group }

export class Figure implements Walker {
  readonly root = new THREE.Group();
  readonly kind: FigureKind;
  readonly upper = new THREE.Group();
  readonly legs: Limb[];
  /** [0] is the figure's right arm (it faces +z, so its right is −x) */
  readonly arms: Arm[];
  readonly head: THREE.Mesh;
  moving = false;
  speed = 0;
  pose = 'idle';
  sitting = false;
  sheltered = false;
  leaving = false;
  visibleScale = 0;
  private cur = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, armR: 0, armL: 0, armRz: 0, armLz: 0, waist: 0, head: 0 };
  private phase = Math.random() * 6;
  private gesture: string | null = null;
  private gestureT = 0;
  private prop: THREE.Object3D | null = null;
  private flag: Nobori | null = null;
  private propName: HeldProp = null;
  private umbrella: THREE.Group | null = null;
  private umbrellaOn = 0;
  private hat: THREE.Group | null = null;
  /** step length; short steps in a yukata and geta */
  private stride = 1;
  /** people fade in when they appear and out when they go, like vehicles at the edge of the model */
  private fade: Fader;

  constructor(private ctx: ModContext, o: FigureOptions = {}) {
    this.kind = o.kind ?? 'normal';
    const root = this.root;
    const skirt = o.skirt === undefined ? (this.kind === 'normal' && Math.random() < 0.3 ? pickR(SKIRTS) : null) : o.skirt;
    const longHair = o.longHair ?? (!!skirt || Math.random() < 0.2);
    const skin = M(o.skin ?? pickR(SKIN));
    let shirtC = o.shirt ?? pickR(SHIRTS), pantsC = o.pants ?? pickR(PANTS);
    if (this.kind === 'staff') { shirtC = '#f4f6f8'; pantsC = '#2f3540'; }
    const yukata = o.yukata ? yukataMat(o.yukata) : null;
    const shirt = yukata ?? M(shirtC), pants = yukata ?? M(pantsC), hair = M(o.hair ?? pickR(HAIR));
    const shoe = yukata ? M('#9a7350') : M(o.shoes ?? pickR(SHOES));
    const sleeve = yukata ?? (o.coat ? M(o.coat) : o.shortSleeve ? skin : shirt);
    if (yukata) this.stride = 0.55;

    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.86, 0); root.add(hip);
      mesh(geo.thigh, pants, hip);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      mesh(geo.shin, skirt && !yukata ? skin : pants, knee);
      mesh(geo.shoe, shoe, knee, 0, -0.43, 0.04);
      return { hip, knee };
    });
    const upper = this.upper;
    upper.position.y = 0.86;
    root.add(upper);
    mesh(geo.torso, shirt, upper, 0, 0.31, 0);
    if (yukata) {
      mesh(geo.robe, yukata, upper, 0, -0.38, 0);
      mesh(new THREE.BoxGeometry(0.46, 0.13, 0.29), M(pickR(['#e9b949', '#c4474e', '#f08a4b', '#f3eee2'])), upper, 0, 0.1, 0);
    } else if (skirt) mesh(geo.skirt, M(skirt), upper, 0, -0.1, 0);
    if (o.coat && !yukata) mesh(geo.coat, M(o.coat, { roughness: 0.85 }), upper, 0, 0.17, 0);
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.275, 0.56, 0); upper.add(sh);
      mesh(geo.arm, sleeve, sh);
      mesh(geo.hand, skin, sh, 0, -0.62, 0);
      const hold = new THREE.Group(); hold.position.y = -0.64; sh.add(hold);
      return { sh, hold };
    });
    this.head = mesh(geo.head, skin, upper, 0, 0.76, 0);
    mesh(geo.hair, hair, upper, 0, 0.78, -0.01).rotation.x = -0.28;
    if (longHair) mesh(geo.longHair, hair, upper, 0, 0.66, -0.1);

    if (this.kind === 'staff') {
      mesh(new RoundedBoxGeometry(0.46, 0.5, 0.27, 2, 0.06), M(BRAND.green, { roughness: 0.6 }), upper, 0, 0.24, 0.01);
      mesh(new THREE.BoxGeometry(0.47, 0.04, 0.28), M(BRAND.orange), upper, 0, 0.44, 0.01);
      mesh(new THREE.BoxGeometry(0.09, 0.05, 0.01), M('#ffffff'), upper, -0.1, 0.36, 0.145);
    }
    if (this.kind === 'tourist') {
      mesh(new RoundedBoxGeometry(0.32, 0.4, 0.17, 2, 0.06), M(pickR(['#d9643a', '#3b6fb0', '#5a8a5c', '#e2b13c'])), upper, 0, 0.32, -0.2);
      mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), M('#efe4c8'), upper, 0, 0.86, 0);
      mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.1, 18), M('#efe4c8'), upper, 0, 0.9, 0);
    }
    if (o.scarf) {
      const sc = M(pickR(['#c4474e', '#e9b949', '#3a7a5a', '#2c3d66', '#e8e2d6']));
      const ring = mesh(new THREE.TorusGeometry(0.13, 0.05, 8, 18), sc, upper, 0, 0.64, 0);
      ring.rotation.x = Math.PI / 2;
      mesh(new RoundedBoxGeometry(0.08, 0.22, 0.04, 2, 0.015), sc, upper, -0.08, 0.5, 0.14);
    }
    if (o.umbrella) this.giveUmbrella();
    if (o.hat) this.setHat(o.hat);
    this.fade = fader(root);
    this.fade.set(0);
  }

  /** Put a hat on (or take it off with null). */
  setHat(kind: FigureHat | null) {
    this.hat?.parent?.remove(this.hat);
    this.hat = kind ? makeHat(kind) : null;
    if (this.hat) { this.hat.position.set(0, 0.86, -0.01); this.upper.add(this.hat); }
  }

  /** What's in the right hand. Flags are carried upright beside the body. */
  hold(name: HeldProp) {
    if (this.propName === name) return;
    this.prop?.parent?.remove(this.prop);
    this.prop = null; this.flag = null;
    this.propName = name;
    if (!name) return;
    if (name.startsWith('flag:')) {
      const f = this.ctx.prefabs.create('nobori', { design: name.slice(5) as NoboriDesign });
      f.root.position.set(-0.36, 0.22, 0.12);
      f.root.scale.setScalar(0.92);
      this.root.add(f.root);
      this.prop = f.root; this.flag = f;
      return;
    }
    if (name === 'crate') {
      const c = makeCrates();
      c.position.set(0, 1.0, 0.32);
      this.root.add(c);
      this.prop = c;
      return;
    }
    const p = name === 'bag' ? makeBag() : name === 'can' ? makeCan() : makeCamera();
    this.arms[0].hold.add(p);
    this.prop = p;
  }
  get holding() { return this.propName; }

  giveUmbrella() {
    if (this.umbrella) return;
    const [c, op] = pickR(UMBRELLAS);
    const m = M(c, { transparent: op < 1, opacity: op, roughness: 0.25, side: THREE.DoubleSide });
    const g = new THREE.Group();
    mesh(new THREE.ConeGeometry(0.62, 0.28, 10, 1, true), m, g, 0, 0.14, 0);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6), M('#d0d4d8', { metalness: 0.6 }), g, 0, -0.45, 0);
    g.position.set(-0.12, 2.02, 0.12);
    g.rotation.x = 0.12;
    this.root.add(g);
    this.umbrella = g;
  }

  play(gesture: string, seconds: number) { this.gesture = gesture; this.gestureT = seconds; }

  update(dt: number, t: number, d: Drivers) {
    this.visibleScale += ((this.leaving ? 0 : 1) - this.visibleScale) * Math.min(1, dt * 5);
    this.fade.set(this.visibleScale > 0.995 ? 1 : this.visibleScale);

    const T = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, armR: 0.04, armL: 0.04, armRz: -0.06, armLz: 0.06, waist: 0, head: 0 };
    let bob = 0;
    if (this.moving) {
      this.phase += (dt * this.speed * 5.6) / Math.sqrt(this.stride);
      const sw = Math.sin(this.phase) * this.stride;
      T.hipL = -sw * 0.5; T.hipR = sw * 0.5;
      T.kneeL = Math.max(0, sw) * 0.55; T.kneeR = Math.max(0, -sw) * 0.55;
      T.armL = sw * 0.42; T.armR = -sw * 0.42;
      bob = Math.abs(Math.cos(this.phase)) * 0.03;
    } else {
      T.armL += Math.sin(t * 1.2 + this.phase) * 0.02;
    }
    switch (this.pose) {
      case 'browse': T.armR = -1.15; T.head = 0.15; T.waist = 0.08; break;
      case 'pay': T.armR = -0.95; T.armL = -0.3; break;
      case 'photo': T.armR = -1.5; T.armL = -1.45; T.armRz = 0.35; T.armLz = -0.35; break;
      case 'peace': T.armR = -2.7; T.armRz = -0.25; T.armL = -0.35; T.armLz = 0.55; T.head = -0.08; break;
      case 'stretch': T.armR = -3.0; T.armL = -3.0; T.armRz = 0.15; T.armLz = -0.15; T.head = -0.25; break;
      case 'sit': T.armR = -0.45; T.armL = -0.45; break;
      case 'place': T.armR = -1.0; T.armL = -0.6; T.waist = 0.35; break;
      case 'drink': {
        const sip = t % 4.5 < 1.4;
        T.armR = sip ? -2.4 : -0.7; T.armRz = sip ? 0.5 : 0; T.head = sip ? -0.3 : 0.05;
        if (this.sitting) T.armL = -0.45;
        break;
      }
      default: break;
    }
    if (this.sitting) { T.hipL = T.hipR = -1.45; T.kneeL = T.kneeR = 1.45; }
    if (this.propName === 'bag' && this.moving) T.armR *= 0.4;
    if (this.propName === 'crate') { T.armR = T.armL = -1.05; T.armRz = 0.2; T.armLz = -0.2; }
    if (this.flag) {
      T.armR = -0.35; T.armRz = -0.3;
      this.flag.update(t, d.wind);
    }
    // umbrella: open only when out in the rain
    const wantUmbrella = !!this.umbrella && (d.rain > 0.3 || d.snow > 0.3) && !this.sheltered;
    this.umbrellaOn += ((wantUmbrella ? 1 : 0) - this.umbrellaOn) * Math.min(1, dt * 4);
    if (this.umbrella) {
      this.umbrella.visible = this.umbrellaOn > 0.02;
      this.umbrella.scale.set(this.umbrellaOn, 1, this.umbrellaOn);
      if (this.umbrellaOn > 0.3 && !this.flag) { T.armR = -0.75; T.armRz = 0.25; }
    }
    if (this.gestureT > 0) {
      this.gestureT -= dt;
      if (this.gesture === 'bow') T.waist = 0.55 * Math.sin(Math.min(1, (1.4 - this.gestureT) / 1.4) * Math.PI);
      if (this.gesture === 'wave') { T.armL = -2.75; T.armLz = -0.3 + Math.sin(t * 12) * 0.3; T.head = -0.05; }
      if (this.gestureT <= 0) this.gesture = null;
    }

    const k = Math.min(1, dt * 9), c = this.cur;
    for (const key in T) {
      const kk = key as keyof typeof T;
      c[kk] += (T[kk] - c[kk]) * k;
    }
    this.legs[0].hip.rotation.x = c.hipR; this.legs[1].hip.rotation.x = c.hipL;
    this.legs[0].knee.rotation.x = c.kneeR; this.legs[1].knee.rotation.x = c.kneeL;
    this.arms[0].sh.rotation.set(c.armR, 0, c.armRz);
    this.arms[1].sh.rotation.set(c.armL, 0, c.armLz);
    this.upper.rotation.x = c.waist;
    this.upper.position.y = 0.86 + bob;
    this.head.rotation.x = c.head;
  }

  dispose() {
    this.hold(null);
    this.root.parent?.remove(this.root);
    this.fade.dispose();
  }
}

/** A shiba for the occasional dog walker. */
export class Dog {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  private legs: THREE.Group[];
  private tail: THREE.Mesh;
  private phase = 0;
  private fade: Fader;

  constructor() {
    const root = this.root;
    const fur = M('#d9944f'), white = M('#f6efe2'), dark = M('#2a2a2a');
    const body = mesh(new RoundedBoxGeometry(0.22, 0.2, 0.5, 2, 0.08), fur, root, 0, 0.32, 0);
    mesh(new RoundedBoxGeometry(0.16, 0.12, 0.3, 2, 0.05), white, body, 0, -0.06, 0.05);
    this.head.position.set(0, 0.48, 0.28); root.add(this.head);
    mesh(new RoundedBoxGeometry(0.18, 0.16, 0.17, 2, 0.06), fur, this.head);
    mesh(new RoundedBoxGeometry(0.1, 0.08, 0.1, 2, 0.03), white, this.head, 0, -0.03, 0.11);
    mesh(new THREE.SphereGeometry(0.018, 8, 6), dark, this.head, 0, -0.01, 0.165);
    for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur, this.head, s * 0.055, 0.11, -0.01).rotation.y = Math.PI / 4;
    this.tail = mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 12, Math.PI * 1.5), fur, root, 0, 0.47, -0.24);
    this.tail.rotation.y = Math.PI / 2;
    this.legs = [[-0.07, 0.17], [0.07, 0.17], [-0.07, -0.17], [0.07, -0.17]].map(([x, z]) => {
      const p = new THREE.Group(); p.position.set(x, 0.24, z); root.add(p);
      mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.24, 8).translate(0, -0.12, 0), fur, p);
      return p;
    });
    this.fade = fader(root);
    this.fade.set(0);
  }

  dispose() { this.fade.dispose(); }

  /** presence: its walker's (it fades in and out with them) */
  update(dt: number, t: number, moving: boolean, speed: number, presence: number) {
    this.fade.set(presence > 0.995 ? 1 : presence);
    if (moving) this.phase += dt * speed * 9;
    const sw = moving ? Math.sin(this.phase) * 0.6 : 0;
    this.legs[0].rotation.x = sw; this.legs[3].rotation.x = sw;
    this.legs[1].rotation.x = -sw; this.legs[2].rotation.x = -sw;
    this.tail.rotation.z = Math.sin(t * 8) * 0.25;
    this.head.rotation.y = moving ? 0 : Math.sin(t * 0.9) * 0.4;
  }
}
