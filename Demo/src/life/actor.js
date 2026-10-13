// An Actor walks a Figure through a script — a queue of small steps:
//   walk(points) · wait(s) · until(fn) · face(angle | point) · pose(name, s) · sit(...) · run(fn) · leave()
import * as THREE from 'three';
import { world } from '../core/stage.js';
import { pickable, unpickable } from '../core/registry.js';
import { groundAt, isSheltered } from '../world/layout.js';
import { sfx } from '../audio/ambience.js';
import { R } from './figure.js';

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Actor {
  constructor(figure, { x, z, heading = 0, speed = R(1.15, 1.45), label = '路人' } = {}) {
    this.fig = figure;
    this.root = figure.root;
    this.root.position.set(x, groundAt(x, z), z);
    this.heading = heading;
    this.speed = speed;
    this.queue = [];
    this.done = false;
    this.tags = new Set();
    this.followers = [];   // e.g. a dog on a leash: fn(actor, dt, t)
    world.add(this.root);
    pickable(this.root, () => { this.fig.play('wave', 1.8); sfx.tick(); }, label);
  }

  then(...steps) { this.queue.push(...steps.flat()); return this; }

  update(dt, t, s) {
    let step = this.queue[0];
    // run instantaneous steps back to back
    while (step && step.instant) { step.fn(this, t, s); this.queue.shift(); step = this.queue[0]; }
    if (step) {
      if (!step.started) { step.started = true; step.start?.(this, t, s); }
      if (step.tick(this, dt, t, s)) { step.end?.(this); this.queue.shift(); }
    } else if (!this.fig.leaving) {
      this.fig.leaving = true;
    }
    const p = this.root.position;
    this.fig.sheltered = isSheltered(p.x, p.z);
    this.root.rotation.y = this.heading;
    this.fig.update(dt, t, s);
    for (const f of this.followers) f(this, dt, t);
    if (this.fig.leaving && this.fig.visibleScale < 0.02) this.dispose();
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    unpickable(this.root);
    this.fig.dispose();
    this.onDispose?.();
  }
}

// ---------------------------------------------------------------- steps
const tmp = new THREE.Vector3();

export function walk(points, { speed } = {}) {
  let i = 0;
  return {
    start(a) { a.fig.moving = true; a.fig.speed = speed ?? a.speed; a.fig.pose = 'idle'; a.fig.sitting = false; },
    tick(a, dt) {
      const p = a.root.position;
      while (i < points.length) {
        const [tx, tz] = points[i];
        tmp.set(tx - p.x, 0, tz - p.z);
        const d = tmp.length();
        if (d < 0.05) { i++; continue; }
        const v = (speed ?? a.speed) * dt;
        const want = Math.atan2(tmp.x, tmp.z);
        a.heading += wrap(want - a.heading) * Math.min(1, dt * 8);
        const stepLen = Math.min(d, v);
        p.x += (tmp.x / d) * stepLen;
        p.z += (tmp.z / d) * stepLen;
        p.y += (groundAt(p.x, p.z) - p.y) * Math.min(1, dt * 12);
        return false;
      }
      a.fig.moving = false;
      return true;
    },
  };
}

export const wait = (seconds) => {
  let left = seconds;
  return { tick(a, dt) { a.fig.moving = false; left -= dt; return left <= 0; } };
};

export const until = (fn) => ({ tick(a, dt, t, s) { a.fig.moving = false; return fn(a, t, s); } });

export const run = (fn) => ({ instant: true, fn });

// turn to an angle (radians, 0 = facing +z) or toward a point [x, z]
export function face(target, seconds = 0.45) {
  let left = seconds, goal;
  return {
    start(a) { goal = Array.isArray(target) ? angleTo(a.root.position, { x: target[0], z: target[1] }) : target; },
    tick(a, dt) {
      a.heading += wrap(goal - a.heading) * Math.min(1, dt * 7);
      left -= dt;
      return left <= 0;
    },
  };
}

export function pose(name, seconds) {
  let left = seconds;
  return {
    start(a) { a.fig.pose = name; },
    tick(a, dt) { left -= dt; return left <= 0; },
    end(a) { if (!a.fig.sitting || name !== 'drink') a.fig.pose = a.fig.sitting ? 'sit' : 'idle'; },
  };
}

// sit at [x, z] facing `heading`, seat top at seatY
export function sit(x, z, heading, seatY) {
  return run((a) => {
    a.root.position.set(x, seatY - 0.78, z);   // puts the hips just above the seat
    a.heading = heading;
    a.fig.sitting = true;
    a.fig.pose = 'sit';
  });
}
export function stand(x, z) {
  return run((a) => {
    a.root.position.set(x, groundAt(x, z), z);
    a.fig.sitting = false;
    a.fig.pose = 'idle';
  });
}

export const leave = () => run((a) => { a.queue.length = 0; a.fig.leaving = true; });
