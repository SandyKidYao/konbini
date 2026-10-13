// のぼり旗 — the tall promo banners konbini staff plant out front in the morning and take in at night.
import * as THREE from 'three';
import { world } from '../core/stage.js';
import { mat, cyl, canvasTex, JP } from '../core/helpers.js';
import { onFrame } from '../core/registry.js';
import { STORE } from './layout.js';

const DESIGNS = [
  { text: 'からあげ', bg: '#e8463c', fg: '#fff6d8', band: '#ffd23f' },
  { text: '肉まん', bg: '#fbf8f0', fg: '#d7383b', band: '#d7383b' },
  { text: 'ホットコーヒー', bg: '#6e4a35', fg: '#fff3dc', band: '#f2c14e' },
];

function clothTex({ text, bg, fg, band }) {
  return canvasTex(96, 320, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = band; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...text], size = Math.min(58, 270 / chars.length);
    g.font = `800 ${size}px ${JP}`;
    chars.forEach((ch, i) => {
      const y = 24 + size * 0.55 + i * size * 0.98;
      if (ch === 'ー') g.fillRect(w / 2 - 4, y - size * 0.38, 8, size * 0.76);
      else g.fillText(ch, w / 2, y);
    });
  });
}

const poleM = mat('#f4f4f0', { roughness: 0.4 });
const baseM = mat('#2f3236', { roughness: 0.6 });

// A complete banner with its weighted base, origin at the bottom of the base
export function makeNobori(i) {
  const d = DESIGNS[i % DESIGNS.length];
  const g = new THREE.Group();
  cyl(g, 0.2, 0.24, 0.2, baseM, 0, 0, 0, 16);
  cyl(g, 0.02, 0.02, 2.65, poleM, 0, 0.2, 0, 8);
  const cloth = new THREE.Group();
  cloth.position.set(0, 0, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.85, 1, 6), mat('#ffffff', { map: clothTex(d), side: THREE.DoubleSide, roughness: 0.85 }));
  banner.position.set(0.3, 1.82, 0);
  banner.castShadow = true;
  cloth.add(banner);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), poleM);
  bar.rotation.z = Math.PI / 2; bar.position.set(0.3, 2.76, 0);
  cloth.add(bar);
  g.add(cloth);
  g.userData.cloth = cloth;
  g.userData.phase = i * 1.7;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Where the banners stand, just off the shop's apron
export const SLOTS = [
  { x: -2.4, z: 0.05, ry: 0.25 },
  { x: 5.4, z: 0.05, ry: -0.1 },
  { x: 8.1, z: 0.05, ry: -0.3 },
];
export const flags = SLOTS.map((s, i) => {
  const f = makeNobori(i);
  f.position.set(s.x, STORE.floor, s.z);
  f.rotation.y = s.ry;
  f.visible = false;
  world.add(f);
  return f;
});

const swayers = new Set(flags);
export const addSwayer = (g) => swayers.add(g);
export const removeSwayer = (g) => swayers.delete(g);
onFrame((dt, t, s) => {
  for (const f of swayers) {
    if (!f.visible) continue;
    const k = 0.06 + s.wind * 0.12 + s.rain * 0.05;
    f.userData.cloth.rotation.y = Math.sin(t * 1.4 + f.userData.phase) * k + Math.sin(t * 3.1 + f.userData.phase) * k * 0.3;
  }
});
