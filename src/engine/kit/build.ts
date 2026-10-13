// Modelling helpers shared by all content. Every box gets a small bevel — that soft edge highlight
// is most of what makes the scene read as a hand-made miniature.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FONT_JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
export const FONT_LATIN = '"Avenir Next","Helvetica Neue",Arial,sans-serif';

export type Vec2 = readonly [number, number];
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface PlaceOptions {
  /** world-unit texture tiling (metres per texture repeat) */
  uv?: number;
  /** bevel radius; omit for automatic */
  r?: number;
  /** skip the bevel entirely */
  plain?: boolean;
  ry?: number;
  cast?: boolean;
  recv?: boolean;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function mat(color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...o });
}

/** Box-projected UVs in world units so repeating textures keep a constant size on any box. */
export function boxMapUV(geo: THREE.BufferGeometry, unit: number) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / unit, v / unit);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Scale the UVs of one face of a plain BoxGeometry (face order +x,-x,+y,-y,+z,-z). */
export function faceUV(geo: THREE.BufferGeometry, face: number, su: number, sv: number) {
  const uv = geo.attributes.uv;
  for (let k = 0; k < 4; k++) { const i = face * 4 + k; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
  uv.needsUpdate = true;
  return geo;
}

export function planarUV(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;
  return geo;
}

export function bevelBox(w: number, h: number, d: number, r?: number): THREE.BufferGeometry {
  const radius = r ?? Math.min(0.06, Math.min(w, h, d) * 0.18);
  return radius < 0.008 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, radius);
}

/** Box with its bottom at y. */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, o: PlaceOptions = {}) {
  const geo = o.plain ? new THREE.BoxGeometry(w, h, d) : bevelBox(w, h, d, o.r);
  if (o.uv) boxMapUV(geo, o.uv);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y + h / 2, z);
  if (o.ry) mesh.rotation.y = o.ry;
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.recv ?? true;
  parent.add(mesh);
  return mesh;
}

/** Box by extents. */
export function boxE(parent: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material | THREE.Material[], o: PlaceOptions = {}) {
  return box(parent, x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, y0, (z0 + z1) / 2, o);
}

export function cyl(parent: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, seg = 16, o: PlaceOptions = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.recv ?? true;
  parent.add(mesh);
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
export function rod(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 8, cast = true) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg), m);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = cast;
  parent.add(mesh);
  return mesh;
}

/** A flat plane lying on the ground (for paint, decals). */
export function groundPlane(parent: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Vertical lettering, one glyph per line; the long-vowel mark is drawn as a bar. */
export function drawVerticalText(g: CanvasRenderingContext2D, text: string, cx: number, y0: number, step: number, size: number) {
  [...text].forEach((ch, i) => {
    const y = y0 + i * step;
    if (ch === 'ー') g.fillRect(cx - size * 0.07, y - size * 0.4, size * 0.14, size * 0.8);
    else g.fillText(ch, cx, y);
  });
}

export const smooth01 = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => smooth01(clamp01((x - e0) / (e1 - e0)));
