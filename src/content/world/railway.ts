// The railway behind the block: a single track along x, out of a short tunnel at either edge of the model, over
// road B on the level. A little two-car train (cream over green, a pantograph on one car) runs through every couple
// of minutes, one way then the other, from early morning to just before midnight. At the crossing the bell rings,
// the red lamps flash, an arrow shows which way the train is coming and the barrier arms come down; people and
// cars wait (the 'world.railway' service tells them when it is closed).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, rod, V, canvasTex, FONT_JP as JP } from '../../engine/kit/build';
import { R } from '../../engine/kit/rng';
import { materials } from '../common/materials';
import { BLOCK, TRACK } from './layout';

export interface Railway {
  /** the crossing over road B is closed: the bell is ringing or the arms are not all the way up */
  closed(): boolean;
  /** the track's centre line (z) and where road B and its sidewalks cross it (x) */
  readonly z: number;
  readonly crossing: { x0: number; x1: number };
  /** Send a train now (towards +x, or −x), if none is running. */
  send(dir?: 1 | -1): boolean;
}

/** where the crossing is along the track: road B with its sidewalks */
const XING = { x0: 11.5, x1: 23 };
/** the tunnels: how far in from each edge, and where the train is cut off out of sight inside them */
const TUNNEL = 4, HIDE = BLOCK.x1 - 3.5;
const CAR = 12, GAP = 0.6, TRAIN = CAR * 2 + GAP, SPEED = 7.5;
/** seconds of warning before the train reaches the crossing; the arms start down after the first few */
const WARN = 10, ARMS_AFTER = 3, ARM_TIME = 3.5;

export default defineMod({
  id: 'konbini.world.railway',
  name: '电车与踏切',
  layer: 'world',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const M = materials(ctx), root = ctx.root, Z = TRACK.z, C = ctx.states.conditions;
    const S = ctx.surfaces;

    // ---------------------------------------------------------------- the track bed
    const BED = { x0: BLOCK.x0, x1: BLOCK.x1 };
    // the ballast, sleepers and rails stop a little way into each tunnel's darkness, out of sight (run on to the
    // edge, their ends would fight with the tunnel's)
    const END = HIDE + 0.3;
    const segs: [number, number][] = [[-END, XING.x0], [XING.x1, END]];
    const ballast = mat('#9a9286', { roughness: 1 }), sleeperM = mat('#6a5646', { roughness: 0.9 });
    const railM = mat('#a5abb1', { roughness: 0.35, metalness: 0.7 });
    for (const [a, b] of segs) {
      boxE(root, a, b, 0.06, 0.14, Z - 1.8, Z + 1.8, ballast, { cast: false, plain: true });
      boxE(root, a, b, 0.14, 0.22, Z - 1.3, Z + 1.3, ballast, { cast: false, plain: true });
      S.addWalk({ x0: a, x1: b, z0: Z - 1.8, z1: Z + 1.8 }, 0.22);
      ctx.plan.add({ kind: 'lot', rect: { x0: a, x1: b, z0: Z - 1.6, z1: Z + 1.6 }, color: '#a39a8d' });
    }
    {
      const xs: number[] = [];
      for (let x = -END + 0.3; x < END; x += 0.62) if (x < XING.x0 - 0.1 || x > XING.x1 + 0.1) xs.push(x);
      const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.07, 2.1), sleeperM, xs.length);
      const m4 = new THREE.Matrix4();
      xs.forEach((x, i) => { m4.makeTranslation(x, 0.255, Z); sl.setMatrixAt(i, m4); });
      sl.receiveShadow = true;
      root.add(sl);
    }
    for (const dz of [-0.535, 0.535]) {
      for (const [a, b] of segs) boxE(root, a, b, 0.29, 0.37, Z + dz - 0.035, Z + dz + 0.035, railM, { cast: false, plain: true });
      ctx.plan.add({ kind: 'paint', rect: { x0: BED.x0, x1: BED.x1, z0: Z + dz - 0.05, z1: Z + dz + 0.05 }, color: '#77736d' });
    }

    // ---------------------------------------------------------------- the crossing deck, set in road B
    const DECK_Y = 0.3;
    boxE(root, XING.x0, XING.x1, 0, DECK_Y, Z - 1.9, Z + 1.9, mat('#48494b', { roughness: 0.9 }), { cast: false, plain: true });
    S.addWalk({ x0: XING.x0, x1: XING.x1, z0: Z - 1.9, z1: Z + 1.9 }, DECK_Y, 3);
    for (const dz of [-0.535, 0.535]) boxE(root, XING.x0, XING.x1, DECK_Y, DECK_Y + 0.02, Z + dz - 0.04, Z + dz + 0.04, railM, { cast: false, plain: true });
    // the yellow and black edges, and the ramps up from the road either side
    const hazard = canvasTex(256, 16, (g, w, h) => { g.fillStyle = '#f2c63a'; g.fillRect(0, 0, w, h); g.fillStyle = '#26282b'; for (let x = -16; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, h); g.fill(); } }, true);
    hazard.repeat.set((XING.x1 - XING.x0) / 2, 1);
    for (const dz of [-1.9, 1.9]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(XING.x1 - XING.x0, 0.22), mat('#ffffff', { map: hazard, roughness: 0.7 }));
      m.rotation.x = -Math.PI / 2; m.position.set((XING.x0 + XING.x1) / 2, DECK_Y + 0.005, Z + dz - Math.sign(dz) * 0.11); m.receiveShadow = true;
      root.add(m);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(XING.x1 - XING.x0, 0.05, 0.62), mat('#48494b', { roughness: 0.9 }));
      ramp.position.set((XING.x0 + XING.x1) / 2, DECK_Y / 2, Z + dz + Math.sign(dz) * 0.28); ramp.rotation.x = Math.sign(dz) * 0.42; ramp.receiveShadow = true;
      root.add(ramp);
    }
    ctx.plan.add({ kind: 'paint', rect: { x0: XING.x0, x1: XING.x1, z0: Z - 1.9, z1: Z + 1.9 }, color: '#55575a' });

    // ---------------------------------------------------------------- fences along both sides
    const fenceM = mat('#8e9c93', { roughness: 0.6, metalness: 0.2 });
    for (const dz of [-TRACK.fence, TRACK.fence]) for (const [a, b] of [[BED.x0 + TUNNEL, XING.x0 - 0.3], [XING.x1 + 0.3, BED.x1 - TUNNEL]]) {
      const n = Math.max(1, Math.round((b - a) / 2.4));
      for (let k = 0; k <= n; k++) box(root, 0.07, 1.1, 0.07, fenceM, a + (b - a) * k / n, 0.06, Z + dz, { plain: true });
      boxE(root, a, b, 1.08, 1.14, Z + dz - 0.03, Z + dz + 0.03, fenceM, { cast: false, plain: true });
      boxE(root, a, b, 0.55, 0.59, Z + dz - 0.02, Z + dz + 0.02, fenceM, { cast: false, plain: true });
    }

    // ---------------------------------------------------------------- the overhead line
    const mastM = mat('#9aa09c', { roughness: 0.5, metalness: 0.3 }), wireM = mat('#3a3d40', { roughness: 0.5 });
    const masts: number[] = [];
    for (let x = BED.x0 + TUNNEL + 3; x < BED.x1 - TUNNEL; x += 9.5) if (x < XING.x0 - 1 || x > XING.x1 + 1) masts.push(x);
    for (const x of masts) {
      cyl(root, 0.11, 0.14, 6.0, mastM, x, 0.06, Z - 2.0, 10);
      boxE(root, x - 0.05, x + 0.05, 5.6, 5.72, Z - 2.0, Z + 0.35, mastM);
      rod(root, V(x, 5.66, Z - 0.2), V(x, 5.1, Z - 0.2), 0.015, wireM, 4, false);
    }
    rod(root, V(BED.x0 + 1, 5.1, Z), V(BED.x1 - 1, 5.1, Z), 0.018, wireM, 4, false);
    rod(root, V(BED.x0 + 1, 5.66, Z - 0.2), V(BED.x1 - 1, 5.66, Z - 0.2), 0.022, wireM, 4, false);

    // ---------------------------------------------------------------- a short tunnel at each edge
    // (the train is cut off inside, behind the dark, so it is never seen sliced at the edge of the model; the far
    // end is filled in, so from outside the model the tunnel is a closed block, not a hole)
    {
      const concrete = mat('#bdb8ad', { roughness: 0.9 }), dark = mat('#141619', { roughness: 1 }), fill = mat('#a9a498', { roughness: 0.95 });
      const grass = M.grass, H = 5.9, W = 2.4;
      for (const side of [-1, 1]) {
        const xo = side * BLOCK.x1, xi = side * (BLOCK.x1 - TUNNEL);
        const [a, b] = side < 0 ? [xo, xi] : [xi, xo];
        boxE(root, a, b, 0.06, H, Z - W - 0.6, Z - W, concrete);
        boxE(root, a, b, 0.06, H, Z + W, Z + W + 0.6, concrete);
        boxE(root, a, b, H - 0.5, H, Z - W, Z + W, concrete);
        boxE(root, a, b, H, H + 0.25, Z - W - 0.8, Z + W + 0.8, grass, { cast: false });
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + (i % 3) * 0.15, 1), mat('#6f9a5b', { roughness: 0.9, flatShading: true }));
          s.position.set(a + (b - a) * (0.15 + i * 0.18), H + 0.5, Z + (i % 2 ? 1.6 : -1.4)); s.scale.y = 0.7; s.castShadow = true; root.add(s);
        }
        // the portal face, with the darkness behind it
        const face = side < 0 ? [xi, xi + 0.3] : [xi - 0.3, xi];
        boxE(root, face[0], face[1], 4.9, H, Z - W - 0.6, Z + W + 0.6, concrete);
        // the darkness: a hair inside the walls and the roof, so where they meet it is the dark that shows
        const xe = xo - side * 0.3;
        const inner = side < 0 ? [xe, HIDE * side] : [HIDE * side, xe];
        boxE(root, inner[0], inner[1], 0.06, H - 0.51, Z - W + 0.01, Z + W - 0.01, dark, { cast: false, plain: true });
        boxE(root, side < 0 ? xe : xi, side < 0 ? xi : xe, 0.05, 0.06, Z - W, Z + W, dark, { cast: false, plain: true });
        boxE(root, Math.min(xo, xe), Math.max(xo, xe), 0, H - 0.5, Z - W, Z + W, fill, { cast: false });
        ctx.plan.add({ kind: 'building', rect: { x0: a, x1: b, z0: Z - W - 0.8, z1: Z + W + 0.8 }, h: H, color: '#7d9a6a' });
        S.addRoof({ x0: a, x1: b, z0: Z - W - 0.8, z1: Z + W + 0.8 }, H + 0.25);
      }
    }

    // ---------------------------------------------------------------- the crossing's gear
    // left-hand traffic: going down towards the sea keeps to the west half and meets its arm on the near side;
    // coming up keeps to the east half and meets its arm on the far side
    const lampsOn: THREE.MeshStandardMaterial[][] = [[], []];
    const arrows: { left: THREE.MeshStandardMaterial; right: THREE.MeshStandardMaterial }[] = [];
    const arms: { pivot: THREE.Group; dir: number }[] = [];
    const yellow = mat('#f2c63a', { roughness: 0.5 }), black = mat('#26282b', { roughness: 0.6 }), white = mat('#f2f2ee', { roughness: 0.5 });
    const signTex = canvasTex(128, 48, (g, w, h) => { g.fillStyle = '#f2c63a'; g.fillRect(0, 0, w, h); g.fillStyle = '#26282b'; g.font = `700 30px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('踏切', w / 2, h / 2 + 2); });
    function gear(x: number, z: number, armDir: 1 | -1, faces: 1 | -1) {
      const g = new THREE.Group();
      g.position.set(x, 0.15, z);
      root.add(g);
      // the post: white and black bands, the crossbuck on top, two red lamps, the direction arrows, a 踏切 plate
      for (let i = 0; i < 6; i++) cyl(g, 0.07, 0.07, 0.55, i % 2 ? black : white, 0, i * 0.55, 0, 10);
      for (const s of [1, -1]) {
        const xb = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.18, 0.05), yellow);
        xb.position.set(0, 3.55, faces * 0.08); xb.rotation.z = s * Math.PI / 4; xb.castShadow = true; g.add(xb);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.185, 0.055), black);
        stripe.position.copy(xb.position); stripe.rotation.z = xb.rotation.z; g.add(stripe);
      }
      box(g, 1.15, 0.42, 0.08, black, 0, 2.55, faces * 0.06, { plain: true });
      for (const [i, dx] of [[0, -0.33], [1, 0.33]] as const) {
        const lamp = new THREE.MeshStandardMaterial({ color: '#5a2420', emissive: '#ff3a1e', emissiveIntensity: 0, roughness: 0.4 });
        lampsOn[i].push(lamp);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 18), lamp);
        m.rotation.x = Math.PI / 2; m.position.set(dx, 2.76, faces * 0.12); g.add(m);
        box(g, 0.36, 0.05, 0.22, black, dx, 2.93, faces * 0.2, { plain: true });   // the visor over it
      }
      const arrow = (dir: number) => {
        const mm = new THREE.MeshStandardMaterial({ color: '#3a3d40', emissive: '#ffd24a', emissiveIntensity: 0 });
        // a triangle pointing the way the train goes (world ±x), on whichever face the post turns to the road
        const tri = new THREE.Mesh(new THREE.CircleGeometry(0.11, 3), mm);
        tri.position.set(dir * 0.16, 2.18, faces * 0.11); tri.rotation.set(0, faces < 0 ? Math.PI : 0, dir * faces > 0 ? 0 : Math.PI); g.add(tri);
        return mm;
      };
      box(g, 0.6, 0.26, 0.08, black, 0, 2.05, faces * 0.06, { plain: true });
      arrows.push({ left: arrow(-1), right: arrow(1) });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
      plate.position.set(0, 1.65, faces * 0.09); if (faces < 0) plate.rotation.y = Math.PI; g.add(plate);
      // the barrier: a counterweighted arm on a pivot box, striped yellow and black
      box(g, 0.32, 1.0, 0.36, mat('#e9e8e2', { roughness: 0.5 }), armDir * 0.45, 0, 0);
      const pivot = new THREE.Group();
      pivot.position.set(armDir * 0.45, 0.85, faces * 0.24);
      pivot.userData.skyIgnore = true;
      g.add(pivot);
      for (let i = 0; i < 9; i++) box(pivot, 0.42, 0.07, 0.06, i % 2 ? black : yellow, armDir * (0.21 + i * 0.42), -0.035, 0, { plain: true, cast: true });
      box(pivot, 0.45, 0.22, 0.12, black, -armDir * 0.35, -0.11, 0, { plain: true });
      arms.push({ pivot, dir: armDir });
    }
    const POSTS = [[XING.x0 + 1.9, Z + TRACK.fence + 0.35], [XING.x1 - 1.6, Z - TRACK.fence - 0.35]] as const;
    gear(POSTS[0][0], POSTS[0][1], 1, 1);
    gear(POSTS[1][0], POSTS[1][1], -1, -1);
    // on the map: the lamps by the crossing, flashing when it closes
    let flashing = false, blink = 0;
    for (const [x, z] of POSTS) {
      ctx.plan.marker({ x, z, r: 0.45, color: () => flashing ? (blink ? '#ff4a3a' : null) : null });
    }

    // the bell, and the horn when someone clicks the train
    ctx.audio.define('crossing-bell', ({ voice, env, t }) => {
      for (const [f, lvl] of [[740, 0.06], [1480, 0.018], [2220, 0.008]]) {
        const { o, g } = voice('triangle'); o.frequency.value = f;
        env(g, t, lvl, 0.004, 0.32); o.start(t); o.stop(t + 0.36);
      }
    });
    ctx.audio.define('train-horn', ({ voice, env, filter, t }) => {
      for (const f of [466, 554]) {
        const { o, g } = voice('square');
        const lp = filter('lowpass', 1400); o.disconnect(); o.connect(lp); lp.connect(g);
        o.frequency.value = f; env(g, t, 0.05, 0.03, 0.9); o.start(t); o.stop(t + 1.0);
      }
    });

    // ---------------------------------------------------------------- the train
    const clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), HIDE), new THREE.Plane(new THREE.Vector3(1, 0, 0), HIDE)];
    const TM = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o, clippingPlanes: clip, clipShadows: true });
    const cream = TM('#efe5c6'), green = TM('#2f6b47'), roofM = TM('#8c9092', { roughness: 0.6 }), under = TM('#2a2c2f', { roughness: 0.8 });
    // lit inside after dark, like the windows round about (not like the shop, which is bright all day)
    const glass = ctx.glow.add(TM('#2d3a42', { roughness: 0.15, emissive: '#ffe9c2', emissiveIntensity: 0 }), 'window', 0.7);
    const steel = TM('#5b6166', { metalness: 0.5, roughness: 0.4 });
    const lamp = (c: string) => TM('#f4f1e6', { emissive: c, emissiveIntensity: 0 });
    const ends = { west: { head: lamp('#fff3cf'), tail: lamp('#ff3020') }, east: { head: lamp('#fff3cf'), tail: lamp('#ff3020') } };
    const dest = (text: string) => TM('#ffffff', { map: canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#1e2a33'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6efd8'; g.font = `700 22px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1); }), emissive: '#ffffff', emissiveIntensity: 0.25 });
    const train = new THREE.Group();
    train.userData.skyIgnore = true;
    train.position.set(-BLOCK.x1 * 2, 0, Z);
    root.add(train);
    const FLOOR = 0.95, TOP = 3.35;
    [-1, 1].forEach((side) => {
      const cx = side * (CAR + GAP) / 2, end = side < 0 ? ends.west : ends.east;
      const body = new THREE.Mesh(new RoundedBoxGeometry(CAR, TOP - FLOOR, 2.42, 3, 0.18), [green, green, cream, green, green, green]);
      body.position.set(cx, (FLOOR + TOP) / 2, 0); body.castShadow = true; train.add(body);
      // cream above the waist, green below: a cream shell over the green body's upper half
      boxE(train, cx - CAR / 2 + 0.06, cx + CAR / 2 - 0.06, 2.0, TOP - 0.02, -1.225, 1.225, cream, { cast: false, plain: true });
      boxE(train, cx - CAR / 2 + 0.1, cx + CAR / 2 - 0.1, 1.95, 2.02, -1.235, 1.235, green, { cast: false, plain: true });
      // windows down both sides, two doors on each side
      for (let x = cx - CAR / 2 + 1.0; x < cx + CAR / 2 - 0.9; x += 1.38) {
        const door = Math.abs(x - (cx - 3)) < 0.5 || Math.abs(x - (cx + 3)) < 0.5;
        if (door) {
          boxE(train, x - 0.1, x + 0.95, FLOOR + 0.1, 3.0, -1.24, 1.24, TM('#2a5c3e'), { cast: false, plain: true });
          boxE(train, x + 0.12, x + 0.73, 2.15, 2.85, -1.25, 1.25, glass, { cast: false, plain: true });
        } else boxE(train, x, x + 1.05, 2.15, 2.95, -1.245, 1.245, glass, { cast: false, plain: true });
      }
      const roof = new THREE.Mesh(new RoundedBoxGeometry(CAR - 0.2, 0.25, 2.2, 2, 0.1), roofM);
      roof.position.set(cx, TOP + 0.08, 0); roof.castShadow = true; train.add(roof);
      boxE(train, cx - 1.2, cx + 1.2, TOP + 0.2, TOP + 0.55, -0.55, 0.55, roofM);   // the cooler on the roof
      // bogies and the skirt
      boxE(train, cx - CAR / 2 + 0.6, cx + CAR / 2 - 0.6, 0.62, FLOOR, -1.1, 1.1, under, { cast: false });
      for (const bx of [-4.2, 4.2]) {
        boxE(train, cx + bx - 1.2, cx + bx + 1.2, 0.3, 0.75, -1.0, 1.0, under);
        for (const wx of [-0.75, 0.75]) for (const wz of [-0.72, 0.72]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 14), steel);
          w.rotation.x = Math.PI / 2; w.position.set(cx + bx + wx, 0.66, wz); train.add(w);
        }
      }
      // the outer end: windscreen, a destination board, headlights low and tail lights beside them
      const ex = cx + side * CAR / 2, sx = side;
      const out = (d: number) => ex + sx * d;
      boxE(train, Math.min(ex, out(0.03)), Math.max(ex, out(0.03)), 2.05, 2.95, -1.0, 1.0, glass, { cast: false, plain: true });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), dest(side < 0 ? '桜坂' : '浜町'));
      board.position.set(out(0.035), 3.1, 0); board.rotation.y = sx * Math.PI / 2; train.add(board);
      for (const dz of [-0.75, 0.75]) {
        const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 14), end.head);
        hl.rotation.z = Math.PI / 2; hl.position.set(out(0.03), 1.5, dz); train.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.2), end.tail);
        tl.position.set(out(0.03), 1.5, dz + Math.sign(dz) * -0.3); train.add(tl);
      }
      boxE(train, Math.min(ex, out(0.12)), Math.max(ex, out(0.12)), 0.75, 1.05, -1.0, 1.0, under, { cast: false, plain: true });
    });
    // the pantograph, on the west car
    {
      const px = -(CAR + GAP) / 2 - 2.4, y0 = TOP + 0.2;
      for (const s of [-1, 1]) {
        rod(train, V(px + s * 0.75, y0, -0.5), V(px, y0 + 0.75, -0.5), 0.025, steel, 6);
        rod(train, V(px + s * 0.75, y0, 0.5), V(px, y0 + 0.75, 0.5), 0.025, steel, 6);
        rod(train, V(px, y0 + 0.75, s * 0.5), V(px - 0.35, y0 + 1.35, s * 0.5), 0.02, steel, 6);
      }
      boxE(train, px - 0.45, px - 0.25, y0 + 1.33, y0 + 1.4, -0.8, 0.8, steel, { cast: false, plain: true });
    }
    ctx.interact.clickable(train, () => ctx.audio.play('train-horn'), '电车');
    ctx.plan.movers(() => running ? [{ kind: 'vehicle' as const, x: train.position.x, z: Z, heading: running.dir > 0 ? Math.PI / 2 : -Math.PI / 2, len: TRAIN, width: 2.4 }] : []);

    // ---------------------------------------------------------------- the timetable and the crossing
    // from 5:30 to 23:50, a train every couple of minutes, one way then the other
    let running: { dir: 1 | -1; x: number } | null = null;
    let next = R(8, 30), lastDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    // it sets off out of sight, deep in the tunnel, far enough back that the whole warning — bell, then the arms —
    // runs before its nose reaches the crossing (the crossing is only a few metres from the east tunnel)
    const LEAD = SPEED * WARN + 6, GONE = BLOCK.x1 + TRAIN / 2 + 6;
    const send = (dir?: 1 | -1) => {
      if (running) return false;
      const d = dir ?? (lastDir = (lastDir * -1) as 1 | -1);
      running = { dir: d, x: d > 0 ? XING.x0 - 1 - LEAD - TRAIN / 2 : XING.x1 + 1 + LEAD + TRAIN / 2 };
      return true;
    };
    let ring = 0, bellT = 0, armT = 0, alarm = false;
    const mid = (XING.x0 + XING.x1) / 2, half = (XING.x1 - XING.x0) / 2 + 1;
    ctx.onFrame((dt, t) => {
      if (!running) {
        const h = C.hour;
        if (h >= 5.5 && h < 23.85 && (next -= dt) <= 0) { send(); next = R(80, 150); }
      }
      // where it is: in front of the crossing (seconds to go), on it, or past it
      let warn = false;
      if (running) {
        running.x += running.dir * SPEED * dt;
        const front = running.x + running.dir * TRAIN / 2, rear = running.x - running.dir * TRAIN / 2;
        const toGo = (mid - running.dir * half - front) * running.dir;
        const past = (rear - (mid + running.dir * half)) * running.dir > 0;
        warn = !past && toGo < SPEED * WARN;
        train.position.x = running.x;
        // headlights at the leading end, tail lights at the back
        const head = ctx.atmosphere.channel('head') * 1.6 + 0.4, lead = running.dir > 0 ? ends.east : ends.west, back = running.dir > 0 ? ends.west : ends.east;
        lead.head.emissiveIntensity = head; lead.tail.emissiveIntensity = 0;
        back.head.emissiveIntensity = 0; back.tail.emissiveIntensity = 1.2;
        if (running.x * running.dir > GONE) { running = null; train.position.x = -BLOCK.x1 * 2; }
      }
      if (warn && !alarm) { alarm = true; ring = 0; }
      if (!warn && alarm) alarm = false;
      ring = alarm ? ring + dt : 0;
      const wantDown = alarm && ring > ARMS_AFTER;
      armT = Math.min(1, Math.max(0, armT + (wantDown ? dt : -dt) / ARM_TIME));
      for (const a of arms) a.pivot.rotation.z = a.dir * (Math.PI / 2) * (1 - armT * armT * (3 - 2 * armT));
      blink = alarm ? Math.floor(t * 2) % 2 : 0;
      flashing = alarm;
      lampsOn[0].forEach((m) => { m.emissiveIntensity = alarm && blink === 0 ? 2.4 : 0; });
      lampsOn[1].forEach((m) => { m.emissiveIntensity = alarm && blink === 1 ? 2.4 : 0; });
      for (const a of arrows) {
        a.left.emissiveIntensity = alarm && running && running.dir < 0 ? 1.6 : 0;
        a.right.emissiveIntensity = alarm && running && running.dir > 0 ? 1.6 : 0;
      }
      if (alarm && (bellT -= dt) <= 0) { ctx.audio.play('crossing-bell'); bellT = 0.52; }
    });

    ctx.services.provide<Railway>('world.railway', {
      closed: () => alarm || armT > 0.01,
      z: Z,
      crossing: XING,
      send,
    });
  },
});
