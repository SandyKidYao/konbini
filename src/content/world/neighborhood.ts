// The rest of the block: the sage house, the blush apartment, the lilac shop row, coin parking,
// a bus stop, block walls and the far-side hedge. Registers roofs so rain stops on them.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, canvasTex, groundPlane, FONT_JP as JP, FONT_LATIN as LATIN } from '../../engine/kit/build';
import { materials, windowPane } from '../common/materials';
import { sidingTex, aptTex, shutterTex, hedgeTex } from '../common/surfaces';
import { shopSignTex } from '../common/signage';
import { HOUSE, APARTMENT, SHOP_ROW } from './layout';

export default defineMod({
  id: 'konbini.world.neighborhood',
  name: '邻里建筑',
  layer: 'world',
  requires: ['konbini.library', 'konbini.world.streets'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root;
    const { next: rand, range: rr } = ctx.mod.random;
    const ac = (parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
      const u = ctx.prefabs.create('ac-unit', {}).root;
      u.position.set(x, y, z); u.rotation.y = ry;
      parent.add(u);
    };
    const S = ctx.surfaces;
    S.addRoof({ x0: HOUSE.x0 - 0.4, x1: HOUSE.x1 + 0.4, z0: HOUSE.z0 - 0.4, z1: HOUSE.z1 + 0.4 }, 6.6);
    S.addRoof({ x0: APARTMENT.x0, x1: APARTMENT.x1, z0: APARTMENT.z0, z1: APARTMENT.z1 + 1 }, 9.8);
    S.addRoof({ x0: SHOP_ROW.x0, x1: SHOP_ROW.x1, z0: SHOP_ROW.z0, z1: SHOP_ROW.z1 }, SHOP_ROW.h);
    S.addRoof({ x0: -27.8, x1: -24.2, z0: -16, z1: -2 }, 8.5);

    // --- two-storey house on the left ---
    {
      const g = new THREE.Group();
      const { x0, x1, z0, z1, h: H } = HOUSE;
      boxE(g, x0, x1, 0.08, H, z0, z1, mat('#cfdbd3', { map: sidingTex, roughness: 0.8 }), { uv: 1 });
      boxE(g, x0 - 0.05, x1 + 0.05, 2.9, 3.05, z0 - 0.05, z1 + 0.05, mat('#9aa59d'));
      const w = x1 - x0 + 0.8, rh = 1.9;
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
        depth: z1 - z0 + 0.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2,
      }), M.houseRoof);
      roof.position.set((x0 + x1) / 2, H, z0 - 0.4);
      roof.castShadow = roof.receiveShadow = true;
      g.add(roof);
      const frameM = mat('#eeebe4');
      function win(x: number, y: number, z: number, w2: number, h2: number, face: 'x' | 'z', lit: 'warm' | 'cool' | null) {
        const m = lit === 'warm' ? windowPane(ctx, 'warm') : lit === 'cool' ? windowPane(ctx, 'cool') : M.darkGlass;
        if (face === 'z') {
          boxE(g, x - w2 / 2 - 0.08, x + w2 / 2 + 0.08, y - 0.08, y + h2 + 0.08, z, z + 0.06, frameM);
          boxE(g, x - w2 / 2, x + w2 / 2, y, y + h2, z, z + 0.08, m, { cast: false, plain: true });
        } else {
          boxE(g, x, x + 0.06, y - 0.08, y + h2 + 0.08, z - w2 / 2 - 0.08, z + w2 / 2 + 0.08, frameM);
          boxE(g, x, x + 0.08, y, y + h2, z - w2 / 2, z + w2 / 2, m, { cast: false, plain: true });
        }
      }
      win(-21, 3.6, z1, 1.6, 1.2, 'z', 'warm');
      win(-17.4, 3.6, z1, 1.2, 1.2, 'z', null);
      win(-21.4, 0.9, z1, 1.4, 1.1, 'z', null);
      win(x1, 3.6, -3, 1.6, 1.1, 'x', null);
      win(x1, 3.6, -7.5, 1.6, 1.1, 'x', 'cool');
      win(x1, 1.0, -6, 2.0, 1.0, 'x', null);
      boxE(g, -18.6, -17.4, 0.08, 2.2, z1, z1 + 0.06, mat('#8a6a52', { roughness: 0.6 }));
      boxE(g, -18.9, -17.1, 2.35, 2.45, z1, z1 + 0.7, mat('#a8adb2'));
      cyl(g, 0.08, 0.08, 0.18, ctx.glow.add(mat('#fff3d6', { emissive: '#ffd59a' }), 'window', 1.6), -17.0, 1.9, z1 + 0.08, 10, { cast: false });
      ac(g, x1 + 0.25, 0.08, -9.3, Math.PI / 2);
      const potM = mat('#c27a55'), leafM = mat('#6f9a5c', { flatShading: true });
      for (const [x, z] of [[-19.4, 1.1], [-19.0, 1.4], [-16.2, 1.2]]) {
        cyl(g, 0.2, 0.15, 0.32, potM, x, 0.08, z, 12);
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), leafM); l.position.set(x, 0.6, z); l.castShadow = true; g.add(l);
      }
      root.add(g);
    }

    // --- narrow building on the far left with a little snack bar sign ---
    {
      const g = new THREE.Group();
      boxE(g, -27.8, -24.2, 0.08, 8.5, -16, -2, mat('#9a98a6', { roughness: 0.85 }));
      for (let f = 0; f < 3; f++) for (let k = 0; k < 2; k++) {
        const lit = (f === 1 && k === 0) || (f === 2 && k === 1);
        boxE(g, -24.2, -24.12, 1.0 + f * 2.6, 2.3 + f * 2.6, -12 + k * 5, -10.6 + k * 5, lit ? windowPane(ctx, 'warm') : M.darkGlass, { cast: false, plain: true });
      }
      const st = shopSignTex('スナック 灯', '#4a3a5a', '#ffe0f4');
      st.center.set(0.5, 0.5); st.rotation = Math.PI / 2;
      const sm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.5), [ctx.glow.add(mat('#fff', { map: st, emissiveMap: st, emissive: '#fff' }), 'window', 1.2), M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal, M.darkMetal]);
      sm.position.set(-23.9, 4.5, -3);
      g.add(sm);
      root.add(g);
    }

    // --- apartment block behind the store ---
    {
      const g = new THREE.Group();
      const { x0, x1, z0, z1, floors, fh } = APARTMENT;
      const am = mat('#efd9cb', { map: aptTex, roughness: 0.85 });
      boxE(g, x0, x1, 0.08, floors * fh + 0.5, z0, z1, am, { uv: 2 });
      boxE(g, x0 - 0.1, x1 + 0.1, floors * fh + 0.5, floors * fh + 0.7, z0 - 0.1, z1 + 0.1, M.coping);
      const units = 6, uw = (x1 - x0) / units;
      const railM = mat('#e6e9ee', { roughness: 0.4, metalness: 0.1 });
      const slabM = mat('#d6c7bb');
      for (let f = 0; f < floors; f++) for (let u = 0; u < units; u++) {
        const cx = x0 + uw * (u + 0.5), y0 = 0.08 + f * fh;
        const r = rand();
        const m = r < 0.35 ? windowPane(ctx, 'warm') : r < 0.5 ? windowPane(ctx, 'cool') : M.darkGlass;
        boxE(g, cx - 1.2, cx + 1.2, y0 + 0.3, y0 + 2.35, z1, z1 + 0.05, m, { cast: false, plain: true });
        if (f > 0) {
          boxE(g, cx - uw / 2 + 0.05, cx + uw / 2 - 0.05, y0 - 0.12, y0, z1, z1 + 1.0, slabM);
          boxE(g, cx - uw / 2 + 0.05, cx + uw / 2 - 0.05, y0, y0 + 1.05, z1 + 0.95, z1 + 1.0, railM, { plain: true });
          if (rand() < 0.5) ac(g, cx + 1.2, y0, z1 + 0.35);
          // laundry on a few balconies — small, quiet signs of life
          if (rand() < 0.35) {
            box(g, uw - 0.6, 0.03, 0.03, M.chrome, cx, y0 + 1.75, z1 + 0.55, { plain: true });
            for (let k = 0; k < 3; k++) {
              const cloth = new THREE.Mesh(new THREE.PlaneGeometry(rr(0.3, 0.5), rr(0.4, 0.6)), mat(['#ffffff', '#f6d6d2', '#cfe3f2', '#f3e6b8'][k % 4], { side: THREE.DoubleSide, roughness: 0.9 }));
              cloth.position.set(cx - 0.8 + k * 0.7, y0 + 1.45, z1 + 0.55);
              cloth.castShadow = true;
              g.add(cloth);
            }
          }
        }
      }
      for (let u = 0; u <= units; u++) boxE(g, x0 + uw * u - 0.06, x0 + uw * u + 0.06, 0.08 + fh - 0.12, floors * fh + 0.2, z1, z1 + 1.0, am);
      cyl(g, 1.0, 1.0, 1.6, mat('#ccd2d7', { roughness: 0.5 }), 6, floors * fh + 0.7, -20, 20);
      boxE(g, x0, x1, 0.08, 1.4, z1 + 1.6, z1 + 1.75, M.block, { uv: 0.8 });
      root.add(g);
    }

    // --- shop row across road B, coin parking and a bus stop ---
    {
      const g = new THREE.Group();
      const { x0, x1, z0, z1, h } = SHOP_ROW;
      boxE(g, x0, x1, 0.08, h, z0, z1, mat('#d4cfdb', { map: sidingTex, roughness: 0.85 }), { uv: 1 });
      boxE(g, x0 - 0.1, x1 + 0.1, h, h + 0.25, z0 - 0.1, z1 + 0.1, M.coping);
      shutterTex.repeat.set(1, 4);
      [['そば処', '#3a332d', '#f4e3c3'], ['たばこ', '#d7383b', '#fff'], ['クリーニング', '#2756b0', '#fff']].forEach(([t, bg, fg], i) => {
        const zc = z0 + 3.4 + i * 6.6;
        boxE(g, x0 - 0.06, x0, 0.08, 2.7, zc - 2.4, zc + 2.4, mat('#ffffff', { map: shutterTex, roughness: 0.6 }), { cast: false, plain: true });
        const tex = shopSignTex(t, bg, fg);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.78), ctx.glow.add(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#fff', roughness: 0.5 }), 'window', 0.6));
        sign.rotation.y = -Math.PI / 2; sign.position.set(x0 - 0.135, 3.15, zc); g.add(sign);
        boxE(g, x0 - 0.12, x0, 2.72, 3.6, zc - 2.2, zc + 2.2, M.darkMetal, { cast: false, plain: true });
        boxE(g, x0 - 0.06, x0, 4.4, 6.0, zc - 1.6, zc + 1.6, i % 2 === 0 ? windowPane(ctx, 'warm') : M.darkGlass, { cast: false, plain: true });
      });
      boxE(g, 24.5, 26.8, 4.4, 6.0, z1, z1 + 0.06, windowPane(ctx, 'cool'), { cast: false, plain: true });
      boxE(g, 24.5, 26.8, 1.0, 2.6, z1, z1 + 0.06, M.darkGlass, { cast: false, plain: true });

      const pTex = canvasTex(128, 160, (c, w) => {
        c.fillStyle = '#2756b0'; c.fillRect(0, 0, w, 160); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `800 92px ${LATIN}`; c.fillText('P', w / 2, 66); c.font = `700 22px ${JP}`; c.fillText('24時間', w / 2, 132);
      });
      cyl(g, 0.05, 0.05, 2.6, M.chrome, 27.3, 0.08, 6.6, 8);
      const ps = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.06), [M.white, M.white, M.white, M.white, ctx.glow.add(mat('#fff', { map: pTex, emissiveMap: pTex, emissive: '#fff' }), 'window', 0.8), M.white]);
      ps.position.set(27.3, 2.9, 6.65); ps.castShadow = true; g.add(ps);
      for (const z of [-1.8, 4.6]) groundPlane(g, 23.4, 27.8, z - 0.06, z + 0.06, 0.092, M.roadPaint);
      box(g, 0.16, 0.13, 1.3, M.wheelStop, 27.2, 0.08, 1.4);

      const busTex = canvasTex(128, 128, (c) => {
        c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill();
        c.fillStyle = '#d7383b'; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 46, 0, 7); c.fill();
        c.fillStyle = '#2756b0'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 34px ${JP}`; c.fillText('バス', 64, 66);
      });
      cyl(g, 0.045, 0.045, 2.5, M.chrome, 22.2, 0.15, -6.5, 8);
      const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 24), [M.white, mat('#fff', { map: busTex }), mat('#fff', { map: busTex })]);
      bs.rotation.order = 'YXZ'; bs.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
      bs.position.set(22.2, 2.75, -6.5); bs.castShadow = true; g.add(bs);
      box(g, 0.08, 0.7, 0.45, mat('#f2f2ee'), 22.2, 1.1, -6.5);
      box(g, 0.45, 0.06, 1.7, M.wood, 22.4, 0.55, -4.6);
      box(g, 0.08, 0.4, 1.7, M.wood, 22.6, 0.6, -4.6);
      for (const z of [-5.3, -3.9]) box(g, 0.4, 0.4, 0.06, M.darkMetal, 22.4, 0.15, z);
      root.add(g);
    }

    // --- block walls and the far-side hedge ---
    boxE(root, -28, -19.6, 0.08, 1.1, 6.9, 7.1, M.block, { uv: 0.8 });
    boxE(root, -17.6, -14.1, 0.08, 1.1, 6.9, 7.1, M.block, { uv: 0.8 });
    boxE(root, -14.1, -13.9, 0.08, 1.1, -14, 7.1, M.block, { uv: 0.8 });
    boxE(root, -14, 11.5, 0.08, 1.6, -14.2, -14, M.block, { uv: 0.8 });
    boxE(root, -28, 28, 0.06, 0.55, 19.3, 19.5, M.block, { uv: 0.8 });
    {
      const hm = mat('#ffffff', { map: hedgeTex, roughness: 1 });
      boxE(root, -28, 28, 0.06, 0.95, 19.6, 20.6, hm, { uv: 1.5, r: 0.2 });
      for (let x = -27; x < 28; x += 1.3) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rr(0.45, 0.62), 14, 10), hm);
        s.position.set(x + rr(-0.3, 0.3), 0.98, 20.1 + rr(-0.2, 0.2)); s.scale.y = 0.7; s.castShadow = true; root.add(s);
      }
    }

    // a little red van in the coin parking
    const van = ctx.prefabs.create('car', { color: '#e8786a', len: 3.4, width: 1.48, bodyH: 0.7, cabinLen: 2.4, cabinH: 0.8, cabinX: -0.4 });
    van.root.position.set(25.6, 0.08, 1.2);
    van.root.rotation.y = -Math.PI / 2 + 0.04;
    root.add(van.root);
  },
});
