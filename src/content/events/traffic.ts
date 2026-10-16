// Traffic: cars, taxis, trucks and the community bus driving through the junction — more or fewer by the
// hour, with a mix that follows the clock, the day of the week and the weather. Customers who drive to the
// shop, pull in nose first beside it, go shopping and back out onto road B; and the delivery truck, which comes
// up the back lane and restocks the shop through the staff yard.
import { defineMod, type ModContext } from '../../engine/mod';
import { R, pickR } from '../../engine/kit/rng';
import * as V from '../../engine/agents/vehicle';
import type { Pose } from '../../engine/agents/vehicle';
import type { Drivers } from '../../engine/atmosphere';
import type { Conditions } from '../../engine/states';
import type { Steps } from '../../engine/agents/actor';
import type { RoadService, RoadEnd } from '../world/roads';
import type { ParkingService, ParkingBay, ShopService, BackyardService } from '../site/konbini/api';
import { CAR_MODELS, CAR_COLORS, KEI_COLORS, TAXI_LIVERIES, type Car } from '../library/car';
import type { FigureOptions } from '../library/figure';
import { citizen, clerk, rushHour, shopAround } from './people';

const PI = Math.PI;

export type VehicleKind = 'kei' | 'hatch' | 'sedan' | 'minivan' | 'taxi' | 'patrol' | 'kei-truck' | 'box-truck' | 'bus';
const LABEL: Record<VehicleKind, string> = {
  kei: '轻型车', hatch: '小汽车', sedan: '轿车', minivan: '家用面包车', taxi: '出租车', patrol: '巡逻警车',
  'kei-truck': '轻型小货车', 'box-truck': '送货卡车', bus: '社区巴士',
};

/** Linear between [hour, value] keys, wrapping at midnight (keys in order, starting at or after 0). */
function byHour(h: number, keys: readonly (readonly [number, number])[]) {
  for (let i = 0; i < keys.length; i++) {
    const [h0, v0] = keys[i], [h1, v1] = keys[(i + 1) % keys.length];
    const span = (h1 - h0 + 24) % 24 || 24, into = (h - h0 + 24) % 24;
    if (into <= span) return v0 + (v1 - v0) * (into / span);
  }
  return keys[0][1];
}
function pickW<T>(options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = Math.random() * total;
  for (const [x, w] of options) { r -= Math.max(0, w); if (r <= 0 && w > 0) return x; }
  return options[0][0];
}
/** seconds until the next arrival, for `perMinute` arrivals a minute (a Poisson stream) */
const nextIn = (perMinute: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, (-Math.log(1 - Math.random()) * 60) / Math.max(0.01, perMinute)));

/** A body for this kind of vehicle, clipped at the edge of the model, with how it drives. */
export function makeVehicle(ctx: ModContext, roads: RoadService, kind: VehicleKind): { body: Car; accel: number; speed: number } {
  const clip = roads.clip, P = ctx.prefabs;
  const s = R(-0.5, 0.5);
  switch (kind) {
    case 'kei': return { body: P.create('car', { ...CAR_MODELS.kei, color: pickR(KEI_COLORS), clip }), accel: 2.0, speed: 8 + s };
    case 'hatch': return { body: P.create('car', { ...CAR_MODELS.hatch, color: pickR(CAR_COLORS), clip }), accel: 2.4, speed: 8.5 + s };
    case 'sedan': return { body: P.create('car', { ...CAR_MODELS.sedan, color: pickR(CAR_COLORS), clip }), accel: 2.5, speed: 8.8 + s };
    case 'minivan': return { body: P.create('car', { ...CAR_MODELS.minivan, color: pickR(CAR_COLORS), clip }), accel: 2.1, speed: 8.3 + s };
    case 'taxi': {
      const [color, belt] = pickR(TAXI_LIVERIES);
      return { body: P.create('car', { ...CAR_MODELS.taxi, color, belt, roofLamp: true, clip }), accel: 2.3, speed: 8.6 + s };
    }
    case 'patrol': return { body: P.create('car', { ...CAR_MODELS.sedan, color: '#1c1d20', patrol: true, clip }), accel: 2.2, speed: 7 };
    case 'kei-truck': return {
      body: P.create('truck', { type: 'kei', color: pickR(['#f3f1ea', '#f3f1ea', '#c3c8cd', '#3d6fb5']), load: pickR(['crates', 'cabbage', 'none'] as const), clip }),
      accel: 1.8, speed: 7.5 + s,
    };
    case 'box-truck': return { body: P.create('truck', { type: 'box', color: '#f3f1ea', stripe: '#2f6db5', clip }), accel: 1.4, speed: 7.2 };
    case 'bus': return { body: P.create('bus', { clip }), accel: 1.2, speed: 6.8 };
  }
}

/** What is out on the roads at this hour: commuters at rush hour, families at weekends, taxis at night. */
function streetMix(c: Conditions, d: Drivers): [VehicleKind, number][] {
  const h = c.hour, night = h < 5 || h >= 22, late = h >= 0.5 && h < 4.5;
  const work = !c.dayOff && h >= 6 && h < 19;
  return [
    ['kei', night ? 0.12 : 0.26],
    ['hatch', 0.14],
    ['sedan', rushHour(c) ? 0.26 : 0.15],
    ['minivan', c.dayOff ? 0.22 : 0.08],
    ['taxi', (night ? 0.38 : 0.1) + 0.25 * d.rain],
    ['patrol', night ? 0.05 : 0.02],
    ['kei-truck', work ? 0.08 * (1 - d.snow) : 0.01],
    ['box-truck', work ? 0.09 : late ? 0.08 : 0.03],
  ];
}

// vehicles a minute, by the clock: rush hours on weekdays, a gentler bulge through the day at weekends
const STREET_WEEKDAY = [[0, 2.5], [1.5, 1.2], [4.5, 1.5], [6, 5], [7.5, 10], [9, 8], [10, 6], [12, 6.5], [15, 6], [17.5, 9.5], [19, 8], [21, 4.5], [23, 3]] as const;
const STREET_DAYOFF = [[0, 3], [2, 1.5], [5, 1.2], [7, 3], [9, 5], [11, 7], [16, 7], [19, 5], [22, 3.5]] as const;
const streetRate = (c: Conditions, d: Drivers) => byHour(c.hour, c.dayOff ? STREET_DAYOFF : STREET_WEEKDAY)
  * (1 - 0.45 * d.snow) * (1 - 0.25 * d.thunder) * (1 + 0.15 * d.rain);

// mostly along road A; some down road B to the shore and up from it; a steady trickle along the coast road
const WAYS: [readonly [RoadEnd, RoadEnd], number][] = [
  [['west', 'east'], 0.27], [['east', 'west'], 0.27],
  [['west', 'shore-west'], 0.035], [['west', 'shore-east'], 0.035], [['east', 'shore-west'], 0.03], [['east', 'shore-east'], 0.03],
  [['shore-west', 'east'], 0.04], [['shore-west', 'west'], 0.04], [['shore-east', 'east'], 0.04], [['shore-east', 'west'], 0.04],
  [['shore-west', 'shore-east'], 0.085], [['shore-east', 'shore-west'], 0.085],
];

export const trafficMod = defineMod({
  id: 'konbini.events.traffic',
  name: '街上的车',
  layer: 'events',
  requires: ['konbini.library', 'konbini.world.roads'],
  setup(ctx) {
    const roads = ctx.services.get<RoadService>('world.roads');
    if (!roads) return;
    const C = ctx.states.conditions;
    // every kind compiles its shaders now, behind the loading screen, instead of stalling a frame when the
    // first one of its kind drives in (parking and deliveries use the same bodies)
    for (const kind of Object.keys(LABEL) as VehicleKind[]) ctx.fx.warm(makeVehicle(ctx, roads, kind).body.root);

    function send(kind: VehicleKind, a: RoadEnd, b: RoadEnd) {
      const m = makeVehicle(ctx, roads!, kind);
      roads!.spawn(m.body, a, { kind, label: LABEL[kind], accel: m.accel }).then(roads!.through(a, b, { speed: m.speed }));
    }

    let next = 0.3, bus = R(15, 45), busEast = Math.random() < 0.5;
    ctx.onFrame((dt, _t, d) => {
      // the community bus keeps its own timetable, alternating directions, from early morning to ten at night
      bus -= dt;
      if (bus <= 0) {
        const from: RoadEnd = busEast ? 'west' : 'east';
        if (C.hour < 6.5 || C.hour >= 22 || d.snow > 0.8) bus = 60;
        else if (!roads.free(from)) bus = 4;
        else { send('bus', from, busEast ? 'east' : 'west'); busEast = !busEast; bus = R(150, 230); }
      }
      next -= dt;
      if (next > 0) return;
      next = nextIn(streetRate(C, d), 1.1, 40);
      if (roads.traffic.vehicles.length >= 16) return;
      const kind = pickW(streetMix(C, d));
      for (let tries = 0; tries < 3; tries++) {
        const [a, b] = pickW(WAYS);
        if (roads.free(a)) { send(kind, a, b); break; }
      }
    });
  },
});

// ------------------------------------------------------------------ the shop's parking lot

// visits a minute: breakfast and coffee, lunch, the way home; a steady trickle at weekends; a few at night
const LOT_WEEKDAY = [[0, 0.5], [5, 0.4], [6.5, 1.5], [8.5, 1.3], [10, 0.8], [12, 1.6], [13.5, 0.9], [17, 1.1], [19, 1.4], [21, 0.8], [23, 0.6]] as const;
const LOT_DAYOFF = [[0, 0.6], [5, 0.3], [8, 0.8], [11, 1.4], [14, 1.2], [18, 1.4], [21, 0.9]] as const;
// more people drive when it rains
const lotRate = (c: Conditions, d: Drivers) => byHour(c.hour, c.dayOff ? LOT_DAYOFF : LOT_WEEKDAY) * (1 + 0.4 * d.rain) * (1 - 0.4 * d.snow);
function lotMix(c: Conditions): [VehicleKind, number][] {
  const h = c.hour, night = h < 5 || h >= 22;
  return [
    ['kei', 0.32], ['hatch', 0.16], ['sedan', 0.12], ['minivan', c.dayOff ? 0.2 : 0.1],
    ['taxi', night ? 0.35 : 0.06],                       // a night-shift taxi driver's coffee break
    ['kei-truck', !c.dayOff && h >= 6 && h < 18 ? 0.08 : 0],
    ['patrol', 0.015],
  ];
}

/** Where a body stops in a bay: front tyres against the wheel stop, nose to the side windows (−x). */
function parkedPose(bay: ParkingBay, body: Car): Pose {
  const front = Math.max(...body.wheels.map((w) => w.position.x)), r = body.wheels[0].position.y;
  return { x: bay.stop + r + front, z: bay.z, heading: -PI / 2 };
}
/** where they drive off to: on down road B and along the shore, or back up to road A and away either way */
const AWAY: [RoadEnd, number][] = [['shore-west', 0.22], ['shore-east', 0.23], ['east', 0.28], ['west', 0.27]];

/**
 * Back out onto road B, once there is a gap and the frontage is free, and drive off. From the bays nearest the
 * junction nobody heads for the sea: backing out that way would swing the tail up onto the crossing.
 */
function leaveBay(roads: RoadService, lot: ParkingService, i: number, park: Pose, body: Car, who: string): V.VehicleSteps {
  const away = park.z + 3 + body.len / 2 < CROSSING_Z ? AWAY : AWAY.filter(([e]) => e === 'east' || e === 'west');
  // the frontage is only taken once there is a gap and it really goes: waiting for one, it holds nobody up
  return [
    V.wait(R(0.6, 1.2)),
    roads.backOut(park, pickW(away), { ready: () => lot.takeFront(who), onRoad: () => { lot.release(i); lot.freeFront(who); } }),
  ];
}
/** where road B's zebra crossing starts, on the bays' side of the junction */
const CROSSING_Z = 4;
/** The walk from beside the car (driver's side, or the passenger's) up the gap to the walkway, and back. */
function walkway(bay: ParkingBay, park: Pose, passenger: boolean) {
  const z = passenger ? bay.walk.passenger : bay.walk.driver;
  const there: [number, number][] = [[park.x, z], [bay.walk.walkway, z]];
  // parked facing −x, the driver (right-hand drive) gets out on the −z side
  return { there, back: [...there].reverse(), door: [park.x + 0.35, bay.z + (passenger ? 1.02 : -1.02)] as [number, number] };
}

const OUTFIT: Partial<Record<VehicleKind, FigureOptions>> = {
  taxi: { shirt: '#f4f6f8', pants: '#2b2b2e', skirt: null, coat: undefined, hat: undefined },
  patrol: { shirt: '#3a4f7a', pants: '#2f3f63', skirt: null, coat: undefined, hat: 'cap' },
};

export const parkingMod = defineMod({
  id: 'konbini.events.parking',
  name: '开车来的顾客',
  layer: 'events',
  requires: ['konbini.library', 'konbini.world.roads'],
  setup(ctx) {
    const roads = ctx.services.get<RoadService>('world.roads');
    const lot = ctx.services.get<ParkingService>('shop.parking');
    const shop = ctx.services.get<ShopService>('shop');
    if (!roads || !lot || !shop) return;
    const S = ctx.steps, C = ctx.states.conditions, board = ctx.director.board;
    let n = 0;

    /** A car comes along road A and pulls in (or, `waiting`, is already parked with its people inside); they shop and drive off. */
    function visit(i: number, kind: VehicleKind, waiting: boolean) {
      const bay = lot!.bays[i], who = `visit${++n}`;
      const m = makeVehicle(ctx, roads!, kind);
      const park = parkedPose(bay, m.body);
      // they come along road A from the west: the turn down road B is then a left turn, across nobody's path
      if (!waiting && !roads!.free('west')) return;
      lot!.claim(i, who);
      const o = { kind, label: LABEL[kind], accel: m.accel };
      const from = 'west';
      const v = waiting ? roads!.traffic.spawn(m.body, { at: park, ...o }) : roads!.spawn(m.body, from, o);
      if (waiting) v.engine = false;
      else v.then(roads!.pullIn(from, park, { enter: () => lot!.takeFront(who) }));

      // a passenger now and then — more often at weekends
      const count = kind === 'taxi' || kind === 'patrol' || kind === 'kei-truck' ? 1 : Math.random() < (C.dayOff ? 0.4 : 0.15) ? 2 : 1;
      let aboard = 0;
      const back = (passenger: boolean) => {
        const w = walkway(bay, park, passenger);
        const steps: Steps[] = [S.walk(w.back), S.walk([w.door]), S.face([park.x, park.z])];
        if (kind === 'taxi' && !passenger) steps.push(S.run((a) => { a.heading = park.heading; }), S.pose('drink', R(7, 12)));
        steps.push(S.run(() => { aboard++; }), S.leave());
        return steps;
      };
      // back out to the car by the side door, the one nearer the bays
      const out = shop!.nodes.sideOut ?? shop!.nodes.doorOut;
      const person = (passenger: boolean, d: Drivers) => {
        const fig = citizen(ctx, d, { ...(passenger ? {} : OUTFIT[kind]), umbrella: d.rain > 0.3 || d.snow > 0.3 });
        const buy = kind === 'taxi' ? 'can' : 'bag';
        const w = walkway(bay, park, passenger);
        if (waiting) {
          // already inside: they come out of the shop with their shopping
          fig.hold(buy);
          const a = ctx.director.spawn(fig, { at: shop!.nodes.doorIn, label: '开车来的顾客', tags: ['customer'] });
          a.then(S.wait(R(4, 40)), S.go(out), back(passenger));
        } else {
          const a = ctx.director.spawn(fig, { x: w.door[0], z: w.door[1], heading: passenger ? 0 : PI, label: '开车来的顾客', tags: ['customer'] });
          a.then(S.walk(w.there), shopAround(ctx, fig, board, { buy }), S.go(out), back(passenger));
        }
      };
      v.then(
        V.engine(false), V.run(() => lot!.freeFront(who)),
        V.run(() => { const d = ctx.atmosphere.drivers; for (let k = 0; k < count; k++) person(k === 1, d); }),
        V.until(() => aboard >= count),
        V.wait(R(0.8, 1.6)), V.engine(true),
        leaveBay(roads!, lot!, i, park, m.body, who),
      );
      v.onDispose = () => { if (lot!.holder(i) === who) lot!.release(i); lot!.freeFront(who); };
    }

    const freeBays = () => lot.bays.map((_, i) => i).filter((i) => lot.holder(i) === null);

    // on arrival, a few cars are already parked — fewer late at night
    {
      const d = ctx.atmosphere.drivers;
      const k = Math.min(3, Math.floor(lotRate(C, d) * 1.4 + Math.random() * 0.9));
      for (let j = 0; j < k; j++) { const f = freeBays(); if (f.length) visit(pickR(f), pickW(lotMix(C)), true); }
    }

    let next = R(4, 12);
    ctx.onFrame((dt, _t, d) => {
      next -= dt;
      if (next > 0) return;
      next = nextIn(lotRate(C, d), 8, 150);
      const f = freeBays();
      if (f.length > 1 || (f.length && Math.random() < 0.5)) visit(pickR(f), pickW(lotMix(C)), false);
    });
  },
});

// ------------------------------------------------------------------ deliveries

export const deliveryMod = defineMod({
  id: 'konbini.events.delivery',
  name: '送货车补货',
  layer: 'events',
  requires: ['konbini.library', 'konbini.world.roads'],
  setup(ctx) {
    const roads = ctx.services.get<RoadService>('world.roads');
    const yard = ctx.services.get<BackyardService>('shop.backyard');
    if (!roads || !yard) return;
    const S = ctx.steps, C = ctx.states.conditions;
    // the shop is restocked three times a day: early morning, mid-afternoon, late evening
    const ROUNDS = [6.3, 14.5, 22.2];
    let next = R(4, 15), busy = false;

    /** Up the back lane, stop at the yard's opening, two trips with crates to the back door, on along the lane. */
    function deliver() {
      // from the west, like the customers: a long truck turning right would wait in the middle of the junction
      if (!roads!.free('west')) return;
      busy = true;
      const m = makeVehicle(ctx, roads!, 'box-truck');
      // facing −x along the lane, its back doors just short of the middle of the opening: the driver unloads standing
      // behind it, right where the way in through the opening starts (the yard's lane node), not inside the box
      const openX = (yard!.opening.x0 + yard!.opening.x1) / 2, x = openX - m.body.len / 2 - 0.55;
      const from = 'west';
      const v = roads!.spawn(m.body, from, { kind: 'box-truck', label: '送货卡车', accel: m.accel });
      let done = false;
      v.then(
        roads!.intoLane(from, x),
        V.engine(false), V.run(() => { v.hazard = true; driver(); }),
        V.until(() => done),
        V.wait(1), V.run(() => { v.hazard = false; }), V.engine(true), V.wait(0.8),
        roads!.alongLane(),
      );
      v.onDispose = () => { busy = false; };

      function driver() {
        const fig = ctx.prefabs.create('figure', { shirt: '#2f6db5', pants: '#2f3540', skirt: null, hat: 'cap', shortSleeve: ctx.atmosphere.drivers.temperature > 22 });
        // out of the cab on the driver's side, and along it clear of the body, round to the back doors
        const p = v.pose, side = p.z - m.body.width / 2 - 0.4;
        const cab: [number, number] = [p.x - m.body.len / 2 + 1.0, side];
        const rear: [number, number] = [p.x + m.body.len / 2 + 0.5, p.z];
        const a = ctx.director.spawn(fig, { x: cab[0], z: cab[1], heading: PI, label: '送货员' });
        for (let k = 0; k < 2; k++) {
          a.then(
            S.walk([[rear[0], cab[1]], rear]), S.face(-PI / 2), S.pose('place', 1.1),
            S.run(() => fig.hold('crate')), S.wait(0.3),
            S.go(yard!.nodes.lane), S.go(yard!.nodes.door), S.run(() => clerk(ctx)?.bow()),
            S.pose('place', 1.2), S.run(() => fig.hold(null)), S.wait(0.6),
            S.go(yard!.nodes.lane),
          );
        }
        a.then(S.walk([[rear[0], cab[1]], cab]), S.face([p.x, p.z]), S.run(() => { done = true; }), S.leave());
      }
    }

    ctx.onFrame((dt) => {
      next -= dt;
      if (next > 0 || busy) return;
      next = R(25, 45);
      const h = C.hour;
      const due = ROUNDS.some((r) => Math.min(Math.abs(h - r), 24 - Math.abs(h - r)) < 1.0);
      if (due && Math.random() < 0.5) deliver();
    });
  },
});
