// The street plan of the Sakurazaka block, in metres. Road A runs along x in front of the plot,
// road B along z to its right. Only the world mods read this; the site gets its plot via the 'world.plot' service.
import type { Rect } from '../../engine/surfaces';

export const BLOCK: Rect = { x0: -28, x1: 28, z0: -24, z1: 24 };

/** Reserved for the main subject (the active site builds here). */
export const PLOT: Rect = { x0: -14, x1: 11.5, z0: -14, z1: 7.5 };

/** Raised sidewalks [x0, x1, z0, z1]. */
export const SIDEWALKS: [number, number, number, number][] = [
  [-28, 14, 7.5, 10], [11.5, 14, -24, 7.5], [21, 28, 7.5, 10], [21, 23, -24, 7.5], [-28, 28, 17, 19.2],
];

export const HOUSE = { x0: -23, x1: -15.5, z0: -11, z1: 0.5, h: 5.8 };
export const APARTMENT = { x0: -12, x1: 10, z0: -23.5, z1: -16.5, floors: 3, fh: 3.1 };
export const SHOP_ROW = { x0: 23.3, x1: 27.9, z0: -22.5, z1: -2.5, h: 7 };

export const SIDEWALK_Y = 0.15;
export const LAND_Y = 0.08;
