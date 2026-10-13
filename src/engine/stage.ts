// Renderer, scene, camera and orbit controls. Content goes under `world`; studio things (backdrop) under `scene`.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface CameraPose { position: [number, number, number]; target: [number, number, number] }
/** transparent: the canvas clears to nothing (the desktop shows through); lowPower: prefer the integrated GPU */
export interface StageOptions { transparent?: boolean; lowPower?: boolean }

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(container: HTMLElement, pose: CameraPose, opts: StageOptions = {}) {
    const r = this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: !!opts.transparent, powerPreference: opts.lowPower ? 'low-power' : 'high-performance',
    });
    if (opts.transparent) r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);

    this.scene.fog = new THREE.FogExp2('#ffffff', 0);
    this.world.name = 'world';
    this.scene.add(this.world);

    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 900);
    this.camera.position.set(...pose.position);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.target.set(...pose.target);
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.minDistance = 14;
    c.maxDistance = 150;
    c.maxPolarAngle = 1.36;
    c.autoRotateSpeed = 0.3;
    c.update();
  }

  get fog() { return this.scene.fog as THREE.FogExp2; }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
