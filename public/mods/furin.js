// An example external mod that follows the season: glass wind chimes (風鈴) under the shop's awning.
// They are hung out for summer only (ctx.states.show), sway with the wind and ring now and then.
// Load it with  ?mods=mods/furin.js   (try ?mods=mods/furin.js&season=summer)
export default {
  id: 'example.furin',
  name: '風鈴',
  version: '1.0.0',
  layer: 'extra',
  requires: ['konbini.site.store'],

  setup(ctx) {
    const { THREE, kit } = ctx;
    const glass = kit.mat('#a8dcef', { transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
    const rim = kit.mat('#d7383b', { roughness: 0.4 });
    const fish = kit.mat('#e8463c', { roughness: 0.5 });
    const papers = ['#f3f1ea', '#9fd3e6', '#f2b8c8'].map((c) => kit.mat(c, { side: THREE.DoubleSide, roughness: 0.9 }));

    // a glass ring for each chime, played when the wind catches it
    ctx.audio.define('furin', ({ voice, env, t }) => {
      const f = 2300 + Math.random() * 500;
      for (const [mult, lvl, decay] of [[1, 0.05, 1.6], [2.76, 0.018, 0.9], [5.4, 0.008, 0.5]]) {
        const { o, g } = voice('sine', Math.random() * 0.6 - 0.3);
        o.frequency.value = f * mult;
        env(g, t, lvl, 0.003, decay);
        o.start(t); o.stop(t + decay + 0.1);
      }
    });

    const chimes = [];
    const all = new THREE.Group();
    const aw = ctx.services.get('shop')?.awning ?? { x0: -7.15, x1: 10.95, z: -4.36, y: 2.38 };
    for (const x of [-5, 3.2, 7.4]) {
      const pivot = new THREE.Group();
      // hung from the underside of the green fascia, just in front of the awning
      pivot.position.set(x, aw.y, aw.z);
      kit.cyl(pivot, 0.004, 0.004, 0.16, kit.mat('#555'), 0, -0.16, 0, 4);
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
      bell.position.y = -0.16;
      pivot.add(bell);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.008, 6, 20), rim);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = -0.176;
      pivot.add(edge);
      const goldfish = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), fish);
      goldfish.scale.set(1.6, 1, 0.4);
      goldfish.position.set(0, -0.13, 0.095);
      pivot.add(goldfish);
      // the clapper and its paper strip swing below the bell
      const strip = new THREE.Group();
      strip.position.y = -0.2;
      kit.cyl(strip, 0.003, 0.003, 0.14, kit.mat('#777'), 0, -0.14, 0, 4);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.22), papers[chimes.length % papers.length]);
      paper.position.y = -0.26;
      strip.add(paper);
      pivot.add(strip);
      all.add(pivot);
      chimes.push({ pivot, strip, phase: x });
    }
    ctx.root.add(all);

    // out for summer only — the engine pops it in and out when the date changes
    ctx.states.show(all, (c) => c.season === 'summer');

    let next = 2;
    ctx.onFrame((dt, t, d) => {
      if (!all.visible) return;
      const wind = d.wind + d.rain * 0.3;
      for (const c of chimes) {
        c.strip.rotation.z = Math.sin(t * 2.3 + c.phase) * (0.1 + wind * 0.5);
        c.strip.rotation.x = Math.sin(t * 1.7 + c.phase * 2) * (0.06 + wind * 0.3);
        c.pivot.rotation.z = Math.sin(t * 1.9 + c.phase) * (0.02 + wind * 0.08);
      }
      next -= dt * (0.3 + wind * 2);
      if (next <= 0) { next = 1.5 + Math.random() * 4; ctx.audio.play('furin'); }
    });
  },
};
