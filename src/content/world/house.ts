// The far west end, past さくら堂: an ordinary family house. Two storeys in pale siding under a brown gable roof, a
// balcony with the washing out over the front door's canopy, a little car nosed out in the drive, a dogwood in the
// front garden behind a block wall with a gate in it. It is the quiet end of the street; nobody shops here.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, rod, V } from '../../engine/kit/build';
import { materials, windowPane } from '../common/materials';
import { sidingTex, hedgeTex } from '../common/surfaces';
import { plantTree } from '../common/trees';
import { BLOCK, LANE, LAND_Y } from './layout';

/** the lot: from the back lane to road A's sidewalk, from the model's west edge to さくら堂's eaves */
const LOT = { x0: BLOCK.x0, x1: -28.1, z0: LANE.z1, z1: 7.5 };
/** the house's walls; in front of it, west to east: the drive, the porch, the garden */
const H = { x0: -36.4, x1: -29.4, z0: -5.4, z1: 0.6 };
const DRIVE = { x0: LOT.x0 + 0.2, x1: -33.8, z0: H.z1, z1: LOT.z1 }, GATE = { x0: -31.75, x1: -30.55 };

export default defineMod({
  id: 'konbini.world.house',
  name: '民家',
  layer: 'world',
  requires: ['konbini.library', 'konbini.world.streets'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root, S = ctx.surfaces;
    const { next: rand, pick } = ctx.mod.random;
    const FH = 2.7, WALL = 5.6, RISE = 1.9, EAVE = 0.5, base = LAND_Y;
    const siding = mat('#d5dcd8', { map: sidingTex, roughness: 0.85 }), trim = mat('#f4f2ec', { roughness: 0.7 });
    const roofM = mat('#6b4a3c', { roughness: 0.6, flatShading: true }), footing = mat('#9c9a94', { roughness: 0.9 });
    const sash = mat('#8a8f93', { roughness: 0.4, metalness: 0.5 });

    // ---------------------------------------------------------------- the house
    const { x0, x1, z0, z1 } = H, zc = (z0 + z1) / 2, half = (z1 - z0) / 2;
    boxE(root, x0 - 0.03, x1 + 0.03, base, 0.42, z0 - 0.03, z1 + 0.03, footing, { cast: false });
    boxE(root, x0, x1, 0.42, WALL, z0, z1, siding, { uv: 2.4 });
    boxE(root, x0 - 0.04, x1 + 0.04, FH, FH + 0.12, z0 - 0.04, z1 + 0.04, trim, { cast: false });
    // the gable: siding up to the ridge at either end, two roof slabs over it, a ridge cap
    {
      const s = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, RISE)]);
      const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false }), siding);
      gable.geometry.translate(0, 0, -(x1 - x0) / 2);
      gable.rotation.y = Math.PI / 2; gable.position.set((x0 + x1) / 2, WALL, zc); gable.castShadow = gable.receiveShadow = true;
      root.add(gable);
      const pitch = Math.atan2(RISE, half), run = half + EAVE, slab = run / Math.cos(pitch), len = x1 - x0 + 2 * EAVE;
      for (const side of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, slab), roofM);
        r.rotation.x = side * pitch;
        r.position.set((x0 + x1) / 2, WALL + RISE - (run / 2) * Math.tan(pitch) + 0.07, zc + side * run / 2);
        r.castShadow = r.receiveShadow = true;
        root.add(r);
      }
      boxE(root, x0 - EAVE, x1 + EAVE, WALL + RISE - 0.02, WALL + RISE + 0.16, zc - 0.14, zc + 0.14, mat('#4e3a31', { roughness: 0.6 }));
    }
    S.addRoof({ x0: x0 - EAVE, x1: x1 + EAVE, z0: z0 - EAVE, z1: z1 + EAVE }, WALL + RISE * 0.5);
    ctx.plan.add({ kind: 'building', rect: { x0: x0 - EAVE, x1: x1 + EAVE, z0: z0 - EAVE, z1: z1 + EAVE }, h: WALL + RISE, color: '#6b4a3c', glow: 'window' });

    // windows: a framed pane, lit (curtains, warm or cool) in the evening like the rest of the street
    const pane = (ax0: number, ax1: number, y0: number, y1: number, face: 'n' | 's' | 'e' | 'w', lit = rand() < 0.55) => {
      const m = lit ? windowPane(ctx, rand() < 0.75 ? 'warm' : 'cool') : M.darkGlass;
      const o = { cast: false, plain: true };
      if (face === 's' || face === 'n') {
        const z = face === 's' ? z1 : z0, d = face === 's' ? 1 : -1;
        boxE(root, ax0, ax1, y0, y1, Math.min(z, z + d * 0.04), Math.max(z, z + d * 0.04), m, o);
        boxE(root, ax0 - 0.06, ax1 + 0.06, y0 - 0.08, y0, Math.min(z, z + d * 0.12), Math.max(z, z + d * 0.12), trim, o);
        boxE(root, (ax0 + ax1) / 2 - 0.025, (ax0 + ax1) / 2 + 0.025, y0, y1, Math.min(z, z + d * 0.06), Math.max(z, z + d * 0.06), sash, o);
      } else {
        const x = face === 'e' ? x1 : x0, d = face === 'e' ? 1 : -1;
        boxE(root, Math.min(x, x + d * 0.04), Math.max(x, x + d * 0.04), y0, y1, ax0, ax1, m, o);
        boxE(root, Math.min(x, x + d * 0.12), Math.max(x, x + d * 0.12), y0 - 0.08, y0, ax0 - 0.06, ax1 + 0.06, trim, o);
      }
    };
    // the front: the living room's glass doors onto the garden side of the drive, the front door under its canopy;
    // upstairs the glass doors out to the balcony, and a bedroom window
    pane(-36.0, -33.9, 0.5, 2.35, 's', true);
    pane(-35.8, -33.2, FH + 0.25, FH + 2.2, 's');
    pane(-31.7, -30.3, FH + 0.9, FH + 2.0, 's');
    // the back, towards the lane: kitchen and bathroom below, two bedrooms above; and the ends
    pane(-35.6, -34.4, 1.2, 2.1, 'n'); pane(-31.4, -30.8, 1.5, 2.1, 'n', false);
    pane(-35.9, -34.3, FH + 0.9, FH + 2.0, 'n'); pane(-32.4, -30.8, FH + 0.9, FH + 2.0, 'n');
    pane(-3.4, -1.8, FH + 0.9, FH + 2.0, 'e'); pane(-2.8, -2.0, 1.3, 2.1, 'e', false);
    pane(-3.6, -2.2, FH + 0.9, FH + 2.0, 'w');

    // the front door: a step, the door, a canopy over it and a lamp beside it
    const DOOR = { x0: -31.65, x1: -30.65 };
    boxE(root, DOOR.x0 - 0.55, DOOR.x1 + 0.55, base, 0.3, z1, z1 + 0.9, mat('#c9c3b5', { roughness: 0.85 }), { cast: false });
    S.addWalk({ x0: DOOR.x0 - 0.55, x1: DOOR.x1 + 0.55, z0: z1, z1: z1 + 0.9 }, 0.3, 3);
    boxE(root, DOOR.x0, DOOR.x1, 0.3, 2.4, z1, z1 + 0.05, mat('#6b4c3a', { roughness: 0.6 }), { cast: false, plain: true });
    boxE(root, DOOR.x0 + 0.15, DOOR.x0 + 0.3, 0.9, 2.1, z1 + 0.05, z1 + 0.07, M.darkGlass, { cast: false, plain: true });
    box(root, 0.04, 0.2, 0.05, M.chrome, DOOR.x1 - 0.15, 1.15, z1 + 0.08, { plain: true });
    boxE(root, DOOR.x0 - 0.6, DOOR.x1 + 0.6, 2.62, 2.72, z1, z1 + 1.0, trim);
    S.addShelter({ x0: DOOR.x0 - 0.6, x1: DOOR.x1 + 0.6, z0: z1, z1: z1 + 1.0 });
    box(root, 0.14, 0.22, 0.1, ctx.glow.add(mat('#fff8ea', { emissive: '#ffd9a0', emissiveIntensity: 0 }), 'lamp', 1.2), DOOR.x1 + 0.3, 1.95, z1 + 0.06, { plain: true });
    box(root, 0.3, 0.1, 0.02, mat('#f2eee4'), DOOR.x0 - 0.3, 1.7, z1 + 0.01, { plain: true });   // the name plate

    // the balcony over the living room: a slab, a railing, the washing on a pole, an air conditioner
    {
      const B = { x0: -36.2, x1: -32.6, z0: z1, z1: z1 + 1.0 };
      boxE(root, B.x0, B.x1, FH - 0.02, FH + 0.14, B.z0, B.z1, trim);
      boxE(root, B.x0, B.x1, FH + 0.14, FH + 1.05, B.z1 - 0.06, B.z1, mat('#b9bfc0', { roughness: 0.5, metalness: 0.2 }), { cast: false });
      for (const x of [B.x0, B.x1 - 0.06]) boxE(root, x, x + 0.06, FH + 0.14, FH + 1.05, B.z0, B.z1, mat('#b9bfc0'), { cast: false });
      S.addShelter(B);
      const steel = M.chrome, y = FH + 1.75;
      for (const x of [B.x0 + 0.15, B.x1 - 0.15]) rod(root, V(x, FH + 0.14, B.z1 - 0.25), V(x, y, B.z1 - 0.25), 0.02, steel, 4, false);
      rod(root, V(B.x0 + 0.15, y, B.z1 - 0.25), V(B.x1 - 0.15, y, B.z1 - 0.25), 0.016, steel, 4, false);
      const cloth = ['#f2f0ea', '#9cc0de', '#f2b8a8', '#f4d87a', '#b7d8bf', '#ffffff'];
      for (let x = B.x0 + 0.35; x < B.x1 - 0.4; x += 0.38 + rand() * 0.2) {
        const h = 0.3 + rand() * 0.45;
        boxE(root, x, x + 0.28, y - 0.02 - h, y - 0.02, B.z1 - 0.26, B.z1 - 0.24, mat(pick(cloth), { roughness: 0.9, side: THREE.DoubleSide }), { cast: false, plain: true });
      }
      // a futon airing over the rail
      boxE(root, B.x1 - 1.5, B.x1 - 0.3, FH + 0.55, FH + 1.12, B.z1 - 0.02, B.z1 + 0.06, mat('#e7d6c6', { roughness: 1 }), { cast: false });
      const u = ctx.prefabs.create('ac-unit', {}).root;
      u.position.set(B.x0 + 0.5, FH + 0.14, B.z0 + 0.35); root.add(u);
    }

    // ---------------------------------------------------------------- out front
    // the drive: concrete out to the sidewalk, the family's little car nosed out towards the road
    boxE(root, DRIVE.x0, DRIVE.x1, base, 0.12, DRIVE.z0, DRIVE.z1, M.concrete, { uv: 3, cast: false, plain: true });
    S.addWalk(DRIVE, 0.12, 2);
    ctx.plan.add({ kind: 'lot', rect: DRIVE, color: '#cfcac0' });
    {
      const kei = ctx.prefabs.create('car', { color: '#eee6cf', len: 3.4, width: 1.48, bodyH: 0.66, cabinLen: 2.3, cabinH: 0.9, cabinX: -0.35 });
      kei.root.position.set((DRIVE.x0 + DRIVE.x1) / 2, 0.12, 3.6);
      kei.root.rotation.y = -Math.PI / 2 + 0.03;
      root.add(kei.root);
    }
    // the garden: gravel, a strip of lawn, stepping stones from the gate to the door, a dogwood, pots by the step
    const G = { x0: DRIVE.x1, x1: LOT.x1, z0: z1, z1: LOT.z1 - 0.35 };
    boxE(root, G.x0, G.x1, base, 0.11, G.z0, G.z1, mat('#b8b2a4', { roughness: 1 }), { cast: false, plain: true });
    boxE(root, GATE.x1 + 0.4, G.x1 - 0.3, base, 0.125, z1 + 1.4, G.z1 - 0.3, M.grass, { uv: 3, cast: false, plain: true });
    ctx.plan.add({ kind: 'green', rect: { x0: GATE.x1 + 0.4, x1: G.x1 - 0.3, z0: z1 + 1.4, z1: G.z1 - 0.3 } });
    for (let z = G.z1 - 0.45, i = 0; z > z1 + 1.0; z -= 0.75, i++) cyl(root, 0.26, 0.28, 0.06, mat('#a9a497', { roughness: 0.9 }), (GATE.x0 + GATE.x1) / 2 + (i % 2 ? 0.08 : -0.08), 0.1, z, 9);
    ctx.plan.add({ kind: 'walk', rect: { x0: GATE.x0 + 0.2, x1: GATE.x1 - 0.2, z0: z1 + 0.9, z1: G.z1 }, color: '#d9d0bd' });
    plantTree(ctx, root, 'hanamizuki', -29.4, 4.4, { size: 0.9 });
    for (const [x, z, r] of [[DOOR.x0 - 0.75, z1 + 0.45, 0.2], [DOOR.x1 + 0.75, z1 + 0.4, 0.17], [DOOR.x1 + 1.15, z1 + 0.5, 0.14]]) {
      cyl(root, r, r * 0.75, r * 1.5, mat('#9a5d3e'), x, 0.11, z, 10);
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.3, 1), mat(pick(['#5e9a52', '#6fa65a', '#d86a7a']), { flatShading: true }));
      l.position.set(x, 0.11 + r * 1.5 + r, z); l.castShadow = true; root.add(l);
    }
    {
      const b = ctx.prefabs.create('bicycle', { color: '#d9765f' }).root;
      b.position.set(DRIVE.x1 + 0.45, 0.11, z1 + 1.5); b.rotation.y = -Math.PI / 2 + 0.08;
      root.add(b);
    }

    // the block wall along the sidewalk, the gate posts with the post box, a hedge along さくら堂's side
    {
      const zw0 = LOT.z1 - 0.35, zw1 = LOT.z1 - 0.15, cap = mat('#b5b0a6', { roughness: 0.8 });
      for (const [a, b] of [[DRIVE.x1, GATE.x0 - 0.25], [GATE.x1 + 0.25, LOT.x1]]) {
        boxE(root, a, b, base, 1.0, zw0, zw1, M.block, { uv: 0.8 });
        boxE(root, a - 0.02, b + 0.02, 1.0, 1.06, zw0 - 0.03, zw1 + 0.03, cap, { cast: false });
      }
      for (const x of [GATE.x0 - 0.25, GATE.x1]) boxE(root, x, x + 0.25, base, 1.3, zw0 - 0.03, zw1 + 0.03, cap);
      box(root, 0.28, 0.32, 0.12, mat('#4f5a63', { roughness: 0.5, metalness: 0.3 }), GATE.x1 + 0.12, 0.85, zw1 + 0.09, { plain: true });
      box(root, 0.18, 0.12, 0.04, mat('#e8e4da'), GATE.x0 - 0.12, 1.1, zw1 + 0.04, { plain: true });
      // the gate itself, a low lattice standing open into the garden
      const leaf = new THREE.Group();
      leaf.position.set(GATE.x0, 0, zw0); leaf.rotation.y = 1.2;
      for (let x = 0.04; x < 0.6; x += 0.1) boxE(leaf, x, x + 0.04, 0.15, 1.0, -0.02, 0.02, M.darkMetal, { cast: false, plain: true });
      boxE(leaf, 0, 0.6, 0.9, 0.95, -0.025, 0.025, M.darkMetal, { cast: false, plain: true });
      root.add(leaf);
      ctx.plan.add({ kind: 'building', rect: { x0: DRIVE.x1, x1: LOT.x1, z0: zw0, z1: zw1 }, h: 1.0, color: '#b9b4aa' });

      const hm = mat('#ffffff', { map: hedgeTex, roughness: 1 });
      boxE(root, LOT.x1 - 0.4, LOT.x1, base, 0.95, z1 + 0.2, zw0, hm, { uv: 1.5, r: 0.15 });
      ctx.plan.add({ kind: 'green', rect: { x0: LOT.x1 - 0.4, x1: LOT.x1, z0: z1 + 0.2, z1: zw0 }, color: '#86ad6a' });
    }

    // round the east side, in the gap by さくら堂: the air conditioner, the gas meter, a water tap
    {
      const u = ctx.prefabs.create('ac-unit', {}).root;
      u.position.set(x1 + 0.35, base, -1.2); u.rotation.y = Math.PI / 2; root.add(u);
      box(root, 0.3, 0.4, 0.18, mat('#c8ccc9'), x1 + 0.1, 1.3, -3.4, { plain: true });
      cyl(root, 0.03, 0.03, 0.6, M.chrome, x1 + 0.15, base, -4.4, 6);
    }
  },
});
