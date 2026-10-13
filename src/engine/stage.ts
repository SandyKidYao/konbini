// Renderer, scene, camera and orbit controls. Content goes under `world`; studio things (backdrop) under `scene`.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** fov: vertical field of view in degrees (default 30) */
export interface CameraPose { position: [number, number, number]; target: [number, number, number]; fov?: number }
/** transparent: the canvas clears to nothing (the desktop shows through); lowPower: prefer the integrated GPU */
export interface StageOptions { transparent?: boolean; lowPower?: boolean }

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private flight: Flight | null = null;

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

    this.camera = new THREE.PerspectiveCamera(pose.fov ?? 30, innerWidth / innerHeight, 0.5, 900);
    this.camera.position.set(...pose.position);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.target.set(...pose.target);
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.minDistance = 10;
    c.maxDistance = 190;
    c.maxPolarAngle = 1.52;   // down to eye level in front of the shop (the facade view), never under the street
    c.autoRotateSpeed = 0.3;
    c.update();
    c.addEventListener('start', () => { this.flight = null; });   // grabbing the model ends a flight
  }

  /** Is the camera on its way to a pose? */
  get flying() { return !!this.flight; }

  /**
   * Glide to a pose: the target slides, the camera swings around it (shortest way, rising a little on long
   * swings so it clears the buildings) and the lens zooms. seconds 0: jump.
   */
  flyTo(pose: CameraPose, seconds = 1.8) {
    const fromOff = this.camera.position.clone().sub(this.controls.target);
    const toTarget = new THREE.Vector3(...pose.target);
    const toOff = new THREE.Vector3(...pose.position).sub(toTarget);
    const a = new THREE.Spherical().setFromVector3(fromOff), b = new THREE.Spherical().setFromVector3(toOff);
    let dTheta = b.theta - a.theta;
    dTheta -= Math.round(dTheta / (Math.PI * 2)) * Math.PI * 2;
    const swing = Math.hypot(dTheta, b.phi - a.phi);
    const f: Flight = {
      t: 0, seconds: Math.max(seconds, 1e-6),
      fromTarget: this.controls.target.clone(), toTarget,
      from: a, dTheta, to: b,
      lift: Math.min(0.32, swing * 0.22),
      fromFov: this.camera.fov, toFov: pose.fov ?? 30,
    };
    this.flight = f;
    if (seconds <= 0) this.step(1);
  }

  /** Advance a flight (if any) and the orbit controls. */
  update(dt: number) {
    if (this.flight) this.step(dt / this.flight.seconds);
    this.controls.update(dt);
  }

  private step(dt: number) {
    const f = this.flight!;
    f.t = Math.min(1, f.t + dt);
    const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;   // ease in-out
    const s = new THREE.Spherical(
      f.from.radius * (f.to.radius / f.from.radius) ** k,
      THREE.MathUtils.lerp(f.from.phi, f.to.phi, k) - Math.sin(Math.PI * k) * f.lift,
      f.from.theta + f.dTheta * k,
    );
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    this.camera.position.setFromSpherical(s).add(this.controls.target);
    this.camera.fov = THREE.MathUtils.lerp(f.fromFov, f.toFov, k);
    this.camera.updateProjectionMatrix();
    if (f.t >= 1) this.flight = null;
  }

  get fog() { return this.scene.fog as THREE.FogExp2; }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}

interface Flight {
  t: number; seconds: number;
  fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
  from: THREE.Spherical; to: THREE.Spherical; dTheta: number; lift: number;
  fromFov: number; toFov: number;
}
