// Deterministic randomness for building content (same layout on every load),
// and plain Math.random helpers for runtime behaviour.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded generator with range helpers. Give each mod its own seed so mods don't disturb each other's layout. */
export function seeded(seed: number) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a: number, b: number) => a + (b - a) * next(),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  };
}
export type Seeded = ReturnType<typeof seeded>;

/** Runtime randomness (behaviour, spawning) — not reproducible on purpose. */
export const R = (a: number, b: number) => a + (b - a) * Math.random();
export const pickR = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Stable 32-bit hash of a string, handy for deriving per-mod seeds. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
