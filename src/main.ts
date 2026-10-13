// Entry point. URL options:
//   ?live=1 (follow the real time and weather here)   ?place=lat,lon[,name] (a place for live mode)
//   ?weather=clear|partly|cloudy|fog|drizzle|rain|storm|snow   ?time=1130
//   ?date=2026-07-07 | 07-07   ?season=spring|summer|autumn|winter (a typical date in that season)
//   ?site=konbini   ?mods=url1,url2   ?disable=mod.id,…   ?cam=x,y,z,tx,ty,tz   ?warp=60
import './ui/style.css';
import { App } from './engine/app';
import { WEATHER_KINDS, type WeatherKind } from './engine/atmosphere';
import { SEASONS, SEASON_SAMPLE, parseDate, type Season } from './engine/calendar';
import { LiveSync, type Place } from './engine/live';
import { builtinMods } from './content';
import { initHud, revealStage } from './ui/hud';

const q = new URLSearchParams(location.search);
const list = (k: string) => (q.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// external mods: same-origin relative paths only, unless remote loading is asked for explicitly
const external = list('mods').filter((u) => !/^[a-z]+:\/\//i.test(u) || q.has('allowRemoteMods'));

let camera = { position: [50, 33, 62] as [number, number, number], target: [0, -1.6, 0] as [number, number, number] };
const cam = q.get('cam')?.split(',').map(Number);
if (cam?.length === 6 && cam.every(Number.isFinite)) camera = { position: [cam[0], cam[1], cam[2]], target: [cam[3], cam[4], cam[5]] };

const app = new App({
  container: document.getElementById('stage')!,
  site: q.get('site') ?? 'konbini',
  bounds: { x0: -28, x1: 28, z0: -24, z1: 24 },
  camera,
  mods: builtinMods,
  external,
  disabled: list('disable'),
});

// a fixed place for live mode, e.g. ?place=35.68,139.69,東京
let manualPlace: Place | undefined;
const pq = q.get('place')?.split(',');
if (pq && pq.length >= 2 && pq.slice(0, 2).every((v) => Number.isFinite(Number(v)))) {
  manualPlace = { lat: Number(pq[0]), lon: Number(pq[1]), name: pq[2], approx: false, source: 'manual' };
}
const live = new LiveSync(app.atmosphere, undefined, manualPlace);

const weather = q.get('weather') as WeatherKind | null;
if (weather && WEATHER_KINDS.includes(weather)) app.atmosphere.setWeather(weather);
const time = q.get('time');
if (time && /^\d{3,4}$/.test(time)) app.atmosphere.setTime(Number(time.slice(0, -2)) + Number(time.slice(-2)) / 60, { instant: true });
const date = q.get('date') ? parseDate(q.get('date')!) : null;
const season = q.get('season') as Season | null;
if (date) app.atmosphere.setDate(date[1], date[2], date[0] ?? undefined);
else if (season && SEASONS.includes(season)) app.atmosphere.setDate(...SEASON_SAMPLE[season]);
const manual = !!(weather || time || date || season);
const wantLive = q.get('live') === '1' || (q.get('live') !== '0' && !manual && LiveSync.remembered);
if (wantLive) void live.start();   // applies cached weather synchronously, refreshes in the background
app.atmosphere.settle();

initHud(app, live);

await app.load();
app.warp(Number(q.get('warp')) || 0);
app.interact.attach(document.getElementById('tip')!);
app.start(revealStage);

// handy for tinkering from the console
Object.assign(window, { konbini: app, live });
