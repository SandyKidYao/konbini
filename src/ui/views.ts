// Camera presets: a handful of composed views of the model, each with its own glyph in the settings tray.
// On the desk (the pet) every preset shows the whole model from its own direction, never a close-up: the window
// is the model's frame, and nothing may be cut off by its edges.
import * as THREE from 'three';
import type { CameraPose } from '../engine/stage';

export interface ViewPreset {
  id: string;
  /** the glyph's name: read by screen readers, and shown when the pointer rests on it */
  name: string;
  /** composed for a 16:10 window */
  pose: CameraPose;
  /** on narrower windows: step back (dolly), or keep the spot and widen the lens (zoom — for views down among the buildings) */
  fit: 'dolly' | 'zoom';
  /** on the desk: the direction the whole model is seen from (towards the camera; it needn't be unit length) */
  pet: [number, number, number];
  icon: string;
}

export const VIEWS: ViewPreset[] = [
  {
    // three-quarter view from the front right, low and on a long lens: the block runs off on a diagonal,
    // the shop's sign reads clearly between the poles
    id: 'overview', name: '全景', fit: 'dolly', pet: [74, 51, 92],
    pose: { position: [70, 26, 44], target: [2, 0.5, -5.5], fov: 22 },
    icon: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8z"/><path d="M4 8l8 4.5L20 8M12 12.5v8"/>',
  },
  {
    // straight-on elevation across road A: shop centred under the apartment block, the hedge a soft blur in front
    id: 'facade', name: '正面', fit: 'zoom', pet: [0, 0.62, 1],
    pose: { position: [1, 4.5, 32], target: [1, 2.4, -6], fov: 28 },
    icon: '<path d="M3.5 6.5h17l-1.2 3.6H4.7z"/><path d="M5 10.1V20M19 10.1V20M3 20h18"/><path d="M10 20v-5.2h4V20"/>',
  },
  {
    // above the west corner, the plot turned 45°: the shop's roof, front and car park laid out like a map
    id: 'bird', name: '俯瞰', fit: 'dolly', pet: [-0.5, 1.5, 0.55],
    pose: { position: [-32, 44, 36], target: [1, 0, -6], fov: 24 },
    icon: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M7.5 7.5 16.5 16.5M12 12 7.5 16.5"/>',
  },
  {
    // standing at the far kerb of the crossing: signals, zebra, passing cars and the shop beyond
    id: 'corner', name: '街角', fit: 'zoom', pet: [1, 0.55, 0.45],
    pose: { position: [27, 4.4, 24], target: [3, 2.4, -5], fov: 36 },
    icon: '<rect x="8.5" y="2.5" width="7" height="13.5" rx="2.2"/><circle cx="12" cy="6.4" r="1.1"/><circle cx="12" cy="11.7" r="1.1"/><path d="M12 16v5.5"/>',
  },
  {
    // over the fence into the staff yard: the break corner, the vending machines, the cat asleep on the bench
    id: 'yard', name: '后院', fit: 'zoom', pet: [-1, 0.85, -0.35],
    pose: { position: [-13, 5, 1], target: [-9.5, 1, -14], fov: 40 },
    icon: '<path d="M5 10 5.8 4.2l4.1 3.1h4.2l4.1-3.1L19 10"/><path d="M5 10c0 5.4 3.1 9.5 7 9.5s7-4.1 7-9.5"/><path d="M9.5 12.6v.4M14.5 12.6v.4"/>',
  },
];

export const findView = (id: string | null | undefined) => VIEWS.find((v) => v.id === id);

const REF_ASPECT = 1.6;

/** The preset's pose, adapted so a narrower window still takes in about the same width of the scene. */
export function fitView(v: ViewPreset, aspect: number): CameraPose {
  const need = Math.min(2.6, Math.max(1, REF_ASPECT / aspect)) ** 0.85;
  const { position: p, target: t, fov = 30 } = v.pose;
  if (need === 1) return v.pose;
  if (v.fit === 'dolly') {
    return { target: t, fov, position: [t[0] + (p[0] - t[0]) * need, t[1] + (p[1] - t[1]) * need, t[2] + (p[2] - t[2]) * need] };
  }
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * need);
  return { position: p, target: t, fov: Math.min(75, (half * 360) / Math.PI) };
}

// ---------------------------------------------------------------- the whole model, framed (the desk)

/** Everything the model is, plinth and clouds included (on the desk the clouds stay low — see world/nature.ts). */
const MODEL = new THREE.Box3(new THREE.Vector3(-29.4, -3.6, -25.4), new THREE.Vector3(29.4, 17, 25.4));
const CENTRE = MODEL.getCenter(new THREE.Vector3());
const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(
  i & 1 ? MODEL.max.x : MODEL.min.x, i & 2 ? MODEL.max.y : MODEL.min.y, i & 4 ? MODEL.max.z : MODEL.min.z));
/** room left at the window's edges, as a share of its half-size */
const MARGIN = 0.05;
const probe = new THREE.PerspectiveCamera();
const tmp = new THREE.Vector3();

/**
 * How far back the camera must stand, looking at the model's centre from `dir`, for the whole model to fit inside
 * the window (aspect, vertical fov in degrees). Found by halving: does every corner of the model project inside?
 */
export function wholeDistance(dir: THREE.Vector3, aspect: number, fov = 30) {
  probe.fov = fov; probe.aspect = aspect; probe.near = 0.5; probe.far = 2000;
  probe.updateProjectionMatrix();
  const d = dir.clone().normalize();
  const fits = (dist: number) => {
    probe.position.copy(CENTRE).addScaledVector(d, dist);
    probe.lookAt(CENTRE);
    probe.updateMatrixWorld(true);
    return CORNERS.every((c) => {
      const p = tmp.copy(c).project(probe);
      return p.z < 1 && Math.abs(p.x) <= 1 - MARGIN && Math.abs(p.y) <= 1 - MARGIN;
    });
  };
  let lo = 10, hi = 600;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}

/** A preset on the desk: the whole model, from the preset's direction, as close as fits. */
function wholeView(p: ViewPreset, aspect: number): CameraPose {
  const dir = new THREE.Vector3(...p.pet).normalize();
  const pos = CENTRE.clone().addScaledVector(dir, wholeDistance(dir, aspect));
  return { position: [pos.x, pos.y, pos.z], target: [CENTRE.x, CENTRE.y, CENTRE.z], fov: 30 };
}
export const MODEL_CENTRE = CENTRE;

/** Where a preset puts the camera in this window. */
export function viewPose(v: ViewPreset, aspect: number, pet = false): CameraPose {
  return pet ? wholeView(v, aspect) : fitView(v, aspect);
}
