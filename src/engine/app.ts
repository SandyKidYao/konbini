// The runtime: builds the engine services, loads mods in order, then runs the loop.
import * as THREE from 'three';
import * as kit from './kit';
import * as steps from './agents/actor';
import { hashSeed, seeded } from './kit/rng';
import { Stage, type CameraPose } from './stage';
import { Atmosphere, type Drivers } from './atmosphere';
import { Surfaces, type Rect } from './surfaces';
import { NavGraph } from './nav';
import { Services, Bus } from './services';
import { Prefabs } from './prefabs';
import { Director } from './agents/director';
import { Audio } from './audio';
import { Interact } from './interact';
import { GlowRegistry } from './glow';
import { States } from './states';
import { Batcher } from './batch';
import { Plan } from './plan';
import { orderMods, loadExternalMod, type ModContext, type ModDefinition } from './mod';
import { Fx } from '../fx';

export interface AppConfig {
  container: HTMLElement;
  /** id of the site to build on the plot (only that site's mods load) */
  site: string;
  /** the model's footprint — rain, reflections and the shadow box are sized to it */
  bounds: Rect;
  camera: CameraPose;
  mods: ModDefinition[];
  /** URLs of external mods to load as well */
  external?: string[];
  /** mod ids to skip */
  disabled?: string[];
  /** draw only the model, over a transparent canvas (desktop-pet window) */
  transparent?: boolean;
  /** prefer the integrated GPU */
  lowPower?: boolean;
}

type FrameFn = (dt: number, t: number, d: Drivers) => void;

export class App {
  readonly stage: Stage;
  readonly atmosphere = new Atmosphere();
  readonly surfaces = new Surfaces();
  readonly nav = new NavGraph();
  readonly services = new Services();
  readonly bus = new Bus();
  readonly audio = new Audio();
  readonly glow = new GlowRegistry();
  readonly batcher = new Batcher();
  /** the scene as flat shapes, for the map form */
  readonly plan = new Plan();
  readonly states: States;
  readonly interact: Interact;
  readonly fx: Fx;
  readonly prefabs: Prefabs;
  readonly director: Director;
  readonly loaded: { id: string; layer: string; external: boolean; error?: string }[] = [];
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  elapsed = 0;
  /** at most this many frames a second (0: every display frame) — saves power when nobody is looking closely */
  maxFps = 0;
  /** every display frame regardless of maxFps, while something on screen is moving on purpose (a form change) */
  fullRate = false;
  /**
   * What is on screen: the model, or the plan (the UI draws it as a flat map). Either way the street lives on; with
   * the plan showing, the model isn't drawn at all — the whole cost of a frame is the simulation.
   */
  form: 'model' | 'plan' = 'model';

  private frameFns: FrameFn[] = [];
  private uiFns: (() => void)[] = [];
  private renderedFns: (() => void)[] = [];
  private resizeFns: (() => void)[] = [];
  private clock = new THREE.Clock();
  private frame = 0;
  private baseCtx: ModContext;
  private quality = { time: 0, frames: 0, drops: 0, slow: 0, calm: 0, window: 0, max: 1, blocked: new Map<number, number>(), failures: new Map<number, number>() };
  private resizePending = false;
  /** when the canvas's container last changed size */
  private resizedAt = 0;
  private owed = 0;
  private onFirstFrame: (() => void) | null = null;
  /** objects popped in and out by states.show: never batched (they scale and hide) */
  private shown = new WeakSet<THREE.Object3D>();

  constructor(private config: AppConfig) {
    this.stage = new Stage(config.container, config.camera, { transparent: config.transparent, lowPower: config.lowPower });
    this.interact = new Interact(this.stage.camera, this.stage.renderer.domElement, this.stage.world);
    this.fx = new Fx(this.stage, config.bounds, config.transparent);
    this.prefabs = new Prefabs(() => this.baseCtx);
    this.states = new States(this.atmosphere, () => this.fx.skyChanged());
    this.director = new Director({
      nav: this.nav, surfaces: this.surfaces, interact: this.interact, parent: this.stage.world,
      time: () => this.elapsed, onWave: () => this.audio.play('tick'),
    }, this.nav, this.services, () => this.atmosphere.day);
    // people are the engine's own: on the map wherever they walk (fading in or out: not yet, or no longer)
    this.plan.for('engine').movers(() => this.director.actors.filter((a) => a.walker.visibleScale > 0.4).map((a) => ({
      kind: 'person' as const, x: a.position.x, z: a.position.z, heading: a.heading,
    })));
    this.baseCtx = this.contextFor('engine', this.stage.world);
    this.quality.max = this.stage.renderer.getPixelRatio();
    // lightning: a bolt on screen now, thunder later (further away = longer delay, quieter)
    this.atmosphere.onStrike((distance) => {
      this.fx.strike(distance);
      setTimeout(() => this.audio.play(distance < 0.4 ? 'thunder' : 'thunder-far'), 400 + distance * 2600);
    });
    // applied just before the next render: resizing clears the canvas, and a cleared canvas that gets shown
    // before it is drawn again flashes the page background. The container, not the window: on the desk the model
    // can change size inside a window that stays put
    new ResizeObserver(() => { this.resizePending = true; this.resizedAt = performance.now(); }).observe(config.container);
  }

  private contextFor(id: string, root: THREE.Group): ModContext {
    const fx = this.fx;
    const surfaces = this.surfaces;
    return {
      THREE, kit, steps,
      mod: { id, random: seeded(hashSeed(id)) },
      root,
      scene: this.stage.scene,
      camera: this.stage.camera,
      atmosphere: this.atmosphere,
      surfaces, nav: this.nav, services: this.services, bus: this.bus,
      prefabs: this.prefabs, director: this.director, audio: this.audio, glow: this.glow,
      fx: {
        get envMap() { return fx.envMap; },
        get transparent() { return !fx.sky; },
        wetable: (m) => fx.wet.wetable(m),
        addPuddle: (x, z, r, sx, sz) => fx.wet.addPuddle(x, z, surfaces.walkAt(x, z), r, sx, sz, hashSeed(`${id}:${x}:${z}`) % 1000),
        addSheen: (rect, y) => fx.wet.addSheen(rect, y),
        addPass: (pass, order) => fx.post.addPass(pass, order),
        skyChanged: () => fx.skyChanged(),
        warm: (o) => fx.warm(o),
      },
      states: {
        conditions: this.states.conditions,
        track: (spec) => this.states.track(spec),
        show: (o, when, opts) => { this.shown.add(o); return this.states.show(o, when, opts); },
      },
      interact: { clickable: (o, fn, label) => this.interact.clickable(o, fn, label) },
      plan: this.plan.for(id),
      onFrame: (fn) => {
        this.frameFns.push(fn);
        return () => { this.frameFns = this.frameFns.filter((f) => f !== fn); };
      },
    };
  }

  /** Resolve, order and set up every mod. Failures are logged and skipped, never fatal. */
  async load() {
    const external: ModDefinition[] = [];
    for (const url of this.config.external ?? []) {
      try { external.push(await loadExternalMod(url)); }
      catch (e) { console.error(e); this.loaded.push({ id: url, layer: '?', external: true, error: String(e) }); }
    }
    const extIds = new Set(external.map((m) => m.id));
    const disabled = new Set(this.config.disabled ?? []);
    const candidates = [...this.config.mods, ...external].filter((m) =>
      !disabled.has(m.id) && (m.layer !== 'site' || !m.site || m.site === this.config.site));
    const { ordered, skipped } = orderMods(candidates);
    for (const k of skipped) {
      console.warn(`[konbini] skipped mod "${k.id}": ${k.reason}`);
      const m = candidates.find((c) => c.id === k.id);
      this.loaded.push({ id: k.id, layer: m?.layer ?? '?', external: extIds.has(k.id), error: k.reason });
    }

    const roots: THREE.Object3D[] = [];
    for (const m of ordered) {
      const root = new THREE.Group();
      root.name = m.id;
      this.stage.world.add(root);
      try {
        await m.setup(this.contextFor(m.id, root));
        roots.push(root);
        this.loaded.push({ id: m.id, layer: m.layer, external: extIds.has(m.id) });
      } catch (e) {
        console.error(`[konbini] mod "${m.id}" failed`, e);
        this.stage.world.remove(root);
        this.plan.drop(m.id);
        this.loaded.push({ id: m.id, layer: m.layer, external: extIds.has(m.id), error: String(e) });
      }
    }
    this.batcher.freeze(this.stage.world, roots, (o) => !!o.userData.skyIgnore || this.shown.has(o));
    this.fx.finalize(this.surfaces);
  }

  /** Interface updates, run once per rendered frame (not during warp). */
  onFrameUI(fn: () => void) { this.uiFns.push(fn); }

  /** Just after the model is drawn, while the canvas still holds the frame (it is cleared once it reaches the screen). */
  onRendered(fn: () => void) { this.renderedFns.push(fn); }

  /** The canvas changed size (applied before the next render). */
  onResize(fn: () => void) { this.resizeFns.push(fn); }

  /** Advance everything that moves, without rendering. */
  simulate(dt: number) {
    this.elapsed += dt;
    this.atmosphere.update(dt, this.reducedMotion);
    const d = this.atmosphere.drivers;
    this.glow.update(this.atmosphere, dt);
    this.states.update(dt, this.reducedMotion);
    this.fx.update(this.atmosphere, this.elapsed, dt);
    for (const f of this.frameFns) f(dt, this.elapsed, d);
    this.director.update(dt, this.elapsed, d);
  }

  /** Fast-forward (e.g. ?warp=60) so the street is already busy on the first frame. */
  warp(seconds: number) {
    for (let t = 0; t < Math.min(seconds, 600); t += 0.05) this.simulate(0.05);
  }

  start(onFirstFrame?: () => void) {
    this.onFirstFrame = onFirstFrame ?? null;
    const tick = () => {
      this.owed += this.clock.getDelta();
      if (this.maxFps && !this.fullRate && this.owed < 1 / this.maxFps - 0.004) { requestAnimationFrame(tick); return; }
      const dt = Math.min(this.owed, 0.05);
      this.owed = 0;
      this.simulate(dt);
      this.audio.update(this.atmosphere.drivers, this.elapsed);
      if (this.form === 'model') this.stage.update(dt);
      for (const f of this.uiFns) f();
      if (this.form === 'model') {
        if (this.frame > 60) this.adaptQuality(dt);
        if (this.resizePending && this.resizeDue()) this.resize();
        this.batcher.update();
        this.fx.render();
        for (const f of this.renderedFns) f();
      }
      this.frame++;
      if (this.frame === 3) this.onFirstFrame?.();
      requestAnimationFrame(tick);
    };
    tick();
  }

  /**
   * Dynamic resolution, aiming for a smooth 60: below ~50 fps the pixel ratio steps down (at retina sizes the GPU
   * is what runs out), and after a while at full frame rate it tries a step back up — but not to a size it had to
   * leave recently: 2 minutes after the first time, then 4, 8… Every change reallocates the render targets (a
   * visible hitch), so it settles instead of probing. At a pixel ratio of 1, ambient occlusion goes last. Under a frame cap (desktop pet) only falling well short of the cap counts, and it never
   * steps up.
   */
  private adaptQuality(dt: number) {
    const s = this.quality;
    s.time += dt; s.frames++;
    if (dt > 0.025) s.drops++;   // a missed display frame at 60 Hz
    if (s.time < 2) return;
    const avg = s.time / s.frames, drops = s.drops / s.frames;
    s.time = 0; s.frames = 0; s.drops = 0;
    s.window++;   // 2 s each
    // an even 60 matters more than the average: a size that keeps missing frames judders even at ~55 fps
    const capped = !!this.maxFps;
    s.slow = avg > Math.max(1 / 50, 1.25 / (this.maxFps || 60)) || (!capped && drops > 0.1) ? s.slow + 1 : 0;
    s.calm = !capped && avg < 1 / 57 && drops < 0.02 ? s.calm + 1 : 0;
    const r = this.stage.renderer, pr = r.getPixelRatio();
    if (s.slow >= 2) {
      s.slow = s.calm = 0;
      if (pr > 1) {
        const n = (s.failures.get(pr) ?? 0) + 1;
        s.failures.set(pr, n);
        s.blocked.set(pr, s.window + 60 * 2 ** (n - 1));
        r.setPixelRatio(Math.max(1, pr - 0.25));
        this.resizePending = true;
      } else this.fx.post.gtao.enabled = false;
    } else if (s.calm >= 3 && pr + 0.25 <= s.max && (s.blocked.get(pr + 0.25) ?? 0) <= s.window) {
      s.calm = 0;
      r.setPixelRatio(pr + 0.25);
      this.resizePending = true;
    }
  }

  /**
   * Resize now, or let the browser stretch the last frame a little longer? Every resize reallocates the render targets
   * (a hitch), and the desk's size slider changes the canvas every frame while it moves. A change of shape can't be
   * stretched; the same shape can, until it settles or strays too far from its pixels.
   */
  private resizeDue() {
    // (the desk's model widens a little as it grows: a few percent off the drawn shape still stretches unnoticed)
    const [w, h] = this.stage.size, [dw, dh] = this.stage.drawnSize, k = w / dw;
    if (Math.abs((w / h) / (dw / dh) - 1) > 0.04) return true;
    return k > 1.25 || k < 0.8 || performance.now() - this.resizedAt > 250;
  }

  private resize() {
    this.resizePending = false;
    this.stage.resize();
    this.fx.resize();
    for (const f of this.resizeFns) f();
  }
}
