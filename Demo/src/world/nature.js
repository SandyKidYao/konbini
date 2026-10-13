// Soft, living things: the sakura tree and its petals, and cotton clouds hovering over the model.
import * as THREE from 'three';
import { scene, world } from '../core/stage.js';
import { mat, cyl, rod, V } from '../core/helpers.js';
import { onFrame } from '../core/registry.js';
import { blockMat } from '../core/materials.js';
import { rand, rr, pick } from '../core/rng.js';

// --- sakura ---
const SAKURA = V(-16.6, 0.08, 4.2);
{
  const g = new THREE.Group();
  const bark = mat('#6b5040', { roughness: 0.9 });
  cyl(g, 0.16, 0.26, 2.4, bark, 0, 0, 0, 10);
  rod(g, V(0, 2.2, 0), V(1.1, 3.4, 0.4), 0.12, bark, 8);
  rod(g, V(0, 2.2, 0), V(-1.0, 3.3, -0.3), 0.12, bark, 8);
  rod(g, V(0, 2.3, 0), V(0.2, 3.7, -0.9), 0.1, bark, 8);
  const blossom = ['#f8c8d6', '#fbdbe4', '#f3b4c7'].map((c) => mat(c, { roughness: 0.85 }));
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.7, 1.25), 2), pick(blossom));
    const a = rand() * Math.PI * 2, d = rr(0, 1.7);
    m.position.set(Math.cos(a) * d, rr(3.0, 4.4), Math.sin(a) * d);
    m.scale.y = 0.8;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  cyl(g, 0.7, 0.7, 0.2, blockMat, 0, 0, 0, 20);
  g.position.copy(SAKURA);
  world.add(g);
}

// --- drifting petals ---
const PETALS = 160;
const petalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.055), mat('#f9cfdb', { side: THREE.DoubleSide, roughness: 0.8 }), PETALS);
petalMesh.frustumCulled = false;
world.add(petalMesh);
const petals = Array.from({ length: PETALS }, () => ({ p: V(0, -10, 0), v: V(), r: new THREE.Euler(), w: V(rr(1, 3), rr(1, 3), rr(1, 3)), t: rr(0, 6), life: 0 }));
function respawn(pt, init) {
  const a = rand() * Math.PI * 2, d = rr(0, 2.2);
  pt.p.set(SAKURA.x + Math.cos(a) * d, init ? rr(0.2, 4) : rr(2.8, 4.4), SAKURA.z + Math.sin(a) * d);
  pt.v.set(rr(0.25, 0.7), -rr(0.35, 0.7), rr(0.1, 0.5));
  pt.life = 0;
}
petals.forEach((p) => respawn(p, true));
const dummy = new THREE.Object3D();
onFrame((dt, t, s) => {
  petalMesh.visible = s.petals > 0.02;
  if (!petalMesh.visible) return;
  for (let i = 0; i < PETALS; i++) {
    const pt = petals[i];
    pt.t += dt; pt.life += dt;
    if (pt.p.y > 0.12) {
      pt.p.x += (pt.v.x + Math.sin(pt.t * pt.w.x) * 0.4) * dt;
      pt.p.y += pt.v.y * dt;
      pt.p.z += (pt.v.z + Math.cos(pt.t * pt.w.z) * 0.3) * dt;
      pt.r.set(pt.t * pt.w.x, pt.t * pt.w.y, pt.t * pt.w.z);
    } else if (pt.life > 9) respawn(pt, false);
    dummy.position.copy(pt.p);
    dummy.rotation.copy(pt.r);
    dummy.scale.setScalar(s.petals);
    dummy.updateMatrix();
    petalMesh.setMatrixAt(i, dummy.matrix);
  }
  petalMesh.instanceMatrix.needsUpdate = true;
});

// --- cotton clouds: props hovering above the model, bobbing gently ---
export const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 1 });
const clouds = new THREE.Group();
scene.add(clouds);
const ANCHORS = [
  // [x, y, z, size, extra] — "extra" clouds only gather on overcast days
  [-15, 17, -14, 1.0, 0], [9, 19.5, -21, 1.25, 0], [25, 15.5, -7, 0.85, 0], [-29, 14, 3, 0.8, 0],
  [-2, 21, -30, 1.3, 1], [-24, 18.5, -24, 1.1, 1], [20, 18, -27, 1.0, 1], [33, 16, 8, 0.9, 1],
];
for (const [x, y, z, size, extra] of ANCHORS) {
  const c = new THREE.Group();
  const n = 6 + Math.floor(rand() * 4);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), cloudMat);
    const r = rr(1.1, 1.9);
    m.scale.set(r * rr(1.0, 1.3), r * rr(0.75, 0.95), r);
    m.position.set(rr(-3.2, 3.2), rr(-0.2, 0.9) * (1 - Math.abs(k - n / 2) / n), rr(-1.4, 1.4));
    m.castShadow = true;
    c.add(m);
  }
  // flat underside, like a real cumulus (and like a felt cloud on a model)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.0, 0.6, 24), cloudMat);
  base.scale.z = 0.55; base.position.y = -0.35; base.castShadow = true;
  c.add(base);
  c.scale.setScalar(size);
  c.position.set(x, y, z);
  c.userData = { anchor: V(x, y, z), size, extra, phase: rand() * 6 };
  clouds.add(c);
}
onFrame((dt, t, s) => {
  clouds.visible = s.cloud > 0.01;
  if (!clouds.visible) return;
  for (const c of clouds.children) {
    const { anchor, size, extra, phase } = c.userData;
    c.position.set(anchor.x + Math.sin(t * 0.05 + phase) * 3, anchor.y + Math.sin(t * 0.4 + phase) * 0.35, anchor.z);
    const k = extra ? s.cloudExtra : 1;
    c.scale.setScalar(Math.max(0.001, size * k * (0.75 + 0.25 * s.cloud)));
    c.visible = k > 0.02;
  }
});
