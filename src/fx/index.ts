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
import { skipUnlitLights } from './lights';

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
  private backdrop: THREE.Mesh;
  private envDirty = 40;
  private envFace = 0;
  private warming: THREE.Object3D[] = [];
  private warmed: THREE.Object3D[] = [];
  private warmTarget: THREE.WebGLRenderTarget | null = null;
  private frame = 0;

  /**
   * Draw the sky (the studio backdrop and the distant lightning) on a transparent window too. Without it only the model
   * is on screen, over whatever is behind the window; the desktop pet lets its owner choose.
   */
  sky: boolean;

  /** transparent: the canvas has nothing behind it (desktop pet); the sky starts hidden there */
  constructor(private stage: Stage, private bounds: Rect, private transparent = false) {
    this.sky = !transparent;
    const { scene, renderer, camera } = stage;
    skipUnlitLights();
    scene.add(this.hemi);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    Object.assign(s.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 200 });
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.03;
    scene.add(s, s.target);

    // the shadow map and the world matrices are updated once per frame (see render), not again by every extra
    // render of the scene (reflections, the env cube) — each of those would redraw ~1000 shadow casters
    renderer.shadowMap.autoUpdate = false;
    scene.matrixWorldAutoUpdate = false;

    this.cubeCam = new THREE.CubeCamera(0.2, 300, this.envRT);
    this.cubeCam.position.set(2, 0.45, 4.5);
    this.cubeCam.coordinateSystem = renderer.coordinateSystem;
    this.cubeCam.updateCoordinateSystem();
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
    const backdrop = this.backdrop = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), this.backdropMat);
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -100;
    backdrop.visible = this.sky;   // captured into the reflections either way, so glass and paint keep their sky
    scene.add(backdrop);

    this.post = new Post(renderer, scene, camera, transparent);
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
    this.stage.scene.updateMatrixWorld();
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

  /** Compile an object's shaders ahead of its first appearance (see FxApi.warm). Done at the next frame. */
  warm(object: THREE.Object3D) {
    this.warming.push(object);
  }

  /**
   * Draw the waiting objects once, with the whole scene (a shader depends on the lights it is drawn with), into a
   * tiny target nobody sees, shadow map included. They are kept afterwards: a shader is freed with its last user.
   */
  private warmUp() {
    const { scene, camera, controls, renderer: r } = this.stage;
    const group = new THREE.Group();
    group.position.copy(controls.target);
    for (const o of this.warming.splice(0)) {
      o.traverse((c) => { c.visible = true; c.frustumCulled = false; });   // lamps that only light up at night too
      group.add(o);
    }
    scene.add(group);
    group.updateMatrixWorld(true);
    this.warmTarget ??= new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
    const prev = r.getRenderTarget();
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.warmTarget);
    r.render(scene, camera);
    r.setRenderTarget(prev);
    scene.remove(group);
    this.warmed.push(group);
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
    // the desk's camera stands back to take in the whole model, and with nothing behind it fog fades the model into a
    // flat blob: thin it as if seen from closer up, so only the far side goes misty (with the pet's sky drawn too)
    if (this.transparent) fog.density *= Math.min(1, 45 / this.stage.camera.position.distanceTo(this.stage.controls.target));
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
    this.bolt.visible = this.sky && this.boltLife > 0 && D.flash > 0.05;
    this.backdrop.visible = this.sky;
    if (atm.isAnimating) this.envDirty = Math.max(this.envDirty, 6);
  }

  /**
   * Re-render some faces of the env cube. One face a frame spreads the cost out — all six at once is six full
   * scene renders in one frame, a visible hitch. The blurred copy materials read is rebuilt after the last face.
   */
  private captureEnv(faces = 1) {
    const hidden: THREE.Object3D[] = [this.wet.group, this.wet.reflector];
    if (this.rain) hidden.push(this.rain.lines, this.rain.splashes);
    if (this.snowfall) hidden.push(this.snowfall.points);
    hidden.push(this.bolt);
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    this.backdrop.visible = true;
    const r = this.stage.renderer, prev = r.getRenderTarget();
    for (let i = 0; i < faces; i++) {
      const face = this.envFace;
      this.envFace = (face + 1) % 6;
      r.setRenderTarget(this.envRT, face);
      r.render(this.stage.scene, this.cubeCam.children[face] as THREE.Camera);
      if (face === 5) this.envRT.texture.needsPMREMUpdate = true;
    }
    r.setRenderTarget(prev);
    hidden.forEach((o, i) => (o.visible = vis[i]));
    this.backdrop.visible = this.sky;
  }

  render() {
    // world matrices once per frame — otherwise every render of the scene (reflection, env cube, the frame) redoes them
    this.stage.scene.updateMatrixWorld();
    if (this.skyDirty) { this.skyDirty = false; this.snowCover.bake(this.stage.scene, this.stage.world); }
    // the whole cube up front (the first frame shows reflections), then a face a frame while the light changes,
    // and otherwise one every 12 frames (the whole cube in about a second) — a face is a full scene render
    if (this.frame === 0) this.captureEnv(6);
    else if (this.envDirty > 0 || this.frame % 12 === 0) this.captureEnv();
    if (this.envDirty > 0) this.envDirty--;
    if (this.warming.length) this.warmUp();
    this.stage.renderer.shadowMap.needsUpdate = true;
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
