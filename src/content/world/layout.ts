// The street plan of the Sakurazaka block, in metres. Road A runs along x in front of the plot, road B along z to
// its right, down to the sea: over the railway's level crossing, to a T with the coast road; beyond it a promenade,
// a beach and the water. Only the world mods read this; the site gets its plot via the 'world.plot' service.
import type { Rect } from '../../engine/surfaces';

// square: 65 m each way. The west end runs further out than the east (a family house past さくら堂), so the shop
// sits a little east of the middle
export const BLOCK: Rect = { x0: -37, x1: 28, z0: -41, z1: 24 };

/**
 * Reserved for the main subject (the active site builds here): from the back lane to road A's sidewalk, from the
 * west neighbour right up to road B. Along road B there is no sidewalk: the site's frontage opens onto the road.
 */
export const PLOT: Rect = { x0: -14.7, x1: 14, z0: -6, z1: 7.5 };

/** The back lane behind the plot, from road B to the west edge of the model: deliveries come this way. Keep it clear. */
export const LANE: Rect = { x0: BLOCK.x0, x1: 14, z0: -10, z1: -6 };

/** The single track, along x: its centre line, and the fences either side of its bed. Road B crosses it on the level. */
export const TRACK = { z: -18.6, fence: 2.3 };
/** The coast road along the shore, at the bottom of road B (a T junction); a sidewalk on its land side. */
export const COAST: Rect = { x0: BLOCK.x0, x1: BLOCK.x1, z0: -31.5, z1: -26.5 };
/** Beyond the coast road: the promenade along the sea wall, the beach sloping down, the water. */
export const SHORE = { promenade: -32.7, waterline: -34.5, water: -0.5 };

const { x0: W, x1: E } = BLOCK;
/** Raised sidewalks [x0, x1, z0, z1]. Road B's on this side stops at the back lane; the coast road's runs along its land side. */
export const SIDEWALKS: [number, number, number, number][] = [
  [W, 14, 7.5, 10], [11.5, 14, COAST.z1, LANE.z0], [21, E, 7.5, 10], [21, 23, COAST.z1, 7.5], [W, E, 17, 19.2],
  [W, 14, COAST.z1, COAST.z1 + 1.2], [21, E, COAST.z1, COAST.z1 + 1.2], [W, E, SHORE.promenade, COAST.z0],
];

/** the row across road B: three narrow buildings, north to south, stepping down towards road A */
export const SHOP_ROW = { x0: 23.3, x1: 27.9, z0: TRACK.z + TRACK.fence + 1.0, z1: -2.5 };

export const SIDEWALK_Y = 0.15;
export const LAND_Y = 0.08;
