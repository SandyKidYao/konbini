// The display stand: a cut slab of ground (asphalt / gravel / soil) on a walnut plinth with a brass plate,
// plus the soft shadows that ground it on the studio floor.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { defineMod } from '../../engine/mod';
import { mat, faceUV, box } from '../../engine/kit/build';
import { materials } from '../common/materials';
import { strataTex, walnutTex, contactShadowTex } from '../common/surfaces';
import { brassPlateTex } from '../common/signage';
import { BLOCK } from './layout';

export default defineMod({
  id: 'konbini.world.plinth',
  name: '展示底座',
  layer: 'world',
  setup(ctx) {
    const W = BLOCK.x1 - BLOCK.x0, D = BLOCK.z1 - BLOCK.z0;
    const SLAB = 1.6, BASE_H = 1.9, RIM = 1.3, FOOT = 0.28;
    const FLOOR_Y = -SLAB - BASE_H;
    const root = ctx.root;

    // ground slab with strata on its cut faces
    const geo = new THREE.BoxGeometry(W, SLAB, D);
    faceUV(geo, 2, W / 7, D / 7);
    const side = (repeat: number) => {
      const m = mat('#ffffff', { map: strataTex.clone(), roughness: 0.95 });
      m.map!.repeat.set(repeat, 1); m.map!.needsUpdate = true;
      return m;
    };
    const sideLong = side(W / 14), sideShort = side(D / 14);
    const slab = new THREE.Mesh(geo, [sideShort, sideShort, materials(ctx).asphalt, mat('#5a4535'), sideLong, sideLong]);
    slab.position.set((BLOCK.x0 + BLOCK.x1) / 2, -SLAB / 2, (BLOCK.z0 + BLOCK.z1) / 2);
    slab.receiveShadow = slab.castShadow = true;
    root.add(slab);

    // walnut plinth with a dark inset foot
    walnutTex.repeat.set(2, 1);
    const topH = BASE_H - FOOT;
    const top = new THREE.Mesh(new RoundedBoxGeometry(W + RIM * 2, topH, D + RIM * 2, 4, 0.32), mat('#ffffff', { map: walnutTex, roughness: 0.45 }));
    top.position.set(slab.position.x, -SLAB - topH / 2, slab.position.z);
    top.castShadow = top.receiveShadow = true;
    root.add(top);
    box(root, W + RIM * 2 - 0.8, FOOT, D + RIM * 2 - 0.8, mat('#3b281c', { roughness: 0.6 }), slab.position.x, FLOOR_Y, slab.position.z, { r: 0.1 });

    const brass = mat('#b48d4c', { metalness: 0.9, roughness: 0.35 });
    const plate = new THREE.Mesh(new RoundedBoxGeometry(13, 0.95, 0.08, 2, 0.03),
      [brass, brass, brass, brass, mat('#ffffff', { map: brassPlateTex, metalness: 0.75, roughness: 0.32 }), brass]);
    plate.position.set(slab.position.x, -SLAB - topH / 2, BLOCK.z1 + RIM + 0.04);
    plate.castShadow = true;
    root.add(plate);

    // studio floor: a shadow catcher and a soft contact shadow
    const floorShadow = new THREE.ShadowMaterial({ opacity: 0.2, transparent: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorShadow);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    ctx.scene.add(floor);
    const contact = new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false, opacity: 0.5 });
    const c = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.45, D * 1.5), contact);
    c.rotation.x = -Math.PI / 2;
    c.position.set(slab.position.x, FLOOR_Y + 0.01, slab.position.z);
    c.renderOrder = -1;
    ctx.scene.add(c);

    // the display stand is not part of the scene: no snow settles on it
    for (const o of [top, plate]) o.userData.noSnow = true;
    root.children.forEach((o) => { if (o !== slab) o.userData.noSnow = true; });

    ctx.onFrame(() => {
      floorShadow.opacity = ctx.atmosphere.look.floorShadow;
      contact.opacity = ctx.atmosphere.look.contact;
    });
  },
});
