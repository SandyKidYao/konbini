// An example external mod: a string of paper lanterns (提灯) under the shop's awning.
// It imports nothing — everything it needs arrives through the context passed to setup().
// Load it with  ?mods=mods/chochin.js
export default {
  id: 'example.chochin',
  name: '提灯',
  version: '1.0.0',
  layer: 'extra',
  requires: ['konbini.site.store'],

  setup(ctx) {
    const { THREE, kit } = ctx;
    const paper = kit.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#f7efe4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c23a2e'; g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18);
      g.fillStyle = '#2a2a2a'; g.font = `700 54px ${kit.FONT_JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('祭', w / 2, h / 2 + 2);
    });
    const body = ctx.glow.add(kit.mat('#ffffff', { map: paper, emissiveMap: paper, emissive: '#ffb06a', roughness: 0.8 }), 'lamp', 0.9);
    const cap = kit.mat('#2a2a2a', { roughness: 0.6 });
    const string = kit.mat('#3a3a3a');

    // hang them from the front edge of the shop's awning, wherever the shop puts it
    const aw = ctx.services.get('shop')?.awning ?? { x0: -7.15, x1: 10.95, z: -4.36, y: 2.38 };
    const lanterns = [];
    for (let i = 0; i < 9; i++) {
      const x = -6 + i * 2;
      const pivot = new THREE.Group();
      pivot.position.set(x, aw.y - 0.02, aw.z + 0.08);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), body);
      l.scale.set(1, 1.35, 1);
      l.position.y = -0.38;
      l.castShadow = true;
      pivot.add(l);
      kit.cyl(pivot, 0.1, 0.1, 0.05, cap, 0, -0.14, 0, 12);
      kit.cyl(pivot, 0.1, 0.1, 0.05, cap, 0, -0.67, 0, 12);
      kit.cyl(pivot, 0.006, 0.006, 0.12, string, 0, -0.12, 0, 4);
      ctx.root.add(pivot);
      lanterns.push({ pivot, phase: i * 0.7 });
    }
    // a soft warm light in the middle of the string, on at dusk and night
    const light = new THREE.PointLight('#ffb36b', 0, 7, 2);
    light.position.set(2, 1.9, aw.z + 0.46);
    ctx.root.add(light);

    ctx.onFrame((dt, t, d) => {
      light.intensity = ctx.atmosphere.channel('lamp') * 2;
      for (const { pivot, phase } of lanterns) {
        pivot.rotation.z = Math.sin(t * 1.6 + phase) * (0.04 + d.wind * 0.08);
        pivot.rotation.x = Math.sin(t * 1.1 + phase * 1.3) * (0.02 + d.wind * 0.05);
      }
    });
  },
};
