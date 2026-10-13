// The contract a "shop" site offers to events. Another site (a ramen bar, a bookshop…) can provide the
// same services and node names, and the customer / staff events will work there unchanged.
export const STORE = { x0: -7, x1: 9, z0: -16.5, z1: -6.5, h: 4.6, floor: 0.16, glassTop: 2.75 } as const;

export interface ShopService {
  openDoor(): void;
  /** browsable aisles inside: walk front → back, face one of `faces` to look at the shelves */
  aisles: { x: number; faces: number[]; front: string; back: string }[];
  nodes: { doorOut: string; doorIn: string; register: string; clerk: string; backroom: string };
  /** the front edge of the awning (lanterns, wind chimes and the like hang from it): x span, z, underside height */
  awning: { x0: number; x1: number; z: number; y: number };
}

export interface BackyardService {
  openStaffDoor(hold?: number): void;
  dispenseStaffDrink(): void;
  bench: { x: number; z: number; seatY: number; heading: number };
  nodes: { door: string; canopy: string; vending: string; bench: string };
}

export interface BannerService {
  readonly count: number;
  /** what banner i advertises right now (it changes with the season) */
  design(i: number): import('../../library/props').NoboriDesign;
  isOut(i: number): boolean;
  set(i: number, out: boolean): void;
  /** where staff stand to plant / pick up banner i */
  standNode(i: number): string;
  slot(i: number): { x: number; z: number };
}

/**
 * The car park in front: nose-in bays along the shop front, an aisle behind them, two-way driveways onto road A.
 * Cars back out of a bay into the aisle (nose towards a driveway), drive along it and out; coming in, they drive
 * along the aisle and turn into the bay. One car manoeuvres at a time.
 */
export interface ParkingService {
  bays: readonly ParkingBay[];
  driveways: readonly Driveway[];
  /** the aisle: the z cars drive along coming in and going out, and how far it runs in x */
  aisle: { in: number; out: number; x0: number; x1: number };
  /** who is in each bay (null = free) */
  holder(i: number): string | null;
  claim(i: number, who: string): void;
  release(i: number): void;
  /** One car manoeuvres in the aisle at a time: take it (true if `who` now has it), free it when done. */
  takeAisle(who: string): boolean;
  freeAisle(who: string): void;
}
export interface ParkingBay {
  /** centre of the bay */
  x: number;
  /** z of the wheel stop's face (the front tyres stop against it) */
  stop: number;
  /** people walk from the car to the apron up the gaps beside it: the driver's side (x), the passenger's, then along z = apron */
  walk: { driver: number; passenger: number; apron: number };
}
export interface Driveway {
  x: number;
  /** z of its mouth, where it meets the aisle */
  mouth: number;
  /** which way along road A cars may turn in from */
  from: readonly ('west' | 'east')[];
  /** which way along road A cars may turn out towards */
  to: readonly ('west' | 'east')[];
}
