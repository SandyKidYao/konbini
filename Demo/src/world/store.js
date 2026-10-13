// ひかりマート — the konbini: shell, glazing, signage, awnings, interior, rooftop, pole sign.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { world } from '../core/stage.js';
import { mat, box, boxE, cyl, rod, V, canvasTex, JP } from '../core/helpers.js';
import { glow, onFrame, pickable } from '../core/registry.js';
import { sfx } from '../audio/ambience.js';
import { MAT, glassMat, tileMat } from '../core/materials.js';
import { rr, pick } from '../core/rng.js';
import { BRAND, PROD_COLORS } from '../core/palette.js';
import { floorTex, fanTex } from '../textures/surfaces.js';
import { signTex, sideSignTex, poleSignTex, coolerTex, cigTex, posterTex } from '../textures/signage.js';
import { STORE } from './layout.js';

export const store = new THREE.Group();
world.add(store);
const { x0: SX0, x1: SX1, z0: SZ0, z1: SZ1, h: SH, floor: FL, glassTop: GT } = STORE;

// apron, floor slab, side terrace
boxE(store, -7.2, 10.9, 0.08, FL, -2, 0.25, tileMat, { uv: 1.2, cast: false });
boxE(store, SX0, SX1, 0.08, FL, SZ0, SZ1, mat('#ffffff', { map: floorTex, roughness: 0.35 }), { uv: 1.2, cast: false, plain: true });
boxE(store, 9, 10.9, 0.08, FL, -6.3, -2, tileMat, { uv: 1.2, cast: false });

// shell
const wallM = MAT.wall;
boxE(store, SX0, SX0 + 0.2, FL, SH, SZ0, SZ1, wallM, { uv: 1.8 });
boxE(store, SX0, SX1, FL, SH, SZ0, SZ0 + 0.2, wallM, { uv: 1.8 });
boxE(store, SX1 - 0.2, SX1, FL, SH, SZ0, -6.1, wallM, { uv: 1.8 });
boxE(store, SX1 - 0.2, SX1, GT, SH, -6.1, SZ1, wallM, { uv: 1.8 });
boxE(store, SX0, SX1, GT, SH, SZ1 - 0.2, SZ1, wallM, { uv: 1.8 });
boxE(store, SX0 + 0.2, SX1 - 0.2, 4.25, 4.35, SZ0 + 0.2, SZ1 - 0.2, MAT.roof, { cast: false, plain: true });
const skirtMat = mat('#6a6f77', { roughness: 0.7 });
boxE(store, SX0 - 0.03, SX0, FL, 0.6, SZ0, SZ1, skirtMat, { cast: false, plain: true });
boxE(store, SX0, SX1, FL, 0.6, SZ0 - 0.03, SZ0, skirtMat, { cast: false, plain: true });
boxE(store, SX1, SX1 + 0.03, FL, 0.6, SZ0, -6.1, skirtMat, { cast: false, plain: true });
// parapet coping
boxE(store, SX0 - 0.05, SX1 + 0.05, SH, SH + 0.1, SZ0 - 0.05, SZ0 + 0.25, MAT.coping);
boxE(store, SX0 - 0.05, SX1 + 0.05, SH, SH + 0.1, SZ1 - 0.25, SZ1 + 0.05, MAT.coping);
boxE(store, SX0 - 0.05, SX0 + 0.25, SH, SH + 0.1, SZ0, SZ1, MAT.coping);
boxE(store, SX1 - 0.25, SX1 + 0.05, SH, SH + 0.1, SZ0, SZ1, MAT.coping);

// front glazing + mullions (the door bay x∈[0,2] is handled by the sliding doors below)
const mullX = [-6.8, -4.6, -2.4, 0, 2, 4.2, 6.5, 8.8];
for (const x of mullX) boxE(store, x - 0.05, x + 0.05, FL, GT, -2.16, -2.04, MAT.frame);
boxE(store, SX0 + 0.2, SX1 - 0.2, GT - 0.1, GT, -2.17, -2.03, MAT.frame);
boxE(store, SX0 + 0.2, SX1 - 0.2, FL, FL + 0.12, -2.17, -2.03, MAT.frame);
boxE(store, 0, 2, 2.35, 2.4, -2.17, -2.03, MAT.frame);
for (let i = 0; i < mullX.length - 1; i++) {
  const x0 = mullX[i] + 0.05, x1 = mullX[i + 1] - 0.05;
  if (x0 > -0.1 && x1 < 2.1) continue;
  boxE(store, x0, x1, FL + 0.12, GT - 0.1, -2.11, -2.09, glassMat, { cast: false, recv: false, plain: true });
}
// right side glazing
for (const z of [-6.1, -4.15, -2.2]) boxE(store, SX1 - 0.16, SX1 - 0.04, FL, GT, z - 0.05, z + 0.05, MAT.frame);
boxE(store, SX1 - 0.17, SX1 - 0.03, GT - 0.1, GT, -6.1, -2.1, MAT.frame);
boxE(store, SX1 - 0.17, SX1 - 0.03, FL, FL + 0.12, -6.1, -2.1, MAT.frame);
boxE(store, SX1 - 0.11, SX1 - 0.09, FL + 0.12, GT - 0.1, -6.05, -2.25, glassMat, { cast: false, recv: false, plain: true });

// automatic sliding doors
function doorLeaf(x) {
  const g = new THREE.Group();
  boxE(g, -0.49, 0.49, FL + 0.12, 2.35, -0.015, 0.015, glassMat, { cast: false, recv: false, plain: true });
  boxE(g, -0.49, 0.49, FL + 0.1, FL + 0.18, -0.03, 0.03, MAT.frame, { cast: false });
  boxE(g, -0.49, 0.49, 2.29, 2.35, -0.03, 0.03, MAT.frame, { cast: false });
  boxE(g, -0.03, 0.03, FL + 0.1, 2.35, -0.03, 0.03, MAT.frame, { cast: false }).position.x = x < 1 ? 0.46 : -0.46;
  g.position.set(x, 0, -2.1);
  store.add(g);
  return g;
}
const doorL = doorLeaf(0.5), doorR = doorLeaf(1.5);
let doorT = 0, doorTimer = 0;
export function openDoor() { doorTimer = 2.6; }
onFrame((dt) => {
  doorTimer = Math.max(0, doorTimer - dt);
  const target = doorTimer > 0 ? 1 : 0;
  doorT += (target - doorT) * Math.min(1, dt * 4);
  doorL.position.x = 0.5 - doorT * 0.88;
  doorR.position.x = 1.5 + doorT * 0.88;
});
boxE(store, 0.1, 1.9, FL, FL + 0.01, -1.9, -0.9, mat('#454a52', { roughness: 1 }), { cast: false, plain: true });
{
  const t = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = BRAND.green; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `700 34px ${JP}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('自動ドア', w / 2, h / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), mat('#fff', { map: t }));
  m.position.set(0.1, 1.3, 0.02);
  doorL.add(m);
}

// orange glow band + green trim
const orangeBand = glow(mat(BRAND.orange, { emissive: '#ff7a10', roughness: 0.4 }), 'sign', 0.9);
boxE(store, SX0 - 0.02, SX1 + 0.02, 2.86, 3.08, SZ1, SZ1 + 0.14, orangeBand, { cast: false });
boxE(store, SX1, SX1 + 0.14, 2.86, 3.08, SZ0, SZ1 + 0.14, orangeBand, { cast: false });
boxE(store, SX0 - 0.02, SX1 + 0.02, 3.08, 3.16, SZ1, SZ1 + 0.1, mat(BRAND.green, { roughness: 0.45 }), { cast: false });

// lightbox signs
{
  const face = glow(new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: '#ffffff', roughness: 0.35 }), 'sign', 1);
  const side = glow(mat('#f6f6f0', { emissive: '#ffffff', roughness: 0.4 }), 'sign', 0.25);
  const m = new THREE.Mesh(new RoundedBoxGeometry(15.2, 1.18, 0.32, 2, 0.05), [side, side, MAT.white, MAT.white, face, side]);
  m.position.set(1, 3.82, SZ1 + 0.16);
  m.castShadow = true;
  store.add(m);
  boxE(store, -6.7, 8.7, 3.2, 3.24, SZ1, SZ1 + 0.36, MAT.frame, { plain: true });
  boxE(store, -6.7, 8.7, 4.4, 4.44, SZ1, SZ1 + 0.36, MAT.frame, { plain: true });
  const sface = glow(new THREE.MeshStandardMaterial({ map: sideSignTex, emissiveMap: sideSignTex, emissive: '#ffffff', roughness: 0.35 }), 'sign', 1);
  const sm = new THREE.Mesh(new RoundedBoxGeometry(9.4, 1.18, 0.28, 2, 0.05), [side, side, MAT.white, MAT.white, sface, side]);
  sm.rotation.y = Math.PI / 2;
  sm.position.set(SX1 + 0.14, 3.82, -7.2);
  sm.castShadow = true;
  store.add(sm);
}

// awnings, wrapping around the corner
{
  const aw = new THREE.Mesh(new RoundedBoxGeometry(18.1, 0.1, 2.3, 2, 0.03), MAT.awning);
  aw.position.set(1.9, 2.74, -0.95);
  aw.rotation.x = 0.12;
  aw.castShadow = aw.receiveShadow = true;
  store.add(aw);
  boxE(store, -7.15, 10.95, 2.38, 2.7, 0.08, 0.2, MAT.green);
  const saw = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.1, 4.3, 2, 0.03), MAT.awning);
  saw.position.set(9.95, 2.74, -4.15);
  saw.rotation.z = -0.12;
  saw.castShadow = saw.receiveShadow = true;
  store.add(saw);
  boxE(store, 10.83, 10.95, 2.38, 2.7, -6.3, 0.2, MAT.green);
  boxE(store, 9, 10.95, 2.38, 2.7, -6.32, -6.2, MAT.green);
  const dl = glow(mat('#ffffff', { emissive: '#fff4e0' }), 'interior', 2.2);
  for (let x = -5.5; x < 10; x += 2.6) cyl(store, 0.12, 0.12, 0.03, dl, x, 2.6, -0.8, 12, { cast: false });
  for (const x of [-7.05, 10.85]) cyl(store, 0.05, 0.05, 2.4, MAT.frame, x, FL, 0.12, 8);
}

// ------------------------------- interior -------------------------------
const interior = new THREE.Group();
store.add(interior);
boxE(interior, SX0 + 0.2, SX1 - 0.2, GT, GT + 0.06, SZ0 + 0.2, SZ1 - 0.2, MAT.white, { cast: false, plain: true });
const ceilLight = glow(mat('#ffffff', { emissive: '#ffffff' }), 'interior', 2.4);
for (const x of [-4.8, -1.8, 1.2, 4.2, 7.2]) boxE(interior, x - 0.13, x + 0.13, GT - 0.04, GT, -11.2, -2.8, ceilLight, { cast: false, recv: false });

{
  const cm = glow(new THREE.MeshStandardMaterial({ map: coolerTex, emissiveMap: coolerTex, emissive: '#ffffff', roughness: 0.2 }), 'interior', 0.9);
  const m = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 0.7), [MAT.white, MAT.white, MAT.white, MAT.white, cm, MAT.white]);
  m.position.set(1.4, FL + 1.1, SZ0 + 0.55);
  interior.add(m);
}

const prodList = [];
function gondola(cx, z0, z1) {
  const len = z1 - z0, cz = (z0 + z1) / 2;
  box(interior, 0.9, 0.12, len, MAT.shelfBase, cx, FL, cz, { cast: false });
  box(interior, 0.06, 1.55, len, MAT.shelf, cx, FL, cz, { cast: false, plain: true });
  for (const side of [-1, 1]) for (let t = 0; t < 4; t++) {
    const y = FL + 0.12 + t * 0.36;
    box(interior, 0.4, 0.025, len, MAT.shelf, cx + side * 0.24, y, cz, { cast: false, plain: true });
    let z = z0 + 0.08;
    while (z < z1 - 0.3) {
      const sz = rr(0.12, 0.26), sy = rr(0.12, 0.3), sx = rr(0.2, 0.34);
      prodList.push({ x: cx + side * (0.05 + sx / 2), y: y + 0.025 + sy / 2, z: z + sz / 2, sx, sy, sz, c: pick(PROD_COLORS) });
      z += sz + 0.02;
    }
  }
  const popM = glow(mat(pick(['#ff7a5c', '#ffd23f', '#4fb3ff']), { emissive: '#ffffff', emissiveIntensity: 0.2 }), 'interior', 0.25);
  box(interior, 0.8, 0.28, 0.04, popM, cx, FL + 1.75, z1 + 0.02, { cast: false, plain: true });
  box(interior, 0.02, 0.1, 0.02, MAT.frame, cx, FL + 1.55, z1 + 0.02, { cast: false, plain: true });
}
for (const x of [-3.0, -0.95, 4.0, 6.3]) gondola(x, -9.4, -4.6);

// counter (with room behind it for the clerk), registers, hot snacks, cigarette wall
boxE(interior, -5.5, -4.6, FL, FL + 1.0, -9.6, -3.6, mat('#ece6db', { roughness: 0.5 }), { cast: false });
boxE(interior, -5.55, -4.55, FL + 1.0, FL + 1.05, -9.65, -3.55, MAT.wood, { cast: false });
boxE(interior, -5.35, -4.95, FL + 1.05, FL + 1.33, -5.45, -4.95, MAT.darkMetal, { cast: false });
boxE(interior, -5.35, -4.95, FL + 1.05, FL + 1.33, -4.25, -3.75, MAT.darkMetal, { cast: false });
boxE(interior, -5.4, -4.7, FL + 1.05, FL + 1.55, -9.2, -7.8, glow(mat('#ffd59a', { emissive: '#ff9a3c', transparent: true, opacity: 0.85 }), 'interior', 0.8), { cast: false });
{
  const cg = glow(new THREE.MeshStandardMaterial({ map: cigTex, emissiveMap: cigTex, emissive: '#ffffff' }), 'interior', 0.4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.1), cg);
  m.rotation.y = Math.PI / 2; m.position.set(SX0 + 0.21, FL + 1.9, -6.5);
  interior.add(m);
}
// magazine racks
boxE(interior, -6.5, -0.4, FL, FL + 0.8, -2.8, -2.35, MAT.shelf, { cast: false });
boxE(interior, 2.4, 8.4, FL, FL + 0.8, -2.8, -2.35, MAT.shelf, { cast: false });
const magList = [];
for (const [a, b] of [[-6.3, -0.6], [2.6, 8.2]]) for (let x = a; x < b; x += 0.26) magList.push({ x, c: pick(PROD_COLORS) });
// ATM + ice-cream freezer, both against the right wall so the aisles stay walkable
boxE(interior, 8.1, 8.75, FL, FL + 1.45, -5.4, -4.6, mat('#dadde1', { roughness: 0.4 }), { cast: false });
boxE(interior, 8.08, 8.1, FL + 0.85, FL + 1.25, -5.3, -4.7, glow(mat('#2a74d9', { emissive: '#4fa3ff' }), 'interior', 0.8), { cast: false, plain: true });
boxE(interior, 7.95, 8.75, FL, FL + 0.82, -9.2, -7.2, MAT.white, { cast: false });
boxE(interior, 8.0, 8.7, FL + 0.82, FL + 0.86, -9.15, -7.25, glow(mat('#cfeaff', { emissive: '#bfe3ff', transparent: true, opacity: 0.7 }), 'interior', 0.6), { cast: false, plain: true });

// products and magazines in one instanced draw
{
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { roughness: 0.5 }), prodList.length + magList.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let i = 0;
  for (const it of prodList) {
    m4.compose(p.set(it.x, it.y, it.z), q.identity(), s.set(it.sx, it.sy, it.sz));
    im.setMatrixAt(i, m4); im.setColorAt(i, c.set(it.c)); i++;
  }
  const qm = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));
  for (const it of magList) {
    m4.compose(p.set(it.x, FL + 0.95, -2.55), qm, s.set(0.22, 0.3, 0.02));
    im.setMatrixAt(i, m4); im.setColorAt(i, c.set(it.c)); i++;
  }
  im.receiveShadow = true;
  interior.add(im);
}
// posters on the inside of the glass
[
  [posterTex(['からあげ', '¥230'], '#e8642c', '揚げたて！'), -5.7],
  [posterTex(['おにぎり', '100円'], '#d7383b', 'セール中'), -3.5],
  [posterTex(['ATM', '24H'], '#2756b0', 'いつでも'), 5.3],
  [posterTex(['くじ', '開催中'], '#16936a', '1回700円'), 7.6],
].forEach(([tex, x]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), glow(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#fff', roughness: 0.6 }), 'interior', 0.25));
  m.position.set(x, 1.95, -2.13);
  store.add(m);
});

// rooftop
export function acUnit(parent, x, y, z, ry = 0) {
  const g = new THREE.Group();
  const body = mat('#e2e2dc', { roughness: 0.6 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.68, 0.34, 2, 0.04), [body, body, body, body, mat('#fff', { map: fanTex, roughness: 0.6 }), body]);
  m.position.y = 0.44; m.castShadow = m.receiveShadow = true; g.add(m);
  box(g, 0.8, 0.1, 0.4, MAT.darkMetal, 0, 0, 0);
  g.position.set(x, y, z); g.rotation.y = ry;
  parent.add(g);
  return g;
}
acUnit(store, -3.6, 4.35, -6.2); acUnit(store, -2.4, 4.35, -6.2); acUnit(store, -1.2, 4.35, -6.2);
acUnit(store, 6.2, 4.35, -10.6, Math.PI);
boxE(store, 3.4, 5.0, 4.35, 5.35, -9.2, -7.8, mat('#d0d0ca', { roughness: 0.7 }));
cyl(store, 0.22, 0.22, 0.9, MAT.chrome, 0.6, 4.35, -10.4, 12);
cyl(store, 0.32, 0.22, 0.12, MAT.chrome, 0.6, 5.25, -10.4, 12);
rod(store, V(-3.6, 4.5, -5.95), V(-3.6, 4.5, -2.6), 0.05, MAT.white);
rod(store, V(-3.6, 4.5, -2.6), V(-3.6, 3.3, -2.25), 0.05, MAT.white);

// pole sign at the lot corner
{
  const g = new THREE.Group();
  cyl(g, 0.12, 0.12, 4.2, MAT.chrome, 0, 0, 0, 12);
  const face = glow(new THREE.MeshStandardMaterial({ map: poleSignTex, emissiveMap: poleSignTex, emissive: '#fff', roughness: 0.4 }), 'sign', 1);
  const side = glow(mat(BRAND.green, { emissive: BRAND.green, roughness: 0.4 }), 'sign', 0.3);
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.95, 3.3, 0.36, 2, 0.05), [side, side, MAT.white, MAT.white, face, face]);
  m.position.y = 4.2 + 1.65; m.castShadow = true;
  g.add(m);
  g.position.set(10.6, 0.1, 6.6);
  g.rotation.y = 0.5;
  world.add(g);
}

// clicking the shop opens the automatic doors, with the chime
pickable(store, () => { openDoor(); sfx.chime(); }, 'ひかりマート');
