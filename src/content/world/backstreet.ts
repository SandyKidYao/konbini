// Across the back lane from the shop, between it and the railway: 桜荘, a long two-storey timber apartment of the
// Shōwa kind — an open gallery along the lane with a row of doors, washing on the rail, a steel stair at the end,
// a tin roof — and, in the corner by the west tunnel, a small park: a big zelkova, a pine, a bench, a slide.
// The apartment is the backdrop to the shop from the front; the train goes by behind it.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, rod, V, canvasTex, FONT_JP as JP } from '../../engine/kit/build';
import { materials, windowPane } from '../common/materials';
import { plantTree } from '../common/trees';
import { LANE, TRACK } from './layout';

/** the apartment's body (its gallery runs out from z1 towards the lane) */
export const SAKURASO = { x0: -10.6, x1: 10.2, z0: TRACK.z + TRACK.fence + 0.5, z1: TRACK.z + TRACK.fence + 4.3 };
const PARK = { x0: -27.5, x1: -12.4, z0: TRACK.z + TRACK.fence + 1.3, z1: LANE.z0 - 0.5 };

export default defineMod({
  id: 'konbini.world.backstreet',
  name: '后巷对面',
  layer: 'world',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root, S = ctx.surfaces;
    const { next: rand, pick } = ctx.mod.random;

    // ---------------------------------------------------------------- 桜荘
    {
      const g = new THREE.Group();
      root.add(g);
      const { x0, x1, z0, z1 } = SAKURASO, FH = 2.8, H = 2 * FH + 0.2, GAL = 1.15;
      const siding = mat('#cdbf9f', { roughness: 0.9 }), trim = mat('#7c5f49', { roughness: 0.8 }), tin = mat('#5f6d78', { roughness: 0.55, metalness: 0.2, flatShading: true });
      boxE(g, x0, x1, 0.08, H, z0, z1, siding);
      for (let y = 0.5; y < H; y += 0.32) boxE(g, x0 - 0.01, x1 + 0.01, y, y + 0.03, z1, z1 + 0.015, mat('#bfb090'), { cast: false, plain: true });
      boxE(g, x0 - 0.04, x1 + 0.04, FH - 0.12, FH + 0.04, z0 - 0.04, z1 + 0.04, trim);
      // the tin roof, a low gable along the building
      {
        const w = z1 - z0 + 1.0, len = x1 - x0 + 1.0, rh = 1.5;
        const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
        const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }), tin);
        roof.geometry.translate(0, 0, -len / 2);
        roof.rotation.y = Math.PI / 2; roof.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
        roof.castShadow = roof.receiveShadow = true;
        g.add(roof);
      }
      // the doors and kitchen windows along the gallery side, both floors
      const units = Math.floor((x1 - x0 - 1.2) / 2.6);
      for (let f = 0; f < 2; f++) for (let i = 0; i < units; i++) {
        const dx = x0 + 1.0 + i * 2.6, y = 0.08 + f * FH;
        boxE(g, dx, dx + 0.85, y + 0.06, y + 2.0, z1, z1 + 0.05, mat(f ? '#6c7f8a' : '#7b5c45', { roughness: 0.7 }), { cast: false, plain: true });
        box(g, 0.05, 0.05, 0.05, M.chrome, dx + 0.72, y + 1.0, z1 + 0.06, { plain: true });
        const lit = rand() < 0.4 ? windowPane(ctx, rand() < 0.7 ? 'warm' : 'cool') : M.darkGlass;
        boxE(g, dx + 1.1, dx + 2.1, y + 1.05, y + 1.85, z1, z1 + 0.05, lit, { cast: false, plain: true });
        boxE(g, dx + 1.0, dx + 2.2, y + 1.0, y + 1.06, z1, z1 + 0.18, trim, { cast: false, plain: true });
        if (rand() < 0.6) box(g, 0.75, 0.55, 0.3, mat('#e6e8e4'), dx + 1.6, y + 0.06, z1 + 0.35);   // a washing machine by the door
        if (rand() < 0.5) cyl(g, 0.17, 0.13, 0.3, mat('#b0704a'), dx - 0.25, y + 0.06, z1 + 0.4, 8);
      }
      // the upstairs gallery: walkway, a railing with the washing on it, posts down to the ground, the eave above
      boxE(g, x0, x1, FH - 0.05, FH + 0.1, z1, z1 + GAL, mat('#9a8f80', { roughness: 0.8 }));
      boxE(g, x0, x1, FH + 0.95, FH + 1.02, z1 + GAL - 0.06, z1 + GAL, trim, { cast: false });
      for (let x = x0 + 0.05; x < x1; x += 0.16) boxE(g, x, x + 0.03, FH + 0.1, FH + 0.95, z1 + GAL - 0.05, z1 + GAL - 0.02, trim, { cast: false, plain: true });
      for (let x = x0 + 0.1; x < x1; x += 2.6) cyl(g, 0.05, 0.05, FH, trim, x, 0.08, z1 + GAL - 0.06, 6);
      boxE(g, x0 - 0.2, x1 + 0.2, H - 0.1, H, z1, z1 + GAL + 0.15, tin);
      const cloth = ['#f2f0ea', '#8fb4d9', '#f2b5a5', '#f5d76e', '#a8d5ba', '#ffffff'];
      for (const [a, b] of [[x0 + 3, x0 + 6.6], [x1 - 7.4, x1 - 4.4], [x1 - 3.0, x1 - 1.2]]) {
        rod(g, V(a, FH + 2.15, z1 + 0.85), V(b, FH + 2.15, z1 + 0.85), 0.015, M.chrome, 4, false);
        for (let x = a + 0.2; x < b - 0.2; x += 0.42 + rand() * 0.25) {
          const h = 0.35 + rand() * 0.4;
          boxE(g, x, x + 0.3, FH + 2.13 - h, FH + 2.13, z1 + 0.84, z1 + 0.86, mat(pick(cloth), { roughness: 0.9, side: THREE.DoubleSide }), { cast: false, plain: true });
        }
      }
      // the steel stair up the west end
      {
        const steel = mat('#7d8a8f', { roughness: 0.5, metalness: 0.3 }), sx0 = x0 - 1.3, sx1 = x0;
        const run = 3.0, zTop = z1 + 0.2, zBot = zTop + 0.01 - run;
        const flight = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0 - 0.1, 0.12, Math.hypot(run, FH)), steel);
        flight.position.set((sx0 + sx1) / 2, 0.08 + FH / 2, (zTop + zBot) / 2); flight.rotation.x = -Math.atan2(FH, run); flight.castShadow = true;
        g.add(flight);
        boxE(g, sx0, sx1, FH - 0.08, FH + 0.04, zTop - 0.2, zTop + GAL, steel);
        for (const z of [zBot, zTop + GAL - 0.1]) cyl(g, 0.05, 0.05, FH, steel, sx0 + 0.06, 0.08, z, 6);
        rod(g, V(sx0 + 0.05, 1.0, zBot), V(sx0 + 0.05, FH + 1.0, zTop), 0.025, steel, 5);
      }
      // the name board by the stair, the post boxes, bicycles under the gallery
      {
        const t = canvasTex(160, 48, (c, w, h) => { c.fillStyle = '#f3eee3'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a3a36'; c.font = `700 30px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('桜 荘', w / 2, h / 2 + 2); });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.27), mat('#ffffff', { map: t }));
        m.position.set(x0 + 0.6, 1.7, z1 + 0.03); g.add(m);
        for (let i = 0; i < 6; i++) box(g, 0.32, 0.3, 0.3, mat('#a7b0b5', { roughness: 0.5, metalness: 0.3 }), x0 + 1.4 + i * 0.36, 0.95, z1 + 0.2, { plain: true });
        box(g, 2.2, 0.9, 0.06, mat('#8f9a8f'), x0 + 2.1, 0.08, z1 + 0.04, { plain: true });
      }
      // the back (seen past the shop's roof): windows and the air conditioners, toward the railway
      for (let f = 0; f < 2; f++) for (let x = x0 + 1.6; x < x1 - 1; x += 2.6) {
        const lit = rand() < 0.3 ? windowPane(ctx, 'warm') : M.darkGlass;
        boxE(g, x - 0.7, x + 0.7, 0.08 + f * FH + 0.9, 0.08 + f * FH + 2.0, z0 - 0.05, z0, lit, { cast: false, plain: true });
        if (rand() < 0.6) box(g, 0.75, 0.55, 0.28, mat('#eeeeea'), x + 1.1, 0.08 + f * FH + 0.15, z0 - 0.2);
      }
      S.addRoof({ x0: x0 - 0.5, x1: x1 + 0.5, z0: z0 - 0.5, z1: z1 + 0.5 }, H + 0.8);
      S.addShelter({ x0, x1, z0: z1, z1: z1 + GAL });
      ctx.plan.add({ kind: 'building', rect: { x0: x0 - 0.5, x1: x1 + 0.5, z0: z0 - 0.5, z1: z1 + GAL + 0.15 }, h: H + 1.5, color: '#5f6d78', glow: 'window' });
    }

    // ---------------------------------------------------------------- the park
    {
      const { x0, x1, z0, z1 } = PARK;
      boxE(root, x0, x1, 0.08, 0.11, z0, z1, mat('#c9bfa6', { roughness: 1 }), { cast: false, plain: true });
      boxE(root, x0 + 1, x0 + 6, 0.08, 0.125, z0 + 0.6, z1 - 0.8, M.grass, { cast: false, plain: true });
      ctx.plan.add({ kind: 'walk', rect: PARK, color: '#d6cdb6' });
      ctx.plan.add({ kind: 'green', rect: { x0: x0 + 1, x1: x0 + 6, z0: z0 + 0.6, z1: z1 - 0.8 } });
      // a low wall along the lane, open in the middle
      const wall = M.block;
      boxE(root, x0, -21.5, 0.08, 0.6, z1 - 0.15, z1, wall, { uv: 0.8 });
      boxE(root, -19.5, x1, 0.08, 0.6, z1 - 0.15, z1, wall, { uv: 0.8 });
      boxE(root, x1 - 0.15, x1, 0.08, 0.6, z0, z1, wall, { uv: 0.8 });
      plantTree(ctx, root, 'keyaki', -17.0, (z0 + z1) / 2 - 0.4, { size: 1.35 });
      plantTree(ctx, root, 'pine', x0 + 1.6, z0 + 1.2, { size: 0.95 });
      // a bench under the zelkova, a little slide, the sandpit
      const wood = mat('#a8784f', { roughness: 0.7 }), dark = mat('#555a5e');
      for (let i = 0; i < 3; i++) box(root, 1.7, 0.05, 0.12, wood, -14.6, 0.53, z1 - 1.1 + i * 0.15, { plain: true });
      for (const dx of [-0.7, 0.7]) box(root, 0.06, 0.45, 0.42, dark, -14.6 + dx, 0.08, z1 - 0.95, { plain: true });
      const red = mat('#e05b4a', { roughness: 0.6 }), yellow = mat('#f2c14e', { roughness: 0.6 });
      boxE(root, -24.4, -23.6, 0.08, 1.5, z0 + 0.4, z0 + 1.2, red);
      const chute = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 2.4), yellow);
      chute.position.set(-24.0, 0.85, z0 + 2.3); chute.rotation.x = 0.55; chute.castShadow = true; root.add(chute);
      boxE(root, -22.6, -20.8, 0.08, 0.25, z0 + 0.5, z0 + 2.1, mat('#bfb39a', { roughness: 0.9 }));
      boxE(root, -22.45, -20.95, 0.24, 0.26, z0 + 0.65, z0 + 1.95, mat('#e3d2a8', { roughness: 1 }), { cast: false, plain: true });
    }
  },
});
