// Street furniture: utility poles and wires, street lamps, the traffic and pedestrian signals,
// the street-name plate, signs and the curve mirror. Offers the 'world.signals' service.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, cyl, rod, V, planarUV } from '../../engine/kit/build';
import { materials } from '../common/materials';
import { poleStripeTex } from '../common/surfaces';
import { pedTex, streetSignTex, noParkTex, stopSignTex } from '../common/signage';

export type Aspect = 'g' | 'y' | 'r';
export interface Signals {
  /** aspect shown to cars on road A */
  vehicle(t: number): Aspect;
  /** the green man for the crossing over road B ('flash' = finish crossing, don't start) */
  ped(t: number): 'g' | 'flash' | 'r';
}

const CYCLE = 22;
const signals: Signals = {
  vehicle(t) { const c = t % CYCLE; return c < 10 ? 'g' : c < 13 ? 'y' : 'r'; },
  ped(t) { const c = t % CYCLE; return c < 6.5 ? 'g' : c < 10 ? 'flash' : 'r'; },
};

export default defineMod({
  id: 'konbini.world.furniture',
  name: '街道设施',
  layer: 'world',
  setup(ctx) {
    const M = materials(ctx), root = ctx.root;
    ctx.services.provide<Signals>('world.signals', signals);

    // ------------------------------------------------ utility poles and wires
    poleStripeTex.repeat.set(3, 3);
    const stripe = mat('#ffffff', { map: poleStripeTex, roughness: 0.6 });
    const insM = mat('#ecece7', { roughness: 0.3 });
    function pole(x: number, z: number, armAxis: 'x' | 'z') {
      const g = new THREE.Group();
      cyl(g, 0.14, 0.2, 10.2, M.pole, 0, 0, 0, 16);
      cyl(g, 0.215, 0.215, 1.8, stripe, 0, 0.1, 0, 16, { cast: false });
      if (armAxis === 'z') box(g, 0.12, 0.12, 1.9, M.darkMetal, 0, 9.0, 0); else box(g, 1.9, 0.12, 0.12, M.darkMetal, 0, 9.0, 0);
      const pts: THREE.Vector3[] = [];
      for (const o of [-0.8, 0, 0.8]) {
        const ix = armAxis === 'z' ? 0 : o, iz = armAxis === 'z' ? o : 0;
        cyl(g, 0.05, 0.06, 0.16, insM, ix, 9.12, iz, 8);
        pts.push(V(x + ix, 9.28, z + iz));
      }
      for (let y = 2.6; y < 8.6; y += 0.45) {
        const s = Math.round(y / 0.45) % 2 ? 1 : -1;
        rod(g, armAxis === 'z' ? V(s * 0.17, y, 0) : V(0, y, s * 0.17), armAxis === 'z' ? V(s * 0.36, y, 0) : V(0, y, s * 0.36), 0.015, M.darkMetal, 4, false);
      }
      box(g, 0.24, 0.55, 0.03, mat('#f4f4f0'), 0, 2.2, 0.2, { cast: false, plain: true });
      g.position.set(x, 0.15, z);
      root.add(g);
      return { g, pts, low: V(x, 6.9, z) };
    }
    const P1 = pole(-13, 8.8, 'z'), P2 = pole(12.9, 8.9, 'x'), P3 = pole(12.9, -9, 'x');
    cyl(P1.g, 0.36, 0.36, 1.1, mat('#b3b8bd', { roughness: 0.5, metalness: 0.3 }), 0, 6.4, -0.45, 16);
    box(P3.g, 0.5, 0.7, 0.3, mat('#9ea3a9'), 0, 5.6, 0.3);
    box(P2.g, 0.12, 0.12, 1.9, M.darkMetal, 0, 8.55, 0);

    const wire = (a: THREE.Vector3, b: THREE.Vector3, sag = 0.6, r = 0.022) => {
      const mid = a.clone().lerp(b, 0.5); mid.y -= sag;
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, r, 5), M.wire);
      m.castShadow = true;
      root.add(m);
    };
    const wireSet = (A: THREE.Vector3[], B: THREE.Vector3[], sag: number) => { for (let i = 0; i < 3; i++) wire(A[i], B[i], sag); };
    const P2z = [V(12.9, 8.83, 8.1), V(12.9, 8.83, 8.9), V(12.9, 8.83, 9.7)];
    wireSet(P1.pts, P2z, 0.9);
    wireSet(P1.pts, P1.pts.map((p) => p.clone().setX(-28)), 0.5);
    wireSet(P2.pts, P3.pts, 0.7);
    wireSet(P3.pts, P3.pts.map((p) => p.clone().setZ(-24)), 0.6);
    wireSet(P2z, P2z.map((p) => p.clone().setX(28)), 0.9);
    wire(P1.low, P2.low, 0.8, 0.045); wire(P2.low, P3.low, 0.7, 0.045);
    wire(P1.low, P1.low.clone().setX(-28), 0.4, 0.045);
    wire(P3.low, P3.low.clone().setZ(-24), 0.4, 0.045);
    wire(V(12.9, 6.6, 8.9), V(9.0, 4.4, -3.0), 0.5, 0.018);
    wire(P1.low, V(-15.5, 5.2, -1), 0.4, 0.018);

    // ------------------------------------------------ street lamps (warm, cosier than cold LED in a miniature)
    const lamps: THREE.SpotLight[] = [];
    const lens = ctx.glow.add(mat('#ffffff', { emissive: '#ffe9c4' }), 'lamp', 2.5);
    function streetLamp(p: { g: THREE.Group }, dir: THREE.Vector3) {
      const base = p.g.position;
      const b = V(base.x + dir.x * 1.7, 7.55, base.z + dir.z * 1.7);
      rod(root, V(base.x, 7.2, base.z), b, 0.05, M.pole);
      const head = new THREE.Group();
      box(head, 0.75, 0.14, 0.34, M.frame, 0, 0, 0);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.26), lens);
      l.position.y = -0.01; head.add(l);
      head.position.set(b.x + dir.x * 0.25, b.y - 0.05, b.z + dir.z * 0.25);
      head.rotation.y = Math.atan2(-dir.z, dir.x);
      root.add(head);
      const spot = new THREE.SpotLight('#ffd9a8', 0, 34, 1.0, 0.65, 1.4);
      spot.position.copy(head.position).add(V(0, -0.1, 0));
      spot.target.position.set(head.position.x + dir.x * 1.5, 0, head.position.z + dir.z * 1.5);
      root.add(spot, spot.target);
      lamps.push(spot);
      return spot;
    }
    const lampA = streetLamp(P2, V(0, 0, 1));
    lampA.castShadow = true;
    lampA.shadow.mapSize.set(1024, 1024);
    lampA.shadow.bias = -0.0005;
    streetLamp(P1, V(0, 0, 1));
    streetLamp(P3, V(1, 0, 0));
    ctx.onFrame(() => { const v = ctx.atmosphere.channel('lamp') * 36; for (const l of lamps) l.intensity = v; });

    // ------------------------------------------------ traffic + pedestrian signals
    const veh: Record<Aspect, THREE.MeshStandardMaterial[]> = { g: [], y: [], r: [] };
    const ped: Record<'g' | 'r', THREE.MeshStandardMaterial[]> = { g: [], r: [] };
    const housing = mat('#3a3f46', { roughness: 0.5 });
    function vehicleSignal(x: number, y: number, z: number, ry: number) {
      const g = new THREE.Group();
      box(g, 1.3, 0.42, 0.32, housing, 0, -0.21, 0);
      ([['#1d4a3b', '#2bffbf', 'g'], ['#4a3d1a', '#ffb000', 'y'], ['#4a1a1a', '#ff3a2a', 'r']] as const).forEach(([off, on, k], i) => {
        const m = mat(off, { emissive: on, emissiveIntensity: 0, roughness: 0.3 });
        veh[k].push(m);
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 20), m);
        lamp.rotation.x = Math.PI / 2; lamp.position.set(-0.42 + i * 0.42, 0, 0.17); g.add(lamp);
        const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 20, 1, true, -Math.PI / 2, Math.PI), M.darkMetal);
        hood.rotation.x = Math.PI / 2; hood.position.set(-0.42 + i * 0.42, 0.01, 0.27); g.add(hood);
      });
      g.position.set(x, y, z); g.rotation.y = ry;
      root.add(g);
    }
    function pedSignal(x: number, y: number, z: number, ry: number) {
      const g = new THREE.Group();
      box(g, 0.42, 0.86, 0.24, housing, 0, -0.43, 0);
      ([['#ff3a3a', false, 'r', 0.2], ['#2bffbf', true, 'g', -0.2]] as const).forEach(([c, walking, k, oy]) => {
        const t = pedTex(c, walking);
        const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0, color: '#555' });
        ped[k].push(m);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), m);
        p.position.set(0, oy, 0.125); g.add(p);
      });
      g.position.set(x, y, z); g.rotation.y = ry;
      root.add(g);
    }
    const pm = mat('#b5b7ba', { roughness: 0.5, metalness: 0.3 });
    cyl(root, 0.11, 0.13, 6.0, pm, 21.9, 0.15, 9.4, 14);
    rod(root, V(21.9, 5.7, 9.4), V(21.9, 5.7, 12.4), 0.06, pm);
    vehicleSignal(21.9, 5.95, 11.85, -Math.PI / 2);
    pedSignal(21.75, 3.3, 9.4, -Math.PI / 2);
    pedSignal(13.1, 3.3, 8.9, Math.PI / 2);
    ctx.onFrame((_dt, t) => {
      const on = ctx.atmosphere.channel('signal');
      const v = signals.vehicle(t), p = signals.ped(t);
      const pv = p === 'flash' ? (Math.floor(t * 4) % 2 === 0 ? 'g' : 'off') : p;
      for (const k of ['g', 'y', 'r'] as const) for (const m of veh[k]) m.emissiveIntensity = k === v ? on : 0;
      for (const k of ['g', 'r'] as const) for (const m of ped[k]) m.emissiveIntensity = k === pv ? on * 0.9 : 0;
    });

    // ------------------------------------------------ signs and the curve mirror
    const face = new THREE.MeshStandardMaterial({ map: streetSignTex, roughness: 0.4 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.48, 0.04), [M.white, M.white, M.white, M.white, face, M.white]);
    plate.position.set(12.05, 2.75, 9.14); plate.castShadow = true;
    root.add(plate);
    rod(root, V(12.9, 2.95, 9.05), V(12.3, 2.95, 9.05), 0.02, M.chrome);

    const om = mat('#ee7a35', { roughness: 0.45 });
    cyl(root, 0.055, 0.055, 2.9, om, 11.95, 0.15, 9.5, 12);
    const mirror = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.02, envMap: ctx.fx.envMap }));
    glass.position.z = 0.03; mirror.add(glass);
    mirror.add(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 10, 32), om));
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 32), om); back.rotation.x = Math.PI / 2; mirror.add(back);
    mirror.traverse((o) => { o.castShadow = true; });
    mirror.position.set(11.95, 3.25, 9.55); mirror.rotation.y = Math.PI * 0.25;
    root.add(mirror);

    const signPost = (x: number, z: number, ry: number, geo: THREE.BufferGeometry, tex: THREE.Texture, h = 2.4) => {
      cyl(root, 0.035, 0.035, h, M.chrome, x, 0.15, z, 8);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, side: THREE.DoubleSide }));
      m.position.set(x, h, z); m.rotation.y = ry; m.castShadow = true;
      root.add(m);
    };
    signPost(12.0, -1.6, Math.PI / 2, new THREE.CircleGeometry(0.32, 32), noParkTex);
    const tri = new THREE.CircleGeometry(0.55, 3); tri.rotateZ(-Math.PI / 2); planarUV(tri);
    signPost(22.1, 2.2, Math.PI, tri, stopSignTex, 2.2);
  },
});
