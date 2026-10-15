// Camera presets: a handful of composed views of the model, each with its own glyph in the settings tray.
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
  icon: string;
}

export const VIEWS: ViewPreset[] = [
  {
    // three-quarter view from the front right, low and on a long lens: the block runs off on a diagonal,
    // the shop's sign reads clearly between the poles
    id: 'overview', name: '全景', fit: 'dolly',
    pose: { position: [70, 26, 44], target: [2, 0.5, -5.5], fov: 22 },
    icon: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8z"/><path d="M4 8l8 4.5L20 8M12 12.5v8"/>',
  },
  {
    // straight-on elevation across road A: shop centred under the apartment block, the hedge a soft blur in front
    id: 'facade', name: '正面', fit: 'zoom',
    pose: { position: [1, 4.5, 32], target: [1, 2.4, -6], fov: 28 },
    icon: '<path d="M3.5 6.5h17l-1.2 3.6H4.7z"/><path d="M5 10.1V20M19 10.1V20M3 20h18"/><path d="M10 20v-5.2h4V20"/>',
  },
  {
    // above the west corner, the plot turned 45°: the shop's roof, front and car park laid out like a map
    id: 'bird', name: '俯瞰', fit: 'dolly',
    pose: { position: [-32, 44, 36], target: [1, 0, -6], fov: 24 },
    icon: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M7.5 7.5 16.5 16.5M12 12 7.5 16.5"/>',
  },
  {
    // standing at the far kerb of the crossing: signals, zebra, passing cars and the shop beyond
    id: 'corner', name: '街角', fit: 'zoom',
    pose: { position: [27, 4.4, 24], target: [3, 2.4, -5], fov: 36 },
    icon: '<rect x="8.5" y="2.5" width="7" height="13.5" rx="2.2"/><circle cx="12" cy="6.4" r="1.1"/><circle cx="12" cy="11.7" r="1.1"/><path d="M12 16v5.5"/>',
  },
  {
    // over the fence into the staff yard: the break corner, the vending machines, the cat asleep on the bench
    id: 'yard', name: '后院', fit: 'zoom',
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


// ---------------------------------------------------------------- the desk: the overview shows all of it

/** The pet's soft edge (style.css): its width as a share of the window's shorter side. */
export const PET_FADE = 0.09;

/** The model as the overview must show it: plinth, buildings, and the clouds that are always out. */
const MODEL = new THREE.Box3(new THREE.Vector3(-33.5, -3.6, -25.4), new THREE.Vector3(31, 19, 25.4));
const CENTRE = MODEL.getCenter(new THREE.Vector3());
const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(
  i & 1 ? MODEL.max.x : MODEL.min.x, i & 2 ? MODEL.max.y : MODEL.min.y, i & 4 ? MODEL.max.z : MODEL.min.z));
const probe = new THREE.PerspectiveCamera();
const tmp = new THREE.Vector3();

/**
 * The overview on the desk: from the same side as on the web, but stepped back until the whole model sits in the
 * window's clear middle, inside the soft edge — the pet opens on it, never on a half-faded model. Found by halving:
 * does every corner of the model project inside?
 */
function wholeOverview(v: ViewPreset, width: number, height: number): CameraPose {
  const fov = v.pose.fov ?? 30, band = Math.min(width, height) * PET_FADE * 1.15;
  const mx = 1 - (2 * band) / width, my = 1 - (2 * band) / height;
  probe.fov = fov; probe.aspect = width / height; probe.near = 0.5; probe.far = 3000;
  probe.updateProjectionMatrix();
  const dir = new THREE.Vector3(...v.pose.position).sub(new THREE.Vector3(...v.pose.target)).normalize();
  const fits = (d: number) => {
    probe.position.copy(CENTRE).addScaledVector(dir, d);
    probe.lookAt(CENTRE);
    probe.updateMatrixWorld(true);
    return CORNERS.every((c) => { const p = tmp.copy(c).project(probe); return p.z < 1 && Math.abs(p.x) <= mx && Math.abs(p.y) <= my; });
  };
  let lo = 10, hi = 2000;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  const p = CENTRE.clone().addScaledVector(dir, hi);
  return { position: [p.x, p.y, p.z], target: [CENTRE.x, CENTRE.y, CENTRE.z], fov };
}

/** Where a preset puts the camera in this window: as on the web, except the pet's overview, which shows it all. */
export function viewPose(v: ViewPreset, width: number, height: number, pet = false): CameraPose {
  return pet && v.id === 'overview' ? wholeOverview(v, width, height) : fitView(v, width / height);
}
