// ひかりマート — the building itself: shell, glazing, sliding doors (the front, and a small one in the side windows
// for the bays beside the shop), signage, awnings, interior, rooftop.
// Registers its floor, roof and shelter, the walkable aisles inside, and offers the 'shop' service.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod } from '../../../engine/mod';
import { mat, box, boxE, cyl, rod, V, canvasTex, FONT_JP as JP } from '../../../engine/kit/build';
import { materials } from '../../common/materials';
import { BRAND, PROD_COLORS } from '../../common/palette';
import { floorTex } from '../../common/surfaces';
import { signTex, sideSignTex, coolerTex, cigTex, posterTex } from '../../common/signage';
import { STORE, type ShopService } from './api';

/** the front door's centre (x), the side door's (z), and how wide the walkway down the side windows is */
const DOOR_X = -0.2, SIDE_DOOR = -0.3, STORE_WALK = 1.2;

export default defineMod({
  id: 'konbini.site.store',
  name: '便利店',
  layer: 'site',
  site: 'konbini',
  requires: ['konbini.library'],
  setup(ctx) {
    const M = materials(ctx);
    const { range: rr, pick } = ctx.mod.random;
    const store = new THREE.Group();
    ctx.root.add(store);
    const { x0: SX0, x1: SX1, z0: SZ0, z1: SZ1, h: SH, floor: FL, glassTop: GT } = STORE;
    const ac = (parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
      const u = ctx.prefabs.create('ac-unit', {}).root;
      u.position.set(x, y, z); u.rotation.y = ry;
      parent.add(u);
    };

    // apron, floor slab, the walkway down the side windows (the bays beside the shop are nose-in to it)
    const APRON = SZ1 + 2.25, WALK = SX1 + STORE_WALK;
    boxE(store, SX0 - 0.2, WALK, 0.08, FL, SZ1, APRON, M.tile, { uv: 1.2, cast: false });
    boxE(store, SX0, SX1, 0.08, FL, SZ0, SZ1, mat('#ffffff', { map: floorTex, roughness: 0.35 }), { uv: 1.2, cast: false, plain: true });
    boxE(store, SX1, WALK, 0.08, FL, SZ0, SZ1, M.tile, { uv: 1.2, cast: false });

    // shell
    const wallM = M.wall;
    boxE(store, SX0, SX0 + 0.2, FL, SH, SZ0, SZ1, wallM, { uv: 1.8 });
    boxE(store, SX0, SX1, FL, SH, SZ0, SZ0 + 0.2, wallM, { uv: 1.8 });
    boxE(store, SX1 - 0.2, SX1, FL, SH, SZ0, SZ0 + 0.3, wallM, { uv: 1.8 });
    boxE(store, SX1 - 0.2, SX1, GT, SH, SZ0 + 0.3, SZ1, wallM, { uv: 1.8 });
    boxE(store, SX0, SX1, GT, SH, SZ1 - 0.2, SZ1, wallM, { uv: 1.8 });
    boxE(store, SX0 + 0.2, SX1 - 0.2, 4.25, 4.35, SZ0 + 0.2, SZ1 - 0.2, M.roof, { cast: false, plain: true });
    const skirtMat = mat('#6a6f77', { roughness: 0.7 });
    boxE(store, SX0 - 0.03, SX0, FL, 0.6, SZ0, SZ1, skirtMat, { cast: false, plain: true });
    boxE(store, SX0, SX1, FL, 0.6, SZ0 - 0.03, SZ0, skirtMat, { cast: false, plain: true });
    // parapet coping
    boxE(store, SX0 - 0.05, SX1 + 0.05, SH, SH + 0.1, SZ0 - 0.05, SZ0 + 0.25, M.coping);
    boxE(store, SX0 - 0.05, SX1 + 0.05, SH, SH + 0.1, SZ1 - 0.25, SZ1 + 0.05, M.coping);
    boxE(store, SX0 - 0.05, SX0 + 0.25, SH, SH + 0.1, SZ0, SZ1, M.coping);
    boxE(store, SX1 - 0.25, SX1 + 0.05, SH, SH + 0.1, SZ0, SZ1, M.coping);

    // front glazing + mullions (the door bay x∈[−1.2, 0.8] is handled by the sliding doors below)
    const mullX = [-8, -5.8, -3.6, -1.2, 0.8, 3, 5.3, 7.6];
    for (const x of mullX) boxE(store, x - 0.05, x + 0.05, FL, GT, 3.84, 3.96, M.frame);
    boxE(store, SX0 + 0.2, SX1 - 0.2, GT - 0.1, GT, 3.83, 3.97, M.frame);
    boxE(store, SX0 + 0.2, SX1 - 0.2, FL, FL + 0.12, 3.83, 3.97, M.frame);
    boxE(store, -1.2, 0.8, 2.35, 2.4, 3.83, 3.97, M.frame);
    for (let i = 0; i < mullX.length - 1; i++) {
      const x0 = mullX[i] + 0.05, x1 = mullX[i + 1] - 0.05;
      if (x0 > -1.3 && x1 < 0.9) continue;
      boxE(store, x0, x1, FL + 0.12, GT - 0.1, 3.89, 3.91, M.glass, { cast: false, recv: false, plain: true });
    }
    // side windows, front to back (the side door bay is handled by its own sliding leaf)
    const mullZ = [SZ0 + 0.3, -3.6, SIDE_DOOR - 0.55, SIDE_DOOR + 0.55, 1.6, SZ1 - 0.1];
    for (const z of mullZ) boxE(store, SX1 - 0.16, SX1 - 0.04, FL, GT, z - 0.05, z + 0.05, M.frame);
    boxE(store, SX1 - 0.17, SX1 - 0.03, GT - 0.1, GT, SZ0 + 0.3, SZ1 - 0.1, M.frame);
    boxE(store, SX1 - 0.17, SX1 - 0.03, FL, FL + 0.12, SZ0 + 0.3, SZ1 - 0.1, M.frame);
    boxE(store, SX1 - 0.17, SX1 - 0.03, 2.35, 2.4, SIDE_DOOR - 0.55, SIDE_DOOR + 0.55, M.frame);
    for (let i = 0; i < mullZ.length - 1; i++) {
      const z0 = mullZ[i] + 0.05, z1 = mullZ[i + 1] - 0.05;
      if (z0 > SIDE_DOOR - 0.6 && z1 < SIDE_DOOR + 0.6) continue;
      boxE(store, SX1 - 0.11, SX1 - 0.09, FL + 0.12, GT - 0.1, z0, z1, M.glass, { cast: false, recv: false, plain: true });
    }

    // automatic sliding doors
    function doorLeaf(x: number) {
      const g = new THREE.Group();
      boxE(g, -0.49, 0.49, FL + 0.12, 2.35, -0.015, 0.015, M.glass, { cast: false, recv: false, plain: true });
      boxE(g, -0.49, 0.49, FL + 0.1, FL + 0.18, -0.03, 0.03, M.frame, { cast: false });
      boxE(g, -0.49, 0.49, 2.29, 2.35, -0.03, 0.03, M.frame, { cast: false });
      boxE(g, -0.03, 0.03, FL + 0.1, 2.35, -0.03, 0.03, M.frame, { cast: false }).position.x = x < DOOR_X ? 0.46 : -0.46;
      g.position.set(x, 0, SZ1 - 0.1);
      store.add(g);
      return g;
    }
    const doorL = doorLeaf(DOOR_X - 0.5), doorR = doorLeaf(DOOR_X + 0.5);
    let doorT = 0, doorTimer = 0;
    const openDoor = () => { doorTimer = Math.max(doorTimer, 2.6); };
    ctx.onFrame((dt) => {
      doorTimer = Math.max(0, doorTimer - dt);
      const target = doorTimer > 0 ? 1 : 0;
      doorT += (target - doorT) * Math.min(1, dt * 4);
      doorL.position.x = DOOR_X - 0.5 - doorT * 0.88;
      doorR.position.x = DOOR_X + 0.5 + doorT * 0.88;
    });
    // the side door: one leaf sliding back along the windows
    const sideLeaf = new THREE.Group();
    boxE(sideLeaf, -0.015, 0.015, FL + 0.12, 2.3, -0.49, 0.49, M.glass, { cast: false, recv: false, plain: true });
    boxE(sideLeaf, -0.03, 0.03, FL + 0.1, FL + 0.18, -0.49, 0.49, M.frame, { cast: false });
    boxE(sideLeaf, -0.03, 0.03, 2.24, 2.3, -0.49, 0.49, M.frame, { cast: false });
    for (const z of [-0.46, 0.46]) boxE(sideLeaf, -0.03, 0.03, FL + 0.1, 2.3, z - 0.03, z + 0.03, M.frame, { cast: false });
    sideLeaf.position.set(SX1 - 0.1, 0, SIDE_DOOR);
    store.add(sideLeaf);
    let sideT = 0, sideTimer = 0;
    const openSideDoor = () => { sideTimer = Math.max(sideTimer, 2.6); };
    ctx.onFrame((dt) => {
      sideTimer = Math.max(0, sideTimer - dt);
      sideT += ((sideTimer > 0 ? 1 : 0) - sideT) * Math.min(1, dt * 4);
      sideLeaf.position.z = SIDE_DOOR - sideT * 0.95;
      sideLeaf.position.x = SX1 - 0.1 + sideT * 0.06;   // it slides just outside the fixed pane
    });
    boxE(store, SX1 + 0.4, SX1 + 1.4, FL, FL + 0.01, SIDE_DOOR - 0.5, SIDE_DOOR + 0.5, mat('#454a52', { roughness: 1 }), { cast: false, plain: true });
    boxE(store, -1.1, 0.7, FL, FL + 0.01, 4.1, 5.1, mat('#454a52', { roughness: 1 }), { cast: false, plain: true });
    {
      const t = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = BRAND.green; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `700 34px ${JP}`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('自動ドア', w / 2, h / 2 + 2);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), mat('#fff', { map: t }));
      m.position.set(0.1, 1.3, 0.02);
      doorL.add(m);
    }

    // orange glow band + green trim
    const orangeBand = ctx.glow.add(mat(BRAND.orange, { emissive: '#ff7a10', roughness: 0.4 }), 'sign', 0.9);
    boxE(store, SX0 - 0.02, SX1 + 0.02, 2.86, 3.08, SZ1, SZ1 + 0.14, orangeBand, { cast: false });
    boxE(store, SX1, SX1 + 0.14, 2.86, 3.08, SZ0, SZ1 + 0.14, orangeBand, { cast: false });
    boxE(store, SX0 - 0.02, SX1 + 0.02, 3.08, 3.16, SZ1, SZ1 + 0.1, mat(BRAND.green, { roughness: 0.45 }), { cast: false });

    // lightbox signs
    {
      const face = ctx.glow.add(new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: '#ffffff', roughness: 0.35 }), 'sign', 1);
      const side = ctx.glow.add(mat('#f6f6f0', { emissive: '#ffffff', roughness: 0.4 }), 'sign', 0.25);
      const m = new THREE.Mesh(new RoundedBoxGeometry(15.2, 1.18, 0.32, 2, 0.05), [side, side, M.white, M.white, face, side]);
      m.position.set((SX0 + SX1) / 2, 3.82, SZ1 + 0.16);
      m.castShadow = true;
      store.add(m);
      boxE(store, -7.9, 7.5, 3.2, 3.24, SZ1, SZ1 + 0.36, M.frame, { plain: true });
      boxE(store, -7.9, 7.5, 4.4, 4.44, SZ1, SZ1 + 0.36, M.frame, { plain: true });
      const sface = ctx.glow.add(new THREE.MeshStandardMaterial({ map: sideSignTex, emissiveMap: sideSignTex, emissive: '#ffffff', roughness: 0.35 }), 'sign', 1);
      const sm = new THREE.Mesh(new RoundedBoxGeometry(9.4, 1.18, 0.28, 2, 0.05), [side, side, M.white, M.white, sface, side]);
      sm.rotation.y = Math.PI / 2;
      sm.position.set(SX1 + 0.14, 3.82, (SZ0 + SZ1) / 2 - 0.2);
      sm.castShadow = true;
      store.add(sm);
    }

    // awnings: along the front, and down the side over the walkway, meeting at the corner
    {
      const AX0 = SX0 - 0.15, AX1 = WALK + 0.15;
      const aw = new THREE.Mesh(new RoundedBoxGeometry(AX1 - AX0, 0.1, 2.3, 2, 0.03), M.awning);
      aw.position.set((AX0 + AX1) / 2, 2.74, SZ1 + 1.05);
      aw.rotation.x = 0.12;
      aw.castShadow = aw.receiveShadow = true;
      store.add(aw);
      boxE(store, AX0, AX1, 2.38, 2.7, APRON - 0.17, APRON - 0.05, M.green);
      const saw = new THREE.Mesh(new RoundedBoxGeometry(AX1 - SX1, 0.1, SZ1 - SZ0, 2, 0.03), M.awning);
      saw.position.set((SX1 + AX1) / 2, 2.74, (SZ0 + SZ1) / 2);
      saw.rotation.z = -0.12;
      saw.castShadow = saw.receiveShadow = true;
      store.add(saw);
      boxE(store, AX1 - 0.12, AX1, 2.38, 2.7, SZ0, APRON - 0.05, M.green);
      boxE(store, SX1, AX1, 2.38, 2.7, SZ0 - 0.06, SZ0 + 0.06, M.green);
      const dl = ctx.glow.add(mat('#ffffff', { emissive: '#fff4e0' }), 'interior', 2.2);
      for (let x = SX0 + 1.5; x < AX1 - 0.5; x += 2.6) cyl(store, 0.12, 0.12, 0.03, dl, x, 2.6, SZ1 + 1.2, 12, { cast: false });
      for (let z = SZ0 + 1.2; z < SZ1; z += 2.5) cyl(store, 0.12, 0.12, 0.03, dl, SX1 + 0.65, 2.6, z, 12, { cast: false });
      for (const x of [AX0 + 0.1, AX1 - 0.1]) cyl(store, 0.05, 0.05, 2.4, M.frame, x, FL, APRON - 0.13, 8);
      cyl(store, 0.05, 0.05, 2.4, M.frame, AX1 - 0.1, FL, SZ0 + 0.1, 8);
    }

    // ------------------------------- interior -------------------------------
    const interior = new THREE.Group();
    store.add(interior);
    boxE(interior, SX0 + 0.2, SX1 - 0.2, GT, GT + 0.06, SZ0 + 0.2, SZ1 - 0.2, M.white, { cast: false, plain: true });
    const ceilLight = ctx.glow.add(mat('#ffffff', { emissive: '#ffffff' }), 'interior', 2.4);
    for (const x of [-6, -3, 0, 3, 6]) boxE(interior, x - 0.13, x + 0.13, GT - 0.04, GT, -5.2, 3.2, ceilLight, { cast: false, recv: false });

    {
      const cm = ctx.glow.add(new THREE.MeshStandardMaterial({ map: coolerTex, emissiveMap: coolerTex, emissive: '#ffffff', roughness: 0.2 }), 'interior', 0.9);
      const m = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 0.7), [M.white, M.white, M.white, M.white, cm, M.white]);
      m.position.set(0.2, FL + 1.1, SZ0 + 0.55);
      interior.add(m);
    }

    const prodList: { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }[] = [];
    function gondola(cx: number, z0: number, z1: number) {
      const len = z1 - z0, cz = (z0 + z1) / 2;
      box(interior, 0.9, 0.12, len, M.shelfBase, cx, FL, cz, { cast: false });
      box(interior, 0.06, 1.55, len, M.shelf, cx, FL, cz, { cast: false, plain: true });
      for (const side of [-1, 1]) for (let t = 0; t < 4; t++) {
        const y = FL + 0.12 + t * 0.36;
        box(interior, 0.4, 0.025, len, M.shelf, cx + side * 0.24, y, cz, { cast: false, plain: true });
        let z = z0 + 0.08;
        while (z < z1 - 0.3) {
          const sz = rr(0.12, 0.26), sy = rr(0.12, 0.3), sx = rr(0.2, 0.34);
          prodList.push({ x: cx + side * (0.05 + sx / 2), y: y + 0.025 + sy / 2, z: z + sz / 2, sx, sy, sz, c: pick(PROD_COLORS) });
          z += sz + 0.02;
        }
      }
      const popM = ctx.glow.add(mat(pick(['#ff7a5c', '#ffd23f', '#4fb3ff']), { emissive: '#ffffff', emissiveIntensity: 0.2 }), 'interior', 0.25);
      box(interior, 0.8, 0.28, 0.04, popM, cx, FL + 1.75, z1 + 0.02, { cast: false, plain: true });
      box(interior, 0.02, 0.1, 0.02, M.frame, cx, FL + 1.55, z1 + 0.02, { cast: false, plain: true });
    }
    for (const x of [-4.2, -2.15, 2.8, 5.1]) gondola(x, -3.4, 1.4);

    // counter (with room behind it for the clerk), registers, hot snacks, cigarette wall
    boxE(interior, -6.7, -5.8, FL, FL + 1.0, -3.6, 2.4, mat('#ece6db', { roughness: 0.5 }), { cast: false });
    boxE(interior, -6.75, -5.75, FL + 1.0, FL + 1.05, -3.65, 2.45, M.wood, { cast: false });
    boxE(interior, -6.55, -6.15, FL + 1.05, FL + 1.33, 0.55, 1.05, M.darkMetal, { cast: false });
    boxE(interior, -6.55, -6.15, FL + 1.05, FL + 1.33, 1.75, 2.25, M.darkMetal, { cast: false });
    boxE(interior, -6.6, -5.9, FL + 1.05, FL + 1.55, -3.2, -1.8, ctx.glow.add(mat('#ffd59a', { emissive: '#ff9a3c', transparent: true, opacity: 0.85 }), 'interior', 0.8), { cast: false });
    {
      const cg = ctx.glow.add(new THREE.MeshStandardMaterial({ map: cigTex, emissiveMap: cigTex, emissive: '#ffffff' }), 'interior', 0.4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.1), cg);
      m.rotation.y = Math.PI / 2; m.position.set(SX0 + 0.21, FL + 1.9, -0.5);
      interior.add(m);
    }
    // magazine racks
    boxE(interior, -7.7, -1.6, FL, FL + 0.8, 3.2, 3.65, M.shelf, { cast: false });
    boxE(interior, 1.2, 7.2, FL, FL + 0.8, 3.2, 3.65, M.shelf, { cast: false });
    const magList: { x: number; c: string }[] = [];
    for (const [a, b] of [[-7.5, -1.8], [1.4, 7.0]]) for (let x = a; x < b; x += 0.26) magList.push({ x, c: pick(PROD_COLORS) });
    // ATM + ice-cream freezer, against the side windows either side of the side door, so the aisles stay walkable
    boxE(interior, 6.9, 7.55, FL, FL + 1.45, 0.6, 1.4, mat('#dadde1', { roughness: 0.4 }), { cast: false });
    boxE(interior, 6.88, 6.9, FL + 0.85, FL + 1.25, 0.7, 1.3, ctx.glow.add(mat('#2a74d9', { emissive: '#4fa3ff' }), 'interior', 0.8), { cast: false, plain: true });
    boxE(interior, 6.75, 7.55, FL, FL + 0.82, -3.2, -1.2, M.white, { cast: false });
    boxE(interior, 6.8, 7.5, FL + 0.82, FL + 0.86, -3.15, -1.25, ctx.glow.add(mat('#cfeaff', { emissive: '#bfe3ff', transparent: true, opacity: 0.7 }), 'interior', 0.6), { cast: false, plain: true });

    // products and magazines in one instanced draw
    {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { roughness: 0.5 }), prodList.length + magList.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
      let i = 0;
      for (const it of prodList) {
        m4.compose(p.set(it.x, it.y, it.z), q.identity(), s.set(it.sx, it.sy, it.sz));
        im.setMatrixAt(i, m4); im.setColorAt(i, c.set(it.c)); i++;
      }
      const qm = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));
      for (const it of magList) {
        m4.compose(p.set(it.x, FL + 0.95, 3.45), qm, s.set(0.22, 0.3, 0.02));
        im.setMatrixAt(i, m4); im.setColorAt(i, c.set(it.c)); i++;
      }
      im.receiveShadow = true;
      interior.add(im);
    }
    // posters on the inside of the glass; the last one is the seasonal campaign
    const posterMats = ([
      [posterTex(['からあげ', '¥230'], '#e8642c', '揚げたて！'), -6.9],
      [posterTex(['おにぎり', '100円'], '#d7383b', 'セール中'), -4.7],
      [posterTex(['ATM', '24H'], '#2756b0', 'いつでも'), 4.1],
      [posterTex(['くじ', '開催中'], '#16936a', '1回700円'), 6.4],
    ] as [THREE.Texture, number][]).map(([tex, x]) => {
      const pm = ctx.glow.add(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#fff', roughness: 0.6 }), 'interior', 0.25);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), pm);
      m.position.set(x, 1.95, SZ1 - 0.13);
      store.add(m);
      return pm;
    });
    const CAMPAIGNS = {
      kuji: posterMats[3].map!,
      hanami: posterTex(['お花見', '弁当'], '#e0708e', '予約受付中'),
      ice: posterTex(['アイス', '新発売'], '#2f9fd8', '冷たい！'),
      tsukimi: posterTex(['月見', 'だんご'], '#5a4a8a', '9月限定'),
      oden: posterTex(['おでん', '70円'], '#a8562a', '全品セール'),
      cake: posterTex(['ケーキ', '予約'], '#c4282e', 'クリスマス'),
      fukubukuro: posterTex(['福袋', '発売中'], '#d7383b', '新春'),
    };
    ctx.states.track<keyof typeof CAMPAIGNS>({
      pick: ({ season, has }) => has('shogatsu') ? 'fukubukuro' : has('christmas') ? 'cake' : has('tsukimi') ? 'tsukimi'
        : season === 'spring' ? 'hanami' : season === 'summer' ? 'ice' : season === 'winter' || season === 'autumn' ? 'oden' : 'kuji',
      enter: (k) => { posterMats[3].map = posterMats[3].emissiveMap = CAMPAIGNS[k]; },
    });

    // rooftop
    ac(store, -4.8, 4.35, -0.2); ac(store, -3.6, 4.35, -0.2); ac(store, -2.4, 4.35, -0.2);
    ac(store, 5, 4.35, -4.6, Math.PI);
    boxE(store, 2.2, 3.8, 4.35, 5.35, -3.2, -1.8, mat('#d0d0ca', { roughness: 0.7 }));
    cyl(store, 0.22, 0.22, 0.9, M.chrome, -0.6, 4.35, -4.4, 12);
    cyl(store, 0.32, 0.22, 0.12, M.chrome, -0.6, 5.25, -4.4, 12);
    rod(store, V(-4.8, 4.5, 0.05), V(-4.8, 4.5, 3.4), 0.05, M.white);
    rod(store, V(-4.8, 4.5, 3.4), V(-4.8, 3.3, 3.75), 0.05, M.white);

    // ---------------------------------------------------------------- the shop's own light
    // ceiling lights fill the interior and spill out through the glass; a warm downlight under the awning
    const interiorLights = ([[-4.4, 2.45, -0.5], [3.4, 2.45, -0.5], [-0.2, 2.45, 2.8]] as const).map(([x, y, z]) => {
      const l = new THREE.PointLight('#f6f8ff', 10, 0, 2);
      l.position.set(x, y, z);
      store.add(l);
      return l;
    });
    const awningLight = new THREE.PointLight('#fff1dc', 0, 0, 1.8);
    awningLight.position.set(DOOR_X + 0.5, 2.3, SZ1 + 2.4);
    store.add(awningLight);
    ctx.onFrame((_dt, _t, d) => {
      // the shop is always open: brighter inside when it's dark or grey outside
      const inside = 13.3 * ctx.atmosphere.channel('interior');
      for (const l of interiorLights) l.intensity = inside;
      awningLight.intensity = (1 - d.daylight) * 12 + d.daylight * (d.cloud * 4 + d.rain * 3 + d.fog * 3);
    });

    // clicking the shop opens the automatic doors, with the chime
    ctx.interact.clickable(store, () => { openDoor(); ctx.audio.play('chime'); }, 'ひかりマート');

    // ---------------------------------------------------------------- surfaces
    const S = ctx.surfaces;
    S.addWalk({ x0: SX0, x1: SX1, z0: SZ0, z1: SZ1 }, FL, 3);
    const AWN = { x0: SX0 - 0.15, x1: WALK + 0.15 };
    S.addWalk({ x0: SX0 - 0.2, x1: WALK, z0: SZ1 - 0.01, z1: APRON }, FL, 3);
    S.addWalk({ x0: SX1, x1: WALK, z0: SZ0, z1: SZ1 }, FL, 3);
    S.addRoof({ x0: SX0 - 0.1, x1: SX1 + 0.1, z0: SZ0 - 0.1, z1: SZ1 + 0.1 }, SH);
    S.addRoof({ x0: AWN.x0, x1: AWN.x1, z0: SZ1, z1: APRON - 0.05 }, 2.7);
    S.addRoof({ x0: SX1, x1: AWN.x1, z0: SZ0, z1: SZ1 }, 2.7);
    S.addShelter({ x0: AWN.x0 - 0.1, x1: AWN.x1, z0: SZ0, z1: APRON - 0.05 });

    // ---------------------------------------------------------------- on the map
    // the roof and the canopy over the apron and the side terrace; light spills out of the shop at night. On the
    // roof's back corner (the map shows the customers inside, so the middle stays clear), the brand's three stripes —
    // the one thing that says "konbini" at the size of a stamp
    ctx.plan.add({ kind: 'site', rect: { x0: AWN.x0, x1: AWN.x1, z0: SZ1, z1: APRON - 0.05 }, h: 2.7, color: '#f3f3ef', glow: 'interior' });
    ctx.plan.add({ kind: 'site', rect: { x0: SX1, x1: AWN.x1, z0: SZ0, z1: SZ1 }, h: 2.7, color: '#f3f3ef', glow: 'interior' });
    ctx.plan.add({ kind: 'site', rect: { x0: SX0 - 0.1, x1: SX1 + 0.1, z0: SZ0 - 0.1, z1: SZ1 + 0.1 }, h: SH, color: '#ecebe6' });
    ctx.plan.add({ kind: 'site', rect: { x0: AWN.x0, x1: AWN.x1, z0: APRON - 0.5, z1: APRON - 0.05 }, color: BRAND.green });
    ctx.plan.add({ kind: 'site', rect: { x0: AWN.x0, x1: AWN.x1, z0: APRON - 0.75, z1: APRON - 0.5 }, color: BRAND.orange, glow: 'sign' });
    [BRAND.green, BRAND.orange, BRAND.blue].forEach((color, i) => {
      const x = SX0 + 0.9 + i * 1.6;
      ctx.plan.add({ kind: 'site', rect: { x0: x, x1: x + 0.9, z0: SZ0 + 0.9, z1: SZ0 + 4.2 }, color });
    });

    // ---------------------------------------------------------------- walkable inside
    const N = ctx.nav;
    const FRONT = SZ1 - 1.65, BACK = SZ0 + 1.75;
    N.addNode('shop.door.out', DOOR_X, SZ1 + 1.3);
    N.addNode('shop.door.in', DOOR_X, SZ1 - 1.15);
    N.addEdge('shop.door.out', 'shop.door.in', { onEnter: openDoor, tags: ['door'] });
    const aisles: ShopService['aisles'] = [
      { x: -3.17, faces: [Math.PI / 2, -Math.PI / 2] },
      { x: 0.3, faces: [Math.PI / 2, -Math.PI / 2] },
      { x: 3.95, faces: [Math.PI / 2, -Math.PI / 2] },
      { x: 6.45, faces: [-Math.PI / 2] },
    ].map((a, i) => ({ ...a, front: `shop.aisle.${i}.front`, back: `shop.aisle.${i}.back` }));
    N.addNode('shop.register.queue', -5.25, FRONT);
    N.addNode('shop.register', -5.25, 0.8, { heading: -Math.PI / 2 });
    N.addEdge('shop.register.queue', 'shop.register');
    for (const a of aisles) {
      N.addNode(a.front, a.x, FRONT);
      N.addNode(a.back, a.x, BACK, { heading: Math.PI });
      N.addEdge(a.front, a.back);
    }
    N.addPath(['shop.register.queue', ...aisles.map((a) => a.front)]);
    N.addPath(aisles.map((a) => a.back));
    N.addEdge('shop.door.in', aisles[1].front);
    // the side door, between the freezer and the ATM, onto the last aisle
    N.addNode('shop.side.out', SX1 + 0.6, SIDE_DOOR);
    N.addNode('shop.side.in', 6.6, SIDE_DOOR);
    N.addEdge('shop.side.out', 'shop.side.in', { onEnter: openSideDoor, tags: ['door'] });
    N.addEdge('shop.side.in', aisles[3].front);
    N.addEdge('shop.side.in', aisles[3].back);
    N.addNode('shop.clerk', -7.3, 0.8, { heading: Math.PI / 2 });
    N.addNode('shop.backroom', 0.3, SZ0 + 1.4, { heading: 0 });
    N.addEdge('shop.backroom', aisles[1].back);

    ctx.services.provide<ShopService>('shop', {
      openDoor,
      aisles,
      nodes: { doorOut: 'shop.door.out', doorIn: 'shop.door.in', register: 'shop.register', clerk: 'shop.clerk', backroom: 'shop.backroom', sideOut: 'shop.side.out' },
      awning: { x0: AWN.x0, x1: AWN.x1, z: APRON - 0.11, y: 2.38 },
    });
  },
});
