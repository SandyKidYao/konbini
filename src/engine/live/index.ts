// Live mode: the scene follows the real time and weather of a place (the viewer's own, by default).
// Locates once, fetches the weather every 10 minutes, caches the last result so the next visit opens fast.
import type { Atmosphere } from '../atmosphere';
import { locate, type Place } from './location';
import { openMeteo, type LiveReport, type WeatherProvider } from './openmeteo';

export type { Place } from './location';
export type { LiveReport, WeatherProvider } from './openmeteo';

export type LiveState = 'off' | 'locating' | 'fetching' | 'live' | 'error';
export interface LiveStatus { state: LiveState; place?: Place; report?: LiveReport; message?: string }

const REFRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const CACHE_KEY = 'konbini.live.cache';
const PREF_KEY = 'konbini.live';

const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

export class LiveSync {
  status: LiveStatus = { state: 'off' };
  private listeners = new Set<(s: LiveStatus) => void>();
  private timer = 0;
  private run = 0;

  constructor(private atm: Atmosphere, private provider: WeatherProvider = openMeteo, private manualPlace?: Place) {}

  get active() { return this.status.state !== 'off'; }
  /** Did the viewer leave live mode on last time? */
  static get remembered() { return store.get<boolean>(PREF_KEY) === true; }

  onChange(fn: (s: LiveStatus) => void) { this.listeners.add(fn); fn(this.status); return () => this.listeners.delete(fn); }
  private set(s: LiveStatus) { this.status = s; for (const fn of this.listeners) fn(s); }

  async start() {
    const run = ++this.run;
    store.set(PREF_KEY, true);
    this.atm.setFollowRealTime(true);
    // show the cached weather right away while we refresh
    const cached = store.get<{ place: Place; report: LiveReport }>(CACHE_KEY);
    let place = this.manualPlace;
    if (cached && Date.now() - cached.report.fetchedAt < 6 * 3600 * 1000 && (!place || samePlace(place, cached.place))) {
      place = place ?? cached.place;
      this.apply(cached.report);
      this.set({ state: 'fetching', place, report: cached.report, message: '正在更新天气…' });
    }
    if (!place) {
      this.set({ state: 'locating', message: '正在定位…' });
      place = await locate();
      if (run !== this.run) return;
    }
    await this.refresh(place, run);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.refresh(place!, run), REFRESH_MS);
  }

  stop() {
    this.run++;
    clearInterval(this.timer);
    store.set(PREF_KEY, false);
    this.atm.setFollowRealTime(false);
    this.atm.setClockOffset(null);
    this.atm.resetSolarDay();
    this.set({ state: 'off' });
  }

  private async refresh(place: Place, run: number) {
    if (run !== this.run) return;
    this.set({ ...this.status, state: this.status.report ? 'live' : 'fetching', place, message: this.status.report ? undefined : '正在获取天气…' });
    try {
      const report = await this.provider.fetch(place);
      if (run !== this.run) return;
      this.apply(report);
      store.set(CACHE_KEY, { place, report });
      this.set({ state: 'live', place, report });
    } catch (e) {
      if (run !== this.run) return;
      console.warn('[konbini] live weather failed', e);
      const last = this.status.report;
      if (last) {
        const at = new Date(last.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        this.set({ ...this.status, state: 'live', place, message: `天气更新失败，显示的是 ${at} 的天气` });
      } else {
        // nothing to show yet: try again soon rather than at the next 10-minute refresh
        this.set({ ...this.status, state: 'error', place, message: '暂时获取不到天气，先只跟随当地时间，稍后自动重试' });
        setTimeout(() => { if (run === this.run && !this.status.report) void this.refresh(place, run); }, RETRY_MS);
      }
    }
  }

  private apply(r: LiveReport) {
    this.atm.setClockOffset(r.utcOffsetMinutes);
    this.atm.setFollowRealTime(true);
    this.atm.setSolarDay(r.sunrise, r.sunset);
    this.atm.setWeatherParams(r.params, r.kind);
  }
}

const samePlace = (a: Place, b: Place) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;
