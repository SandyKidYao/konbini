// The map form: the street seen from straight above, as a small pixel-art tile — the plan (engine/plan.ts) drawn
// on a canvas about a hundred pixels across and scaled up by a whole number, every pixel crisp. The light follows
// the hour and the weather, cars and people move as they do on the model (they are the same cars and people), the
// signals change, rain and snow fall. Meanwhile the model isn't drawn at all, so a frame costs only the simulation:
// small and cheap enough to sit in a corner of the desk.
//
// Pixel art means no smoothing anywhere: shapes snap to whole pixels, circles and turned cars are rasterised by
// hand, soft light is dithered, and the tile's corners are cut in steps.
import type { App } from '../engine/app';
import { PLAN_ORDER, type PlanKind, type PlanShape } from '../engine/plan';
import type { Rect } from '../engine/surfaces';

type RGB = [number, number, number];

/** at most this many pixels across (about two per metre on this block): low enough to read as pixel art */
const ART_W = 112;
/** rows of walnut under the tile (the plinth's edge), and the pixels cut from each row at a corner */
const EDGE = 3;
const CORNER = [4, 2, 1, 1];

/** each kind's colour by day (a shape can bring its own) */
const KIND: Record<PlanKind, string> = {
  land: '#e8e0cc', green: '#a8cf84', walk: '#f2ecdf', road: '#959ba3', lot: '#a3a8ae',
  paint: '#fbfbf4', tree: '#7fb456', building: '#e6e0d4', site: '#f6f5f0',
};
/** what night does to a colour: multiplied down and towards blue */
const NIGHT_MUL: RGB = [0.25, 0.28, 0.4];
const NIGHT_ADD: RGB = [12, 15, 30];
/** and the low sun: warmer */
const GOLDEN_MUL: RGB = [1.06, 0.94, 0.82];
/** settled snow: kinds that keep it (roads are driven clear) */
const SNOW_HOLD: Record<PlanKind, number> = { land: 0.9, green: 0.9, walk: 0.85, road: 0.3, lot: 0.45, paint: 0.3, tree: 0.6, building: 0.92, site: 0.92 };
const GLOW: RGB = [255, 196, 122];
const WALNUT: RGB[] = [[122, 84, 58], [96, 66, 46], [74, 51, 36]];
/** 4×4 ordered dither: soft light and cloud shadows become patterns of whole pixels */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

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

export interface MapView {
  readonly canvas: HTMLCanvasElement;
  /** is the tile under this point (client coordinates)? */
  hit(x: number, y: number): boolean;
}

export function initMap(app: App, bounds: Rect): MapView {
  const atm = app.atmosphere, plan = app.plan;
  // the box takes the size the layout gives the map; the canvas inside is that, rounded to whole art pixels
  const box = document.createElement('div');
  box.className = 'plan';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '俯视图');
  box.append(canvas);
  document.getElementById('stage')!.after(box);
  const g = canvas.getContext('2d')!;
  const base = document.createElement('canvas'), bg = base.getContext('2d')!;
  const shade = document.createElement('canvas'), sg = shade.getContext('2d')!;
  const W = bounds.x1 - bounds.x0;

  /** art pixels: across, down the tile (without the walnut edge); and per metre */
  let N = 0, M = 0, ppm = 1, boxW = 0;
  const fit = () => {
    const r = box.getBoundingClientRect();
    if (!r.width) return false;
    if (r.width === boxW && N) return true;
    boxW = r.width;
    const dpr = devicePixelRatio || 1;
    // a whole number of device pixels per art pixel (at least two, so it reads as pixels), as many art pixels as fit
    const k = Math.max(2, Math.ceil((r.width * dpr) / ART_W));
    N = Math.max(42, Math.floor((r.width * dpr) / k / 7) * 7);
    M = (N / 7) * 6;
    ppm = N / W;
    for (const c of [canvas, base]) { c.width = N; c.height = M + EDGE; }
    shade.width = N; shade.height = M;
    canvas.style.width = `${(N * k) / dpr}px`;
    canvas.style.height = `${((M + EDGE) * k) / dpr}px`;
    makeClouds();
    baseKey = '';
    return true;
  };
  const X = (x: number) => (x - bounds.x0) * ppm;
  const Z = (z: number) => (z - bounds.z0) * ppm;

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

  // ---------------------------------------------------------------- pixels
  /** a shape's rectangle in whole pixels (never thinner than one), shifted by (dx, dz) pixels and grown by `grow` */
  const pixRect = (r: Rect, dx = 0, dz = 0, grow = 0) => {
    let x0 = Math.round(X(r.x0)), x1 = Math.round(X(r.x1)), z0 = Math.round(Z(r.z0)), z1 = Math.round(Z(r.z1));
    if (x1 <= x0) x1 = x0 + 1;
    if (z1 <= z0) z1 = z0 + 1;
    return [x0 + dx - grow, z0 + dz - grow, x1 - x0 + grow * 2, z1 - z0 + grow * 2] as const;
  };
  /** a filled disc, pixel by pixel */
  const disc = (c: CanvasRenderingContext2D, cx: number, cz: number, r: number) => {
    const R = Math.max(0.6, r);
    for (let y = Math.floor(cz - R); y <= cz + R; y++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cz) ** 2 <= R * R) c.fillRect(x, y, 1, 1);
      }
    }
  };
  const fillShape = (c: CanvasRenderingContext2D, s: PlanShape, dx = 0, dz = 0, grow = 0) => {
    if (s.rect) c.fillRect(...pixRect(s.rect, dx, dz, grow));
    else if (s.circle) disc(c, X(s.circle.x) + dx, Z(s.circle.z) + dz, s.circle.r * ppm + grow);
  };

  // ---------------------------------------------------------------- the ground and what stands on it: redrawn only when the light changes
  let baseKey = '';
  const drawBase = () => {
    const d = atm.drivers;
    const q = (v: number, n = 40) => Math.round(v * n);
    const sun = atm.sunPosition;
    const glows = [...new Set(plan.shapes.map((s) => s.glow).filter(Boolean))].map((c) => q(atm.channel(c!), 20));
    const fns = plan.shapes.filter((s) => typeof s.color === 'function').map((s) => (s.color as () => string)());
    const pools = plan.markers.filter((m) => m.pool).map((m) => m.color(app.elapsed));
    const key = [q(look.night), q(look.golden, 20), q(look.snow), q(look.wet, 10), q(d.cloud, 10), q(sun.x / sun.y, 8), q(sun.z / sun.y, 8), N, plan.shapes.length, ...glows, ...fns, ...pools].join();
    if (key === baseKey) return;
    baseKey = key;

    const c = bg;
    c.clearRect(0, 0, N, M + EDGE);
    const sorted = PLAN_ORDER.flatMap((k) => plan.shapes.filter((s) => s.kind === k));
    const standing = (s: PlanShape) => s.kind === 'tree' || s.kind === 'building' || s.kind === 'site';

    // the ground and the paint on it
    for (const s of sorted) {
      if (standing(s)) continue;
      c.fillStyle = css(tint(colourOf(s), s.kind), s.kind === 'paint' ? 1 - look.night * 0.55 : 1);
      fillShape(c, s);
    }

    // shadows: each footprint swept away from the sun a whole pixel at a time, all of them at one strength
    const k = Math.max(0.15, sun.y);
    let sx = (-sun.x / k) * 0.35, sz = (-sun.z / k) * 0.35;
    const len = Math.hypot(sx, sz);
    if (len > 0.9) { sx *= 0.9 / len; sz *= 0.9 / len; }
    const shadowA = 0.2 * (1 - look.night * 0.7) * (1 - d.cloud * 0.85) * (1 - d.fog * 0.8) * (1 - look.snow * 0.4);
    if (shadowA > 0.01) {
      sg.clearRect(0, 0, N, M);
      sg.fillStyle = '#1e263c';
      for (const s of sorted) {
        if (!s.h) continue;
        const dx = sx * s.h * ppm, dz = sz * s.h * ppm, steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)));
        for (let i = 0; i <= steps; i++) fillShape(sg, s, Math.round((dx * i) / Math.max(1, steps)), Math.round((dz * i) / Math.max(1, steps)));
      }
      c.globalAlpha = shadowA;
      c.drawImage(shade, 0, 0);
      c.globalAlpha = 1;
    }

    // street lamps: a dithered pool of amber light on the ground, solid near the lamp (on the blue night ground,
    // only a plain amber wash reads warm — screening or adding light turns grey)
    for (const m of plan.markers) {
      if (!m.pool) continue;
      const col = m.color(app.elapsed);
      if (!col || look.night < 0.05) continue;
      c.fillStyle = css(mix(hex(col), [255, 160, 70], 0.4), 0.38 * look.night);
      const cx = X(m.x), cz = Z(m.z), R = m.pool * ppm;
      for (let y = Math.floor(cz - R); y <= cz + R; y++) {
        for (let x = Math.floor(cx - R); x <= cx + R; x++) {
          const f = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cz) / R;
          if (f > 0 && (f > 0.5 || f * 1.6 > dither(x, y))) c.fillRect(x, y, 1, 1);
        }
      }
    }

    // what stands up: a lit edge on top, a shaded one at the foot; lit windows glow in steps around it at night
    for (const s of sorted) {
      if (!standing(s)) continue;
      const v = s.glow ? Math.min(1, atm.channel(s.glow)) * look.night * (s.kind === 'site' ? 1 : 0.5) : 0;
      // only the shop's light spills out in steps; windows elsewhere just warm their roof
      if (v > 0.03 && s.kind === 'site') {
        c.fillStyle = css(GLOW, 0.12 * v); fillShape(c, s, 0, 0, 2);
        c.fillStyle = css(GLOW, 0.2 * v); fillShape(c, s, 0, 0, 1);
      }
      const col = tint(colourOf(s), s.kind);
      c.fillStyle = css(col);
      fillShape(c, s);
      if (s.h && s.rect && s.h > 1) {
        const [x, y, w, h] = pixRect(s.rect);
        if (w > 2 && h > 2) {
          c.fillStyle = css(mix(col, [255, 255, 255], 0.3)); c.fillRect(x, y, w, 1);
          c.fillStyle = css(mix(col, [24, 28, 40], 0.22)); c.fillRect(x, y + h - 1, w, 1);
        }
      }
      if (v > 0.03) { c.fillStyle = css(GLOW, 0.3 * v); fillShape(c, s); }
    }

    // the plinth's walnut edge under the tile
    WALNUT.forEach((w, i) => { c.fillStyle = css(mix(w, [w[0] * 0.45, w[1] * 0.45, w[2] * 0.55], look.night)); c.fillRect(0, M + i, N, 1); });
  };

  // ---------------------------------------------------------------- weather: particles live in tile coordinates (0–1)
  const rand = Math.random;
  const drops = Array.from({ length: 70 }, () => ({ x: rand(), y: rand(), s: 0.7 + rand() * 0.6 }));
  const flakes = Array.from({ length: 60 }, () => ({ x: rand(), y: rand(), s: 0.5 + rand() * 0.8, p: rand() * 6 }));
  const clouds = Array.from({ length: 4 }, (_, i) => ({ x: rand(), y: (i + rand()) / 4, r: 0.2 + rand() * 0.14, sprite: null as HTMLCanvasElement | null }));
  /** each cloud's shadow: a dithered blob, made once per size */
  function makeClouds() {
    for (const cl of clouds) {
      const R = Math.round(cl.r * N), s = document.createElement('canvas');
      s.width = s.height = R * 2;
      const c = s.getContext('2d')!;
      c.fillStyle = '#28324a';
      for (let y = 0; y < R * 2; y++) {
        for (let x = 0; x < R * 2; x++) {
          const f = 1 - Math.hypot((x + 0.5 - R) / R, (y + 0.5 - R) / (R * 0.75));
          if (f > 0 && f * 1.6 > dither(x, y)) c.fillRect(x, y, 1, 1);
        }
      }
      cl.sprite = s;
    }
  }

  // ---------------------------------------------------------------- one frame
  let last = performance.now();
  const shown = () => document.body.dataset.form === 'plan';
  const underRoof = (x: number, z: number) => plan.shapes.some((s) => {
    if (!s.rect || (s.h ?? 0) < 2) return false;
    const r = s.rect;
    return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  });
  const dot = (x: number, y: number) => g.fillRect(Math.floor(x), Math.floor(y), 1, 1);

  /** A vehicle, rasterised pixel by pixel from its heading: body, a darker roof, the windscreen, brake lights. */
  const vehicle = (cx: number, cz: number, heading: number, len: number, wid: number, body: RGB, braking: boolean) => {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const L = (len * ppm) / 2, Wd = Math.max(0.75, (wid * ppm) / 2), R = Math.ceil(Math.hypot(L, Wd)) + 1;
    const roof = css(mix(body, [30, 36, 50], 0.2)), glass = css(tint([46, 58, 78], 'road')), main = css(body);
    for (let y = Math.floor(cz - R); y <= cz + R; y++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x + 0.5 - cx, dz = y + 0.5 - cz;
        const f = dx * fx + dz * fz, s = dx * fz - dz * fx;
        if (Math.abs(f) > L || Math.abs(s) > Wd) continue;
        const inner = Math.abs(s) < Wd * 0.6 && L > 2;
        g.fillStyle = braking && f < -L + 0.9 ? '#ff4a3a' : inner && f > L * 0.2 && f < L * 0.55 ? glass : inner && f > -L * 0.5 && f <= L * 0.2 ? roof : main;
        g.fillRect(x, y, 1, 1);
      }
    }
  };
  /** Headlights: a short fan of light ahead, in three steps of brightness. */
  const beam = (cx: number, cz: number, heading: number, len: number, wid: number, k: number) => {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const L = (len * ppm) / 2, reach = 5 * ppm, R = Math.ceil(L + reach) + 1;
    for (let y = Math.floor(cz - R); y <= cz + R; y++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x + 0.5 - cx, dz = y + 0.5 - cz;
        const f = dx * fx + dz * fz - L, s = Math.abs(dx * fz - dz * fx);
        if (f < 0 || f > reach || s > (wid * ppm) / 2 + f * 0.45) continue;
        const step = f < reach / 3 ? 0.3 : f < (reach * 2) / 3 ? 0.17 : 0.08;
        g.fillStyle = `rgba(255, 226, 168, ${step * k})`;
        g.fillRect(x, y, 1, 1);
      }
    }
  };

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
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, N, M + EDGE);
    g.drawImage(base, 0, 0);

    // what moves: headlights first (under everything), then the vehicles, then people on foot
    const moving = [...plan.moving()];
    for (const m of moving) {
      const k = m.kind === 'vehicle' ? (m.lights ?? 0) * Math.max(look.night, 0.25) : 0;
      if (k > 0.05) beam(X(m.x), Z(m.z), m.heading, m.len ?? 4.2, m.width ?? 1.7, k);
    }
    for (const m of moving) {
      if (m.kind === 'vehicle') vehicle(X(m.x), Z(m.z), m.heading, m.len ?? 4.2, m.width ?? 1.7, tint(hex(m.color ?? '#d9d9d4'), 'building'), !!m.braking);
    }
    for (const m of moving) {
      if (m.kind !== 'person' || underRoof(m.x, m.z)) continue;
      // one pixel each, brighter than the ground so they read at night too
      g.fillStyle = css(mix(tint(hex(m.color ?? '#5a6270'), 'building'), [255, 250, 240], look.night * 0.45));
      dot(X(m.x), Z(m.z));
    }

    // signals: a pixel of colour, with a cross of glow at night
    for (const m of plan.markers) {
      if (m.pool) continue;
      const col = m.color(t);
      if (!col) continue;
      const x = Math.floor(X(m.x)), y = Math.floor(Z(m.z));
      if (look.night > 0.2) {
        g.fillStyle = css(hex(col), 0.4 * look.night);
        g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
      }
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }

    // cloud shadows drift over in the wind
    const wind = 0.004 + d.wind * 0.02;
    // (broken cloud: under a full overcast there are no separate shadows to see)
    const cloudA = Math.max(0, d.cloud - 0.15) * Math.max(0, 1 - d.cloud) * 0.7 * (1 - look.night);
    for (const cl of clouds) {
      cl.x += wind * dt;
      if (cl.x - cl.r > 1.2) cl.x = -cl.r - 0.2;
      if (cloudA < 0.01 || !cl.sprite) continue;
      g.globalAlpha = cloudA;
      g.drawImage(cl.sprite, Math.round(cl.x * N - cl.sprite.width / 2), Math.round(cl.y * M - cl.sprite.height / 2));
      g.globalAlpha = 1;
    }
    // rain: short slanting streaks; snow: single flakes drifting down, swaying
    const nRain = Math.round(d.rain * drops.length);
    if (nRain) {
      g.fillStyle = look.night > 0.5 ? 'rgba(160, 182, 228, 0.55)' : 'rgba(232, 240, 255, 0.7)';
      for (let i = 0; i < nRain; i++) {
        const p = drops[i];
        p.y += dt * 1.4 * p.s; p.x += dt * 0.2 * p.s * (0.3 + d.wind);
        if (p.y > 1.05) { p.y = -0.05; p.x = rand(); }
        if (p.x > 1.02) p.x -= 1.04;
        const x = Math.floor(p.x * N), y = Math.floor(p.y * M);
        g.fillRect(x, y, 1, 1); g.fillRect(x - 1, y - 1, 1, 1);
      }
    }
    const nSnow = Math.round(d.snow * flakes.length);
    if (nSnow) {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < nSnow; i++) {
        const f = flakes[i];
        f.y += dt * 0.07 * f.s; f.p += dt * 1.3;
        if (f.y > 1.03) { f.y = -0.03; f.x = rand(); }
        dot((f.x + Math.sin(f.p) * 0.012 + d.wind * 0.02 * f.y) * N, f.y * M);
      }
    }
    // fog: a veil in the air's own colour; lightning: a flash
    if (d.fog > 0.02) { g.fillStyle = css(hex(`#${atm.look.fog.getHexString()}`), Math.min(0.6, d.fog * 0.55)); g.fillRect(0, 0, N, M); }
    if (d.flash > 0.02) { g.fillStyle = `rgba(235, 240, 255, ${d.flash * 0.45})`; g.fillRect(0, 0, N, M); }

    // the tile's corners, cut in steps
    const H = M + EDGE;
    CORNER.forEach((n, i) => {
      g.clearRect(0, i, n, 1); g.clearRect(N - n, i, n, 1);
      g.clearRect(0, H - 1 - i, n, 1); g.clearRect(N - n, H - 1 - i, n, 1);
    });
  };
  app.onFrameUI(draw);

  return {
    canvas,
    hit(x, y) {
      if (!shown()) return false;
      const r = canvas.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },
  };
}
