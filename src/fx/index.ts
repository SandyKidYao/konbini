// The rendering layer: global light, studio backdrop, reflections, rain, wet ground and the post stack.
// It reads the atmosphere every frame; content never has to touch it except through the small public API
// on the mod context (ctx.fx.wetable / addPuddle / addSheen / addPass).
import * as THREE from 'three';
import type { Stage } from '../engine/stage';
import type { Atmosphere } from '../engine/atmosphere';
import type { Surfaces, Rect } from '../engine/surfaces';
import { Post } from './post';
import { Rain } from './weather';
import { Snowfall, SnowCover } from './snow';
import { Wet } from './wet';

export class Fx {
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  readonly sun = new THREE.DirectionalLight('#ffffff', 3);
  readonly envRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  readonly post: Post;
  readonly wet: Wet;
  rain: Rain | null = null;
  snowfall: Snowfall | null = null;
  readonly snowCover: SnowCover;
  /** lights up the model during a lightning flash */
  private flashLight = new THREE.DirectionalLight('#dfe8ff', 0);
  private bolt: THREE.Line;
  private boltLife = 0;
  private cubeCam: THREE.CubeCamera;
  private backdropMat: THREE.ShaderMaterial;
  private envDirty = 40;
  private frame = 0;

  constructor(private stage: Stage, private bounds: Rect) {
    const { scene, renderer, camera } = stage;
    scene.add(this.hemi);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    Object.assign(s.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 200 });
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.03;
    scene.add(s, s.target);

    this.cubeCam = new THREE.CubeCamera(0.2, 300, this.envRT);
    this.cubeCam.position.set(2, 0.45, 4.5);
    scene.add(this.cubeCam);

    // seamless studio backdrop: wall gradient that bends into a floor colour
    this.backdropMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFloor: { value: new THREE.Color() }, uFlash: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uTop, uHorizon, uFloor; uniform float uFlash; varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 wall = mix(uHorizon, uTop, smoothstep(0.0, 0.7, h));
          vec3 col = mix(uFloor, wall, smoothstep(-0.18, 0.08, h));
          col = col * (1.0 + smoothstep(-0.05, -0.6, h) * 0.06) + vec3(0.55, 0.6, 0.75) * uFlash * smoothstep(-0.2, 0.5, h);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const backdrop = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), this.backdropMat);
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -100;
    scene.add(backdrop);

    this.post = new Post(renderer, scene, camera);
    this.snowCover = new SnowCover(renderer, bounds);
    this.flashLight.position.set(10, 60, 30);
    scene.add(this.flashLight);
    // a lightning bolt far behind the model (bloom makes it glow)
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(6, 6.5, 8), fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);
    this.wet = new Wet(scene, renderer, this.envRT.texture, bounds, () => [
      ...(this.rain ? [this.rain.lines, this.rain.splashes] : []), ...(this.snowfall ? [this.snowfall.points] : []), this.bolt,
    ]);
  }

  private skyDirty = false;
  private finalized = false;
  /** Re-bake the snow's sky map before the next frame (seasonal things came or went). */
  skyChanged() { if (this.finalized) this.skyDirty = true; }

  /** Called once every mod has registered its surfaces. */
  finalize(surfaces: Surfaces) {
    this.finalized = true;
    const pr = this.stage.renderer.getPixelRatio();
    this.rain = new Rain(this.stage.scene, surfaces, this.bounds, pr);
    this.snowfall = new Snowfall(this.stage.scene, surfaces, this.bounds, pr);
    this.snowCover.patchTree(this.stage.world);
    this.snowCover.bake(this.stage.scene, this.stage.world);
  }

  /** A jagged bolt somewhere in the distance behind the model. */
  strike(distance: number) {
    const pts: THREE.Vector3[] = [];
    let x = (Math.random() - 0.5) * 160, y = 90;
    const z = -120 - distance * 120;
    while (y > 0) {
      pts.push(new THREE.Vector3(x, y, z));
      y -= 4 + Math.random() * 7;
      x += (Math.random() - 0.5) * 12;
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.boltLife = 0.22;
  }

  /** Cube map shared by glass, car paint, mirrors and wet surfaces. */
  get envMap() { return this.envRT.texture; }

  update(atm: Atmosphere, t: number, dt = 0) {
    this.boltLife = Math.max(0, this.boltLife - dt);
    const L = atm.look, D = atm.drivers;
    this.backdropMat.uniforms.uTop.value.copy(L.bgTop);
    this.backdropMat.uniforms.uHorizon.value.copy(L.bgHorizon);
    this.backdropMat.uniforms.uFloor.value.copy(L.bgFloor);
    const fog = this.stage.fog;
    fog.color.copy(L.fog);
    fog.density = L.fogDensity;
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemi;
    this.sun.color.copy(L.sunColor);
    this.sun.intensity = L.sun;
    this.sun.position.copy(atm.sunPosition);
    this.sun.shadow.intensity = L.shadow;
    this.stage.renderer.toneMappingExposure = L.exposure;
    this.post.apply(L);
    this.rain?.update(t, D.rain, D.wind);
    this.snowfall?.update(t, D.snow, D.wind);
    this.snowCover.uniforms.uSnowCover.value = D.snowCover;
    this.wet.update(t, D.rain, D.wet * (1 - D.snowCover));
    // lightning
    this.backdropMat.uniforms.uFlash.value = D.flash;
    this.hemi.intensity += D.flash * 2.2;
    this.flashLight.intensity = D.flash * 5;
    this.bolt.visible = this.boltLife > 0 && D.flash > 0.05;
    if (atm.isAnimating) this.envDirty = Math.max(this.envDirty, 6);
  }

  private captureEnv() {
    const hidden: THREE.Object3D[] = [this.wet.group, this.wet.reflector];
    if (this.rain) hidden.push(this.rain.lines, this.rain.splashes);
    if (this.snowfall) hidden.push(this.snowfall.points);
    hidden.push(this.bolt);
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const r = this.stage.renderer;
    r.shadowMap.autoUpdate = false;
    this.cubeCam.update(r, this.stage.scene);
    r.shadowMap.autoUpdate = true;
    hidden.forEach((o, i) => (o.visible = vis[i]));
  }

  render() {
    if (this.skyDirty) { this.skyDirty = false; this.snowCover.bake(this.stage.scene, this.stage.world); }
    if (this.envDirty > 0 ? this.frame % 6 === 0 : this.frame % 45 === 0) this.captureEnv();
    if (this.envDirty > 0) this.envDirty--;
    this.post.render();
    this.frame++;
  }

  resize() {
    this.post.resize();
    this.wet.resize();
    this.rain?.setPixelRatio(this.stage.renderer.getPixelRatio());
    this.snowfall?.setPixelRatio(this.stage.renderer.getPixelRatio());
  }
}
