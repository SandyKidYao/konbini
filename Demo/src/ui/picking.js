// Click (without dragging) on the cat, the store or a vending machine to get a small reaction.
// Hovering a clickable thing shows its name next to the cursor.
import * as THREE from 'three';
import { camera, renderer, world } from '../core/stage.js';
import { pickables } from '../core/registry.js';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickAt(x, y) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // nearest visible surface decides — no clicking a cat through a wall
  const hit = ray.intersectObject(world, true).find((h) => h.object.visible && !h.object.material?.transparent && !h.object.material?.alphaTest);
  const root = hit?.object.userData.pickRoot;
  return root ? pickables.find((p) => p.object === root) : null;
}

export function initPicking() {
  const el = renderer.domElement;
  const tip = document.getElementById('tip');
  let down = null, pending = false, lastMove = null;

  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const p = pickAt(e.clientX, e.clientY);
    if (p) p.onClick();
    down = null;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    lastMove = e;
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (e.buttons) { tip.classList.remove('show'); return; }
      const p = pickAt(lastMove.clientX, lastMove.clientY);
      el.style.cursor = p ? 'pointer' : '';
      tip.classList.toggle('show', !!p);
      if (p) {
        tip.textContent = p.label;
        tip.style.left = `${lastMove.clientX}px`;
        tip.style.top = `${lastMove.clientY}px`;
      }
    }, 90);
  });
  el.addEventListener('pointerleave', () => tip.classList.remove('show'));
}
