// Signs, posters, labels and product fronts — everything with lettering on it.
import { canvasTex, FONT_JP as JP, FONT_LATIN as LATIN } from '../../engine/kit/build';
import { mulberry32, seeded } from '../../engine/kit/rng';
import { BRAND, PROD_COLORS } from './palette';

const { pick } = seeded(7151);

export function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, R: number) {
  g.save(); g.translate(x, y);
  g.fillStyle = BRAND.orange;
  g.beginPath();
  g.moveTo(0, -R); g.lineTo(R * 0.55, -R * 0.3); g.lineTo(R * 1.75, 0); g.lineTo(R * 0.55, R * 0.3);
  g.lineTo(0, R); g.lineTo(-R * 0.55, R * 0.3); g.lineTo(-R * 1.75, 0); g.lineTo(-R * 0.55, -R * 0.3);
  g.closePath(); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, 0, R * 0.5, R * 0.3, 0, 0, 7); g.fill();
  g.restore();
}

export function makeSignTex(W: number, H: number) {
  return canvasTex(W, H, (g, w, h) => {
    g.fillStyle = '#fdfdf8'; g.fillRect(0, 0, w, h);
    const bw = h * 0.16;
    [BRAND.green, BRAND.orange, BRAND.blue].forEach((c, i) => {
      g.fillStyle = c; g.fillRect(i * bw, 0, bw, h); g.fillRect(w - (i + 1) * bw, 0, bw, h);
    });
    drawLogo(g, w * 0.17, h * 0.5, h * 0.3);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = BRAND.ink;
    g.font = `600 ${h * 0.54}px ${JP}`; g.letterSpacing = `${h * 0.14}px`;
    g.fillText('ひかりマート', w * 0.54, h * 0.43);
    g.fillStyle = '#7d8e89';
    g.font = `600 ${h * 0.14}px ${LATIN}`; g.letterSpacing = `${h * 0.12}px`;
    g.fillText('HIKARI  MART', w * 0.54, h * 0.85);
  });
}
export const signTex = makeSignTex(2048, 162);
export const sideSignTex = makeSignTex(1280, 162);

export const poleSignTex = canvasTex(160, 560, (g, w, h) => {
  g.fillStyle = '#fdfdf8'; g.fillRect(0, 0, w, h);
  g.fillStyle = BRAND.green; g.fillRect(0, 0, w, 22);
  g.fillStyle = BRAND.orange; g.fillRect(0, 22, w, 12);
  g.fillStyle = BRAND.blue; g.fillRect(0, 34, w, 6);
  drawLogo(g, w / 2, 78, 22);
  g.fillStyle = BRAND.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 54px ${JP}`;
  [...'ひかりマート'].forEach((ch, i) => {
    const y = 140 + i * 62;
    if (ch === 'ー') g.fillRect(w / 2 - 4, y - 24, 8, 48);
    else g.fillText(ch, w / 2, y);
  });
  g.fillStyle = BRAND.orange; g.fillRect(0, h - 70, w, 70);
  g.fillStyle = '#fff'; g.font = `800 40px ${LATIN}`; g.fillText('24H', w / 2, h - 35);
});

export const streetSignTex = canvasTex(512, 190, (g, w, h) => {
  g.fillStyle = '#2756b0'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 74px ${JP}`; g.letterSpacing = '6px'; g.fillText('桜坂 二丁目', w / 2, 80);
  g.font = `600 30px ${LATIN}`; g.letterSpacing = '4px'; g.fillText('SAKURAZAKA 2', w / 2, 146);
});

export const stopSignTex = canvasTex(256, 224, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w / 2, h); g.closePath(); g.fill();
  g.fillStyle = '#d7383b'; g.beginPath(); g.moveTo(22, 12); g.lineTo(w - 22, 12); g.lineTo(w / 2, h - 22); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 50px ${JP}`;
  g.fillText('止まれ', w / 2, 66);
});

export const noParkTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#d7383b'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.fillStyle = '#2756b0'; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.fill();
  g.strokeStyle = '#d7383b'; g.lineWidth = 26; g.beginPath(); g.moveTo(54, 54); g.lineTo(202, 202); g.stroke();
});

export const roadTomareTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(w / 2, h / 2); g.scale(1, 2.3);
  g.font = `800 150px ${JP}`; g.fillText('止まれ', 0, 0); g.restore();
});

/** 徐行 ("go slow"), painted where a car park's driveway meets the aisle */
export const roadJokoTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(w / 2, h / 2); g.scale(1, 1.6);
  g.font = `800 120px ${JP}`; g.fillText('徐行', 0, 0); g.restore();
});

/** a car park bay number, painted at the aisle end of the bay */
export const bayNumberTex = (n: number) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 96px ${LATIN}`; g.fillText(String(n), w / 2, h / 2 + 4);
});

/** a straight arrow painted on the ground, pointing up the texture */
export const roadArrowTex = canvasTex(128, 256, (g, w) => {
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.moveTo(w / 2, 8); g.lineTo(w - 10, 96); g.lineTo(w / 2 + 18, 96); g.lineTo(w / 2 + 18, 248);
  g.lineTo(w / 2 - 18, 248); g.lineTo(w / 2 - 18, 96); g.lineTo(10, 96); g.closePath(); g.fill();
});

/** the little "P 出入口" sign beside a car park driveway */
export const parkingSignTex = canvasTex(128, 176, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2756b0'; g.fillRect(6, 6, w - 12, 112);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 92px ${LATIN}`; g.fillText('P', w / 2, 64);
  g.fillStyle = '#2756b0'; g.font = `700 30px ${JP}`; g.fillText('出入口', w / 2, 148);
});

export const coolerTex = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#2a3038'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, w, 18);
  const doors = 8, dw = w / doors;
  for (let d = 0; d < doors; d++) {
    const x0 = d * dw + 6;
    g.fillStyle = '#e3ecf4'; g.fillRect(x0, 24, dw - 12, h - 30);
    for (let r = 0; r < 4; r++) {
      const y = 30 + r * 56;
      g.fillStyle = '#a3abb4'; g.fillRect(x0, y + 50, dw - 12, 3);
      for (let x = x0 + 4; x < x0 + dw - 20; x += 13) {
        g.fillStyle = pick(PROD_COLORS); g.fillRect(x, y + 12, 10, 38);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 2, y + 16, 2, 30);
        g.fillStyle = '#ddd'; g.fillRect(x + 3, y + 6, 4, 6);
      }
    }
    g.fillStyle = '#7b828b'; g.fillRect(x0 + dw - 20, 90, 4, 70);
  }
});

export const cigTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#2f343b'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 16; c++) {
    g.fillStyle = pick(PROD_COLORS); g.fillRect(4 + c * 15.7, 4 + r * 24.5, 12, 19);
  }
});

export function posterTex(lines: [string, string], bg: string, sub: string) {
  return canvasTex(256, 340, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = bg; g.fillRect(22, 22, w - 44, 90);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 56px ${JP}`; g.fillText(lines[0], w / 2, 68);
    g.fillStyle = bg; g.font = `800 64px ${JP}`; g.fillText(lines[1], w / 2, 190);
    g.font = `600 30px ${JP}`; g.fillStyle = '#444'; g.fillText(sub, w / 2, 270);
  });
}

// `emissive` paints only the parts that glow (display window, buttons) on black.
// `hot`: the winter line-up — the lower rows switch to hot drinks with red price tags.
export function vendTex(body: string, accent: string, emissive: boolean, seed: number, hot = false) {
  return canvasTex(256, 512, (g, w, h) => {
    const r = mulberry32(seed);
    const pk = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
    g.fillStyle = emissive ? '#000' : body; g.fillRect(0, 0, w, h);
    g.fillStyle = emissive ? '#222' : hot ? '#d7383b' : accent; g.fillRect(0, 0, w, 40);
    if (!emissive) {
      g.fillStyle = '#fff'; g.font = `700 22px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(hot ? 'あったか〜い' : 'つめた〜い', w / 2, 21);
    }
    g.fillStyle = emissive ? '#9fb2c6' : '#e6eef5'; g.fillRect(14, 48, w - 28, 276);
    for (let row = 0; row < 4; row++) {
      const y = 56 + row * 67;
      for (let c = 0; c < 7; c++) {
        const x = 22 + c * 31;
        g.fillStyle = pk(PROD_COLORS); g.fillRect(x, y, 22, 44);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 3, y + 4, 4, 36);
        g.fillStyle = '#c9c9c9'; g.fillRect(x + 6, y - 4, 10, 4);
        const warm = hot && row >= 2;
        g.fillStyle = emissive ? (warm ? '#ff6a3c' : '#5c9bff') : warm ? '#e04030' : '#2b62d9';
        g.fillRect(x + 3, y + 51, 16, 7);
      }
    }
    if (!emissive) {
      g.fillStyle = '#2f333a'; g.fillRect(166, 338, 70, 86);
      g.fillStyle = '#555'; g.fillRect(176, 352, 50, 8); g.fillRect(176, 372, 50, 4);
      g.fillStyle = '#16181b'; g.fillRect(22, 444, 212, 44);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(22, 444, 212, 4);
    } else {
      g.fillStyle = '#6cf3ff'; g.fillRect(176, 390, 44, 14);
      g.fillStyle = '#ff9a3c'; g.fillRect(24, 338, 120, 10);
    }
  });
}

export function shopSignTex(text: string, bg: string, fg: string) {
  return canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 58px ${JP}`; g.letterSpacing = '8px'; g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function pedTex(color: string, walking: boolean) {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(32, 13, 6, 0, 7); g.fill();
    const L = (a: number, b: number, c: number, d: number) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); };
    if (!walking) { L(32, 22, 32, 40); L(32, 25, 23, 38); L(32, 25, 41, 38); L(32, 40, 27, 57); L(32, 40, 37, 57); }
    else { L(32, 22, 30, 40); L(31, 26, 20, 34); L(31, 26, 42, 31); L(30, 40, 19, 55); L(30, 40, 41, 54); }
  });
}

export function binTex(color: string, label: string) {
  return canvasTex(128, 200, (g, w) => {
    g.fillStyle = '#ecece7'; g.fillRect(0, 0, w, 200);
    g.fillStyle = color; g.fillRect(0, 0, w, 56);
    g.fillStyle = '#222'; g.beginPath(); g.ellipse(w / 2, 28, 30, 13, 0, 0, 7); g.fill();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 22px ${JP}`; g.fillText(label, w / 2, 96);
  });
}

// Brass name plate on the front of the walnut plinth
export const brassPlateTex = canvasTex(1024, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#e6c886'); grd.addColorStop(0.45, '#caa35b'); grd.addColorStop(1, '#a98243');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(80,58,24,0.6)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
  const engrave = (text: string, x: number, size: number, align: CanvasTextAlign) => {
    g.font = `600 ${size}px ${JP}`; g.textAlign = align; g.textBaseline = 'middle'; g.letterSpacing = '6px';
    g.fillStyle = 'rgba(255,240,200,0.55)'; g.fillText(text, x + 1.5, h / 2 + 2);
    g.fillStyle = '#4e3a1c'; g.fillText(text, x, h / 2);
  };
  engrave('ひかりマート 桜坂二丁目店', 48, 46, 'left');
  engrave('1 : 150', w - 48, 40, 'right');
});

export function canLabelTex(color: string) {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0, 26, 64, 10);
  });
}
