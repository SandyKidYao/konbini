import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
export const LATIN = '"Avenir Next","Helvetica Neue",Arial,sans-serif';
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...o });
}

// Box-projected UVs in world units, so repeating textures keep a constant size on any box (rounded or not)
export function boxMapUV(geo, unit) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / unit, v / unit);
  }
  uv.needsUpdate = true;
  return geo;
}

// Scale one face of a plain BoxGeometry (face order +x,-x,+y,-y,+z,-z)
export function faceUV(geo, face, su, sv) {
  const uv = geo.attributes.uv;
  for (let k = 0; k < 4; k++) { const i = face * 4 + k; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
  uv.needsUpdate = true;
  return geo;
}

export function planarUV(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;
  return geo;
}

// Every modelled edge gets a small bevel — that soft highlight is most of what reads as "miniature model"
export function bevelBox(w, h, d, r) {
  const radius = r ?? Math.min(0.06, Math.min(w, h, d) * 0.18);
  return radius < 0.008 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, radius);
}

// box with its bottom at y
export function box(parent, w, h, d, m, x, y, z, o = {}) {
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

// box by extents
export function boxE(parent, x0, x1, y0, y1, z0, z1, m, o = {}) {
  return box(parent, x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, y0, (z0 + z1) / 2, o);
}

export function cyl(parent, rt, rb, h, m, x, y, z, seg = 16, o = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.recv ?? true;
  parent.add(mesh);
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);
export function rod(parent, a, b, r, m, seg = 8, cast = true) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg), m);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = cast;
  parent.add(mesh);
  return mesh;
}

export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
