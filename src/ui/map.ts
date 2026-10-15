// The map form: the street seen from straight above, as a small flat tile — the plan (engine/plan.ts) drawn on a
// 2D canvas. The light follows the hour and the weather, cars and people move as they do on the model (they are
// the same cars and people), the signals change, rain and snow fall. Meanwhile the model isn't drawn at all, so a
// frame costs only the simulation: small and cheap enough to sit in a corner of the desk.
import type { App } from '../engine/app';
import { PLAN_ORDER, type PlanKind, type PlanShape } from '../engine/plan';
import type { Rect } from '../engine/surfaces';

type RGB = [number, number, number];

/** each kind's colour by day (a shape can bring its own) */
const KIND: Record<PlanKind, string> = {
  land: '#e8e2d4', green: '#b3d096', walk: '#f1ece2', road: '#9ea3a9', lot: '#a8acb1',
  paint: '#fbfbf6', tree: '#86b45e', building: '#e6e2da', site: '#f4f4f0',
};
/** what night does to a colour: multiplied down and towards blue */
const NIGHT_MUL: RGB = [0.25, 0.28, 0.4];
const NIGHT_ADD: RGB = [12, 15, 27];
/** and the low sun: warmer */
const GOLDEN_MUL: RGB = [1.06, 0.94, 0.82];
/** settled snow: kinds that keep it (roads are driven clear) */
const SNOW_HOLD: Record<PlanKind, number> = { land: 0.9, green: 0.9, walk: 0.85, road: 0.3, lot: 0.45, paint: 0.3, tree: 0.6, building: 0.92, site: 0.92 };
const GLOW: RGB = [255, 196, 122];
/** a person, seen from above: a dot this wide (metres), never smaller than MIN_DOT px */
const PERSON = 0.75, MIN_DOT = 1.4;

/** Any CSS colour a mod gives (#rgb, #rrggbb, rgb(), a name) as RGB — the canvas normalises it, once per colour. */
const parsed = new Map<string, RGB>();
const scratch = document.createElement('canvas').getContext('2d')!;
const hex = (c: string): RGB => {
  let o = parsed.get(c);
  if (!o) {
    scratch.fillStyle = '#000';
    scratch.fillStyle = c;
    const n = String(scratch.fillStyle);
    o = n[0] === '#' ? [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)]
      : (n.match(/[\d.]+/g)?.slice(0, 3).map(Number) as RGB | undefined) ?? [0, 0, 0];
    if (parsed.size > 512) parsed.clear();
    parsed.set(c, o);
  }
  return o;
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** Andrew's monotone chain, counter-clockwise (every hull winds the same way, so overlapping shadows don't cancel). */
function convexHull(points: [number, number][]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export interface MapView {
  readonly canvas: HTMLCanvasElement;
  /** is the tile under this point (client coordinates)? */
  hit(x: number, y: number): boolean;
}

export function initMap(app: App, bounds: Rect): MapView {
  const atm = app.atmosphere, plan = app.plan;
  const canvas = document.createElement('canvas');
  canvas.className = 'plan';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '俯视图');
  document.getElementById('stage')!.after(canvas);
  const g = canvas.getContext('2d')!;
  const base = document.createElement('canvas');
  const bg = base.getContext('2d')!;
  const W = bounds.x1 - bounds.x0;

  let px = 1, dpr = 1;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return false;
    dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = base.width = w;
      canvas.height = base.height = h;
      baseKey = '';
    }
    px = w / W;
    return true;
  };
  const X = (x: number) => (x - bounds.x0) * px;
  const Z = (z: number) => (z - bounds.z0) * px;

  // ---------------------------------------------------------------- the light: one tint for everything
  const look = { night: 0, golden: 0, snow: 0, wet: 0 };
  const tint = (c: RGB, kind: PlanKind): RGB => {
    let o = c;
    const s = look.snow * SNOW_HOLD[kind];
    if (s > 0) o = mix(o, [244, 246, 250], s);
    if (look.wet > 0 && (kind === 'road' || kind === 'lot' || kind === 'walk')) o = mix(o, [o[0] * 0.78, o[1] * 0.8, o[2] * 0.86], look.wet);
    if (look.golden > 0) o = mix(o, [o[0] * GOLDEN_MUL[0], o[1] * GOLDEN_MUL[1], o[2] * GOLDEN_MUL[2]], look.golden);
    return look.night > 0 ? mix(o, [o[0] * NIGHT_MUL[0] + NIGHT_ADD[0], o[1] * NIGHT_MUL[1] + NIGHT_ADD[1], o[2] * NIGHT_MUL[2] + NIGHT_ADD[2]], look.night) : o;
  };
  const colourOf = (s: PlanShape) => hex(typeof s.color === 'function' ? s.color() : s.color ?? KIND[s.kind]);

  const path = (c: CanvasRenderingContext2D, s: PlanShape, dx = 0, dz = 0) => {
    c.beginPath();
    if (s.rect) {
      const r = s.rect;
      // paint is thin: keep it at least a hairline on a small tile
      let x0 = X(r.x0) + dx, x1 = X(r.x1) + dx, z0 = Z(r.z0) + dz, z1 = Z(r.z1) + dz;
      if (s.kind === 'paint') {
        const m = 0.9 * dpr;
        if (x1 - x0 < m) { const c0 = (x0 + x1) / 2; x0 = c0 - m / 2; x1 = c0 + m / 2; }
        if (z1 - z0 < m) { const c0 = (z0 + z1) / 2; z0 = c0 - m / 2; z1 = c0 + m / 2; }
      }
      c.rect(x0, z0, x1 - x0, z1 - z0);
    } else if (s.circle) {
      c.arc(X(s.circle.x) + dx, Z(s.circle.z) + dz, s.circle.r * px, 0, Math.PI * 2);
    }
  };

  /** A footprint swept away from the sun by (dx, dz) px: for a box, the hull of its corners and their shifted copies. */
  const shadowPath = (c: CanvasRenderingContext2D, s: PlanShape, dx: number, dz: number) => {
    if (s.circle) {
      const x = X(s.circle.x), z = Z(s.circle.z), r = s.circle.r * px * 0.8, a = Math.atan2(dz, dx);
      c.moveTo(x + Math.cos(a + Math.PI / 2) * r, z + Math.sin(a + Math.PI / 2) * r);
      c.arc(x, z, r, a + Math.PI / 2, a - Math.PI / 2);
      c.arc(x + dx, z + dz, r, a - Math.PI / 2, a + Math.PI / 2);
      c.closePath();
      return;
    }
    const r = s.rect!;
    const pts: [number, number][] = [];
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) pts.push([X(x), Z(z)], [X(x) + dx, Z(z) + dz]);
    const hull = convexHull(pts);
    c.moveTo(hull[0][0], hull[0][1]);
    for (const p of hull.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
  };

  // ---------------------------------------------------------------- the ground and what stands on it: redrawn only when the light changes
  let baseKey = '';
  const drawBase = () => {
    const d = atm.drivers;
    const sorted = PLAN_ORDER.flatMap((k) => plan.shapes.filter((s) => s.kind === k));
    // the light moves slowly: redraw the static layer in small steps, not every frame
    const q = (v: number, n = 40) => Math.round(v * n);
    const sun = atm.sunPosition;
    const glows = [...new Set(plan.shapes.map((s) => s.glow).filter(Boolean))].map((c) => q(atm.channel(c!), 20));
    const fns = plan.shapes.filter((s) => typeof s.color === 'function').map((s) => (s.color as () => string)());
    const key = [q(look.night), q(look.golden, 20), q(look.snow), q(look.wet, 10), q(d.cloud, 10), q(sun.x / sun.y, 8), q(sun.z / sun.y, 8), canvas.width, plan.shapes.length, ...glows, ...fns].join();
    if (key === baseKey) return;
    baseKey = key;

    const c = bg;
    c.clearRect(0, 0, base.width, base.height);
    // shadows fall away from the sun, longer the lower it is; soft under cloud, faint by moonlight
    const k = Math.max(0.15, sun.y);
    let sx = (-sun.x / k) * 0.35, sz = (-sun.z / k) * 0.35;
    const len = Math.hypot(sx, sz);
    if (len > 0.9) { sx *= 0.9 / len; sz *= 0.9 / len; }
    const shadowA = 0.15 * (1 - look.night * 0.7) * (1 - d.cloud * 0.85) * (1 - d.fog * 0.8) * (1 - look.snow * 0.4);
    let shadowsDone = false;
    for (const s of sorted) {
      // the ground first, then every shadow, then what casts them
      if (!shadowsDone && (s.kind === 'tree' || s.kind === 'building' || s.kind === 'site')) {
        shadowsDone = true;
        c.fillStyle = `rgba(30, 38, 60, ${shadowA})`;
        c.beginPath();
        for (const t of sorted) if (t.h) shadowPath(c, t, sx * t.h * px, sz * t.h * px);
        c.fill('nonzero');
      }
      c.fillStyle = css(tint(colourOf(s), s.kind), s.kind === 'paint' ? 0.85 - look.night * 0.5 : 1);
      path(c, s);
      c.fill();
      // a soft edge on what stands up, so roofs read as roofs
      if (s.h && s.rect) {
        c.strokeStyle = css(tint([60, 66, 80], s.kind), 0.14 + look.snow * 0.2);
        c.lineWidth = Math.max(1, 0.12 * px);
        c.stroke();
      }
    }
    // lit windows and shop light: a warm wash over the shape and a glow around it
    for (const s of sorted) {
      if (!s.glow) continue;
      const v = Math.min(1, atm.channel(s.glow)) * look.night;
      if (v < 0.02) continue;
      const strong = s.kind === 'site' ? 1 : 0.45;
      c.save();
      c.shadowColor = css(GLOW, 0.8 * v * strong);
      c.shadowBlur = 3.2 * px * strong;
      c.fillStyle = css(GLOW, 0.32 * v * strong);
      path(c, s);
      c.fill();
      c.restore();
    }
  };

  // ---------------------------------------------------------------- weather: particles live in tile coordinates (0–1)
  const rand = Math.random;
  const drops = Array.from({ length: 160 }, () => ({ x: rand(), y: rand(), s: 0.7 + rand() * 0.6 }));
  const flakes = Array.from({ length: 110 }, () => ({ x: rand(), y: rand(), s: 0.5 + rand() * 0.8, p: rand() * 6 }));
  const clouds = Array.from({ length: 4 }, (_, i) => ({ x: rand(), y: (i + rand()) / 4, r: 0.22 + rand() * 0.16 }));

  // ---------------------------------------------------------------- one frame
  let last = performance.now();
  const shown = () => document.body.dataset.form === 'plan';
  const roofs = () => plan.shapes.filter((s) => s.rect && (s.h ?? 0) >= 2);
  const underRoof = (x: number, z: number, list: PlanShape[]) => list.some((s) => { const r = s.rect!; return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1; });

  const draw = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!shown() || !fit()) return;
    const d = atm.drivers, t = app.elapsed;
    const day = Math.min(1, Math.max(0, (d.daylight - 0.05) / 0.4));
    look.night = 1 - day * day * (3 - 2 * day);
    look.golden = d.golden * 0.6 * (1 - look.night);
    look.snow = d.snowCover;
    look.wet = d.wet * 0.9;
    drawBase();
    const cw = canvas.width, ch = canvas.height;
    g.clearRect(0, 0, cw, ch);
    g.drawImage(base, 0, 0);

    // street lamps: warm pools on the ground
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const m of plan.markers) {
      if (!m.pool) continue;
      const col = m.color(t);
      if (!col) continue;
      const r = m.pool * px, x = X(m.x), z = Z(m.z);
      const grad = g.createRadialGradient(x, z, 0, x, z, r);
      grad.addColorStop(0, css(hex(col), 0.3 * look.night));
      grad.addColorStop(1, css(hex(col), 0));
      g.fillStyle = grad;
      g.fillRect(x - r, z - r, r * 2, r * 2);
    }
    g.restore();

    // what moves
    const covered = roofs();
    for (const m of plan.moving()) {
      if (m.kind === 'person') {
        if (underRoof(m.x, m.z, covered)) continue;
        const r = Math.max(MIN_DOT * dpr, (PERSON / 2) * px);
        const c = tint(hex(m.color ?? '#5a6270'), 'building');
        g.beginPath();
        g.arc(X(m.x), Z(m.z), r, 0, Math.PI * 2);
        g.fillStyle = css(mix(c, [255, 255, 255], look.night * 0.35));
        g.fill();
        g.lineWidth = Math.max(0.6, 0.06 * px);
        g.strokeStyle = css([20, 24, 34], 0.35);
        g.stroke();
        continue;
      }
      const len = (m.len ?? 4.2) * px, wid = (m.width ?? 1.7) * px;
      g.save();
      g.translate(X(m.x), Z(m.z));
      g.rotate(Math.atan2(Math.cos(m.heading), Math.sin(m.heading)));   // local x = forward
      // headlights: two soft beams ahead, at dusk and night
      const beam = (m.lights ?? 0) * Math.max(look.night, 0.3);
      if (beam > 0.05) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const reach = 5.5 * px;
        const grad = g.createLinearGradient(len / 2, 0, len / 2 + reach, 0);
        grad.addColorStop(0, `rgba(255, 226, 170, ${0.3 * beam})`);
        grad.addColorStop(1, 'rgba(255, 226, 170, 0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(len / 2, -wid * 0.4);
        g.lineTo(len / 2 + reach, -wid * 1.3);
        g.lineTo(len / 2 + reach, wid * 1.3);
        g.lineTo(len / 2, wid * 0.4);
        g.fill();
        g.restore();
      }
      const body = tint(hex(m.color ?? '#d9d9d4'), 'building');
      g.fillStyle = css([20, 24, 34], 0.22 * (1 - look.night * 0.5));
      g.beginPath(); g.roundRect(-len / 2 + 0.25 * px, -wid / 2 + 0.35 * px, len, wid, wid * 0.28); g.fill();
      g.fillStyle = css(body);
      g.beginPath(); g.roundRect(-len / 2, -wid / 2, len, wid, wid * 0.28); g.fill();
      // the roof, a shade darker, with the windscreen ahead of it
      g.fillStyle = css(mix(body, [30, 36, 50], 0.18));
      g.beginPath(); g.roundRect(-len * 0.24, -wid * 0.36, len * 0.46, wid * 0.72, wid * 0.16); g.fill();
      g.fillStyle = css(tint([52, 64, 82], 'road'));
      g.fillRect(len * 0.2, -wid * 0.34, len * 0.1, wid * 0.68);
      if (m.braking) {
        g.fillStyle = 'rgba(255, 60, 48, 0.95)';
        g.fillRect(-len / 2 - 0.05 * px, -wid * 0.42, 0.25 * px, wid * 0.2);
        g.fillRect(-len / 2 - 0.05 * px, wid * 0.22, 0.25 * px, wid * 0.2);
      }
      g.restore();
    }

    // small lights: signals
    for (const m of plan.markers) {
      if (m.pool) continue;
      const col = m.color(t);
      if (!col) continue;
      const r = Math.max(1.2 * dpr, (m.r ?? 0.5) * px), x = X(m.x), z = Z(m.z);
      g.save();
      g.shadowColor = col;
      g.shadowBlur = r * (1.5 + look.night * 2);
      g.fillStyle = col;
      g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // cloud shadows drift over in the wind
    const wind = 0.004 + d.wind * 0.02;
    const cloudA = Math.max(0, d.cloud - 0.15) * 0.16 * (1 - look.night);
    for (const c of clouds) {
      c.x += wind * dt;
      if (c.x - c.r > 1.2) c.x = -c.r - 0.2;
      if (cloudA < 0.005) continue;
      const x = c.x * cw, y = c.y * ch, r = c.r * cw;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(40, 50, 72, ${cloudA})`);
      grad.addColorStop(1, 'rgba(40, 50, 72, 0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // rain: fine streaks slanting with the wind; snow: flakes drifting down, swaying
    const nRain = Math.round(d.rain * drops.length);
    if (nRain) {
      g.strokeStyle = look.night > 0.5 ? 'rgba(170, 190, 230, 0.4)' : 'rgba(235, 242, 255, 0.55)';
      g.lineWidth = Math.max(0.7, 0.07 * px);
      g.beginPath();
      const lean = 0.25 + d.wind * 0.5;
      for (let i = 0; i < nRain; i++) {
        const p = drops[i];
        p.y += dt * 1.6 * p.s; p.x += dt * 1.6 * p.s * lean * 0.3;
        if (p.y > 1.05) { p.y = -0.05; p.x = rand(); }
        if (p.x > 1.05) p.x -= 1.1;
        const x = p.x * cw, y = p.y * ch, l = 1.1 * px * p.s;
        g.moveTo(x, y); g.lineTo(x - l * lean * 0.3, y - l);
      }
      g.stroke();
    }
    const nSnow = Math.round(d.snow * flakes.length);
    if (nSnow) {
      g.fillStyle = 'rgba(255, 255, 255, 0.92)';
      for (let i = 0; i < nSnow; i++) {
        const f = flakes[i];
        f.y += dt * 0.07 * f.s; f.p += dt * 1.3;
        if (f.y > 1.03) { f.y = -0.03; f.x = rand(); }
        const x = (f.x + Math.sin(f.p) * 0.01 + d.wind * 0.02 * f.y) * cw, y = f.y * ch;
        g.beginPath(); g.arc(x, y, Math.max(0.9 * dpr, 0.2 * px * f.s), 0, Math.PI * 2); g.fill();
      }
    }
    // fog: a veil in the air's own colour; lightning: a flash
    if (d.fog > 0.02) { g.fillStyle = css(hex(`#${atm.look.fog.getHexString()}`), Math.min(0.6, d.fog * 0.55)); g.fillRect(0, 0, cw, ch); }
    if (d.flash > 0.02) { g.fillStyle = `rgba(235, 240, 255, ${d.flash * 0.45})`; g.fillRect(0, 0, cw, ch); }
  };
  app.onFrameUI(draw);

  return {
    canvas,
    hit(x, y) {
      if (!shown()) return false;
      const r = canvas.getBoundingClientRect();
      // the tile's rounded corners
      const rad = Math.min(r.width, r.height) * 0.06;
      const dx = Math.max(r.left + rad - x, 0, x - (r.right - rad)), dy = Math.max(r.top + rad - y, 0, y - (r.bottom - rad));
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && Math.hypot(dx, dy) <= rad;
    },
  };
}
