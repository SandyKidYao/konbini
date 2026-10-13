// Street furniture: utility poles and wires, street lamps, traffic + pedestrian signals, signs, curve mirror.
import * as THREE from 'three';
import { world } from '../core/stage.js';
import { mat, box, cyl, rod, V, planarUV } from '../core/helpers.js';
import { glow } from '../core/registry.js';
import { MAT } from '../core/materials.js';
import { envRT } from '../core/stage.js';
import { poleStripeTex } from '../textures/surfaces.js';
import { pedTex, streetSignTex, noParkTex, stopSignTex } from '../textures/signage.js';

const poleStripeMat = mat('#ffffff', { map: poleStripeTex, roughness: 0.6 });
poleStripeTex.repeat.set(3, 3);

function utilityPole(x, z, armAxis) {
  const g = new THREE.Group();
  cyl(g, 0.14, 0.2, 10.2, MAT.pole, 0, 0, 0, 16);
  cyl(g, 0.215, 0.215, 1.8, poleStripeMat, 0, 0.1, 0, 16, { cast: false });
  const arm = armAxis === 'z' ? [0.12, 0.12, 1.9] : [1.9, 0.12, 0.12];
  box(g, ...arm, MAT.darkMetal, 0, 9.0, 0);
  const insM = mat('#ecece7', { roughness: 0.3 });
  const pts = [];
  for (const o of [-0.8, 0, 0.8]) {
    const ix = armAxis === 'z' ? 0 : o, iz = armAxis === 'z' ? o : 0;
    cyl(g, 0.05, 0.06, 0.16, insM, ix, 9.12, iz, 8);
    pts.push(V(x + ix, 9.28, z + iz));
  }
  for (let y = 2.6; y < 8.6; y += 0.45) {
    const s = (Math.round(y / 0.45) % 2) ? 1 : -1;
    const a = armAxis === 'z' ? V(s * 0.17, y, 0) : V(0, y, s * 0.17);
    const b = armAxis === 'z' ? V(s * 0.36, y, 0) : V(0, y, s * 0.36);
    rod(g, a, b, 0.015, MAT.darkMetal, 4, false);
  }
  box(g, 0.24, 0.55, 0.03, mat('#f4f4f0'), 0, 2.2, 0.2, { cast: false, plain: true });
  g.position.set(x, 0.15, z);
  world.add(g);
  return { g, pts, low: V(x, 6.9, z) };
}
const P1 = utilityPole(-13, 8.8, 'z');
const P2 = utilityPole(12.9, 8.9, 'x');
const P3 = utilityPole(12.9, -9, 'x');
cyl(P1.g, 0.36, 0.36, 1.1, mat('#b3b8bd', { roughness: 0.5, metalness: 0.3 }), 0, 6.4, -0.45, 16);
box(P3.g, 0.5, 0.7, 0.3, mat('#9ea3a9'), 0, 5.6, 0.3);

// wires sag in a catenary-ish curve
function wire(a, b, sag = 0.6, r = 0.022) {
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, r, 5), MAT.wire);
  m.castShadow = true;
  world.add(m);
}
const wireSet = (A, B, sag) => { for (let i = 0; i < 3; i++) wire(A[i], B[i], sag); };
const P2z = [V(12.9, 8.83, 8.1), V(12.9, 8.83, 8.9), V(12.9, 8.83, 9.7)];
box(P2.g, 0.12, 0.12, 1.9, MAT.darkMetal, 0, 8.55, 0);
wireSet(P1.pts, P2z, 0.9);
wireSet(P1.pts, P1.pts.map((p) => p.clone().setX(-28)), 0.5);
wireSet(P2.pts, P3.pts, 0.7);
wireSet(P3.pts, P3.pts.map((p) => p.clone().setZ(-24)), 0.6);
wireSet(P2z, P2z.map((p) => p.clone().setX(28)), 0.9);
wire(P1.low, P2.low, 0.8, 0.045); wire(P2.low, P3.low, 0.7, 0.045);
wire(P1.low, P1.low.clone().setX(-28), 0.4, 0.045);
wire(P3.low, P3.low.clone().setZ(-24), 0.4, 0.045);
wire(V(12.9, 6.6, 8.9), V(9.0, 4.4, -3.0), 0.5, 0.018);
wire(P1.low, V(-15.5, 5.2, -1), 0.4, 0.018);

// street lamps
export const lampLights = [];
function streetLamp(pole, dir) {
  const base = pole.g.position;
  const a = V(base.x, 7.2, base.z), b = V(base.x + dir.x * 1.7, 7.55, base.z + dir.z * 1.7);
  rod(world, a, b, 0.05, MAT.pole);
  const head = new THREE.Group();
  box(head, 0.75, 0.14, 0.34, MAT.frame, 0, 0, 0);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.26), glow(mat('#ffffff', { emissive: '#ffe9c4' }), 'lamp', 2.5));
  lens.position.y = -0.01; head.add(lens);
  head.position.set(b.x + dir.x * 0.25, b.y - 0.05, b.z + dir.z * 0.25);
  head.rotation.y = Math.atan2(-dir.z, dir.x);
  world.add(head);
  // warm sodium-ish lamps feel cosier than cold LED white in a miniature
  const spot = new THREE.SpotLight('#ffd9a8', 0, 34, 1.0, 0.65, 1.4);
  spot.position.copy(head.position).add(V(0, -0.1, 0));
  spot.target.position.set(head.position.x + dir.x * 1.5, 0, head.position.z + dir.z * 1.5);
  world.add(spot, spot.target);
  lampLights.push(spot);
  return spot;
}
const lampA = streetLamp(P2, V(0, 0, 1));
lampA.castShadow = true;
lampA.shadow.mapSize.set(1024, 1024);
lampA.shadow.bias = -0.0005;
streetLamp(P1, V(0, 0, 1));
streetLamp(P3, V(1, 0, 0));

// traffic signals
const signalLamps = { veh: { g: [], y: [], r: [] }, ped: { g: [], r: [] } };
const lampMat = (off, on) => mat(off, { emissive: on, emissiveIntensity: 0, roughness: 0.3 });
function vehicleSignal(x, y, z, ry) {
  const g = new THREE.Group();
  box(g, 1.3, 0.42, 0.32, mat('#3a3f46', { roughness: 0.5 }), 0, -0.21, 0);
  [['#1d4a3b', '#2bffbf', 'g'], ['#4a3d1a', '#ffb000', 'y'], ['#4a1a1a', '#ff3a2a', 'r']].forEach(([off, on, k], i) => {
    const m = lampMat(off, on);
    signalLamps.veh[k].push(m);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 20), m);
    lamp.rotation.x = Math.PI / 2; lamp.position.set(-0.42 + i * 0.42, 0, 0.17); g.add(lamp);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 20, 1, true, -Math.PI / 2, Math.PI), MAT.darkMetal);
    hood.rotation.x = Math.PI / 2; hood.position.set(-0.42 + i * 0.42, 0.01, 0.27); g.add(hood);
  });
  g.position.set(x, y, z); g.rotation.y = ry;
  world.add(g);
}
function pedSignal(x, y, z, ry) {
  const g = new THREE.Group();
  box(g, 0.42, 0.86, 0.24, mat('#3a3f46', { roughness: 0.5 }), 0, -0.43, 0);
  [['#ff3a3a', false, 'r', 0.2], ['#2bffbf', true, 'g', -0.2]].forEach(([c, walk, k, oy]) => {
    const t = pedTex(c, walk);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0, color: '#555' });
    signalLamps.ped[k].push(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), m);
    p.position.set(0, oy, 0.125); g.add(p);
  });
  g.position.set(x, y, z); g.rotation.y = ry;
  world.add(g);
}
{
  const sx = 21.9, sz = 9.4;
  const pm = mat('#b5b7ba', { roughness: 0.5, metalness: 0.3 });
  cyl(world, 0.11, 0.13, 6.0, pm, sx, 0.15, sz, 14);
  rod(world, V(sx, 5.7, sz), V(sx, 5.7, 12.4), 0.06, pm);
  vehicleSignal(sx, 5.95, 11.85, -Math.PI / 2);
  pedSignal(sx - 0.15, 3.3, sz, -Math.PI / 2);
  pedSignal(12.9 + 0.2, 3.3, 8.9, Math.PI / 2);
}

const CYCLE = 22;

// Pedestrian aspect for the crosswalk over road B: 'g' (safe to start crossing), 'flash' or 'r'
export function pedPhase(t) {
  const c = t % CYCLE;
  return c < 6.5 ? 'g' : c < 10 ? 'flash' : 'r';
}

// Signal cycle for road A. Returns the vehicle aspect ('g' | 'y' | 'r') so the taxi can obey it.
export function updateSignals(t, intensity) {
  const c = t % CYCLE;
  const veh = c < 10 ? 'g' : c < 13 ? 'y' : 'r';
  const ped = c < 7.5 ? 'g' : c < 10 ? (Math.floor(c * 4) % 2 === 0 ? 'g' : 'off') : 'r';
  for (const k of ['g', 'y', 'r']) for (const m of signalLamps.veh[k]) m.emissiveIntensity = k === veh ? intensity : 0;
  for (const k of ['g', 'r']) for (const m of signalLamps.ped[k]) m.emissiveIntensity = k === ped ? intensity * 0.9 : 0;
  return veh;
}

// street name plate on the corner pole
{
  const face = new THREE.MeshStandardMaterial({ map: streetSignTex, roughness: 0.4 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.48, 0.04), [MAT.white, MAT.white, MAT.white, MAT.white, face, MAT.white]);
  m.position.set(12.9 - 0.85, 2.75, 8.9 + 0.24); m.castShadow = true;
  world.add(m);
  rod(world, V(12.9, 2.95, 9.05), V(12.3, 2.95, 9.05), 0.02, MAT.chrome);
}
// curve mirror
{
  const om = mat('#ee7a35', { roughness: 0.45 });
  cyl(world, 0.055, 0.055, 2.9, om, 11.95, 0.15, 9.5, 12);
  const g = new THREE.Group();
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.02, envMap: envRT.texture }));
  mirror.position.z = 0.03; g.add(mirror);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 10, 32), om));
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 32), om); back.rotation.x = Math.PI / 2; g.add(back);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(11.95, 3.25, 9.55); g.rotation.y = Math.PI * 0.25;
  world.add(g);
}
function signPost(x, z, ry, geo, tex, h = 2.4) {
  cyl(world, 0.035, 0.035, h, MAT.chrome, x, 0.15, z, 8);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, side: THREE.DoubleSide }));
  m.position.set(x, h, z); m.rotation.y = ry; m.castShadow = true;
  world.add(m);
}
signPost(12.0, -1.6, Math.PI / 2, new THREE.CircleGeometry(0.32, 32), noParkTex);
{
  const tg = new THREE.CircleGeometry(0.55, 3); tg.rotateZ(-Math.PI / 2); planarUV(tg);
  signPost(22.1, 2.2, Math.PI, tg, stopSignTex, 2.2);
}
