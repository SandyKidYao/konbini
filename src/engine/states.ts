// Discrete states that follow the date, time and weather: the sakura blooms, greens, reddens and goes bare;
// vending machines switch to hot drinks; decorations go up for festivals. Continuous things (how bright a sign
// is) stay on channels and onFrame; this is for "which version of me should be showing".
//
// A thing declares what it cares about by writing `pick(conditions)`; the engine re-evaluates it a few times
// a second and, when the answer changes, runs the switch — instantly, or as a blend over a second or two.
//
//   ctx.states.track({
//     pick: (c) => c.season === 'winter' ? 'hot' : 'cold',
//     enter: (to) => swapTexture(to),                       // a discrete change, at the start of the switch
//     blend: (from, to, t) => tint(lerp(COLOR[from], COLOR[to], t)),   // optional: a smooth change
//   });
//   ctx.states.show(kadomatsu, (c) => c.has('shogatsu'));   // pop an object in / out
import type * as THREE from 'three';
import type { Atmosphere, Drivers, WeatherKind } from './atmosphere';
import type { Day, Festival, Season } from './calendar';

export type Period = 'dawn' | 'day' | 'dusk' | 'night';

/** What a state can depend on. One shared object, refreshed before every round of picks. */
export interface Conditions {
  readonly day: Day;
  readonly season: Season;
  readonly dayOff: boolean;
  /** is this festival running today? */
  has(festival: Festival): boolean;
  /** clock hour 0–24 */
  readonly hour: number;
  /** by the sky (sunrise / sunset), not the clock */
  readonly period: Period;
  /** the named weather (for live weather: the closest kind) */
  readonly weather: WeatherKind;
  /** every continuous value: temperature, rain, snow, snowCover, wet, wind, daylight… */
  readonly drivers: Drivers;
}

export interface StateSpec<S> {
  /** Which state the conditions call for. Keep it cheap: it runs a few times a second. */
  pick(c: Conditions): S;
  /** The switch to `to` begins. Also called once at the start, with `from` undefined. */
  enter?(to: S, from: S | undefined): void;
  /** Every frame of a switch, `t` easing 0 → 1. Also called once at the start as blend(s, s, 1). */
  blend?(from: S, to: S, t: number): void;
  /** seconds a switch takes (default 1.6); 0 = at once */
  duration?: number;
}

export interface Tracked<S> {
  readonly state: S;
  /** re-run pick now (e.g. after changing something pick reads) */
  refresh(): void;
  dispose(): void;
}

interface Entry {
  spec: StateSpec<unknown>;
  state: unknown;
  from: unknown;
  t: number;
  alive: boolean;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class States {
  readonly conditions: Conditions;
  private entries: Entry[] = [];
  private timer = 0;
  private dirty = false;
  private settled = false;

  /** `onSettled` runs after switches finish (the snow cover re-checks what is open to the sky). */
  constructor(private atm: Atmosphere, private onSettled: () => void) {
    const self = this;
    this.conditions = {
      get day() { return atm.day; },
      get season() { return atm.day.season; },
      get dayOff() { return atm.day.dayOff; },
      has: (f) => atm.day.festivals.includes(f),
      get hour() { return atm.drivers.hour; },
      get period() { return self.period(); },
      get weather() { return atm.weather; },
      get drivers() { return atm.drivers; },
    };
    atm.onDayChange(() => { this.dirty = true; });
  }

  private period(): Period {
    const h = this.atm.drivers.solarHour;
    return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 16.5 ? 'day' : h >= 16.5 && h < 19.5 ? 'dusk' : 'night';
  }

  track<S>(spec: StateSpec<S>): Tracked<S> {
    const s = spec.pick(this.conditions);
    const e: Entry = { spec: spec as StateSpec<unknown>, state: s, from: s, t: 1, alive: true };
    spec.enter?.(s, undefined);
    spec.blend?.(s, s, 1);
    this.entries.push(e);
    return {
      get state() { return e.state as S; },
      refresh: () => this.evaluate(e, false),
      dispose: () => { e.alive = false; this.entries = this.entries.filter((x) => x !== e); },
    };
  }

  /** Pop an object in or out (scale with a little overshoot), hidden entirely while out. */
  show(object: THREE.Object3D, when: (c: Conditions) => boolean, { duration = 0.9 } = {}): Tracked<boolean> {
    const base = object.scale.clone();
    const pop = (t: number) => (t <= 0 ? 0 : 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2));
    return this.track<boolean>({
      pick: when,
      duration,
      blend: (from, to, t) => {
        const k = from === to ? (to ? 1 : 0) : to ? pop(t) : 1 - t;
        object.visible = k > 0.001;
        object.scale.copy(base).multiplyScalar(Math.max(0.001, k));
      },
    });
  }

  /** Re-check every state now (after a preview jump, say) instead of waiting for the next round. */
  refresh() { this.dirty = true; }

  update(dt: number, reducedMotion: boolean) {
    this.timer -= dt;
    if (this.timer <= 0 || this.dirty) {
      this.timer = 0.25;
      const instant = reducedMotion;
      for (const e of this.entries) this.evaluate(e, instant);
      this.dirty = false;
    }
    let finished = false;
    for (const e of this.entries) {
      if (e.t >= 1) continue;
      const dur = e.spec.duration ?? 1.6;
      e.t = Math.min(1, e.t + dt / Math.max(0.001, dur));
      e.spec.blend?.(e.from, e.state, ease(e.t));
      if (e.t >= 1) finished = true;
    }
    if (finished) this.settled = true;
    if (this.settled && this.entries.every((e) => e.t >= 1)) { this.settled = false; this.onSettled(); }
  }

  private evaluate(e: Entry, instant: boolean) {
    if (!e.alive) return;
    let next: unknown;
    try { next = e.spec.pick(this.conditions); }
    catch (err) { console.error('[konbini] state pick failed', err); return; }
    if (Object.is(next, e.state)) return;
    // a switch already under way snaps to its end first
    if (e.t < 1) { e.spec.blend?.(e.from, e.state, 1); e.t = 1; }
    e.from = e.state;
    e.state = next;
    try {
      e.spec.enter?.(next, e.from);
      if (instant || (e.spec.duration ?? 1.6) <= 0 || !e.spec.blend) { e.spec.blend?.(e.from, next, 1); e.t = 1; this.settled = true; }
      else e.t = 0;
    } catch (err) { console.error('[konbini] state switch failed', err); e.t = 1; }
  }
}
