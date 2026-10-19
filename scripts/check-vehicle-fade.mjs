// Regression for vehicles stopped in the entry fade, with real road gates and clipped prefab bodies.
// Run `node scripts/check-vehicle-fade.mjs`; `--before` records the original red-light failure only.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const before = process.argv.includes('--before');
const disabled = ['clerk', 'customer', 'staff-break', 'banners', 'passersby', 'tourists', 'traffic', 'parking', 'delivery', 'aircraft']
  .map((name) => `konbini.events.${name}`).concat('konbini.world.railway');
const problems = [];
let server, browser;
try {
  await mkdir(`${root}tmp`, { recursive: true });
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5183, strictPort: true, open: false } });
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
  await page.goto(`http://127.0.0.1:5183/?weather=clear&time=1600&date=2026-10-14&cam=36,7,26,23.5,0.8,15,30&disable=${disabled.join(',')}`);
  await page.waitForSelector('#veil.done', { timeout: 180000 });
  await page.evaluate(async () => {
    const app = window.konbini;
    const failed = app.loaded.filter((m) => m.error);
    if (failed.length) throw new Error(JSON.stringify(failed));
    const V = await import('/src/engine/agents/vehicle.ts');
    const roads = app.services.get('world.roads'), traffic = roads.traffic, signals = app.services.get('world.signals');
    const simulate = app.simulate.bind(app);
    app.simulate = () => {};
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const step = (seconds, inspect = () => {}) => {
      for (let left = seconds; left > 1e-8; left -= 0.05) {
        simulate(Math.min(left, 0.05));
        inspect();
      }
    };
    const signal = (color) => {
      signals.vehicle = () => color;
      signals.side = () => 'r';
      signals.ped = () => 'r';
    };
    const clear = () => {
      for (const v of [...traffic.vehicles]) v.dispose();
      step(0.05);
    };
    const body = (kind = 'car') => app.prefabs.create(kind, kind === 'car'
      ? { color: '#c3c8cd', len: 4, width: 1.66, bodyH: 0.68, cabinLen: 2.3, cabinH: 0.62, cabinX: -0.45, clip: roads.clip }
      : { clip: roads.clip });
    const spawn = (from, to, kind = 'car') => roads.spawn(body(kind), from).then(roads.through(from, to));
    const clearance = (v) => {
      const b = traffic.env.bounds, p = v.pose, fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      let distance = Infinity;
      for (const a of [-1, 1]) for (const side of [-1, 1]) {
        const x = p.x + fx * v.half * a + fz * v.halfWidth * side;
        const z = p.z + fz * v.half * a - fx * v.halfWidth * side;
        distance = Math.min(distance, x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
      }
      return distance;
    };
    const stopped = (v) => {
      let settled = 0;
      for (let elapsed = 0; elapsed < 30 && settled < 6; elapsed += 0.05) {
        step(0.05);
        settled = v.s > 0 && v.v < 1e-6 ? settled + 0.05 : 0;
      }
      check(!v.done && settled >= 6, 'Vehicle did not remain stopped for six seconds');
    };
    const opaque = (v, label) => {
      check(clearance(v) > 0.2, `${label}: test vehicle was not wholly inside`);
      check(Math.abs(v.presence - 1) < 1e-8, `${label}: stopped entry presence ${v.presence}`);
    };
    const exit = (v, direction, label) => {
      let fading = 0, hidden = 0, full = 0;
      let previousX = v.pose.x;
      step(45, () => {
        if (v.done) return;
        const distance = clearance(v);
        const moved = v.pose.x - previousX;
        previousX = v.pose.x;
        if (distance <= 0.1) check(v.presence === 0, `${label}: visible cut body at clipping plane (${v.presence})`);
        if (v.presence === 1) full++;
        // Same-edge turns pass through this band twice: count only their outward journey.
        if (v.pose.x * direction < 20 || moved * direction <= 1e-8) return;
        if (v.presence > 0 && v.presence < 1) fading++;
        if (distance <= 0) {
          check(v.presence === 0, `${label}: visible cut body beyond boundary (${v.presence})`);
          hidden++;
        }
      });
      check(v.done && fading > 0 && hidden > 0, `${label}: missing exit fade, hide or disposal (${fading}, ${hidden}, ${v.done})`);
      return { fading, hidden, full };
    };
    // The map draws each vehicle at the same visibility as its model.
    const mapped = (v) => {
      const ms = [...app.plan.moving()].filter((m) => m.kind === 'vehicle' && m.x === v.pose.x && m.z === v.pose.z);
      check(ms.length === 1, `Expected one map vehicle at the model's position, saw ${ms.length}`);
      return ms[0].opacity;
    };
    // x out past the west (−1) or east (+1) edge where roads spawn and retire vehicles, or `by` metres from there
    const edge = (side, by = 0) => { const b = traffic.env.bounds; return side < 0 ? b.x0 - 6 - by : b.x1 + 6 + by; };
    window.vehicleFadeCheck = { app, V, roads, traffic, signal, clear, body, spawn, clearance, stopped, opaque, exit, step, check, mapped, edge };
  });

  const red = await page.evaluate(() => {
    const C = window.vehicleFadeCheck;
    C.signal('r');
    const v = C.spawn('east', 'west');
    C.stopped(v);
    window.vehicleFadeCheck.redCar = v;
    return { x: v.pose.x, speed: v.v, presence: v.presence, map: C.mapped(v), clearance: C.clearance(v) };
  });
  const screenshot = `${root}tmp/vehicle-fade-${before ? 'before' : 'after'}.png`;
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshot });
  console.log(`${before ? 'Baseline' : 'Red-light entry'}: ${JSON.stringify(red)}; ${screenshot}`);
  if (before) {
    assert.ok(Math.abs(red.presence - 0.5) < 1e-8, 'Baseline no longer reproduces the half-transparent hatch');
  } else {
    assert.equal(red.presence, 1, 'Hatch remains transparent after waiting at the red light');
    assert.equal(red.map, 1, 'Map vehicle remains transparent after waiting at the red light');
    const outbound = await page.evaluate(() => {
      const C = window.vehicleFadeCheck;
      C.signal('g');
      return C.exit(C.redCar, -1, 'Green-light west exit');
    });
    console.log(`✓ Red-light hatch fully appears while stopped; green-light west exit: ${JSON.stringify(outbound)}`);

    const queue = await page.evaluate(() => {
      const C = window.vehicleFadeCheck;
      C.clear(); C.signal('g');
      const p = C.V.path(18, 15.1, -Math.PI / 2).line(-43, 15.1).build();
      const leader = C.traffic.spawn(C.body(), { at: p.start }).then(C.V.drive(p, { through: true, gates: [{ at: 0, open: () => false, commit: false }] }));
      const v = C.spawn('east', 'west');
      C.stopped(v);
      C.check(v.blocker === leader, 'Queue follower did not stop behind the lead car');
      C.opaque(v, 'Queue follower');
      return { x: v.pose.x, presence: v.presence, clearance: C.clearance(v) };
    });
    console.log(`✓ Queue follower wholly inside also finishes appearing: ${JSON.stringify(queue)}`);

    const bus = await page.evaluate(() => {
      const C = window.vehicleFadeCheck;
      C.clear(); C.signal('r');
      const v = C.spawn('east', 'west', 'bus');
      C.stopped(v);
      C.check(C.clearance(v) < 0, 'Bus no longer reaches across the east edge at its stop');
      C.check(v.presence === 0, 'Bus with its tail beyond the edge became visible');
      C.check(C.mapped(v) === 0, 'Map shows a bus that is hidden on the model');
      C.signal('g');
      const result = C.exit(v, -1, 'Bus west exit');
      C.check(result.full > 0, 'Bus did not become fully visible after entering');
      return result;
    });
    console.log(`✓ Bus tail outside stays hidden, then enters and exits normally: ${JSON.stringify(bus)}`);

    for (const side of [-1, 1]) {
      const result = await page.evaluate((side) => {
        const C = window.vehicleFadeCheck;
        C.clear(); C.signal('g');
        const start = C.edge(side), end = C.edge(-side), heading = -side * Math.PI / 2;
        const p = C.V.path(start, 15.1, heading).line(end, 15.1).build();
        const stopX = C.edge(side, -9.5);
        let blocked = true;
        const v = C.traffic.spawn(C.body(), { at: p.start }).then(C.V.drive(p, {
          reverse: true, through: true, speed: 5,
          gates: [{ at: p.project(stopX, 15.1).s + 2.3, open: () => !blocked, commit: false }],
        }));
        C.stopped(v);
        C.opaque(v, `Reverse entry from ${side}`);
        C.check(Math.sin(v.pose.heading) * side > 0.99, 'Reverse body did not face away from travel');
        blocked = false;
        return C.exit(v, -side, `Reverse exit toward ${-side}`);
      }, side);
      console.log(`✓ Reverse entry and exit from ${side < 0 ? 'west' : 'east'}: ${JSON.stringify(result)}`);
    }

    const parkedReverse = await page.evaluate(() => {
      const C = window.vehicleFadeCheck;
      C.clear();
      const p = C.V.path(C.edge(1), 15.1, -Math.PI / 2).line(C.edge(1, -9.5), 15.1).build();
      const v = C.traffic.spawn(C.body(), { at: p.start }).then(C.V.drive(p, { reverse: true, speed: 4 }), C.V.wait(20));
      C.stopped(v);
      C.check(v.leg === null, 'Reverse arrival did not advance to its wait step');
      C.opaque(v, 'Reverse arrival waiting after its drive');
      return { x: v.pose.x, presence: v.presence };
    });
    console.log(`✓ Reverse entry retains opacity after its drive ends: ${JSON.stringify(parkedReverse)}`);

    for (const side of [-1, 1]) {
      const result = await page.evaluate((side) => {
        const C = window.vehicleFadeCheck;
        C.clear(); C.signal('g');
        const p = C.V.path(C.edge(side), 15.1, -side * Math.PI / 2).line(side * 19, 15.1)
          .curve(side * 19, 11.9, side * Math.PI / 2, 1.1).line(C.edge(side), 11.9).build();
        const v = C.traffic.spawn(C.body(), { at: p.start }).then(C.V.drive(p, { through: true, speed: 4 }));
        return C.exit(v, side, `Same-edge turn ${side}`);
      }, side);
      console.log(`✓ Same-edge U-turn preserves exit fade at ${side < 0 ? 'west' : 'east'} edge: ${JSON.stringify(result)}`);
    }
  }
  assert.deepEqual(problems, [], 'Browser runtime errors');
  console.log(before ? 'Original red-light fade bug reproduced' : 'Vehicle fade checks passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
