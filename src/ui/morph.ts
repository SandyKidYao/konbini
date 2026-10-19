// The model turning into the map, and back. Both show the same street, so the change is shown as one becoming the
// other rather than a crossfade between two pictures:
//
//   model → map   the camera swings up to straight overhead, framed so the block lies where the tile will be; the
//                 picture then coarsens in jumps down to the tile's own art pixels, and dissolves into the tile pixel
//                 by pixel (in the map's dither order)
//   map → model   the same backwards: the overhead picture appears pixel by pixel over the tile, sharpens, and the
//                 camera swings back down to where it stood
//
// The pixelated picture is the live frame, read back right after it is drawn (App.onRendered), so cars keep moving
// through it. With reduced motion the form just changes.
import type { App } from '../engine/app';
import type { CameraPose } from '../engine/stage';
import type { MapView } from './map';
import type { Form } from './size';

/** seconds: the swing up (or down), the coarsening, the dissolve */
const FLY = 1.1, FLY_BACK = 1.3, PIXELATE = 0.6, DISSOLVE = 0.5;
/** the picture coarsens in this many jumps: pixel art goes from one size to the next, it doesn't blur between them */
const STEPS = 6;
/** straight overhead from about the overview's distance (so the fog reads the same), on a moderate lens */
const TOP_HEIGHT = 110, TOP_FOV = 24;
/** the map's 4×4 ordered dither (map.ts): the order the pixels change in */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** the tile's corners, cut in steps as the map cuts them */
const CORNER = [2, 1];

export interface Morph {
  /** a form change is on screen */
  readonly busy: boolean;
  /** where the camera stood when the model last became the map (null: it never has) */
  readonly saved: CameraPose | null;
  /**
   * Show this form, after any change already under way. `back`: where the camera goes once the model is back (read
   * then, when the canvas has its size). `instant`: no animation (at start; and always with reduced motion).
   */
  go(to: Form, back: () => CameraPose, instant?: boolean): Promise<void>;
}

export interface MorphOptions {
  /** px kept clear inside the model's canvas edge (the desk's soft edge): the overhead block is framed inside it */
  margin(): number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const lerpRect = (a: DOMRect, b: DOMRect, t: number) =>
  new DOMRect(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.width + (b.width - a.width) * t, a.height + (b.height - a.height) * t);

export function initMorph(app: App, map: MapView, opts: MorphOptions): Morph {
  const { stage } = app, body = document.body;
  const gl = stage.renderer.domElement, stageEl = gl.parentElement!, tileEl = map.canvas.parentElement!;
  const overlay = document.createElement('canvas');
  overlay.className = 'morph';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  document.body.append(overlay);
  const og = overlay.getContext('2d')!;
  // halving steps for the read-back: one big drawImage step skips pixels instead of averaging them
  const half = [document.createElement('canvas'), document.createElement('canvas')];

  let shown: Form = app.form, target: Form = shown, busy = false, saved: CameraPose | null = null;
  let chain = Promise.resolve();

  // ---------------------------------------------------------------- frames: everything runs just after a frame is drawn
  let onFrame: ((now: number) => void) | null = null;
  app.onRendered(() => onFrame?.(performance.now()));
  /** fn(t) once per drawn frame, t going 0 → 1 over `seconds` (or until `done` says so) */
  const phase = (seconds: number, fn: (t: number) => void, done?: () => boolean) => new Promise<void>((resolve) => {
    const t0 = performance.now();
    onFrame = (now) => {
      const t = seconds > 0 ? Math.min(1, (now - t0) / 1000 / seconds) : 1;
      fn(t);
      if (done ? done() : t >= 1) { onFrame = null; resolve(); }
    };
  });

  // ---------------------------------------------------------------- where things are
  const pose = (): CameraPose => ({
    position: stage.camera.position.toArray() as [number, number, number],
    target: stage.controls.target.toArray() as [number, number, number],
    fov: stage.camera.fov, zoom: stage.camera.zoom,
  });
  /** where the overhead block can lie in the model's canvas: on the tile if the tile is inside it, else as near as fits */
  const blockRect = (tile: DOMRect) => {
    const s = stageEl.getBoundingClientRect(), b = opts.margin();
    const k = Math.min(1, (s.width - 2 * b) / tile.width, (s.height - 2 * b) / tile.height);
    const w = tile.width * k, h = tile.height * k;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const cx = clamp(tile.x + tile.width / 2, s.left + b + w / 2, s.right - b - w / 2);
    const cy = clamp(tile.y + tile.height / 2, s.top + b + h / 2, s.bottom - b - h / 2);
    return new DOMRect(cx - w / 2, cy - h / 2, w, h);
  };
  /** Straight down onto the block, which fills `r` (page px): north up, as the map draws it. */
  const overhead = (r: DOMRect): CameraPose => {
    const s = stageEl.getBoundingClientRect(), { x0, x1, z0, z1 } = map.bounds;
    const ppm = r.height / (z1 - z0);
    // the ground the canvas takes in is 2·h·tan(fov/2) / zoom high: the zoom that gives `ppm` pixels a metre
    const zoom = (2 * TOP_HEIGHT * Math.tan((TOP_FOV * Math.PI) / 360) * ppm) / s.height;
    // the camera sits over the canvas's middle; the block's middle is off it by the rect's offset
    const tx = (x0 + x1) / 2 - (r.left + r.width / 2 - (s.left + s.width / 2)) / ppm;
    const tz = (z0 + z1) / 2 - (r.top + r.height / 2 - (s.top + s.height / 2)) / ppm;
    // a hair to the south: the orbit keeps north at the top of the screen
    return { position: [tx, TOP_HEIGHT, tz + 0.01], target: [tx, 0, tz], fov: TOP_FOV, zoom };
  };

  // ---------------------------------------------------------------- the pixelated picture
  /** Read the part of the frame under `src` (page px) into the overlay at n × m pixels, the overlay laid over `at`. */
  const capture = (src: DOMRect, at: DOMRect, n: number, m: number, cut: boolean) => {
    const s = gl.getBoundingClientRect(), kx = gl.width / s.width, ky = gl.height / s.height;
    let from: CanvasImageSource = gl, sx = (src.left - s.left) * kx, sy = (src.top - s.top) * ky, sw = src.width * kx, sh = src.height * ky;
    for (let i = 0; sw > n * 2.5; i++) {
      const c = half[i % 2], w = Math.ceil(sw / 2), h = Math.ceil(sh / 2);
      if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      g.drawImage(from, sx, sy, sw, sh, 0, 0, w, h);
      from = c; sx = 0; sy = 0; sw = w; sh = h;
    }
    if (overlay.width !== n || overlay.height !== m) { overlay.width = n; overlay.height = m; } else og.clearRect(0, 0, n, m);
    og.imageSmoothingEnabled = true;
    og.imageSmoothingQuality = 'high';
    og.drawImage(from, sx, sy, sw, sh, 0, 0, n, m);
    if (cut) CORNER.forEach((k, y) => { og.clearRect(0, y, k, 1); og.clearRect(n - k, y, k, 1); });
    Object.assign(overlay.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px` });
  };
  /** clear the overlay's pixels whose dither value is under p (0: none, 1: all) */
  const dissolve = (p: number) => {
    for (let y = 0; y < overlay.height; y++) {
      for (let x = 0; x < overlay.width; x++) if (BAYER[(y & 3) * 4 + (x & 3)] < p) og.clearRect(x, y, 1, 1);
    }
  };
  /** the overlay's resolution at jump k of STEPS: from the canvas's own pixels down to the tile's */
  const res = (full: DOMRect, n: number, m: number, k: number): [number, number] => {
    if (k >= STEPS) return [n, m];
    const n0 = full.width * (gl.width / gl.getBoundingClientRect().width);
    const w = Math.max(n, Math.round(n0 * (n / n0) ** (k / STEPS)));
    return [w, Math.max(m, Math.round((w * full.height) / full.width))];
  };
  const jump = (t: number) => Math.min(STEPS, Math.floor(t * STEPS + 1e-6));

  // ---------------------------------------------------------------- the two directions
  /** the visible form: which canvas is drawn, and what the stylesheet shows */
  const settle = (f: Form) => {
    shown = f;
    app.form = f;
    body.dataset.form = f;
    stage.controls.enabled = f === 'model';
  };
  /** inline opacities while a change runs (the stylesheet takes over again at the end) */
  const fade = (stageA: number | null, tileA: number | null) => {
    stageEl.style.opacity = stageA === null ? '' : String(stageA);
    tileEl.style.opacity = tileA === null ? '' : String(tileA);
  };

  async function toPlan() {
    saved = pose();
    stage.controls.enabled = false;
    stage.controls.autoRotate = false;
    body.dataset.morph = 'plan';
    const grid = map.grid();
    if (!grid) { settle('plan'); delete body.dataset.morph; return; }
    fade(1, 0);
    const tile = grid.rect, block = blockRect(tile);
    stage.flyTo(overhead(block), FLY);
    await phase(FLY * 2, () => {}, () => !stage.flying);
    overlay.hidden = false;
    await phase(PIXELATE, (t) => {
      const [n, m] = res(block, grid.n, grid.m, jump(t));
      capture(block, lerpRect(block, tile, ease(t)), n, m, jump(t) >= STEPS);
      fade(1 - ease(t), 0);
    });
    await phase(DISSOLVE, (t) => {
      capture(block, tile, grid.n, grid.m, true);
      dissolve(t);
      fade(0, Math.min(1, t / 0.3));
    });
    overlay.hidden = true;
    settle('plan');
    fade(null, null);
    delete body.dataset.morph;
  }

  async function toModel(back: () => CameraPose) {
    body.dataset.morph = 'model';
    const grid = map.grid();
    fade(0, 1);
    settle('model');
    stage.controls.enabled = false;
    if (!grid) { fade(null, null); delete body.dataset.morph; stage.controls.enabled = true; stage.flyTo(back(), FLY_BACK); return; }
    const tile = grid.rect;
    // one frame overhead before the picture is read: the canvas may have just taken a new size
    let block = blockRect(tile);
    stage.flyTo(overhead(block), 0);
    await phase(0, () => {});
    block = blockRect(tile);
    stage.flyTo(overhead(block), 0);
    await phase(0, () => {});
    overlay.hidden = false;
    await phase(DISSOLVE, (t) => {
      capture(block, tile, grid.n, grid.m, true);
      dissolve(1 - t);
    });
    await phase(PIXELATE, (t) => {
      const k = STEPS - jump(t), [n, m] = res(block, grid.n, grid.m, k);
      capture(block, lerpRect(tile, block, ease(t)), n, m, k >= STEPS);
      fade(ease(t), Math.max(0, 1 - t * 2));
    });
    overlay.hidden = true;
    fade(null, null);
    delete body.dataset.morph;
    stage.controls.enabled = true;
    stage.flyTo(back(), FLY_BACK);
  }

  return {
    get busy() { return busy; },
    get saved() { return saved; },
    go(to, back, instant = false) {
      target = to;
      chain = chain.then(async () => {
        while (shown !== target) {
          const f = target;
          if (instant || app.reducedMotion) {
            if (f === 'plan') { saved = pose(); settle('plan'); } else { settle('model'); stage.flyTo(back(), 0); }
            continue;
          }
          busy = true;
          app.fullRate = true;
          try { await (f === 'plan' ? toPlan() : toModel(back)); } catch (e) {
            // never leave the page half-way: land on the form asked for
            console.error('[konbini] form change failed', e);
            onFrame = null;
            overlay.hidden = true;
            fade(null, null);
            delete body.dataset.morph;
            settle(f);
          } finally { busy = false; app.fullRate = false; }
        }
      });
      return chain;
    },
  };
}
