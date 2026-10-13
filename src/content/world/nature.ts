// Soft, living things: the sakura tree and its petals, and cotton clouds hovering over the model.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, cyl, rod, V } from '../../engine/kit/build';
import { materials } from '../common/materials';

export default defineMod({
  id: 'konbini.world.nature',
  name: '樱花与云',
  layer: 'world',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const { next: rand, range: rr, pick } = ctx.mod.random;
    const root = ctx.root;

    // sakura in the neighbour's front yard
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
      cyl(g, 0.7, 0.7, 0.2, materials(ctx).block, 0, 0, 0, 20);
      g.position.copy(SAKURA);
      root.add(g);
      ctx.surfaces.addRoof({ x0: SAKURA.x - 1.6, x1: SAKURA.x + 1.6, z0: SAKURA.z - 1.6, z1: SAKURA.z + 1.6 }, 3.2);
    }

    // drifting petals — only on dry days
    const PETALS = 160;
    const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.055), mat('#f9cfdb', { side: THREE.DoubleSide, roughness: 0.8 }), PETALS);
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
      const amount = (1 - d.rain) * (1 - d.snow) * (1 - d.fog * 0.5) * (0.4 + 0.6 * d.daylight);
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
        dummy.scale.setScalar(amount);
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
