// DOM controls: weather keys, time-of-day slider, live mode, turntable, sound, mods list, shortcuts.
import type { App } from '../engine/app';
import { formatHour, WEATHER_KINDS, WEATHER_LABEL, type WeatherKind } from '../engine/atmosphere';
import type { LiveSync, LiveStatus } from '../engine/live';

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

export function initHud(app: App, live: LiveSync) {
  const atm = app.atmosphere, controls = app.stage.controls, audio = app.audio;
  const tick = () => audio.play('tick');
  // last values written to the DOM (declared first: the live listener below fires immediately)
  let lastMinute = -1, lastTheme = '', lastBg = '', lastWeather = '';

  // --- first-visit hint ---
  const hint = $('hint');
  const dismissHint = () => hint.classList.add('gone');
  setTimeout(dismissHint, 12000);

  // anything chosen by hand takes the scene out of live mode
  const takeControl = () => { if (live.active) live.stop(); };

  // --- weather keys, built from the list of kinds ---
  const keyBox = $('weatherKeys');
  keyBox.innerHTML = WEATHER_KINDS.map((k, i) => `
    <button type="button" data-weather="${k}" aria-pressed="false" title="${WEATHER_LABEL[k]}（${i + 1}）">
      <span class="lamp" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>
      <span class="name">${k === 'partly' ? '少云' : k === 'storm' ? '雷雨' : WEATHER_LABEL[k]}</span>
    </button>`).join('');
  const keys = [...keyBox.querySelectorAll<HTMLButtonElement>('button')];
  const setWeather = (w: WeatherKind) => { takeControl(); atm.setWeather(w); syncUrl(); };
  keys.forEach((b) => b.addEventListener('click', () => { tick(); setWeather(b.dataset.weather as WeatherKind); }));

  // --- time of day ---
  const range = $<HTMLInputElement>('timeRange');
  const knob = $('timeKnob');
  range.addEventListener('input', () => { takeControl(); atm.setTime(Number(range.value), { instant: true }); dismissHint(); });
  range.addEventListener('change', syncUrl);
  document.querySelectorAll<HTMLButtonElement>('.marks button').forEach((b) =>
    b.addEventListener('click', () => { tick(); takeControl(); atm.setTime(Number(b.dataset.hour)); syncUrl(); }));

  // --- live mode ---
  const liveBtn = $('liveBtn');
  const toggleLive = () => { tick(); if (live.active) live.stop(); else void live.start(); syncUrl(); };
  liveBtn.addEventListener('click', toggleLive);
  const labelLive = $('labelLive'), labelPlaceRow = $('labelPlaceRow'), labelPlace = $('labelPlace'), labelStatus = $('labelStatus');
  let liveText = '';
  live.onChange((s: LiveStatus) => {
    const on = s.state !== 'off';
    liveBtn.setAttribute('aria-pressed', String(on));
    liveBtn.dataset.busy = String(s.state === 'locating' || s.state === 'fetching');
    labelLive.hidden = !on;
    labelPlaceRow.hidden = !on || !s.place;
    if (s.place) labelPlace.textContent = (s.place.name ?? `${s.place.lat.toFixed(1)}°, ${s.place.lon.toFixed(1)}°`) + (s.place.approx ? '（大致）' : '');
    const updated = s.report ? `更新于 ${new Date(s.report.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '';
    const msg = s.message ?? (s.state === 'live' ? updated : '');
    labelStatus.hidden = !on || !msg;
    labelStatus.textContent = msg;
    liveText = !on ? '' : s.report ? `${s.report.description} <span class="temp">${Math.round(s.report.temperature)}°</span>`
      : s.state === 'error' ? '<span class="temp">未知</span>' : '';
    lastWeather = '';
  });

  // --- turntable: pauses while you handle the model, resumes when you let go ---
  const spinBtn = $('spinBtn');
  let spinOn = !app.reducedMotion, resume = 0;
  const setSpin = (on: boolean) => { spinOn = on; controls.autoRotate = on; spinBtn.setAttribute('aria-pressed', String(on)); };
  setSpin(spinOn);
  spinBtn.addEventListener('click', () => { tick(); setSpin(!spinOn); });
  controls.addEventListener('start', () => { dismissHint(); clearTimeout(resume); controls.autoRotate = false; });
  controls.addEventListener('end', () => { clearTimeout(resume); resume = window.setTimeout(() => { if (spinOn) controls.autoRotate = true; }, 6000); });

  // --- sound ---
  const soundBtn = $('soundBtn');
  const toggleSound = () => { audio.setEnabled(!audio.enabled); soundBtn.setAttribute('aria-pressed', String(audio.enabled)); tick(); };
  soundBtn.addEventListener('click', toggleSound);

  // --- mods list ---
  const modsBtn = $('modsBtn'), modsPanel = $('modsPanel');
  modsBtn.addEventListener('click', () => {
    const open = modsPanel.hidden;
    modsPanel.hidden = !open;
    modsBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      $('modsList').innerHTML = app.loaded.map((m) =>
        `<li class="${m.error ? 'failed' : ''}"><span>${m.id}${m.external ? '（外部）' : ''}</span><span class="layer">${m.error ? '加载失败' : m.layer}</span></li>`).join('');
    }
  });

  // --- keyboard ---
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    const n = Number(k);
    if (n >= 1 && n <= WEATHER_KINDS.length) setWeather(WEATHER_KINDS[n - 1]);
    else if (k === 'l') toggleLive();
    else if (k === 'r') spinBtn.click();
    else if (k === 'm') toggleSound();
  });

  // --- reflect state every frame (time animates, real time ticks, theme follows daylight) ---
  const labelTime = $('labelTime'), labelWeather = $('labelWeather');
  app.onFrameUI(() => {
    const d = atm.drivers;
    const minute = Math.floor(d.hour * 60);
    if (minute !== lastMinute) {
      lastMinute = minute;
      labelTime.textContent = formatHour(d.hour);
      if (document.activeElement !== range) range.value = String(d.hour);
    }
    knob.style.left = `${(d.hour / 24) * 100}%`;
    knob.classList.toggle('night', d.daylight < 0.3);
    const w = liveText || WEATHER_LABEL[atm.weather];
    if (w !== lastWeather) {
      lastWeather = w;
      labelWeather.innerHTML = w;
      keys.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.weather === atm.weather)));
    }
    const theme = d.daylight < 0.35 ? 'dark' : 'light';
    if (theme !== lastTheme) { lastTheme = theme; document.body.dataset.theme = theme; }
    const bg = `#${atm.look.bgFloor.getHexString()}`;
    if (bg !== lastBg) { lastBg = bg; document.body.style.setProperty('--bg', bg); }
  });

  function syncUrl() {
    const q = new URLSearchParams(location.search);
    if (live.active) { q.set('live', '1'); q.delete('weather'); q.delete('time'); }
    else {
      q.delete('live');
      q.set('weather', atm.weather);
      q.set('time', formatHour(atm.drivers.hour).replace(':', ''));
    }
    history.replaceState(null, '', `?${q}`);
  }
}

export const revealStage = () => $('veil').classList.add('done');
