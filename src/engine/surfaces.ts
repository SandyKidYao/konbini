// What the ground is like at (x, z): the height people stand on, the highest roof rain lands on,
// and whether a spot is under cover. Mods register rectangles; nobody hard-codes buildings here.
export interface Rect { x0: number; x1: number; z0: number; z1: number }

interface WalkRect extends Rect { y: number; priority: number; order: number }
interface RoofRect extends Rect { y: number }

const inside = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export class Surfaces {
  private walks: WalkRect[] = [];
  private roofs: RoofRect[] = [];
  private shelters: Rect[] = [];
  private order = 0;

  /** A walkable surface at height y. Higher priority wins where rectangles overlap; ties go to the later one. */
  addWalk(r: Rect, y: number, priority = 0) {
    this.walks.push({ ...r, y, priority, order: this.order++ });
  }
  /** A roof or canopy: rain stops here. */
  addRoof(r: Rect, y: number) { this.roofs.push({ ...r, y }); }
  /** Under cover (umbrellas fold here). */
  addShelter(r: Rect) { this.shelters.push({ ...r }); }

  walkAt(x: number, z: number) {
    let best: WalkRect | null = null;
    for (const w of this.walks) {
      if (!inside(w, x, z)) continue;
      if (!best || w.priority > best.priority || (w.priority === best.priority && w.order > best.order)) best = w;
    }
    return best ? best.y : 0;
  }
  /** Highest surface at (x, z), roofs included — where a raindrop ends. */
  topAt(x: number, z: number) {
    let y = this.walkAt(x, z);
    for (const r of this.roofs) if (inside(r, x, z) && r.y > y) y = r.y;
    return y;
  }
  sheltered(x: number, z: number) {
    return this.shelters.some((r) => inside(r, x, z));
  }
}
