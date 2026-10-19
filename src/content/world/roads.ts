// The roads as drivers see them: lanes on road A (both ways), road B down to the sea and the coast road along the
// shore; the ways through the junction, the T at the bottom of road B and the level crossing on the way down; the
// signals and stop lines; how to pull off road A into a plot and back out, and into the bays and the back lane on
// road B's west side. Offers the 'world.roads' service; events decide what drives and when. Japan drives on the left.
import * as THREE from 'three';
import { defineMod } from '../../engine/mod';
import { Traffic, path, drive, choose, until, run, through as via, type Gate, type Waypoint, type Path, type PathBuilder, type Pose, type Vehicle, type VehicleBody, type VehicleOptions, type VehicleSteps } from '../../engine/agents/vehicle';
import type { Rect } from '../../engine/surfaces';
import type { Signals } from './furniture';
import type { Railway } from './railway';
import { BLOCK, SIDEWALKS, LANE as BACK_LANE, TRACK, COAST } from './layout';

/** Where the roads leave the model: road A's west and east ends, the coast road's (down road B, along the shore). */
export type RoadEnd = 'west' | 'east' | 'shore-west' | 'shore-east';

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
  /**
   * Come along road A from `from`, turn down road B and pull in nose first to `to`, a bay on road B's west side
   * (facing −x). It waits at the edge of the junction until `enter` says yes (take a lock, say) — never in road B.
   */
  pullIn(from: 'west' | 'east', to: Pose, o?: { enter?(v: Vehicle): boolean }): VehicleSteps;
  /**
   * Back out of a bay on road B's west side (the pose it is parked in) and drive off towards `to`: on down road B
   * and along the shore ('shore-west' | 'shore-east'), or up to the junction and round onto road A ('east' | 'west'). It first waits for a gap in the
   * lanes it will back across, then asks `ready` (take a lock, say: true to go now). `onRoad` is told once it has
   * backed out and is driving off.
   */
  backOut(from: Pose, to: RoadEnd, o?: { ready?(v: Vehicle): boolean; onRoad?(v: Vehicle): void }): VehicleSteps;
  /** Come along road A from `from`, down road B and left into the back lane; stop with the vehicle's middle at x. */
  intoLane(from: 'west' | 'east', x: number): VehicleSteps;
  /** On along the back lane from where it stands, out over the west edge of the model. */
  alongLane(): VehicleSteps;
}

const EDGE = 34;
/** the coast road's lanes: eastbound keeps left (the sea side) */
const COAST_LANE = { east: COAST.z0 + 1.25, west: COAST.z1 - 1.25 } as const;
/** where road B meets the coast road (its stop line), and the level crossing's deck */
const T_STOP = COAST.z1 + 0.25, XING = { z0: TRACK.z - 1.9, z1: TRACK.z + 1.9 };
/** coming up road B from the sea, where traffic holds while someone backs out of a bay across it */
const BACKING_HOLD = -11.6;
const shore = (e: RoadEnd): e is 'shore-west' | 'shore-east' => e === 'shore-west' || e === 'shore-east';
const LANE = { east: 11.9, west: 15.1 } as const;       // road A: eastbound keeps left (the shop side)
const B = { north: 19.0, south: 16.0 } as const;        // road B: northbound keeps left (the east side)
/** where traffic coming up road B stops for the level crossing (its gate's `at`, so we can ask who is past it) */
const RAIL_UP = [B.north, XING.z0 - 0.75] as const;
const SPEED = { a: 8.5, b: 6.5, turn: 4.5, lot: 3 };
/** the edge of the sidewalk along road A on the plot's side: vehicles leaving a plot take a last look here */
const KERB = SIDEWALKS[0][2];
/** the back lane's one way, westwards, keeping left (the south half) */
const BACK_Z = (BACK_LANE.z0 + BACK_LANE.z1) / 2 + 0.7;
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
      opacity: v.presence,
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
    /** on its way down road B off road A: its drive starts on road A and ends down there (a bay, the lane, the shore) */
    const downB = (p: Path) => p.end.z < 8 && p.start.z > 8;
    // eastbound traffic coming towards a right-turner: moving, or already close to where it crosses — or, when the
    // right turn goes down road B, anyone about to turn left down there too while they have the green (left first)
    const oncomingClear = (x: number, self: Vehicle, reach = 26, t = -1) => !traffic.vehicles.some((v) => v !== self && !v.parked
      && Math.sin(v.pose.heading) > 0.5 && inRect({ x0: x - reach, x1: x + 3.5, z0: 10.2, z1: 13.6 })(v)
      && (v.v > 0.5 || v.pose.x > x - 7 || (t >= 0 && !!v.leg && downB(v.leg.path) && self.leg !== null && downB(self.leg.path) && signals()?.vehicle(t) === 'g')));
    // nobody still in the junction itself (road B waits for it to empty before its turn) — nor about to be: someone
    // on road A who went on through the amber and will be in the box within a few seconds
    const boxClear = (self: Vehicle) => !traffic.vehicles.some((v) => v !== self && !v.parked && (inRect({ x0: 13, x1: 23, z0: 9.5, z1: 16.8 })(v)
      || (v.v > 2 && Math.abs(v.pose.z - LANE.east) < 1.7 && Math.sin(v.pose.heading) > 0.5 && v.pose.x < 13 && (13 - v.pose.x) / v.v < 3.5)
      || (v.v > 2 && Math.abs(v.pose.z - LANE.west) < 1.7 && Math.sin(v.pose.heading) < -0.5 && v.pose.x > 23 && (v.pose.x - 23) / v.v < 3.5)));
    // don't block the box: only head into the junction towards the westbound lane if there is room beyond it
    const roomWest = (self: Vehicle) => !traffic.vehicles.some((v) => v !== self && !v.parked && v.v < 1.5
      && inRect({ x0: 5, x1: 17, z0: LANE.west - 1.7, z1: LANE.west + 1.7 })(v));

    /** who is backing out of a bay on road B's west side right now (they have the road there to themselves) */
    const backing = new Set<Vehicle>();
    const nobodyBacking = (v: Vehicle) => backing.size === 0 || (backing.size === 1 && backing.has(v));
    const railway = () => ctx.services.get<Railway>('world.railway');
    /** someone in this rectangle not driving along x: turning, in or out of a side road */
    const turningIn = (r: Rect, self?: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked && Math.abs(Math.sin(o.pose.heading)) < 0.9 && inRect(r)(o));
    /** past road B's stop line on the way up into the junction (a long truck is still out here when its nose is in) */
    const UP_B: Rect = { x0: B.north - 1.5, x1: B.north + 1.5, z0: 3.6, z1: 9.5 };
    const enteringFromB = (self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked && Math.cos(o.pose.heading) > 0.9 && inRect(UP_B)(o));
    /** turning up road B off the coast road from the east: once it swings round, its tail sweeps the eastbound lane */
    const upFromEast = (p: Path) => p.start.x > 0 && p.start.z < COAST.z1 && p.end.z > COAST.z1;
    const swingingUp = (self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked && !!o.leg && upFromEast(o.leg.path)
      && inRect({ x0: B.north - 2, x1: B.north + 3.2, z0: COAST.z0, z1: COAST.z1 + 2 })(o));
    /** gone over road B's stop line at the T and turning out along the shore (not those still waiting at it) */
    const turningOut = (self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked && !!o.leg && o.leg.path.start.z > COAST.z1
      && o.leg.path.end.z < COAST.z1 && inRect({ x0: B.south - 6, x1: B.south + 1.8, z0: COAST.z0, z1: T_STOP + 1 })(o));
    const JUNCTION: Rect = { x0: 13, x1: 23, z0: 9.5, z1: 16.8 }, T_ZONE: Rect = { x0: 12, x1: 24, z0: COAST.z0, z1: COAST.z1 + 2 };
    /** anyone slow (queueing, stopped) in this rectangle, but me */
    const queued = (r: Rect, self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked && o.v < 1.5 && inRect(r)(o));
    /**
     * Room beyond the level crossing for all of me, so I never stop on it.
     * Going down, between the crossing and the T there is room for one, stopped nose-on at the T's line — and only if
     * nothing stops it sooner: nobody ahead in that stretch or still turning out of it (from a vehicle across its
     * path the engine keeps a wide gap), and nobody walking over the mouth of road B on the coast road's sidewalk.
     * Going up: my length and a little up to the hold for someone backing out of a bay, and my length and the gap I
     * would keep in a queue behind whoever is nearest ahead in the lane (moving or not: it may stop a moment later).
     */
    // nose to tail in a queue: the engine keeps 1.4 m, plus the margins round both footprints, found in 0.5 m steps
    const QUEUE_GAP = 2.3;
    const MOUTH: Rect = { x0: 13.6, x1: 21.4, z0: COAST.z1 - 0.4, z1: COAST.z1 + 1.6 };
    const roomBeyond = (v: Vehicle, down: boolean) => {
      const len = 2 * v.half;
      if (down) {
        const ahead = traffic.vehicles.some((o) => o !== v && !o.done && !o.parked && Math.abs(o.pose.x - B.south) < 2.2
          && o.pose.z < XING.z1 + 1 && o.pose.z > COAST.z0 - 2);
        const walking = ctx.director.actors.some((a) => { const q = a.position;
          return a.walker.visibleScale > 0.3 && q.x > MOUTH.x0 && q.x < MOUTH.x1 && q.z > MOUTH.z0 && q.z < MOUTH.z1; });
        if (ahead || walking) return false;
        // too long to wait at the T's line clear of the tracks (a truck): only with the coast road clear, so it can
        // turn out without stopping
        return XING.z0 - T_STOP >= len + 0.3 || (!alongShore('west', B.south - 2, 7, v) && !alongShore('east', B.south + 4, 7, v));
      }
      let tail = Infinity;
      for (const o of traffic.vehicles) {
        if (o === v || o.done || o.parked || Math.abs(o.pose.x - B.north) > 2.2 || o.pose.z < XING.z0 - 1 || o.pose.z > 9.5) continue;
        tail = Math.min(tail, o.pose.z - o.half - XING.z1);
      }
      return (backing.size === 0 || BACKING_HOLD - XING.z1 >= len + 0.3) && tail >= len + QUEUE_GAP;
    };
    /** coming up road B, let over the crossing (past its gate) but not yet past the hold for backing out: holding
     * them now would leave them on the tracks */
    const crossingUp = (self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked
      && o.passedGate(RAIL_UP) && o.pose.z + o.half < BACKING_HOLD + 0.3);
    /** gates every path is checked against (each applies only where the path passes it) */
    const standard: Gate[] = [
      // the level crossing: everyone stops before it, then goes only if it is open and there is room beyond
      // (never stop on the tracks): one car's length between the crossing and the T, or beyond it on the way up
      { at: [B.south, XING.z1 + 0.75], near: 1.2, halt: 0.8, open: (v) => !railway()?.closed() && roomBeyond(v, true) },
      { at: RAIL_UP, near: 1.2, halt: 0.8, open: (v) => !railway()?.closed() && roomBeyond(v, false) },
      // 停止禁止: going down, don't stop across the back lane's mouth — wait short of it while the stretch beyond is full
      { at: [B.south, BACK_LANE.z1 + 0.3], near: 1.2, commit: false, open: (v) => !queued({ x0: 14.5, x1: 17.5, z0: XING.z1 + 0.5, z1: BACK_LANE.z0 - 0.2 }, v) },
      // coming up road B from the sea: hold short of the bays while someone backs out across the lane
      { at: [B.north, BACKING_HOLD], near: 1.2, commit: false, open: nobodyBacking },
      // road A's lights — and on the green, still wait for anyone turning in the junction, or on their way into it
      // from road B
      { at: [12.9, LANE.east], near: 1.2, open: (v, t) => signals()?.vehicle(t) === 'g' && !turningIn(JUNCTION, v) && !enteringFromB(v) },
      { at: [22.2, LANE.west], near: 1.2, open: (v, t) => signals()?.vehicle(t) === 'g' && !turningIn(JUNCTION, v) && !enteringFromB(v) },
      // eastbound along the shore: hold short of the T while someone swings round into or out of road B — a
      // truck's nose or tail sweeps over this lane on the turn
      { at: [13.4, COAST_LANE.east], near: 1.2, commit: false, open: (v) => !swingingUp(v) && !turningOut(v) },
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
      return c ? [{ at: c.s, commit: false, open: (v, t) => oncomingClear(c.x, v, 26, t) }] : [];
    };

    // ---------------------------------------------------------------- the ways through
    const starts: Record<RoadEnd, Pose> = {
      west: { x: -EDGE, z: LANE.east, heading: R },
      east: { x: EDGE, z: LANE.west, heading: -R },
      'shore-west': { x: -EDGE, z: COAST_LANE.east, heading: R },
      'shore-east': { x: EDGE, z: COAST_LANE.west, heading: -R },
    };
    const from = (e: RoadEnd) => { const s = starts[e]; return path(s.x, s.z, s.heading); };
    /** off road A at end `e` and round into road B, heading down it (−z) in the lane towards the sea */
    const intoB = (e: 'west' | 'east') => e === 'west'
      ? from('west').speed(SPEED.a).line(12.1, LANE.east).curve(B.south, 8.0, Math.PI).speed(SPEED.b)
      : from('east').speed(SPEED.a).line(21, LANE.west).curve(B.south, 10.1, Math.PI).speed(SPEED.b);
    /** on up road B (+z, the lane away from the sea), through the junction and off along road A towards `e` */
    const outOfB = (b: PathBuilder, e: 'west' | 'east') => e === 'east'
      ? b.speed(SPEED.b).line(B.north, 8.9).curve(22, LANE.east, R).speed(SPEED.a).line(EDGE, LANE.east)
      : b.speed(SPEED.b).line(B.north, 11.1).curve(15, LANE.west, -R).speed(SPEED.a).line(-EDGE, LANE.west);
    /** on down road B (heading −z in the lane towards the sea), over the crossing, and at the T left or right along the shore */
    const toShore = (b: PathBuilder, e: 'shore-west' | 'shore-east') => e === 'shore-west'
      ? b.speed(SPEED.b).line(B.south, COAST_LANE.west + 3).speed(SPEED.turn).curve(B.south - 3, COAST_LANE.west, -R).speed(SPEED.a).line(-EDGE, COAST_LANE.west)
      : b.speed(SPEED.b).line(B.south, COAST_LANE.east + 4.4).speed(SPEED.turn).curve(B.south + 4.4, COAST_LANE.east, R).speed(SPEED.a).line(EDGE, COAST_LANE.east);
    /** along the shore from end `e` and up road B (+z), over the crossing: a left turn from the east, a right turn from the west */
    const fromShore = (e: 'shore-west' | 'shore-east') => e === 'shore-east'
      ? from(e).speed(SPEED.a).line(B.north + 3, COAST_LANE.west).speed(SPEED.turn).curve(B.north, COAST_LANE.west + 3, 0).speed(SPEED.b)
      : from(e).speed(SPEED.a).line(B.north - 5, COAST_LANE.east).speed(SPEED.turn).curve(B.north, COAST_LANE.east + 5, 0).speed(SPEED.b);
    const ways = new Map<string, Path>([
      ['west>east', from('west').speed(SPEED.a).line(EDGE, LANE.east).build()],
      ['east>west', from('east').speed(SPEED.a).line(-EDGE, LANE.west).build()],
      ['shore-west>shore-east', from('shore-west').speed(SPEED.a).line(EDGE, COAST_LANE.east).build()],
      ['shore-east>shore-west', from('shore-east').speed(SPEED.a).line(-EDGE, COAST_LANE.west).build()],
    ]);
    for (const a of ['west', 'east'] as const) for (const b of ['shore-west', 'shore-east'] as const) {
      ways.set(`${a}>${b}`, toShore(intoB(a), b).build());
      ways.set(`${b}>${a}`, outOfB(fromShore(b), a).build());
    }
    /**
     * Heading down road B off road A: wait at the junction's edge, in its lane on road A (never in the junction
     * itself, where it would hold up road B's turn), while someone backs out of a bay down there.
     */
    // a right turn in waits for anyone about to turn left in (both held here, they would meet in road B's mouth)
    const leftTurnerWaiting = (self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !!o.leg && downB(o.leg.path)
      && inRect({ x0: 3, x1: 14, z0: LANE.east - 1.7, z1: LANE.east + 1.7 })(o));
    // and a left turn in waits for anyone already in the junction, turning right down there
    const rightTurnerTurning = (self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !!o.leg && downB(o.leg.path)
      && o.leg.path.start.x > 0 && inRect({ x0: 13, x1: 23, z0: 7.6, z1: 16.8 })(o));
    const turnGate = (p: Path, may?: (v: Vehicle) => boolean): Gate[] => {
      if (!downB(p)) return [];
      const w = p.start.x < 0, at = p.project(w ? 10.6 : 23.4, w ? LANE.east : LANE.west);
      if (at.off > 1) return [];
      // `may` (taking a lock, say) is only asked in the last stretch before the junction, and only of whoever is
      // first in line there — never of someone queueing behind, who could take it and then not get past
      const hold = w ? { x: 10.6, z: LANE.east } : { x: 23.4, z: LANE.west }, sx = w ? 1 : -1;
      const first = (v: Vehicle) => !traffic.vehicles.some((o) => o !== v && !o.done && !o.parked && Math.abs(o.pose.z - v.pose.z) < 1.5
        && (o.pose.x - v.pose.x) * sx > 0 && (hold.x - o.pose.x) * sx > -4);
      return [{
        at: at.s, commit: false,
        open: (v) => nobodyBacking(v) && (w ? !rightTurnerTurning(v) : !leftTurnerWaiting(v))
          && (!may || Math.hypot(v.pose.x - hold.x, v.pose.z - hold.z) > 15 || (first(v) && may(v))),
      }];
    };
    /** coming along the coast road towards x within `secs` (eastbound from −x, westbound from +x) */
    const alongShore = (lane: 'east' | 'west', x: number, secs: number, self: Vehicle) => {
      const z = COAST_LANE[lane], dir = lane === 'east' ? 1 : -1;
      return traffic.vehicles.some((v) => {
        if (v === self || v.done || v.parked || Math.abs(v.pose.z - z) > 1.7) return false;
        const d = (x - v.pose.x) * dir;
        return d > -3 && (v.v < 0.8 ? d < 7 : d < Math.max(8, v.v * secs + 5));
      });
    };
    /**
     * The T at the bottom of road B: stop at the line, then out when there is a gap — left: in the near lane, from
     * the east; right: both lanes. And up from the shore, a right turn waits for westbound traffic.
     */
    const shoreGates = (p: Path): Gate[] => {
      const g: Gate[] = [];
      const down = p.project(B.south, T_STOP);
      if (down.off < 1.2 && p.end.z < COAST.z1) {
        const left = p.end.x < 0;
        g.push({ at: [B.south, T_STOP], near: 1.2, halt: 0.8, commit: false,
          open: (v) => !alongShore('west', B.south - 2, 4, v) && (left ? !alongShore('east', B.south - 1, 2.5, v) : !alongShore('east', B.south + 4, 4, v)) });
      }
      // a left turn up from the east waits for the eastbound lane to clear the T before it swings round
      if (upFromEast(p)) g.push({ at: [B.north + 3.4, COAST_LANE.west], near: 1.2, commit: false, open: (v) => !alongShore('east', B.north + 6, 2.5, v) });
      if (p.start.z < COAST.z1 && p.start.x < 0 && p.end.z > COAST.z1) {
        const c = crossing(p, (COAST.z0 + COAST.z1) / 2, 1);
        if (c) g.push({ at: Math.max(0, c.s - 0.5), commit: false, open: (v) => !alongShore('west', c.x + 2, 4, v) });
      }
      return g;
    };
    const gatesFor = (p: Path) => [...standard, ...yieldGate(p), ...turnGate(p), ...shoreGates(p)];
    const wayGates = new Map([...ways].map(([k, p]) => [k, gatesFor(p)]));
    wayGates.get('east>west')!.push({ at: [22.2, LANE.west], near: 1.2, open: roomWest });
    const roomWestGate: Gate = { at: [B.north, 2.9], near: 1.2, open: roomWest };
    for (const b of ['shore-west', 'shore-east']) wayGates.get(`${b}>west`)!.push(roomWestGate);

    // ---------------------------------------------------------------- road B's west side: bays and the back lane
    /** someone in road B's lane at x, between z0 and z1 (moving or not) */
    const inB = (x: number, z0: number, z1: number, self: Vehicle) => traffic.vehicles.some((o) => o !== self && !o.done && !o.parked
      && Math.abs(o.pose.x - x) < 1.8 && o.pose.z > z0 && o.pose.z < z1);
    /** will anyone coming down road B (−z) reach z within `secs`? Counting those still out on road A, turning in */
    const comingDown = (z: number, secs: number, self: Vehicle) => traffic.vehicles.some((o) => {
      if (o === self || o.done || o.parked) return false;
      const inLane = Math.abs(o.pose.x - B.south) < 1.8 && Math.cos(o.pose.heading) < -0.2;
      // where its drive starts and ends tells whether it is on its way down road B (to the shore, a bay, the lane)
      const turning = !!o.leg && downB(o.leg.path) && o.pose.z > 7 && Math.hypot(o.pose.x - B.south, o.pose.z - 9) < 30;
      const d = o.pose.z - z;
      return (inLane || turning) && d > -2 && (o.v < 0.8 ? d < 9 : d < Math.max(9, o.v * secs + 5) || turning);
    });
    /** will anyone coming up road B (+z, from the sea) reach z within `secs`? */
    const comingUp = (z: number, secs: number, self: Vehicle) => traffic.vehicles.some((o) => {
      if (o === self || o.done || o.parked || Math.cos(o.pose.heading) < 0.5 || Math.abs(o.pose.x - B.north) > 1.8) return false;
      const d = z - o.pose.z;
      return d > -2 && (o.v < 0.8 ? d < 9 : d < Math.max(9, o.v * secs + 5));
    });

    const service: RoadService = {
      traffic,
      clip,
      ways: [...ways.keys()].map((k) => k.split('>') as [RoadEnd, RoadEnd]),
      free(e) {
        const s = starts[e];
        const r = { x0: Math.min(s.x, s.x + Math.sin(s.heading) * 10) - 6, x1: Math.max(s.x, s.x + Math.sin(s.heading) * 10) + 6, z0: s.z - 1.5, z1: s.z + 1.5 };
        // the east ends are only a dozen metres from a junction: nobody turns up there while someone turns across it
        if (e === 'east' && turningIn(JUNCTION)) return false;
        if (e === 'shore-east' && turningIn(T_ZONE)) return false;
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
      pullIn(e, to, o = {}) {
        // round into road B, down the lane and round again (a quarter turn) into the bay; it may only turn in off
        // road A once `enter` says yes, so it never has to give up halfway and drive on by
        const r = 3.2;
        const p = intoB(e).line(B.south, Math.min(to.z + r + 2, 7.8)).speed(4).line(B.south, to.z + r)
          .speed(SPEED.turn).curve(B.south - r, to.z, -R, 0.45).speed(SPEED.lot).line(to.x, to.z).build();
        return drive(p, { speed: SPEED.a, gates: [...standard, ...yieldGate(p), ...turnGate(p, o.enter)] });
      },
      backOut(f, e, o = {}) {
        // the tail leads out into road B and swings round, so the nose ends up along the lane it drives off in:
        // down road B in the near lane, or across into the far lane and up to the junction
        const down = shore(e), r = 3, lane = down ? B.south : B.north, z = f.z + (down ? r : -r);
        const back = path(f.x, f.z, R).speed(1.6).line(lane - r, f.z).curve(lane, z, down ? 0 : Math.PI, 0.4).build();
        const off = (shore(e) ? toShore(path(lane, z, Math.PI), e) : outOfB(path(lane, z, 0), e)).build();
        const offGates = [...gatesFor(off), ...(e === 'west' ? [roomWestGate] : [])];
        // the gap: nobody in the lanes it backs across, nobody about to arrive there; the longer the wait, the
        // smaller the gap that will do
        // (whichever way it goes, it holds the traffic coming up: nobody may be on the crossing then, or they would be
        // held there while it backs out)
        const clear = (v: Vehicle, secs: number) => !inB(B.south, f.z - 6, f.z + 7, v) && !comingDown(f.z, secs, v) && !crossingUp(v)
          && (down || (!inB(B.north, f.z - 8, f.z + 4, v) && !comingUp(f.z, secs, v)));
        let since = -1;
        return [
          until((v, t) => {
            if (since < 0) since = t;
            if (!nobodyBacking(v) || !clear(v, 4.2 - 1.2 * Math.min(1, (t - since) / 25)) || (o.ready && !o.ready(v))) return false;
            backing.add(v);
            const done = v.onDispose;
            v.onDispose = () => { backing.delete(v); done?.(); };
            return true;
          }),
          drive(back, { reverse: true, speed: 1.6 }),
          run((v) => { backing.delete(v); o.onRoad?.(v); }),
          drive(off, { speed: SPEED.b, gates: offGates, through: true }),
        ];
      },
      intoLane(e, x) {
        const r = 3.5;
        const p = intoB(e).line(B.south, BACK_Z + r).speed(SPEED.turn).curve(B.south - r, BACK_Z, -R, 0.45).speed(5).line(x, BACK_Z).build();
        // it turns off before the stretch the 停止禁止 box keeps clear for, so that gate isn't its business
        return drive(p, { speed: SPEED.a, gates: gatesFor(p).filter((g) => !(Array.isArray(g.at) && g.at[1] === BACK_LANE.z1 + 0.3)) });
      },
      alongLane() {
        return drive((v) => path(v.pose.x, v.pose.z, -R).speed(5).line(-EDGE, BACK_Z).build(), { speed: 5, through: true });
      },
    };
    ctx.services.provide<RoadService>('world.roads', service);
  },
});
