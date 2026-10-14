// Desktop-pet mode (?pet=1, set by the Electron shell in desktop/): only the model, over a transparent window.
// The label and dock give way to the native menu (right-click, or the menu-bar icon); a handle under the model
// moves the window (or ⌥-drag anywhere on it); everywhere the model isn't, clicks fall through to the desktop.
import type { App } from '../engine/app';
import { WEATHER_KINDS, type WeatherKind } from '../engine/atmosphere';
import { SEASONS, SEASON_SAMPLE, type Season } from '../engine/calendar';
import type { LiveSync } from '../engine/live';
import type { HudActions } from './hud';

/** What the shell's menu shows: the scene's current state. */
export interface PetState {
  weather: WeatherKind;
  live: boolean;
  spin: boolean;
  sound: boolean;
  season: Season;
  pickedDate: boolean;
  saver: boolean;
}

export type PetAction =
  | { type: 'weather'; value: WeatherKind }
  | { type: 'time'; value: 'dawn' | 'noon' | 'dusk' | 'night' }
  | { type: 'season'; value: Season }
  | { type: 'today' | 'live' | 'spin' | 'sound' | 'saver' };

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
const ACTIVE_FPS = 60;   // while the pointer is on the model
const LINGER = 1200;     // ms the handle stays after the pointer leaves the model

export function initPet(app: App, live: LiveSync, hud: HudActions) {
  const bridge = (window as unknown as { konbiniDesktop?: DesktopBridge }).konbiniDesktop;
  const atm = app.atmosphere, controls = app.stage.controls;
  document.body.classList.add('pet');
  controls.enablePan = false;            // the right button opens the menu instead
  app.fx.post.gtao.enabled = false;      // ambient occlusion barely shows at this size
  const SAVER_KEY = 'konbini.pet.saver';
  let saver = false;
  try { saver = localStorage.getItem(SAVER_KEY) === '1'; } catch { /* storage unavailable */ }
  const idleFps = () => (saver ? SAVER_FPS : IDLE_FPS);
  app.maxFps = idleFps();

  const handle = document.createElement('div');
  handle.className = 'pet-handle';
  handle.title = '拖动移动（也可以按住 ⌥ 拖动模型）';
  handle.innerHTML = '<i></i><i></i><i></i>';
  document.body.append(handle);

  // --- hover: wake up (full frame rate, show the handle) while the pointer is on the model ---
  let over = false, active = false, sleep = 0, dragging = false;
  const setActive = (on: boolean) => {
    clearTimeout(sleep);
    if (on) {
      if (!active) { active = true; app.maxFps = ACTIVE_FPS; document.body.classList.add('pet-hover'); }
    } else if (active) {
      sleep = window.setTimeout(() => { active = false; app.maxFps = idleFps(); document.body.classList.remove('pet-hover'); }, LINGER);
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
      const onHandle = active && !!(last.target as Element | null)?.closest?.('.pet-handle');
      setOver(onHandle || app.interact.modelAt(last.clientX, last.clientY));
    }, 50);
  });
  document.documentElement.addEventListener('pointerleave', () => { last = null; if (!dragging) setOver(false); });

  // --- moving the window: the shell follows the cursor between drag(true) and drag(false) ---
  const startDrag = (e: PointerEvent, el: Element) => {
    e.preventDefault();
    e.stopPropagation();   // keep the orbit controls out of it
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
  handle.addEventListener('pointerdown', (e) => { if (e.button === 0) startDrag(e, handle); });
  addEventListener('pointerdown', (e) => {
    if (e.button === 0 && e.altKey && e.target instanceof HTMLCanvasElement) startDrag(e, e.target);
  }, { capture: true });

  // --- the native menu ---
  addEventListener('contextmenu', (e) => { e.preventDefault(); bridge?.showMenu(); });

  const solarHour = (v: 'dawn' | 'noon' | 'dusk' | 'night') => {
    const [rise, set] = atm.solarDay;   // the same marks as the dock's time track
    return v === 'dawn' ? rise + 0.4 : v === 'noon' ? 12 : v === 'dusk' ? set - 0.3 : 23.2;
  };
  bridge?.onAction((a) => {
    switch (a.type) {
      case 'weather': if (WEATHER_KINDS.includes(a.value)) hud.setWeather(a.value); break;
      case 'time': hud.setTime(solarHour(a.value)); break;
      case 'season': if (SEASONS.includes(a.value)) hud.setDate(SEASON_SAMPLE[a.value][0], SEASON_SAMPLE[a.value][1]); break;
      case 'today': hud.clearDate(); break;
      case 'live': hud.toggleLive(); break;
      case 'spin': hud.setSpin(!hud.spin); break;
      case 'sound': hud.toggleSound(); break;
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
    const state: PetState = {
      weather: atm.weather, live: live.active, spin: hud.spin, sound: app.audio.enabled,
      season: atm.day.season, pickedDate: !!atm.dateOverride, saver,
    };
    const key = JSON.stringify(state);
    if (key !== sent) { sent = key; bridge?.setState(state); }
  });

  return { setActive };
}
