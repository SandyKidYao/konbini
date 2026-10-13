// Click (without dragging) on things to get a reaction; hovering shows their name next to the cursor.
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

  private pickAt(x: number, y: number) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    // the nearest solid surface decides — you can't click a cat through a wall
    const hit = this.ray.intersectObject(this.root, true).find((h) => {
      const m = (h.object as THREE.Mesh).material as THREE.Material | undefined;
      return h.object.visible && !(m && !Array.isArray(m) && (m.transparent || m.alphaTest > 0));
    });
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.pickRoot) o = o.parent;
    const root = o?.userData.pickRoot as THREE.Object3D | undefined;
    return root ? this.items.find((c) => c.object === root) : undefined;
  }

  attach(tip: HTMLElement) {
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
        if (!last || last.buttons) { tip.classList.remove('show'); return; }
        const p = this.pickAt(last.clientX, last.clientY);
        el.style.cursor = p ? 'pointer' : '';
        tip.classList.toggle('show', !!p);
        if (p) {
          tip.textContent = p.label;
          tip.style.left = `${last.clientX}px`;
          tip.style.top = `${last.clientY}px`;
        }
      }, 90);
    });
    el.addEventListener('pointerleave', () => tip.classList.remove('show'));
  }
}
