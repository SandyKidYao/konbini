// Where people can walk. Routes are lists of [x, z] points; the token 'X' marks a kerb where the
// walker waits for the green man before crossing road B.
import { walk, until } from './actor.js';
import { pedPhase } from '../world/street.js';
import { R } from './figure.js';

const WEST_X = -27.6, EAST_X = 27.6, SOUTH_Z = -23.6;
const HUB_X = 12.45;               // corner of sidewalk A and sidewalk B, next to the store
const B_X = 12.45, B2_X = 21.85;   // sidewalks along road B (store side, far side)
const LOT_X = 2.5;                 // walking line through the parking lot, between stalls
export const FAR_Z = 18.1;         // far-side sidewalk across road A

export const EDGES = ['west', 'east', 'southB', 'southB2'];

// a fresh set of lane offsets so people don't walk in single file
export const lanes = () => ({ az: 8.75 + R(-0.45, 0.45), xz: 5.8 + R(-1.1, 1.1) });

function legToHub(edge, { az, xz }) {
  switch (edge) {
    case 'west': return [[WEST_X, az]];
    case 'southB': return [[B_X, SOUTH_Z]];
    case 'east': return [[EAST_X, az], [B2_X, az], [B2_X, xz], 'X', [B_X, xz]];
    default: return [[B2_X, SOUTH_Z], [B2_X, xz], 'X', [B_X, xz]];
  }
}
const reverse = (tokens) => tokens.slice().reverse();
const eastSide = (e) => e === 'east' || e === 'southB2';

export function between(e1, e2, L = lanes()) {
  if (eastSide(e1) && eastSide(e2)) {
    const a = e1 === 'east' ? [[EAST_X, L.az], [B2_X, L.az]] : [[B2_X, SOUTH_Z]];
    const b = e2 === 'east' ? [[B2_X, L.az], [EAST_X, L.az]] : [[B2_X, SOUTH_Z]];
    return [...a, ...b];
  }
  return [...legToHub(e1, L), [HUB_X, L.az], ...reverse(legToHub(e2, L))];
}

// edge → a point on sidewalk A in front of the store
export function toFront(edge, x, L = lanes()) {
  if (edge === 'west') return [[WEST_X, L.az], [x, L.az]];
  return [...legToHub(edge, L), [HUB_X, L.az], [x, L.az]];
}
export function fromFront(edge, x, L = lanes()) {
  if (edge === 'west') return [[x, L.az], [WEST_X, L.az]];
  return [[x, L.az], [HUB_X, L.az], ...reverse(legToHub(edge, L))];
}

// from sidewalk A through the lot to just inside the automatic door, and back
export const DOOR_IN = [1.0, -3.15];
export const toDoor = (L) => [[LOT_X, L.az], [LOT_X, 7.2], [LOT_X, 0.9], [1.0, -0.7], DOOR_IN];
export const fromDoor = (L) => [DOOR_IN, [1.0, -0.7], [LOT_X, 0.9], [LOT_X, 7.2], [LOT_X, L.az]];

export const farSidewalk = (dir) => {
  const z = FAR_Z + R(-0.4, 0.4);
  return dir > 0 ? [[WEST_X, z], [EAST_X, z]] : [[EAST_X, z], [WEST_X, z]];
};

// --- inside the store ---
export const FRONT_AISLE_Z = -3.65, BACK_AISLE_Z = -10.25;
// [x, which way the shelves are] for each aisle between gondolas
export const AISLES = [[-1.97, 0], [1.5, 0], [5.15, 0], [7.65, -1]];
export const REGISTER = [-4.05, -5.2];
export const CLERK_SPOT = [-6.1, -5.2];

// turn a token list into walk steps, waiting at kerbs for the pedestrian signal
export function stepsFrom(tokens, opts) {
  const steps = [];
  let seg = [];
  for (const tk of tokens) {
    if (tk === 'X') {
      if (seg.length) steps.push(walk(seg, opts));
      steps.push(until((a, t) => pedPhase(t) === 'g'));
      seg = [];
    } else seg.push(tk);
  }
  if (seg.length) steps.push(walk(seg, opts));
  return steps;
}
