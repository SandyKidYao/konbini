// Runtime regression for the aircraft service, persistent wake and plan feed.
// Run with `npm run check:aircraft`; it owns a Vite dev server on port 5182.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const disabled = ['clerk', 'customer', 'staff-break', 'banners', 'passersby', 'tourists', 'traffic', 'parking', 'delivery']
  .map((name) => `konbini.events.${name}`).concat('konbini.world.railway');
const problems = [];
let server, browser;
try {
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5182, strictPort: true, open: false } });
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
  await page.goto(`http://127.0.0.1:5182/?weather=clear&time=1430&date=2026-10-14&disable=${disabled.join(',')}`);
  await page.waitForSelector('#veil.done', { timeout: 180000 });
  await page.evaluate(() => {
    const app = window.konbini;
    const failed = app.loaded.filter((m) => m.error);
    if (failed.length) throw new Error(JSON.stringify(failed));
    const service = app.services.get('events.aircraft');
    const mod = app.stage.world.getObjectByName('konbini.events.aircraft');
    const plane = mod?.getObjectByName('aircraft'), trail = mod?.getObjectByName('contrails');
    if (!service || !plane || !trail) throw new Error('Aircraft service or scene objects missing');
    // Stop wall-clock simulation; the real app simulation remains available for deterministic stepping.
    const simulate = app.simulate.bind(app);
    app.simulate = () => {};
    const step = (seconds, dt = 0.25) => {
      for (let remaining = seconds; remaining > 1e-7; remaining -= dt) simulate(Math.min(dt, remaining));
    };
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const moving = () => [...app.plan.moving()].filter((m) => m.kind === 'aircraft' || m.kind === 'contrail');
    const sky = (weather = 'clear', hour = 14.5) => {
      app.atmosphere.setTime(hour, { instant: true });
      app.atmosphere.setWeather(weather);
      app.atmosphere.settle();
    };
    const empty = () => {
      check(!service.flying && !service.lingering, 'Aircraft event did not finish');
      check(!plane.visible && !trail.visible, 'Finished aircraft or wake remained visible');
      check(moving().length === 0, 'Finished aircraft or wake remained on the map');
    };
    const unpickable = (phase, transparentWake = false) => {
      const ray = new app.interact.ray.constructor();
      ray.far = 10;
      mod.updateWorldMatrix(true, true);
      const meshes = [];
      mod.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const mesh of meshes) {
        const geometry = mesh.geometry, position = geometry.attributes.position, color = geometry.attributes.color;
        const index = geometry.index, count = index?.count ?? position.count;
        let target = null;
        for (let i = 0; i < count; i += 3) {
          const vertices = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
          if (mesh === trail) {
            const alpha = vertices.map((j) => color.getW(j));
            if (transparentWake ? alpha.some((a) => a !== 0) : alpha.every((a) => a < 0.1)) continue;
          }
          const [a, b, c] = vertices.map((j) => mesh.position.clone().fromBufferAttribute(position, j).applyMatrix4(mesh.matrixWorld));
          const normal = b.clone().sub(a).cross(c.clone().sub(a));
          if (normal.lengthSq() < 1e-12) continue;
          normal.normalize();
          target = { center: a.add(b).add(c).multiplyScalar(1 / 3), normal };
          break;
        }
        check(target, `${phase}: no nondegenerate ${mesh.name || mesh.type} triangle to test`);
        // Dynamic wake positions outgrow the initial bound. Recompute it so the positive control truly
        // intersects current geometry, rather than accidentally passing because of a stale bounding sphere.
        geometry.computeBoundingSphere();
        ray.set(target.center.clone().addScaledVector(target.normal, 5), target.normal.clone().negate());
        const control = [];
        mesh.constructor.prototype.raycast.call(mesh, ray, control);
        check(control.length > 0, `${phase}: control ray missed ${mesh.name || mesh.type}`);
        check(ray.intersectObject(mod, true).length === 0, `${phase}: decorative aircraft or wake intercepted picking`);
      }
      return meshes.length;
    };
    window.aircraftCheck = { app, service, mod, plane, trail, step, check, moving, sky, empty, unpickable };
  });

  const automatic = await page.evaluate(() => {
    const { app, service, step, check } = window.aircraftCheck;
    const starts = [];
    let wasFlying = false;
    while (starts.length < 4 && app.elapsed < 1800) {
      step(0.25);
      if (service.flying && !wasFlying) starts.push(app.elapsed);
      wasFlying = service.flying;
    }
    check(starts.length === 4, `Expected four automatic flights, saw ${starts.length}`);
    const intervals = starts.map((t, i) => i ? t - starts[i - 1] : t);
    intervals.forEach((n) => check(n >= 240 && n <= 420.3, `Automatic flight interval outside 240–420 seconds: ${n}`));
    step(98.25);
    window.aircraftCheck.empty();
    return intervals.map((n) => Number(n.toFixed(2)));
  });
  console.log(`✓ Automatic first flight and three later intervals: ${automatic.join(', ')} seconds`);

  for (const direction of [1, -1]) {
    const result = await page.evaluate((direction) => {
      const { service, plane, trail, step, check, moving, empty, unpickable } = window.aircraftCheck;
      check(service.send(direction), 'Daytime manual flight rejected');
      check(!service.send(-direction), 'A second flight started during an active flight');
      step(4);
      const startX = plane.position.x;
      const firstWidth = moving().find((m) => m.kind === 'contrail')?.width;
      step(16);
      check((plane.position.x - startX) * direction > 0, 'Plane flew in the wrong direction');
      const mapPlane = moving().filter((m) => m.kind === 'aircraft');
      check(mapPlane.length === 1 && plane.visible, 'Visible plane missing from the map');
      check(Math.abs(mapPlane[0].x - plane.position.x) < 1e-8 && Math.abs(mapPlane[0].z - plane.position.z) < 1e-8,
        'Map aircraft position diverged from the model');
      check(Math.sin(mapPlane[0].heading) * direction > 0, 'Map aircraft heading diverged from the flight');
      let pickRays = unpickable('Flying at 20 seconds');
      step(18.25);
      check(!service.flying && service.lingering && !plane.visible && trail.visible, 'Flight did not become a lingering wake at 38 seconds');
      check(moving().every((m) => m.kind === 'contrail') && moving().length > 0, 'Map did not retain only the wake after the flight');
      check(!service.send(), 'A second plane started before the previous wake dispersed');
      step(16.75);
      const wake = moving();
      check(trail.visible && wake.length > 0, 'Wake disappeared too early at 55 seconds');
      check(wake.some((m) => m.width > firstWidth), 'Wake did not spread as it aged');
      for (const value of trail.geometry.attributes.position.array) check(Number.isFinite(value), 'Non-finite trail vertex');
      step(15);
      check(service.lingering && !plane.visible, 'Expected an aged wake with a hidden plane at 70 seconds');
      pickRays += unpickable('Transparent old wake at 70 seconds', true);
      step(28.25);
      empty();
      pickRays += unpickable('Finished event at 98 seconds', true);
      return { direction, wakeSegmentsAt55: wake.length, pickRays };
    }, direction);
    console.log(`✓ Direction ${direction}: model/map sync, 38-second flight, lingering wake (${result.wakeSegmentsAt55} segments at 55s), complete at 98s`);
    console.log(`✓ Direction ${direction}: ${result.pickRays} positive-control rays through flying, transparent aged and finished geometry produce no live picking hits`);
  }

  const restrictions = await page.evaluate(() => {
    const { service, step, check, sky, empty } = window.aircraftCheck;
    const cases = [['storm', 14.5], ['snow', 14.5], ['fog', 14.5], ['rain', 14.5], ['cloudy', 14.5], ['clear', 23]];
    for (const [weather, hour] of cases) {
      sky(weather, hour);
      check(!service.send(), `Aircraft started during ${weather} at ${hour}`);
      // Pass the entire scheduling window: automatic sends must obey the same restrictions.
      for (let i = 0; i < 440; i++) {
        step(1);
        check(!service.flying && !service.lingering, `Automatic flight started during ${weather} at ${hour}`);
      }
      empty();
    }
    sky();
    let wait = 0;
    while (!service.flying && wait < 20.5) { step(0.25); wait += 0.25; }
    check(service.flying, 'Automatic scheduling did not recover after the weather cleared');
    step(98.25);
    empty();
    return { cases: cases.length, recoveredAfter: wait };
  });
  console.log(`✓ ${restrictions.cases} weather/night restrictions; scheduling recovered ${restrictions.recoveredAfter}s after clear weather returned`);

  await page.evaluate(() => {
    const { service, plane, trail, step, check, moving, sky, empty } = window.aircraftCheck;
    for (const [weather, hour] of [['storm', 14.5], ['clear', 23]]) {
      sky();
      check(service.send(), 'Could not start weather-change test flight');
      step(10);
      sky(weather, hour);
      step(1);
      check(!plane.visible && !trail.visible && moving().length === 0, 'Bad visibility did not hide plane and wake together');
      step(88);
      empty();
      sky();
      check(service.send(), 'Weather change left the flight permanently busy');
      step(99);
      empty();
    }
  });
  console.log('✓ Mid-flight storm and night hide the model/map together, expire normally, and allow future flights');

  const resources = await page.evaluate(() => {
    const { app, service, mod, trail, step, check, sky, empty } = window.aircraftCheck;
    sky();
    const inventory = (root) => {
      const objects = [], geometries = new Set(), materials = new Set();
      root.traverse((o) => {
        objects.push(o);
        if (o.geometry) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m);
      });
      return { objects, geometries: [...geometries], materials: [...materials] };
    };
    const baseline = inventory(mod), wholeScene = inventory(app.stage.scene);
    const positions = trail.geometry.attributes.position.array, colors = trail.geometry.attributes.color.array;
    for (let cycle = 0; cycle < 12; cycle++) {
      check(service.send(cycle % 2 ? -1 : 1), `Repeated flight ${cycle} could not start`);
      step(99);
      empty();
      for (const [name, current, expected] of [['aircraft', inventory(mod), baseline], ['scene', inventory(app.stage.scene), wholeScene]]) {
        for (const key of ['objects', 'geometries', 'materials']) {
          check(current[key].length === expected[key].length && current[key].every((o, i) => o === expected[key][i]),
            `${name} ${key} changed after flight ${cycle}`);
        }
      }
      check(trail.geometry.attributes.position.array === positions && trail.geometry.attributes.color.array === colors,
        'Wake buffers were reallocated');
    }
    return { cycles: 12, sceneNodes: wholeScene.objects.length, aircraftNodes: baseline.objects.length,
      aircraftGeometries: baseline.geometries.length, aircraftMaterials: baseline.materials.length, wakeVertices: positions.length / 3 };
  });
  console.log(`✓ ${resources.cycles} repeat flights: ${resources.sceneNodes} scene nodes, ${resources.aircraftNodes} aircraft nodes, `
    + `${resources.aircraftGeometries} geometries, ${resources.aircraftMaterials} materials and ${resources.wakeVertices} wake vertices retain the same references`);
  assert.deepEqual(problems, [], 'Browser runtime errors');
  console.log('Aircraft checks passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
