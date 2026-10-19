// Desktop-pet mode (?pet=1, set by the Electron shell in desktop/): only the model — or the map — over a transparent
// window. Nothing else shows: a double-click on the model (or the map) opens the web page's own settings panel, and
// its close button (or Escape) puts it away. ⌥-drag on the model or the map moves the window.
// The native menu (right-click, or the menu-bar icon) keeps what belongs to the window: form, the sky behind the model,
// floating, icons, power saving. Everywhere the model, the map and the controls aren't, clicks fall through to the desktop.
//
// The size is the settings' slider (size.ts), and the page sizes the window to it: a large model fills its window; a
// small one, and the map, stand at the foot of a window tall enough for the settings above them. While the settings
// are open (or the model is turning into the map) the window only grows, so the panel never moves under the pointer.
import type { App } from '../engine/app';
import type { Form, HudActions } from './hud';
import type { MapView } from './map';
import { SIZE_MAX, petBox, type Sizes } from './size';
import { PET_FADE } from './views';

/** What the shell's menu shows, and what it keeps in pet.json: the page's own settings. */
export interface PetState {
  saver: boolean;
  /** the sky behind the model (off: only the model, over the desk) */
  sky: boolean;
  form: Form;
  /** the size slider's step (size.ts) */
  size: number;
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
  /** the window's size; the shell keeps its foot where it stands, and keeps it on the screen */
  setWindow(width: number, height: number): void;
  onAction(fn: (a: PetAction) => void): void;
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

/** the largest window any size asks for: a window that has to grow while held goes straight there (below) */
const LARGEST: [number, number] = [Math.max(petBox(SIZE_MAX)[0], SMALL_WINDOW[0]), Math.max(petBox(SIZE_MAX)[1], SMALL_WINDOW[1])];

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
  addEventListener('blur', () => { alt = false; showGrab(); });

  // forwarded moves arrive even while the window lets clicks through; throttle the raycast
  let last: PointerEvent | null = null, pending = false;
  addEventListener('pointermove', (e) => {
    last = e;
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (!last) return;
      if (dragging || last.buttons) { setOver(true); return; }   // hold on to a drag that wanders off the model
      // hidden controls are invisible to the pointer, so any control under it is one that's showing
      const onChrome = !!(last.target as Element | null)?.closest?.('.chrome');
      // with the sky drawn the whole window is the picture, not just the model
      const x = last.clientX, y = last.clientY;
      const onModel = !onChrome && (document.body.dataset.form === 'plan' ? map.hit(x, y)
        : edgeAlpha(stageEl.getBoundingClientRect(), x, y) > FADE_HIT && (sky || app.interact.modelAt(x, y)));
      setOver(onChrome || onModel);
      onShape = onModel;
      alt = last.altKey;
      showGrab();
    }, 50);
  });
  document.documentElement.addEventListener('pointerleave', () => { last = null; if (!dragging) setOver(false); });

  // --- moving the window: the shell follows the cursor between drag(true) and drag(false) ---
  const startDrag = (e: PointerEvent, el: Element) => {
    el.setPointerCapture(e.pointerId);
    dragging = true;
    document.body.classList.add('pet-grabbing');
    bridge?.drag(true);
    const end = () => {
      dragging = false;
      document.body.classList.remove('pet-grabbing');
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
  addEventListener('contextmenu', (e) => { e.preventDefault(); bridge?.showMenu(); });
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
  let win: [number, number] = [0, 0];
  const fitWindow = () => {
    setBox(hud.shownModel);
    // (big enough for the model as shown, too, while it glides to its size)
    let want = windowFor(hud.form, { ...hud.sizes, model: Math.max(hud.sizes.model, hud.shownModel) });
    if (hud.trayOpen || hud.morphing) {
      // a window that grows a little at a time jumps at every step (the page catches up with it a frame late): once
      // it has to grow at all, it grows to the largest it could need, in one go — the extra room is see-through
      if (want[0] > win[0] || want[1] > win[1]) want = [Math.max(win[0], LARGEST[0]), Math.max(win[1], LARGEST[1])];
      else want = [win[0], win[1]];
    }
    if (want[0] === win[0] && want[1] === win[1]) return;
    win = want;
    bridge?.setWindow(...want);
  };
  fitWindow();   // now, before the scene loads: the window opens at its size
  app.onFrameUI(fitWindow);

  // the settings button isn't shown on the desk, but the panel still opens from where it stands (see hud.ts: place).
  // Over a model that fills the window: above its top edge, so the panel hangs from the top; over a small model or the
  // map: on its top edge, so the panel opens above it. Once open, the panel keeps its place on the screen while the
  // size changes under it: the window grows from its foot, so the spot is kept as a distance from the bottom.
  const bar = document.querySelector<HTMLElement>('.bar')!;
  let fromBottom = 0, barAt = '';
  app.onFrameUI(() => {
    // (kept up to date while the panel is closed, so it opens straight at the right place)
    if (!hud.trayOpen) {
      const plan = document.body.dataset.form === 'plan';
      const r = (plan ? map.canvas : stageEl).getBoundingClientRect();
      fromBottom = !plan && r.height >= innerHeight - 1 ? innerHeight + 50 : innerHeight - r.top;
    }
    const at = `${Math.round(innerHeight - fromBottom)}px`;
    if (at === barAt) return;
    barAt = at;
    bar.style.top = at;
    hud.layout();
  });

  // keep the shell's copy of the state current, so the menu opens instantly with the right checks
  let sent = '';
  app.onFrameUI(() => {
    const state: PetState = { saver, sky, form: hud.form, size: hud.sizes.value };
    const key = JSON.stringify(state);
    if (key !== sent) { sent = key; bridge?.setState(state); }
  });

  return { setActive };
}
