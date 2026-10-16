// The west end of the block: さくら堂, an old two-storey shop-house selling wagashi. Dark timber lattice below,
// plaster above, a tiled pent roof with the shop's board standing on it, an indigo noren over the door, a glass
// case of sweets, a red bench under a red parasol, and a flag for the season's sweet. Beside it a small garden with
// a persimmon, behind bamboo fences: one in line with the staff yard's fence (a wicket gate in it), one along the
// back. In front, paving out to the sidewalk, all the way along to the shop's forecourt.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, canvasTex, FONT_JP as JP } from '../../engine/kit/build';
import { materials, windowPane } from '../common/materials';
import { plantTree } from '../common/trees';
import { LANE, PLOT } from './layout';

const B = { x0: -27.6, x1: -19.4, z0: LANE.z1 + 0.4, z1: 3.4 }, GARDEN = { x0: B.x1, x1: PLOT.x0, z0: B.z0, z1: 3.5 };

export default defineMod({
  id: 'konbini.world.westend',
  name: '和菓子屋さくら堂',
  layer: 'world',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root, S = ctx.surfaces;
    const H1 = 3.0, H = 6.0, zf = B.z1 - 0.9;   // the shop front is set back under the floor above
    const wood = mat('#5b3f2e', { roughness: 0.8 }), slat = mat('#3e2c22', { roughness: 0.8 });
    const plaster = mat('#efe8da', { roughness: 0.9 }), tile = mat('#4a4f57', { roughness: 0.55, flatShading: true });
    const label = (text: string, bg: string, fg: string, w = 320, h = 76) => canvasTex(w, h, (c) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = `700 ${Math.round(h * 0.55)}px ${JP}`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
    });

    // ---------------------------------------------------------------- the house
    boxE(root, B.x0, B.x1, 0.08, H1, B.z0, zf, wood);
    boxE(root, B.x0, B.x1, H1, H, B.z0, B.z1, plaster);
    boxE(root, B.x0 - 0.04, B.x1 + 0.04, H1 - 0.05, H1 + 0.2, B.z1 - 0.06, B.z1 + 0.04, wood);
    for (const x of [B.x0 + 0.1, -25, -22.6, -20.2, B.x1 - 0.1]) boxE(root, x - 0.09, x + 0.09, 0.08, H1, B.z1 - 0.2, B.z1 - 0.02, wood);
    // the shop front: lattice either side, a glass case of sweets, the door under its noren
    const lattice = (x0: number, x1: number) => {
      boxE(root, x0, x1, 0.3, 2.6, zf, zf + 0.03, ctx.glow.add(mat('#d9cdb3', { emissive: '#ffe2b0', emissiveIntensity: 0 }), 'window', 0.5), { cast: false, plain: true });
      for (let x = x0 + 0.05; x < x1; x += 0.13) boxE(root, x, x + 0.045, 0.3, 2.6, zf + 0.03, zf + 0.08, slat, { cast: false, plain: true });
    };
    lattice(B.x0 + 0.3, -24.9); lattice(-20.1, B.x1 - 0.3);
    boxE(root, -24.6, -22.9, 0.08, 0.75, zf, zf + 0.7, wood);
    boxE(root, -24.55, -22.95, 0.75, 1.35, zf, zf + 0.65, ctx.glow.add(mat('#e8f0f0', { roughness: 0.1, emissive: '#fff4dc', emissiveIntensity: 0 }), 'window', 0.6), { cast: false, plain: true });
    ['#f3bccb', '#9cc86a', '#f2f0ea', '#c9603f', '#f3bccb'].forEach((c, i) => box(root, 0.2, 0.12, 0.2, mat(c, { roughness: 0.7 }), -24.3 + i * 0.3, 0.78, zf + 0.3, { plain: true }));
    boxE(root, -22.6, -20.4, 0.08, 2.3, zf, zf + 0.04, M.darkGlass, { cast: false, plain: true });
    const noren = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.85), mat('#ffffff', { map: label('和菓子', '#2c3d66', '#f3eee3', 256, 100), side: THREE.DoubleSide }));
    noren.position.set(-21.5, 1.92, zf + 0.25); noren.castShadow = true; root.add(noren);
    boxE(root, -22.7, -20.3, 2.34, 2.38, zf + 0.15, zf + 0.35, wood);
    // the pent roof across the front, the shop's board standing on it
    const pent = new THREE.Mesh(new THREE.BoxGeometry(B.x1 - B.x0 + 0.5, 0.1, 1.25), tile);
    pent.position.set((B.x0 + B.x1) / 2, H1 + 0.42, B.z1 + 0.42); pent.rotation.x = 0.36; pent.castShadow = pent.receiveShadow = true;
    root.add(pent);
    {
      const face = ctx.glow.add(mat('#ffffff', { map: label('さくら堂', '#5b3f2e', '#f3e7cf'), emissive: '#ffe6c0', emissiveIntensity: 0 }), 'window', 0.25);
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 0.1), [wood, wood, wood, wood, face, wood]);
      // in front of the plaster, its foot just clear of the pent roof's top edge, below the upstairs windows
      board.position.set(-23.5, H1 + 0.99, B.z1 + 0.07); board.castShadow = true; root.add(board);
    }
    // upstairs: two lattice windows, the main tiled roof with its ridge
    for (const x of [-25.7, -21.3]) {
      boxE(root, x - 1.1, x + 1.1, H1 + 1.5, H1 + 2.5, B.z1, B.z1 + 0.04, windowPane(ctx, 'warm'), { cast: false, plain: true });
      for (let k = -1.05; k < 1.1; k += 0.16) boxE(root, x + k, x + k + 0.05, H1 + 1.5, H1 + 2.5, B.z1 + 0.04, B.z1 + 0.09, slat, { cast: false, plain: true });
    }
    {
      const w = B.z1 - B.z0 + 0.9, len = B.x1 - B.x0 + 0.9, rh = 2.1;
      const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }), tile);
      roof.geometry.translate(0, 0, -len / 2);
      roof.rotation.y = Math.PI / 2; roof.position.set((B.x0 + B.x1) / 2, H, (B.z0 + B.z1) / 2);
      roof.castShadow = roof.receiveShadow = true;
      root.add(roof);
      boxE(root, B.x0 - 0.45, B.x1 + 0.45, H + rh - 0.05, H + rh + 0.15, (B.z0 + B.z1) / 2 - 0.15, (B.z0 + B.z1) / 2 + 0.15, mat('#3a3f45'));
    }
    S.addRoof({ x0: B.x0 - 0.45, x1: B.x1 + 0.45, z0: B.z0 - 0.45, z1: B.z1 + 0.45 }, H + 1.0);
    S.addShelter({ x0: B.x0, x1: B.x1, z0: zf, z1: B.z1 + 0.8 });
    ctx.plan.add({ kind: 'building', rect: { x0: B.x0 - 0.45, x1: B.x1 + 0.45, z0: B.z0 - 0.45, z1: B.z1 + 0.45 }, h: H + 2.1, color: '#4a4f57', glow: 'window' });

    // ---------------------------------------------------------------- out front
    const paving = mat('#cfc6b4', { roughness: 0.9 });
    boxE(root, B.x0, PLOT.x0, 0.08, 0.16, GARDEN.z1, 7.5, paving, { cast: false, plain: true });
    boxE(root, B.x0, B.x1, 0.08, 0.16, zf, GARDEN.z1, paving, { cast: false, plain: true });
    S.addWalk({ x0: B.x0, x1: PLOT.x0, z0: zf, z1: 7.5 }, 0.16, 2);
    ctx.plan.add({ kind: 'walk', rect: { x0: B.x0, x1: PLOT.x0, z0: zf, z1: 7.5 }, color: '#d9d0bd' });
    // the red bench under the parasol
    const red = mat('#c83a32', { roughness: 0.9 });
    boxE(root, -27.2, -25.5, 0.45, 0.55, zf + 1.2, zf + 1.75, red);
    for (const x of [-27.05, -25.65]) boxE(root, x - 0.05, x + 0.05, 0.16, 0.45, zf + 1.25, zf + 1.7, wood);
    cyl(root, 0.03, 0.03, 2.4, wood, -26.35, 0.16, zf + 1.5, 6);
    const para = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.45, 18, 1, true), mat('#c83a32', { roughness: 0.9, side: THREE.DoubleSide }));
    para.position.set(-26.35, 2.35, zf + 1.5); para.castShadow = true; root.add(para);
    // a flag for the season's sweet
    const flags = { spring: ['さくら餅', '#f3bccb', '#7a3b4a'], summer: ['氷', '#f4f6f8', '#2a6fd6'], autumn: ['栗きんとん', '#e9c56a', '#5b3f2e'], winter: ['おしるこ', '#7a2f3a', '#f3eee3'] } as const;
    for (const [season, [t, bg, fg]] of Object.entries(flags)) {
      const f = new THREE.Group();
      cyl(f, 0.025, 0.025, 2.6, mat('#d8d8d4'), 0, 0, 0, 6);
      const tex = canvasTex(64, 200, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = `700 40px ${JP}`; c.textAlign = 'center'; [...t].slice(0, 4).forEach((ch, i) => c.fillText(ch, w / 2, 46 + i * 44)); });
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), mat('#ffffff', { map: tex, side: THREE.DoubleSide }));
      cloth.position.set(0.28, 1.6, 0); cloth.castShadow = true; f.add(cloth);
      f.position.set(B.x1 - 0.4, 0.16, B.z1 + 0.9);
      root.add(f);
      ctx.states.show(f, (c) => c.season === season, { duration: 0 });
    }

    // ---------------------------------------------------------------- the side garden
    {
      const { x0, x1, z0, z1 } = GARDEN;
      boxE(root, x0, x1, 0.08, 0.11, z0, z1, mat('#8f8a6e', { roughness: 1 }), { cast: false, plain: true });
      for (let i = 0; i < 4; i++) cyl(root, 0.3, 0.3, 0.04, mat('#b9b3a6'), x0 + 0.8 + (i % 2) * 0.5, 0.11, z1 - 1.0 - i * 1.4, 10);
      plantTree(ctx, root, 'kaki', x0 + 2.6, (z0 + z1) / 2 - 0.4, { size: 1.05 });
      ctx.plan.add({ kind: 'green', rect: { x0, x1, z0, z1 }, color: '#9aa27a' });
      // bamboo fences: in line with the staff yard's fence, a wicket gate in it; and along the back
      const bamboo = mat('#c9b77a', { roughness: 0.8 }), band = mat('#7b6a3e', { roughness: 0.8 });
      const fence = (a: number, b: number, z: number, gap?: [number, number]) => {
        for (let x = a; x < b - 0.05; x += 0.11) if (!gap || x + 0.08 < gap[0] || x > gap[1]) boxE(root, x, x + 0.08, 0.08, 1.15, z - 0.04, z + 0.04, bamboo, { cast: false, plain: true });
        for (const [p, q] of gap ? [[a, gap[0]], [gap[1], b]] : [[a, b]]) boxE(root, p, q, 0.9, 0.96, z - 0.09, z + 0.09, band, { cast: false, plain: true });
      };
      const gate: [number, number] = [x0 + 2.0, x0 + 2.8];
      fence(x0, x1 - 0.05, z1, gate);
      fence(x0, x1 - 0.05, z0 + 0.1);
      const leaf = new THREE.Group();
      leaf.position.set(gate[0], 0, z1); leaf.rotation.y = -0.9;
      for (let x = 0.02; x < 0.78; x += 0.12) boxE(leaf, x, x + 0.06, 0.12, 1.0, -0.03, 0.03, mat('#b9a66a', { roughness: 0.8 }), { cast: false, plain: true });
      boxE(leaf, 0, 0.8, 0.5, 0.55, -0.04, 0.04, band, { cast: false, plain: true });
      root.add(leaf);
      for (const x of [x0 + 0.5, x1 - 0.6]) {
        cyl(root, 0.22, 0.17, 0.42, mat('#8a5a3c'), x, 0.16, z1 + 0.4, 10);
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat('#5e9a52', { flatShading: true }));
        l.position.set(x, 0.75, z1 + 0.4); l.castShadow = true; root.add(l);
      }
    }
  },
});
