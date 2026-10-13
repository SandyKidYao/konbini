// The pedestrian network. Nodes are named places ('street.corner', 'shop.register'…); edges are walkable links.
// Edges can carry a lane width (walkers spread out instead of walking in single file), a gate (e.g. wait for
// the green man) and an onEnter hook (e.g. open an automatic door as someone approaches it).
export interface NavNode {
  id: string;
  x: number;
  z: number;
  /** facing when someone stops here (radians, 0 = +z) */
  heading?: number;
  tags: Set<string>;
}

export interface NavEdge {
  a: string;
  b: string;
  width: number;
  cost: number;
  gate?: (t: number) => boolean;
  onEnter?: (from: string, to: string) => void;
  tags: Set<string>;
}

export interface EdgeOptions {
  width?: number;
  gate?: (t: number) => boolean;
  onEnter?: (from: string, to: string) => void;
  tags?: string[];
  /** extra cost multiplier, to make detours less attractive */
  weight?: number;
}

export interface RouteLeg { from: NavNode; to: NavNode; edge: NavEdge }

export class NavGraph {
  readonly nodes = new Map<string, NavNode>();
  private adj = new Map<string, NavEdge[]>();

  addNode(id: string, x: number, z: number, opts: { heading?: number; tags?: string[] } = {}) {
    this.nodes.set(id, { id, x, z, heading: opts.heading, tags: new Set(opts.tags ?? []) });
    if (!this.adj.has(id)) this.adj.set(id, []);
    return id;
  }

  addEdge(a: string, b: string, o: EdgeOptions = {}) {
    const na = this.nodes.get(a), nb = this.nodes.get(b);
    if (!na || !nb) throw new Error(`[nav] edge ${a} → ${b}: unknown node`);
    const e: NavEdge = {
      a, b, width: o.width ?? 0, gate: o.gate, onEnter: o.onEnter, tags: new Set(o.tags ?? []),
      cost: Math.hypot(na.x - nb.x, na.z - nb.z) * (o.weight ?? 1),
    };
    this.adj.get(a)!.push(e);
    this.adj.get(b)!.push(e);
    return e;
  }

  /** Link consecutive nodes. */
  addPath(ids: string[], o: EdgeOptions = {}) {
    for (let i = 0; i < ids.length - 1; i++) this.addEdge(ids[i], ids[i + 1], o);
  }

  node(id: string) { return this.nodes.get(id); }
  has(id: string) { return this.nodes.has(id); }
  tagged(tag: string) { return [...this.nodes.values()].filter((n) => n.tags.has(tag)); }

  nearest(x: number, z: number, filter?: (n: NavNode) => boolean) {
    let best: NavNode | undefined, bd = Infinity;
    for (const n of this.nodes.values()) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** Shortest route (Dijkstra — the graph is small). */
  route(from: string, to: string): RouteLeg[] | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, NavEdge>();
    const open = new Set([from]);
    while (open.size) {
      let cur = '', cd = Infinity;
      for (const id of open) { const d = dist.get(id)!; if (d < cd) { cd = d; cur = id; } }
      open.delete(cur);
      if (cur === to) break;
      for (const e of this.adj.get(cur) ?? []) {
        const nxt = e.a === cur ? e.b : e.a;
        const nd = cd + e.cost;
        if (nd < (dist.get(nxt) ?? Infinity)) { dist.set(nxt, nd); prev.set(nxt, e); open.add(nxt); }
      }
    }
    if (!prev.has(to) && from !== to) return null;
    const legs: RouteLeg[] = [];
    let cur = to;
    while (cur !== from) {
      const e = prev.get(cur)!;
      const other = e.a === cur ? e.b : e.a;
      legs.unshift({ from: this.nodes.get(other)!, to: this.nodes.get(cur)!, edge: e });
      cur = other;
    }
    return legs;
  }
}
