// The street plan of the block, in metres. Road A runs along x in front of the store, road B along z to its right.
export const PLINTH = { x0: -28, x1: 28, z0: -24, z1: 24 };

export const STORE = { x0: -7, x1: 9, z0: -12, z1: -2, h: 4.6, floor: 0.16, glassTop: 2.75 };

// [x0, x1, z0, z1] of the raised sidewalks
export const SIDEWALKS = [
  [-28, 14, 7.5, 10], [11.5, 14, -24, 7.5], [21, 28, 7.5, 10], [21, 23, -24, 7.5], [-28, 28, 17, 19.2],
];

export const HOUSE = { x0: -23, x1: -15.5, z0: -11, z1: 0.5, h: 5.8 };
export const APARTMENT = { x0: -12, x1: 10, z0: -23.5, z1: -16.5, floors: 3, fh: 3.1 };
export const SHOP_ROW = { x0: 23.3, x1: 27.9, z0: -22.5, z1: -2.5, h: 7 };

// Height that a raindrop or puddle lands on at (x, z)
export function floorAt(x, z) {
  const S = STORE;
  if (x > S.x0 - 0.1 && x < S.x1 + 0.1 && z > S.z0 - 0.1 && z < S.z1 + 0.1) return S.h;
  if (x > -7.2 && x < 10.95 && z > S.z1 && z < 0.2) return 2.7;
  if (x > S.x1 && x < 10.95 && z > -6.3 && z < S.z1) return 2.7;
  if (x > HOUSE.x0 - 0.4 && x < HOUSE.x1 + 0.4 && z > HOUSE.z0 - 0.4 && z < HOUSE.z1 + 0.4) return 6.6;
  if (x > APARTMENT.x0 && x < APARTMENT.x1 && z > APARTMENT.z0 && z < APARTMENT.z1 + 1) return 9.8;
  if (x > SHOP_ROW.x0 && x < SHOP_ROW.x1 && z > SHOP_ROW.z0 && z < SHOP_ROW.z1) return SHOP_ROW.h;
  if (x > -27.8 && x < -24.2 && z > -16 && z < -2) return 8.5;
  if (z > 19.2) return 0.06;
  if ((x < 11.5 && z < 7.5) || (x > 23 && z < 7.5)) return 0.1;
  if ((z > 7.5 && z < 10) || (z > 17 && z < 19.2) || (x > 11.5 && x < 14 && z < 10) || (x > 21 && x < 23 && z < 10)) return 0.15;
  return 0.0;
}

// Height of the surface a person stands on at (x, z)
export function groundAt(x, z) {
  const S = STORE;
  if (x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1) return S.floor;
  if (x > -7.2 && x < 10.9 && z > S.z1 - 0.01 && z < 0.25) return S.floor;
  if (x > S.x1 && x < 10.9 && z > -6.3 && z < S.z1) return S.floor;
  if (x > -7.95 && x < S.x0 && z > -10.5 && z < -8.7) return 0.24;   // back-door step
  if (x < 11.5 && z < 7.5) return x > -7.2 && z > 0.25 ? 0.1 : 0.08;
  return floorAt(x, z);
}

// Under a roof: inside the store, under its awnings, or under the back-door canopy
export function isSheltered(x, z) {
  const S = STORE;
  if (x > -7.3 && x < 11 && z > S.z0 && z < 0.2) return true;
  return x > -8.1 && x < S.x0 && z > -10.7 && z < -8.5;
}
