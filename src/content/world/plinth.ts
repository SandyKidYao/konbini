// The display stand: a cut slab of ground (asphalt / gravel / soil) on a walnut plinth with a brass plate,
// plus the soft shadows that ground it on the studio floor.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod } from '../../engine/mod';
import { mat, faceUV, box } from '../../engine/kit/build';
import { materials } from '../common/materials';
import { strataTex, walnutTex, contactShadowTex } from '../common/surfaces';
import { brassPlateTex } from '../common/signage';
import { BLOCK, SHORE } from './layout';

export default defineMod({
  id: 'konbini.world.plinth',
  name: '展示底座',
  layer: 'world',
  setup(ctx) {
    const W = BLOCK.x1 - BLOCK.x0, D = BLOCK.z1 - BLOCK.z0, CZ = (BLOCK.z0 + BLOCK.z1) / 2;
    const SLAB = 1.6, BASE_H = 1.9, RIM = 1.3, FOOT = 0.28;
    const FLOOR_Y = -SLAB - BASE_H;
    const root = ctx.root;

    // ground slab with strata on its cut faces; from the promenade out it steps down, under the beach and the
    // sea (the coast mod fills that with sand and water, their own cut faces at the edge)
    const side = (repeat: number, h = 1) => {
      const m = mat('#ffffff', { map: strataTex.clone(), roughness: 0.95 });
      m.map!.repeat.set(repeat, h); m.map!.needsUpdate = true;
      return m;
    };
    const SEABED = 0.9, LAND_D = BLOCK.z1 - SHORE.promenade, SEA_D = SHORE.promenade - BLOCK.z0;
    const geo = new THREE.BoxGeometry(W, SLAB, LAND_D);
    faceUV(geo, 2, W / 7, LAND_D / 7);
    const sideLong = side(W / 14), sideShort = side(LAND_D / 14);
    const slab = new THREE.Mesh(geo, [sideShort, sideShort, materials(ctx).asphalt, mat('#5a4535'), sideLong, sideLong]);
    slab.position.set((BLOCK.x0 + BLOCK.x1) / 2, -SLAB / 2, SHORE.promenade + LAND_D / 2);
    slab.receiveShadow = slab.castShadow = true;
    root.add(slab);
    const bedH = SLAB - SEABED, seaSide = side(SEA_D / 14, bedH / SLAB), seaLong = side(W / 14, bedH / SLAB);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W, bedH, SEA_D), [seaSide, seaSide, mat('#8f7f68', { roughness: 1 }), mat('#5a4535'), seaLong, seaLong]);
    bed.position.set(slab.position.x, -SLAB + bedH / 2, BLOCK.z0 + SEA_D / 2);
    bed.receiveShadow = bed.castShadow = true;
    root.add(bed);

    // walnut plinth with a dark inset foot
    walnutTex.repeat.set(2, 1);
    const topH = BASE_H - FOOT;
    const top = new THREE.Mesh(new RoundedBoxGeometry(W + RIM * 2, topH, D + RIM * 2, 4, 0.32), mat('#ffffff', { map: walnutTex, roughness: 0.45 }));
    top.position.set(slab.position.x, -SLAB - topH / 2, CZ);
    top.castShadow = top.receiveShadow = true;
    root.add(top);
    box(root, W + RIM * 2 - 0.8, FOOT, D + RIM * 2 - 0.8, mat('#3b281c', { roughness: 0.6 }), slab.position.x, FLOOR_Y, CZ, { r: 0.1 });

    const brass = mat('#b48d4c', { metalness: 0.9, roughness: 0.35 });
    const plate = new THREE.Mesh(new RoundedBoxGeometry(13, 0.95, 0.08, 2, 0.03),
      [brass, brass, brass, brass, mat('#ffffff', { map: brassPlateTex, metalness: 0.75, roughness: 0.32 }), brass]);
    plate.position.set(slab.position.x, -SLAB - topH / 2, BLOCK.z1 + RIM + 0.04);
    plate.castShadow = true;
    root.add(plate);

    // the display stand is not part of the scene: no snow settles on it
    for (const o of [top, plate]) o.userData.noSnow = true;
    root.children.forEach((o) => { if (o !== slab && o !== bed) o.userData.noSnow = true; });

    // studio floor: a shadow catcher and a soft contact shadow (on a transparent window the desk is the floor; the pet
    // can bring the sky back, and the floor with it)
    const floorShadow = new THREE.ShadowMaterial({ opacity: 0.2, transparent: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorShadow);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    ctx.scene.add(floor);
    const contact = new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false, opacity: 0.5 });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.45, D * 1.5), contact);
    c.rotation.x = -Math.PI / 2;
    c.position.set(slab.position.x, FLOOR_Y + 0.01, CZ);
    c.renderOrder = -1;
    ctx.scene.add(c);

    ctx.onFrame(() => {
      floor.visible = c.visible = !ctx.fx.transparent;
      floorShadow.opacity = ctx.atmosphere.look.floorShadow;
      contact.opacity = ctx.atmosphere.look.contact;
    });
  },
});
