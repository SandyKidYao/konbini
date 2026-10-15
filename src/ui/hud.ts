// DOM controls. The page is the model: everything else hides until the pointer moves, and speaks in glyphs
// (resting the pointer on one shows its name).
//   bar:  the settings button
//   tray: view presets and the map form, weather keys, time-of-day track, date, live mode, turntable, sound, mods list
import type { App } from '../engine/app';
import { formatHour, WEATHER_KINDS, WEATHER_LABEL, type WeatherKind } from '../engine/atmosphere';
import type { LiveSync, LiveStatus } from '../engine/live';
import { initDatePicker } from './date-picker';
import { initTips } from './tips';
import { VIEWS, findView, viewPose, type ViewPreset } from './views';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const CLOUD_SM = '<path d="M7 15h10a3.4 3.4 0 0 0 .4-6.8A5 5 0 0 0 7.7 7.2 3.9 3.9 0 0 0 7 15z"/>';
const ICONS: Record<WeatherKind, string> = {
  clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/>',
  partly: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.8v1.3M2.8 8.5h1.3M4.5 4.5l.9.9M12.5 4.5l-.9.9"/><path d="M9.5 19.5h8a3.2 3.2 0 0 0 .3-6.4 4.5 4.5 0 0 0-8.6-.8 3.6 3.6 0 0 0 .3 7.2z"/>',
  cloudy: '<path d="M7.2 18.5h10.3a3.9 3.9 0 0 0 .5-7.8 5.6 5.6 0 0 0-10.8-1.2 4.5 4.5 0 0 0 0 9z"/>',
  fog: '<path d="M4 8.5h16M6.5 12.5h13M4 16.5h12M8 20h8"/>',
  drizzle: `${CLOUD_SM}<path d="M9 19v.01M12.5 20.5v.01M16 19v.01"/>`,
  rain: `${CLOUD_SM}<path d="M9 18.2l-1 2.6M12.5 18.2l-1 2.6M16 18.2l-1 2.6"/>`,
  storm: `${CLOUD_SM}<path d="M12.6 16.2l-2.2 3h3l-2 3.3"/>`,
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.8 4.6 12 6.4l2.2-1.8M9.8 19.4 12 17.6l2.2 1.8"/>',
};

/** ms without pointer movement before the controls fade away */
const IDLE = 2600;
const FLIGHT = 1.8;
/** px between stacked panels, and kept clear at the window's edge */
const GAP = 10, EDGE = 8;

export interface HudOptions {
  /** desktop pet: the pet decides when the controls come out (only over the model), and frames its own overview */
  pet?: boolean;
}

export type Form = 'model' | 'plan';
const PLAN_ICON = '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 14h17M15 4.5v15"/><rect x="6.5" y="7.2" width="5.5" height="4" rx=".8"/>';

/** What the desktop pet needs from the controls. */
export interface HudActions {
  /** the model or the map, as chosen in the tray (or the pet's menu) */
  readonly form: Form;
  setForm(form: Form): void;
  onForm(fn: (form: Form) => void): void;
  /** bring the controls out (they fade again once the pointer rests, unless a panel is open) */
  showChrome(): void;
  /** open the settings tray (from the shell's menu) */
  openTray(): void;
}

export function initHud(app: App, live: LiveSync, initialView: string | null, opts: HudOptions = {}): HudActions {
  const atm = app.atmosphere, stage = app.stage, controls = stage.controls, audio = app.audio;
  const body = document.body;
  const tick = () => audio.play('tick');
  // last values written to the DOM
  let lastMinute = -1, lastTheme = '', lastBg = '', lastWeather = '';

  // anything chosen by hand takes the scene out of live mode
  const takeControl = () => { if (live.active) live.stop(); };

  const tips = initTips('.chrome');

  // ---------------------------------------------------------------- panels (tray, calendar, mods)
  const bar = document.querySelector<HTMLElement>('.bar')!;
  const trayBtn = $('trayBtn'), tray = $('tray');
  const modsBtn = $('modsBtn'), modsPanel = $('modsPanel');
  const calPanel = $('calPanel');
  const anyOpen = () => !tray.hidden || !calPanel.hidden || !modsPanel.hidden;

  /**
   * Centre a panel above another. Where the window is too short for that (a small desktop pet, a phone on its
   * side), a card opened from the tray is laid over the tray instead, and anything still too tall scrolls.
   * Returns whether the panel covers the one under it.
   */
  const place = (panel: HTMLElement, under: HTMLElement, canCover: boolean) => {
    const u = under.getBoundingClientRect();
    panel.style.maxHeight = '';
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const cover = canCover && h > u.top - GAP - EDGE;
    const bottom = cover ? u.bottom : u.top - GAP;
    panel.style.bottom = `${innerHeight - bottom}px`;
    panel.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, u.left + u.width / 2 - w / 2))}px`;
    if (h > bottom - EDGE) panel.style.maxHeight = `${bottom - EDGE}px`;
    return cover;
  };
  /** Lay out whatever is open: the tray above the bar, the calendar or mods card above (or over) the tray. */
  const layout = () => {
    tray.classList.remove('covered');
    if (tray.hidden) return;
    place(tray, bar, false);
    const card = !calPanel.hidden ? calPanel : !modsPanel.hidden ? modsPanel : null;
    if (card) tray.classList.toggle('covered', place(card, tray, true));
    tips.refresh();
  };

  const setMods = (open: boolean) => {
    if (open === !modsPanel.hidden) return;
    modsPanel.hidden = !open;
    modsBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      $('modsList').innerHTML = app.loaded.map((m) =>
        `<li class="${m.error ? 'failed' : ''}"><span>${m.id}</span><span class="layer">${m.error ? '✕' : m.external ? `${m.layer} ↗` : m.layer}</span></li>`).join('');
    }
    layout();
  };
  /** Close the top layer: the calendar or mods card first, then the tray. */
  const closeOne = () => {
    if (!calPanel.hidden || !modsPanel.hidden) { cal.setOpen(false); setMods(false); } else setTray(false);
  };
  // Escape closes one layer at a time
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && anyOpen()) closeOne(); });
  const cal = initDatePicker(atm, { takeControl, syncUrl, tick, layout });
  const setTray = (open: boolean) => {
    if (open === !tray.hidden) return;
    tray.hidden = !open;
    trayBtn.setAttribute('aria-expanded', String(open));
    if (!open) { cal.setOpen(false); setMods(false); }
    layout();
  };
  // the button opens the tray, and steps back out of it one layer at a time, like Escape
  trayBtn.addEventListener('click', () => { tick(); if (tray.hidden) setTray(true); else closeOne(); });
  modsBtn.addEventListener('click', () => { tick(); cal.setOpen(false); setMods(modsPanel.hidden); });
  $('dateBtn').addEventListener('click', () => setMods(false));
  addEventListener('resize', layout);

  // ---------------------------------------------------------------- chrome: out of sight until the pointer moves
  let hideTimer = 0, hovering = false;
  const chrome = [...document.querySelectorAll<HTMLElement>('.chrome')];
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (hovering || anyOpen() || chrome.some((c) => c.contains(document.activeElement))) hideSoon();
      else body.classList.remove('chrome-on');
    }, IDLE);
  };
  const showChrome = () => { body.classList.add('chrome-on'); hideSoon(); };
  const hideChrome = () => { clearTimeout(hideTimer); setTray(false); body.classList.remove('chrome-on'); tips.hide(); };
  // (the pet only shows them while the pointer is on the model: it calls showChrome itself)
  if (!opts.pet) addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !e.buttons) showChrome(); });
  // hidden controls can't take focus: Tab brings them out first
  addEventListener('keydown', (e) => { if (e.key === 'Tab') showChrome(); }, { capture: true });
  for (const c of chrome) {
    c.addEventListener('pointerenter', () => { hovering = true; });
    c.addEventListener('pointerleave', () => { hovering = false; });
    c.addEventListener('focusin', showChrome);
  }
  // touch: a tap on the scene (not a drag) shows or hides the controls
  // (read the state while capturing: grabbing the model hides the controls before the canvas hears the press)
  let tap: { x: number; y: number; wasOn: boolean } | null = null;
  addEventListener('pointerdown', (e) => {
    tap = e.pointerType !== 'mouse' && e.target === stage.renderer.domElement
      ? { x: e.clientX, y: e.clientY, wasOn: body.classList.contains('chrome-on') } : null;
  }, { capture: true });
  stage.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!tap || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) return;
    if (tap.wasOn) hideChrome(); else showChrome();
  });

  // ---------------------------------------------------------------- view presets, then the map form at the end of the row
  const viewBox = $('views');
  viewBox.innerHTML = VIEWS.map((v) => `
    <button type="button" class="ico" data-view="${v.id}" aria-pressed="false" aria-label="${v.name}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${v.icon}</svg>
    </button>`).join('') + `<span class="sep" aria-hidden="true"></span>
    <button type="button" class="ico" id="planBtn" aria-pressed="false" aria-label="俯视图" aria-keyshortcuts="P">
      <svg viewBox="0 0 24 24" aria-hidden="true">${PLAN_ICON}</svg>
    </button>`;
  const viewBtns = [...viewBox.querySelectorAll<HTMLButtonElement>('[data-view]')];
  const planBtn = $('planBtn');
  let view: ViewPreset | null = null;
  let form: Form = 'model';
  const formFns: ((f: Form) => void)[] = [];
  const markView = () => viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(form === 'model' && b.dataset.view === view?.id)));
  /** The map form stops drawing the model (the street lives on); a view preset brings the model back. */
  const setForm = (f: Form) => {
    if (f === form) return;
    form = f;
    app.form = f;
    body.dataset.form = f;
    planBtn.setAttribute('aria-pressed', String(f === 'plan'));
    markView();
    syncUrl();
    for (const fn of formFns) fn(f);
  };
  planBtn.addEventListener('click', () => { tick(); setForm(form === 'plan' ? 'model' : 'plan'); });
  const setView = (id: string, instant = false) => {
    const v = findView(id);
    if (!v) return;
    view = v;
    setForm('model');
    stage.flyTo(viewPose(v, innerWidth / innerHeight, opts.pet), instant || app.reducedMotion ? 0 : FLIGHT);
    markView();
    syncUrl();
  };
  viewBtns.forEach((b) => b.addEventListener('click', () => { tick(); setView(b.dataset.view!); }));
  // hand-turning the model leaves the preset
  controls.addEventListener('start', () => { if (view) { view = null; markView(); } });
  addEventListener('resize', () => { if (view && !stage.flying) stage.flyTo(viewPose(view, innerWidth / innerHeight, opts.pet), 0); });
  if (initialView && findView(initialView)) { view = findView(initialView)!; markView(); }
  body.dataset.form = form;
  // the map at first; the overview (where the camera stands) when the model comes back
  if (initialView === 'plan') { view = VIEWS[0]; setForm('plan'); }
  const stepView = (n: number) => {
    const i = view ? VIEWS.indexOf(view) : -1;
    setView(VIEWS[(i + n + VIEWS.length) % VIEWS.length].id);
  };

  // ---------------------------------------------------------------- weather keys, built from the list of kinds
  const keyBox = $('weatherKeys');
  keyBox.innerHTML = WEATHER_KINDS.map((k, i) => `
    <button type="button" data-weather="${k}" aria-pressed="false" aria-label="${WEATHER_LABEL[k]}" aria-keyshortcuts="${i + 1}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>
    </button>`).join('');
  const keys = [...keyBox.querySelectorAll<HTMLButtonElement>('button')];
  const setWeather = (w: WeatherKind) => { takeControl(); atm.setWeather(w); syncUrl(); };
  keys.forEach((b) => b.addEventListener('click', () => { tick(); setWeather(b.dataset.weather as WeatherKind); }));

  // ---------------------------------------------------------------- time of day
  const range = $<HTMLInputElement>('timeRange');
  const knob = $('timeKnob');
  range.addEventListener('input', () => { takeControl(); atm.setTime(Number(range.value), { instant: true }); });
  range.addEventListener('change', syncUrl);
  document.querySelectorAll<HTMLButtonElement>('.marks button').forEach((b) =>
    b.addEventListener('click', () => { tick(); takeControl(); atm.setTime(Number(b.dataset.hour)); syncUrl(); }));

  // the track's colours and the dawn / dusk marks follow sunrise and sunset (they move with the date)
  const track = document.querySelector<HTMLElement>('.track')!;
  const [dawnMark, , duskMark] = document.querySelectorAll<HTMLButtonElement>('.marks button');
  let lastSolar = '';
  const syncSolar = () => {
    const [rise, set] = atm.solarDay;
    const key = `${rise.toFixed(2)} ${set.toFixed(2)}`;
    if (key === lastSolar) return;
    lastSolar = key;
    const pct = (h: number) => `${(h / 24) * 100}%`;
    track.style.setProperty('--rise', pct(rise));
    track.style.setProperty('--set', pct(set));
    dawnMark.dataset.hour = String(rise + 0.4); dawnMark.style.left = pct(rise + 0.4);
    duskMark.dataset.hour = String(set - 0.3); duskMark.style.left = pct(set - 0.3);
  };
  syncSolar();

  // ---------------------------------------------------------------- live mode: the pin turns green; a dot says it is busy or failing
  const liveBtn = $('liveBtn');
  const toggleLive = () => { tick(); if (live.active) live.stop(); else void live.start(); syncUrl(); };
  liveBtn.addEventListener('click', toggleLive);
  let liveName = '';
  live.onChange((s: LiveStatus) => {
    liveBtn.setAttribute('aria-pressed', String(s.state !== 'off'));
    liveBtn.dataset.state = s.state === 'locating' || s.state === 'fetching' ? 'busy' : s.state;
    liveName = s.state !== 'off' && s.report ? `${s.report.description} ${Math.round(s.report.temperature)}°` : '';
    liveBtn.setAttribute('aria-label', ['实况', s.place?.name, s.message].filter(Boolean).join(' · '));
    lastWeather = '';
    tips.refresh();
  });

  // ---------------------------------------------------------------- date: [ and ] step through days
  const shiftDate = (days: number) => { takeControl(); atm.shiftDate(days); syncUrl(); };

  // ---------------------------------------------------------------- turntable: off unless asked for; pauses while you handle the model
  const spinBtn = $('spinBtn');
  let spinOn = false, resume = 0;
  const setSpin = (on: boolean) => { spinOn = on; controls.autoRotate = on; spinBtn.setAttribute('aria-pressed', String(on)); };
  setSpin(false);
  spinBtn.addEventListener('click', () => { tick(); setSpin(!spinOn); });
  controls.addEventListener('start', () => { clearTimeout(resume); controls.autoRotate = false; hideChrome(); });
  controls.addEventListener('end', () => { clearTimeout(resume); resume = window.setTimeout(() => { if (spinOn) controls.autoRotate = true; }, 6000); });

  // ---------------------------------------------------------------- sound
  const soundBtn = $('soundBtn');
  const toggleSound = () => { audio.setEnabled(!audio.enabled); soundBtn.setAttribute('aria-pressed', String(audio.enabled)); tick(); };
  soundBtn.addEventListener('click', toggleSound);

  // ---------------------------------------------------------------- keyboard
  addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const n = Number(k);
    if (n >= 1 && n <= WEATHER_KINDS.length) setWeather(WEATHER_KINDS[n - 1]);
    else if (k === 'v') stepView(e.shiftKey ? -1 : 1);
    else if (k === 'p') planBtn.click();
    else if (k === 'l') toggleLive();
    else if (k === 'r') spinBtn.click();
    else if (k === 'm') toggleSound();
    else if (e.key === '[' || e.key === ']') shiftDate(e.key === '[' ? -1 : 1);
    else if (e.key === '{' || e.key === '}') shiftDate(e.key === '{' ? -7 : 7);
  });

  // ---------------------------------------------------------------- reflect state every frame (time animates, theme follows daylight)
  const knobTime = $('knobTime');
  app.onFrameUI(() => {
    syncSolar();
    const d = atm.drivers;
    const minute = Math.floor(d.hour * 60);
    if (minute !== lastMinute) {
      lastMinute = minute;
      knobTime.textContent = formatHour(d.hour);
      range.setAttribute('aria-valuetext', knobTime.textContent);
      if (document.activeElement !== range) range.value = String(d.hour);
    }
    knob.style.left = `${(d.hour / 24) * 100}%`;
    knob.classList.toggle('night', d.daylight < 0.3);
    const w = `${atm.weather} ${liveName}`;
    if (w !== lastWeather) {
      lastWeather = w;
      keys.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weather === atm.weather)));
      keyBox.setAttribute('aria-label', liveName ? `天气 · ${liveName}` : '天气');
    }
    const theme = d.daylight < 0.35 ? 'dark' : 'light';
    if (theme !== lastTheme) { lastTheme = theme; body.dataset.theme = theme; }
    const bg = `#${atm.look.bgFloor.getHexString()}`;
    if (bg !== lastBg) { lastBg = bg; body.style.setProperty('--bg', bg); }
  });

  return {
    get form() { return form; },
    setForm,
    onForm: (fn) => { formFns.push(fn); },
    showChrome,
    openTray: () => { showChrome(); setTray(true); },
  };

  function syncUrl() {
    const q = new URLSearchParams(location.search);
    q.delete('season');
    if (live.active) { q.set('live', '1'); q.delete('weather'); q.delete('time'); q.delete('date'); }
    else {
      q.delete('live');
      q.set('weather', atm.weather);
      q.set('time', formatHour(atm.drivers.hour).replace(':', ''));
      const o = atm.dateOverride;
      if (o) q.set('date', `${o[0]}-${String(o[1]).padStart(2, '0')}-${String(o[2]).padStart(2, '0')}`);
      else q.delete('date');
    }
    // `view` is set by choosing a preset; a hand-placed camera (`cam`) gives way to it
    if (form === 'plan') q.set('view', 'plan');
    else if (view) { q.set('view', view.id); q.delete('cam'); }
    else if (q.get('view') === 'plan') q.delete('view');
    history.replaceState(null, '', `?${q}`);
  }
}

export const revealStage = () => $('veil').classList.add('done');
