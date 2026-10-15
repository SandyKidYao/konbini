// The roads as drivers see them: lanes on road A (both ways) and road B, the six ways through the junction,
// the signals and stop lines, and how to pull off road A into a plot and back out. Offers the 'world.roads'
// service; events decide what drives and when. Japan drives on the left.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { Traffic, path, drive, choose, through as via, type Gate, type Waypoint, type Path, type Pose, type Vehicle, type VehicleBody, type VehicleOptions, type VehicleSteps } from '../../engine/agents/vehicle';
import type { Rect } from '../../engine/surfaces';
import type { Signals } from './furniture';
import { BLOCK, SIDEWALKS } from './layout';

/** Where the roads leave the model: road A's west and east ends, road B's south end. */
export type RoadEnd = 'west' | 'east' | 'south';

export interface RoadService {
  readonly traffic: Traffic;
  /** clipping planes at the edge of the model — give them to every vehicle body */
  readonly clip: THREE.Plane[];
  /** the ways through the junction that exist (from → to) */
  readonly ways: readonly [RoadEnd, RoadEnd][];
  /** Is there room to appear at this road end? */
  free(from: RoadEnd): boolean;
  /** Put a vehicle at the start of a road end (off the model, out of sight). */
  spawn(body: VehicleBody, from: RoadEnd, o?: VehicleOptions): Vehicle;
  /** Drive from one end through the junction to another, obeying the signals; the vehicle is gone at the end. */
  through(from: RoadEnd, to: RoadEnd, o?: { speed?: number }): VehicleSteps;
  /**
   * Come along road A from `from` and turn off it into `to` (a driveway beside road A, facing away from it), then
   * on slowly through `onward`. Just before the turn `enter` is asked whether there is room; if not, the vehicle
   * drives on by instead (`balk` is told, and the rest of its script is dropped).
   */
  arrive(from: 'west' | 'east', to: Pose, onward?: readonly Waypoint[], o?: { enter?(v: Vehicle): boolean; balk?(v: Vehicle): void }): VehicleSteps;
  /**
   * Drive slowly from `from` through `via` (e.g. along a car park and out of its driveway), wait at the kerb for a
   * gap, pull out onto road A towards `to` and drive off. `onRoad` is told once it is driving along its lane.
   */
  depart(from: Pose, to: 'west' | 'east', o?: { via?: readonly Waypoint[]; onRoad?(v: Vehicle): void }): VehicleSteps;
}

const EDGE = 34, B_END = -31;
const LANE = { east: 11.9, west: 15.1 } as const;       // road A: eastbound keeps left (the shop side)
const B = { north: 19.0, south: 16.0 } as const;        // road B: northbound keeps left (the east side)
const SPEED = { a: 8.5, b: 6.5, turn: 4.5, lot: 3 };
/** the edge of the sidewalk along road A on the plot's side: vehicles leaving a plot take a last look here */
const KERB = SIDEWALKS[0][2];
const R = Math.PI / 2;

export default defineMod({
  id: 'konbini.world.roads',
  name: '车道与交通',
  layer: 'world',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const signals = () => ctx.services.get<Signals>('world.signals');
    const traffic = new Traffic({
      surfaces: ctx.surfaces,
      parent: ctx.root,
      people: () => ctx.director.actors,
      headlights: () => ctx.atmosphere.channel('head'),
      clickable: (o, fn, label) => ctx.interact.clickable(o, fn, label),
      onClick: () => ctx.audio.play('beep'),
      bounds: BLOCK,
    });
    const clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), BLOCK.x1 - 0.1), new THREE.Plane(new THREE.Vector3(1, 0, 0), -BLOCK.x0 - 0.1), new THREE.Plane(new THREE.Vector3(0, 0, 1), -BLOCK.z0 - 0.1)];

    // people on foot give way to cars crossing their path (at a driveway, say)
    ctx.director.avoid((a, x, z) => traffic.inTheWay(a.position, x, z));
    // on the map: every vehicle on the model
    ctx.plan.movers(() => traffic.vehicles.filter((v) => !v.done && v.pose.x > BLOCK.x0 - 3 && v.pose.x < BLOCK.x1 + 3 && v.pose.z > BLOCK.z0 - 3).map((v) => ({
      kind: 'vehicle' as const, x: v.pose.x, z: v.pose.z, heading: v.pose.heading, len: v.body.len, width: v.body.width,
    })));
    ctx.onFrame((dt, t, d) => {
      traffic.speedScale = (1 - 0.15 * d.rain) * (1 - 0.35 * Math.max(d.snow, d.snowCover * 0.8)) * (1 - 0.25 * d.fog);
      traffic.update(dt, t);
    });

    // ---------------------------------------------------------------- who may go
    const inRect = (r: Rect) => (v: Vehicle) => v.pose.x > r.x0 && v.pose.x < r.x1 && v.pose.z > r.z0 && v.pose.z < r.z1;
    /** anyone in a lane between x0 and x1 (only those moving, if `moving`) — not counting whoever is waiting for `self` */
    const inLane = (lane: 'east' | 'west', x0: number, x1: number, self: Vehicle, moving = false) => {
      const z = LANE[lane];
      return traffic.vehicles.some((v) => v !== self && !v.parked && v.blocker !== self && (!moving || v.v > 0.8)
        && inRect({ x0, x1, z0: z - 1.7, z1: z + 1.7 })(v));
    };
    /** will anyone along a lane reach x within `secs`? (eastbound comes from −x, westbound from +x) */
    const arriving = (lane: 'east' | 'west', x: number, secs: number, self: Vehicle) => {
      const z = LANE[lane], dir = lane === 'east' ? 1 : -1;
      return traffic.vehicles.some((v) => {
        if (v === self || v.parked || Math.abs(v.pose.z - z) > 1.7) return false;
        const d = (x - v.pose.x) * dir;
        // moving towards it — or standing close by, about to (off from a light, out of the junction)
        return d > -1 && (v.v < 0.8 ? d < 9 : d < Math.max(8, v.v * secs + 4));
      });
    };
    // eastbound traffic coming towards a right-turner: moving, or already close to where it crosses
    const oncomingClear = (x: number, self: Vehicle, reach = 26) => !traffic.vehicles.some((v) => v !== self && !v.parked
      && Math.sin(v.pose.heading) > 0.5 && inRect({ x0: x - reach, x1: x + 3.5, z0: 10.2, z1: 13.6 })(v) && (v.v > 0.5 || v.pose.x > x - 7));
    // nobody still in the junction itself (road B waits for it to empty before its turn)
    const boxClear = (self: Vehicle) => !traffic.vehicles.some((v) => v !== self && !v.parked && inRect({ x0: 13, x1: 23, z0: 9.5, z1: 16.8 })(v));
    // don't block the box: only head into the junction towards the westbound lane if there is room beyond it
    const roomWest = (self: Vehicle) => !traffic.vehicles.some((v) => v !== self && !v.parked && v.v < 1.5
      && inRect({ x0: 5, x1: 17, z0: LANE.west - 1.7, z1: LANE.west + 1.7 })(v));

    /** gates every path is checked against (each applies only where the path passes it) */
    const standard: Gate[] = [
      { at: [12.9, LANE.east], near: 1.2, open: (_v, t) => signals()?.vehicle(t) === 'g' },
      { at: [22.2, LANE.west], near: 1.2, open: (_v, t) => signals()?.vehicle(t) === 'g' },
      // 止まれ at the end of road B, then wait for its turn in the signal cycle
      { at: [B.north, 2.9], near: 1.2, halt: 0.8, open: (v, t) => signals()?.side(t) === 'g' && boxClear(v) },
      // turning into road B: people on the crossing go first
      { at: [B.south, 7.9], near: 1.2, open: (_v, t) => signals()?.ped(t) === 'r', commit: false },
    ];
    /** where a path first crosses the line z (going down: −z, or up: +z), as a distance along it */
    const crossing = (p: Path, z: number, dir: -1 | 1 = -1) => {
      const pose = { x: 0, z: 0, heading: 0 };
      let before = (p.start.z - z) * dir < 0;
      for (let s = 0; s < p.length; s += 0.25) {
        const now = (p.at(s, pose).z - z) * dir < 0;
        if (before && !now) return { s, x: pose.x };
        before = now;
      }
      return null;
    };
    /** a right turn across the eastbound lane: wait (in the middle of road A) for a gap */
    const yieldGate = (p: Path): Gate[] => {
      const c = crossing(p, 13.9);
      return c ? [{ at: c.s, commit: false, open: (v) => oncomingClear(c.x, v) }] : [];
    };

    // ---------------------------------------------------------------- the ways through
    const starts: Record<RoadEnd, Pose> = {
      west: { x: -EDGE, z: LANE.east, heading: R },
      east: { x: EDGE, z: LANE.west, heading: -R },
      south: { x: B.north, z: B_END, heading: 0 },
    };
    const from = (e: RoadEnd) => { const s = starts[e]; return path(s.x, s.z, s.heading); };
    const ways = new Map<string, Path>([
      ['west>east', from('west').speed(SPEED.a).line(EDGE, LANE.east).build()],
      ['east>west', from('east').speed(SPEED.a).line(-EDGE, LANE.west).build()],
      ['west>south', from('west').speed(SPEED.a).line(12.1, LANE.east).curve(B.south, 8.0, Math.PI).speed(SPEED.b).line(B.south, B_END).build()],
      ['east>south', from('east').speed(SPEED.a).line(21, LANE.west).curve(B.south, 10.1, Math.PI).speed(SPEED.b).line(B.south, B_END).build()],
      ['south>east', from('south').speed(SPEED.b).line(B.north, 8.9).curve(22, LANE.east, R).speed(SPEED.a).line(EDGE, LANE.east).build()],
      ['south>west', from('south').speed(SPEED.b).line(B.north, 11.1).curve(15, LANE.west, -R).speed(SPEED.a).line(-EDGE, LANE.west).build()],
    ]);
    const gatesFor = (p: Path) => [...standard, ...yieldGate(p)];
    const wayGates = new Map([...ways].map(([k, p]) => [k, gatesFor(p)]));
    wayGates.get('east>west')!.push({ at: [22.2, LANE.west], near: 1.2, open: roomWest });
    wayGates.get('south>west')!.push({ at: [B.north, 2.9], near: 1.2, open: roomWest });

    const service: RoadService = {
      traffic,
      clip,
      ways: [...ways.keys()].map((k) => k.split('>') as [RoadEnd, RoadEnd]),
      free(e) {
        const s = starts[e];
        const r = e === 'south' ? { x0: s.x - 1.5, x1: s.x + 1.5, z0: s.z - 6, z1: s.z + 10 }
          : { x0: Math.min(s.x, s.x + Math.sin(s.heading) * 10) - 6, x1: Math.max(s.x, s.x + Math.sin(s.heading) * 10) + 6, z0: s.z - 1.5, z1: s.z + 1.5 };
        return !traffic.occupied(r);
      },
      spawn(body, e, o = {}) { return traffic.spawn(body, { at: starts[e], ...o }); },
      through(a, b, o = {}) {
        const p = ways.get(`${a}>${b}`);
        if (!p) throw new Error(`[roads] no way ${a} → ${b}`);
        return drive(p, { speed: o.speed ?? SPEED.a, gates: wayGates.get(`${a}>${b}`), through: true });
      },
      arrive(e, to, onward = [], o = {}) {
        const lane = e === 'west' ? LANE.east : LANE.west;
        const sx = e === 'west' ? -1 : 1, r = lane - to.z;
        // slow down on the way, decide a few metres before the turn: turn in, or (no room) drive on by
        const turnX = to.x + sx * r, decide = turnX + sx * 6;
        const approach = from(e).speed(SPEED.a).line(decide + sx * 12, lane).speed(5).line(decide, lane).build();
        const b = path(decide, lane, -sx * R).speed(5).line(turnX, lane).speed(SPEED.turn).curve(to.x, to.z, to.heading, 0.4).speed(SPEED.lot);
        const turn = via(b, onward).build();
        const onBy = path(decide, lane, -sx * R).speed(SPEED.a).line(-sx * EDGE, lane).build();
        // turning right across the eastbound lane: only start if there is a clear gap now — never sit in the
        // road waiting for one (the queue behind would back up into the junction)
        const xc = crossing(turn, 13.9)?.x;
        return [
          drive(approach, { speed: SPEED.a, gates: standard, through: true }),
          choose((v) => {
            if ((xc === undefined || oncomingClear(xc, v, 36)) && (!o.enter || o.enter(v))) return drive(turn, { speed: SPEED.a, gates: standard });
            o.balk?.(v);
            v.replace(drive(onBy, { speed: SPEED.a, gates: standard, through: true }));
            return [];
          }),
        ];
      },
      depart(f, e, o = {}) {
        const lane = e === 'east' ? LANE.east : LANE.west;
        const sx = e === 'east' ? 1 : -1;
        const b = via(path(f.x, f.z, f.heading).speed(SPEED.lot), o.via ?? []);
        // facing the road: a quarter turn into the lane; facing along it: an S-bend over
        const end = b.end, L = Math.abs(Math.sin(end.heading)) < 0.5 ? Math.max(3, lane - end.z) : Math.max(7, (lane - end.z) * 1.45);
        const p = b.speed(SPEED.turn).curve(end.x + sx * L, lane, sx * R, 0.4).speed(SPEED.a).line(sx * EDGE, lane).build();
        const mx = end.x + sx * L, xc = crossing(p, LANE.east, 1)?.x ?? end.x;
        // wait for a gap: room where it joins (or crosses) a lane, and nobody arriving there within a few
        // seconds. The longer the wait, the smaller the gap that will do. Then one last look at the kerb.
        const clear = (v: Vehicle, secs: number) => e === 'east'
          ? !inLane('east', mx - 4, mx + 7, v) && !arriving('east', mx - 4, secs, v)
          : !inLane('east', xc - 4, xc + 4, v) && !arriving('east', xc - 4, secs * 0.8, v)
            && !inLane('west', mx - 7, mx + 4, v) && !arriving('west', mx + 4, secs, v);
        // nose (and its corners, on the slant) still off the sidewalk; from further out, still off the road
        const kerb = crossing(p, KERB - 0.2, 1) ?? crossing(p, 9.7, 1);
        let since = -1;
        const gates: Gate[] = [{
          at: kerb?.s ?? 0, commit: false,
          open: (v, t) => { if (since < 0) since = t; return clear(v, 4.2 - 1.2 * Math.min(1, (t - since) / 25)); },
        }, ...standard];
        const step = drive(p, { speed: SPEED.a, gates, through: true });
        if (o.onRoad) {
          // tell the caller once it is out on the road and driving along its lane, clear of the driveway
          const tick = step.tick!;
          let out = false;
          step.tick = (v, dt, t) => {
            const done = tick(v, dt, t);
            if (!out && (done || (v.pose.z > lane - 1 && Math.abs(Math.sin(v.pose.heading)) > 0.97))) { out = true; o.onRoad!(v); }
            return done;
          };
        }
        return step;
      },
    };
    ctx.services.provide<RoadService>('world.roads', service);
  },
});
