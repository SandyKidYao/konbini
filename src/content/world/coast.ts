// The shore at the back of the model: past the coast road's promenade, a low sea wall with a pipe guard rail and a
// few steps down, a beach sloping into the water, and slow lines of foam where the waves come in. The sea is cut
// off at the edge of the model like the ground is, its cut faces a deeper blue.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { mat, box, boxE, cyl, rod, V } from '../../engine/kit/build';
import { BLOCK, SHORE } from './layout';

const SEABED = -0.9, WALL_TOP = -0.2, FAR = -36.6;

export default defineMod({
  id: 'konbini.world.coast',
  name: '海边',
  layer: 'world',
  requires: ['konbini.world.plinth', 'konbini.world.streets'],
  setup(ctx) {
    const root = ctx.root, W = BLOCK.x1 - BLOCK.x0;
    const concrete = mat('#c9c4b8', { roughness: 0.9 }), railM = mat('#e4e5e2', { roughness: 0.4, metalness: 0.3 });

    // the sea wall under the promenade's edge, its guard rail, and steps down to the sand
    boxE(root, BLOCK.x0, BLOCK.x1, SEABED, 0.15, SHORE.promenade - 0.25, SHORE.promenade, concrete, { cast: false, plain: true });
    const STEPS = { x0: -6.8, x1: -5.2 };
    const railZ = SHORE.promenade + 0.12;
    for (let x = BLOCK.x0 + 1; x < BLOCK.x1; x += 2.5) if (x < STEPS.x0 - 0.3 || x > STEPS.x1 + 0.3) cyl(root, 0.04, 0.04, 0.95, railM, x, 0.15, railZ, 8);
    for (const x of [STEPS.x0, STEPS.x1]) cyl(root, 0.04, 0.04, 0.95, railM, x, 0.15, railZ, 8);
    for (const y of [0.62, 1.05]) for (const [a, b] of [[BLOCK.x0, STEPS.x0], [STEPS.x1, BLOCK.x1]]) rod(root, V(a, y, railZ), V(b, y, railZ), 0.03, railM, 6);
    // three steps down from the promenade onto the sand
    for (let i = 0; i < 3; i++) {
      const z1 = SHORE.promenade - 0.25 - i * 0.32;
      boxE(root, STEPS.x0, STEPS.x1, SEABED, 0.15 - (i + 1) * 0.1, z1 - 0.32, z1, concrete, { plain: true });
    }

    // the beach: sloping from the foot of the wall down under the water, solid sand at the cut edges
    {
      const shape = new THREE.Shape();
      // (−z, y): the extrusion runs along x once turned
      shape.moveTo(-SHORE.promenade + 0.25, SEABED);
      shape.lineTo(-SHORE.promenade + 0.25, WALL_TOP);
      shape.lineTo(-FAR, SHORE.water - 0.3);
      shape.lineTo(-FAR, SEABED);
      shape.lineTo(-SHORE.promenade + 0.25, SEABED);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
      const sand = new THREE.Mesh(geo, mat('#e3d2a8', { roughness: 1 }));
      sand.rotation.y = Math.PI / 2;
      sand.position.x = BLOCK.x0;
      sand.receiveShadow = true;
      root.add(sand);
      ctx.plan.add({ kind: 'land', rect: { x0: BLOCK.x0, x1: BLOCK.x1, z0: SHORE.waterline, z1: SHORE.promenade }, color: '#e8d8b0' });
    }

    // the water, out to the edge; its cut faces deeper, like resin. A hair in from the sides, so the sand's cut
    // face shows below it there instead of the two fighting
    {
      const face = mat('#4a8fa8', { roughness: 0.1, metalness: 0.15, envMap: ctx.fx.envMap, envMapIntensity: 0.9 });
      const cut = mat('#2f6f86', { roughness: 0.3 });
      const sea = box(root, W - 0.04, SHORE.water - SEABED, SHORE.promenade - 0.6 - BLOCK.z0, [cut, cut, face, cut, cut, cut],
        (BLOCK.x0 + BLOCK.x1) / 2, SEABED, (SHORE.promenade - 0.6 + BLOCK.z0) / 2, { plain: true, cast: false });
      sea.userData.noSnow = true;
      ctx.plan.add({ kind: 'land', rect: { x0: BLOCK.x0, x1: BLOCK.x1, z0: BLOCK.z0, z1: SHORE.waterline }, color: '#6aa9c0' });
    }

    // foam: three thin lines along the shore, running in and drawing back, each in its own time
    const foamM = new THREE.MeshStandardMaterial({ color: '#f4f8f8', transparent: true, opacity: 0.8, roughness: 0.6, depthWrite: false });
    const foams = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.16 + i * 0.05), foamM.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.set((BLOCK.x0 + BLOCK.x1) / 2, SHORE.water + 0.01, SHORE.waterline - 0.4 - i * 1.3);
      m.userData.noSnow = true; m.userData.skyIgnore = true;
      root.add(m);
      return { m, z: m.position.z, phase: i * 2.1 };
    });
    ctx.onFrame((_dt, t, d) => {
      const swell = 0.6 + d.wind * 0.8;
      for (const f of foams) {
        const k = (Math.sin(t * 0.45 + f.phase) + 1) / 2;
        f.m.position.z = f.z + k * swell;
        (f.m.material as THREE.MeshStandardMaterial).opacity = 0.25 + 0.55 * k;
      }
    });
  },
});
