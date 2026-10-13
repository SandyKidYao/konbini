// The staff back yard on the store's left side: back door, mesh fence and gate, restocking cart,
// garbage station, a break corner with a vending machine and a bench — and a cat asleep on it.
// Offers 'shop.backyard' (back door, staff drink, bench) and the yard's paths.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod } from '../../../engine/mod';
import { mat, box, boxE, cyl, rod, V, canvasTex, FONT_JP as JP } from '../../../engine/kit/build';
import { materials } from '../../common/materials';
import { STORE, type BackyardService } from './api';

export default defineMod({
  id: 'konbini.site.backyard',
  name: '员工后院',
  layer: 'site',
  site: 'konbini',
  requires: ['konbini.library', 'konbini.site.store'],
  setup(ctx) {
    const M = materials(ctx);
    const { range: rr, pick } = ctx.mod.random;

    const G = 0.08;                  // ground level of the lot
    const WALL_X = STORE.x0;         // outer face of the store's left wall
    const yard = new THREE.Group();
    ctx.root.add(yard);

    // ------------------------------------------------------------------ back door
    const DOOR_Z0 = -10.15, DOOR_Z1 = -9.05, DOOR_H = 2.2;
    const peekTex = canvasTex(128, 256, (g, w, h) => {
      // what you glimpse through the open door: a warm, cramped stock room
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#fff2d8'); bg.addColorStop(1, '#e8c99a');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b89a74'; g.fillRect(6, 40, 50, 6); g.fillRect(6, 100, 50, 6); g.fillRect(6, 160, 50, 6);
      for (const y of [14, 74, 134]) for (let x = 8; x < 52; x += 13) {
        g.fillStyle = pick(['#c99a62', '#d8ae76', '#e0b783', '#7fb0d6']); g.fillRect(x, y, 11, 26);
      }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(96, 40, 12, 0, 7); g.fill();
      g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath(); g.moveTo(96, 40); g.lineTo(96, 32); g.moveTo(96, 40); g.lineTo(102, 42); g.stroke();
      g.fillStyle = '#8fb8a5'; g.fillRect(74, 120, 40, 90);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h - 30, w, 30);
    });
    {
      const peek = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_Z1 - DOOR_Z0, DOOR_H - 0.04),
        ctx.glow.add(mat('#ffffff', { map: peekTex, emissiveMap: peekTex, emissive: '#ffffff', roughness: 0.9 }), 'interior', 0.55));
      peek.rotation.y = -Math.PI / 2;
      peek.position.set(WALL_X - 0.035, STORE.floor + DOOR_H / 2, (DOOR_Z0 + DOOR_Z1) / 2);
      yard.add(peek);
    }
    // frame, step, canopy
    const doorFrameM = mat('#8d949b', { roughness: 0.45, metalness: 0.4 });
    boxE(yard, WALL_X - 0.09, WALL_X, G, STORE.floor + DOOR_H + 0.08, DOOR_Z0 - 0.08, DOOR_Z0, doorFrameM);
    boxE(yard, WALL_X - 0.09, WALL_X, G, STORE.floor + DOOR_H + 0.08, DOOR_Z1, DOOR_Z1 + 0.08, doorFrameM);
    boxE(yard, WALL_X - 0.09, WALL_X, STORE.floor + DOOR_H, STORE.floor + DOOR_H + 0.08, DOOR_Z0 - 0.08, DOOR_Z1 + 0.08, doorFrameM);
    boxE(yard, WALL_X - 0.95, WALL_X, G, 0.24, DOOR_Z0 - 0.35, DOOR_Z1 + 0.35, mat('#c3c0b8', { roughness: 0.9 }));
    boxE(yard, WALL_X - 1.0, WALL_X, 2.62, 2.7, DOOR_Z0 - 0.45, DOOR_Z1 + 0.45, mat('#e9ebe8', { roughness: 0.5 }));
    for (const z of [DOOR_Z0 - 0.35, DOOR_Z1 + 0.35]) rod(yard, V(WALL_X, 2.25, z), V(WALL_X - 0.9, 2.62, z), 0.02, M.frame);

    // the leaf, hinged on its back edge; it swings outward when clicked
    const leafPivot = new THREE.Group();
    leafPivot.position.set(WALL_X - 0.045, 0, DOOR_Z0);
    yard.add(leafPivot);
    {
      const leafM = mat('#a9c4bb', { roughness: 0.4, metalness: 0.25 });
      const w = DOOR_Z1 - DOOR_Z0;
      const leaf = new THREE.Mesh(new RoundedBoxGeometry(0.05, DOOR_H - 0.02, w - 0.02, 2, 0.015), leafM);
      leaf.position.set(0, STORE.floor + DOOR_H / 2, w / 2);
      leaf.castShadow = leaf.receiveShadow = true;
      leafPivot.add(leaf);
      cyl(leafPivot, 0.025, 0.025, 0.14, M.chrome, -0.06, STORE.floor + 0.95, w - 0.14, 10).rotation.z = Math.PI / 2;
      box(leafPivot, 0.02, 0.5, 0.22, M.darkGlass, -0.026, STORE.floor + 1.45, w / 2 + 0.25, { plain: true });
      const plate = canvasTex(256, 96, (g, cw, ch) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, cw, ch);
        g.fillStyle = '#d7383b'; g.fillRect(0, 0, cw, 10);
        g.fillStyle = '#2b2b2b'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `700 26px ${JP}`; g.fillText('関係者以外', cw / 2, 40); g.fillText('立入禁止', cw / 2, 72);
      });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), mat('#fff', { map: plate }));
      p.rotation.y = -Math.PI / 2;
      p.position.set(-0.03, STORE.floor + 1.12, w / 2 - 0.12);
      leafPivot.add(p);
    }
    let doorOpen = 0, doorTimer = 0;
    const openBackDoor = (hold = 3.2) => {
      if (doorTimer <= 0) ctx.audio.play('latch');
      doorTimer = Math.max(doorTimer, hold);
    };
    ctx.interact.clickable(leafPivot, () => openBackDoor(), '后门');
    ctx.onFrame((dt) => {
      doorTimer = Math.max(0, doorTimer - dt);
      doorOpen += ((doorTimer > 0 ? 1 : 0) - doorOpen) * Math.min(1, dt * 3);
      leafPivot.rotation.y = -doorOpen * 1.35;
    });

    // wall lamp over the door + the warm pool of light it throws at night
    {
      box(yard, 0.16, 0.16, 0.3, M.darkMetal, WALL_X - 0.08, 2.28, (DOOR_Z0 + DOOR_Z1) / 2);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), ctx.glow.add(mat('#fff4dc', { emissive: '#ffd9a0' }), 'lamp', 1.4));
      bulb.position.set(WALL_X - 0.2, 2.3, (DOOR_Z0 + DOOR_Z1) / 2);
      yard.add(bulb);
      const light = new THREE.PointLight('#ffd6a0', 0, 9, 2);
      light.position.set(WALL_X - 0.6, 2.2, (DOOR_Z0 + DOOR_Z1) / 2);
      yard.add(light);
      ctx.onFrame(() => { light.intensity = ctx.atmosphere.channel('lamp') * 2.4 + ctx.atmosphere.channel('window') * 0.6; });
    }
    // hose reel and an electric meter on the wall
    cyl(yard, 0.22, 0.22, 0.12, mat('#3f7f5f', { roughness: 0.5 }), WALL_X - 0.1, 0.9, -5.6, 18).rotation.z = Math.PI / 2;
    box(yard, 0.12, 0.42, 0.3, mat('#e6e6e1'), WALL_X - 0.06, 1.35, -7.0);

    // ------------------------------------------------------------------ mesh fence with a gate
    const fenceM = mat('#466e5c', { roughness: 0.5, metalness: 0.3 });
    const meshTex = canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
    }, true);
    const meshM = mat('#466e5c', { map: meshTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
    const FENCE_Z = -3.3, FENCE_H = 1.25;
    function fencePanel(x0: number, x1: number, parent: THREE.Object3D = yard, z = FENCE_Z) {
      const w = x1 - x0;
      const pm = meshM.clone();
      pm.map = meshTex.clone(); pm.map.repeat.set(w / 0.16, (FENCE_H - 0.1) / 0.16); pm.map.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, FENCE_H - 0.1), pm);
      m.position.set((x0 + x1) / 2, G + FENCE_H / 2, z);
      m.castShadow = true;
      parent.add(m);
      rod(parent, V(x0, G + FENCE_H, z), V(x1, G + FENCE_H, z), 0.025, fenceM);
      rod(parent, V(x0, G + 0.06, z), V(x1, G + 0.06, z), 0.02, fenceM);
    }
    const posts = [-13.9, -12.0, -10.2, -9.15, -7.75];
    for (const x of posts) box(yard, 0.07, FENCE_H + 0.08, 0.07, fenceM, x, G, FENCE_Z);
    fencePanel(-13.9, -12.0); fencePanel(-12.0, -10.2); fencePanel(-10.2, -9.15);
    fencePanel(-7.75, WALL_X - 0.05);
    // gate leaf, left ajar
    {
      const gate = new THREE.Group();
      gate.position.set(-9.12, 0, FENCE_Z);
      const w = 1.32;
      for (const x of [0.02, w - 0.02]) box(gate, 0.05, FENCE_H - 0.05, 0.05, fenceM, x, G + 0.03, 0);
      fencePanel(0.02, w - 0.02, gate, 0);
      gate.rotation.y = 0.75;
      yard.add(gate);
    }

    // ------------------------------------------------------------------ storage shed (back corner)
    boxE(yard, -13.3, -10.9, G, 2.1, -13.6, -11.9, mat('#d5dfcf', { roughness: 0.6 }));
    boxE(yard, -13.45, -10.75, 2.1, 2.2, -13.75, -11.75, mat('#9fb098'));
    boxE(yard, -13.1, -12.1, 0.2, 1.9, -11.9, -11.86, mat('#c4cebc'), { plain: true });
    boxE(yard, -12.1, -11.1, 0.2, 1.9, -11.88, -11.84, mat('#bcc6b4'), { plain: true });
    for (const z of [-13.2, -12.75]) cyl(yard, 0.18, 0.18, 1.2, mat('#dde2e6', { metalness: 0.35, roughness: 0.4 }), -10.45, G, z, 16);

    // ------------------------------------------------------------------ restocking: roll cage cart of folding crates
    {
      const cart = new THREE.Group();
      const cw = 0.75, cd = 0.62, ch = 1.6;
      const wire = mat('#b9bec4', { metalness: 0.7, roughness: 0.35 });
      box(cart, cw, 0.05, cd, wire, 0, 0.14, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        rod(cart, V(sx * cw / 2, 0.14, sz * cd / 2), V(sx * cw / 2, ch, sz * cd / 2), 0.014, wire, 6);
        cyl(cart, 0.055, 0.055, 0.05, M.rubber, sx * (cw / 2 - 0.06), 0.03, sz * (cd / 2 - 0.06), 10).rotation.x = Math.PI / 2;
      }
      for (const y of [0.6, 1.1, ch]) {
        rod(cart, V(-cw / 2, y, cd / 2), V(cw / 2, y, cd / 2), 0.01, wire, 4);
        rod(cart, V(-cw / 2, y, -cd / 2), V(cw / 2, y, -cd / 2), 0.01, wire, 4);
        rod(cart, V(-cw / 2, y, -cd / 2), V(-cw / 2, y, cd / 2), 0.01, wire, 4);
      }
      ['#f39a4a', '#4f8fd9', '#f2c14e', '#f39a4a'].forEach((c, i) => box(cart, 0.62, 0.3, 0.5, mat(c, { roughness: 0.6 }), 0, 0.19 + i * 0.31, 0, { r: 0.03 }));
      cart.position.set(WALL_X - 0.75, G, -11.2);
      cart.rotation.y = 0.15;
      yard.add(cart);
    }
    // a couple of crates waiting by the step, one with a lid open
    box(yard, 0.62, 0.3, 0.5, mat('#4f8fd9', { roughness: 0.6 }), WALL_X - 1.45, G, -8.35, { r: 0.03, ry: 0.3 });
    box(yard, 0.62, 0.3, 0.5, mat('#f39a4a', { roughness: 0.6 }), WALL_X - 1.45, G + 0.3, -8.35, { r: 0.03, ry: 0.22 });

    // ------------------------------------------------------------------ garbage station along the left wall
    function wheelieBin(x: number, z: number, color: string) {
      const g = new THREE.Group();
      box(g, 0.95, 0.95, 0.72, mat(color, { roughness: 0.55 }), 0, 0.12, 0, { r: 0.05 });
      const lid = box(g, 1.0, 0.07, 0.78, mat('#3b4a5a', { roughness: 0.5 }), 0, 1.07, 0, { r: 0.03 });
      lid.rotation.z = rr(-0.05, 0.05);
      for (const sx of [-0.36, 0.36]) for (const sz of [-0.26, 0.26]) cyl(g, 0.06, 0.06, 0.05, M.rubber, sx, 0.06, sz, 10).rotation.x = Math.PI / 2;
      g.position.set(x, G, z); g.rotation.y = Math.PI / 2 + rr(-0.05, 0.05);
      yard.add(g);
    }
    wheelieBin(-13.35, -10.4, '#6f8fa8');
    wheelieBin(-13.35, -9.25, '#7ea08a');
    {
      // trash bags
      const bagM = [mat('#e9eef4', { roughness: 0.25, transparent: true, opacity: 0.85 }), mat('#bcd3ea', { roughness: 0.25, transparent: true, opacity: 0.85 })];
      [[-13.2, -8.25, 0.34], [-12.75, -8.05, 0.3], [-13.3, -7.75, 0.28]].forEach(([x, z, r], i) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), bagM[i % 2]);
        b.scale.set(1, 1.1, 0.95); b.position.set(x, G + r, z); b.castShadow = true;
        yard.add(b);
        cyl(yard, 0.03, 0.06, 0.12, bagM[i % 2], x, G + r * 2.05, z, 8);
      });
      // flattened cardboard tied in bundles
      const card = mat('#c6a173', { roughness: 0.9 });
      for (let i = 0; i < 2; i++) {
        const bx = -13.25, bz = -6.9 + i * 0.05, y0 = G + i * 0.24;
        box(yard, 0.85, 0.22, 0.65, card, bx, y0, bz, { r: 0.01, ry: i * 0.2 });
        box(yard, 0.87, 0.225, 0.04, M.white, bx, y0, bz, { plain: true, ry: i * 0.2 });
      }
    }

    // ------------------------------------------------------------------ break corner
    // staff vending machine against the block wall
    const staffVending = ctx.prefabs.create('vending-machine', { body: '#f2f4f0', accent: '#14a05a', seed: 57, label: '员工自动贩卖机' });
    staffVending.root.rotation.y = Math.PI / 2;
    staffVending.root.position.set(-13.45, G, -4.6);
    yard.add(staffVending.root);
    // wooden bench
    const benchX = -11.2, benchZ = -5.4;
    {
      const wood = mat('#c49a6c', { roughness: 0.6 });
      for (let i = 0; i < 3; i++) box(yard, 1.7, 0.05, 0.12, wood, benchX, G + 0.45, benchZ - 0.15 + i * 0.15, { r: 0.015 });
      for (const sx of [-0.7, 0.7]) box(yard, 0.06, 0.45, 0.42, M.darkMetal, benchX + sx, G, benchZ, { r: 0.01 });
    }
    // upturned crates used as stools, an ashtray stand, potted plants, a broom
    box(yard, 0.45, 0.32, 0.36, mat('#f2c14e', { roughness: 0.6 }), -10.0, G, -6.5, { r: 0.03, ry: 0.4 });
    box(yard, 0.45, 0.32, 0.36, mat('#4f8fd9', { roughness: 0.6 }), -12.3, G, -6.6, { r: 0.03, ry: -0.3 });
    cyl(yard, 0.16, 0.18, 0.72, mat('#c9ced3', { metalness: 0.6, roughness: 0.3 }), -8.4, G, -5.8, 16);
    cyl(yard, 0.2, 0.17, 0.06, mat('#9aa0a6', { metalness: 0.6, roughness: 0.3 }), -8.4, G + 0.72, -5.8, 16);
    {
      const potM = mat('#c27a55', { roughness: 0.7 }), leafM = mat('#6f9a5c', { roughness: 0.8 });
      for (const [x, z, s] of [[-13.5, -3.7, 1.1], [-12.95, -3.65, 0.8], [WALL_X - 0.35, -3.9, 0.9]]) {
        cyl(yard, 0.2 * s, 0.15 * s, 0.32 * s, potM, x, G, z, 14);
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 * s, 1), leafM);
        l.position.set(x, G + 0.32 * s + 0.22 * s, z); l.scale.y = 1.2; l.castShadow = true;
        yard.add(l);
      }
      rod(yard, V(WALL_X - 0.08, G, -6.4), V(WALL_X - 0.12, G + 1.35, -6.15), 0.018, M.wood, 6);
      box(yard, 0.08, 0.18, 0.32, mat('#d9c58a', { roughness: 0.9 }), WALL_X - 0.1, G, -6.45, { r: 0.02 });
    }

    // ------------------------------------------------------------------ a cat curled up asleep on the bench
    const sleeper = new THREE.Group();
    {
      const fur = mat('#d9cfc2', { roughness: 0.85 }), white = mat('#f3efe6', { roughness: 0.85 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), fur);
      body.scale.set(1.25, 0.6, 1); sleeper.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), fur);
      head.position.set(0.17, 0.02, 0.1); head.scale.set(1, 0.85, 1); sleeper.add(head);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), white);
      muzzle.position.set(0.24, -0.01, 0.15); sleeper.add(muzzle);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), fur);
        ear.position.set(0.15 + s * 0.04, 0.1, 0.1 + s * 0.03); ear.rotation.z = -0.3; sleeper.add(ear);
        sleeper.userData['ear' + s] = ear;
      }
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 20, Math.PI * 1.1), fur);
      tail.rotation.x = Math.PI / 2; tail.rotation.z = 0.6; tail.position.y = -0.06; sleeper.add(tail);
      sleeper.traverse((o) => { o.castShadow = true; });
      sleeper.position.set(benchX + 0.35, G + 0.6, benchZ);
      sleeper.rotation.y = 0.4;
      yard.add(sleeper);
    }
    let twitch = 0;
    ctx.interact.clickable(sleeper, () => { twitch = 1.2; ctx.audio.play('purr'); }, '打盹的猫');
    ctx.onFrame((dt, t) => {
      const breath = 1 + Math.sin(t * 1.6) * 0.035;      // slow, sleepy breathing
      sleeper.scale.set(1, breath, 1);
      twitch = Math.max(0, twitch - dt);
      const flick = twitch > 0 ? Math.sin(twitch * 30) * 0.35 * twitch : 0;
      (sleeper.userData['ear1'] as THREE.Object3D).rotation.x = flick;
      (sleeper.userData['ear-1'] as THREE.Object3D).rotation.x = -flick;
    });

    // staff bicycle parked inside the fence
    {
      const b = ctx.prefabs.create('bicycle', { color: '#8fb3a3' }).root;
      b.position.set(-11.6, G, -3.75);
      b.rotation.y = 0.05;
      yard.add(b);
    }

    // ---------------------------------------------------------------- surfaces, paths, service
    ctx.surfaces.addWalk({ x0: WALL_X - 0.95, x1: WALL_X, z0: DOOR_Z0 - 0.35, z1: DOOR_Z1 + 0.35 }, 0.24, 4);
    ctx.surfaces.addShelter({ x0: WALL_X - 1.0, x1: WALL_X, z0: DOOR_Z0 - 0.45, z1: DOOR_Z1 + 0.45 });
    ctx.surfaces.addRoof({ x0: WALL_X - 1.0, x1: WALL_X, z0: DOOR_Z0 - 0.45, z1: DOOR_Z1 + 0.45 }, 2.66);
    const N = ctx.nav, doorZ = (DOOR_Z0 + DOOR_Z1) / 2;
    N.addNode('shop.staffdoor', WALL_X - 0.25, doorZ, { heading: -Math.PI / 2 });
    N.addNode('shop.yard.canopy', WALL_X - 0.6, DOOR_Z1 - 0.1, { heading: -Math.PI / 2 });
    N.addNode('shop.yard.a', -9.0, -9.9);
    N.addNode('shop.yard.b', -9.0, -7.2);
    N.addNode('shop.yard.c', -10.2, -4.5);
    N.addNode('shop.yard.vending', -12.75, -4.5, { heading: -Math.PI / 2 });
    N.addNode('shop.yard.bench', benchX - 0.55, benchZ + 0.65, { heading: 0 });
    N.addEdge('shop.staffdoor', 'shop.yard.canopy');
    N.addEdge('shop.staffdoor', 'shop.yard.a', { onEnter: () => openBackDoor(2.5) });
    N.addPath(['shop.yard.a', 'shop.yard.b', 'shop.yard.c', 'shop.yard.vending']);
    N.addEdge('shop.yard.c', 'shop.yard.bench');
    N.addEdge('shop.yard.vending', 'shop.yard.bench');
    ctx.services.provide<BackyardService>('shop.backyard', {
      openStaffDoor: openBackDoor,
      dispenseStaffDrink: () => staffVending.dispense(),
      bench: { x: benchX - 0.55, z: benchZ, seatY: G + 0.5, heading: 0 },
      nodes: { door: 'shop.staffdoor', canopy: 'shop.yard.canopy', vending: 'shop.yard.vending', bench: 'shop.yard.bench' },
    });
  },
});
