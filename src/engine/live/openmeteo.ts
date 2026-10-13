// Current weather from Open-Meteo (free, no key). WMO weather codes give the kind; the measurements
// (cloud cover, precipitation, snowfall, wind, visibility) refine the parameters.
import type { WeatherKind, WeatherParams } from '../atmosphere';
import type { Place } from './location';

export interface LiveReport {
  kind: WeatherKind;
  params: Partial<WeatherParams>;
  /** e.g. "小阵雨" */
  description: string;
  temperature: number;
  /** sunrise and sunset in the place's local hours */
  sunrise: number;
  sunset: number;
  /** the place's offset from UTC, minutes */
  utcOffsetMinutes: number;
  fetchedAt: number;
}

export interface WeatherProvider {
  id: string;
  fetch(place: Place): Promise<LiveReport>;
}

// code → [kind, description, base parameters]
const WMO: Record<number, [WeatherKind, string, Partial<WeatherParams>]> = {
  0: ['clear', '晴', { cloud: 0 }],
  1: ['clear', '大致晴朗', { cloud: 0.15 }],
  2: ['partly', '晴间多云', { cloud: 0.45 }],
  3: ['cloudy', '阴', { cloud: 0.95 }],
  45: ['fog', '雾', { fog: 0.9, cloud: 0.6 }],
  48: ['fog', '雾凇', { fog: 1, cloud: 0.7 }],
  51: ['drizzle', '小毛毛雨', { rain: 0.2 }],
  53: ['drizzle', '毛毛雨', { rain: 0.3 }],
  55: ['drizzle', '浓毛毛雨', { rain: 0.42, fog: 0.25 }],
  56: ['drizzle', '冻毛毛雨', { rain: 0.25 }],
  57: ['drizzle', '冻毛毛雨', { rain: 0.4 }],
  61: ['rain', '小雨', { rain: 0.5 }],
  63: ['rain', '中雨', { rain: 0.75 }],
  65: ['rain', '大雨', { rain: 1, wind: 0.5 }],
  66: ['rain', '冻雨', { rain: 0.5 }],
  67: ['rain', '冻雨', { rain: 0.85 }],
  71: ['snow', '小雪', { snow: 0.4 }],
  73: ['snow', '中雪', { snow: 0.7 }],
  75: ['snow', '大雪', { snow: 1, fog: 0.25 }],
  77: ['snow', '米雪', { snow: 0.3 }],
  80: ['rain', '小阵雨', { rain: 0.5, cloud: 0.85 }],
  81: ['rain', '阵雨', { rain: 0.75, cloud: 0.9 }],
  82: ['storm', '强阵雨', { rain: 1, thunder: 0.2, wind: 0.8 }],
  85: ['snow', '小阵雪', { snow: 0.55 }],
  86: ['snow', '阵雪', { snow: 0.9 }],
  95: ['storm', '雷阵雨', { rain: 0.85, thunder: 0.8 }],
  96: ['storm', '雷阵雨伴冰雹', { rain: 1, thunder: 1 }],
  99: ['storm', '强雷阵雨伴冰雹', { rain: 1, thunder: 1 }],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toHours = (iso: string) => { const t = iso.split('T')[1] ?? '06:00'; const [h, m] = t.split(':').map(Number); return h + m / 60; };

interface OpenMeteoResponse {
  utc_offset_seconds: number;
  current: {
    temperature_2m: number; weather_code: number; cloud_cover: number; precipitation: number;
    rain: number; showers: number; snowfall: number; wind_speed_10m: number; visibility?: number;
  };
  daily: { sunrise: string[]; sunset: string[] };
}

/** Turn a reading into weather parameters (exported for tests and other providers). */
export function interpretReading(c: OpenMeteoResponse['current']) {
  const [kind, description, base] = WMO[c.weather_code] ?? WMO[c.cloud_cover > 70 ? 3 : c.cloud_cover > 30 ? 2 : 0];
  const p: Partial<WeatherParams> = { ...base, temperature: c.temperature_2m };
  p.cloud = Math.max(base.cloud ?? 0, clamp01(c.cloud_cover / 100));
  p.wind = Math.max(base.wind ?? 0, clamp01(c.wind_speed_10m / 40));
  const rainMm = (c.rain ?? 0) + (c.showers ?? 0);
  if (rainMm > 0) p.rain = Math.max(p.rain ?? 0, clamp01(0.25 + rainMm / 6));
  if (c.snowfall > 0) p.snow = Math.max(p.snow ?? 0, clamp01(0.3 + c.snowfall / 2));
  if (c.visibility !== undefined) {
    if (c.visibility < 1000) p.fog = Math.max(p.fog ?? 0, clamp01(1 - c.visibility / 1500));
    else if (c.visibility < 5000) p.fog = Math.max(p.fog ?? 0, 0.2);
  }
  return { kind, description, params: p };
}

export const openMeteo: WeatherProvider = {
  id: 'open-meteo',
  async fetch(place) {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${place.lat.toFixed(3)}&longitude=${place.lon.toFixed(3)}`
      + '&current=temperature_2m,weather_code,cloud_cover,precipitation,rain,showers,snowfall,wind_speed_10m,visibility'
      + '&daily=sunrise,sunset&timezone=auto&forecast_days=1';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      const j = await r.json() as OpenMeteoResponse;
      const { kind, description, params } = interpretReading(j.current);
      return {
        kind, description, params,
        temperature: j.current.temperature_2m,
        sunrise: toHours(j.daily.sunrise[0]),
        sunset: toHours(j.daily.sunset[0]),
        utcOffsetMinutes: Math.round(j.utc_offset_seconds / 60),
        fetchedAt: Date.now(),
      };
    } finally { clearTimeout(timer); }
  },
};
