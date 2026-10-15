// Soft, living things: the sakura tree and its petals, and cotton clouds hovering over the model.
// The tree follows the date: blossom in early spring, green through summer, red in autumn, bare in winter.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, cyl, rod, V, lerp } from '../../engine/kit/build';
import { between } from '../../engine/calendar';
import { materials } from '../common/materials';

type TreeState = 'bloom' | 'leaf' | 'autumn' | 'bare';
const CANOPY: Record<TreeState, { colors: string[]; size: number; fall: number; fallColor: string; fallSize: number }> = {
  bloom: { colors: ['#f8c8d6', '#fbdbe4', '#f3b4c7'], size: 1, fall: 1, fallColor: '#f9cfdb', fallSize: 1 },
  leaf: { colors: ['#86b45e', '#9cc46c', '#6f9f50'], size: 0.96, fall: 0, fallColor: '#86b45e', fallSize: 1 },
  autumn: { colors: ['#e2793a', '#cf513a', '#eaa443'], size: 0.86, fall: 0.45, fallColor: '#d9663a', fallSize: 1.7 },
  bare: { colors: ['#e2793a', '#cf513a', '#eaa443'], size: 0, fall: 0, fallColor: '#d9663a', fallSize: 1.7 },
};

export default defineMod({
  id: 'konbini.world.nature',
  name: '樱花与云',
  layer: 'world',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const { next: rand, range: rr, pick } = ctx.mod.random;
    const root = ctx.root;
    const petalMat = mat('#f9cfdb', { side: THREE.DoubleSide, roughness: 0.8 });
    const fall = { amount: 1, size: 1 };

    // sakura in the neighbour's front yard
    const SAKURA = V(-16.6, 0.08, 4.2);
    {
      const g = new THREE.Group();
      const bark = mat('#6b5040', { roughness: 0.9 });
      cyl(g, 0.16, 0.26, 2.4, bark, 0, 0, 0, 10);
      rod(g, V(0, 2.2, 0), V(1.1, 3.4, 0.4), 0.12, bark, 8);
      rod(g, V(0, 2.2, 0), V(-1.0, 3.3, -0.3), 0.12, bark, 8);
      rod(g, V(0, 2.3, 0), V(0.2, 3.7, -0.9), 0.1, bark, 8);
      // twigs: hidden in the canopy most of the year, they are the tree's whole shape in winter
      for (const [a, b] of [[V(1.1, 3.4, 0.4), V(1.6, 4.2, 0.9)], [V(1.1, 3.4, 0.4), V(1.8, 3.7, -0.2)], [V(-1.0, 3.3, -0.3), V(-1.5, 4.1, 0.2)],
        [V(-1.0, 3.3, -0.3), V(-1.6, 3.6, -0.9)], [V(0.2, 3.7, -0.9), V(0.6, 4.5, -1.3)], [V(0.2, 3.7, -0.9), V(-0.4, 4.4, -1.2)], [V(0, 2.6, 0), V(0.1, 4.6, 0.2)]] as const) {
        rod(g, a, b, 0.045, bark, 6);
      }
      const blossom = CANOPY.bloom.colors.map((c) => mat(c, { roughness: 0.85 }));
      const blobs: THREE.Mesh[] = [];
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.7, 1.25), 2), pick(blossom));
        const a = rand() * Math.PI * 2, d = rr(0, 1.7);
        m.position.set(Math.cos(a) * d, rr(3.0, 4.4), Math.sin(a) * d);
        m.scale.y = 0.8;
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        blobs.push(m);
      }
      // the canopy changes with the season; a switch takes a few seconds to colour over
      const ca = new THREE.Color(), cb = new THREE.Color();
      ctx.states.track<TreeState>({
        pick: ({ day }) => between(day.seasonDay, '3-22', '4-12') ? 'bloom' : between(day.seasonDay, '4-13', '9-30') ? 'leaf'
          : between(day.seasonDay, '10-1', '11-30') ? 'autumn' : 'bare',
        duration: 3,
        blend: (from, to, t) => {
          const A = CANOPY[from], B = CANOPY[to];
          blossom.forEach((m, i) => m.color.copy(ca.set(A.colors[i])).lerp(cb.set(B.colors[i]), t));
          const size = lerp(A.size, B.size, t);
          blobs.forEach((b, i) => {
            const k = Math.max(0.001, size * (1 - 0.15 * ((i * 7) % 5) / 4 * (1 - size)));
            b.scale.set(k, k * 0.8, k);
            b.visible = size > 0.01;
          });
          fall.amount = lerp(A.fall, B.fall, t);
          fall.size = lerp(A.fallSize, B.fallSize, t);
          petalMat.color.copy(ca.set(A.fallColor)).lerp(cb.set(B.fallColor), t);
        },
      });
      cyl(g, 0.7, 0.7, 0.2, materials(ctx).block, 0, 0, 0, 20);
      // on the map: a round crown in the canopy's colour of the moment; bare branches in winter
      ctx.plan.add({ kind: 'tree', circle: { x: SAKURA.x, z: SAKURA.z, r: 2.3 }, h: 4.6,
        color: () => (blobs[0].visible ? `#${blossom[0].color.getHexString()}` : '#9a7d68') });
      g.position.copy(SAKURA);
      root.add(g);
      ctx.surfaces.addRoof({ x0: SAKURA.x - 1.6, x1: SAKURA.x + 1.6, z0: SAKURA.z - 1.6, z1: SAKURA.z + 1.6 }, 3.2);
    }

    // drifting petals in spring, falling leaves in autumn — only on dry days
    const PETALS = 160;
    const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.055), petalMat, PETALS);
    petals.frustumCulled = false;
    petals.userData.skyIgnore = true;
    petals.userData.noSnow = true;
    root.add(petals);
    const P = Array.from({ length: PETALS }, () => ({ p: V(0, -10, 0), v: V(0, 0, 0), r: new THREE.Euler(), w: V(rr(1, 3), rr(1, 3), rr(1, 3)), t: rr(0, 6), life: 0 }));
    const respawn = (pt: (typeof P)[number], init: boolean) => {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 2.2;
      pt.p.set(SAKURA.x + Math.cos(a) * d, init ? 0.2 + Math.random() * 3.8 : 2.8 + Math.random() * 1.6, SAKURA.z + Math.sin(a) * d);
      pt.v.set(0.25 + Math.random() * 0.45, -(0.35 + Math.random() * 0.35), 0.1 + Math.random() * 0.4);
      pt.life = 0;
    };
    P.forEach((p) => respawn(p, true));
    const dummy = new THREE.Object3D();
    ctx.onFrame((dt, _t, d) => {
      const amount = fall.amount * (1 - d.rain) * (1 - d.snow) * (1 - d.fog * 0.5) * (0.4 + 0.6 * d.daylight);
      petals.visible = amount > 0.05;
      if (!petals.visible) return;
      for (let i = 0; i < PETALS; i++) {
        const pt = P[i];
        pt.t += dt; pt.life += dt;
        if (pt.p.y > 0.12) {
          pt.p.x += (pt.v.x + Math.sin(pt.t * pt.w.x) * 0.4 + d.wind * 0.3) * dt;
          pt.p.y += pt.v.y * dt;
          pt.p.z += (pt.v.z + Math.cos(pt.t * pt.w.z) * 0.3) * dt;
          pt.r.set(pt.t * pt.w.x, pt.t * pt.w.y, pt.t * pt.w.z);
        } else if (pt.life > 9) respawn(pt, false);
        dummy.position.copy(pt.p);
        dummy.rotation.copy(pt.r);
        dummy.scale.setScalar(Math.min(1, amount) * fall.size);
        dummy.updateMatrix();
        petals.setMatrixAt(i, dummy.matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
    });

    // cotton clouds: props hovering above the model, more of them as cloud cover grows
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 1 });
    const clouds = new THREE.Group();
    ctx.scene.add(clouds);
    const ANCHORS: [number, number, number, number, number][] = [
      // x, y, z, size, appears when cloud cover exceeds
      [-15, 17, -14, 1.0, 0], [9, 19.5, -21, 1.25, 0], [25, 15.5, -7, 0.85, 0], [-29, 14, 3, 0.8, 0],
      [-2, 21, -30, 1.3, 0.4], [-24, 18.5, -24, 1.1, 0.5], [20, 18, -27, 1.0, 0.6], [33, 16, 8, 0.9, 0.7],
    ];
    for (const [x, y, z, size, appear] of ANCHORS) {
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
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.0, 0.6, 24), cloudMat);
      base.scale.z = 0.55; base.position.y = -0.35; base.castShadow = true;
      c.add(base);
      c.position.set(x, y, z);
      c.userData = { x, y, z, size, appear, phase: rand() * 6 };
      clouds.add(c);
    }
    ctx.onFrame((_dt, t, d) => {
      const L = ctx.atmosphere.look;
      cloudMat.color.copy(L.cloudColor);
      cloudMat.opacity = Math.min(1, L.cloudOpacity * 1.2);
      clouds.visible = L.cloudOpacity > 0.01;
      if (!clouds.visible) return;
      for (const c of clouds.children) {
        const u = c.userData as { x: number; y: number; z: number; size: number; appear: number; phase: number };
        const k = u.appear === 0 ? 1 : THREE.MathUtils.smoothstep(d.cloud, u.appear, u.appear + 0.25);
        c.position.set(u.x + Math.sin(t * 0.05 + u.phase) * 3, u.y + Math.sin(t * 0.4 + u.phase) * 0.35, u.z);
        c.scale.setScalar(Math.max(0.001, u.size * k * (0.75 + 0.25 * L.cloudOpacity)));
        c.visible = k > 0.02;
      }
    });
  },
});
