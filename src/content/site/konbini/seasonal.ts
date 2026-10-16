// Decorations the shop puts out for the season: 門松 for the new year, a 七夕 bamboo with wishes,
// pumpkins for Halloween, a little Christmas tree. Everything is built up front and popped in or out
// by ctx.states.show(), so the snow cover and the materials are ready before it ever appears.
import * as THREE from 'three';
import { defineMod } from '../../../engine/mod';
import { mat, cyl, rod, V } from '../../../engine/kit/build';
import { STORE } from './api';

export default defineMod({
  id: 'konbini.site.seasonal',
  name: '节日装饰',
  layer: 'site',
  site: 'konbini',
  requires: ['konbini.site.store'],
  setup(ctx) {
    const FL = STORE.floor;
    const { range: rr, pick } = ctx.mod.random;
    // the spot left of the door, under the awning
    const BESIDE_DOOR = V(-1.75, FL, STORE.z1 + 0.55);

    // ---------------------------------------------------------------- 門松, a pair flanking the way in
    const kadomatsu = new THREE.Group();
    {
      const straw = mat('#cfae6e', { roughness: 0.95 }), rope = mat('#4a3a2a'), bamboo = mat('#6aa452', { roughness: 0.5 });
      const cut = mat('#d8e6b8', { roughness: 0.6 }), pine = mat('#2f5f3e', { roughness: 0.9, flatShading: true }), plum = mat('#d23c4a');
      for (const x of [-1.65, 1.25]) {
        const g = new THREE.Group();
        cyl(g, 0.24, 0.27, 0.34, straw, 0, 0, 0, 16);
        for (const y of [0.08, 0.24]) cyl(g, 0.255, 0.255, 0.035, rope, 0, y, 0, 16);
        ([[0, 0.98, -0.05], [-0.09, 0.82, 0.06], [0.09, 0.72, 0.06]] as const).forEach(([bx, h, bz]) => {
          cyl(g, 0.048, 0.048, h, bamboo, bx, 0.1, bz, 10);
          const top = cyl(g, 0.049, 0.049, 0.01, cut, bx, 0.1 + h - 0.02, bz, 10, { cast: false });
          top.rotation.x = -0.6;   // the slanted cut
        });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 6), pine);
          c.position.set(Math.cos(a) * 0.18, 0.4, Math.sin(a) * 0.18);
          c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          c.castShadow = true;
          g.add(c);
        }
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), plum);
          b.position.set(rr(-0.15, 0.15), rr(0.45, 0.6), rr(0.05, 0.18));
          g.add(b);
        }
        g.position.set(x, FL, STORE.z1 + 1.2);
        kadomatsu.add(g);
      }
      ctx.root.add(kadomatsu);
      ctx.states.show(kadomatsu, (c) => c.has('shogatsu'));
    }

    // ---------------------------------------------------------------- 七夕: bamboo hung with paper wishes
    const tanabata = new THREE.Group();
    const sway: THREE.Object3D[] = [];
    {
      const stalk = mat('#6aa452', { roughness: 0.5 }), leaf = mat('#5c9a48', { roughness: 0.8, side: THREE.DoubleSide });
      cyl(tanabata, 0.2, 0.22, 0.3, mat('#8a6a4a'), 0, 0, 0, 12);
      rod(tanabata, V(0, 0.2, 0), V(0.05, 2.6, 0.02), 0.035, stalk);
      const papers = ['#e9586a', '#f2c14e', '#5aa7e0', '#7cc47f', '#a684cf', '#f3f1ea'].map((c) => mat(c, { side: THREE.DoubleSide, roughness: 0.9 }));
      const paperGeo = new THREE.PlaneGeometry(0.1, 0.28).translate(0, -0.14, 0);
      const leafGeo = new THREE.ConeGeometry(0.06, 0.34, 4);
      for (let i = 0; i < 9; i++) {
        const y = 0.95 + i * 0.18, a = i * 2.4;
        const branch = new THREE.Group();
        branch.position.set(0.02, y, 0);
        branch.rotation.y = a;
        tanabata.add(branch);
        const len = rr(0.5, 0.85) * (1 - i * 0.05);
        rod(branch, V(0, 0, 0), V(len, 0.3, 0), 0.014, stalk, 5);
        for (let k = 0; k < 7; k++) {
          const l = new THREE.Mesh(leafGeo, leaf);
          l.position.set(len * (0.25 + k * 0.12), 0.06 + k * 0.045, rr(-0.06, 0.06));
          l.rotation.set(rr(-0.6, 0.6), rr(-0.5, 0.5), -1.25 + rr(-0.3, 0.3));
          l.scale.z = 0.35;
          l.castShadow = true;
          branch.add(l);
        }
        for (let k = 0; k < 4; k++) {
          const p = new THREE.Mesh(paperGeo, pick(papers));
          p.position.set(len * (0.25 + k * 0.22), 0.04 + k * 0.07, rr(-0.04, 0.04));
          p.rotation.y = rr(-0.8, 0.8);
          p.castShadow = true;
          branch.add(p);
          sway.push(p);
        }
      }
      tanabata.position.copy(BESIDE_DOOR);
      ctx.root.add(tanabata);
      ctx.states.show(tanabata, (c) => c.has('tanabata'));
      ctx.onFrame((_dt, t, d) => {
        if (!tanabata.visible) return;
        sway.forEach((p, i) => { p.rotation.x = Math.sin(t * (1.6 + d.wind * 2) + i) * (0.1 + d.wind * 0.35); });
      });
    }

    // ---------------------------------------------------------------- Halloween pumpkins (one glows after dark)
    const pumpkins = new THREE.Group();
    {
      const skin = mat('#e8822e', { roughness: 0.6 }), stem = mat('#5a6a34');
      const glow = ctx.glow.add(mat('#f0902e', { emissive: '#ff8a20', roughness: 0.6 }), 'lamp', 0.35);
      ([[0, 0, 0.26, glow], [0.36, 0.1, 0.18, skin], [-0.12, 0.34, 0.15, skin]] as const).forEach(([x, z, r, m]) => {
        const p = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), m);
        p.scale.y = 0.72;
        p.position.set(x, r * 0.72, z);
        p.castShadow = true;
        pumpkins.add(p);
        cyl(pumpkins, 0.025, 0.035, r * 0.45, stem, x, r * 1.35, z, 6);
        for (let k = 0; k < 6; k++) {   // ribs
          const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.06, 4, 20), m);
          rib.rotation.y = (k / 6) * Math.PI;
          rib.scale.y = 0.72;
          rib.position.set(x, r * 0.72, z);
          pumpkins.add(rib);
        }
      });
      pumpkins.position.copy(BESIDE_DOOR);
      ctx.root.add(pumpkins);
      ctx.states.show(pumpkins, (c) => c.has('halloween'));
    }

    // ---------------------------------------------------------------- a little Christmas tree with lights
    const tree = new THREE.Group();
    {
      const needles = mat('#2e6b4a', { roughness: 0.85, flatShading: true });
      cyl(tree, 0.2, 0.17, 0.26, mat('#b5452e', { roughness: 0.6 }), 0, 0, 0, 12);
      cyl(tree, 0.04, 0.04, 0.2, mat('#6b5040'), 0, 0.26, 0, 6);
      ([[0.42, 0.55, 0.36], [0.33, 0.48, 0.66], [0.22, 0.4, 0.94]] as const).forEach(([r, h, y]) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), needles);
        c.position.y = y + h / 2 - 0.1;
        c.castShadow = true;
        tree.add(c);
      });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), ctx.glow.add(mat('#ffd23f', { emissive: '#ffcf3a' }), 'sign', 0.9));
      star.position.y = 1.42;
      tree.add(star);
      const bulbs = ['#ff5a4a', '#ffd23f', '#5aa7ff', '#7cf08f'].map((c) => ctx.glow.add(mat(c, { emissive: c }), 'sign', 1.1));
      const bulbGeo = new THREE.SphereGeometry(0.025, 6, 5);
      for (let i = 0; i < 26; i++) {
        const t = i / 26, y = 0.32 + t * 0.95, r = (1 - t) * 0.4 + 0.04, a = i * 2.3;
        const b = new THREE.Mesh(bulbGeo, bulbs[i % bulbs.length]);
        b.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        tree.add(b);
      }
      tree.position.copy(BESIDE_DOOR);
      ctx.root.add(tree);
      ctx.states.show(tree, (c) => c.has('christmas'));
    }
  },
});
