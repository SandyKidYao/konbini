// The contract a "shop" site offers to events. Another site (a ramen bar, a bookshop…) can provide the
// same services and node names, and the customer / staff events will work there unchanged.
export const STORE = { x0: -7, x1: 9, z0: -12, z1: -2, h: 4.6, floor: 0.16, glassTop: 2.75 } as const;

export interface ShopService {
  openDoor(): void;
  /** browsable aisles inside: walk front → back, face one of `faces` to look at the shelves */
  aisles: { x: number; faces: number[]; front: string; back: string }[];
  nodes: { doorOut: string; doorIn: string; register: string; clerk: string; backroom: string };
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
