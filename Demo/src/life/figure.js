// Little painted figures, like the people on a model railway layout.
// Jointed at hips, knees, shoulders and waist; they walk, sit, bow, wave and strike a few poses.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat } from '../core/helpers.js';
import { BRAND } from '../core/palette.js';
import { makeNobori, addSwayer, removeSwayer } from '../world/nobori.js';

export const R = (a, b) => a + (b - a) * Math.random();
export const pickR = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SKIN = ['#f3d2b8', '#ebc4a3', '#d9a883', '#f7dfca', '#c98f6a'];
const HAIR = ['#2b2522', '#3d2f27', '#5a4030', '#1f1f22', '#8a6a4a', '#c9c2b8', '#6b3f2a'];
const SHIRTS = ['#e8786a', '#5f8fc9', '#f2c14e', '#7cc47f', '#f3f1ea', '#a684cf', '#5aa7a0', '#e9a0b8', '#4a5468', '#f08a4b', '#9fc3e6'];
const PANTS = ['#3a4558', '#2f3540', '#6b5a4a', '#cfc6b2', '#5a6e8a', '#2b2b2e', '#7d8b6a'];
const SHOES = ['#2a2a2c', '#f2f2ee', '#6b4a35', '#8a2f2a', '#3c4a66'];
const UMBRELLAS = [['#eaf2f6', 0.55], ['#eaf2f6', 0.55], ['#2c3d66', 1], ['#c4474e', 1], ['#e9b949', 1], ['#3a7a5a', 1]];

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
};
const cache = new Map();
const M = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  if (!cache.has(k)) cache.set(k, mat(c, { roughness: 0.75, ...o }));
  return cache.get(k);
};
const mesh = (g, m, parent, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
};

// --- hand-held props ---
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
function makeCamera() {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(0.16, 0.1, 0.07, 2, 0.02), M('#26282c', { roughness: 0.4 }), g, 0, -0.02, 0.04);
  const lens = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), M('#4a4d52', { metalness: 0.6, roughness: 0.3 }), g, 0, -0.02, 0.1);
  lens.rotation.x = Math.PI / 2;
  return g;
}

export class Figure {
  constructor(o = {}) {
    this.kind = o.kind ?? 'normal';
    const root = this.root = new THREE.Group();
    const skin = M(o.skin ?? pickR(SKIN));
    let shirtC = o.shirt ?? pickR(SHIRTS), pantsC = o.pants ?? pickR(PANTS);
    if (this.kind === 'staff') { shirtC = '#f4f6f8'; pantsC = '#2f3540'; }
    const shirt = M(shirtC), pants = M(pantsC), hair = M(o.hair ?? pickR(HAIR)), shoe = M(o.shoes ?? pickR(SHOES));

    // legs: hip → thigh → knee → shin → shoe
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.86, 0); root.add(hip);
      mesh(geo.thigh, pants, hip);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      mesh(geo.shin, o.skirt ? skin : pants, knee);
      mesh(geo.shoe, shoe, knee, 0, -0.43, 0.04);
      return { hip, knee };
    });
    // upper body pivots at the waist so it can bow
    const upper = this.upper = new THREE.Group(); upper.position.y = 0.86; root.add(upper);
    mesh(geo.torso, shirt, upper, 0, 0.31, 0);
    if (o.skirt) mesh(geo.skirt, M(o.skirt), upper, 0, -0.1, 0);
    // arms: index 0 is the figure's right arm (it faces +z, so its right is −x)
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.275, 0.56, 0); upper.add(sh);
      mesh(geo.arm, o.shortSleeve ? skin : shirt, sh);
      mesh(geo.hand, skin, sh, 0, -0.62, 0);
      const hold = new THREE.Group(); hold.position.y = -0.64; sh.add(hold);
      return { sh, hold, side: s };
    });
    this.head = mesh(geo.head, skin, upper, 0, 0.76, 0);
    const h = mesh(geo.hair, hair, upper, 0, 0.78, -0.01); h.rotation.x = -0.28;
    if (o.longHair) mesh(geo.longHair, hair, upper, 0, 0.66, -0.1);

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

    root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.cur = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, armR: 0, armL: 0, armRz: 0, armLz: 0, waist: 0, head: 0 };
    this.moving = false;
    this.speed = 0;
    this.phase = Math.random() * 6;
    this.pose = 'idle';
    this.gesture = null;
    this.gestureT = 0;
    this.prop = null;
    this.propName = null;
    this.umbrella = null;
    this.umbrellaOn = 0;
    this.wantsUmbrella = false;
    this.flash = 0;
    this.visibleScale = 0;   // fades in on spawn, out on leave
    this.leaving = false;
    root.scale.setScalar(0.001);
  }

  // Swap what's in the right hand: 'bag' | 'can' | 'camera' | 'flag:N' | null
  hold(name) {
    if (this.propName === name) return;
    if (this.prop) {
      this.prop.parent.remove(this.prop);
      if (this.propName?.startsWith('flag')) removeSwayer(this.prop);
    }
    this.prop = null; this.propName = name;
    if (!name) return;
    if (name.startsWith('flag')) {
      // carried upright beside the body, so it lives on the root rather than the hand
      const f = makeNobori(Number(name.split(':')[1]));
      f.position.set(-0.36, 0.22, 0.12);
      f.scale.setScalar(0.92);
      this.root.add(f);
      addSwayer(f);
      this.prop = f;
      return;
    }
    const p = name === 'bag' ? makeBag() : name === 'can' ? makeCan() : makeCamera();
    this.arms[0].hold.add(p);
    this.prop = p;
  }

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
    this.wantsUmbrella = true;
  }

  play(gesture, seconds) { this.gesture = gesture; this.gestureT = seconds; }

  update(dt, t) {
    // spawn / leave scale
    const targetScale = this.leaving ? 0 : 1;
    this.visibleScale += (targetScale - this.visibleScale) * Math.min(1, dt * 5);
    this.root.scale.setScalar(Math.max(0.001, this.visibleScale));

    const T = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, armR: 0.04, armL: 0.04, armRz: -0.06, armLz: 0.06, waist: 0, head: 0 };
    let bob = 0;
    if (this.moving) {
      this.phase += dt * this.speed * 5.6;
      const sw = Math.sin(this.phase);
      T.hipL = -sw * 0.5; T.hipR = sw * 0.5;
      T.kneeL = Math.max(0, sw) * 0.55; T.kneeR = Math.max(0, -sw) * 0.55;
      T.armL = sw * 0.42; T.armR = -sw * 0.42;
      bob = Math.abs(Math.cos(this.phase)) * 0.03;
    } else {
      T.armL += Math.sin(t * 1.2 + this.phase) * 0.02;   // idle breathing sway
    }

    switch (this.pose) {
      case 'browse': T.armR = -1.15; T.head = 0.15; T.waist = 0.08; break;
      case 'pay': T.armR = -0.95; T.armL = -0.3; break;
      case 'photo': T.armR = -1.5; T.armL = -1.45; T.armRz = 0.35; T.armLz = -0.35; break;
      case 'peace': T.armR = -2.7; T.armRz = -0.25; T.armL = -0.35; T.armLz = 0.55; T.head = -0.08; break;
      case 'stretch': T.armR = -3.0; T.armL = -3.0; T.armRz = 0.15; T.armLz = -0.15; T.head = -0.25; break;
      case 'sit': T.hipL = T.hipR = -1.45; T.kneeL = T.kneeR = 1.45; T.armR = -0.45; T.armL = -0.45; break;
      case 'place': T.armR = -1.0; T.armL = -0.6; T.waist = 0.35; break;
      case 'carry': T.armR = -0.35; T.armRz = -0.25; break;
      case 'drink': {
        const sip = (t % 4.5) < 1.4;
        T.armR = sip ? -2.4 : -0.7; T.armRz = sip ? 0.5 : 0; T.head = sip ? -0.3 : 0.05;
        if (this.sitting) T.armL = -0.45;
        break;
      }
      default: break;
    }
    if (this.sitting) { T.hipL = T.hipR = -1.45; T.kneeL = T.kneeR = 1.45; }
    if (this.propName === 'bag' && this.moving) T.armR *= 0.4;
    if (this.propName?.startsWith('flag')) { T.armR = -0.35; T.armRz = -0.3; }

    // umbrella: open only when out in the rain
    const umb = this.wantsUmbrella && !this.sheltered;
    this.umbrellaOn += ((umb ? 1 : 0) - this.umbrellaOn) * Math.min(1, dt * 4);
    if (this.umbrella) {
      this.umbrella.visible = this.umbrellaOn > 0.02;
      this.umbrella.scale.set(this.umbrellaOn, 1, this.umbrellaOn);
      if (this.umbrellaOn > 0.3 && !this.propName?.startsWith('flag')) { T.armR = -0.75; T.armRz = 0.25; }
    }

    if (this.gestureT > 0) {
      this.gestureT -= dt;
      if (this.gesture === 'bow') T.waist = 0.55 * Math.sin(Math.min(1, (1.4 - this.gestureT) / 1.4) * Math.PI);
      if (this.gesture === 'wave') { T.armL = -2.75; T.armLz = -0.3 + Math.sin(t * 12) * 0.3; T.head = -0.05; }
      if (this.gestureT <= 0) this.gesture = null;
    }

    const k = Math.min(1, dt * 9), c = this.cur;
    for (const key in T) c[key] += (T[key] - c[key]) * k;
    const [lr, ll] = [this.legs[0], this.legs[1]];
    lr.hip.rotation.x = c.hipR; ll.hip.rotation.x = c.hipL;
    lr.knee.rotation.x = c.kneeR; ll.knee.rotation.x = c.kneeL;
    const [ar, al] = this.arms;
    ar.sh.rotation.x = c.armR; ar.sh.rotation.z = c.armRz;
    al.sh.rotation.x = c.armL; al.sh.rotation.z = c.armLz;
    this.upper.rotation.x = c.waist;
    this.upper.position.y = 0.86 + bob;
    this.head.rotation.x = c.head;
  }

  dispose() {
    this.hold(null);
    this.root.parent?.remove(this.root);
  }
}

// --- a shiba for the occasional dog walker ---
export class Dog {
  constructor() {
    const root = this.root = new THREE.Group();
    const fur = M('#d9944f'), white = M('#f6efe2'), dark = M('#2a2a2a');
    const body = mesh(new RoundedBoxGeometry(0.22, 0.2, 0.5, 2, 0.08), fur, root, 0, 0.32, 0);
    mesh(new RoundedBoxGeometry(0.16, 0.12, 0.3, 2, 0.05), white, body, 0, -0.06, 0.05);
    const head = this.head = new THREE.Group(); head.position.set(0, 0.48, 0.28); root.add(head);
    mesh(new RoundedBoxGeometry(0.18, 0.16, 0.17, 2, 0.06), fur, head);
    mesh(new RoundedBoxGeometry(0.1, 0.08, 0.1, 2, 0.03), white, head, 0, -0.03, 0.11);
    mesh(new THREE.SphereGeometry(0.018, 8, 6), dark, head, 0, -0.01, 0.165);
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur, head, s * 0.055, 0.11, -0.01); e.rotation.y = Math.PI / 4;
    }
    const tail = mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 12, Math.PI * 1.5), fur, root, 0, 0.47, -0.24);
    tail.rotation.y = Math.PI / 2;
    this.tail = tail;
    this.legs = [[-0.07, 0.17], [0.07, 0.17], [-0.07, -0.17], [0.07, -0.17]].map(([x, z]) => {
      const p = new THREE.Group(); p.position.set(x, 0.24, z); root.add(p);
      mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.24, 8).translate(0, -0.12, 0), fur, p);
      return p;
    });
    root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.phase = 0;
    root.scale.setScalar(0.001);
  }
  update(dt, t, moving, speed, scale) {
    this.root.scale.setScalar(Math.max(0.001, scale));
    if (moving) this.phase += dt * speed * 9;
    const sw = moving ? Math.sin(this.phase) * 0.6 : 0;
    this.legs[0].rotation.x = sw; this.legs[3].rotation.x = sw;
    this.legs[1].rotation.x = -sw; this.legs[2].rotation.x = -sw;
    this.tail.rotation.z = Math.sin(t * 8) * 0.25;
    this.head.rotation.y = moving ? 0 : Math.sin(t * 0.9) * 0.4;
  }
}
