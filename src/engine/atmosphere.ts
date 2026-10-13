// Time of day × weather. Two independent inputs — a clock and a set of weather parameters — are smoothed
// into "drivers" (daylight, cloud, rain, snow, fog, wetness…) and a global "look" (backdrop, light, grade, post).
// Content never reads a preset; it reads drivers or named channels and decides its own brightness.
//
// Weather is continuous underneath (cloud, rain, snow, fog, wind, thunder, temperature). The named kinds are
// presets of those numbers; live weather maps measurements straight onto them, so "light snow showers" or
// "misty drizzle" come out naturally.
import * as THREE from 'three';
import { clamp01, lerp, smoothstep } from './kit/build';

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'storm' | 'snow';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'storm', 'snow'];
export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '晴', partly: '晴间多云', cloudy: '阴', fog: '雾', drizzle: '小雨', rain: '雨', storm: '雷阵雨', snow: '雪',
};

export interface WeatherParams {
  /** cloud cover 0–1 */
  cloud: number;
  /** rainfall 0 (none) – 1 (downpour) */
  rain: number;
  /** snowfall 0–1 */
  snow: number;
  /** fog / mist 0–1 */
  fog: number;
  /** wind 0–1 */
  wind: number;
  /** thunderstorm activity 0–1 */
  thunder: number;
  /** air temperature, °C */
  temperature: number;
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherParams> = {
  clear: { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0.15, thunder: 0, temperature: 22 },
  partly: { cloud: 0.4, rain: 0, snow: 0, fog: 0, wind: 0.35, thunder: 0, temperature: 20 },
  cloudy: { cloud: 0.95, rain: 0, snow: 0, fog: 0, wind: 0.6, thunder: 0, temperature: 17 },
  fog: { cloud: 0.6, rain: 0, snow: 0, fog: 1, wind: 0.05, thunder: 0, temperature: 12 },
  drizzle: { cloud: 0.9, rain: 0.35, snow: 0, fog: 0.15, wind: 0.25, thunder: 0, temperature: 15 },
  rain: { cloud: 1, rain: 0.8, snow: 0, fog: 0, wind: 0.35, thunder: 0, temperature: 14 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0, wind: 1, thunder: 1, temperature: 19 },
  snow: { cloud: 0.9, rain: 0, snow: 0.85, fog: 0.1, wind: 0.25, thunder: 0, temperature: -1 },
};

export interface Drivers extends WeatherParams {
  /** clock hour 0–24 as displayed (local time of the place) */
  hour: number;
  /** the hour as the sky sees it: sunrise mapped to 6, sunset to 18 */
  solarHour: number;
  /** −1 (midnight) … 1 (noon) */
  sunElevation: number;
  /** 0 at night, 1 in full day */
  daylight: number;
  /** peaks around sunrise and sunset */
  golden: number;
  /** how wet the ground is 0–1 (lags behind rain, dries slowly) */
  wet: number;
  /** how much snow has settled 0–1 (builds up while snowing, melts afterwards) */
  snowCover: number;
  /** a lightning flash 0–1 (brief) */
  flash: number;
}

type ColorKey = 'bgTop' | 'bgHorizon' | 'bgFloor' | 'fog' | 'hemiSky' | 'hemiGround' | 'sunColor' | 'grade' | 'cloudColor';
type NumberKey = 'floorShadow' | 'contact' | 'fogDensity' | 'hemi' | 'sun' | 'shadow' | 'exposure' | 'sat' | 'contrast' | 'bloom' | 'bloomThr' | 'bloomRad' | 'ao' | 'tilt' | 'cloudOpacity';
export type Look = { [K in ColorKey]: THREE.Color } & { [K in NumberKey]: number };
type LookSpec = { [K in ColorKey]: string } & { [K in NumberKey]: number };

const COLOR_KEYS: ColorKey[] = ['bgTop', 'bgHorizon', 'bgFloor', 'fog', 'hemiSky', 'hemiGround', 'sunColor', 'grade', 'cloudColor'];
const NUMBER_KEYS: NumberKey[] = ['floorShadow', 'contact', 'fogDensity', 'hemi', 'sun', 'shadow', 'exposure', 'sat', 'contrast', 'bloom', 'bloomThr', 'bloomRad', 'ao', 'tilt', 'cloudOpacity'];

// ------------------------------------------------------------------ looks
// Clear-sky looks along the day; weather looks (day and night variants) are layered on top.
const SPEC: Record<string, LookSpec> = {
  night: {
    bgTop: '#0c1222', bgHorizon: '#1a2340', bgFloor: '#121a2e', floorShadow: 0.35, contact: 0.55,
    fog: '#1a2238', fogDensity: 0.004, hemiSky: '#3d5078', hemiGround: '#121216', hemi: 0.45,
    sunColor: '#8ea6d8', sun: 0.32, shadow: 0.5, exposure: 1.1, sat: 1.05, contrast: 1.05, grade: '#f0f4ff',
    bloom: 0.5, bloomThr: 0.8, bloomRad: 0.4, ao: 0.8, tilt: 1, cloudColor: '#2a3040', cloudOpacity: 0,
  },
  dawn: {
    bgTop: '#c4c6e8', bgHorizon: '#fbe2d2', bgFloor: '#ebdcd8', floorShadow: 0.2, contact: 0.45,
    fog: '#f2ddd2', fogDensity: 0.002, hemiSky: '#e6dcf2', hemiGround: '#9a8272', hemi: 0.8,
    sunColor: '#ffc39c', sun: 2.2, shadow: 0.75, exposure: 1.0, sat: 1.06, contrast: 1.0, grade: '#fff3ec',
    bloom: 0.25, bloomThr: 0.85, bloomRad: 0.4, ao: 0.9, tilt: 1, cloudColor: '#ffe4d8', cloudOpacity: 1,
  },
  day: {
    bgTop: '#b9dcee', bgHorizon: '#e6f2ef', bgFloor: '#d4e6df', floorShadow: 0.22, contact: 0.42,
    fog: '#e6f2ef', fogDensity: 0, hemiSky: '#dcefff', hemiGround: '#a89878', hemi: 0.95,
    sunColor: '#ffe8c6', sun: 4.0, shadow: 0.8, exposure: 1.0, sat: 1.1, contrast: 1.05, grade: '#fffaf2',
    bloom: 0.1, bloomThr: 0.95, bloomRad: 0.3, ao: 0.9, tilt: 1, cloudColor: '#ffffff', cloudOpacity: 1,
  },
  dusk: {
    bgTop: '#a6b6dc', bgHorizon: '#ffd3ad', bgFloor: '#f0d8c8', floorShadow: 0.25, contact: 0.48,
    fog: '#f5d2b4', fogDensity: 0.002, hemiSky: '#f0d8cc', hemiGround: '#8a6a5a', hemi: 0.75,
    sunColor: '#ff9e62', sun: 2.6, shadow: 0.8, exposure: 1.0, sat: 1.12, contrast: 1.04, grade: '#fff1e2',
    bloom: 0.3, bloomThr: 0.85, bloomRad: 0.4, ao: 0.9, tilt: 1, cloudColor: '#ffe6d6', cloudOpacity: 0.95,
  },
  blue: {
    bgTop: '#26345c', bgHorizon: '#4c5280', bgFloor: '#2c3352', floorShadow: 0.3, contact: 0.5,
    fog: '#3a3f66', fogDensity: 0.003, hemiSky: '#6474a6', hemiGround: '#2a2430', hemi: 0.55,
    sunColor: '#a6b4e2', sun: 0.4, shadow: 0.5, exposure: 1.06, sat: 1.05, contrast: 1.02, grade: '#f3f1ff',
    bloom: 0.45, bloomThr: 0.8, bloomRad: 0.4, ao: 0.85, tilt: 1, cloudColor: '#4c5276', cloudOpacity: 0.6,
  },
  cloudyDay: {
    bgTop: '#c3c4cf', bgHorizon: '#e2e1e7', bgFloor: '#d3d2da', floorShadow: 0.1, contact: 0.4,
    fog: '#d6d6dd', fogDensity: 0.0035, hemiSky: '#dfe3ea', hemiGround: '#7a776f', hemi: 1.15,
    sunColor: '#ece2d6', sun: 0.7, shadow: 0.3, exposure: 0.95, sat: 0.72, contrast: 0.96, grade: '#f4f6fb',
    bloom: 0.2, bloomThr: 0.85, bloomRad: 0.4, ao: 1.0, tilt: 1, cloudColor: '#b9bdc5', cloudOpacity: 1,
  },
  cloudyNight: {
    bgTop: '#141824', bgHorizon: '#262a36', bgFloor: '#1a1e2a', floorShadow: 0.25, contact: 0.5,
    fog: '#22262f', fogDensity: 0.005, hemiSky: '#4a5468', hemiGround: '#141416', hemi: 0.5,
    sunColor: '#9aa4b8', sun: 0.15, shadow: 0.2, exposure: 1.05, sat: 0.85, contrast: 1.0, grade: '#f2f4f8',
    bloom: 0.45, bloomThr: 0.8, bloomRad: 0.4, ao: 0.85, tilt: 1, cloudColor: '#2e333e', cloudOpacity: 0.8,
  },
  rainDay: {
    bgTop: '#aeb3bf', bgHorizon: '#cbcdd4', bgFloor: '#bfc1c9', floorShadow: 0.08, contact: 0.4,
    fog: '#c4c7cf', fogDensity: 0.007, hemiSky: '#cfd5de', hemiGround: '#6a6862', hemi: 1.0,
    sunColor: '#dfe2e8', sun: 0.4, shadow: 0.2, exposure: 0.92, sat: 0.7, contrast: 0.98, grade: '#eef2f8',
    bloom: 0.25, bloomThr: 0.85, bloomRad: 0.4, ao: 1.0, tilt: 1, cloudColor: '#9aa0aa', cloudOpacity: 1,
  },
  rainNight: {
    bgTop: '#0c1222', bgHorizon: '#1a2340', bgFloor: '#121a2e', floorShadow: 0.35, contact: 0.55,
    fog: '#1a2238', fogDensity: 0.006, hemiSky: '#3d5078', hemiGround: '#121216', hemi: 0.45,
    sunColor: '#8ea6d8', sun: 0.3, shadow: 0.5, exposure: 1.1, sat: 1.05, contrast: 1.05, grade: '#f0f4ff',
    bloom: 0.5, bloomThr: 0.8, bloomRad: 0.4, ao: 0.8, tilt: 1, cloudColor: '#2a3040', cloudOpacity: 0,
  },
  stormDay: {
    bgTop: '#7c828e', bgHorizon: '#9aa0aa', bgFloor: '#8c919a', floorShadow: 0.05, contact: 0.4,
    fog: '#8e939c', fogDensity: 0.01, hemiSky: '#a0a8b6', hemiGround: '#4a4a48', hemi: 0.85,
    sunColor: '#c8ccd4', sun: 0.25, shadow: 0.1, exposure: 0.95, sat: 0.7, contrast: 1.02, grade: '#e8eef8',
    bloom: 0.35, bloomThr: 0.8, bloomRad: 0.45, ao: 1.0, tilt: 1, cloudColor: '#6a707c', cloudOpacity: 1,
  },
  stormNight: {
    bgTop: '#070a12', bgHorizon: '#121828', bgFloor: '#0c111e', floorShadow: 0.35, contact: 0.55,
    fog: '#121828', fogDensity: 0.008, hemiSky: '#2e3c5c', hemiGround: '#0e0e10', hemi: 0.38,
    sunColor: '#8ea6d8', sun: 0.22, shadow: 0.4, exposure: 1.1, sat: 1.0, contrast: 1.06, grade: '#eef2ff',
    bloom: 0.55, bloomThr: 0.78, bloomRad: 0.45, ao: 0.8, tilt: 1, cloudColor: '#1a1e28', cloudOpacity: 0,
  },
  snowDay: {
    bgTop: '#d6dde6', bgHorizon: '#eef1f4', bgFloor: '#e4e8ec', floorShadow: 0.1, contact: 0.35,
    fog: '#e8ecf0', fogDensity: 0.006, hemiSky: '#eef3fa', hemiGround: '#b8bcc4', hemi: 1.25,
    sunColor: '#f2f4f8', sun: 0.9, shadow: 0.3, exposure: 1.0, sat: 0.8, contrast: 0.98, grade: '#f2f6ff',
    bloom: 0.2, bloomThr: 0.88, bloomRad: 0.4, ao: 0.9, tilt: 1, cloudColor: '#dfe3ea', cloudOpacity: 1,
  },
  snowNight: {
    bgTop: '#1a2133', bgHorizon: '#2c3550', bgFloor: '#222a3e', floorShadow: 0.3, contact: 0.5,
    fog: '#2a3247', fogDensity: 0.006, hemiSky: '#5a6c92', hemiGround: '#3a4050', hemi: 0.6,
    sunColor: '#a8b8dc', sun: 0.35, shadow: 0.4, exposure: 1.1, sat: 0.95, contrast: 1.02, grade: '#eef2ff',
    bloom: 0.5, bloomThr: 0.78, bloomRad: 0.45, ao: 0.85, tilt: 1, cloudColor: '#2a3044', cloudOpacity: 0.3,
  },
  fogDay: {
    bgTop: '#d5d8dc', bgHorizon: '#e6e7e8', bgFloor: '#dcdedf', floorShadow: 0.05, contact: 0.3,
    fog: '#dfe1e3', fogDensity: 0.011, hemiSky: '#e4e7ea', hemiGround: '#8a8a86', hemi: 1.2,
    sunColor: '#eeeeea', sun: 0.5, shadow: 0.15, exposure: 0.98, sat: 0.6, contrast: 0.9, grade: '#f6f7f8',
    bloom: 0.25, bloomThr: 0.82, bloomRad: 0.55, ao: 0.9, tilt: 1.15, cloudColor: '#d8dadc', cloudOpacity: 0.7,
  },
  fogNight: {
    bgTop: '#161a22', bgHorizon: '#252a33', bgFloor: '#1c2028', floorShadow: 0.2, contact: 0.45,
    fog: '#242830', fogDensity: 0.012, hemiSky: '#4a5262', hemiGround: '#141416', hemi: 0.5,
    sunColor: '#9aa4b8', sun: 0.15, shadow: 0.1, exposure: 1.08, sat: 0.8, contrast: 0.95, grade: '#f2f2f4',
    bloom: 0.7, bloomThr: 0.7, bloomRad: 0.7, ao: 0.8, tilt: 1.15, cloudColor: '#262a33', cloudOpacity: 0.3,
  },
};

function toLook(s: LookSpec): Look {
  const l = {} as Look;
  for (const k of COLOR_KEYS) l[k] = new THREE.Color(s[k]);
  for (const k of NUMBER_KEYS) l[k] = s[k];
  return l;
}
const emptyLook = () => toLook(SPEC.day);
function lerpLook(out: Look, a: Look, b: Look, t: number) {
  for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of NUMBER_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}
const LOOKS = Object.fromEntries(Object.entries(SPEC).map(([k, v]) => [k, toLook(v)])) as Record<string, Look>;

// clear-sky keyframes along the (solar) day
const CLEAR_TRACK: [number, string][] = [
  [0, 'night'], [4.8, 'night'], [6.0, 'dawn'], [7.6, 'day'], [16.4, 'day'], [17.9, 'dusk'], [19.2, 'blue'], [20.4, 'night'], [24, 'night'],
];
function clearLookAt(h: number, out: Look) {
  for (let i = 0; i < CLEAR_TRACK.length - 1; i++) {
    const [h0, a] = CLEAR_TRACK[i], [h1, b] = CLEAR_TRACK[i + 1];
    if (h >= h0 && h <= h1) return lerpLook(out, LOOKS[a], LOOKS[b], smoothstep(0, 1, (h - h0) / (h1 - h0 || 1)));
  }
  return lerpLook(out, LOOKS.night, LOOKS.night, 0);
}

export type ChannelFn = (d: Drivers) => number;
const PARAM_KEYS: (keyof WeatherParams)[] = ['cloud', 'rain', 'snow', 'fog', 'wind', 'thunder', 'temperature'];

// ------------------------------------------------------------------ the atmosphere
export class Atmosphere {
  readonly drivers: Drivers = {
    hour: 11.33, solarHour: 11.33, sunElevation: 1, daylight: 1, golden: 0, wet: 0, snowCover: 0, flash: 0,
    ...WEATHER_PRESETS.clear,
  };
  readonly look: Look = emptyLook();
  /** derived values content subscribes to: sign, interior, window, lamp, signal, head, vending… */
  readonly channels: Record<string, number> = {};
  readonly sunPosition = new THREE.Vector3();

  /** the named kind currently shown (for live weather: the closest kind) */
  weather: WeatherKind = 'clear';
  /** the weather the drivers are easing toward */
  readonly target: WeatherParams = { ...WEATHER_PRESETS.clear };
  followRealTime = false;
  /** minutes east of UTC for the clock, or null for the device's own time zone */
  clockOffset: number | null = null;

  private sunrise = 6;
  private sunset = 18;
  private hourFrom = 11.33;
  private hourTo = 11.33;
  private hourT = 1;
  private hourDuration = 2.5;
  private channelFns = new Map<string, ChannelFn>();
  private strikeFns = new Set<(distance: number) => void>();
  private listeners = new Set<(a: Atmosphere) => void>();
  private tmp = emptyLook();
  private clockCheck = 0;
  private nextStrike = 4;
  private flashes: { at: number; power: number }[] = [];
  private time = 0;

  constructor() {
    const d = lerp;
    this.defineChannel('sign', (x) => d(0.8, 0.75 + 0.5 * x.cloud, x.daylight));
    this.defineChannel('interior', (x) => d(1.5, 0.75 + 0.35 * x.cloud, x.daylight));
    this.defineChannel('vending', (x) => d(1.2, 0.6 + 0.4 * x.cloud, x.daylight));
    this.defineChannel('window', (x) => d(1.25, 0.12 * x.cloud + 0.3 * x.thunder, x.daylight) + x.golden * 0.25);
    // street lamps come on at dusk — and on dark stormy or foggy days
    this.defineChannel('lamp', (x) => 2.5 * (1 - smoothstep(0.2, 0.55, x.daylight + x.golden * 0.1 - x.cloud * 0.1 - x.fog * 0.3 - x.thunder * 0.25)));
    this.defineChannel('signal', (x) => d(2.6, 1.6 + 0.4 * x.cloud, x.daylight));
    this.defineChannel('head', (x) => d(3, 0.35 + 0.45 * x.cloud + 0.3 * x.rain + 0.6 * x.fog, x.daylight));
    this.update(0);
  }

  /** Register (or override) a channel. Mods can add their own, e.g. 'neon'. */
  defineChannel(name: string, fn: ChannelFn) {
    this.channelFns.set(name, fn);
    this.channels[name] = fn(this.drivers);
  }
  channel(name: string) { return this.channels[name] ?? 0; }

  /** Lightning: fn(distance 0–1) is called as each bolt strikes (for thunder, with a delay). */
  onStrike(fn: (distance: number) => void) { this.strikeFns.add(fn); return () => this.strikeFns.delete(fn); }
  onChange(fn: (a: Atmosphere) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // ---------------------------------------------------------------- inputs
  setTime(hour: number, { instant = false, manual = true } = {}) {
    if (manual) this.followRealTime = false;
    const to = ((hour % 24) + 24) % 24;
    if (instant) { this.hourFrom = this.hourTo = to; this.hourT = 1; this.drivers.hour = to; return; }
    this.hourFrom = this.drivers.hour;
    let delta = to - this.hourFrom;     // take the short way round the clock
    if (delta > 12) delta -= 24;
    if (delta < -12) delta += 24;
    this.hourTo = this.hourFrom + delta;
    this.hourDuration = 1.2 + Math.abs(delta) * 0.25;
    this.hourT = 0;
  }

  setFollowRealTime(on: boolean) {
    this.followRealTime = on;
    if (on) this.syncClock(true);
  }

  /** Use a place's time zone (minutes east of UTC) for the real-time clock; null = this device's zone. */
  setClockOffset(minutes: number | null) {
    this.clockOffset = minutes;
    if (this.followRealTime) this.syncClock(true);
  }

  /** The place's real sunrise and sunset (local hours); the sky maps them onto its 6:00 / 18:00 look. */
  setSolarDay(sunrise: number, sunset: number) {
    if (sunset - sunrise > 4 && sunset - sunrise < 20) { this.sunrise = sunrise; this.sunset = sunset; }
  }
  resetSolarDay() { this.sunrise = 6; this.sunset = 18; }

  /** Pick a named weather. */
  setWeather(kind: WeatherKind) {
    this.weather = kind;
    Object.assign(this.target, WEATHER_PRESETS[kind]);
  }

  /** Set exact weather parameters (live weather); `kind` is what the label shows. */
  setWeatherParams(p: Partial<WeatherParams>, kind: WeatherKind) {
    this.weather = kind;
    Object.assign(this.target, WEATHER_PRESETS[kind], p);
  }

  /** Jump straight to the target weather and time (no easing) — for the first frame. */
  settle() {
    const D = this.drivers;
    for (const key of PARAM_KEYS) D[key] = this.target[key];
    D.wet = Math.max(D.rain > 0.05 ? 0.6 + 0.4 * D.rain : 0, D.cloud > 0.8 ? 0.1 : 0, D.snow * 0.15, D.fog * 0.2);
    D.snowCover = D.snow > 0.1 && D.temperature < 3 ? 1 : 0;
    if (this.hourT < 1) { this.hourT = 1; D.hour = ((this.hourTo % 24) + 24) % 24; }
    this.update(0);
  }

  get isAnimating() {
    const D = this.drivers;
    return this.hourT < 1 || PARAM_KEYS.some((k) => k !== 'temperature' && Math.abs(D[k] - this.target[k]) > 0.01);
  }

  private nowHour() {
    const now = new Date();
    if (this.clockOffset === null) return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const utc = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    return (((utc + this.clockOffset / 60) % 24) + 24) % 24;
  }
  private syncClock(animate: boolean) {
    const h = this.nowHour();
    if (animate) this.setTime(h, { manual: false });
    else { this.hourFrom = this.hourTo = h; this.hourT = 1; this.drivers.hour = h; }
  }

  /** Map a clock hour onto the sky's day: sunrise → 6, sunset → 18, night stretched to fit. */
  private toSolar(h: number) {
    const { sunrise: r, sunset: s } = this;
    if (h >= r && h <= s) return 6 + ((h - r) / (s - r)) * 12;
    const night = 24 - (s - r);
    const since = h > s ? h - s : h + 24 - s;
    return (18 + (since / night) * 12) % 24;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, reducedMotion = false) {
    const D = this.drivers;
    this.time += dt;
    if (this.followRealTime && this.hourT >= 1) {
      this.clockCheck -= dt;
      if (this.clockCheck <= 0) { this.clockCheck = 1; this.syncClock(false); }
    }
    if (this.hourT < 1) {
      this.hourT = Math.min(1, this.hourT + dt / (reducedMotion ? 0.5 : this.hourDuration));
      const e = this.hourT < 0.5 ? 2 * this.hourT * this.hourT : 1 - Math.pow(-2 * this.hourT + 2, 2) / 2;
      D.hour = ((lerp(this.hourFrom, this.hourTo, e) % 24) + 24) % 24;
    }
    D.solarHour = this.toSolar(D.hour);
    const h = D.solarHour;
    D.sunElevation = Math.sin((Math.PI * (h - 6)) / 12);
    D.daylight = smoothstep(-0.12, 0.25, D.sunElevation);
    D.golden = smoothstep(-0.12, 0.04, D.sunElevation) * (1 - smoothstep(0.12, 0.4, D.sunElevation));

    // weather, eased toward the target
    const k = reducedMotion ? 1 : Math.min(1, dt / 2.2);
    for (const key of PARAM_KEYS) D[key] += (this.target[key] - D[key]) * k;

    // the ground soaks quickly and dries slowly; snow settles while it's cold and melts afterwards
    const wantWet = Math.max(D.rain > 0.05 ? 0.6 + 0.4 * D.rain : 0, D.cloud > 0.8 ? 0.1 : 0, D.snow * 0.15, D.fog * 0.2);
    const wetRate = wantWet > D.wet ? dt / 3.5 : dt / 25;
    D.wet = clamp01(D.wet + (wantWet - D.wet) * Math.min(1, reducedMotion ? 1 : wetRate));
    if (D.snow > 0.1 && D.temperature < 3) D.snowCover = Math.min(1, D.snowCover + (reducedMotion ? 1 : (dt * D.snow) / 25));
    else D.snowCover = Math.max(0, D.snowCover - (reducedMotion ? 1 : dt / (D.temperature > 3 ? 30 : 90)));

    // lightning: occasional strikes, each a few quick pulses
    if (D.thunder > 0.2 && dt > 0) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = (5 + Math.random() * 12) / D.thunder;
        const distance = Math.random();
        const pulses = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pulses; i++) this.flashes.push({ at: this.time + i * (0.08 + Math.random() * 0.12), power: (1 - distance * 0.6) * (i === 0 ? 1 : 0.6) });
        for (const fn of this.strikeFns) fn(distance);
      }
    }
    this.flashes = this.flashes.filter((f) => this.time - f.at < 0.25);
    D.flash = this.flashes.reduce((m, f) => (this.time >= f.at ? Math.max(m, f.power * (1 - (this.time - f.at) / 0.25)) : m), 0);

    // look = clear sky for this hour, then cloud, rain, storm, snow and fog layered on
    const day = D.daylight, L = this.look;
    clearLookAt(h, L);
    const layer = (night: string, dayLook: string, w: number) => {
      if (w <= 0.001) return;
      lerpLook(this.tmp, LOOKS[night], LOOKS[dayLook], day);
      lerpLook(L, L, this.tmp, Math.min(1, w));
    };
    layer('cloudyNight', 'cloudyDay', smoothstep(0.3, 1, D.cloud) * 0.92);
    layer('rainNight', 'rainDay', smoothstep(0, 0.8, D.rain));
    layer('stormNight', 'stormDay', D.thunder);
    layer('snowNight', 'snowDay', smoothstep(0, 0.6, D.snow));
    layer('fogNight', 'fogDay', D.fog);

    // sun by day, moon by night (they swap while both are dim)
    if (D.sunElevation > -0.08) {
      const th = (Math.PI * (h - 6)) / 12;
      this.sunPosition.set(Math.cos(th) * 44, Math.max(5, Math.sin(th) * 46), 24);
    } else {
      this.sunPosition.set(-20, 40, -15);
    }

    for (const [name, fn] of this.channelFns) this.channels[name] = fn(D);
    for (const fn of this.listeners) fn(this);
  }
}

export function formatHour(h: number) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
