// Named services mods offer each other, so content never imports another mod's internals.
//   ctx.services.provide('shop', { openDoor() {…} })   →   ctx.services.get<ShopService>('shop')?.openDoor()
export class Services {
  private map = new Map<string, unknown>();

  provide<T>(name: string, impl: T) {
    if (this.map.has(name)) console.warn(`[konbini] service "${name}" replaced`);
    this.map.set(name, impl);
    return impl;
  }
  get<T>(name: string): T | undefined { return this.map.get(name) as T | undefined; }
  require<T>(name: string): T {
    const s = this.map.get(name);
    if (!s) throw new Error(`[konbini] missing service "${name}"`);
    return s as T;
  }
  has(name: string) { return this.map.has(name); }
  remove(name: string) { this.map.delete(name); }
}

/** A tiny pub/sub for loose signals between mods ('customer:paid', 'door:opened'…). */
export class Bus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  on<T = unknown>(type: string, fn: (payload: T) => void) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(fn as (p: unknown) => void);
    this.handlers.set(type, set);
    return () => set.delete(fn as (p: unknown) => void);
  }
  emit(type: string, payload?: unknown) {
    this.handlers.get(type)?.forEach((fn) => fn(payload));
  }
}
