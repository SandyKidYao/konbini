// The front of the shop, laid out so people and cars never share a path:
//   · a car park of six nose-in bays along the shop front, with a deep aisle behind them and a two-way driveway
//     at each end (painted 徐行 where they meet the aisle);
//   · people come in on foot through the plaza on the west (vending machines, the bike rack, a photo spot) or up
//     the lane on the east from the street corner, both onto the apron in front of the door; pipe rails keep them
//     out of the car park, and drivers step from their car straight up onto the apron;
//   · bins, the umbrella stand, bollards, the pole sign and the cat under the awning.
// Offers 'shop.parking' (bays, driveways, the aisle) for the parking events.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod, type SitePlot } from '../../../engine/mod';
import { mat, box, boxE, cyl, rod, V, groundPlane } from '../../../engine/kit/build';
import { materials } from '../../common/materials';
import { BRAND } from '../../common/palette';
import { binTex, poleSignTex, roadJokoTex, roadArrowTex, bayNumberTex, parkingSignTex } from '../../common/signage';
import { STORE, type ParkingBay, type Driveway, type ParkingService } from './api';

/** the car park: from the plaza rail to the east lane rail, from the apron to the sidewalk */
const LOT = { x0: -8.4, x1: 9.9, z0: -4.25, z1: 7.5 };
const BAY_W = 2.5, BAY_X0 = -7.2, BAYS = 6, WHEEL_STOP = -3.0, BAY_Z1 = 1.25;
/** the plaza (west) and the lane (east) people walk in by */
const PLAZA = { x0: -13.9, x1: LOT.x0 };
const LANE = { x0: LOT.x1, x1: 11.5 };
const APRON_Z = -4.65;    // where people walk along the apron, in front of the bollards

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

    // ---------------------------------------------------------------- car park
    boxE(root, LOT.x0, LOT.x1, 0.08, 0.1, LOT.z0, LOT.z1, M.asphalt, { uv: 7, cast: false, plain: true });
    ctx.plan.add({ kind: 'lot', rect: LOT });
    S.addWalk(LOT, 0.1, 2);
    ctx.fx.addSheen(LOT, 0.1);
    for (const [x, z, r, sx, sz] of [[-2.0, 4.8, 1.2, 1.6, 0.7], [4.2, 3.4, 1.0, 1.3, 0.8], [8.6, 6.2, 0.7, 1, 1], [-7.4, 2.6, 0.6, 1, 1.3], [1.6, 6.6, 0.8, 1.4, 0.6]]) {
      ctx.fx.addPuddle(x, z, r, sx, sz);
    }
    const centres = Array.from({ length: BAYS }, (_, i) => BAY_X0 + BAY_W * (i + 0.5));
    for (let i = 0; i <= BAYS; i++) {
      const x = BAY_X0 + BAY_W * i;
      groundPlane(root, x - 0.06, x + 0.06, WHEEL_STOP - 0.75, BAY_Z1, 0.112, M.roadPaint);
      ctx.plan.add({ kind: 'paint', rect: { x0: x - 0.06, x1: x + 0.06, z0: WHEEL_STOP - 0.75, z1: BAY_Z1 } });
    }
    // the far end of the bays, and the edge of the aisle along the sidewalk
    groundPlane(root, BAY_X0 - 0.06, BAY_X0 + BAY_W * BAYS + 0.06, BAY_Z1 - 0.12, BAY_Z1, 0.112, M.roadPaint);
    for (const x of centres) box(root, 1.4, 0.13, 0.16, M.wheelStop, x, 0.1, WHEEL_STOP);
    // bollards guard the glass, one in front of each bay's nose; people walk up the gaps between them
    const capM = ctx.glow.add(mat('#d7383b', { emissive: '#ff2a2a' }), 'lamp', 0.15);
    for (const x of centres) {
      cyl(root, 0.07, 0.07, 0.75, mat('#f4f4f0', { roughness: 0.4 }), x, FL, -4.4, 12);
      cyl(root, 0.075, 0.075, 0.08, capM, x, FL + 0.55, -4.4, 12, { cast: false });
    }

    // two-way driveways at either end: across the sidewalk, and 徐行 where they meet the aisle
    const driveways: Driveway[] = [
      { x: -6.7, mouth: 7.4, from: ['west', 'east'], to: ['west', 'east'] },
      // the east one is right by the junction: in and out on the near lane only, never across the traffic
      { x: 8.45, mouth: 7.4, from: ['west'], to: ['east'] },
    ];
    const padM = M.concrete;
    /** something painted flat on the asphalt; `turn` = 0 reads for a driver heading −z (coming in) */
    const paintMark = (tex: THREE.Texture, w: number, h: number, x: number, z: number, turn = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
        map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.rotation.set(-Math.PI / 2, 0, turn);
      m.position.set(x, 0.113, z);
      m.receiveShadow = true;
      root.add(m);
    };
    for (const d of driveways) {
      const x0 = Math.max(LOT.x0, d.x - 1.7), x1 = Math.min(LOT.x1, d.x + 1.7);
      boxE(root, x0, x1, 0.15, 0.156, 7.5, 9.8, padM, { uv: 2, cast: false });
      ctx.plan.add({ kind: 'walk', rect: { x0, x1, z0: 7.5, z1: 9.8 } });
      paintMark(roadJokoTex, 1.8, 0.9, d.x, 6.2);
      // two-way: in on the left, out on the left (we drive on the left)
      paintMark(roadArrowTex, 0.55, 1.1, d.x - 0.75, 4.1);
      paintMark(roadArrowTex, 0.55, 1.1, d.x + 0.75, 4.1, Math.PI);
    }
    // bay numbers, at the aisle end of each bay
    centres.forEach((x, i) => paintMark(bayNumberTex(i + 1), 0.7, 0.7, x, BAY_Z1 - 0.65));

    // a little "P 出入口" sign beside each driveway, just outside the car park
    {
      const face = new THREE.MeshStandardMaterial({ map: parkingSignTex, roughness: 0.4 });
      for (const [x, y0] of [[LOT.x0 - 0.35, 0.13], [LOT.x1 + 0.22, 0.15]]) {
        cyl(root, 0.035, 0.035, 1.55, M.chrome, x, y0, 7.4, 8);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.03), [M.white, M.white, M.white, M.white, face, M.white]);
        m.position.set(x, y0 + 1.5, 7.42); m.castShadow = true;
        root.add(m);
      }
    }

    // lamp posts at either side light the car park after dark
    {
      const head = ctx.glow.add(mat('#ffffff', { emissive: '#fff1d8' }), 'lamp', 2.2);
      const lamps: THREE.SpotLight[] = [];
      for (const [x, dir, y0] of [[LOT.x0 - 0.35, 1, 0.13], [LOT.x1 + 0.22, -1, 0.15]] as const) {
        const z = 1.6;
        cyl(root, 0.06, 0.07, 5.0, M.pole, x, y0, z, 10);
        rod(root, V(x, 4.95, z), V(x + dir * 1.3, 5.05, z), 0.04, M.pole);
        box(root, 0.55, 0.12, 0.3, M.frame, x + dir * 1.5, 4.95, z);
        boxE(root, x + dir * 1.5 - 0.22, x + dir * 1.5 + 0.22, 4.93, 4.95, z - 0.11, z + 0.11, head, { cast: false, plain: true });
        const spot = new THREE.SpotLight('#ffe7c4', 0, 20, 1.05, 0.7, 1.4);
        spot.position.set(x + dir * 1.5, 4.85, z);
        spot.target.position.set(x + dir * 5.5, 0, z + 0.4);
        root.add(spot, spot.target);
        lamps.push(spot);
      }
      ctx.onFrame(() => { const v = ctx.atmosphere.channel('lamp') * 26; for (const l of lamps) l.intensity = v; });
    }

    // the bays: drivers get out on the right (+x) and walk up the gap to the apron, passengers on the left
    const bays: ParkingBay[] = centres.map((x) => ({ x, stop: WHEEL_STOP + 0.08, walk: { driver: x + BAY_W / 2, passenger: x - BAY_W / 2, apron: APRON_Z } }));
    const held: (string | null)[] = bays.map(() => null);
    let aisle: string | null = null;
    ctx.services.provide<ParkingService>('shop.parking', {
      bays, driveways,
      aisle: { in: 5.4, out: 4.6, x0: LOT.x0, x1: LOT.x1 },
      holder: (i) => held[i],
      claim: (i, who) => { held[i] = who; },
      release: (i) => { held[i] = null; },
      takeAisle: (who) => { aisle ??= who; return aisle === who; },
      freeAisle: (who) => { if (aisle === who) aisle = null; },
    });

    // white pipe rails between the car park and the ways in on foot
    const railMat = mat('#f3f3f0', { roughness: 0.35, metalness: 0.15 });
    const pipeRail = (a: THREE.Vector3, b: THREE.Vector3, h = 0.8) => {
      rod(root, V(a.x, h, a.z), V(b.x, h, b.z), 0.035, railMat);
      rod(root, V(a.x, h * 0.55, a.z), V(b.x, h * 0.55, b.z), 0.03, railMat);
      const n = Math.max(1, Math.round(a.distanceTo(b) / 2));
      for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); cyl(root, 0.04, 0.04, h, railMat, p.x, 0.08, p.z, 8); }
    };
    pipeRail(V(LOT.x0 - 0.05, 0, -3.6), V(LOT.x0 - 0.05, 0, 7.3));
    pipeRail(V(LOT.x1 + 0.05, 0, -3.6), V(LOT.x1 + 0.05, 0, 7.3));

    // ---------------------------------------------------------------- the plaza (west)
    boxE(root, PLAZA.x0, PLAZA.x1, 0.08, 0.13, -7.8, 7.5, M.tile, { uv: 1.2, cast: false });
    boxE(root, PLAZA.x1, -7.2, 0.08, 0.13, -7.8, LOT.z0, M.tile, { uv: 1.2, cast: false });
    S.addWalk({ x0: PLAZA.x0, x1: PLAZA.x1, z0: -7.8, z1: 7.5 }, 0.13, 2);
    ctx.plan.add({ kind: 'walk', rect: { x0: PLAZA.x0, x1: PLAZA.x1, z0: -7.8, z1: 7.5 } });
    ctx.plan.add({ kind: 'walk', rect: { x0: PLAZA.x1, x1: -7.2, z0: -7.8, z1: LOT.z0 } });
    S.addWalk({ x0: PLAZA.x1, x1: -7.2, z0: -7.8, z1: LOT.z0 }, 0.13, 2);
    ctx.fx.addSheen({ x0: PLAZA.x0, x1: PLAZA.x1, z0: -7.8, z1: 7.5 }, 0.13);
    ctx.fx.addPuddle(-11.8, 1.8, 0.7, 1.2, 0.8);
    // vending machines and their can bins against the back-yard fence
    place(ctx.prefabs.create('vending-machine', { body: '#e04a45', accent: '#a8262a', seed: 11 }), -11.9, 0.13, -7.15);
    place(ctx.prefabs.create('vending-machine', { body: '#f3f5f8', accent: '#2a6fd6', seed: 23 }), -10.82, 0.13, -7.15);
    // they throw a cool glow onto the plaza after dark
    const vendLight = new THREE.PointLight('#d6eaff', 0, 8, 2);
    vendLight.position.set(-11.3, 1.2, -6.2);
    root.add(vendLight);
    ctx.onFrame((_dt, _t, d) => { vendLight.intensity = (1 - d.daylight) * 4 + d.daylight * d.cloud * 1.5; });
    const binBody = mat('#e8e8e3');
    for (const i of [0, 1]) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.8, 0.38, 2, 0.04), [binBody, binBody, binBody, binBody, mat('#fff', { map: binTex('#2a6fd6', '空き缶') }), binBody]);
      m.position.set(-9.9 + i * 0.48, 0.53, -7.2); m.castShadow = true;
      root.add(m);
    }
    // the bike rack along the west wall
    boxE(root, -13.75, -13.65, 0.13, 0.75, -3.4, 1.0, M.chrome);
    ['#eef3f5', '#5b8fb0', '#e07a6a', '#4a4f57', '#f2c84b'].forEach((color, i) => {
      if (i === 3) return;   // a gap in the rack
      place(ctx.prefabs.create('bicycle', { color }), -13.05, 0.13, -2.9 + i * 0.85, rr(-0.06, 0.06));
    });
    // planters along the sidewalk, with a way in between them
    {
      const potM = mat('#d8d2c6', { roughness: 0.8 }), leafM = mat('#6f9a5c', { roughness: 0.85 });
      for (const [x0, x1] of [[PLAZA.x0, -12.3], [-10.1, PLAZA.x1 - 0.1]]) {
        boxE(root, x0, x1, 0.13, 0.55, 6.6, 7.3, potM);
        for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.6) {
          const l = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.3, 0.42), 1), leafM);
          l.position.set(x, 0.75, 6.95 + rr(-0.1, 0.1)); l.scale.y = 0.8; l.castShadow = true;
          root.add(l);
        }
      }
    }

    // ---------------------------------------------------------------- the lane (east), up from the street corner
    boxE(root, LANE.x0, LANE.x1, 0.08, 0.15, LOT.z0, 7.5, M.tile, { uv: 1.2, cast: false });
    S.addWalk({ x0: LANE.x0, x1: LANE.x1, z0: LOT.z0, z1: 7.5 }, 0.15, 2);
    ctx.plan.add({ kind: 'walk', rect: { x0: LANE.x0, x1: LANE.x1, z0: LOT.z0, z1: 7.5 } });
    ctx.fx.addSheen({ x0: LANE.x0, x1: LANE.x1, z0: LOT.z0, z1: 7.5 }, 0.15);

    // vending machines on the side terrace
    place(ctx.prefabs.create('vending-machine', { body: '#3d78d6', accent: '#1d4f9e', seed: 37 }), 9.5, 0.08, -14.1, Math.PI / 2);
    place(ctx.prefabs.create('vending-machine', { body: '#e04a45', accent: '#a8262a', seed: 41 }), 9.5, 0.08, -13.02, Math.PI / 2);

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
      g.position.set(2.6, FL, -6.1);
      root.add(g);
    }

    // sorted trash bins
    ([[BRAND.blue, 'びん・缶'], [BRAND.green, 'ペット'], ['#d7383b', 'もえる']] as const).forEach(([c, l], i) => {
      const bm = mat('#e8e8e3', { roughness: 0.5 });
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.0, 0.5, 2, 0.05), [bm, bm, mat(c), bm, mat('#fff', { map: binTex(c, l) }), bm]);
      m.position.set(3.6 + i * 0.6, FL + 0.5, -6.15); m.castShadow = m.receiveShadow = true;
      root.add(m);
    });

    // tall pole sign at the street corner of the lane
    {
      const g = new THREE.Group();
      cyl(g, 0.12, 0.12, 4.2, M.chrome, 0, 0, 0, 12);
      const face = ctx.glow.add(new THREE.MeshStandardMaterial({ map: poleSignTex, emissiveMap: poleSignTex, emissive: '#fff', roughness: 0.4 }), 'sign', 1);
      const side = ctx.glow.add(mat(BRAND.green, { emissive: BRAND.green, roughness: 0.4 }), 'sign', 0.3);
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.95, 3.3, 0.36, 2, 0.05), [side, side, M.white, M.white, face, face]);
      m.position.y = 4.2 + 1.65; m.castShadow = true;
      g.add(m);
      g.position.set(11.15, 0.15, 6.7);
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
      cat.position.set(-1.4, FL, -5.8); cat.rotation.y = 0.5;
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

    // ---------------------------------------------------------------- the ways in on foot
    const plot = ctx.services.require<SitePlot>('world.plot');
    const N = ctx.nav, W = { width: 0.8 };
    // the apron runs along the shop front, past the door, from the plaza to the lane
    N.addNode('shop.apron.w', -8.0, APRON_Z - 0.75);
    N.addNode('shop.apron.e', 10.4, APRON_Z - 0.5);
    N.addEdge('shop.apron.w', 'shop.door.out', W);
    N.addEdge('shop.door.out', 'shop.apron.e', W);
    // west: in from the sidewalk between the planters, across the plaza
    N.addNode('shop.plaza.street', -11.2, 8.75);
    N.addNode('shop.plaza.gate', -11.2, 6.2);
    N.addNode('shop.plaza.mid', -10.0, -3.6);
    N.addEdge('street.a.west', 'shop.plaza.street', { width: 1.0 });
    N.addEdge('shop.plaza.street', plot.entrance, { width: 1.0 });
    N.addPath(['shop.plaza.street', 'shop.plaza.gate', 'shop.plaza.mid', 'shop.apron.w'], W);
    // the photo spot: the shop's corner and its sign behind whoever poses
    N.addNode('shop.photo.model', -9.3, -2.9, { heading: 0.2 });
    N.addNode('shop.photo.camera', -10.6, 3.0, { heading: Math.PI + 0.2 });
    N.addEdge('shop.plaza.mid', 'shop.photo.model');
    N.addEdge('shop.plaza.gate', 'shop.photo.camera');
    N.addEdge('shop.photo.camera', 'shop.plaza.mid');
    // east: up the lane from the street corner
    N.addNode('shop.lane.street', 10.7, 8.75);
    N.addNode('shop.lane.gate', 10.7, 7.0);
    N.addEdge(plot.entrance, 'shop.lane.street', { width: 1.0 });
    N.addEdge('shop.lane.street', 'street.corner', { width: 1.0 });
    N.addPath(['shop.lane.street', 'shop.lane.gate', 'shop.apron.e'], W);
  },
});
