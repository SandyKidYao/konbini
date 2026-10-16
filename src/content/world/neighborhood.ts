// The rest of the block: the lilac shop row, coin parking, a bus stop and the far-side hedge. Registers roofs so
// rain stops on them.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, canvasTex, groundPlane, FONT_JP as JP, FONT_LATIN as LATIN } from '../../engine/kit/build';
import { materials, windowPane } from '../common/materials';
import { sidingTex, aptTex, shutterTex, hedgeTex } from '../common/surfaces';
import { shopSignTex } from '../common/signage';
import { SHOP_ROW } from './layout';

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
    S.addRoof({ x0: SHOP_ROW.x0, x1: SHOP_ROW.x1, z0: SHOP_ROW.z0, z1: SHOP_ROW.z1 }, SHOP_ROW.h);
    // on the map: the roofs as they look from above; lit windows glow at night
    ctx.plan.add({ kind: 'building', rect: { x0: SHOP_ROW.x0 - 0.1, x1: SHOP_ROW.x1 + 0.1, z0: SHOP_ROW.z0 - 0.1, z1: SHOP_ROW.z1 + 0.1 }, h: SHOP_ROW.h, color: '#d6d1de', glow: 'window' });
    ctx.plan.add({ kind: 'green', rect: { x0: -28, x1: 28, z0: 19.6, z1: 20.6 }, color: '#86ad6a' });

    // --- shop row across road B, coin parking and a bus stop ---
    {
      const g = new THREE.Group();
      const { x0, x1, z0, z1, h } = SHOP_ROW;
      boxE(g, x0, x1, 0.08, h, z0, z1, mat('#d4cfdb', { map: sidingTex, roughness: 0.85 }), { uv: 1 });
      boxE(g, x0 - 0.1, x1 + 0.1, h, h + 0.25, z0 - 0.1, z1 + 0.1, M.coping);
      shutterTex.repeat.set(1, 4);
      [['そば処', '#3a332d', '#f4e3c3'], ['たばこ', '#d7383b', '#fff'], ['クリーニング', '#2756b0', '#fff']].forEach(([t, bg, fg], i) => {
        const w = (z1 - z0) / 3, zc = z0 + w * (i + 0.5);
        boxE(g, x0 - 0.06, x0, 0.08, 2.7, zc - w / 2 + 0.25, zc + w / 2 - 0.25, mat('#ffffff', { map: shutterTex, roughness: 0.6 }), { cast: false, plain: true });
        const tex = shopSignTex(t, bg, fg);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 0.78), ctx.glow.add(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#fff', roughness: 0.5 }), 'window', 0.6));
        sign.rotation.y = -Math.PI / 2; sign.position.set(x0 - 0.135, 3.15, zc); g.add(sign);
        boxE(g, x0 - 0.12, x0, 2.72, 3.6, zc - w / 2 + 0.3, zc + w / 2 - 0.3, M.darkMetal, { cast: false, plain: true });
        boxE(g, x0 - 0.06, x0, 4.4, 6.0, zc - 1.4, zc + 1.4, i % 2 === 0 ? windowPane(ctx, 'warm') : M.darkGlass, { cast: false, plain: true });
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

    // --- the far-side hedge ---
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
