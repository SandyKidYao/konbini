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
    // three-quarter view from the front right, low and on a long lens: the shop in the middle with its bays and the
    // corner, 桜荘 and the crossing behind, a strip of sea along the top
    id: 'overview', name: '全景', fit: 'dolly',
    pose: { position: [59.5, 34, 58], target: [-5.5, 0.5, -7.5], fov: 24 },
    icon: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8z"/><path d="M4 8l8 4.5L20 8M12 12.5v8"/>',
  },
  {
    // straight-on elevation across road A: the shop centred, 桜荘's roof over it, the crossing off to the right
    id: 'facade', name: '正面', fit: 'zoom',
    pose: { position: [-0.2, 4.6, 33], target: [-0.2, 2.7, -6], fov: 30 },
    icon: '<path d="M3.5 6.5h17l-1.2 3.6H4.7z"/><path d="M5 10.1V20M19 10.1V20M3 20h18"/><path d="M10 20v-5.2h4V20"/>',
  },
  {
    // high over the west corner, the block turned on the diagonal: roofs, the lane, the railway and the shore laid
    // out like a map
    id: 'bird', name: '俯瞰', fit: 'dolly',
    pose: { position: [-44.5, 62, 40], target: [-5.5, 0, -12], fov: 30 },
    icon: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M7.5 7.5 16.5 16.5M12 12 7.5 16.5"/>',
  },
  {
    // standing at the far kerb of the crossing: signals, zebra, the shop's corner with its trees and bays
    id: 'corner', name: '街角', fit: 'zoom',
    pose: { position: [27.5, 3.3, 23], target: [1, 2.1, -1.5], fov: 36 },
    icon: '<rect x="8.5" y="2.5" width="7" height="13.5" rx="2.2"/><circle cx="12" cy="6.4" r="1.1"/><circle cx="12" cy="11.7" r="1.1"/><path d="M12 16v5.5"/>',
  },
  {
    // from the park across the back lane, over the staff yard's fence: the break corner, the bench, the cat
    id: 'yard', name: '后院', fit: 'zoom',
    pose: { position: [-14.2, 5.4, -12.2], target: [-11.2, 0.8, -0.5], fov: 46 },
    icon: '<path d="M5 10 5.8 4.2l4.1 3.1h4.2l4.1-3.1L19 10"/><path d="M5 10c0 5.4 3.1 9.5 7 9.5s7-4.1 7-9.5"/><path d="M9.5 12.6v.4M14.5 12.6v.4"/>',
  },
  {
    // down road B from road A on a long lens: the level crossing, and the sea at the end of the street
    id: 'fumikiri', name: '踏切', fit: 'zoom',
    pose: { position: [16.4, 7.6, 22], target: [17.2, 0.8, -23.6], fov: 26 },
    icon: '<path d="M5.5 4.5 18.5 13M18.5 4.5 5.5 13"/><path d="M12 8.8V21M8.5 21h7"/><circle cx="8" cy="17" r="1.4"/><circle cx="16" cy="17" r="1.4"/>',
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
const MODEL = new THREE.Box3(new THREE.Vector3(-38.6, -3.6, -42.4), new THREE.Vector3(29.6, 19, 25.4));
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

/** How wide the model looks (px) from this pose in a canvas this size, at zoom 1. */
export function modelSpan(pose: CameraPose, width: number, height: number) {
  probe.fov = pose.fov ?? 30; probe.aspect = width / height; probe.near = 0.5; probe.far = 3000; probe.zoom = 1;
  probe.updateProjectionMatrix();
  probe.position.set(...pose.position);
  probe.lookAt(...pose.target);
  probe.updateMatrixWorld(true);
  let lo = Infinity, hi = -Infinity;
  for (const c of CORNERS) { const x = tmp.copy(c).project(probe).x; lo = Math.min(lo, x); hi = Math.max(hi, x); }
  return ((Math.min(1, hi) - Math.max(-1, lo)) / 2) * width;
}

/** Where a preset puts the camera in this window: as on the web, except the pet's overview, which shows it all. */
export function viewPose(v: ViewPreset, width: number, height: number, pet = false): CameraPose {
  return pet && v.id === 'overview' ? wholeOverview(v, width, height) : fitView(v, width / height);
}
