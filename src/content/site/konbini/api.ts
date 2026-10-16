// The contract a "shop" site offers to events. Another site (a ramen bar, a bookshop…) can provide the
// same services and node names, and the customer / staff events will work there unchanged.
export const STORE = { x0: -8.2, x1: 7.8, z0: -6, z1: 4, h: 4.6, floor: 0.16, glassTop: 2.75 } as const;
/** The staff yard on the store's left: from the west neighbour to the store's wall, from the back lane to its fence. */
export const YARD = { x0: -14.7, x1: STORE.x0, z0: -6, z1: 3.5 } as const;

export interface ShopService {
  openDoor(): void;
  /** browsable aisles inside: walk front → back, face one of `faces` to look at the shelves */
  aisles: { x: number; faces: number[]; front: string; back: string }[];
  /** `sideOut`: outside a second door, nearer the bays beside the shop (if there is one) */
  nodes: { doorOut: string; doorIn: string; register: string; clerk: string; backroom: string; sideOut?: string };
  /** the front edge of the awning (lanterns, wind chimes and the like hang from it): x span, z, underside height */
  awning: { x0: number; x1: number; z: number; y: number };
}

export interface BackyardService {
  openStaffDoor(hold?: number): void;
  dispenseStaffDrink(): void;
  bench: { x: number; z: number; seatY: number; heading: number };
  /** the opening in the yard's fence onto the back lane, where deliveries are handed in (x span, z of the fence) */
  opening: { x0: number; x1: number; z: number };
  /** `lane`: just outside the opening, in the back lane */
  nodes: { door: string; canopy: string; vending: string; bench: string; lane: string };
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
 * The bays beside the shop: nose-in to the side windows, opening straight onto road B — the road is the aisle.
 * Cars pull in from road B's lane towards the sea and back out onto road B. One car manoeuvres at a time.
 */
export interface ParkingService {
  bays: readonly ParkingBay[];
  /** who is in each bay (null = free) */
  holder(i: number): string | null;
  claim(i: number, who: string): void;
  release(i: number): void;
  /** One car pulls in or backs out at a time: take the frontage (true if `who` now has it), free it when done. */
  takeFront(who: string): boolean;
  freeFront(who: string): void;
}
export interface ParkingBay {
  /** centre of the bay along road B */
  z: number;
  /** x of the wheel stop's face (the front tyres stop against it); parked cars face −x */
  stop: number;
  /** people walk from the car through the gaps beside it to the walkway along the windows: the driver's side (z), the passenger's, then x = walkway */
  walk: { driver: number; passenger: number; walkway: number };
}
