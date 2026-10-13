// Life on the street: passers-by (some walking a shiba), tourists taking photos of the shop,
// and a taxi that circles road A and stops for red lights.
import * as THREE from 'three';
import { defineMod, type SitePlot } from '../../engine/mod';
import { R } from '../../engine/kit/rng';
import type { Actor } from '../../engine/agents/actor';
import type { Signals } from '../world/furniture';
import { citizen, twoEnds } from './people';

const PI = Math.PI;

export const passersbyMod = defineMod({
  id: 'konbini.events.passersby',
  name: '路人与遛狗',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    const S = ctx.steps;

    function walkDog(a: Actor) {
      const dog = ctx.prefabs.create('dog', {});
      ctx.root.add(dog.root);
      const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#b5463c' }));
      leash.frustumCulled = false;
      ctx.root.add(leash);
      a.speed *= 0.9;
      const fig = a.walker as import('../library/figure').Figure;
      const hand = new THREE.Vector3(), collar = new THREE.Vector3(), want = new THREE.Vector3();
      a.followers.push((x, dt, t) => {
        const p = x.position, h = x.heading;
        // the dog trots a little ahead and to the owner's left
        want.set(p.x + Math.sin(h) * 0.75 + Math.cos(h) * 0.4, p.y, p.z + Math.cos(h) * 0.75 - Math.sin(h) * 0.4);
        dog.root.position.lerp(want, Math.min(1, dt * 5));
        dog.root.rotation.y = h;
        dog.update(dt, t, x.walker.moving, x.speed, x.walker.visibleScale);
        fig.arms[1].hold.getWorldPosition(hand);
        dog.head.getWorldPosition(collar); collar.y -= 0.08;
        leash.geometry.setFromPoints([hand, collar]);
        leash.visible = x.walker.visibleScale > 0.5;
      });
      a.onDispose = () => { ctx.root.remove(dog.root, leash); leash.geometry.dispose(); };
    }

    ctx.director.define({
      id: 'passerby',
      weight: ({ drivers: d }) => (0.5 + 0.8 * d.daylight) * (1 - 0.6 * d.thunder) * (1 - 0.3 * d.snow),
      run({ drivers: d }) {
        if (Math.random() < 0.3) {
          const far = ctx.nav.tagged('far');
          if (far.length >= 2) {
            const [from, to] = Math.random() < 0.5 ? [far[0], far[1]] : [far[1], far[0]];
            return ctx.director.spawn(citizen(ctx, d), { at: from.id }).then(S.go(to.id));
          }
        }
        const [from, to] = twoEnds(ctx);
        const a = ctx.director.spawn(citizen(ctx, d), { at: from });
        a.then(S.go(to));
        if (d.rain < 0.3 && d.snow < 0.5 && d.fog < 0.6 && d.daylight > 0.5 && Math.random() < 0.35) walkDog(a);
        return a;
      },
    });
  },
});

export const touristsMod = defineMod({
  id: 'konbini.events.tourists',
  name: '游客拍照',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    const S = ctx.steps;
    const flash = new THREE.PointLight('#ffffff', 0, 9, 2);
    ctx.root.add(flash);
    let f = 0;
    ctx.onFrame((dt) => { f = Math.max(0, f - dt * 9); flash.intensity = f * 40; });

    ctx.director.define({
      id: 'tourists',
      max: 1,
      needs: { services: ['world.plot', 'shop'] },
      weight: ({ drivers: d }) => (d.rain > 0.3 || d.snow > 0.5 || d.fog > 0.5 || d.thunder > 0.2 ? 0 : 0.45 * d.daylight * (1 - d.cloud * 0.4)),
      run() {
        const plot = ctx.services.require<SitePlot>('world.plot');
        const front = ctx.nav.node(plot.entrance)!;
        const [from, to] = twoEnds(ctx);
        const spotX = front.x + R(0.1, 1.1), standZ = front.z - 0.45;
        const shared = { ready: false, done: false, back: false };
        const shooter = ctx.director.spawn(ctx.prefabs.create('figure', { kind: 'tourist' }), { at: from, label: '游客' });
        const model = ctx.director.spawn(ctx.prefabs.create('figure', { kind: 'tourist', longHair: Math.random() < 0.6 }), { at: from, label: '游客' });
        model.speed = shooter.speed;
        model.lane = -shooter.lane;
        const shooterFig = shooter.walker as import('../library/figure').Figure;

        shooter.then(S.go(plot.entrance), S.walk([[spotX, standZ]]), S.face(PI), S.run(() => shooterFig.hold('camera')), S.until(() => shared.ready));
        for (let i = 0; i < 3; i++) {
          shooter.then(S.pose('photo', 0.9), S.run((a) => {
            flash.position.set(a.position.x, 1.6, a.position.z - 0.4);
            f = 1;
            ctx.audio.play('shutter');
          }), S.wait(R(0.4, 0.8)));
        }
        shooter.then(S.run(() => { shared.done = true; }), S.until(() => shared.back), S.go(to));

        model.then(
          S.go(plot.entrance),
          S.walk([[spotX + 0.4, 7.2], [spotX + 0.6, 0.75]]), S.face(0),
          S.run((a) => { a.walker.pose = 'peace'; shared.ready = true; }),
          S.until(() => shared.done),
          S.run((a) => { a.walker.pose = 'idle'; }),
          S.walk([[spotX + 0.4, 7.2], [spotX + 0.6, standZ + 0.5]]),
          S.run(() => { shared.back = true; }),
          S.go(to),
        );
        return [shooter, model];
      },
    });
  },
});

export const taxiMod = defineMod({
  id: 'konbini.events.taxi',
  name: '出租车',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    // clipped at the plinth edges so it seems to drive in and out of the cut
    const clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 27.9), new THREE.Plane(new THREE.Vector3(1, 0, 0), 27.9)];
    const taxi = ctx.prefabs.create('car', { color: '#f2c84b', belt: '#2a7a55', roofLamp: true, lit: true, clip });
    const head = new THREE.SpotLight('#fff1d0', 0, 26, 0.5, 0.5, 1.3);
    head.position.set(2.3, 0.8, 0);
    head.target.position.set(12, 0, 0);
    taxi.root.add(head, head.target);
    taxi.root.position.set(-20, 0, 11.8);
    taxi.root.userData.skyIgnore = true;   // it moves: don't let it shelter a patch of road from snow
    ctx.root.add(taxi.root);
    ctx.interact.clickable(taxi.root, () => ctx.audio.play('beep'), '出租车');

    const STOP_X = 10.6, MAX = 8.5;
    let v = 8;
    ctx.onFrame((dt, t) => {
      head.intensity = ctx.atmosphere.channel('head') * 16.7;
      const signal = ctx.services.get<Signals>('world.signals')?.vehicle(t) ?? 'g';
      let x = taxi.root.position.x;
      let desired = MAX;
      if (signal !== 'g' && x < STOP_X + 0.2 && x > STOP_X - 24) {
        const dist = STOP_X - x;
        const committed = signal === 'y' && dist < 4 && v > 5;
        if (!committed) desired = Math.max(0, Math.min(MAX, dist * 0.9));
      }
      v += (desired - v) * Math.min(1, dt * (desired < v ? 2.2 : 0.9));
      x += v * dt;
      if (x > 33) x = -33;
      taxi.root.position.x = x;
      taxi.spin(v * dt);
    });
  },
});

