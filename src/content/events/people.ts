// Small helpers shared by the built-in events.
import type { ModContext } from '../../engine/mod';
import type { Drivers } from '../../engine/atmosphere';
import type { FigureOptions } from '../library/figure';
import { pickR } from '../../engine/kit/rng';

/** A random member of the public, dressed for the weather. */
export function citizen(ctx: ModContext, d: Drivers, o: FigureOptions = {}) {
  return ctx.prefabs.create('figure', {
    shortSleeve: d.temperature > 24 && d.daylight > 0.4 && Math.random() < 0.7,
    umbrella: d.rain > 0.3 || d.snow > 0.3,
    scarf: d.temperature < 8 && Math.random() < 0.75,
    ...o,
  });
}

/** Street ends where people appear from / disappear to (the far sidewalk is its own little world). */
export const streetEnds = (ctx: ModContext) => ctx.nav.tagged('spawn').filter((n) => !n.tags.has('far'));

export function twoEnds(ctx: ModContext) {
  const ends = streetEnds(ctx);
  const a = pickR(ends);
  let b = pickR(ends);
  while (ends.length > 1 && b === a) b = pickR(ends);
  return [a.id, b.id] as const;
}

/** The resident clerk, if the clerk mod is loaded. */
export interface ClerkService { bow(): void }
export const clerk = (ctx: ModContext) => ctx.services.get<ClerkService>('shop.clerk');
