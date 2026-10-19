// The rest of the block: the row across road B — a fishmonger, a barber and a bicycle shop in three narrow
// buildings with flats above — the coin parking, a bus stop and the far-side hedge. Registers roofs so rain stops on them.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, canvasTex, groundPlane, FONT_JP as JP, FONT_LATIN as LATIN } from '../../engine/kit/build';
import { materials, windowPane } from '../common/materials';
import { sidingTex, aptTex, shutterTex, hedgeTex } from '../common/surfaces';
import { shopSignTex } from '../common/signage';
import { BLOCK, SHOP_ROW } from './layout';

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
    // on the map: the roofs as they look from above; lit windows glow at night
    ctx.plan.add({ kind: 'green', rect: { x0: BLOCK.x0, x1: BLOCK.x1, z0: 19.6, z1: 20.6 }, color: '#86ad6a' });

    // --- the row across road B: three narrow buildings, the coin parking and a bus stop ---
    {
      const g = new THREE.Group();
      const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = SHOP_ROW, IN = X0 + 0.8, third = (Z1 - Z0) / 3;
      // north to south, stepping down: anything over about 6 m at the south end would hide the level crossing
      // from the overview
      const units = [
        { z0: Z0, z1: Z0 + third, h: 9.4, color: '#d9cbb8', trim: '#b4a088', sign: ['鮮魚 浜田', '#1f4f7a', '#f3eee3'], awning: '#2f6b9a' },
        { z0: Z0 + third, z1: Z0 + third * 2, h: 6.2, color: '#cad8d1', trim: '#97afa5', sign: ['BARBER 潮', '#f3eee3', '#2d4a44'], awning: '#c94a3f' },
        { z0: Z0 + third * 2, z1: Z1, h: 6.2, color: '#e6cfc4', trim: '#c09a8a', sign: ['サイクル 灯台', '#f2c14e', '#3a3a36'], awning: '#3c8a5a' },
      ];
      const cloth = ['#f2f0ea', '#8fb4d9', '#f2b5a5', '#f5d76e', '#a8d5ba', '#ffffff'];
      for (const u of units) {
        const zc = (u.z0 + u.z1) / 2, zA = u.z0 + 0.03, zB = u.z1 - 0.03, body = mat(u.color, { roughness: 0.85 }), trim = mat(u.trim, { roughness: 0.8 });
        // the shop at street level is set back under the floors above, on two slim columns
        boxE(g, IN, X1, 0.08, 3.0, zA, zB, body);
        boxE(g, X0, X1, 3.0, u.h, zA, zB, body);
        for (const z of [zA + 0.12, zB - 0.12]) boxE(g, X0, X0 + 0.22, 0.15, 3.0, z - 0.1, z + 0.1, trim);
        boxE(g, X0 - 0.06, X1 + 0.06, u.h, u.h + 0.18, u.z0, u.z1, trim);
        boxE(g, X0 - 0.05, X0, 2.95, 3.12, zA, zB, trim, { cast: false, plain: true });
        const tex = shopSignTex(u.sign[0], u.sign[1], u.sign[2]);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(u.z1 - u.z0 - 1.0, 0.55), ctx.glow.add(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#fff', roughness: 0.5 }), 'window', 0.6));
        sign.rotation.y = -Math.PI / 2; sign.position.set(X0 - 0.07, 2.62, zc); g.add(sign);
        const aw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, u.z1 - u.z0 - 0.6), mat(u.awning, { roughness: 0.8 }));
        aw.position.set(X0 + 0.2, 2.22, zc); aw.rotation.z = -0.3; aw.castShadow = true; g.add(aw);
        // upstairs: a window and a little balcony per floor, air conditioners, washing on some
        for (let y = 3.5; y < u.h - 1.6; y += 3.0) {
          boxE(g, X0 - 0.05, X0, y + 0.2, y + 2.0, u.z0 + 0.7, u.z1 - 0.7, rand() < 0.45 ? windowPane(ctx, rand() < 0.7 ? 'warm' : 'cool') : M.darkGlass, { cast: false, plain: true });
          boxE(g, X0 - 0.75, X0, y - 0.05, y + 0.1, u.z0 + 0.5, u.z1 - 0.5, trim);
          boxE(g, X0 - 0.77, X0 - 0.69, y + 0.1, y + 1.0, u.z0 + 0.5, u.z1 - 0.5, mat('#ecebe6', { roughness: 0.4 }));
          if (rand() < 0.8) box(g, 0.45, 0.5, 0.7, mat('#eeeeea'), X0 - 0.38, y + 0.1, u.z1 - 1.05);
          if (rand() < 0.6) for (let z = u.z0 + 0.9; z < zc - 0.2; z += 0.4 + rand() * 0.2) {
            const h = 0.3 + rand() * 0.3;
            boxE(g, X0 - 0.42, X0 - 0.38, y + 1.88 - h, y + 1.88, z, z + 0.3, mat(cloth[Math.floor(rand() * cloth.length)], { roughness: 0.9 }), { cast: false, plain: true });
          }
        }
        S.addRoof({ x0: X0 - 0.1, x1: X1 + 0.1, z0: u.z0, z1: u.z1 }, u.h + 0.2);
        ctx.plan.add({ kind: 'building', rect: { x0: X0 - 0.1, x1: X1 + 0.1, z0: u.z0, z1: u.z1 }, h: u.h, color: u.color, glow: 'window' });
      }
      const [fish, barber, cycle] = units;
      // what each shop puts out stays in its set-back front, never on the sidewalk
      const wood = mat('#7b5a44');
      boxE(g, X0 + 0.05, IN - 0.05, 0.08, 0.75, fish.z0 + 0.6, fish.z1 - 0.6, wood);
      for (let z = fish.z0 + 0.7; z < fish.z1 - 0.8; z += 0.62) {
        boxE(g, X0 + 0.12, IN - 0.12, 0.75, 0.98, z, z + 0.52, mat('#f4f6f8', { roughness: 0.6 }));
        boxE(g, X0 + 0.18, IN - 0.18, 0.98, 1.0, z + 0.06, z + 0.46, mat('#bfe3ec', { roughness: 0.2 }), { cast: false, plain: true });
      }
      boxE(g, IN - 0.02, IN, 0.3, 2.6, barber.z0 + 0.5, barber.z1 - 0.5, windowPane(ctx, 'cool'), { cast: false, plain: true });
      {
        // the barber's pole, its stripes turning
        const t = canvasTex(64, 128, (c, w) => { const cols = ['#d23a32', '#f4f4f0', '#2a5fb0', '#f4f4f0']; for (let i = -8; i < 16; i++) { c.fillStyle = cols[((i % 4) + 4) % 4]; c.beginPath(); c.moveTo(0, i * 16); c.lineTo(w, i * 16 - 32); c.lineTo(w, i * 16 - 16); c.lineTo(0, i * 16 + 16); c.fill(); } }, true);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 16), ctx.glow.add(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', roughness: 0.3 }), 'window', 0.3));
        pole.position.set(X0 + 0.25, 1.55, barber.z1 - 0.45); pole.userData.skyIgnore = true; g.add(pole);
        for (const dy of [-0.45, 0.45]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), M.chrome); c.position.set(X0 + 0.25, 1.55 + dy, barber.z1 - 0.45); g.add(c); }
        ctx.onFrame((dt) => { t.offset.y -= dt * 0.35; });
      }
      boxE(g, IN - 0.02, IN, 2.0, 2.9, cycle.z0 + 0.4, cycle.z1 - 0.4, mat('#ffffff', { map: shutterTex, roughness: 0.6 }), { cast: false, plain: true });
      ['#c44a4a', '#3d6fa8', '#e7e3d8', '#2d5b6e', '#f2c14e'].forEach((color, i) => {
        const b = ctx.prefabs.create('bicycle', { color }).root;
        b.position.set(X0 + 0.45, 0.15, cycle.z0 + 0.75 + i * 0.72); b.rotation.y = Math.PI / 2 - 0.25;
        g.add(b);
      });
      // the south wall over the coin parking: windows, an air conditioner, the drainpipe, the bicycle shop's board
      boxE(g, 24.6, 26.6, 3.9, 5.0, Z1, Z1 + 0.05, windowPane(ctx, 'warm'), { cast: false, plain: true });
      box(g, 0.8, 0.55, 0.3, mat('#eeeeea'), 27.2, 3.6, Z1 + 0.15);
      cyl(g, 0.05, 0.05, 6.1, mat('#b9b4a8'), X0 + 0.25, 0.08, Z1 + 0.08, 6);
      {
        const tex = shopSignTex('サイクル 灯台', '#f2c14e', '#3a3a36');
        const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), ctx.glow.add(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#fff', roughness: 0.5 }), 'window', 0.6));
        board.position.set((X0 + X1) / 2, cycle.h + 0.75, Z1 - 0.5); g.add(board);
        for (const x of [X0 + 0.8, X1 - 0.8]) box(g, 0.08, 0.3, 0.08, M.darkMetal, x, cycle.h + 0.18, Z1 - 0.5, { plain: true });
      }
      cyl(g, 0.7, 0.7, 1.1, mat('#c9ccd0', { roughness: 0.4, metalness: 0.2 }), X1 - 1.3, fish.h + 0.18, (fish.z0 + fish.z1) / 2, 14);

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
    boxE(root, BLOCK.x0, BLOCK.x1, 0.06, 0.55, 19.3, 19.5, M.block, { uv: 0.8 });
    {
      const hm = mat('#ffffff', { map: hedgeTex, roughness: 1 });
      boxE(root, BLOCK.x0, BLOCK.x1, 0.06, 0.95, 19.6, 20.6, hm, { uv: 1.5, r: 0.2 });
      for (let x = BLOCK.x0 + 1; x < BLOCK.x1; x += 1.3) {
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
