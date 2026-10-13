// Street-level props around the store: vending machines, bicycles, umbrellas, bins, bollards, cones, rails, the cat.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { world } from '../core/stage.js';
import { mat, box, boxE, cyl, rod, V } from '../core/helpers.js';
import { glow, onFrame, pickable } from '../core/registry.js';
import { MAT } from '../core/materials.js';
import { rr } from '../core/rng.js';
import { PROD_COLORS } from '../core/palette.js';
import { vendTex, binTex } from '../textures/signage.js';
import { sfx } from '../audio/ambience.js';
import { STORE } from './layout.js';

const FL = STORE.floor;

// --- vending machines: click one and a can drops into the tray ---
const cans = [];
const canGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.2, 14);
function dropCan(machine) {
  const c = new THREE.Mesh(canGeo, mat(PROD_COLORS[Math.floor(Math.random() * PROD_COLORS.length)], { roughness: 0.3, metalness: 0.4 }));
  c.rotation.z = Math.PI / 2;
  c.position.set(rr(-0.15, 0.15), 1.05, 0.4);
  c.castShadow = true;
  machine.add(c);
  cans.push({ mesh: c, vy: 0, life: 0, machine });
}
onFrame((dt) => {
  for (let i = cans.length - 1; i >= 0; i--) {
    const k = cans[i];
    k.life += dt;
    if (k.mesh.position.y > 0.2) { k.vy -= 9.8 * dt; k.mesh.position.y = Math.max(0.2, k.mesh.position.y + k.vy * dt); }
    if (k.life > 3) k.mesh.scale.setScalar(Math.max(0.001, 1 - (k.life - 3) * 2));
    if (k.life > 3.5) { k.machine.remove(k.mesh); k.mesh.material.dispose(); cans.splice(i, 1); }
  }
});

export function vendingMachine(body, accent, seed, label = '自动贩卖机') {
  const g = new THREE.Group();
  const front = glow(new THREE.MeshStandardMaterial({ map: vendTex(body, accent, false, seed), emissiveMap: vendTex(body, accent, true, seed), emissive: '#ffffff', roughness: 0.35 }), 'vending', 1);
  const bm = mat(body, { roughness: 0.35, metalness: 0.1 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(1.0, 1.83, 0.75, 2, 0.05), [bm, bm, bm, bm, front, bm]);
  m.position.y = 0.05 + 0.915; m.castShadow = m.receiveShadow = true;
  g.add(m);
  box(g, 1.0, 0.05, 0.75, MAT.darkMetal, 0, 0, 0);
  g.userData.dispense = () => {
    front.userData.glow.boost = 1.6;
    dropCan(g);
    sfx.clunk();
  };
  pickable(g, g.userData.dispense, label);
  return g;
}
function recycleBin() {
  const g = new THREE.Group();
  const bm = mat('#e8e8e3');
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.8, 0.38, 2, 0.04), [bm, bm, bm, bm, mat('#fff', { map: binTex('#2a6fd6', '空き缶') }), bm]);
  m.position.y = 0.4; m.castShadow = true; g.add(m);
  return g;
}
[['#e04a45', '#a8262a', 11], ['#f3f5f8', '#2a6fd6', 23]].forEach(([b, a, s], i) => {
  const v = vendingMachine(b, a, s); v.position.set(-10.6 + i * 1.08, 0.08, -1.3); world.add(v);
});
[0, 1].forEach((i) => { const r = recycleBin(); r.position.set(-8.4 + i * 0.48, 0.08, -1.2); world.add(r); });
[['#3d78d6', '#1d4f9e', 37], ['#e04a45', '#a8262a', 41]].forEach(([b, a, s], i) => {
  const v = vendingMachine(b, a, s); v.rotation.y = Math.PI / 2; v.position.set(9.5, 0.08, -9.6 + i * 1.08); world.add(v);
});

// --- bicycles (mamachari) ---
function bicycle(color) {
  const g = new THREE.Group();
  const fm = mat(color, { roughness: 0.35, metalness: 0.3 });
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.03, 8, 28);
  const spokeM = mat('#a6acb2', { transparent: true, opacity: 0.35, metalness: 0.8, roughness: 0.3 });
  for (const x of [-0.52, 0.52]) {
    const w = new THREE.Mesh(wheelGeo, MAT.rubber); w.position.set(x, 0.36, 0); w.castShadow = true; g.add(w);
    const sp = new THREE.Mesh(new THREE.CircleGeometry(0.31, 16), spokeM); sp.position.set(x, 0.36, 0); g.add(sp);
  }
  const bb = V(-0.02, 0.36, 0), seat = V(-0.2, 0.92, 0), head = V(0.36, 0.9, 0);
  rod(g, bb, seat, 0.024, fm); rod(g, bb, V(0.4, 0.72, 0), 0.028, fm); rod(g, bb, V(-0.52, 0.36, 0), 0.02, fm);
  rod(g, V(-0.18, 0.82, 0), V(-0.52, 0.36, 0), 0.018, fm); rod(g, head, V(0.52, 0.36, 0), 0.022, MAT.chrome);
  rod(g, head, V(0.33, 1.06, 0), 0.022, MAT.chrome);
  rod(g, V(0.28, 1.06, -0.3), V(0.28, 1.06, 0.3), 0.018, MAT.chrome);
  box(g, 0.26, 0.07, 0.15, MAT.rubber, -0.21, 0.93, 0);
  box(g, 0.36, 0.24, 0.32, mat('#8a9096', { metalness: 0.5, roughness: 0.4 }), 0.66, 0.8, 0);
  box(g, 0.42, 0.03, 0.17, MAT.chrome, -0.45, 0.76, 0, { plain: true });
  box(g, 0.5, 0.12, 0.03, fm, -0.27, 0.32, 0.06, { plain: true });
  return g;
}
['#eef3f5', '#5b8fb0', '#e07a6a', '#4a4f57'].forEach((c, i) => {
  const b = bicycle(c); b.rotation.y = Math.PI / 2 + rr(-0.06, 0.06); b.position.set(-6.2 + i * 0.75, FL, -0.75); world.add(b);
});

// --- umbrella stand (vinyl umbrellas are a konbini staple) ---
{
  const g = new THREE.Group();
  boxE(g, -0.4, 0.4, 0, 0.06, -0.2, 0.2, MAT.chrome);
  boxE(g, -0.4, 0.4, 0.55, 0.6, -0.2, 0.2, MAT.chrome);
  for (const x of [-0.38, 0.38]) for (const z of [-0.18, 0.18]) cyl(g, 0.015, 0.015, 0.6, MAT.chrome, x, 0, z, 6);
  ['#eaf2f6', '#eaf2f6', '#2c3d66', '#c4474e', '#eaf2f6', '#3a7a5a'].forEach((c, i) => {
    const clear = c === '#eaf2f6';
    const um = mat(c, { roughness: 0.3, transparent: clear, opacity: clear ? 0.65 : 1 });
    const x = -0.28 + (i % 3) * 0.28, z = i < 3 ? -0.08 : 0.08;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.72, 10), um);
    cone.position.set(x, 0.42, z); cone.rotation.x = Math.PI; cone.rotation.z = rr(-0.08, 0.08); cone.castShadow = true; g.add(cone);
    rod(g, V(x, 0.75, z), V(x, 0.95, z), 0.012, MAT.darkMetal);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), MAT.rubber);
    h.position.set(x + 0.05, 0.95, z); g.add(h);
  });
  g.position.set(2.6, FL, -1.6);
  world.add(g);
}

// --- trash bins ---
[['#2a6fd6', 'びん・缶'], ['#14a05a', 'ペット'], ['#d7383b', 'もえる']].forEach(([c, l], i) => {
  const bm = mat('#e8e8e3', { roughness: 0.5 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.0, 0.5, 2, 0.05), [bm, bm, mat(c), bm, mat('#fff', { map: binTex(c, l) }), bm]);
  m.position.set(3.6 + i * 0.6, FL + 0.5, -1.65); m.castShadow = m.receiveShadow = true;
  world.add(m);
});

// --- bollards with reflective caps ---
for (const x of [-6.2, -3.6, -1.0, 4.2, 6.8, 9.4]) {
  cyl(world, 0.07, 0.07, 0.75, mat('#f4f4f0', { roughness: 0.4 }), x, FL, 0.45, 12);
  cyl(world, 0.075, 0.075, 0.08, glow(mat('#d7383b', { emissive: '#ff2a2a' }), 'lamp', 0.15), x, FL + 0.55, 0.45, 12, { cast: false });
}

// --- traffic cones ---
function cone(x, z) {
  const g = new THREE.Group();
  box(g, 0.42, 0.04, 0.42, mat('#33302c'), 0, 0, 0);
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 16), mat('#ff6a2a', { roughness: 0.5 }));
  c.position.y = 0.39; c.castShadow = true; g.add(c);
  cyl(g, 0.105, 0.125, 0.12, glow(mat('#ffffff', { emissive: '#ffffff' }), 'lamp', 0.12), 0, 0.3, 0, 16, { cast: false });
  g.position.set(x, 0.1, z); world.add(g);
}
cone(9.7, 5.8); cone(10.4, 4.9);

// --- white pipe guard rails ---
const railMat = mat('#f3f3f0', { roughness: 0.35, metalness: 0.15 });
function pipeRail(a, b, h = 0.8) {
  rod(world, V(a.x, h, a.z), V(b.x, h, b.z), 0.035, railMat);
  rod(world, V(a.x, h * 0.55, a.z), V(b.x, h * 0.55, b.z), 0.03, railMat);
  const n = Math.max(1, Math.round(a.distanceTo(b) / 2));
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    cyl(world, 0.04, 0.04, h, railMat, p.x, 0.08, p.z, 8);
  }
}
pipeRail(V(11.3, 0, -1.8), V(11.3, 0, 3.6));
pipeRail(V(-7.4, 0, 0.6), V(-7.4, 0, 7.2));
pipeRail(V(-28, 0, 9.65), V(-14.6, 0, 9.65));

// --- the cat sheltering under the awning: click it and it hops ---
export const cat = new THREE.Group();
{
  const cm = mat('#e19a4c', { roughness: 0.8 }), wm = mat('#f6f1e7', { roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), cm); body.scale.set(1, 1.25, 1.2); body.position.y = 0.2; cat.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), wm); chest.position.set(0, 0.2, 0.12); cat.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), cm); head.position.set(0, 0.45, 0.07); cat.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), cm); ear.position.set(s * 0.06, 0.55, 0.06); ear.rotation.z = -s * 0.25; cat.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), mat('#2a2a2a')); eye.position.set(s * 0.04, 0.47, 0.17); cat.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.06, -0.15), V(0.15, 0.04, -0.12), V(0.22, 0.05, 0.05), V(0.18, 0.1, 0.15)]), 12, 0.025, 6), cm);
  cat.add(tail);
  cat.userData.tail = tail;
  cat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  cat.position.set(-1.4, FL, -1.3); cat.rotation.y = 0.5;
  world.add(cat);
}
let hopT = -1;
pickable(cat, () => { if (hopT < 0) { hopT = 0; sfx.meow(); } }, '小猫');
onFrame((dt, t) => {
  cat.userData.tail.rotation.y = Math.sin(t * 1.3) * 0.25;   // idle tail sway
  if (hopT >= 0) {
    hopT += dt;
    const k = Math.min(1, hopT / 0.55);
    cat.position.y = FL + Math.sin(k * Math.PI) * 0.35;
    cat.rotation.y = 0.5 + Math.sin(k * Math.PI) * 0.6;
    const squash = 1 + Math.sin(k * Math.PI * 2) * 0.08;
    cat.scale.set(1 / squash, squash, 1 / squash);
    if (k >= 1) { hopT = -1; cat.scale.setScalar(1); cat.position.y = FL; }
  }
});
