// Headless screenshots of a set of scenes, as a quick regression check.
//
//   npm run shots                  # build first, then shoot every scene into tmp/shots/
//   npm run shots -- snow-night    # only scenes whose name contains one of the words
//   SHOTS_URL=http://localhost:5173/ npm run shots   # shoot a running dev server instead of dist/
//
// Uses the installed Google Chrome (playwright-core downloads no browser). Each scene waits for the stage
// to reveal, then for the weather to settle. Page errors and console errors fail the run (exit code 1).
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}tmp/shots`;

// the overview camera (the default view); close-ups pass their own ?cam or ?view
const SCENES = [
  { name: 'clear-day', q: 'weather=clear&time=1130' },
  { name: 'clear-dusk', q: 'weather=clear&time=1750' },
  { name: 'rain-night', q: 'weather=rain&time=2230&mods=mods/chochin.js' },
  { name: 'storm-night', q: 'weather=storm&time=2200' },
  { name: 'snow-day', q: 'weather=snow&time=1300' },
  { name: 'snow-night', q: 'weather=snow&time=2200' },
  { name: 'fog-day', q: 'weather=fog&time=1000' },
  { name: 'shop-night-close', q: 'weather=clear&time=2300&cam=14,7,13,1.5,0.8,-6.5' },
  { name: 'live-tokyo', q: 'live=1&place=35.68,139.69,東京', wait: 6000 },
  // no place given: geolocation is denied in headless Chrome, so this exercises the IP / time-zone fallback
  { name: 'live-fallback', q: 'live=1', wait: 15000 },
  // the built file opened with a double-click
  { name: 'live-file', q: 'live=1', file: true, wait: 15000 },
  // every outside request fails: the status line should say so, the scene should still run
  { name: 'live-offline', q: 'live=1&place=35.68,139.69,東京', offline: true, wait: 4000 },
  // seasons and festivals (the close-ups look at the shop door, where the decorations go)
  { name: 'spring-bloom', q: 'weather=clear&time=1100&date=2026-04-03' },
  { name: 'summer-festival', q: 'weather=clear&time=1930&date=2026-08-08&warp=40' },
  { name: 'autumn-leaves', q: 'weather=partly&time=1500&date=2026-11-12' },
  { name: 'winter-bare', q: 'weather=clear&time=1200&date=2026-01-21&warp=30' },
  { name: 'newyear-door', q: 'weather=clear&time=1000&date=2027-01-02&cam=10,5,7.5,1,0.8,-6' },
  { name: 'tanabata-door', q: 'weather=clear&time=1800&date=2026-07-05&cam=10,5,7.5,1,0.8,-6' },
  { name: 'halloween-door', q: 'weather=clear&time=2000&date=2026-10-25&cam=10,5,7.5,1,0.8,-6' },
  { name: 'xmas-door', q: 'weather=snow&time=1900&date=2026-12-22&cam=10,5,7.5,1,0.8,-6&warp=20' },
  { name: 'festival-street', q: 'weather=clear&time=1940&date=2026-08-08&warp=90&cam=-2,4,19,-2,0.9,9' },
  { name: 'winter-street', q: 'weather=cloudy&time=0800&date=2027-01-20&warp=90&cam=-2,4,19,-2,0.9,9' },
  { name: 'furin-summer', q: 'weather=partly&time=1400&season=summer&mods=mods/furin.js&cam=4,3.2,0,4,2.1,-4.5' },
  // stepping the date with ] at runtime: bare branches on 3-20, blossom five days later (snow cover re-bakes)
  { name: 'date-keys', q: 'weather=snow&time=1200&date=2026-03-20&cam=-9,7,14,-16,3,4', setup: `
    for (let i = 0; i < 5; i++) dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));` },
  // a line-up of figures in every outfit, on the sidewalk in front of the shop
  { name: 'outfits', q: 'weather=clear&time=1100&cam=-1,2.6,13.5,-1,1,8.8', setup: `
    const outfits = [{ yukata: '#2c3d66' }, { yukata: '#e9a0b8' }, { coat: '#c9b48a', scarf: true, hat: 'knit' }, { coat: '#3a4558' },
      { hat: 'straw', shortSleeve: true }, { hat: 'cap', shortSleeve: true }, { kind: 'staff', hat: 'santa' }, { kind: 'tourist' }];
    outfits.forEach((o, i) => {
      const f = konbini.prefabs.create('figure', o);
      f.root.position.set(-5.2 + i * 1.2, 0.15, 8.6);
      f.root.scale.setScalar(1);
      konbini.stage.world.add(f.root);
    });` },
  // every vehicle body, lined up on road A, lamps on (brake, indicators) to check them by eye
  { name: 'vehicles', q: 'weather=clear&time=1100&disable=konbini.events.traffic,konbini.events.parking&cam=-5,16,38,-5,0,12', setup: `
    const list = [['car', { color: '#f6e7c8', len: 3.4, width: 1.48, bodyH: 0.68, cabinLen: 2.55, cabinH: 0.86, cabinX: -0.3 }],
      ['car', { color: '#c3c8cd', len: 4.0, width: 1.66, bodyH: 0.68, cabinLen: 2.3, cabinH: 0.62, cabinX: -0.45 }],
      ['car', { color: '#2f3f63', len: 4.7, width: 1.74, bodyH: 0.72, cabinLen: 3.5, cabinH: 0.82, cabinX: -0.45 }],
      ['car', { color: '#f2c84b', belt: '#2a7a55', roofLamp: true }], ['car', { color: '#1c1d20', patrol: true, len: 4.6, width: 1.74, bodyH: 0.66, cabinLen: 2.3, cabinH: 0.58, cabinX: -0.3 }],
      ['truck', { type: 'kei', load: 'cabbage' }], ['truck', { type: 'box', stripe: '#2f6db5' }], ['bus', {}]];
    let x = -16, z = 12.2;
    for (const [k, o] of list) {
      const b = konbini.prefabs.create(k, o);
      if (k !== 'car' && z < 13) { x = -16; z = 15.6; }
      x += b.len / 2 + 0.8;
      b.root.position.set(x, 0, z);
      b.lamps({ head: 1, brake: true, reverse: false, blink: 'hazard', engine: true, flash: 0 }, 0);
      konbini.stage.world.add(b.root);
      x += b.len / 2 + 0.8;
    }` },
  // traffic by the clock: a weekday rush, a quiet weekend afternoon, late night (taxis), the lot close up
  { name: 'traffic-rush', q: 'weather=cloudy&time=0800&date=2026-10-14&warp=120' },
  { name: 'traffic-night', q: 'weather=clear&time=2330&date=2026-10-14&warp=120' },
  { name: 'traffic-rain-dusk', q: 'weather=rain&time=1820&date=2026-10-14&warp=120' },
  { name: 'lot-lunch', q: 'weather=clear&time=1215&date=2026-10-14&warp=150&cam=1,13,20,1,0,0' },
  // the shop front from above: the car park, the plaza and the lane people walk in by
  { name: 'front-plan', q: 'weather=clear&time=1200&date=2026-10-17&warp=60&cam=0,70,-4,0,0,-5' },
  { name: 'lot-delivery', q: 'weather=partly&time=1430&date=2026-10-14&warp=200&cam=1,13,20,1,0,0' },
  // the camera presets (the overview is the default view, shot above)
  { name: 'view-facade', q: 'weather=clear&time=1600&date=2026-10-14&warp=60&view=facade' },
  { name: 'view-bird', q: 'weather=clear&time=1600&date=2026-10-14&warp=60&view=bird' },
  { name: 'view-corner', q: 'weather=rain&time=1830&date=2026-10-14&warp=60&view=corner' },
  { name: 'view-yard', q: 'weather=clear&time=2100&date=2026-10-14&warp=60&view=yard' },
  // the controls, driven like a person would: they only come out once the pointer moves
  { name: 'ui-bar', q: 'weather=clear&time=1100&date=2026-10-13', wait: 600, act: async (p) => { await reveal(p); } },
  { name: 'ui-view-click', q: 'weather=clear&time=1100&date=2026-10-13', act: async (p) => { await openTray(p); await p.click('[data-view="facade"]'); } },
  { name: 'ui-tray', q: 'weather=clear&time=1100&date=2026-10-13', act: async (p) => { await reveal(p); await p.click('#trayBtn'); } },
  { name: 'ui-picker', q: 'weather=clear&time=1100&date=2026-10-13', act: async (p) => { await openTray(p); await p.click('#dateBtn'); } },
  { name: 'ui-picker-autumn', q: 'weather=clear&time=1100&date=2026-07-01', act: async (p) => {
    await openTray(p); await p.click('#dateBtn'); await p.click('[data-season="autumn"]'); } },
  { name: 'ui-picker-festival', q: 'weather=clear&time=1100', act: async (p) => {
    await openTray(p); await p.click('#dateBtn'); await p.click('[data-fest="natsumatsuri"]'); await p.waitForTimeout(3000); } },
  { name: 'ui-picker-day', q: 'weather=clear&time=1100&date=2026-12-01', act: async (p) => {
    await openTray(p); await p.click('#dateBtn'); await p.click('#calNext'); await p.click('[data-day="2"]'); } },
  // Escape closes the calendar, then the tray; resting the pointer fades the bar away again
  { name: 'ui-closed', q: 'weather=clear&time=1100&date=2026-12-01', wait: 4000, act: async (p) => {
    await openTray(p); await p.click('#dateBtn'); await p.click('[data-season="spring"]');
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); } },
  { name: 'ui-time-hover', q: 'weather=clear&time=1430', act: async (p) => { await openTray(p); await p.hover('#timeKnob', { force: true }); } },
  // resting on a glyph names it (and its key); at night the tip turns light on dark
  { name: 'ui-tip', q: 'weather=rain&time=1100', wait: 900, act: async (p) => { await openTray(p); await p.hover('[data-weather="rain"]'); } },
  { name: 'ui-tip-night', q: 'weather=clear&time=2200', wait: 900, act: async (p) => { await openTray(p); await p.hover('[data-view="bird"]'); } },
  // a short window: the calendar lies over the tray instead of above it
  { name: 'ui-picker-short', q: 'weather=clear&time=1100&date=2026-10-13', viewport: { width: 1280, height: 560 }, act: async (p) => {
    await openTray(p); await p.click('#dateBtn'); } },
  { name: 'ui-picker-narrow', q: 'weather=partly&time=0900', viewport: { width: 390, height: 844 }, act: async (p) => {
    await p.tap('#stage canvas', { position: { x: 195, y: 300 } }); await p.click('#trayBtn'); await p.click('#dateBtn'); }, touch: true },
  { name: 'narrow', q: 'weather=partly&time=0900', viewport: { width: 390, height: 844 } },
  // the map form: the street from straight above, the same cars and people, the light and weather of the moment
  { name: 'plan-day', q: 'view=plan&weather=clear&time=1130&date=2026-10-14&warp=90' },
  { name: 'plan-dusk', q: 'view=plan&weather=partly&time=1750&date=2026-10-14&warp=90' },
  { name: 'plan-rain-night', q: 'view=plan&weather=rain&time=2140&date=2026-10-14&warp=90' },
  { name: 'plan-snow', q: 'view=plan&weather=snow&time=1400&date=2027-01-20&warp=90', wait: 6000 },
  { name: 'plan-spring', q: 'view=plan&weather=clear&time=0930&date=2026-04-03&warp=90' },
  { name: 'plan-tray', q: 'view=plan&weather=clear&time=1600&date=2026-10-14&warp=60', act: async (p) => { await openTray(p); } },
  { name: 'plan-narrow', q: 'view=plan&weather=cloudy&time=0800&date=2026-10-14&warp=90', viewport: { width: 390, height: 844 } },
  // the desktop pet's page (no shell here): the settings button comes out over the model, and opens the same tray
  { name: 'pet-hover', q: 'pet=1&weather=clear&time=1600', viewport: { width: 560, height: 460 }, wait: 900, act: async (p) => {
    await p.mouse.move(270, 250); await p.mouse.move(280, 240); await p.waitForTimeout(400); } },
  { name: 'pet-tray', q: 'pet=1&weather=clear&time=1600', viewport: { width: 560, height: 460 }, act: async (p) => {
    await p.mouse.move(270, 250); await p.mouse.move(280, 240); await p.waitForTimeout(400); await p.click('#trayBtn'); } },
  { name: 'pet-picker', q: 'pet=1&weather=clear&time=1600', viewport: { width: 560, height: 460 }, act: async (p) => {
    await p.mouse.move(270, 250); await p.mouse.move(280, 240); await p.waitForTimeout(400); await p.click('#trayBtn'); await p.click('#dateBtn'); } },
  { name: 'pet-plan', q: 'pet=1&view=plan&size=medium&weather=clear&time=1900&date=2026-10-14&warp=90', viewport: { width: 380, height: 470 }, wait: 900, act: async (p) => {
    await p.mouse.move(190, 300); await p.mouse.move(195, 310); await p.waitForTimeout(400); } },
  { name: 'pet-plan-tray', q: 'pet=1&view=plan&size=small&weather=rain&time=1300&date=2026-10-14&warp=90', viewport: { width: 380, height: 470 }, act: async (p) => {
    await p.mouse.move(190, 330); await p.mouse.move(195, 340); await p.waitForTimeout(400); await p.click('#trayBtn'); } },
  { name: 'pet-picker-small', q: 'pet=1&weather=clear&time=2000', viewport: { width: 400, height: 330 }, act: async (p) => {
    await p.mouse.move(190, 200); await p.mouse.move(200, 190); await p.waitForTimeout(400); await p.click('#trayBtn'); await p.click('#dateBtn'); } },
];

// the controls stay hidden until the pointer moves over the page
const reveal = async (p) => { await p.mouse.move(400, 300); await p.mouse.move(420, 310); await p.waitForTimeout(400); };
const openTray = async (p) => { await reveal(p); await p.click('#trayBtn'); };

const only = process.argv.slice(2);
const scenes = only.length ? SCENES.filter((s) => only.some((w) => s.name.includes(w))) : SCENES;

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let server = null;
let base = process.env.SHOTS_URL;
if (!base) {
  if (!existsSync(`${root}dist/index.html`)) { console.error('dist/ is missing — run `npm run build` first'); process.exit(1); }
  server = await preview({ root, preview: { port: 4179, strictPort: false, open: false }, logLevel: 'silent' });
  base = server.resolvedUrls.local[0];
}
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  // SHOTS_GPU=0 falls back to software rendering (much slower, but works without a GPU)
  args: process.env.SHOTS_GPU === '0' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

let failed = 0;
for (const s of scenes) {
  // reduced motion: no turntable, weather and time jump straight to their targets
  const context = await browser.newContext({
    viewport: s.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    hasTouch: !!s.touch,
    locale: 'zh-CN',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`console: ${m.text()}`); });
  if (!s.offline) page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) problems.push(`http ${r.status()}: ${r.url()}`); });
  if (s.offline) await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort('internetdisconnected'));
  const t0 = Date.now();
  try {
    const url = s.file ? `file://${root}dist/index.html` : base;
    await page.goto(`${url}?${s.q}`, { waitUntil: 'commit' });
    await page.waitForSelector('#veil.done', { timeout: 180000 });
    if (s.setup) await page.evaluate(s.setup);
    if (s.act) await s.act(page);
    await page.waitForTimeout(s.wait ?? 2500);
    await page.screenshot({ path: `${out}/${s.name}.png` });
    const label = await page.evaluate(() => {
      const k = window.konbini, a = k.atmosphere, d = a.day, h = a.drivers.hour;
      const st = window.live.status;
      return `${d.month}/${d.date} ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} ${a.weather}`
        + (st.state !== 'off' ? ` live:${st.state}${st.place?.name ? ` ${st.place.name}` : ''}${st.message ? ` [${st.message}]` : ''}` : '')
        + (document.body.classList.contains('chrome-on') ? ' (controls shown)' : '');
    });
    const mods = await page.evaluate(() => window.konbini?.loaded.filter((m) => m.error).map((m) => `${m.id}: ${m.error}`) ?? []);
    problems.push(...mods.map((m) => `mod failed: ${m}`));
    console.log(`${problems.length ? '✗' : '✓'} ${s.name.padEnd(18)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);
  } catch (e) {
    problems.push(String(e));
    console.log(`✗ ${s.name.padEnd(18)} ${String(e).split('\n')[0]}`);
  }
  for (const p of problems) console.log(`    ${p}`);
  if (problems.length) failed++;
  await context.close();
}

await browser.close();
await server?.close();
console.log(`\n${scenes.length - failed}/${scenes.length} scenes ok → ${out}`);
process.exit(failed ? 1 : 0);
