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

// the overview camera; close-ups pass their own ?cam
const SCENES = [
  { name: 'clear-day', q: 'weather=clear&time=1130' },
  { name: 'clear-dusk', q: 'weather=clear&time=1750' },
  { name: 'rain-night', q: 'weather=rain&time=2230&mods=mods/chochin.js' },
  { name: 'storm-night', q: 'weather=storm&time=2200' },
  { name: 'snow-day', q: 'weather=snow&time=1300' },
  { name: 'snow-night', q: 'weather=snow&time=2200' },
  { name: 'fog-day', q: 'weather=fog&time=1000' },
  { name: 'shop-night-close', q: 'weather=clear&time=2300&cam=14,7,17,1.5,0.8,-2' },
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
  { name: 'newyear-door', q: 'weather=clear&time=1000&date=2027-01-02&cam=10,5,12,1,0.8,-1.5' },
  { name: 'tanabata-door', q: 'weather=clear&time=1800&date=2026-07-05&cam=10,5,12,1,0.8,-1.5' },
  { name: 'halloween-door', q: 'weather=clear&time=2000&date=2026-10-25&cam=10,5,12,1,0.8,-1.5' },
  { name: 'xmas-door', q: 'weather=snow&time=1900&date=2026-12-22&cam=10,5,12,1,0.8,-1.5&warp=20' },
  { name: 'festival-street', q: 'weather=clear&time=1940&date=2026-08-08&warp=90&cam=-2,4,19,-2,0.9,9' },
  { name: 'winter-street', q: 'weather=cloudy&time=0800&date=2027-01-20&warp=90&cam=-2,4,19,-2,0.9,9' },
  { name: 'furin-summer', q: 'weather=partly&time=1400&season=summer&mods=mods/furin.js&cam=4,3.2,4.5,4,2.1,0' },
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
  // the date picker, driven like a person would: open it, pick a season / festival / day
  { name: 'ui-picker', q: 'weather=clear&time=1100&date=2026-10-13', act: async (p) => { await p.click('#dateBtn'); } },
  { name: 'ui-picker-autumn', q: 'weather=clear&time=1100&date=2026-07-01', act: async (p) => {
    await p.click('#dateBtn'); await p.click('[data-season="autumn"]'); } },
  { name: 'ui-picker-festival', q: 'weather=clear&time=1100', act: async (p) => {
    await p.click('#labelDateRow'); await p.click('[data-fest="natsumatsuri"]'); await p.waitForTimeout(3000); } },
  { name: 'ui-picker-day', q: 'weather=clear&time=1100&date=2026-12-01', act: async (p) => {
    await p.click('#dateBtn'); await p.click('#calNext'); await p.click('[data-day="2"]'); } },
  { name: 'ui-picker-closed', q: 'weather=clear&time=1100&date=2026-12-01', act: async (p) => {
    await p.click('#dateBtn'); await p.click('[data-season="spring"]'); await p.keyboard.press('Escape'); } },
  { name: 'ui-time-hover', q: 'weather=clear&time=1430', act: async (p) => { await p.hover('#timeKnob', { force: true }); } },
  { name: 'ui-picker-narrow', q: 'weather=partly&time=0900', viewport: { width: 390, height: 844 }, act: async (p) => { await p.click('#dateBtn'); } },
  { name: 'narrow', q: 'weather=partly&time=0900', viewport: { width: 390, height: 844 } },
];

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
    const label = await page.evaluate(() => document.querySelector('.label dl').innerText.replace(/\s*\n\s*/g, ' ')
      + (document.getElementById('labelStatus').hidden ? '' : ` [${document.getElementById('labelStatus').textContent}]`));
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
