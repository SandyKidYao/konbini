// Land, sidewalks, curbs and road markings; the surfaces people walk on; puddles; the pedestrian network;
// and the plot reserved for the site.
import * as THREE from 'three';
import { defineMod, type SitePlot } from '../../engine/mod';
import { boxE, cyl, mat, groundPlane } from '../../engine/kit/build';
import { materials } from '../common/materials';
import { roadTomareTex, roadStopBoxTex } from '../common/signage';
import { BLOCK, PLOT, LANE, TRACK, COAST, SHORE, SIDEWALKS, SIDEWALK_Y, LAND_Y } from './layout';
import type { Railway } from './railway';
import type { Signals } from './furniture';

export default defineMod({
  id: 'konbini.world.streets',
  name: '道路与人行道',
  layer: 'world',
  requires: ['konbini.world.plinth'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root, S = ctx.surfaces;

    // land and verges
    const LAND_A = { x0: -28, x1: 11.5, z0: COAST.z1, z1: 7.5 }, LAND_B = { x0: 23, x1: 28, z0: COAST.z1, z1: 7.5 };
    boxE(root, LAND_A.x0, LAND_A.x1, 0, LAND_Y, LAND_A.z0, LAND_A.z1, M.concrete, { uv: 3.5, cast: false, r: 0.02 });
    boxE(root, LAND_B.x0, LAND_B.x1, 0, LAND_Y, LAND_B.z0, LAND_B.z1, M.concrete, { uv: 3.5, cast: false, r: 0.02 });
    boxE(root, -28, 28, 0, 0.06, 19.2, 24, M.grass, { uv: 3, cast: false, r: 0.02 });
    S.addWalk(LAND_A, LAND_Y);
    S.addWalk(LAND_B, LAND_Y);
    S.addWalk({ x0: -28, x1: 28, z0: 19.2, z1: 24 }, 0.06);

    // sidewalks + curbs
    for (const [x0, x1, z0, z1] of SIDEWALKS) {
      boxE(root, x0, x1, 0, SIDEWALK_Y, z0, z1, M.tile, { uv: 1.2, cast: false });
      S.addWalk({ x0, x1, z0, z1 }, SIDEWALK_Y, 1);
    }
    boxE(root, -28, 14, 0, 0.17, 9.8, 10, M.curb, { cast: false });
    const XING = { z0: TRACK.z - 1.9, z1: TRACK.z + 1.9 };   // the crossing deck: no kerbs across it
    boxE(root, 13.8, 14, 0, 0.17, COAST.z1, XING.z0, M.curb, { cast: false });
    boxE(root, 13.8, 14, 0, 0.17, XING.z1, LANE.z0, M.curb, { cast: false });
    boxE(root, 13.8, 14, 0, 0.17, PLOT.z1, 10, M.curb, { cast: false });
    boxE(root, 21, 21.2, 0, 0.17, COAST.z1, XING.z0, M.curb, { cast: false });
    boxE(root, 21, 21.2, 0, 0.17, XING.z1, 10, M.curb, { cast: false });
    // the coast road: kerbs along its land side (open where road B comes down) and along the promenade
    boxE(root, -28, 14, 0, 0.17, COAST.z1, COAST.z1 + 0.2, M.curb, { cast: false });
    boxE(root, 21, 28, 0, 0.17, COAST.z1, COAST.z1 + 0.2, M.curb, { cast: false });
    boxE(root, -28, 28, 0, 0.17, COAST.z0 - 0.2, COAST.z0, M.curb, { cast: false });
    boxE(root, 21, 28, 0, 0.17, 9.8, 10, M.curb, { cast: false });
    boxE(root, -28, 28, 0, 0.17, 17, 17.2, M.curb, { cast: false });

    // the plan (the map form): asphalt under everything, land and verges, sidewalks; the paint goes on as it's laid
    const plan = ctx.plan;
    plan.add({ kind: 'road', rect: BLOCK });
    plan.add({ kind: 'land', rect: LAND_A });
    plan.add({ kind: 'land', rect: LAND_B });
    plan.add({ kind: 'green', rect: { x0: -28, x1: 28, z0: 19.2, z1: 24 } });
    for (const [x0, x1, z0, z1] of SIDEWALKS) plan.add({ kind: 'walk', rect: { x0, x1, z0, z1 } });

    // road markings
    const paint = (x0: number, x1: number, z0: number, z1: number) => {
      groundPlane(root, x0, x1, z0, z1, 0.012, M.roadPaint);
      plan.add({ kind: 'paint', rect: { x0, x1, z0, z1 } });
    };
    for (let x = -27.5; x < 13; x += 4) paint(x, x + 2.2, 13.42, 13.58);
    for (let x = 22; x < 27.8; x += 4) paint(x, Math.min(x + 2.2, 28), 13.42, 13.58);
    paint(-28, 13.6, 10.35, 10.5); paint(-28, 13.6, 16.5, 16.65);
    paint(21.4, 28, 10.35, 10.5); paint(21.4, 28, 16.5, 16.65);
    paint(13.0, 13.4, 10.5, 13.4); paint(21.6, 22.0, 13.6, 16.5);
    // road B: its centre line and edge lines, broken by the crossing and the back lane's mouth
    const B0 = COAST.z1 + 0.6;
    for (let z = B0; z < 1.5; z += 4) if (z + 2.2 < XING.z0 - 1.2 || z > XING.z1 + 1.2) paint(17.42, 17.58, z, z + 2.2);
    paint(14.35, 14.5, B0, XING.z0 - 1.1); paint(14.35, 14.5, XING.z1 + 1.1, LANE.z0); paint(14.35, 14.5, LANE.z1, 3);
    paint(20.5, 20.65, B0, XING.z0 - 1.1); paint(20.5, 20.65, XING.z1 + 1.1, 3);
    // everyone stops before the level crossing (and down at the T, before the coast road)
    paint(14.5, 17.4, XING.z1 + 0.75, XING.z1 + 1.1); paint(17.6, 20.5, XING.z0 - 1.1, XING.z0 - 0.75);
    paint(14.5, 17.4, COAST.z1 + 0.25, COAST.z1 + 0.6);
    {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({
        map: roadTomareTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      t.rotation.set(-Math.PI / 2, 0, 0); t.position.set(15.95, 0.013, COAST.z1 + 2.2); t.receiveShadow = true;
      root.add(t);
    }
    // the coast road: a dashed centre line, edge lines, and a zebra crossing over to the promenade
    const CZ = (COAST.z0 + COAST.z1) / 2;
    for (let x = -27.5; x < 28; x += 4) if (x + 2.2 < 13.5 || x > 21.5) paint(x, Math.min(x + 2.2, 28), CZ - 0.08, CZ + 0.08);
    paint(-28, 13.6, COAST.z1 - 0.5, COAST.z1 - 0.35); paint(21.4, 28, COAST.z1 - 0.5, COAST.z1 - 0.35);
    paint(-28, 28, COAST.z0 + 0.35, COAST.z0 + 0.5);
    for (let z = COAST.z0 + 0.65; z < COAST.z1 - 0.65; z += 0.9) paint(2.6, 6.2, z, z + 0.45);
    for (let x = 14.6; x < 20.6; x += 0.9) paint(x, x + 0.45, 4.0, 7.6);
    paint(17.6, 20.5, 3.0, 3.4);
    const tomare = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({
      map: roadTomareTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    tomare.rotation.set(-Math.PI / 2, 0, Math.PI);
    tomare.position.set(19.05, 0.013, 0.6);
    tomare.receiveShadow = true;
    root.add(tomare);

    // 停止禁止 across road B's lane towards the lane mouth: whoever queues on road B leaves the mouth clear
    {
      const x0 = 14.55, x1 = 17.35, z0 = LANE.z0 - 0.3, z1 = LANE.z1 + 0.3, w = 0.15;
      paint(x0, x1, z0, z0 + w); paint(x0, x1, z1 - w, z1); paint(x0, x0 + w, z0, z1); paint(x1 - w, x1, z0, z1);
      const len = Math.hypot(x1 - x0, z1 - z0) - 0.35, ang = Math.atan2(z1 - z0, x1 - x0);
      for (const d of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), M.roadPaint);
        m.rotation.set(-Math.PI / 2, 0, d * ang); m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); m.receiveShadow = true;
        root.add(m);
      }
      const t = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({
        map: roadStopBoxTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      t.rotation.set(-Math.PI / 2, 0, 0); t.position.set((x0 + x1) / 2, 0.013, z1 + 0.55); t.receiveShadow = true;
      root.add(t);
    }

    // ---------------------------------------------------------------- the back lane
    // a strip of asphalt over the land and on through road B's sidewalk to the road, edge lines, 止まれ at its mouth
    boxE(root, LANE.x0, 11.5, LAND_Y - 0.01, LAND_Y + 0.04, LANE.z0, LANE.z1, M.asphalt, { uv: 6, cast: false });
    boxE(root, 11.5, LANE.x1, 0, LAND_Y + 0.04, LANE.z0, LANE.z1, M.asphalt, { uv: 6, cast: false });
    S.addWalk(LANE, LAND_Y + 0.04, 2);
    ctx.fx.addSheen(LANE, LAND_Y + 0.04);
    plan.add({ kind: 'road', rect: LANE });
    for (const z of [LANE.z0 + 0.2, LANE.z1 - 0.2]) groundPlane(root, LANE.x0, 12.9, z - 0.06, z + 0.06, LAND_Y + 0.052, M.roadPaint);
    groundPlane(root, 13.1, 13.3, LANE.z0 + 0.2, LANE.z1 - 0.2, LAND_Y + 0.052, M.roadPaint);
    {
      // reads for someone driving out towards road B (+x)
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshStandardMaterial({
        map: roadTomareTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      t.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); t.position.set(11.6, LAND_Y + 0.053, (LANE.z0 + LANE.z1) / 2); t.receiveShadow = true;
      root.add(t);
    }

    const manhole = mat('#4a4c50', { roughness: 0.5, metalness: 0.6 });
    for (const [x, z] of [[2, 13.5], [-15, 12], [17.5, -10]]) cyl(root, 0.42, 0.42, 0.02, manhole, x, 0, z, 24, { cast: false });

    // wet weather: sheen on every outdoor surface, puddles in the dips
    ctx.fx.addSheen({ ...BLOCK, z0: COAST.z0 }, 0);   // the roads (the sea has its own surface)
    ctx.fx.addSheen(LAND_A, LAND_Y);
    ctx.fx.addSheen(LAND_B, LAND_Y);
    for (const [x0, x1, z0, z1] of SIDEWALKS) ctx.fx.addSheen({ x0, x1, z0, z1 }, SIDEWALK_Y);
    for (const [x, z, r, sx, sz] of [
      [-9, 12.2, 1.6, 1.8, 0.8], [3.8, 15.0, 1.2, 1.6, 0.7], [-20, 14.6, 1.3, 1.6, 0.7], [17.2, 14.0, 1.8, 1.2, 1.1],
      [18.6, -6.0, 1.2, 0.8, 1.5], [16.0, -16, 1.0, 0.8, 1.4], [-20.5, 8.8, 0.6, 1.6, 0.6], [24.5, 13.2, 1.1, 1.4, 0.8],
      [-1.0, 12.0, 0.9, 1.6, 0.6], [12.8, 0.5, 0.5, 0.6, 1.2], [-13.5, 15.5, 1.0, 1.4, 0.6],
    ]) ctx.fx.addPuddle(x, z, r, sx, sz);

    // ---------------------------------------------------------------- pedestrian network
    const N = ctx.nav;
    const A = 8.75, XW = 5.8, BX = 12.45, B2X = 21.85;
    N.addNode('street.a.west', -27.6, A, { tags: ['spawn'] });
    N.addNode('street.a.front', 2.5, A);
    N.addNode('street.corner', BX, A);
    N.addNode('street.b.crossing', BX, XW);   // on the site's corner, now road B's sidewalk is gone there
    N.addNode('street.b.south', BX, COAST.z1 + 0.6);
    N.addNode('street.b2.crossing', B2X, XW);
    N.addNode('street.b2.south', B2X, COAST.z1 + 0.6);
    N.addNode('street.b2.corner', B2X, A);
    N.addNode('street.a2.east', 27.6, A, { tags: ['spawn'] });
    N.addNode('street.far.west', -27.6, 18.1, { tags: ['spawn', 'far'] });
    N.addNode('street.far.east', 27.6, 18.1, { tags: ['spawn', 'far'] });
    N.addPath(['street.a.west', 'street.a.front', 'street.corner', 'street.b.crossing'], { width: 1.0 });
    // road B's sidewalk on this side starts beyond the back lane; between here and the crossing the site's
    // frontage carries people (the active site links 'street.b.side' to 'street.b.crossing')
    N.addNode('street.b.side', BX, LANE.z0 - 0.6);
    // over the level crossing on either sidewalk: wait while it is closed
    const open = () => !ctx.services.get<Railway>('world.railway')?.closed();
    const rail = { width: 1.0, tags: ['level-crossing'], gate: open };
    for (const [x, id] of [[BX, 'b'], [B2X, 'b2']] as const) {
      N.addNode(`street.${id}.rail.n`, x, XING.z1 + 1.0);
      N.addNode(`street.${id}.rail.s`, x, XING.z0 - 1.0);
      N.addEdge(`street.${id}.rail.n`, `street.${id}.rail.s`, rail);
    }
    N.addPath(['street.b.side', 'street.b.rail.n'], { width: 1.0 });
    N.addPath(['street.b.rail.s', 'street.b.south'], { width: 1.0 });
    N.addPath(['street.b2.crossing', 'street.b2.corner', 'street.a2.east'], { width: 1.0 });
    N.addPath(['street.b2.rail.n', 'street.b2.crossing'], { width: 1.0 });
    N.addPath(['street.b2.south', 'street.b2.rail.s'], { width: 1.0 });
    // the coast road's sidewalk on the land side, out to either edge; a zebra over to the promenade
    const CW = COAST.z1 + 0.6, PW = (SHORE.promenade + COAST.z0) / 2;
    N.addNode('coast.west', -27.6, CW, { tags: ['spawn'] });
    N.addNode('coast.zebra.n', 4.4, CW);
    N.addNode('coast.east', 27.6, CW, { tags: ['spawn'] });
    N.addPath(['coast.west', 'coast.zebra.n', 'street.b.south'], { width: 1.0 });
    N.addPath(['street.b2.south', 'coast.east'], { width: 1.0 });
    N.addNode('coast.zebra.s', 4.4, PW);
    N.addEdge('coast.zebra.n', 'coast.zebra.s', { width: 2.6, tags: ['crosswalk'] });
    N.addNode('coast.prom.west', -27.6, PW, { tags: ['spawn'] });
    N.addNode('coast.prom.east', 27.6, PW, { tags: ['spawn'] });
    N.addPath(['coast.prom.west', 'coast.zebra.s', 'coast.prom.east'], { width: 0.8 });
    N.addPath(['street.far.west', 'street.far.east'], { width: 0.8 });
    // the zebra crossing over road B: wait for the green man
    N.addEdge('street.b.crossing', 'street.b2.crossing', {
      width: 2.2, tags: ['crosswalk'],
      gate: (t) => ctx.services.get<Signals>('world.signals')?.ped(t) === 'g',
    });

    // the plot for the main subject
    ctx.services.provide<SitePlot>('world.plot', { bounds: PLOT, entrance: 'street.a.front', ground: LAND_Y });
  },
});
