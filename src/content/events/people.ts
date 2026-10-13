// Small helpers shared by the built-in events.
import type { ModContext } from '../../engine/mod';
import type { Steps } from '../../engine/agents/actor';
import type { ShopService } from '../site/konbini/api';
import type { Figure, HeldProp } from '../library/figure';
import type { Drivers } from '../../engine/atmosphere';
import type { Conditions } from '../../engine/states';
import { COATS, YUKATA, type FigureOptions } from '../library/figure';
import { R, pickR } from '../../engine/kit/rng';

const chance = (p: number) => Math.random() < p;

/** Weekday commuting hours (by the clock). */
export const rushHour = (c: Conditions) => !c.dayOff && ((c.hour >= 7.2 && c.hour < 9.3) || (c.hour >= 17.3 && c.hour < 19.6));

/** Summer festival evenings, when people stroll about in yukata. */
export const festivalEvening = (c: Conditions) =>
  c.has('natsumatsuri') && (c.dayOff || c.has('obon')) && (c.period === 'dusk' || c.period === 'night') && c.drivers.rain < 0.2;

/** A random member of the public, dressed for the weather, the season and the occasion. */
export function citizen(ctx: ModContext, d: Drivers, o: FigureOptions & { commuter?: boolean } = {}) {
  const c = ctx.states.conditions, T = d.temperature;
  const wet = d.rain > 0.3 || d.snow > 0.3;
  const dress: FigureOptions = {
    shortSleeve: T > 24 && d.daylight > 0.4 && chance(0.7),
    umbrella: wet,
    scarf: T < 8 && chance(0.75),
    coat: T < 11 && chance(0.85) ? pickR(COATS) : undefined,
    hat: T < 3 && chance(0.35) ? 'knit'
      : T > 26 && d.daylight > 0.6 && !wet && chance(0.3) ? pickR(['straw', 'cap'] as const) : undefined,
  };
  if (o.commuter ?? (rushHour(c) && chance(0.6))) {
    // office wear: dark suits — in summer, "cool biz" white shirts with the sleeves short
    const suit = pickR(['#2f3540', '#3a4558', '#4a5468', '#2b2b2e']);
    Object.assign(dress, T > 24 ? { shirt: '#f4f6f8', pants: suit, shortSleeve: true } : { shirt: suit, pants: suit }, { skirt: null, hat: undefined });
    if (dress.coat) dress.coat = pickR(['#2b2b2e', '#3a4558', '#c9b48a']);
  } else if (festivalEvening(c) && chance(0.55)) {
    Object.assign(dress, { yukata: pickR(YUKATA), coat: undefined, scarf: false, hat: undefined, umbrella: false });
  }
  const { commuter: _, ...rest } = o;
  return ctx.prefabs.create('figure', { ...dress, ...rest });
}

/** Staff dress: Santa hats in the last week before Christmas. */
export const staffDress = (c: Conditions): FigureOptions => ({ hat: c.day.month === 12 && c.day.date >= 18 && c.day.date <= 25 ? 'santa' : undefined });

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

/**
 * Inside the shop: in at the door (the clerk greets them), browse an aisle or two, queue, pay and take
 * what they bought. Ends at the register; the caller decides where they go next.
 */
export function shopAround(ctx: ModContext, fig: Figure, board: Record<string, unknown>, o: { buy?: HeldProp; browse?: boolean } = {}): Steps[] {
  const S = ctx.steps, PI = Math.PI;
  const shop = ctx.services.require<ShopService>('shop');
  const aisle = pickR(shop.aisles);
  const steps: Steps[] = [S.go(shop.nodes.doorIn), S.run(() => clerk(ctx)?.bow())];   // いらっしゃいませ
  if (o.browse ?? true) {
    steps.push(S.go(aisle.front), S.walk([[aisle.x, R(-8.6, -5.2)]]), S.face(pickR(aisle.faces)), S.pose('browse', R(2, 4)), S.wait(R(0.4, 1.2)));
    if (Math.random() < 0.5) steps.push(S.go(aisle.back), S.face(PI), S.pose('browse', R(1.5, 3)));
  }
  steps.push(
    S.go('shop.register.queue'),
    S.until(() => !board.registerBusy),
    S.run(() => { board.registerBusy = true; }),
    S.go(shop.nodes.register), S.face(-PI / 2),
    S.run(() => clerk(ctx)?.bow()),
    S.pose('pay', 2.4),
    S.run(() => { fig.hold(o.buy === undefined ? 'bag' : o.buy); board.registerBusy = false; clerk(ctx)?.bow(); }),
  );
  return steps;
}
