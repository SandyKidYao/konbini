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
  readonly interact: Interact;
  readonly fx: Fx;
  readonly prefabs: Prefabs;
  readonly director: Director;
  readonly loaded: { id: string; layer: string; external: boolean; error?: string }[] = [];
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  elapsed = 0;

  private frameFns: FrameFn[] = [];
  private uiFns: (() => void)[] = [];
  private clock = new THREE.Clock();
  private frame = 0;
  private baseCtx: ModContext;
  private slow = { time: 0, frames: 0, strikes: 0 };
  private onFirstFrame: (() => void) | null = null;

  constructor(private config: AppConfig) {
    this.stage = new Stage(config.container, config.camera);
    this.interact = new Interact(this.stage.camera, this.stage.renderer.domElement, this.stage.world);
    this.fx = new Fx(this.stage, config.bounds);
    this.prefabs = new Prefabs(() => this.baseCtx);
    this.director = new Director({
      nav: this.nav, surfaces: this.surfaces, interact: this.interact, parent: this.stage.world,
      time: () => this.elapsed, onWave: () => this.audio.play('tick'),
    }, this.nav, this.services);
    this.baseCtx = this.contextFor('engine', this.stage.world);
    // lightning: a bolt on screen now, thunder later (further away = longer delay, quieter)
    this.atmosphere.onStrike((distance) => {
      this.fx.strike(distance);
      setTimeout(() => this.audio.play(distance < 0.4 ? 'thunder' : 'thunder-far'), 400 + distance * 2600);
    });
    addEventListener('resize', () => this.resize());
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
        wetable: (m) => fx.wet.wetable(m),
        addPuddle: (x, z, r, sx, sz) => fx.wet.addPuddle(x, z, surfaces.walkAt(x, z), r, sx, sz, hashSeed(`${id}:${x}:${z}`) % 1000),
        addSheen: (rect, y) => fx.wet.addSheen(rect, y),
        addPass: (pass, order) => fx.post.addPass(pass, order),
      },
      interact: { clickable: (o, fn, label) => this.interact.clickable(o, fn, label) },
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

    for (const m of ordered) {
      const root = new THREE.Group();
      root.name = m.id;
      this.stage.world.add(root);
      try {
        await m.setup(this.contextFor(m.id, root));
        this.loaded.push({ id: m.id, layer: m.layer, external: extIds.has(m.id) });
      } catch (e) {
        console.error(`[konbini] mod "${m.id}" failed`, e);
        this.stage.world.remove(root);
        this.loaded.push({ id: m.id, layer: m.layer, external: extIds.has(m.id), error: String(e) });
      }
    }
    this.fx.finalize(this.surfaces);
  }

  /** Interface updates, run once per rendered frame (not during warp). */
  onFrameUI(fn: () => void) { this.uiFns.push(fn); }

  /** Advance everything that moves, without rendering. */
  simulate(dt: number) {
    this.elapsed += dt;
    this.atmosphere.update(dt, this.reducedMotion);
    const d = this.atmosphere.drivers;
    this.glow.update(this.atmosphere, dt);
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
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.simulate(dt);
      this.audio.update(this.atmosphere.drivers, this.elapsed);
      this.stage.controls.update(dt);
      for (const f of this.uiFns) f();
      this.fx.render();
      if (this.frame > 60) this.adaptQuality(dt);
      this.frame++;
      if (this.frame === 3) this.onFirstFrame?.();
      requestAnimationFrame(tick);
    };
    tick();
  }

  // if the GPU can't keep up, step the pixel ratio down instead of stuttering
  private adaptQuality(dt: number) {
    const s = this.slow;
    s.time += dt; s.frames++;
    if (s.time < 2) return;
    const avg = s.time / s.frames;
    s.time = 0; s.frames = 0;
    s.strikes = avg > 1 / 40 ? s.strikes + 1 : 0;
    const pr = this.stage.renderer.getPixelRatio();
    if (s.strikes >= 2 && pr > 1) {
      this.stage.renderer.setPixelRatio(Math.max(1, pr - 0.25));
      this.resize();
      s.strikes = 0;
    }
  }

  private resize() {
    this.stage.resize();
    this.fx.resize();
  }
}
