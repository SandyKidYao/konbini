// Reusable props. Each returns a small handle with a `root` plus whatever behaviour it offers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ModContext } from '../../engine/mod';
import { mat, box, cyl, rod, V, canvasTex, FONT_JP, drawVerticalText } from '../../engine/kit/build';
import { pickR, R } from '../../engine/kit/rng';
import { PROD_COLORS } from '../common/palette';
import { vendTex } from '../common/signage';
import { fanTex } from '../common/surfaces';
import { materials } from '../common/materials';

// ------------------------------------------------------------------ のぼり旗 (promo banner)
const NOBORI_DESIGNS = [
  { text: 'からあげ', bg: '#e8463c', fg: '#fff6d8', band: '#ffd23f' },
  { text: '肉まん', bg: '#fbf8f0', fg: '#d7383b', band: '#d7383b' },
  { text: 'ホットコーヒー', bg: '#6e4a35', fg: '#fff3dc', band: '#f2c14e' },
];
const clothTexCache = new Map<number, THREE.Texture>();
function clothTex(i: number) {
  if (!clothTexCache.has(i)) {
    const { text, bg, fg, band } = NOBORI_DESIGNS[i % NOBORI_DESIGNS.length];
    clothTexCache.set(i, canvasTex(96, 320, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = band; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const size = Math.min(58, 270 / [...text].length);
      g.font = `800 ${size}px ${FONT_JP}`;
      drawVerticalText(g, text, w / 2, 24 + size * 0.55, size * 0.98, size);
    }));
  }
  return clothTexCache.get(i)!;
}
export interface Nobori { root: THREE.Group; update(t: number, wind: number): void }
export function nobori(_ctx: ModContext, { design = 0 }: { design?: number }): Nobori {
  const root = new THREE.Group();
  const poleM = mat('#f4f4f0', { roughness: 0.4 });
  cyl(root, 0.2, 0.24, 0.2, mat('#2f3236', { roughness: 0.6 }), 0, 0, 0, 16);
  cyl(root, 0.02, 0.02, 2.65, poleM, 0, 0.2, 0, 8);
  const cloth = new THREE.Group();
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.85, 1, 6), mat('#ffffff', { map: clothTex(design), side: THREE.DoubleSide, roughness: 0.85 }));
  banner.position.set(0.3, 1.82, 0);
  banner.castShadow = true;
  cloth.add(banner);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), poleM);
  bar.rotation.z = Math.PI / 2; bar.position.set(0.3, 2.76, 0);
  cloth.add(bar);
  root.add(cloth);
  const phase = design * 1.7 + Math.random();
  return {
    root,
    update(t, wind) {
      const k = 0.06 + wind * 0.12;
      cloth.rotation.y = Math.sin(t * 1.4 + phase) * k + Math.sin(t * 3.1 + phase) * k * 0.3;
    },
  };
}

// ------------------------------------------------------------------ vending machine
export interface VendingMachine { root: THREE.Group; dispense(): void }
export function vendingMachine(ctx: ModContext, o: { body?: string; accent?: string; seed?: number; label?: string }): VendingMachine {
  const { body = '#e04a45', accent = '#a8262a', seed = 11, label = '自动贩卖机' } = o;
  const root = new THREE.Group();
  const front = ctx.glow.add(new THREE.MeshStandardMaterial({ map: vendTex(body, accent, false, seed), emissiveMap: vendTex(body, accent, true, seed), emissive: '#ffffff', roughness: 0.35 }), 'vending');
  const bm = mat(body, { roughness: 0.35, metalness: 0.1 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(1.0, 1.83, 0.75, 2, 0.05), [bm, bm, bm, bm, front, bm]);
  m.position.y = 0.05 + 0.915; m.castShadow = m.receiveShadow = true;
  root.add(m);
  box(root, 1.0, 0.05, 0.75, materials(ctx).darkMetal, 0, 0, 0);
  // a can drops into the tray, then fades
  const canGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.2, 14);
  const cans: { mesh: THREE.Mesh; vy: number; life: number }[] = [];
  ctx.onFrame((dt) => {
    for (let i = cans.length - 1; i >= 0; i--) {
      const k = cans[i];
      k.life += dt;
      if (k.mesh.position.y > 0.2) { k.vy -= 9.8 * dt; k.mesh.position.y = Math.max(0.2, k.mesh.position.y + k.vy * dt); }
      if (k.life > 3) k.mesh.scale.setScalar(Math.max(0.001, 1 - (k.life - 3) * 2));
      if (k.life > 3.5) { root.remove(k.mesh); (k.mesh.material as THREE.Material).dispose(); cans.splice(i, 1); }
    }
  });
  const dispense = () => {
    ctx.glow.flash(front, 1.6);
    const c = new THREE.Mesh(canGeo, mat(pickR(PROD_COLORS), { roughness: 0.3, metalness: 0.4 }));
    c.rotation.z = Math.PI / 2;
    c.position.set(R(-0.15, 0.15), 1.05, 0.4);
    c.castShadow = true;
    root.add(c);
    cans.push({ mesh: c, vy: 0, life: 0 });
    ctx.audio.play('clunk');
  };
  ctx.interact.clickable(root, dispense, label);
  return { root, dispense };
}

// ------------------------------------------------------------------ bicycle (mamachari)
export function bicycle(ctx: ModContext, { color = '#eef3f5' }: { color?: string }) {
  const M = materials(ctx);
  const g = new THREE.Group();
  const fm = mat(color, { roughness: 0.35, metalness: 0.3 });
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.03, 8, 28);
  const spokeM = mat('#a6acb2', { transparent: true, opacity: 0.35, metalness: 0.8, roughness: 0.3 });
  for (const x of [-0.52, 0.52]) {
    const w = new THREE.Mesh(wheelGeo, M.rubber); w.position.set(x, 0.36, 0); w.castShadow = true; g.add(w);
    const sp = new THREE.Mesh(new THREE.CircleGeometry(0.31, 16), spokeM); sp.position.set(x, 0.36, 0); g.add(sp);
  }
  const bb = V(-0.02, 0.36, 0), seat = V(-0.2, 0.92, 0), head = V(0.36, 0.9, 0);
  rod(g, bb, seat, 0.024, fm); rod(g, bb, V(0.4, 0.72, 0), 0.028, fm); rod(g, bb, V(-0.52, 0.36, 0), 0.02, fm);
  rod(g, V(-0.18, 0.82, 0), V(-0.52, 0.36, 0), 0.018, fm); rod(g, head, V(0.52, 0.36, 0), 0.022, M.chrome);
  rod(g, head, V(0.33, 1.06, 0), 0.022, M.chrome);
  rod(g, V(0.28, 1.06, -0.3), V(0.28, 1.06, 0.3), 0.018, M.chrome);
  box(g, 0.26, 0.07, 0.15, M.rubber, -0.21, 0.93, 0);
  box(g, 0.36, 0.24, 0.32, mat('#8a9096', { metalness: 0.5, roughness: 0.4 }), 0.66, 0.8, 0);
  box(g, 0.42, 0.03, 0.17, M.chrome, -0.45, 0.76, 0, { plain: true });
  box(g, 0.5, 0.12, 0.03, fm, -0.27, 0.32, 0.06, { plain: true });
  return { root: g };
}

// ------------------------------------------------------------------ outdoor AC unit
export function acUnit(ctx: ModContext, _o: object) {
  const g = new THREE.Group();
  const body = mat('#e2e2dc', { roughness: 0.6 });
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.68, 0.34, 2, 0.04), [body, body, body, body, mat('#fff', { map: fanTex, roughness: 0.6 }), body]);
  m.position.y = 0.44; m.castShadow = m.receiveShadow = true; g.add(m);
  box(g, 0.8, 0.1, 0.4, materials(ctx).darkMetal, 0, 0, 0);
  return { root: g };
}

// ------------------------------------------------------------------ traffic cone
export function trafficCone(ctx: ModContext, _o: object) {
  const g = new THREE.Group();
  box(g, 0.42, 0.04, 0.42, mat('#33302c'), 0, 0, 0);
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 16), mat('#ff6a2a', { roughness: 0.5 }));
  c.position.y = 0.39; c.castShadow = true; g.add(c);
  cyl(g, 0.105, 0.125, 0.12, ctx.glow.add(mat('#ffffff', { emissive: '#ffffff' }), 'lamp', 0.12), 0, 0.3, 0, 16, { cast: false });
  return { root: g };
}
