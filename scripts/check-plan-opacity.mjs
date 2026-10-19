// Regression for PlanMover.opacity on the map: a mod's vehicles and people are drawn at the visibility it reports.
// Run with `npm run check:plan-opacity`; it owns a Vite dev server on port 5184.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const disabled = ['clerk', 'customer', 'staff-break', 'banners', 'passersby', 'tourists', 'traffic', 'parking', 'delivery', 'aircraft']
  .map((name) => `konbini.events.${name}`).concat('konbini.world.railway');
const problems = [];
let server, browser;
try {
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5184, strictPort: true, open: false } });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: process.env.SHOTS_GPU === '0' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1,
    reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Tokyo' });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(m.text()); });
  await page.goto(`http://127.0.0.1:5184/?view=plan&weather=clear&time=1200&date=2026-10-14&disable=${disabled.join(',')}`);
  await page.waitForSelector('#veil.done', { timeout: 180000 });

  const counts = await page.evaluate(async () => {
    const app = window.konbini;
    const failed = app.loaded.filter((m) => m.error);
    if (failed.length) throw new Error(JSON.stringify(failed));
    const canvas = document.querySelector('.plan canvas');
    if (!canvas) throw new Error('Map canvas missing');
    const frames = (n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); });
    // The map draws each kind in one exact colour by day: count the pixels of it.
    const COLOURS = { person: [226, 46, 104], vehicle: [44, 56, 98] };
    const count = (kind) => {
      const [r, g, b] = COLOURS[kind], data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] === r && data[i + 1] === g && data[i + 2] === b && data[i + 3] === 255) n++;
      return n;
    };
    // On road A, clear of every roof, in open daylight.
    let shown = [];
    app.plan.for('check').movers(() => shown);
    const result = {};
    for (const kind of ['person', 'vehicle']) {
      const mover = { kind, x: 0, z: 15.1, heading: Math.PI / 2, len: 4.2, width: 1.7 };
      shown = [];
      await frames(3);
      const none = count(kind);
      shown = [{ ...mover, opacity: 1 }];
      await frames(3);
      const full = count(kind);
      shown = [{ ...mover, opacity: 0 }];
      await frames(3);
      const hidden = count(kind);
      shown = [{ ...mover }];
      await frames(3);
      const unset = count(kind);
      result[kind] = { none, full, hidden, unset };
    }
    return result;
  });
  for (const [kind, { none, full, hidden, unset }] of Object.entries(counts)) {
    assert.ok(full > none, `${kind}: an opaque ${kind} was not drawn (${none} → ${full} pixels)`);
    assert.equal(hidden, none, `${kind}: a ${kind} with opacity 0 is still drawn (${hidden} pixels, ${none} without it)`);
    assert.equal(unset, full, `${kind}: a ${kind} without opacity is not drawn fully (${unset} pixels, ${full} at opacity 1)`);
    console.log(`✓ Map ${kind}: ${full - none} pixels at opacity 1 or unset, none at opacity 0`);
  }
  assert.deepEqual(problems, [], 'Browser runtime errors');
  console.log('Plan opacity checks passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
