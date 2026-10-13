import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#ffffff', 0);

export const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 900);
camera.position.set(50, 33, 62);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -1.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 16;
controls.maxDistance = 150;
controls.maxPolarAngle = 1.36;
controls.autoRotateSpeed = 0.3;

// ?cam=x,y,z,tx,ty,tz opens on a specific viewpoint
{
  const q = new URLSearchParams(location.search).get('cam');
  if (q) {
    const v = q.split(',').map(Number);
    if (v.length === 6 && v.every(Number.isFinite)) { camera.position.set(v[0], v[1], v[2]); controls.target.set(v[3], v[4], v[5]); }
  }
}
controls.update();

// Cube capture of the scene — used for glass, car paint and wet-surface reflections
export const envRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
export const cubeCam = new THREE.CubeCamera(0.2, 300, envRT);
cubeCam.position.set(2, 0.45, 4.5);
scene.add(cubeCam);

// Everything that belongs to the model itself lives under `world`
export const world = new THREE.Group();
scene.add(world);
