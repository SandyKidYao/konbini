// Life in and around the shop: the clerk at the register, customers, staff breaks out back,
// and staff putting the banners out in the morning and taking them in at night or in the rain.
import { defineMod } from '../../engine/mod';
import { R, pickR } from '../../engine/kit/rng';
import type { ShopService, BackyardService, BannerService } from '../site/konbini/api';
import { citizen, clerk, streetEnds, rushHour, staffDress, type ClerkService } from './people';

const PI = Math.PI;

export const clerkMod = defineMod({
  id: 'konbini.events.clerk',
  name: '收银员',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    const shop = ctx.services.get<ShopService>('shop');
    if (!shop) return;
    const fig = ctx.prefabs.create('figure', { kind: 'staff', longHair: true });
    // the clerk stays all day, so the Santa hat comes and goes with the date
    ctx.states.track({ pick: (c) => staffDress(c).hat ?? null, enter: (hat) => fig.setHat(hat) });
    const a = ctx.director.spawn(fig, { at: shop.nodes.clerk, label: '店员', tags: ['resident'] });
    a.then(ctx.steps.until(() => false));
    ctx.services.provide<ClerkService>('shop.clerk', { bow: () => fig.play('bow', 1.4) });
  },
});

export const customerMod = defineMod({
  id: 'konbini.events.customer',
  name: '顾客购物',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    const S = ctx.steps;
    ctx.director.define({
      id: 'customer',
      needs: { services: ['shop'] },
      weight: ({ drivers: d, actors }) => {
        const inside = actors.filter((a) => a.tags.has('customer')).length;
        return inside > 4 ? 0 : (0.75 + 0.25 * d.daylight) * (1 - 0.35 * d.thunder) * (rushHour(ctx.states.conditions) ? 1.3 : 1);
      },
      run({ drivers: d, board }) {
        const shop = ctx.services.require<ShopService>('shop');
        const ends = streetEnds(ctx);
        const fig = citizen(ctx, d);
        const a = ctx.director.spawn(fig, { at: pickR(ends).id, label: '顾客', tags: ['customer'] });
        const aisle = pickR(shop.aisles);
        a.then(
          S.go(shop.nodes.doorIn),
          S.run(() => clerk(ctx)?.bow()),                     // いらっしゃいませ
          S.go(aisle.front),
          S.walk([[aisle.x, R(-8.6, -5.2)]]), S.face(pickR(aisle.faces)), S.pose('browse', R(2, 4)), S.wait(R(0.4, 1.2)),
        );
        if (Math.random() < 0.5) a.then(S.go(aisle.back), S.face(PI), S.pose('browse', R(1.5, 3)));
        a.then(
          S.go('shop.register.queue'),
          S.until(() => !board.registerBusy),
          S.run(() => { board.registerBusy = true; }),
          S.go(shop.nodes.register), S.face(-PI / 2),
          S.run(() => clerk(ctx)?.bow()),
          S.pose('pay', 2.4),
          S.run(() => { fig.hold('bag'); board.registerBusy = false; clerk(ctx)?.bow(); }),
          S.wait(0.4),
          S.go(pickR(ends).id),
        );
        return a;
      },
    });
  },
});

export const staffBreakMod = defineMod({
  id: 'konbini.events.staff-break',
  name: '店员后院休息',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    const S = ctx.steps;
    ctx.director.define({
      id: 'staff-break',
      max: 1,
      needs: { services: ['shop.backyard'] },
      weight: ({ drivers: d, board }) => (board.staffBusy ? 0 : 0.22 + 0.06 * (1 - d.daylight)),
      run({ drivers: d, board }) {
        const yard = ctx.services.require<BackyardService>('shop.backyard');
        board.staffBusy = true;
        yard.openStaffDoor(3);
        const fig = ctx.prefabs.create('figure', { kind: 'staff', scarf: d.temperature < 5, ...staffDress(ctx.states.conditions) });
        const a = ctx.director.spawn(fig, { at: yard.nodes.door, label: '店员' });
        if (d.rain > 0.5 || d.snow > 0.4 || d.thunder > 0.3) {
          // bad weather: a quick drink under the door canopy
          a.then(S.go(yard.nodes.canopy), S.run(() => fig.hold('can')), S.pose('drink', R(10, 16)), S.pose('stretch', 1.6));
        } else {
          const b = yard.bench;
          a.then(
            S.wait(0.5),
            S.go(yard.nodes.vending), S.pose('pay', 1.0),
            S.run(() => yard.dispenseStaffDrink()), S.wait(1.2), S.run(() => fig.hold('can')),
            S.go(yard.nodes.bench), S.pose('stretch', 1.8),
            S.sit(b.x, b.z, b.heading, b.seatY),
            S.pose('drink', R(14, 22)),
            S.stand(b.x, b.z + 0.65),
          );
        }
        a.then(
          S.go(yard.nodes.door),
          S.run(() => { yard.openStaffDoor(2); fig.hold(null); }),
          S.wait(0.4),
          S.run(() => { board.staffBusy = false; }),
          S.leave(),
        );
        return a;
      },
    });
  },
});

export const bannersMod = defineMod({
  id: 'konbini.events.banners',
  name: '摆放/收起宣传旗',
  layer: 'events',
  requires: ['konbini.library'],
  setup(ctx) {
    const S = ctx.steps;
    const banners = ctx.services.get<BannerService>('shop.banners');
    const shop = ctx.services.get<ShopService>('shop');
    if (!banners || !shop) return;
    const board = ctx.director.board;
    const all = (out: boolean) => Array.from({ length: banners.count }, (_, i) => banners.isOut(i) === out).every(Boolean);
    let first = true, delay = 3;

    function carry(out: boolean) {
      board.staffBusy = true;
      const fig = ctx.prefabs.create('figure', { kind: 'staff', ...staffDress(ctx.states.conditions) });
      const a = ctx.director.spawn(fig, { at: shop!.nodes.backroom, label: '店员' });
      for (let i = 0; i < banners!.count; i++) {
        if (banners!.isOut(i) === out) continue;
        const slot = banners!.slot(i);
        if (out) a.then(S.run(() => fig.hold(`flag:${banners!.design(i)}`)));
        a.then(
          S.go(banners!.standNode(i)), S.face([slot.x, slot.z]),
          S.pose('place', 1.3),
          S.run(() => { banners!.set(i, out); fig.hold(out ? null : `flag:${banners!.design(i)}`); }),
          S.wait(0.3),
          S.go(shop!.nodes.doorIn),
          S.run(() => { if (!out) fig.hold(null); }),
          S.wait(out ? 1.2 : 0.6),
        );
      }
      a.then(S.go(shop!.nodes.backroom), S.run(() => { board.staffBusy = false; }), S.leave());
    }

    ctx.onFrame((dt, _t, d) => {
      // banners go out in daylight, and come in at night, in heavy rain or snow, in storms and strong wind
      const wantOut = d.daylight > 0.45 && d.rain < 0.5 && d.snow < 0.6 && d.thunder < 0.3 && d.wind < 0.85;
      if (first) {
        first = false;
        if (wantOut) for (let i = 0; i < banners.count; i++) banners.set(i, true);
        return;
      }
      delay -= dt;
      if (delay > 0 || board.staffBusy) return;
      if (wantOut && !all(true)) { carry(true); delay = 4; }
      else if (!wantOut && !all(false)) { carry(false); delay = 4; }
    });
  },
});
