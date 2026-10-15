// The plan: the scene seen straight from above, as flat shapes — what the map form (ui/map.ts) draws, small
// enough for a corner of the desk. Content adds its footprints as it builds them (roads, roofs, trees) and says
// what moves (vehicles, people); the map reads it all every frame, so the street on the map is the same street.
// Like everything a mod builds, the plan knows nothing about any particular scene.
import type { Rect } from './surfaces';

/** What a shape is, which decides its colour on the map (unless it brings its own) and the drawing order. */
export type PlanKind = 'land' | 'green' | 'walk' | 'road' | 'lot' | 'paint' | 'tree' | 'building' | 'site';
/** Drawn bottom to top: the road surface under everything, the ground on it, markings, then what stands up (the
 *  site — the main subject — last). */
export const PLAN_ORDER: readonly PlanKind[] = ['road', 'land', 'green', 'walk', 'lot', 'paint', 'tree', 'building', 'site'];

export interface PlanShape {
  kind: PlanKind;
  /** a rectangle… */
  rect?: Rect;
  /** …or a circle (a tree's crown) */
  circle?: { x: number; z: number; r: number };
  /** height in metres: what stands up casts a shadow away from the sun, longer the taller it is */
  h?: number;
  /** fill; omitted = the map's own colour for the kind (it follows day and night). A function is asked every
   *  frame: a tree through the seasons */
  color?: string | (() => string);
  /** an atmosphere channel ('window', 'interior', 'sign'…): the shape glows on the map as the channel rises */
  glow?: string;
}

/** A small light: a signal, a lamp. `color` is asked every frame (scene time t); null = dark. */
export interface PlanMarker {
  x: number;
  z: number;
  /** metres (default 0.5) */
  r?: number;
  color(t: number): string | null;
  /** a soft pool of light this wide (metres) around it, at night */
  pool?: number;
}

/**
 * Something that moves, as the map draws it: heading 0 faces +z, π/2 faces +x (as everywhere in the scene). The
 * map draws every vehicle in one colour and every person in another — at the size of a stamp, more reads as noise.
 */
export interface PlanMover {
  kind: 'vehicle' | 'person';
  x: number;
  z: number;
  heading: number;
  /** metres (a vehicle's footprint; a person is a dot) */
  len?: number;
  width?: number;
}

export type PlanSource = () => Iterable<PlanMover>;

/** What mods get as ctx.plan. */
export interface PlanApi {
  add(shape: PlanShape): void;
  marker(marker: PlanMarker): void;
  /** Report what moves: called once per drawn frame. Returns a function that stops it. */
  movers(source: PlanSource): () => void;
}

export class Plan {
  shapes: PlanShape[] = [];
  markers: PlanMarker[] = [];
  private sources: PlanSource[] = [];
  private owners = new WeakMap<object, string>();

  /** The API for one mod: what it adds is remembered as its own, so a mod that fails can be taken off the map. */
  for(owner: string): PlanApi {
    return {
      add: (shape) => { if (shape.rect || shape.circle) { this.owners.set(shape, owner); this.shapes.push(shape); } },
      marker: (marker) => { this.owners.set(marker, owner); this.markers.push(marker); },
      movers: (source) => {
        this.owners.set(source, owner);
        this.sources.push(source);
        return () => { this.sources = this.sources.filter((s) => s !== source); };
      },
    };
  }
  /** Take everything a mod added off the map. */
  drop(owner: string) {
    const mine = (o: object) => this.owners.get(o) === owner;
    this.shapes = this.shapes.filter((s) => !mine(s));
    this.markers = this.markers.filter((m) => !mine(m));
    this.sources = this.sources.filter((s) => !mine(s));
  }

  /** Everything that moves right now. A source that throws is dropped (one broken mod mustn't blank the map). */
  *moving(): Iterable<PlanMover> {
    for (const s of this.sources) {
      let list: Iterable<PlanMover>;
      try { list = [...s()]; } catch (e) { console.warn('[plan] a mover source failed and was removed', e); this.sources = this.sources.filter((x) => x !== s); continue; }
      yield* list;
    }
  }
}
