// The front of the shop: parking lot, vending machines, bikes, bins, umbrella stand, bollards, cones,
// guard rails, the pole sign, the cat under the awning, two parked cars — and the path in from the street.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod, type SitePlot } from '../../../engine/mod';
import { mat, box, boxE, cyl, rod, V, groundPlane } from '../../../engine/kit/build';
import { materials } from '../../common/materials';
import { BRAND } from '../../common/palette';
import { binTex, poleSignTex } from '../../common/signage';
import { STORE } from './api';

export default defineMod({
  id: 'konbini.site.frontage',
  name: '门前场地',
  layer: 'site',
  site: 'konbini',
  requires: ['konbini.library', 'konbini.site.store'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root, FL = STORE.floor;
    const { range: rr } = ctx.mod.random;
    const place = <T extends { root: THREE.Object3D }>(h: T, x: number, y: number, z: number, ry = 0) => {
      h.root.position.set(x, y, z); h.root.rotation.y = ry; root.add(h.root); return h;
    };

    // parking lot
    boxE(root, -7.2, 11.5, 0.08, 0.1, 0.25, 7.5, M.asphalt, { uv: 7, cast: false, plain: true });
    ctx.surfaces.addWalk({ x0: -7.2, x1: 11.5, z0: 0.25, z1: 7.5 }, 0.1, 2);
    for (let x = -6.6; x <= 10.5; x += 2.6) groundPlane(root, x - 0.06, x + 0.06, 1.0, 6.0, 0.112, M.roadPaint);
    for (let x = -5.3; x < 10; x += 2.6) box(root, 1.4, 0.13, 0.16, M.wheelStop, x, 0.1, 1.5);
    ctx.fx.addSheen({ x0: -7.2, x1: 11.5, z0: 0.25, z1: 7.5 }, 0.1);
    for (const [x, z, r, sx, sz] of [[-3.4, 1.0, 1.0, 1.5, 0.6], [3.4, 5.6, 1.4, 1.2, 1], [5.6, 1.6, 0.8, 1.3, 0.8], [-5.6, 6.0, 0.8, 1, 1], [10.0, 6.4, 0.7, 1, 1]]) {
      ctx.fx.addPuddle(x, z, r, sx, sz);
    }

    // parked cars, nose-in toward the store
    place(ctx.prefabs.create('car', { color: '#f3f1ea', len: 3.4, width: 1.48, bodyH: 0.68, cabinLen: 2.55, cabinH: 0.86, cabinX: -0.3 }), -0.1, 0.1, 3.55, Math.PI / 2);
    place(ctx.prefabs.create('car', { color: '#5f7fae', len: 4.5, width: 1.74, bodyH: 0.66, cabinLen: 2.3, cabinH: 0.58, cabinX: -0.3 }), 7.7, 0.1, 4.0, Math.PI / 2);

    // vending machines: two out front, two on the side terrace
    place(ctx.prefabs.create('vending-machine', { body: '#e04a45', accent: '#a8262a', seed: 11 }), -10.6, 0.08, -1.3);
    place(ctx.prefabs.create('vending-machine', { body: '#f3f5f8', accent: '#2a6fd6', seed: 23 }), -9.52, 0.08, -1.3);
    place(ctx.prefabs.create('vending-machine', { body: '#3d78d6', accent: '#1d4f9e', seed: 37 }), 9.5, 0.08, -9.6, Math.PI / 2);
    place(ctx.prefabs.create('vending-machine', { body: '#e04a45', accent: '#a8262a', seed: 41 }), 9.5, 0.08, -8.52, Math.PI / 2);
    // the front vending machines throw a cool glow onto the ground after dark
    const vendLight = new THREE.PointLight('#d6eaff', 0, 8, 2);
    vendLight.position.set(-10, 1.2, -0.3);
    root.add(vendLight);
    ctx.onFrame((_dt, _t, d) => { vendLight.intensity = (1 - d.daylight) * 4 + d.daylight * d.cloud * 1.5; });
    const binBody = mat('#e8e8e3');
    for (const i of [0, 1]) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.8, 0.38, 2, 0.04), [binBody, binBody, binBody, binBody, mat('#fff', { map: binTex('#2a6fd6', '空き缶') }), binBody]);
      m.position.set(-8.4 + i * 0.48, 0.48, -1.2); m.castShadow = true;
      root.add(m);
    }

    // bikes under the awning
    ['#eef3f5', '#5b8fb0', '#e07a6a', '#4a4f57'].forEach((color, i) => {
      place(ctx.prefabs.create('bicycle', { color }), -6.2 + i * 0.75, FL, -0.75, Math.PI / 2 + rr(-0.06, 0.06));
    });

    // umbrella stand with vinyl umbrellas
    {
      const g = new THREE.Group();
      boxE(g, -0.4, 0.4, 0, 0.06, -0.2, 0.2, M.chrome);
      boxE(g, -0.4, 0.4, 0.55, 0.6, -0.2, 0.2, M.chrome);
      for (const x of [-0.38, 0.38]) for (const z of [-0.18, 0.18]) cyl(g, 0.015, 0.015, 0.6, M.chrome, x, 0, z, 6);
      ['#eaf2f6', '#eaf2f6', '#2c3d66', '#c4474e', '#eaf2f6', '#3a7a5a'].forEach((c, i) => {
        const clear = c === '#eaf2f6';
        const um = mat(c, { roughness: 0.3, transparent: clear, opacity: clear ? 0.65 : 1 });
        const x = -0.28 + (i % 3) * 0.28, z = i < 3 ? -0.08 : 0.08;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.72, 10), um);
        cone.position.set(x, 0.42, z); cone.rotation.set(Math.PI, 0, rr(-0.08, 0.08)); cone.castShadow = true; g.add(cone);
        rod(g, V(x, 0.75, z), V(x, 0.95, z), 0.012, M.darkMetal);
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), M.rubber);
        h.position.set(x + 0.05, 0.95, z); g.add(h);
      });
      g.position.set(2.6, FL, -1.6);
      root.add(g);
    }

    // sorted trash bins
    ([[BRAND.blue, 'びん・缶'], [BRAND.green, 'ペット'], ['#d7383b', 'もえる']] as const).forEach(([c, l], i) => {
      const bm = mat('#e8e8e3', { roughness: 0.5 });
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.0, 0.5, 2, 0.05), [bm, bm, mat(c), bm, mat('#fff', { map: binTex(c, l) }), bm]);
      m.position.set(3.6 + i * 0.6, FL + 0.5, -1.65); m.castShadow = m.receiveShadow = true;
      root.add(m);
    });

    // bollards with reflective caps, cones
    const capM = ctx.glow.add(mat('#d7383b', { emissive: '#ff2a2a' }), 'lamp', 0.15);
    for (const x of [-6.2, -3.6, -1.0, 4.2, 6.8, 9.4]) {
      cyl(root, 0.07, 0.07, 0.75, mat('#f4f4f0', { roughness: 0.4 }), x, FL, 0.45, 12);
      cyl(root, 0.075, 0.075, 0.08, capM, x, FL + 0.55, 0.45, 12, { cast: false });
    }
    place(ctx.prefabs.create('traffic-cone', {}), 9.7, 0.1, 5.8);
    place(ctx.prefabs.create('traffic-cone', {}), 10.4, 0.1, 4.9);

    // white pipe guard rails
    const railMat = mat('#f3f3f0', { roughness: 0.35, metalness: 0.15 });
    const pipeRail = (a: THREE.Vector3, b: THREE.Vector3, h = 0.8) => {
      rod(root, V(a.x, h, a.z), V(b.x, h, b.z), 0.035, railMat);
      rod(root, V(a.x, h * 0.55, a.z), V(b.x, h * 0.55, b.z), 0.03, railMat);
      const n = Math.max(1, Math.round(a.distanceTo(b) / 2));
      for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); cyl(root, 0.04, 0.04, h, railMat, p.x, 0.08, p.z, 8); }
    };
    pipeRail(V(11.3, 0, -1.8), V(11.3, 0, 3.6));
    pipeRail(V(-7.4, 0, 0.6), V(-7.4, 0, 7.2));

    // tall pole sign at the lot corner
    {
      const g = new THREE.Group();
      cyl(g, 0.12, 0.12, 4.2, M.chrome, 0, 0, 0, 12);
      const face = ctx.glow.add(new THREE.MeshStandardMaterial({ map: poleSignTex, emissiveMap: poleSignTex, emissive: '#fff', roughness: 0.4 }), 'sign', 1);
      const side = ctx.glow.add(mat(BRAND.green, { emissive: BRAND.green, roughness: 0.4 }), 'sign', 0.3);
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.95, 3.3, 0.36, 2, 0.05), [side, side, M.white, M.white, face, face]);
      m.position.y = 4.2 + 1.65; m.castShadow = true;
      g.add(m);
      g.position.set(10.6, 0.1, 6.6);
      g.rotation.y = 0.5;
      root.add(g);
    }

    // the cat sheltering under the awning: click it and it hops
    const cat = new THREE.Group();
    {
      const cm = mat('#e19a4c', { roughness: 0.8 }), wm = mat('#f6f1e7', { roughness: 0.8 });
      const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = true; cat.add(m); return m; };
      add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), cm), 0, 0.2, 0).scale.set(1, 1.25, 1.2);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), wm), 0, 0.2, 0.12);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), cm), 0, 0.45, 0.07);
      for (const s of [-1, 1]) {
        add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), cm), s * 0.06, 0.55, 0.06).rotation.z = -s * 0.25;
        add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), mat('#2a2a2a')), s * 0.04, 0.47, 0.17);
      }
      const tail = add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.06, -0.15), V(0.15, 0.04, -0.12), V(0.22, 0.05, 0.05), V(0.18, 0.1, 0.15)]), 12, 0.025, 6), cm), 0, 0, 0);
      cat.position.set(-1.4, FL, -1.3); cat.rotation.y = 0.5;
      root.add(cat);
      let hop = -1;
      ctx.interact.clickable(cat, () => { if (hop < 0) { hop = 0; ctx.audio.play('meow'); } }, '小猫');
      ctx.onFrame((dt, t) => {
        tail.rotation.y = Math.sin(t * 1.3) * 0.25;
        if (hop < 0) return;
        hop += dt;
        const k = Math.min(1, hop / 0.55), s = Math.sin(k * Math.PI);
        cat.position.y = FL + s * 0.35;
        cat.rotation.y = 0.5 + s * 0.6;
        const sq = 1 + Math.sin(k * Math.PI * 2) * 0.08;
        cat.scale.set(1 / sq, sq, 1 / sq);
        if (k >= 1) { hop = -1; cat.scale.setScalar(1); cat.position.y = FL; }
      });
    }

    // the way in from the street
    const plot = ctx.services.require<SitePlot>('world.plot');
    ctx.nav.addNode('shop.lot.gate', 2.5, 7.2);
    ctx.nav.addNode('shop.lot.mid', 2.5, 0.9);
    ctx.nav.addPath([plot.entrance, 'shop.lot.gate', 'shop.lot.mid', 'shop.door.out'], { width: 0.6 });
  },
});
