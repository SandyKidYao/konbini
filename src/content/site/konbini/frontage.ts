// The front and the side of the shop:
//   · a forecourt from the staff yard's fence to road B, between the shop's apron and road A's sidewalk: the
//     vending machines and can bins against the yard's fence, a bike rack, bins and the umbrella stand by the door,
//     the cat under the awning; on the corner it carries on round to road B, with the pole sign;
//   · four bays beside the shop, nose-in to the side windows and opening straight onto road B — no aisle, no
//     driveway: the road is the aisle. Wheel stops and bollards; drivers walk up the gaps between the cars to the
//     walkway along the windows (the store's), and in at the side door or round to the front.
// Offers 'shop.parking' (the bays) for the parking events.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod, type SitePlot } from '../../../engine/mod';
import { mat, box, boxE, cyl, rod, V, groundPlane } from '../../../engine/kit/build';
import { materials } from '../../common/materials';
import { BRAND } from '../../common/palette';
import { binTex, poleSignTex, bayNumberTex } from '../../common/signage';
import { STORE, YARD, type ParkingBay, type ParkingService } from './api';

/** the walkway along the side windows ends at WALK; the bays run from it to road B's kerb line */
const WALK = STORE.x1 + 1.2, ROAD = 14, BAY_W = 2.5, BAYS = 4;
/** the forecourt: from the shop front (and, west of it, the yard's fence) to road A's sidewalk, the west neighbour to road B */
const COURT = { x0: YARD.x0, x1: ROAD, z0: STORE.z1, z1: 7.5 }, COURT_Y = 0.13;
const LOT_Y = 0.1;

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
    const S = ctx.surfaces;

    // ---------------------------------------------------------------- the forecourt
    const YARD_FRONT = { x0: YARD.x0, x1: STORE.x0, z0: YARD.z1, z1: COURT.z0 };
    boxE(root, COURT.x0, COURT.x1, 0, COURT_Y, COURT.z0, COURT.z1, M.tile, { uv: 1.2, cast: false });
    boxE(root, YARD_FRONT.x0, YARD_FRONT.x1, 0, COURT_Y, YARD_FRONT.z0, YARD_FRONT.z1, M.tile, { uv: 1.2, cast: false });
    S.addWalk(COURT, COURT_Y, 2);
    S.addWalk(YARD_FRONT, COURT_Y, 2);
    ctx.plan.add({ kind: 'walk', rect: COURT });
    ctx.fx.addSheen(COURT, COURT_Y);
    ctx.fx.addPuddle(-11.4, 6.4, 0.6, 1.3, 0.7);
    ctx.fx.addPuddle(11.6, 6.2, 0.5, 1.0, 0.8);

    // vending machines and can bins against the staff yard's fence; they throw a cool glow after dark
    place(ctx.prefabs.create('vending-machine', { body: '#e04a45', accent: '#a8262a', seed: 11 }), YARD.x0 + 0.75, COURT_Y, YARD.z1 + 0.62);
    place(ctx.prefabs.create('vending-machine', { body: '#f3f5f8', accent: '#2a6fd6', seed: 23 }), YARD.x0 + 1.83, COURT_Y, YARD.z1 + 0.62);
    const vendLight = new THREE.PointLight('#d6eaff', 0, 8, 2);
    vendLight.position.set(YARD.x0 + 1.3, 1.2, YARD.z1 + 1.6);
    root.add(vendLight);
    ctx.onFrame((_dt, _t, d) => { vendLight.intensity = (1 - d.daylight) * 4 + d.daylight * d.cloud * 1.5; });
    const binBody = mat('#e8e8e3');
    for (const i of [0, 1]) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.8, 0.38, 2, 0.04), [binBody, binBody, binBody, binBody, mat('#fff', { map: binTex('#2a6fd6', '空き缶') }), binBody]);
      m.position.set(YARD.x0 + 2.75 + i * 0.48, COURT_Y + 0.4, YARD.z1 + 0.45); m.castShadow = true;
      root.add(m);
    }
    // the bike rack along the yard's fence, past the bins
    boxE(root, YARD.x0 + 3.6, STORE.x0 - 0.5, COURT_Y, COURT_Y + 0.6, YARD.z1 + 0.25, YARD.z1 + 0.32, M.chrome);
    ['#eef3f5', '#5b8fb0', '#4a4f57'].forEach((color, i) => {
      place(ctx.prefabs.create('bicycle', { color }), YARD.x0 + 4.1 + i * 0.85, COURT_Y, YARD.z1 + 1.1, Math.PI / 2 + rr(-0.06, 0.06));
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
      g.position.set(1.4, FL, STORE.z1 + 0.4);
      root.add(g);
    }

    // sorted trash bins
    ([[BRAND.blue, 'びん・缶'], [BRAND.green, 'ペット'], ['#d7383b', 'もえる']] as const).forEach(([c, l], i) => {
      const bm = mat('#e8e8e3', { roughness: 0.5 });
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.0, 0.5, 2, 0.05), [bm, bm, mat(c), bm, mat('#fff', { map: binTex(c, l) }), bm]);
      m.position.set(2.4 + i * 0.6, FL + 0.5, STORE.z1 + 0.35); m.castShadow = m.receiveShadow = true;
      root.add(m);
    });

    // tall pole sign on the corner, where road A meets road B
    {
      const g = new THREE.Group();
      cyl(g, 0.12, 0.12, 4.2, M.chrome, 0, 0, 0, 12);
      const face = ctx.glow.add(new THREE.MeshStandardMaterial({ map: poleSignTex, emissiveMap: poleSignTex, emissive: '#fff', roughness: 0.4 }), 'sign', 1);
      const side = ctx.glow.add(mat(BRAND.green, { emissive: BRAND.green, roughness: 0.4 }), 'sign', 0.3);
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.95, 3.3, 0.36, 2, 0.05), [side, side, M.white, M.white, face, face]);
      m.position.y = 4.2 + 1.65; m.castShadow = true;
      g.add(m);
      g.position.set(ROAD - 0.6, COURT_Y, STORE.z1 + 0.9);
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
      cat.position.set(-2.6, FL, STORE.z1 + 0.7); cat.rotation.y = 0.5;
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

    // ---------------------------------------------------------------- the bays beside the shop
    // asphalt flush with road B, lines between the bays, a wheel stop in each and a bollard in front of each nose
    const lot = new THREE.Group();
    root.add(lot);
    const LOT = { x0: WALK, x1: ROAD, z0: STORE.z0, z1: STORE.z1 };
    boxE(lot, LOT.x0, LOT.x1, 0, LOT_Y, LOT.z0, LOT.z1, M.asphalt, { uv: 7, cast: false, plain: true });
    S.addWalk(LOT, LOT_Y, 2);
    ctx.plan.add({ kind: 'lot', rect: LOT });
    ctx.fx.addSheen(LOT, LOT_Y);
    ctx.fx.addPuddle(12.4, -2.4, 0.7, 1.1, 1.3);
    const STOP = WALK + 0.78;
    const centres = Array.from({ length: BAYS }, (_, i) => LOT.z0 + BAY_W * (i + 0.5));
    for (let i = 0; i <= BAYS; i++) {
      const z = LOT.z0 + BAY_W * i;
      groundPlane(lot, WALK + 0.3, ROAD - 0.15, z - 0.06, z + 0.06, LOT_Y + 0.012, M.roadPaint);
      ctx.plan.add({ kind: 'paint', rect: { x0: WALK + 0.3, x1: ROAD - 0.15, z0: z - 0.06, z1: z + 0.06 } });
    }
    const capM = ctx.glow.add(mat('#d7383b', { emissive: '#ff2a2a' }), 'lamp', 0.15);
    centres.forEach((z, i) => {
      box(lot, 0.16, 0.13, 1.4, M.wheelStop, STOP - 0.08, LOT_Y, z);
      cyl(root, 0.07, 0.07, 0.75, mat('#f4f4f0', { roughness: 0.4 }), WALK - 0.15, FL, z, 12);
      cyl(root, 0.075, 0.075, 0.08, capM, WALK - 0.15, FL + 0.55, z, 12, { cast: false });
      // bay numbers, at the road end of each bay, read by someone pulling in
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({
        map: bayNumberTex(i + 1), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.rotation.set(-Math.PI / 2, 0, Math.PI / 2); m.position.set(ROAD - 0.9, LOT_Y + 0.013, z); m.receiveShadow = true;
      lot.add(m);
    });

    // a lamp post at the back corner lights the bays after dark
    {
      const head = ctx.glow.add(mat('#ffffff', { emissive: '#fff1d8' }), 'lamp', 2.2);
      const x = ROAD - 0.25, z = LOT.z0 + 0.25;
      cyl(root, 0.06, 0.07, 5.0, M.pole, x, LOT_Y, z, 10);
      rod(root, V(x, 4.95, z), V(x - 1.3, 5.05, z + 0.3), 0.04, M.pole);
      box(root, 0.55, 0.12, 0.3, M.frame, x - 1.5, 4.95, z + 0.35);
      boxE(root, x - 1.72, x - 1.28, 4.93, 4.95, z + 0.24, z + 0.46, head, { cast: false, plain: true });
      const spot = new THREE.SpotLight('#ffe7c4', 0, 20, 1.05, 0.7, 1.4);
      spot.position.set(x - 1.5, 4.85, z + 0.35);
      spot.target.position.set(x - 2.5, 0, z + 5);
      root.add(spot, spot.target);
      ctx.onFrame(() => { spot.intensity = ctx.atmosphere.channel('lamp') * 26; });
    }

    // drivers get out on the right (−z, facing −x) and walk up the gap to the walkway, passengers on the left
    const bays: ParkingBay[] = centres.map((z) => ({ z, stop: STOP, walk: { driver: z - BAY_W / 2, passenger: z + BAY_W / 2, walkway: WALK - 0.6 } }));
    const held: (string | null)[] = bays.map(() => null);
    let front: string | null = null;
    ctx.services.provide<ParkingService>('shop.parking', {
      bays,
      holder: (i) => held[i],
      claim: (i, who) => { held[i] = who; },
      release: (i) => { held[i] = null; },
      takeFront: (who) => { front ??= who; return front === who; },
      freeFront: (who) => { if (front === who) front = null; },
    });

    // ---------------------------------------------------------------- the ways in on foot
    const plot = ctx.services.require<SitePlot>('world.plot');
    const N = ctx.nav, W = { width: 0.8 }, APRON = STORE.z1 + 1.3;
    // the apron runs along the shop front, past the door, to the corner where the walkway starts
    N.addNode('shop.apron.w', STORE.x0 + 0.2, APRON);
    N.addNode('shop.apron.e', WALK - 0.6, APRON);
    N.addEdge('shop.apron.w', 'shop.door.out', W);
    N.addEdge('shop.door.out', 'shop.apron.e', W);
    // down the walkway: the side door, then on past the bays to the back lane and road B's sidewalk beyond it
    N.addNode('shop.walk.n', WALK - 0.6, STORE.z0 + 0.4);
    N.addPath(['shop.apron.e', 'shop.side.out', 'shop.walk.n'], W);
    N.addEdge('shop.walk.n', 'street.b.side', { width: 1.0 });
    // in off road A's sidewalk, in front of the door and past the vending machines
    N.addNode('shop.front.e', STORE.x1 - 4.5, COURT.z1 - 0.65);
    N.addNode('shop.street.w', YARD.x0 + 3, 8.75);
    N.addNode('shop.front.w', YARD.x0 + 3, COURT.z1 - 0.9);
    N.addEdge(plot.entrance, 'shop.front.e', { width: 1.0 });
    N.addEdge('shop.front.e', 'shop.door.out', W);
    N.addEdge('street.a.west', 'shop.street.w', { width: 1.0 });
    N.addEdge('shop.street.w', plot.entrance, { width: 1.0 });
    N.addPath(['shop.street.w', 'shop.front.w', 'shop.apron.w'], W);
    // the corner: from the crossing over road B and the street corner, round to the apron
    N.addNode('shop.corner', WALK + 1.6, COURT.z1 - 1.9);
    N.addPath(['street.corner', 'shop.corner', 'shop.apron.e'], W);
    N.addEdge('street.b.crossing', 'shop.corner', { width: 1.0 });
    // the photo spot: the shop's corner and its sign behind whoever poses
    N.addNode('shop.photo.model', WALK + 1.4, STORE.z1 + 1.0, { heading: 0.9 });
    N.addNode('shop.photo.camera', ROAD - 1.0, COURT.z1 - 0.55, { heading: Math.PI + 0.9 });
    N.addEdge('shop.corner', 'shop.photo.model');
    N.addEdge('shop.corner', 'shop.photo.camera');
  },
});
