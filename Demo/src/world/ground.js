// Lots, sidewalks, curbs and road markings on top of the slab.
import * as THREE from 'three';
import { world } from '../core/stage.js';
import { box, boxE, cyl, mat } from '../core/helpers.js';
import { MAT, asphaltMat, tileMat, concreteMat, grassMat, curbMat, wheelStopMat } from '../core/materials.js';
import { roadTomareTex } from '../textures/signage.js';
import { SIDEWALKS } from './layout.js';

export function paint(x0, x1, z0, z1, m = MAT.roadPaint) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

// private land (store lot, neighbour lots), far-side verge
boxE(world, -28, 11.5, 0, 0.08, -24, 7.5, concreteMat, { uv: 3.5, cast: false, r: 0.02 });
boxE(world, 23, 28, 0, 0.08, -24, 7.5, concreteMat, { uv: 3.5, cast: false, r: 0.02 });
boxE(world, -28, 28, 0, 0.06, 19.2, 24, grassMat, { uv: 3, cast: false, r: 0.02 });
// parking asphalt
boxE(world, -7.2, 11.5, 0.08, 0.1, 0.25, 7.5, asphaltMat, { uv: 7, cast: false, plain: true });
// sidewalks + curbs
for (const [x0, x1, z0, z1] of SIDEWALKS) boxE(world, x0, x1, 0, 0.15, z0, z1, tileMat, { uv: 1.2, cast: false });
boxE(world, -28, 14, 0, 0.17, 9.8, 10, curbMat, { cast: false });
boxE(world, 13.8, 14, 0, 0.17, -24, 10, curbMat, { cast: false });
boxE(world, 21, 21.2, 0, 0.17, -24, 10, curbMat, { cast: false });
boxE(world, 21, 28, 0, 0.17, 9.8, 10, curbMat, { cast: false });
boxE(world, -28, 28, 0, 0.17, 17, 17.2, curbMat, { cast: false });

// road A centre + edge lines, road B lines, stop lines, crosswalk
for (let x = -27.5; x < 13; x += 4) paint(x, x + 2.2, 13.42, 13.58);
for (let x = 22; x < 27.8; x += 4) paint(x, Math.min(x + 2.2, 28), 13.42, 13.58);
paint(-28, 13.6, 10.35, 10.5); paint(-28, 13.6, 16.5, 16.65);
paint(21.4, 28, 10.35, 10.5); paint(21.4, 28, 16.5, 16.65);
paint(13.0, 13.4, 10.5, 13.4);
for (let z = -23.5; z < 1.5; z += 4) paint(17.42, 17.58, z, z + 2.2);
paint(14.35, 14.5, -24, 3); paint(20.5, 20.65, -24, 3);
for (let x = 14.6; x < 20.6; x += 0.9) paint(x, x + 0.45, 4.0, 7.6);
paint(17.6, 20.5, 3.0, 3.4);
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({
    map: roadTomareTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  m.rotation.set(-Math.PI / 2, 0, Math.PI);
  m.position.set(19.05, 0.013, 0.6);
  m.receiveShadow = true;
  world.add(m);
}

// parking stalls + wheel stops
for (let x = -6.6; x <= 10.5; x += 2.6) paint(x - 0.06, x + 0.06, 1.0, 6.0).position.y = 0.112;
for (let x = -5.3; x < 10; x += 2.6) box(world, 1.4, 0.13, 0.16, wheelStopMat, x, 0.1, 1.5);

// manholes
const manholeMat = mat('#4a4c50', { roughness: 0.5, metalness: 0.6 });
for (const [x, z] of [[2, 13.5], [-15, 12], [17.5, -10]]) cyl(world, 0.42, 0.42, 0.02, manholeMat, x, 0.0, z, 24, { cast: false });
