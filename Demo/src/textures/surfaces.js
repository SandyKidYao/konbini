// Painted surface textures. Kept low in contrast: a model's surfaces are matte paint, not photo scans.
import * as THREE from 'three';
import { canvasTex } from '../core/helpers.js';
import { rand, rr, pick } from '../core/rng.js';

export const asphaltTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#6f7176'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(52,54,60,${0.04 + rand() * 0.05})`;
    g.beginPath(); g.ellipse(rand() * w, rand() * h, 40 + rand() * 90, 25 + rand() * 60, rand() * 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 6000; i++) {
    const v = (92 + rand() * 60) | 0, s = rand() * 1.8 + 0.6;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.28)`;
    g.fillRect(rand() * w, rand() * h, s, s);
  }
  g.strokeStyle = 'rgba(45,45,50,0.25)'; g.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    let x = rand() * w, y = rand() * h; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += rr(-16, 16); y += rr(-16, 16); g.lineTo(x, y); }
    g.stroke();
  }
}, true);

export const tileTex = canvasTex(256, 256, (g, w, h) => {
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (203 + rand() * 12) | 0;
    g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
    g.fillRect(i * s, j * s, s, s);
  }
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(110,100,90,${rand() * 0.16})`; g.fillRect(rand() * w, rand() * h, 1.5, 1.5); }
  g.strokeStyle = 'rgba(140,128,115,0.7)'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
}, true);

export const concreteTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#bebab2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { const v = (150 + rand() * 60) | 0; g.fillStyle = `rgba(${v},${v},${v - 4},0.28)`; g.fillRect(rand() * w, rand() * h, 1.6, 1.6); }
  g.strokeStyle = 'rgba(110,108,104,0.45)'; g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
}, true);

export const floorTex = canvasTex(256, 256, (g, w, h) => {
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (234 + rand() * 10) | 0; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = 'rgba(170,170,165,0.8)'; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
}, true);

export const blockTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#a19d95'; g.fillRect(0, 0, w, h);
  const bw = 128, bh = 64;
  for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
    const v = (184 + rand() * 14) | 0;
    g.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
    g.fillRect(c * bw + (r % 2) * 64 + 3, r * bh + 3, bw - 6, bh - 6);
  }
}, true);

export const storeWallTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(160,160,155,0.4)'; g.fillRect(0, 0, 3, h); g.fillRect(128, 0, 3, h);
}, true);

export const sidingTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(70,80,75,0.22)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, y + 3, w, 2); }
}, true);

export const aptTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const s = 32;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const v = (236 + rand() * 14) | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 6})`; g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
  }
}, true);

export const shutterTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b3b6bb'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { g.fillStyle = '#8e9197'; g.fillRect(0, y, w, 3); g.fillStyle = '#cdd0d4'; g.fillRect(0, y + 4, w, 3); }
}, true);

export const hedgeTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6f9564'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = pick(['#5f8757', '#7fa66f', '#8bb179', '#68905d', '#94b884']);
    g.beginPath(); g.arc(rand() * w, rand() * h, rr(2, 6), 0, 7); g.fill();
  }
}, true);

export const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#8eaa78'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = pick(['#829f6d', '#9bb685', '#87a472', '#a6bf8f']); g.fillRect(rand() * w, rand() * h, 1.5, 4); }
}, true);

export const poleStripeTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#f2c94c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b2b2b';
  for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 64, h); g.lineTo(i * 32 + 64, h); g.fill(); }
}, true);

export const fanTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#e4e4de'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a4d52'; g.beginPath(); g.arc(78, 64, 46, 0, 7); g.fill();
  g.strokeStyle = '#a6aab0'; g.lineWidth = 2;
  for (let r = 10; r < 46; r += 7) { g.beginPath(); g.arc(78, 64, r, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(32, 64); g.lineTo(124, 64); g.moveTo(78, 18); g.lineTo(78, 110); g.stroke();
  g.fillStyle = '#c4c5bf'; g.fillRect(8, 20, 14, 90);
});

// Cross-section of the cut ground: asphalt cap, base course gravel, then soil with pebbles
export const strataTex = canvasTex(1024, 256, (g, w, h) => {
  const wave = (y0, amp, f, ph) => (x) => y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 1.3) * amp * 0.4;
  const b1 = wave(h * 0.12, 2, 0.02, 0), b2 = wave(h * 0.3, 5, 0.012, 1.7), b3 = wave(h * 0.58, 7, 0.008, 4.1);
  const band = (top, bottom, fill) => {
    g.beginPath(); g.moveTo(0, top(0));
    for (let x = 0; x <= w; x += 8) g.lineTo(x, top(x));
    for (let x = w; x >= 0; x -= 8) g.lineTo(x, bottom(x));
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  band(() => 0, b1, '#5d6066');
  band(b1, b2, '#a6a39b');
  band(b2, b3, '#a3876a');
  const soil = g.createLinearGradient(0, h * 0.5, 0, h);
  soil.addColorStop(0, '#8a6a4f'); soil.addColorStop(1, '#6d5240');
  band(b3, () => h, soil);
  for (let i = 0; i < 900; i++) {
    const x = rand() * w, y = rr(b1(x) + 2, b2(x) - 2);
    g.fillStyle = pick(['#8c8a83', '#c3c0b8', '#7b7a74']); g.beginPath(); g.arc(x, y, rr(1, 2.6), 0, 7); g.fill();
  }
  for (let i = 0; i < 160; i++) {
    const x = rand() * w, y = rr(b2(x) + 8, h - 6);
    g.fillStyle = pick(['#c2ad92', '#9b8b7a', '#d6c6ad']); g.beginPath(); g.ellipse(x, y, rr(2, 6), rr(1.5, 4), rand() * 3, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(70,50,35,0.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = rand() * w, y = b3(x) + 4; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rr(-10, 10); y += rr(4, 12); g.lineTo(x, y); }
    g.stroke();
  }
});
strataTex.wrapS = THREE.RepeatWrapping;

export const walnutTex = canvasTex(1024, 256, (g, w, h) => {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#7a543b'); base.addColorStop(1, '#5e3f2c');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y0 = rand() * h, amp = rr(2, 9), f = rr(0.003, 0.012), ph = rand() * 6;
    g.strokeStyle = `rgba(${pick(['40,24,14', '120,84,58', '58,36,22'])},${rr(0.12, 0.35)})`;
    g.lineWidth = rr(0.6, 2.4);
    g.beginPath();
    for (let x = 0; x <= w; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
  }
}, true);

// Soft dark blob that grounds the plinth on the studio floor
export const contactShadowTex = canvasTex(256, 256, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(0,0,0,0.6)'); r.addColorStop(0.55, 'rgba(0,0,0,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});

export const winWarmTex = canvasTex(128, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#fff0cc'); grd.addColorStop(1, '#ffb866');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(190,105,50,0.55)'; g.fillRect(0, 0, 34, h); g.fillRect(w - 28, 0, 28, h);
  g.strokeStyle = 'rgba(120,60,25,0.45)'; g.lineWidth = 2;
  for (const x of [8, 18, 27, w - 20, w - 10]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.fillStyle = 'rgba(90,60,40,0.3)'; g.fillRect(52, 70, 30, 40);
  g.fillStyle = '#3a3a3a'; g.fillRect(w / 2 - 2, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
});

export const winCoolTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#dbe8ff'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,140,170,0.45)';
  for (let y = 0; y < h; y += 9) g.fillRect(0, y, w, 3);
  g.fillStyle = '#3a3a3a'; g.fillRect(w / 2 - 2, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
});
