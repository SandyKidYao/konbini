// Desktop-pet mode (?pet=1, set by the Electron shell in desktop/): only the model, over a transparent window.
// The settings are the web page's own: the settings button comes out under the model while the pointer is on it
// (drag the button to move the window, or ⌥-drag anywhere on the model). The native menu (right-click, or the
// menu-bar icon) keeps what belongs to the window: size, floating, icons, power saving. Everywhere the model and
// the controls aren't, clicks fall through to the desktop.
import type { App } from '../engine/app';
import type { HudActions } from './hud';

/** What the shell's menu shows: the page's own settings. */
export interface PetState {
  saver: boolean;
}

export type PetAction = { type: 'settings' | 'saver' };

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
const DRAG_SLOP = 4;     // px the settings button must travel before a press becomes a drag

export function initPet(app: App, hud: HudActions) {
  const bridge = (window as unknown as { konbiniDesktop?: DesktopBridge }).konbiniDesktop;
  document.body.classList.add('pet');
  app.stage.controls.enablePan = false;  // the right button opens the menu instead
  app.fx.post.gtao.enabled = false;      // ambient occlusion barely shows at this size
  const SAVER_KEY = 'konbini.pet.saver';
  let saver = false;
  try { saver = localStorage.getItem(SAVER_KEY) === '1'; } catch { /* storage unavailable */ }
  const idleFps = () => (saver ? SAVER_FPS : IDLE_FPS);
  app.maxFps = idleFps();

  const button = document.getElementById('trayBtn')!;
  button.setAttribute('aria-label', '设置（拖动可移动）');

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
      const onModel = !onChrome && app.interact.modelAt(last.clientX, last.clientY);
      if (onModel) hud.showChrome();
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
  // the settings button: a click opens the settings, a drag moves the window (and isn't a click)
  let press: { x: number; y: number; id: number } | null = null, dragged = false;
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged = false;
  });
  button.addEventListener('pointermove', (e) => {
    if (!press || dragging || e.pointerId !== press.id || Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP) return;
    dragged = true;
    startDrag(e, button);
  });
  addEventListener('pointerup', () => { press = null; });
  addEventListener('click', (e) => {
    if (dragged && e.target instanceof Node && button.contains(e.target)) { e.stopImmediatePropagation(); dragged = false; }
  }, { capture: true });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.altKey || !(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault();
    e.stopPropagation();   // keep the orbit controls out of it
    startDrag(e, e.target);
  }, { capture: true });

  // --- the native menu ---
  addEventListener('contextmenu', (e) => { e.preventDefault(); bridge?.showMenu(); });
  bridge?.onAction((a) => {
    switch (a.type) {
      case 'settings': hud.openTray(); break;
      case 'saver':
        saver = !saver;
        try { localStorage.setItem(SAVER_KEY, saver ? '1' : '0'); } catch { /* storage unavailable */ }
        if (!active) app.maxFps = idleFps();
        break;
    }
  });

  // keep the shell's copy of the state current, so the menu opens instantly with the right checks
  let sent = '';
  app.onFrameUI(() => {
    const state: PetState = { saver };
    const key = JSON.stringify(state);
    if (key !== sent) { sent = key; bridge?.setState(state); }
  });

  return { setActive };
}
