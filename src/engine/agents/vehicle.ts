// Vehicles: cars, trucks and buses that follow drawn paths, the way an Actor walks people through a script.
// A vehicle runs a queue of small steps — drive(path) · wait(s) · until(fn) · run(fn) · engine(on) — and while
// driving it brakes for the end of the path, closed gates (red lights, a stop sign, people on a crossing),
// the vehicle ahead and anyone standing in its way. Roads are content: a world mod draws the paths and gates.
import * as THREE from 'three';
import type { Surfaces, Rect } from '../surfaces';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A position and heading on the ground (heading 0 = +z, π/2 = +x, as for actors). */
export interface Pose { x: number; z: number; heading: number }

/** comfortable braking, hard braking, sideways grip in bends (m/s²) */
const BRAKE = 3.2, BRAKE_MAX = 7, LATERAL = 2.2;

// ------------------------------------------------------------------ paths

/** A drivable line: straight runs and smooth bends, densely sampled, with a speed limit at every sample. */
export class Path {
  readonly length: number;
  readonly start: Pose;
  readonly end: Pose;
  private readonly hs: number[] = [];
  private readonly ss: number[] = [];
  /** speed limit: the drawn limit, lowered in bends */
  private readonly vs: number[] = [];

  constructor(private readonly xs: number[], private readonly zs: number[], limits: number[]) {
    const n = xs.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i) s += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      this.ss.push(s);
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      this.hs.push(Math.atan2(xs[b] - xs[a], zs[b] - zs[a]));
    }
    this.length = s;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const k = Math.abs(wrap(this.hs[b] - this.hs[a])) / Math.max(0.01, this.ss[b] - this.ss[a]);
      this.vs.push(Math.min(limits[i], Math.sqrt(LATERAL / Math.max(k, 1e-4))));
    }
    this.start = { x: xs[0], z: zs[0], heading: this.hs[0] };
    this.end = { x: xs[n - 1], z: zs[n - 1], heading: this.hs[n - 1] };
  }

  private index(s: number) {
    const ss = this.ss;
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  /** The pose at distance s along the path. */
  at(s: number, out: Pose = { x: 0, z: 0, heading: 0 }) {
    s = Math.max(0, Math.min(this.length, s));
    const i = this.index(s), j = Math.min(i + 1, this.ss.length - 1);
    const f = j === i ? 0 : (s - this.ss[i]) / (this.ss[j] - this.ss[i]);
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * f;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * f;
    out.heading = this.hs[i] + wrap(this.hs[j] - this.hs[i]) * f;
    return out;
  }

  /** Distance along the path closest to (x, z), and how far (x, z) lies off it. */
  project(x: number, z: number) {
    let best = { s: 0, off: Infinity };
    for (let i = 0; i + 1 < this.xs.length; i++) {
      const ax = this.xs[i], az = this.zs[i], dx = this.xs[i + 1] - ax, dz = this.zs[i + 1] - az;
      const l2 = dx * dx + dz * dz || 1;
      const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const off = Math.hypot(ax + dx * f - x, az + dz * f - z);
      if (off < best.off) best = { s: this.ss[i] + Math.sqrt(l2) * f, off };
    }
    return best;
  }

  /** The slowest speed the samples between s0 and s1 allow, as a speed allowed now at s0 (braking at `brake`). */
  limitAhead(s0: number, s1: number, brake = BRAKE) {
    let v = Infinity;
    for (let i = this.index(s0); i < this.ss.length && this.ss[i] <= s1; i++) {
      const d = Math.max(0, this.ss[i] - s0);
      v = Math.min(v, Math.sqrt(this.vs[i] * this.vs[i] + 2 * brake * d));
    }
    return v;
  }

  /** How much the path turns between s0 and s1 (radians; positive = to the left). */
  turn(s0: number, s1: number) {
    const i = this.index(Math.max(0, s0)), j = this.index(Math.min(this.length, s1));
    let sum = 0;
    for (let k = i; k < j; k++) sum += wrap(this.hs[k + 1] - this.hs[k]);
    return sum;
  }
}

/** Draw a path from a starting pose: `path(x, z, heading).speed(8).line(…).curve(…).build()`. */
export class PathBuilder {
  private xs: number[] = [];
  private zs: number[] = [];
  private vs: number[] = [];
  private v = Infinity;
  private h: number;

  constructor(x: number, z: number, heading: number) {
    this.h = heading;
    this.push(x, z);
  }
  private get x() { return this.xs[this.xs.length - 1]; }
  private get z() { return this.zs[this.zs.length - 1]; }
  private push(x: number, z: number) { this.xs.push(x); this.zs.push(z); this.vs.push(this.v); }

  /** where the path drawn so far ends, and which way it is heading there */
  get end(): Pose { return { x: this.x, z: this.z, heading: this.h }; }

  /** Speed limit (m/s) for what is drawn next. */
  speed(v: number) { this.v = v; return this; }

  /** Straight to (x, z). */
  line(x: number, z: number) {
    const x0 = this.x, z0 = this.z, len = Math.hypot(x - x0, z - z0);
    if (len < 1e-3) return this;
    const n = Math.max(1, Math.ceil(len / 1));
    for (let i = 1; i <= n; i++) this.push(x0 + ((x - x0) * i) / n, z0 + ((z - z0) * i) / n);
    this.h = Math.atan2(x - x0, z - z0);
    return this;
  }
  /** Straight on for `dist` metres. */
  ahead(dist: number) { return this.line(this.x + Math.sin(this.h) * dist, this.z + Math.cos(this.h) * dist); }

  /** A smooth bend (cubic Bézier) to (x, z), arriving with `heading`. `bend` sets how round it is. */
  curve(x: number, z: number, heading: number, bend = 0.42) {
    const x0 = this.x, z0 = this.z;
    const chord = Math.hypot(x - x0, z - z0), k = chord * bend;
    const p1x = x0 + Math.sin(this.h) * k, p1z = z0 + Math.cos(this.h) * k;
    const p2x = x - Math.sin(heading) * k, p2z = z - Math.cos(heading) * k;
    const n = Math.max(8, Math.ceil(chord / 0.25));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      this.push(a * x0 + b * p1x + c * p2x + d * x, a * z0 + b * p1z + c * p2z + d * z);
    }
    this.h = heading;
    return this;
  }

  build() { return new Path(this.xs, this.zs, this.vs); }
}

export const path = (x: number, z: number, heading: number) => new PathBuilder(x, z, heading);

/** A point to drive through: [x, z] to go straight there, or a pose to bend round to. */
export type Waypoint = readonly [number, number] | Pose;
/** Draw on through some waypoints. */
export function through(b: PathBuilder, points: readonly Waypoint[]) {
  for (const w of points) {
    if (Array.isArray(w)) b.line(w[0], w[1]);
    else { const q = w as Pose; b.curve(q.x, q.z, q.heading); }
  }
  return b;
}

// ------------------------------------------------------------------ vehicles

/** What a vehicle drives: a car, a truck, a bus. The library's vehicles implement this. */
export interface VehicleBody {
  root: THREE.Object3D;
  /** overall length and width, metres */
  len: number;
  width: number;
  /** roll the wheels by this distance */
  spin(distance: number): void;
  lamps?(l: Lamps, t: number): void;
  /** how much of it shows, 0…1 (see Vehicle.presence): a body fades itself, so no cut-off part is ever seen */
  fade?(presence: number): void;
  dispose?(): void;
}

export interface Lamps {
  /** headlights 0…1 (0 with the engine off) */
  head: number;
  brake: boolean;
  reverse: boolean;
  blink: 'left' | 'right' | 'hazard' | null;
  engine: boolean;
  /** a brief flash when clicked */
  flash: number;
}

/** A place on a path the vehicle may not pass until it opens: a red light, a stop sign, a crossing. */
export interface Gate {
  /** where the *front* of the vehicle stops: a point near the path, or a distance along it */
  at: readonly [number, number] | number;
  /** may it go on? Checked until the vehicle is past. Omitted = always open (use with halt). */
  open?(v: Vehicle, t: number): boolean;
  /** stop completely for this many seconds first (a stop sign) */
  halt?: number;
  /** a point gate only applies if the path passes this close to it (default 1.6) — so one list fits every path */
  near?: number;
  /** if it closes while the vehicle can no longer stop comfortably, drive on (default true, like an amber light) */
  commit?: boolean;
}

export interface DriveOptions {
  /** drive backwards along the path */
  reverse?: boolean;
  /** cruising speed, m/s (bends and the path's own limits slow it further) */
  speed?: number;
  gates?: Gate[];
  /** don't stop at the end (the path runs off the edge of the world) */
  through?: boolean;
  /** turn signals before bends (default true when driving forwards) */
  signals?: boolean;
}

export interface VehicleStep {
  instant?: boolean;
  started?: boolean;
  fn?: (v: Vehicle, t: number) => void;
  start?(v: Vehicle, t: number): void;
  tick?(v: Vehicle, dt: number, t: number): boolean;
}
export type VehicleSteps = VehicleStep | VehicleSteps[];

interface LiveGate extends Gate { s: number; passed: boolean; halted: boolean; haltT: number; committed: boolean }
interface Leg { path: Path; o: DriveOptions; gates: LiveGate[] }

export interface VehicleOptions {
  at?: Pose;
  label?: string;
  /** what sort of vehicle (content decides: 'taxi', 'bus'…) */
  kind?: string;
  tags?: string[];
  /** acceleration, m/s² */
  accel?: number;
}

let nextId = 1;
/** Departures fade by distance; arrivals finish fading even if a light stops them near the edge. */
const EDGE_FADE = 3;
const FADE_IN = 0.8, EDGE_CLEARANCE = 0.2;
const flat = (s: VehicleSteps): VehicleStep[] => (Array.isArray(s) ? s.flatMap(flat) : [s]);

export class Vehicle {
  readonly id = nextId++;
  readonly root: THREE.Object3D;
  readonly kind: string;
  readonly tags: Set<string>;
  readonly label: string;
  readonly pose: Pose = { x: 0, z: 0, heading: 0 };
  /** current speed along the path (m/s, always ≥ 0) */
  v = 0;
  /** distance along the current path */
  s = 0;
  /** engine running: lights follow the weather; off = dark */
  engine = true;
  /** not driving anywhere just now (parked, or waiting with the engine running in its bay): others' paths are
   *  drawn around where it stands, so they don't look out for it */
  get parked() { return !this.leg; }
  hazard = false;
  accel: number;
  leg: Leg | null = null;
  /** what it is waiting behind (another vehicle, a person) */
  blocker: Vehicle | object | null = null;
  done = false;
  onDispose?: () => void;
  readonly lamps: Lamps = { head: 0, brake: false, reverse: false, blink: null, engine: true, flash: 0 };
  private queue: VehicleStep[] = [];
  private stuck = 0;
  ghost = 0;
  private y = 0;
  private arrivalPresence = 0;
  /** Actual path direction, retained while waiting too; reversing points the body the other way. */
  private travelHeading = 0;

  constructor(readonly body: VehicleBody, private readonly traffic: Traffic, o: VehicleOptions = {}) {
    this.root = body.root;
    this.kind = o.kind ?? 'car';
    this.label = o.label ?? '汽车';
    this.tags = new Set(o.tags ?? []);
    this.accel = o.accel ?? 2.2;
    if (o.at) this.place(o.at);
  }

  /** Clearance of the whole footprint at each edge (west, east, north, south), including turns. */
  private edgeClearances(): [number, number, number, number] {
    const B = this.traffic.env.bounds, p = this.pose;
    const fx = Math.abs(Math.sin(p.heading)), fz = Math.abs(Math.cos(p.heading));
    const rx = fx * this.half + fz * this.halfWidth, rz = fz * this.half + fx * this.halfWidth;
    return [p.x - rx - B.x0, B.x1 - p.x - rx, p.z - rz - B.z0, B.z1 - p.z - rz];
  }

  /**
   * One fade for the whole body, so no clipped cross-section shows. Once fully inside, a red light or queue
   * cannot freeze its arrival half-transparent. Only edges it is heading out towards apply the distance fade.
   */
  get presence() {
    const [west, east, north, south] = this.edgeClearances();
    // Leave room for the inset clipping planes and small details outside the nominal body dimensions.
    if (Math.min(west, east, north, south) <= EDGE_CLEARANCE) return 0;
    const fx = Math.sin(this.travelHeading), fz = Math.cos(this.travelHeading);
    const exit = Math.min(fx < -1e-4 ? west : fx > 1e-4 ? east : Infinity,
      fz < -1e-4 ? north : fz > 1e-4 ? south : Infinity);
    return Math.min(this.arrivalPresence, (exit - EDGE_CLEARANCE) / (EDGE_FADE - EDGE_CLEARANCE));
  }

  /** Has it got past the gate placed at `at` on its current leg (the same `at` the Gate was given)? The engine's own
   * test, so callers needn't guess where along the path that happens. */
  passedGate(at: Gate['at']) { return !!this.leg?.gates.some((g) => g.at === at && g.passed); }
  get half() { return this.body.len / 2; }
  get halfWidth() { return this.body.width / 2; }
  get idle() { return this.queue.length === 0; }

  place(p: Pose) {
    Object.assign(this.pose, p);
    this.travelHeading = p.heading;
    this.y = this.traffic.env.surfaces.walkAt(p.x, p.z);
    this.apply(p.heading);
  }

  then(...steps: VehicleSteps[]) {
    this.queue.push(...steps.flatMap(flat));
    return this;
  }
  /** Do these next, before the rest of the script. */
  insert(...steps: VehicleSteps[]) { this.queue.unshift(...steps.flatMap(flat)); return this; }
  /** Drop the rest of the script and do these instead (a change of plan). */
  replace(...steps: VehicleSteps[]) { this.queue = steps.flatMap(flat); return this; }

  /** @internal start driving a path (used by the drive step) */
  begin(p: Path, o: DriveOptions) {
    const gates: LiveGate[] = [];
    for (const g of o.gates ?? []) {
      let s: number;
      if (typeof g.at === 'number') s = g.at;
      else {
        const pr = p.project(g.at[0], g.at[1]);
        if (pr.off > (g.near ?? 1.6)) continue;
        s = pr.s;
      }
      s -= this.half + 0.3;
      if (s < -0.5 && typeof g.at !== 'number') continue;
      gates.push({ ...g, s: Math.max(0, s), passed: false, halted: false, haltT: 0, committed: false });
    }
    this.leg = { path: p, o, gates };
    this.s = 0;
  }

  /** @internal one frame of driving; true when the path is done */
  drive(dt: number, t: number) {
    const L = this.leg!, P = L.path, o = L.o;
    const s = this.s;
    let want = (o.speed ?? 8) * this.traffic.speedScale;
    // bends ahead
    want = Math.min(want, P.limitAhead(s, s + (this.v * this.v) / (2 * BRAKE) + 2));
    // hard stops: the end of the path, closed gates
    let stopAt = o.through ? Infinity : P.length;
    for (const g of L.gates) {
      if (g.passed) continue;
      const dist = g.s - s;
      if (dist < -0.05) { g.passed = true; continue; }
      if (g.halt && !g.halted) {
        if (dist < 0.4 && this.v < 0.1) g.haltT += dt;
        if (g.haltT >= g.halt) g.halted = true;
        else { stopAt = Math.min(stopAt, g.s); continue; }
      }
      if (!g.open || g.open(this, t)) { g.committed = false; continue; }
      if (g.committed) continue;
      if ((g.commit ?? true) && this.v > 2 && (this.v * this.v) / (2 * Math.max(dist, 0.01)) > 4.5) { g.committed = true; continue; }
      stopAt = Math.min(stopAt, g.s);
    }
    if (stopAt < Infinity) {
      const d = stopAt - s;
      want = Math.min(want, d <= 0.005 ? 0 : Math.max(0.35, Math.sqrt(2 * BRAKE * d)));
    }
    // whatever is in the way — short of where a closed gate stops it anyway: beyond that it is not its business yet
    // (a car at a T would otherwise brake early for the traffic it is about to wait for, short of its line)
    const hit = this.traffic.ahead(this, P, s, o.reverse ?? false, stopAt < Infinity ? stopAt - s + this.half + 0.5 : Infinity);
    this.blocker = hit?.what ?? null;
    if (hit) want = Math.min(want, Math.max(0, Math.min(Math.sqrt(2 * BRAKE * Math.max(0, hit.d - hit.gap)), (hit.d - hit.gap) * 1.4)));
    // a jam nobody can untangle — vehicles waiting on each other round in a circle — is broken by squeezing past.
    // Queueing behind someone who waits at a light or a gate is not a jam, however long the wait (but after a
    // couple of minutes of that, squeeze past anyway: something is waiting on something that will never come).
    if (this.blocker instanceof Vehicle && this.v < 0.05) this.stuck += dt; else this.stuck = 0;
    if ((this.stuck > 40 && this.waitsInCircle()) || this.stuck > 120) { this.ghost = 3; this.stuck = 0; }
    this.ghost = Math.max(0, this.ghost - dt);

    const before = this.v;
    this.v = this.v < want ? Math.min(want, this.v + this.accel * dt) : Math.max(want, this.v - BRAKE_MAX * dt);
    let ns = s + this.v * dt;
    if (ns >= stopAt) { ns = stopAt; this.v = 0; }
    this.s = ns;
    const moved = ns - s;
    const pose = P.at(ns, this.pose);
    this.travelHeading = pose.heading;
    this.apply(o.reverse ? pose.heading + Math.PI : pose.heading);
    this.body.spin(o.reverse ? -moved : moved);

    this.lamps.brake = this.v < before - 0.02 || this.v < 0.05;
    this.lamps.reverse = !!o.reverse;
    if (o.signals ?? !o.reverse) {
      const turn = P.turn(ns, ns + 12 + this.half);
      this.lamps.blink = Math.abs(turn) > 0.6 ? (turn > 0 ? 'left' : 'right') : null;
    } else this.lamps.blink = null;
    if (o.through && ns >= P.length) return true;
    return !o.through && ns >= P.length - 0.01 && this.v < 0.4;
  }

  /** Following who blocks whom from here comes back round to this vehicle. */
  private waitsInCircle() {
    let b = this.blocker;
    for (let i = 0; i < 12 && b instanceof Vehicle; i++) {
      if (b === this) return true;
      b = b.blocker;
    }
    return false;
  }

  private apply(heading: number) {
    const p = this.pose;
    p.heading = heading;
    const env = this.traffic.env;
    const k = this.leg ? 0.15 : 1;
    this.y += (env.surfaces.walkAt(p.x, p.z) - this.y) * k;
    this.root.position.set(p.x, this.y, p.z);
    // the bodies are modelled nose along +x
    this.root.rotation.y = heading - Math.PI / 2;
  }

  update(dt: number, t: number) {
    let step = this.queue[0];
    while (step && step.instant) { this.queue.shift(); step.fn!(this, t); step = this.queue[0]; }
    if (step) {
      if (!step.started) { step.started = true; step.start?.(this, t); }
      if (step.tick!(this, dt, t) && this.queue[0] === step) this.queue.shift();
    } else {
      this.dispose();
      return;
    }
    if (!this.leg) { this.lamps.brake = this.engine; this.lamps.reverse = false; this.lamps.blink = null; this.v = 0; }
    this.lamps.engine = this.engine;
    this.lamps.head = this.engine ? this.traffic.env.headlights() : 0;
    if (this.hazard) this.lamps.blink = 'hazard';
    if (!this.engine) this.lamps.brake = false;
    this.lamps.flash = Math.max(0, this.lamps.flash - dt * 2.5);
    this.body.lamps?.(this.lamps, t);
    this.arrivalPresence = Math.min(...this.edgeClearances()) > EDGE_CLEARANCE
      ? Math.min(1, this.arrivalPresence + dt / FADE_IN) : 0;
    this.body.fade?.(this.presence);
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    this.root.parent?.remove(this.root);
    this.body.dispose?.();
    this.onDispose?.();
  }
}

// ------------------------------------------------------------------ steps

/** Drive along a path (see DriveOptions). */
export function drive(p: Path | ((v: Vehicle) => Path), o: DriveOptions = {}): VehicleStep {
  return {
    start(v) { v.begin(typeof p === 'function' ? p(v) : p, o); },
    tick(v, dt, t) {
      if (!v.drive(dt, t)) return false;
      v.leg = null;
      if (!o.through) v.v = 0;
      return true;
    },
  };
}
export const wait = (seconds: number): VehicleStep => {
  let left = seconds;
  return { tick(_v, dt) { left -= dt; return left <= 0; } };
};
export const until = (fn: (v: Vehicle, t: number) => boolean): VehicleStep => ({ tick: (v, _dt, t) => fn(v, t) });
export const run = (fn: (v: Vehicle, t: number) => void): VehicleStep => ({ instant: true, fn });
/** Decide what to do next when this point is reached: the steps returned run before the rest. */
export const choose = (fn: (v: Vehicle, t: number) => VehicleSteps): VehicleStep => run((v, t) => { v.insert(fn(v, t)); });
/** Start or stop the engine (lights follow it). */
export const engine = (on: boolean): VehicleStep => run((v) => { v.engine = on; });

// ------------------------------------------------------------------ traffic

/** Do two rectangles overlap? Each: centre, heading, half-length (along the heading), half-width. */
function overlap(ax: number, az: number, ah: number, al: number, aw: number, bx: number, bz: number, bh: number, bl: number, bw: number) {
  const dx = bx - ax, dz = bz - az;
  const axes = [[Math.sin(ah), Math.cos(ah)], [Math.cos(ah), -Math.sin(ah)], [Math.sin(bh), Math.cos(bh)], [Math.cos(bh), -Math.sin(bh)]];
  const a1 = axes[0], a2 = axes[1], b1 = axes[2], b2 = axes[3];
  for (const [nx, nz] of axes) {
    const ra = al * Math.abs(a1[0] * nx + a1[1] * nz) + aw * Math.abs(a2[0] * nx + a2[1] * nz);
    const rb = bl * Math.abs(b1[0] * nx + b1[1] * nz) + bw * Math.abs(b2[0] * nx + b2[1] * nz);
    if (Math.abs(dx * nx + dz * nz) > ra + rb) return false;
  }
  return true;
}

export interface TrafficEnv {
  surfaces: Surfaces;
  parent: THREE.Object3D;
  /** people the drivers look out for */
  people(): Iterable<{ position: THREE.Vector3; walker: { visibleScale: number; sitting: boolean } }>;
  /** how much headlights are wanted now, 0…1 */
  headlights(): number;
  clickable(object: THREE.Object3D, onClick: () => void, label: string): () => void;
  onClick?(v: Vehicle): void;
  /** where headlight beams are worth drawing (the model); vehicles outside get none */
  bounds: Rect;
}

interface Beam { light: THREE.SpotLight; target: THREE.Object3D; v: Vehicle | null; k: number }

/** Owns every vehicle: updates them, answers "is anything in the way", lends a few real headlight beams. */
export class Traffic {
  readonly vehicles: Vehicle[] = [];
  /** everyone drives a little slower in rain, snow and fog */
  speedScale = 1;
  private beams: Beam[] = [];
  private tmp: Pose = { x: 0, z: 0, heading: 0 };

  constructor(readonly env: TrafficEnv, beams = 2) {
    // a fixed pool of lights, so the number of lights in the scene never changes (that would recompile shaders)
    for (let i = 0; i < beams; i++) {
      const light = new THREE.SpotLight('#fff1d0', 0, 26, 0.5, 0.5, 1.3);
      const target = new THREE.Object3D();
      light.target = target;
      env.parent.add(light, target);
      this.beams.push({ light, target, v: null, k: 0 });
    }
  }

  spawn(body: VehicleBody, o: VehicleOptions = {}) {
    const v = new Vehicle(body, this, o);
    this.env.parent.add(v.root);
    v.root.userData.skyIgnore = true;   // it moves: don't let it shelter a patch of road from snow
    const off = this.env.clickable(v.root, () => {
      v.lamps.flash = 1;
      this.env.onClick?.(v);
    }, v.label);
    const prev = v.onDispose;
    v.onDispose = () => { off(); prev?.(); };
    this.vehicles.push(v);
    return v;
  }

  /** Is any vehicle (optionally: matching `filter`) standing or moving inside this rectangle? */
  occupied(r: Rect, filter?: (v: Vehicle) => boolean) {
    return this.vehicles.some((v) => !v.done && v.pose.x > r.x0 && v.pose.x < r.x1 && v.pose.z > r.z0 && v.pose.z < r.z1 && (!filter || filter(v)));
  }

  /** What is in the way of `me` along path P from s on: the nearest vehicle or person, and its distance from my front. */
  ahead(me: Vehicle, P: Path, s: number, _reverse: boolean, upTo = Infinity): { d: number; gap: number; what: Vehicle | object } | null {
    const half = me.half, hw = me.halfWidth;
    const look = Math.min(24, Math.max(7, 4 + (me.v * me.v) / (2 * BRAKE) + me.v * 0.6));
    const reach = half + look + 8;
    const near = this.vehicles.filter((o) => o !== me && !o.done && !o.parked && !(me.ghost > 0)
      && Math.abs(o.pose.x - me.pose.x) < reach && Math.abs(o.pose.z - me.pose.z) < reach);
    const people: THREE.Vector3[] = [];
    for (const p of this.env.people()) {
      if (p.walker.visibleScale < 0.3 || p.walker.sitting) continue;
      const q = p.position;
      if (Math.abs(q.x - me.pose.x) < reach && Math.abs(q.z - me.pose.z) < reach) people.push(q);
    }
    if (!near.length && !people.length) return null;
    const pt = this.tmp;
    for (let ds = half + 0.2; ds <= half + look; ds += 0.5) {
      if (s + ds > P.length + 0.6 || ds > upTo) break;
      P.at(s + ds, pt);
      if (s + ds > P.length) {   // just past the end: keep a little room ahead of where it stops
        const over = s + ds - P.length;
        pt.x += Math.sin(pt.heading) * over; pt.z += Math.cos(pt.heading) * over;
      }
      // a thin slice of my body at this point of the path, against each vehicle's footprint
      for (const o of near) {
        if (!overlap(pt.x, pt.z, pt.heading, 0.3, hw + 0.12, o.pose.x, o.pose.z, o.pose.heading, o.half + 0.2, o.halfWidth + 0.08)) continue;
        // two vehicles waiting on each other further ahead (their paths cross, they are not nose to body):
        // the older one goes first
        if (o.blocker === me && me.blocker === o && me.id < o.id && ds - half > 3) continue;
        // stop well back from one crossing in front: its turn will swing round towards us
        const crossing = Math.abs(wrap(o.pose.heading - pt.heading)) > 0.8 && Math.abs(wrap(o.pose.heading - pt.heading)) < 2.4;
        return { d: ds - half, gap: crossing ? 3 : 1.4, what: o };
      }
      for (const q of people) {
        const r = hw + 0.45;   // a little room: on a bend the body swings wider than the path
        if ((pt.x - q.x) ** 2 + (pt.z - q.z) ** 2 < r * r) return { d: ds - half, gap: 1.1, what: q };
      }
    }
    return null;
  }

  /**
   * Would someone at `at` stepping to (x, z) walk into a vehicle that is driving (or about to)? People give way:
   * they wait at the edge of its footprint, stretched ahead by where it will be in a second. A vehicle already
   * waiting for this very person doesn't count (they go first), and nobody is kept standing inside a footprint.
   */
  inTheWay(at: THREE.Vector3, x: number, z: number) {
    const inside = (v: Vehicle, px: number, pz: number) => {
      const h = v.pose.heading, dx = px - v.pose.x, dz = pz - v.pose.z;
      const along = (dx * Math.sin(h) + dz * Math.cos(h)) * (v.leg?.o.reverse ? -1 : 1);
      const lat = dx * Math.cos(h) - dz * Math.sin(h);
      return Math.abs(lat) < v.halfWidth + 0.45 && along > -v.half - 0.4 && along < v.half + 0.5 + v.v;
    };
    return this.vehicles.some((v) => !v.done && v.leg && v.blocker !== at && inside(v, x, z) && !inside(v, at.x, at.z));
  }

  update(dt: number, t: number) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(dt, t);
      if (v.done) this.vehicles.splice(i, 1);
    }
    this.updateBeams(dt);
  }

  private updateBeams(dt: number) {
    const want = this.env.headlights();
    const B = this.env.bounds;
    // (a vehicle fading out at the edge has given its beam back by the time it's gone)
    const inside = (v: Vehicle) => !v.done && v.engine && v.presence > 0.5 && v.pose.x > B.x0 - 1 && v.pose.x < B.x1 + 1 && v.pose.z > B.z0 - 1 && v.pose.z < B.z1 + 1;
    for (const b of this.beams) {
      if (b.v && (!inside(b.v) || want < 0.05)) { b.k -= dt * 3; if (b.k <= 0) { b.v = null; b.k = 0; } }
      else if (b.v) b.k = Math.min(1, b.k + dt * 2);
      if (!b.v && want > 0.05) {
        const taken = new Set(this.beams.map((x) => x.v));
        const c = this.vehicles.filter((v) => inside(v) && !taken.has(v))
          .sort((p, q) => Math.abs(p.pose.x) + Math.abs(p.pose.z) - Math.abs(q.pose.x) - Math.abs(q.pose.z))[0];
        if (c) b.v = c;
      }
      const v = b.v;
      b.light.intensity = v ? want * 16.7 * b.k : 0;
      if (!v) continue;
      const p = v.pose, sx = Math.sin(p.heading), sz = Math.cos(p.heading), y = v.root.position.y;
      b.light.position.set(p.x + sx * (v.half - 0.2), y + 0.8, p.z + sz * (v.half - 0.2));
      b.target.position.set(p.x + sx * 12, 0, p.z + sz * 12);
    }
  }
}
