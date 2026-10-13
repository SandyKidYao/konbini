// Keeps the scene alive: owns every actor, and every few seconds picks an event to start,
// weighted by the current time and weather. Events are plain definitions any mod can register.
import type { Drivers } from '../atmosphere';
import type { Day } from '../calendar';
import type { NavGraph } from '../nav';
import type { Services } from '../services';
import { Actor, type ActorOptions, type AgentEnv, type Walker } from './actor';

export interface EventEnv {
  drivers: Drivers;
  /** today: season, weekday, holidays, festivals */
  day: Day;
  /** scene time in seconds */
  t: number;
  /** shared scratchpad for events/directors (e.g. "staffBusy") */
  board: Record<string, unknown>;
  /** actors currently alive, for crowd checks */
  actors: readonly Actor[];
}

export interface EventDef {
  id: string;
  /** relative chance of being picked now; return 0 to sit this one out */
  weight(env: EventEnv): number;
  /** nav nodes and services the event relies on — it is skipped when the active site doesn't offer them */
  needs?: { nodes?: string[]; services?: string[] };
  /** at most this many running at once */
  max?: number;
  /** start the event; return the actors it spawned so the director can track when it ends */
  run(env: EventEnv): Actor[] | Actor | void;
}

interface Running { def: EventDef; actors: Actor[] }

export class Director {
  readonly actors: Actor[] = [];
  readonly board: Record<string, unknown> = {};
  /** soft cap on people in the scene */
  cap = 12;
  /** seconds between spawn attempts (scaled at night) */
  interval: [number, number] = [2.5, 6];
  private events = new Map<string, EventDef>();
  private running: Running[] = [];
  private nextSpawn = 1.2;

  constructor(private env: AgentEnv, private nav: NavGraph, private services: Services, private today: () => Day) {
    env.blockers ??= [];
  }

  define(def: EventDef) { this.events.set(def.id, def); }

  /** Something walkers give way to: return true when someone shouldn't step to (x, z) just now. */
  avoid(blocked: (a: Actor, x: number, z: number) => boolean) {
    this.env.blockers!.push(blocked);
    return () => { const i = this.env.blockers!.indexOf(blocked); if (i >= 0) this.env.blockers!.splice(i, 1); };
  }
  list() { return [...this.events.values()]; }

  spawn(walker: Walker, o: ActorOptions = {}) {
    const a = new Actor(walker, this.env, o);
    this.actors.push(a);
    return a;
  }

  /** Start a specific event now (if it is available). */
  trigger(id: string, d: Drivers, t: number) {
    const def = this.events.get(id);
    if (def && this.available(def)) this.start(def, d, t);
  }

  private available(def: EventDef) {
    if (def.needs?.nodes?.some((n) => !this.nav.has(n))) return false;
    if (def.needs?.services?.some((s) => !this.services.has(s))) return false;
    if (def.max !== undefined && this.running.filter((r) => r.def === def).length >= def.max) return false;
    return true;
  }

  private start(def: EventDef, d: Drivers, t: number) {
    const out = def.run(this.envFor(d, t));
    const actors = !out ? [] : Array.isArray(out) ? out : [out];
    if (actors.length) this.running.push({ def, actors });
  }

  private envFor(d: Drivers, t: number): EventEnv { return { drivers: d, day: this.today(), t, board: this.board, actors: this.actors }; }

  update(dt: number, t: number, d: Drivers) {
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      const [lo, hi] = this.interval;
      this.nextSpawn = (lo + Math.random() * (hi - lo)) * (1 + (1 - d.daylight) * 0.5);
      if (this.actors.length < this.cap) {
        const env = this.envFor(d, t);
        const options = this.list().filter((e) => this.available(e)).map((e) => [e, Math.max(0, e.weight(env))] as const);
        const total = options.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [e, w] of options) { r -= w; if (w > 0 && r <= 0) { this.start(e, d, t); break; } }
      }
    }
    for (let i = this.actors.length - 1; i >= 0; i--) {
      this.actors[i].update(dt, t, d);
      if (this.actors[i].done) this.actors.splice(i, 1);
    }
    this.running = this.running.filter((r) => r.actors.some((a) => !a.done));
  }
}
