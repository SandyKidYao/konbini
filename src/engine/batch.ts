// Static batching. The model is ~1000 separate meshes, and three.js pays per mesh — in the main view, the shadow
// map, the wet-ground reflection and the env cube alike. Once the mods are set up, meshes that share a material
// are merged into one mesh each (a few hundred draws instead of a thousand).
//
// Nothing has to be declared, so built-in and external mods work unchanged. The originals stay where they are in
// the scene graph (code holding them, raycasting) but move to a layer no camera draws. Every frame the batcher
// checks them: one that moved, hid, left the scene, or got another material or edited geometry is taken back out
// of its batch ("thawed") and drawn on its own again. A door that opens costs one rebuild of its batch, once.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Where batched originals live: still raycastable (Interact enables it), never drawn. */
export const BATCHED_LAYER = 31;

interface Batch {
  key: string;
  material: THREE.Material;
  members: Member[];
  mesh: THREE.Mesh | null;
  dirty: boolean;
}

interface Member {
  mesh: THREE.Mesh;
  batch: Batch;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  /** the geometry's buffers (index first, null if none) and their versions, to notice edits in place */
  buffers: (THREE.BufferAttribute | null)[];
  versions: number[];
  mask: number;
  live: boolean;
}

/** A node whose transform, visibility or parent would move a batched mesh: the mesh itself and its ancestors. */
interface Watch {
  o: THREE.Object3D;
  parent: THREE.Object3D | null;
  visible: boolean;
  trs: Float64Array;
  auto: boolean;
  members: Member[];
  live: boolean;
}

const NOOP_RAYCAST = () => {};
const DEFAULT_HOOK = THREE.Object3D.prototype.onBeforeRender;

function readTrs(o: THREE.Object3D, out: Float64Array) {
  const { position: p, quaternion: q, scale: s } = o;
  out[0] = p.x; out[1] = p.y; out[2] = p.z;
  out[3] = q.x; out[4] = q.y; out[5] = q.z; out[6] = q.w;
  out[7] = s.x; out[8] = s.y; out[9] = s.z;
  return out;
}
const sameTrs = (o: THREE.Object3D, t: Float64Array) => {
  const { position: p, quaternion: q, scale: s } = o;
  return p.x === t[0] && p.y === t[1] && p.z === t[2] && q.x === t[3] && q.y === t[4] && q.z === t[5] && q.w === t[6]
    && s.x === t[7] && s.y === t[8] && s.z === t[9];
};

function buffersOf(g: THREE.BufferGeometry) {
  const buffers: (THREE.BufferAttribute | null)[] = [g.index];
  for (const name in g.attributes) buffers.push(g.attributes[name] as THREE.BufferAttribute);
  return { buffers, versions: buffers.map((b) => b?.version ?? 0) };
}
/** Same buffers, unedited? (runs every frame for every batched mesh: no allocation) */
function untouched(m: Member) {
  const g = m.geometry;
  if (g.index !== m.buffers[0] || (g.index && g.index.version !== m.versions[0])) return false;
  let i = 1;
  for (const name in g.attributes) {
    const a = g.attributes[name] as THREE.BufferAttribute;
    if (a !== m.buffers[i] || a.version !== m.versions[i]) return false;
    i++;
  }
  return i === m.buffers.length;
}

/** Attributes, item sizes and array types must match for meshes to merge. null: this geometry can't batch. */
function signature(g: THREE.BufferGeometry) {
  // groups only matter with a material array (excluded): a single material draws the whole geometry
  if (!g.attributes.position || Object.keys(g.morphAttributes).length) return null;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return null;
  const parts: string[] = [g.index ? 'i' : 'n'];
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name];
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
    parts.push(`${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${(a as THREE.BufferAttribute).array.constructor.name}`);
  }
  return parts.join('|');
}

function batchable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const mat = m.material;
  if (Array.isArray(mat) || mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial) return false;   // transparent: sorted per object
  if (m.onBeforeRender !== DEFAULT_HOOK || m.customDepthMaterial || m.customDistanceMaterial) return false;
  if (m.layers.mask !== 1) return false;
  return m.matrixWorld.determinant() > 0;   // mirrored: baking would flip its faces
}

export class Batcher {
  readonly group = new THREE.Group();
  private toGroup = new THREE.Matrix4();
  private batches: Batch[] = [];
  private members: Member[] = [];
  private watches: Watch[] = [];
  private dirty = false;

  constructor() {
    this.group.name = 'batched';
    this.group.matrixAutoUpdate = false;
  }

  /** Batch every eligible, visible mesh under `roots`; `skip` leaves whole subtrees alone (things that move). */
  freeze(world: THREE.Object3D, roots: THREE.Object3D[], skip: (o: THREE.Object3D) => boolean) {
    world.updateMatrixWorld(true);
    if (!this.group.parent) world.add(this.group);
    this.group.updateMatrixWorld(true);
    this.toGroup.copy(this.group.matrixWorld).invert();
    const byKey = new Map<string, Batch>();
    const watchOf = new Map<THREE.Object3D, Watch>();
    const watch = (o: THREE.Object3D) => {
      let w = watchOf.get(o);
      if (!w) {
        w = { o, parent: o.parent, visible: o.visible, trs: readTrs(o, new Float64Array(10)), auto: o.matrixAutoUpdate, members: [], live: true };
        watchOf.set(o, w);
      }
      return w;
    };

    const visit = (o: THREE.Object3D, chain: THREE.Object3D[]) => {
      if (!o.visible || skip(o) || !o.matrixAutoUpdate) return;   // a hand-set matrix can't be watched
      if (batchable(o)) {
        const sig = signature(o.geometry);
        if (sig) {
          const mat = o.material as THREE.Material;
          const key = `${mat.id}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.frustumCulled ? 1 : 0}|${o.userData.noSnow ? 1 : 0}|${sig}`;
          let b = byKey.get(key);
          if (!b) { b = { key, material: mat, members: [], mesh: null, dirty: true }; byKey.set(key, b); }
          const m: Member = { mesh: o, batch: b, material: mat, geometry: o.geometry, ...buffersOf(o.geometry), mask: o.layers.mask, live: true };
          b.members.push(m);
          for (const n of [...chain, o]) watch(n).members.push(m);
        }
      }
      chain.push(o);
      for (const c of o.children) visit(c, chain);
      chain.pop();
    };
    for (const r of roots) visit(r, []);

    // a batch of one saves nothing
    for (const b of byKey.values()) {
      if (b.members.length < 2) { for (const m of b.members) m.live = false; continue; }
      this.batches.push(b);
      for (const m of b.members) {
        this.members.push(m);
        m.mesh.layers.set(BATCHED_LAYER);
      }
    }
    for (const w of watchOf.values()) {
      w.members = w.members.filter((m) => m.live);
      if (!w.members.length) continue;
      w.o.matrixAutoUpdate = false;   // it doesn't move (if it does, the check below notices and turns this back on)
      this.watches.push(w);
    }
    for (const b of this.batches) this.build(b);
  }

  /** How many batched meshes are being drawn, and how many originals they stand for. */
  get stats() {
    return { batches: this.batches.filter((b) => b.mesh).length, meshes: this.members.filter((m) => m.live).length };
  }

  /** Call once a frame, before the scene's matrices are updated: thaw whatever changed and rebuild its batch. */
  update() {
    for (const w of this.watches) {
      if (!w.live) continue;
      const o = w.o;
      if (o.parent === w.parent && o.visible === w.visible && sameTrs(o, w.trs)) continue;
      w.live = false;
      o.matrixAutoUpdate = w.auto;
      for (const m of w.members) this.thaw(m);
    }
    for (const m of this.members) {
      if (!m.live) continue;
      const mesh = m.mesh;
      if (mesh.material !== m.material || mesh.geometry !== m.geometry || !untouched(m)) this.thaw(m);
    }
    if (!this.dirty) return;
    this.dirty = false;
    for (const b of this.batches) if (b.dirty) this.build(b);
  }

  /** Take a mesh out of its batch for good; its batch is rebuilt without it. */
  private thaw(m: Member) {
    if (!m.live) return;
    this.restore(m);
    m.batch.dirty = true;
    this.dirty = true;
  }

  /** Draw the original again. */
  private restore(m: Member) {
    m.live = false;
    m.mesh.layers.mask = m.mask;
  }

  private build(b: Batch) {
    b.dirty = false;
    if (b.mesh) {
      b.mesh.geometry.dispose();
      this.group.remove(b.mesh);
      b.mesh = null;
    }
    const live = b.members.filter((m) => m.live);
    if (live.length < 2) { live.forEach((m) => this.restore(m)); return; }
    const mtx = new THREE.Matrix4();
    const parts = live.map((m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(mtx.multiplyMatrices(this.toGroup, m.mesh.matrixWorld));
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    if (!merged) { live.forEach((m) => this.restore(m)); return; }
    const first = live[0].mesh;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = `batch:${b.material.name || b.material.type}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.userData.noSnow = first.userData.noSnow;
    mesh.matrixAutoUpdate = false;
    mesh.raycast = NOOP_RAYCAST;   // picking hits the originals (they keep their names, parents and pick roots)
    this.group.add(mesh);
    b.mesh = mesh;
  }
}
