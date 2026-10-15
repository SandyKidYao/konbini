// An Actor walks a Walker (a figure, a dog…) through a script — a queue of small steps:
//   go(node) · walk(points) · wait(s) · until(fn) · face(…) · pose(name, s) · sit(…) · stand() · run(fn) · leave()
import * as THREE from 'three';
import type { NavGraph, RouteLeg } from '../nav';
import type { Surfaces } from '../surfaces';
import type { Interact } from '../interact';
import type { Drivers } from '../atmosphere';

/** What an actor can drive. Figures implement this; so could a robot vacuum from a mod. */
export interface Walker {
  root: THREE.Object3D;
  moving: boolean;
  speed: number;
  pose: string;
  sitting: boolean;
  sheltered: boolean;
  leaving: boolean;
  /** 0→1 while appearing, 1→0 while leaving */
  visibleScale: number;
  /** the colour seen from above (the map form draws people as dots of it) */
  color?: string;
  update(dt: number, t: number, d: Drivers): void;
  play(gesture: string, seconds: number): void;
  dispose(): void;
}

export interface AgentEnv {
  nav: NavGraph;
  surfaces: Surfaces;
  interact: Interact;
  parent: THREE.Object3D;
  /** current scene time, for gates */
  time: () => number;
  onWave?: () => void;
  /** things walkers give way to: true = don't step to (x, z) yet (see Director.avoid) */
  blockers?: ((a: Actor, x: number, z: number) => boolean)[];
}

export interface Step {
  instant?: boolean;
  started?: boolean;
  fn?: (a: Actor, t: number, d: Drivers) => void;
  start?(a: Actor, t: number, d: Drivers): void;
  tick?(a: Actor, dt: number, t: number, d: Drivers): boolean;
  end?(a: Actor): void;
}
export type Steps = Step | Steps[];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface ActorOptions {
  x?: number; z?: number;
  /** start at a nav node instead of coordinates */
  at?: string;
  heading?: number;
  speed?: number;
  label?: string;
  tags?: string[];
}

export class Actor {
  readonly root: THREE.Object3D;
  heading: number;
  speed: number;
  /** −1…1: which side of a wide path this person keeps to */
  lane = Math.random() * 2 - 1;
  /** last nav node reached (routing starts from here) */
  node?: string;
  readonly tags: Set<string>;
  readonly followers: ((a: Actor, dt: number, t: number) => void)[] = [];
  onDispose?: () => void;
  done = false;
  /** how long they have been standing aside, giving way */
  waited = 0;
  private queue: Step[] = [];

  constructor(readonly walker: Walker, readonly env: AgentEnv, o: ActorOptions = {}) {
    this.root = walker.root;
    let x = o.x ?? 0, z = o.z ?? 0;
    if (o.at) {
      const n = env.nav.node(o.at);
      if (n) { x = n.x; z = n.z; this.node = n.id; }
    }
    this.root.position.set(x, env.surfaces.walkAt(x, z), z);
    this.heading = o.heading ?? 0;
    this.speed = o.speed ?? 1.15 + Math.random() * 0.3;
    this.tags = new Set(o.tags ?? []);
    env.parent.add(this.root);
    env.interact.clickable(this.root, () => { walker.play('wave', 1.8); env.onWave?.(); }, o.label ?? '路人');
  }

  get position() { return this.root.position; }

  then(...steps: Steps[]) {
    const flat = (s: Steps): Step[] => (Array.isArray(s) ? s.flatMap(flat) : [s]);
    this.queue.push(...steps.flatMap(flat));
    return this;
  }
  get idle() { return this.queue.length === 0; }

  update(dt: number, t: number, d: Drivers) {
    if (this.walker.leaving) this.queue.length = 0;
    let step = this.queue[0];
    while (step && step.instant) { step.fn!(this, t, d); this.queue.shift(); step = this.queue[0]; }
    if (step) {
      if (!step.started) { step.started = true; step.start?.(this, t, d); }
      if (step.tick!(this, dt, t, d)) { step.end?.(this); this.queue.shift(); }
    } else if (!this.walker.leaving && !this.tags.has('resident')) {
      this.walker.leaving = true;
    }
    const p = this.root.position;
    this.walker.sheltered = this.env.surfaces.sheltered(p.x, p.z);
    this.root.rotation.y = this.heading;
    this.walker.update(dt, t, d);
    for (const f of this.followers) f(this, dt, t);
    if (this.walker.leaving && this.walker.visibleScale < 0.02) this.dispose();
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    this.env.interact.remove(this.root);
    this.walker.dispose();
    this.onDispose?.();
  }
}

// ------------------------------------------------------------------ steps
const tmp = new THREE.Vector3();

/** Walk straight through a list of [x, z] points. */
export function walk(points: readonly (readonly [number, number])[], o: { speed?: number } = {}): Step {
  let i = 0;
  return {
    start(a) { a.walker.moving = true; a.walker.speed = o.speed ?? a.speed; a.walker.pose = 'idle'; a.walker.sitting = false; },
    tick(a, dt) {
      const p = a.root.position;
      while (i < points.length) {
        const [tx, tz] = points[i];
        tmp.set(tx - p.x, 0, tz - p.z);
        const dist = tmp.length();
        if (dist < 0.05) { i++; continue; }
        a.heading += wrap(Math.atan2(tmp.x, tmp.z) - a.heading) * Math.min(1, dt * 8);
        // look a stride ahead and give way (to a car coming, say) — but not forever
        const B = a.env.blockers;
        if (B?.length && a.waited < 10) {
          const lx = p.x + (tmp.x / dist) * 0.6, lz = p.z + (tmp.z / dist) * 0.6;
          if (B.some((b) => b(a, lx, lz))) { a.waited += dt; a.walker.moving = false; return false; }
        }
        a.waited = 0;
        a.walker.moving = true;
        const len = Math.min(dist, (o.speed ?? a.speed) * dt);
        p.x += (tmp.x / dist) * len;
        p.z += (tmp.z / dist) * len;
        p.y += (a.env.surfaces.walkAt(p.x, p.z) - p.y) * Math.min(1, dt * 12);
        return false;
      }
      a.walker.moving = false;
      return true;
    },
  };
}

/** Walk to a named nav node along the network, keeping to a lane, waiting at gates, triggering doors. */
export function go(target: string | ((a: Actor) => string), o: { speed?: number; stopFacing?: boolean } = {}): Step {
  let legs: RouteLeg[] = [];
  let leg = 0, entered = -1, sub: Step | null = null, pre: Step | null = null;
  return {
    start(a, t, d) {
      const to = typeof target === 'function' ? target(a) : target;
      const nav = a.env.nav, p = a.position;
      // start from the last node reached — unless we've wandered off it, then from the nearest one
      let from = a.node ? nav.node(a.node) : undefined;
      if (!from || Math.hypot(from.x - p.x, from.z - p.z) > 0.6) from = nav.nearest(p.x, p.z);
      if (!from) return;
      legs = nav.route(from.id, to) ?? [];
      if (!legs.length && from.id !== to) console.warn(`[nav] no route ${from.id} → ${to}`);
      if (Math.hypot(from.x - p.x, from.z - p.z) > 0.05) { pre = walk([[from.x, from.z]], o); pre.start!(a, t, d); }
      a.node = from.id;
    },
    tick(a, dt, t, d) {
      if (pre) { if (!pre.tick!(a, dt, t, d)) return false; pre = null; }
      while (leg < legs.length) {
        const L = legs[leg];
        if (entered < leg) {
          if (L.edge.gate && !L.edge.gate(a.env.time())) { a.walker.moving = false; return false; }
          L.edge.onEnter?.(L.from.id, L.to.id);
          entered = leg;
          // offset sideways by this walker's lane on wide paths
          const dx = L.to.x - L.from.x, dz = L.to.z - L.from.z, len = Math.hypot(dx, dz) || 1;
          const off = (a.lane * L.edge.width) / 2;
          sub = walk([[L.to.x - (dz / len) * off, L.to.z + (dx / len) * off]], o);
          sub.start!(a, t, d);
        }
        if (!sub!.tick!(a, dt, t, d)) return false;
        a.node = L.to.id;
        leg++;
      }
      if (o.stopFacing !== false && legs.length) {
        const h = legs[legs.length - 1].to.heading;
        if (h !== undefined) a.heading += wrap(h - a.heading) * Math.min(1, dt * 7);
      }
      a.walker.moving = false;
      return true;
    },
  };
}

export const wait = (seconds: number): Step => {
  let left = seconds;
  return { tick(a, dt) { a.walker.moving = false; left -= dt; return left <= 0; } };
};
export const until = (fn: (a: Actor, t: number, d: Drivers) => boolean): Step =>
  ({ tick(a, _dt, t, d) { a.walker.moving = false; return fn(a, t, d); } });
export const run = (fn: (a: Actor, t: number, d: Drivers) => void): Step => ({ instant: true, fn });

/** Turn toward an angle (radians, 0 = +z), a nav node id, or a point. */
export function face(target: number | string | readonly [number, number], seconds = 0.45): Step {
  let left = seconds, goal = 0;
  return {
    start(a) {
      if (typeof target === 'number') goal = target;
      else if (typeof target === 'string') {
        const n = a.env.nav.node(target);
        goal = n?.heading ?? (n ? Math.atan2(n.x - a.position.x, n.z - a.position.z) : a.heading);
      } else goal = Math.atan2(target[0] - a.position.x, target[1] - a.position.z);
    },
    tick(a, dt) { a.heading += wrap(goal - a.heading) * Math.min(1, dt * 7); left -= dt; return left <= 0; },
  };
}

export function pose(name: string, seconds: number): Step {
  let left = seconds;
  return {
    start(a) { a.walker.pose = name; },
    tick(_a, dt) { left -= dt; return left <= 0; },
    end(a) { a.walker.pose = a.walker.sitting ? 'sit' : 'idle'; },
  };
}

/** Sit at [x, z] facing `heading`, with the seat top at `seatY`. */
export const sit = (x: number, z: number, heading: number, seatY: number): Step => run((a) => {
  a.root.position.set(x, seatY - 0.78, z);
  a.heading = heading;
  a.walker.sitting = true;
  a.walker.pose = 'sit';
});
export const stand = (x: number, z: number): Step => run((a) => {
  a.root.position.set(x, a.env.surfaces.walkAt(x, z), z);
  a.walker.sitting = false;
  a.walker.pose = 'idle';
});
/** Teleport to a node without walking (e.g. appearing in a doorway). */
export const place = (node: string): Step => run((a) => {
  const n = a.env.nav.node(node);
  if (!n) return;
  a.root.position.set(n.x, a.env.surfaces.walkAt(n.x, n.z), n.z);
  a.node = n.id;
  if (n.heading !== undefined) a.heading = n.heading;
});
/** Fade out and go away (anything queued after this is ignored). */
export const leave = (): Step => run((a) => { a.walker.leaving = true; });
