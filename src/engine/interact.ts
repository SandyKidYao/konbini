// Click (without dragging) on things to get a reaction; hovering one turns the cursor into a pointer.
// The label is kept for whoever needs a name (no text is shown on screen).
import * as THREE from 'three';

interface Clickable { object: THREE.Object3D; onClick: () => void; label: string }

export class Interact {
  private items: Clickable[] = [];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(private camera: THREE.Camera, private dom: HTMLElement, private root: THREE.Object3D) {}

  clickable(object: THREE.Object3D, onClick: () => void, label: string) {
    this.items.push({ object, onClick, label });
    object.traverse((o) => { o.userData.pickRoot = object; });
    return () => this.remove(object);
  }
  remove(object: THREE.Object3D) {
    this.items = this.items.filter((c) => c.object !== object);
  }

  private castAt(x: number, y: number) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.intersectObject(this.root, true);
  }

  /** Is any part of the model drawn under this point? (raycasting walks hidden groups too, so check the ancestors) */
  modelAt(x: number, y: number) {
    return this.castAt(x, y).some((h) => {
      if (!(h.object as THREE.Mesh).isMesh) return false;
      for (let o: THREE.Object3D | null = h.object; o && o !== this.root; o = o.parent) if (!o.visible) return false;
      return true;
    });
  }

  private pickAt(x: number, y: number) {
    // the nearest solid surface decides — you can't click a cat through a wall
    const hit = this.castAt(x, y).find((h) => {
      const m = (h.object as THREE.Mesh).material as THREE.Material | undefined;
      return h.object.visible && !(m && !Array.isArray(m) && (m.transparent || m.alphaTest > 0));
    });
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.pickRoot) o = o.parent;
    const root = o?.userData.pickRoot as THREE.Object3D | undefined;
    return root ? this.items.find((c) => c.object === root) : undefined;
  }

  attach() {
    const el = this.dom;
    let down: { x: number; y: number } | null = null, pending = false, last: PointerEvent | null = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      this.pickAt(e.clientX, e.clientY)?.onClick();
      down = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        el.style.cursor = last && !last.buttons && this.pickAt(last.clientX, last.clientY) ? 'pointer' : '';
      }, 90);
    });
  }
}
