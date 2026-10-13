// Where the のぼり旗 stand in front of the shop, and whether each is out. Staff events move them;
// this mod only owns the slots and the banners standing in them.
import { defineMod } from '../../../engine/mod';
import { STORE, type BannerService } from './api';

const SLOTS = [
  { x: -2.4, z: 0.05, ry: 0.25 },
  { x: 5.4, z: 0.05, ry: -0.1 },
  { x: 8.1, z: 0.05, ry: -0.3 },
];

export default defineMod({
  id: 'konbini.site.banners',
  name: '宣传旗位',
  layer: 'site',
  site: 'konbini',
  requires: ['konbini.library', 'konbini.site.store'],
  setup(ctx) {
    const flags = SLOTS.map((s, i) => {
      const f = ctx.prefabs.create('nobori', { design: i });
      f.root.position.set(s.x, STORE.floor, s.z);
      f.root.rotation.y = s.ry;
      f.root.visible = false;
      ctx.root.add(f.root);
      return f;
    });
    ctx.onFrame((_dt, t, d) => { for (const f of flags) if (f.root.visible) f.update(t, d.wind + d.rain * 0.4 + d.thunder * 0.4); });

    // staff stand on the apron just behind each slot; the apron connects to the shop door
    const ids = SLOTS.map((s, i) => ctx.nav.addNode(`shop.banner.${i}`, s.x, -0.6, { heading: 0 }));
    const byX = [...ids.map((id, i) => ({ id, x: SLOTS[i].x })), { id: 'shop.door.out', x: 1.0 }].sort((a, b) => a.x - b.x);
    ctx.nav.addPath(byX.map((n) => n.id));

    ctx.services.provide<BannerService>('shop.banners', {
      count: SLOTS.length,
      isOut: (i) => flags[i].root.visible,
      set: (i, out) => { flags[i].root.visible = out; },
      standNode: (i) => ids[i],
      slot: (i) => ({ x: SLOTS[i].x, z: SLOTS[i].z }),
    });
  },
});
