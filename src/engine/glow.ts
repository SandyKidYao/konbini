// Emissive materials follow an atmosphere channel: intensity = base × channel (+ a transient click boost).
import type * as THREE from 'three';
import type { Atmosphere } from './atmosphere';

export interface GlowEntry { mat: THREE.MeshStandardMaterial; channel: string; base: number; boost: number }

export class GlowRegistry {
  private entries: GlowEntry[] = [];

  add<M extends THREE.MeshStandardMaterial>(mat: M, channel: string, base = 1): M {
    const entry: GlowEntry = { mat, channel, base, boost: 0 };
    this.entries.push(entry);
    mat.userData.glow = entry;
    return mat;
  }
  /** Briefly brighten a glowing material (fades back on its own). */
  flash(mat: THREE.Material, amount = 1.6) {
    const e = mat.userData.glow as GlowEntry | undefined;
    if (e) e.boost = amount;
  }
  remove(mat: THREE.Material) {
    this.entries = this.entries.filter((e) => e.mat !== mat);
  }
  update(atm: Atmosphere, dt: number) {
    for (const e of this.entries) {
      if (e.boost > 0) e.boost = Math.max(0, e.boost - dt * 1.6);
      e.mat.emissiveIntensity = e.base * atm.channel(e.channel) + e.boost;
    }
  }
}
