// Mods: everything in the scene — the street, the shop, the people, the events — is a mod.
// A mod is a plain object with an id, a layer and a setup(ctx). The context is the *only* API a mod needs,
// so a mod can live in this repo or be a standalone .js file loaded at runtime.
import type * as THREE from 'three';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import type * as Kit from './kit';
import type { Seeded } from './kit/rng';
import type { Atmosphere, Drivers } from './atmosphere';
import type { Surfaces, Rect } from './surfaces';
import type { NavGraph } from './nav';
import type { Services, Bus } from './services';
import type { Prefabs } from './prefabs';
import type { Director } from './agents/director';
import type { Audio } from './audio';
import type { GlowRegistry } from './glow';
import type * as Steps from './agents/actor';
import type { Conditions, StateSpec, Tracked } from './states';
import type { PlanApi } from './plan';

/**
 * Load order. Library mods only register prefabs (nothing is built yet); world builds the block;
 * the active site builds the main subject on its plot; events bring it to life; extra is for add-ons.
 */
export type ModLayer = 'library' | 'world' | 'site' | 'events' | 'extra';
export const LAYER_ORDER: readonly ModLayer[] = ['library', 'world', 'site', 'events', 'extra'];

export interface ModDefinition {
  /** unique, dotted: 'konbini.site.backyard' */
  id: string;
  name?: string;
  version?: string;
  layer: ModLayer;
  /** ids of mods that must be set up first */
  requires?: string[];
  /** for site mods: which site they belong to; only the active site's mods load */
  site?: string;
  setup(ctx: ModContext): void | Promise<void>;
}

export const defineMod = (def: ModDefinition) => def;

/** The plot the world reserves for the main subject; site mods build inside it. */
export interface SitePlot {
  bounds: Rect;
  /** nav node on the public street where the site connects */
  entrance: string;
  /** ground height of the plot */
  ground: number;
}

export interface FxApi {
  readonly envMap: THREE.Texture;
  /**
   * Only the model is drawn, over a transparent window (desktop pet): no studio floor or backdrop around it. It can
   * change while the scene runs (the pet's 显示天空): read it each frame rather than once in setup.
   */
  readonly transparent: boolean;
  wetable<M extends THREE.MeshStandardMaterial>(mat: M): M;
  addPuddle(x: number, z: number, r: number, sx?: number, sz?: number): THREE.Mesh;
  addSheen(rect: Rect, y: number): THREE.Mesh;
  addPass(pass: Pass, order?: number): void;
  /** Something that blocks the sky moved or appeared: re-check where snow can settle (cheap, batched). */
  skyChanged(): void;
  /**
   * Compile the shaders of something that will only appear later (a kind of vehicle that drives in at some
   * point), so its first appearance doesn't stall a frame. Pass a throwaway instance; it is drawn once off
   * screen, every part shown, then kept (unattached) so its shaders stay compiled.
   */
  warm(object: THREE.Object3D): void;
}

export interface StatesApi {
  /** the current date, time and weather, as states see them */
  readonly conditions: Conditions;
  /** Follow a discrete state (see engine/states.ts): pick() decides, enter() / blend() switch. */
  track<S>(spec: StateSpec<S>): Tracked<S>;
  /** Pop an object in when `when` is true, out when it is false. */
  show(object: THREE.Object3D, when: (c: Conditions) => boolean, o?: { duration?: number }): Tracked<boolean>;
}

export interface ModContext {
  readonly THREE: typeof THREE;
  readonly kit: typeof Kit;
  /** script steps for actors: go, walk, wait, until, face, pose, sit, stand, place, run, leave */
  readonly steps: typeof Steps;
  readonly mod: { readonly id: string; readonly random: Seeded };
  /** this mod's own group under the world */
  readonly root: THREE.Group;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly atmosphere: Atmosphere;
  readonly surfaces: Surfaces;
  readonly nav: NavGraph;
  readonly services: Services;
  readonly bus: Bus;
  readonly prefabs: Prefabs;
  readonly director: Director;
  readonly audio: Audio;
  readonly glow: GlowRegistry;
  readonly fx: FxApi;
  /** states that follow the date, time and weather (seasons, festivals, hot drinks in winter…) */
  readonly states: StatesApi;
  readonly interact: { clickable(object: THREE.Object3D, onClick: () => void, label: string): () => void };
  /** the scene seen from straight above, for the map form: footprints, small lights, what moves (see engine/plan.ts) */
  readonly plan: PlanApi;
  /** per-frame callback; returns an unsubscribe function */
  onFrame(fn: (dt: number, t: number, d: Drivers) => void): () => void;
}

/**
 * Order mods: by layer, then so that every mod comes after what it requires.
 * Mods with a missing (or failed) requirement, or caught in a cycle, are skipped — never fatal.
 */
export function orderMods(mods: ModDefinition[]): { ordered: ModDefinition[]; skipped: { id: string; reason: string }[] } {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const ordered: ModDefinition[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const state = new Map<string, 'visiting' | 'done' | 'bad'>();
  const visit = (m: ModDefinition, chain: string[]): boolean => {
    const s = state.get(m.id);
    if (s === 'done') return true;
    if (s === 'bad') return false;
    if (s === 'visiting') { skipped.push({ id: m.id, reason: `dependency cycle: ${[...chain, m.id].join(' → ')}` }); state.set(m.id, 'bad'); return false; }
    state.set(m.id, 'visiting');
    for (const r of m.requires ?? []) {
      const dep = byId.get(r);
      if (!dep || !visit(dep, [...chain, m.id])) {
        skipped.push({ id: m.id, reason: dep ? `requirement "${r}" unavailable` : `requires missing "${r}"` });
        state.set(m.id, 'bad');
        return false;
      }
    }
    state.set(m.id, 'done');
    ordered.push(m);
    return true;
  };
  const sorted = [...mods].sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
  for (const m of sorted) visit(m, []);
  return { ordered, skipped };
}

/** Load a mod from a URL (an ES module whose default export is a mod definition). */
export async function loadExternalMod(url: string): Promise<ModDefinition> {
  const m = await import(/* @vite-ignore */ new URL(url, location.href).href);
  const def = (m.default ?? m.mod) as ModDefinition | undefined;
  if (!def || typeof def.id !== 'string' || typeof def.setup !== 'function' || !LAYER_ORDER.includes(def.layer)) {
    throw new Error(`[konbini] ${url} does not export a valid mod`);
  }
  return def;
}
