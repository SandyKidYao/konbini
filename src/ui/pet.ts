// Desktop-pet mode (?pet=1, set by the Electron shell in desktop/): only the model — or the map — over a transparent
// window. Nothing else shows: a double-click on the model (or the map) opens the web page's own settings panel, and
// its close button (or Escape) puts it away. ⌥-drag on the model moves the window; the map moves with a plain drag.
// The native menu (right-click, or the menu-bar icon) keeps what belongs to the window: form, size, floating,
// icons, power saving. Everywhere the model, the map and the controls aren't, clicks fall through to the desktop.
import { Vector3 } from 'three';
import type { App } from '../engine/app';
import type { Form, HudActions } from './hud';
import type { MapView } from './map';
import { wholeDistance } from './views';

export type PetSize = 'small' | 'medium' | 'large';
/** the map's width (px) at each of the shell's sizes */
const MAP_SIZE: Record<PetSize, number> = { small: 120, medium: 160, large: 220 };

/** What the shell's menu shows: the page's own settings. */
export interface PetState {
  saver: boolean;
  form: Form;
}

export type PetAction =
  | { type: 'settings' | 'saver' }
  | { type: 'form'; value: Form }
  | { type: 'size'; value: PetSize };

/** Exposed by desktop/preload.cjs. */
interface DesktopBridge {
  setHit(over: boolean): void;
  drag(on: boolean): void;
  showMenu(): void;
  setState(state: PetState): void;
  onAction(fn: (a: PetAction) => void): void;
}

// In a window this small the GPU has little to do; what's left is three.js's per-mesh cost, so the frame rate is the lever.
const IDLE_FPS = 20;     // the street keeps living, gently
const SAVER_FPS = 10;    // 省电: still moving, about a quarter less energy
const ACTIVE_FPS = 60;   // while the pointer is on the model or the controls
const LINGER = 1200;     // ms at full frame rate after the pointer leaves
const DRAG_SLOP = 4;     // px the map must be dragged before the press moves the window

export function initPet(app: App, hud: HudActions, map: MapView) {
  const bridge = (window as unknown as { konbiniDesktop?: DesktopBridge }).konbiniDesktop;
  document.body.classList.add('pet');
  const controls = app.stage.controls, camera = app.stage.camera;
  controls.enablePan = false;            // the right button opens the menu instead (and the model stays centred)
  controls.maxPolarAngle = 1.25;         // a thing on the desk, seen from above: not from down at street level
  app.fx.post.gtao.enabled = false;      // ambient occlusion barely shows at this size
  const SAVER_KEY = 'konbini.pet.saver';
  let saver = false;
  try { saver = localStorage.getItem(SAVER_KEY) === '1'; } catch { /* storage unavailable */ }
  const idleFps = () => (saver ? SAVER_FPS : IDLE_FPS);
  app.maxFps = idleFps();

  const setMapSize = (size: string | null) => {
    const w = MAP_SIZE[size as PetSize] ?? MAP_SIZE.medium;
    document.body.style.setProperty('--pet-map', `${w}px`);
  };
  setMapSize(new URLSearchParams(location.search).get('size'));

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
      const onModel = !onChrome && (hud.form === 'plan' ? map.hit(last.clientX, last.clientY) : app.interact.modelAt(last.clientX, last.clientY));
      setOver(onChrome || onModel);
    }, 50);
  });
  document.documentElement.addEventListener('pointerleave', () => { last = null; if (!dragging) setOver(false); });

  // --- moving the window: the shell follows the cursor between drag(true) and drag(false) ---
  const startDrag = (e: PointerEvent, el: Element) => {
    el.setPointerCapture(e.pointerId);
    dragging = true;
    bridge?.drag(true);
    const end = () => {
      dragging = false;
      bridge?.drag(false);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  // the map has nothing to turn, so a drag on it moves the window
  let press: { x: number; y: number; id: number } | null = null;
  map.canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) press = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  map.canvas.addEventListener('pointermove', (e) => {
    if (!press || dragging || e.pointerId !== press.id || Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP) return;
    startDrag(e, map.canvas);
  });
  addEventListener('pointerup', () => { press = null; });
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
      case 'size': setMapSize(a.value); break;
      case 'saver':
        saver = !saver;
        try { localStorage.setItem(SAVER_KEY, saver ? '1' : '0'); } catch { /* storage unavailable */ }
        if (!active) app.maxFps = idleFps();
        break;
    }
  });

  // the window is the model's frame: however it is turned, the camera can't come closer than the whole model fits
  const dir = new Vector3();
  let fitKey = '';
  app.onFrameUI(() => {
    if (hud.form !== 'model') return;
    dir.copy(camera.position).sub(controls.target).normalize();
    const aspect = innerWidth / innerHeight;
    const key = `${dir.x.toFixed(2)} ${dir.y.toFixed(2)} ${dir.z.toFixed(2)} ${aspect.toFixed(3)} ${camera.fov.toFixed(1)}`;
    if (key === fitKey) return;
    fitKey = key;
    controls.minDistance = wholeDistance(dir, aspect, camera.fov);
  });

  // the settings button isn't shown on the desk, but the panel still opens from where it stands (see hud.ts: place):
  // above the window's top edge, so the panel hangs from the top; in the map form on the tile's top edge, so the
  // panel opens above the tile (the window is taller than the tile to leave it room)
  const bar = document.querySelector<HTMLElement>('.bar')!;
  let barAt = '';
  app.onFrameUI(() => {
    let at = '';
    if (hud.form === 'plan') {
      const r = map.canvas.getBoundingClientRect();
      if (r.width) at = `${Math.round(r.top)} ${Math.round(r.left + r.width / 2)}`;
    }
    if (at === barAt) return;
    barAt = at;
    const [top, left] = at.split(' ');
    bar.style.top = at ? `${top}px` : '';
    bar.style.left = at ? `${left}px` : '';
    bar.style.right = at ? 'auto' : '';
    hud.layout();
  });

  // keep the shell's copy of the state current, so the menu opens instantly with the right checks
  let sent = '';
  app.onFrameUI(() => {
    const state: PetState = { saver, form: hud.form };
    const key = JSON.stringify(state);
    if (key !== sent) { sent = key; bridge?.setState(state); }
  });

  return { setActive };
}
