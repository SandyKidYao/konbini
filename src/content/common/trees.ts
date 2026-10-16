// Trees that keep the calendar, for any mod that plants one: a zelkova, a Japanese maple, a dogwood, a persimmon,
// a pine. Each kind has its own year — when it leafs out, flowers, colours and drops its leaves — and switches over
// a few seconds when the date changes. Bare branches show what is left in winter; persimmons stay on into it.
// (The street's sakura, with its falling petals, is the nature mod's own.)
import * as THREE from 'three';
import type { ModContext } from '../../engine/mod';
import { mat, cyl, rod, V, lerp } from '../../engine/kit/build';
import { between } from '../../engine/calendar';
import { mulberry32 } from '../../engine/kit/rng';

export type TreeKind = 'keyaki' | 'maple' | 'hanamizuki' | 'kaki' | 'pine';
type Phase = 'spring' | 'leaf' | 'bloom' | 'autumn' | 'fruit' | 'bare';

/** each kind's year: [phase, from, to] by season day, checked in order (the last one is the rest of the year) */
const YEAR: Record<TreeKind, [Phase, string, string][]> = {
  keyaki: [['spring', '3-25', '5-10'], ['leaf', '5-11', '10-20'], ['autumn', '10-21', '11-30'], ['bare', '12-1', '3-24']],
  maple: [['spring', '4-1', '5-15'], ['leaf', '5-16', '10-31'], ['autumn', '11-1', '12-5'], ['bare', '12-6', '3-31']],
  hanamizuki: [['bloom', '4-10', '5-5'], ['leaf', '5-6', '10-15'], ['autumn', '10-16', '11-25'], ['bare', '11-26', '4-9']],
  kaki: [['spring', '4-15', '5-31'], ['leaf', '6-1', '10-10'], ['autumn', '10-11', '11-20'], ['fruit', '11-21', '12-31'], ['bare', '1-1', '4-14']],
  pine: [['leaf', '1-1', '12-31']],
};
/** canopy colours and how full it is, by phase */
const LOOK: Record<TreeKind, Partial<Record<Phase, { colors: string[]; size: number }>>> = {
  keyaki: { spring: { colors: ['#b5d47c', '#a3c96c', '#c4dd8c'], size: 0.85 }, leaf: { colors: ['#6f9f50', '#5f9047', '#7dab5a'], size: 1 }, autumn: { colors: ['#c98a42', '#b8692f', '#d9a04e'], size: 0.85 } },
  maple: { spring: { colors: ['#a7cf6e', '#b8d97e', '#96c260'], size: 0.85 }, leaf: { colors: ['#6a9c4c', '#5c8f43', '#78a957'], size: 1 }, autumn: { colors: ['#d6452f', '#c43a2a', '#e2683a'], size: 0.95 } },
  hanamizuki: { bloom: { colors: ['#f6eaee', '#f3d6df', '#fbf3f5'], size: 0.95 }, leaf: { colors: ['#6d9a52', '#7aa75c', '#628f49'], size: 1 }, autumn: { colors: ['#b8463a', '#a63c34', '#c95a44'], size: 0.9 } },
  kaki: { spring: { colors: ['#a9cf72', '#b9da82', '#98c264'], size: 0.85 }, leaf: { colors: ['#4f8a45', '#5a9650', '#45803d'], size: 1 }, autumn: { colors: ['#d9862f', '#c96e29', '#e6a03e'], size: 0.85 } },
  pine: { leaf: { colors: ['#4d6f48', '#456641', '#56794f'], size: 1 } },
};
/** when the fruit is out */
const FRUIT: Partial<Record<TreeKind, Phase[]>> = { kaki: ['autumn', 'fruit'] };
/** trunk height and canopy shape per kind (scaled by `size`) */
const FORM: Record<TreeKind, { trunk: number; crown: (r: () => number, add: (x: number, y: number, z: number, s: number, sy: number) => void, h: number) => void }> = {
  keyaki: { trunk: 2.6, crown: (r, add, h) => { for (let i = 0; i < 9; i++) { const a = i * 0.8 + r(), d = 0.5 + (i % 3) * 0.6; add(Math.cos(a) * d, h + 0.6 + i * 0.4, Math.sin(a) * d, 1.0 + r() * 0.35, 0.85); } } },
  maple: { trunk: 1.5, crown: (r, add, h) => { for (let i = 0; i < 6; i++) { const a = i * 1.1 + r(); add(Math.cos(a) * 0.75, h + 0.4 + r() * 0.6, Math.sin(a) * 0.75, 0.75 + r() * 0.25, 0.8); } } },
  hanamizuki: { trunk: 1.4, crown: (r, add, h) => { for (let i = 0; i < 6; i++) { const a = i * 1.05 + r(); add(Math.cos(a) * 0.8, h + 0.3 + r() * 0.5, Math.sin(a) * 0.8, 0.7 + r() * 0.2, 0.75); } } },
  kaki: { trunk: 1.7, crown: (r, add, h) => { for (let i = 0; i < 7; i++) { const a = i * 0.9 + r(); add(Math.cos(a) * 0.9, h + 0.5 + r() * 0.8, Math.sin(a) * 0.9, 0.8 + r() * 0.25, 0.85); } } },
  pine: { trunk: 2.2, crown: (r, add, h) => { [[0.2, 0, 1.3], [-0.5, 0.9, 1.05], [0.4, 1.7, 0.85], [-0.1, 2.4, 0.6]].forEach(([dx, dy, s]) => add(dx, h + dy, (r() - 0.5) * 0.6, s, 0.38)); } },
};

/** Plant a tree at (x, z) under `parent`, standing on `y`; it changes with the calendar from here on. */
export function plantTree(ctx: ModContext, parent: THREE.Object3D, kind: TreeKind, x: number, z: number, o: { y?: number; size?: number; seed?: number } = {}) {
  const s = o.size ?? 1, r = mulberry32(o.seed ?? Math.round(x * 131 + z * 977 + 7));
  const g = new THREE.Group();
  g.position.set(x, o.y ?? 0.08, z);
  g.rotation.y = r() * Math.PI * 2;
  parent.add(g);
  const bark = mat(kind === 'pine' ? '#6f5b48' : '#6b5040', { roughness: 0.9 });
  const F = FORM[kind], h = F.trunk * s;
  cyl(g, 0.11 * s, 0.18 * s, h + 0.3 * s, bark, 0, 0, 0, 8);

  // the crown: a few lumps in two or three tones of the canopy
  const look = LOOK[kind], first = look[YEAR[kind][0][0]] ?? look.leaf!;
  const tones = first.colors.map((c) => mat(c, { roughness: 0.9, flatShading: true }));
  const blobs: THREE.Mesh[] = [];
  const geo = new THREE.IcosahedronGeometry(1, 1);
  F.crown(r, (bx, by, bz, bs, sy) => {
    const m = new THREE.Mesh(geo, tones[blobs.length % tones.length]);
    m.position.set(bx * s, by, bz * s); m.scale.set(bs * s, bs * s * sy, bs * s);
    m.castShadow = m.receiveShadow = true;
    m.userData.base = m.scale.clone();
    g.add(m); blobs.push(m);
  }, h);

  // branches: the tree's whole shape in winter; they reach past the crown, so they show only while it is thin
  const branches = new THREE.Group();
  g.add(branches);
  if (kind !== 'pine') {
    const top = V(0, h, 0);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + r() * 0.5, d = (0.8 + r() * 0.7) * s, end = V(Math.cos(a) * d, h + (0.9 + r() * 1.1) * s, Math.sin(a) * d);
      rod(branches, top, end, 0.05 * s, bark, 5);
      rod(branches, end, V(end.x * 1.35, end.y + 0.45 * s, end.z * 1.35), 0.025 * s, bark, 4);
    }
  }
  // fruit, for the kinds that bear it
  const fruit = new THREE.Group();
  if (FRUIT[kind]) {
    const fm = mat('#f07a1a', { roughness: 0.5 }), fg = new THREE.SphereGeometry(0.11 * s, 8, 6);
    for (let i = 0; i < 16; i++) { const a = r() * 6.3, d = (0.4 + r() * 0.9) * s; const m = new THREE.Mesh(fg, fm); m.position.set(Math.cos(a) * d, h + (0.6 + r() * 1.1) * s, Math.sin(a) * d); fruit.add(m); }
    g.add(fruit);
  }

  const phaseOf = (seasonDay: number): Phase => {
    for (const [p, a, b] of YEAR[kind]) if (between(seasonDay, a, b)) return p;
    return YEAR[kind][YEAR[kind].length - 1][0];
  };
  const ca = new THREE.Color(), cb = new THREE.Color();
  const shape = (p: Phase) => look[p] ?? { colors: first.colors, size: 0 };
  ctx.states.track<Phase>({
    pick: ({ day }) => phaseOf(day.seasonDay),
    duration: 3,
    blend: (from, to, t) => {
      const A = shape(from), B = shape(to);
      tones.forEach((m, i) => m.color.copy(ca.set(A.colors[i])).lerp(cb.set(B.colors[i]), t));
      const size = lerp(A.size, B.size, t);
      for (const b of blobs) { b.scale.copy(b.userData.base).multiplyScalar(Math.max(0.001, size)); b.visible = size > 0.01; }
      branches.visible = size < 0.6;
      fruit.visible = !!FRUIT[kind]?.includes(t < 0.5 ? from : to);
    },
  });

  // on the map: a crown in the canopy's colour of the moment, bare branches in winter
  ctx.plan.add({ kind: 'tree', circle: { x, z, r: 1.4 * s + (kind === 'keyaki' ? 0.6 * s : 0) }, h: h + 1.5 * s,
    color: () => (blobs[0].visible ? `#${tones[0].color.getHexString()}` : '#9a7d68') });
  return g;
}
