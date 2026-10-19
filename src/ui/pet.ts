// Desktop-pet mode (?pet=1, set by the Electron shell in desktop/): only the model — or the map — over a transparent
// window. Nothing else shows: a double-click on the model (or the map) opens the web page's own settings panel, and
// its close button (or Escape) puts it away. ⌥-drag on the model or the map moves the window.
// The native menu (right-click, or the menu-bar icon) keeps what belongs to the window: form, the sky behind the model,
// on top or in the background, icons, power saving. Everywhere the model, the map and the controls aren't, clicks fall
// through to the desktop; in the background they all do (the shell stops even telling the page where the pointer is).
//
// The size is the settings' slider (size.ts), and the page sizes the window to it: a large model fills its window; a
// small one, and the map, stand at the foot of a window tall enough for the settings above them. While the settings
// are open (or the model is turning into the map) the window only grows, so the panel never moves under the pointer.
import type { App } from '../engine/app';
import type { Form, HudActions } from './hud';
import type { MapView } from './map';
import { petBox, type Sizes } from './size';
import { PET_FADE } from './views';

/** What the shell's menu shows, and what it keeps in pet.json: the page's own settings. */
export interface PetState {
  saver: boolean;
  /** the sky behind the model (off: only the model, over the desk) */
  sky: boolean;
  form: Form;
  /** the size slider's step (size.ts) */
  size: number;
  /** the settings are open: a model in the background comes up to the top until they close */
  settings: boolean;
}

export type PetAction =
  | { type: 'settings' | 'saver' | 'sky' }
  | { type: 'form'; value: Form };

/** Exposed by desktop/preload.cjs. */
interface DesktopBridge {
  setHit(over: boolean): void;
  drag(on: boolean): void;
  showMenu(): void;
  setState(state: PetState): void;
  /** the window's size, with its foot (bottom centre, screen px) here; the shell keeps it on the screen */
  setWindow(width: number, height: number, footX: number, footY: number): void;
  onAction(fn: (a: PetAction) => void): void;
  /** the cursor over the window, or null once it has left (older shells don't have it) */
  onPointer?(fn: (p: { x: number; y: number } | null) => void): void;
}

/** the window of the map and of a small model: room for the settings above them */
const SMALL_WINDOW: [number, number] = [380, 540];
/** from this width the model fills its window (the settings hang over it from the top) */
const FILL_W = 380;

/** The window this size wants (the model's box, or the small window). */
const windowFor = (form: Form, sizes: Sizes): [number, number] => {
  const [w, h] = petBox(sizes.model);
  return form === 'model' && w >= FILL_W ? [w, h] : [Math.max(SMALL_WINDOW[0], form === 'model' ? w : 0), SMALL_WINDOW[1]];
};

/** a point on the screen (px): where the model or the map stands, the middle of its bottom edge */
type Foot = [number, number];

/** the screen's work area (without the menu bar and the Dock) */
const workArea = () => {
  const s = screen as Screen & { availLeft?: number; availTop?: number };
  return { x: s.availLeft ?? 0, y: s.availTop ?? 0, w: s.availWidth, h: s.availHeight };
};

/** Where a window this size with its foot at `foot` ends up: moved onto the screen, as the shell does (main.js: onScreen). */
const footOnScreen = (foot: Foot, w: number, h: number): Foot => {
  const a = workArea();
  const x = Math.max(a.x, Math.min(a.x + a.w - w, Math.round(foot[0] - w / 2)));
  const y = Math.max(a.y, Math.min(a.y + a.h - h, Math.round(foot[1] - h)));
  return [x + w / 2, y + h];
};

/**
 * The largest window that keeps this foot where it is and stays on the screen: a window that has to grow while held
 * goes straight there (below), without moving anything.
 */
const roomAt = ([x, y]: Foot): [number, number] => {
  const a = workArea();
  return [Math.floor(2 * Math.min(x - a.x, a.x + a.w - x)), Math.floor(y - a.y)];
};

/** Size the model's canvas (at the foot of the window) before the renderer first measures it. */
export function preparePet(sizes: Sizes) {
  document.body.classList.add('pet');
  setBox(sizes.model);
}
/** the model's canvas at this (possibly in-between) size */
const setBox = (model: number) => {
  const [w, h] = petBox(model), s = document.body.style;
  if (s.getPropertyValue('--pet-box-w') === `${w}px` && s.getPropertyValue('--pet-box-h') === `${h}px`) return;
  s.setProperty('--pet-box-w', `${w}px`);
  s.setProperty('--pet-box-h', `${h}px`);
};

// In a window this small the GPU has little to do; what's left is three.js's per-mesh cost, so the frame rate is the lever.
const IDLE_FPS = 20;     // the street keeps living, gently
const SAVER_FPS = 10;    // 省电: still moving, about a quarter less energy
const ACTIVE_FPS = 60;   // while the pointer is on the model or the controls
const LINGER = 1200;     // ms at full frame rate after the pointer leaves
/** below this opacity a faded bit of the model (at the soft edge, style.css) no longer catches the pointer */
const FADE_HIT = 0.3;

/** How opaque the edge mask leaves this point of the model's canvas `r`: 0 at its edge, eased up to 1 a band's width in. */
function edgeAlpha(r: DOMRect, x: number, y: number) {
  const band = Math.min(r.width, r.height) * PET_FADE;
  const axis = (d: number) => (d >= band ? 1 : d <= 0 ? 0 : d < band / 2 ? (0.25 * d) / (band / 2) : 0.25 + (0.75 * (d - band / 2)) / (band / 2));
  return axis(Math.min(x - r.left, r.right - x)) * axis(Math.min(y - r.top, r.bottom - y));
}

export function initPet(app: App, hud: HudActions, map: MapView) {
  const bridge = (window as unknown as { konbiniDesktop?: DesktopBridge }).konbiniDesktop;
  const stageEl = app.stage.renderer.domElement;
  app.stage.controls.enablePan = false;  // the right button opens the menu instead
  app.fx.post.gtao.enabled = false;      // ambient occlusion barely shows at this size
  app.fx.post.tiltShift = false;         // a model this small already reads as a miniature; blurred, it just looks soft
  const SAVER_KEY = 'konbini.pet.saver', SKY_KEY = 'konbini.pet.sky';
  let saver = false, sky = false;
  try { saver = localStorage.getItem(SAVER_KEY) === '1'; sky = localStorage.getItem(SKY_KEY) === '1'; } catch { /* storage unavailable */ }
  // some views look odd with the desk showing through where the sky would be (a busy wallpaper behind the street)
  app.fx.sky = sky;
  const idleFps = () => (saver ? SAVER_FPS : IDLE_FPS);
  app.maxFps = idleFps();


  // --- hover: wake up (full frame rate) while the pointer is on the model or the controls ---
  let over = false, active = false, sleep = 0, dragging = false;
  const setActive = (on: boolean) => {
    clearTimeout(sleep);
    if (on) {
      if (!active) { active = true; app.maxFps = ACTIVE_FPS; }
    } else if (active) {
      sleep = window.setTimeout(() => { active = false; app.maxFps = idleFps(); }, LINGER);
    }
  };
  const setOver = (on: boolean) => {
    if (on === over) return;
    over = on;
    bridge?.setHit(on);
    setActive(on);
  };

  // --- the cursor says when a drag would move the window: a grab hand over the model or the map while ⌥ is held, a
  // closed hand while it moves
  let onShape = false, alt = false;
  const showGrab = () => document.body.classList.toggle('pet-grab', alt && onShape);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Alt') { alt = e.type === 'keydown'; showGrab(); } };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', () => { alt = false; pressed = false; showGrab(); });

  // Where the pointer is comes two ways: the page's own moves (forwarded by the shell even while clicks fall through,
  // but only while the pet is the active app or floats above the others), and the shell's own watch on the cursor,
  // which always works (main.js). Both feed one throttled check (it raycasts).
  type Spot = { x: number; y: number; target: Element | null; buttons: number; altKey: boolean };
  let last: Spot | null = null, pending = false, pressed = false;
  const check = () => {
    pending = false;
    if (!last) return;
    if (dragging || last.buttons) { setOver(true); return; }   // hold on to a drag that wanders off the model
    // hidden controls are invisible to the pointer, so any control under it is one that's showing
    const onChrome = !!last.target?.closest?.('.chrome');
    // with the sky drawn the whole window is the picture, not just the model
    const { x, y } = last;
    const onModel = !onChrome && (document.body.dataset.form === 'plan' ? map.hit(x, y)
      : edgeAlpha(stageEl.getBoundingClientRect(), x, y) > FADE_HIT && (sky || app.interact.modelAt(x, y)));
    setOver(onChrome || onModel);
    onShape = onModel;
    alt = last.altKey;
    showGrab();
  };
  const look = (spot: Spot) => {
    last = spot;
    if (!pending) { pending = true; setTimeout(check, 50); }
  };
  addEventListener('pointermove', (e) => look({ x: e.clientX, y: e.clientY, target: e.target as Element | null, buttons: e.buttons, altKey: e.altKey }));
  // (a press under way is the page's own: the shell's watch knows nothing of buttons, and must not end an orbit)
  addEventListener('pointerdown', () => { pressed = true; }, { capture: true });
  addEventListener('pointerup', () => { pressed = false; }, { capture: true });
  addEventListener('pointercancel', () => { pressed = false; }, { capture: true });
  bridge?.onPointer?.((p) => {
    if (pressed || dragging) return;
    if (!p) { last = null; setOver(false); onShape = false; showGrab(); return; }
    look({ x: p.x, y: p.y, target: document.elementFromPoint(p.x, p.y), buttons: 0, altKey: alt });
  });
  document.documentElement.addEventListener('pointerleave', () => { last = null; if (!dragging && !pressed) setOver(false); });

  // --- moving the window: the shell follows the cursor between drag(true) and drag(false) ---
  const startDrag = (e: PointerEvent, el: Element) => {
    el.setPointerCapture(e.pointerId);
    dragging = true;
    document.body.classList.add('pet-grabbing');
    clearTimeout(moved.done);
    moved = { x: screenX, y: screenY, home, done: 0 };
    bridge?.drag(true);
    const end = () => {
      dragging = false;
      document.body.classList.remove('pet-grabbing');
      // (the window's last steps may reach the page a little after the button's release)
      moved.done = window.setTimeout(() => { moved.home = null; }, 500);
      bridge?.drag(false);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  // the same gesture on the model and the map: a plain drag is left to the page (it turns the model)
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.altKey || !(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault();
    e.stopPropagation();   // keep the orbit controls out of it
    startDrag(e, e.target);
  }, { capture: true });

  // --- the settings: a double-click on the model or the map (there is no button on the desk) ---
  addEventListener('dblclick', (e) => { if (e.target instanceof HTMLCanvasElement) hud.openTray(); });

  // --- the native menu ---
  // (the menu takes the button's release: no press is left under way, or a model sent to the background from here
  // would never hear that the pointer left, and stay awake)
  addEventListener('contextmenu', (e) => { e.preventDefault(); pressed = false; bridge?.showMenu(); });
  bridge?.onAction((a) => {
    switch (a.type) {
      case 'settings': hud.openTray(); break;
      case 'form': hud.setForm(a.value); break;
      case 'saver':
        saver = !saver;
        try { localStorage.setItem(SAVER_KEY, saver ? '1' : '0'); } catch { /* storage unavailable */ }
        if (!active) app.maxFps = idleFps();
        break;
      case 'sky':
        sky = app.fx.sky = !sky;
        try { localStorage.setItem(SKY_KEY, sky ? '1' : '0'); } catch { /* storage unavailable */ }
        break;
    }
  });

  // --- the window follows the size: it only grows while the settings are open or the form is changing ---
  // The model and the map stand on a foot kept in screen coordinates, not on the window's: at rest the window is
  // theirs and they stand at its foot, but a window held open for the settings may grow round them as far as the
  // whole screen, and they must not go with its foot (to the screen's bottom middle). `home` is where they belong;
  // they stand there unless the screen's edge pushes them off it, and go back once they are small enough again.
  // Moving the window by hand moves home with it.
  let home: Foot = [screenX + innerWidth / 2, screenY + innerHeight];
  let stand: Foot = home;
  let moved: { x: number; y: number; home: Foot | null; done: number } = { x: 0, y: 0, home: null, done: 0 };
  let win: [number, number] = [0, 0], wasHeld = false, offset = '';
  /**
   * The window's place on the screen. A window that has just changed size and place tells the page its new size a
   * frame before its new place (screenX lags behind): until it catches up, the place the shell was asked for stands in,
   * or that first frame would show everything placed from the old one.
   */
  let asked: { x: number; y: number; w: number; h: number; until: number } | null = null;
  const origin = (): Foot => {
    if (asked && (performance.now() > asked.until || (screenX === asked.x && screenY === asked.y))) asked = null;
    return asked && innerWidth === asked.w && innerHeight === asked.h ? [asked.x, asked.y] : [screenX, screenY];
  };
  /** the model's canvas and the map, moved off the window's foot onto their own (style.css: --pet-dx, --pet-dy) */
  const placeStand = () => {
    // a window at rest is theirs: its foot is theirs too (whatever the shell made of it); without a shell (a browser
    // tab with ?pet=1) the window is whatever it is, and nothing holds it open
    const rest = !bridge || (!wasHeld && innerWidth === win[0] && innerHeight === win[1]);
    const [x, y] = origin();
    const dx = rest ? 0 : stand[0] - (x + innerWidth / 2);
    const dy = rest ? 0 : y + innerHeight - stand[1];
    const key = `${dx.toFixed(1)} ${dy.toFixed(1)}`;
    if (key === offset) return;
    offset = key;
    document.body.style.setProperty('--pet-dx', `${dx}px`);
    document.body.style.setProperty('--pet-dy', `${dy}px`);
  };
  const fitWindow = () => {
    if (moved.home) home = [moved.home[0] + screenX - moved.x, moved.home[1] + screenY - moved.y];
    setBox(hud.shownModel);
    // (big enough for the model as shown, too, while it glides to its size)
    const rest = windowFor(hud.form, { ...hud.sizes, model: Math.max(hud.sizes.model, hud.shownModel) });
    stand = footOnScreen(home, ...rest);
    const held = hud.trayOpen || hud.morphing;
    const [x, y] = origin(), foot: Foot = [x + innerWidth / 2, y + innerHeight];
    let want = rest;
    if (held) {
      // a window that grows a little at a time jumps at every step (the page catches up with it a frame late): once
      // it has to grow at all, it grows as far as it can with its foot in place, in one go — the extra room is
      // see-through. A size larger still has to move it (towards the whole screen): then once, straight to all of it.
      if (want[0] > win[0] || want[1] > win[1]) {
        const room = roomAt(foot);
        const all: [number, number] = [screen.availWidth, screen.availHeight];
        const to = want[0] > room[0] || want[1] > room[1] ? all : room;
        want = [Math.max(want[0], win[0], to[0]), Math.max(want[1], win[1], to[1])];
      } else want = [win[0], win[1]];
    }
    const release = wasHeld && !held;
    wasHeld = held;
    placeStand();
    if (dragging || (want[0] === win[0] && want[1] === win[1] && !release)) return;
    win = want;
    // at rest the shell puts it at home (or as near as the screen allows: where `stand` already is)
    const to = footOnScreen(held ? foot : home, ...want);
    asked = { x: to[0] - want[0] / 2, y: to[1] - want[1], w: want[0], h: want[1], until: performance.now() + 500 };
    bridge?.setWindow(...want, ...(held ? foot : home));
  };
  fitWindow();   // now, before the scene loads: the window opens at its size
  app.onFrameUI(fitWindow);

  // the settings button isn't shown on the desk, but the panel still opens from where it stands (see hud.ts: place).
  // Over a model that fills the window: above its top edge, so the panel hangs from the top; over a small model or the
  // map: on its top edge, so the panel opens above it. Once open, the panel keeps its place on the screen while the
  // size changes under it, and the window grows (or, towards the whole screen, moves): the spot is kept in screen
  // coordinates — a slider sliding away under the pointer would change the size by itself.
  const bar = document.querySelector<HTMLElement>('.bar')!;
  let spot: [number, number] = [0, 0], barAt = '';
  const placeBar = () => {
    // (kept up to date while the panel is closed, so it opens straight at the right place)
    const [x, y] = origin();
    if (!hud.trayOpen) {
      const plan = document.body.dataset.form === 'plan';
      const r = (plan ? map.canvas : stageEl).getBoundingClientRect();
      spot = [x + r.left + r.width / 2, y + (!plan && r.height >= innerHeight - 1 ? -50 : r.top)];
    }
    const at = `${Math.round(spot[0] - x)}px ${Math.round(spot[1] - y)}px`;
    if (at === barAt) return;
    barAt = at;
    [bar.style.left, bar.style.top] = at.split(' ');
    hud.layout();
  };
  app.onFrameUI(placeBar);
  // (a window that has just changed size is laid out before the next frame's callbacks: place them right away)
  addEventListener('resize', () => { placeStand(); placeBar(); });

  // keep the shell's copy of the state current, so the menu opens instantly with the right checks
  let sent = '';
  app.onFrameUI(() => {
    const state: PetState = { saver, sky, form: hud.form, size: hud.sizes.value, settings: hud.trayOpen };
    const key = JSON.stringify(state);
    if (key !== sent) { sent = key; bridge?.setState(state); }
  });

  return { setActive };
}
