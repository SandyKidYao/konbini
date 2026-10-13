// Wet ground: one planar reflection shared by the puddles (sharp, with rain ripples)
// and a faint streaky sheen over every outdoor surface.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { scene, renderer } from '../core/stage.js';
import { rand } from '../core/rng.js';
import { floorAt, SIDEWALKS } from '../world/layout.js';
import { rain, splashes } from './weather.js';

export const reflSize = () => [Math.round(innerWidth * renderer.getPixelRatio() * 0.5), Math.round(innerHeight * renderer.getPixelRatio() * 0.5)];

export const reflector = new Reflector(new THREE.PlaneGeometry(56, 48), { textureWidth: reflSize()[0], textureHeight: reflSize()[1], clipBias: 0.003, multisample: 0 });
reflector.rotation.x = -Math.PI / 2;
reflector.position.y = 0.09;
reflector.material.colorWrite = false;   // it only drives the render-to-texture; puddles do the drawing
reflector.material.depthWrite = false;
reflector.renderOrder = -10;
scene.add(reflector);
reflector.updateMatrixWorld();
const reflInv = reflector.matrixWorld.clone().invert();

export const wetFX = new THREE.Group();
scene.add(wetFX);
{
  // keep the wet layer and the rain out of their own reflection
  const orig = reflector.onBeforeRender;
  reflector.onBeforeRender = function (...args) {
    const v = [wetFX.visible, rain.visible, splashes.visible];
    wetFX.visible = rain.visible = splashes.visible = false;
    orig.apply(this, args);
    [wetFX.visible, rain.visible, splashes.visible] = v;
  };
}

export const wetUniforms = { uTime: { value: 0 }, uRain: { value: 0 } };
function reflectMat(puddle) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: puddle ? THREE.NormalBlending : THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    defines: puddle ? { PUDDLE: 1 } : {},
    uniforms: {
      ...wetUniforms,
      tRefl: { value: reflector.getRenderTarget().texture },
      textureMatrix: { value: reflector.material.uniforms.textureMatrix.value },
      uReflInv: { value: reflInv },
      uStrength: { value: 0 },
      uTint: { value: new THREE.Color(puddle ? '#c6cfdb' : '#d8dee8') },
      uRing: { value: new THREE.Color('#e2eaf7') },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix, uReflInv;
      varying vec4 vUv; varying vec2 vW; varying float vEdge;
      #ifdef PUDDLE
      attribute float aEdge;
      #endif
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xz;
        #ifdef PUDDLE
        vEdge = aEdge;
        #else
        vEdge = 0.0;
        #endif
        vUv = textureMatrix * uReflInv * w;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tRefl; uniform float uTime, uRain, uStrength; uniform vec3 uTint, uRing;
      varying vec4 vUv; varying vec2 vW; varying float vEdge;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float layer(vec2 uv, float t) {
        vec2 id = floor(uv); float acc = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = id + vec2(float(i), float(j));
          float h = h21(c);
          vec2 ctr = c + 0.2 + 0.6 * vec2(h21(c + 3.7), h21(c + 9.1));
          float ph = fract(t * 0.9 + h);
          float d = length(uv - ctr);
          acc += smoothstep(0.035 + ph * 0.02, 0.0, abs(d - ph * 0.75)) * (1.0 - ph) * (1.0 - ph);
        }
        return acc;
      }
      void main() {
        vec2 uv = vW * 1.7;
        float rip = layer(uv, uTime) + 0.8 * layer(uv * 1.43 + 5.1, uTime * 1.17 + 0.5);
        rip = clamp(rip, 0.0, 1.0) * uRain;
        vec4 p = vUv;
        #ifdef PUDDLE
          p.xy += vec2(rip * 0.01, rip * 0.006) * p.w;
          vec3 refl = texture2DProj(tRefl, p).rgb;
          float a = uStrength * smoothstep(1.0, 0.7, vEdge);
          gl_FragColor = vec4(refl * uTint * 1.15 + uRing * rip * 0.16, a * 0.82);
        #else
          vec3 refl = vec3(0.0); float tw = 0.0;
          for (int k = -4; k <= 4; k++) {
            float wk = 1.0 - abs(float(k)) / 5.0;
            vec4 q = p; q.y += float(k) * 0.014 * p.w; q.x += float(k) * 0.002 * p.w;
            refl += texture2DProj(tRefl, q).rgb * wk; tw += wk;
          }
          refl /= tw;
          gl_FragColor = vec4((refl * uTint + uRing * rip * 0.05) * uStrength, 1.0);
        #endif
      }`,
  });
}
export const puddleMat = reflectMat(true);
export const sheenMat = reflectMat(false);

function puddle(x, z, r, sx = 1, sz = 1) {
  const N = 44, pos = [0, 0, 0], edge = [0], idx = [];
  const p1 = rand() * 6, p2 = rand() * 6, p3 = rand() * 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = r * (1 + 0.22 * Math.sin(3 * a + p1) + 0.12 * Math.sin(5 * a + p2) + 0.06 * Math.sin(9 * a + p3));
    pos.push(Math.cos(a) * k * sx, 0, Math.sin(a) * k * sz);
    edge.push(1);
    idx.push(0, 1 + i, 1 + ((i + 1) % N));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, puddleMat);
  m.position.set(x, floorAt(x, z) + 0.016, z);
  wetFX.add(m);
}
[
  [-3.4, 1.0, 1.0, 1.5, 0.6], [3.4, 5.6, 1.4, 1.2, 1], [5.6, 1.6, 0.8, 1.3, 0.8], [-5.6, 6.0, 0.8],
  [-9, 12.2, 1.6, 1.8, 0.8], [3.8, 15.0, 1.2, 1.6, 0.7], [-20, 14.6, 1.3, 1.6, 0.7], [17.2, 14.0, 1.8, 1.2, 1.1],
  [18.6, -6.0, 1.2, 0.8, 1.5], [16.0, -16, 1.0, 0.8, 1.4], [-20.5, 8.8, 0.6, 1.6, 0.6], [24.5, 13.2, 1.1, 1.4, 0.8],
  [10.0, 6.4, 0.7], [-1.0, 12.0, 0.9, 1.6, 0.6], [12.8, 0.5, 0.5, 0.6, 1.2], [-13.5, 15.5, 1.0, 1.4, 0.6],
].forEach((a) => puddle(...a));

function sheen(x0, x1, z0, z1, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), sheenMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  wetFX.add(m);
}
sheen(-28, 28, -24, 24, 0.006);
sheen(-7.2, 11.5, 0.25, 7.5, 0.106);
sheen(-28, 11.5, -24, 7.5, 0.086);
sheen(23, 28, -24, 7.5, 0.086);
for (const [x0, x1, z0, z1] of SIDEWALKS) sheen(x0, x1, z0, z1, 0.156);
