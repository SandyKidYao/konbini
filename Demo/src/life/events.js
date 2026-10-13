// Life around the store: a scheduler that keeps sending people into the scene, and the scripts they follow.
//   customer · tourist couple taking photos · staff break out back · staff setting out / taking in banners
//   · passers-by (some with a shiba) on both sidewalks
import * as THREE from 'three';
import { world } from '../core/stage.js';
import { onFrame } from '../core/registry.js';
import { currentMode } from '../state/modes.js';
import { openDoor } from '../world/store.js';
import { openBackDoor, staffVending, BENCH } from '../world/backyard.js';
import { flags, SLOTS } from '../world/nobori.js';
import { STORE } from '../world/layout.js';
import { sfx } from '../audio/ambience.js';
import { Figure, Dog, R, pickR } from './figure.js';
import { Actor, walk, wait, until, run, face, pose, sit, stand, leave } from './actor.js';
import {
  EDGES, lanes, between, toFront, fromFront, toDoor, fromDoor, farSidewalk, stepsFrom,
  DOOR_IN, FRONT_AISLE_Z, BACK_AISLE_Z, AISLES, REGISTER, CLERK_SPOT,
} from './routes.js';

const PI = Math.PI;
const actors = [];
const CAP = 12;
let rainy = false;
let staffBusy = false, flagsOut = false, flagDelay = 3;
let registerBusy = false;

function add(a) { actors.push(a); return a; }
function citizen(extra = {}) {
  const skirt = Math.random() < 0.3;
  const fig = new Figure({
    skirt: skirt ? pickR(['#c46b5a', '#5a6e8a', '#d9b46a', '#7d6a9a', '#3f4a5c']) : null,
    longHair: skirt || Math.random() < 0.2,
    shortSleeve: currentMode === 'day' && Math.random() < 0.5,
    ...extra,
  });
  if (rainy) fig.giveUmbrella();
  return fig;
}
const twoEdges = () => {
  const a = pickR(EDGES);
  let b = pickR(EDGES);
  while (b === a) b = pickR(EDGES);
  return [a, b];
};

// --- the clerk, always behind the register ---
const clerk = new Actor(new Figure({ kind: 'staff', longHair: true }), { x: CLERK_SPOT[0], z: CLERK_SPOT[1], heading: PI / 2, label: '店员' });
clerk.then(until(() => false));
add(clerk);

// ------------------------------------------------------------------ customer
function customer() {
  const [inE, outE] = [pickR(EDGES), pickR(EDGES)];
  const Lin = lanes(), Lout = lanes();
  const route = [...toFront(inE, 2.5, Lin), ...toDoor(Lin)];
  const a = add(new Actor(citizen(), { x: route[0][0], z: route[0][1], label: '顾客' }));
  const [ax, side] = pickR(AISLES);
  const browseZ = R(-8.6, -5.2);
  const facing = side < 0 ? -PI / 2 : pickR([PI / 2, -PI / 2]);
  a.then(stepsFrom(route));
  a.then(run(() => clerk.fig.play('bow', 1.4)));          // いらっしゃいませ
  a.then(walk([[1.3, FRONT_AISLE_Z], [ax, FRONT_AISLE_Z], [ax, browseZ]]), face(facing), pose('browse', R(2, 4)), wait(R(0.4, 1.2)));
  if (Math.random() < 0.5) a.then(walk([[ax, BACK_AISLE_Z]]), face(PI), pose('browse', R(1.5, 3)));
  a.then(
    walk([[ax, FRONT_AISLE_Z], [REGISTER[0], FRONT_AISLE_Z]]),
    until(() => !registerBusy),
    run(() => { registerBusy = true; }),
    walk([REGISTER]), face(-PI / 2),
    run(() => clerk.fig.play('bow', 1.4)),
    pose('pay', 2.4),
    run((x) => { x.fig.hold('bag'); registerBusy = false; clerk.fig.play('bow', 1.4); }),
    wait(0.4),
    walk([[REGISTER[0], FRONT_AISLE_Z], [1.0, FRONT_AISLE_Z], DOOR_IN]),
    stepsFrom([...fromDoor(Lout), ...fromFront(outE, 2.5, Lout)]),
  );
}

// ------------------------------------------------------------------ tourist couple
const flashLight = new THREE.PointLight('#ffffff', 0, 9, 2);
world.add(flashLight);
let flash = 0;
function tourists() {
  const [inE, outE] = twoEdges();
  const L = lanes(), Lout = lanes();
  const spotX = R(2.6, 3.6), standZ = 8.3;
  const shared = { ready: false, done: false, back: false };
  const route = toFront(inE, spotX, L);
  const shooter = add(new Actor(new Figure({ kind: 'tourist' }), { x: route[0][0], z: route[0][1], label: '游客' }));
  const model = add(new Actor(new Figure({ kind: 'tourist', longHair: Math.random() < 0.6 }), { x: route[0][0], z: route[0][1] + 0.6, label: '游客' }));
  model.speed = shooter.speed;

  shooter.then(
    stepsFrom(route), walk([[spotX, standZ]]), face(PI),
    run((a) => a.fig.hold('camera')),
    until(() => shared.ready),
  );
  for (let i = 0; i < 3; i++) {
    shooter.then(pose('photo', 0.9), run((a) => {
      flashLight.position.set(a.root.position.x, 1.6, a.root.position.z - 0.4);
      flash = 1; sfx.tick();
    }), wait(R(0.4, 0.8)));
  }
  shooter.then(run(() => { shared.done = true; }), until(() => shared.back), stepsFrom(fromFront(outE, spotX, Lout)));

  model.then(
    stepsFrom(route.map((p) => [p[0], p[1] + 0.5])),
    walk([[spotX + 0.4, 7.2], [spotX + 0.6, 0.75]]), face(0),
    run((a) => { a.fig.pose = 'peace'; shared.ready = true; }),
    until(() => shared.done),
    run((a) => { a.fig.pose = 'idle'; }),
    walk([[spotX + 0.4, 7.2], [spotX + 0.6, standZ + 0.4]]),
    run(() => { shared.back = true; }),
    stepsFrom(fromFront(outE, spotX + 0.6, Lout).map((p) => (p === 'X' ? p : [p[0], p[1] + 0.5]))),
  );
}

// ------------------------------------------------------------------ staff break out back
const DOOR_STEP = [STORE.x0 - 0.25, -9.6];
const YARD_PATH = [[-9.0, -9.9], [-9.0, -7.2], [-10.2, -4.5]];
function staffBreak() {
  staffBusy = true;
  openBackDoor(3);
  const a = add(new Actor(new Figure({ kind: 'staff' }), { x: DOOR_STEP[0], z: DOOR_STEP[1], heading: -PI / 2, label: '店员' }));
  if (rainy) {
    // rain: a quick drink under the door canopy
    a.then(walk([[-7.6, -9.15]]), face(-PI / 2), run((x) => x.fig.hold('can')), pose('drink', R(10, 16)), pose('stretch', 1.6));
  } else {
    const seatX = BENCH.x - 0.55;
    a.then(
      wait(0.5),
      walk([...YARD_PATH, [-12.75, -4.5]]), face(-PI / 2),
      pose('pay', 1.0),
      run(() => staffVending.userData.dispense()),
      wait(1.2),
      run((x) => x.fig.hold('can')),
      walk([[seatX, BENCH.z + 0.65]]), face(0),
      pose('stretch', 1.8),
      sit(seatX, BENCH.z, 0, BENCH.seatY),
      pose('drink', R(14, 22)),
      stand(seatX, BENCH.z + 0.65),
      walk([[-10.2, -4.5]]),
    );
  }
  a.then(
    walk(rainy ? [DOOR_STEP] : [...YARD_PATH.slice().reverse().slice(1), DOOR_STEP]),
    run((x) => { openBackDoor(2); x.fig.hold(null); }),
    wait(0.4),
    run(() => { staffBusy = false; }),
    leave(),
  );
}

// ------------------------------------------------------------------ banners out / in
const BACK_OF_STORE = [1.5, BACK_AISLE_Z];
const slotStand = (s) => [s.x, -0.6];
function banners(out) {
  staffBusy = true;
  const a = add(new Actor(new Figure({ kind: 'staff' }), { x: BACK_OF_STORE[0], z: BACK_OF_STORE[1], heading: PI, label: '店员' }));
  a.then(walk([[1.5, FRONT_AISLE_Z]]));
  SLOTS.forEach((s, i) => {
    if (out) a.then(run((x) => x.fig.hold(`flag:${i}`)));
    a.then(
      walk([DOOR_IN, [1.0, -0.7], slotStand(s)]), face([s.x, s.z]),
      pose('place', 1.3),
      run((x) => {
        flags[i].visible = out;
        x.fig.hold(out ? null : `flag:${i}`);
      }),
      wait(0.3),
      walk([[1.0, -0.7], DOOR_IN, [1.5, FRONT_AISLE_Z]]),
      run((x) => { if (!out) x.fig.hold(null); }),
      wait(out ? 1.2 : 0.6),
    );
  });
  a.then(walk([BACK_OF_STORE]), run(() => { flagsOut = out; staffBusy = false; }), leave());
}

// ------------------------------------------------------------------ passers-by (and dogs)
function passerby() {
  if (Math.random() < 0.3) {
    const route = farSidewalk(Math.random() < 0.5 ? 1 : -1);
    const a = add(new Actor(citizen(), { x: route[0][0], z: route[0][1] }));
    a.then(walk(route));
    return a;
  }
  const [e1, e2] = twoEdges();
  const route = between(e1, e2);
  const a = add(new Actor(citizen(), { x: route[0][0], z: route[0][1] }));
  a.then(stepsFrom(route));
  if (!rainy && currentMode !== 'night' && Math.random() < 0.35) walkDog(a);
  return a;
}
function walkDog(a) {
  const dog = new Dog();
  world.add(dog.root);
  const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#b5463c' }));
  leash.frustumCulled = false;
  world.add(leash);
  a.speed *= 0.9;
  const hand = new THREE.Vector3(), collar = new THREE.Vector3(), want = new THREE.Vector3();
  a.followers.push((x, dt, t) => {
    const p = x.root.position, h = x.heading;
    // the dog trots a little ahead and to the owner's left
    want.set(p.x + Math.sin(h) * 0.75 + Math.cos(h) * 0.4, p.y, p.z + Math.cos(h) * 0.75 - Math.sin(h) * 0.4);
    dog.root.position.lerp(want, Math.min(1, dt * 5));
    dog.root.rotation.y = h;
    dog.update(dt, t, x.fig.moving, x.speed, x.fig.visibleScale);
    x.fig.arms[1].hold.getWorldPosition(hand);
    dog.head.getWorldPosition(collar); collar.y -= 0.08;
    leash.geometry.setFromPoints([hand, collar]);
    leash.visible = x.fig.visibleScale > 0.5;
  });
  a.onDispose = () => { world.remove(dog.root, leash); leash.geometry.dispose(); };
}

// ------------------------------------------------------------------ scheduler
const WEIGHTS = {
  day: { customer: 1.0, passerby: 1.3, tourists: 0.45, staffBreak: 0.22 },
  overcast: { customer: 0.9, passerby: 1.0, tourists: 0.3, staffBreak: 0.22 },
  night: { customer: 0.75, passerby: 0.5, tourists: 0, staffBreak: 0.28 },
};
const EVENTS = { customer, passerby, tourists, staffBreak };
function pickEvent() {
  const w = { ...WEIGHTS[currentMode] };
  if (staffBusy) w.staffBreak = 0;
  if (rainy) w.tourists = 0;
  if (actors.filter((a) => a.root.position.z < 0.3 && a.root.position.x > STORE.x0 && a.root.position.x < STORE.x1).length > 4) w.customer = 0;
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return null;
}

let nextSpawn = 1.2, lastMode = null;
onFrame((dt, t, s) => {
  rainy = s.rain > 0.5;

  // banners follow the time of day; the first load just shows them already out
  if (lastMode === null && currentMode !== 'night') { flags.forEach((f) => (f.visible = true)); flagsOut = true; }
  if (currentMode !== lastMode) { flagDelay = 3; lastMode = currentMode; }
  flagDelay -= dt;
  if (flagDelay < 0 && !staffBusy) {
    if (currentMode !== 'night' && !flagsOut) banners(true);
    else if (currentMode === 'night' && flagsOut) banners(false);
  }

  nextSpawn -= dt;
  if (nextSpawn <= 0) {
    nextSpawn = R(2.5, 6) * (currentMode === 'night' ? 1.5 : 1);
    if (actors.length < CAP) {
      const ev = pickEvent();
      if (ev) EVENTS[ev]();
    }
  }

  // the automatic door opens for anyone near it
  for (const a of actors) {
    const p = a.root.position;
    if (a !== clerk && Math.abs(p.x - 1.0) < 1.1 && Math.abs(p.z + 2.1) < 1.3) { openDoor(); break; }
  }

  flash = Math.max(0, flash - dt * 9);
  flashLight.intensity = flash * 40;

  for (let i = actors.length - 1; i >= 0; i--) {
    actors[i].update(dt, t, s);
    if (actors[i].done) actors.splice(i, 1);
  }
});
