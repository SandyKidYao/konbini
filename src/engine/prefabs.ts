// The asset library: named factories ("prefabs") that build reusable things — a figure, a car, a vending machine.
// Content registers prefabs; anything (world, site, events, external mods) can create them by name.
import type { ModContext } from './mod';

export type PrefabFactory<O = unknown, R = unknown> = (ctx: ModContext, options: O) => R;

/** Extend this interface (declaration merging) to get typed `create()` calls for your prefab. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PrefabTypes {}

export class Prefabs {
  private map = new Map<string, PrefabFactory<any, any>>();
  constructor(private ctxFor: () => ModContext) {}

  define<O, R>(name: string, factory: PrefabFactory<O, R>) {
    if (this.map.has(name)) console.warn(`[konbini] prefab "${name}" replaced`);
    this.map.set(name, factory);
  }
  has(name: string) { return this.map.has(name); }
  list() { return [...this.map.keys()]; }

  create<K extends keyof PrefabTypes>(name: K, options?: PrefabTypes[K] extends { options: infer O } ? O : never): PrefabTypes[K] extends { result: infer R } ? R : never;
  create<R = unknown>(name: string, options?: unknown): R;
  create(name: string, options: unknown = {}) {
    const f = this.map.get(name);
    if (!f) throw new Error(`[konbini] unknown prefab "${name}"`);
    return f(this.ctxFor(), options);
  }
}
