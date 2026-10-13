// Life on the street: passers-by (some walking a shiba) and tourists taking photos of the shop.
// (Cars, trucks and buses are in traffic.ts.)
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { R, pickR } from '../../engine/kit/rng';
import { YUKATA } from '../library/figure';
import type { Actor } from '../../engine/agents/actor';
import { citizen, twoEnds, rushHour, festivalEvening } from './people';


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

    const C = ctx.states.conditions;
    ctx.director.define({
      id: 'passerby',
      weight: ({ drivers: d, day }) => (0.5 + 0.8 * d.daylight) * (1 - 0.6 * d.thunder) * (1 - 0.3 * d.snow)
        * (rushHour(C) ? 1.8 : day.dayOff ? 1.15 : 1) * (festivalEvening(C) ? 1.5 : 1),
      run({ drivers: d, day }) {
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
        if (d.rain < 0.3 && d.snow < 0.5 && d.fog < 0.6 && d.daylight > 0.5 && !rushHour(C) && Math.random() < (day.dayOff ? 0.45 : 0.3)) walkDog(a);
        return a;
      },
    });

    // summer festival evenings: pairs in yukata, strolling slowly side by side
    ctx.director.define({
      id: 'festival-stroll',
      max: 2,
      weight: () => (festivalEvening(C) ? 0.5 : 0),
      run({ drivers: d }) {
        const [from, to] = twoEnds(ctx);
        const pair = [0, 1].map(() => ctx.director.spawn(citizen(ctx, d, { yukata: pickR(YUKATA), umbrella: false, hat: undefined }), { at: from, label: '夏祭りの人' }));
        pair[1].speed = pair[0].speed = Math.min(pair[0].speed, 0.9);
        pair[1].lane = -pair[0].lane;
        for (const a of pair) a.then(S.go(to));
        return pair;
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
      // the site marks a photo spot: where to pose with the shop behind, and where to shoot from
      needs: { nodes: ['shop.photo.model', 'shop.photo.camera'] },
      // more on days off, and in the sakura and autumn-leaf seasons
      weight: ({ drivers: d, day }) => (d.rain > 0.3 || d.snow > 0.5 || d.fog > 0.5 || d.thunder > 0.2 ? 0
        : 0.45 * d.daylight * (1 - d.cloud * 0.4) * (day.dayOff ? 1.5 : 0.8) * (day.season === 'spring' || day.season === 'autumn' ? 1.3 : 1)),
      run() {
        const [from, to] = twoEnds(ctx);
        const pose = ctx.nav.node('shop.photo.model')!, cam = ctx.nav.node('shop.photo.camera')!;
        const shared = { ready: false, done: false, back: false };
        const shooter = ctx.director.spawn(ctx.prefabs.create('figure', { kind: 'tourist' }), { at: from, label: '游客' });
        const model = ctx.director.spawn(ctx.prefabs.create('figure', { kind: 'tourist', longHair: Math.random() < 0.6 }), { at: from, label: '游客' });
        model.speed = shooter.speed;
        model.lane = -shooter.lane;
        const shooterFig = shooter.walker as import('../library/figure').Figure;

        shooter.then(S.go(cam.id), S.face([pose.x, pose.z]), S.run(() => shooterFig.hold('camera')), S.until(() => shared.ready));
        for (let i = 0; i < 3; i++) {
          shooter.then(S.pose('photo', 0.9), S.run((a) => {
            flash.position.set(a.position.x + Math.sin(a.heading) * 0.4, 1.6, a.position.z + Math.cos(a.heading) * 0.4);
            f = 1;
            ctx.audio.play('shutter');
          }), S.wait(R(0.4, 0.8)));
        }
        shooter.then(S.run(() => { shared.done = true; }), S.until(() => shared.back), S.go(to));

        model.then(
          S.go(pose.id), S.face([cam.x, cam.z]),
          S.run((a) => { a.walker.pose = 'peace'; shared.ready = true; }),
          S.until(() => shared.done),
          S.run((a) => { a.walker.pose = 'idle'; }),
          S.go(cam.id),
          S.run(() => { shared.back = true; }),
          S.go(to),
        );
        return [shooter, model];
      },
    });
  },
});
