// An occasional small airliner above the block. Its two wakes stay where they were made, spreading and
// drifting after the aircraft has gone. One reusable model and two fixed buffers keep long sessions bounded.
import * as THREE from 'three';
import { defineMod, type SitePlot } from '../../engine/mod';
import type { Drivers } from '../../engine/atmosphere';
import type { PlanMover } from '../../engine/plan';
import { mat, fader, smoothstep, lerp } from '../../engine/kit/build';
import { R } from '../../engine/kit/rng';

export interface AircraftService {
  /** Send one now if the sky is clear enough and the previous wake has dispersed. */
  send(direction?: 1 | -1): boolean;
  readonly flying: boolean;
  readonly lingering: boolean;
}

const FLIGHT = 38, LINGER = 60, INTERVAL = [240, 420] as const;
const SAMPLES = 77, STRANDS = 2, CROSS = 5;
const SOFT_EDGE = [0, 0.6, 1, 0.6, 0] as const;
const clearSky = (d: Drivers) => d.daylight > 0.25 && d.cloud < 0.65 && d.rain < 0.1 && d.snow < 0.1 && d.fog < 0.2;

export default defineMod({
  id: 'konbini.events.aircraft',
  name: '飞机与尾云',
  layer: 'events',
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const plot = ctx.services.require<SitePlot>('world.plot').bounds;
    const root = ctx.root;
    root.userData.skyIgnore = true;
    const plane = new THREE.Group();
    plane.name = 'aircraft';
    root.add(plane);
    const white = mat('#f4f1e7', { roughness: 0.5 }), blue = mat('#436e91');
    const glass = mat('#415969', { roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), white);
    body.scale.set(0.19, 0.18, 1.7);
    plane.add(body);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), glass);
    cockpit.scale.set(0.14, 0.09, 0.25);
    cockpit.position.set(0, 0.12, 1.13);
    plane.add(cockpit);

    // Extruded silhouettes retain a little thickness when seen from the low street cameras.
    function wing(points: [number, number][], material: THREE.Material, y = 0) {
      const shape = new THREE.Shape();
      points.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.065, bevelEnabled: false }), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y;
      plane.add(mesh);
      return mesh;
    }
    wing([[-0.16, 0.5], [-1.55, -0.45], [-1.5, -0.7], [-0.18, -0.3], [0.18, -0.3], [1.5, -0.7], [1.55, -0.45], [0.16, 0.5]], white);
    wing([[-0.1, -0.92], [-0.7, -1.45], [-0.7, -1.6], [0.7, -1.6], [0.7, -1.45], [0.1, -0.92]], blue, 0.07);
    const fin = wing([[0, -1.6], [0.65, -1.45], [0.65, -1.2], [0, -0.85]], blue);
    fin.rotation.set(0, Math.PI / 2, Math.PI / 2);
    for (const x of [-0.56, 0.56]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.55, 10), white);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(x, -0.16, 0.05);
      plane.add(engine);
    }
    plane.traverse((o) => { o.userData.noSnow = true; o.userData.skyIgnore = true; });
    const fade = fader(plane, { own: true });
    fade.set(0);
    plane.visible = false;

    // Each cross-section has soft edges through vertex alpha. No textures, particles or per-flight allocation.
    const count = STRANDS * SAMPLES * CROSS;
    const positions = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const colors = new THREE.Float32BufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const indices: number[] = [];
    for (let side = 0; side < STRANDS; side++) for (let i = 0; i < SAMPLES - 1; i++) for (let j = 0; j < CROSS - 1; j++) {
      const a = (side * SAMPLES + i) * CROSS + j, b = a + CROSS;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', positions); geo.setAttribute('color', colors); geo.setIndex(indices);
    const trailMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true,
      opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    const trail = new THREE.Mesh(geo, trailMat);
    trail.name = 'contrails';
    trail.frustumCulled = false;
    trail.userData.noSnow = trail.userData.skyIgnore = true;
    trail.visible = false;
    root.add(trail);
    // Decorative sky must not intercept shop clicks or desktop click-through, including invisible wake vertices.
    root.traverse((o) => { o.raycast = () => {}; });
    // Warm throwaway clones; the live objects remain under this mod's root for failure isolation.
    ctx.fx.warm(plane.clone());
    ctx.fx.warm(trail.clone());

    const start = new THREE.Vector3(), end = new THREE.Vector3(), along = new THREE.Vector3(), across = new THREE.Vector3();
    const points = Array.from({ length: SAMPLES }, () => ({ x: 0, y: 0, z: 0, width: 0, alpha: 0 }));
    let age = FLIGHT + LINGER, next = R(...INTERVAL), active = false, presence = 0, wind = 0, heading = 0;
    const envelope = (u: number) => smoothstep(0, 0.1, u) * (1 - smoothstep(0.9, 1, u));
    const service: AircraftService = {
      get flying() { return active && age < FLIGHT; },
      get lingering() { return active; },
      send(direction = Math.random() < 0.5 ? 1 : -1) {
        if (active || !clearSky(ctx.atmosphere.drivers)) return false;
        // The route follows the site's frontage, within the existing cloud layer and desktop framing.
        const cx = (plot.x0 + plot.x1) / 2, reach = (plot.x1 - plot.x0) * 1.12;
        const z = plot.z1 + 0.5, altitude = R(17.2, 18.2);
        start.set(cx - reach * direction, altitude, z + reach * 0.22 * direction);
        end.set(cx + reach * direction, altitude, z - reach * 0.22 * direction);
        along.subVectors(end, start).normalize();
        across.set(along.z, 0, -along.x);
        heading = Math.atan2(along.x, along.z);
        plane.rotation.y = heading;
        plane.position.copy(start);
        plane.visible = true;
        fade.set(0);
        age = 0; active = true; presence = 0; wind = ctx.atmosphere.drivers.wind;
        next = R(...INTERVAL);
        return true;
      },
    };
    ctx.services.provide<AircraftService>('events.aircraft', service);

    ctx.plan.movers(function* (): Iterable<PlanMover> {
      if (!active) return;
      for (const p of points) if (p.alpha > 0.02) yield {
        kind: 'contrail', x: p.x, z: p.z, heading, len: start.distanceTo(end) / (SAMPLES - 1), width: p.width * 2,
        opacity: p.alpha * trailMat.opacity,
      };
      if (service.flying && presence > 0.02) yield { kind: 'aircraft', x: plane.position.x, z: plane.position.z,
        heading, len: 3.4, width: 3.1, opacity: presence };
    });

    ctx.onFrame((dt, _t, d) => {
      next -= dt;
      if (!active) {
        if (next <= 0) {
          if (!service.send()) next = 20;   // no backlog of flights after a storm or a night
        }
        if (!active) return;
      }
      age += dt;
      if (age >= FLIGHT + LINGER) {
        active = false; plane.visible = trail.visible = false;
        presence = 0;
        points.forEach((p) => { p.alpha = 0; });
        return;
      }
      const visibility = (1 - smoothstep(0.55, 0.9, d.cloud)) * (1 - smoothstep(0.1, 0.5, Math.max(d.rain, d.snow, d.fog)))
        * smoothstep(0.05, 0.3, d.daylight);
      const u = Math.min(1, age / FLIGHT);
      plane.position.lerpVectors(start, end, u);
      presence = envelope(u) * visibility;
      fade.set(presence);
      plane.visible = service.flying && presence > 0.01;
      trail.visible = visibility > 0.01;
      trailMat.color.copy(ctx.atmosphere.look.cloudColor);
      for (let i = 0; i < SAMPLES; i++) {
        const born = i / (SAMPLES - 1) * FLIGHT, life = age - born;
        // Unborn samples collapse to the current exhaust, so no part of the wake can lead the plane.
        const emitted = Math.min(born, age), t = emitted / FLIGHT, drift = Math.max(0, life);
        const p = points[i];
        p.x = lerp(start.x, end.x, t) - along.x * 0.5 + drift * (0.012 + wind * 0.035);
        p.y = start.y - 0.12 + drift * 0.006;
        p.z = lerp(start.z, end.z, t) - along.z * 0.5 + drift * (0.008 + wind * 0.018);
        p.width = 0.11 + drift * (0.005 + wind * 0.004);
        p.alpha = life < 0 ? 0 : envelope(t) * (1 - smoothstep(12, LINGER, life)) * visibility;
        for (let side = 0; side < STRANDS; side++) for (let j = 0; j < CROSS; j++) {
          const offset = (side === 0 ? -0.56 : 0.56) + (j / (CROSS - 1) * 2 - 1) * p.width;
          const k = (side * SAMPLES + i) * CROSS + j;
          positions.setXYZ(k, p.x + across.x * offset, p.y, p.z + across.z * offset);
          colors.setXYZW(k, 1, 1, 1, p.alpha * SOFT_EDGE[j]);
        }
      }
      positions.needsUpdate = colors.needsUpdate = true;
    });
  },
});
